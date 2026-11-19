/* ═══════════ ВІДЖЕТ НА ТЕЛЕФОН (SCRIPTABLE) ═══════════

   «маленький віджет, щоб кожні 2–3 години підтягувало спенд» і «щоб
   можна було копіювати код віджета в інтеграціях».
     1. функція widget впускає лише за особистим ключем, у базі — хеш;
     2. віддає тільки підсумок: спенд сьогодні/вчора в $, кабінети, синк;
     3. день — у поясі кабінета, як «Today» у FB LIVE;
     4. у Settings → Integrations → Widget: створити, скопіювати код,
        вимкнути; код — валідний скрипт Scriptable з оновленням ~2 год. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const FN = fs.readFileSync('supabase/functions/widget/index.ts', 'utf8');
const CFG = fs.readFileSync('supabase/config.toml', 'utf8');
const TOK = fs.readFileSync('build/fbtok.js', 'utf8');
const SET = fs.readFileSync('build/settings.html', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

ok('вхід лише за ключем, звіряємо хеш', /searchParams\.get\('k'\)/.test(FN) && /key=eq\.widget_key&value=eq\.'\s*\+ await sha256\(key\)/.test(FN));
ok('без ключа — 401', /'no widget key' \}, 401/.test(FN) && /'unknown or revoked widget key' \}, 401/.test(FN));
ok('віддає лише підсумок', /spend: usd\(sum\.today\), yesterday: usd\(sum\.yday\), cabinets: spending\.size,/.test(FN)
  && !/account_id: /.test(FN.slice(FN.indexOf('return reply({\n      spend'))));
ok('день — у поясі кабінета', /dayIn\(tz\), yday = dayIn\(tz, -1\)/.test(FN));
ok('сума в доларах, курс тієї ж служби', /api\.frankfurter\.app/.test(FN) && /t \+= v \/ r/.test(FN));
ok('функція без JWT — у неї свій ключ', /\[functions\.widget\]\nverify_jwt = false/.test(CFG));

ok('вкладка Widget в Integrations', /id="isub-widget"/.test(SET) && /id="isub-pane-widget"/.test(SET)
  && /const ISUB = \['fb', 'tg', 'drive', 'widget'\];/.test(TOK));
ok('кнопки: створити, скопіювати, вимкнути', /onclick="wgCreate\(\)"/.test(SET) && /onclick="wgCopy\(\)"/.test(SET) && /onclick="wgRevoke\(\)"/.test(SET));
ok('у базу — лише SHA-256 ключа', /setTeamSetting\('widget_key', await wgSha\(key\)\)/.test(TOK));
ok('новий ключ — випадкові 32 байти', /crypto\.getRandomValues\(new Uint8Array\(32\)\)/.test(TOK));

// Код віджета — валідний JS і оновлюється раз на ~2 години.
const a = TOK.indexOf('function wgCode(key) {'), b = TOK.indexOf('\nwindow.wgPaint');
const code = new Function('SUPABASE_URL', 'location', TOK.slice(a, b) + '\nreturn wgCode("ab".repeat(32));')(
  'https://x.supabase.co', { origin: 'https://site', pathname: '/' });
let parses = true;
try { new Function('(async () => {' + code + '})'); } catch (e) { parses = String(e); }
ok('код віджета — валідний скрипт', parses === true, parses);
ok('ключ і адреса функції — у коді', /const API = "https:\/\/x\.supabase\.co\/functions\/v1\/widget\?k=(ab){32}"/.test(code));
ok('оновлення — через 2 години після синку', /const EVERY = 2 \* 3600 \* 1000;/.test(code)
  && /w\.refreshAfterDate = new Date\(Math\.max\(Date\.now\(\) \+ 60000, next\)\)/.test(code));
/* «коли я натискаю Sync now — від цього моменту рахувати 2 години для
   віджета». Наступне отримання — синк + 2 години; не було нового
   синку — ще раз через 2 години, а не щохвилини. */
ok('віджет тягне в момент «синк + 2 години»', /const due = !cache \|\| !cache\.next \|\| Date\.now\(\) >= cache\.next;/.test(code)
  && /const next = synced \+ EVERY > Date\.now\(\) \+ 60000 \? synced \+ EVERY : Date\.now\(\) \+ EVERY;/.test(code));
ok('ручний запуск у Scriptable тягне завжди', /if \(manual \|\| due\)/.test(code) && /const manual = !config\.runsInWidget;/.test(code));
ok('спенд по центру віджета', /row\.addSpacer\(\);\n  const t = row\.addText\(text\);/.test(code)
  && /center\(money\(d\.spend\)/.test(code));
ok('тап відкриває FB LIVE', /const OPEN = "https:\/\/site\/#\/cabinets"/.test(code) && /w\.url = OPEN/.test(code));
ok('і це доїхало в зібраний index.html', /window\.wgCreate = async function/.test(OUT) && /id="isub-pane-widget"/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
