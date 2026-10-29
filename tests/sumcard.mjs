/* ═══════════ ПОРЯДОК КАБІНЕТІВ · ЧИСТІ ТЛА · КАРТКА ЗНІМКА ═══════════

   П'ять дрібниць одним заходом, бо всі про одне: показувати те, що
   справді питають, і не показувати того, чого не питали.

   1. Active Cabinets стояли за алфавітом — тобто зверху був той, чия
      назва ближча до «A». Тепер за спендом, від найбільшого, і спенд
      виписаний на кнопці: інакше в порядок довелось би вірити на слово.
   2. #creative-stats-card малював ДРУГУ картку поверх материнського
      блока — тло і рамка пішли, як до того в списку креативів.
   3. Підпис у доменах і підпис у Accounts прибрані.
   4. Accounts стало ширше: з'явився внутрішній скрол.
   5. Performance Summary переїхала з зашитого #0f172a і райдужної
      смужки на класи .ss-* з design.css — тобто наступна зміна
      дизайну дійде й до неї. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8163;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* ─────────── 1. порядок кабінетів ─────────── */
const cab = await page.evaluate(async () => {
  creativesRawData = [
    { cid: 'CR1', account: 'alpha',  geo: 'KG', spend: 10, regs: 1, deps: 0, clicks: 5, installs: 2, date: '2026-10-01' },
    { cid: 'CR1', account: 'zulu',   geo: 'KG', spend: 90, regs: 9, deps: 2, clicks: 50, installs: 20, date: '2026-10-01' },
    { cid: 'CR1', account: 'mike',   geo: 'TJ', spend: 40, regs: 4, deps: 1, clicks: 20, installs: 8, date: '2026-10-01' },
    { cid: 'CR1', account: 'zulu',   geo: 'TJ', spend: 5,  regs: 0, deps: 0, clicks: 2, installs: 1, date: '2026-10-01' }
  ];
  currentCreativeID = 'CR1';
  activeCrAcc = null; activeCrGeo = null;
  let err = '';
  try { await showCreativeStats(null, null); } catch (e) { err = String(e); }
  const el = document.getElementById('cr-account-list');
  return { err,
    names: [...el.querySelectorAll('button')].map(b => b.querySelector('span')?.textContent || ''),
    texts: [...el.querySelectorAll('button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()) };
});
ok('кабінети рахуються без помилки', cab.err === '', cab.err);
ok('порядок — від найбільшого спенда до найменшого',
  JSON.stringify(cab.names) === JSON.stringify(['zulu', 'mike', 'alpha']), cab);
ok('спенд кабінету складається з усіх його рядків',
  /zulu\s*\$95\.00/.test(cab.texts[0] || ''), cab.texts);
ok('на кнопці видно спенд, а не лише назву',
  cab.texts.every(t => /\$\d/.test(t)), cab.texts);

/* ─────────── 2. картка статистики без власного тла ─────────── */
const card = await page.evaluate(() => {
  const el = document.getElementById('creative-stats-card');
  const cs = getComputedStyle(el);
  return { cls: el.className, bg: cs.backgroundColor, bw: cs.borderTopWidth };
});
ok('у картки крео більше немає класу тла', !/bg-blue-600/.test(card.cls), card.cls);
ok('і рамки теж', !/border-blue-500/.test(card.cls), card.cls);
ok('тло прозоре по факту, а не лише в класах',
  /rgba\(0, 0, 0, 0\)|transparent/.test(card.bg), card);

/* ─────────── 3-4. прибрані підписи й ширина Accounts ─────────── */
const txt = await page.evaluate(() => ({
  dom: document.body.innerHTML.includes('Which domain serves which PWA'),
  acc: document.body.innerHTML.includes('saved instantly'),
  wide: document.querySelector('#accounts-modal > div')?.className || '',
  subs: document.querySelectorAll('#accounts-modal .mw-sub').length
}));
ok('підпису в доменах більше немає', txt.dom === false);
ok('підпису в Accounts більше немає', txt.acc === false);
ok('в Accounts не лишилось порожнього підпису', txt.subs === 0, txt.subs);
ok('вікно Accounts стало ширше', /max-w-5xl/.test(txt.wide) && !/max-w-4xl/.test(txt.wide), txt.wide);

/* ─────────── 5. Performance Summary ─────────── */
const ss = await page.evaluate(() => {
  filteredDataCache = [
    { geo: 'KG', offer: 'DEFAULT', spend: 100, regs: 10, deposits: 20 },
    { geo: 'TJ', offer: 'DEFAULT', spend: 300, regs: 20, deposits: 40 }
  ];
  globalPayouts = { KG_DEFAULT: 50, TJ_DEFAULT: 10 };
  let err = '';
  try { openScreenshotModal(); } catch (e) { err = String(e); }
  const card = document.getElementById('capture-card');
  const cs = getComputedStyle(card);
  const profit = document.getElementById('ss-total-profit');
  return { err, cls: card.className,
    w: cs.width, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius,
    tiles: card.querySelectorAll('.ss-tile').length,
    geos: card.querySelectorAll('.ss-geo').length,
    profitCls: profit.className,
    profitColor: getComputedStyle(profit).color,
    flags: card.querySelectorAll('img').length,
    gradient: card.innerHTML.includes('bg-gradient-to-r'),
    hardBg: /#0f172a|bg-\[#0f172a\]/.test(card.outerHTML),
    foot: card.querySelector('.ss-foot') ? 1 : 0,
    order: [...card.querySelectorAll('.ss-geo-code')].map(e => e.textContent)
  };
});
ok('знімок будується без помилки', ss.err === '', ss.err);
ok('картка на класі .ss-card', ss.cls.trim() === 'ss-card', ss.cls);
ok('ширина лишилась фіксованою — знімки мають бути однакові',
  Math.round(parseFloat(ss.w)) === 414, ss.w);
ok('тло з токенів, а не зашите', ss.bg !== 'rgba(0, 0, 0, 0)' && !ss.hardBg, ss);
ok('радіус із дизайну, а не 2.5rem', parseFloat(ss.radius) <= 20, ss.radius);
ok('райдужної смужки більше немає', ss.gradient === false);
ok('чотири плитки метрик на місці', ss.tiles === 4, ss.tiles);
ok('підвал на місці', ss.foot === 1);
ok('рядок на кожне гео', ss.geos === 2, ss.geos);
ok('гео в порядку спенда', JSON.stringify(ss.order) === JSON.stringify(['TJ', 'KG']), ss.order);
ok('прапорці в рядках гео лишились', ss.flags === 2, ss.flags);

// revenueOf = депозити × виплата (не реги!): KG 20×$50 = 1000 при спенді 100,
// TJ 40×$10 = 400 при 300. Разом +1000 — профіт додатний.
ok('профіт пофарбований класом, а не утилітою',
  /ss-num/.test(ss.profitCls) && !/text-green-400|text-red-400/.test(ss.profitCls), ss.profitCls);
ok('позитивний профіт зелений', /34, 197, 94/.test(ss.profitColor), ss.profitColor);

const neg = await page.evaluate(() => {
  filteredDataCache = [{ geo: 'KG', offer: 'DEFAULT', spend: 900, regs: 1, deposits: 0 }];
  globalPayouts = { KG_DEFAULT: 1 };
  openScreenshotModal();
  const p = document.getElementById('ss-total-profit');
  return { cls: p.className, color: getComputedStyle(p).color, text: p.innerText };
});
ok('збитковий профіт червоний', /239, 68, 68/.test(neg.color), neg);
ok('і він справді відʼємний', neg.text.includes('-'), neg.text);

await done(browser, srv, errs);
