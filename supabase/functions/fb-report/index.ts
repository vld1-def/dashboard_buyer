/* ═══════════ ЗВІТ КАБІНЕТА, ЯК ЙОГО РОБИТЬ ADS MANAGER ═══════════

   Досі експорт був ручним: зайти у Facebook, зібрати звіт, скачати
   файл, залити його у Form.html. Ця функція робить перші три кроки
   замість людини й віддає той самий файл.

   ТЕ САМЕ ДЖЕРЕЛО. act_X/insights — це те, з чого Ads Manager малює
   свій екран і будує свій експорт. Не схожі цифри, а ті самі.

   ЧОМУ АСИНХРОННО. Синхронний insights на рівні оголошень за місяць
   для великого кабінета не встигає за 110 секунд, які має Edge
   Function. Facebook має для цього окремий режим: POST відкриває
   «прогін звіту» й одразу віддає його номер, далі ми питаємо, чи
   готово, і забираємо рядки сторінками. Звіт будує Facebook на своєму
   боці — ми тільки приходимо по результат.

   Через це функція має ТРИ дії замість однієї:
     events — які взагалі конверсії приходять у цьому кабінеті. Без
              цього неможливо сказати, що вважати регою, а що депом:
              Graph віддає їх як action_type, і вгадувати ми не будемо;
     start  — відкрити прогін, повернути номер;
     fetch  — спитати стан і, коли готово, віддати сторінку рядків.

   ЖОДНОГО ВХОДУ ЗА РОЗКЛАДОМ. Як і у fb-pause: покликати можна лише
   з токеном людини, і кабінет має бути її. Ключем сервісної ролі ми
   ходимо в базу (інакше не прочитати fb_tokens.token), але межу
   ставить перевірений uid, а не те, що попросили в тілі запиту.

   Розгортання:
     supabase functions deploy fb-report
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';

// Скільки рядків за одну сторінку. Більше Facebook і не віддасть.
const PAGE = 500;

/* Скільки сторінок забираємо за один виклик fetch. Три — це близько
   півтори тисячі рядків і кілька секунд: достатньо, щоб не ганяти
   браузер по колу на кожні 500, і мало, щоб не впертись у дедлайн. */
const PAGES_PER_CALL = 3;

const DEADLINE_MS = 100_000;

type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

async function whoAmI(base: string, anon: string, auth: string): Promise<string> {
  const res = await fetch(base + '/auth/v1/user', {
    headers: { apikey: anon, Authorization: auth }
  });
  if (!res.ok) return '';
  const u = await res.json().catch(() => ({}));
  return String(u?.id || '');
}

async function pgGet(base: string, hdr: Json, path: string): Promise<Json[]> {
  const res = await fetch(base + '/rest/v1/' + path, { headers: hdr });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
  return await res.json();
}

/* Токен кладемо в тіло, а не в рядок запиту: адреси з токеном осідають
   у логах проксі та в заголовку Referer. Graph приймає GET-запити
   методом POST, якщо попросити явно. Для справжнього POST (відкрити
   прогін звіту) real = true. */
