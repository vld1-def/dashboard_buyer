/* ═══════════ НЕВПІЗНАНИЙ ОФЕР БІЛЬШЕ НЕ ЇСТЬ КОНВЕРСІЇ ═══════════

   «чому останній рядок не розбивається на оффери і чому в перших двох
   немає даних» — обидва випадки з одного кореня.

   У групу лендінгів потрапляли ЛИШЕ рядки, чий офер знайшовся в
   Settings → Offers. Виглядало безпечно: не знаємо офера — не ділимо.
   Насправді splitByOffer бере цифри З ГРУПИ, а не з byDaily:

     • у кабінеті впізнався один лендінг із нулями, а решта ні — рядок
       діставав нулі впізнаного, а справжні конверсії невпізнаних
       зникали з прев'ю, хоч у byDaily лежали правильні;
     • не впізнався жоден — група порожня, рядок не ділився зовсім і
       лишався з «-- SELECT --».

   Тепер у групу йде кожен лендінг, а невпізнаному просто не ставиться
   офер: його вибирають у списку рядка. Головне, що тримає стенд: СУМА
   РОЗБИТИХ РЯДКІВ ЗАВЖДИ ДОРІВНЮЄ byDaily. «Не знаю офера» більше не
   означає «загубив конверсії». */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8146;
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

const H = 'Country;Source;Referrer;Offer;Sub ID 5;Sub ID 1;Sub ID 2;Sub ID 4;Sub ID 20;Sub ID 3;Day;Hour;UC (campaign);Conv.;Sales';
const ktRow = (acc, offer, site, ins, reg, dep) =>
  `Tajikistan;Sator Android;${site};${offer};${acc};cy638t;8wxg;VP11003;TJ_1;cr1;2026-10-23;12;${ins};${reg};${dep}`;

/* Кабінет 111: один впізнаний офер із нулями + два невпізнаних, на
   яких висять усі конверсії. Рівно та форма, на якій ламалось.
   Кабінет 222: жодного впізнаного офера. */
const KT = [H,
  ktRow('111111111111', 'Boostwin UZ | Wheel 2 | 28$',   'https://a.test/', 2, 1, 0),
  ktRow('111111111111', 'Pin-Up | Game Megablock | 20$', 'https://b.test/', 80, 50, 10),
  ktRow('111111111111', 'Pin-Up | Wheel Plus Girl | 20$', 'https://b.test/', 20, 18, 3),
  ktRow('222222222222', 'Pin-Up | Form Megablock | 20$', 'https://c.test/', 30, 11, 1),
  ktRow('222222222222', 'Pin-Up | Game Megablock | 20$', 'https://c.test/', 27, 18, 0)
].join('\n');

const FB = [
  '"Account ID","Campaign name","Ad name",Platform,Placement,Currency,"Amount spent (USD)","Link clicks",Leads,"Registrations completed","App installs",Purchases,"Reporting starts","Reporting ends"',
  '111111111111,cy638t_8wxg_cr1_VP11003_111111111111_TJ,AD_1,instagram,"Instagram Reels",USD,144.93,10,,1,2,0,2026-10-23,2026-10-23',
  '222222222222,cy638t_8wxg_cr1_VP11003_222222222222_TJ,AD_2,instagram,Feed,USD,96.52,12,,0,0,0,2026-10-23,2026-10-23'
].join('\r\n');

const run = () => page.evaluate(async ([ktCsv, fbCsv]) => {
  mappingDB = { timezones: { '111111111111': 3, '222222222222': 3 },
                agencies: {}, funnels: {}, funnelApp: {}, providers: {} };
  knownOffers = ['Boostwin'];          // Pin-Up у списку оферів НЕМАЄ
  globalOffersCache = []; datasetToImport = []; creativesToImport = [];
  trafficMode = 'auto'; keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(ktCsv);
  const lines = parseCsvLines(fbCsv);
  const map = mapColumns(lines[0].map(h => h.toLowerCase()));
  map.cur = lines[0].length;
  await processCampaignData(map,
    [lines[0].concat('cur')].concat(lines.slice(1).map(r => r.concat('USD'))));
  const per = {};
  (datasetToImport || []).forEach(r => {
    const a = per[r.acc] = per[r.acc] || { rows: [], i: 0, g: 0, d: 0, spend: 0 };
    a.rows.push({ offer: r.offer || '', landing: r.landing || '', site: r.site || '',
                  i: r.installs, g: r.regs, d: r.deps, spend: r.spend });
    a.i += r.installs; a.g += r.regs; a.d += r.deps; a.spend += r.spend;
  });
  const kt = a => { const k = keitaroAgg.byDaily['2026-10-23|' + a];
                    return k ? { i: k.installs, g: k.regs, d: k.deps } : null; };
  return { per, kt1: kt('111111111111'), kt2: kt('222222222222'),
           report: (document.getElementById('kt-merge-report')?.textContent || '').replace(/\s+/g, ' '),
           reports: [...document.querySelectorAll('details.rep')].map(d => ({ open: d.open,
             summary: d.querySelector('summary').textContent.replace(/\s+/g, ' ').trim() })) };
}, [KT, FB]);

