/* ═══════════ AI В ДАШБОРДІ ═══════════

   ЧОМУ ЦЕ ФУНКЦІЯ, А НЕ КОД У СТОРІНЦІ. Ключ Anthropic не можна
   покласти в дашборд: сторінку читає будь-хто, хто її відкрив, і ключ
   із неї витягується першим же поглядом у вкладку Network. Тому модель
   кличе сервер, а браузер — сервер.

   ХТО МОЖЕ. Лише залогінений: токен людини перевіряється до будь-якої
   роботи. Спільного секрету тут немає зовсім і не буде — розкладу ця
   функція не потрібна, а дія, яку не просила людина, не має сенсу:
   генерація без того, хто її прочитає, це просто витрата.

   ЩО ВОНА НЕ РОБИТЬ. Нічого не зберігає, крім лічильника. Згенеровані
   тексти не йдуть у базу: їх показують як кандидатів, і в банк
   потрапляє тільько те, що людина вибрала руками. Текст, який поїде в
   кабінет, мусить пройти через людину — модель помиляється мовчки.

   МЕЖІ, І ВСІ ТРИ ПРО ГРОШІ:
     • ліміт викликів на людину за день (AI_DAY_LIMIT, типово 100);
     • стеля max_tokens на відповідь;
     • стеля на розмір прикладів у запиті (EX_MAX, EX_LEN).
   Модель коштує копійки — саме тому легко не помітити цикл, який
   кличе її тисячу разів. Межа тут не економія, а запобіжник.

   ДВІ МОДЕЛІ, ДВІ РОЛІ. Тексти пише Grok (x.ai), таблиці й питання
   по CRM розбирає Claude. Поділ не з технічних причин: моделі
   по-різному ставляться до рекламного копірайтингу, і та, що
   відмовляється від половини брифів, не годиться для текстів, тоді як
   для плану запиту до таблиці вона саме те, що треба — там важить
   точність, а не згідливість. Провайдер — єдина різниця між двома
   шляхами: ліміт, лічильник, розбір відповіді й межі спільні.

   Розгортання:
     supabase secrets set XAI_API_KEY=xai-...          # тексти
     supabase secrets set ANTHROPIC_API_KEY=sk-ant-... # таблиці, CRM
     supabase functions deploy ai
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const API = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
/* x.ai говорить у форматі OpenAI — інший шлях, інша форма відповіді,
   решта та сама. Ключ беруть на console.x.ai. */
const XAI_API = 'https://api.x.ai/v1/chat/completions';

/* Найлегша модель Claude. Вона ж і найдешевша, а задача тут проста:
   написати ще кілька текстів у тому ж тоні, що вже є. Міняється
   секретом AI_MODEL — без правки коду. */
const MODEL_DEF = 'claude-haiku-5-5';
const XAI_MODEL_DEF = 'grok-4.7';
const DAY_LIMIT_DEF = 100;

/* ЦІНИ ТУТ — ТІЛЬКИ ТИПОВІ, і міняти їх можна секретом, не кодом:
   прайси обох провайдерів живуть своїм життям, а число в відповіді
   («цей виклик коштував стільько») мусить лишатись правдою. Долари за
   мільйон токенів: вхід / вихід. Перевіряти — docs.anthropic.com/
   pricing і docs.x.ai/developers/pricing. */
const PRICE = {
  claude: { in: 0.10, out: 0.50 },
  xai:    { in: 2.00, out: 6.00 }
};
const priceOf = (engine: string) => {
  const d = PRICE[engine as keyof typeof PRICE] || PRICE.claude;
  const n = (v: string | undefined, def: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : def;
  };
  return engine === 'xai'
    ? { in: n(Deno.env.get('XAI_PRICE_IN'), d.in), out: n(Deno.env.get('XAI_PRICE_OUT'), d.out) }
    : { in: n(Deno.env.get('AI_PRICE_IN'), d.in), out: n(Deno.env.get('AI_PRICE_OUT'), d.out) };
};
const costOf = (engine: string, inTok: number, outTok: number) => {
  const pr = priceOf(engine);
  return +((inTok * pr.in + outTok * pr.out) / 1e6).toFixed(5);
};

