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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';
const FN_VERSION = '2026-10-31.1';

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

  if (spentNow !== null && wantBack <= spentNow) {
    return reply({ error: 'стеля ' + wantBack + ' не вище вже витраченого ' + spentNow
      + ' — такий запис або відкинуть, або кабінет стане негайно. Це дія fb-pause, '
      + 'і робити її треба там, де воно так і називається. Візьми set_major більше '
      + 'за ' + (spentNow / MINOR) + ' ' + (cur || ''), before: shape }, 409);
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
    units: verdict.units, note: verdict.note,
    warning: overshoot || undefined,
    restore: capNow !== null
      ? { account_id: acc, set_major: capNow / MINOR }
      : 'стелі не було — прибрати її ця проба не вміє',
    after_raw: after?.spend_cap
  });
});
