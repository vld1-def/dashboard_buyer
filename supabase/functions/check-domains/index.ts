/* ═══════════ ПЕРЕВІРКА ДОМЕНІВ ═══════════
   Те, чого не може дашборд. Сторінка бачить лише «відповів / не
   відповів»: CORS не дає прочитати чужу відповідь, а no-cors повертає
   статус 0 і для 200, і для 404. Тут запит іде з сервера, де ніякого
   CORS немає, — звідси справжній код відповіді.

   Що робить:
     1. бере домени команди (через RLS — тільки ті, що належать тому,
        хто викликав);
     2. HEAD, а якщо сервер його не розуміє — GET;
     3. якщо є ключ — питає Google, чи домен не в чорному списку;
     4. пише статус назад.

   ЖОДНИХ ІМПОРТІВ. Раніше тут був supabase-js через jsr:. Бібліотека
   для двох запитів — зайва вага, а головне: якщо імпорт не розвʼяжеться,
   функція падає ще до запуску. Тоді шлюз віддає помилку БЕЗ CORS-
   заголовків, і браузер показує голе «Failed to fetch» — навіть коли з
   самим кодом усе гаразд. Діагностувати таке ззовні майже неможливо.

   PostgREST — це звичайний HTTP, і supabase-js під капотом робить рівно
   те саме: GET на /rest/v1/<таблиця> і PATCH з фільтром. RLS працює від
   заголовка Authorization, тобто від того, хто викликав.

   Розгортання: Supabase → Edge Functions → check-domains, або
     supabase functions deploy check-domains

   Ключ сервісної ролі тут свідомо НЕ використовується: інакше будь-хто,
   хто докличеться до функції, отримав би доступ до чужих рядків. */

const TIMEOUT = 10_000;
const POOL = 8;
// Скільки доменів за один виклик. Edge Function має ліміт часу, і
// краще чесно повернути «є ще» і дати дашборду попросити наступну
// порцію, ніж обірватись посеред роботи, нічого не записавши.
const BATCH = 200;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type Verdict = { status: string; status_code: number | null };
type Row = { id: number; domain: string; team_name: string; status: string | null };

async function probe(domain: string): Promise<Verdict> {
  for (const method of ['HEAD', 'GET'] as const) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const res = await fetch('https://' + domain + '/', {
        method, redirect: 'follow', signal: ctl.signal,
        // Без цього частина хостингів віддає 403 просто через порожній UA.
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; domain-check/1.0)' }
      });
      // 405 на HEAD — сервер просто не вміє цей метод, це не діагноз.
      // Пробуємо GET, перш ніж записати домен у проблемні.
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) continue;
      return {
        status: res.status >= 200 && res.status < 400 ? 'ok'
              : res.status === 404 ? 'notfound'
              : res.status >= 500 ? 'down'
              : 'notfound',           // 4xx: 403, 410 — домен живий, але не віддає
        status_code: res.status
      };
    } catch (_e) {
      // DNS, сертифікат, відкинуте з'єднання, таймаут — з HTTP не
      // розрізняються, і для нас це однаково «не відповідає».
      if (method === 'GET') return { status: 'down', status_code: null };
    } finally { clearTimeout(t); }
  }
  return { status: 'down', status_code: null };
}

/* ── Чи домен у чорному списку Google ──

   Два різні продукти на тій самій базі:

   Web Risk (webrisk.googleapis.com) — комерційний. Безкоштовний обсяг
   плюс оплата за перевищення. Саме його вимагають умови Google для
   використання «for sale or revenue-generating purposes», тобто для
   нашого випадку.

   Safe Browsing v4 (safebrowsing.googleapis.com) — безкоштовний, але
   тільки для некомерційного використання. Лишаємо як запасний варіант,
   бо код уже написаний і комусь підійде.

   Якщо є обидва ключі — беремо Web Risk.

   ВАЖЛИВО ПРО СХЕМУ. Раніше тут надсилались і http, і https «про всяк
   випадок». Це було зайве: під час канонізації Google відкидає схему,
   логін, пароль і порт — збіг шукається лише за хостом і шляхом. Тому
   достатньо одного запису на домен. */

/* SOCIAL_ENGINEERING_EXTENDED_COVERAGE — окремий список Google саме під
   фішинг і сайти-обманки. За їхніми ж словами, він піднімає покриття
   таких сторінок «до 90% у деяких випадках». Без нього домен, на якому
   Chrome малює червоний екран «Небезпечний сайт», цілком може не
   знайтись у звичайному SOCIAL_ENGINEERING.

   У Safe Browsing v4 такого типу немає — там натомість
   POTENTIALLY_HARMFUL_APPLICATION, він додається нижче окремо. */
