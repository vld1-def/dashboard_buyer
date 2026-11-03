/* ═══════════ ЗАТИСНУТИ — ЧИТАТИ, КЛІКНУТИ — ПРИБРАТИ ═══════════

   «По можливості зроби так щоб можна було на це повідомлення
   затиснути і прочитати, швидкий клік приховати».

   Підсумок синку буває на двадцять рядків: чиї токени впали, що саме
   сказала база, які кабінети найповільніші. Прочитати це за сім
   секунд не можна — а найменший рух пальцем по ньому рахувався
   кліком, тобто текст зникав рівно тоді, коли в нього вдивлялись.

   Стенд тримає:
     1. короткий дотик прибирає — як і було;
     2. довгий тримає: лічильник згасання знято, тост лишається;
     3. клік ОДРАЗУ після затискання не прибирає (ним його й
        відкрили), а наступний короткий — прибирає;
     4. виділення тексту не рахується кліком: інакше спроба
        скопіювати рядок помилки прибирала б той самий рядок;
     5. затиснутий тост можна прокручувати й виділяти;
     6. слухачі вікна зникають разом із тостом. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8195;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const HOLD = 350;
const alive = () => page.evaluate(() =>
  !!document.querySelector('#toast-wrap .toast:not(.out)'));
const held = () => page.evaluate(() =>
  !!document.querySelector('#toast-wrap .toast.is-held'));
const box = () => page.evaluate(() => {
  const t = document.querySelector('#toast-wrap .toast');
  if (!t) return null;
  const r = t.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const fresh = (ms) => page.evaluate(m => {
  document.querySelectorAll('#toast-wrap .toast').forEach(t => t.remove());
  toast('Sync summary\nline two\nline three', 'warn', m);
}, ms);

/* ── 1. короткий дотик прибирає ── */
await fresh(0);
ok('тост зʼявився', await alive());
let p = await box();
await page.mouse.click(p.x, p.y);
ok('короткий дотик прибирає', !(await alive()));

/* ── 2. довгий тримає ──
   Життя 1200 мс: вистачає, щоб натиснути, і мало, щоб без затискання
   тост напевно згас до перевірки. Тобто перевіряємо саме ЗНЯТТЯ
   лічильника, а не те, що «ще не встигло».

   Натискаємо одразу після появи й лише потім чекаємо: якщо шукати
   координати довго, тост помре ще до натискання — на цьому стенд уже
   один раз і спіткнувся. */
await fresh(1200);
p = await box();
ok('тост ще живий перед натисканням', await alive());
await page.mouse.move(p.x, p.y);
await page.mouse.down();
await page.waitForTimeout(HOLD + 120);
ok('після затискання тост позначений', await held());
await page.mouse.up();
// Чекаємо ПОНАД 1200 від появи: без зняття лічильника тут уже порожньо.
await page.waitForTimeout(1200);
ok('і не згас, хоч лічильник уже минув би', await alive());

/* ── 3. клік одразу після затискання не прибирає ──
   Саме цим рухом його щойно й відкрили. */
ok('відпускання не прибрало', await alive());
/* А наступний короткий — прибирає. */
p = await box();
await page.mouse.click(p.x, p.y);
ok('наступний короткий дотик прибирає', !(await alive()));

/* ── 4. виділення тексту — не клік ── */
await fresh(0);
p = await box();
const sel = await page.evaluate(() => {
  const t = document.querySelector('#toast-wrap .toast');
  const r = document.createRange();
  r.selectNodeContents(t);
  const s = window.getSelection();
  s.removeAllRanges(); s.addRange(r);
  t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return !!document.querySelector('#toast-wrap .toast:not(.out)');
});
ok('виділений текст не зникає від кліку', sel);
await page.evaluate(() => window.getSelection().removeAllRanges());

/* ── 5. затиснутий можна читати ── */
await fresh(0);
p = await box();
await page.mouse.move(p.x, p.y);
await page.mouse.down();
await page.waitForTimeout(HOLD + 120);
const css = await page.evaluate(() => {
  const t = document.querySelector('#toast-wrap .toast.is-held');
  const c = getComputedStyle(t);
  return { sel: c.userSelect || c.webkitUserSelect, over: c.overflowY, cur: c.cursor };
});
await page.mouse.up();
ok('текст можна виділяти', css.sel === 'text', css);
ok('довгий текст прокручується', css.over === 'auto', css);
ok('і курсор уже не «клікни мене»', css.cur !== 'pointer', css);

/* ── 6. слухачі вікна не лишаються ──
   Їх стільки ж, скільки тостів за сеанс. Перевіряємо не лічильником
   (його немає), а поведінкою: прибраний тост не має реагувати на
   відпускання десь на сторінці. */
const leak = await page.evaluate(async () => {
  document.querySelectorAll('#toast-wrap .toast').forEach(t => t.remove());
  let threw = '';
  window.onerror = e => { threw = String(e); };
  const el = toast('x', '', 0);
  el.dispatchEvent(new PointerEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
  return threw;
});
ok('після прибирання події вікна нікого не чіпають', leak === '', leak);

await done(browser, srv, errs);
