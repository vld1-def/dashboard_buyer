/* ═══════════ СТЕЛЯ ВИТРАТ КАБІНЕТА — ПРОБА ═══════════

   В ЯКИХ ОДИНИЦЯХ Facebook приймає spend_cap на ЗАПИС — ми не знаємо
   напевно. І, що важливіше, людині за полем «стеля» це знати не
   треба. Тому функція не вгадує, а ПЕРЕВІРЯЄ СЕБЕ: пише, читає назад
   і, якщо вийшло не те, виправляє другим записом.

   На ЧИТАННІ він віддає мінорні одиниці (центи) — fb-sync так і
   складає, через cents(). На запис джерела розходяться: одні кажуть
   мінорні, інші — цілу валюту. Різниця у 100 разів, і обидва боки
   помилки дорогі: стеля $10 000 замість $100 — це дозвіл витратити
   те, чого ніхто не дозволяв; стеля $1 замість $100 — це кабінет,
   який стає посеред дня.

   ВІДПОВІДЬ ВІДОМА З ЖИВОГО КАБІНЕТА: на ЗАПИС Facebook бере
   spend_cap у ЦІЛІЙ ВАЛЮТІ, а на читанні віддає мінорні одиниці.
   Перевірено так: у поле вписали 15, функція послала 1500 (як центи),
   і стеля стала 1500 доларів.

   Тому пишемо одразу цілу валюту. Це не просто правильніше — це
   прибирає сам проміжок, у якому стеля стояла завищеною в сто разів:
   перший же запит ставить рівно те, що просили.

   Звірка лишається, бо припущення, яке ніхто не перевіряє, одного дня
   стає неправдою мовчки. Якщо назад прийшло вчетверо не те — функція
   виправляє другим записом і каже про це у відповіді.

   ЦІНА САМОПЕРЕВІРКИ — ЩЕ ОДНА ЗМІНА З ДЕСЯТИ ДОБОВИХ, і то лише
   тоді, коли одиниці не ті. Проміжок, у який стеля стоїть завищеною,
   — секунда між двома запитами; за секунду Facebook стільки не
   витратить, а помилитись у сто разів назавжди — витратить.

   ЗАПАМʼЯТОВУВАТИ ВІДПОВІДЬ НЕМАЄ ДЕ, і це свідомо: окрема табличка
   під одне значення коштувала б більше, ніж зайвий запит раз на
   кілька змін. Звірка йде щоразу — вона ж і ловить той день, коли
   Facebook поміняє поведінку.

   ЧОМУ ЦЕ НЕ «ЩЕ ОДНЕ ПОЛЕ». Напрямок ризику тут інший, ніж у
   всього, що функції проєкту робили досі. fb-pause лише ЗУПИНЯЄ —
   помилка там коштує недолитого трафіку. Стеля працює в обидва боки:
   підняти її означає дозволити витрачати більше. Тому:
     • треба ads_management — читальний токен стелю не змінить;
     • системний юзер має бути АДМІНОМ кабінета, не advertiser;
     • один виклик — один кабінет, списку немає і не буде.

   РОЛЬ ТУТ НЕ ПИТАЄТЬСЯ. Гейт по my_role() тут стояв і прибраний:
   my_role() віддає 'buyer' усім, у кого немає рядка у team_members,
   тобто першим він відмовляв власнику кабінетів. Запобіжник, який
   закривається саме перед тим, хто цим і користується, нічого не
   береже. Межі ставлять ті, хто справді їх знає: RLS — чужий кабінет
   сюди не прийде зовсім, і сам Facebook — без ads_management і без
   прав адміна кабінета запис не пройде.

   ДЕСЯТЬ ЗМІН НА ДОБУ НА КАБІНЕТ. Більше — і Graph віддає error 17
   (subcode 1885172), а разом із лімітом ламається й доставка. Саме
   через це тут немає ні слайдера, ні автопідняття: кожна зміна —
   окремий усвідомлений виклик.

   КАБІНЕТ БЕЗ СТЕЛІ НЕ ЧІПАЄМО. Якщо spend_cap = 0 («ліміту немає»),
   проба відмовляється: поставити стелю ми вміємо, а чи зможемо
   ПРИБРАТИ її назад тим самим шляхом — не перевірено. Залишити
   кабінет із лімітом, якого в нього не було, через нашу пробу —
   найгірший можливий результат. Треба все одно — allow_new_cap: true,
   і тоді відповідальність у того, хто це передав.

   НИЖЧЕ ВЖЕ ВИТРАЧЕНОГО — ВІДМОВА. Стеля на рівні amount_spent
   зупиняє кабінет негайно; Facebook таке або відкидає, або виконує —
   і друге гірше. Це та сама дія, що fb-pause, тільки без слова
   «pause» у назві, тож і робити її треба там, де воно написане.

   ЯК КЛИКАТИ:
     {"account_id":"act_123"}                  — лише прочитати, без запису
     {"account_id":"act_123","set_major":7}    — поставити 7 у валюті кабінета
     {"account_id":"act_123","set_major":7,"allow_new_cap":true}

   Відповідь на записі каже прямо: що ми надіслали, що Facebook віддав
   назад, який із двох варіантів одиниць це означає, і яким викликом
   повернути як було.

   ЧОМУ ТОКЕН ЧИТАЄТЬСЯ СЕРВІСНИМ КЛЮЧЕМ. FB_TOKENS.sql забирає
   select на таблиці цілком і повертає його поіменно — без token і
   без proxy. Це зроблено навмисно: зі сторінки власний токен прочитати
   не можна, а отже й з чужої відкритої вкладки. Тому запит токена
   заголовками того, хто покликав, завжди дає 42501 «permission denied
   for table fb_tokens» — не помилка прав, а саме та стіна, заради якої
   її й ставили.

   Межу при цьому тримає не ключ, а ФІЛЬТР, як у fb-pause: кабінет
   спершу читається заголовками того, хто покликав, тобто його показує
   RLS. Сервісним ключем беремо лише токен — і тільки той, що належить
   КОМАНДІ вже підтвердженого кабінета. По created_by тут фільтрувати
   не можна: токен заводить тімлід, а кабінетом користується баєр.

   Розгортання:
     supabase functions deploy fb-limit
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';
const FN_VERSION = '2026-11-13.1';

/* Спільний секрет звіряємо по всій довжині, а не до першої розбіжності. */

