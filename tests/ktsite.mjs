/* ═══════════ ДОМЕН ІЗ ВИГРУЗКИ KEITARO (стовпець Site) ═══════════

   Домен досі жив окремо від статистики: у списку доменів (хто живий) і
   в оголошеннях на сьогодні. Питання «скільки ми на цей домен залили»
   не мало де взятись. Тепер він приїжджає тим самим рядком, що й спенд.

   Стенд тримає те, на чому це легко зламати:
     • у стовпці трапляється і https://, і www, і непідставлений макрос
       — у базі мусить лежати один чистий хост, бо саме за ним рядок
       статистики зійдеться з рядком у списку доменів;
     • групуємо по ПАРІ (лендінг, домен): один лендінг крутиться на
       кількох доменах, і без пари спенд по домену не показати, не
       збрехавши;
     • домену немає — набір груп той самий, що був до цієї зміни. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8128;
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

/* ─────────── нормалізація ─────────── */
const norm = await page.evaluate(() => [
  'https://mplay-kg.website/', 'www.mplay-kg.website', 'MPLAY-KG.Website',
  'mplay-kg.website:443', 'mplay-kg.website/path?a=1', '{site}', '', 'not a domain', 'localhost'
].map(v => [v, ktSite(v)]));
const got = Object.fromEntries(norm);
ok('схема, www, порт і шлях відрізаються',
  got['https://mplay-kg.website/'] === 'mplay-kg.website'
  && got['www.mplay-kg.website'] === 'mplay-kg.website'
  && got['mplay-kg.website:443'] === 'mplay-kg.website'
  && got['mplay-kg.website/path?a=1'] === 'mplay-kg.website', got);
ok('регістр не плодить другий домен', got['MPLAY-KG.Website'] === 'mplay-kg.website');
ok('непідставлений макрос — не домен', got['{site}'] === '');
ok('не схоже на домен — краще порожньо, ніж сміття',
  got['not a domain'] === '' && got['localhost'] === '' && got[''] === '', got);

/* ─────────── групування по парі (лендінг, домен) ─────────── */
const HEAD = 'Day,Hour,Sub ID 5,Sub ID 1,Sub ID 2,Sub ID 3,Sub ID 4,Offer,Country,Site,UC (campaign),Conv.,Sales';
const row = (site, ins, reg, dep, offer) =>
  `2026-10-01,12,123,Mbank_KG_10708-ex8g_09/10,,cr1,,${offer || '[P] Pinco KG | Form | 50$'},Kyrgyzstan,${site},${ins},${reg},${dep}`;

const agg = await page.evaluate(csv => {
  knownOffers = ['Pinco'];
  mappingDB = { timezones: { '123': 3 }, agencies: {}, funnels: {}, funnelApp: {} };
  trafficMode = 'pwa';
  keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(csv);
  const dk = Object.keys(keitaroAgg.byDailyLand)[0];
  return { dk, cells: keitaroAgg.byDailyLand[dk] };
}, [HEAD,
    row('https://mplay-kg.website/', 10, 5, 2),
    row('mplay-kg.website', 6, 3, 1),          // той самий домен іншим написанням
    row('other-kg.website', 4, 2, 1)].join('\n'));

const cells = Object.values(agg.cells || {});
ok('одне написання домену — одна група', cells.length === 2, Object.keys(agg.cells || {}));
const byS = Object.fromEntries(cells.map(c => [c.site, c]));
ok('рядки того самого домену склались', byS['mplay-kg.website']
  && byS['mplay-kg.website'].installs === 16 && byS['mplay-kg.website'].deps === 3, byS);
ok('другий домен лишився окремо', byS['other-kg.website']
  && byS['other-kg.website'].installs === 4, byS);
ok('у групі лежить і лендінг, і офер',
  cells.every(c => c.landing === '[P] Pinco KG | Form | 50$' && c.offer === 'Pinco'), cells);

/* Домену немає — групи такі самі, як були до цієї зміни: один
   лендінг, один рядок. */
const nosite = await page.evaluate(csv => {
  knownOffers = ['Pinco'];
  mappingDB = { timezones: { '123': 3 }, agencies: {}, funnels: {}, funnelApp: {} };
  trafficMode = 'pwa';
  keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(csv);
  const dk = Object.keys(keitaroAgg.byDailyLand)[0];
  return { keys: Object.keys(keitaroAgg.byDailyLand[dk]),
           cells: Object.values(keitaroAgg.byDailyLand[dk]) };
}, [HEAD.replace(',Site', ',Nothing'),
    row('x', 10, 5, 2), row('y', 6, 3, 1)].join('\n'));