// Скільки прикладів беремо в запит і скільки лишаємо від кожного.
// Більше прикладів майже не додає схожості, зате додає токенів.
const EX_MAX = 12;
const EX_LEN = 600;
// Скільки варіантів можна попросити за раз.
const N_MIN = 1, N_MAX = 10;
// Стеля відповіді. 10 варіантів × ~250 токенів + розмітка JSON, і запас
// на довші варіанти: обрізана на півслові відповідь не розбирається
// взагалі, тобто виклик оплачений, а варіантів нема.
const MAX_TOKENS = 4000;

/* ТЕМПЕРАТУРА РІЗНА ДЛЯ РІЗНИХ ЗАДАЧ, і це не дрібниця.
   Тексти: висока — рекламний рядок, який «правильний», нікого не
   зупиняє, а п'ять обережних варіантів це один варіант.
   План запиту до таблиці: нуль — там потрібна точність, і вигадана
   назва стовпця це просто помилка.

   ⚠️ ДІЄ ЛИШЕ НА x.ai. Нові моделі Anthropic поле temperature не
   приймають узагалі (див. callModel), тож для планів це число —
   намір, а не налаштування. Прибирати його звідси не варто: тексти
   можуть їхати і через Claude, і через x.ai, а сигнатура виклику
   спільна. */
const TEMP_TEXT = 1;
const TEMP_PLAN = 0;

type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

async function whoAmI(base: string, anon: string, auth: string): Promise<string> {
  const res = await fetch(base + '/auth/v1/user', { headers: { apikey: anon, Authorization: auth } });
  if (!res.ok) return '';
  const u = await res.json().catch(() => ({}));
  return String(u?.id || '');
}

const today = () => new Date().toISOString().slice(0, 10);

/* Скільки людина вже витратила СЬОГОДНІ. Читаємо ключем сервісної
   ролі: рядок належить їй, але писати в нього з браузера не можна —
   інакше лічильник не лічильник. */
async function usedToday(base: string, hdr: Json, me: string, action: string): Promise<number> {
  try {
    const res = await fetch(base + '/rest/v1/ai_usage?select=calls'
      + '&created_by=eq.' + encodeURIComponent(me)
      + '&day=eq.' + today() + '&action=eq.' + encodeURIComponent(action), { headers: hdr });
    if (!res.ok) return 0;
    const rows = await res.json().catch(() => []);
    return Number((rows[0] || {}).calls) || 0;
  } catch (_e) {
    /* Таблиці ще немає (AI.sql не виконаний) — працюємо без лічильника,
       але не замість нього: про це сказано у відповіді. */
    return 0;
  }
}

async function addUsage(base: string, hdr: Json, me: string, action: string,
                        inTok: number, outTok: number): Promise<string> {
  /* on_conflict + merge-duplicates — щоб два одночасні виклики не
     створили два рядки на той самий день. Інкремент робимо читанням і
     записом: окремої RPC заради одного числа не заводимо, а розбіжність
     на один виклик при точному збігу в часі лічильнику не шкодить. */
  try {
    const was = await usedToday(base, hdr, me, action);
    const res = await fetch(base + '/rest/v1/ai_usage?on_conflict=created_by,day,action', {
      method: 'POST',
      headers: { ...hdr, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ created_by: me, day: today(), action,
                             calls: was + 1, in_tok: inTok, out_tok: outTok,
                             updated_at: new Date().toISOString() })
    });
    if (!res.ok) return await res.text().catch(() => 'HTTP ' + res.status);
    return '';
  } catch (e) { return (e as Error).message; }
}

/* ── САМ ЗАПИТ ДО МОДЕЛІ ──

   ТЕМПЕРАТУРУ СЮДИ НЕ ШЛЕМО, і це не недогляд. На нових моделях
   Anthropic поле temperature більше не приймається: запит падає з
   «`temperature` is deprecated for this model», тобто не відповідає
   взагалі. Саме це й зловили питання по таблицях — вони ходять до
   Claude.

   Параметр лишився там, де він працює: x.ai (формат OpenAI). Тут
   temp приймаємо, щоб виклик був однаковий з обох боків, і свідомо
   ігноруємо — мовчазна різниця в сигнатурі коштувала б дорожче за
   цей коментар. */
