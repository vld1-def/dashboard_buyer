/* FB LIVE: пошук по назвах кампаній, адсетів і оголошень. */
import { serve, open, checks } from './_harness.mjs';
const { ok, done } = checks();
const srv = await serve(8774);
const { browser, page, errs } = await open(8774, { viewport: { width: 1400, height: 900 } });
const r = await page.evaluate(async () => {
  try { bootDone(); } catch (e) {} ['boot', 'login-overlay', 'team-first-run'].forEach(i => document.getElementById(i)?.remove());
  cabViewSave = async () => true; cabViewLoad = async () => {}; cabDaysLoad = async () => {}; cabBuyLoad = async () => {}; window.fpLoad = async () => {};
  const ids = ['111', '222', '333'];
  sbFetchAll = async (t) => t === 'fb_ad_today' ? [
      { account_id: '111', campaign_name: 'Mbank_KG_10708-y3wz_07/11', adset_name: 'Broad', name: 'KG_JS_674' },
      { account_id: '222', campaign_name: 'Pinco_KZ_10864-9lm5_01/11', adset_name: 'Broad 18-45', name: 'KZ_VD_996' },
      { account_id: '333', campaign_name: 'Melbet_UZ_2001-abcd_02/11', adset_name: 'Lookalike', name: 'UZ_promo_y3wz' }]
    : ids.map((id, i) => ({ id: 'r' + i, account_id: id, status: 'active', provider_name: 'Agent' + i }));
  cabFbLoad = async () => { cabFb = ids.map(id => ({ account_id: id, name: 'Cab ' + id, status: 'active', currency: 'USD', spend_today: 5, ads: 1, ads_active: 1, token_id: 't1' })); };
  cabTokens = { t1: 'X_1_BM' }; cabLoaded = false;
  try { navGo('cabinets'); } catch (e) {}
  await cabInit(); await cabSnapLoad();
  const inp = document.getElementById('cab-search');
  const run = q => { inp.value = q; cabRender(); return [...document.querySelectorAll('#cab-list tr.cab-tr')].map(tr => ({ id: tr.querySelector('.cab-id')?.dataset.v, hit: tr.querySelector('.cab-hit')?.innerText || '', mark: tr.querySelector('.cab-hit mark')?.innerText || '' })); };
  return { camp: run('9LM5'), both: run('y3wz'), byId: run('222'), one: run('k'), none: run('zzzz'), ph: inp.placeholder };
});
ok('шматок назви кампанії знаходить кабінет', r.camp.length === 1 && r.camp[0].id === '222', r.camp);
ok('під кабінетом — де знайшлось, зі збігом', /campaign: Pinco_KZ_10864-9lm5/.test(r.camp[0].hit) && r.camp[0].mark.toLowerCase() === '9lm5', r.camp);
ok('кампанія першою, а збіг в оголошенні — з підписом ad', r.both.length === 2 && r.both.some(x => /^.?\s?campaign:/.test(x.hit.replace('↳', '').trim()) ) && r.both.some(x => /ad: UZ_promo_y3wz/.test(x.hit)), r.both);
ok('пошук за номером кабінета — як і раніше, без підказки', r.byId.length === 1 && r.byId[0].id === '222' && !r.byId[0].hit, r.byId);
ok('одна літера не шукає по назвах', r.one.every(x => !x.hit), r.one);
ok('немає збігів — порожньо', r.none.length === 0, r.none);
ok('підказка в полі пошуку згадує кампанії', /campaign/.test(r.ph), r.ph);
ok('сторінка без помилок', errs.length === 0, errs);
await browser.close(); srv.close();
done();
