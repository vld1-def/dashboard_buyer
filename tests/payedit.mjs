/* ═══════════ ВИПЛАТИ: НАЗВА ОФЕРА — ЦЕ ТЕ, ЗА ЧИМ ЗАХОДЯТЬ ═══════════

   Блок на гео був шириною 208px — рівно стільки, щоб вліз тугл,
   модель, ставка й хрестик. Назві оффера лишалось 63px із 219, і
   обрізало саме її: єдине, за чим рядок відрізняють від сусіднього.
   Три блоки в ряд коштували того, через що в цей список заходять.

   Обрізана назва тут ще й бреше тихо: «Betwinner KZ app» і
   «Betwinner KZ web» під ellipsis читаються одним рядком, а ставки в
   них різні.

   Стенд тримає три речі:

     1. назва вміщається — блок ширший, а довга назва переходить на
        другий рядок, а не зникає;
     2. модель вибирається ПРИ додаванні, інакше кожен відсотковий
        оффер заводиться двічі;
     3. при двадцяти гео є пошук. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8176;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

await page.evaluate(() => {
  window.__pay = { updates: [], toasts: [] };
  window.toast = (t, k) => window.__pay.toasts.push({ t: String(t), k });
  refreshPayoutsFromSQL = async () => {};
  applyGlobalFilter = () => {};
  sb.from = () => ({
    update: v => ({ eq: async (_c, id) => {
      window.__pay.updates.push({ id: String(id), v });
      return { error: null };
    } })
  });
  /* Панель налаштувань тримає ширину класом Tailwind (max-w-4xl), а
     Tailwind у стенді не вантажиться — CDN закритий. Тому ширину
     ставимо руками: 672px — це рівно те, що лишається від модалки на
     896px після навігації збоку й відступів. */
  const l = document.getElementById('geo-payouts-list');
  l.parentElement.style.width = '672px';
});

const LONG = 'Betwinner KZ app';
/* Гео нарочно приходять НЕ в тому порядку, у якому мусять лежати:
   KZ найбільше оферів, а в масиві воно третє. */
const ROWS = [
  { id: '1', geo: 'UA', offer: 'DEFAULT', value: 25, model: 'cpa', active: true },
  { id: '2', geo: 'UA', offer: 'Pinco', value: 40, model: 'spend', active: true },
  { id: '3', geo: 'KZ', offer: LONG, value: 18, model: 'cpa', active: false },
  { id: '4', geo: 'UZ', offer: 'Melbet', value: 22, model: 'cpa', active: true },
  { id: '5', geo: 'TJ', offer: '1win', value: 30, model: 'cpa', active: true },
  { id: '6', geo: 'KG', offer: 'Leon', value: 12, model: 'cpa', active: true },
  { id: '7', geo: 'KZ', offer: 'Mostbet', value: 20, model: 'cpa', active: true },
  { id: '8', geo: 'KZ', offer: '1xBet', value: 16, model: 'cpa', active: true }
];

const draw = rows => page.evaluate(r => {
  payQ = '';
  const f = document.getElementById('payout-find');
  if (f) f.value = '';
  renderGeoPayoutSettings(r);
  return document.getElementById('geo-payouts-list').innerHTML;
}, rows);

await draw(ROWS);

/* ── 1. назва вміщається ── */
const geom = await page.evaluate(() => {
  const grid = document.querySelector('.pay-grid');
  const offs = [...document.querySelectorAll('.pay-off')];
  const long = offs.find(o => o.textContent.trim() === 'Betwinner KZ app');
  const row = long.closest('.pay-row');
  const w = el => el.getBoundingClientRect().width;
  /* Ширину беремо з самої сітки, а не з rect: сторінка живе під
     body { zoom: .9 }, і rect повертає вже помножені пікселі —
     поріг «300px» на них читався б як 270. */
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ');
  return {
    card: Math.round(parseFloat(cols[0])),
    perRow: cols.length,
    name: Math.round(w(long)),
    /* Усе, що в рядку не назва: тугл, модель, ставка, хрестик. */
    rest: Math.round([...row.children].filter(c => c !== long).reduce((a, c) => a + w(c), 0)),
    wrap: getComputedStyle(long).whiteSpace,
    /* Обрізане видно саме так: вмісту більше, ніж видимої коробки. */
    clippedX: long.scrollWidth > long.clientWidth + 1,
    clippedY: long.scrollHeight > long.clientHeight + 1,
    text: long.textContent.trim()
  };
});
ok('блок став ширшим за 300px', geom.card > 300, geom);
/* Доти було навпаки: кнопки займали більше, ніж назва, через яку в
   цей список заходять. */
