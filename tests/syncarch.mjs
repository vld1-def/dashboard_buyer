/* ═══════════ СИНХРОНІЗАЦІЯ ОБХОДИТЬ АРХІВНІ ═══════════

   Архів — поняття дашборда, не Facebook: це status='archive' у
   accounts_mapping. Facebook про нього не знає й віддає такий кабінет
   у списку нарівні з робочими, тож кожен прогін витрачав на архівні
   ту саму четвірку запитів, що й на живі.

   Платив за це не архів, а живі: у функції є дедлайн, і хвіст списку
   лишався необійденим — у підсумку це «did not get to N token(s)».
   Сорок відкладених кабінетів зʼїдали час, якого не хватило тим, на
   які дивляться щодня.

   Стенд тримає три речі:

     1. ключ архіву збігається з тим, як його рахує сторінка: act_123…
        і 123… — один кабінет;
     2. обхід стоїть МІЖ рядком і важкими запитами. Відфільтрувати
        раніше, на самому списку від Facebook, означало б, що
        архівний кабінет виглядає зниклим: markMissing звіряється саме
        з цим списком, і кабінет почав би показуватись як «No token»;
     3. число обійдених видно в підсумку. Інакше з екрана видно лише,
        що кабінетів менше, ніж у списку, — а це читається як збій. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/fb-sync/index.ts', 'utf8');

/* ── 1. ключі архіву — та сама логіка, що на сторінці ── */
const keysSrc = FN.match(/function archKeys[\s\S]*?\n}/);
const setSrc = FN.match(/function archivedSet[\s\S]*?\n  return out;\n}/);
ok('у функції є свій розбір ключів архіву', !!keysSrc && !!setSrc);

const mk = new Function(
  (keysSrc ? keysSrc[0] : '').replace(/: unknown|: string\[\]/g, '')
  + '\n'
  + (setSrc ? setSrc[0] : '').replace(/: Json\[\]|: Set<string>|<string>/g, '')
  + '\nreturn { archKeys, archivedSet };')();

const keys = mk.archKeys;
ok('номер лишається номером', keys('123').join() === '123', keys('123'));
/* Підпис act_123… і номер 123… — один кабінет, і архів не має від
   цього залежати. Так само рахує cabArchKeys на сторінці. */
ok('підпис act_… дає обидві форми', keys('act_123').sort().join() === '123,act_123', keys('act_123'));
ok('власний підпис лишається як є', keys('UA-main').join() === 'UA-main', keys('UA-main'));
ok('порожнє не дає ключів', keys('').length === 0 && keys(null).length === 0);

const set = mk.archivedSet;
const S = set([
  { account_id: 'act_1001', status: 'archive' },
  { account_id: '1002', status: 'active' },
  { account_id: 'UA-main', fb_account_id: '1003', status: 'archive' },
  { account_id: '1004', status: 'ARCHIVE' }
]);
ok('архівний номер у наборі', S.has('1001') && S.has('act_1001'), [...S]);
ok('живий кабінет у набір не йде', !S.has('1002'), [...S]);
/* Підпис у твоєму рядку й номер Facebook можуть не збігатись — саме
   для цього fb_account_id і є. Шукати потім будемо за номером. */
ok('номер Facebook береться з fb_account_id', S.has('1003'), [...S]);
ok('регістр статусу не має значення', S.has('1004'), [...S]);
/* Колонки fb_account_id на старих базах немає — тоді поле просто
   відсутнє, і це не має нічого ламати. */
ok('відсутнє поле нічого не ламає', set([{ account_id: '1', status: 'archive' }]).has('1'));

/* ── 2. обхід стоїть у правильному місці ── */
ok('важкі запити йдуть по відфільтрованому списку',
  /const work = archived\.size \? base_\.filter/.test(FN)
  && /for \(let i = 0; i < work\.length; i \+= CHUNK\) slices\.push\(work\.slice/.test(FN), '');
/* Список від Facebook НЕ фільтруємо: саме з ним звіряється
   markMissing, і архівний кабінет інакше виглядав би зниклим. */
ok('список від Facebook архівом не звужується',
  !/accs = accs\.filter\(a => !archived/.test(FN)
  && /accs = accs\.filter\(a =>\s*\n?\s*only!/.test(FN), '');
/* Рядок кабінета пишеться однаково: стан, валюта, картка й стеля
   приїхали вже в списку, за який заплачено одним запитом на токен. */
ok('рядки обійдених усе одно зберігаються',
  /base_\.forEach\(x => \{ if \(!rows\.includes\(x\.row\)\) rows\.push\(x\.row\); \}\)/.test(FN), '');
ok('набір архівних береться по команді токена',
  /teamArchived\(base, hdr, t\.team_name\)/.test(FN), '');
/* Не дізнались — не обходимо нічого: прогін по всіх дорожчий, зате
   повний, а тихо пропустити живий кабінет було б гірше. */
ok('невідомий архів нічого не обходить',
  /Не дізнались/.test(FN) && /return new Set<string>\(\);\n}/.test(FN), '');
ok('у відповіді є число обійдених', /archived_skipped: archivedSkipped/.test(FN), '');

/* ── 3. підсумок на екрані ── */
const PORT = 8178;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const said = await page.evaluate(async () => {
  const out = [];
  sb.auth.getSession = async () => ({ data: { session: { access_token: 'x' } } });
  window.fbLoad = async () => {};
  let body = {};
  window.fetch = async () => ({ ok: true, status: 200, json: async () => body });
  const run = async j => {
    body = j; fbSyncing = false;
    await fbSync(h => out.push(String(h)));
    return out[out.length - 1];
  };
  return {
    some: await run({ fn: FB_FN_WANT, tokens: 1, accounts: 40,
                      archived_skipped: 12, took_ms: 1000 }),
    none: await run({ fn: FB_FN_WANT, tokens: 1, accounts: 28,
                      archived_skipped: 0, took_ms: 1000 })
  };
});
ok('у підсумку сказано, скільки обійшли', /12 archived skipped/.test(said.some), said.some);
ok('і поруч із числом кабінетів, а не окремо',
  /40 cabinet\(s\)[\s\S]{0,60}12 archived skipped/.test(said.some), said.some);
/* Нуль обійдених — не новина: писати «0 archived skipped» щоразу
   означає вчити не читати цей кут екрана. */
ok('нуль обійдених не пишеться', !/archived skipped/.test(said.none), said.none);

await done(browser, srv, errs);
