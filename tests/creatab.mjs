/* ═══════════ ТАБЛИЦЯ КРЕАТИВІВ У ТАБЛИЦЯХ ═══════════

   «список з всіх креативів… важно побачити яке крео я лив, яке ні, і
   було б добре сразу туди добавляти крео які є в гугл драйві але
   немає спенда».

   Домовились: одна таблиця, гео колонкою з фільтром, без коментарів,
   без статусів, без превю — вигрузка.

   Стенд тримає межі:
     • пункт «Creatives» стоїть у списку Таблиць першим і не ламає
       вибір Google-таблиць;
     • один рядок — КРЕАТИВ + ГЕО: те саме крео в двох гео це два
       заливи з різною ціною, і зводити їх в один рядок означало б
       середнє, якого не існує;
     • файли з Drive, яких немає в статистиці, стають рядками зі
       спендом 0 — це й є «що я ще не лив»;
     • гео для них беремо з ІМЕНІ, папку — другим джерелом, а
       розходження показуємо, а не вгадуємо молча;
     • CPI/CPA без знаменника — прочерк, а не нуль;
     • Total рахує те, що ВИДНО після фільтра;
     • CSV віддає рівно ті рядки, що на екрані. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8158;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, { viewport: { width: 1500, height: 950 } });

const CR = [
  // KG: два дні одного крео
  { date: '2026-10-01', geo: 'KG', creative_name: 'KG_JS_674', spend: 100, clicks: 500, installs: 50, regs: 20, deps: 4 },
  { date: '2026-10-02', geo: 'KG', creative_name: 'KG_JS_674', spend: 60,  clicks: 300, installs: 30, regs: 10, deps: 1 },
  // те саме крео, інше гео
  { date: '2026-10-02', geo: 'TJ', creative_name: 'KG_JS_674', spend: 40,  clicks: 200, installs: 10, regs: 5,  deps: 0 },
  // крео минулого місяця — для перевірки перемикача періоду
  { date: '2026-09-15', geo: 'KG', creative_name: 'KG_OLD_1',  spend: 500, clicks: 900, installs: 90, regs: 40, deps: 9 },
  // інстали є, депів немає — CPA мусить бути прочерком
  { date: '2026-10-03', geo: 'UZ', creative_name: 'UZ_NEW_9',  spend: 30,  clicks: 150, installs: 15, regs: 3,  deps: 0 }
];

const DRIVE = [
  // не лився взагалі, гео в імені і папка та сама
  { id: 'd1', name: 'KG_JS_700.mp4', folder: 'KG', webViewLink: 'https://drive.test/d1' },
  // гео в імені TJ, а лежить у папці KG — розходження
  { id: 'd2', name: 'TJ_DV_11.mp4',  folder: 'KG', webViewLink: 'https://drive.test/d2' },
  // гео тільки в папці
  { id: 'd3', name: 'promo-final.mp4', folder: 'UZ', webViewLink: 'https://drive.test/d3' },
  // уже лився — у таблиці мусить бути ОДИН рядок, а не два
  { id: 'd4', name: 'KG_JS_674.mp4', folder: 'KG', webViewLink: 'https://drive.test/d4' }
];

await page.evaluate(([cr, dr]) => {
  currentMonthFilter = '2026-10';
  creativesRawData = cr; window.creativesRawData = cr;
  // Drive підміняємо на рівні двох функцій, якими модуль і ходить.
  teamDriveFolderId = 'ROOT';
  window.driveSubfolders = async () => [...new Set(dr.map(f => f.folder))]
    .filter(Boolean).map(n => ({ id: 'F_' + n, name: n }));
  window._driveList = async q => {
    const m = /'([^']+)'\s+in\s+parents/.exec(decodeURIComponent(q));
    const parent = m ? m[1] : '';
    return dr.filter(f => 'F_' + f.folder === parent);
  };
  navGo('sheets');
  sheetsPick('cre');
}, [CR, DRIVE]);
await page.waitForTimeout(300);

/* ─────────── пункт у списку ─────────── */
const pick = await page.evaluate(() => {
  const sel = document.getElementById('sh-select');
  return {
    first: sel.options[0] ? sel.options[0].value + '|' + sel.options[0].textContent : '',
    chosen: sel.value,
    shown: !document.getElementById('ct-wrap').classList.contains('hidden'),
    frameHid: document.getElementById('sh-frame').classList.contains('hidden')
  };
});
ok('«Creatives» стоїть першим пунктом Таблиць', pick.first === 'cre|Creatives', pick);
ok('він і вибраний, рамку Google при цьому сховано',
  pick.chosen === 'cre' && pick.shown && pick.frameHid, pick);

