/* ═══════════ ДЕ САМЕ ЗАГОЛОВОК ═══════════

   «Бачу структуру: 92 рядки, стовпці col 1 – col 18 без назв» — так
   виглядало вивантаження, у якого вгорі стоїть назва звіту й період.
   Перший рядок вважався заголовком беззастережно, тому назв не було
   ні в таблиці, ні в підсумку виділення, ні в асистента: питати
   «суму Spend» нема про що, коли стовпець зветься «col 7».

   Стенд тримає і здогадку, і її межі:
     • заголовок знаходиться під сміттям угорі файлу;
     • звичайний файл (заголовок першим рядком) не ламається;
     • здогадку ВИДНО в шапці й можна змінити, разом із «немає
       заголовка»;
     • зміна знімає виділення: рядок номер 5 після зсуву — інший рядок;
     • номер рядка в таблиці лишається номером рядка ФАЙЛУ;
     • «виділити все» бере лише рядки даних;
     • числа читаються тим самим парсером, що й сума виділення.

   І окремо — огляд таблиці БЕЗ моделі: значень модель не бачить, тому
   «що в файлі» мусить відповідати сам дашборд. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8143;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* Три рядки сміття, потім заголовок, потім дані — рівно як у
   вивантаженні партнерки. */
const MESSY = [
  'Звіт по кампаніях,,,',
  'Період: 01.09 — 30.09,,,',
  ',,,',
  'Date,Campaign,Spend,Status',
  '2026-09-01,Mbank KG,"1 200.50",Approved',
  '2026-09-02,Mbank KG,980.25,Decline',
  '2026-09-03,Pinco TJ,1 500,Approved',
  '2026-09-04,Pinco TJ,310.75,Approved'
].join('\n');

const CLEAN = [
  'Date,Campaign,Spend',
  '2026-09-01,A,10',
  '2026-09-02,B,20'
].join('\n');

const put = (csv, name) => page.evaluate(async ([text, n]) => {
  await shChose(new File([text], n, { type: 'text/csv' }));
  return true;
}, [csv, name]);

/* ─────────── заголовок під сміттям ─────────── */
await put(MESSY, 'report.csv');
const ds = await page.evaluate(() => {
  const d = shDataset();
  return { names: d.cols.map(c => c.name), kinds: d.cols.map(c => c.kind),
           rows: d.rows.length, first: d.rows[0],
           spend: d.num('Spend', '1 200.50') };
});
ok('стовпці мають справжні назви, а не col 1…col 4',
  JSON.stringify(ds.names) === JSON.stringify(['Date', 'Campaign', 'Spend', 'Status']), ds.names);
ok('рядків даних стільки, скільки їх під заголовком', ds.rows === 4, ds.rows);
ok('і перший рядок даних — саме дані, а не назви',
  ds.first.Campaign === 'Mbank KG', ds.first);
ok('Spend визнаний числом', ds.kinds[2] === 'num', ds.kinds);
ok('число читається тим самим парсером, що й сума виділення',
  ds.spend === 1200.5, ds.spend);

const bar = await page.evaluate(() => {
  const el = document.getElementById('sh-filebar');
  const sel = el.querySelector('.sh-head select');
  return { rows: el.querySelector('.sh-rows').textContent,
           chosen: sel && sel.value,
           opts: sel ? [...sel.options].map(o => o.value) : [],
           noHead: sel ? [...sel.options].some(o => o.value === '-1') : false,
           peek: sel ? sel.options[0].textContent : '' };
});
ok('здогадку видно в шапці файлу', bar.chosen === '3', bar.chosen);
ok('і її можна змінити — зі «немає заголовка» в списку', bar.noHead, bar.opts);
ok('у списку видно, що в рядку, а не лише його номер',
  /row 1/.test(bar.peek) && /Звіт по кампаніях/.test(bar.peek), bar.peek);
ok('у шапці рахуються рядки ДАНИХ', /4 row\(s\)/.test(bar.rows), bar.rows);

/* Номер у таблиці — номер рядка ФАЙЛУ: інакше про рядок неможливо
   сказати вголос, про який саме йдеться. */
const nums = await page.evaluate(() =>
  [...document.querySelectorAll('#sh-table tbody .sh-n')].map(td => td.textContent));
ok('номери рядків починаються з п\'ятого — як у файлі',
  JSON.stringify(nums) === JSON.stringify(['5', '6', '7', '8']), nums);

/* «Виділити все» — лише дані. */
const all = await page.evaluate(() => { shPickAll(); return document.querySelectorAll('#sh-table tbody tr.is-sel').length; });
ok('«виділити все» бере лише рядки даних', all === 4, all);

