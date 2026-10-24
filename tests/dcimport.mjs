/* ═══════════ ІМПОРТ CSV У DATA CHECK ═══════════

   «не сплітує дані нормально, в мене багато інсталів та іншого а воно не
   підтягує» — фейсбучний звіт давав рівно нуль рядків, і екран показував
   той нуль так само впевнено, як показав би правду.

   Причин було чотири, і стенд тримає кожну окремо:
   • рядок різався наївним split, тож кома в лапках ламала всі стовпці
     після себе;
   • стовпець дня шукався як day/date, а фейсбук зве його Reporting starts
     — без дня кожен рядок відпадав;
   • інстали чіплялись на перший збіг, тобто на порожній Leads, замість
     App installs;
   • депозити (Purchases) не шукались узагалі.

   Плюс те, чого бракувало: інстали у фейсбука живуть у ДВОХ стовпцях,
   кейтаровському UC їх підмішувати не можна; файл без годин не можна
   зсувати по таймзонах; і догадка про стовпці мусить бути на екрані та
   перемикатись руками.

   Дані тут вигадані, але форма — рівно з тих файлів, на яких ламалось:
   BOM, лапки, кома всередині лапок, порожній Leads, підсумковий рядок
   без акаунта. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8144;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* Фейсбучний звіт: коми як роздільник, BOM, «Native, banner & interstitial»
   з комою в лапках, Leads порожній там, де є App installs — і заповнений
   там, де App installs порожній (кампанія на ліди). */
const FB = '﻿' + [
  '"Account ID","Campaign name","Ad name",Platform,Placement,Currency,"Amount spent (USD)","Link clicks",Leads,"Registrations completed","App installs",Purchases,"Reporting starts","Reporting ends"',
  '1001,camp_a_TJ,AD_1,instagram,"Instagram Reels",USD,10.50,44,,8,18,3,2026-10-23,2026-10-23',
  '1001,camp_a_TJ,AD_2,audience_network,"Native, banner & interstitial",USD,2.25,15,,4,7,1,2026-10-23,2026-10-23',
  '2002,camp_b_TJ,AD_3,instagram,Feed,USD,5.00,19,6,2,,,2026-10-23,2026-10-23',
  '2002,camp_b_TJ,AD_4,instagram,Feed,USD,1.25,3,,,,,2026-10-23,2026-10-23'
].join('\r\n');

/* Кейтаровський звіт: ; як роздільник, години, підсумковий рядок без
   акаунта в кінці — рівно як віддає сам кейтаро. */
const KT = [
  'Country;Source;Referrer;Offer;"Sub ID 5";"Sub ID 1";"Sub ID 2";"Sub ID 4";"Sub ID 20";"Sub ID 3";Day;Hour;"UC (campaign)";Conv.;Sales',
  'Kyrgyzstan;"PWA Partners";https://ex.test/;"Offer A | one | two";1001;MPlay_KG_001;Third;Instagram_Reels;;KG_1;2026-10-23;20;4;2;1',
  'Kyrgyzstan;"PWA Partners";;"Offer A | one | two";1001;MPlay_KG_001;Third;Instagram_Reels;;KG_1;2026-10-23;02;3;1;0',
  'Tajikistan;"Sator Android";;"Offer B | three";2002;cy638t;8wxg;VP11003;TJ_1;bGcT;2026-10-23;15;5;3;2',
  ';;;;;;;;;;;;12;6;3'
].join('\n');

const load = (csv, tz) => page.evaluate(([c, t]) => {
  dcAccountsTz = t;
  document.getElementById('dc-spend').value = '';
  document.getElementById('data-check-modal').classList.remove('hidden');
  dcParse(c);
  const names = {};
  Object.keys(dcMap).forEach(k => names[k] = (dcMap[k] || []).map(i => dcHeaders[i]));
  const sum = dcRows.reduce((a, r) => ({ i: a.i + r.installs, r: a.r + r.regs,
    d: a.d + r.deps, s: a.s + r.spend }), { i: 0, r: 0, d: 0, s: 0 });
  return { rows: dcRows.length, map: names, hasHour: dcHasHour, skips: dcSkips,
           sum: { ...sum, s: Math.round(sum.s * 100) / 100 },
           spendField: document.getElementById('dc-spend').value,
           day: document.getElementById('dc-base-date').value,
           first: dcRows[0] || null };
}, [csv, tz]);

/* ─────────── 1. ФЕЙСБУЧНИЙ ЗВІТ: РАНІШЕ НУЛЬ ─────────── */
const fb = await load(FB, { 1001: 5, 2002: 0 });

ok('фейсбучний звіт більше не дає нуль рядків', fb.rows === 4, fb.rows);
ok('день беремо з Reporting starts', JSON.stringify(fb.map.day) === '["Reporting starts"]', fb.map.day);
ok('жоден рядок не відпав', fb.skips.noDay === 0 && fb.skips.noAcc === 0, fb.skips);
ok('день у файлі впізнано і підставлено', fb.day === '2026-10-23', fb.day);