/* ─────────── рядки ─────────── */
const rows = () => page.evaluate(() => [...document.querySelectorAll('#ct-tbl-x, .ct-tbl tbody tr')]
  .map(tr => [...tr.children].map(td => td.textContent.trim())));

const r1 = await rows();
const find = (rs, cid, geo) => rs.find(r => r[0].startsWith(cid) && r[1].startsWith(geo));

ok('крео з двох днів зведене в один рядок',
  find(r1, 'KG_JS_674', 'KG')[2] === '$160', find(r1, 'KG_JS_674', 'KG'));
ok('те саме крео в іншому гео — ОКРЕМИЙ рядок',
  find(r1, 'KG_JS_674', 'TJ')[2] === '$40', find(r1, 'KG_JS_674', 'TJ'));
ok('кліки, інстали, реги й депи на місці',
  find(r1, 'KG_JS_674', 'KG').slice(3, 7).join('|') === '800|80|30|5',
  find(r1, 'KG_JS_674', 'KG'));
ok('CPI порахований, CPA теж', find(r1, 'KG_JS_674', 'KG')[7] === '$2.00'
  && find(r1, 'KG_JS_674', 'KG')[8] === '$32.0', find(r1, 'KG_JS_674', 'KG'));
ok('депів немає — CPA прочерк, а не нуль',
  find(r1, 'UZ_NEW_9', 'UZ')[8] === '—', find(r1, 'UZ_NEW_9', 'UZ'));

/* ─────────── Drive без спенда ─────────── */
ok('файл із Drive без статистики — рядок зі спендом 0',
  find(r1, 'KG_JS_700', 'KG')[2] === '$0', find(r1, 'KG_JS_700', 'KG'));
ok('гео для нього взяте з імені', !!find(r1, 'KG_JS_700', 'KG'));
ok('без гео в імені — беремо назву папки', !!find(r1, 'promo-final', 'UZ'), r1);
ok('крео, яке вже лилось, не дублюється файлом із Drive',
  r1.filter(r => r[0].startsWith('KG_JS_674') && r[1].startsWith('KG')).length === 1, r1);
ok('у крео без спенда CPI теж прочерк',
  find(r1, 'KG_JS_700', 'KG')[7] === '—', find(r1, 'KG_JS_700', 'KG'));

const clash = await page.evaluate(() => {
  const el = document.querySelector('.ct-clash');
  return el ? { txt: el.textContent, tip: el.getAttribute('title') || '' } : null;
});
ok('розходження імені й папки показане, а не вгадане молча',
  clash && /KG/.test(clash.txt) && /папці KG/.test(clash.tip), clash);

/* ─────────── фільтр гео ─────────── */
const kgOnly = await page.evaluate(() => {
  ctSetGeo('KG');
  const rs = [...document.querySelectorAll('.ct-tbl tbody tr')];
  const foot = [...document.querySelectorAll('.ct-tbl tfoot td')].map(td => td.textContent.trim());
  return { geos: [...new Set(rs.map(r => r.children[1].textContent.trim().slice(0, 2)))], foot };
});
ok('фільтр гео лишає тільки своє гео',
  kgOnly.geos.length === 1 && kgOnly.geos[0] === 'KG', kgOnly.geos);
