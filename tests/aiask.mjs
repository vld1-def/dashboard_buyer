/* ═══════════ АСИСТЕНТ: ЧИСЛА РАХУЄ ДАШБОРД ═══════════

   Модель віддає ПЛАН, числа складає браузер. Це не стиль — це єдина
   причина, чому відповіді можна вірити: план видно очима, а названу
   моделлю суму перевірити можна лише порахувавши самому.

   Стенд тримає рівно це:
     • план перевіряється по справжніх стовпцях, а не на слово;
     • підрахунок правильний там, де легко збрехати: ціна події це
       сума/сума, порівняння чисел числами, групи без значення в хвіст;
     • нуль рядків не виглядає як нуль суми;
     • у модель їдуть назви стовпців і ЖОДНОГО значення. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8139;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* Набір «як у житті»: гроші рядком із валютою, статус словом,
   порожні комірки, дата. */
const ROWS = [
  { Site: 'a.site', Status: 'Approved', Amount: '$1,200.50', Deps: '3', Geo: 'KG', Day: '2026-10-01' },
  { Site: 'b.site', Status: 'Decline',  Amount: '$900',      Deps: '0', Geo: 'KG', Day: '2026-10-01' },
  { Site: 'c.site', Status: 'Approved', Amount: '$300',      Deps: '1', Geo: 'PL', Day: '2026-10-02' },
  { Site: 'd.site', Status: 'approved', Amount: '',          Deps: '2', Geo: 'PL', Day: '2026-10-02' },
  { Site: 'e.site', Status: 'Hold',     Amount: '$100',      Deps: '',  Geo: 'UZ', Day: '2026-10-03' }
];

const setup = () => page.evaluate(rows => {
  window.__sent = [];
  window.__plan = null;
  // Свій набір замість відкритого файлу: стенд перевіряє рахувальник.
  window.shDataset = () => ({
    id: 'sheet', title: 'report.csv',
    cols: [{ name: 'Site', kind: 'text' }, { name: 'Status', kind: 'text' },
           { name: 'Amount', kind: 'num' }, { name: 'Deps', kind: 'num' },
           { name: 'Geo', kind: 'text' }, { name: 'Day', kind: 'date' }],
    rows: rows.map(r => ({ ...r })),
    num: null
  });
  rawData = [];
  window.creativesRawData = [];
  aqCall = async body => {
    window.__sent.push(body);
    return { plan_raw: JSON.stringify(window.__plan), model: 'claude-haiku-5-5',
             cost_usd: 0.00012, left_today: 99, problems: [] };
  };
  aqOpen();
}, rows => rows);

await page.evaluate(rows => {
  window.__rows = rows;
}, ROWS);
await page.evaluate(() => {
  window.__setup = () => {
    window.__sent = [];
    window.shDataset = () => ({
      id: 'sheet', title: 'report.csv',
      cols: [{ name: 'Site', kind: 'text' }, { name: 'Status', kind: 'text' },
             { name: 'Amount', kind: 'num' }, { name: 'Deps', kind: 'num' },
             { name: 'Geo', kind: 'text' }, { name: 'Day', kind: 'date' }],
      rows: window.__rows.map(r => ({ ...r })),
      num: null
    });
    rawData = [];
    window.creativesRawData = [];
    aqCall = async body => {
      window.__sent.push(body);
      return { plan_raw: JSON.stringify(window.__plan), model: 'claude-haiku-5-5',
               cost_usd: 0.00012, left_today: 99, problems: [] };
    };
  };
  window.__setup();
  aqOpen();
});

const askWith = (plan, q) => page.evaluate(async ([p, question]) => {
  window.__plan = p;
  document.getElementById('aq-q').value = question || 'питання';
  await aqAsk();
  const out = document.getElementById('aq-out');
  return { txt: out.textContent, html: out.innerHTML,
           // Саме число читаємо з його елемента: у textContent сусідні
           // числа злипаються («…зі 53…»), і перевірка по тексту
           // проходила б випадково.
           big: (out.querySelector('.aq-big') || {}).textContent || '' };
}, [plan, q]);

/* ─────────── у модель їдуть назви, не дані ─────────── */
await askWith({ set: 'sheet', metric: { op: 'count' } }, 'скільки рядків');
const sent = await page.evaluate(() => window.__sent[0]);
ok('у модель пішло питання і набори', sent.action === 'plan' && sent.sets.length === 1, sent);
ok('назви стовпців і їхній вид — так',
  JSON.stringify(sent.sets[0].cols.map(c => c.name))
    === JSON.stringify(['Site', 'Status', 'Amount', 'Deps', 'Geo', 'Day']), sent.sets[0].cols);
ok('жодного значення з таблиці — ні',
  !JSON.stringify(sent).includes('a.site') && !JSON.stringify(sent).includes('1,200')
  && !JSON.stringify(sent).includes('Approved'), JSON.stringify(sent).slice(0, 200));

