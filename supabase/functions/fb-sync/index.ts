/* ═══════════ ЩО FACEBOOK КАЖЕ ПРО КАБІНЕТИ ═══════════

   Досі токен системного користувача використовувався рівно один раз —
   у мить додавання, щоб подивитись, що він бачить. Далі просто лежав.
   Ця функція нарешті ним користується: щогодини обходить кабінети й
   складає у fb_accounts те, що каже Marketing API.

   Що забирає, у порядку важливості:
     1. стан кабінета (active / banned / unsettled / …) — заради цього
        все й затівалось: забанений кабінет має бути видно одразу, а
        не за три дні;
     2. скільки відкручено сьогодні;
     3. скільки живих кампаній, адсетів, оголошень;
     4. чим платить — тип картки й останні чотири цифри.

   ПРО БІН КАРТКИ, щоб не шукати даремно. Marketing API не віддає
   перших шести цифр — ніде, жодним полем. Максимум, що є, це
   funding_source_details.display_string виду «Visa *1234». Тому в базі
   лежить саме воно, і поле чесно зветься card, а не card_bin.

   ЖОДНИХ ІМПОРТІВ — з тієї ж причини, що й у check-domains: якщо
   імпорт не розвʼяжеться, функція падає ще до запуску, шлюз віддає
   помилку без CORS-заголовків, і в браузері це виглядає як «Failed to
   fetch» навіть коли з кодом усе гаразд.

   ДВА ВХОДИ, і вони різні:

     зі сторінки — заголовок Authorization з токеном людини. Ми його
       перевіряємо в Supabase Auth, дістаємо її user id і синхронізуємо
       ТІЛЬКИ її токени. Ключ сервісної ролі тут потрібен (інакше не
       прочитати fb_tokens.token), але межі ставить перевірений uid, а
       не те, що попросили в тілі запиту;

     з розкладу — заголовок x-cron-key зі спільним секретом. Тоді
       обходимо всіх.

   Розгортання:
     supabase functions deploy fb-sync
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';

// Скільки запитів в одному пакеті Graph. Їхня стеля — 50. По 4 запити
// на кабінет виходить 12 кабінетів за виклик.
const PER_ACC = 4;
const BATCH_MAX = 48;

// Edge Function не працює вічно. Упершись у дедлайн, чесно віддаємо
// «є ще» замість того, щоб обірватись, нічого не записавши.
const DEADLINE_MS = 110_000;

type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

/* Спільний секрет звіряємо по всій довжині, а не до першої розбіжності. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ── хто нас кличе ──
   Дашборд надсилає свій JWT. Ми могли б просто повірити тілу запиту,
   але тоді будь-хто попросив би синхронізувати чужі токени. Тому uid
   беремо ТІЛЬКИ з відповіді Auth. */
async function whoAmI(base: string, anon: string, auth: string): Promise<string> {
  const res = await fetch(base + '/auth/v1/user', {
    headers: { apikey: anon, Authorization: auth }
  });
  if (!res.ok) return '';
  const u = await res.json().catch(() => ({}));
  return String(u?.id || '');
}

/* ── Graph API ──
   Токен кладемо в тіло POST, а не в рядок запиту: адреси з токеном
   осідають у логах проксі та в заголовку Referer. Graph приймає
   GET-запити методом POST, якщо попросити явно (method=GET). */
async function graph(path: string, token: string, params: Json): Promise<Json> {
  const body = new URLSearchParams({ access_token: token, method: 'GET' });
  for (const [k, v] of Object.entries(params)) if (v != null) body.set(k, String(v));
  const res = await fetch(GRAPH + path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const j = await res.json().catch(() => ({}));
  if (j && j.error) throw graphError(j.error);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return j;
}

/* Коди, за якими зупинятись, а не довбати далі: ліміт застосунку,
   ліміт кабінета, «спробуйте пізніше». Далі по списку буде те саме, а
   Facebook рахує навіть відмовлені запити. */
const THROTTLE = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80014]);

class GraphError extends Error {
  code: number; sub: number; throttled: boolean;
  constructor(msg: string, code: number, sub: number) {
    super(msg);
    this.code = code; this.sub = sub;
    this.throttled = THROTTLE.has(code);
  }
}

function graphError(e: Json): GraphError {
  const code = Number(e?.code || 0);
  const msg = String(e?.error_user_msg || e?.message || 'Graph API error');
  return new GraphError(msg, code, Number(e?.error_subcode || 0));
}