/* КЛАВІАТУРА БОТА — ДО КОЖНОГО ПОВІДОМЛЕННЯ В ОСОБИСТИЙ ЧАТ.
   «кнопки в тг пропадають, постійно треба запускати /start». Клавіатуру
   ставили лише відповіді самого бота; сповіщення (правила, ліміт,
   домени, синк, коментарі, новини) ішли без неї. Тепер кожне особисте
   повідомлення її повертає. Групам (chat_id < 0, спільний TG_CHAT_ID)
   — ні: там кнопки висіли б у всіх учасників.
   Підписи — рівно ті, що в telegram-bot (B_DAY…B_DOM): бот розпізнає
   натиснуту кнопку за текстом, і розбіжність зробила б її мовчазною. */
const TG_KEYS = {
  keyboard: [[{ text: '📈 Stat. Day' }, { text: '💰 Спенд' }],
             [{ text: '🗂 Кабінети' }, { text: '🌐 Домени' }]],
  resize_keyboard: true,
  is_persistent: true
};
const tgKeysFor = (chat: unknown) => Number(chat) > 0 ? { reply_markup: TG_KEYS } : {};

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Скільком мінорним одиницям дорівнює одиниця валюти. Для JPY це 1, і
   тоді вся арифметика нижче інша — тому валюту ми не вгадуємо, а
   пишемо у відповідь, щоб людина бачила, на чому проба стояла. */
const MINOR = 100;

type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify({ fn: FN_VERSION, ...body }),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

/* Graph кладе причину в тіло, а не в код: «Bad Request» не каже
   нічого, а «(#17) User request limit reached» каже все. */
async function graph(path: string, token: string, params: Json = {}, method = 'GET') {
  const u = new URL(GRAPH + path);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (method === 'GET') u.searchParams.set(k, String(v)); else form.set(k, String(v));
  }
  if (method === 'GET') u.searchParams.set('access_token', token);
  else form.set('access_token', token);
  const res = await fetch(u.toString(), method === 'GET' ? {} : { method: 'POST', body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.error) throw new Error(String(j?.error?.message || ('HTTP ' + res.status)));
  return j;
}

async function rest(base: string, hdr: Json, q: string) {
  const res = await fetch(base + '/rest/v1/' + q, { headers: hdr });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
  return await res.json();
}

const ACC_FIELDS = 'account_id,name,currency,spend_cap,amount_spent,balance,account_status';

/* Числа Graph віддає рядками. Беремо лише те, що справді число:
   порожнє поле й нуль — різні відповіді, і плутати їх тут не можна. */
function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ЩО ВИЙШЛО З ЗАПИСУ.

   Ми надіслали число в ЦІЛІЙ ВАЛЮТІ (так Facebook бере його на
   запис), а на читанні він віддає мінорні одиниці. Отже назад має
   прийти те саме, помножене на сто, — це `want`.

   Якщо натомість прийшло у сто разів менше, цей кабінет прочитав наш
   запис як центи, і стеля зараз ЗАНИЗЬКА. Це небезпечніший бік:
   занизька стеля спиняє доставку, тоді як зависока лише дозволяє
   зайве. Тому її виправляють, а не повідомляють.

   Усе інше — «не знаємо». Вгадати тут означало б показати людині
   впевнену відповідь, якої ніхто не перевіряв. */
