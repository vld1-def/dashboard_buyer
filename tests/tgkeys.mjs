/* ═══════════ КЛАВІАТУРА БОТА В КОЖНОМУ ПОВІДОМЛЕННІ ═══════════

   «чомусь кнопки в тг пропадають, постійно треба запускати /start».
   Клавіатуру ставили лише відповіді бота; сповіщення інших функцій ішли
   без неї. Тепер кожна функція, що пише в особистий чат, кладе ту саму
   клавіатуру — і стенд звіряє підписи з ботом до кодової точки: бот
   розпізнає кнопку за текстом, і зайвий невидимий символ зробив би її
   мовчазною. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x) : '')); } };

const BOT = fs.readFileSync('supabase/functions/telegram-bot/index.ts', 'utf8');
const pick = n => new Function('return ' + (BOT.match(new RegExp('const ' + n + " = ('[^']*');")) || [])[1])();
const want = [[pick('B_DAY'), pick('B_SPEND')], [pick('B_CABS'), pick('B_DOM')]];
ok('кнопки бота прочитано', want.flat().every(Boolean), want);
const botRows = (BOT.match(/keyboard: \[\[\{ text: (B_\w+) \}, \{ text: (B_\w+) \}\],\s*\[\{ text: (B_\w+) \}, \{ text: (B_\w+) \}\]\]/) || []).slice(1);
ok('у бота той самий порядок кнопок', botRows.join() === 'B_DAY,B_SPEND,B_CABS,B_DOM', botRows);

for (const fn of ['fb-rules', 'fb-comments', 'check-domains', 'fb-sync', 'fb-limit', 'tg-news']) {
  const src = fs.readFileSync('supabase/functions/' + fn + '/index.ts', 'utf8');
  const def = (src.match(/const TG_KEYS = \{[\s\S]*?\n\};\nconst tgKeysFor = [^\n]*/) || [''])[0];
  ok(fn + ': клавіатура є', !!def);
  if (!def) continue;
  const { TG_KEYS, tgKeysFor } = new Function(stripTypeScriptTypes(def) + '\nreturn { TG_KEYS, tgKeysFor };')();
  const got = TG_KEYS.keyboard.map(r => r.map(b => b.text));
  ok(fn + ': підписи збігаються з ботом до символу', JSON.stringify(got) === JSON.stringify(want), got);
  ok(fn + ': розгорнута й не згортається', TG_KEYS.is_persistent === true && TG_KEYS.resize_keyboard === true);
  ok(fn + ': особистий чат — з кнопками', !!tgKeysFor(12345).reply_markup && !!tgKeysFor('12345').reply_markup);
  ok(fn + ': група — без кнопок', !tgKeysFor(-100123).reply_markup && !tgKeysFor('').reply_markup);
  ok(fn + ': кнопки справді йдуть у sendMessage', /disable_web_page_preview: true, \.\.\.tgKeysFor\(/.test(src));
}

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