/* Пакетний запит. Відповідь — масив у тому самому порядку, що й
   запити; кожен елемент має власний код, і одна невдача не валить
   решти. null трапляється, коли Graph не встиг цей підзапит. */
async function graphBatch(token: string, urls: string[]): Promise<(Json | null)[]> {
  const batch = urls.map(u => ({ method: 'GET', relative_url: u }));
  const res = await fetch(GRAPH + '/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: token, include_headers: 'false', batch: JSON.stringify(batch)
    }).toString()
  });
  const j = await res.json().catch(() => null);
  // Помилка на рівні всього пакета (протух токен, ліміт) приходить не
  // масивом, а звичайним {error:…}.
  if (j && !Array.isArray(j) && j.error) throw graphError(j.error);
  if (!Array.isArray(j)) throw new Error('batch: unexpected response');
  return j.map((part: Json | null) => {
    if (!part) return null;
    let body: Json = {};
    try { body = JSON.parse(part.body || '{}'); } catch (_e) { body = {}; }
    return { code: Number(part.code || 0), body };
  });
}

/* ── словник Facebook → наш ──
   Їхній перелік поповнюється, тож незнайоме число не ховаємо за
   «unknown», а лишаємо в status_code як є. */
function statusWord(code: number): string {
  switch (code) {
    case 1:   return 'active';
    case 2:   return 'banned';       // DISABLED
    case 3:   return 'unsettled';    // UNSETTLED — не оплачено
    case 7:   return 'review';       // PENDING_RISK_REVIEW
    case 8:   return 'unsettled';    // PENDING_SETTLEMENT
    case 9:   return 'grace';        // IN_GRACE_PERIOD
    case 100: return 'closing';      // PENDING_CLOSURE
    case 101: return 'closed';
    default:  return 'unknown';
  }
}

const REASONS: Record<number, string> = {
  0: '', 1: 'Ads integrity policy', 2: 'IP review', 3: 'Risk payment',
  4: 'Gray account shut down', 5: 'AFC review', 6: 'Business integrity review',
  7: 'Permanently closed', 8: 'Unused reseller account', 9: 'Unused account',
  10: 'Umbrella ad account', 11: 'Business Manager integrity policy',
  12: 'Misrepresentation', 13: 'Custom audience TOS', 14: 'Unfulfilled ads policy',
  15: 'Unused reseller account', 16: 'Unused account', 17: 'Business integrity RAR'
};

function disableReason(v: unknown): string {
  if (v == null || v === '') return '';
  // Залежно від версії Graph це або число, або вже слово.
  const n = Number(v);
  if (Number.isFinite(n)) return REASONS[n] ?? ('Reason ' + n);
  return String(v).replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
}

/* Гроші Facebook віддає в мінімальних одиницях валюти — центах. Ділимо
   тут, щоб у базі лежали нормальні гроші, а не число, яке всі забудуть
   поділити. Порожнє лишаємо порожнім: 0 і «невідомо» — різні речі. */
