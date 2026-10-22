/* ═══════════ АСИСТЕНТ: ЧИСЛА РАХУЄ ДАШБОРД ═══════════

   Модель віддає ПЛАН, числа складає браузер. Це не стиль — це єдина
   причина, чому відповіді можна вірити: план видно очима, а названу
   моделлю суму перевірити можна лише порахувавши самому.

   Стенд тримає рівно це:
     • план перевіряється по справжніх стовпцях, а не на слово;
     • підрахунок правильний там, де легко збрехати: ціна події це
       сума/сума, порівняння чисел числами, групи без значення в хвіст;
     • нуль рядків не виглядає як нуль суми;
     • у модель їдуть назви стовпців і ЖОДНОГО значення;
     • набір ВИБИРАЮТЬ списком, і в запит їде лише вибраний;
     • відповіді лежать стрічкою, попередні не зникають;
     • клік по стовпцю відповідає локально, без моделі. */
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

/* Відповідь — ОСТАННЯ булька від асистента в стрічці. Саме число
   читаємо з його елемента: у textContent сусідні числа злипаються
   («…4 з 5…»), і перевірка по тексту проходила б випадково. */
const askWith = (plan, q) => page.evaluate(async ([p, question]) => {
  window.__plan = p;
  const inp = document.getElementById('aq-q');
  inp.value = question || 'питання';
  await aqAsk();
  const bots = [...document.querySelectorAll('#aq-thread .aq-msg.is-bot')];
  const out = bots[bots.length - 1];
  return { txt: out.textContent, html: out.innerHTML,
           big: (out.querySelector('.aq-big') || {}).textContent || '',
           mine: ([...document.querySelectorAll('#aq-thread .aq-msg.is-me')].pop() || {}).textContent || '',
           bubbles: document.querySelectorAll('#aq-thread .aq-msg').length,
           left: inp.value };
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
/* Назва набору стоїть у шапці — у рядку плану вона була б тим самим
   зайвим текстом, через який на одне число припадало п'ять абзаців. */
ok('назву набору план не повторює', !/report\.csv/.test(r1.txt), r1.txt.slice(0, 200));
ok('видно, скільки рядків узято', /4 з 5 рядк\./.test(r1.txt), r1.txt.slice(0, 200));
ok('сказано, що рахував дашборд, а не модель',
  /рахував дашборд, модель склала план/.test(r1.txt), r1.txt.slice(-200));
ok('як зрозуміли питання — своїми словами моделі',
  /сума без відмов/.test(r1.txt), r1.txt.slice(0, 300));
/* Чат, а не один екран: своє питання лишається на місці, і попередні
   відповіді нікуди не зникають — інакше порівняти два числа нічим. */
ok('питання стало окремою булькою, а поле спорожніло',
  /сума Amount без Decline/.test(r1.mine) && r1.left === '', r1);
ok('стрічка росте, а не перемальовується', r1.bubbles >= 4, r1.bubbles);

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
  const bots = [...document.querySelectorAll('#aq-thread .aq-msg.is-bot')];
  const ks = [...bots[bots.length - 1].querySelectorAll('.aq-tbl tbody tr')]
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
  /Жодного рядка/.test(r5.txt) && !/aq-big/.test(r5.html), r5.txt.slice(0, 260));
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
/* ═══════════ ДНІ, КРЕАТИВИ, ДВА РОЗРІЗИ ═══════════

   Питання майже завжди про період і майже завжди про перетин: «яка
   воронка найкраще працювала по днях на такому-то лендінгу».

     • день — не число й не текст: «2026-10-15» числом не читається,
       тож «за останній тиждень» мовчки не знаходило б нічого;
     • два розрізи одним не підміниш: по днях без воронки видно лише
       підсумок дня, по воронках без днів — лише підсумок періоду;
     • значення, назване в питанні (лендінг, оффер), — це ФІЛЬТР, а не
       розріз. */
const DAYS = [
  { date: '2026-10-09', land: 'form-a', funnel: 'F1', spend: '10', deps: '1' },
  { date: '2026-10-15', land: 'form-a', funnel: 'F1', spend: '20', deps: '4' },
  { date: '2026-10-15', land: 'form-a', funnel: 'F2', spend: '30', deps: '2' },
  { date: '2026-10-16', land: 'form-b', funnel: 'F1', spend: '40', deps: '8' },
  { date: '2026-10-16', land: 'form-a', funnel: 'F2', spend: '50', deps: '5' }
];

const dayset = () => page.evaluate(rows => {
  window.__sent = [];
  window.shDataset = () => ({
    id: 'sheet', title: 'daily.csv',
    cols: [{ name: 'date', kind: 'date' }, { name: 'land', kind: 'text' },
           { name: 'funnel', kind: 'text' }, { name: 'spend', kind: 'num' },
           { name: 'deps', kind: 'num' }],
    rows: rows.map(r => ({ ...r })), num: null
  });
  rawData = []; window.creativesRawData = [];
  aqCall = async body => {
    window.__sent.push(body);
    return { plan_raw: JSON.stringify(window.__plan), model: 'claude-haiku-5-5',
             cost_usd: 0.0001, left_today: 9, problems: [] };
  };
  aqSetId = 'sheet';
  aqOpen();
}, DAYS);

await dayset();

/* Вид стовпця з днем — саме «date», і він їде в модель: інакше вона не
   знає, що з цим стовпцем можна робити діапазон. */
const kinds = await page.evaluate(async () => {
  window.__plan = { metric: { op: 'count' } };
  document.getElementById('aq-q').value = 'скільки рядків';
  await aqAsk();
  const sent = window.__sent[window.__sent.length - 1];
  return { cols: sent.sets[0].cols, today: sent.today };
});
ok('денний стовпець названо датою, а не текстом',
  (kinds.cols.find(c => c.name === 'date') || {}).kind === 'date', kinds.cols);
ok('сьогоднішній день їде в модель — інакше «за тиждень» нема від чого рахувати',
  /^\d{4}-\d{2}-\d{2}$/.test(kinds.today || ''), kinds.today);

const week = await askWith({ where: [{ col: 'date', op: 'ge', val: '2026-10-15' }],
  metric: { op: 'sum', col: 'spend' }, say: 'спенд за тиждень' }, 'спенд за останній тиждень');
ok('діапазон по днях рахується, а не мовчить', week.big === '140', week.big);

const until = await askWith({ where: [{ col: 'date', op: 'le', val: '2026-10-09' }],
  metric: { op: 'sum', col: 'spend' } }, 'спенд до 9-го');
ok('і межа «до» теж', until.big === '10', until.big);

/* ДВА РОЗРІЗИ: фільтр по лендінгу, пара день × воронка. */
const pair = await askWith({ where: [{ col: 'land', op: 'eq', val: 'form-a' }],
  group: 'date', group2: 'funnel',
  metric: { op: 'per', num: 'spend', den: 'deps' }, sort: 'asc', limit: 10 },
  'по днях яка воронка найкраще працювала на form-a');
ok('у таблиці два стовпці розрізу, а не склеєний один',
  /date/.test(pair.html) && /funnel/.test(pair.html)
  && /<td>2026-10-15<\/td><td>F1<\/td>/.test(pair.html.replace(/\s+/g, '')), pair.html.slice(0, 400));
ok('пари рахуються окремо: 2026-10-15 × F1 — це 5',
  /<td>2026-10-15<\/td><td>F1<\/td><tdclass="aq-n">5<\/td>/.test(pair.html.replace(/\s+/g, '')),
  pair.html.slice(0, 500));
ok('чужий лендінг у розріз не потрапив', !/form-b/.test(pair.txt) && !/<td>F1<\/td>.*40/.test(pair.html),
  pair.txt.slice(0, 200));
ok('план називає обидва розрізи', /по date × funnel/.test(pair.txt), pair.txt.slice(0, 200));
ok('і рядків узято лише з лендінга', /4 з 5 рядк\./.test(pair.txt), pair.txt.slice(0, 200));

/* Другий рівень не існує без першого, і той самий стовпець двічі — не
   розріз, а помилка плану. */
const solo = await askWith({ group2: 'funnel', metric: { op: 'count' } }, 'щось');
ok('group2 без group не створює привида розрізу', solo.big === '5', solo.big);
const same = await askWith({ group: 'funnel', group2: 'funnel', metric: { op: 'count' } }, 'щось');
ok('той самий стовпець двічі не подвоює таблицю',
  !/<th>funnel<\/th><th>funnel<\/th>/.test(same.html.replace(/\s+/g, '')), same.html.slice(0, 200));

/* Неіснуючий стовпець у другому рівні — та сама відмова, що й у першому. */
const badg2 = await askWith({ group: 'date', group2: 'нема', metric: { op: 'count' } }, 'щось');
ok('вигаданий стовпець у другому розрізі не виконується',
  /немає стовпця «нема»/.test(badg2.txt), badg2.txt.slice(0, 200));

// Повертаємо набір, на якому стоять решта перевірок.
await page.evaluate(() => { window.__setup(); aqSetId = 'sheet'; aqOpen(); });

/* ─────────── набір вибирають, а не називають ─────────── */
const picked = await page.evaluate(() => {
  window.__setup();
  rawData = [{ geo: 'KG', spend: 10, deps: 1 }, { geo: 'PL', spend: 20, deps: 2 }];
  aqOpen();
  const sel = document.getElementById('aq-set');
  return { opts: [...sel.options].map(o => o.textContent), val: sel.value };
});
ok('відкриті набори стоять списком у шапці',
  picked.opts.some(t => /report\.csv/.test(t)) && picked.opts.some(t => /daily_stats|днях/.test(t)),
  picked.opts);
ok('вибраний — перший', picked.val === 'sheet', picked.val);

const sw = await page.evaluate(async () => {
  aqPick('daily');
  window.__sent = [];
  window.__plan = { metric: { op: 'count' } };
  document.getElementById('aq-q').value = 'скільки рядків';
  await aqAsk();
  return { sent: window.__sent[0], note: document.getElementById('aq-sub').textContent };
});
ok('у модель їде ЛИШЕ вибраний набір',
  sw.sent.sets.length === 1 && sw.sent.sets[0].id === 'daily', sw.sent.sets);
ok('і стовпці саме його',
  sw.sent.sets[0].cols.some(c => c.name === 'spend')
  && !sw.sent.sets[0].cols.some(c => c.name === 'Amount'), sw.sent.sets[0].cols);
ok('скільки рядків і стовпців — у підписі вікна', /2 рядк/.test(sw.note), sw.note);

/* ═══════════ «ЯКЕ НАЙКРАЩЕ — РОЗПИШИ ЙОГО ДАНІ» ═══════════

   Питали про ОДИН креатив і його цифри — а отримували топ-10 з однією
   колонкою. Модель питання розуміла (так і писала в «say»), але плану
   не було чим це сказати: місце було рівно на одну цифру.

   І друге, гірше: «найдешевший депозит» без порога завжди вигравало
   те, де даних майже немає — вісім рядків і один депозит. Поріг
   рахується по СУМІ групи, бо where ріже рядки, а не групи. */
const CREO = [
  { cid: 'A', spend: '100', deps: '10', regs: '40' },
  { cid: 'A', spend: '40',  deps: '5',  regs: '12' },
  { cid: 'B', spend: '7',   deps: '1',  regs: '3'  },   // майже немає даних
  { cid: 'C', spend: '300', deps: '20', regs: '90' }
];

await page.evaluate(rows => {
  window.__sent = [];
  window.shDataset = () => ({
    id: 'sheet', title: 'creo.csv',
    cols: [{ name: 'cid', kind: 'text' }, { name: 'spend', kind: 'num' },
           { name: 'deps', kind: 'num' }, { name: 'regs', kind: 'num' }],
    rows: rows.map(r => ({ ...r })), num: null
  });
  rawData = []; window.creativesRawData = [];
  aqCall = async body => {
    window.__sent.push(body);
    return { plan_raw: JSON.stringify(window.__plan), model: 'claude-haiku-5-5',
             cost_usd: 0.0001, left_today: 9, problems: [] };
  };
  aqSetId = 'sheet';
  aqOpen();
}, CREO);

/* Один — це картка, а не таблиця з одного рядка. */
const one = await askWith({ group: 'cid', limit: 1, sort: 'asc',
  metric: { op: 'per', num: 'spend', den: 'deps' },
  metrics: [{ op: 'sum', col: 'spend' }, { op: 'sum', col: 'deps' },
            { op: 'sum', col: 'regs' }],
  having: { col: 'deps', op: 'ge', val: 5 },
  say: 'найдешевший депозит за місяць' }, 'яке крео найкраще, розпиши його дані');
ok('відповідь — картка одного, а не таблиця топ-10',
  /aq-card/.test(one.html) && !/aq-tbl/.test(one.html), one.html.slice(0, 200));
ok('названо саме того, хто виграв',
  /<p class="aq-h">A</.test(one.html), one.html.slice(0, 120));
ok('поріг відсіяв групу, де даних майже немає',
  !/aq-h">B/.test(one.html), one.html.slice(0, 200));
ok('у картці всі замовлені числа, а не одне',
  /spend \/ deps/.test(one.txt) && /сума spend/.test(one.txt)
  && /сума deps/.test(one.txt) && /сума regs/.test(one.txt), one.txt.slice(0, 300));
ok('ціна депозиту порахована сумою на суму',
  /9\.33/.test(one.txt), one.txt.slice(0, 200));
ok('і видно, з чого вона вийшла — інакше число перевірити нічим',
  /140 \/ 15/.test(one.txt), one.txt.slice(0, 300));
ok('поріг названо в плані — мовчазний відсів виглядає як «такого немає»',
  /лише де сума deps ≥ 5/.test(one.txt), one.txt.slice(0, 300));

/* Кілька — таблиця, але з усіма показниками поруч. */
const many = await askWith({ group: 'cid', limit: 10, sort: 'asc',
  metric: { op: 'per', num: 'spend', den: 'deps' },
  metrics: [{ op: 'sum', col: 'spend' }, { op: 'sum', col: 'deps' }] },
  'крео по ціні депозиту');
ok('кілька — це таблиця, і в ній колонка на кожен показник',
  /aq-tbl/.test(many.html) && /<th>сума spend<\/th>/.test(many.html.replace(/\s+/g, ' '))
  && /<th>сума deps<\/th>/.test(many.html.replace(/\s+/g, ' ')), many.html.slice(0, 400));
ok('без порога в хвіст іде той, де даних майже немає',
  /B/.test(many.txt), many.txt.slice(0, 200));

/* Межі: вигаданий стовпець у додатковому показнику — та сама відмова. */
const badm = await askWith({ group: 'cid', metric: { op: 'count' },
  metrics: [{ op: 'sum', col: 'немає' }] }, 'щось');
ok('вигаданий стовпець у додатковому показнику не виконується',
  /немає стовпця «немає»/.test(badm.txt), badm.txt.slice(0, 200));

const badh = await askWith({ group: 'cid', metric: { op: 'count' },
  having: { col: 'deps', op: 'regex', val: 5 } }, 'щось');
ok('невідомий поріг не виконується', /невідомий поріг/.test(badh.txt), badh.txt.slice(0, 200));

await page.evaluate(() => { window.__setup(); aqSetId = 'sheet'; aqOpen(); });

/* ═══════════ ДВА ПІДСУМКИ З ОДНОГО НАБОРУ ═══════════

   «Скільки з деклайном і скільки без, окремо по Владу й по Олегу» —
   і модель відповідала чесно: «цей формат дозволяє один фільтр і одне
   групування, розбийте на два запити». Стеля була не в ній, а в мові
   плану: загальний where ріже рядки ОДИН раз, і два різні підсумки з
   того самого набору з нього не дістати.

   Тепер умова є в кожного показника окремо. */
const TEAMWORK = [
  { who: 'Vlad', status: 'Approved', spend: '100' },
  { who: 'Vlad', status: 'Decline',  spend: '30'  },
  { who: 'Oleh', status: 'Approved', spend: '200' },
  { who: 'Oleh', status: 'Decline',  spend: '50'  },
  { who: 'Oleh', status: 'Approved', spend: '20'  }
];

await page.evaluate(rows => {
  window.__sent = [];
  window.shDataset = () => ({
    id: 'sheet', title: 'team.csv',
    cols: [{ name: 'who', kind: 'text' }, { name: 'status', kind: 'text' },
           { name: 'spend', kind: 'num' }],
    rows: rows.map(r => ({ ...r })), num: null
  });
  rawData = []; window.creativesRawData = [];
  aqCall = async body => {
    window.__sent.push(body);
    return { plan_raw: JSON.stringify(window.__plan), model: 'claude-haiku-5-5',
             cost_usd: 0.0001, left_today: 9, problems: [] };
  };
  aqSetId = 'sheet';
  aqOpen();
}, TEAMWORK);

const two = await askWith({ group: 'who', limit: 10, sort: 'desc',
  metric: { op: 'sum', col: 'spend', where: [{ col: 'status', op: 'ne', val: 'Decline' }] },
  metrics: [{ op: 'sum', col: 'spend', where: [{ col: 'status', op: 'eq', val: 'Decline' }] },
            { op: 'sum', col: 'spend' }],
  say: 'без декліну і лише декліном, по людях' },
  'сума без декліну і окремо лише декліном, по Владу й Олегу');
const flat = two.html.replace(/\s+/g, ' ');
ok('дві умови дають два різні підсумки з одного набору',
  /<td class="aq-n">220<\/td><td class="aq-n">50<\/td><td class="aq-n">270<\/td>/.test(flat)
  && /<td class="aq-n">100<\/td><td class="aq-n">30<\/td><td class="aq-n">130<\/td>/.test(flat),
  flat.slice(0, 500));
ok('кожен стовпець названо разом зі своєю умовою — інакше два однакові підписи',
  /сума spend · status ≠ Decline/.test(two.txt) && /сума spend · status = Decline/.test(two.txt),
  two.txt.slice(0, 300));
ok('а показник без умови лишається просто сумою',
  /сума spend<\/th>/.test(flat.replace(/ /g, '')) || /сума spend</.test(two.html), two.html.slice(0, 400));
ok('жоден рядок не загубився: загальний фільтр не звужувався',
  /5 з 5 рядк\./.test(two.txt), two.txt.slice(0, 200));

/* Умова показника перевіряється так само, як загальна: вигаданий
   стовпець і невідома операція не виконуються. */
const badw = await askWith({ group: 'who', metric: { op: 'count' },
  metrics: [{ op: 'sum', col: 'spend', where: [{ col: 'нема', op: 'eq', val: 'x' }] }] }, 'щось');
ok('вигаданий стовпець в умові показника не виконується',
  /немає стовпця «нема»/.test(badw.txt), badw.txt.slice(0, 200));

const bado = await askWith({ group: 'who', metric: { op: 'count' },
  metrics: [{ op: 'sum', col: 'spend', where: [{ col: 'status', op: 'regex', val: 'x' }] }] }, 'щось');
ok('невідома операція в умові показника не виконується',
  /невідома умова/.test(bado.txt), bado.txt.slice(0, 200));

await page.evaluate(() => { window.__setup(); aqSetId = 'sheet'; aqOpen(); });

/* ═══════════ ПЕРЕХРЕСНА ТАБЛИЦЯ: РЯДКИ ТЕЖ УМОВАМИ ═══════════

   «Таблиця з двох рядків і двох стовпців: перший рядок — Original
   amount без деклайну й без карток з Oleh, другий — те саме, але
   ТІЛЬКИ картки з Oleh; другий стовпець — лише деклайн».

   Стовпці вміє умова показника (її вже додали). А рядок тут — не
   значення стовпця, а УМОВА: group дав би стільки рядків, скільки
   різних карток, а треба рівно два, кожен описаний своїм правилом.
   Тому рядок може бути умовою з назвою. */
const CARDS = [
  { card: 'Oleh Visa',  status: 'Approved', amt: '100' },
  { card: 'Oleh Visa',  status: 'decline',  amt: '10'  },
  { card: 'Vlad Visa',  status: 'Approved', amt: '200' },
  { card: 'Vlad Visa',  status: 'Decline',  amt: '20'  },
  { card: 'Ira Master', status: 'approved', amt: '300' }
];

await page.evaluate(rows => {
  window.__sent = [];
  window.shDataset = () => ({
    id: 'sheet', title: 'cards.csv',
    cols: [{ name: 'card', kind: 'text' }, { name: 'status', kind: 'text' },
           { name: 'amt', kind: 'num' }],
    rows: rows.map(r => ({ ...r })), num: null
  });
  rawData = []; window.creativesRawData = [];
  aqCall = async body => {
    window.__sent.push(body);
    return { plan_raw: JSON.stringify(window.__plan), model: 'claude-haiku-5-5',
             cost_usd: 0.0001, left_today: 9, problems: [] };
  };
  aqSetId = 'sheet';
  aqOpen();
}, CARDS);

const cross = await askWith({
  buckets: [{ name: 'Без Oleh', where: [{ col: 'card', op: 'not_contains', val: 'Oleh' }] },
            { name: 'Тільки Oleh', where: [{ col: 'card', op: 'contains', val: 'Oleh' }] }],
  metric: { op: 'sum', col: 'amt', where: [{ col: 'status', op: 'not_contains', val: 'decline' }] },
  metrics: [{ op: 'sum', col: 'amt', where: [{ col: 'status', op: 'contains', val: 'decline' }] }],
  say: 'дві умови рядками, дві стовпцями' },
  'таблиця: без Oleh і тільки Oleh, без деклайну і лише деклайн');
const xflat = cross.html.replace(/\s+/g, ' ');
ok('рядки задані умовою, а не значенням стовпця',
  /<td>Без Oleh<\/td>/.test(xflat) && /<td>Тільки Oleh<\/td>/.test(xflat), xflat.slice(0, 300));
ok('рівно два рядки, а не по рядку на кожну картку',
  (xflat.match(/<tr><td>/g) || []).length === 2, xflat.slice(0, 400));
ok('перший рядок: 500 без деклайну і 20 деклайном',
  /<td>Без Oleh<\/td><td class="aq-n">500<\/td><td class="aq-n">20<\/td>/.test(xflat), xflat.slice(0, 400));
ok('другий рядок: 100 без деклайну і 10 деклайном',
  /<td>Тільки Oleh<\/td><td class="aq-n">100<\/td><td class="aq-n">10<\/td>/.test(xflat), xflat.slice(0, 400));
ok('порядок рядків той, який назвала людина',
  xflat.indexOf('Без Oleh') < xflat.indexOf('Тільки Oleh'), xflat.slice(0, 300));
ok('у плані названо, за яким правилом рядок став рядком',
  /рядками: Без Oleh \(card не містить Oleh\)/.test(cross.txt), cross.txt.slice(0, 400));
ok('регістр у статусі не ламає зріз: Decline і decline — те саме',
  /20/.test(cross.txt), cross.txt.slice(0, 200));

/* Рядок без умови — це «усі», і він має право бути: саме з ним
   найчастіше й порівнюють. */
const withAll = await askWith({
  buckets: [{ name: 'Усі' }, { name: 'Oleh', where: [{ col: 'card', op: 'contains', val: 'Oleh' }] }],
  metric: { op: 'sum', col: 'amt' } }, 'усі проти Oleh');
const f2 = withAll.html.replace(/\s+/g, ' ');
ok('рядок без умови рахує весь набір',
  /<td>Усі<\/td><td class="aq-n">630<\/td>/.test(f2) && /<td>Oleh<\/td><td class="aq-n">110<\/td>/.test(f2),
  f2.slice(0, 300));

/* Межі ті самі, що й усюди: вигаданий стовпець в умові рядка не
   виконується, а картка «одного» не перехоплює рядки-умови. */
const badb = await askWith({
  buckets: [{ name: 'x', where: [{ col: 'нема', op: 'eq', val: '1' }] }],
  metric: { op: 'count' } }, 'щось');
ok('вигаданий стовпець в умові рядка не виконується',
  /немає стовпця «нема»/.test(badb.txt), badb.txt.slice(0, 200));

const oneb = await askWith({
  buckets: [{ name: 'Тільки Oleh', where: [{ col: 'card', op: 'contains', val: 'Oleh' }] }],
  metric: { op: 'sum', col: 'amt' },
  metrics: [{ op: 'count' }] }, 'один рядок-умова');
ok('один рядок-умова лишається рядком таблиці, а не стає карткою',
  /aq-tbl/.test(oneb.html) && !/aq-card/.test(oneb.html), oneb.html.slice(0, 200));

await page.evaluate(() => { window.__setup(); aqSetId = 'sheet'; aqOpen(); });

/* ─────────── чип: назва вставляється, «?» показує вміст ───────────
   Дві дії на один чип, як у силках PWA: часте — на самому чипі,
   рідкісне — окремою кнопкою. Набирати «Sub ID 5» руками означає
   помилитись на пробілі, а план із неіснуючим стовпцем відмовить. */
const put = await page.evaluate(() => {
  window.__setup();
  aqPick('sheet');
  aqOpen();
  const inp = document.getElementById('aq-q');
  inp.value = 'сума  без Decline';
  inp.setSelectionRange(5, 5);                 // курсор після «сума »
  const name = [...document.querySelectorAll('#aq-thread .aq-chip-n')]
    .find(c => c.textContent.trim() === 'Amount');
  name.click();
  return { val: inp.value, caret: inp.selectionStart,
           names: [...document.querySelectorAll('#aq-thread .aq-chip-n')]
             .map(c => c.textContent.trim()) };
});
ok('стовпці стоять чипами — назву не треба набирати',
  put.names.includes('Status') && put.names.includes('Amount'), put.names);
ok('клік по назві вставляє її в питання, у лапках',
  put.val === 'сума «Amount» без Decline', put.val);
ok('і курсор лишається одразу за вставленим',
  put.caret === 'сума «Amount»'.length, put.caret);

const chip = await page.evaluate(() => {
  window.__sent = [];
  const info = [...document.querySelectorAll('#aq-thread .aq-chip')]
    .find(c => c.querySelector('.aq-chip-n').textContent.trim() === 'Amount')
    .querySelector('.aq-chip-i');
  info.click();
  const bots = [...document.querySelectorAll('#aq-thread .aq-msg.is-bot')];
  return { txt: bots[bots.length - 1].textContent, sent: window.__sent.length };
});
ok('клік по «?» не питає модель зовсім', chip.sent === 0, chip.sent);
ok('і показує межі з сумою по ньому',
  /від 100 до 1,200\.5/.test(chip.txt) && /сума 2,500\.5/.test(chip.txt), chip.txt);
ok('сказано, що це локально', /модель не питали/.test(chip.txt), chip.txt);

const chipTxt = await page.evaluate(() => {
  [...document.querySelectorAll('#aq-thread .aq-chip')]
    .find(c => c.querySelector('.aq-chip-n').textContent.trim() === 'Status')
    .querySelector('.aq-chip-i').click();
  const bots = [...document.querySelectorAll('#aq-thread .aq-msg.is-bot')];
  return bots[bots.length - 1].textContent;
});
ok('для тексту видно, які значення справді зустрічаються',
  /Approved/.test(chipTxt) && /Decline/.test(chipTxt) && /Hold/.test(chipTxt), chipTxt);

/* ─────────── збережені питання кнопками ───────────
   Питання повторюються щодня, і щодня їх набирають заново. */
const pins = await page.evaluate(async () => {
  try { localStorage.removeItem('aq_saved:' + currentTeam); } catch (e) {}
  aqSaved = null;
  window.__setup();
  aqPick('sheet');
  aqOpen();
  const inp = document.getElementById('aq-q');
  inp.value = 'сума Amount без Decline';
  const p = aqSave();
  await new Promise(r => setTimeout(r, 60));
  const w = document.querySelector('.askwrap');
  w.querySelector('[data-k="name"]').value = 'Без відмов';
  w.querySelector('.ask-yes').click();
  await p;
  return { shown: document.getElementById('aq-pins').textContent,
           hidden: document.getElementById('aq-pins').classList.contains('hidden'),
           stored: localStorage.getItem('aq_saved:' + currentTeam) };
});
ok('збережене питання стало кнопкою', /Без відмов/.test(pins.shown) && !pins.hidden, pins);
ok('і пережило б перезавантаження', /сума Amount без Decline/.test(pins.stored || ''), pins.stored);

const ran = await page.evaluate(async () => {
  window.__plan = { metric: { op: 'count' } };
  window.__sent = [];
  document.querySelector('#aq-pins .aq-pin').click();
  await new Promise(r => setTimeout(r, 80));
  return { sent: window.__sent.length, q: (window.__sent[0] || {}).q };
});
ok('клік по кнопці питає одразу — за цим її й зберігали',
  ran.sent === 1 && ran.q === 'сума Amount без Decline', ran);

const gone = await page.evaluate(() => {
  document.querySelector('#aq-pins .aq-pin-x').click();
  return { shown: document.getElementById('aq-pins').textContent,
           hidden: document.getElementById('aq-pins').classList.contains('hidden'),
           stored: localStorage.getItem('aq_saved:' + currentTeam) };
});
ok('кнопку можна прибрати, і вона не вертається',
  !/Без відмов/.test(gone.shown) && gone.hidden && gone.stored === '[]', gone);

/* ─────────── поле питання тягнеться ─────────── */
ok('поле питання багаторядкове й розтяжне', await page.evaluate(() => {
  const el = document.getElementById('aq-q');
  return el.tagName === 'TEXTAREA'
      && getComputedStyle(el).resize === 'vertical';
}));
ok('порожнє питання нічого не відправляє', await page.evaluate(async () => {
  window.__sent = [];
  document.getElementById('aq-q').value = '   ';
  await aqAsk();
  return window.__sent.length === 0;
}));

/* ─────────── коли питати нічого ─────────── */
ok('без відкритих даних асистент не вдає, що щось може', await page.evaluate(() => {
  window.shDataset = () => null;
  rawData = [];
  window.creativesRawData = [];
  aqOpen();
  const t = document.getElementById('aq-thread').textContent;
  const sel = document.getElementById('aq-set');
  return /Немає чого питати/.test(t) && /Google-таблицю в рамці/.test(t) && sel.disabled;
}));

await done(browser, srv, errs);
