/* ═══════════ КАБІНЕТИ ПАЧКОЮ: ВИБІР І АРХІВ ═══════════

   Архівувати по одному — робота, якої не роблять: щоб прибрати
   двадцять забанених, двадцять разів треба відкрити рядок, знайти
   кнопку й підтвердити. Тому галочка стоїть у рядку, а дія одна на
   всю пачку.

   Що тут важить:

     1. галочка не відкриває дерево кампаній — клік по рядку це робить,
        і без stopPropagation кожен вибір розкривав би таблицю;
     2. «вибрати все» бере рівно те, що НАМАЛЬОВАНО: під фільтром
        «Banned» це забанені, а не весь парк;
     3. вибір переживає зміну фільтра — але тоді смуга каже, скільки
        вибраного не видно, бо дія візьме і його;
     4. дві дії, і показана та, яка щось зробить: архів для живих,
        повернення для архівних;
     5. невдача на одному не спиняє решту, лишається вибраною і видна
        числом;
     6. кабінет, що зник із парку, зникає й з вибраного;
     7. колонок у рядку стільки ж, скільки в шапці, — і в дереві
        стільки ж: нова галочка не має зсунути таблицю. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8177;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const FB = [
  { account_id: '1001', name: 'Live one', status: 'active', currency: 'USD',
    spend_today: 10, ads: 2, ads_active: 2, token_id: 't1' },
  { account_id: '1002', name: 'Banned one', status: 'closed', disable_reason: 3,
    currency: 'USD', spend_today: 0, ads: 1, ads_active: 0, token_id: 't1' },
  { account_id: '1003', name: 'Banned two', status: 'closed', disable_reason: 3,
    currency: 'USD', spend_today: 0, ads: 1, ads_active: 0, token_id: 't1' },
  { account_id: '1004', name: 'Put away', status: 'active', currency: 'USD',
    spend_today: 0, ads: 1, ads_active: 1, token_id: 't1' }
];
const ROWS = [
  { id: 'r1', account_id: '1001', provider_name: 'AgentX', profile: 'p1' },
  { id: 'r2', account_id: '1002', provider_name: 'AgentX', profile: 'p2' },
  { id: 'r3', account_id: '1003', provider_name: 'AgentY', profile: 'p3' },
  { id: 'r4', account_id: '1004', provider_name: 'AgentY', profile: 'p4',
    status: 'archive' }
];

const setup = () => page.evaluate(([fb, rows]) => {
  window.__m = { wrote: [], fail: '', answer: true, asked: null, last: null,
                 tree: [], made: [] };
  window.toast = () => {};
  window.toastStep = () => ({ say: () => {},
    done: (t, k) => { window.__m.last = { t: String(t), k }; } });
  window.ask = async o => { window.__m.asked = o; return window.__m.answer; };
  /* cabWrite підміняємо, а cabSetStatus лишаємо справжнім: саме в
     ньому живе тихий режим, відкочування рядка й журнал. */
  cabWrite = async (id, patch) => {
    if (window.__m.fail && String(id) === window.__m.fail) return 'nope';
    window.__m.wrote.push({ id: String(id), patch });
    return '';
  };
  cabArchiveNew = async enc => { window.__m.made.push(decodeURIComponent(enc)); };
  cabToggleTree = (ev, enc) => { window.__m.tree.push(decodeURIComponent(enc || '')); };
  cabViewSave = async () => true;
  cabFbLoad = async () => {};
  cabSnapLoad = async () => {};
  cabDaysLoad = async () => {};
  evLog = async () => {};
  rawData = [];
  cabFb = fb; cabRows = rows.map(r => ({ ...r })); cabLoaded = true;
  cabTokens = { t1: 'AgentX_p1_BM' };
  cabRange = { key: 'today', since: '', until: '' };
  cabGroup = '';
  cabFilter = 'all';
  cabView = { pins: [], cols: {}, order: [] };
  cabMark.clear();
  try { localStorage.removeItem('cab_archived'); } catch (e) {}
  cabArch = new Set();
  const s = document.getElementById('cab-search');
  if (s) s.value = '';
  cabRender();
}, [FB, ROWS]);

await setup();

const rowsOf = () => page.evaluate(() =>
  [...document.querySelectorAll('#cab-list .cab-tr')].map(tr => ({
    id: (tr.querySelector('.cab-id') || {}).textContent || '',
    mk: !!(tr.querySelector('.cd-mk') || {}).checked,
    hl: tr.classList.contains('is-mk'),
    cells: tr.children.length
  })));

const bar = () => page.evaluate(() => {
  const b = document.getElementById('cab-bulk');
  return { text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
           btns: [...b.querySelectorAll('button')].map(x => x.textContent.trim()) };
});

