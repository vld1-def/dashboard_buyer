import { demo } from './demo.mjs';
const only = process.argv[2];
const { page, close } = await demo();
const clean = () => page.evaluate(() => document.querySelectorAll('.toast, #toast-wrap, .toast-wrap').forEach(x => x.remove()));
const shot = async (name, fn, sel) => {
  if (only && !name.startsWith(only)) return;
  try { if (fn) await page.evaluate(fn); await page.waitForTimeout(1000); await clean();
    if (sel) await (await page.$(sel)).screenshot({ path: 'shots/' + name + '.png' }); else await page.screenshot({ path: 'shots/' + name + '.png' });
    console.log('ok', name); } catch (e) { console.log('FAIL', name, String(e).slice(0, 200)); }
};
if (!only || only < '2') {
await shot('10-hub-campaigns', () => hubOpen('dataset', document.body));
await shot('11-hub-records', () => hubOpen('records', document.body));
await shot('12-hub-sources', () => hubOpen('providers', document.body));
await page.evaluate(() => hubClose());
await shot('14-sheets', () => { aqClose(); sheetsOpen(); });
await page.evaluate(() => sheetsClose());
}
/* ── FB LIVE з демо-кабінетами ── */
await page.evaluate(async () => {
  cabViewSave = async () => true; cabViewLoad = async () => {}; cabDaysLoad = async () => {}; cabBuyLoad = async () => {}; window.fpLoad = async () => {};
  const list = [['1403209798694635', '4175', 'AgentX', 'KG Mbank', 'active', 146, 500, 412, 'Asia/Bishkek', 14, 6, 2],
    ['2799955410462460', '4050', 'AgentX', 'TJ Pin-Up', 'active', 88, 300, 120, 'Asia/Dushanbe', 9, 4, 1],
    ['1118804884290395', '4057', 'Farm', 'KZ Pinco', 'active', 64, 250, 98, 'Asia/Almaty', 7, 3, 1],
    ['3301120098812345', '4310', 'Farm', 'UZ Melbet', 'active', 41, 200, 75, 'Asia/Tashkent', 5, 2, 0],
    ['5512004477810022', '4322', 'AgentX', 'KG Olympus', 'active', 0, 150, 30, 'Asia/Bishkek', 0, 0, 0],
    ['7781230045698701', '4142', 'Farm', 'KG Zazino', 'disabled', 0, 300, 210, 'Asia/Bishkek', 0, 0, 0]];
  sbFetchAll = async () => list.map((r, i) => ({ id: 'r' + i, account_id: r[0], status: 'active', provider_name: r[2], profile: r[1] }));
  cabFbLoad = async () => { cabFb = list.map(r => ({ account_id: r[0], name: r[3], status: r[4], disable_reason: r[4] === 'disabled' ? 'ADS_INTEGRITY_POLICY' : null, currency: 'USD', spend_today: r[5], spend_cap: r[6], amount_spent: r[7], ads: 6, ads_active: r[5] ? 3 : 0, campaigns: 2, campaigns_active: r[5] ? 2 : 0, token_id: 't1', timezone_name: r[8] })); };
  cabSnapLoad = async () => { cabSnap = {}; list.forEach(r => cabSnap[r[0]] = { spend: r[5], leads: r[9], installs: r[9] * 3, regs: r[10], buys: r[11] }); };
  cabTokens = { t1: 'AgentX_4175_BM' }; cabLoaded = false;
  const ad = (i, c, s, name, spend, dom) => ({ account_id: '1403209798694635', campaign_id: 'c' + c, campaign_name: 'MPlay_KG_10708-y3wz_07/11 00' + c, adset_id: 's' + s, adset_name: 'Broad 18-45 set ' + s,
    ad_id: 'a' + i, name, effective_status: 'ACTIVE', status: 'ACTIVE', spend, impressions: 4000, clicks: 120, link_clicks: 95, actions: [{ action_type: 'lead', value: '5' }], seen_at: new Date().toISOString(), link_domain: dom, campaign_daily_budget: 15000, adset_daily_budget: null });
  const rows = [ad(1, 1, 1, 'KG_JS_674_v2', 52, 'mbank-kg.online'), ad(2, 1, 1, 'KG_VD_996', 31, 'mbank-kg.online'), ad(3, 2, 2, 'KG_AB_684', 40, 'play-kg.site'), ad(4, 2, 3, 'KG_KR_120', 23, 'play-kg.site')];
  const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, order() { return q; }, in() { return q; }, limit: async () => ({ data: rows, error: null }), then: f => Promise.resolve({ data: rows, error: null }).then(f) };
  const real = sb.from.bind(sb); sb.from = t => t === 'fb_ad_today' ? q : real(t);
  navGo('cabinets'); await cabInit(); cabSnapLoad(); cabRender();
});
await shot('04a-fblive', null);
await shot('04b-fblive-tree', async () => { await cabToggleTree({ stopPropagation() {} }, encodeURIComponent('1403209798694635')); });
await shot('04c-fblive-ads', async () => { cdSetFlat(true); await new Promise(r => setTimeout(r, 300)); document.querySelectorAll('.cd-eye').forEach((b, i) => i < 2 && b.click()); });
await shot('04d-fblive-panel', () => { cdSetFlat(false); cabPick('1403209798694635'); });
await shot('04e-fblive-panel-notes', () => cabPanelTabSet('mine'));
await page.evaluate(() => { cabPanelTabSet('fb'); cabPick(null); });
await shot('04f-rules', () => rlPanel(true));
await page.evaluate(() => { try { rlPanel(false); } catch (e) {} document.getElementById('rules-panel')?.classList.add('hidden'); });
await shot('04g-pages', () => pgPanel());
await page.evaluate(() => document.getElementById('pages-panel')?.classList.add('hidden'));
await shot('04h-statday', () => tdToggle());
await page.evaluate(() => { try { tdToggle(); } catch (e) {} });
await shot('04i-templates', () => ltPanel());
await close();
