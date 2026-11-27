import { serve, open, checks } from './_harness.mjs';
const { ok, done } = checks();
const srv = await serve(8777);
const { browser, page } = await open(8777, { viewport: { width: 1400, height: 900 } });
const r = await page.evaluate(async () => {
  try { bootDone(); } catch (e) {} ['boot', 'login-overlay', 'team-first-run'].forEach(i => document.getElementById(i)?.remove());
  cabViewSave = async () => true; cabViewLoad = async () => {}; cabDaysLoad = async () => {}; cabSnapLoad = async () => {}; cabBuyLoad = async () => {}; window.fpLoad = async () => {};
  const at = new Date(Date.now() - (24 * 60 + 5) * 1000).toISOString();
  sbFetchAll = async () => [{ id: 'r1', account_id: '111', status: 'active' }];
  cabFbLoad = async () => { cabFb = [{ account_id: '111', name: 'C', status: 'active', currency: 'USD', spend_today: 1, token_id: 't1', synced_at: at, updated_at: at, fetched_at: at }]; };
  cabTokens = { t1: 'X_1_BM' }; cabLoaded = false;
  try { navGo('cabinets'); } catch (e) {}
  document.getElementById('cabinets-section').classList.remove('hidden');
  await cabInit();
  const el = document.getElementById('cab-sync-ago'), b = document.getElementById('cab-sync');
  const a1 = el.textContent; await new Promise(r => setTimeout(r, 2200)); const a2 = el.textContent;
  return { a1, a2, tip: b.title, at: cabFbAt && cabFbAt() };
});
ok('напис біжить щосекунди (як секундомір)', r.a1 !== r.a2 && /^24:0\d ago$/.test(r.a2), r);
ok('до години — хвилини:секунди', /^\d+:\d\d ago$/.test(r.a1), r.a1);
ok('у підказці кнопки — час останньої синхронізації', /^Last sync: .+ · 24:0\d ago/.test(r.tip), r.tip);
await browser.close(); srv.close();
done();