async function graph(path: string, token: string, params: Json, real = false): Promise<Json> {
  const body = new URLSearchParams({ access_token: token });
  if (!real) body.set('method', 'GET');
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') body.set(k, String(v));
  const res = await fetch(GRAPH + path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const j = await res.json().catch(() => ({}));
  if (j && j.error) throw new Error(String(j.error.error_user_msg || j.error.message || 'Graph API error'));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return j;
}

/* ── що просимо у звіті ──

   Набір навмисно збігається з тим, що Form.html шукає в заголовках:
   рахунок, кампанія, оголошення, гроші, кліки, конверсії, дата. Інакше
   файл довелось би правити руками перед імпортом, і сенс кнопки
   зникав би. */
const FIELDS = [
  // Номер кабінета, а не назва: у дашборді кабінети звуться номерами,
  // і саме за номером імпорт знаходить, чий це рядок.
  'account_id', 'campaign_name', 'ad_name',
  'spend', 'clicks', 'inline_link_clicks',
  'actions', 'date_start', 'date_stop'
].join(',');

/* Розрізи. Кожен окремо: Facebook дозволяє не будь-яку їх комбінацію,
   а звіт, який ляже на всі одразу, однаково ніхто не відкриє. */
const BREAKDOWNS: Record<string, string> = {
  '': '',
  country: 'country',
  placement: 'publisher_platform,platform_position,impression_device',
  /* Найширший — і саме він стоїть за замовчуванням, бо рівно його й
     вивантажують руками. Його тут бракувало: у списку на сторінці він
     був, у цій мапі — ні, тож типовий експорт падав на
     «unknown breakdown» ще до першого запиту в Graph. */
  country_placement: 'country,publisher_platform,platform_position,impression_device'
};

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
  if (!svc) return reply({ error: 'SERVICE_ROLE_KEY is not set in the function secrets' }, 400);

  const auth = req.headers.get('Authorization') || '';
  if (!auth) return reply({ error: 'no authorization header' }, 401);
  const me = await whoAmI(base, anon, auth);
  if (!me) return reply({ error: 'could not verify who is calling' }, 401);

  let body: Json = {};
  try { body = await req.json(); } catch (_e) { /* тіла може не бути */ }

  const action = String(body?.action || '');
  const accountId = String(body?.account_id || '').replace(/\D/g, '');
  if (!accountId) return reply({ error: 'account_id is required' }, 400);

  const hdr: Json = { apikey: svc, Authorization: 'Bearer ' + svc,
                      'content-type': 'application/json' };

  /* Кабінет мусить бути ТВІЙ — і це перевіряється на КОЖНІЙ дії, а не
     лише на першій. Номер прогону звіту сам по собі нічого не захищає:
     він просто число, яке приходить у тілі запиту. */
  const accs = await pgGet(base, hdr,
    'fb_accounts?select=account_id,name,currency,token_id'
    + '&created_by=eq.' + encodeURIComponent(me)
    + '&account_id=eq.' + encodeURIComponent(accountId));
  const acc = accs[0];
  if (!acc) return reply({ error: 'no such ad account among yours — run Sync now first' }, 404);
  /* Токен видалили в налаштуваннях — і зв'язок обірвався сам: у базі
     token_id стоїть «при видаленні обнулити». Дані кабінета лишились,
     на екрані він виглядає живим, а піти з ним у Facebook нема з чим.

     Найчастіше це лікує Sync now: він переписує зв'язок для всіх
     кабінетів, які бачить нинішній токен. Тому кажемо це прямо, а не
     лишаємо людину з констатацією. */
  if (!acc.token_id) return reply({
    error: 'no token is linked to this cabinet any more — press Sync now on the Cabinets tab. '
         + 'If the token was deleted, add it again in Settings first.' }, 400);

  const toks = await pgGet(base, hdr,
    'fb_tokens?select=id,label,token'
    + '&id=eq.' + Number(acc.token_id)
    + '&created_by=eq.' + encodeURIComponent(me));
  const tok = toks[0];
  if (!tok) return reply({ error: 'the token this cabinet came from is gone' }, 400);

  if (action === 'events')  return await listEvents(tok.token, accountId, body);
  if (action === 'start')   return await startRun(tok.token, accountId, body);
  if (action === 'fetch')   return await fetchRun(tok.token, body);
  return reply({ error: 'unknown action: ' + action }, 400);
}

/* ── які конверсії тут узагалі бувають ──

   Marketing API не знає, що в тебе «рега», а що «деп»: він віддає
   action_type своїми іменами (purchase, complete_registration,
   offsite_conversion.custom.1234…). Вибрати має людина — але не з
   голови, а зі списку того, що реально приходило. */