ok('без стовпця Site — одна група на лендінг', nosite.keys.length === 1, nosite.keys);
ok('і ключ той самий, що й раніше — сам лендінг',
  nosite.keys[0] === '[P] Pinco KG | Form | 50$', nosite.keys);
ok('суми не постраждали', nosite.cells[0].installs === 16 && nosite.cells[0].deps === 3, nosite.cells);
ok('домен у такій групі порожній, а не вигаданий', !nosite.cells[0].site, nosite.cells[0]);

/* Непідставлений макрос у стовпці — те саме, що відсутній домен. */
ok('макрос у Site не створює групу-привид', await page.evaluate(csv => {
  knownOffers = ['Pinco'];
  mappingDB = { timezones: { '123': 3 }, agencies: {}, funnels: {}, funnelApp: {} };
  trafficMode = 'pwa';
  keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(csv);
  const dk = Object.keys(keitaroAgg.byDailyLand)[0];
  return Object.keys(keitaroAgg.byDailyLand[dk]).length === 1
      && !Object.values(keitaroAgg.byDailyLand[dk])[0].site;
}, [HEAD, row('{site}', 10, 5, 2), row('{site}', 6, 3, 1)].join('\n')));

/* Стовпець шукаємо ТІЛЬКИ точним збігом: «site» короткий, і
   «Website» за домен брати не можна. */
ok('схожа назва стовпця за домен не береться', await page.evaluate(csv => {
  knownOffers = ['Pinco'];
  mappingDB = { timezones: { '123': 3 }, agencies: {}, funnels: {}, funnelApp: {} };
  trafficMode = 'pwa';
  keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(csv);
  const dk = Object.keys(keitaroAgg.byDailyLand)[0];
  return !Object.values(keitaroAgg.byDailyLand[dk])[0].site;
}, [HEAD.replace(',Site', ',Website'), row('mplay-kg.website', 10, 5, 2)].join('\n')));

/* ─────────── спенд розноситься по доменах ───────────

   FB не знає ні лендінга, ні домену — знає Keitaro. Один FB-рядок
   ділимо пропорційно унікальним клікам кожної пари (лендінг, домен).
   Головне, що мусить вижити: сума спенду лишається та сама, що й була
   у FB, — інакше розріз по доменах почав би красти гроші в підсумку. */
const split = await page.evaluate(csv => {
  knownOffers = ['Pinco'];
  mappingDB = { timezones: { '123': 3 }, agencies: {}, funnels: {}, funnelApp: {} };
  trafficMode = 'pwa';
  keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(csv);
  // Один рядок FB: той самий день, кабінет, гео й ktid, що в вигрузці.
  const fb = { r1: { date: '2026-10-01', acc: '123', geo: 'KG', _ktid: '10708-ex8g',
                     funnel: '—', spend: 100, installs: 0, regs: 0, deps: 0 } };
  const out = applyKeitaroMerge(fb, {}).daily;
  return out.map(r => ({ site: r.site, landing: r.landing, offer: r.offer,
                         spend: r.spend, installs: r.installs, deps: r.deps }));
}, [HEAD, row('mplay-kg.website', 10, 5, 2), row('other-kg.website', 30, 15, 6)].join('\n'));

ok('рядок розійшовся на два домени', split.length === 2, split);
ok('спенд поділився пропорційно клікам',
  JSON.stringify(split.map(r => r.spend).sort((a, b) => a - b)) === JSON.stringify([25, 75]), split);
ok('сума спенду та сама, що у FB',
  split.reduce((a, r) => a + r.spend, 0) === 100, split);
ok('кожному рядку — домен і той самий лендінг',
  split.every(r => r.landing === '[P] Pinco KG | Form | 50$' && r.offer === 'Pinco')
  && split.map(r => r.site).sort().join() === 'mplay-kg.website,other-kg.website', split);
ok('конверсії лягли по своїх доменах, а не подвоїлись',
  split.reduce((a, r) => a + r.deps, 0) === 8
  && split.find(r => r.site === 'other-kg.website').deps === 6, split);