const THREATS = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'];
const THREATS_WR = THREATS.concat('SOCIAL_ENGINEERING_EXTENDED_COVERAGE');

// Web Risk: один GET на домен. Пакетного варіанта в Lookup API немає,
// тож женемо пулом, як і самі перевірки доменів.
async function flaggedWebRisk(domains: string[], key: string): Promise<Set<string>> {
  const out = new Set<string>();
  const qs = THREATS_WR.map(t => 'threatTypes=' + t).join('&');
  const queue = domains.slice();
  const worker = async () => {
    for (;;) {
      const d = queue.shift();
      if (!d) return;
      try {
        const url = 'https://webrisk.googleapis.com/v1/uris:search?' + qs
          + '&uri=' + encodeURIComponent('http://' + d + '/')
          + '&key=' + encodeURIComponent(key);
        const res = await fetch(url);
        if (!res.ok) continue;
        const j = await res.json();
        // Порожній обʼєкт у відповіді означає «збігів немає».
        if (j && j.threat) out.add(d);
      } catch (_e) { /* мітки — бонус, а не причина завалити перевірку */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, worker));
  return out;
}

// Safe Browsing v4: пакетно, до 500 записів за запит.
async function flaggedSafeBrowsing(domains: string[], key: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < domains.length; i += 450) {
    const chunk = domains.slice(i, i + 450);
    try {
      const res = await fetch(
        'https://safebrowsing.googleapis.com/v4/threatMatches:find?key=' + encodeURIComponent(key),
        { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client: { clientId: 'dashboard-buyer', clientVersion: '1.0' },
            threatInfo: {
              threatTypes: THREATS.concat('POTENTIALLY_HARMFUL_APPLICATION'),
              platformTypes: ['ANY_PLATFORM'],
              threatEntryTypes: ['URL'],
              threatEntries: chunk.map(d => ({ url: 'http://' + d + '/' }))
            }
          }) });
      if (!res.ok) continue;
      const j = await res.json();
      (j.matches || []).forEach((m: { threat?: { url?: string } }) => {
        const u = String(m?.threat?.url || '');
        const host = u.replace(/^[a-z]+:\/\//, '').split('/')[0];
        if (host) out.add(host.replace(/^www\./, ''));
      });
    } catch (_e) { /* те саме */ }
  }
  return out;
}

/* ── Другий і третій погляд: фільтрувальні DNS ──

   Web Risk — це думка Google, і тільки Google. Ми вже бачили, що домен
   із червоним екраном у Chrome може не знайтись у його ж Lookup API.
   Тому питаємо ще два джерела, які нічого не коштують і не мають ні
   квот, ні ліцензійних обмежень на комерційне використання.

   Прийом простий: резолвимо домен ДВІЧІ — через звичайний резолвер і
   через той, що фільтрує шкідливе. Різниця у відповідях і є вироком.

     1.1.1.1  (cloudflare-dns.com)           — без фільтра, це контроль
     1.1.1.2  (security.cloudflare-dns.com)  — блокує malware і фішинг,
                                               віддаючи 0.0.0.0
     9.9.9.9  (dns.quad9.net)                — блокує, віддаючи NXDOMAIN
                                               (Status 3)

   Домен, який контроль резолвить, а фільтр — ні, лежить у чиємусь
   списку загроз. Чий саме — записуємо, щоб було видно, хто сказав.

   Чому це варте свічок: Cloudflare і Quad9 збирають дані з десятків
   фідів (не лише від Google), тож разом вони бачать помітно більше.
   А коштує це рівно нічого. */

type Dns = { blocked: boolean; resolved: boolean };

async function doh(url: string, domain: string): Promise<Dns> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(url + '?name=' + encodeURIComponent(domain) + '&type=A',
      { headers: { accept: 'application/dns-json' }, signal: ctl.signal });
    if (!res.ok) return { blocked: false, resolved: false };
    const j = await res.json();
    const ans: { data?: string }[] = j.Answer || [];
    const ips = ans.map(a => String(a.data || '')).filter(x => /^\d+\.\d+\.\d+\.\d+$/.test(x));
    // NXDOMAIN (3) або відповідь 0.0.0.0 — це «заблоковано».
    const nx = j.Status === 3;
    const sink = ips.length > 0 && ips.every(ip => ip === '0.0.0.0');
    return { blocked: nx || sink, resolved: ips.some(ip => ip !== '0.0.0.0') };
  } catch (_e) {
    return { blocked: false, resolved: false };
  } finally { clearTimeout(t); }
}

