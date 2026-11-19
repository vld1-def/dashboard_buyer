/* ═══════════ RULES: «NEVER CHECK» ═══════════

   «додав би в rules, які каби не перевіряти». Один список на всі
   правила власника: такі кабінети жодне правило не чіпає.
     1. список зберігається поруч із правилами: { rules, skip };
     2. fb-rules читає його по власнику й пропускає кабінет до правил;
     3. у панелі — чипи, додавання за ID або назвою, ✕ прибирає;
     4. на картці правила видно, що частину кабінетів виключено. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const RL = fs.readFileSync('build/rules.js', 'utf8');
const HT = fs.readFileSync('build/rules.html', 'utf8');
const TS = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

ok('зберігається разом із правилами', /JSON\.stringify\(\{ rules: rlRules, skip: rlSkip \}\)/.test(RL));
ok('читається при відкритті панелі', /rlSkip = Array\.isArray\(v\.skip\)/.test(RL));
ok('блок «Never check» у панелі', /<div id="rl-skip" class="rl-skip"><\/div>/.test(HT) && /Never check<\/span>/.test(RL));
ok('додати можна й за назвою кабінета', /String\(c\.name \|\| ''\)\.toLowerCase\(\) === raw\.toLowerCase\(\)/.test(RL));
ok('✕ прибирає й зберігає', /window\.rlSkipDrop = async function \(id\) \{\n  rlSkip = rlSkip\.filter\(x => x !== id\);\n  await rlSave\(\);/.test(RL));
ok('на картці правила видно виняток', /' except ' \+ rlSkip\.length \+ ' in Never check'/.test(RL));

ok('сервер збирає список по власнику', /if \(ruleOwner && Array\.isArray\(v\.skip\)\)/.test(TS) && /skip: Map<string, Set<string>>/.test(TS));
ok('і пропускає кабінет до правил', /if \(skip\.get\(tokenOwner\)\?\.has\(account\)\) \{ skippedCabs\+\+; continue; \}/.test(TS));
ok('і каже, скільки пропустив', /never_check: skippedCabs,/.test(TS));
/* Довгі назви правил і рядків журналу не роздувають панель за край
   екрана: min-width: 0 по ланцюжку flex-елементів. */
ok('панель не ширша за своє місце', /#rules-panel > \.rl-wrap \{ width: 100%; box-sizing: border-box; overflow: hidden; \}/.test(fs.readFileSync('build/design.css', 'utf8')));
ok('і це доїхало в зібраний index.html', /window\.rlSkipAdd = async function/.test(OUT) && /\.rl-skip-chip \{/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