ok('назві дісталось більше місця, ніж усім кнопкам рядка разом',
  geom.name > geom.rest, geom);
ok('довга назва не обрізана по горизонталі', geom.clippedX === false, geom);
ok('і не обрізана по вертикалі', geom.clippedY === false, geom);
ok('назва лишилась повною', geom.text === 'Betwinner KZ app', geom);
/* Ширшого блока на найдовші назви колись все одно не хватить — тоді
   назва мусить перейти на другий рядок, а не зникнути. */
ok('довга назва переходить на другий рядок', geom.wrap !== 'nowrap', geom);

/* Вузька панель: блок не має вилазити за її край. Саме це робить
   голий minmax(320px, 1fr) у контейнері на 280px. */
const narrow = await page.evaluate(() => {
  const l = document.getElementById('geo-payouts-list');
  l.parentElement.style.width = '280px';
  renderGeoPayoutSettings(payData);
  const g = document.querySelector('.pay-grid').getBoundingClientRect().width;
  const c = document.querySelector('.pay-card').getBoundingClientRect().width;
  l.parentElement.style.width = '672px';
  renderGeoPayoutSettings(payData);
  return { grid: Math.round(g), card: Math.round(c) };
});
ok('на вузькій панелі блок не вилазить за край',
  narrow.card <= narrow.grid + 1, narrow);

/* Ставка натискною була один коміт і виявилась непотрібною: правлять
   її рідко, а місце в рядку вона займала щоразу. */
const val = await page.evaluate(() => {
  const v = document.querySelector('.pay-val');
  return { tag: v.tagName, click: v.getAttribute('onclick'),
           edit: typeof window.editPayoutValue };
});
ok('ставка просто показується, а не вдає кнопку',
  val.tag === 'SPAN' && !val.click, val);
ok('і правки ставки на місці більше немає', val.edit === 'undefined', val);

/* Те, чим рядок керують, лишилось на місці. */
const acts = await page.evaluate(() => {
  const r = document.querySelector('.pay-row');
  return { tog: !!r.querySelector('.pay-tog'), mod: !!r.querySelector('.pay-mod'),
           del: !!r.querySelector('.pay-del') };
});
ok('тугл, модель і видалення на місці',
  acts.tog && acts.mod && acts.del, acts);

/* ── порядок: велике гео зверху ── */
const order = await page.evaluate(() =>
  [...document.querySelectorAll('.pay-head b')].map(b => b.textContent.trim()));
/* Алфавіт тут нічого не означав: гео з одним оффером стояло перед гео
   з трьома тільки тому, що починається на іншу літеру. Правлять і
   шукають у великих — вони й мусять лежати зверху. */
ok('гео з найбільшою кількістю оферів — перше', order[0] === 'KZ', order);
ok('далі за кількістю', order.slice(0, 2).join() === 'KZ,UA', order);
ok('найменші — в кінці', order.slice(2).join() === 'KG,TJ,UZ', order);
/* Вимкнений оффер лишається вписаним: його так само правлять і
   вмикають назад, тож у підрахунку він є. KZ тримає першість саме
   завдяки йому — один із трьох його оферів вимкнений. */
const offCounted = await page.evaluate(() => {
  renderGeoPayoutSettings([
    { id: 'a', geo: 'PL', offer: 'One', value: 1, model: 'cpa', active: true },
    { id: 'b', geo: 'PL', offer: 'Two', value: 1, model: 'cpa', active: false },
    { id: 'c', geo: 'DE', offer: 'Solo', value: 1, model: 'cpa', active: true }
  ]);
  return [...document.querySelectorAll('.pay-head b')].map(b => b.textContent.trim());
});
ok('вимкнені офери теж рахуються', offCounted.join() === 'PL,DE', offCounted);
/* Порядок не має стрибати між перемальовками: Map тримає порядок
   вставки, а він залежить від того, як рядки прийшли з бази. */