function capVerdict(want: number, back: number | null) {
  if (back === null) return { units: 'unknown', fix: 0,
    note: 'Facebook не віддав spend_cap назад — що саме стоїть, не видно' };
  // Відсоток, а не одиниця: великі суми Facebook округлює по-своєму.
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b * 0.01);
  if (near(back, want)) return { units: 'major', fix: 0,
    note: 'spend_cap на запис — у цілій валюті, як і очікувалось' };
  if (near(back, Math.round(want / MINOR))) return { units: 'minor', fix: want,
    note: 'цей кабінет прочитав запис як центи — стеля вийшла в сто разів '
        + 'нижчою, виправляємо другим записом' };
  return { units: 'unknown', fix: 0,
    note: 'назад прийшло ' + back + ', а чекали ' + want
        + ' — не вгадуємо, перевір стелю в Ads Manager' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const base = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!base) return reply({ error: 'function is not configured' }, 500);

  /* РОЗКЛАД. Свій секрет розкладу правил, не браузерний JWT: людини
     тут немає. Без секрету розкладу немає взагалі — функція, яка
     піднімає стелю, не мусить бути досяжною «за замовчуванням». */
  const cronKey = req.headers.get('x-cron-key') || '';
  if (cronKey) {
    const want = Deno.env.get('RULES_CRON_SECRET') || '';
    if (!want) return reply({ error: 'scheduled run is not configured: set RULES_CRON_SECRET' }, 400);
    if (!sameSecret(cronKey, want)) return reply({ error: 'bad cron key' }, 401);
    const svcK = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!svcK) return reply({ error: 'SERVICE_ROLE_KEY is not set' }, 400);
    const cronHdr = { apikey: svcK, Authorization: 'Bearer ' + svcK,
                      'content-type': 'application/json' };
    /* Один розклад — дві роботи: ліміт за часом і драбинка. Драбинка
       йде першою лише в тому сенсі, що її звіт дописується до звіту
       планів; одна на одну вони не впливають. */
    const plans = await runPlans(base, cronHdr);
    const pj = await plans.json().catch(() => ({}));
    let ladders: Json = { due: 0, done: [] };
    try { ladders = await runLadders(base, cronHdr); }
    catch (e) { ladders = { error: String((e as Error).message) }; }
    return reply({ ...pj, ladders }, plans.status);
  }

  const auth = req.headers.get('Authorization') || '';
  if (!auth) return reply({ error: 'no authorization header' }, 401);

  let body: Json = {};
  try { body = await req.json(); } catch (_e) {}

  /* Номер кабінета беремо рядком. Number() тут уже один раз підвів у
     check-apps: нечислове значення ставало нулем і виклик тихо йшов
     не туди. */
  let acc = String(body?.account_id ?? '').trim();
  if (!acc) return reply({ error: 'account_id is required' }, 400);
  if (!acc.startsWith('act_')) acc = 'act_' + acc;

  const setMajor = num(body?.set_major);
  const allowNew = body?.allow_new_cap === true;
  const reset = body?.reset === true;

  /* Читаємо токеном того, хто покликав: межі ставить RLS, як у
     fb-post і check-domains. Чужий кабінет просто не прийде. */
  const hdr = { apikey: anon, Authorization: auth, 'content-type': 'application/json' };

  const svc = Deno.env.get('SERVICE_ROLE_KEY')
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!svc) return reply({ error: 'SERVICE_ROLE_KEY не заданий у секретах функції — '
    + 'без нього токен кабінета не прочитати' }, 400);
  const svcHdr = { apikey: svc, Authorization: 'Bearer ' + svc,
                   'content-type': 'application/json' };

  // Кабінет → токен. Той самий ланцюжок, що в усіх інших функціях.
  let token = '', scopes: string[] = [];
  try {
    const bare = acc.replace(/^act_/, '');
    /* Кабінет — заголовками того, хто покликав: чужий сюди не прийде,
       і саме це робить дозволеним крок нижче. */
    const accs = await rest(base, hdr, 'fb_accounts?account_id=eq.'
      + encodeURIComponent(bare)
      + '&select=account_id,token_id,team_name,spend_cap,amount_spent,currency&limit=1');
    if (!accs.length) return reply({ error: 'такого кабінета немає серед твоїх — '
      + 'натисни Sync now на вкладці Cabinets' }, 404);
    if (!accs[0].token_id) return reply({ error: 'до цього кабінета не привʼязаний токен — '
      + 'натисни Sync now на вкладці Cabinets' }, 400);
    /* А токен — сервісним ключем, бо стовпець token браузерним JWT не
       читається взагалі. Фільтр по команді підтвердженого кабінета і є
       межа: ключ бачить усе, бачити дозволено лише це. */
    const toks = await rest(base, svcHdr, 'fb_tokens?id=eq.' + Number(accs[0].token_id)
      + '&team_name=eq.' + encodeURIComponent(String(accs[0].team_name || ''))
      + '&select=id,label,token,scopes&limit=1');
    if (!toks.length) return reply({ error: 'токен, з якого прийшов кабінет, зник' }, 400);
    token = String(toks[0].token || '');
    scopes = Array.isArray(toks[0].scopes) ? toks[0].scopes : [];
  } catch (e) {
    return reply({ error: String((e as Error).message) }, 500);
  }
  if (!token) return reply({ error: 'токен порожній' }, 400);

  return await capFlow(acc, token, scopes, setMajor, allowNew, reset);
});