/* Домену немає — рядок лишається один, як до цієї зміни. */
ok('без домену рядок не ділиться', await page.evaluate(csv => {
  knownOffers = ['Pinco'];
  mappingDB = { timezones: { '123': 3 }, agencies: {}, funnels: {}, funnelApp: {} };
  trafficMode = 'pwa';
  keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(csv);
  const fb = { r1: { date: '2026-10-01', acc: '123', geo: 'KG', _ktid: '10708-ex8g',
                     funnel: '—', spend: 100, installs: 0, regs: 0, deps: 0 } };
  const out = applyKeitaroMerge(fb, {}).daily;
  return out.length === 1 && out[0].spend === 100 && !out[0].site
      && out[0].landing === '[P] Pinco KG | Form | 50$';
}, [HEAD.replace(',Site', ',Nothing'), row('x', 10, 5, 2), row('y', 30, 15, 6)].join('\n')));

/* ─────────── стовпець source: чий рядок ───────────

   Доти він читався лише в APP, і вписаний у PWA-рядку постачальник не
   мав жодного наслідку. Тепер читається завжди — і перебивки стовпців
   під постачальника працюють на обох видах.

   Чого source НЕ вирішує: форму ключа злиття. Ключ мусить складатись
   однаково з обох боків, а у звіті Facebook такого стовпця немає й
   бути не може. */
const SRC_HEAD = 'Day,Hour,Sub ID 5,Sub ID 1,Sub ID 2,Sub ID 3,Sub ID 4,Offer,Country,Site,Source,UC (campaign),Conv.,Sales';
const srcRow = (camp, src, ins) =>
  `2026-10-01,12,123,${camp},,cr1,,[P] Pinco KG | Form | 50$,Kyrgyzstan,mplay-kg.website,${src},${ins},1,1`;

const prov = await page.evaluate(csv => {
  knownOffers = ['Pinco'];
  mappingDB = { timezones: { '123': 3 }, agencies: {}, funnels: {}, funnelApp: {} };
  trafficMode = 'pwa';                       // саме PWA: доти source тут не читався
  keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(csv);
  return { seen: keitaroAgg.provSeen, hasSrc: keitaroAgg.hasSrc };
}, [SRC_HEAD,
    srcRow('Mbank_KG_10708-ex8g_09/10', 'satorapps', 10),
    srcRow('Mbank_KG_10708-ex8g_09/10', 'satorapps', 6),
    srcRow('Mbank_KG_10708-ex8g_09/10', 'trident', 4)].join('\n'));
ok('стовпець source знайдено і в PWA-режимі', prov.hasSrc === true, prov);
ok('постачальники порахувані по рядках',
  prov.seen.satorapps === 2 && prov.seen.trident === 1, prov.seen);

/* Перебивка стовпця під постачальника тепер діє і на PWA-рядок:
   креатив цього постачальника лежить в іншому стовпці. */
const over = await page.evaluate(csv => {
  knownOffers = ['Pinco'];
  mappingDB = { timezones: { '123': 3 }, agencies: {}, funnels: {}, funnelApp: {} };
  trafficMode = 'pwa';
  // trident тримає назву креатива в Sub ID 2, решта — в Sub ID 3
  keitaroMap = { ...KM_DEFAULT, prov: { trident: { cr: 'Sub ID 2' } } };
  parseKeitaro(csv);
  return Object.values(keitaroAgg.byCreative).map(v => v.cid).sort();
}, [SRC_HEAD.replace(',Sub ID 2,', ',Sub ID 2,'),
    '2026-10-01,12,123,Mbank_KG_10708-ex8g_09/10,fromSub2,cr1,,[P] Pinco KG | Form | 50$,Kyrgyzstan,x.site,trident,10,1,1',
    '2026-10-01,12,123,Mbank_KG_10708-ex8g_09/10,fromSub2,cr1,,[P] Pinco KG | Form | 50$,Kyrgyzstan,x.site,satorapps,10,1,1'
   ].join('\n'));
ok('у PWA-рядка trident креатив узято з перебитого стовпця',
  JSON.stringify(over) === JSON.stringify(['cr1', 'fromSub2']), over);

ok('у Records домен правиться як решта полів', await page.evaluate(() =>
  REC_SCHEMA.daily_stats.some(f => f.key === 'site' && f.label === 'Domain')));
ok('у налаштуваннях Keitaro є поле під домен, і типово це Referrer',
  await page.evaluate(() =>
    KM_FIELDS.some(f => f.key === 'site') && KM_DEFAULT.site === 'Referrer'));