async function listEvents(token: string, actId: string, body: Json): Promise<Response> {
  const since = String(body?.since || '');
  const until = String(body?.until || '');
  let j: Json;
  try {
    j = await graph('/act_' + actId + '/insights', token, {
      fields: 'actions',
      level: 'account',
      time_range: since && until ? JSON.stringify({ since, until }) : null,
      date_preset: since && until ? null : 'last_30d',
      limit: 1
    });
  } catch (e) {
    return reply({ error: (e as Error).message }, 502);
  }
  const row = (Array.isArray(j.data) ? j.data : [])[0] || {};
  const seen: Record<string, number> = {};
  (Array.isArray(row.actions) ? row.actions : []).forEach((a: Json) => {
    const t = String(a?.action_type || '');
    if (!t) return;
    seen[t] = (seen[t] || 0) + (Number(a?.value) || 0);
  });
  const events = Object.entries(seen)
    .map(([type, n]) => ({ type, n }))
    .sort((a, b) => b.n - a.n);
  return reply({ events });
}

/* ── відкрити прогін ──
   Facebook віддає номер одразу; сам звіт він будує вже без нас. */
async function startRun(token: string, actId: string, body: Json): Promise<Response> {
  const since = String(body?.since || '');
  const until = String(body?.until || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until))
    return reply({ error: 'since and until must be YYYY-MM-DD' }, 400);
  if (since > until) return reply({ error: 'since is after until' }, 400);

  const key = String(body?.breakdown || '');
  if (!(key in BREAKDOWNS)) return reply({ error: 'unknown breakdown: ' + key }, 400);

  let j: Json;
  try {
    j = await graph('/act_' + actId + '/insights', token, {
      level: 'ad',
      fields: FIELDS,
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      breakdowns: BREAKDOWNS[key] || null,
      limit: PAGE
    }, true);
  } catch (e) {
    return reply({ error: (e as Error).message }, 502);
  }
  const run = String(j?.report_run_id || '');
  if (!run) return reply({ error: 'Facebook did not give a report id back' }, 502);
  return reply({ run_id: run });
}

/* ── спитати й забрати ──

   Поки Facebook рахує, віддаємо відсоток: звіт за місяць на рівні
   оголошень будується не миттєво, і мовчазне очікування виглядало б
   як зависання.

   Коли готово — віддаємо сторінки, скільки встигнемо, і курсор на
   наступну. Складати весь звіт у памʼять функції не можна: у великому
   кабінеті він більший за її межу. */
async function fetchRun(token: string, body: Json): Promise<Response> {
  const run = String(body?.run_id || '').replace(/\D/g, '');
  if (!run) return reply({ error: 'run_id is required' }, 400);

  let st: Json;
  try {
    st = await graph('/' + run, token, { fields: 'async_status,async_percent_completion' });
  } catch (e) {
    return reply({ error: (e as Error).message }, 502);
  }

  const status = String(st?.async_status || '');
  const percent = Number(st?.async_percent_completion) || 0;
  /* «Скасовано» і «зламалось» — не те саме, що «ще рахую», і крутити
     на них смужку очікування вічно було б найгіршим із можливого. */
  if (/Failed|Skipped/i.test(status))
    return reply({ error: 'Facebook gave up on this report (' + status + '). '
      + 'A shorter period or a simpler breakdown usually goes through.' }, 502);
  if (status !== 'Job Completed') return reply({ ready: false, status, percent });

  const deadline = Date.now() + DEADLINE_MS;
  let after = String(body?.after || '');
  const rows: Json[] = [];

  for (let i = 0; i < PAGES_PER_CALL; i++) {
    let j: Json;
    try {
      j = await graph('/' + run + '/insights', token, { limit: PAGE, after: after || null });
    } catch (e) {
      return reply({ error: (e as Error).message }, 502);
    }
    rows.push(...(Array.isArray(j.data) ? j.data : []));
    /* Кінець — це або порожній курсор, або відсутнє посилання на
       наступну сторінку. Курсор Graph віддає й на останній сторінці,
       тож самого його мало. */
    after = (j?.paging?.next ? j?.paging?.cursors?.after : '') || '';
    if (!after) break;
    if (Date.now() > deadline) break;
  }

  /* Порожній after означає «це все». Другого прапорця не заводимо: два
     джерела правди про одне й те саме колись розійдуться. */
  return reply({ ready: true, rows, after });
}
