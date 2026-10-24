/* ═══════════ ЛЕНДІНГ ІДЕ ПІД СВОЄ ГЕО ═══════════

   «підтягує ленд буствін уз якщо це tj» — під APP гео навмисно немає в
   ключі злиття: два боки читали його з різних місць і зійтись воно не
   могло. Ціна вилазила в прев'ю: кабінет, що крутив і UZ, і TJ, мав
   один ключ на день, і до TJ-рядка чіплявся узбецький лендінг.

   Тепер гео лишається поза КЛЮЧЕМ, але працює при РОЗПОДІЛІ. І береться
   воно з правильного місця: стовпець Country — це країна ВІДВІДУВАЧА
   (на TJ-кампанії там China чи France), а гео кампанії лежить першим
   токеном у стовпці крео для APP: «TJ_AB_592», «UZ_ojwq921». Той самий
   код, що й на боці FB.

   Друге з того ж скріна: «ленд є а оффер не підтягується». У списку
   оферів лежить «Pin-Up[25]» — хвіст у дужках наша примітка, і в рядку
   Keitaro її немає. Збіг шукався входженням ПОВНОЇ назви, тож не
   знаходився ніколи. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8148;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, {
  path: 'Form.html',
  init: () => {
    const mk = window.supabase.createClient;
    window.supabase.createClient = (...a) => {
      const c = mk(...a);
      c.auth.getSession = async () => ({ data: { session: { user: { id: 'u1' } } } });
      return c;
    };
    localStorage.setItem('selected_team', 'TEST');
    window.alert = () => {};
  }
});

/* ─────────── 1. ЗБІГ ОФЕРА З ХВОСТОМ У ДУЖКАХ ─────────── */
const off = await page.evaluate(() => {
  const r = {};
  knownOffers = ['Pinco', 'Pin-Up[25]'];
  r.tail = matchOffer('Pin-Up | Wheel Plus Girl TJ | 20$ | tjfb');
  r.other = matchOffer('Pinco TJ | Wheel Girl | 50$');
  r.none = matchOffer('Zazino KG | Form | Anna');
  knownOffers = ['22bet', '22bet[crash]'];
  r.longest = matchOffer('22bet[crash] landing one');   // довший збіг виграє
  r.sameBrand = matchOffer('22bet landing two');        // різні версії одного бренду — не суперники
  /* Однаково довгий збіг двох РІЗНИХ оферів — вибір, і він не наш.
     Різна довжина — не нічия: довший збіг конкретніший, його й беремо. */
  knownOffers = ['Pinco', 'Zazin'];
  r.rivals = matchOffer('Pinco and Zazin together');
  knownOffers = ['Pinco', 'Pin-Up'];
  r.longerWins = matchOffer('Pinco and Pin-Up together');
  return r;
});
ok('офер із хвостом у дужках нарешті знаходиться', off.tail === 'Pin-Up[25]', off.tail);
ok('офер без хвоста працює як раніше', off.other === 'Pinco', off.other);
ok('чужий рядок не чіпляє нічого', off.none === '', off.none);
ok('виграє найдовший збіг, а не перший у списку', off.longest === '22bet[crash]', off.longest);
ok('коротша назва того самого бренду теж знаходиться', off.sameBrand === '22bet', off.sameBrand);
ok('два РІЗНІ офери з однаково довгим збігом — не вибираємо жодного',
  off.rivals === '', off.rivals);
ok('а при різній довжині виграє довший — він конкретніший',
  off.longerWins === 'Pin-Up', off.longerWins);

/* ─────────── 2. ГЕО ЛЕНДІНГА — НЕ З COUNTRY ─────────── */
const H = 'Country;Source;Referrer;Offer;Sub ID 5;Sub ID 1;Sub ID 2;Sub ID 4;Sub ID 20;Sub ID 3;Day;Hour;UC (campaign);Conv.;Sales';
/* Country навмисно чужий: на TJ-кампанії там China і France — саме так
   і приходить у справжній вигрузці. */
const KT = [H,
  'China;Sator Android;https://tj.test/;Pin-Up | Wheel TJ | 20$;111;cy638t;8wxg;SMW11003;TJ_AB_592;cr1;2026-10-23;12;40;20;5',
  'France;Sator Android;https://uz.test/;Boostwin UZ | Wheel 2 | 28$;111;cy638t;8wxg;LCE10964;UZ_ojwq921;cr2;2026-10-23;13;9;3;1',
  'China;Sator Android;https://tj2.test/;Pin-Up | Form TJ | 20$;111;cy638t;8wxg;SMW11003;TJ_AB_740;cr3;2026-10-23;14;11;5;2'
].join('\n');