/* Кома в лапках: на другому рядку після «Native, banner & interstitial»
   усі стовпці раніше з'їжджали праворуч, і витрата читалась як кліки. */
ok('кома в лапках не ламає стовпці', await page.evaluate(() =>
  dcRows[1].spend === 2.25 && dcRows[1].installs === 7 && dcRows[1].deps === 1),
  JSON.stringify(fb.first));
ok('лапки з самого значення зникають', fb.rows === 4
  && await page.evaluate(() => dcRows[1].placementRaw === 'Native, banner & interstitial'),
  await page.evaluate(() => dcRows[1].placementRaw));

/* Інстали у фейсбука — два стовпці, і обидва мусять потрапити. */
ok('інстали збираються і з App installs, і з Leads',
  JSON.stringify(fb.map.ins) === '["Leads","App installs"]', fb.map.ins);
ok('сума інсталів — з обох стовпців разом', fb.sum.i === 31, fb.sum.i);
ok('рядок, де інстали лежать у Leads, їх не втрачає',
  await page.evaluate(() => dcRows[2].installs === 6), await page.evaluate(() => dcRows[2].installs));

ok('депозити беруться з Purchases', JSON.stringify(fb.map.dep) === '["Purchases"]', fb.map.dep);
ok('сума депозитів не нульова', fb.sum.d === 4, fb.sum.d);
ok('реєстрації — з Registrations completed',
  JSON.stringify(fb.map.reg) === '["Registrations completed"]', fb.map.reg);
ok('сума реєстрацій сходиться', fb.sum.r === 14, fb.sum.r);

ok('кампанія — з Campaign name', JSON.stringify(fb.map.camp) === '["Campaign name"]', fb.map.camp);
ok('крео — з Ad name', JSON.stringify(fb.map.cr) === '["Ad name"]', fb.map.cr);
ok('розміщення — з Placement', JSON.stringify(fb.map.plc) === '["Placement"]', fb.map.plc);
ok('стовпця з девайсом у файлі немає — і ми його не вигадуємо',
  fb.map.dev.length === 0 && await page.evaluate(() => dcHasDevice === false), fb.map.dev);

/* Витрата з файлу: підставляємо, але лише в порожнє поле. */
ok('витрата з файлу сумується', fb.sum.s === 19, fb.sum.s);
ok('порожнє поле витрати заповнюється з файлу', fb.spendField === '19', fb.spendField);
ok('своє число у витраті не перетирається', await page.evaluate(c => {
  document.getElementById('dc-spend').value = '777';
  dcParse(c);
  return document.getElementById('dc-spend').value === '777';
}, FB));

/* Годин у фейсбучному звіті немає — зсувати нічим і не треба. */
ok('файл без годин не вважається погодинним', fb.hasHour === false);
ok('без годин день беремо як є, без зсуву TZ', await page.evaluate(() => {
  document.getElementById('dc-base-date').value = '2026-10-23';
  dcCompute();
  const txt = document.getElementById('dc-accounts-table').textContent.replace(/\s+/g, ' ');
  // 2002 має TZ 0: зі зсувом його рядки поїхали б на 22 жовтня
  return /2002/.test(txt) && / 6 /.test(txt);
}, null));
ok('на екрані сказано, що зсуву не було', await page.evaluate(() =>
  /no hours in the file/.test(document.querySelector('.dc-map-h').textContent)),
  await page.evaluate(() => document.querySelector('.dc-map-h')?.textContent));

/* Акаунт без таймзони у денному файлі більше не викидається. */
ok('денний файл не вимагає таймзони', await page.evaluate(c => {
  dcAccountsTz = {};                  // жодної прив'язки
  dcParse(c);
  document.getElementById('dc-base-date').value = '2026-10-23';
  dcCompute();
  const t = document.getElementById('dc-accounts-table').textContent.replace(/\s+/g, ' ');
  return /1001/.test(t) && /2002/.test(t) && /—/.test(t);
}, FB));

/* ─────────── 2. КЕЙТАРОВСЬКИЙ ЗВІТ: ЯК БУЛО ─────────── */
const kt = await load(KT, { 1001: 6, 2002: 3 });

ok('кейтаровський звіт читається як раніше', kt.rows === 3, kt.rows);
ok('підсумковий рядок без акаунта відкидається', kt.skips.noAcc === 1, kt.skips);
ok('інстали — рівно UC (campaign), без підмішування',
  JSON.stringify(kt.map.ins) === '["UC (campaign)"]', kt.map.ins);
ok('сума інсталів дорівнює підсумку самого файлу', kt.sum.i === 12, kt.sum.i);
ok('реєстрації і депозити теж сходяться з підсумком',
  kt.sum.r === 6 && kt.sum.d === 3, kt.sum);