function cents(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n / 100 : null;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ── крок 1: які взагалі є кабінети ──
   Сторінкуємо курсором, а не адресою з paging.next: та несе в собі
   токен, і ганяти його по рядках запиту — рівно те, чого ми уникаємо. */
const ACC_FIELDS = [
  'account_id', 'name', 'account_status', 'disable_reason', 'currency',
  'timezone_name', 'amount_spent', 'spend_cap', 'balance',
  'funding_source_details', 'business{id,name}'
].join(',');

async function listAccounts(token: string): Promise<Json[]> {
  const out: Json[] = [];
  let after = '';
  for (let page = 0; page < 20; page++) {
    const params: Json = { fields: ACC_FIELDS, limit: 100 };
    if (after) params.after = after;
    const j = await graph('/me/adaccounts', token, params);
    const rows = Array.isArray(j.data) ? j.data : [];
    out.push(...rows);
    after = j?.paging?.cursors?.after || '';
    if (!after || rows.length < 100) break;
  }
  return out;
}

/* ── крок 2: що всередині кожного кабінета ──

   Чотири підзапити на кабінет:
     1. сьогоднішні витрати + скільки всього кампаній/адсетів/оголошень
        (розгортання полів дає все це одним запитом);
     2-4. скільки з них ЗАРАЗ крутиться.

   summary=total_count з limit=0 — саме те, що треба: число без
   вивантаження самих обʼєктів. Інакше кабінет на дві тисячі оголошень
   з'їв би весь ліміт часу на самому лише підрахунку.

   date_preset=today рахується в часовому поясі САМОГО КАБІНЕТА, а не
   вашому. Зводити це до локального часу означало б показувати число,
   якого немає в жодному звіті Facebook. */
const INNER = 'insights.date_preset(today){spend,impressions,clicks}'
  + ',campaigns.limit(0).summary(total_count)'
  + ',adsets.limit(0).summary(total_count)'
  + ',ads.limit(0).summary(total_count)';

function urlsFor(actId: string): string[] {
  const act = 'act_' + actId;
  const live = (edge: string) => act + '/' + edge + '?limit=0&summary=total_count'
    + '&effective_status=' + encodeURIComponent('["ACTIVE"]');
  return [
    act + '?fields=' + encodeURIComponent(INNER),
    live('campaigns'), live('adsets'), live('ads')
  ];
}

const total = (o: Json | null | undefined): number | null =>
  o && o.summary && o.summary.total_count != null ? Number(o.summary.total_count) : null;

/* Одна відповідь пакета → одне поле. Помилку саме по цьому кабінету
   повертаємо окремо: решта полів має лишитись з минулого разу, а не
   обнулитись через те, що Facebook не віддав інсайти. */
function readParts(parts: (Json | null)[]): { patch: Json; err: string } {
  const patch: Json = {};
  let err = '';

  const p0 = parts[0];
  if (p0 && p0.code === 200) {
    const b = p0.body || {};
    const ins = (b.insights?.data || [])[0] || {};
    patch.spend_today = num(ins.spend);
    patch.impressions_today = num(ins.impressions);
    patch.clicks_today = num(ins.clicks);
    patch.campaigns = total(b.campaigns);
    patch.adsets = total(b.adsets);
    patch.ads = total(b.ads);
  } else if (p0) {
    err = String(p0.body?.error?.message || 'HTTP ' + p0.code);
  } else {
    err = 'Facebook did not answer in time';
  }

  const live = ['campaigns_active', 'adsets_active', 'ads_active'];
  live.forEach((key, i) => {
    const p = parts[i + 1];
    if (p && p.code === 200) patch[key] = total(p.body);
    else if (!err && p) err = String(p.body?.error?.message || 'HTTP ' + p.code);
  });

  return { patch, err };
}

/* ── PostgREST ──
   Звичайний HTTP, як і в check-domains: supabase-js під капотом робить
   рівно те саме, а бібліотека заради трьох запитів — зайва вага й
   зайвий ризик на старті. */
async function pgGet(base: string, hdr: Json, path: string): Promise<Json[]> {
  const res = await fetch(base + '/rest/v1/' + path, { headers: hdr });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
  return await res.json();
}

async function pgUpsert(base: string, hdr: Json, table: string,
                        onConflict: string, rows: Json[]): Promise<void> {
  if (!rows.length) return;
  const res = await fetch(base + '/rest/v1/' + table + '?on_conflict=' + onConflict, {
    method: 'POST',
    headers: { ...hdr, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
}

/* ── журнал змін ──
   У дашборді вже є стрічка «що сталося з кабінетами» (account_events).
   Вона писалась зі сторінки й лише про те, що видно з daily_stats —
   тобто із запізненням на день і тільки про гроші. Стан із Facebook
   лягає в ту саму стрічку, щоб не заводити другу.

   Словник стрічки скромніший за перелік Facebook, тому зводимо:
   active → running, banned → banned, решта негаразду → issue.
   Подробиця не губиться — вона йде в note.

   Таблиці може не бути, RLS може не пустити. Це не причина завалити
   імпорт: журнал — надбудова, а не його суть. */
const EV_WORD: Record<string, string> = {
  active: 'running', banned: 'banned', closed: 'banned', closing: 'banned',
  unsettled: 'issue', review: 'issue', grace: 'issue', unknown: 'issue'
};

async function noteChanges(base: string, hdr: Json, team: string,
                           changes: { account_id: string; from: string; to: string; note: string }[]) {
  if (!changes.length || !team) return;
  try {
    await fetch(base + '/rest/v1/account_events', {
      method: 'POST',
      headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify(changes.map(c => ({
        team_name: team, account_id: c.account_id, kind: 'state',
        from_state: c.from ? (EV_WORD[c.from] || 'issue') : null,
        to_state: EV_WORD[c.to] || 'issue',
        note: c.note, source: 'fb'
      })))
    });
  } catch (_e) { /* стрічка — надбудова */ }
}

/* ── один токен ── */
type TokenRow = { id: number; label: string; token: string;
                  created_by: string; team_name: string | null };

type Outcome = { accounts: number; failed: number; changed: number;
                 error: string; throttled: boolean };

async function syncToken(base: string, hdr: Json, t: TokenRow,
                         deadline: number): Promise<Outcome> {
  const out: Outcome = { accounts: 0, failed: 0, changed: 0, error: '', throttled: false };

  let accs: Json[];
  try {
    accs = await listAccounts(t.token);
  } catch (e) {
    const g = e as GraphError;
    out.error = g.message;
    out.throttled = !!g.throttled;
    // Токен протух або його відкликали — це стан самого токена, і його
    // місце у fb_tokens, поруч із рештою діагностики. Інакше людина
    // бачила б порожній список кабінетів і гадала чому.
    await markToken(base, hdr, t.id, g.code === 190 ? 'expired' : 'error', g.message);
    return out;
  }

  out.accounts = accs.length;
  if (!accs.length) {
    await markToken(base, hdr, t.id, 'no-accounts',
      'No ad account is visible — check Add Assets on the system user');
    return out;
  }

  // Що ми знали про ці кабінети до цього прогону — щоб помітити зміну
  // стану. Одним запитом на токен, а не по рядку.
  const known = new Map<string, string>();
  try {
    const prev = await pgGet(base, hdr,
      'fb_accounts?select=account_id,status&created_by=eq.' + encodeURIComponent(t.created_by));
    prev.forEach((r: Json) => known.set(String(r.account_id), String(r.status || '')));
  } catch (_e) { /* перший прогін: знати нічого */ }

  const now = new Date().toISOString();
  const rows: Json[] = [];
  const changes: { account_id: string; from: string; to: string; note: string }[] = [];

  // Основа рядка — з того, що вже приїхало списком: стан, картка,
  // валюта. Навіть якщо пакетні запити нижче впадуть, це вже збережеться.
  const base_ = accs.map(a => {
    const id = String(a.account_id || String(a.id || '').replace(/^act_/, ''));
    const code = Number(a.account_status || 0);
    const fsd = a.funding_source_details || {};
    return {
      id,
      row: {
        created_by: t.created_by, team_name: t.team_name, token_id: t.id,
        account_id: id, name: a.name || null,
        status: statusWord(code), status_code: code || null,
        disable_reason: disableReason(a.disable_reason) || null,
        currency: a.currency || null, timezone_name: a.timezone_name || null,
        business_id: a.business?.id || null, business_name: a.business?.name || null,
        card: fsd.display_string || null, card_type: fsd.type || null,
        amount_spent: cents(a.amount_spent), spend_cap: cents(a.spend_cap),
        balance: cents(a.balance),
        sync_error: null, synced_at: now
      } as Json
    };
  });

  for (let i = 0; i < base_.length; i += BATCH_MAX / PER_ACC) {
    if (Date.now() > deadline) { out.error = out.error || 'ran out of time'; break; }
    const slice = base_.slice(i, i + BATCH_MAX / PER_ACC);
    let parts: (Json | null)[];
    try {
      parts = await graphBatch(t.token, slice.flatMap(x => urlsFor(x.id)));
    } catch (e) {
      const g = e as GraphError;
      out.error = g.message;
      out.throttled = !!g.throttled;
      // Пакет не пройшов цілком — але те, що вже є списком, зберегти
      // варто: стан кабінета важливіший за кількість адсетів.
      slice.forEach(x => { x.row.sync_error = g.message; rows.push(x.row); });
      break;
    }
    slice.forEach((x, k) => {
      const { patch, err } = readParts(parts.slice(k * PER_ACC, (k + 1) * PER_ACC));
      Object.assign(x.row, patch);
      if (err) { x.row.sync_error = err; out.failed++; }
      rows.push(x.row);
    });
  }

  // Кабінети, до яких не дійшли черги (дедлайн або зірваний пакет), усе
  // одно записуємо: стан і картка в них уже є.
  base_.forEach(x => { if (!rows.includes(x.row)) rows.push(x.row); });

  rows.forEach(r => {
    const was = known.get(String(r.account_id));
    if (was !== undefined && was !== r.status) {
      out.changed++;
      changes.push({ account_id: String(r.account_id), from: was, to: String(r.status),
                     note: [r.name, r.disable_reason].filter(Boolean).join(' · ') });
    }
  });

  await pgUpsert(base, hdr, 'fb_accounts', 'created_by,account_id', rows);
  await noteChanges(base, hdr, t.team_name || '', changes);
  await markToken(base, hdr, t.id, 'ok', `Sees ${accs.length} ad account(s)`);
  return out;
}

/* Стан самого токена тримаємо свіжим: саме сюди дивляться, коли імпорт
   раптом привіз порожнечу. */
async function markToken(base: string, hdr: Json, id: number,
                         status: string, note: string): Promise<void> {
  try {
    await fetch(base + '/rest/v1/fb_tokens?id=eq.' + id, {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ status, status_note: note, checked_at: new Date().toISOString() })
    });
  } catch (_e) { /* не привід валити імпорт */ }
}

/* ── вхід ── */
Deno.serve(async (req) => {
  // OPTIONS — найперше й без жодних умов: без CORS-заголовків на
  // preflight браузер не покаже навіть тексту помилки.
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

  /* Ключ сервісної ролі тут потрібен завжди — без нього не прочитати
     fb_tokens.token, а він навмисно закритий навіть від власника.
     Тому межі ставить не ключ, а перевірений uid того, хто покликав. */
  if (!svc) return reply({
    error: 'SERVICE_ROLE_KEY is not set in the function secrets' }, 400);
  const hdr: Json = { apikey: svc, Authorization: 'Bearer ' + svc,
                      'content-type': 'application/json' };

  let onlyOwner = '';
  let cron = false;
  let onlyToken = 0;

  const cronKey = req.headers.get('x-cron-key') || '';
  if (cronKey) {
    const want = Deno.env.get('CRON_SECRET') || '';
    if (!want) return reply({ error: 'scheduled run is not configured: set CRON_SECRET' }, 400);
    if (!sameSecret(cronKey, want)) return reply({ error: 'bad cron key' }, 401);
    cron = true;
  } else {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return reply({ error: 'no authorization header' }, 401);
    onlyOwner = await whoAmI(base, anon, auth);
    if (!onlyOwner) return reply({ error: 'could not verify who is calling' }, 401);
  }

  try {
    const body = await req.json();
    onlyToken = Number(body?.token_id || 0) || 0;
  } catch (_e) { /* тіла може не бути */ }

  let q = 'fb_tokens?select=id,label,token,created_by,team_name&order=id.asc';
  if (onlyOwner) q += '&created_by=eq.' + encodeURIComponent(onlyOwner);
  if (onlyToken) q += '&id=eq.' + onlyToken;

  let tokens: TokenRow[];
  try {
    tokens = await pgGet(base, hdr, q) as TokenRow[];
  } catch (e) {
    const msg = (e as Error).message;
    return reply({ error: /fb_tokens|does not exist/i.test(msg)
      ? 'token storage does not exist yet — run FB_TOKENS.sql' : msg }, 500);
  }

  if (!tokens.length) return reply({ cron, tokens: 0, accounts: 0, changed: 0,
    note: 'no tokens to sync' });

  const deadline = Date.now() + DEADLINE_MS;
  let accounts = 0, failed = 0, changed = 0, done = 0;
  const problems: string[] = [];
  let throttled = false;

  for (const t of tokens) {
    if (Date.now() > deadline) break;
    let r: Outcome;
    try {
      r = await syncToken(base, hdr, t, deadline);
    } catch (e) {
      // Один поганий токен не мусить зупиняти решту: у людини їх
      // десяток, і зупинятись на першому — найгірше з можливого.
      problems.push(t.label + ': ' + (e as Error).message);
      continue;
    }
    done++;
    accounts += r.accounts; failed += r.failed; changed += r.changed;
    if (r.error) problems.push(t.label + ': ' + r.error);
    if (r.throttled) {
      // Ліміт Facebook рахує навіть відмовлені запити. Далі по списку
      // буде те саме — краще вийти й доробити наступною годиною.
      throttled = true;
      break;
    }
  }

  return reply({
    cron, tokens: done, accounts, failed, changed, throttled,
    more: done < tokens.length,
    problems: problems.slice(0, 10)
  });
}