/* ═══ САМА ЗМІНА СТЕЛІ ═══
   Винесена з обробника без змін у логіці, щоб нею однаково ходили і
   кнопка ✎ на сторінці, і розклад (runPlans нижче): два шляхи до тієї
   самої дії з грошима мусять бути одним кодом. */
async function capFlow(acc: string, token: string, scopes: string[],
                       setMajor: number | null, allowNew: boolean,
                       reset = false): Promise<Response> {
  /* Дозвіл перевіряємо ДО Graph — як у fb-pause. Дізнатись про брак
     прав після того, як запис уже пішов, неможливо; дізнатись після
     того, як людина натиснула і чекає, — цілком реально. */
  if (setMajor !== null && scopes.length && !scopes.includes('ads_management')) {
    return reply({ error: 'у токена немає ads_management — ним можна лише читати. '
      + 'Додай токен із цим дозволом у Settings, і системний юзер має бути '
      + 'АДМІНОМ кабінета, бо advertiser стелю не змінює.' }, 400);
  }

  // Що стоїть зараз — і база для всіх перевірок нижче
  let before: Json;
  try {
    before = await graph('/' + acc, token, { fields: ACC_FIELDS });
  } catch (e) {
    return reply({ error: 'Graph не віддав кабінет: ' + String((e as Error).message) }, 400);
  }

  const capNow = num(before?.spend_cap);
  const spentNow = num(before?.amount_spent);
  const cur = String(before?.currency || '');
  const shape = {
    account_id: String(before?.account_id || acc), name: String(before?.name || ''),
    currency: cur, raw: { spend_cap: before?.spend_cap, amount_spent: before?.amount_spent,
                          balance: before?.balance, account_status: before?.account_status },
    note: 'числа — як їх віддав Facebook; на читанні це мінорні одиниці валюти '
        + (cur || '?') + ', тобто ділити на ' + MINOR
  };

  if (setMajor === null) return reply({ ok: true, mode: 'read', before: shape });

  // ── далі тільки запис ──

  if (!(setMajor > 0)) return reply({ error: 'set_major має бути більше нуля; '
    + 'щоб ПРИБРАТИ стелю, цієї проби не досить — вона цього не перевіряла' }, 400);

  /* Кабінет без стелі — не відмова, а попередження, і робить його
     дашборд ще до виклику. Поставити ми вміємо; ПРИБРАТИ назад — ні,
     бо жодним викликом не перевіряли. Тому прохання має бути явним. */
  if (!capNow && !allowNew) {
    return reply({ error: 'у цього кабінета стелі немає. Поставити можна, '
      + 'але прибрати її назад ця функція не вміє — цього ми не перевіряли. '
      + 'Якщо згоден, повтори з allow_new_cap: true.',
      needs_confirm: 'new_cap', before: shape }, 409);
  }

  /* Надсилаємо ЦІЛУ ВАЛЮТУ — так її бере Facebook на запис. Назад
     чекаємо мінорні одиниці, тобто в сто разів більше число. */
  const sent = Math.round(setMajor);
  const wantBack = Math.round(setMajor * MINOR);

  /* СКИДАННЯ ЛІЧИЛЬНИКА (reset: true).
     «раніше я в срм ставив 5$ і в фб в лімітах також ставилось 5$».

     Стелю Facebook порівнює з amount_spent, а той рахує від останнього
     скидання. У Ads Manager скидання робить кнопка Reset біля ліміту;
     тут — spend_cap_action=reset. Після нього «ліміт 5» означає рівно
     «п'ять від нуля», і саме так його видно у Facebook.

     ПОРЯДОК ВАЖИТЬ. Спершу скидаємо, потім ставимо стелю: навпаки
     кабінет із витраченими 215 дістав би стелю 5 і став би негайно.

     Кабінет БЕЗ стелі може не дати скинути лічильник (скидати нема
     проти чого). Тоді ставимо тимчасову стелю «витрачено + скільки
     просили» — вона сама по собі безпечна й означає те саме, — і
     скидаємо вдруге. Не вийшло й так — лишаємо її й кажемо прямо.

     Після скидання читаємо лічильник назад: вірити, що він нуль, не
     можна — на цьому числі стоять гроші. */
  let spentBase = spentNow;
  let spentAfterReset: number | null = null;
  let tempCap: number | null = null;
  if (reset) {
    const doReset = async () => {
      await graph('/' + acc, token, { spend_cap_action: 'reset' }, 'POST');
      return num((await graph('/' + acc, token, { fields: ACC_FIELDS }))?.amount_spent);
    };
    let why = '';
    try { spentAfterReset = await doReset(); }
    catch (e) { why = String((e as Error).message); }
    const stuck = () => spentAfterReset === null || spentAfterReset >= wantBack;
    if (stuck() && !capNow && spentNow !== null) {
      tempCap = Math.ceil(spentNow / MINOR) + sent;
      try {
        await graph('/' + acc, token, { spend_cap: String(tempCap) }, 'POST');
        spentAfterReset = await doReset();
        why = '';
      } catch (e) { why = String((e as Error).message); }
    }
    if (stuck()) {
      return reply({ error: 'Facebook не скинув лічильник витраченого'
        + (why ? ': ' + why : ' (після скидання він ' + spentAfterReset + ')')
        + (tempCap !== null
            ? '. Стоїть стеля ' + tempCap + ' ' + cur + ' — кабінет відкрутить ще приблизно '
              + sent + ' ' + cur + ' і стане.'
            : '. Ліміт не змінено.'),
        reset_failed: true, temp_cap: tempCap, before: shape }, 409);
    }
    spentBase = spentAfterReset;
  }

  if (spentBase !== null && wantBack <= spentBase) {
    return reply({ error: 'стеля ' + wantBack + ' не вище вже витраченого ' + spentBase
      + ' — такий запис або відкинуть, або кабінет стане негайно. Це дія fb-pause, '
      + 'і робити її треба там, де воно так і називається. Візьми set_major більше '
      + 'за ' + (spentBase / MINOR) + ' ' + (cur || ''), before: shape }, 409);
  }

  const fail = (e: unknown) => {
    const m = String((e as Error).message);
    return reply({ error: m, hint: /\b17\b|limit reached|1885172/i.test(m)
      ? 'це схоже на добовий ліміт: Facebook дозволяє не більше 10 змін стелі '
        + 'на кабінет за добу, і разом із лімітом страждає доставка'
      : 'перевір, що системний юзер — АДМІН цього кабінета', before: shape }, 400);
  };

  const put = async (v: number) => {
    await graph('/' + acc, token, { spend_cap: String(v) }, 'POST');
    // Читаємо назад тим самим запитом — тут єдиний суддя Facebook
    try { return num((await graph('/' + acc, token, { fields: ACC_FIELDS }))?.spend_cap); }
    catch (_e) { return null; }
  };

  let capBack: number | null;
  try { capBack = await put(sent); } catch (e) { return fail(e); }
  let verdict = capVerdict(wantBack, capBack);
  let fixed = false;

  if (verdict.fix) {
    try { capBack = await put(verdict.fix); } catch (e) { return fail(e); }
    fixed = true;
    const again = capVerdict(wantBack, capBack);
    verdict = again.units === 'major'
      ? { units: 'minor', fix: 0, note: verdict.note + ' \u2014 виправлено' }
      : { units: 'unknown', fix: 0,
          note: 'після виправлення назад прийшло ' + capBack
              + ' — це не те, що просили; перевір стелю в Ads Manager' };
  }

  /* Якщо вийшло в рази більше, ніж просили, — це не деталь, а головна
     новина відповіді. Проба для того й існує, щоб це сталось на одному
     кабінеті, а не на всіх. */
  const overshoot = capBack !== null && capBack > wantBack * 10
    ? 'УВАГА: стеля вийшла ' + (capBack / MINOR) + ' ' + cur + ', а просили '
      + setMajor + ' ' + cur + '. Поверни як було ТИМ ЖЕ викликом із set_major: '
      + (capNow !== null ? capNow / MINOR : '<як було>')
    : '';

  return reply({
    ok: true, mode: 'set', account_id: acc, currency: cur,
    asked_major: setMajor, sent_as: sent, fixed,
    cap_before: capNow, cap_after: capBack,
    reset, spent_before: spentNow, spent_after_reset: spentAfterReset,
    units: verdict.units, note: verdict.note,
    warning: overshoot || undefined,
    restore: capNow !== null
      ? { account_id: acc, set_major: capNow / MINOR }
      : 'стелі не було — прибрати її ця проба не вміє',
    /* Тут стояло after?.spend_cap — змінної after не існувало, і
       ReferenceError валив відповідь ПІСЛЯ того, як стеля вже змінилась
       у Facebook: на екрані помилка, а гроші вже дозволені. */
    after_raw: capBack
  });
}

