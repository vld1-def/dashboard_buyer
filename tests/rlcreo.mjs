/* ═══════════ ПРАВИЛО ПІД КРЕАТИВ ═══════════

   «правило створене окремо під якийсь креатив, але так щоб інше
   правило не вимикало цей креатив, якщо в іншому правилі воно
   включене». Конкретне перебиває загальне:
     1. правило з полем Creatives діє лише на оголошення цих креативів;
     2. загальні правила такі оголошення пропускають — і адсети чи
        кампанії, під якими вони крутяться, теж;
     3. «покрито» — з усіма фільтрами власного правила (гео, кабінети);
     4. назва звіряється цілим шматком, без регістру, «-» = «_»,
        без розширення; KG_JS_674_1 не чіпає KG_JS_674_10;
     5. клієнт і сервер звіряють однаково. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const TS = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');
const RL = fs.readFileSync('build/rules.js', 'utf8');
const LEG = fs.readFileSync('index-legacy.html', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

/* ── сервер: звіряння назви ── */
const a = TS.indexOf('const crKey = '), b = TS.indexOf('\n}\n', TS.indexOf('function crHit')) + 3;
const js = TS.slice(a, b).replace(/\(v: unknown\)/, '(v)').replace(/\(crs: string\[\], name: unknown\): boolean/, '(crs, name)');
const S = new Function(js + '\nreturn { crKey, crHit };')();
const cases = [
  ['KG_JS_674', ['kg_js_674'], true, 'та сама назва'],
  ['kg-js-674.mp4', ['kg_js_674'], true, 'регістр, дефіс і розширення не важать'],
  ['KG_JS_674 copy', ['kg_js_674'], true, 'хвіст після пробілу — той самий креатив'],
  ['KG_JS_674_10', ['kg_js_674_1'], false, '_1 не чіпає _10'],
  ['XKG_JS_674', ['kg_js_674'], false, 'лише цілим шматком'],
  ['KG_JS_700', ['kg_js_674'], false, 'інший креатив'],
  ['KG_JS_674', [], false, 'порожній список — не покриває нічого']
];
cases.forEach(([n, crs, want, w]) => ok('сервер: ' + w, S.crHit(crs, n) === want, { n, crs }));
ok('ключ: KG-JS-674.MOV → kg_js_674', S.crKey(' KG-JS-674.MOV ') === 'kg_js_674');

/* ── клієнт: те саме звіряння ── */
const c1 = RL.indexOf('const rlCrKey'), c2 = RL.indexOf('const rlOwn');
const C = new Function(RL.slice(c1, c2) + '\nreturn { rlCrKey, rlCrHit };')();
ok('клієнт звіряє так само, як сервер', cases.every(([n, crs, want]) => C.rlCrHit(crs, n) === want)
  && C.rlCrHit(['KG-JS-674'], 'kg_js_674'));

/* ── сервер: хто кого пропускає ── */
ok('поле crs читається з правила й нормалізується',
  /crs: \[\.\.\.new Set\(\(Array\.isArray\(x\.crs\) \? x\.crs : \[\]\)\.map\(crKey\)\.filter\(Boolean\)\)\]/.test(TS));
ok('своє правило — лише там, де крутиться його креатив',
  /if \(crs\.length\) return under\.some\(a => crHit\(crs, a\.name\)\);/.test(TS));
ok('загальне пропускає все, що стереже власне правило',
  /return !own\.length \|\| !under\.some\(coveredByOwn\);/.test(TS));
ok('«стереже» — з усіма фільтрами власного правила',
  /const coveredByOwn = \(a: Ent\) => own\.some\(o => scopeOk\(o, a\) && crHit\(o\.crs, a\.name\)\);/.test(TS));
ok('адсет і кампанія — через оголошення під ними',
  /\(level === 'adset' \? a\.adset : a\.campaign\) === e\.id/.test(TS));
ok('власні правила — лише ті, що діють у цьому кабінеті', /const own = mine\.filter\(x => \(x\.crs \|\| \[\]\)\.length\);/.test(TS));

/* ── інтерфейс ── */
ok('у формі є поле Creatives з чипами й підказками', /id="rl-f-crs"/.test(RL) && /<datalist id="rl-cr-all">/.test(RL)
  && /onkeydown="rlCrKeyDown\(event\)"/.test(RL));
ok('недописане в рядку теж зберігається', /querySelector\('#rl-f-crs input'\)\?\.value/.test(RL));
ok('на картці — позначка свого правила, а креативи — у підказці', /🎨 ' \+ r\.crs\.length/.test(RL)
  && /Only these creatives/.test(RL) && /' · creatives <b>'/.test(RL));
ok('на загальному — скільки креативів він пропускає', /with their own rule<\/span>/.test(RL));
ok('у креативі — значок 🛡 зі своїм правилом', /id="cr-rule-badge"/.test(LEG) && /crRuleBadge\(currentCreativeID\);/.test(LEG)
  && /onclick="rlOpenRule\(\$\{idx\[0\]\}\)"/.test(LEG));
ok('значок не заважає панелі правил завантажитись повністю', /if \(!rlLoaded\) rlRules = /.test(RL));
ok('і це доїхало в зібраний index.html', /function rlCrHit\(crs, name\)/.test(OUT) && /async function crRuleBadge\(cid\)/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
