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
type Row = { id: number; domain: string; team_name: string };

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

const THREATS = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'];

// Web Risk: один GET на домен. Пакетного варіанта в Lookup API немає,
// тож женемо пулом, як і самі перевірки доменів.
async function flaggedWebRisk(domains: string[], key: string): Promise<Set<string>> {
  const out = new Set<string>();
  const qs = THREATS.map(t => 'threatTypes=' + t).join('&');
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

async function handle(req: Request): Promise<Response> {

  const auth = req.headers.get('Authorization') || '';
  if (!auth) return new Response(JSON.stringify({ error: 'no authorization header' }),
    { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });

  const base = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  // apikey + Authorization — те саме, що надсилає supabase-js. RLS
  // рахується від Authorization, тобто від того, хто викликав.
  const hdr = { apikey: anon, Authorization: auth, 'content-type': 'application/json' };

  let team = '';
  let only: string[] | null = null;
  let after = 0;
  try {
    const body = await req.json();
    team = String(body?.team || '');
    // Курсор. Без нього кожен наступний виклик повертав би ті самі перші
    // BATCH рядків, і дашборд ганяв би одну порцію по колу, так і не
    // дійшовши до решти списку.
    after = Number(body?.after || 0) || 0;
    if (Array.isArray(body?.domains) && body.domains.length) only = body.domains.map(String);
  } catch (_e) { /* тіла може не бути */ }

  const qs = new URLSearchParams();
  qs.set('select', 'id,domain,team_name');
  qs.set('order', 'id.asc');
  qs.set('limit', String(BATCH + 1));
  if (team) qs.set('team_name', 'eq.' + team);
  if (after) qs.set('id', 'gt.' + after);
  if (only) qs.set('domain', 'in.(' + only.map(d => '"' + d.replace(/"/g, '') + '"').join(',') + ')');

  let data: Row[] = [];
  try {
    const res = await fetch(base + '/rest/v1/domains?' + qs.toString(), { headers: hdr });
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: 'select failed: ' + res.status + ' ' + text }),
        { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });
    }
    data = await res.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'select failed: ' + (e as Error).message }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
  }

  const rows = (data || []).slice(0, BATCH);
  const more = (data || []).length > BATCH;
  if (!rows.length) return new Response(JSON.stringify({ checked: 0, more: false, results: [] }),
    { headers: { ...CORS, 'content-type': 'application/json' } });

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
  const bad = wrKey ? await flaggedWebRisk(names, wrKey)
            : sbKey ? await flaggedSafeBrowsing(names, sbKey)
            : new Set<string>();
  const source = wrKey ? 'web-risk' : sbKey ? 'safe-browsing' : 'none';

  const at = new Date().toISOString();
  const results = rows.map(r => {
    const v = verdicts.get(r.id)!;
    // Мітка Google важливіша за код відповіді: домен у списку віддає
    // звичайні 200, і саме тому його самому не помітити.
    const status = bad.has(r.domain) ? 'danger' : v.status;
    return { id: r.id, domain: r.domain, status, status_code: v.status_code,
             source: 'server', checked_at: at };
  });

  // По одному PATCH на рядок: upsert писав би й ті колонки, яких ми не
  // читали, і затирав би PWA з нотатками порожнечею.
  await Promise.all(results.map(r =>
    fetch(base + '/rest/v1/domains?id=eq.' + encodeURIComponent(String(r.id)), {
      method: 'PATCH',
      headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: r.status, status_code: r.status_code,
                             source: 'server', checked_at: at })
    }).catch(() => null)));

  return new Response(JSON.stringify({
    checked: results.length, more, flags: source,
    // Звідки продовжувати наступним викликом.
    next: rows[rows.length - 1].id,
    results
  }), { headers: { ...CORS, 'content-type': 'application/json' } });
}