const stable = await page.evaluate(rows => {
  const heads = () => [...document.querySelectorAll('.pay-head b')]
    .map(el => el.textContent.trim()).join();
  renderGeoPayoutSettings(rows);
  const a = heads();
  renderGeoPayoutSettings(rows);
  const b = heads();
  renderGeoPayoutSettings([...rows].reverse());
  const c = heads();
  return { a, b, c };
}, ROWS);
ok('той самий порядок при повторному малюванні', stable.a === stable.b, stable);
ok('і не залежить від порядку рядків із бази', stable.a === stable.c, stable);

await draw(ROWS);

/* ── 2. модель вибирається ПРИ додаванні ── */
const model = await page.evaluate(() => {
  const b = document.getElementById('payout-model');
  const v = document.getElementById('payout-value');
  const first = { label: b.textContent.trim(), ph: v.placeholder };
  payModelPick();
  const second = { label: b.textContent.trim(), ph: v.placeholder,
                   pct: b.classList.contains('is-pct') };
  payModelPick();
  return { first, second, back: b.textContent.trim() };
});
ok('типово додається CPA', model.first.label === 'CPA', model);
ok('перемикач міняє модель на відсоток', model.second.label === '%' && model.second.pct, model);
/* «25» означає долари в одній моделі й відсотки в другій — підказка
   поля мусить іти за моделлю, інакше вона бреше в половині випадків. */
ok('підказка ставки йде за моделлю',
  model.first.ph !== model.second.ph, model);
ok('і перемикається назад', model.back === 'CPA', model);

/* ── 3. пошук ── */
const found = await page.evaluate(() => {
  document.getElementById('payout-find').value = 'pinco';
  payFind();
  const html = document.getElementById('geo-payouts-list').innerHTML;
  return { pinco: /Pinco/.test(html), melbet: /Melbet/.test(html) };
});
ok('фільтр лишає знайдене', found.pinco === true, found);
ok('і ховає решту', found.melbet === false, found);

const byGeo = await page.evaluate(() => {
  document.getElementById('payout-find').value = 'kz';
  payFind();
  const html = document.getElementById('geo-payouts-list').innerHTML;
  return { kz: /Betwinner/.test(html), ua: /Pinco/.test(html) };
});
ok('шукати можна й за гео', byGeo.kz === true && byGeo.ua === false, byGeo);

const none = await page.evaluate(() => {
  document.getElementById('payout-find').value = 'щось-чого-немає';
  payFind();
  return document.getElementById('geo-payouts-list').textContent;
});
/* Порожнеча мусить називати свою причину: інакше вона читається як
   «виплат немає» — а вони є, просто не під цей фільтр.

   Перевіряємо текст ЗІБРАНОЇ сторінки: словник build/i18n.py
   перекладає підрядками, і фраза зі словом-хвостом їхала наполовину
   англійською. Тому ж тут і перевірка на мішанину. */
ok('порожній результат пояснює себе', /Nothing found|Нічого не знайшлось/.test(none), { none });
ok('і сам запит видно в ньому', /щось-чого-немає/.test(none), { none });
const UA_WORD = /[а-яіїєґ]{3,}/i;
ok('рядок не мішає дві мови',
  !(/Nothing found/.test(none) && UA_WORD.test(none.replace('щось-чого-немає', ''))),
  { none });

const short = await page.evaluate(() => {
  payQ = ''; document.getElementById('payout-find').value = '';
  renderGeoPayoutSettings([{ id: '1', geo: 'UA', offer: 'X', value: 5, model: 'cpa' }]);
  return document.getElementById('payout-find-row').classList.contains('hidden');
});
ok('на короткому списку пошуку немає', short === true, { short });

await draw(ROWS);
const long2 = await page.evaluate(() =>
  !document.getElementById('payout-find-row').classList.contains('hidden'));
ok('а на довгому зʼявляється', long2 === true, { long2 });

/* ── прапорці ── */
const flags = await draw(ROWS);
ok('біля гео стоїть прапорець', /flagcdn\.com\/w40\/ua\.png/.test(flags), flags.slice(0, 200));

await done(browser, srv, errs);
