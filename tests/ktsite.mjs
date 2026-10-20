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

ok('у Records домен правиться як решта полів', await page.evaluate(() =>
  REC_SCHEMA.daily_stats.some(f => f.key === 'site' && f.label === 'Domain')));
ok('у налаштуваннях Keitaro є поле Site', await page.evaluate(() =>
  KM_FIELDS.some(f => f.key === 'site') && KM_DEFAULT.site === 'Site'));

await done(browser, srv, errs);
