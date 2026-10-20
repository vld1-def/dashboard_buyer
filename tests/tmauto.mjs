/* ═══════════ ОДИН ФАЙЛ: PWA І APP РАЗОМ ═══════════

   Доти вид трафіку був перемикачем на всю сторінку, а вигрузка
   приходить одна — і в ній лежить і те, і те. Поки перемикач стоїть не
   на тому, половина рядків читається не тим способом і виглядає при
   цьому як звичайні дані.

   Стенд тримає те, на чому це ламається:
     • сам збіг із PWA-шаблоном нічого не доводить («*_{geo}_{ktid}»
       лягає майже на будь-яку назву) — на місці гео мусить стояти
       справжній код країни;
     • невпізнаний рядок читається як APP (як і доти), але його видно
       в звіті, а не мовчки;
     • обидві половини ключа злиття класифікуються ОДНАКОВО, інакше
       рядки FB і Keitaro не сходяться;
     • Sub ID 4 для PWA-рядка — плейсмент, для APP-рядка — апка;
     • перемикач PWA/APP лишається перебивкою й працює як раніше. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8130;
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

const PWA_NAME = 'Mbank_KG_10708-ex8g_09/10';
const APP_NAME = 'cy638t_8wxg7hf7_bGcTwMmV_CS11003_1396119625835251_TJ_5';
const JUNK     = 'somethingrandom_xx1_yy2_zz3';

const setup = () => page.evaluate(() => {
  knownOffers = ['Pinco'];
  // CS11003 — відома апка: воронка з позначкою APP.
  mappingDB = { timezones: { '123': 3 }, agencies: {}, providers: {},
                funnels: { 'CS11003': 'Crazy Wheel [satorapps]', '10708-ex8g': 'Mbank' },
                funnelApp: { 'CS11003': true } };
  keitaroMap = { ...KM_DEFAULT };
  appProfiles = {};
  trafficMode = 'auto';
  tmUnknown = 0; tmSeen = { pwa: 0, app: 0 };
});

await setup();
const cls = await page.evaluate(([pwa, app, junk]) => ({
  pwa: tmRowMode(pwa), app: tmRowMode(app), junk: tmRowMode(junk),
  mask: pwaMask
}), [PWA_NAME, APP_NAME, JUNK]);
ok('PWA-назва впізнається як PWA', cls.pwa === 'pwa', cls);
ok('APP-назва не стає PWA через «збіг» шаблону', cls.app === 'app', cls);
ok('ні те, ні те — так і кажемо, а не вгадуємо', cls.junk === 'unknown', cls);

/* Перемикач лишається перебивкою: вибрали руками — питань до рядка
   немає. */
ok('вибраний режим перебиває розпізнавання', await page.evaluate(n => {
  trafficMode = 'app';
  const a = tmRowMode(n);
  trafficMode = 'pwa';
  const p = tmRowMode(n);
  trafficMode = 'auto';
  return a === 'app' && p === 'pwa';
}, PWA_NAME));

/* ─────────── ключ злиття ─────────── */
ok('ключі двох видів не можуть збігтись', await page.evaluate(() => {
  const a = mergeKey('2026-10-01', '123', 'KG', '10708', 'app');
  const p = mergeKey('2026-10-01', '123', 'KG', '10708', 'pwa');
  return a !== p && a === '2026-10-01|123' && p === '2026-10-01|123|KG|10708';
}));

/* ─────────── один файл Keitaro, два види ─────────── */
const HEAD = 'Day,Hour,Sub ID 5,Sub ID 1,Sub ID 2,Sub ID 3,Sub ID 4,Offer,Country,Site,UC (campaign),Conv.,Sales';
const ktRow = (camp, sub4, ins, reg, dep) =>
  `2026-10-01,12,123,${camp},,cr1,${sub4},[P] Pinco KG | Form | 50$,Kyrgyzstan,mplay-kg.website,${ins},${reg},${dep}`;

const mixed = await page.evaluate(csv => {
  parseKeitaro(csv);
  return { keys: Object.keys(keitaroAgg.byDaily),
           daily: keitaroAgg.byDaily,
           plc: keitaroAgg.ktPlacements };
}, [HEAD,
    ktRow(PWA_NAME, 'Instagram_Reels', 10, 5, 2),
    ktRow('cy638t', 'CS11003', 7, 3, 1)].join('\n'));

ok('PWA-рядок і APP-рядок з одного файлу пішли різними ключами',
  mixed.keys.length === 2
  && mixed.keys.includes('2026-10-01|123|KG|10708-ex8g')
  && mixed.keys.includes('2026-10-01|123'), mixed.keys);
ok('цифри не перемішались між видами',
  mixed.daily['2026-10-01|123|KG|10708-ex8g'].installs === 10
  && mixed.daily['2026-10-01|123'].installs === 7, mixed.daily);
