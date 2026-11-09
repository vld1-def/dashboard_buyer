/* ═══════════ КОМЕНТАРІ: ПЕРЕКЛАД, АРХІВ; БОТ: «ОЧІКУЙТЕ» ═══════════

   • «перекладати коментарі на укр … через аішки» — Telegram і Pages;
   • «тільки живі каби, які не в архіві, перевіряти на коментарі»;
   • «щоб одразу повідомлення появлялось типу Очікуйте». */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 400) : '')); } };

const CM = fs.readFileSync('supabase/functions/fb-comments/index.ts', 'utf8');
const grab = (re, w) => { const m = CM.match(re); ok('є ' + w, !!m); return m ? m[0] : ''; };
const src = ['type Json = any; type Found = any;',
  grab(/const TR_MODEL = [^\n]*/, 'TR_MODEL'), grab(/const TR_BATCH = [^\n]*/, 'TR_BATCH'),
  grab(/const TR_MAX_CHARS = [^\n]*/, 'TR_MAX_CHARS'),
  grab(/async function translateUk[\s\S]*?\n}\n/, 'translateUk'),
  grab(/const TG_LIMIT = [^\n]*/, 'TG_LIMIT'), grab(/const TG_MAX = [^\n]*/, 'TG_MAX'),
  grab(/function tgText[\s\S]*?\n}\n/, 'tgText')].join('\n');

const ENV = { ANTHROPIC_API_KEY: 'k' };
globalThis.Deno = { env: { get: k => ENV[k] } };
let sent = [], answer = null;
globalThis.fetch = async (url, o) => {
  sent.push({ url, headers: o.headers, body: JSON.parse(o.body) });
  return answer();
};
const { translateUk, tgText } = new Function(stripTypeScriptTypes(src) + '\nreturn { translateUk, tgText };')();

/* ── запит ── */
answer = () => ({ ok: true, json: async () => ({ stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify({ t: ['Скільки це коштує?', ''] }) }] }) });
const r = await translateUk(['Бул ондой канча төлөйт?', 'Дякую, все прийшло']);
const q = sent[0];
ok('іде в Messages API', q.url === 'https://api.anthropic.com/v1/messages', q.url);
ok('ключ і версія в заголовках', q.headers['x-api-key'] === 'k' && !!q.headers['anthropic-version']);
ok('модель та сама, що в функції ai', q.body.model === 'claude-haiku-5-5', q.body.model);
ok('строгий JSON за схемою', q.body.output_config?.format?.type === 'json_schema'
  && q.body.output_config.format.schema.required.includes('t'), q.body.output_config);
ok('легке зусилля — це переклад, не міркування', q.body.output_config.effort === 'low');
ok('коментарі йдуть одним масивом', JSON.parse(q.body.messages[0].content).length === 2);
ok('переклад на своєму місці', r[0] === 'Скільки це коштує?' && r[1] === '', r);

/* ── пачки ── */
sent = [];
answer = () => ({ ok: true, json: async () => {
  const n = JSON.parse(sent[sent.length - 1].body.messages[0].content).length;
  return { content: [{ type: 'text', text: JSON.stringify({ t: Array(n).fill('x') }) }] }; } });
const many = await translateUk(Array(120).fill('hi'));
ok('120 коментарів — три запити по ≤50', sent.length === 3 && many.length === 120 && many.every(x => x === 'x'), sent.length);

/* ── збої ── */
answer = () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{"t":["a"]}' }] }) });
const bad = await translateUk(['a', 'b']);
ok('інша кількість у відповіді — без перекладу, а не зсув', bad.every(x => x === ''), bad);
answer = () => ({ ok: false, json: async () => ({ error: { message: 'overloaded' } }) });
ok('відмова API — без перекладу, без падіння', (await translateUk(['a'])).every(x => x === ''));
answer = () => ({ ok: true, json: async () => ({ stop_reason: 'refusal', content: [] }) });
ok('refusal — без перекладу', (await translateUk(['a'])).every(x => x === ''));
delete ENV.ANTHROPIC_API_KEY; sent = [];
ok('немає ключа — і не питаємо', (await translateUk(['a'])).every(x => x === '') && sent.length === 0);

/* ── у Telegram ── */
const t = tgText([{ owner: 'u', cab: '🌐 4175 › 🏦 1', ad: 'KG_JS_633', from: 'Айбек',
  text: 'Бул ондой канча төлөйт?', hidden: true, byUs: true, uk: 'Скільки це коштує?' },
  { owner: 'u', cab: 'c', ad: 'a', from: 'Оля', text: 'Дякую', hidden: false, byUs: false }]);
ok('переклад під оригіналом', /Айбек: Бул ондой канча төлөйт\?\n🇺🇦 Скільки це коштує\?/.test(t), t);
ok('український коментар — без зайвого рядка', !/Дякую\n🇺🇦/.test(t), t);
ok('перекладаємо перед відправкою', /const uk = await translateUk\(shown\.map\(f => f\.text\)\);/.test(CM));

/* ── Pages ── */
ok('дія translate лише для залогіненого', /if \(action === 'translate'\) \{[\s\S]{0,200}whoAmI\(base, anon, a\)/.test(CM));
const PG = fs.readFileSync('build/pages.js', 'utf8');
ok('кнопка Translate у вікні Pages', /onclick="pgTranslate\(\)"/.test(PG));
ok('переклад під коментарем', /pgUk\[c\.id\] \? `<span class="fcm-uk">/.test(PG));
ok('уже перекладене не просимо вдруге', /!\(c\.id in pgUk\)/.test(PG));

/* ── архів ── */
ok('сканер виключає архівні', /'&account_id=not\.in\.\(' \+ \[\.\.\.arch\]\.join\(','\) \+ '\)'/.test(CM));
ok('Pages: рекламні пости архівних не шукаємо', /if \(!act \|\| arch\.has\(act\)\) continue;/.test(CM));
const archSrc = grab(/async function archivedIds[\s\S]*?\n}\n/, 'archivedIds');
const { archivedIds } = new Function('pgGet', stripTypeScriptTypes('type Json = any;\n' + archSrc) + '\nreturn { archivedIds };')(
  async () => [{ account_id: 'act_111', fb_account_id: null }, { account_id: '222', fb_account_id: '333' }]);
const ids = await archivedIds('b', {});
ok('архівні номери — лише цифри, з обох полів', ['111', '222', '333'].every(x => ids.has(x)) && ids.size === 3, [...ids]);
const { archivedIds: failing } = new Function('pgGet', stripTypeScriptTypes('type Json = any;\n' + archSrc) + '\nreturn { archivedIds };')(
  async () => { throw new Error('x'); });
ok('не прочитали архів — нікого не виключаємо', (await failing('b', {})).size === 0);

/* ── бот ── */
const BOT = fs.readFileSync('supabase/functions/telegram-bot/index.ts', 'utf8');
ok('«Очікуйте» — до оновлення кабінетів', /const waitId = await sayWait\(token, chat\);\n\s*const f = await freshen/.test(BOT));
ok('і прибирається після Stat. Day', /cardDay\(base, hdr, link\.user_id, f\.note\), KEYS\);\n\s*await dropMsg\(token, chat, waitId\);/.test(BOT));
ok('і після решти звітів', /await reply\(token, chat, text, KEYS\);\n\s*await dropMsg\(token, chat, waitId\);/.test(BOT));
ok('текст «Очікуйте, отримую інформацію…»', /Очікуйте, отримую інформацію/.test(BOT));
ok('тихо, без сповіщення', /disable_notification: true/.test(BOT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
