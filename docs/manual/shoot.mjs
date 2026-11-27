/* Скріншоти методички + координати позначок для стрілок.
   node shoot.mjs [префікс]  → shots/NAME.png і shots/NAME.json */
import fs from 'node:fs';
import { demo } from './demo.mjs';
const only = process.argv[2];
const { page, close } = await demo();

/* Позначка — CSS-селектор; «sel@@текст» — перший елемент, текст якого
   починається з «текст»; «union:sel» — рамка навколо всіх збігів.
   Шукаємо і в iframe (Data hub вбудовує Form.html). */
async function rects(marks, clip) {
  return page.evaluate(([marks, clip]) => {
    const docs = [[document, 0, 0]];
    document.querySelectorAll('iframe').forEach(f => { try { const b = f.getBoundingClientRect(); if (f.contentDocument && b.width) docs.push([f.contentDocument, b.x, b.y, b.width / f.clientWidth]); } catch (e) {} });
    const vis = el => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2 && getComputedStyle(el).visibility !== 'hidden'; };
    const one = spec => {
      for (const [d, ox, oy, k = 1] of docs) {
        let els;
        if (spec.startsWith('union:')) {
          els = [...d.querySelectorAll(spec.slice(6))].filter(vis);
          if (!els.length) continue;
          const bs = els.map(e => e.getBoundingClientRect());
          const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
          return [x * k + ox, y * k + oy, (Math.max(...bs.map(b => b.right)) - x) * k, (Math.max(...bs.map(b => b.bottom)) - y) * k];
        }
        const [sel, txt] = spec.split('@@');
        els = [...d.querySelectorAll(sel)].filter(vis);
        if (txt) els = els.filter(e => (e.innerText || e.value || '').trim().toLowerCase().startsWith(txt.toLowerCase()))
          .sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
        if (els.length) { const b = els[0].getBoundingClientRect(); return [b.x * k + ox, b.y * k + oy, b.width * k, b.height * k]; }
      }
      return null;
    };
    let box = null;
    if (clip) { const r = one(clip.sel); const p = clip.pad || 30; box = [Math.max(0, r[0] - p), Math.max(0, r[1] - p), Math.min(innerWidth, r[0] + r[2] + p), Math.min(innerHeight, r[1] + r[3] + p)]; }
    const ms = marks.map(m => ({ spec: m, r: one(m) }));
    if (box) ms.forEach(m => { if (m.r) { m.r[0] -= box[0]; m.r[1] -= box[1]; } });
    return box ? { vw: box[2] - box[0], vh: box[3] - box[1], clip: { x: box[0], y: box[1], width: box[2] - box[0], height: box[3] - box[1] }, marks: ms }
               : { vw: innerWidth, vh: innerHeight, marks: ms };
  }, [marks, clip || null]);
}
const clean = () => page.evaluate(() => document.querySelectorAll('.toast, #toast-wrap, .toast-wrap, #toast-box').forEach(x => x.remove()));
async function shot(name, setup, marks = [], clip) {
  if (only && !name.startsWith(only)) return;
  try {
    if (setup) await page.evaluate(setup);
    await page.waitForTimeout(1100); await clean();
    await page.mouse.move(1439, 899);
    const info = await rects(marks, clip);
    await page.screenshot(info.clip ? { path: 'shots/' + name + '.png', clip: info.clip } : { path: 'shots/' + name + '.png' });
    fs.writeFileSync('shots/' + name + '.json', JSON.stringify(info));
    const miss = info.marks.filter(m => !m.r).map(m => m.spec);
    console.log('ok', name, miss.length ? 'MISSING ' + miss.join(' | ') : '');
  } catch (e) { console.log('FAIL', name, String(e).slice(0, 200)); }
}

/* ── Огляд екрана й Dashboard ── */
await shot('01a-tour', () => navGo(''), [
  '#app-sidebar *@@DEMO', '#app-sidebar *@@Search', 'union:.sb-item[data-nav]', 'union:.sb-item[data-hub], .sb-item[data-sheet]',
  'button[title="Select Month"]', '#app-dock', '[title="Add data"]', '.sb-item[onclick="openSettingsModal()"]']);
