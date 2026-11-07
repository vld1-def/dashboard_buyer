/* ═══════════ ЗАБАНЕНИЙ КАБІНЕТ — НЕ ЗБІЙ ЗВ'ЯЗКУ ═══════════

   «за ніч забанились кабінети, і правила цього незнали, і постійно
   подавали запит, я так розумію вони думали що кабінети живі».

   Так і було. Список активних кабінетів правила беруть із НАШОЇ
   таблиці, а статус у ній пише fb-sync — і доки та не дійшла до
   цього токена (дедлайн 110 секунд, черга «найдавніше перевірений»),
   кабінет лишався в нас «active».

   Гірше за зайві запити було інше: БУДЬ-ЯКА відмова Graph вважалась
   «цього разу не віддав числа», і правило йшло на знімок. Тобто на
   забаненому кабінеті воно судило за цифрами, знятими ДО бану.

   Тепер на відмові питаємо стан прямо — один вузький запит, і лише
   тоді, коли вже щось пішло не так. Стенд тримає три речі:
     • словник статусів у правил і в синку — ОДИН, рядок у рядок;
     • «спитали й дізнались» (бан) і «спитати не вийшло» (збій)
       ведуть до протилежних дій;
     • порожня причина не затирає вже відому. */
import fs from 'node:fs';
import { checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');
const SYNC = fs.readFileSync('supabase/functions/fb-sync/index.ts', 'utf8');

const grab = (src, re, what) => {
  const m = src.match(re);
  ok('є ' + what, !!m);
  return m ? m[0] : '';
};

const plain = s => s
  .replace(/\(code:\s*number\)/g, '(code)')
  .replace(/\(token:\s*string,\s*account:\s*string\)/g, '(token, account)')
  .replace(/\(base:\s*string,\s*hdr:\s*Json,\s*owner:\s*string,\s*\n?\s*account:\s*string,\s*st:\s*CabState\)/g,
           '(base, hdr, owner, account, st)')
  .replace(/:\s*Promise<[^>]*>/g, '')
  .replace(/\)\s*:\s*string\s*\{/g, ') {');

/* ── 1. ОДИН СЛОВНИК НА ДВА ФАЙЛИ ──
   Звіряємо не текст, а поведінку: дві копії, що розійшлись пробілом,
   однакові, а дві, що розійшлись кодом 9, — ні. */
const wRules = new Function(
  plain(grab(FN, /function statusWord[\s\S]*?\n}/, 'statusWord у правилах'))
  + '\nreturn statusWord;')();
const wSync = new Function(
  plain(grab(SYNC, /function statusWord[\s\S]*?\n}/, 'statusWord у синку'))
  + '\nreturn statusWord;')();

const codes = [0, 1, 2, 3, 7, 8, 9, 100, 101, 5, 42, 999];
const apart = codes.filter(c => wRules(c) !== wSync(c));
ok('словник статусів у правил і в синку однаковий', apart.length === 0,
  apart.map(c => c + ': ' + wRules(c) + ' vs ' + wSync(c)));
ok('і код 2 означає бан в обох', wRules(2) === 'banned' && wSync(2) === 'banned');

/* ── 2. ПИТАЄМО СТАН: ЩО ПОВЕРТАЄ cabState ── */
const cabSrc = plain(grab(FN, /async function cabState[\s\S]*?\n}/, 'cabState'));
const mkCab = (fetchImpl) => new Function('fetch', 'GRAPH', 'statusWord',
  cabSrc + '\nreturn cabState;')(fetchImpl, 'https://graph.facebook.com/v21.0', wRules);

const resOf = (ok_, body) => ({ ok: ok_, status: ok_ ? 200 : 400,
                                json: async () => body });

const banned = await mkCab(async () => resOf(true,
  { account_status: 2, disable_reason: 'Ads integrity policy' }))('T', '123');
ok('забанений кабінет розпізнано', banned && banned.word === 'banned', banned);
ok('і причину взято', banned && /integrity/.test(banned.reason), banned);