/* $660 = 160 (жовтневе крео) + 500 (вереснева кампанія, бо період
   «за весь час») + 0 (файл із Drive). Саме сума ВИДИМИХ рядків. */
ok('Total рахує те, що ВИДНО після фільтра', kgOnly.foot[2] === '$660', kgOnly.foot);
ok('і прочерків у Total немає, коли знаменник є',
  kgOnly.foot[7] === '$3.88', kgOnly.foot);

/* ─────────── період ─────────── */
const month = await page.evaluate(() => {
  ctSetGeo(''); ctSetPeriod('month');
  const rs = [...document.querySelectorAll('.ct-tbl tbody tr')].map(r => r.children[0].textContent.trim());
  return rs;
});
ok('«цей місяць» ховає крео, яке лилось у вересні',
  !month.some(x => x.startsWith('KG_OLD_1')), month);
const allTime = await page.evaluate(() => {
  ctSetPeriod('all');
  return [...document.querySelectorAll('.ct-tbl tbody tr')].map(r => r.children[0].textContent.trim());
});
ok('«за весь час» повертає його', allTime.some(x => x.startsWith('KG_OLD_1')), allTime);

/* ─────────── сортування ─────────── */
const sorted = await page.evaluate(() => {
  ctSortBy('s');                            // вже за спендом ↓ — клік перевертає
  const up = [...document.querySelectorAll('.ct-tbl tbody tr')][0].children[2].textContent.trim();
  ctSortBy('s');
  const down = [...document.querySelectorAll('.ct-tbl tbody tr')][0].children[2].textContent.trim();
  return { up, down };
});
ok('клік по шапці перевертає сортування',
  sorted.up === '$0' && sorted.down === '$500', sorted);

/* ─────────── CSV ─────────── */
const csv = await page.evaluate(() => {
  let got = null;
  const realBlob = window.Blob;
  window.Blob = function (parts, opts) { got = String(parts[0]); return new realBlob(parts, opts); };
  const a = document.createElement('a');
  const realCreate = document.createElement.bind(document);
  document.createElement = tag => tag === 'a' ? Object.assign(a, { click: () => {} }) : realCreate(tag);
  ctSetGeo('UZ');
  ctCsv();
  document.createElement = realCreate; window.Blob = realBlob;
  ctSetGeo('');
  return { csv: got, name: a.download };
});
ok('CSV віддає рівно відфільтровані рядки',
  /UZ_NEW_9/.test(csv.csv) && !/KG_JS_674/.test(csv.csv), csv.csv);
ok('і називається за гео', csv.name === 'creatives-UZ.csv', csv.name);
/* \ufeff на початку — навмисний BOM: без нього Excel читає кирилицю
   кракозябрами. Тому ^ перевіряємо ПІСЛЯ нього. */
ok('у CSV є шапка зі всіма колонками',
  /^\ufeff?Creative,Geo,Spend,Clicks,Installs,Regs,Deps,CPI,CPA/.test(csv.csv),
  csv.csv.slice(0, 80));

/* ─────────── вибір Google-таблиці не зламався ─────────── */
/* sheets і sheetsRender живуть усередині IIFE шару дизайну — зі
   стенда їх не видно, і це правильно. Тому перевіряємо те, що видно:
   після вибору будь-якого іншого пункту наша таблиця ховається. */
const back = await page.evaluate(() => {
  sheetsPick('0');
  return { ct: document.getElementById('ct-wrap').classList.contains('hidden'),
           sel: document.getElementById('sh-select').value };
});
ok('вибір іншого пункту ховає нашу таблицю', back.ct, back);
const again = await page.evaluate(() => {
  sheetsPick('cre');
  return { ct: !document.getElementById('ct-wrap').classList.contains('hidden'),
           rows: document.querySelectorAll('.ct-tbl tbody tr').length };
});
ok('і повернення до «Creatives» показує її з рядками',
  again.ct && again.rows > 3, again);

await done(browser, srv, errs);