async function callModel(key: string, model: string, system: string, user: string,
                         _temp: number):
    Promise<{ text: string; inTok: number; outTok: number }> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': API_VERSION,
               'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(j?.error?.message || 'HTTP ' + res.status);
    /* Найчастіші дві причини називаємо прямо: інакше «400» відправляє
       шукати ваду в запиті, тоді як справа в ключі або в балансі. */
    /* Відмову через застаріле поле називаємо прямо: інакше «400» з
       чужої англійської відправляє шукати ваду в питанні, тоді як
       справа в тому, що функцію давно не оновлювали. */
    const stale = /deprecated for this model/i.test(msg)
      ? ' — це стара версія функції ai: розгорни її наново '
        + '(supabase functions deploy ai)'
      : '';
    throw new Error(res.status === 401 ? 'the ANTHROPIC_API_KEY is not accepted: ' + msg
                  : res.status === 429 ? 'rate limit or no credit on the Anthropic account: ' + msg
                  : msg + stale);
  }
  const text = (Array.isArray(j.content) ? j.content : [])
    .filter((b: Json) => b && b.type === 'text').map((b: Json) => String(b.text || '')).join('\n');
  return { text, inTok: Number(j?.usage?.input_tokens) || 0,
           outTok: Number(j?.usage?.output_tokens) || 0 };
}

/* ── ТЕ САМЕ, АЛЕ ДО x.ai ──
   Формат OpenAI: system і user — два повідомлення, текст лежить у
   choices[0].message.content, токени звуться prompt_/completion_.
   Відмову моделі видно не в коді помилки, а в самому тексті — тому
   тут її не вгадуємо, а віддаємо як є: сказане моделею краще
   показати людині, ніж підмінити своїм «не вийшло». */
async function callXai(key: string, model: string, system: string, user: string,
                       temp: number):
    Promise<{ text: string; inTok: number; outTok: number }> {
  const res = await fetch(XAI_API, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: temp,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(j?.error?.message || j?.error || 'HTTP ' + res.status);
    throw new Error(res.status === 401 || res.status === 403
      ? 'the XAI_API_KEY is not accepted: ' + msg
      : res.status === 404
        ? 'x.ai does not know the model "' + model + '": ' + msg
          + '. Pick one from docs.x.ai and set it with the XAI_MODEL secret.'
      : res.status === 429 ? 'rate limit or no credit on the x.ai account: ' + msg
      : msg);
  }
  const text = String(j?.choices?.[0]?.message?.content || '');
  return { text, inTok: Number(j?.usage?.prompt_tokens) || 0,
           outTok: Number(j?.usage?.completion_tokens) || 0 };
}

/* ── РОЗБІР ВІДПОВІДІ ──

   Просимо JSON, але не вірим, що він прийде: модель може додати рядок
   до або після. Тому беремо перший об'єкт у відповіді, а якщо його
   немає — розбираємо як текст, поділений порожніми рядками. Порожній
   екран замість варіантів через зайву кому — найдурніша з можливих
   поломок. */
function parseItems(raw: string): { title: string; text: string; ua?: string }[] {
  const out: { title: string; text: string; ua?: string }[] = [];
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const j = JSON.parse(raw.slice(a, b + 1));
      (Array.isArray(j.items) ? j.items : []).forEach((it: Json) => {
        const text = String(it?.text || '').trim();
        if (text) out.push({ title: String(it?.title || '').trim(), text,
                             ua: String(it?.ua || '').trim() });
      });
    } catch (_e) { /* далі спробуємо як текст */ }
  }
  if (out.length) return out;
  raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
    .forEach(s => out.push({ title: '', text: s.replace(/^[-*\d.)\s]+/, '').trim() }));
  return out;
}