const alive = await mkCab(async () => resOf(true, { account_status: 1 }))('T', '123');
ok('живий кабінет лишається живим', alive && alive.word === 'active', alive);

/* НАЙВАЖЛИВІШЕ В УСЬОМУ СТЕНДІ. Коли спитати не вийшло, відповідь
   мусить бути null — «не знаю», а не «мертвий». Інакше звичайний збій
   мережі позначав би кабінети забаненими. */
const noAnswer = await mkCab(async () => { throw new Error('socket hang up'); })('T', '123');
ok('коли спитати не вийшло — «не знаю», а не «мертвий»', noAnswer === null, noAnswer);
const graphErr = await mkCab(async () => resOf(false,
  { error: { message: 'Invalid OAuth access token' } }))('T', '123');
ok('помилка токена теж не робить кабінет мертвим', graphErr === null, graphErr);
/* Відповідь без account_status — теж «не знаю»: Facebook буває віддає
   порожнє тіло, і читати його як код 0 («unknown») означало б
   вимкнути кабінет через мовчання. */
const empty = await mkCab(async () => resOf(true, {}))('T', '123');
ok('відповідь без статусу — теж «не знаю»', empty === null, empty);

/* ── 3. ЩО ПИШЕМО В БАЗУ ── */
const markSrc = plain(grab(FN, /async function markDead[\s\S]*?\n}/, 'markDead'));
const callMark = async (st) => {
  let seen = null;
  const f = async (url, init) => { seen = { url, body: JSON.parse(init.body),
                                            method: init.method }; return resOf(true, {}); };
  await new Function('fetch', markSrc + '\nreturn markDead;')(f)(
    'https://db', { apikey: 'k' }, 'owner-1', '123', st);
  return seen;
};

const wrote = await callMark({ code: 2, word: 'banned', reason: 'IP review' });
ok('стан пишеться одразу, не чекаючи синхронізації',
  wrote && wrote.method === 'PATCH', wrote);
/* Ключ той самий, що в upsert у fb-sync (created_by,account_id):
   інакше правила писали б у інший рядок, ніж читає решта. */
ok('ключ той самий, що в синку: created_by + account_id',
  wrote && /created_by=eq\.owner-1/.test(wrote.url)
        && /account_id=eq\.123/.test(wrote.url), wrote && wrote.url);
ok('у синку ключ і справді такий',
  /pgUpsert\(base, hdr, 'fb_accounts', 'created_by,account_id'/.test(SYNC));
ok('пишемо слово й код статусу',
  wrote && wrote.body.status === 'banned' && wrote.body.status_code === 2, wrote);
ok('і причину', wrote && wrote.body.disable_reason === 'IP review', wrote);

/* Порожня причина не затирає ту, що вже знали: Facebook не завжди її
   віддає, а відома причина лишається правдою. */
const noReason = await callMark({ code: 3, word: 'unsettled', reason: '' });
ok('порожня причина не затирає відому',
  noReason && !('disable_reason' in noReason.body), noReason && noReason.body);

/* ── 4. ПРОТИЛЕЖНІ ДІЇ НА ДВІ РІЗНІ ВІДМОВИ ── */
const branch = grab(FN, /const st = await cabState[\s\S]*?judging by the last snapshot instead'\);/,
  'розвилка на відмові');
ok('на мертвому кабінеті знімок НЕ беремо', /continue;/.test(branch), 'continue');
ok('і до fellBack його не додаємо',
  branch.indexOf('fellBack.add') > branch.indexOf('continue;'), 'порядок');
ok('а стан записуємо до того, як вийти',
  branch.indexOf('markDead') < branch.indexOf('continue;'), 'порядок');
/* «Не змогли спитати» мусить і далі йти на знімок — інакше хвилинний
   збій Graph залишав би правила сліпими. */
ok('коли стан невідомий — усе як було, знімок',
  /if \(st && !cabWatched\(st\.word\)\)/.test(branch), branch.slice(0, 120));

/* ── 4a. GRACE І UNSETTLED ПІД НАГЛЯДОМ ──
   «grace перевіряти коли вийде з цього статусу». У grace реклама ще
   крутиться; пропускати такий кабінет до ручного Sync now означало
   лишити його без правил саме тоді, коли гроші під ризиком. */
const watchSrc = grab(FN, /const CAB_WATCH = [^\n]*\n[\s\S]*?\n}/, 'cabWatched');
const cabWatched = new Function(
  watchSrc.replace(/\(word: string\): boolean/, '(word)') + '\nreturn cabWatched;')();
