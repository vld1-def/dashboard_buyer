/* Стенд для скріншотів методички: справжня сторінка з демо-даними.
   База — заглушка, що віддає вигадані рядки по таблицях; графіки — з
   локальної копії Chart.js (CDN у контейнері закритий). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
export const ROOT = '/home/user/dashboard_buyer';
const NM = process.env.NM || '/tmp/claude-0/-home-user-dashboard-buyer/ec341352-83dd-5286-9fe4-ff07423366f7/scratchpad/tw/node_modules';

function demoData() {
  const geos = [['KG', 'Mbank', 25, 'agentx'], ['KZ', 'Pinco', 30, 'farm'], ['UZ', 'Melbet', 22, 'agentx'], ['TJ', 'Pin-Up', 28, 'farm']];
  const accs = ['4175', '4050', '4310', '4758', '4052', '4323'];
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const daily = [], cr = []; let id = 1;
  for (let d = 1; d <= 26; d++) {
    const date = '2026-11-' + String(d).padStart(2, '0');
    geos.forEach(([geo, offer, , agent], gi) => {
      for (let k = 0; k < 2; k++) {
        const spend = Math.round((60 + rnd() * 140) * (1 + d / 40) * (gi === 0 ? 1.4 : 1)) ;
        const installs = Math.round(spend / (1.2 + rnd()));
        const regs = Math.round(installs * (0.25 + rnd() * 0.15));
        const deposits = Math.round(regs * (0.18 + rnd() * 0.12));
        const account = accs[(gi * 2 + k) % accs.length];
        daily.push({ id: String(id++), team_name: 'DEMO', date, account, geo, funnel: 'pwa', spend, regs, deposits, agent, offer, installs, landing: '', site: '' });
        cr.push({ id: String(id++), team_name: 'DEMO', date, account, cid: geo + '_' + ['JS_674', 'VD_996', 'AB_684', 'KR_120'][(d + k + gi) % 4], spend: Math.round(spend * .6), regs, deps: deposits, clicks: installs * 3, geo, device: 'android', funnel: 'pwa', installs, placement: 'feed', platform: 'facebook', offer });
      }
    });
  }
  const payouts = geos.map(([geo, offer, value], i) => ({ id: String(i + 1), team_name: 'DEMO', geo, offer, value, active: true, model: 'cpa' }))
    .concat(geos.map(([geo, , value], i) => ({ id: String(i + 11), team_name: 'DEMO', geo, offer: 'DEFAULT', value, active: true, model: 'cpa' })));
  const access = { buyer: { '': true, cabinets: true, creatives: true, geo: true, heatmap: true, reports: true, domains: true, expenses: true, team: false, hub: true, sheets: true } };
  const now = new Date().toISOString();
  const accounts_mapping = [['1403209798694635', 'AgentX', 6, '4175'], ['2799955410462460', 'AgentX', 5, '4050'], ['1118804884290395', 'Farm', 5, '4057'], ['3301120098812345', 'Farm', 5, '4310']]
    .map(([a, p, tz, pr], i) => ({ id: 'm' + i, team_name: 'DEMO', account_id: a, provider_name: p, timezone: tz, profile: pr }));
  const funnels_mapping = [['10708-y3wz', 'Mbank KG', 'KG', false], ['10864-9lm5', 'Pinco KZ', 'KZ', false], ['pfb10964', 'Melbet UZ [AppCloud]', 'UZ', true]]
    .map(([k, n, g, app], i) => ({ id: 'f' + i, team_name: 'DEMO', ktid: k, funnel_name: n, geo: g, is_app: app }));
  const domains = [['mbank-kg.online', 'Mbank', 'KG', 'ok', 200], ['play-kg.site', 'Mbank', 'KG', 'ok', 200], ['pinco-kz1.top', 'Pinco', 'KZ', 'guarded', 403], ['melbet-uz.app', 'Melbet', 'UZ', 'down', null], ['pinup-tj.fun', 'Pin-Up', 'TJ', 'danger', 200]]
    .map(([d, p, g, st, c], i) => ({ id: 'd' + i, team_name: 'DEMO', domain: d, pwa: p, geo: g, status: st, status_code: c, source: 'server', checked_at: now, created_at: now }))
    .concat([['kg-mbank.app', 'Mbank', 'KG', 'danger', 200], ['olymp-kg.top', 'Olympus', 'KG', 'ok', 200], ['pinco-kz2.top', 'Pinco', 'KZ', 'notfound', 404], ['pinup-tj2.fun', 'Pin-Up', 'TJ', 'ok', 200], ['mbank-kg3.online', 'Mbank', 'KG', 'ok', 200]]
      .map(([d, p, g, st, c], i) => ({ id: 'dx' + i, team_name: 'DEMO', domain: d, pwa: p, geo: g, status: st, status_code: c, source: 'server', checked_at: now, created_at: now })));
  const pwa = [
    ['KG', 'Riddick', 'Mbank', 'Mbank_KG_10708-ex8g_{date}', ['https://mbank-kg.online/?k=10708', 'https://play-kg.site/r/10708', 'https://kg-mbank.app/s1'], 'sub1={cid}&sub2=10708-ex8g&sub5={acc}', 'основна, крутиться з 05.11'],
    ['KG', 'Riddick', 'Olympus', 'Olympus_KG_10933-k2pq_{date}', ['https://olymp-kg.top/?k=10933'], 'sub1={cid}&sub2=10933-k2pq', ''],
    ['KZ', 'AppHeroes', 'Pinco', 'Pinco_KZ_10864-9lm5_{date}', ['https://pinco-kz1.top/p/10864', 'https://pinco-kz2.top/p/10864'], 'sub1={cid}&sub2=10864-9lm5&sub5={acc}', 'дизайн оновили 20.11'],
    ['UZ', 'Skakapp', 'Melbet', 'Melbet_UZ_10512-a8sd_{date}', ['https://melbet-uz.app/m/10512'], 'sub1={cid}&sub2=10512-a8sd', ''],
    ['TJ', 'Riddick', 'Pin-Up', 'PinUp_TJ_20411-y3wz_{date}', ['https://pinup-tj.fun/u/20411', 'https://pinup-tj2.fun/u/20411'], 'sub1={cid}&sub2=20411-y3wz', 'другий домен — запасний']
  ].map(([geo, provider, offer, name, links, subs, note], i) => ({ id: 'pw' + i, geo, provider, offer, name, links, subs, note }));
  const apps = [['UZ', 'AppCloud', 'Melbet'], ['UZ', 'AppCloud', 'Mostbet'], ['KG', 'Skakapp', 'Mbank'], ['KG', 'Skakapp', 'Olympus'], ['TJ', 'AppCloud', 'Pin-Up']]
    .map(([geo, provider, title], i) => ({ id: 'ap' + i, geo, provider, title, naming: 'cy638t_8wxg7hf7_bGcTwMmV_{app}_{acc}_' + geo, deeplink: 'appcloud://open?app={app}&c={creative}',
      subs: [{ n: 2, mode: 'app', value: '' }, { n: 5, mode: 'acc', value: '1403209798694635' }, { n: 20, mode: 'cid', value: '' }, { n: 7, mode: 'fixed', value: '8wxg7hf7' }] }));
  return { _role: 'buyer', accounts_mapping, funnels_mapping, domains, team_settings: [{ team_name: 'DEMO', key: 'role_access', value: JSON.stringify(access) }, { team_name: 'DEMO', key: 'pwa_links', value: JSON.stringify(pwa) }, { team_name: 'DEMO', key: 'app_links', value: JSON.stringify(apps) }], daily_stats: daily, creatives_stats: cr, payouts, settings: [{ team_name: 'DEMO', month: '2026-11', monthly_spend_target: 40000 }] };
}

export async function demo({ width = 1440, height = 900, scale = 2 } = {}) {
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    try { const b = fs.readFileSync(f); res.writeHead(200, { 'content-type': f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(b); }
    catch (e) { res.writeHead(404); res.end('no'); }
  });
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.route(/cdn\.jsdelivr\.net\/npm\/chart\.js/, r => r.fulfill({ path: NM + '/chart.js/dist/chart.umd.js', contentType: 'text/javascript' }));
  await page.route(/chartjs-plugin-datalabels/, r => r.fulfill({ path: NM + '/chartjs-plugin-datalabels/dist/chartjs-plugin-datalabels.min.js', contentType: 'text/javascript' }));
  /* Form.html (усередині Data hub) досі тягне Tailwind із CDN — для
     стенду підкладаємо скомпільований під неї CSS. */
  const FORM_CSS = process.env.FORM_CSS || '/tmp/claude-0/-home-user-dashboard-buyer/ec341352-83dd-5286-9fe4-ff07423366f7/scratchpad/form.css';
  const twJs = 'window.tailwind={config:{}};document.addEventListener("DOMContentLoaded",function(){var s=document.createElement("style");s.textContent='
    + JSON.stringify(fs.existsSync(FORM_CSS) ? fs.readFileSync(FORM_CSS, 'utf8') : '') + ';document.head.append(s)});';
  await page.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ body: twJs, contentType: 'text/javascript' }));
  await page.route(/flagcdn\.com\/w\d+\/([a-z-]+)\.png/, r => {
    const cc = r.request().url().match(/\/([a-z-]+)\.png/)[1];
    const f = NM + '/flag-icons/flags/4x3/' + cc + '.svg';
    return fs.existsSync(f) ? r.fulfill({ path: f, contentType: 'image/svg+xml' }) : r.fulfill({ status: 404, body: '' });
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase-js/, r => r.fulfill({ body: '', contentType: 'text/plain' }));
  await page.addInitScript(DATA => {
    try { localStorage.setItem('selected_team', 'DEMO'); } catch (e) {}
    try { localStorage.setItem('chart_style', 'area'); } catch (e) {}
    window.__reqLog = [];
    const chain = (table) => {
      window.__reqLog.push([table, Math.round(performance.now())]);
      let from = 0, to = 1e9, single = false; const eqs = [];
      const res = () => {
        let all = DATA[table] || [];
        if (typeof all === 'string') return { data: all, error: null };
        all = all.filter(r => eqs.every(([c, v]) => !(c in r) || String(r[c]) === String(v)));
        const d = all.slice(from, to + 1); return { data: single ? (d[0] || null) : d, error: null, count: all.length }; };
      const o = new Proxy(function () {}, {
        get: (t, k) => k === 'then' ? (f, g) => Promise.resolve(res()).then(f, g)
          : k === 'eq' ? (c, v) => { eqs.push([c, v]); return o; }
          : k === 'range' ? (a, b) => { from = a; to = b; return o; }
          : (k === 'single' || k === 'maybeSingle') ? () => { single = true; return o; }
          : () => o,
        apply: () => o });
      return o;
    };
    const session = { access_token: 'x', user: { id: 'u1', email: 'buyer@demo.team' } };
    window.supabase = { createClient: () => ({
      from: t => chain(t), rpc: n => chain(n === 'my_role' ? '_role' : '_rpc'),
      auth: { getSession: async () => ({ data: { session } }), getUser: async () => ({ data: { user: session.user } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithPassword: async () => ({ data: {}, error: null }), signOut: async () => ({ error: null }) },
      storage: { from: () => chain('_st') }, functions: { invoke: async () => ({ data: null, error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {} }) };
    window.tailwind = { config: {} };
    window.fetch = (orig => (u, o) => /functions\/v1|graph\.facebook|googleapis/.test(String(u)) ? Promise.resolve(new Response('{}', { status: 200 })) : orig(u, o))(window.fetch);
  }, demoData());
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  /* Методичка — для баєра: Assistant у баєрів у меню немає. */
  await page.addStyleTag({ content: '.sb-item[onclick="aqOpen()"]{display:none!important}' });
  return { browser, page, close: async () => { await browser.close(); srv.close(); } };
}
