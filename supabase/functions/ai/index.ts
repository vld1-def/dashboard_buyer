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
// Стеля відповіді. 10 варіантів × ~250 токенів + розмітка JSON.
const MAX_TOKENS = 3000;

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

/* ── САМ ЗАПИТ ДО МОДЕЛІ ── */
async function callModel(key: string, model: string, system: string, user: string):
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
    throw new Error(res.status === 401 ? 'the ANTHROPIC_API_KEY is not accepted: ' + msg
                  : res.status === 429 ? 'rate limit or no credit on the Anthropic account: ' + msg
                  : msg);
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
async function callXai(key: string, model: string, system: string, user: string):
    Promise<{ text: string; inTok: number; outTok: number }> {
  const res = await fetch(XAI_API, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
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
  'You write short ad copy for mobile app and PWA campaigns.',
  'You are given real examples written by this team. Match their tone, length,',
  'punctuation habits and language exactly — the new lines must look like the same',
  'person wrote them, not like a polished brochure.',
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
  '"group":"<column or null>","metric":{"op":"sum|count|avg|min|max|per","col":"<column>","num":"<column>","den":"<column>"},',
  '"sort":"desc|asc","limit":<1..50>,"say":"<one short sentence in Ukrainian: what you understood>"}',
  'Rules: use ONLY column names given for the chosen set, spelled exactly as given.',
  'metric.col is for sum/avg/min/max; metric.num and metric.den are for "per" (a ratio',
  'like cost per action = sum(num)/sum(den)); count needs neither.',
  'For "best/cheapest CPA" use op "per" with num=spend and den=the conversion column, sort "asc".',
  'For "most/biggest" sort "desc". If the question names a value to exclude, use op "ne" or "not_contains".',
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
      ? 'Examples from our bank' + (geo ? ' (geo ' + geo + ')' : '') + ':'
      : 'We have no examples saved yet, so write in a plain, direct style.',
    ...ex.map((e, i) => (i + 1) + '. ' + (e.title ? '[' + e.title + '] ' : '') + e.text),
    '',
    'Write ' + n + ' NEW variants.',
    cat ? 'Slot: ' + cat + '.' : '',
    lang ? 'Language: ' + lang + ' (same as the examples).' : 'Keep the language of the examples.',
    hint ? 'What to aim for: ' + hint : '',
    'Keep each variant about as long as the examples. No numbering in the text itself.'
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
    got = action === 'plan'
      ? await ask(key, model, PLAN_SYSTEM, buildPlanUser(body))
      : await ask(key, model, SYSTEM, buildUser(body));
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
