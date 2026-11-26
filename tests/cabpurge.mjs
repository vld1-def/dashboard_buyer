/* FB LIVE: ОЧИЩЕНИЙ АРХІВ НЕ ПОКАЗУЄТЬСЯ, АРХІВ — ПОРЦІЯМИ.
   «не тільки історію а і самі кабінети видаляти … клікнув на архівед і
   в мене сайт завис». */
import { serve, open, checks } from './_harness.mjs';
const { ok, done } = checks();
const srv = await serve(8769);
const { browser, page, errs } = await open(8769);
const r = await page.evaluate(async () => {
  try { bootDone(); } catch (e) {}
  const N = 150;
  const fb = [], rows = [];
  for (let i = 0; i < N; i++) {
    const id = String(2000000000000 + i);
    fb.push({ account_id: id, name: 'C' + i, status: 'banned', currency: 'USD', spend_today: 0, ads: 1, ads_active: 0, token_id: 't1' });
    rows.push({ id: 'r' + i, account_id: id, status: 'archive', provider_name: 'A', purged_at: i < 20 ? '2026-11-26T03:20:00Z' : null });
  }
  cabViewSave = async () => true; cabDaysLoad = async () => {}; cabSnapLoad = async () => {}; cabBuyLoad = async () => {};
  window.fpLoad = async () => {};
  sbFetchAll = async () => rows.map(x => ({ ...x }));
  cabFbLoad = async () => { cabFb = fb.filter(r => !cabPurged.has(r.account_id)); };
  cabLoaded = false; cabTokens = { t1: 'A_1_BM' }; cabRange = { key: 'today', since: '', until: '' };
  try { navGo('cabinets'); } catch (e) {}
  cabViewLoad = async () => {};
  await cabInit();
  const archived = cabAll.filter(c => c.state === 'archived').length;
  cabFilter = ''; cabSetFilter('archived');
  const first = document.querySelectorAll('#cab-list tr.cab-tr').length;
  const btn = document.querySelector('#cab-list .cab-more button');
  const label = btn && btn.textContent;
  btn && btn.click();
  const second = document.querySelectorAll('#cab-list tr.cab-tr').length;
  return { purged: cabPurged.size, rows: cabRows.length, archived, first, second, label };
});
ok('очищені архівні в FB LIVE не потрапляють', r.purged === 20 && r.rows === 130 && r.archived === 130, r);
ok('архів — перші 60', r.first === 60, r);
ok('кнопка каже, скільки ще', /Show 60 more · 70 left/.test(r.label || ''), r.label);
ok('клік — ще 60', r.second === 120, r);
/* Каркас замість «Loading…». */
const sk = await page.evaluate(() => {
  const h = document.createElement('div'); document.body.appendChild(h);
  const t = document.getElementById('cab-tiles'); if (t) t.innerHTML = '';
  cabSkeleton(h);
  return { rows: h.querySelectorAll('.sk-row').length, tiles: document.querySelectorAll('#cab-tiles .sk-tile').length, txt: /Loading…/.test(h.textContent) };
});
ok('під час завантаження — каркас рядків і плиток, а не текст', sk.rows === 8 && sk.tiles === 6 && !sk.txt, sk);
await done(browser, srv, errs);
