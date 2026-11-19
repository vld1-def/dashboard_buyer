/* ═══════════ WIDGET — СПЕНД ЗА СЬОГОДНІ ДЛЯ ВІДЖЕТА НА ТЕЛЕФОНІ ═══════════

   «маленький віджет, щоб кожні 2–3 години підтягувало спенд».

   Віджет Scriptable не має сесії CRM і токена Supabase, тому вхід тут
   — особистий ключ віджета: GET /widget?k=<ключ>. У базі ключа немає,
   лише його SHA-256 (team_settings, key = 'widget_key', свій у кожного
   власника). Ключ створюють і відкликають у Settings → Integrations →
   Widget.

   Що віддаємо — ТІЛЬКИ підсумок: спенд сьогодні й учора в доларах,
   скільки кабінетів сьогодні витрачали, коли був останній синк. Ні
   назв, ні ID, ні токенів: ключ, що загубився, не відкриває нічого,
   крім цього числа, і відкликається одним кліком.

   Число те саме, що «Today» на сторінці FB LIVE: fb_spend_daily за день
   у поясі САМОГО кабінета (так його рахує Facebook), по всіх кабінетах
   власника, перераховане в долари. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};
type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body),
    { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pgGet(base: string, hdr: Json, path: string): Promise<Json[]> {
  const res = await fetch(base + '/rest/v1/' + path, { headers: hdr });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
  return await res.json();
}

// День у поясі кабінета: «YYYY-MM-DD». Пояс невідомий — UTC.
function dayIn(tz: string, shift = 0): string {
  const t = new Date(Date.now() + shift * 86400_000);
  try { return t.toLocaleDateString('en-CA', { timeZone: tz || 'UTC' }); }
  catch (_e) { return t.toISOString().slice(0, 10); }
}

/* Курс — та сама служба, що й на сторінці (fxLoad): скільки одиниць
   валюти за долар. Не відповіла — у суму йде лише USD, а віджет каже,
   що решту не пораховано. */
async function rates(): Promise<Record<string, number> | null> {
  for (const url of ['https://api.frankfurter.app/latest?from=USD', 'https://open.er-api.com/v6/latest/USD']) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.rates && typeof j.rates === 'object') return j.rates;
    } catch (_e) { /* наступна служба */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const base = Deno.env.get('SUPABASE_URL') || '';
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!base || !svc) return reply({ error: 'function is not configured' }, 500);
  const hdr: Json = { apikey: svc, Authorization: 'Bearer ' + svc };

  const key = new URL(req.url).searchParams.get('k') || '';
  if (!/^[a-f0-9]{32,128}$/i.test(key)) return reply({ error: 'no widget key' }, 401);

  // Чий ключ. Порожнє значення — відкликаний, і під нього нічого не знайдеться.
  let owner = '';
  try {
    const rows = await pgGet(base, hdr, 'team_settings?select=created_by&key=eq.widget_key&value=eq.'
      + await sha256(key) + '&limit=1');
    owner = String(rows[0]?.created_by || '');
  } catch (e) { return reply({ error: (e as Error).message }, 500); }
  if (!owner) return reply({ error: 'unknown or revoked widget key' }, 401);

  try {
    const accs = await pgGet(base, hdr, 'fb_accounts?select=account_id,currency,timezone_name,synced_at'
      + '&created_by=eq.' + owner + '&missing_since=is.null');
    if (!accs.length) return reply({ spend: 0, yesterday: 0, cabinets: 0, synced_at: null, note: 'no cabinets' });

    // Дні, які нас цікавлять: сьогодні й учора в поясі кожного кабінета.
    const want = new Map<string, { today: string; yday: string; cur: string }>();
    const days = new Set<string>();
    accs.forEach(a => {
      const tz = String(a.timezone_name || '');
      const today = dayIn(tz), yday = dayIn(tz, -1);
      want.set(String(a.account_id), { today, yday, cur: String(a.currency || 'USD').toUpperCase() });
      days.add(today); days.add(yday);
    });
    const rows = await pgGet(base, hdr, 'fb_spend_daily?select=account_id,day,spend,currency'
      + '&created_by=eq.' + owner + '&day=in.(' + [...days].join(',') + ')');

    const sum = { today: new Map<string, number>(), yday: new Map<string, number>() };
    const spending = new Set<string>();
    rows.forEach(r => {
      const w = want.get(String(r.account_id));
      if (!w) return;
      const v = Number(r.spend) || 0;
      if (!(v > 0)) return;
      const cur = String(r.currency || w.cur || 'USD').toUpperCase();
      const day = String(r.day);
      const m = day === w.today ? sum.today : day === w.yday ? sum.yday : null;
      if (!m) return;
      m.set(cur, (m.get(cur) || 0) + v);
      if (m === sum.today) spending.add(String(r.account_id));
    });

    const curs = new Set([...sum.today.keys(), ...sum.yday.keys()]);
    const fx = [...curs].some(c => c !== 'USD') ? await rates() : null;
    let missed = false;
    const usd = (m: Map<string, number>) => {
      let t = 0;
      m.forEach((v, c) => {
        if (c === 'USD') { t += v; return; }
        const r = fx && Number(fx[c]);
        if (r && r > 0) t += v / r; else missed = true;
      });
      return Math.round(t * 100) / 100;
    };
    const synced = accs.map(a => Date.parse(String(a.synced_at || '')) || 0).reduce((a, b) => Math.max(a, b), 0);
    return reply({
      spend: usd(sum.today), yesterday: usd(sum.yday), cabinets: spending.size,
      synced_at: synced ? new Date(synced).toISOString() : null,
      at: new Date().toISOString(),
      ...(missed ? { note: 'some currencies were not converted' } : {})
    });
  } catch (e) {
    return reply({ error: (e as Error).message }, 500);
  }
});