ok('години впізнано', kt.hasHour === true);
ok('на екрані сказано, що день рахуємо в таймзоні кабінету',
  await page.evaluate(() => /account timezone/.test(document.querySelector('.dc-map-h').textContent)));
ok('розміщення і крео лишились на Sub ID 4 / Sub ID 3',
  JSON.stringify(kt.map.plc) === '["Sub ID 4"]' && JSON.stringify(kt.map.cr) === '["Sub ID 3"]',
  [kt.map.plc, kt.map.cr]);
ok('кампанія — Sub ID 1, по ній і ділиться ПВА-трафік',
  JSON.stringify(kt.map.camp) === '["Sub ID 1"]', kt.map.camp);
ok('джерело — Source, ним ПВА відрізняється від прілки',
  JSON.stringify(kt.map.src) === '["Source"]', kt.map.src);
ok('витрати в кейтаровському файлі немає — і нуля ми не вигадуємо',
  kt.map.spend.length === 0 && kt.spendField === '', [kt.map.spend, kt.spendField]);

/* Зсув TZ для погодинного файлу лишився: 02:00 у +3 — це 23:00
   попереднього дня для кабінету з TZ +0. */
ok('погодинний файл досі зсувається по таймзонах', await page.evaluate(c => {
  dcAccountsTz = { 1001: 0, 2002: 3 };
  dcParse(c);
  document.getElementById('dc-base-date').value = '2026-10-22';
  dcCompute();
  const t = document.getElementById('dc-accounts-table').textContent.replace(/\s+/g, ' ');
  return /1001/.test(t) && / 3 /.test(t);   // тільки нічний рядок (3 інстали)
}, KT));

/* Розбивки з того самого файлу. */
const splits = await page.evaluate(c => {
  dcAccountsTz = { 1001: 3, 2002: 3 };
  dcParse(c);
  document.getElementById('dc-base-date').value = '2026-10-23';
  dcCompute();
  const cl = id => (document.getElementById(id).textContent || '').replace(/\s+/g, ' ');
  return { src: cl('dc-source-table'), camp: cl('dc-campaign-table'), plc: cl('dc-placement-table') };
}, KT);
ok('ПВА і прілки видно окремо', /PWA Partners/.test(splits.src) && /Sator Android/.test(splits.src), splits.src);
ok('кампанії видно окремо', /MPlay_KG_001/.test(splits.camp) && /cy638t/.test(splits.camp), splits.camp);
ok('розміщення лишилось на місці', /Instagram · Reels/.test(splits.plc), splits.plc);

/* ─────────── 3. ДОГАДКА ВИДИМА І ВИПРАВНА ─────────── */
ok('кожен показник показує, з якого стовпця взятий', await page.evaluate(() =>
  document.querySelectorAll('#dc-map .dc-map-f').length >= 10));

ok('стовпець можна перемкнути руками', await page.evaluate(c => {
  dcAccountsTz = { 1001: 5, 2002: 0 };
  dcParse(c);
  const i = dcHeaders.indexOf('Link clicks');
  dcSetCol('reg', i);
  return dcRows.reduce((a, r) => a + r.regs, 0) === 81;   // 44+15+19+3
}, FB));

ok('зайвий стовпець можна зняти з показника', await page.evaluate(c => {
  dcParse(c);
  const leads = dcHeaders.indexOf('Leads');
  dcDelCol('ins', leads);
  return JSON.stringify(dcMap.ins) === JSON.stringify([dcHeaders.indexOf('App installs')])
      && dcRows.reduce((a, r) => a + r.installs, 0) === 25;
}, FB));

ok('і додати ще один можна теж', await page.evaluate(c => {
  dcParse(c);
  dcAddCol('dep', dcHeaders.indexOf('Link clicks'));
  return dcRows.reduce((a, r) => a + r.deps, 0) === 85;   // 4 депозити + 81 клік
}, FB));

/* ─────────── 4. КОЛИ НЕ ЗІЙШЛОСЬ — КАЖЕМО ЧОМУ ─────────── */
const none = await page.evaluate(() => {
  dcParse('alpha,beta,gamma\n1,2,3\n4,5,6');
  return { rows: dcRows.length,
           bad: document.querySelector('.dc-map-bad')?.textContent || '',
           empty: !document.getElementById('dc-empty').classList.contains('hidden'),
           mapShown: !document.getElementById('dc-map').classList.contains('hidden') };
});
ok('чужий файл не дає рядків', none.rows === 0, none.rows);
ok('і екран каже, чого саме не знайшов', /no day column found/.test(none.bad), none.bad);
ok('карта стовпців лишається на екрані, щоб було що перемкнути', none.mapShown && none.empty);

ok('порожній файл нічого не ламає', await page.evaluate(() => {
  dcParse('');
  return dcRows.length === 0 && document.getElementById('dc-map').classList.contains('hidden');
}));

await done(browser, srv, errs);