ok('grace — під наглядом', cabWatched('grace') === true);
ok('unsettled — теж', cabWatched('unsettled') === true);
ok('active — звісно', cabWatched('active') === true);
ok('бан, закриття, розгляд — ні',
  ['banned', 'closed', 'closing', 'review', 'unknown', ''].every(w => !cabWatched(w)));
ok('прогін бере кабінети саме через cabWatched',
  /if \(!account \|\| !cabWatched\(String\(a\.status \|\| ''\)\)\) continue;/.test(FN));
ok('grace на відмові Graph записується, але кабінет не мертвий',
  branch.indexOf('cabWatched(st.word) && st.word !==') >= 0
  && branch.indexOf('cabWatched(st.word) && st.word !==') < branch.indexOf('if (st && !cabWatched'));
/* Вихід із grace без Sync now: кабінет не active, а числа прийшли —
   питаємо стан і пишемо, якщо змінився. */
const okBranch = grab(FN, /ads = await liveOf[\s\S]*?\} catch \(e\) \{/, 'гілка вдалого запиту');
ok('після вдалого запиту не-active кабінет перепитується',
  /if \(was !== 'active'\)/.test(okBranch) && /cabState\(/.test(okBranch), okBranch.slice(0, 200));
ok('і новий стан пишеться лише коли змінився',
  /if \(st && st\.word !== was\) await markDead/.test(okBranch));

/* ── 5. ПРО ЦЕ КАЖУТЬ ── */
ok('кількість мертвих є у відповіді', /\n\s*dead, telegram_dead:/.test(FN));
ok('і про них шлеться окреме повідомлення', /async function tgDead/.test(FN));
/* Не дублювання: fb-sync порівнює Facebook із базою, а ми щойно базу
   переписали — для неї зміни вже не буде. */
ok('у попередньому перегляді нічого не шлеться',
  /forceDry \? 'preview — not sent' : await tgDead/.test(FN));
ok('повідомлення називає кабінет, а не лише номер',
  /fb_accounts\?select=account_id,name,status,team_name/.test(FN));

/* ── 6. І ЦЕ ВИДНО В ПАНЕЛІ ──
   Слід про прогін мусить нести число мертвих, інакше «нічого не
   вимкнулось» на екрані виглядає так само, як коли нічого й не
   підпало. */
ok('число мертвих лягає у слід прогону', /fell_back: v\.fell, dead: v\.dead/.test(FN));
const RL = fs.readFileSync('build/rules.js', 'utf8');
ok('панель читає його з сліду', /n\(m\.dead\)/.test(RL), 'rules.js');
ok('і каже про бан окремо від відкату на знімок',
  /turned out banned/.test(RL) && /judged on the last snapshot/.test(RL), 'rules.js');
const built = fs.readFileSync('index.html', 'utf8');
ok('і це доїхало в зібраний файл', /turned out banned/.test(built), 'index.html');

/* ── 7. ВЕРСІЯ ── */
const v = Number((FN.match(/FN_VERSION = 'rules-(\d+)'/) || [])[1]);
ok('версію функції піднято не нижче rules-14', v >= 14,
  (FN.match(/FN_VERSION = '[^']+'/) || [])[0]);

await done(null, null, []);
