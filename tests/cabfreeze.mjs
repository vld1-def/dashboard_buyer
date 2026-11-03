/* ═══════════ КАБІНЕТ І СТАТУС НЕ ЇДУТЬ УБІК ═══════════

   «коли розгортаємо компанії появляється горизонтальний скрол, і вот я
   хочу щоб CABINET, STATUS були фіксовані на першому плані, а дані
   можна було скролити».

   Розгорнуте дерево ширше за екран. Разом із числами їхала й назва
   кабінета — тобто саме те, до чого ці числа належать: цифри є, а чиї
   вони, уже за краєм.

   Плюс дві менші речі з того ж погляду:
     • ледь помітні вертикалі між стовпцями, щоб вісім колонок чисел не
       читались як одна смуга;
     • «1 campaign off» на кожному рядку під вимкненою кампанією. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8197;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, { viewport: { width: 900, height: 700 } });
const { ok, done } = checks();

const FB = [], ROWS = [];
for (let i = 0; i < 4; i++) {
  FB.push({ account_id: '20' + i, name: 'Cab ' + i, status: 'active', currency: 'USD',
    spend_today: 10 * (i + 1), campaigns: 2, adsets: 3, ads: 5, token_id: 't1' });
  ROWS.push({ account_id: '20' + i, provider_name: 'AgentX', profile: 'p' + i });
}

await page.evaluate(([fb, rows]) => {
  const b = document.getElementById('boot'); if (b) b.remove();
  let n = document.getElementById('cabinets-section');
  while (n && n !== document.body) { n.style.setProperty('display', 'block', 'important'); n = n.parentElement; }
  cabFbLoad = async () => {}; cabDaysLoad = async () => {}; cabSnapLoad = async () => {};
  rawData = []; cabSnap = {};
  cabFb = fb; cabRows = rows; cabLoaded = true; cabTokens = { t1: 'AgentX_p0_BM' };
  cabRange = { key: 'today', since: '', until: '' };
  cabFilter = 'all'; cabGroup = 'agent';
  /* Вмикаємо багато колонок — саме через них і зʼявляється прокрутка,
     заради якої все це й робиться. */
  cabView = { pins: [], cols: { camp: 1, sets: 1, ads: 1, ctr: 1, cpc: 1, clicks: 1,
    impr: 1, budget: 1, balance: 1, spend: 1, deps: 1, cpa: 1, age: 1 }, order: [] };
  cabRender();
}, [FB, ROWS]);
await page.waitForTimeout(300);

/* ── 1. ЧИ Є ВЗАГАЛІ ЩО ГОРТАТИ ──
   Без прокрутки перевірка заморозки нічого не доводить. */
const scroll = await page.evaluate(() => {
  const s = document.querySelector('#cab-list .cab-scroll');
  return s ? { w: s.clientWidth, sw: s.scrollWidth } : null;
});
ok('таблиця ширша за екран', scroll && scroll.sw > scroll.w, scroll);

/* ── 2. ЗАМОРОЖЕНІ КЛІТИНКИ ── */
const fz = await page.evaluate(() => {
  const tr = document.querySelector('#cab-list tbody tr.cab-tr');
  const cells = [...tr.children];
  const froz = cells.filter(c => c.classList.contains('is-fz'));
  return {
    total: cells.length,
    n: froz.length,
    pos: froz.map(c => getComputedStyle(c).position),
    left: froz.map(c => Math.round(parseFloat(c.style.left) || 0)),
    endIsStatus: froz[froz.length - 1].classList.contains('cab-fz-end'),
    bgSet: froz.every(c => getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)'),
    lastShadow: froz[froz.length - 1].classList.contains('is-fz-last')
  };
});
ok('заморожено саме початок рядка, не весь', fz.n > 0 && fz.n < fz.total, fz);
ok('усі вони sticky', fz.pos.every(p => p === 'sticky'), fz.pos);
/* Жорсткі left у стилях розійшлися б із версткою на першому довгому
   імені, і то мовчки — стовпці налізли б один на одний. */
ok('відступи рахуються, а не задані', fz.left[0] === 0 && fz.left.every((v, i, a) => !i || v > a[i - 1]), fz.left);
ok('межа — саме статус', fz.endIsStatus, fz);
/* Без фону прокручувані числа просвічували б крізь заморожені. */
ok('у заморожених є фон', fz.bgSet, fz);
ok('остання відкидає тінь на прокручуване', fz.lastShadow, fz);

