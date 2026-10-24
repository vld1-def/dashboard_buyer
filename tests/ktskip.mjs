/* ═══════════ ЩО KEITARO НЕ ДОВІЗ — ВИДНО, І З ЦІНОЮ ═══════════

   «дані не сплітуються нормально, останній рядок взагалі без даних» —
   у прев'ю імпорту стояли рядки зі спендом і нулями, і вони виглядали
   рівно як рядки, де Keitaro спрацював і показав чесні нулі.

   Насправді до таких рядків Keitaro просто не доїжджав. Його рядки
   відкидались мовчки, трьома `continue` поспіль:
     • акаунт без прив'язаної таймзони — а разом із ним усі його
       інстали, реєстрації й депозити;
     • порожній акаунт;
     • порожній день.
   Казав про це один alert зі списком назв — без цифр, і в тому списку
   поруч із номерами кабінетів стояло «TJ», бо в рядків одного
   постачальника в тому сабі лежить гео, а не кабінет.

   Стенд тримає дві речі: відкинуте рахується з цифрами і джерелом, а
   рядок, до якого Keitaro не доїхав, себе називає. Плюс одна дрібниця,
   через яку звіт лякав би дарма: підсумковий рядок самої вигрузки — не
   втрата, і серед втрат його бути не повинно. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8145;
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

/* Вигрузка Keitaro у тій самій формі, що й справжня: ; як роздільник,
   три різних джерела, підсумковий рядок без акаунта в кінці. */
const H = 'Country;Source;Referrer;Offer;Sub ID 5;Sub ID 1;Sub ID 2;Sub ID 4;Sub ID 20;Sub ID 3;Day;Hour;UC (campaign);Conv.;Sales';
const KT = [H,
  // кабінет із таймзоною — доїжджає
  'Tajikistan;Sator Android;https://a.test/;Pin-Up | Game | 20$;111111111111;cy638t;8wxg;VP11003;TJ_1;cr1;2026-10-23;12;10;4;1',
  'Tajikistan;Sator Android;https://a.test/;Pin-Up | Game | 20$;111111111111;cy638t;8wxg;VP11003;TJ_1;cr1;2026-10-23;13;5;2;0',
  // кабінет БЕЗ таймзони — усе це зникало мовчки
  'Tajikistan;Sator Android;https://b.test/;Pin-Up | Wheel | 20$;222222222222;cy638t;8wxg;SMW11003;TJ_2;cr2;2026-10-23;14;30;20;3',
  // у цього джерела в сабі акаунта лежить гео, а не кабінет
  'Tajikistan;Trident-media.agency;;Pinco TJ | Wheel | 50$;TJ;;;333333333333;;CR11012;2026-10-23;15;7;1;0',
  // заглушка замість номера кабінету
  'Kyrgyzstan;PWA Partners;https://c.test/;Boostwin KG | Wheel | PWA;0000;MPlay_KG_10708-ex8g_22/10_001;1;Instagram_Reels;;KG_1;2026-10-23;01;4;2;0',
  // підсумковий рядок самої вигрузки
  ';;;;;;;;;;;;56;29;4'
].join('\n');

const setup = () => page.evaluate(ktCsv => {
  mappingDB = { timezones: { '111111111111': 3 }, agencies: {}, funnels: {},
                funnelApp: {}, providers: {} };
  knownOffers = ['Pin-Up', 'Pinco', 'Boostwin'];
  globalOffersCache = []; datasetToImport = []; creativesToImport = [];
  trafficMode = 'auto'; keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(ktCsv);
  const sk = keitaroAgg.ktSkips || {};
  const plain = b => Object.fromEntries(Object.entries(sk[b] || {}).map(([k, v]) =>
    [k, { rows: v.rows, i: v.installs, r: v.regs, d: v.deps, src: v.src }]));
  return { noTz: plain('noTz'), noAcc: plain('noAcc'), noDay: plain('noDay'),
           total: plain('total'), unlinked: [...keitaroAgg.unlinked],
           kept: keitaroAgg.byDaily['2026-10-23|111111111111'] || null };
}, KT);

const kt = await setup();

/* ─────────── 1. ВІДКИНУТЕ РАХУЄТЬСЯ ─────────── */
ok('кабінет із таймзоною доїхав цілим',
  kt.kept && kt.kept.installs === 15 && kt.kept.regs === 6 && kt.kept.deps === 1, kt.kept);

ok('кабінет без таймзони потрапив у відкинуті', !!kt.noTz['222222222222'], Object.keys(kt.noTz));
ok('і разом із ним пораховані його цифри, а не лише назва',
  kt.noTz['222222222222'].i === 30 && kt.noTz['222222222222'].r === 20
  && kt.noTz['222222222222'].d === 3, kt.noTz['222222222222']);
ok('видно, з якого джерела прийшли відкинуті рядки',
  kt.noTz['222222222222'].src.join() === 'Sator Android', kt.noTz['222222222222'].src);

ok('значення, що не схоже на кабінет, теж пораховане окремо',
  kt.noTz['TJ'] && kt.noTz['TJ'].rows === 1 && kt.noTz['TJ'].i === 7, kt.noTz['TJ']);
ok('і заглушка 0000 теж', kt.noTz['0000'] && kt.noTz['0000'].i === 4, kt.noTz['0000']);

/* Підсумковий рядок вигрузки — не втрата. Доти він лягав би серед
   втрачених із сумою всього файлу і лякав би дарма. */