/* ─────────── здогадку можна перебити ─────────── */
const moved = await page.evaluate(() => {
  shSetHead(0);
  const d = shDataset();
  return { names: d.cols.map(c => c.name), rows: d.rows.length,
           sel: document.querySelectorAll('#sh-table tbody tr.is-sel').length,
           chosen: document.querySelector('.sh-head select').value };
});
ok('вибраний рядок стає заголовком', moved.names[0] === 'Звіт по кампаніях', moved.names);
ok('і тіло відраховується від нього', moved.rows === 7, moved.rows);
ok('зміна знімає виділення — інакше сума була б по інших рядках',
  moved.sel === 0, moved.sel);
ok('вибір лишається видимим у шапці', moved.chosen === '0', moved.chosen);

const none = await page.evaluate(() => {
  shSetHead(-1);
  const d = shDataset();
  return { names: d.cols.map(c => c.name), rows: d.rows.length };
});
ok('«немає заголовка» — чесні col 1…col 4, а не вигадані назви',
  JSON.stringify(none.names) === JSON.stringify(['col 1', 'col 2', 'col 3', 'col 4']), none.names);
ok('і жоден рядок не з\'їдається', none.rows === 8, none.rows);

/* ─────────── звичайний файл не зламався ─────────── */
await put(CLEAN, 'clean.csv');
const cl = await page.evaluate(() => {
  const d = shDataset();
  return { names: d.cols.map(c => c.name), rows: d.rows.length,
           chosen: document.querySelector('.sh-head select').value,
           nums: [...document.querySelectorAll('#sh-table tbody .sh-n')].map(td => td.textContent) };
});
ok('заголовок першим рядком лишається першим рядком',
  cl.chosen === '0' && JSON.stringify(cl.names) === JSON.stringify(['Date', 'Campaign', 'Spend']), cl);
ok('нумерація звичайного файлу не зсунулась',
  JSON.stringify(cl.nums) === JSON.stringify(['2', '3']), cl.nums);
ok('і рядки даних порахувались як раніше', cl.rows === 2, cl.rows);

/* ─────────── асистент бачить справжні назви, і стовпці — чипами ───────────
   Окремої кнопки «що в таблиці» немає й не треба: стовпці стоять
   чипами в стрічці, і клік по чипу — те саме питання, тільки на нього
   відповідає дашборд, а не модель. */
await put(MESSY, 'report.csv');
const chips = await page.evaluate(() => {
  window.__called = 0;
  aqCall = async () => { window.__called++; throw new Error('модель не мусила знадобитись'); };
  rawData = []; window.creativesRawData = [];
  aqOpen();
  return { names: [...document.querySelectorAll('#aq-thread .aq-chip')].map(c => c.textContent.trim()),
           sub: document.getElementById('aq-sub').textContent,
           set: document.getElementById('aq-set').options[0].textContent };
});
ok('у чипах стоять справжні назви з файлу',
  JSON.stringify(chips.names) === JSON.stringify(['Date', 'Campaign', 'Spend', 'Status']), chips.names);
ok('набір підписаний назвою файлу', /report\.csv/.test(chips.set), chips.set);
ok('і рядків у підписі стільки, скільки під заголовком',
  /4 рядк/.test(chips.sub), chips.sub);

const peek = await page.evaluate(() => {
  const all = [...document.querySelectorAll('#aq-thread .aq-chip')];
  all.find(c => c.textContent.trim() === 'Spend').click();
  all.find(c => c.textContent.trim() === 'Status').click();
  const bots = [...document.querySelectorAll('#aq-thread .aq-msg.is-bot')];
  return { t: bots.slice(-2).map(b => b.textContent).join(' | '), called: window.__called };
});
ok('клік по стовпцю не питає модель зовсім', peek.called === 0, peek.called);
ok('для числа — межі й сума',
  /від 310\.75 до 1,500/.test(peek.t) && /сума 3,991\.5/.test(peek.t), peek.t);
ok('для тексту — які значення справді зустрічаються',
  /Approved/.test(peek.t) && /Decline/.test(peek.t), peek.t);
ok('і сказано, що рахував дашборд, а не модель',
  /модель не питали/.test(peek.t), peek.t);

/* Значення не їдуть у модель навіть тепер, коли назви стовпців справжні. */
await page.evaluate(async () => {
  window.__sent = null;
  aqCall = async body => { window.__sent = JSON.stringify(body); return { plan_raw: '{"error":"ні"}' }; };
  document.getElementById('aq-q').value = 'сума Spend без Decline';
  await aqAsk();
});
const sent = await page.evaluate(() => window.__sent);
ok('у модель поїхали назви стовпців', /Spend/.test(sent) && /Status/.test(sent), sent);
ok('а значення — ні', !/Approved/.test(sent) && !/1 200\.50/.test(sent)
  && !/Mbank KG/.test(sent), sent);

await done(browser, srv, errs);