/* ── 3. ВОНИ СПРАВДІ СТОЯТЬ ПРИ ПРОКРУТЦІ ──
   Головна перевірка: не класи, а те, що видно на екрані. */
const moved = await page.evaluate(async () => {
  const s = document.querySelector('#cab-list .cab-scroll');
  const tr = document.querySelector('#cab-list tbody tr.cab-tr');
  const name = tr.querySelector('.cab-fz-end').previousElementSibling.previousElementSibling;
  const far = tr.children[tr.children.length - 2];
  const was = { name: name.getBoundingClientRect().x, far: far.getBoundingClientRect().x };
  s.scrollLeft = 300;
  await new Promise(r => requestAnimationFrame(r));
  const now = { name: name.getBoundingClientRect().x, far: far.getBoundingClientRect().x };
  return { was, now, scrolled: s.scrollLeft };
});
ok('гортання справді сталось', moved.scrolled > 0, moved);
ok('кабінет лишився на місці',
  Math.abs(moved.now.name - moved.was.name) < 2, moved);
ok('а дані поїхали', moved.was.far - moved.now.far > 100, moved);

/* ── 4. ВЕРТИКАЛІ МІЖ СТОВПЦЯМИ ── */
const lines = await page.evaluate(() => {
  const tr = document.querySelector('#cab-list tbody tr.cab-tr');
  const cells = [...tr.children];
  const dataCell = cells.find(c => c.classList.contains('cab-today'));
  const xCell = cells.find((c, i) => i > 0 && c.classList.contains('cab-x'));
  const bw = el => getComputedStyle(el).borderLeftWidth;
  return { data: bw(dataCell), serv: bw(xCell),
           col: getComputedStyle(dataCell).borderLeftColor };
});
ok('між стовпцями даних є межа', parseFloat(lines.data) > 0, lines);
/* Ліворуч і так тісно від значків — розділяти галочку й стрілку нема чого. */
ok('а між службовими клітинками немає', parseFloat(lines.serv) === 0, lines);

/* ── 5. «1 CAMPAIGN OFF» НА КОЖНОМУ РЯДКУ ── */
const chip = (own, state, depth, kind) => page.evaluate(([o, st, d, k]) => {
  const html = cdChips({ kind: k, own: o, state: new Map(st) }, d);
  const el = document.createElement('div'); el.innerHTML = html;
  return [...el.querySelectorAll('.cd-st')].map(x => x.textContent.trim());
}, [own, state, depth, kind]);

/* Верхній рівень: кампанію вимкнули саме тут, і сказати це треба. */
const top = await chip('PAUSED', [['PAUSED', 2]], 0, 'campaign');
ok('вимкнена кампанія каже про себе', top.some(t => /off/i.test(t)), top);

/* Усередині неї: адсети під вимкненою кампанією. Доти кожен ніс
   «1 campaign off» — той самий факт, що й у рядка над ними. */
const nested = await chip('CAMPAIGN_PAUSED', [['CAMPAIGN_PAUSED', 3]], 1, 'adset');
ok('усередині не повторюють, де вимикач',
  !nested.some(t => /campaign off/i.test(t)), nested);
ok('але що рядок не крутиться — лишається',
  nested.some(t => /off/i.test(t)), nested);

/* Оголошення під вимкненим адсетом — те саме на рівень нижче. */
const deep = await chip('', [['ADSET_PAUSED', 1]], 2, 'ad');
ok('на оголошенні теж без «ad set off»',
  !deep.some(t => /ad set off/i.test(t)), deep);

/* А без батька над рядком — режим «тільки оголошення» — пояснення
   лишається: кампанії на екрані немає, і це єдина відповідь, чому
   оголошення стоїть. */
const alone = await chip('', [['CAMPAIGN_PAUSED', 1]], 0, 'ad');
ok('без батька над рядком пояснення лишається',
  alone.some(t => /campaign off/i.test(t)), alone);

/* Вимкнене своїм вимикачем і вимкнене зверху — разом одним числом:
   рахувати їх окремо означає змусити додавати в голові. */
const mixed = await chip('', [['PAUSED', 1], ['CAMPAIGN_PAUSED', 2]], 1, 'adset');
ok('власна пауза й пауза зверху рахуються разом',
  mixed.some(t => /^3 off$/.test(t)), mixed);

await done(browser, srv, errs);