const SYSTEM = [
  'You write short ad copy for mobile app and PWA campaigns. You are good at this:',
  'write copy that makes someone stop and tap, not copy that fills a slot.',
  /* МЕНШЕ МУШТРИ. Тут стояло «match their tone, length, punctuation habits and
     language EXACTLY» — і виходили перетасовані зразки: ті самі звороти,
     той самий початок, п'ять варіантів, між якими немає різниці. Голос
     команди копіювати треба, речення — ні. */
  'The examples show the team VOICE: how direct they are, how long the lines run, how they',
  'punctuate, how much they promise. Take the voice. Do not take their sentences: a variant',
  'that reshuffles an example is a wasted variant.',
  'Make the variants genuinely different FROM EACH OTHER — different hook, different angle,',
  'different first words. If one leans on a question, let the next lean on a number, an',
  'imperative, a curiosity gap, a local detail. Five near-identical lines are one line.',
  /* МОВА — НЕ ЗІ ЗРАЗКІВ. Тут було «Language: X (same as the examples)» —
     тобто моделі прямо казали, що зразки вже тією мовою, хоч у банку
     вони бувають будь-якою. На суперечності вона слухалась зразків, і
     текст виходив мовою гео замість замовленої. */
  'When the brief names a language, that language wins over everything else, including the',
  'language of the examples: they may be in another language entirely. Geo is a market, not',
  'a language.',
  /* ФАКТИ ДАЄ БРИФ. Доти тут стояла заборона на будь-які числа й
     бонуси — і вона з'їдала саме те, по що приходять: акцію, призи,
     умови. Модель відмовлялась писати про розіграш, який у клієнта
     справді є, і виходило «згенерувало щось своє». Межа мусить бути
     не між «з числами» і «без», а між ТИМ, ЩО СКАЗАЛИ, і тим, що
     модель додала від себе. */
  'Facts come from the brief: the offer, the promo, the prize, the bonus and every number',
  'the brief states are yours to use, word for word. What the brief does not state, do not',
  'add — an invented payout is the one thing nobody can stand behind afterwards.',
  'Write the copy itself. If part of the brief is something you will not write, still return',
  'the variants for the rest, and put the reason in the "ua" field of a variant.',
  'Length: in the ballpark of the examples, but exact length is not the point — one variant',
  'may be three words if three words hit harder.',
  /* Підпис українською — не переклад, а зміст у кількох словах. Тексти
     бувають будь-якою мовою гео, і читати десять варіантів чужою
     мовою, щоб зрозуміти, чим вони різняться, — та сама робота, якої
     ми тут позбуваємось. */
  'For every variant also add "ua": four to eight words in Ukrainian saying what the',
  'copy is about and what makes it different from the others. It is a gist, not a translation.',
  'Answer with JSON only: {"items":[{"title":"short label","text":"the copy","ua":"про що це"}]}'
].join(' ');

/* ═══════════ ПИТАННЯ ПРО ТАБЛИЦЮ → ПЛАН ═══════════

   ГОЛОВНЕ ПРАВИЛО: модель НЕ рахує. Вона перекладає питання на план —
   що відфільтрувати, що згрупувати, що порахувати, — а числа складає
   дашборд із тих рядків, що в нього вже є.

   Чому саме так, а не «спитай у моделі й покажи відповідь»: модель,
   яка називає суму, називає ПРАВДОПОДІБНУ суму. Перевірити її можна
   лише порахувавши самому — тобто зробивши те, заради чого питали.
   План натомість видно очима: «сума Spend, де Status ≠ Decline» або
   сходиться з питанням, або ні.

   ЩО МОДЕЛЬ БАЧИТЬ: питання, назви стовпців і їхній вид (число, текст,
   дата). ЗНАЧЕННЯ НЕ БАЧИТЬ — ні рядка з файлу, ні з бази. У
   вивантаженнях із партнерки їдуть sub-id, а часом і дані людей, і
   віддавати їх заради підрахунку суми — непропорційна ціна. */