/* ─────────── сума без статуса Decline ─────────── */
const r1 = await askWith({ set: 'sheet', where: [{ col: 'Status', op: 'ne', val: 'Decline' }],
  metric: { op: 'sum', col: 'Amount' }, say: 'сума без відмов' }, 'сума Amount без Decline');
ok('сума порахована без відкинутого рядка, з копійками', r1.big === '1,600.5', r1.big);
ok('на екрані стоїть план, за яким рахували',
  /сума Amount/.test(r1.txt) && /Status ≠ Decline/.test(r1.txt), r1.txt.slice(0, 200));
ok('видно, скільки рядків узято', /4 рядк\. зі 5/.test(r1.txt), r1.txt.slice(0, 200));
ok('сказано, що рахував дашборд, а не модель',
  /порахував дашборд/.test(r1.txt), r1.txt.slice(-200));
ok('як зрозуміли питання — окремим рядком', /Як я зрозумів/.test(r1.txt), r1.txt.slice(0, 300));

/* Регістр не має значення: «approved» і «Approved» — те саме слово. */
const r2 = await askWith({ set: 'sheet', where: [{ col: 'Status', op: 'eq', val: 'approved' }],
  metric: { op: 'count' } }, 'скільки approved');
ok('порівняння тексту без оглядки на регістр', r2.big === '3', r2.big);

/* ─────────── ціна події: сума/сума, а не середнє часток ─────────── */
const r3 = await askWith({ set: 'sheet', group: 'Geo',
  metric: { op: 'per', num: 'Amount', den: 'Deps' }, sort: 'asc', limit: 10 }, 'CPA по гео');
ok('ціна події — сума на суму', /700\.17|700\.2/.test(r3.txt), r3.txt.slice(0, 300));
ok('групи є в таблиці', /KG/.test(r3.txt) && /PL/.test(r3.txt), r3.txt.slice(0, 300));
/* UZ має $100 і жодного депу: ціни немає. Такий рядок при сортуванні
   «найдешевше» не має стояти першим — інакше «найкращий CPA» завжди
   вертав би те, де конверсій нема зовсім. */
ok('група без значення пішла в хвіст, а не в перший рядок', await page.evaluate(() => {
  const ks = [...document.querySelectorAll('#aq-out .aq-tbl tbody tr')]
    .map(tr => tr.firstElementChild.textContent.trim());
  return ks[ks.length - 1] === 'UZ' && ks[0] !== 'UZ';
}));

/* ─────────── порівняння чисел числами ─────────── */
const r4 = await askWith({ set: 'sheet', where: [{ col: 'Amount', op: 'gt', val: '150' }],
  metric: { op: 'count' } }, 'скільки більше 150');
ok('«$1,200.50» більше за 150, а «$100» — ні', r4.big === '3', r4.big);

/* ─────────── нуль рядків ≠ нуль суми ─────────── */
const r5 = await askWith({ set: 'sheet', where: [{ col: 'Status', op: 'eq', val: 'Declined' }],
  metric: { op: 'sum', col: 'Amount' } }, 'сума по Declined');
ok('нічого не знайшлось — кажемо це, а не показуємо нуль',
  /жоден рядок/.test(r5.txt) && !/aq-big/.test(r5.html), r5.txt.slice(0, 260));
ok('і показуємо, що справді лежить у стовпці',
  /Decline/.test(r5.txt) && /Hold/.test(r5.txt) && /Approved/.test(r5.txt), r5.txt.slice(0, 300));

/* ─────────── план перевіряється, а не виконується на слово ─────────── */
const r6 = await askWith({ set: 'sheet', metric: { op: 'sum', col: 'Revenue' } }, 'сума Revenue');
ok('стовпця немає — кажемо це й перелічуємо наявні',
  /немає стовпця «Revenue»/.test(r6.txt) && /Amount/.test(r6.txt), r6.txt.slice(0, 260));

const r7 = await askWith({ set: 'sheet', where: [{ col: 'Status', op: 'regex', val: '.*' }],
  metric: { op: 'count' } }, 'щось дивне');
ok('невідома умова не виконується', /невідома умова/.test(r7.txt), r7.txt.slice(0, 200));

const r8 = await askWith({ set: 'sheet', metric: { op: 'eval', col: 'Amount' } }, 'щось дивне');
ok('невідомий підрахунок не виконується', /невідомий підрахунок/.test(r8.txt), r8.txt.slice(0, 200));

const r9 = await askWith({ error: 'у даних немає такого стовпця' }, 'питання не по темі');
ok('модель сказала, що не може — показуємо це як є',
  /немає такого стовпця/.test(r9.txt), r9.txt.slice(0, 200));

/* ─────────── коли питати нічого ─────────── */
ok('без відкритих даних асистент не вдає, що щось може', await page.evaluate(() => {
  window.shDataset = () => null;
  rawData = [];
  window.creativesRawData = [];
  aqOpen();
  const t = document.getElementById('aq-sets').textContent;
  return /Немає чого питати/.test(t) && /Google-таблицю в рамці/.test(t);
}));

await done(browser, srv, errs);