const fbHead = '"Account ID","Campaign name","Ad name",Platform,Placement,Currency,"Amount spent (USD)","Link clicks",Leads,"Registrations completed","App installs",Purchases,"Reporting starts","Reporting ends"';
const fbRow = (acc, geo, spend) =>
  `${acc},cy638t_8wxg_cr1_SMW11003_${acc}_${geo},AD_${geo},instagram,Feed,USD,${spend},10,,0,0,0,2026-10-23,2026-10-23`;

const run = (fbCsv, mask) => page.evaluate(async ([ktCsv, fb, mk]) => {
  mappingDB = { timezones: { '111': 3 }, agencies: {}, funnels: {}, funnelApp: {}, providers: {} };
  knownOffers = ['Pin-Up[25]', 'Boostwin'];
  globalOffersCache = []; datasetToImport = []; creativesToImport = [];
  trafficMode = 'app'; appParse = { mask: mk }; appProfiles = {};
  keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(ktCsv);
  const lines = parseCsvLines(fb);
  const map = mapColumns(lines[0].map(h => h.toLowerCase()));
  map.cur = lines[0].length;
  await processCampaignData(map, [lines[0].concat('cur')].concat(lines.slice(1).map(r => r.concat('USD'))));
  return {
    rows: datasetToImport.map(r => ({ geo: r.geo, offer: r.offer || '', landing: r.landing || '',
      i: r.installs, g: r.regs, d: r.deps, sp: +r.spend.toFixed(2), other: r._geoOther || '' })),
    cells: Object.values(keitaroAgg.byDailyLand['2026-10-23|111'] || {})
      .map(c => ({ geo: c.geo, i: c.installs })),
    kt: keitaroAgg.byDaily['2026-10-23|111'],
    foot: (document.getElementById('dataset-preview-foot')?.textContent || '').replace(/\s+/g, ' ').trim(),
    badges: (document.getElementById('dataset-preview-body').innerHTML.match(/class="ds-geo"/g) || []).length
  };
}, [KT, fbCsv, mask]);

const MASK = '*_*_*_{app}_{acc}_{geo}';
const one = await run([fbHead, fbRow('111', 'TJ', '100.00')].join('\r\n'), MASK);

ok('гео лендінга взято з крео APP, а не зі стовпця Country',
  JSON.stringify(one.cells.map(c => c.geo).sort()) === '["TJ","TJ","UZ"]', one.cells);

const tj = one.rows.filter(r => !r.other), uz = one.rows.filter(r => r.other);
ok('лендінги свого гео сіли на рядок без жодної позначки',
  tj.length === 2 && tj.every(r => /TJ/.test(r.landing)), tj);
ok('узбецький лендінг на TJ-рядку позначений чужим гео',
  uz.length === 1 && uz[0].other === 'UZ' && /Boostwin UZ/.test(uz[0].landing), uz);
ok('і позначка справді в розмітці', one.badges === 1, one.badges);
/* Викидати його не можна: 9 інсталів і депозит — це не нічого. */
ok('чужий лендінг не викинуто — його цифри на місці',
  uz[0].i === 9 && uz[0].d === 1, uz[0]);
ok('сума дорівнює Keitaro',
  one.rows.reduce((a, r) => a + r.i, 0) === one.kt.installs
  && one.rows.reduce((a, r) => a + r.d, 0) === one.kt.deps, [one.rows, one.kt]);
ok('спенд не зрушив', Math.abs(one.rows.reduce((a, r) => a + r.sp, 0) - 100) < 0.01,
  one.rows.map(r => r.sp));
ok('офер підставився з хвостом у дужках',
  tj.every(r => r.offer === 'Pin-Up[25]'), tj.map(r => r.offer));

/* ─────────── 3. ДВА ГЕО У ЗВІТІ FB — КОЖЕН БЕРЕ СВОЄ ─────────── */
const two = await run([fbHead, fbRow('111', 'TJ', '100.00'), fbRow('111', 'UZ', '50.00')].join('\r\n'), MASK);
const byGeo = {};
two.rows.forEach(r => { (byGeo[r.geo] = byGeo[r.geo] || []).push(r); });
ok('TJ-рядок узяв лише TJ-лендінги',
  byGeo.TJ && byGeo.TJ.every(r => /TJ/.test(r.landing)), byGeo.TJ);
