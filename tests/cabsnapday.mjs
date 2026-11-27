/* Шапка й стовпці FB LIVE рахують ліди/реги/депи лише з рядків знімка,
   бачених СЬОГОДНІ в поясі кабінета — як Stat. Day. */
import { serve, open, checks } from './_harness.mjs';
const { ok, done } = checks();
const srv = await serve(8775);
const { browser, page, errs } = await open(8775, { viewport: { width: 1400, height: 900 } });
const r = await page.evaluate(async () => {
  try { bootDone(); } catch (e) {} ['boot', 'login-overlay', 'team-first-run'].forEach(i => document.getElementById(i)?.remove());
  cabViewSave = async () => true; cabViewLoad = async () => {}; cabDaysLoad = async () => {}; cabBuyLoad = async () => {}; window.fpLoad = async () => {};
  const now = new Date().toISOString(), old = new Date(Date.now() - 2 * 86400000).toISOString();
  const act = (lead, reg, buy) => [{ action_type: 'lead', value: String(lead) }, { action_type: 'complete_registration', value: String(reg) }, { action_type: 'purchase', value: String(buy) }];
  sbFetchAll = async t => t === 'fb_ad_today' ? [
      { account_id: '111', ad_id: 'a1', spend: 50, seen_at: now, actions: act(5, 2, 1) },
      { account_id: '111', ad_id: 'a2', spend: 30, seen_at: now, actions: act(3, 1, 2) },
      { account_id: '222', ad_id: 'b1', spend: 70, seen_at: old, actions: act(9, 4, 3) }]
    : ['111', '222'].map((id, i) => ({ id: 'r' + i, account_id: id, status: 'active' }));
  cabFbLoad = async () => { cabFb = ['111', '222'].map(id => ({ account_id: id, name: 'C' + id, status: 'active', currency: 'USD', spend_today: 10, timezone_name: 'Asia/Bishkek', token_id: 't1' })); };
  cabTokens = { t1: 'X_1_BM' }; cabLoaded = false;
  try { navGo('cabinets'); } catch (e) {}
  await cabInit(); await cabSnapLoad(); cabRender();
  const kpi = (document.getElementById('cab-kpis') || {}).innerText || '';
  return { s111: cabSnap['111'], s222: cabSnap['222'] || null, full: cabSnapRows.length, kpi };
});
ok('сьогоднішні рядки складаються', r.s111 && r.s111.buys === 3 && r.s111.regs === 3, r.s111);
ok('рядок дводенної давнини в зведення не йде', r.s222 === null, r.s222);
ok('повний знімок лишається для Stat. Day', r.full === 3, r.full);
ok('у шапці — депи лише за сьогодні (3, а не 6)', /Deps\s*3\b/i.test(r.kpi.replace(/\n/g, ' ')), r.kpi);
ok('сторінка без помилок', errs.length === 0, errs);
await browser.close(); srv.close();
done();