const click = id => page.evaluate(i => {
  const tr = [...document.querySelectorAll('#cab-list .cab-tr')]
    .find(r => (r.querySelector('.cab-id') || {}).textContent === i);
  if (!tr) return false;
  tr.querySelector('.cd-mk').click();
  return true;
}, id);

/* ── 1. галочка в кожному рядку, і вона не відкриває дерево ── */
const start = await rowsOf();
ok('галочка стоїть у кожному рядку', start.length === 3 && start.every(r => 'mk' in r), start);
ok('порожня смуга не займає місця', (await bar()).text === '', await bar());

await click('1002');
const after1 = await rowsOf();
ok('галочка ставиться', (after1.find(r => r.id === '1002') || {}).mk === true, after1);
/* Клік по рядку розкриває дерево кампаній. Без stopPropagation кожна
   галочка розкривала б його заодно. */
ok('вибір не розкриває дерево кампаній',
  (await page.evaluate(() => window.__m.tree)).length === 0);
ok('вибраний рядок видно й без галочки',
  (after1.find(r => r.id === '1002') || {}).hl === true, after1);

/* ── 2. смуга ── */
const b1 = await bar();
ok('смуга каже число вибраних', /1 picked/.test(b1.text), b1);
ok('для живого кабінета показано архів', b1.btns.some(t => /Archive 1/.test(t)), b1);
ok('повернення з архіву не показано, бо нема чого повертати',
  !b1.btns.some(t => /Out of archive/.test(t)), b1);

/* ── 3. вибрати все — рівно те, що намальовано ── */
const all = await page.evaluate(() => {
  document.getElementById('cab-mkall').click();
  return { n: cabMark.size, shown: cabShown.length,
           bar: (document.getElementById('cab-bulk').textContent || '').replace(/\s+/g, ' ') };
});
ok('«вибрати все» бере всі намальовані', all.n === 3 && all.shown === 3, all);
/* Архівний кабінет у зріз «All» не потрапляє, тож і у вибір не має. */
ok('архівного серед них немає',
  !(await page.evaluate(() => cabMark.has('1004'))), all);
const off = await page.evaluate(() => {
  document.getElementById('cab-mkall').click();
  return cabMark.size;
});
ok('другий клік знімає вибір', off === 0, { off });

/* Під фільтром «вибрати все» бере лише цей зріз. */
const banned = await page.evaluate(() => {
  cabFilter = 'banned'; cabRender();
  document.getElementById('cab-mkall').click();
  return { ids: [...cabMark].sort(), shown: cabShown.length };
});
ok('під фільтром вибирається тільки його зріз',
  banned.ids.join(',') === '1002,1003' && banned.shown === 2, banned);

/* ── 4. вибір переживає фільтр, і смуга про це каже ── */
const away = await page.evaluate(() => {
  cabFilter = 'running'; cabRender();
  const b = document.getElementById('cab-bulk');
  return { text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
           tip: (b.querySelector('.cab-mkaway') || {}).title || '' };
});
ok('вибір не губиться при зміні фільтра', /2 picked/.test(away.text), away);
/* Дія візьме і те, чого не видно, — отже сказати треба ДО неї. */
ok('і смуга каже, скільки вибраного не видно', /2 not shown here/.test(away.text), away);
ok('із підказкою, як їх побачити', /clear the search or the status filter/.test(away.tip), away);

/* ── 5. архівуються рівно вибрані ── */
const arch = await page.evaluate(async () => {
  window.__m.wrote = []; window.__m.asked = null;
  await cabBulkArch('archive');
  return { wrote: window.__m.wrote, asked: window.__m.asked,
           last: window.__m.last, left: [...cabMark] };
});
ok('у питанні стоїть число кабінетів',
  /Archive 2 cabinet/.test((arch.asked || {}).title || ''), arch.asked);
ok('і сказано, що це не видалення',
  /history and your notes stay/.test((arch.asked || {}).body || ''), arch.asked);
ok('пишуться рівно вибрані рядки',
  arch.wrote.map(w => w.id).sort().join(',') === 'r2,r3', arch.wrote);
ok('і саме статус archive',
  arch.wrote.every(w => w.patch.status === 'archive'), arch.wrote);
ok('у підсумку видно, скільки пройшло', /Archived 2/.test((arch.last || {}).t || ''), arch.last);
ok('після успіху вибір очищено', arch.left.length === 0, arch.left);

