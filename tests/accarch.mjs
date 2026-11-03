/* ═══════════ ВІКНО ACCOUNTS: ВЛАСНИЙ СТАТУС, А НЕ СПІЛЬНИЙ ═══════════

   «коли я відправляю в архів кабінети, в модальному вікні акаунти все
   виходить в актив», «чому постійно з архіву кабінети переходять в
   інший статус», і далі: «а для чого ти додав статус архів?»

   Перша вада: словник цього вікна знав три слова — active, ban,
   problem, — а сторінка Cabinets писала в ТУ САМУ колонку четверте:
   archive. Усе незнайоме мовчки ставало 'active', тож кабінет,
   прибраний в архів, стояв тут «Активним» із підсвіченою кнопкою
   «Активний»: один випадковий клік — і архів зникав уже й у базі.

   Друга, та сама по суті: архів взагалі не мусить тут з'являтись.
   Просили ручний режим, а вікно читало колонку, яку пише інша
   сторінка. Тому тепер у вікна СВОЯ колонка — acc_status.

   Стенд тримає два режими, бо обидва бувають у житті:

   А. МІГРАЦІЯ ВИКОНАНА (acc_status є):
     1. архів, записаний у спільну status, у вікні не видно НІДЕ —
        ні рядком, ні плиткою;
     2. серед кнопок немає «Архів»: вікно його не ставить;
     3. клік пише в acc_status і НІКОЛИ в status.

   Б. МІГРАЦІЇ ЩЕ НЕМАЄ (acc_status у рядку відсутній):
     4. вікно працює по спільній колонці, але КАЖЕ про це смужкою;
     5. архів показується архівом, а не активом, і не клікабельний;
     6. плитка «Усі» рахує те, що видно, архів має власну;
     7. невідоме слово лишається собою;
     8. клік пише в status — у ту ж колонку, з якої читали.

   І спільне для обох: саме відкриття вікна в базу не пише нічого. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8184;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

/* Рядки, як їх віддає PostgREST після міграції: є обидві колонки.
   r3/r4 — архів, зроблений на сторінці Cabinets; власного статусу
   вікна в них немає, і це нормально: його там ніхто не ставив. */
const OWN = [
  { id: 'r1', account_id: '1001', provider_name: 'A', status: 'active',  acc_status: 'active' },
  { id: 'r2', account_id: '1002', provider_name: 'A', status: 'ban',     acc_status: 'ban' },
  { id: 'r3', account_id: '1003', provider_name: 'B', status: 'archive', acc_status: null },
  { id: 'r4', account_id: '1004', provider_name: 'B', status: 'archive', acc_status: 'problem' }
];

/* А так виглядає та сама база до міграції: колонки acc_status у
   рядку просто НЕМАЄ. Саме на це дивиться accOwnCol. */
const OLD = [
  { id: 'r1', account_id: '1001', provider_name: 'A', status: 'active' },
  { id: 'r2', account_id: '1002', provider_name: 'A', status: 'ban' },
  { id: 'r3', account_id: '1003', provider_name: 'B', status: 'archive' },
  { id: 'r4', account_id: '1004', provider_name: 'B', status: 'archive' },
  /* Слово, якого немає в жодному словнику: так виглядає будь-яке
     майбутнє поповнення, і воно не має ставати «активом». */
  { id: 'r5', account_id: '1005', provider_name: 'C', status: 'frozen' }
];

await page.evaluate(() => {
  window.__w = [];
  sb.from = () => ({ update: v => ({ eq: async (_c, id) => {
    window.__w.push({ id, v }); return { error: null };
  } }) });
  rawData = [];
});

/* Малюємо так, як це робить сама сторінка: наявність власної колонки
   визначається з рядка, а не задається стендом. Інакше стенд
   перевіряв би свою власну вигадку. */
const draw = (rows, flt) => page.evaluate(([rs, f]) => {
  accRows = rs.map(r => ({ ...r }));
  accHasStatusCol = true;
  accOwnCol = ACC_OWN in accRows[0];
  accFilter = f;
  document.getElementById('accounts-modal').classList.remove('hidden');
  renderAccountsModal();
  const body = document.getElementById('accounts-modal-body');
  const sum = document.getElementById('acc-summary');
  return {
    own: accOwnCol,
    warn: (sum.querySelector('.acc-warn')?.textContent || '').replace(/\s+/g, ' ').trim(),
    tiles: [...sum.querySelectorAll('.acc-tile')].map(t => ({
      l: t.querySelector('.acc-tile-l').textContent.trim(),
      n: t.querySelector('.acc-tile-n').textContent.trim() })),
    ids: [...body.querySelectorAll('.acc-row')]
      .map(r => r.querySelector('span').textContent.trim()),
    rows: [...body.querySelectorAll('.acc-row')].map(r => ({
      id: r.querySelector('span').textContent.trim(),
      on: [...r.querySelectorAll('.acc-st.is-on')].map(b => b.textContent.trim()).join('|'),
      btns: [...r.querySelectorAll('.acc-st')]
        .map(b => b.tagName.toLowerCase() + ':' + b.textContent.trim()).join('|')
    }))
  };
}, [rows, flt]);

const tile = (t, l) => (t.tiles.find(x => x.l === l) || {}).n;

/* ══════ А. МІГРАЦІЯ ВИКОНАНА ══════ */
const own = await draw(OWN, '');
ok('власну колонку видно з рядка', own.own === true, own.own);
/* Головне в цій зміні: архів зі сторінки Cabinets сюди не доходить
   ЗОВСІМ. Доти він доходив і прикидався активом. */