/* ═══════════ ЗМІНА ЛІМІТУ ЗА РОЗКЛАДОМ ═══════════

   «штука, яка міняє саме ліміт, щоб можна було виставляти, в котрій
   годині це міняти». Записи кладе сторінка (кнопка ⏰ біля олівця) у
   fb_limit_plan; розклад щохвилини кличе цю функцію ключем
   RULES_CRON_SECRET, і вона виконує те, чий час настав.

   Межі ті самі, що в кнопки, бо й код той самий (capFlow). Плюс три
   власні:
     • кабінет шукаємо серед кабінетів АВТОРА запису — чужий сюди не
       прийде, хоч ключ і сервісний;
     • запис спершу ЗАБИРАЄМО (pending → running умовним PATCH), і лише
       потім виконуємо: два прогони, що наклались, не змінять стелю
       двічі;
     • запізнення понад PLAN_LATE_MIN — не виконуємо. Стеля, піднята о
       23:40 замість 19:00, — це не те, що планували; кажемо про це в
       Telegram і лишаємо рішення людині. */
const PLAN_LATE_MIN = 30;
const PLAN_BATCH = 20;

async function tgTell(base: string, svcHdr: Json, owner: string, text: string): Promise<void> {
  const bot = Deno.env.get('TG_BOT_TOKEN') || '';
  if (!bot || !owner) return;
  try {
    const l = await rest(base, svcHdr, 'tg_links?select=chat_id&user_id=eq.'
      + encodeURIComponent(owner) + '&chat_id=not.is.null&limit=1');
    if (!l.length) return;
    await fetch('https://api.telegram.org/bot' + bot + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: l[0].chat_id, text, disable_web_page_preview: true, ...tgKeysFor(l[0].chat_id) })
    });
  } catch (_e) { /* повідомлення не дійшло — зміна від цього не скасовується */ }
}

