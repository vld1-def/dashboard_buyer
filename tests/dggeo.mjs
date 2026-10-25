/* ═══════════ ГРОШІ В КАРТЦІ ГЕО: СПЕНД І ПРОФІТ ═══════════

   У картці гео була лише таблиця з девайсами й конверсіями. На питання
   «як воно йшло по днях» вона не відповідала, і за ним ішли в Report
   Builder — тобто на інший екран, щоб подивитись на те саме гео.

   Стенд тримає те, на чому такі графіки брешуть найчастіше.

   ДЕНЬ, ЯКОГО НЕМАЄ В ІМПОРТІ, — НЕ НУЛЬ. Малювати по ньому падіння в
   нуль означало б показати провал, якого не було. А день, який в
   імпорті Є, але в цього гео по ньому рядка немає, — справді нуль:
   інші гео того дня крутились, а це ні.

   ПРОФІТ БУВАЄ ВІДʼЄМНИМ, і лінія без осі нуля однаково «гарно» йде і
   в плюсі, і в мінусі. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8150;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const M = '2026-10';
/* UA: два дні, у плюс. PL: один день із тих самих двох — другий день у
   нього має стати нулем, бо день в імпорті є. KZ: сам у збитку. */
const DAILY = [
  { date: M + '-01', geo: 'UA', offer: 'Pinco', spend: 100, deposits: 4, regs: 10 },
  { date: M + '-02', geo: 'UA', offer: 'Pinco', spend: 200, deposits: 10, regs: 20 },
  { date: M + '-01', geo: 'PL', offer: 'Pinco', spend: 50,  deposits: 1,  regs: 3 },
  { date: M + '-02', geo: 'KZ', offer: 'Pinco', spend: 300, deposits: 1,  regs: 2 }
];
/* Таблиця картки росте з creatives_stats — це інше джерело, і воно
   мусить лишитись як було. */
const CREA = [
  { date: M + '-01', geo: 'UA', device: 'android_phone', clicks: 100, installs: 20, regs: 10, deps: 4, spend: 100 },
  { date: M + '-02', geo: 'PL', device: 'ios_phone',     clicks: 50,  installs: 10, regs: 3,  deps: 1, spend: 50 },
  { date: M + '-02', geo: 'KZ', device: 'android_phone', clicks: 80,  installs: 5,  regs: 2,  deps: 1, spend: 300 }
];

const draw = () => page.evaluate(([daily, crea, m]) => {
  rawData = daily;
  /* Картка читає creatives саме з window: лексична змінна з іншого
     скрипта тут не та сама. */
  window.creativesRawData = crea;
  currentMonthFilter = m;
  // виплата 50$ за депозит на всі гео
  globalPayouts = { 'UA_DEFAULT': 50, 'PL_DEFAULT': 50, 'KZ_DEFAULT': 50 };
  payoutModels = {};
  dgMode = 'device';
  renderDeviceGeoWidget();
}, [DAILY, CREA, M]);

await draw();
await page.waitForTimeout(200);

const cards = () => page.evaluate(() =>
  [...document.querySelectorAll('#device-geo-content > div')].map(c => {
    const geo = (c.querySelector('.text-sm') || {}).textContent || '';
    const h = [...c.querySelectorAll('.dg-money-h')].map(x => ({
      label: x.querySelector('span').textContent.trim(),
      val: x.querySelector('b').textContent.trim(),
      cls: x.querySelector('b').className
    }));
    return { geo: geo.trim(), money: h,
             sparks: c.querySelectorAll('.dg-spark').length,
             none: c.querySelectorAll('.dg-spark-none').length,
             zeroLine: c.querySelectorAll('.dg-spark line').length,
             table: !!c.querySelector('.grid-cols-5') };
  }));

const c = await cards();
const by = Object.fromEntries(c.map(x => [x.geo, x]));

/* ─────────── 1. ДВА ГРАФІКИ, І САМЕ ТІ ─────────── */
ok('у картці гео зʼявились два міні-графіки',
  by['UA'] && by['UA'].sparks === 2, by['UA']);
ok('і підписані вони спендом і профітом',
  by['UA'] && by['UA'].money.map(x => x.label).join() === 'Spend,Profit', by['UA'] && by['UA'].money);
ok('таблиця під ними лишилась на місці', by['UA'] && by['UA'].table === true, by['UA']);

/* ─────────── 2. ЧИСЛА ─────────── */
// UA: спенд 300, виручка 14 деп × 50 = 700, профіт +400
ok('спенд за місяць порахований', by['UA'].money[0].val === '$300', by['UA'].money);
ok('профіт = виручка − спенд', by['UA'].money[1].val === '$400', by['UA'].money);
ok('плюс підсвічений як плюс', /is-up/.test(by['UA'].money[1].cls), by['UA'].money[1]);

// KZ: спенд 300, виручка 1 × 50 = 50, профіт −250
ok('збиток показаний зі знаком мінус', by['KZ'].money[1].val === '-$250', by['KZ'].money);
ok('і підсвічений як мінус', /is-down/.test(by['KZ'].money[1].cls), by['KZ'].money[1]);