// Повертає домен → хто його позначив.
async function flaggedByDns(domains: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const queue = domains.slice();
  const worker = async () => {
    for (;;) {
      const d = queue.shift();
      if (!d) return;
      const [plain, cf, q9] = await Promise.all([
        doh('https://cloudflare-dns.com/dns-query', d),
        doh('https://security.cloudflare-dns.com/dns-query', d),
        doh('https://dns.quad9.net/dns-query', d)
      ]);
      // Якщо навіть звичайний резолвер домен не знає — він просто
      // мертвий, а не позначений. Мовчання фільтра тут нічого не значить.
      if (!plain.resolved) continue;
      const by: string[] = [];
      if (cf.blocked) by.push('cloudflare');
      if (q9.blocked) by.push('quad9');
      if (by.length) out.set(d, by);
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, worker));
  return out;
}

Deno.serve(async (req) => {
  // OPTIONS — найперше й без жодних умов: це preflight, і якщо на нього
  // не відповісти CORS-заголовками, браузер не покаже навіть тексту
  // помилки, лише «Failed to fetch».
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });
  try {
    return await handle(req);
  } catch (e) {
    // Будь-яка несподівана помилка теж має приїхати з CORS-заголовками,
    // інакше в браузері вона виглядає як відсутність звʼязку.
    return new Response(JSON.stringify({ error: 'unhandled: ' + (e as Error).message }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
  }
});

/* Спільний секрет звіряємо по всій довжині, а не до першої розбіжності.
   Дешево, і знімає цілий клас питань до коду. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Скільки запитів Web Risk витрачено — пишемо в team_settings, поруч із
   рештою налаштувань команди. Окрема таблиця заради одного числа не
   потрібна, а так дашборд читає його тим самим getTeamSetting.

   Робить це лише нічний прогін: він іде від сервісної ролі, і RLS йому
   не завада. Ручну перевірку рахує сама сторінка — там запис іде від
   людини, і вигадувати їй created_by у функції було б зайвим ризиком. */
async function noteSpend(base: string, hdr: Record<string, string>,
                         byTeam: Map<string, number>): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  for (const [team, n] of byTeam) {
    if (!n || !team) continue;
    try {
      const res = await fetch(base + '/rest/v1/team_settings?select=value'
        + '&team_name=eq.' + encodeURIComponent(team) + '&key=eq.wr_usage', { headers: hdr });
      let cur: Record<string, number> = {};
      if (res.ok) {
        const rows = await res.json();
        try { cur = JSON.parse(rows?.[0]?.value || '{}') || {}; } catch (_e) { cur = {}; }
      }
      cur[month] = (cur[month] || 0) + n;
      // Пів року історії — досить, щоб побачити, чи витрати ростуть.
      const keep = Object.keys(cur).sort().slice(-6);
      const trimmed: Record<string, number> = {};
      keep.forEach(k => trimmed[k] = cur[k]);
      await fetch(base + '/rest/v1/team_settings', {
        method: 'POST',
        headers: { ...hdr, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ team_name: team, key: 'wr_usage', value: JSON.stringify(trimmed) })
      });
    } catch (_e) { /* лічильник — не причина завалити перевірку */ }
  }
}

type Batch = {
  error?: string; status?: number;
  checked: number; more: boolean; next: number; flags: string; spent: number;
  results: Result[]; changed: Change[]; byTeam: Map<string, number>;
};
type Result = { id: number; domain: string; status: string; status_code: number | null;
                flagged_by: string | null; source: string; checked_at: string };
type Change = { domain: string; team: string; from: string; to: string; flagged_by: string | null };

/* Одна порція. Винесено окремо, бо викликати її треба двома різними
   способами: сторінка просить по одній і сама веде курсор (так видно
   поступ), нічний прогін крутить їх поспіль до кінця списку. */