ok('архів із Cabinets у списку не з’являється',
  own.ids.length === 4, own.ids);
ok('і плитки «Архів» немає', tile(own, 'Archive') === undefined, own.tiles.map(t => t.l));
ok('смужки про спільну колонку немає', own.warn === '', own.warn);
/* Кабінет r3 архівний у Cabinets, але власного статусу не має —
   вікно читає його активним, і це правильна відповідь: тут його
   ніхто не оцінював. */
ok('рядок без власного статусу читається активним',
  own.rows.find(r => r.id === '1003').on === 'Active', own.rows);
/* r4 архівний у Cabinets і «проблемний» тут. Два різні судження на
   одному кабінеті — ціна розділення, названа вголос. */
ok('а власний статус не затирається чужим',
  own.rows.find(r => r.id === '1004').on === 'Issue', own.rows);
/* Кнопки — тільки те, що вікно вміє ПОСТАВИТИ. Кнопка «Архів» у
   власній колонці завела б третій архів, про який не знає ніхто. */
ok('серед кнопок немає Архіву',
  own.rows.every(r => !/Archive/.test(r.btns)), own.rows[0].btns);
ok('а три свої кнопки на місці',
  own.rows.every(r => r.btns.split('|').length === 3), own.rows[0].btns);
ok('плитки не мішають дві мови',
  !own.tiles.some(t => /[а-яіїєґ]{3,}/i.test(t.l)), own.tiles.map(t => t.l));
/* Той самий шов, тільки на сусідньому елементі: «Усі» коротке й
   підставлялось окремо, а «місяці» лишалось — на екрані стояло
   «All місяці». Плитки ми вже стережемо, тож стережемо й це. */
const mon = await page.evaluate(() =>
  [...document.querySelectorAll('#acc-month option')].map(o => o.textContent.trim()));
ok('селект місяців теж однією мовою',
  mon.length > 0 && !mon.some(t => /[а-яіїєґ]{3,}/i.test(t)), mon);

/* ── клік пише у СВОЮ колонку ── */
const wOwn = await page.evaluate(async () => {
  window.__w = [];
  await accSetStatus('r1', 'ban');
  return window.__w;
});
ok('клік пише в acc_status', wOwn.length === 1 && wOwn[0].v.acc_status === 'ban', wOwn);
/* Якби сюди потрапив status, вийшло б найгірше з двох світів: на
   екрані власний статус, у базі спільний — тобто клік у цьому вікні
   знову міняв би те, що бачать у Cabinets. */
ok('і НЕ пише в спільний status', !('status' in wOwn[0].v), wOwn);

/* ══════ Б. МІГРАЦІЇ ЩЕ НЕМАЄ ══════ */
const old = await draw(OLD, '');
ok('без колонки вікно це бачить', old.own === false, old.own);
/* Працювати по-старому мовчки означало б, що «міграцію виконано» і
   «не виконано» виглядають однаково. */
ok('і каже про це смужкою', /acc_status/.test(old.warn), old.warn);
ok('смужка англійською, як решта сторінки',
  !/[а-яіїєґ]{3,}/i.test(old.warn), old.warn);
ok('архівних у списку немає',
  !old.ids.includes('1003') && !old.ids.includes('1004'), old.ids);
ok('плитка «Усі» рахує без архіву', tile(old, 'All') === '3', old.tiles);
ok('а архів має власну плитку й своє число', tile(old, 'Archive') === '2', old.tiles);
ok('невідомий статус має свою плитку', tile(old, 'frozen') === '1', old.tiles);

const arch = await draw(OLD, 'archive');
ok('фільтр показує саме архівні',
  arch.ids.length === 2 && arch.ids.includes('1003'), arch.ids);
/* Підсвічена мусить бути та кнопка, у якій кабінет СПРАВДІ є. Доти
   світився «Активний», і клік по ньому виглядав як «нічого не міняю». */
ok('у рядку підсвічений Архів, а не Активний',
  arch.rows.every(r => r.on === 'Archive'), arch.rows);
/* Архів тут — чужий стан, тож це напис, а не кнопка: натиснути його
   у вікні, яке архівів не ставить, не можна. */
ok('архів показано написом, а не кнопкою',
  arch.rows.every(r => /span:Archive/.test(r.btns)), arch.rows[0].btns);

const odd = await draw(OLD, 'frozen');
ok('невідомий статус не став активом',
  odd.ids.join() === '1005' && odd.rows[0].on === 'frozen', odd);

/* ── клік пише в ту ж колонку, з якої читали ── */
const wOld = await page.evaluate(async () => {
  window.__w = [];
  accRows = accRows.map(r => { const c = { ...r }; delete c.acc_status; return c; });
  accOwnCol = false;
  await accSetStatus('r3', 'active');
  return window.__w;
});
ok('без міграції клік пише в status',
  wOld.length === 1 && wOld[0].v.status === 'active', wOld);
ok('і не вигадує колонки, якої немає', !('acc_status' in wOld[0].v), wOld);

/* ── і головне: саме відкриття вікна в базу не пише ── */
const quiet = await page.evaluate(async () => {
  window.__w = [];
  await draw0();
  return window.__w.length;
  function draw0() {
    accRows = [
      { id: 'q1', account_id: '2001', status: 'archive', acc_status: null },
      { id: 'q2', account_id: '2002', status: 'ban',     acc_status: 'active' }
    ];
    accOwnCol = true; accHasStatusCol = true; accFilter = '';
    renderAccountsModal();
  }
});
ok('відкриття вікна нічого не записує', quiet === 0, { quiet });

await done(browser, srv, errs);