/* ─────────── 3. ДЕНЬ, ЯКОГО В ГЕО НЕМАЄ, — НУЛЬ ─────────── */
/* PL крутився лише 01-го, але 02-ге в імпорті Є — отже для PL це
   справжній нуль, і графік мусить його намалювати, а не пропустити. */
ok('у гео, що крутилось один день із двох, графік із двох точок',
  await page.evaluate(() => {
    const m = dgMoneyByGeo();
    const o = m.byGeo['PL'];
    return m.days.length === 2 && (o.s[m.days[0]] || 0) === 50 && (o.s[m.days[1]] || 0) === 0;
  }));

/* ─────────── 4. ДНІВ БЕРЕМО ЛИШЕ ТІ, ЩО В ІМПОРТІ ─────────── */
/* Жовтень має 31 день, а в базі їх два. Домальовувати решту нулями
   означало б показати провал, якого не було. */
ok('дні беремо з імпорту, а не всі дні місяця',
  await page.evaluate(() => dgMoneyByGeo().days.length === 2),
  await page.evaluate(() => dgMoneyByGeo().days));

/* ─────────── 5. ВІСЬ НУЛЯ ТАМ, ДЕ РЯД ПЕРЕТИНАЄ НУЛЬ ─────────── */
ok('ряд із плюсом і мінусом отримує вісь нуля', await page.evaluate(() =>
  /<line/.test(dgSpark([-10, 10], 'profit'))));
ok('ряд, що весь у плюсі, осі не отримує', await page.evaluate(() =>
  !/<line/.test(dgSpark([10, 20], 'profit'))));
ok('колір лінії профіту залежить від підсумку', await page.evaluate(() =>
  /#22C55E/.test(dgSpark([10, 20], 'profit')) && /#EF4444/.test(dgSpark([-10, -20], 'profit'))));

/* ─────────── 6. МАЛЮВАТИ НЕМАЄ ЧОГО — ПРОЧЕРК, А НЕ ПРЯМА ─────────── */
/* Пряма лінія читається як «рівно йшло», а насправді даних немає. */
ok('одна точка — прочерк, а не лінія', await page.evaluate(() =>
  /dg-spark-none/.test(dgSpark([5], 'spend'))));
ok('суцільні нулі — теж прочерк', await page.evaluate(() =>
  /dg-spark-none/.test(dgSpark([0, 0, 0], 'spend'))));

/* ─────────── 7. ДРУГА ВКЛАДКА ТЕЖ ─────────── */
ok('у вкладці Placements графіки теж є', await page.evaluate(() => {
  window.creativesRawData = window.creativesRawData.map(c => ({ ...c, platform: 'instagram', placement: 'feed' }));
  dgMode = 'placement';
  renderDeviceGeoWidget();
  return document.querySelectorAll('#device-geo-content .dg-spark').length >= 2;
}), await page.evaluate(() => document.querySelectorAll('#device-geo-content .dg-spark').length));

/* ─────────── 8. БЕЗ ГРОШЕЙ ВЗАГАЛІ ─────────── */
/* daily_stats порожня, creatives_stats ні: таблиця мусить лишитись, а
   блоку з грошима просто не буде — вигадувати нулі нема з чого. */
/* Доти блок просто зникав, і це читалось як «не зробили». Тепер він
   лишається і каже, чого бракує: таблицю й гроші заливають окремо, і
   без цього речення питання «а де графіки» неминуче. */
const empty = await page.evaluate(() => {
  rawData = [];
  dgMode = 'device';
  renderDeviceGeoWidget();
  const el = document.getElementById('device-geo-content');
  return { none: el.querySelectorAll('.dg-money.is-none').length,
           sparks: el.querySelectorAll('.dg-spark').length,
           table: el.querySelectorAll('.grid-cols-5').length,
           txt: (el.querySelector('.dg-money.is-none p') || {}).textContent || '' };
});
ok('немає daily_stats — блок лишається і називає причину',
  empty.none > 0 && empty.sparks === 0, empty);
ok('і каже саме про daily_stats, а не «немає даних»',
  /daily_stats/.test(empty.txt), empty.txt);
ok('таблиця з creatives_stats при цьому на місці', empty.table > 0, empty);

/* Гео, по якому в daily_stats рядків немає, теж мусить це сказати —
   а не зникнути поруч із сусідами, у яких графіки є. */
ok('гео без грошей каже про себе окремо', await page.evaluate(([daily, m]) => {
  // UA у daily є, KZ немає зовсім
  rawData = daily.filter(r => r.geo === 'UA');
  currentMonthFilter = m;
  dgMode = 'device';
  renderDeviceGeoWidget();
  const cards = [...document.querySelectorAll('#device-geo-content > div')];
  const kz = cards.find(c => /KZ/.test(c.textContent));
  const ua = cards.find(c => /UA/.test(c.textContent));
  return !!kz && !!ua
    && kz.querySelectorAll('.dg-money.is-none').length === 1
    && ua.querySelectorAll('.dg-spark').length === 2
    && /KZ/.test(kz.querySelector('.dg-money.is-none p').textContent);
}, [DAILY, M]));

await done(browser, srv, errs);
