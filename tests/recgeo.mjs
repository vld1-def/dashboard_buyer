/* ═══════════ RECORDS: ГЕО СПИСКОМ, ОФЕР ЗА ГЕО ═══════════

   Асистент вписав у рядок гео KG і вибрав офер від UZ. Зробити це було
   нічим не важче за правильне: гео друкували в вільну клітинку, а
   список оферів показував усі офери команди, без огляду на гео.

   Стенд тримає рівно те, що цьому заважає:
     • гео — випадайка з відомих гео (виплати + те, що вже в рядках),
       і гео рядка нікуди не зникає, навіть якщо виплати на нього немає;
     • офери свого гео стоять окремою групою першими, решта — нижче й
       з підписом свого гео, тож чужий вибір видно, а не вгадують;
     • гео без жодної виплати не дає порожнього списку, а називає причину;
     • офер не того гео позначений — разом із тим, чого це коштує;
     • змінив гео — список оферів цього рядка перемалювався відразу;
     • офер довідника не губиться: офер із рядка лишається в списку. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8141;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, {
  path: 'Form.html',
  init: () => {
    const mk = window.supabase.createClient;
    window.supabase.createClient = (...a) => {
      const c = mk(...a);
      c.auth.getSession = async () => ({ data: { session: { user: { id: 'u1' } } } });
      return c;
    };
    localStorage.setItem('selected_team', 'TEST');
    window.alert = m => { window.__alert = String(m); };
  }
});

const seed = () => page.evaluate(() => {
  currentTeam = 'TEST';
  recCurrentTable = 'daily_stats';
  recFilters = {};
  recSel.clear();
  recPage = 1;
  recSort = { key: 'date', dir: 1 };
  globalOffersCache = [
    { offer: 'Boostwin', geo: 'UZ' }, { offer: 'Mostbet', geo: 'UZ' },
    { offer: 'Melbet',   geo: 'KG' }, { offer: '1xBet',   geo: 'PL' }
  ];
  const row = (id, geo, offer) => ({ id, date: '2026-10-20', account: '111', geo, offer,
    landing: '', site: '', funnel: 'F1', agent: '', spend: 10, installs: 1, regs: 1, deposits: 0 });
  recRows = [row(1, 'KG', 'Boostwin'), row(2, 'UZ', 'Mostbet'),
             row(3, 'TJ', 'Keitaro1'), row(4, '', '')];
  recGeoChanged();
  recRender();
});
await seed();

const cell = (id, col) => page.evaluate(([id, col]) => {
  const tr = document.querySelector(`#rec-tbody tr[data-id="${id}"]`);
  const sel = tr.querySelector(`select[data-col="${col}"]`);
  const grp = [...sel.querySelectorAll('optgroup')].map(g => ({
    lab: g.label,
    opts: [...g.querySelectorAll('option')].map(o => o.textContent.trim()),
    off: [...g.querySelectorAll('option')].filter(o => o.disabled).length
  }));
  return { tag: sel.tagName, val: sel.value,
           all: [...sel.options].map(o => o.value), grp,
           neq: (tr.querySelector('.rec-neq') || {}).title || '' };
}, [id, col]);

/* ─────────── гео: випадайка ─────────── */
const g1 = await cell(1, 'geo');
ok('гео — випадайка, а не вільна клітинка', g1.tag === 'SELECT', g1.tag);
ok('у списку всі гео виплат і гео з рядків, за алфавітом',
  JSON.stringify(g1.all) === JSON.stringify(['', 'KG', 'PL', 'TJ', 'UZ', '__NEW_GEO__']), g1.all);
ok('гео рядка вибране', g1.val === 'KG', g1.val);
ok('нове гео заводять окремим видимим пунктом',
  g1.all[g1.all.length - 1] === '__NEW_GEO__', g1.all);

ok('гео, на яке виплати немає, зі списку не зникає (TJ стоїть у рядку)',
  (await cell(3, 'geo')).val === 'TJ');

/* ─────────── офер: фільтр за гео ─────────── */
const o1 = await cell(1, 'offer');
ok('офери свого гео — перша група', o1.grp[0].lab === 'KG'
  && JSON.stringify(o1.grp[0].opts) === JSON.stringify(['Melbet']), o1.grp[0]);
ok('решта — нижче й з підписом свого гео',
  o1.grp[1].lab === 'other geos'
  && o1.grp[1].opts.includes('Boostwin · UZ') && o1.grp[1].opts.includes('1xBet · PL'), o1.grp[1]);
