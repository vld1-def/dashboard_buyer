/* ═══════════ СТЕЛЯ ВИТРАТ КАБІНЕТА — ПРОБА ═══════════

   ЦЕ ЩЕ НЕ ФУНКЦІЯ ДАШБОРДА. Кнопки в Cabinets немає свідомо: перед
   тим як дати людині поле «стеля», треба знати одну річ, якої ми
   поки не знаємо напевно, — В ЯКИХ ОДИНИЦЯХ Facebook приймає spend_cap
   на ЗАПИС.

   На ЧИТАННІ він віддає мінорні одиниці (центи) — fb-sync так і
   складає, через cents(). На запис джерела розходяться: одні кажуть
   мінорні, інші — цілу валюту. Різниця у 100 разів, і обидва боки
   помилки дорогі: стеля $10 000 замість $100 — це дозвіл витратити
   те, чого ніхто не дозволяв; стеля $1 замість $100 — це кабінет,
   який стає посеред дня.

   Тому спершу проба на ОДНОМУ кабінеті, який назве людина: поставити
   відоме число й одразу прочитати, що з нього вийшло. Відповідь
   Facebook — єдине джерело, якому тут можна вірити.

   ЧОМУ ЦЕ НЕ «ЩЕ ОДНЕ ПОЛЕ». Напрямок ризику тут інший, ніж у
   всього, що функції проєкту робили досі. fb-pause лише ЗУПИНЯЄ —
   помилка там коштує недолитого трафіку. Стеля працює в обидва боки:
   підняти її означає дозволити витрачати більше. Тому:
     • треба ads_management — читальний токен стелю не змінить;
     • системний юзер має бути АДМІНОМ кабінета, не advertiser;
     • тут вимагається роль lead або admin — баєру стелю не рухати;
     • один виклик — один кабінет, списку немає і не буде.

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

   Розгортання:
     supabase functions deploy fb-limit
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';
const FN_VERSION = '2026-10-30.1';

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

/* Головне питання проби. Ми надіслали sent (мінорні одиниці). Якщо
   Facebook зрозумів нас так само — назад прийде те саме число. Якщо
   він прийняв наші 700 за 700 цілих — назад прийде 70000. Третього
   очікуваного варіанта немає, тож усе інше ми НЕ вгадуємо, а
   показуємо як є. */
function unitVerdict(sent: number, back: number | null) {
  if (back === null) return { units: 'unknown',
    note: 'Facebook не віддав spend_cap назад — одиниці проба не визначила' };
  if (Math.abs(back - sent) <= 1) return { units: 'minor',
    note: 'spend_cap на запис — у мінорних одиницях (центах), як і на читанні' };
  if (Math.abs(back - sent * MINOR) <= MINOR) return { units: 'major',
    note: 'spend_cap на запис — у цілій валюті: наші ' + sent + ' Facebook прийняв за '
        + sent + ' ' + 'цілих, а не за ' + (sent / MINOR) };
  return { units: 'unknown',
    note: 'назад прийшло ' + back + ', а це не збігається ні з ' + sent
        + ', ні з ' + sent * MINOR + ' — не вгадуємо, дивись raw нижче' };
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

  /* Роль — лише на запис. Подивитись, яка стеля стоїть, може будь-хто
     зі своєї команди: це те саме число, що вже видно в панелі. */
  if (setMajor !== null) {
    let role = 'buyer';
    try {
      const r = await fetch(base + '/rest/v1/rpc/my_role',
        { method: 'POST', headers: hdr, body: '{}' });
      role = String(await r.json().catch(() => 'buyer') || 'buyer');
    } catch (_e) {}
    if (role !== 'lead' && role !== 'admin') {
      return reply({ error: 'стелю витрат змінює тімлід або адмін — твоя роль "'
        + role + '"' }, 403);
    }
  }

  // Кабінет → токен. Той самий ланцюжок, що в усіх інших функціях.
  let token = '', scopes: string[] = [];
  try {
    const bare = acc.replace(/^act_/, '');
    const accs = await rest(base, hdr, 'fb_accounts?account_id=eq.'
      + encodeURIComponent(bare) + '&select=account_id,token_id,spend_cap,amount_spent,currency&limit=1');
    if (!accs.length) return reply({ error: 'такого кабінета немає серед твоїх — '
      + 'натисни Sync now на вкладці Cabinets' }, 404);
    if (!accs[0].token_id) return reply({ error: 'до цього кабінета не привʼязаний токен' }, 400);
    const toks = await rest(base, hdr, 'fb_tokens?id=eq.' + Number(accs[0].token_id)
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

  if (!capNow && !allowNew) {
    return reply({ error: 'у цього кабінета стелі немає (spend_cap = '
      + JSON.stringify(before?.spend_cap ?? null) + '). Проба на такому не ставиться: '
      + 'поставити стелю ми вміємо, а чи приберемо її назад тим самим шляхом — '
      + 'не перевірено, і кабінет лишився б із лімітом, якого в нього не було. '
      + 'Візьми кабінет, де стеля вже стоїть, або передай allow_new_cap: true.',
      before: shape }, 409);
  }

  /* Надсилаємо в тих одиницях, у яких читаємо. Якщо вгадали — назад
     прийде те саме число; якщо ні — у сто разів більше, і проба це
     побачить. */
  const sent = Math.round(setMajor * MINOR);

  if (spentNow !== null && sent <= spentNow) {
    return reply({ error: 'стеля ' + sent + ' не вище вже витраченого ' + spentNow
      + ' — такий запис або відкинуть, або кабінет стане негайно. Це дія fb-pause, '
      + 'і робити її треба там, де воно так і називається. Візьми set_major більше '
      + 'за ' + (spentNow / MINOR) + ' ' + (cur || ''), before: shape }, 409);
  }

  try {
    await graph('/' + acc, token, { spend_cap: String(sent) }, 'POST');
  } catch (e) {
    const m = String((e as Error).message);
    return reply({ error: m, hint: /\b17\b|limit reached|1885172/i.test(m)
      ? 'це схоже на добовий ліміт: Facebook дозволяє не більше 10 змін стелі '
        + 'на кабінет за добу, і разом із лімітом страждає доставка'
      : 'перевір, що системний юзер — АДМІН цього кабінета', before: shape }, 400);
  }

  // Читаємо назад тим самим запитом — відповідь Facebook тут єдиний суддя
  let after: Json = {};
  try { after = await graph('/' + acc, token, { fields: ACC_FIELDS }); } catch (_e) {}
  const capBack = num(after?.spend_cap);
  const verdict = unitVerdict(sent, capBack);

  /* Якщо вийшло в рази більше, ніж просили, — це не деталь, а головна
     новина відповіді. Проба для того й існує, щоб це сталось на одному
     кабінеті, а не на всіх. */
  const overshoot = capBack !== null && capBack > sent * 10
    ? 'УВАГА: стеля вийшла ' + (capBack / MINOR) + ' ' + cur + ', а просили '
      + setMajor + ' ' + cur + '. Поверни як було ТИМ ЖЕ викликом із set_major: '
      + (capNow !== null ? capNow / MINOR : '<як було>')
    : '';

  return reply({
    ok: true, mode: 'set', account_id: acc, currency: cur,
    asked_major: setMajor, sent_as: sent,
    cap_before: capNow, cap_after: capBack,
    units: verdict.units, note: verdict.note,
    warning: overshoot || undefined,
    restore: capNow !== null
      ? { account_id: acc, set_major: capNow / MINOR }
      : 'стелі не було — прибрати її ця проба не вміє',
    after_raw: after?.spend_cap
  });
});