await shot('01b-dash', null, ['#milestone-container', '#kpi-row', '#chart-main-col', '#chart-main-col button@@Daily', '#chart-main-col *@@Events', '#geo-sidebar-col', '#ins-tasks', '#ins-top']);
await shot('02-heatmap', () => navGo('heatmap'));
await shot('03-creatives', () => navGo('creatives'), ['#creative-search', '#cr-date-btn', '.cr-filters', '.cr-queue-box', '#cr-cold', '#cr-lib']);
await shot('03b-cr-head', null, ['#creative-search', '#cr-date-btn', '.cr-filters', '.cr-queue-box', '#cr-cold', '#cr-lib'], { sel: '#creative-analyzer-section > div:first-child', pad: 46 });
await shot('05-domains', () => navGo('domains'));
await shot('06-expenses', () => navGo('expenses'));
await shot('07-posts', () => navGo('posts'));
await shot('09-reports', () => navGo('reports'));
await shot('10-add-data', () => { navGo(''); hubOpen('dataset', document.body); }, ['#mode-dataset > div:first-child', '#csv-drop-zone-dataset', '#csv-drop-zone-keitaro'], { sel: 'union:#mode-dataset > div:first-child, #csv-drop-zone-dataset, #csv-drop-zone-keitaro', pad: 60 });
await shot('11-records', () => hubOpen('records', document.body));
await shot('12-sources', () => hubOpen('providers', document.body));
await page.evaluate(() => hubClose());
await shot('14-sheets', () => sheetsOpen());
await page.evaluate(() => sheetsClose());
await shot('15-settings', () => { navGo(''); openSettingsModal(); });
await shot('15b-payouts', () => switchSettingsTab('payouts'));
await shot('15c-integrations', () => switchSettingsTab('integrations'));
await page.keyboard.press('Escape');
await shot('16-uniq', () => { document.querySelectorAll('[id$="-modal"]').forEach(m => m.classList.add('hidden')); openUniqModal(); });
await page.keyboard.press('Escape');
await page.evaluate(() => document.querySelectorAll('[id$="-modal"]').forEach(m => m.classList.add('hidden')));
await shot('18-dock', () => navGo(''), ['#app-dock button', '#app-dock [title="Select Month"]', '#app-dock [title="Performance Summary"]', '#app-dock [title="Gallery"]', '#app-dock [title="Daily Reports"]', '#app-dock [title="Mission Center"]', '#app-dock [title="Quick Links"]', '#app-dock [title="Bonus Calculator"]', '#app-dock [title="Files"]', '#app-dock [title="Texts"]', '#app-dock [title="Apps"]', '#app-dock [title="Uniqueizer"]', '#app-dock [title="Accounts"]', '#app-dock [title="Local time by geo"]', '#app-dock [title="DB Logs"]', '#app-dock [title="Geo Compare"]', '#app-dock [title="Data Check (Keitaro)"]', '#app-dock [title="Settings"]', '#app-dock [title="Log out"]', '#app-dock [title="Add data"]', '#app-dock']);

