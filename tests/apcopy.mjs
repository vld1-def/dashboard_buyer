/* ═══════════ КЛІК ПО НЕЙМІНГУ В ПРІЛКАХ КОПІЮЄ ═══════════

   «В прілках у неймінгу при кліку зроби щоб копіювалось так як в пва
   зробили» — раніше поруч висіла окрема кнопка, і копіювати треба було
   влучити в неї. Тепер клікабельне саме значення. Стенд тримає три
   речі: що копіюється повний текст (а не обрізаний на екрані), що клік
   не тягне за собою відкриття карточки, і що людина бачить
   підтвердження. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8126;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, {
  init: () => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: v => { window.__copied.push(v); return Promise.resolve(); } },
      configurable: true
    });
  }
});

ok('кнопки-копіювалки більше немає', await page.evaluate(() => typeof copyBtn === 'undefined'));
ok('apCopy є', await page.evaluate(() => typeof apCopy === 'function'));

/* Довге значення на екрані обрізане класом truncate, тож копіювати
   треба data-v, а не те, що видно. */
const r = await page.evaluate(async () => {
  const d = document.createElement('div');
  d.innerHTML = `<div id="ap-host"><span id="ap-val" class="ap-copy cursor-pointer truncate"
      data-v="pwa_long_naming_value_123" onclick="apCopy(event, this)">pwa_long…</span></div>`;
  document.body.appendChild(d);
  let bubbled = 0;
  document.getElementById('ap-host').addEventListener('click', () => bubbled++);
  document.getElementById('ap-val').click();
  await new Promise(r => setTimeout(r, 60));
  const el = document.getElementById('ap-val');
  return { copied: window.__copied.slice(), bubbled, glow: el.style.boxShadow,
           cls: el.className, toast: document.body.textContent.includes('Скопійовано') };
});
ok('копіюється повне значення з data-v, а не обрізаний текст',
  JSON.stringify(r.copied) === JSON.stringify(['pwa_long_naming_value_123']), r.copied);
ok('клік не доходить до карточки', r.bubbled === 0, r.bubbled);
// Браузер віддає колір уже як rgb, не як #22C55E.
ok('значення підсвічується на мить', /34,\s*197,\s*94/.test(r.glow), r.glow);
ok('є тост із підтвердженням', r.toast);
ok('курсор показує, що це клікабельне', /cursor-pointer/.test(r.cls), r.cls);

/* Порожнє значення не чіпаємо: копіювати нічого, і тост про порожнє
   копіювання був би брехнею. */
ok('порожнє значення нічого не копіює', await page.evaluate(async () => {
  window.__copied = [];
  const s = document.createElement('span');
  s.setAttribute('data-v', '');
  document.body.appendChild(s);
  await apCopy(new MouseEvent('click'), s);
  return window.__copied.length === 0;
}));

ok('в розмітці прілок клікабельні і неймінг, і діплінк, і сабки',
  await page.evaluate(() => (document.documentElement.innerHTML
    .match(/apCopy\(event, this\)/g) || []).length >= 3));
ok('у hover-стилі для .ap-copy є підсвітка',
  await page.evaluate(() => [...document.styleSheets].some(ss => {
    try { return [...ss.cssRules].some(r => /\.ap-copy:hover/.test(r.cssText)); }
    catch (e) { return false; }
  })));

await done(browser, srv, errs);