/* Sub ID 4 для PWA-рядка — плейсмент; для APP у тому самому стовпці
   лежить апка, і покласти «CS11003» у поле розміщення означало б
   зіпсувати справжній «Instagram Reels» зі звіту FB. */
const plcVals = Object.values(mixed.plc || {});
ok('плейсмент узято тільки з PWA-рядка',
  plcVals.length === 1 && plcVals[0] === 'Instagram_Reels', mixed.plc);

/* ─────────── злиття: кожен рядок зі своїм видом ─────────── */
const merged = await page.evaluate(csv => {
  parseKeitaro(csv);
  const fb = {
    a: { date: '2026-10-01', acc: '123', geo: 'KG', _ktid: '10708-ex8g', _mode: 'pwa',
         funnel: '—', spend: 50, installs: 0, regs: 0, deps: 0 },
    b: { date: '2026-10-01', acc: '123', geo: 'TJ', _ktid: 'CS11003', _mode: 'app',
         funnel: '—', spend: 30, installs: 0, regs: 0, deps: 0 }
  };
  return applyKeitaroMerge(fb, {}).daily
    .map(r => ({ mode: r._mode, spend: r.spend, installs: r.installs, deps: r.deps }));
}, [HEAD,
    ktRow(PWA_NAME, 'Instagram_Reels', 10, 5, 2),
    ktRow('cy638t', 'CS11003', 7, 3, 1)].join('\n'));

ok('кожен FB-рядок узяв цифри свого виду',
  merged.find(r => r.mode === 'pwa').installs === 10
  && merged.find(r => r.mode === 'app').installs === 7, merged);
ok('спенд не поїхав',
  merged.reduce((a, r) => a + r.spend, 0) === 80, merged);

/* ─────────── звіт про розподіл ─────────── */
const rep = await page.evaluate(([pwa, app, junk]) => {
  tmUnknown = 0; tmSeen = { pwa: 0, app: 0 };
  [pwa, app, junk].forEach(n => {
    const p = campParse(n, '', '', undefined, '123');
    tmSeen[p.mode]++;
  });
  renderAgentReport(new Set(), new Set());
  const el = document.getElementById('agent-report');
  return { txt: el.textContent, hidden: el.classList.contains('hidden'),
           seen: { ...tmSeen }, unknown: tmUnknown };
}, [PWA_NAME, APP_NAME, JUNK]);
ok('порахували, скільком рядкам який вид дістався',
  rep.seen.pwa === 1 && rep.seen.app === 2 && rep.unknown === 1, rep.seen);
ok('звіт показується і каже цифри', !rep.hidden && /1 row\(s\) read as/.test(rep.txt)
  && /2 as/.test(rep.txt), rep.txt.slice(0, 200));
ok('про невпізнані сказано вголос, а не промовчано',
  /matched neither/.test(rep.txt) && /1/.test(rep.txt), rep.txt.slice(0, 300));

/* ─────────── дрібниці, які ламаються тихо ─────────── */
ok('у auto колонку інсталів шукаємо APP-першою', await page.evaluate(() => {
  trafficMode = 'auto';
  const a = kwFor('installs');
  trafficMode = 'pwa';
  const p = kwFor('installs');
  trafficMode = 'auto';
  return a === INSTALLS_APP_FIRST && p !== INSTALLS_APP_FIRST;
}));
ok('у звіті про маску в auto видно обидві', await page.evaluate(() =>
  /PWA .* · APP /.test(impMaskNow())));
ok('підпис режиму в auto не бреше, що це PWA', await page.evaluate(() => tmLabel() === 'PWA/APP'));
ok('кнопка Auto є і перемикається', await page.evaluate(() => {
  setTrafficMode('auto');
  const on = document.getElementById('tm-auto').className.includes('bg-orange-600');
  const hint = document.getElementById('traffic-mode-hint').textContent;
  return on && /one file can hold both/.test(hint);
}));

/* Режим PWA мусить працювати рівно як до цієї зміни. */
ok('перебивка PWA читає все як PWA', await page.evaluate(csv => {
  trafficMode = 'pwa';
  parseKeitaro(csv);
  const keys = Object.keys(keitaroAgg.byDaily);
  trafficMode = 'auto';
  return keys.every(k => k.split('|').length === 4);
}, [HEAD, ktRow(PWA_NAME, 'Instagram_Reels', 10, 5, 2), ktRow('cy638t', 'CS11003', 7, 3, 1)].join('\n')));
ok('перебивка APP читає все як APP', await page.evaluate(csv => {
  trafficMode = 'app';
  parseKeitaro(csv);
  const keys = Object.keys(keitaroAgg.byDaily);
  trafficMode = 'auto';
  return keys.length === 1 && keys[0] === '2026-10-01|123';
}, [HEAD, ktRow(PWA_NAME, 'Instagram_Reels', 10, 5, 2), ktRow('cy638t', 'CS11003', 7, 3, 1)].join('\n')));

await done(browser, srv, errs);
