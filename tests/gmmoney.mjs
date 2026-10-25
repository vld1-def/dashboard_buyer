/* ═══════════ МОДАЛКА ГЕО: СПЕНД І ПРОФІТ ПО ДНЯХ ═══════════

   «графік так і не появився в гео брейкдаун бо ти його вставив не
   туди… в нас є блок з гео, коли клікаємо відкривається інфа по
   ньому».

   Два графіки спершу поїхали в блок Geo Breakdown на дашборді. Тим
   блоком не користуються — відкривають саме це вікно, кліком по гео.
   Тому спенд і профіт стоять у ньому, і стоять ПЕРШИМИ: «скільки
   вклали і скільки знялось» передує «скільки коштував деп».

   Стенд тримає межі:
     • обидва графіки є і стоять перед ціновими;
     • профіт рахується ТІЄЮ САМОЮ виручкою, що й KPI-картка;
     • мінусовий день видно окремим кольором, а не лише напрямком;
     • підпис називає тотал — інакше стовпчики довелось би складати очима;
     • профіт у нулі весь місяць каже, ЧОГО бракує (виплати), а не
       просто «немає даних»;
     • чуже гео і чужий місяць у підрахунок не лізуть. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8154;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const M = '2026-10';
const D = n => `${M}-${String(n).padStart(2, '0')}`;

/* KG: 1-го +$100 профіту, 2-го −$150, 3-го без спенду.
   TJ і минулий місяць — щоб перевірити, що вони не домішуються. */
const DAILY = [
  { date: D(1), geo: 'KG', offer: 'X', spend: 100, deposits: 2, regs: 10, installs: 40 },
  { date: D(2), geo: 'KG', offer: 'X', spend: 250, deposits: 1, regs: 8,  installs: 30 },
  { date: D(3), geo: 'KG', offer: 'X', spend: 0,   deposits: 0, regs: 0,  installs: 0 },
  { date: D(2), geo: 'TJ', offer: 'X', spend: 999, deposits: 9, regs: 90, installs: 90 },
  { date: '2026-09-15', geo: 'KG', offer: 'X', spend: 777, deposits: 7, regs: 7, installs: 7 }
];

/* Chart.js тягнеться з CDN, а він тут закритий політикою проксі —
   cfWait відмовляється малювати і вертає false. Підміняємо: стенд
   перевіряє, ЯКІ дані й кольори йдуть у графік, а не те, як Chart.js
   їх малює. */
const draw = (daily, payouts) => page.evaluate(([rows, pay, month]) => {
  cfLibOk = true;
  window.Chart = function (ctx, cfg) { this.config = cfg; this.destroy = function () {}; };
  currentMonthFilter = month;
  globalPayouts = pay.v; payoutModels = pay.m;
  rawData = rows; window.rawData = rows;
  creativesRawData = []; window.creativesRawData = [];
  document.getElementById('geo-details-modal').classList.remove('hidden');
  window.__geoModalGeo = 'KG';
  renderGeoCostTab('KG');
  const cards = [...document.querySelectorAll('#geo-cost-list .gm-card')].map(c => ({
    short: c.querySelector('span').textContent.trim(),
    note: (c.querySelector('[id^="gm"][id*="note"]') || {}).textContent || '',
    canvas: (c.querySelector('canvas') || {}).id || '',
    empty: c.querySelector('.gm-canvas-box').textContent.trim()
  }));
  const ch = (window.gmCharts || []).map(c => ({
    type: c.config.type,
    data: c.config.data.datasets[0].data,
    colors: c.config.data.datasets[0].backgroundColor,
    labels: c.config.data.labels
  }));
  return { cards, ch };
}, [daily, payouts, M]);

// CPA $100 за деп: 1-го виручка $200 при спенді $100 → +$100;
//                  2-го виручка $100 при спенді $250 → −$150.
const CPA = { v: { 'KG_DEFAULT': 100 }, m: { 'KG_DEFAULT': 'cpa' } };
const r = await draw(DAILY, CPA);

ok('у вкладці є картка Spend', r.cards.some(c => /Spend/i.test(c.short)), r.cards.map(c => c.short));
ok('і картка Profit', r.cards.some(c => /Profit/i.test(c.short)), r.cards.map(c => c.short));
ok('гроші стоять ПЕРЕД цінами',
  r.cards.findIndex(c => /Profit/i.test(c.short)) < r.cards.findIndex(c => /CPC/i.test(c.short)),
  r.cards.map(c => c.short));
ok('цінові графіки нікуди не поділись',
  ['CPC', 'CPI', 'CPR', 'CPD'].every(k => r.cards.some(c => c.short === k)),
  r.cards.map(c => c.short));

