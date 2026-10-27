/* ═══════════ CREATIVE ANALYZER: КЛІКИ Й CPC ПО ВОРОНКАХ ═══════════

   Панель «На яких воронках крутився» рахувала кліки (m.cl) і не
   показувала їх. Спенд і депи були, а скільки людей узагалі клікнуло й
   чого коштував клік — ні, при тому що це перший крок воронки й перше
   місце, де видно мертвий креатив.

   Стенд тримає:
     • колонка кліків і CPC стоїть, і стоїть ДО інсталів — у тому ж
       порядку, що й сама воронка;
     • CPC не округлюється до «$0.00»: клік коштує центи, і два знаки
       перетворили б півкопійки на «безкоштовно»;
     • нема кліків — нема й CPC: «—», а не нуль;
     • колонки Link clicks у звіті не було — панель про це й каже, бо
       нулі тут тоді не факт про креатив, а дірка в даних. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8142;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const paint = rows => page.evaluate(rows => {
  window.creativesRawData = rows;
  currentCreativeID = 'CR1';
  activeCrAcc = ''; activeCrGeo = '';
  const f = document.getElementById('cr-date-from'); if (f) f.value = '';
  const t = document.getElementById('cr-date-to');   if (t) t.value = '';
  crRenderFunnelsPanel();
  const el = document.getElementById('cr-panel-funnels');
  const head = [...el.querySelectorAll(':scope > div:first-child > span')].map(s => s.textContent.trim());
  const body = [...el.querySelectorAll(':scope > div:not(:first-child)')]
    .map(d => [...d.querySelectorAll(':scope > span')].map(s => s.textContent.trim()));
  return { head, body, cols: el.querySelector('div').className.match(/grid-cols-\d+/)[0],
           text: el.textContent.replace(/\s+/g, ' ').trim() };
}, rows);

const row = (funnel, o) => Object.assign(
  { date: '2026-10-20', cid: 'CR1', account: '111', geo: 'KG', funnel,
    spend: 0, clicks: 0, installs: 0, regs: 0, deps: 0 }, o);

/* ─────────── кліки на місці ─────────── */
const a = await paint([
  row('Mbank KG 10708', { spend: 120, clicks: 2400, installs: 60, regs: 30, deps: 6 }),
  row('Crazy Wheel KG',  { spend: 40,  clicks: 500,  installs: 10, regs: 4,  deps: 0 })
]);
ok('колонок стало вісім', a.cols === 'grid-cols-8', a.cols);
ok('кліки й CPC стоять одним заголовком, перед інсталами',
  JSON.stringify(a.head) === JSON.stringify(
    ['Funnel', 'Днів', 'Spend', 'Clicks / CPC', 'Inst / CPI', 'Reg / CPL', 'Dep / CPA']), a.head);
ok('кліки показані з розділювачем тисяч',
  /^2,400/.test(a.body[0][3]), a.body[0][3]);
ok('CPC = спенд / кліки', /\$0\.05$/.test(a.body[0][3]), a.body[0][3]);
ok('решта колонок не з\'їхала: інстали, реги, депи на своїх місцях',
  /^60 \$2\.00$/.test(a.body[0][4]) && /^30 \$4\.00$/.test(a.body[0][5])
  && /^6 \$20\.00$/.test(a.body[0][6]), a.body[0]);
ok('воронки лишились відсортовані за спендом',
  a.body[0][0] === 'Mbank KG 10708' && a.body[1][0] === 'Crazy Wheel KG', a.body.map(r => r[0]));

/* ─────────── дешевий клік не стає «безкоштовним» ─────────── */
const b = await paint([
  row('F cheap', { spend: 9, clicks: 3000, installs: 5, regs: 1, deps: 1 }),
  row('F dear',  { spend: 50, clicks: 100, installs: 5, regs: 1, deps: 1 })
]);
ok('звичайний клік — звичні два знаки', /\$0\.50$/.test(b.body[0][3]), b.body[0][3]);
ok('пів копійки за клік не стає «$0.00»',
  /<\$0\.01$/.test(b.body[1][3]), b.body[1][3]);

/* ─────────── нема кліків — нема CPC ─────────── */
const c = await paint([
  row('F one', { spend: 100, installs: 20, regs: 5, deps: 1 }),
  row('F two', { spend: 20,  installs: 4,  regs: 1, deps: 0 })
]);
ok('без кліків CPC — «—», а не нуль', /^0 —$/.test(c.body[0][3]), c.body[0][3]);
ok('і сказано, чому їх немає: у звіті не було колонки Link clicks',
  /Кліків у даних немає/.test(c.text) && /Link clicks/.test(c.text), c.text.slice(-220));

ok('там, де кліки є, цього пояснення немає', !/Кліків у даних немає/.test(a.text));
ok('найдешевший депозит лишився на місці', /Найдешевший депозит/.test(a.text), a.text.slice(-120));

await done(browser, srv, errs);
