/* ═══════════ ЛІМІТ ЗА РОЗКЛАДОМ ═══════════

   «Створити штуку, яка міняє саме ліміт, щоб можна було виставляти,
   в котрій годині це міняти».

   Справжня fb-limit: Deno.serve перехоплено, fetch підмінено — база,
   Graph і Telegram живуть у пам'яті стенда. Плюс розбір часу зі
   сторінки (cabPlanParse). Типи знімає сам Node. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 400) : '')); } };

const ENV = { SUPABASE_URL: 'https://db', SUPABASE_ANON_KEY: 'anon', SERVICE_ROLE_KEY: 'svc',
              RULES_CRON_SECRET: 'cronkey', TG_BOT_TOKEN: 'bot' };
let handler = null;
globalThis.Deno = { env: { get: k => ENV[k] }, serve: h => { handler = h; } };

const now = Date.now();
const iso = m => new Date(now + m * 60000).toISOString();
let plans, sent, graphCap, posts;
function reset() {
  plans = [
    { id: 1, created_by: 'me', account_id: '111', set_major: 300, allow_new: false, run_at: iso(-1), status: 'pending' },
    { id: 2, created_by: 'me', account_id: '111', set_major: 400, allow_new: false, run_at: iso(-90), status: 'pending' },
    { id: 3, created_by: 'me', account_id: '999', set_major: 500, allow_new: false, run_at: iso(-2), status: 'pending' },
    { id: 4, created_by: 'me', account_id: '111', set_major: 600, allow_new: false, run_at: iso(+60), status: 'pending' }
  ];
  sent = []; posts = []; graphCap = 20000;   // $200 у мінорних
}
const json = (b, s = 200) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });

globalThis.fetch = async (url, o = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.telegram.org/')) { sent.push(JSON.parse(o.body).text); return json({ ok: true }); }
  if (u.startsWith('https://graph.facebook.com/')) {
    if ((o.method || 'GET') === 'POST') {
      const cap = Number(new URLSearchParams(o.body).get('spend_cap'));
      posts.push(cap); graphCap = cap * 100;
      return json({ success: true });
    }
    return json({ account_id: '111', name: 'C', currency: 'USD', spend_cap: String(graphCap), amount_spent: '15000' });
  }
  const path = u.replace('https://db/rest/v1/', '');
  if (path.startsWith('fb_limit_plan?status=eq.pending&run_at=lte.')) {
    const lim = Date.parse(decodeURIComponent(path.match(/run_at=lte\.([^&]+)/)[1]));
    return json(plans.filter(p => p.status === 'pending' && Date.parse(p.run_at) <= lim)
      .sort((a, b) => Date.parse(a.run_at) - Date.parse(b.run_at)));
  }
  if (path.startsWith('fb_limit_plan?id=eq.')) {
    const id = Number(path.match(/id=eq\.(\d+)/)[1]);
    const p = plans.find(x => x.id === id);
    if (!p || (path.includes('&status=eq.pending') && p.status !== 'pending')) return json([]);
    Object.assign(p, JSON.parse(o.body));
    return json([p]);
  }
  if (path.startsWith('fb_accounts?account_id=eq.')) {
    const acc = path.match(/account_id=eq\.([^&]+)/)[1], who = (path.match(/created_by=eq\.([^&]+)/) || [])[1];
    return json(acc === '111' && who === 'me' ? [{ account_id: '111', token_id: 7, team_name: 'T' }] : []);
  }
  if (path.startsWith('fb_tokens?id=eq.7')) return json([{ token: 'tok', scopes: ['ads_management'] }]);
  if (path.startsWith('tg_links?')) return json([{ chat_id: 42 }]);
  return json([], 404);
};

const FN = fs.readFileSync('supabase/functions/fb-limit/index.ts', 'utf8');
new Function(stripTypeScriptTypes(FN))();
ok('fb-limit підхопила Deno.serve', typeof handler === 'function');

const call = (key) => handler(new Request('https://fn/fb-limit', { method: 'POST',
  headers: key ? { 'x-cron-key': key } : {}, body: '{"cron":"plans"}' }));

/* ── чужий ключ ── */
reset();
let r = await call('wrong');
ok('неправильний ключ розкладу — 401', r.status === 401);
ok('і нічого не змінено', posts.length === 0 && plans.every(p => p.status === 'pending'));

