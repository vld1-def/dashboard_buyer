/* ═══════════ УЧОРАШНІЙ СПЕНД У ВІКНІ ACCOUNTS ═══════════

   «додамо стовпчик Y. Spend — тобто вчорашній спенд по акаунтам, це
   буде для мене розуміння що значить акаунт в роботі».

   Статус каже, чи кабінет живий. Він не каже, чи ним користуються:
   «Активний» однаково стоїть і на тому, що крутив учора сотню, і на
   тому, що лежить третій тиждень. Різниця між ними — саме це число.

   Стенд тримає дві речі, на яких це найлегше зіпсувати.

   ВЧОРА — ЦЕ ВЧОРА. Спокуса підставити останній імпортований день
   велика (він завжди знайдеться), але це відповідь на інше питання, і
   виглядала б вона так само переконливо.

   ПРОЧЕРК, А НЕ НУЛЬ. Дня немає в імпорті — ми не знаємо; нуль тут
   читався б як «кабінет стояв», а саме за таким нулем його й
   вимикають. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8149;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const day = n => { const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const TODAY = day(0), YDAY = day(1), B4 = day(2);

/* 1001 крутив учора; 1002 — лише позавчора; 1003 — лише сьогодні;
   1004 не крутив узагалі. Статуси навмисно різні: число і статус —
   різні питання, і плутати їх не можна. */
const ROWS = [
  { id: 'r1', account_id: '1001', provider_name: 'AgentX', profile: 'p1', timezone: 3, status: 'active' },
  { id: 'r2', account_id: '1002', provider_name: 'AgentX', profile: 'p2', timezone: 3, status: 'active' },
  { id: 'r3', account_id: '1003', provider_name: 'AgentY', profile: 'p3', timezone: 0, status: 'ban' },
  { id: 'r4', account_id: '1004', provider_name: 'AgentY', profile: 'p4', timezone: 0, status: 'problem' }
];
const DAILY = [
  { account: '1001', date: YDAY,  spend: 120.4 },
  { account: '1001', date: YDAY,  spend: 10 },      // дві імпортні стрічки за той самий день
  { account: '1001', date: B4,    spend: 50 },
  { account: '1002', date: B4,    spend: 80 },
  { account: '1003', date: TODAY, spend: 15 }
];

const draw = (filter) => page.evaluate(([rows, daily, flt]) => {
  rawData = daily;
  accRows = rows; accHasStatusCol = true; accFilter = flt;
  document.getElementById('accounts-modal').classList.remove('hidden');
  renderAccountsModal();
}, [ROWS, DAILY, filter]);

const table = () => page.evaluate(() => {
  const body = document.getElementById('accounts-modal-body');
  const head = [...body.querySelectorAll(':scope > div:first-child > span')]
    .map(s => s.textContent.replace(/\(.*\)/, '').trim());
  return {
    head,
    rows: [...body.querySelectorAll('.acc-row')].map(tr => {
      const cells = [...tr.children];
      const o = { id: cells[0].textContent.trim() };
      const i = head.indexOf('Y. Spend');
      o.y = i >= 0 && cells[i] ? cells[i].textContent.trim() : null;
      o.yNone = i >= 0 && cells[i] ? cells[i].classList.contains('is-none') : null;
      return o;
    })
  };
});

await draw('');
await page.waitForTimeout(150);

/* ─────────── 1. КОЛОНКА ─────────── */
const t = await table();
ok('колонка Y. Spend стоїть у шапці', t.head.includes('Y. Spend'), t.head);
/* Колонку «Додано» додає збірка — вона мусить лишитись на місці. */
ok('колонка «Додано» нікуди не поділась', t.head.includes('Added'), t.head);
ok('кількість клітинок у рядку збігається з кількістю заголовків',
  await page.evaluate(() => {
    const b = document.getElementById('accounts-modal-body');
    const h = b.querySelectorAll(':scope > div:first-child > span').length;
    return [...b.querySelectorAll('.acc-row')].every(r => r.children.length === h);
  }));

const by = Object.fromEntries(t.rows.map(r => [r.id, r]));
/* Дві стрічки за вчора — одне число. */
ok('учорашній спенд підсумований по кабінету', by['1001'] && by['1001'].y === '$130', by['1001']);
ok('позавчорашній у цю колонку не підставляється',
  by['1002'] && by['1002'].yNone === true, by['1002']);
ok('сьогоднішній теж не вчорашній', by['1003'] && by['1003'].yNone === true, by['1003']);
ok('кабінет без жодного спенду — прочерк, а не нуль',
  by['1004'] && by['1004'].yNone === true && !/\d/.test(by['1004'].y), by['1004']);

/* ─────────── 2. ПЛИТКА-ФІЛЬТР ─────────── */
const tiles = () => page.evaluate(() =>
  [...document.querySelectorAll('.acc-tile')].map(b => ({
    label: b.querySelector('.acc-tile-l').textContent.trim(),
    n: b.querySelector('.acc-tile-n').textContent.trim(),
    on: b.classList.contains('is-on') })));

const tl = await tiles();
/* Підписи англійські: сторінку збирає build/i18n.py, і в ній
   «Усі/Активний/Бан/Проблема» стають All/Active/Ban/Issue. */
ok('плитки статусів лишились на місці',
  ['All', 'Active', 'Ban', 'Issue'].every(l => tl.some(x => x.label === l)),
  tl.map(x => x.label));
/* Плитка стоїть ПІСЛЯ статусів: вона відповідає на інше питання і
   перетинається з будь-яким із них. */
ok('плитка Y. Spend стоїть останньою', tl[tl.length - 1].label === 'Y. Spend', tl.map(x => x.label));
ok('і рахує лише тих, хто крутив учора',
  tl[tl.length - 1].n === '1', tl[tl.length - 1]);

await draw('yspend');
await page.waitForTimeout(150);
const only = await table();
ok('фільтр лишає тільки вчорашніх',
  only.rows.length === 1 && only.rows[0].id === '1001', only.rows.map(r => r.id));
ok('і плитка підсвічена',
  (await tiles()).find(x => x.label === 'Y. Spend').on === true);

/* Статусний фільтр від цього не постраждав. */
await draw('ban');
await page.waitForTimeout(150);
ok('фільтр по статусу працює як раніше', await page.evaluate(() =>
  [...document.querySelectorAll('.acc-row')].map(r => r.children[0].textContent.trim()).join() === '1003'));

/* ─────────── 3. КОЛИ ВЧОРА НІХТО НЕ КРУТИВ ─────────── */
/* Порожньо буває з двох причин, і сказати треба обидві: або справді
   ніхто, або імпорт за вчора ще не залитий. */
ok('порожній фільтр пояснює обидві причини', await page.evaluate(() => {
  rawData = [];
  accFilter = 'yspend';
  renderAccountsModal();
  return /імпорт за вчора ще не залитий|not been imported|no import/i
    .test(document.getElementById('accounts-modal-body').textContent);
}), await page.evaluate(() => document.getElementById('accounts-modal-body').textContent.trim()));

ok('без даних плитка показує нуль', await page.evaluate(() =>
  [...document.querySelectorAll('.acc-tile')].pop().querySelector('.acc-tile-n').textContent.trim() === '0'));

await done(browser, srv, errs);
