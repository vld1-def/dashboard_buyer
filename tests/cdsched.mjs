/* ═══════════ «SCHEDULED» У КАБІНЕТІ ═══════════

   «статуси In review і також schedule чому їх немає в компаніях?
   в мене зараз такі статуси в фб, а в срм просто active пише».

   Facebook не має effective_status «Scheduled»: адсет із датою старту
   в майбутньому каже ACTIVE. Тепер fb-sync тягне start_time/end_time
   адсета, а дерево кабінета порівнює з поточним часом. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const FN = fs.readFileSync('supabase/functions/fb-sync/index.ts', 'utf8');
const CD = fs.readFileSync('build/cabdrill.js', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');
const SQL = fs.readFileSync('FB_ADSET_SCHEDULE.sql', 'utf8');

/* ── синк ── */
ok('адсет питається разом зі start_time і end_time',
  /adset\{name,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,/.test(FN));
ok('у знімок пишуться обидві дати', /adset_start_time: a\.adset_start \|\| null,/.test(FN)
  && /adset_end_time: a\.adset_end \|\| null,/.test(FN));
ok('база без колонок — знімок пишеться без них', /const SNAP_TIME_COLS = \['adset_start_time', 'adset_end_time'\];/.test(FN)
  && /\[SNAP_PIC_COLS, SNAP_TIME_COLS\]\.find/.test(FN));
ok('SQL додає колонки повторно-безпечно', /add column if not exists adset_start_time timestamptz/.test(SQL)
  && /add column if not exists adset_end_time\s+timestamptz/.test(SQL));

/* ── сторінка ── */
ok('новий ярус у запиті кабінета', /const TIERS = \[CD_CORE, CD_NEW, CD_DOM, CD_SCHED\];/.test(CD));
ok('брак яруса дат не вмикає «нема доменів»', /if \(drop >= 2\) cdNoDom = 'sql';/.test(CD));
ok('стан SCHEDULED у словнику', /k: 'SCHEDULED',\s+s: 'wait', t: 'Scheduled'/.test(CD));

const fnSrc = (CD.match(/const cdStartsLater = [^\n]*/) || [''])[0]
  + '\n' + (CD.match(/const cdWhen = [\s\S]*?\n};/) || [''])[0];
const { cdStartsLater, cdWhen } = new Function(fnSrc + '\nreturn { cdStartsLater, cdWhen };')();
const later = new Date(Date.now() + 36e5).toISOString();
const before = new Date(Date.now() - 36e5).toISOString();
ok('старт попереду — запланований', cdStartsLater({ adset_start_time: later }));
ok('старт минув або невідомий — ні', !cdStartsLater({ adset_start_time: before })
  && !cdStartsLater({}) && !cdStartsLater({ adset_start_time: null }));
ok('дата коротко: дд.мм гг:хх', /^\d\d\.\d\d \d\d:\d\d$/.test(cdWhen(later)), cdWhen(later));
ok('оголошення: ACTIVE + старт попереду → SCHEDULED',
  /state: cdStartsLater\(r\) && String\(r\.effective_status \|\| ''\)\.toUpperCase\(\) === 'ACTIVE'\s*\n\s*\? 'SCHEDULED'/.test(CD));
ok('кампанія бере найраніший старт адсетів', /if \(!c\.start \|\| st0 < c\.start\) c\.start = st0;/.test(CD));
ok('власний значок «Scheduled · дата»', /text: 'Scheduled · ' \+ cdWhen\(n\.start\)/.test(CD));
ok('і без дубля «N scheduled»', /if \(sched && st\.k === 'SCHEDULED'\) return;/.test(CD));
ok('вимкнений адсет не пишеться Scheduled', /&& \(!n\.own \|\| n\.own === 'ACTIVE'\);/.test(CD));
ok('і це доїхало в зібраний index.html', /CD_SCHED/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
