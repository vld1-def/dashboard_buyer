/* ═══════════ ВИПЛАТИ: БЛОК НА ГЕО ═══════════

   Був плоский список: рядок на кожну пару гео+оффер, гео повторювалось
   у кожному рядку, а сам рядок тягнувся на всю ширину панелі майже
   порожнім. Тепер один блок — одне гео, а всередині його офери.

   Стенд тримає те, що легко загубити при перекладанні розмітки:
     • усі три дії лишились на кожному офері (тугл, модель, видалення)
       і кличуться з тим самим id;
     • гео названо один раз, офери — всередині свого гео;
     • гео з найбільшою кількістю оферів лежить зверху: алфавіт тут
       нічого не означав, а правлять і шукають у великих;
     • DEFAULT стоїть першим: це ставка «на все інше в цьому гео»;
     • вимкнений оффер видно, а гео, де вимкнено ВСЕ, названо окремо —
       виручка по ньому нуль, і це найтихіша поломка з можливих;
     • порожній список не мовчить, а каже, чим це загрожує. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8144;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const paint = rows => page.evaluate(rows => {
  renderGeoPayoutSettings(rows);
  const box = document.getElementById('geo-payouts-list');
  const cards = [...box.querySelectorAll('.pay-card')].map(c => ({
    geo: c.querySelector('.pay-head b').textContent.trim(),
    n: c.querySelector('.pay-n').textContent.trim(),
    off: c.classList.contains('is-off'),
    rows: [...c.querySelectorAll('.pay-row')].map(r => ({
      offer: r.querySelector('.pay-off').textContent.trim(),
      val: r.querySelector('.pay-val').textContent.trim(),
      mod: r.querySelector('.pay-mod').textContent.trim(),
      on: r.querySelector('.pay-tog').classList.contains('is-on'),
      dead: r.classList.contains('is-off'),
      tog: r.querySelector('.pay-tog').getAttribute('onclick'),
      modClick: r.querySelector('.pay-mod').getAttribute('onclick'),
      del: r.querySelector('.pay-del').getAttribute('onclick')
    }))
  }));
  return { cards, html: box.innerHTML, grid: !!box.querySelector('.pay-grid') };
}, rows);

const P = (id, geo, offer, value, extra) => Object.assign(
  { id, geo, offer, value, model: 'cpa', active: true }, extra);

/* Блок шукаємо ПО ГЕО, а не по номеру в списку: порядок блоків — це
   окреме правило (і окрема перевірка нижче), і решта стенда не мусить
   ламатись від того, що воно змінилось. */
const card = (r, geo) => r.cards.find(c => c.geo === geo) || {};

const a = await paint([
  P(1, 'UZ', 'Boostwin', 25), P(2, 'KG', 'Melbet', 18),
  P(3, 'UZ', 'DEFAULT', 20), P(4, 'UZ', 'Mostbet', 30, { active: false }),
  P(5, 'PL', '1xBet', 12, { model: 'spend', value: 40 })
]);
ok('блоки стоять сіткою', a.grid);
/* UZ має три офери, KG і PL — по одному, тож UZ зверху, а між
   рівними — алфавіт, щоб порядок не стрибав між перемальовками. */
ok('один блок — одне гео, найбільше оферів — зверху',
  JSON.stringify(a.cards.map(c => c.geo)) === JSON.stringify(['UZ', 'KG', 'PL']),
  a.cards.map(c => c.geo));
ok('гео назване один раз, а не в кожному рядку',
  (a.html.match(/>UZ</g) || []).length === 1, (a.html.match(/>UZ</g) || []).length);
ok('офери лежать у своєму гео',
  JSON.stringify(card(a, 'UZ').rows.map(r => r.offer))
    === JSON.stringify(['DEFAULT', 'Boostwin', 'Mostbet']), card(a, 'UZ').rows.map(r => r.offer));
ok('DEFAULT першим: це ставка на все інше в гео', card(a, 'UZ').rows[0].offer === 'DEFAULT');

/* Дії — головне, що можна загубити, перекладаючи розмітку. */
const uzMost = card(a, 'UZ').rows[2];
ok('тугл кличе ту саму функцію з тим самим id',
  uzMost.tog === "togglePayoutActive('4', true)", uzMost.tog);
ok('перемикач моделі теж',
  card(a, 'UZ').rows[1].modClick === "togglePayoutModel('1', 'spend')",
  card(a, 'UZ').rows[1].modClick);
ok('видалення теж', uzMost.del === "deletePayoutFromSQL('4')", uzMost.del);

ok('CPA показує $, спенд-модель — %',
  card(a, 'UZ').rows[1].val === '$25' && card(a, 'UZ').rows[1].mod === 'CPA'
  && card(a, 'PL').rows[0].val === '40%' && card(a, 'PL').rows[0].mod === '%',
  [card(a, 'UZ').rows[1], card(a, 'PL').rows[0]]);

ok('вимкнений оффер видно', uzMost.dead && !uzMost.on, uzMost);
ok('у шапці гео стоїть, скільки з них живих',
  card(a, 'UZ').n === '2 з 3' && card(a, 'KG').n === '1',
  [card(a, 'UZ').n, card(a, 'KG').n]);

/* ─────────── гео, де вимкнено все ─────────── */
const b = await paint([
  P(1, 'TJ', 'Dead', 10, { active: false }),
  P(2, 'TJ', 'AlsoDead', 10, { active: false }),
  P(3, 'KG', 'Melbet', 18)
]);
ok('гео, де вимкнено все, позначене',
  card(b, 'TJ').off && card(b, 'TJ').n === 'усі вимкнені', card(b, 'TJ'));
ok('і сказано, чим це загрожує',
  /виручка по ньому рахується нулем/.test(b.html), b.html.slice(0, 400));
ok('живе гео не позначене', !card(b, 'KG').off, card(b, 'KG'));

/* ─────────── порожньо ─────────── */
const empty = await page.evaluate(() => {
  renderGeoPayoutSettings([]);
  return document.getElementById('geo-payouts-list').textContent;
});
ok('порожній список не мовчить, а каже, чим це загрожує',
  /Виплат ще немає/.test(empty) && /рахуються нулем/.test(empty), empty);

/* ─────────── назва оффера з лапками не ламає розмітку ─────────── */
const q = await paint([P(7, 'KG', 'A "B" <i>', 9)]);
ok('лапки й кутові дужки в назві екрануються',
  q.cards[0].rows[0].offer === 'A "B" <i>' && !/<i>/.test(q.html), q.cards[0].rows[0].offer);

await done(browser, srv, errs);