/* ═══════════ ВИГРУЗКА ПЕРЕЇХАЛА: SITE → REFERRER ═══════════

   Домен тепер приїжджає в стовпці Referrer, і там повна силка:
   «https://mplay-games-kg.com/». Для нормалізації різниці немає — вона
   й робилась так, щоб лишався хост. Ламається тут інше: НАЗВА
   СТОВПЦЯ, і з двох боків одночасно.

     • у команд, які вже зберегли мапінг, у налаштуваннях лежить старе
       «Site» — нова вигрузка дала б їм порожній домен;
     • у кого мапінг типовий, той читав би нову назву й спотикався на
       старих файлах, які ще лежать у теці.

   Тому шукаємо спершу те, що в налаштуваннях, потім відомі назви. */
const R_HEAD = 'Day,Hour,Sub ID 5,Sub ID 1,Sub ID 2,Sub ID 3,Sub ID 4,Offer,Country,Referrer,UC (campaign),Conv.,Sales';
const rrow = (site, ins, reg, dep) =>
  `2026-10-01,12,123,Mbank_KG_10708-ex8g_09/10,,cr1,,[P] Pinco KG | Form | 50$,Kyrgyzstan,${site},${ins},${reg},${dep}`;

const siteOf = (csv, map) => page.evaluate(([text, m]) => {
  knownOffers = ['Pinco'];
  mappingDB = { timezones: { '123': 3 }, agencies: {}, funnels: {}, funnelApp: {} };
  trafficMode = 'pwa';
  keitaroMap = { ...KM_DEFAULT, ...(m || {}) };
  parseKeitaro(text);
  const dk = Object.keys(keitaroAgg.byDailyLand)[0];
  return Object.values(keitaroAgg.byDailyLand[dk]).map(c => c.site).sort();
}, [csv, map]);

ok('повна силка з Referrer стає хостом',
  await page.evaluate(() => ktSite('https://mplay-games-kg.com/') === 'mplay-games-kg.com'));

const fresh = await siteOf([R_HEAD,
  rrow('https://mplay-games-kg.com/', 10, 5, 2),
  rrow('https://mplay-games-kg.com/promo?a=1', 6, 3, 1)].join('\n'));
ok('новий стовпець читається типовим мапінгом',
  JSON.stringify(fresh) === JSON.stringify(['mplay-games-kg.com']), fresh);

const oldMap = await siteOf([R_HEAD, rrow('https://mplay-games-kg.com/', 10, 5, 2)].join('\n'),
  { site: 'Site' });
ok('у кого в налаштуваннях лишилось «Site» — нова вигрузка все одно читається',
  JSON.stringify(oldMap) === JSON.stringify(['mplay-games-kg.com']), oldMap);

const oldFile = await siteOf([HEAD, row('https://mplay-kg.website/', 10, 5, 2)].join('\n'),
  { site: 'Referrer' });
ok('і навпаки: старий файл зі Site читається новим мапінгом',
  JSON.stringify(oldFile) === JSON.stringify(['mplay-kg.website']), oldFile);

/* Коли в шапці є обидва стовпці, вирішує НАЛАШТУВАННЯ — інакше
   перебити вибір стало б неможливо. */
const both = 'Day,Hour,Sub ID 5,Sub ID 1,Sub ID 2,Sub ID 3,Sub ID 4,Offer,Country,Site,Referrer,UC (campaign),Conv.,Sales';
const bothRow = '2026-10-01,12,123,Mbank_KG_10708-ex8g_09/10,,cr1,,[P] Pinco KG | Form | 50$,Kyrgyzstan,'
              + 'from-site.com,https://from-referrer.com/,10,5,2';
ok('обидва стовпці в шапці — вирішує налаштування',
  JSON.stringify(await siteOf([both, bothRow].join('\n'), { site: 'Site' })) === '["from-site.com"]'
  && JSON.stringify(await siteOf([both, bothRow].join('\n'), { site: 'Referrer' })) === '["from-referrer.com"]');

/* Referrer буває й не нашим: у частині рядків туди падає джерело
   трафіку. Нормалізація його не фільтрує — і це навмисно: вирішувати,
   який домен «наш», тут нічим. Але хост лишається хостом, а не
   сміттям, і в списку доменів його видно. */
ok('чужий referrer теж стає хостом, а не сміттям',
  await page.evaluate(() => ktSite('https://l.facebook.com/l.php?u=x') === 'l.facebook.com'));
ok('порожній referrer домену не вигадує',
  await page.evaluate(() => ktSite('(direct)') === '' && ktSite('-') === ''));

await done(browser, srv, errs);