const PLAN_SYSTEM = [
  'You translate a question about a table into a JSON query plan. You never compute',
  'anything yourself and never state numbers: the application computes from its own rows.',
  'Answer with JSON only, no prose:',
  '{"set":"<set id>","where":[{"col":"<column>","op":"eq|ne|contains|not_contains|gt|ge|lt|le|empty|not_empty","val":"<value>"}],',
  '"group":"<column or null>","group2":"<second column or null>",',
  '"metric":{"op":"sum|count|avg|min|max|per","col":"<column>","num":"<column>","den":"<column>"},',
  '"metrics":[<up to 6 more metrics in the same shape, shown next to the first;',
  'each one may carry its own "where":[…] that applies to that metric only>],',
  '"having":{"col":"<column>","op":"ge|gt|le|lt","val":<number>},',
  '"sort":"desc|asc","limit":<1..50>,"say":"<one short sentence in Ukrainian: what you understood>"}',
  'Rules: use ONLY column names given for the chosen set, spelled exactly as given.',
  'metric.col is for sum/avg/min/max; metric.num and metric.den are for "per" (a ratio',
  'like cost per action = sum(num)/sum(den)); count needs neither.',
  'For "best/cheapest CPA" use op "per" with num=spend and den=the conversion column, sort "asc".',
  'For "most/biggest" sort "desc". If the question names a value to exclude, use op "ne" or "not_contains".',
  /* ДНІ. Питання майже завжди про період — «за тиждень», «учора»,
     «цього місяця». Модель не знає сьогоднішньої дати, поки ми її не
     скажемо, тож вона їде в запиті; а межі періоду — це звичайні
     ge/le по денному стовпцю, нової операції не треба. */
  'Columns marked (date) hold an ISO day, YYYY-MM-DD. Today\'s date is given below. Turn any',
  'period in the question into a range on that column: "last 7 days" is ge <today minus 6 days>,',
  '"yesterday" is both ge and le on that day, "this month" is ge <first day of this month>.',
  'Never invent a column named "last week" — the period is always a filter on the date column.',
  /* КРЕАТИВИ. Питання про них ставлять щодня, і майже завжди це
     «згрупуй по креативу й відсортуй». Назвати це прямо дешевше, ніж
     щоразу сподіватись, що модель вгадає, що саме вважати
     «результатом». */
  'Questions about creatives ("креативи", "крео") mean: group by the creative column and rank it.',
  '"Best results" with a spend column means cost per conversion — op "per", num=spend,',
  'den=the conversion column (deposits first, then registrations, then installs), sort "asc".',
  'Without a spend column, rank by the conversion column itself with sum and sort "desc".',
  'Keep limit at 10 unless the question asks for more: a top is a top.',
  /* ОДИН ПОКАЗНИК БУВ ЗАМАЛОЮ МОВОЮ. «Яке крео найкраще — розпиши
     його дані» модель розуміла правильно (так і писала в say), але
     плану не було чим це сказати: там було місце рівно на одну
     цифру, і виходила таблиця топ-10 замість картки одного. */
  'metric is what you RANK by. Put everything else the answer should show in metrics:',
  'when the question asks to describe an item ("розпиши дані", "деталі", "покажи його цифри"),',
  'fill metrics with the sums that matter — spend, each conversion column, and the cost per',
  'conversion — so the answer is a full picture and not a single number.',
  'When the question is about ONE item ("яке найкраще", "який креатив", "найдорожче гео"),',
  'set limit 1: a top-10 is not an answer to "which one".',
  /* ПОРІГ НА ГРУПУ. Без нього «найдешевший депозит» завжди вигравало
     те, де даних майже немає — вісім рядків і один депозит. */
  'having applies to the GROUP total, not to single rows: use it for "at least N deposits".',
  /* ДВА ПІДСУМКИ З ОДНОГО НАБОРУ. Загальний where ріже рядки ОДИН
     раз, тому «скільки з деклайном і скільки без» ним не сказати —
     модель сама писала, що «формат дозволяє один фільтр». Тепер
     умова є в кожного показника окремо. */
  'The top-level where filters the rows once, for everything. When the question asks for two',
  'different cuts side by side ("with X and without X", "by Oleh and by everyone else",',
  '"declined and approved separately"), do NOT give up: put the condition inside each metric',
  'as its own "where". Two metrics, two conditions, one answer — that is what it is for.',
  'When ranking by a cost-per-conversion and the question does not give a minimum, still add',
  'a modest having on the conversion column (for example ge 5): a group with one conversion',
  'always wins such a ranking and tells nobody anything.',
  /* ДВА РОЗРІЗИ ОДНОЧАСНО. «Яка воронка найкраще працювала по днях на
     такому-то лендінгу» — це фільтр по лендінгу й пара день × воронка.
     Одним рівнем це не передати, і модель, яка має лише один, почне
     вигадувати: то склеїть два стовпці в один, то загубить питання. */
  'Use group2 for a second breakdown when the question asks for a pair, for example',
  '"by day, which funnel" is group=<day column>, group2=<funnel column>. Keep group2 null',
  'when one breakdown answers the question. A value named in the question (a landing, an',
  'offer, a country) is a FILTER in where, not a group.',
  'If the question cannot be answered from these columns, return',
  '{"error":"<one short sentence in Ukrainian saying what is missing>"}'
].join(' ');