ok('підсумковий рядок файлу лежить окремо від втрат',
  kt.total['—'] && kt.total['—'].i === 56 && kt.total['—'].r === 29 && kt.total['—'].d === 4, kt.total);
ok('і не рахується як відкинутий акаунт',
  !Object.keys(kt.noAcc).length && !Object.keys(kt.noDay).length, [kt.noAcc, kt.noDay]);

/* ─────────── 2. РЯДОК, ДО ЯКОГО KEITARO НЕ ДОЇХАВ ─────────── */
/* Звіт FB: два кабінети. У першого в Keitaro дані є, у другого — ні
   (саме його відкинули через таймзону). */
const FB = [
  '"Account ID","Campaign name","Ad name",Platform,Placement,Currency,"Amount spent (USD)","Link clicks",Leads,"Registrations completed","App installs",Purchases,"Reporting starts","Reporting ends"',
  '111111111111,cy638t_8wxg_cr1_VP11003_111111111111_TJ,AD_1,instagram,"Instagram Reels",USD,20.00,10,,1,2,0,2026-10-23,2026-10-23',
  '222222222222,cy638t_8wxg_cr2_SMW11003_222222222222_TJ,AD_2,instagram,Feed,USD,30.00,12,,0,0,0,2026-10-23,2026-10-23'
].join('\r\n');

const prev = await page.evaluate(async fbCsv => {
  const lines = parseCsvLines(fbCsv);
  const map = mapColumns(lines[0].map(h => h.toLowerCase()));
  map.cur = lines[0].length;
  const combined = [lines[0].concat('cur')].concat(lines.slice(1).map(r => r.concat('USD')));
  await processCampaignData(map, combined);
  const html = document.getElementById('dataset-preview-body').innerHTML;
  return {
    rows: (datasetToImport || []).map(r => ({ acc: r.acc, i: r.installs, r: r.regs,
      d: r.deps, offer: r.offer || '', noKt: !!r._noKt })),
    badges: (html.match(/class="ds-nokt"/g) || []).length,
    report: (document.getElementById('kt-merge-report')?.textContent || '').replace(/\s+/g, ' ')
  };
}, FB);

const byAcc = Object.fromEntries(prev.rows.map(r => [r.acc, r]));
ok('рядок, до якого Keitaro доїхав, прапорця не має',
  byAcc['111111111111'] && byAcc['111111111111'].noKt === false, byAcc['111111111111']);
ok('його цифри — з Keitaro, а не з FB',
  byAcc['111111111111'].i === 15 && byAcc['111111111111'].r === 6
  && byAcc['111111111111'].d === 1, byAcc['111111111111']);

ok('рядок без даних Keitaro себе називає',
  byAcc['222222222222'] && byAcc['222222222222'].noKt === true, byAcc['222222222222']);
ok('і прапорець справді в розмітці, а не лише в даних', prev.badges === 1, prev.badges);
ok('прапорець один — лише на тому рядку, якого це стосується',
  prev.rows.filter(r => r.noKt).length === 1, prev.rows);

/* Цифри такого рядка лишаються фейсбучними — ми їх не вигадуємо і не
   обнуляємо, просто чесно кажемо, звідки вони. */
ok('цифри рядка без Keitaro лишились фейсбучними',
  byAcc['222222222222'].i === 0 && byAcc['222222222222'].r === 0, byAcc['222222222222']);

/* ─────────── 3. ЗВІТ НА ЕКРАНІ ─────────── */
ok('звіт називає, скільки рядків відкинуто', /Skipped — no timezone linked/.test(prev.report), prev.report.slice(0, 200));
ok('і скільки конверсій поїхало разом із ними',
  /30 inst \/ 20 regs \/ 3 deps/.test(prev.report), prev.report.slice(0, 400));
ok('підказує, що значення не схоже на номер кабінету',
  /Does not look like an account number/.test(prev.report));
ok('підсумковий рядок вигрузки показано окремо і спокійно',
  /totals row is not imported: 56/.test(prev.report), prev.report.slice(-260));
ok('і він не підписаний як втрата',
  !/56 inst \/ 29 regs \/ 4 deps did not reach/.test(prev.report));

/* ─────────── 4. НІЧОГО НЕ ВІДКИНУТО — ЗВІТУ ПРО ВТРАТИ НЕМА ─────────── */
/* Вигрузка, де кожен кабінет прив'язаний: жодного блоку про втрати
   бути не повинно, інакше попередження стане шумом, який гортають. */
const CLEAN = [H,
  'Tajikistan;Sator Android;https://a.test/;Pin-Up | Game | 20$;111111111111;cy638t;8wxg;VP11003;TJ_1;cr1;2026-10-23;12;10;4;1',
  ';;;;;;;;;;;;10;4;1'
].join('\n');

const clean = await page.evaluate(csv => {
  mappingDB.timezones = { '111111111111': 3 };
  parseKeitaro(csv);
  const sk = keitaroAgg.ktSkips;
  return { noTz: Object.keys(sk.noTz).length, noAcc: Object.keys(sk.noAcc).length,
           noDay: Object.keys(sk.noDay).length, total: Object.keys(sk.total).length };
}, CLEAN);
ok('усе доїхало — втрат не рахується жодних',
  clean.noTz === 0 && clean.noAcc === 0 && clean.noDay === 0, clean);
ok('а підсумковий рядок усе одно впізнано', clean.total === 1, clean);

await done(browser, srv, errs);