const spend = r.ch[0], profit = r.ch[1];
ok('спенд — стовпчики по днях місяця', spend.type === 'bar'
  && JSON.stringify(spend.data) === JSON.stringify([100, 250, 0]), spend);
ok('профіт — виручка мінус спенд, тією ж формулою, що й KPI',
  JSON.stringify(profit.data) === JSON.stringify([100, -150, 0]), profit);
ok('мінусовий день іншим кольором',
  profit.colors[0] !== profit.colors[1] && /244,63,94/.test(profit.colors[1]), profit.colors);
ok('дні беруться лише з цього гео і цього місяця',
  spend.labels.length === 3 && !spend.data.includes(999) && !spend.data.includes(777), spend);

const notes = r.cards.map(c => c.note);
ok('підпис спенду називає тотал', /\$350/.test(notes[0]), notes[0]);
ok('і скільком дням із 3 він дістався', /2 of 3 days with spend/.test(notes[0]), notes[0]);
ok('підпис профіту каже, з чого він склався',
  /−\$50 total/.test(notes[1]) && /revenue \$300/.test(notes[1]) && /spend \$350/.test(notes[1]),
  notes[1]);

/* ─────────── виплат немає ───────────
   Виручка в нулі при живому спенді — це мінус на весь спенд. Графік
   не бреше, але сам по собі виглядає як катастрофа, хоча насправді
   бракує одного числа в налаштуваннях. Тому причину проговорюємо. */
const zero = await draw(DAILY, { v: {}, m: {} });
const pz = zero.cards.find(c => /Profit/i.test(c.short));
ok('без виплат профіт — мінус на весь спенд, а не нуль',
  JSON.stringify(zero.ch[1].data) === JSON.stringify([-100, -250, 0]), zero.ch[1]);
ok('і підпис каже, що виручка в нулі через незаведену виплату',
  /revenue is zero: set the payout for KG/.test(pz.note), pz.note);
ok('а при заведеній виплаті цього рядка немає',
  !/revenue is zero/.test(r.cards.find(c => /Profit/i.test(c.short)).note),
  r.cards.find(c => /Profit/i.test(c.short)).note);
ok('спенд при цьому малюється як є',
  zero.ch.length && JSON.stringify(zero.ch[0].data) === JSON.stringify([100, 250, 0]), zero.ch[0]);

/* ─────────── профіт справді рівний нулю ─────────── */
const flat = await draw([
  { date: D(1), geo: 'KG', offer: 'X', spend: 100, deposits: 1 },
  { date: D(2), geo: 'KG', offer: 'X', spend: 200, deposits: 2 }
], CPA);
const pf = flat.cards.find(c => /Profit/i.test(c.short));
ok('нуль щодня — не порожня вісь, а сказана причина',
  /Zero every day: revenue equals spend/.test(pf.empty), pf);

/* ─────────── гео без жодного рядка ─────────── */
const none = await page.evaluate(() => {
  renderGeoCostTab('ZZ');
  return document.getElementById('geo-cost-list').textContent.trim();
});
ok('гео без даних — одне повідомлення, а не шість порожніх карток',
  /No data for ZZ this month/.test(none), none.slice(0, 120));

/* ─────────── блока Geo Breakdown більше немає ───────────
   «взагалі таке як гео брейкдаун видали типу з меню». Прибрано разом
   із пунктом меню, перемикачами показу й доступами тімліда — інакше
   лишився б перемикач, який нічого не вмикає. */
const gone = await page.evaluate(() => ({
  section: !!document.getElementById('device-geo-section'),
  content: !!document.getElementById('device-geo-content'),
  nav: !!document.querySelector('[data-nav="geo"]'),
  toggle: !!document.getElementById('toggle-device-geo'),
  tl: !!document.getElementById('tl-show-device-geo'),
  fn: typeof window.renderDeviceGeoWidget,
  // Модалка — те, чим користуються, і вона на місці.
  modal: !!document.getElementById('geo-details-modal'),
  tab: (document.getElementById('geo-tab-costs') || {}).textContent,
  devices: !!document.getElementById('geo-panel-devices'),
  places: !!document.getElementById('geo-panel-placements')
}));
ok('блока на дашборді немає', !gone.section && !gone.content, gone);
ok('пункт меню прибраний разом із ним', !gone.nav, gone);
ok('і перемикач показу — інакше він нічого не вмикав би', !gone.toggle, gone);
ok('і доступ тімліда до нього', !gone.tl, gone);
ok('код віджета теж пішов, а не лишився мертвим', gone.fn === 'undefined', gone);
ok('а модалка гео — на місці', gone.modal, gone);
ok('перша вкладка тепер Money, бо в ній і профіт', /Money/.test(gone.tab || ''), gone);
ok('розрізи по одному гео лишились у модалці',
  gone.devices && gone.places, gone);

await done(browser, srv, errs);
