/* ═══════════ ПРАВИЛА БЕРУТЬ ЧИСЛА САМІ ═══════════

   «як працюють правила? вони дивляться на дані які є зараз чи вони
   самі оновляють дані, бо в телеграм вже 3 раз сповіщення приходить,
   але воно вимкнуло його вже давно».

   Не оновлювали. Правило читало знімок fb_ad_today, який пише
   fb-sync, — а синк ходить лише руками. Вимкнувши оголошення, правило
   НІДЕ цього не записувало, тож через чверть години читало той самий
   рядок, бачило ті самі цифри до цента, вимикало вже вимкнене і
   писало в Telegram ще раз. Три однакових повідомлення о 11:12, 11:27
   і 11:42 — це три прогони по одному й тому самому рядку.

   Повтори були симптомом. Вада — в тому, що рішення вимкнути рекламу
   ухвалювалось по даних, вік яких ніхто не обирав.

   Тепер числа беруться в Facebook у момент рішення, по одному запиту
   на кабінет і лише там, де є ввімкнене правило. Знімок лишається
   запасним аеродромом — і тоді про це видно.

   Стенд тримає:
     1. запит просить САМЕ активні й саме сьогоднішні числа —
        бо «тільки ACTIVE» і є те, що прибирає повтори: вимкнене
        Facebook більше не віддасть;
     2. inline_link_clicks лягає в link_clicks — інакше ціна кліка
        рахувалась би від нуля, тобто нескінченна, тобто вимикає все;
     3. живі числа йдуть ПЕРШИМИ, знімок — лише коли Facebook відмовив;
     4. після вимкнення рядок у знімку позначається PAUSED, і саме по
        тому полю, що відповідає рівню правила;
     5. у Telegram видно, коли судили по знімку, і НЕ видно, коли по
        свіжому. */
