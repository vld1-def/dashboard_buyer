/* ═══════════ ЧОМУ КАБІНЕТ ІЗ ДАНИМИ В KEITARO ДАВ НУЛЬ ═══════════

   «я взяв айді кабінету і в кейтаро багато даних по кабінету а ти не
   підтягуєш нічого» — відповіді на це не було ніде, крім читання коду.

   Злиття йде ПО РЯДКАХ ФЕЙСБУКА, а ключ мусить збігтись посимвольно:
   APP → день|кабінет, PWA → день|кабінет|гео|ktid. Бік Keitaro зсуває
   день у таймзону кабінету і визначає вид трафіку по Sub ID 1, бік FB
   бере день як є і визначає вид по назві кампанії. Тож розійтись вони
   можуть рівно чотирма способами — і кожен тепер названо своїм іменем,
   із цифрами, які через це не доїхали. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8147;
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
// camp — те, що лежить у Sub ID 1: саме воно вирішує вид трафіку на боці Keitaro
const ktRow = (acc, camp, hour, ins, reg, dep) =>
  `Tajikistan;Sator Android;https://a.test/;Boostwin UZ | Wheel 2 | 28$;${acc};${camp};8wxg;VP11003;TJ_1;cr1;2026-10-23;${hour};${ins};${reg};${dep}`;

const KT = [H,
  ktRow('111111111111', 'cy638t', '12', 10, 4, 1),            // зійдеться
  ktRow('333333333333', 'cy638t', '12', 25, 9, 2),            // кабінета немає у звіті FB
  ktRow('444444444444', 'cy638t', '12', 7, 3, 1),             // є у FB, але іншим днем
  ktRow('555555555555', 'MPlay_KG_10708-ex8g_22/10_001', '12', 5, 2, 0)  // у FB той самий день, але APP
].join('\n');

const fbRow = (acc, camp, date, spend) =>
  `${acc},${camp},AD_1,instagram,Feed,USD,${spend},10,,0,0,0,${date},${date}`;
const FB = [
  '"Account ID","Campaign name","Ad name",Platform,Placement,Currency,"Amount spent (USD)","Link clicks",Leads,"Registrations completed","App installs",Purchases,"Reporting starts","Reporting ends"',
  fbRow('111111111111', 'cy638t_8wxg_cr1_VP11003_111111111111_TJ', '2026-10-23', '10.00'),
  fbRow('444444444444', 'cy638t_8wxg_cr1_VP11003_444444444444_TJ', '2026-10-21', '10.00'),
  fbRow('555555555555', 'cy638t_8wxg_cr1_VP11003_555555555555_TJ', '2026-10-23', '10.00')
].join('\r\n');

const out = await page.evaluate(async ([ktCsv, fbCsv]) => {
  mappingDB = { timezones: { '111111111111': 3, '333333333333': 3,
                             '444444444444': 3, '555555555555': 3 },
                agencies: {}, funnels: {}, funnelApp: {}, providers: {} };
  knownOffers = ['Boostwin'];
  globalOffersCache = []; datasetToImport = []; creativesToImport = [];
  trafficMode = 'auto'; keitaroMap = { ...KM_DEFAULT };
  parseKeitaro(ktCsv);
  const lines = parseCsvLines(fbCsv);
  const map = mapColumns(lines[0].map(h => h.toLowerCase()));
  map.cur = lines[0].length;
  await processCampaignData(map, [lines[0].concat('cur')].concat(lines.slice(1).map(r => r.concat('USD'))));
  const el = document.getElementById('kt-merge-report');
  const d = el.querySelector('details.rep');
  if (d) d.open = true;
  return { text: el.textContent.replace(/\s+/g, ' '),
           imported: (datasetToImport || []).map(r => ({ acc: r.acc, i: r.installs })) };
}, [KT, FB]);

const txt = out.text;

/* Кабінет, що зійшовся, у списку «не доїхало» бути не повинен. */
ok('кабінет, який зійшовся, цифри отримав',
  out.imported.some(r => r.acc === '111111111111' && r.i === 10), out.imported);
ok('і в списку «не знайшло рядка FB» його немає',
  !new RegExp('111111111111[^]{0,80}no rows in the FB report').test(txt), txt.slice(0, 200));

/* ─────────── чотири причини, кожна своїм іменем ─────────── */
ok('кабінета немає у звіті FB — так і сказано',
  new RegExp('333333333333[^]{0,140}has no rows in the FB report at all').test(txt), txt);
ok('день розійшовся — названо і день, що є у FB',
  new RegExp('444444444444[^]{0,160}the day differs').test(txt)
  && /2026-10-21/.test(txt), txt);
ok('і сказано, що це зсув таймзони', /timezone shift/.test(txt));
ok('різний вид трафіку — сказано, хто як читає',
  new RegExp('555555555555[^]{0,200}Keitaro reads these rows as PWA, FB as APP').test(txt), txt);
ok('і що такі ключі не зійдуться ніколи',
  /different shape and can never meet/.test(txt));

/* Цифри — головне: скільки саме не доїхало. */
ok('у підсумку стоїть, скільки конверсій не імпортовано',
  /37 inst \/ 14 regs \/ 3 deps are not imported/.test(txt), txt.slice(0, 400));
ok('і скільки груп', /3 Keitaro group\(s\) found no row/.test(txt), txt.slice(0, 300));
ok('кожна група показує свої цифри',
  new RegExp('333333333333[^]{0,80}25 inst / 9 regs / 2 deps').test(txt), txt);
ok('пояснено, чому так узагалі буває',
  /The merge walks FB rows/.test(txt));

/* Коли все зійшлось — блоку немає, щоб не був шумом. */
ok('усе зійшлось — блоку про незнайдене немає', await page.evaluate(async ([ktCsv, fbCsv]) => {
  mappingDB.timezones = { '111111111111': 3 };
  parseKeitaro(ktCsv);
  const lines = parseCsvLines(fbCsv);
  const map = mapColumns(lines[0].map(h => h.toLowerCase()));
  map.cur = lines[0].length;
  await processCampaignData(map, [lines[0].concat('cur')].concat(lines.slice(1).map(r => r.concat('USD'))));
  return !/found no row in the FB report/.test(document.getElementById('kt-merge-report').textContent);
}, [[H, ktRow('111111111111', 'cy638t', '12', 10, 4, 1)].join('\n'),
    ['"Account ID","Campaign name","Ad name",Platform,Placement,Currency,"Amount spent (USD)","Link clicks",Leads,"Registrations completed","App installs",Purchases,"Reporting starts","Reporting ends"',
     fbRow('111111111111', 'cy638t_8wxg_cr1_VP11003_111111111111_TJ', '2026-10-23', '10.00')].join('\r\n')]));

await done(browser, srv, errs);
