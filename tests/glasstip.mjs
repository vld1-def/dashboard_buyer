/* СКЛЯНИЙ ТУЛТІП ГРАФІКІВ НЕ ЗНИКАЄ ВІД СУСІДНЬОЇ ПРОКРУТКИ.
   «Creative Analyzer: тултіп появляється і сразу пропадає, якщо
   наводити на графік; через список — усе ок». Наведення на графік там
   прокручує таблицю днів, а тултіп ховався на БУДЬ-ЯКУ прокрутку. */
import { serve, open, checks } from './_harness.mjs';
import { readFileSync } from 'node:fs';

const PORT = 8754;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const CHART = '/tmp/claude-0/-home-user-dashboard-buyer/ec341352-83dd-5286-9fe4-ff07423366f7/scratchpad/tw/node_modules/chart.js/dist/chart.umd.js';
let have = true;
try { readFileSync(CHART); } catch (e) { have = false; }
if (!have) { console.log('ok   (Chart.js offline copy missing — skipped)'); await done(browser, srv, errs); process.exit(0); }
await page.addScriptTag({ path: CHART });

await page.evaluate(() => {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:500px;z-index:99999;background:#111';
  host.innerHTML = '<div style="height:240px"><canvas id="gt-cv"></canvas></div>'
    + '<div id="gt-list" style="height:120px;overflow:auto"><div style="height:900px">rows</div></div>';
  document.body.appendChild(host);
  cfGlassTip();
  window.__ch = new Chart(document.getElementById('gt-cv'), { type: 'line',
    data: { labels: ['a', 'b', 'c'], datasets: [{ label: 'Spend', data: [1, 2, 3] }] },
    options: { maintainAspectRatio: false, animation: false } });
});
const show = () => page.evaluate(() => {
  const ch = window.__ch, m = ch.getDatasetMeta(0).data[1];
  ch.tooltip.setActiveElements([{ datasetIndex: 0, index: 1 }], { x: m.x, y: m.y }); ch.update('none');
});
const on = () => page.evaluate(() => !!document.querySelector('#cf-glass-tip.is-on'));

await show();
ok('тултіп показався', await on());
await page.evaluate(() => { document.getElementById('gt-list').scrollTop = 300; });
await page.waitForTimeout(100);
ok('сусідня прокрутка (таблиця днів) його не ховає', await on());
await page.evaluate(() => { document.documentElement.style.height = '3000px'; window.scrollTo(0, 200); window.dispatchEvent(new Event('scroll')); document.dispatchEvent(new Event('scroll')); });
await page.waitForTimeout(100);
ok('прокрутка сторінки — ховає', !(await on()));

await done(browser, srv, errs);
