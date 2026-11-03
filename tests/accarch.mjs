/* ═══════════ АРХІВ У ВІКНІ ACCOUNTS ═══════════

   «коли я відправляю в архів кабінети, в модальному вікні акаунти все
   виходить в актив» і «чому постійно з архіву кабінети переходять в
   інший статус, для чого тоді архів».

   Словник станів цього вікна знав три слова — active, ban, problem, —
   а сторінка Cabinets пише в ту саму колонку четверте: archive. І все
   незнайоме тут мовчки ставало 'active'. Тобто кабінет, прибраний в
   архів, тут стояв «Активним», та ще й кнопка «Активний» була
   підсвічена: один випадковий клік — і архів зникав уже й у базі.

   Нічого автоматичного статус не міняло й не міняє: у базу пише лише
   клік по кнопці. Саме тому вада й виглядала як «живе своїм життям» —
   бачиш одне, у базі інше.

   Стенд тримає:
     1. архів показується архівом, а не активом;
     2. архівних немає в списку без фільтра — як і на сторінці
        Cabinets, інакше «відправив в архів» не означає нічого;
     3. плитка «Усі» рахує те, що видно, а архів має власну;
     4. невідоме слово лишається собою, а не стає активом;
     5. саме відкриття вікна в базу не пише нічого. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8184;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const ROWS = [
  { id: 'r1', account_id: '1001', provider_name: 'A', status: 'active' },
  { id: 'r2', account_id: '1002', provider_name: 'A', status: 'ban' },
  { id: 'r3', account_id: '1003', provider_name: 'B', status: 'archive' },
  { id: 'r4', account_id: '1004', provider_name: 'B', status: 'archive' },
  /* Слово, якого в словнику немає взагалі: саме так виглядає будь-яке
     майбутнє поповнення, і воно не має перетворюватись на «актив». */
  { id: 'r5', account_id: '1005', provider_name: 'C', status: 'frozen' }
];

await page.evaluate(() => {
  window.__w = [];
  sb.from = () => ({ update: v => ({ eq: async (_c, id) => {
    window.__w.push({ id, v }); return { error: null };
  } }) });
  rawData = [];
});

const draw = flt => page.evaluate(([rows, f]) => {
  accRows = rows.map(r => ({ ...r })); accHasStatusCol = true; accFilter = f;
  document.getElementById('accounts-modal').classList.remove('hidden');
  renderAccountsModal();
  const body = document.getElementById('accounts-modal-body');
  const tiles = [...document.querySelectorAll('#acc-summary .acc-tile')]
    .map(t => ({ l: t.querySelector('.acc-tile-l').textContent.trim(),
                 n: t.querySelector('.acc-tile-n').textContent.trim() }));
  return {
    tiles,
    ids: [...body.querySelectorAll('.acc-row')]
      .map(r => r.querySelector('span').textContent.trim()),
    on: [...body.querySelectorAll('.acc-row')].map(r => ({
      id: r.querySelector('span').textContent.trim(),
      st: [...r.querySelectorAll('.acc-st.is-on')].map(b => b.textContent.trim()).join('|')
    }))
  };
}, [ROWS, flt]);

/* ── 1. без фільтра ── */
const all = await draw('');
ok('архівних у списку немає', !all.ids.includes('1003') && !all.ids.includes('1004'), all.ids);
ok('а робочі на місці', all.ids.includes('1001') && all.ids.includes('1002'), all.ids);
/* Плитка, яка каже 5, і список на 3 — це дві різні правди на одному
   екрані. */
/* Підписи беремо ЗІБРАНОЇ сторінки: словник build/i18n.py перекладає
   їх на англійську, і перевіряти тут українські означало б перевіряти
   те, чого на екрані немає. */
const tile = (t, l) => (t.tiles.find(x => x.l === l) || {}).n;
ok('плитка «Усі» рахує без архіву', tile(all, 'All') === '3', all.tiles);
ok('а архів має власну плитку й своє число', tile(all, 'Archive') === '2', all.tiles);
/* Той самий шов, на якому цей проєкт уже спіймався тричі: нове слово
   без запису в словнику лишається єдиним українським серед
   англійських. */
ok('плитки не мішають дві мови',
  !all.tiles.some(t => /[а-яіїєґ]{3,}/i.test(t.l)), all.tiles.map(t => t.l));
/* Чуже слово теж мусить десь порахуватись, інакше сума станів менша
   за «усіх» без пояснення. */
ok('невідомий статус має свою плитку', tile(all, 'frozen') === '1', all.tiles);

/* ── 2. під фільтром «Архів» ── */
const arch = await draw('archive');
ok('фільтр показує саме архівні',
  arch.ids.length === 2 && arch.ids.includes('1003'), arch.ids);
/* Головне: підсвічена кнопка — та, у якій кабінет СПРАВДІ є. Доти
   світився «Активний», і клік по ньому виглядав як «нічого не
   міняю». */
ok('у рядку підсвічений Архів, а не Активний',
  arch.on.every(r => r.st === 'Archive'), arch.on);

/* ── 3. невідоме слово лишається собою ── */
const odd = await draw('frozen');
ok('невідомий статус не став активом',
  odd.ids.join() === '1005' && odd.on[0].st === 'frozen', odd);

/* ── 4. саме вікно в базу не пише ── */
const wrote = await page.evaluate(() => window.__w.length);
ok('відкриття вікна нічого не записує', wrote === 0, { wrote });

/* ── 5. а клік — пише, і саме те ── */
const click = await page.evaluate(async () => {
  window.__w = [];
  await accSetStatus('r3', 'active');
  return window.__w;
});
ok('клік по статусу пише в базу', click.length === 1 && click[0].id === 'r3', click);
ok('і саме той статус, по якому клікнули', click[0].v.status === 'active', click);

await done(browser, srv, errs);