ok('офер із рядка, якого немає у виплатах, у списку лишається',
  o1.grp[1].opts.includes('Keitaro1 · no payout'), o1.grp[1].opts);
ok('вибраний офер — той, що в рядку, навіть коли він чужого гео',
  o1.val === 'Boostwin', o1.val);
ok('і це видно міткою, з ціною помилки',
  /payout for UZ, not for KG/.test(o1.neq) && /counts as zero/.test(o1.neq), o1.neq);

const o2 = await cell(2, 'offer');
ok('свій офер свого гео мітки не має', o2.neq === '' && o2.val === 'Mostbet', o2);
ok('у групі гео стоять усі офери цього гео',
  JSON.stringify(o2.grp[0].opts) === JSON.stringify(['Boostwin', 'Mostbet']), o2.grp[0]);

const o3 = await cell(3, 'offer');
ok('гео без жодної виплати не дає порожнього списку, а називає причину',
  o3.grp[0].lab === 'TJ' && o3.grp[0].off === 1
  && /no offer has a payout for TJ/.test(o3.grp[0].opts[0]), o3.grp[0]);
ok('офер без виплати позначений, і сказано, що це нуль виручки',
  /no payout at all/.test(o3.neq) && /counts as zero/.test(o3.neq), o3.neq);

const o4 = await cell(4, 'offer');
ok('без гео фільтрувати нема за чим — список про це й каже',
  /pick GEO first/.test(o4.grp[0].lab), o4.grp.map(g => g.lab));
ok('порожнє гео мітку не ставить: судити офер ще нема за чим', o4.neq === '', o4.neq);

/* ─────────── змінив гео — інший список оферів ─────────── */
await page.evaluate(() => {
  const sel = document.querySelector('#rec-tbody tr[data-id="1"] select[data-col="geo"]');
  sel.value = 'UZ';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(150);
const after = await cell(1, 'offer');
ok('гео змінилось — група оферів цього рядка стала іншою',
  after.grp[0].lab === 'UZ' && after.grp[0].opts.includes('Boostwin'), after.grp[0]);
ok('мітка зникла сама: офер і гео тепер збігаються', after.neq === '', after.neq);
ok('воронка теж бачить нове гео рядка', await page.evaluate(() =>
  document.querySelector('#rec-tbody tr[data-id="1"] .rec-list[data-col="funnel"]').dataset.geo === 'UZ'));

/* ─────────── новий рядок: єдиний офер гео ─────────── */
await seed();
const add = await page.evaluate(async () => {
  window.__ins = null;
  sb.from = () => ({ insert: rows => ({ select: async () => {
    window.__ins = rows[0];
    return { data: [{ ...rows[0], id: 9 }], error: null };
  } }) });
  recFilters = { geo: new Set(['kg']) };
  await recAddRow();
  return window.__ins;
});
ok('рядок успадкував гео з фільтра', add && add.geo === 'KG', add);
ok('офер підставився сам — для KG він один', add && add.offer === 'Melbet', add);

const add2 = await page.evaluate(async () => {
  window.__ins = null;
  recFilters = { geo: new Set(['uz']) };
  await recAddRow();
  return window.__ins;
});
ok('два однаково можливі офери за людину не вибирають',
  add2 && add2.geo === 'UZ' && add2.offer === 'DEFAULT', add2);

/* ─────────── масова правка ─────────── */
await seed();
const bulk = await page.evaluate(col => {
  recSel = new Set(['1', '2']);
  recRenderBulkBar();
  document.getElementById('rec-bulk-col').value = col;
  recBulkColChanged();
  const inp = document.getElementById('rec-bulk-value');
  return { list: inp.getAttribute('list'),
           opts: [...document.querySelectorAll('#rec-bulk-dl option')]
                   .map(o => [o.value, o.textContent.trim()]) };
}, 'geo');
ok('гео масово — теж зі списку, а не вільним рядком',
  bulk.list === 'rec-bulk-dl'
  && JSON.stringify(bulk.opts.map(o => o[0])) === JSON.stringify(['KG', 'PL', 'TJ', 'UZ']), bulk);

const bulkOff = await page.evaluate(() => {
  document.getElementById('rec-bulk-col').value = 'offer';
  recBulkColChanged();
  return [...document.querySelectorAll('#rec-bulk-dl option')].map(o => [o.value, o.textContent.trim()]);
});
ok('у масовому списку оферів видно, за яке гео платить кожен',
  bulkOff.some(o => o[0] === 'Melbet' && o[1] === 'KG')
  && bulkOff.some(o => o[0] === 'Keitaro1' && o[1] === 'no payout'), bulkOff);

await done(browser, srv, errs);