import fs from 'node:fs';
import { checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');

/* Типи зрізаємо так само, як інші стенди для edge-функцій: нас
   цікавить поведінка, а не те, що TypeScript і так перевіряє. */
const plain = src => src
  .replace(/:\s*Promise<[^>]*>/g, '')
  /* Спершу масиви й обʼєднання, і лише потім одиничні типи: інакше
     «: string[]» втрачає «: string» і лишає по собі «[]», на якому
     розбір і падає. */
  .replace(/: (string|number|boolean|Json|Ent|Hit)\[\](\s*\|\s*null)?/g, '')
  .replace(/: \(s: string\) => void/g, '')
  .replace(/: (string|number|boolean|Json|Ent|Hit)(\s*\|\s*null)?\b/g, '')
  .replace(/\bas (Error|Json)\b/g, '')
  .replace(/<string>/g, '');

const grab = (re, what) => {
  const m = FN.match(re);
  ok('у функції є ' + what, !!m);
  return m ? m[0] : '';
};

/* ── 1. ЩО САМЕ ПИТАЄМО В FACEBOOK ── */
/* Беремо константи з самої функції, а не переписуємо їх сюди: дві
   копії одного списку полів розійшлись би на першій же новій метриці,
   і стенд лишився б зеленим саме тоді, коли він потрібен. */
const constSrc = grab(/const LIVE_LIMIT[\s\S]*?';\n/, 'константи запиту');
const fieldsSrc = constSrc;
ok('питаємо витрати за сьогодні', /date_preset\(today\)/.test(fieldsSrc), fieldsSrc);
ok('і ліди сирими actions', /actions/.test(fieldsSrc), fieldsSrc);
/* Ось це й прибирає повтори: вимкнене оголошення Facebook у списку
   ACTIVE більше не віддасть, тож «не діяти двічі» тут не окрема
   перевірка зі своїми вадами, а наслідок джерела даних. */
ok('просимо ТІЛЬКИ активні',
  /effective_status[\s\S]{0,80}\['ACTIVE'\]/.test(FN), 'effective_status=[ACTIVE]');

/* ── 2. ЯК РОЗБИРАЄМО ВІДПОВІДЬ ── */
const liveSrc = grab(/async function liveOf[\s\S]*?\n}/, 'liveOf');
const mk = new Function('GRAPH', 'aggOf', 'fetch', `
  ${plain(constSrc)}
  ${plain(liveSrc)}
  return liveOf;`);

let asked = '', sentHdr = null;
const fakeFetch = async (url, init) => {
  asked = String(url);
  sentHdr = init && init.headers;
  return { ok: true, json: async () => ({ data: [
    { id: '11', name: 'KG_VD_932', adset_id: '21', campaign_id: '31',
      adset: { name: 'set A' }, campaign: { name: 'MPlay_KG_10708' },
      insights: { data: [{ spend: '4.65', impressions: '900', clicks: '12',
                           inline_link_clicks: '4', actions: [{ action_type: 'lead', value: '1' }] }] } },
    /* Оголошення без витрат за сьогодні приходить БЕЗ insights. Воно
       не мусить валити розбір: поріг спенду його й так відсіє. */
    { id: '12', name: 'KG_VD_933', adset_id: '21', campaign_id: '31' }
  ] }) };
};
/* aggOf підміняємо тотожністю НАВМИСНО: так видно рівно те, що liveOf
   передає в розбір чисел, разом із перейменованим полем. Сам розбір
   має власний стенд, і дублювати його тут означало б перевіряти двічі
   одне й те саме, а зміну — ловити в жодному. */
const liveOf = mk('https://graph.facebook.com/v21.0', row => row, fakeFetch);
const notes = [];
const ents = await liveOf('TOKEN', '1265852829067592', ['lead'], m => notes.push(m));

ok('запит іде саме в цей кабінет',
  asked.includes('act_1265852829067592/ads'), asked.slice(0, 90));
/* Адреса — це те, що осідає в логах проксі й у повідомленнях про
   помилки. Токен, який уміє вимикати рекламу, не має лежати в рядку,
   який хтось колись надрукує цілком. */
ok('токена в адресі немає', !/TOKEN|access_token/.test(asked), asked);
ok('він іде заголовком',
  sentHdr && sentHdr.Authorization === 'Bearer TOKEN', sentHdr);
ok('повертає обидва оголошення', ents.length === 2, ents.length);

const a = ents[0];
ok('назву беремо справжню', a.name === 'KG_VD_932', a.name);
ok('і назви батьків теж',
  a.adsetName === 'set A' && a.campaignName === 'MPlay_KG_10708', a);
/* Facebook зве це inline_link_clicks, а розбір чисел читає link_clicks.
   Якби перейменування загубилось, кліків було б нуль — а нуль кліків
   означає НЕСКІНЧЕННУ ціну кліка, тобто правило «дорогий клік»
   вимикало б геть усе й виглядало б при цьому справним. */
ok('inline_link_clicks лягає в link_clicks', a.agg.link_clicks === '4', a.agg);
ok('спенд доїжджає як є', a.agg.spend === '4.65', a.agg);
ok('рівень завжди оголошення: вище складає сама функція',
  ents.every(e => e.level === 'ad'), ents[0].level);
ok('оголошення без insights не валить розбір',
  ents[1].agg && ents[1].agg.spend === undefined, ents[1].agg);

/* Відмова Facebook мусить бути саме помилкою: мовчазний порожній
   список читався б як «кабінет нічого не крутить», і правило спокійно
   написало б, що перевірило нуль оголошень. */
ok('без другої сторінки нічого не кажуть', notes.length === 0, notes);

/* Мовчки судити перші п'ятсот означає, що решта просто не існує для
   правил, — а виглядає це як «правила перевірили кабінет». */
const many = mk('g', r => r, async () => ({ ok: true, json: async () => ({
  data: [{ id: '1' }], paging: { next: 'https://graph/next' } }) }));
const said = [];
await many('T', '999', [], m => said.push(m));
ok('а про зрізану решту — кажуть',
  said.length === 1 && /more than 500 active ads/.test(said[0]), said);

let threw = '';
try {
  const bad = mk('g', r => r, async () => ({ ok: true,
    json: async () => ({ error: { message: 'Invalid OAuth access token' } }) }));
  await bad('T', '1', [], () => {});
} catch (e) { threw = e.message; }
ok('відмова Facebook кидає помилку, а не порожній список',
  /Invalid OAuth/.test(threw), threw);

/* ── 3. ЖИВІ ЧИСЛА ПЕРШІ, ЗНІМОК — ЗАПАСНИЙ ── */
const loop = FN.slice(FN.indexOf('СПЕРШУ FACEBOOK'), FN.indexOf('for (const r of mine)'));
ok('у циклі спершу liveOf', loop.indexOf('liveOf') < loop.indexOf('snapOf'), loop.slice(0, 60));
ok('знімок читається лише без живих чисел',
  /if \(!ads\) \{[\s\S]{0,200}snapOf/.test(loop), 'if (!ads) → snapOf');
/* Осліпнути мовчки — найгірше з можливого: виглядало б як «правила не
   працюють», а шукали б причину в правилах. */
ok('про відкат до знімка кажуть вголос',
  /problems\.push\([\s\S]{0,160}judging by the last snapshot/.test(loop), 'problems.push');
ok('перевірка віку знімка лишилась на місці', /snapTooOld/.test(loop), 'snapTooOld');

/* ── 4. ПОЗНАЧКА ПРО ВИМКНЕНЕ ── */
const markSrc = grab(/async function markPaused[\s\S]*?\n  return err;\n}/, 'markPaused');
const mkMark = new Function('fetch', `${plain(markSrc)}\n  return markPaused;`);

const calls = [];
const okFetch = async (url, init) => {
  calls.push({ url: String(url), body: init && init.body, method: init && init.method });
  return { ok: true, text: async () => '' };
};
const markPaused = mkMark(okFetch);
const hit = (id, level, extra) => ({ id, level, account: '777', ok: true, dry: false,
  acted: true, ...extra });

await markPaused('https://x', {}, [
  hit('11', 'ad'),
  hit('21', 'adset'),
  hit('31', 'campaign'),
  /* Не вдалось вимкнути — нема чого й позначати: позначка сказала б,
     що реклама стоїть, хоча вона крутиться. */
  hit('41', 'ad', { ok: false }),
  // Пре'вю нічого не міняє у Facebook, отже й у знімку.
  hit('51', 'ad', { dry: true })
]);
ok('позначає рівно три вдалих вимкнення', calls.length === 3, calls.map(c => c.url));
ok('оголошення — по ad_id', /ad_id=eq\.11/.test(calls[0].url), calls[0].url);
ok('адсет — по adset_id', /adset_id=eq\.21/.test(calls[1].url), calls[1].url);
ok('кампанія — по campaign_id', /campaign_id=eq\.31/.test(calls[2].url), calls[2].url);
ok('і завжди в межах свого кабінета',
  calls.every(c => /account_id=eq\.777/.test(c.url)), calls[0].url);
ok('пишемо саме PAUSED',
  calls.every(c => c.method === 'PATCH' && /"effective_status":"PAUSED"/.test(c.body)),
  calls[0].body);

/* Колонки може не бути — SQL-блок не виконали. Це не привід валити
   прогін, але й не привід мовчати. */
const sayErr = mkMark(async () => ({ ok: false,
  text: async () => 'column "effective_status" does not exist' }));
const why = await sayErr('https://x', {}, [hit('11', 'ad')]);
ok('без колонки каже, що саме виконати',
  /FB_RULES\.sql/.test(why), why);

/* ── 5. ПІДПИС У TELEGRAM ── */
const tgSrc = grab(/function tgText[\s\S]*?\n}/, 'tgText');
const mkTg = new Function('TG_MAX', 'TG_LIMIT', 'tgBody', `${plain(tgSrc)}\n  return tgText;`);
const tgText = mkTg(50, 4000, list => list.map(h => h.id).join(','));

const fresh = [{ id: '1', dry: false, ok: true, fromSnap: false }];
const stale = [{ id: '1', dry: false, ok: true, fromSnap: true }];
const mixed = [...fresh, { id: '2', dry: false, ok: true, fromSnap: true }];

/* Дописувати «за свіжими даними» щоразу означало б привчити не читати
   цей рядок — і тоді єдиний раз, коли він щось означає, його теж не
   прочитають. */
ok('по свіжих числах підпису немає', !/Sync now/.test(tgText(fresh)), tgText(fresh));
ok('по знімку — є', /Sync now/.test(tgText(stale)), tgText(stale));
ok('і він не склеюється в кашу',
  !/ {2,}|— :|:\s*:/.test(tgText(stale)), JSON.stringify(tgText(stale)));
ok('коли по знімку лише частина — так і сказано',
  /1 of them/.test(tgText(mixed)), tgText(mixed));

/* ── 6. ВЕРСІЯ ── */
const fnv = Number((FN.match(/FN_VERSION = 'rules-(\d+)'/) || [])[1]);
ok('версію функції піднято не нижче rules-11', fnv >= 11,
  (FN.match(/FN_VERSION = '[^']+'/) || [])[0]);

await done(null, null, []);
