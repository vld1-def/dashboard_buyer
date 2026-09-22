/* ═══════════ ПЕРЕВІРКА ДОМЕНІВ ═══════════
   Те, чого не може дашборд. Сторінка бачить лише «відповів / не
   відповів»: CORS не дає прочитати чужу відповідь, а no-cors повертає
   статус 0 і для 200, і для 404. Тут запит іде з сервера, де ніякого
   CORS немає, — звідси справжній код відповіді.

   Що робить:
     1. бере домени команди (через RLS — тільки ті, що належать тому,
        хто викликав);
     2. HEAD, а якщо сервер його не розуміє — GET;
     3. якщо є ключ Safe Browsing — питає Google, чи домен не в списку;
     4. пише статус назад.

   Розгортання:
     supabase functions deploy check-domains
     supabase secrets set SAFE_BROWSING_KEY=...     # не обов'язково

   Виклик із дашборда йде з токеном того, хто залогінений, тож функція
   працює від його імені й чужих доменів не бачить. Ключ сервісної ролі
   тут свідомо НЕ використовується: інакше будь-хто, хто докличеться до
   функції, отримав би доступ до чужих рядків. */

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

// Safe Browsing: до 500 записів за запит, тож ріжемо пачками.
async function flagged(domains: string[], key: string): Promise<Set<string>> {
  const out = new Set<string>();
  // 450 записів на запит — ліміт Google. Кожен домен дає два записи,
  // тож доменів у пачці вдвічі менше.
  for (let i = 0; i < domains.length; i += 240) {
    const chunk = domains.slice(i, i + 240);
    try {
      const res = await fetch(
        'https://safebrowsing.googleapis.com/v4/threatMatches:find?key=' + encodeURIComponent(key),
        { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client: { clientId: 'dashboard-buyer', clientVersion: '1.0' },
            threatInfo: {
              threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
              platformTypes: ['ANY_PLATFORM'],
              threatEntryTypes: ['URL'],
              // І http, і https: Google зберігає загрозу за конкретним URL,
              // і домен, позначений лише за однією схемою, за іншою може
              // не знайтись. Зайвий запис коштує нічого, пропущена мітка —
              // саме той випадок, заради якого все це й робиться.
              threatEntries: chunk.flatMap(d => [
                { url: 'http://' + d + '/' },
                { url: 'https://' + d + '/' }
              ])
            }
          }) });
      if (!res.ok) continue;
      const j = await res.json();
      (j.matches || []).forEach((m: { threat?: { url?: string } }) => {
        const u = String(m?.threat?.url || '');
        const host = u.replace(/^[a-z]+:\/\//, '').split('/')[0];
        if (host) out.add(host.replace(/^www\./, ''));
      });
    } catch (_e) { /* мітки — приємний бонус, а не причина завалити перевірку */ }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const auth = req.headers.get('Authorization') || '';
  if (!auth) return new Response(JSON.stringify({ error: 'no authorization header' }),
    { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });

  // Клієнт від імені того, хто викликав: RLS лишається в силі.
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } }
  );

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

  let q = sb.from('domains').select('id, domain, team_name').order('id', { ascending: true }).limit(BATCH + 1);
  if (team) q = q.eq('team_name', team);
  if (only) q = q.in('domain', only);
  if (after) q = q.gt('id', after);

  const { data, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }),
    { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });

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

  const key = Deno.env.get('SAFE_BROWSING_KEY') || '';
  const bad = key ? await flagged(rows.map(r => r.domain), key) : new Set<string>();

  const at = new Date().toISOString();
  const results = rows.map(r => {
    const v = verdicts.get(r.id)!;
    // Мітка Google важливіша за код відповіді: домен у списку віддає
    // звичайні 200, і саме тому його самому не помітити.
    const status = bad.has(r.domain) ? 'danger' : v.status;
    return { id: r.id, domain: r.domain, status, status_code: v.status_code,
             source: 'server', checked_at: at };
  });

  // По одному update на рядок: upsert тут писав би й ті колонки, яких
  // ми не читали, і затирав би PWA з нотатками порожнечею.
  await Promise.all(results.map(r =>
    sb.from('domains').update({
      status: r.status, status_code: r.status_code, source: 'server', checked_at: at
    }).eq('id', r.id)));

  return new Response(JSON.stringify({
    checked: results.length, more, safe_browsing: !!key,
    // Звідки продовжувати наступним викликом.
    next: rows[rows.length - 1].id,
    results
  }), { headers: { ...CORS, 'content-type': 'application/json' } });
});