async function runBatch(base: string, hdr: Record<string, string>,
                        o: { team: string; only: string[] | null; after: number; force: boolean }
                       ): Promise<Batch> {
  const empty = { checked: 0, more: false, next: o.after, flags: '', spent: 0,
                  results: [] as Result[], changed: [] as Change[], byTeam: new Map<string, number>() };

  const qs = new URLSearchParams();
  // status потрібен не для фільтра, а щоб знати, що саме змінилось:
  // нічний прогін має доповідати про зміни, а не про весь список.
  qs.set('select', 'id,domain,team_name,status');
  qs.set('order', 'id.asc');
  qs.set('limit', String(BATCH + 1));
  if (o.team) qs.set('team_name', 'eq.' + o.team);
  if (o.after) qs.set('id', 'gt.' + o.after);
  if (o.only) qs.set('domain', 'in.(' + o.only.map(d => '"' + d.replace(/"/g, '') + '"').join(',') + ')');
  // Явний список доменів — це теж свідомий вибір, тож фільтр не вмикаємо.
  if (!o.force && !o.only) qs.set('status', 'neq.danger');

  let data: Row[] = [];
  try {
    const res = await fetch(base + '/rest/v1/domains?' + qs.toString(), { headers: hdr });
    if (!res.ok) return { ...empty, error: 'select failed: ' + res.status + ' ' + (await res.text()), status: 400 };
    data = await res.json();
  } catch (e) {
    return { ...empty, error: 'select failed: ' + (e as Error).message, status: 500 };
  }

  const rows = data.slice(0, BATCH);
  const more = data.length > BATCH;
  if (!rows.length) return empty;

  const verdicts = new Map<number, Verdict>();
  const queue = rows.slice();
  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      verdicts.set(row.id, await probe(row.domain));
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, worker));

  // Web Risk має перевагу: він — комерційний варіант, і саме його
  // вимагають умови Google, якщо перевірка обслуговує бізнес.
  const wrKey = Deno.env.get('WEB_RISK_KEY') || '';
  const sbKey = Deno.env.get('SAFE_BROWSING_KEY') || '';
  const names = rows.map(r => r.domain);
  // Google і DNS питаємо паралельно — вони незалежні, і чекати одне на
  // одного нема сенсу.
  const [bad, dns] = await Promise.all([
    wrKey ? flaggedWebRisk(names, wrKey)
          : sbKey ? flaggedSafeBrowsing(names, sbKey)
          : Promise.resolve(new Set<string>()),
    flaggedByDns(names)
  ]);
  const google = wrKey ? 'web-risk' : sbKey ? 'safe-browsing' : '';
  const flags = [google, 'dns'].filter(Boolean).join('+');

  const at = new Date().toISOString();
  const changed: Change[] = [];
  const results: Result[] = rows.map(r => {
    const v = verdicts.get(r.id)!;
    // Хто саме сказав «погано». Домен у чорному списку віддає звичайні
    // 200, тому мітка завжди важливіша за код відповіді.
    const by = (bad.has(r.domain) ? [google || 'blacklist'] : []).concat(dns.get(r.domain) || []);
    const status = by.length ? 'danger' : v.status;
    const flagged_by = by.length ? by.join(', ') : null;
    const was = r.status || 'unknown';
    if (status !== was) changed.push({ domain: r.domain, team: r.team_name, from: was, to: status, flagged_by });
    return { id: r.id, domain: r.domain, status, status_code: v.status_code,
             flagged_by, source: 'server', checked_at: at };
  });

  // По одному PATCH на рядок: upsert писав би й ті колонки, яких ми не
  // читали, і затирав би PWA з нотатками порожнечею.
  await Promise.all(results.map(r =>
    fetch(base + '/rest/v1/domains?id=eq.' + encodeURIComponent(String(r.id)), {
      method: 'PATCH',
      headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: r.status, status_code: r.status_code,
                             flagged_by: r.flagged_by, source: 'server', checked_at: at })
    }).catch(() => null)));

  // Web Risk — рівно один запит на домен, тож перевірені домени і є
  // витрата. DNS безкоштовний і в рахунок не йде.
  const spent = google ? rows.length : 0;
  const byTeam = new Map<string, number>();
  if (spent) rows.forEach(r => byTeam.set(r.team_name, (byTeam.get(r.team_name) || 0) + 1));

  return { checked: results.length, more, next: rows[rows.length - 1].id,
           flags, spent, results, changed, byTeam };
}