/* ── 6. відмова ── */
await setup();
const no = await page.evaluate(async () => {
  cabMark.add('1002'); window.__m.wrote = []; window.__m.answer = false;
  await cabBulkArch('archive');
  window.__m.answer = true;
  return { wrote: window.__m.wrote, left: [...cabMark] };
});
ok('відмова нічого не пише', no.wrote.length === 0, no.wrote);
ok('і вибір лишається', no.left.join() === '1002', no.left);

/* ── 7. невдача на одному не спиняє решту ── */
const part = await page.evaluate(async () => {
  cabMark.clear(); cabMark.add('1002'); cabMark.add('1003');
  window.__m.wrote = []; window.__m.fail = 'r2';
  await cabBulkArch('archive');
  window.__m.fail = '';
  return { wrote: window.__m.wrote, last: window.__m.last, left: [...cabMark],
           st: cabRows.map(r => r.id + ':' + (r.status || '')) };
});
ok('невдача на одному не спиняє решту',
  part.wrote.map(w => w.id).join() === 'r3', part.wrote);
ok('і видна числом, а не мовчанням', /1 did not go/.test((part.last || {}).t || ''), part.last);
/* Лишається вибраною: інакше список із сорока рядків доводилось би
   збирати наново, щоб повторити по одному невдалому. */
ok('невдалий лишається вибраним', part.left.join() === '1002', part.left);
/* Рядок, запис якого не пройшов, не має лишатись архівним на екрані:
   це та сама тиша, тільки відкладена до перезавантаження. */
ok('невдалий рядок не прикидається архівним',
  part.st.includes('r2:'), part.st);

/* ── 8. повернення з архіву ── */
await setup();
const back = await page.evaluate(async () => {
  cabFilter = 'archived'; cabRender();
  document.getElementById('cab-mkall').click();
  const b = document.getElementById('cab-bulk');
  const btns = [...b.querySelectorAll('button')].map(x => x.textContent.trim());
  window.__m.wrote = [];
  await cabBulkArch('active');
  return { btns, wrote: window.__m.wrote, asked: window.__m.asked,
           last: window.__m.last };
});
ok('для архівного показано повернення',
  back.btns.some(t => /Out of archive 1/.test(t)), back.btns);
ok('архів для нього не показано', !back.btns.some(t => /Archive 1/.test(t)), back.btns);
ok('у питанні сказано, куди вони повернуться',
  /show up in the list again/.test((back.asked || {}).body || ''), back.asked);
ok('статус повертається на active',
  back.wrote.length === 1 && back.wrote[0].id === 'r4'
  && back.wrote[0].patch.status === 'active', back.wrote);
ok('у підсумку сказано, скільки повернулось',
  /Returned 1/.test((back.last || {}).t || ''), back.last);

/* ── 9. зникле з парку зникає з вибраного ── */
const gone = await page.evaluate(() => {
  cabMark.clear(); cabFilter = 'all'; cabRender();
  cabMark.add('1002'); cabMark.add('9999');
  cabRender();
  return [...cabMark];
});
ok('кабінет, якого немає в парку, зникає з вибраного',
  gone.join() === '1002', gone);

/* ── 10. таблиця не поїхала від нової колонки ── */
const shape = await page.evaluate(() => {
  cabMark.clear(); cabFilter = 'all'; cabRender();
  const head = document.querySelectorAll('#cab-list thead th').length;
  const tr = document.querySelector('#cab-list .cab-tr');
  const cells = [...tr.children].reduce((a, td) =>
    a + (Number(td.getAttribute('colspan')) || 1), 0);
  return { head, cells };
});
ok('клітинок у рядку стільки ж, скільки в шапці',
  shape.head === shape.cells, shape);

/* Дерево кампаній лежить рядками САМОЇ таблиці, і перші його клітинки
   зведені в одну через colspan. Нова галочка додала стовпець — якби
   colspan лишився старим, назва кампанії поїхала б під статус, а
   числа — кожне на стовпець праворуч. */
const tree = await page.evaluate(() => {
  const was = typeof cdFields === 'function' ? cdFields : null;
  cdFields = () => ({ key: 'k', kids: 0, name: 'Camp', sw: '', status: 'ACTIVE',
                      spend: '$1' });
  const html = cabNodeRow({ id: 'x', kids: [] }, 0, false, cabColsShown());
  if (was) cdFields = was;
  const t = document.createElement('table');
  t.innerHTML = '<tbody>' + html + '</tbody>';
  const tr = t.querySelector('tr');
  return { head: document.querySelectorAll('#cab-list thead th').length,
           cells: [...tr.children].reduce((a, td) =>
             a + (Number(td.getAttribute('colspan')) || 1), 0) };
});
ok('у дереві стовпців стільки ж, скільки в шапці',
  tree.head === tree.cells, tree);

await done(browser, srv, errs);
