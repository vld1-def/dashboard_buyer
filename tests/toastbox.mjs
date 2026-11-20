/* СПОВІЩЕННЯ: КЛІК — МІНІ-ВІКНО, ХРЕСТИК — ПРИБРАТИ.
   «клікаючи на нього щоб відкривалось типу як міні вікно щоб можна
   було прочитати». Тост короткий; клік відкриває повний текст і
   попередні сповіщення сеансу. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8749;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const alive = () => page.evaluate(() => document.querySelectorAll('#toast-wrap .toast:not(.out)').length);
const long = Array.from({ length: 14 }, (_, i) => 'line ' + (i + 1)).join('\n');

await page.evaluate(() => { document.querySelectorAll('#toast-wrap .toast').forEach(t => t.remove()); toast('first one', 'ok', 0); });
await page.evaluate(t => toast('Sync summary\n' + t, 'warn', 0), long);
ok('два тости на екрані', (await alive()) === 2);
await page.waitForTimeout(100);
ok('довгий тост обрізаний і підписаний', await page.evaluate(() => document.querySelectorAll('#toast-wrap .toast.is-cut').length === 1));

// хрестик прибирає, не відкриваючи
await page.evaluate(() => document.querySelector('#toast-wrap .toast .toast-x').click());
await page.waitForTimeout(250);
ok('хрестик прибирає тост', (await alive()) === 1);
ok('і вікно не відкрилось', await page.evaluate(() => !document.querySelector('#toast-box:not(.hidden)')));

// клік відкриває міні-вікно
await page.evaluate(() => document.querySelector('#toast-wrap .toast:not(.out)').click());
await page.waitForTimeout(250);
const box = await page.evaluate(() => {
  const b = document.querySelector('#toast-box:not(.hidden)');
  return b && { text: b.querySelector('.tb-text').innerText, earlier: [...b.querySelectorAll('.tb-item')].map(x => x.innerText) };
});
ok('клік відкриває міні-вікно з повним текстом', box && /line 14/.test(box.text), box);
ok('там же — попередні сповіщення', box && box.earlier.some(x => /first one/.test(x)), box);
ok('відкритий тост прибрано', (await alive()) === 0);

await page.evaluate(() => document.querySelector('#toast-box .tb-item').click());
ok('клік по попередньому відкриває його', await page.evaluate(() => /first one/.test(document.querySelector('#toast-box .tb-text').innerText)));

await page.keyboard.press('Escape');
ok('Esc закриває вікно', await page.evaluate(() => !!document.querySelector('#toast-box.hidden')));

// наведення тримає тост
await page.evaluate(() => toast('hover me', '', 600));
const r = await page.evaluate(() => { const b = document.querySelector('#toast-wrap .toast:not(.out)').getBoundingClientRect(); return { x: b.x + 10, y: b.y + 10 }; });
await page.mouse.move(r.x, r.y);
await page.waitForTimeout(900);
ok('поки наведено — не гасне', (await alive()) === 1);
await page.mouse.move(1, 1);
await page.waitForTimeout(900);
ok('відвів — згасає', (await alive()) === 0);

// крок toastStep: проміжне не лишається в історії
await page.evaluate(() => { const s = toastStep(); s.say('working…'); s.done('Finished', 'ok'); toastBox(); });
ok('проміжний крок не потрапляє в історію', await page.evaluate(() =>
  ![...document.querySelectorAll('#toast-box .tb-item')].some(x => /working/.test(x.innerText))
  && /Finished/.test(document.querySelector('#toast-box .tb-text').innerText)));

await done(browser, srv, errs);
