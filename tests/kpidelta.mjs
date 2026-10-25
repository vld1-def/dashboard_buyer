/* ═══════════ СТРІЛКА БІЛЯ NET PROFIT ═══════════

   «в карточці net profit пропали дані, просто пише після даних = і пусто».

   Стрілка показує рух самого тотала: яким він був станом на попередній
   день і яким став з останнім. Останнім вона брала просто найсвіжішу
   дату в зрізі — а рядок у daily_stats зʼявляється РАНІШЕ, ніж у ньому
   зʼявляються гроші: імпорт за сьогодні часто приходить із нулями.
   Такий день ставав останнім, різниця виходила рівно 0, і стрілка
   писала «=» — тобто «тотал не рухався». Насправді ми порівнювали з
   порожнім днем, а справжній рух за попередній день не показували
   взагалі.

   Стенд тримає межі:
     • порожній хвіст не з'їдає стрілку — порівнюємо два останні дні З ГРІШМИ;
     • рівний день усе ще дає «=» — це справжня відповідь, не поломка;
     • один день із грішми — стрілки немає: порівнювати ні з чим;
     • підказка називає ті самі дні, за якими стрілка порахована. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8153;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const M = '2026-10';
const D = n => `${M}-${String(n).padStart(2, '0')}`;

const setup = (rows) => page.evaluate(([rws, month]) => {
  try { localStorage.removeItem('kpi_lens'); localStorage.removeItem('kpi_net'); } catch (e) {}
  currentMonthFilter = month;
  // Виплата CPA: $100 за деп. Виручка = депи × 100.
  globalPayouts = { 'KG_DEFAULT': 100 };
  payoutModels = { 'KG_DEFAULT': 'cpa' };
  rawData = rws; window.rawData = rws;
  window._kpiExpensesVal = 0; window._kpiFeesVal = 0;
  renderDashboard(rws);
  const d = document.getElementById('delta-profit');
  return {
    profit: document.getElementById('kpi-profit').textContent.trim(),
    delta: d.textContent.trim(),
    cls: d.className,
    tip: d.getAttribute('title') || '',
    prev: window._kpiTotPrev,
    when: window._kpiTotWhen
  };
}, [rows, M]);

/* ─────────── порожній хвіст ───────────
   1-го профіт +$100, 2-го +$300, 3-го рядок уже є, але з нулями. */
const tail = await setup([
  { date: D(1), geo: 'KG', offer: 'X', spend: 100, deposits: 2, regs: 10 },
  { date: D(2), geo: 'KG', offer: 'X', spend: 200, deposits: 5, regs: 20 },
  { date: D(3), geo: 'KG', offer: 'X', spend: 0,   deposits: 0, regs: 0  }
]);
ok('тотал порахований по всіх днях', tail.profit === '$400.00', tail);
ok('стрілка не «=» — порожній день не рахується за рівний',
  tail.delta !== '=' && !/is-flat/.test(tail.cls), tail);
ok('вона показує рух за ОСТАННІЙ ДЕНЬ З ГРІШМИ (+$300)',
  /▲/.test(tail.delta) && /300/.test(tail.delta), tail);
ok('і відсоток від попереднього тотала (300 від 100 = 300%)',
  /300%/.test(tail.delta), tail.delta);
ok('підказка називає саме ті два дні', tail.when
  && tail.when.prev === D(1) && tail.when.cur === D(2)
  && tail.tip.includes(D(1)) && tail.tip.includes(D(2)), tail);

/* ─────────── справжній рівний день ───────────
   3-го спенд є, і профіт за нього рівно 0: спенд $100, один деп $100. */
const flat = await setup([
  { date: D(1), geo: 'KG', offer: 'X', spend: 100, deposits: 2 },
  { date: D(2), geo: 'KG', offer: 'X', spend: 200, deposits: 5 },
  { date: D(3), geo: 'KG', offer: 'X', spend: 100, deposits: 1 }
]);
ok('рівний день усе ще дає «=» — це відповідь, а не поломка',
  flat.delta === '=' && /is-flat/.test(flat.cls), flat);
ok('і «=» каже в підказці, що порожні дні не рахуються',
  /не беруться/.test(flat.tip), flat.tip);
ok('підказка «=» називає дні 2 → 3', flat.when
  && flat.when.prev === D(2) && flat.when.cur === D(3), flat.when);

/* ─────────── один день із грішми ─────────── */
const one = await setup([
  { date: D(1), geo: 'KG', offer: 'X', spend: 100, deposits: 2 },
  { date: D(2), geo: 'KG', offer: 'X', spend: 0, deposits: 0 },
  { date: D(3), geo: 'KG', offer: 'X', spend: 0, deposits: 0 }
]);
ok('один день із грішми — стрілки немає, бо порівнювати ні з чим',
  one.delta === '' && one.prev === null, one);
ok('і підписів періоду теж немає — щоб не лишились від іншого зрізу',
  one.when === null, one.when);
ok('але сам тотал показаний', one.profit === '$100.00', one);

/* ─────────── депи без спенду теж роблять день живим ─────────── */
const deps = await setup([
  { date: D(1), geo: 'KG', offer: 'X', spend: 100, deposits: 2 },
  { date: D(2), geo: 'KG', offer: 'X', spend: 0,   deposits: 3 }
]);
ok('день із депами, але без спенду — живий: гроші в ньому є',
  /▲/.test(deps.delta) && /300/.test(deps.delta), deps);

await done(browser, srv, errs);
