/* ═══════════ ВИПЛАТИ: НАЙЧАСТІША ДІЯ МАЄ БУТИ НАЙКОРОТШОЮ ═══════════

   Список виплат давно картками по гео, але правити в ньому було
   незручно рівно там, де правлять найчастіше:

     1. ставку не можна було ЗМІНИТИ — лише видалити оффер і завести
        наново. Тобто найчастіша дія йшла через незворотне видалення;
     2. модель вибиралась ПІСЛЯ додавання, тож кожен відсотковий
        оффер заводився двічі;
     3. при двадцяти гео лишалось тільки гортати.

   Стенд тримає саме ці три речі, а не вигляд. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8176;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

await page.evaluate(() => {
  window.__pay = { updates: [], answer: '30', asked: null, toasts: [] };
  window.toast = (t, k) => window.__pay.toasts.push({ t: String(t), k });
  window.ask = async o => { window.__pay.asked = o; return window.__pay.answer; };
  refreshPayoutsFromSQL = async () => {};
  applyGlobalFilter = () => { window.__pay.repainted = true; };
  sb.from = () => ({
    update: v => ({ eq: async (_c, id) => {
      window.__pay.updates.push({ id: String(id), v });
      return { error: window.__pay.err || null };
    } })
  });
});

const ROWS = [
  { id: '1', geo: 'UA', offer: 'DEFAULT', value: 25, model: 'cpa', active: true },
  { id: '2', geo: 'UA', offer: 'Pinco', value: 40, model: 'spend', active: true },
  { id: '3', geo: 'KZ', offer: 'Mostbet', value: 18, model: 'cpa', active: false },
  { id: '4', geo: 'UZ', offer: 'Melbet', value: 22, model: 'cpa', active: true },
  { id: '5', geo: 'TJ', offer: '1win', value: 30, model: 'cpa', active: true },
  { id: '6', geo: 'KG', offer: 'Leon', value: 12, model: 'cpa', active: true }
];

const draw = rows => page.evaluate(r => {
  payQ = '';
  const f = document.getElementById('payout-find');
  if (f) f.value = '';
  renderGeoPayoutSettings(r);
  return document.getElementById('geo-payouts-list').innerHTML;
}, rows);

await draw(ROWS);

/* ── 1. ставка редагується на місці ── */
const edited = await page.evaluate(async () => {
  window.__pay.updates = []; window.__pay.repainted = false;
  await editPayoutValue('2');
  return { asked: window.__pay.asked, updates: window.__pay.updates,
           repainted: window.__pay.repainted, toasts: window.__pay.toasts };
});
ok('ставка міняється без видалення оффера',
  edited.updates.length === 1 && edited.updates[0].id === '2', edited.updates);
ok('і зберігається саме нове число', edited.updates[0].v.value === 30, edited.updates);
/* «25» у CPA і «25» у відсотковій — різні гроші, тож вікно мусить
   казати, яке з двох перед тобою. */
ok('у вікні сказано, яка це модель',
  /спенд × відсоток/.test((edited.asked || {}).body || ''), edited.asked);
ok('і яке гео з оффером правимо',
  /UA/.test((edited.asked || {}).title || '') && /Pinco/.test((edited.asked || {}).title || ''),
  edited.asked);
/* Виручка рахується з цієї ставки: лишити старий профіт під новою
   ставкою означало б показати два числа, які не сходяться. */
ok('числа перераховуються одразу', edited.repainted === true, edited);

const same = await page.evaluate(async () => {
  window.__pay.updates = []; window.__pay.answer = '40';
  await editPayoutValue('2');
  window.__pay.answer = '30';
  return window.__pay.updates.length;
});
ok('те саме число не йде в базу', same === 0, { same });

const bad = await page.evaluate(async () => {
  window.__pay.updates = []; window.__pay.answer = 'абв';
  await editPayoutValue('1');
  window.__pay.answer = '30';
  return { n: window.__pay.updates.length, toasts: window.__pay.toasts };
});
ok('сміття замість ставки не зберігається', bad.n === 0, bad);
ok('і про це сказано', bad.toasts.some(t => /Це не ставка/.test(t.t)), bad.toasts);

const esc = await page.evaluate(async () => {
  window.__pay.updates = []; window.__pay.answer = false;
  await editPayoutValue('1');
  window.__pay.answer = '30';
  return window.__pay.updates.length;
});
ok('скасування нічого не міняє', esc === 0, { esc });

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
  return { kz: /Mostbet/.test(html), ua: /Pinco/.test(html) };
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
const long = await page.evaluate(() =>
  !document.getElementById('payout-find-row').classList.contains('hidden'));
ok('а на довгому зʼявляється', long === true, { long });

/* ── прапорці ── */
const flags = await draw(ROWS);
ok('біля гео стоїть прапорець', /flagcdn\.com\/w40\/ua\.png/.test(flags), flags.slice(0, 200));

await done(browser, srv, errs);