const r = await run();
const a1 = r.per['111111111111'], a2 = r.per['222222222222'];

/* ─────────── 1. СУМА РОЗБИТИХ = KEITARO ─────────── */
ok('кабінет із мішаними оферами більше не показує нулі',
  a1 && (a1.i || a1.g || a1.d), a1);
ok('сума розбитих рядків дорівнює byDaily',
  a1.i === r.kt1.i && a1.g === r.kt1.g && a1.d === r.kt1.d,
  [{ i: a1.i, g: a1.g, d: a1.d }, r.kt1]);
ok('конверсії невпізнаних оферів не зникли', a1.i === 102 && a1.g === 69 && a1.d === 13,
  { i: a1.i, g: a1.g, d: a1.d });

ok('кабінет, де жоден офер не впізнано, теж розбився по лендінгах',
  a2.rows.length >= 2, a2.rows.length);
ok('і його сума теж дорівнює byDaily',
  a2.i === r.kt2.i && a2.g === r.kt2.g && a2.d === r.kt2.d,
  [{ i: a2.i, g: a2.g, d: a2.d }, r.kt2]);

/* ─────────── 2. ОФЕР — ТІЛЬКИ ВПІЗНАНИЙ ─────────── */
ok('впізнаний офер підставляється',
  a1.rows.some(x => x.offer === 'Boostwin'), a1.rows.map(x => x.offer));
ok('невпізнаному оферу поле лишається порожнім, щоб його вибрали руками',
  a1.rows.some(x => !x.offer) && a2.rows.every(x => !x.offer),
  [a1.rows.map(x => x.offer), a2.rows.map(x => x.offer)]);
/* Доти в поле офера падав увесь рядок із Keitaro — а такого офера в
   списку немає, і вибір у випадайці виглядав зламаним. */
ok('текст лендінга в поле офера не потрапляє',
  [...a1.rows, ...a2.rows].every(x => !/\|/.test(x.offer)),
  [...a1.rows, ...a2.rows].map(x => x.offer));
ok('а сам лендінг у рядку є', a2.rows.every(x => /Pin-Up/.test(x.landing)),
  a2.rows.map(x => x.landing));

/* Лендінг, якому при діленні не дісталось нічого, у прев'ю не їде:
   рядок без спенду і без конверсій нічого не каже. */
ok('порожніх рядків після розбиття не лишається',
  [...a1.rows, ...a2.rows].every(x => x.spend !== 0 || x.i || x.g || x.d),
  [...a1.rows, ...a2.rows].filter(x => !x.spend && !x.i && !x.g && !x.d));

/* ─────────── 3. СПЕНД НЕ ЗМІНЮЄТЬСЯ ВІД РОЗБИТТЯ ─────────── */
ok('спенд кабінета лишився фейсбучним до цента',
  Math.abs(a1.spend - 144.93) < 0.01 && Math.abs(a2.spend - 96.52) < 0.01,
  [a1.spend, a2.spend]);

/* ─────────── 4. ЗВІТ КАЖЕ ПРАВДУ ─────────── */
ok('звіт більше не обіцяє, що депозити «підуть на сусідній офер»',
  !/end up on the neighbouring offer/.test(r.report), r.report.slice(0, 300));
ok('а каже, що рядки розбиті, просто офер порожній',
  /split by landing but their offer is left empty/.test(r.report), r.report.slice(0, 400));

/* ─────────── 5. ЗВІТИ ЗГОРНУТІ ─────────── */
ok('звіти згорнуті, а не розкладені над таблицею',
  r.reports.length >= 1 && r.reports.every(d => d.open === false), r.reports);
ok('у рядку підсумку видно головне число',
  r.reports.some(d => /stat row\(s\) refined/.test(d.summary)), r.reports.map(d => d.summary));
ok('і їх можна розкрити', await page.evaluate(() => {
  const d = document.querySelector('details.rep');
  d.open = true;
  return d.querySelector('.rep-body').textContent.trim().length > 20;
}));

await done(browser, srv, errs);