async function handle(req: Request): Promise<Response> {

  const base = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;

  /* Два входи, і це не одне й те саме.

     Звичайний — зі сторінки. Заголовок Authorization несе токен людини,
     PostgREST рахує від нього RLS, і функція бачить рівно ті домени, що
     й вона сама. Ключ сервісної ролі тут свідомо НЕ використовується.

     Нічний — з розкладу. О пʼятій ранку ніхто не залогінений, токена
     взяти нізвідки, тож RLS від нього не порахуєш. Для цього окремий
     заголовок x-cron-key зі спільним секретом: звірили — і тільки тоді
     беремо ключ сервісної ролі й обходимо всі команди.

     Чому саме так, а не «покласти ключ сервісної ролі в розклад»: у
     розкладі лежить CRON_SECRET, який уміє рівно одне — запустити
     перевірку доменів. Ключ сервісної ролі вміє все й лишається в
     секретах функції. */
  const cronKey = req.headers.get('x-cron-key') || '';
  let hdr: Record<string, string>;
  let cron = false;

  if (cronKey) {
    const want = Deno.env.get('CRON_SECRET') || '';
    const svc = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!want || !svc) return new Response(JSON.stringify({
      error: 'scheduled run is not configured: set CRON_SECRET and SERVICE_ROLE_KEY in the function secrets' }),
      { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });
    if (!sameSecret(cronKey, want)) return new Response(JSON.stringify({ error: 'bad cron key' }),
      { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });
    cron = true;
    hdr = { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json' };
  } else {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return new Response(JSON.stringify({ error: 'no authorization header' }),
      { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });
    // apikey + Authorization — те саме, що надсилає supabase-js. RLS
    // рахується від Authorization, тобто від того, хто викликав.
    hdr = { apikey: anon, Authorization: auth, 'content-type': 'application/json' };
  }

  let team = '';
  let only: string[] | null = null;
  let after = 0;
  // Перевіряти домен, який уже позначений, — витрачати квоту Web Risk
  // намарно: мітку Google знімає рідко, а безкоштовних запитів 100 000
  // на місяць. Тому за замовчуванням такі пропускаємо. Перевірити
  // конкретний домен примусово можна, передавши force або список
  // domains — тоді це свідомий вибір, а не фоновий прогін.
  let force = false;
  try {
    const body = await req.json();
    team = String(body?.team || '');
    // Курсор. Без нього кожен наступний виклик повертав би ті самі перші
    // BATCH рядків, і дашборд ганяв би одну порцію по колу, так і не
    // дійшовши до решти списку.
    after = Number(body?.after || 0) || 0;
    force = body?.force === true;
    if (Array.isArray(body?.domains) && body.domains.length) only = body.domains.map(String);
  } catch (_e) { /* тіла може не бути */ }

  /* Нічний прогін крутить порції сам: розклад стріляє один раз, і
     лишити півсписка неперевіреним до завтра — гірше, ніж попрацювати
     хвилину. Дедлайн потрібен, бо в Edge Function час не нескінченний:
     упершись у нього, чесно віддаємо more і скільки встигли. */
  if (cron) {
    const deadline = Date.now() + 110_000;
    let checked = 0, flags = '', spent = 0, more = false;
    const changed: Change[] = [];
    const byTeam = new Map<string, number>();
    for (let pass = 0; pass < 200; pass++) {
      const b = await runBatch(base, hdr, { team, only, after, force });
      if (b.error) return new Response(JSON.stringify({ error: b.error }),
        { status: b.status || 500, headers: { ...CORS, 'content-type': 'application/json' } });
      checked += b.checked;
      spent += b.spent;
      flags = b.flags || flags;
      changed.push(...b.changed);
      b.byTeam.forEach((n, t) => byTeam.set(t, (byTeam.get(t) || 0) + n));
      after = b.next;
      more = b.more;
      if (!b.more || !b.checked) { more = false; break; }
      if (Date.now() > deadline) break;
    }
    await noteSpend(base, hdr, byTeam);
    /* Що змінилось — окремо від того, що перевірено. Саме це піде в
       Telegram, коли дійдуть руки: доповідати треба про нові проблеми,
       а не про те, що двісті доменів як працювали, так і працюють. */
    const worse = changed.filter(c => c.to === 'danger' || c.to === 'down' || c.to === 'notfound');
    return new Response(JSON.stringify({
      cron: true, checked, more, next: after, flags, spent,
      changed: changed.length, worse
    }), { headers: { ...CORS, 'content-type': 'application/json' } });
  }

  const b = await runBatch(base, hdr, { team, only, after, force });
  if (b.error) return new Response(JSON.stringify({ error: b.error }),
    { status: b.status || 500, headers: { ...CORS, 'content-type': 'application/json' } });

  return new Response(JSON.stringify({
    checked: b.checked, more: b.more, flags: b.flags,
    // Скільки запитів Web Risk коштувала ця порція. Сторінка веде
    // лічильник сама — писати team_settings від імені людини у функції
    // означало б вигадувати їй created_by.
    spent: b.spent,
    // Звідки продовжувати наступним викликом.
    next: b.next,
    results: b.results
  }), { headers: { ...CORS, 'content-type': 'application/json' } });
}
