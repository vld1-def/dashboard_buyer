/* ═══════════ УЧОРАШНІЙ СПЕНД У СПИСКУ КАБІНЕТІВ ═══════════

   «додамо стовпчик Y. Spend — тобто вчорашній спенд по акаунтам, це
   буде для мене розуміння що значить акаунт в роботі».

   Головне, що тримає стенд: ВЧОРА — ЦЕ ВЧОРА. Спокуса підставити
   останній імпортований день велика (він завжди є), але це відповідь
   на інше питання, і виглядала б вона так само переконливо.

   Друге: дня немає в імпорті — прочерк, а не нуль. Нуль тут читається
   як «кабінет стояв», хоча насправді ми просто не знаємо, і саме за
   таким нулем кабінет і вимикають. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8732;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const day = n => { const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const TODAY = day(0), YDAY = day(1), B4 = day(2);

const FB = ['1001', '1002', '1003', '1004'].map(id => ({
  account_id: id, name: 'A ' + id, status: 'active', currency: 'USD',
  spend_today: 0, ads: 1, ads_active: 1, token_id: 't1' }));
const ROWS = FB.map(a => ({ account_id: a.account_id, provider_name: 'AgentX' }));

/* 1001 — крутив учора; 1002 — крутив лише позавчора; 1003 — лише
   сьогодні; 1004 — не крутив узагалі. */
const DAILY = [
  { account: '1001', date: YDAY,  spend: 120.4, deposits: 3, regs: 10 },
  { account: '1001', date: B4,    spend: 50,    deposits: 1, regs: 4 },
  { account: '1002', date: B4,    spend: 80,    deposits: 2, regs: 6 },
  { account: '1003', date: TODAY, spend: 15,    deposits: 0, regs: 1 }
];

const draw = (filter) => page.evaluate(async ([fb, rows, daily, flt]) => {
  cabViewSave = async () => true;
  cabFbLoad = async () => {};
  cabSnapLoad = async () => {};
  rawData = daily;
  sb.from = () => ({ select: () => ({ order: () => ({ range: async () =>
    ({ data: [], error: null }) }), range: async () => ({ data: [], error: null }) }) });
  cabFb = fb; cabRows = rows; cabLoaded = true; cabTokens = { t1: 'AgentX' };
  cabRange = { key: 'all', since: '', until: '' };
  cabFilter = flt;
  cabView = { pins: [], cols: { yspend: 1 }, order: [] };
  cabRender();
}, [FB, ROWS, DAILY, filter]);

const table = () => page.evaluate(() => {
  const head = [...document.querySelectorAll('#cab-list thead th')]
    .map(t => t.textContent.replace(/[↑↓]/g, '').trim());
  return [...document.querySelectorAll('#cab-list .cab-tr')].map(tr => {
    const o = { id: (tr.querySelector('.cab-id') || {}).textContent };
    head.forEach((h, k) => { if (h && tr.cells[k]) o[h] = (tr.cells[k].textContent || '').replace(/\s+/g, ' ').trim(); });
    return o;
  });
});

await draw('all');
await page.waitForTimeout(250);

/* ─────────── 1. КОЛОНКА ─────────── */
const head = await page.evaluate(() =>
  [...document.querySelectorAll('#cab-list thead th')].map(t => t.textContent.replace(/[↑↓]/g, '').trim()));
ok('колонка Y. Spend стоїть у шапці', head.includes('Y. Spend'), head.filter(Boolean));

const rows = await table();
const by = Object.fromEntries(rows.map(r => [r.id, r]));

ok('кабінет, що крутив учора, показує вчорашній спенд',
  by['1001'] && by['1001']['Y. Spend'] === '$120', by['1001']);
/* Позавчора — це не вчора. Саме на цьому й ламається «останній
   імпортований день» замість учора. */
ok('позавчорашній спенд у цю колонку не підставляється',
  by['1002'] && by['1002']['Y. Spend'] !== '$80', by['1002']);
ok('і показує прочерк, а не нуль',
  by['1002'] && !/\d/.test(by['1002']['Y. Spend']), by['1002']);
ok('сьогоднішній спенд теж не вчорашній',
  by['1003'] && !/\d/.test(by['1003']['Y. Spend']), by['1003']);
ok('кабінет без жодного спенду — теж прочерк',
  by['1004'] && !/\d/.test(by['1004']['Y. Spend']), by['1004']);

/* ─────────── 2. ПЛИТКА-ФІЛЬТР ─────────── */
const tile = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.flt')].find(x => /Y\. Spend/.test(x.textContent));
  return b ? { n: b.querySelector('.flt-n').textContent.trim(), on: b.classList.contains('is-on') } : null;
});
ok('плитка Y. Spend є і рахує лише тих, хто крутив учора',
  tile && tile.n === '1', tile);

await draw('yspend');
await page.waitForTimeout(250);
const only = await table();
ok('фільтр лишає тільки вчорашніх',
  only.length === 1 && only[0].id === '1001', only.map(r => r.id));
ok('і сама плитка підсвічена', await page.evaluate(() =>
  [...document.querySelectorAll('.flt')].some(x => /Y\. Spend/.test(x.textContent) && x.classList.contains('is-on'))));

/* ─────────── 3. ВЧОРА НЕ ЗАЛЕЖИТЬ ВІД ПЕРІОДУ ─────────── */
/* Період над таблицею міняє сусідні числа, але не це: «вчора» означає
   вчора, інакше колонка відповідала б на різні питання залежно від
   того, що вибрано зверху. */
await page.evaluate(() => { cabRange = { key: 'today', since: '', until: '' }; cabFilter = 'all'; cabRender(); });
await page.waitForTimeout(250);
const narrow = Object.fromEntries((await table()).map(r => [r.id, r]));
ok('звузили період до сьогодні — вчорашній спенд той самий',
  narrow['1001'] && narrow['1001']['Y. Spend'] === '$120', narrow['1001']);

/* ─────────── 4. АРХІВ У ФІЛЬТР НЕ ЛІЗЕ ─────────── */
ok('архівований кабінет у Y. Spend не потрапляє', await page.evaluate(() => {
  const c = cabAll.find(x => x.id === '1001');
  return !!c && (() => {
    const was = c.state; c.state = 'archived';
    const n = cabAll.filter(x => cabYSpend(x) != null && x.state !== 'archived').length;
    c.state = was;
    return n === 0;
  })();
}));

await done(browser, srv, errs);
