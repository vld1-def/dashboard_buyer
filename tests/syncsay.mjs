/* ═══════════ СИНК КАЖЕ ПРАВДУ ПРО ТЕ, ЩО СТАЛОСЬ ═══════════

   «нажимаю sync а він пише що додай спочатку токен в налаштуваннях,
   але в мене там все додано, а якщо окремо кожен кабінет перевіряти то
   працює» і «дуже довго підтягує дані якщо через глобальну кнопку».

   У відповіді fb-sync поле tokens — це НЕ скільки токенів є, а
   скількох прогін пройшов до кінця. Токен, що впав із винятком, до
   нього не додається. Отже коли не вдався ЖОДЕН, число теж нуль — і
   екран, який питав саме його, радив додати токен людині, у якої їх
   десяток.

   Найгірше, що причина приїжджала в тій самій відповіді, полем
   problems, і викидалась разом із нею: подивитись, ЧОМУ не вдалось,
   було ніде.

   Стенд тримає:
     1. немає токенів зовсім — та сама порада, що й була;
     2. токени є, але жоден не пройшов — інший текст і причини з
        problems на екрані;
     3. усе гаразд — звичайний підсумок;
     4. довгий прогін називає найповільніші токени (функція їх міряє,
        екран доти їх не показував);
     5. старішу fb-sync, яка tokens_total не шле, це не ламає. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8192;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

/* Відповідь функції підміняємо на рівні fetch: нас цікавить рівно те,
   що екран РОБИТЬ із нею, а не як вона її складає. */
const say = reply => page.evaluate(async (r) => {
  window.fetch = async () => ({ status: 200, ok: true, json: async () => r });
  sb.auth.getSession = async () => ({ data: { session: { access_token: 'x' } } });
  window.fbLoad = async () => {};
  fbSyncing = false;
  let last = '';
  await fbSync(html => { last = String(html); });
  return last.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}, reply);

/* ── 1. токенів справді немає ── */
const none = await say({ tokens: 0, tokens_total: 0, note: 'no tokens to sync' });
ok('без токенів радять додати токен', /add one in Settings/i.test(none), none);

/* ── 2. токени є, але не вдався жоден ──
   Саме цей випадок і виглядав як «додай токен». */
const fail = await say({ tokens: 0, tokens_total: 4, took_ms: 61000,
  problems: ['UA_main: Error validating access token',
             'KZ_two: (#17) User request limit reached'] });
ok('не радять додавати токен, коли вони є',
  !/add one in Settings/i.test(fail), fail);
ok('кажуть, скільки їх і що не пройшов жоден',
  /4 token\(s\)/.test(fail) && /not one of them got through/i.test(fail), fail);
/* Причина приїжджала в тій самій відповіді й викидалась. */
ok('і показують причину з відповіді',
  /Error validating access token/.test(fail), fail);
ok('усі причини, а не першу', /User request limit reached/.test(fail), fail);
ok('і скільки часу на це пішло', /61\.0s/.test(fail), fail);

/* Відповідь без problems не має вдавати, що причина відома. */
const mute = await say({ tokens: 0, tokens_total: 2 });
ok('без причин так і кажуть',
  /said nothing about why/i.test(mute), mute);

/* ── 3. звичайний прогін ── */
const good = await say({ tokens: 3, tokens_total: 3, accounts: 37, took_ms: 9000 });
ok('вдалий прогін рахує кабінети й токени',
  /37 cabinet\(s\) from 3 token\(s\)/.test(good), good);
ok('і не згадує ні про які невдачі',
  !/got through|add one in Settings/i.test(good), good);

/* ── 4. ЧОМУ ДОВГО — з адресою ──
   Функція міряє час кожного токена; доти ці числа нікуди не
   потрапляли, і «довго» лишалось відчуттям. */
const slow = await say({ tokens: 3, tokens_total: 3, accounts: 37, took_ms: 96000,
  slowest: [{ label: 'UA_main', ms: 61000, graph_ms: 58000, accounts: 24 },
            { label: 'KZ_two', ms: 21000, graph_ms: 19000, accounts: 9 },
            { label: 'TJ_three', ms: 9000, graph_ms: 8000, accounts: 4 }] });
ok('довгий прогін називає найповільніший токен',
  /UA_main 61\.0s/.test(slow), slow);
ok('і скільки з того пішло в Facebook',
  /58\.0s in Facebook/.test(slow), slow);
ok('і скільки в нього кабінетів', /24 cab/.test(slow), slow);
/* Під десять секунд це звичайний прогін: рядок щоразу привчав би не
   читати цей кут екрана. */
ok('а короткий — не називає', !/slowest/.test(good), good);

/* ── 5. старіша функція ──
   tokens_total вона не шле. Поведінка має лишитись тією ж, що й була,
   а не читатись як «токенів немає». */
const old0 = await say({ tokens: 0 });
ok('стара fb-sync без токенів — як раніше',
  /add one in Settings/i.test(old0), old0);
const old3 = await say({ tokens: 3, accounts: 10 });
ok('стара fb-sync із токенами працює',
  /10 cabinet\(s\) from 3 token\(s\)/.test(old3), old3);

/* ── 6. І САМА ФУНКЦІЯ ШЛЕ ОБИДВА ЧИСЛА ── */
const FN = fs.readFileSync('supabase/functions/fb-sync/index.ts', 'utf8');
ok('у відповіді є tokens_total поруч із tokens',
  /tokens: done, tokens_total: tokens\.length/.test(FN), 'tokens_total');
ok('і в порожній відповіді теж',
  /tokens: 0, tokens_total: 0/.test(FN), 'tokens_total: 0');

await done(browser, srv, errs);