async function planSet(base: string, svcHdr: Json, id: number, patch: Json,
                       onlyIf = ''): Promise<Json[]> {
  const res = await fetch(base + '/rest/v1/fb_limit_plan?id=eq.' + id + onlyIf, {
    method: 'PATCH', headers: { ...svcHdr, Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
  return res.ok ? await res.json() : [];
}

async function runPlans(base: string, svcHdr: Json): Promise<Response> {
  let due: Json[] = [];
  try {
    due = await rest(base, svcHdr, 'fb_limit_plan?status=eq.pending&run_at=lte.'
      + encodeURIComponent(new Date().toISOString()) + '&order=run_at.asc&limit=' + PLAN_BATCH);
  } catch (e) {
    const m = String((e as Error).message);
    return reply({ error: /fb_limit_plan|42P01|does not exist/i.test(m)
      ? 'no fb_limit_plan table yet — run FB_LIMIT_PLAN.sql' : m }, 500);
  }
  const done: Json[] = [];
  for (const p of due) {
    const id = Number(p.id);
    const owner = String(p.created_by || '');
    const bare = String(p.account_id || '').replace(/^act_/, '');
    const late = (Date.now() - Date.parse(String(p.run_at))) / 60000;
    if (late > PLAN_LATE_MIN) {
      const got = await planSet(base, svcHdr, id, { status: 'missed', done_at: new Date().toISOString(),
        result: 'not run: ' + Math.round(late) + ' min late' }, '&status=eq.pending');
      if (got.length) await tgTell(base, svcHdr, owner, '⏰ Scheduled limit NOT changed\n'
        + '\u{1F3E6} ' + bare + ' → $' + p.set_major + '\nIt was due ' + Math.round(late)
        + ' min ago — too late to apply safely. Change it by hand if still needed.');
      done.push({ id, status: got.length ? 'missed' : 'skipped' });
      continue;
    }
    // Забираємо запис. Хтось уже забрав — не наш.
    const claimed = await planSet(base, svcHdr, id, { status: 'running' }, '&status=eq.pending');
    if (!claimed.length) { done.push({ id, status: 'skipped' }); continue; }

    let status = 'failed', result = '', capAfter: number | null = null;
    try {
      const accs = await rest(base, svcHdr, 'fb_accounts?account_id=eq.' + encodeURIComponent(bare)
        + '&created_by=eq.' + encodeURIComponent(owner)
        + '&select=account_id,token_id,team_name&limit=1');
      if (!accs.length || !accs[0].token_id) throw new Error('cabinet not found among the author’s cabinets');
      const toks = await rest(base, svcHdr, 'fb_tokens?id=eq.' + Number(accs[0].token_id)
        + '&team_name=eq.' + encodeURIComponent(String(accs[0].team_name || ''))
        + '&select=token,scopes&limit=1');
      const token = String(toks[0]?.token || '');
      if (!token) throw new Error('the cabinet’s token is gone');
      const scopes = Array.isArray(toks[0]?.scopes) ? toks[0].scopes : [];
      const res = await capFlow('act_' + bare, token, scopes, num(p.set_major), p.allow_new === true);
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        status = 'done';
        capAfter = num(j.cap_after);
        result = String(j.note || 'ok') + (j.warning ? ' · ' + j.warning : '');
      } else {
        result = String(j.error || 'HTTP ' + res.status) + (j.hint ? ' · ' + j.hint : '');
      }
    } catch (e) { result = String((e as Error).message); }

    await planSet(base, svcHdr, id, { status, result: result.slice(0, 500),
      done_at: new Date().toISOString(), cap_after: capAfter });
    await tgTell(base, svcHdr, owner, status === 'done'
      ? '⏰ Limit changed on schedule\n\u{1F3E6} ' + bare + ' → $' + p.set_major
        + (capAfter !== null ? ' (Facebook now: $' + (capAfter / MINOR) + ')' : '')
      : '⚠ Scheduled limit change FAILED\n\u{1F3E6} ' + bare + ' → $' + p.set_major
        + '\n' + result);
    done.push({ id, status });
  }
  return reply({ ok: true, mode: 'plans', due: due.length, done });
}

/* ═══════════ ДРАБИНКА ЛІМІТІВ ═══════════

   «Ти даєш кабінету $5 на пробу. Якщо він відкрутив їх із нормальною
   ціною ліда чи інсталу, CRM сама дає наступні. Якщо ціна погана,
   лишає стояти.»

   Рядок у fb_limit_ladder кладе сторінка; далі все робить цей код за
   тим самим розкладом, що й ліміт за часом. На кожному проході для
   кожної живої драбинки одне питання: що робити зараз?

     • сходинок ще не видавали        → видати першу;
     • ліміт стоїть не той, що ми дали → хтось змінив руками: знімаємось;
     • ліміт ще не відкручено          → чекати;
     • відкручено, це була остання     → кінець;
     • відкручено, ціна вклалась       → наступна сходинка;
     • відкручено, ціна не вклалась    → чекаємо LAD_GRACE (результати
       Facebook дописує із запізненням), потім зупиняємось.

   Сходинка — це той самий capFlow зі скиданням лічильника, що й олівець
   на сторінці: «ліміт 10 від нуля». Тому «відкручено за сходинку» —
   просто amount_spent, а результати рахуємо різницею: скільки лідів та
   інсталів було на кабінеті за весь час на старті сходинки і скільки
   тепер.

   РІШЕННЯ ОКРЕМОЮ ФУНКЦІЄЮ (ladDecide): тут арифметика про справжні
   гроші, і її треба мати змогу перевірити без Facebook і без бази. */
const LAD_BATCH = 20;
const LAD_EVERY_MS = 4 * 60_000;      // одну драбинку питаємо не частіше
const LAD_GRACE_MS = 30 * 60_000;     // скільки чекати результатів після відкруту
const LAD_HIT = 0.95;                 // «відкручено» = 95% ліміту: рівно в стелю Facebook не б'є

// Ліди й інстали з рядка insights. Одну подію Facebook віддає кількома
// іменами — беремо найбільше з них, а не суму.
function ladResults(actions: Json[]): number {
  const pick = (t: string) => {
    const a = (actions || []).find(x => String(x?.action_type || '') === t);
    return a ? Number(a.value) || 0 : 0;
  };
  const leads = Math.max(pick('lead'), pick('offsite_conversion.fb_pixel_lead'),
                         pick('onsite_conversion.lead_grouped'));
  const inst = Math.max(pick('mobile_app_install'), pick('omni_app_install'));
  return leads + inst;
}

type LadAct = { act: 'next' | 'wait' | 'hold' | 'done' | 'stop' | 'cancel'; why: string; cost?: number };

/* spent і cap — мінорні одиниці, як їх віддає Graph. results — ліди та
   інстали кабінета за весь час (null, якщо Facebook не відповів). */
function ladDecide(l: Json, now: number, spent: number | null, cap: number | null,
                   results: number | null): LadAct {
  const done = Number(l.steps_done) || 0, total = Number(l.steps_total) || 0;
  const step = Number(l.step_major) || 0, maxCost = Number(l.max_cost) || 0;
  if (done <= 0) return { act: 'next', why: 'first step' };
  if (spent === null || cap === null) return { act: 'wait', why: 'Facebook did not return the limit' };
  const want = Math.round(step * MINOR);
  if (Math.abs(cap - want) > Math.max(1, want * 0.01))
    return { act: 'cancel', why: 'the limit was changed by hand (' + (cap / MINOR) + ' instead of ' + step + ')' };
  if (spent < want * LAD_HIT) return { act: 'wait', why: 'still spending' };
  if (done >= total) return { act: 'done', why: 'all ' + total + ' steps are spent' };

  const base = l.base_results === null || l.base_results === undefined ? null : Number(l.base_results);
  const got = base === null || results === null ? null : Math.max(0, results - base);
  const cost = got && got > 0 ? (spent / MINOR) / got : null;
  if (cost !== null && cost <= maxCost) return { act: 'next', why: 'cost ' + cost.toFixed(2), cost };

  const hit = l.hit_at ? Date.parse(String(l.hit_at)) : 0;
  if (!hit) return { act: 'hold', why: 'limit reached, waiting for results' };
  if (now - hit < LAD_GRACE_MS) return { act: 'wait', why: 'limit reached, waiting for results' };
  return { act: 'stop', cost: cost === null ? undefined : cost,
           why: got === null ? 'Facebook did not return results'
              : got === 0 ? 'no leads or installs for this step'
              : 'cost ' + (cost as number).toFixed(2) + ' is above ' + maxCost };
}

async function ladSet(base: string, hdr: Json, id: number, patch: Json, onlyIf = ''): Promise<Json[]> {
  const res = await fetch(base + '/rest/v1/fb_limit_ladder?id=eq.' + id + onlyIf, {
    method: 'PATCH', headers: { ...hdr, Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
  return res.ok ? await res.json() : [];
}

async function runLadders(base: string, svcHdr: Json): Promise<Json> {
  const cut = new Date(Date.now() - LAD_EVERY_MS).toISOString();
  let due: Json[] = [];
  try {
    due = await rest(base, svcHdr, 'fb_limit_ladder?status=eq.active'
      + '&or=(last_check_at.is.null,last_check_at.lt.' + encodeURIComponent(cut) + ')'
      + '&order=last_check_at.asc.nullsfirst&limit=' + LAD_BATCH);
  } catch (e) {
    const m = String((e as Error).message);
    // Таблиці ще немає — драбинок просто не існує; це не помилка розкладу.
    if (/fb_limit_ladder|42P01|does not exist|schema cache/i.test(m)) return { due: 0, done: [], note: 'no table yet' };
    throw e;
  }
  const out: Json[] = [];
  for (const l of due) {
    const id = Number(l.id);
    const owner = String(l.created_by || '');
    const bare = String(l.account_id || '').replace(/^act_/, '');
    const nowIso = new Date().toISOString();
    /* Забираємо прохід: два прогони, що наклались, не видадуть сходинку
       двічі. Умова — що last_check_at досі той, який ми прочитали. */
    const guard = l.last_check_at ? '&last_check_at=eq.' + encodeURIComponent(String(l.last_check_at))
                                  : '&last_check_at=is.null';
    const mine = await ladSet(base, svcHdr, id, { last_check_at: nowIso }, '&status=eq.active' + guard);
    if (!mine.length) { out.push({ id, act: 'skipped' }); continue; }

    const tag = '\u{1F3E6} ' + bare + ' · ladder ';
    const finish = async (status: string, note: string, tell: string) => {
      await ladSet(base, svcHdr, id, { status, note: note.slice(0, 300), done_at: nowIso });
      if (tell) await tgTell(base, svcHdr, owner, tell);
      out.push({ id, act: status, note });
    };

    try {
      const accs = await rest(base, svcHdr, 'fb_accounts?account_id=eq.' + encodeURIComponent(bare)
        + '&created_by=eq.' + encodeURIComponent(owner) + '&select=account_id,token_id,team_name&limit=1');
      if (!accs.length || !accs[0].token_id) throw new Error('cabinet not found among the author’s cabinets');
      const toks = await rest(base, svcHdr, 'fb_tokens?id=eq.' + Number(accs[0].token_id)
        + '&team_name=eq.' + encodeURIComponent(String(accs[0].team_name || '')) + '&select=token,scopes&limit=1');
      const token = String(toks[0]?.token || '');
      if (!token) throw new Error('the cabinet’s token is gone');
      const scopes = Array.isArray(toks[0]?.scopes) ? toks[0].scopes : [];
      const act = 'act_' + bare;

      const cur = await graph('/' + act, token, { fields: ACC_FIELDS });
      const spent = num(cur?.amount_spent), cap = num(cur?.spend_cap);
      let results: number | null = null;
      try {
        const ins = await graph('/' + act + '/insights', token,
          { fields: 'actions', date_preset: 'maximum', level: 'account' });
        const row = Array.isArray(ins?.data) ? ins.data[0] : null;
        results = row ? ladResults(Array.isArray(row.actions) ? row.actions : []) : 0;
      } catch (_e) { results = null; }

      const d = ladDecide(l, Date.now(), spent, cap, results);
      const stepNo = (Number(l.steps_done) || 0) + 1, total = Number(l.steps_total) || 0;
      const money = '$' + Number(l.step_major);

      if (d.act === 'wait') { out.push({ id, act: 'wait', why: d.why }); continue; }
      if (d.act === 'hold') {
        await ladSet(base, svcHdr, id, { hit_at: nowIso, note: d.why });
        out.push({ id, act: 'hold' });
        continue;
      }
      if (d.act === 'cancel') { await finish('cancelled', d.why, '⚠ ' + tag + 'stopped: ' + d.why + '.'); continue; }
      if (d.act === 'done') { await finish('done', d.why, '✅ ' + tag + 'finished: ' + d.why + '.'); continue; }
      if (d.act === 'stop') {
        await finish('stopped', d.why, '⏸ ' + tag + 'stopped at step ' + (stepNo - 1) + '/' + total
          + ': ' + d.why + '. The cabinet stays at its limit.');
        continue;
      }

      // next: видаємо сходинку — той самий шлях, що й олівець зі скиданням лічильника.
      const res = await capFlow(act, token, scopes, Number(l.step_major), true, true);
      const j = await res.json().catch(() => ({}));
      if (!(res.ok && j.ok)) {
        const why = String(j.error || 'HTTP ' + res.status).slice(0, 200);
        await finish('failed', why, '⚠ ' + tag + 'FAILED at step ' + stepNo + '/' + total + '\n' + why);
        continue;
      }
      await ladSet(base, svcHdr, id, { steps_done: stepNo, base_results: results,
        step_started_at: nowIso, hit_at: null,
        note: 'step ' + stepNo + '/' + total + (d.cost !== undefined ? ', previous cost ' + d.cost.toFixed(2) : '') });
      await tgTell(base, svcHdr, owner, '\u{1F4F6} ' + tag + 'step ' + stepNo + '/' + total + ': ' + money
        + (d.cost !== undefined ? ' (previous step cost $' + d.cost.toFixed(2) + ' per result, limit $'
            + Number(l.max_cost) + ')' : ''));
      out.push({ id, act: 'next', step: stepNo });
    } catch (e) {
      const why = String((e as Error).message).slice(0, 200);
      await finish('failed', why, '⚠ ' + tag + 'FAILED\n' + why);
    }
  }
  return { due: due.length, done: out };
}
