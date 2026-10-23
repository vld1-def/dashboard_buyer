/* ═══════════ КЛІК ПО КАРТЦІ ТЕКСТУ КОПІЮЄ ═══════════

   «зроби в текстах, щоб не по кнопці копіювати а на цілий блок тексту
   клікати і щоб копіювалось» — кнопка «Копі» була розміром у два
   слова, а клікали по самому тексту. Тепер клікабельна вся картка.

   Стенд тримає те, що велика клікабельна площа ламає найчастіше:
   копіюється саме текст цієї картки (а не сусідньої і не підпис),
   правка й видалення не копіюють, виділення уривка лишається
   виділенням, підтвердження видно, і кнопки «Копі» більше немає. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8143;
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

const BANK = [
  { id: 't1', geo: 'KG', cat: 'push', lang: 'ru', title: 'Перший',
    text: 'Забери бонус сьогодні\nдругий рядок', ua: 'про бонус' },
  { id: 't2', geo: 'KG', cat: 'push', lang: 'ru', title: 'Другий', text: 'Виплата за 10 хвилин' },
  { id: 't3', geo: 'KG', cat: 'push', lang: 'ru', title: 'Порожній', text: '' }
];

await page.evaluate(bank => {
  txItems = bank.map(x => ({ ...x }));
  txGeo = 'KG'; txCat = 'push'; txEditId = null;
  document.getElementById('texts-modal').classList.remove('hidden');
  txRenderTree(); txRender();
}, BANK);

const cards = await page.evaluate(() => document.querySelectorAll('#tx-list .tx-card').length);
ok('кожен текст — одна клікабельна картка', cards === 3, cards);

ok('окремої кнопки «Копі» більше немає', await page.evaluate(() =>
  [...document.querySelectorAll('#tx-list button')]
    .every(b => !/Копі/.test(b.textContent))));
ok('копіювання тепер знає, по чому клікнули', await page.evaluate(() =>
  typeof txCopy === 'function' && txCopy.length === 3));

ok('курсор і підпис кажуть, що картка клікабельна', await page.evaluate(() => {
  const c = document.querySelector('#tx-list .tx-card');
  return c.getAttribute('title') === 'Клік копіює текст'
      && !!c.querySelector('.tx-card-hint');
}));
ok('у стилях .tx-card є курсор-рука', await page.evaluate(() =>
  [...document.styleSheets].some(ss => {
    try { return [...ss.cssRules].some(r => /^\.tx-card\b/.test(r.selectorText || '')
                                         && /cursor:\s*pointer/.test(r.cssText)); }
    catch (e) { return false; }
  })));

/* Клік по будь-якому місці картки — і по абзацу всередині теж. */
const one = await page.evaluate(async () => {
  window.__copied = [];
  const c = document.querySelectorAll('#tx-list .tx-card')[0];
  c.querySelector('p').click();
  await new Promise(r => setTimeout(r, 60));
  return { copied: window.__copied.slice(), glow: c.style.boxShadow,
           toast: document.body.textContent.includes('Скопійовано') };
});
ok('клік по абзацу копіює текст картки повністю, з переносом рядка',
  JSON.stringify(one.copied) === JSON.stringify(['Забери бонус сьогодні\nдругий рядок']), one.copied);
// Браузер віддає колір уже як rgb, не як #22C55E.
ok('картка підсвічується на мить', /34,\s*197,\s*94/.test(one.glow), one.glow);
ok('є тост із підтвердженням', one.toast);

ok('підпис українською в буфер не їде', await page.evaluate(async () => {
  window.__copied = [];
  document.querySelectorAll('#tx-list .tx-card')[0].click();
  await new Promise(r => setTimeout(r, 60));
  return window.__copied.length === 1 && !window.__copied[0].includes('про бонус');
}));

ok('клік по другій картці копіює її, а не першу', await page.evaluate(async () => {
  window.__copied = [];
  document.querySelectorAll('#tx-list .tx-card')[1].click();
  await new Promise(r => setTimeout(r, 60));
  return JSON.stringify(window.__copied) === JSON.stringify(['Виплата за 10 хвилин']);
}));

/* Порожній текст: копіювати нічого, і тост про це був би брехнею. */
ok('картка з порожнім текстом нічого не копіює', await page.evaluate(async () => {
  window.__copied = [];
  document.querySelectorAll('#tx-list .tx-card')[2].click();
  await new Promise(r => setTimeout(r, 60));
  return window.__copied.length === 0;
}));

/* Правка й видалення — теж у картці. Вони не мають копіювати. */
ok('олівець відкриває редактор і не копіює', await page.evaluate(async () => {
  window.__copied = [];
  const c = document.querySelectorAll('#tx-list .tx-card')[0];
  c.querySelectorAll('button')[0].click();
  await new Promise(r => setTimeout(r, 60));
  return window.__copied.length === 0
      && !document.getElementById('tx-editor').classList.contains('hidden');
}));

ok('хрестик не копіює', await page.evaluate(async () => {
  window.__copied = [];
  txDelete = () => {};  // сам діалог видалення тут не перевіряємо
  const c = document.querySelectorAll('#tx-list .tx-card')[0];
  c.querySelectorAll('button')[1].click();
  await new Promise(r => setTimeout(r, 60));
  return window.__copied.length === 0;
}));

/* Виділив уривок руками — значить, хоче саме уривок. */
ok('клік, яким закінчилось виділення, не підміняє буфер', await page.evaluate(async () => {
  window.__copied = [];
  const c = document.querySelectorAll('#tx-list .tx-card')[0];
  const p = c.querySelector('p');
  const r = document.createRange();
  r.setStart(p.firstChild, 0); r.setEnd(p.firstChild, 6);
  const s = window.getSelection();
  s.removeAllRanges(); s.addRange(r);
  c.click();
  await new Promise(r2 => setTimeout(r2, 60));
  s.removeAllRanges();
  return window.__copied.length === 0;
}));

/* З клавіатури картка теж досяжна: фокус і Enter. */
ok('картка в табуляції, Enter копіює', await page.evaluate(async () => {
  window.__copied = [];
  const c = document.querySelectorAll('#tx-list .tx-card')[1];
  const tab = c.getAttribute('tabindex') === '0';
  c.focus();
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  return tab && JSON.stringify(window.__copied) === JSON.stringify(['Виплата за 10 хвилин']);
}));

ok('інша клавіша нічого не копіює', await page.evaluate(async () => {
  window.__copied = [];
  const c = document.querySelectorAll('#tx-list .tx-card')[1];
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  return window.__copied.length === 0;
}));

await done(browser, srv, errs);