ok('UZ-рядок узяв лише узбецький',
  byGeo.UZ && byGeo.UZ.length === 1 && /Boostwin UZ/.test(byGeo.UZ[0].landing), byGeo.UZ);
ok('коли гео знайшлось, чужим ніхто не позначений',
  two.rows.every(r => !r.other) && two.badges === 0, two.rows.map(r => r.other));
ok('і сума все одно дорівнює Keitaro',
  two.rows.reduce((a, r) => a + r.i, 0) === two.kt.installs, [two.rows, two.kt]);

/* ─────────── 4. ГЕО НЕВІДОМЕ — НЕ ВИГАДУЄМО ─────────── */
/* Маска не дістала гео, у рядків «??». Порівнювати нема з чим, і
   кричати про чуже гео означало б брехати про те, чого ми не знаємо. */
const blind = await run([fbHead, fbRow('111', 'TJ', '100.00')].join('\r\n'), '{app}_{acc}');
ok('гео на боці FB невідоме — чужим ніхто не позначений',
  blind.rows.every(r => !r.other), blind.rows.map(r => r.other));
ok('але цифри все одно всі на місці',
  blind.rows.reduce((a, r) => a + r.i, 0) === blind.kt.installs, [blind.rows, blind.kt]);

/* ─────────── 4б. БЕЗ ТОКЕНА — БЕРЕМО COUNTRY ─────────── */
/* У PWA-постачальників токена гео в сабі немає зовсім, і там Country
   якраз правильна. Але першим він лишається саме токен: на справжній
   вигрузці Country розійшлась із гео кампанії в 16 рядках зі 147 —
   Netherlands, United States, China на TJ-кампанії, тобто проксі. */
const fallback = await page.evaluate(async ([ktCsv, fb, mk]) => {
  mappingDB = { timezones: { '111': 3 }, agencies: {}, funnels: {}, funnelApp: {}, providers: {} };
  knownOffers = ['Pin-Up[25]', 'Boostwin'];
  globalOffersCache = []; datasetToImport = []; creativesToImport = [];
  trafficMode = 'app'; appParse = { mask: mk }; appProfiles = {};
  keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(ktCsv);
  return Object.values(keitaroAgg.byDailyLand['2026-10-23|111'] || {})
    .map(c => ({ land: c.landing.slice(0, 18), geo: c.geo }));
}, [[
  'Country;Source;Referrer;Offer;Sub ID 5;Sub ID 1;Sub ID 2;Sub ID 4;Sub ID 20;Sub ID 3;Day;Hour;UC (campaign);Conv.;Sales',
  // токена немає — працює Country
  'Kyrgyzstan;PWA Partners;https://a.test/;Boostwin KG | Wheel;111;MPlay_KG_10708-ex8g_22/10_001;1;Instagram_Reels;;KG_1;2026-10-23;12;5;2;0',
  // токен є і суперечить Country (проксі) — виграє токен
  'Netherlands;Sator Android;https://b.test/;Pin-Up | Wheel TJ | 20$;111;cy638t;8wxg;SMW11003;TJ_AB_592;cr1;2026-10-23;13;7;3;1'
].join('\n'), [fbHead, fbRow('111', 'TJ', '50.00')].join('\r\n'), MASK]);
const byLand = Object.fromEntries(fallback.map(c => [c.land, c.geo]));
ok('токена немає — гео береться з Country', byLand['Boostwin KG | Whee'] === 'KG', byLand);
ok('токен суперечить Country — виграє токен, бо Country це проксі',
  byLand['Pin-Up | Wheel TJ '] === 'TJ', byLand);

/* ─────────── 5. ПОРОЖНІ РЯДКИ НЕ ВЕЗЕМ ─────────── */
ok('рядок без спенду і без конверсій не потрапляє в імпорт',
  one.rows.every(r => r.sp !== 0 || r.i || r.g || r.d), one.rows);

/* ─────────── 6. ПІДСУМОК ПІД ТАБЛИЦЕЮ ─────────── */
ok('підсумок показує скільки рядків і скільки всього',
  /Total · 3 row\(s\)/.test(one.foot) && /\$100\.00/.test(one.foot), one.foot);
ok('у підсумку ті самі інстали, реєстрації і депозити, що в Keitaro',
  new RegExp(`${one.kt.installs}\\b`).test(one.foot)
  && new RegExp(`${one.kt.deps}\\b`).test(one.foot), [one.foot, one.kt]);

await done(browser, srv, errs);