function buildPlanUser(body: Json): string {
  const sets = Array.isArray(body?.sets) ? body.sets : [];
  const lines: string[] = [];
  sets.slice(0, 6).forEach((st: Json) => {
    const cols = (Array.isArray(st?.cols) ? st.cols : []).slice(0, 80)
      .map((c: Json) => String(c?.name || '') + ' (' + String(c?.kind || 'text') + ')')
      .filter((x: string) => x.trim());
    lines.push('Set "' + String(st?.id || '') + '"'
      + (st?.title ? ' — ' + String(st.title) : '')
      + (st?.rows != null ? ', ' + Number(st.rows) + ' rows' : '')
      + ': ' + cols.join(', '));
  });
  return [
    lines.length ? lines.join('\n') : 'No data sets are open.',
    '',
    /* Сьогоднішній день беремо З БРАУЗЕРА, а не з серверного годинника:
       функція живе в UTC, а питають із Києва, і о другій ночі «вчора»
       розійшлось би на добу. Немає — ставимо своє, але це запасний
       шлях. */
    'Today is ' + (/^\d{4}-\d{2}-\d{2}$/.test(String(body?.today || ''))
      ? String(body.today) : today()) + '.',
    '',
    'Question: ' + String(body?.q || '').slice(0, 500)
  ].join('\n');
}

