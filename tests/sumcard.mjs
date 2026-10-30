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
    geos: card.querySelectorAll('.ss-row').length,
    profitCls: profit.className,
    profitColor: getComputedStyle(profit).color,
    flags: card.querySelectorAll('img').length,
    gradient: card.innerHTML.includes('bg-gradient-to-r'),
    hardBg: /#0f172a|bg-\[#0f172a\]/.test(card.outerHTML),
    foot: card.querySelector('.ss-foot') ? 1 : 0,
    order: [...card.querySelectorAll('.ss-row-key')].map(e => e.textContent)
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

/* ─────────── 6. GROSS PROFIT і ROI ───────────

   «Net Profit» тут ніколи не було чистим прибутком: у коді прямо
   написано, що з нього не віднімаються ні комісії, ні витрати
   (кабінети, платіжки, команда, інструменти). Підпис наздогнав
   формулу, а не навпаки. */
const roi = await page.evaluate(() => {
  // KG: спенд 100, 20 деп × $50 = 1000 → профіт 900, roi 900%
  // TJ: спенд 300, 40 деп × $10 = 400  → профіт 100, roi 33%
  // разом: спенд 400, виручка 1400 → профіт 1000, roi 250%
  filteredDataCache = [
    { geo: 'KG', offer: 'DEFAULT', spend: 100, regs: 10, deposits: 20 },
    { geo: 'TJ', offer: 'DEFAULT', spend: 300, regs: 20, deposits: 40 }
  ];
  globalPayouts = { KG_DEFAULT: 50, TJ_DEFAULT: 10 };
  openScreenshotModal();
  const card = document.getElementById('capture-card');
  const caps = [...card.querySelectorAll('.ss-tile .ss-cap')].map(e => e.textContent.trim());
  const rEl = document.getElementById('ss-total-roi');
  return { caps,
    total: rEl.innerText, totalCls: rEl.className,
    totalColor: getComputedStyle(rEl).color,
    profit: document.getElementById('ss-total-profit').innerText,
    geos: [...card.querySelectorAll('.ss-row')].map(g => ({
      code: g.querySelector('.ss-row-key').textContent,
      kv: g.querySelector('.ss-row-kv').textContent.replace(/\s+/g, ' ').trim() }))
  };
});
ok('плитка називається Gross Profit', roi.caps.includes('Gross Profit'), roi.caps);
ok('назви Net Profit більше немає', !roi.caps.includes('Net Profit'), roi.caps);
ok('загальний ROI стоїть біля профіта', /ROI\s*250%/.test(roi.total), roi.total);
ok('профіт порахований тією ж арифметикою', roi.profit.includes('1,000'), roi.profit);
ok('позитивний ROI зелений', /is-ok/.test(roi.totalCls) && /34, 197, 94/.test(roi.totalColor), roi);
ok('ROI є в кожному гео', roi.geos.every(g => /roi/i.test(g.kv)), roi.geos);
ok('ROI гео порахований правильно',
  /roi 900%/i.test(roi.geos.find(g => g.code === 'KG')?.kv || '')
  && /roi 33%/i.test(roi.geos.find(g => g.code === 'TJ')?.kv || ''), roi.geos);

const roiNeg = await page.evaluate(() => {
  filteredDataCache = [{ geo: 'KG', offer: 'DEFAULT', spend: 900, regs: 1, deposits: 1 }];
  globalPayouts = { KG_DEFAULT: 1 };
  openScreenshotModal();
  const r = document.getElementById('ss-total-roi');
  return { t: r.innerText, cls: r.className, color: getComputedStyle(r).color };
});
ok('збитковий ROI відʼємний і червоний',
  /-100%/.test(roiNeg.t) && /is-bad/.test(roiNeg.cls) && /239, 68, 68/.test(roiNeg.color), roiNeg);

/* Нуль спенду — не «ROI 0%». Нуль читався б як «відпрацювали в нуль»,
   хоч насправді не крутили зовсім. */
const roiZero = await page.evaluate(() => {
  filteredDataCache = [{ geo: 'KG', offer: 'DEFAULT', spend: 0, regs: 0, deposits: 0 }];
  globalPayouts = { KG_DEFAULT: 1 };
  openScreenshotModal();
  const card = document.getElementById('capture-card');
  return { t: document.getElementById('ss-total-roi').innerText,
    geo: card.querySelector('.ss-row .ss-row-kv')?.textContent.replace(/\s+/g, ' ').trim() || '' };
});
ok('без спенду загальний ROI — прочерк, а не нуль', /ROI\s*—/.test(roiZero.t), roiZero.t);
ok('без спенду ROI гео — теж прочерк', /roi —/i.test(roiZero.geo), roiZero.geo);

/* ─────────── 7. ДРУГА КАРТКА: ЗА ВЕСЬ ЧАС ───────────

   «Тотал команди» це збірка по місяцях: скільки зібралось за весь час
   роботи. Рахується з rawData, бо filteredDataCache — це вже один
   відфільтрований місяць, і історії з нього не зібрати. */