/* ── FB LIVE з демо-кабінетами ── */
await page.evaluate(async () => {
  cabViewSave = async () => true; cabViewLoad = async () => {}; cabDaysLoad = async () => {}; cabBuyLoad = async () => {}; window.fpLoad = async () => {};
  const today = new Date().toISOString().slice(0, 10);
  const list = [['1403209798694635', '4175', 'AgentX', 'KG Mbank', 'active', 146, 500, 412, 'Asia/Bishkek', 14, 6, 2],
    ['2799955410462460', '4050', 'AgentX', 'TJ Pin-Up', 'active', 88, 300, 120, 'Asia/Dushanbe', 9, 4, 1],
    ['1118804884290395', '4057', 'Farm', 'KZ Pinco', 'active', 64, 250, 98, 'Asia/Almaty', 7, 3, 1],
    ['3301120098812345', '4310', 'Farm', 'UZ Melbet', 'active', 41, 200, 75, 'Asia/Tashkent', 5, 2, 0],
    ['5512004477810022', '4322', 'AgentX', 'KG Olympus', 'active', 0, 150, 30, 'Asia/Bishkek', 0, 0, 0],
    ['7781230045698701', '4142', 'Farm', 'KG Zazino', 'disabled', 0, 300, 210, 'Asia/Bishkek', 0, 0, 0]];
  sbFetchAll = async () => list.map((r, i) => ({ id: 'r' + i, account_id: r[0], status: 'active', provider_name: r[2], profile: r[1] }));
  cabFbLoad = async () => { cabFb = list.map(r => ({ account_id: r[0], name: r[3], status: r[4], disable_reason: r[4] === 'disabled' ? 'ADS_INTEGRITY_POLICY' : null, currency: 'USD', spend_today: r[5], spend_day: today, spend_today_at: new Date().toISOString(), spend_cap: r[6], amount_spent: r[7], ads: 6, ads_active: r[5] ? 3 : 0, campaigns: 2, campaigns_active: r[5] ? 2 : 0, token_id: 't1', timezone_name: r[8] })); };
  cabSnapLoad = async () => { cabSnap = {}; list.forEach(r => cabSnap[r[0]] = { spend: r[5], leads: r[9], installs: r[9] * 3, regs: r[10], buys: r[11] }); };
  cabTokens = { t1: 'AgentX_4175_BM' }; cabLoaded = false;
  const ad = (i, c, s, name, spend, dom) => ({ account_id: '1403209798694635', campaign_id: 'c' + c, campaign_name: 'MPlay_KG_10708-y3wz_07/11 00' + c, adset_id: 's' + s, adset_name: 'Broad 18-45 set ' + s,
    ad_id: 'a' + i, name, effective_status: 'ACTIVE', status: 'ACTIVE', spend, impressions: 4000, clicks: 120, link_clicks: 95, actions: [{ action_type: 'lead', value: '5' }], seen_at: new Date().toISOString(), link_domain: dom, campaign_daily_budget: 15000, adset_daily_budget: null });
  const rows = [ad(1, 1, 1, 'KG_JS_674_v2', 52, 'mbank-kg.online'), ad(2, 1, 1, 'KG_VD_996', 31, 'mbank-kg.online'), ad(3, 2, 2, 'KG_AB_684', 40, 'play-kg.site'), ad(4, 2, 3, 'KG_KR_120', 23, 'play-kg.site')];
  const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, order() { return q; }, in() { return q; }, limit: async () => ({ data: rows, error: null }), then: f => Promise.resolve({ data: rows, error: null }).then(f) };
  const real = sb.from.bind(sb); sb.from = t => t === 'fb_ad_today' ? q : real(t);
  navGo('cabinets'); await cabInit(); await cabSnapLoad(); cabRender();
});
await shot('04a-fblive', null);
await shot('04a2-head', null, ['union:#cab-sum, #cab-kpis', '#cab-today-btn', '#cab-search', '#cab-group', '#cab-filt-btn', '#cab-cols-btn', '#cab-rules-btn', '#cab-pages-btn', 'button[title^="Templates"]', '#cab-sync', '.flt-row-cab', '.cd-tabs'], { sel: 'union:#cabinets-section > .cab-head, #cab-tiles', pad: 44 });
await shot('04b-tree', async () => { await cabToggleTree({ stopPropagation() {} }, encodeURIComponent('1403209798694635')); }, ['.cd-seg2', '.cd-seg2.is-quiet', 'td.cab-nd', 'button.cd-sw', 'tr.cd-r input.cd-mk'], { sel: 'union:#cab-tiles, #cab-list tr', pad: 36 });
await shot('04c-ads', async () => { cdSetFlat(true); await new Promise(r => setTimeout(r, 300)); document.querySelectorAll('.cd-eye').forEach((b, i) => i < 2 && b.click()); }, ['.cd-thumb', '.cd-dom.is-on', '.cd-eye', 'button.cd-sw'], { sel: 'union:#cab-tiles, #cab-list tr', pad: 36 });
await shot('04d-panel', () => { cdSetFlat(false); cabPick('1403209798694635'); }, ['.cab-ph-id', '.cab-ptabs', '.cab-lim-cell', '.cab-lim-acts', '.cab-ch', '.cab-pacts'], { sel: '#cab-detail', pad: 70 });
await shot('04e-notes', () => cabPanelTabSet('mine'), ['.cab-ptabs button:nth-child(2)', '#cab-detail textarea'], { sel: '#cab-detail', pad: 70 });
await page.evaluate(() => { cabPanelTabSet('fb'); cabPick(null); });
await shot('04f-rules', () => rlPanel(true));
await page.evaluate(() => { document.getElementById('rules-panel')?.classList.add('hidden'); });
await shot('04h-statday', () => tdToggle());
await page.evaluate(() => { try { tdToggle(); } catch (e) {} });
await shot('04i-templates', () => ltPanel());
await close();