function buildUser(body: Json): string {
  const ex: { title: string; text: string }[] = (Array.isArray(body?.examples) ? body.examples : [])
    .slice(0, EX_MAX)
    .map((e: Json) => ({ title: String(e?.title || '').slice(0, 120),
                         text: String(e?.text || '').slice(0, EX_LEN) }))
    .filter((e: { text: string }) => e.text.trim());

  const n = Math.min(N_MAX, Math.max(N_MIN, Number(body?.n) || 5));
  const geo = String(body?.geo || '').slice(0, 40);
  const cat = String(body?.cat || '').slice(0, 60);
  const lang = String(body?.lang || '').slice(0, 40);
  const hint = String(body?.hint || '').slice(0, 500);

  const lines = [
    ex.length
      /* «geo KG» без пояснення читалось як «пиши киргизькою». Гео — це
         ринок, і сказати це треба словами, бо мова приходить окремо. */
      ? 'Examples of our own copy' + (geo ? ' (market ' + geo + ')' : '')
        + ' — for VOICE only, not for language and not for wording:'
      : 'We have no examples saved yet, so write in a plain, direct voice.',
    ...ex.map((e, i) => (i + 1) + '. ' + (e.title ? '[' + e.title + '] ' : '') + e.text),
    '',
    'Write ' + n + ' NEW variants, each different from the others.',
    cat ? 'Slot: ' + cat + '.' : '',
    /* МОВА ОКРЕМИМ НАКАЗОМ, і сказано, що зразки можуть бути іншою:
       без цього модель вирішувала суперечність на користь зразків. */
    lang
      ? 'LANGUAGE: ' + lang + '. Write every variant in ' + lang + ' and nothing else. '
        + 'The examples above may be in a different language — that does not matter.'
      : 'Language: the one the examples are written in.',
    hint ? 'Brief: ' + hint : '',
    'No numbering inside the copy itself.'
  ];
  return lines.filter(Boolean).join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });
  try {
    return await handle(req);
  } catch (e) {
    return reply({ error: 'unhandled: ' + (e as Error).message }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  const base = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const svc = Deno.env.get('SERVICE_ROLE_KEY')
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const hdr: Json = { apikey: svc, Authorization: 'Bearer ' + svc,
                      'content-type': 'application/json' };

  // Тільки людина, і тільки своя. Спільного секрету тут немає.
  const auth = req.headers.get('Authorization') || '';
  if (!auth) return reply({ error: 'no authorization header' }, 401);
  const me = await whoAmI(base, anon, auth);
  if (!me) return reply({ error: 'could not verify who is calling' }, 401);

  let body: Json = {};
  try { body = await req.json(); } catch (_e) { /* тіла може не бути */ }
  const action = String(body?.action || 'text');
  if (action !== 'text' && action !== 'plan')
    return reply({ error: 'unknown action: ' + action }, 400);

  /* ХТО ЩО РОБИТЬ. Тексти — x.ai, плани по таблицях — Claude. Вибір
     не з браузера: інакше той самий дашборд міг би попросити дорожчу
     модель, і ліміт у доларах перестав би щось означати. Міняється
     секретом AI_TEXT_ENGINE ('xai' | 'claude'), а коли ключа x.ai
     немає — тексти самі лишаються на Claude, бо вікно текстів без
     моделі краще за вікно текстів із помилкою. */
  const xaiKey = Deno.env.get('XAI_API_KEY') || '';
  const want = String(Deno.env.get('AI_TEXT_ENGINE') || '').trim().toLowerCase();
  const engine = action === 'plan' ? 'claude'
               : want === 'claude' ? 'claude'
               : (want === 'xai' || xaiKey) ? 'xai' : 'claude';

  const key = engine === 'xai' ? xaiKey : (Deno.env.get('ANTHROPIC_API_KEY') || '');
  if (!key) return reply({ error: engine === 'xai'
    ? 'the texts run on x.ai, but there is no XAI_API_KEY in the function secrets. '
      + 'Take a key at console.x.ai and run: supabase secrets set XAI_API_KEY=xai-...'
    : 'the AI is not set up yet: no ANTHROPIC_API_KEY in the function secrets. '
      + 'Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...' }, 400);

  const model = engine === 'xai'
    ? (Deno.env.get('XAI_MODEL') || XAI_MODEL_DEF)
    : (Deno.env.get('AI_MODEL') || MODEL_DEF);
  const limit = Number(Deno.env.get('AI_DAY_LIMIT')) || DAY_LIMIT_DEF;

  /* Межу перевіряємо ДО звернення до моделі: дізнатись про ліміт після
     того, як за запит уже заплатили, — те саме, що не мати межі. */
  const used = svc ? await usedToday(base, hdr, me, action) : 0;
  if (svc && used >= limit) return reply({
    error: 'daily limit reached: ' + used + ' of ' + limit + ' generations today. '
         + 'It resets at UTC midnight; raise it with the AI_DAY_LIMIT secret.' }, 429);

  let got: { text: string; inTok: number; outTok: number };
  try {
    const ask = engine === 'xai' ? callXai : callModel;
    /* Температуру можна перебити секретом AI_TEMP_TEXT — якщо тексти
       почнуть заносити, це єдине, що треба підкрутити, без деплою
       нового коду. */
    const envTemp = Number(Deno.env.get('AI_TEMP_TEXT'));
    const tText = Number.isFinite(envTemp) && envTemp >= 0 && envTemp <= 2 ? envTemp : TEMP_TEXT;
    got = action === 'plan'
      ? await ask(key, model, PLAN_SYSTEM, buildPlanUser(body), TEMP_PLAN)
      : await ask(key, model, SYSTEM, buildUser(body), tText);
  } catch (e) {
    return reply({ error: (e as Error).message }, 502);
  }

  /* ПЛАН ВІДДАЄМО ЯК Є — розбирає й ПЕРЕВІРЯЄ його дашборд. Межа
     мусить стояти там, де дані: саме він знає, які стовпці справді
     існують, і саме він рахує. Перевірка тут була б другою копією тієї
     самої перевірки — і першою, яка колись від неї відстане. */
  if (action === 'plan') {
    const noteU = svc ? await addUsage(base, hdr, me, action, got.inTok, got.outTok)
                      : 'SERVICE_ROLE_KEY is not set, so nothing is counted';
    return reply({ plan_raw: got.text, model, engine,
      usage: { in: got.inTok, out: got.outTok },
      cost_usd: costOf(engine, got.inTok, got.outTok),
      left_today: svc ? Math.max(0, limit - used - 1) : null,
      problems: [noteU].filter(Boolean) });
  }

  const items = parseItems(got.text);
  const noteUsage = svc ? await addUsage(base, hdr, me, action, got.inTok, got.outTok)
                        : 'SERVICE_ROLE_KEY is not set, so nothing is counted';

  return reply({
    items,
    model,
    /* Яка саме модель писала — у відповіді, а не в здогадці по назві:
       вікно текстів показує це рядком, і коли тексти раптом поїхали на
       Claude (немає ключа x.ai), це мусить бути видно одразу. */
    engine,
    usage: { in: got.inTok, out: got.outTok },
    /* Ціна одного виклику — в самій відповіді. Інакше «скільки це
       коштує» лишається питанням до прайса, а не до дашборда. */
    cost_usd: costOf(engine, got.inTok, got.outTok),
    left_today: svc ? Math.max(0, limit - used - 1) : null,
    /* Не змогли записати лічильник — кажемо вголос. Мовчки незаписана
       витрата означає, що межа існує лише на папері. */
    problems: [noteUsage,
      items.length ? '' : 'the model answered, but nothing could be parsed out of it'
    ].filter(Boolean),
    /* Сире сказане моделею — щоб відмову чи зауваження було ВИДНО, а
       не підмінено нашим «нічого не вийшло». Тримаємо коротко: це
       підпис під екраном, а не ще один варіант тексту. */
    said: items.length ? '' : got.text.slice(0, 600)
  });
}
