/* ═══════════ fb-sync: ТОКЕНИ ПАРАЛЕЛЬНО, МЕРТВІ — ПОВЗ КНОПКУ ═══════════

   «дуже довго він підтягує інфу» — 9 токенів ішли по черзі (~75 с).
   Тепер по TOKEN_PAR разом; недійсні (error/expired) кнопка пропускає. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const S = fs.readFileSync('supabase/functions/fb-sync/index.ts', 'utf8');
let parsed = true;
try { stripTypeScriptTypes(S); } catch (e) { parsed = false; console.log(e.message); }
ok('файл розбирається', parsed);
ok('по 3 токени одночасно', /const TOKEN_PAR = 3;/.test(S));
ok('мертві стани — error і expired', /const DEAD_TOKEN = new Set\(\['error', 'expired'\]\);/.test(S));
ok('пропуск лише на кнопці і не для явно вибраного токена',
  /const deadSkip = \(!cron && !onlyToken\)/.test(S));
ok('пропущені рахуються обійденими, а не «не дійшли»', /for \(const t of deadSkip\) walked\.add\(t\.id\);/.test(S));
ok('робітники ділять одну чергу', /const t = live\[next\+\+\];/.test(S)
  && /Promise\.all\(Array\.from\(\{ length: Math\.min\(TOKEN_PAR, live\.length\) \}, worker\)\)/.test(S));
ok('ліміт FB зупиняє взяття нових токенів', /while \(next < live\.length && !throttled && Date\.now\(\) <= deadline\)/.test(S));
ok('у відповіді видно пропущені', /dead_skipped: deadSkip\.map\(t => t\.label\),/.test(S));
ok('старого послідовного циклу немає', !/for \(const t of tokens\) \{\n\s*if \(Date\.now\(\) > deadline\) break;\n\s*walked\.add/.test(S));

/* Модель черги: 9 токенів по ~8 с, три робітники → ~3 «хвилі». */
const live = Array.from({ length: 9 }, (_, i) => i);
let next = 0, active = 0, peak = 0; const order = [];
const one = async t => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 20)); order.push(t); active--; };
const worker = async () => { while (next < live.length) { const t = live[next++]; await one(t); } };
const t0 = Date.now();
await Promise.all(Array.from({ length: 3 }, worker));
ok('не більше 3 одночасно, усі 9 пройдені', peak === 3 && order.length === 9 && new Set(order).size === 9, { peak, order });
ok('три хвилі замість дев\'яти кроків', Date.now() - t0 < 20 * 6, Date.now() - t0);

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