const all = await page.evaluate(() => {
  currentTeam = 'Makeberry';
  rawData = [
    // 2026-08: спенд 100, 10 деп × $50 = 500 → профіт 400, roi 400%
    { date: '2026-08-04', geo: 'KG', offer: 'DEFAULT', spend: 60, regs: 6, deposits: 6 },
    { date: '2026-08-19', geo: 'KG', offer: 'DEFAULT', spend: 40, regs: 4, deposits: 4 },
    // 2026-09: спенд 200, 2 деп × $50 = 100 → профіт −100, roi −50%
    { date: '2026-09-11', geo: 'KG', offer: 'DEFAULT', spend: 200, regs: 8, deposits: 2 },
    // 2026-10: спенд 100, 20 деп × $50 = 1000 → профіт 900
    { date: '2026-10-02', geo: 'KG', offer: 'DEFAULT', spend: 100, regs: 10, deposits: 20 },
    { date: 'сміття',     geo: 'KG', offer: 'DEFAULT', spend: 999, regs: 0, deposits: 0 }
  ];
  globalPayouts = { KG_DEFAULT: 50 };
  filteredDataCache = rawData.slice(3, 4);
  let err = '';
  try { openScreenshotModal(); } catch (e) { err = String(e); }
  const c = document.getElementById('capture-card-all');
  return { err,
    pair: document.querySelectorAll('.ss-pair > .ss-card').length,
    cls: c.className,
    sub: document.getElementById('ss2-sub').innerText,
    spend: document.getElementById('ss2-total-spend').innerText,
    profit: document.getElementById('ss2-total-profit').innerText,
    profitCls: document.getElementById('ss2-total-profit').className,
    roi: document.getElementById('ss2-total-roi').innerText,
    foot: document.getElementById('ss2-footer-date').innerText,
    rows: [...c.querySelectorAll('.ss-row')].map(r => ({
      key: r.querySelector('.ss-row-key').textContent,
      kv: r.querySelector('.ss-row-kv').textContent.replace(/\s+/g, ' ').trim(),
      pf: r.querySelector('.ss-row-pf').textContent }))
  };
});
ok('друга картка будується без помилки', all.err === '', all.err);
ok('обидві картки стоять поруч', all.pair === 2, all.pair);
ok('друга картка того самого вигляду', all.cls.trim() === 'ss-card', all.cls);
ok('у підписі команда і скільки місяців',
  /makeberry/i.test(all.sub) && /3 months/i.test(all.sub), all.sub);
ok('рядок на кожен місяць', all.rows.length === 3, all.rows);
ok('свіжий місяць зверху',
  JSON.stringify(all.rows.map(r => r.key)) === JSON.stringify(['2026-10', '2026-09', '2026-08']), all.rows);
ok('дні одного місяця складаються в один рядок',
  /10 reg · 10 dep/.test(all.rows.find(r => r.key === '2026-08')?.kv || ''), all.rows);
ok('ROI рахується в кожному місяці',
  /roi 400%/.test(all.rows.find(r => r.key === '2026-08')?.kv || '')
  && /roi -50%/.test(all.rows.find(r => r.key === '2026-09')?.kv || ''), all.rows);
ok('збитковий місяць показує мінус',
  (all.rows.find(r => r.key === '2026-09')?.pf || '').includes('-'), all.rows);
/* Підсумок мусить дорівнювати сумі рядків. Це головна перевірка тут:
   дві картки поруч із числами, які не сходяться, гірші за одну. */
ok('спенд за весь час = сума місяців', all.spend.includes('1,399'), all.spend);
ok('профіт за весь час = сума місяців', all.profit.includes('201'), all.profit);
ok('ROI за весь час рахується з тих самих чисел', /ROI 14%/.test(all.roi), all.roi);
ok('профіт додатний — отже зелений', /is-ok/.test(all.profitCls), all.profitCls);
ok('у підвалі період від першого місяця до останнього',
  all.foot === '2026-08 — 2026-10', all.foot);
ok('рядок зі сміттям замість дати в місяці не потрапив',
  all.rows.every(r => /^\d{4}-\d{2}$/.test(r.key)), all.rows);

const empty = await page.evaluate(() => {
  rawData = [];
  filteredDataCache = [{ geo: 'KG', offer: 'DEFAULT', spend: 1, regs: 0, deposits: 0 }];
  openScreenshotModal();
  return { list: document.getElementById('ss2-month-list').textContent.trim(),
           foot: document.getElementById('ss2-footer-date').innerText,
           rows: document.querySelectorAll('#ss2-month-list .ss-row').length };
});
ok('порожня історія каже про себе, а не лишає пустоту',
  empty.rows === 0 && /жоден місяць/.test(empty.list), empty);
ok('і період у підвалі — прочерк, а не вигадана дата', empty.foot === '—', empty.foot);

await done(browser, srv, errs);