/* ── прогін ── */
reset();
r = await call('cronkey');
const j = await r.json();
ok('прогін відповів', r.ok && j.mode === 'plans', j);
ok('настав час — стелю поставлено: $300', posts.includes(300) && plans[0].status === 'done', { posts, p: plans[0] });
ok('у записі — що віддав Facebook', plans[0].cap_after === 30000, plans[0]);
ok('запізнення 90 хв — не виконано, позначено missed', plans[1].status === 'missed' && !posts.includes(400), plans[1]);
ok('чужий кабінет — не знайдено серед кабінетів автора, нічого не змінено',
  plans[2].status === 'failed' && !posts.includes(500) && /author/.test(plans[2].result), plans[2]);
ok('майбутній запис не чіпали', plans[3].status === 'pending' && !posts.includes(600));
ok('у Telegram — про успіх', sent.some(t => /Limit changed on schedule/.test(t) && /111/.test(t) && /\$300/.test(t)), sent);
ok('про пропущений', sent.some(t => /NOT changed/.test(t) && /min ago/.test(t)), sent);
ok('і про невдалий', sent.some(t => /FAILED/.test(t) && /999/.test(t)), sent);

/* ── двічі те саме не виконується ── */
const before = posts.length;
await call('cronkey');
ok('повторний прогін нічого не міняє вдруге', posts.length === before, posts);

/* ── вада after ── */
const CODE = FN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok('after_raw більше не посилається на неіснуючу змінну', !/after\?\.spend_cap/.test(CODE) && /after_raw: capBack/.test(CODE));

/* ── сторінка: розбір часу ── */
const CJ = fs.readFileSync('build/cabinets.js', 'utf8');
const parseSrc = (CJ.match(/function cabPlanParse\(s\)[\s\S]*?\n}\n/) || [''])[0];
ok('є cabPlanParse', !!parseSrc);
const parse = new Function(parseSrc + '\nreturn cabPlanParse;')();
const p1 = parse('23:59');
ok('«23:59» — сьогодні або завтра, але в майбутньому', p1 && p1 > new Date() && p1.getHours() === 23 && p1.getMinutes() === 59);
const past = new Date(Date.now() - 3600000);
const p2 = parse(String(past.getHours()).padStart(2, '0') + ':' + String(past.getMinutes()).padStart(2, '0'));
ok('час, що вже минув сьогодні, — завтра', p2 && p2 > new Date() && p2.getDate() !== new Date().getDate() || p2.getMonth() !== new Date().getMonth());
const p3 = parse('09.12 19:00');
ok('«09.12 19:00» — 9 грудня', p3 && p3.getDate() === 9 && p3.getMonth() === 11 && p3.getHours() === 19);
ok('сміття — не час', parse('завтра') === null && parse('25:00') === null && parse('31.02 10:00') === null);
ok('не більше 10 змін на добу', /const CAB_PLAN_DAY_MAX = 10;/.test(CJ));
ok('кнопка ⏰ поруч з олівцем', /onclick="cabLimitPlan\('\$\{enc\}'\)"/.test(CJ));

const SQL = fs.readFileSync('FB_LIMIT_PLAN.sql', 'utf8');
ok('SQL: RLS увімкнено', /alter table public\.fb_limit_plan enable row level security;/.test(SQL));
ok('SQL: з дашборда можна лише скасувати своє', /with check \(created_by = auth\.uid\(\) and status = 'cancelled'\)/.test(SQL));
ok('SQL: розклад щохвилини і лише коли є що робити', /'\* \* \* \* \*'/.test(SQL) && /where exists \(select 1 from public\.fb_limit_plan/.test(SQL));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
