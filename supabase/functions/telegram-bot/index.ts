/* ═══════════ БОТ TELEGRAM ═══════════
   Приймає те, що Telegram шле на webhook. Вміє прив'язати чат до
   баєра, відв'язати назад — і відповісти на запит про стан парку:
   скільки кабінетів крутить, скільки витрачено сьогодні, що зламалось.

   ЧИСЛА ТІ САМІ, ЩО НА ЕКРАНІ, і це не випадково. Клацання, ліди,
   реєстрації й депозити бот рахує тим самим розбором, що й таблиця
   кампаній: одна подія Facebook приїжджає кількома іменами, і хто
   складає їх наївно, бачить утричі більше лідів. Якби бот рахував
   інакше, його число сперечалось би з екраном — і вірити не можна
   було б жодному.

   ПРО ВІДПОВІДІ НА ЗАПИТ
   Бот ходить у базу ключем сервісної ролі, тобто бачить УСЕ. Тому
   кожен запит жорстко звужується до created_by того, хто прив'язав
   цей чат. Забути цей фільтр означало б показати одному баєру
   кабінети іншого — і він би навіть не зрозумів, що бачить чуже.

   ЧОМУ КОДОМ, А НЕ ПОШТОЮ
   Напрошується простіше: бот питає пошту, людина відповідає, готово.
   Але пошта — не таємниця, це ім'я. Хто завгодно вписав би чужу і
   почав отримувати чужі сповіщення: домени, мітки, що впало. Перевірити
   бот нічого не може — у нього немає способу спитати пароль.

   Код видає сам дашборд і лише тому, хто в ньому залогінений, тобто
   вже довів, що він це він. Код живе чверть години і згоряє після
   першого використання. Пошту бот показує у відповідь — але як
   підтвердження «так, це твій акаунт», а не як спосіб увійти.

   ЧОМУ БЕЗ ПЕРЕВІРКИ JWT
   Telegram нічого не знає про токени Supabase і шле звичайний POST.
   Тому функція розгортається з --no-verify-jwt, а замість JWT її
   захищає спільний секрет: Telegram додає його заголовком до кожного
   запиту, і все без нього ми відкидаємо ще до читання тіла.

   ЖОДНИХ ІМПОРТІВ — з тієї ж причини, що й у check-domains: якщо
   імпорт не розв'яжеться, функція падає ще до запуску, і ззовні це
   не відрізнити від несправного бота.

   Розгортання:
     supabase functions deploy telegram-bot --no-verify-jwt

   ЩОБ КОМАНДИ ЗʼЯВИЛИСЬ У МЕНЮ TELEGRAM
   Кнопки під повідомленням працюють одразу, а от список команд за
   слешем Telegram показує лише той, який йому назвали. Один раз,
   своїм токеном бота:

     curl -s -X POST "https://api.telegram.org/bot<ТОКЕН>/setMyCommands" \
       -H 'content-type: application/json' -d '{"commands":[
         {"command":"status","description":"Зведення по парку"},
         {"command":"spend","description":"Спенд за сьогодні"},
         {"command":"cabs","description":"Кабінети докладніше"},
         {"command":"domains","description":"Стан доменів"},
         {"command":"menu","description":"Кнопки"},
         {"command":"stop","description":"Відвʼязати цей чат"}]}'

   Не зробити — команди все одно працюють, просто їх не підказують.
*/

const CODE_LIFE_HINT = 'Код живе 15 хвилин.';

type Link = {
  user_id: string; email: string | null; team_name: string | null;
  code: string | null; code_expires: string | null;
};

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function reply(token: string, chat: number | string, text: string,
                    keys?: unknown): Promise<void> {
  try {
    const body: Record<string, unknown> = {
      chat_id: chat, text, disable_web_page_preview: true
    };
    // Без parse_mode: у пошті й іменах трапляються символи, на яких
    // розмітка Telegram спотикається і відповідає 400.
    if (keys) body.reply_markup = keys;
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (_e) { /* не відповіли — не привід падати */ }
}

/* КЛАВІАТУРА, А НЕ INLINE.

   Спершу тут були inline-кнопки: вони живуть під тим повідомленням, до
   якого прикріплені, і щоб натиснути ще раз, треба відгортати чат
   назад до старої відповіді. У звичайних ботів кнопки стоять під полем
   вводу завжди — і це не прикраса, а різниця між «натиснув» і
   «спершу знайди, куди натискати».

   is_persistent тримає її розгорнутою: без нього Telegram згортає
   клавіатуру в іконку, і кнопок знову не видно.

   Натиснута кнопка надсилає свій ТЕКСТ звичайним повідомленням — тому
   нижче ці підписи розбираються нарівні з командами. */
const B_SUM = '\u{1F4CA} Зведення';
const B_SPEND = '\u{1F4B0} Спенд';
const B_CABS = '\u{1F5C2} Кабінети';
const B_DOM = '\u{1F310} Домени';

const KEYS = {
  keyboard: [[{ text: B_SUM }, { text: B_SPEND }],
             [{ text: B_CABS }, { text: B_DOM }]],
  resize_keyboard: true,
  is_persistent: true
};

/* Підпис кнопки → та сама дія, що й команда. Один шлях на обидва
   входи: інакше кнопка й /spend колись покажуть різне. */
const BTN: Record<string, string> = {
  [B_SUM]: 'sum', [B_SPEND]: 'spend', [B_CABS]: 'cabs', [B_DOM]: 'dom'
};

/* Telegram лишає кнопку «в натисканні», поки не відповіси на callback.
   Не відповісти — і вона крутиться, аж поки людина не вирішить, що
   бот помер. */
async function ackButton(token: string, id: string): Promise<void> {
  try {
    await fetch('https://api.telegram.org/bot' + token + '/answerCallbackQuery', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id })
    });
  } catch (_e) { /* кнопка покрутиться — не привід падати */ }
}

async function pick(base: string, hdr: Record<string, string>,
                    path: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(base + '/rest/v1/' + path, { headers: hdr });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch (_e) { return []; }
}

/* Хто цей чат. Не знайшли — жодних даних: показати стан парку тому,
   хто просто знайшов бота в пошуку, було б найдешевшою витокою. */
async function whoIs(base: string, hdr: Record<string, string>,
                     chat: number | string): Promise<Link | null> {
  const rows = await pick(base, hdr, 'tg_links'
    + '?select=user_id,email,team_name,code,code_expires'
    + '&chat_id=eq.' + encodeURIComponent(String(chat)) + '&limit=1');
  return (rows[0] as Link) || null;
}

const num = (v: unknown): number => Number(v) || 0;

/* Скільки хвилин тому. Число без цієї підписки читається як «зараз»,
   а воно може бути годинної давності: бот показує те, що привіз
   останній прогін синхронізації, а не питає Facebook сам. */
function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!(ms >= 0)) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'щойно';
  if (m < 60) return m + ' хв тому';
  const h = Math.floor(m / 60);
  return h < 24 ? h + ' год тому' : Math.floor(h / 24) + ' дн тому';
}

const CUR: Record<string, string> = { USD: '$', EUR: '\u20AC', UAH: '\u20B4' };
const money = (n: number, cur: string): string => {
  const v = (Math.round(n * 100) / 100).toLocaleString('en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return CUR[cur] ? CUR[cur] + v : v + ' ' + cur;
};

/* ЦІНА ЗА ОДИНИЦЮ — не те саме, що сума, і двох знаків тут буває
   замало. Клац за 0.004$ із двома знаками показався б як 0.00 — тобто
   «безкоштовно», і це рівно та сама брехня, від якої нижче стоїть ∞. */
const rate = (n: number, cur: string): string => {
  const d = n > 0 && n < 0.01 ? 4 : 2;
  const v = n.toLocaleString('en-US',
    { minimumFractionDigits: d, maximumFractionDigits: d });
  return CUR[cur] ? CUR[cur] + v : v + ' ' + cur;
};

/* ЦІНА БЕЗ ПОДІЇ — НЕ НУЛЬ. Нуль читається як «безкоштовно», а це
   рівно навпаки: гроші пішли, віддачі немає. Той самий словник, що в
   дашборді: є подія → ціна, немає події при спенді → ∞, немає нічого
   → прочерк. */
const per = (spend: number, n: number, cur: string): string =>
  n > 0 ? rate(spend / n, cur) : (spend > 0 ? '\u221E' : '\u2014');

type Act = { action_type?: unknown; value?: unknown };

/* ОДНУ Й ТУ САМУ ПОДІЮ FACEBOOK ВІДДАЄ КІЛЬКОМА ІМЕНАМИ ОДРАЗУ.

   Три ліди приїжджають так:
     lead                              3
     onsite_conversion.lead_grouped    3
     offsite_conversion.fb_pixel_lead  3
   — це не дев'ять лідів, а ті самі три, порахованих трьома способами.
   Тому зводимо тип до БАЗОВОЇ події й беремо ПО ОДНОМУ значенню на
   подію. Той самий розбір, що й у дашборді (cdLeadBase / cdLeadCount):
   якби бот рахував лідів інакше, його число сперечалося б із екраном,
   і вірити не можна було б жодному. */
const LEAD_EVENTS = ['lead', 'onsite_conversion.lead_grouped',
                     'offsite_conversion.fb_pixel_lead'];

const leadBase = (t: string): string => String(t || '')
  .replace(/^offsite_conversion\.fb_pixel_/, '')
  .replace(/^onsite_conversion\./, '')
  .replace(/^offsite_conversion\./, '')
  .replace(/_grouped$/, '');

function leadCount(actions: unknown[]): number {
  if (!Array.isArray(actions)) return 0;
  const by = new Map<string, { t: string; v: number }[]>();
  actions.forEach(x => {
    const t = String((x as Act)?.action_type || '');
    if (!LEAD_EVENTS.includes(t)) return;
    const b = leadBase(t);
    if (!by.has(b)) by.set(b, []);
    by.get(b)!.push({ t, v: num((x as Act)?.value) });
  });
  let n = 0;
  /* Якщо приїхала сама базова назва — беремо її: у Facebook це
     загальне число, що вже містить і піксельні, і лід-форми. Немає —
     складаємо окремі джерела. */
  by.forEach((list, b) => {
    const total = list.find(x => x.t === b);
    n += total ? total.v : list.reduce((a, x) => a + x.v, 0);
  });
  return n;
}

/* ОДНА подія, а не сума схожих. На ту саму реєстрацію Facebook часто
   віддає і complete_registration, і offsite_conversion.fb_pixel_
   complete_registration; склавши їх, ми показали б подвійне число. */
function pickAct(actions: unknown[], suf: string): number {
  if (!suf || !Array.isArray(actions)) return 0;
  let best = 0, rank = 99;
  actions.forEach(x => {
    const t = String((x as Act)?.action_type || '');
    const r = t === suf ? 0
      : t === 'offsite_conversion.fb_pixel_' + suf ? 1
      : t === 'onsite_conversion.' + suf ? 2
      : (t.endsWith('.' + suf) || t.endsWith('_' + suf)) ? 3 : 99;
    if (r < rank) { rank = r; best = num((x as Act)?.value); }
  });
  return rank === 99 ? 0 : best;
}

/* Що бот вважає реєстрацією й депозитом — ті самі події, що й імпорт
   звітів (FBR_CONV у fbrep): депозит у Facebook живе під іменем
   purchase. Розійтись цим двом словникам означало б, що звіт і бот
   рахують різне, називаючи це однаково. */
const EV_REG = 'complete_registration';
const EV_DEP = 'purchase';

/* ЗАКРИТИЙ КАБІНЕТ — ЦЕ НЕ ЗАБАНЕНИЙ, і тут це довго було не так.

   Коментар вище казав «той самий словник, що й у дашборді» — а словник
   був інший: closed і closing лежали в одному списку з banned. Тобто
   кабінет, який закрили СВОЇМИ Ж руками, приходив у Telegram під
   заголовком «Забанені». Плутати ці двоє дорого в обидва боки:
   власний архів лякає як бан, а справжній бан губиться серед архівів.

   Різниця одна й перевірна, і дашборд саме на неї й спирається:
   disable_reason. Facebook заповнює його, коли закрив кабінет САМ і за
   щось конкретне — політика, ризик, платіж. Порожній disable_reason
   при закритому кабінеті означає, що його закрили навмисно. */
const SICK = ['unsettled', 'review', 'grace'];
const SHUT = ['closed', 'closing'];

function isBanned(status: string, reason: string): boolean {
  if (status === 'banned') return true;
  return SHUT.includes(status) && !!reason;
}

type Cab = { id: string; name: string; who: string };
/* Клацання й конверсії — ПО ВАЛЮТАХ, і це не запас. Ціна ліда в
   доларах і ціна ліда в гривнях — не одне число, і середнє з них не
   означає нічого. Спенд тут теж свій: він порахований із тих САМИХ
   оголошень, що й конверсії (див. нижче). */
type Conv = { spend: number; clicks: number; leads: number;
              regs: number; deps: number };
type CabSpend = { id: string; name: string; who: string;
                  spend: number; cur: string };
type Park = {
  live: number; total: number; ads: number;
  banned: Cab[]; lost: Cab[]; sick: Cab[];
  /* Закриті без причини — свій же архів. Окремо від банів: інакше
     власне рішення щодня приходить як катастрофа. */
  shut: Cab[];
  spend: Record<string, number>;
  /* Розклад спенда по кабінетах: підсумок не каже, КУДИ пішли гроші, а
     питання після нього завжди саме це. */
  byCab: CabSpend[];
  conv: Record<string, Conv>;
  /* Оголошень більше, ніж ми беремо за раз. Тоді конверсії неповні —
     і про це треба сказати, а не показати менше число молча. */
  convCap: boolean;
  convRows: number;
  seen: string;
  /* Числа дашборда за останній залитий день. Беруться лише тоді, коли
     знімок Facebook старий — інакше це був би другий набір чисел про
     те саме, і довіряти перестали б обом. */
  hub: Hub | null;
  /* Чому других чисел теж немає. Порожньо — значить питання не
     стояло: знімок свіжий, запас не був потрібен. */
  hubErr: string;
  /* Чому числа можуть бути не найсвіжішими. Порожньо — значить
     оновлення або не було потрібне, або пройшло. */
  fresh: string;
  /* Скільки кабінетів у підрахунок НЕ пішло, бо їхні числа заморожені.
     Без цього сума мовчки меншає, і це виглядає як утрачений спенд. */
  frozen: number;
  /* Те саме, але з іншої причини: знімок цього кабінета просто старий.
     Токен його бачить, missing_since не стоїть — до нього банально не
     дійшов прогін. Числа в рядку при цьому лежать дванадцятиденні. */
  stale: number;
};

/* Знімок оголошень читаємо сторінками: в одного баєра їх бувають
   тисячі, а PostgREST усе одно віддає не більше свого ліміту. Межа
   є навмисно — пам'ять функції не безмежна, — але доїхавши до неї,
   ми про це кажемо. */
const SNAP_PAGE = 1000;
const SNAP_PAGES = 5;

/* ─────────── СВІЖІ ЧИСЛА НА ЗАПИТ ───────────

   Бот нічого не питає у Facebook сам: він показує те, що привіз
   останній прогін синхронізації. Прогін ходить за розкладом і ще й
   має власний темп (вночі рідше), тож між натисканням кнопки і
   числами під нею лежала година, а вночі й більше. Підпис про вік
   був — але людині потрібні свіжі числа, а не точний вік старих.

   Тому перед відповіддю бот просить fb-sync оновити кабінети САМЕ
   ЦЬОГО баєра. Токена людини в нього немає, тому йде спільним
   секретом розкладу і полем owner — fb-sync звужується до цього
   власника й не застосовує темп (на кнопку натиснули щойно).

   ЧОМУ З ПОРОГОМ. Без нього кожне натискання тягло б Facebook, а
   ліміти там спільні з усім іншим: десяток натискань поспіль
   коштували б дорожче за годину роботи. Свіжіше за FRESH_MIN —
   не оновлюємо, бо нема чого.

   ЧОМУ З МЕЖЕЮ ЧАСУ. Синхронізація десятка токенів триває довше, ніж
   Telegram готовий чекати на відповідь вебхука. Не встигли — віддаємо
   те, що є, І КАЖЕМО ЦЕ ВГОЛОС: мовчки показані старі числа тут
   найгірше, бо людина щойно попросила свіжі. */
const FRESH_MIN = 5;

/* ВЕРСІЯ САМОГО БОТА — у підписі, коли числа лишились старими.

   «Я все задеплоїв, а нічого не змінилось» неможливо було перевірити
   ні йому, ні мені: ззовні свіжий код і старий виглядають однаково.
   Про fb-sync бот уже казав версію (вона приїжджає у відповіді
   прогону) — а про себе не казав нічого. Тепер каже. */
const FN_VERSION = 'bot-12';
/* Чекаємо довше, ніж 25 с: у кого десяток токенів, прогін за чверть
   хвилини не встигає, і кнопка щоразу відповідала «числа ще старі».
   Верхня межа тут не наша — Telegram чекає на відповідь вебхука
   близько хвилини, після чого шле оновлення ще раз. Сорок п'ять
   лишають запас на сам збір відповіді. */
const SYNC_WAIT_MS = 45_000;

/* ЩО САМЕ ВІДПОВІЛА СИНХРОНІЗАЦІЯ — у підпис, коли числа лишились
   старими. Інакше «не підтягує свіже» не має жодного сліду: прогін міг
   не бути задеплоєним, міг не дійти до половини токенів, міг взагалі
   не знайти жодного. Три різні біди, однакові на вигляд. */
function syncWhy(j: Record<string, unknown> | null): string {
  if (!j) return '';
  const bits: string[] = [];
  const skipped = Number(j.skipped_total) || 0;
  if (skipped) {
    const names = Array.isArray(j.skipped) ? (j.skipped as string[]).slice(0, 3) : [];
    bits.push('не дійшло до ' + skipped + ' токен(ів)'
      + (names.length ? ': ' + names.join(', ') : '')
      + ' — наступний прогін почне з них');
  }
  if (j.throttled) bits.push('Facebook уперся в ліміт');
  /* Версію кажемо завжди, коли числа лишились старими: найчастіша
     причина «нічого не змінилось» — функція просто не задеплоєна, а
     ззовні це не відрізнити від несправної. */
  if (j.fn) bits.push('fb-sync ' + String(j.fn));
  return bits.join(' · ');
}

type Fresh = { ran: boolean; note: string };

/* ЧОМУ ЦЕ МОВЧАЛО, ХОЧ УСЕ БУЛО ЗАДЕПЛОЄНО.

   Тут читався НАЙСВІЖІШИЙ synced_at (order=synced_at.desc), а підпис
   під відповіддю обіцяє НАЙСТАРІШИЙ: «усе не старіше за …». Два різні
   числа, і саме в цьому вся вада.

   Прогін за розкладом обходить токени по черзі й щоразу чіпає ЧАСТИНУ
   кабінетів. Отже найсвіжіший synced_at майже завжди молодший за
   пʼять хвилин — і freshen тихо повертався з ran:false, note:'',
   жодного разу не покликавши fb-sync. А найстаріший тим часом стояв
   на одинадцяти днях, і людина бачила рівно це: старі числа, кнопка
   ніби працює, у підписі ні слова про причину.

   Тепер міряємо те саме, що обіцяємо: найстаріший synced_at. Заморожені
   пропускаємо (missing_since) — їх і park() не рахує, а їхня дата не
   рушить уже ніколи, тож тримати через них вічне «треба оновити» не
   можна. nullsfirst — щоб щойно доданий токен, у якого synced_at ще
   немає, переважив усе. */
const STALE_MIN = 20;

/* Межа на САМІ СПРОБИ, а не на дані. Поки хвіст черги не розсмоктався,
   найстаріша дата не рушить — і без цієї межі кожне натискання кнопки
   запускало б 45-секундний прогін наново. Памʼять живе, поки жива
   інстанція функції, тобто рівно там, куди прилітають повторні
   натискання. Причину з попередньої спроби переказуємо тією ж
   фразою: мовчання тут було б тим самим, від чого ми й лікуємось. */
const TRY_EVERY_MS = 3 * 60_000;
const lastTry = new Map<string, { at: number; note: string }>();

async function freshen(base: string, hdr: Record<string, string>,
                       uid: string): Promise<Fresh> {
  const rows = await pick(base, hdr, 'fb_accounts?select=synced_at&created_by=eq.'
    + encodeURIComponent(uid)
    + '&missing_since=is.null&order=synced_at.asc.nullsfirst&limit=1');
  /* Жодного рядка — синхронізації ще не було зовсім, і це теж підстава
     піти її запустити, а не причина замовкнути. */
  const at = rows.length ? String(rows[0].synced_at || '') : '';
  const ageMin = at ? (Date.now() - Date.parse(at)) / 60_000 : Infinity;
  if (ageMin < STALE_MIN) return { ran: false, note: '' };

  const prev = lastTry.get(uid);
  if (prev && Date.now() - prev.at < TRY_EVERY_MS)
    return { ran: false, note: prev.note };
  const done = (r: Fresh): Fresh => {
    lastTry.set(uid, { at: Date.now(), note: r.note });
    return r;
  };

  const key = Deno.env.get('CRON_SECRET') || '';
  if (!key) return done({ ran: false, note:
    'оновити зараз не можу: у секретах функцій немає CRON_SECRET' });

  try {
    const res = await fetch(base + '/functions/v1/fb-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cron-key': key },
      body: JSON.stringify({ owner: uid, on_demand: true }),
      signal: AbortSignal.timeout(SYNC_WAIT_MS)
    });
    const j = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok) return done({ ran: false, note: 'оновити не вийшло: HTTP ' + res.status
      + (j && j.error ? ' \u2014 ' + String(j.error) : '') });
    /* Токенів немає — це не збій синхронізації, а порожній парк.
       Сказати «оновлено» тут означало б пообіцяти те, чого не було. */
    if (!Number(j?.tokens)) return done({ ran: false, note:
      'оновлювати нічого: токенів не знайшлось' });
    /* Прогін відповів — але це ще не означає, що він обійшов усе.
       Якщо хвіст лишився, кажемо про це тут, а не мовчимо до наступного
       разу: саме цей хвіст і є тими кабінетами, чиї числа тижневі. */
    const why = syncWhy(j);
    if (Number(j?.skipped_total) || j?.throttled) return done({ ran: true, note: why });
    return done({ ran: true, note: '' });
  } catch (e) {
    const err = e as Error;
    /* Обрив за НАШОЮ межею — синхронізація пішла працювати, ми просто
       не дочекались. Числа нижче ще старі, і це головне, що треба
       сказати; наступне натискання за хвилину покаже вже свіже. */
    if (err.name === 'TimeoutError' || /abort|timeout/i.test(err.message || ''))
      return done({ ran: false, note: 'оновлення триває довше за ' + (SYNC_WAIT_MS / 1000)
        + ' с — воно не зупинилось, просто не встигло до відповіді. '
        + 'Числа нижче ще старі; натисніть ще раз за хвилину' });
    return { ran: false, note: 'оновити не вийшло: ' + (err.message || 'без причини') };
  }
}

/* ═══════ ДАНІ ДАШБОРДА — ДРУГЕ ДЖЕРЕЛО, І ЧАСТО ЄДИНЕ ЖИВЕ ═══════

   Бот дивився рівно в одне місце: fb_accounts, знімок Facebook, який
   робить fb-sync. Коли той прогін не ходить — не задеплоєний, не
   дійшов до токена, впертий у ліміт — бот чесно казав «усе не старіше
   за 11 днів» і на цьому замовкав.

   Але дашборд при цьому ПОВНИЙ. Його числа живуть у daily_stats, і
   туди вони потрапляють не з fb-sync, а з імпорту: людина заливає
   вивантаження, і спенд, ліди, реєстрації й депозити в неї перед
   очима. Тобто дані були — просто бот про це місце не знав.

   Тому коли знімок Facebook старий або його немає зовсім, беремо те
   саме, що бачить людина на екрані. І ОБОВʼЯЗКОВО кажемо, звідки це:
   «спенд сьогодні» з Facebook і «спенд за день останнього імпорту» —
   різні обіцянки, і видати одне за інше було б гірше за мовчання.

   Дата — НЕ «сьогодні», а остання, яка є в імпорті. Якщо востаннє
   заливали позавчора, написати «сьогодні» означало б збрехати рівно
   там, де людина й так підозрює несвіжість. */
/* Скільки годин знімок кабінета ще можна вважати «сьогоднішнім».

   spend_today — це «сьогодні за годинником самого кабінета». Знімок
   добової давнини не може бути сьогоднішнім ні за чиїм годинником, тож
   доба тут — не кругле число навмання, а межа, за якою твердження
   стає хибним гарантовано. Між чвертю години й добою воно ще може бути
   правдою, і відсівати там означало б викидати живі кабінети. */
const SNAP_STALE_H = 24;

const HUB_STALE_H = 6;
const HUB_ROWS = 3000;

type HubCab = { id: string; spend: number };
type Hub = { day: string; spend: number; installs: number; regs: number;
             deps: number; byCab: HubCab[]; cabs: number;
             /* Доїхали до межі вибірки. Тоді останній день міг
                обрізатись, і сума в ньому менша за справжню. */
             cap: boolean;
             /* Найбільша дата з майбутнього, якщо така в базі є. Не для
                підрахунку — для одного рядка: такий рядок ламає не лише
                цей блок, а й будь-який вибір періоду в дашборді. */
             ahead: string };

/* pick() ковтає будь-яку відмову й віддає порожній масив — для
   необовʼязкових шматків це правильно, але не тут. Саме мовчання й
   було вадою: «нічого не бачу» і «запит відмовив» виглядали однаково,
   а це різні новини, і друга означає, що треба йти щось робити. */
async function askRows(base: string, hdr: Record<string, string>, path: string):
    Promise<{ rows: Record<string, unknown>[]; err: string }> {
  try {
    const res = await fetch(base + '/rest/v1/' + path, { headers: hdr });
    if (!res.ok) {
      const t = (await res.text()).slice(0, 200);
      return { rows: [], err: res.status + (t ? ' ' + t : '') };
    }
    const j = await res.json();
    return { rows: Array.isArray(j) ? j : [], err: '' };
  } catch (e) { return { rows: [], err: String((e as Error).message || e) }; }
}

/* МАЙБУТНЄ ВІДСІКАЄМО, І ЦЕ НЕ ПРИДИРКА.

   «Останній день, за який щось заливали» бралось як просто найбільша
   дата в таблиці — і цього достатньо рівно доти, доки всі дати
   справжні. Варто одному рядку приїхати з імпорту з датою 2099-01-01
   (бита клітинка, зсунутий стовпчик, рядок заголовка, прийнятий за
   дані) — і він виграє сортування назавжди. Блок тоді показує
   «Дашборд · 2099-01-01, спенд $0.00»: зухвало точна дата й нуль
   грошей, тобто найгірший різновид відповіді — виглядає як факт.

   Витрати не бувають у майбутньому. Запас у добу — на те, що день у
   рядку рахується за годинником кабінета, а ми тут у UTC: календарна
   дата в баєра може випереджати нашу, і відрізати її було б такою
   самою вадою, тільки в інший бік. */
function dayCap(): string {
  return new Date(Date.now() + 24 * 3_600_000).toISOString().slice(0, 10);
}

async function hubDay(base: string, hdr: Record<string, string>, uid: string):
    Promise<{ hub: Hub | null; err: string }> {
  const cap = dayCap();
  /* Беремо з кінця за датою й зупиняємось на межі: уся історія нам не
     потрібна, потрібен ОСТАННІЙ день, за який щось заливали. */
  const got = await askRows(base, hdr, 'daily_stats'
    + '?select=date,account,spend,installs,regs,deposits&created_by=eq.'
    + encodeURIComponent(uid) + '&date=lte.' + cap
    + '&order=date.desc&limit=' + HUB_ROWS);
  if (got.err) return { hub: null, err: got.err };
  const rows = got.rows;

  /* Про відсічене — окремим рядком, а не мовчки. Рядок із датою з
     майбутнього псує не лише цей блок: він розтягує будь-який вибір
     періоду в дашборді, і знайти його інакше дуже важко. */
  const far = await askRows(base, hdr, 'daily_stats?select=date&created_by=eq.'
    + encodeURIComponent(uid) + '&date=gt.' + cap + '&order=date.desc&limit=1');
  const ahead = far.rows.length ? String(far.rows[0].date || '') : '';

  if (!rows.length) return { hub: null, err: ahead ? 'only-ahead:' + ahead : 'empty' };
  const day = String(rows[0].date || '');
  if (!day) return { hub: null, err: 'no-date' };

  const out: Hub = { day, spend: 0, installs: 0, regs: 0, deps: 0,
                     byCab: [], cabs: 0, cap: rows.length >= HUB_ROWS, ahead };
  const by = new Map<string, number>();
  rows.forEach(r => {
    if (String(r.date || '') !== day) return;
    out.spend += num(r.spend);
    out.installs += num(r.installs);
    out.regs += num(r.regs);
    out.deps += num(r.deposits);
    const id = String(r.account || '').trim();
    if (id) by.set(id, (by.get(id) || 0) + num(r.spend));
  });
  out.cabs = by.size;
  out.byCab = [...by.entries()].map(([id, spend]) => ({ id, spend }))
    .sort((a, b) => b.spend - a.spend);
  /* Межа важить лише тоді, коли обрізатись міг САМ останній день.
     Якщо ми й так побачили його цілком — межа нічого не зіпсувала. */
  if (out.cap && rows.filter(r => String(r.date || '') === day).length < rows.length)
    out.cap = false;
  return { hub: out, err: '' };
}

/* Наскільки старий знімок Facebook. Порожньо — його немає взагалі, і
   це теж підстава взяти дані дашборда. */
function snapTooOld(seen: string): boolean {
  if (!seen) return true;
  const at = Date.parse(seen);
  if (!Number.isFinite(at)) return true;
  return Date.now() - at > HUB_STALE_H * 3_600_000;
}

/* Те, що бот показує, збирається ОДИН раз: усі відповіді — різні
   зрізи тієї самої картини, і збирати її двічі означало б колись
   показати в двох кнопках різні числа. */
async function park(base: string, hdr: Record<string, string>, uid: string): Promise<Park> {
  /* disable_reason тут обовʼязковий: без нього бан від власного архіву
     не відрізнити, а саме це й питають у першу чергу. */
  const rows = await pick(base, hdr, 'fb_accounts'
    + '?select=account_id,name,status,disable_reason,spend_today,currency,ads_active,'
    + 'missing_since,synced_at,token_id&created_by=eq.' + encodeURIComponent(uid)
    + '&limit=500');

  /* Чий це браузер. У дашборді він береться з назви токена: другий
     шматок через підкреслення (агент_браузер_БМ). Якщо людина вписала
     профіль руками — її запис свіжіший за розбір назви, і перемагає. */
  const browser = new Map<string, string>();
  const tokName = new Map<string, string>();
  (await pick(base, hdr, 'fb_tokens?select=id,name&created_by=eq.'
    + encodeURIComponent(uid) + '&limit=200'))
    .forEach(t => tokName.set(String(t.id), String(t.name || '')));

  /* Архівовані не рахуємо — інакше бот сперечався б із дашбордом,
     де людина їх свідомо прибрала з очей. Ключ і як написано, і
     самими цифрами: підпис буває act_123…, номер — 123…. */
  const arch = new Set<string>();
  const keys = (v: unknown) => {
    const s2 = String(v == null ? '' : v).trim();
    if (!s2) return [] as string[];
    const d = s2.replace(/\D/g, '');
    return d && d !== s2 ? [s2, d] : [s2];
  };
  /* Одним запитом і архів, і профілі: два походи по ту саму таблицю
     коштували б удвічі, а відповідь потрібна та сама. Колонки profile
     може не бути — тоді PostgREST відмовить, і ми спитаємо без неї. */
  let mine = await pick(base, hdr, 'accounts_mapping'
    + '?select=account_id,fb_account_id,status,profile&created_by=eq.'
    + encodeURIComponent(uid) + '&limit=500');
  if (!mine.length) mine = await pick(base, hdr, 'accounts_mapping'
    + '?select=account_id,fb_account_id,status&created_by=eq.'
    + encodeURIComponent(uid) + '&limit=500');
  mine.forEach(r => {
    if (String(r.status || '').toLowerCase() === 'archive') {
      keys(r.account_id).forEach(k => arch.add(k));
      keys(r.fb_account_id).forEach(k => arch.add(k));
    }
    const p = String(r.profile || '').trim();
    if (p) { keys(r.account_id).forEach(k => browser.set(k, p));
             keys(r.fb_account_id).forEach(k => browser.set(k, p)); }
  });

  const out: Park = { live: 0, total: 0, ads: 0, banned: [], lost: [], sick: [], shut: [],
                      spend: {}, byCab: [], conv: {}, convCap: false, convRows: 0,
                      seen: '', frozen: 0, stale: 0, fresh: '',
                      hub: null, hubErr: '' };
  /* Валюта тих кабінетів, що ПІШЛИ в підрахунок. Нею ж нижче
     відсіюється знімок: рядка немає в цій мапі — значить кабінет
     архівований, заморожений або чужий, і його оголошення рахувати не
     можна. */
  const curOf = new Map<string, string>();
  rows.forEach(r => {
    const id = String(r.account_id || '');
    if (keys(id).some(k => arch.has(k))) return;
    out.total++;
    const name = String(r.name || id);
    const st = String(r.status || '').toLowerCase();
    /* Профіль руками переважає; інакше беремо другий шматок назви
       токена — agent_browser_BM. */
    const who = keys(id).map(k => browser.get(k)).find(Boolean)
      || String(tokName.get(String(r.token_id || '')) || '').split('_')[1] || '';
    const cab: Cab = { id, name, who: String(who).trim() };

    /* ЗАМОРОЖЕНІ ЧИСЛА В СУМУ НЕ ЙДУТЬ.

       Коли токен втрачає доступ, fb-sync навмисно НЕ стирає рядок —
       лишає останні відомі числа й ставить missing_since. Для екрана
       це правильно: видно, скільки кабінет крутив, поки його бачили.
       Але складати їх у «спенд сьогодні» означає щодня додавати те,
       чого сьогодні не було. Саме так тижневої давнини сума в чужій
       валюті трималась у звіті як жива. */
    if (r.missing_since) { out.frozen++; out.lost.push(cab); return; }

    /* ДРУГИЙ СПОСІБ ЗАСТАРІТИ — і враховувався лише перший.

       Правило поруч написане правильно: складати старі числа в «спенд
       сьогодні» означає щодня додавати те, чого сьогодні не було. Але
       застосовувалось воно до одної причини з двох.

       missing_since — це «токен утратив доступ». А буває простіше:
       токен усе бачить, доступ є, просто прогін до нього не дійшов —
       уперся в дедлайн, у ліміт Facebook, або стоїть у хвості черги.
       Тоді missing_since порожній, а spend_today у рядку лежить
       дванадцятиденний — і йшов у суму як сьогоднішній.

       Саме це й давало картину «кабінетів правильна кількість, а спенд
       неправильний»: кількість рядків застарілість не псує, а гроші
       псує повністю.

       Статус кабінета лишаємо: бан, закриття й проблеми з оплатою —
       це «останнє відоме», і воно й далі варте показу. Застаріває тут
       не стан, а обіцянка «сьогодні»: гроші й активні оголошення. */
    const snapAt = Date.parse(String(r.synced_at || ''));
    if (!Number.isFinite(snapAt) || Date.now() - snapAt > SNAP_STALE_H * 3_600_000) {
      out.stale++;
      const why0 = String(r.disable_reason || '').trim();
      if (isBanned(st, why0)) out.banned.push(why0 ? { ...cab, name: name + ' \u00b7 ' + why0 } : cab);
      else if (SHUT.includes(st)) out.shut.push(cab);
      else if (SICK.includes(st)) out.sick.push({ ...cab, name: name + ' \u00b7 ' + st });
      return;
    }

    const cur = String(r.currency || 'USD');
    const sp = num(r.spend_today);
    keys(id).forEach(k => curOf.set(k, cur));
    if (sp) {
      out.spend[cur] = (out.spend[cur] || 0) + sp;
      out.byCab.push({ ...cab, spend: sp, cur });
    }
    out.ads += num(r.ads_active);
    if (num(r.ads_active) > 0 || sp > 0) out.live++;
    const why = String(r.disable_reason || '').trim();
    if (isBanned(st, why)) {
      out.banned.push(why ? { ...cab, name: name + ' \u00b7 ' + why } : cab);
    } else if (SHUT.includes(st)) {
      /* Закритий без причини — це архів. У «потребує уваги» йому
         місця немає: нічого не сталось, так і задумано. */
      out.shut.push(cab);
    } else if (SICK.includes(st)) out.sick.push({ ...cab, name: name + ' \u00b7 ' + st });

    /* НАЙСТАРІШИЙ із тих, що пішли в суму, а не найсвіжіший з усіх.
       Брали max — і підпис казав «5 хв тому», поки частина чисел була
       тижневої давнини. Чесна обіцянка тут одна: усе, що ви бачите,
       не старіше за це. */
    const at = String(r.synced_at || '');
    if (at && (!out.seen || at < out.seen)) out.seen = at;
  });

  /* Спершу валюта, потім спенд. Складати валюти не можна, але й
     ПЕРЕМІШУВАТИ їх у списку не варто: 300 \u20B4 над 120 $ читається як
     «тут витрачено більше», а це не так. Порядок валют — той самий,
     що в підсумковому рядку. */
  const curRank = Object.keys(out.spend);
  out.byCab.sort((a, b) => a.cur === b.cur ? b.spend - a.spend
    : curRank.indexOf(a.cur) - curRank.indexOf(b.cur));

  /* ── КЛАЦАННЯ, ЛІДИ, РЕЄСТРАЦІЇ, ДЕПОЗИТИ ──

     Їх немає в рядку кабінета: fb_accounts знає спенд і показники, а
     події — тільки знімок оголошень, той самий, з якого живе таблиця
     кампаній. Тому беремо його й зводимо.

     СПЕНД ТУТ ОКРЕМИЙ, і це головне в усьому блоці. Ціна ліда — це
     спенд ТИХ оголошень, чиї ліди ми порахували. Поділивши підсумок
     кабінета на ліди знімка, ми завищили б ціну на все, що в знімок не
     входить (видалені й архівні оголошення), і не сказали б про це
     жодним словом.

     order=ad_id обов'язковий: offset без упорядкування PostgREST
     виконує як завгодно, і сторінки можуть перекритись або розійтись —
     тобто частина оголошень порахувалась би двічі, а частина зникла. */
  let all = false;
  for (let page = 0; page < SNAP_PAGES; page++) {
    const part = await pick(base, hdr, 'fb_ad_today'
      + '?select=account_id,spend,link_clicks,actions'
      + '&created_by=eq.' + encodeURIComponent(uid)
      + '&order=ad_id&limit=' + SNAP_PAGE + '&offset=' + (page * SNAP_PAGE));
    part.forEach(r => {
      const cur = curOf.get(String(r.account_id || ''));
      if (!cur) return;
      const c = out.conv[cur] || (out.conv[cur] =
        { spend: 0, clicks: 0, leads: 0, regs: 0, deps: 0 });
      c.spend += num(r.spend);
      /* Клац ПО ПОСИЛАННЮ, а не будь-який: саме його показує CPC у
         таблиці кампаній, і саме за нього платять. clicks рахує ще й
         лайки з розгортань — із ним ціна клацання вийшла б меншою за
         справжню. */
      c.clicks += num(r.link_clicks);
      const acts = Array.isArray(r.actions) ? r.actions as unknown[] : [];
      c.leads += leadCount(acts);
      c.regs += pickAct(acts, EV_REG);
      c.deps += pickAct(acts, EV_DEP);
      out.convRows++;
    });
    if (part.length < SNAP_PAGE) { all = true; break; }
  }
  out.convCap = !all;

  /* ЗАПАСНЕ ДЖЕРЕЛО — лише коли перше справді мовчить.

     Тягнути другий набір чисел завжди було б гірше, ніж не тягнути
     зовсім: у двох блоках стояли б різні суми про «сьогодні», і
     довіряти перестали б обом. Тому дивимось на вік знімка: свіжий —
     і жодного слова про дашборд; старий або його немає — беремо те,
     що людина й так бачить на екрані, і підписуємо датою. */
  /* out.stale тут обовʼязковий, і це не дрібниця: відсіявши застарілі,
     ми зробили out.seen свіжим — тобто саму ознаку, по якій бралися
     числа дашборда, і стерли. Без цієї умови лікування вади сховало б
     запасне джерело рівно там, де воно найпотрібніше. */
  if (snapTooOld(out.seen) || out.stale) {
    const h = await hubDay(base, hdr, uid);
    out.hub = h.hub;
    /* «empty» — це не поломка, а чесна відповідь: імпорту ще не було.
       Решту кажемо дослівно: саме через проглочену відмову бот і
       виглядав порожнім при повній базі. */
    out.hubErr = h.hub ? '' : h.err;
  }
  return out;
}

/* Айді — щоб кабінет можна було знайти, не гадаючи за назвою. Браузер
   — щоб знати, куди йти його відкривати. Назва без цих двох змушує
   шукати руками саме тоді, коли щось горить. */
const list = (a: Cab[], max: number): string =>
  a.slice(0, max).map(x => '   \u2022 ' + x.name + '\n     ' + x.id
    + (x.who ? ' \u00b7 ' + x.who : '')).join('\n')
  + (a.length > max ? '\n   …і ще ' + (a.length - max) : '');

const spendLine = (p: Park): string => {
  const cur = Object.keys(p.spend);
  /* Валюти НЕ складаємо. Сто доларів і сто гривень — це не двісті
     чогось, а число, якому не можна вірити. */
  return cur.length ? cur.map(c => money(p.spend[c], c)).join(' + ') : '\u2014';
};

/* Підпис під будь-якою відповіддю: коли ці числа востаннє оновлювались.
   Без нього все читається як «просто зараз», а воно може бути
   годинної давності — бот не питає Facebook, він показує те, що привіз
   останній прогін синхронізації. */
/* ПІДПИС — ОДИН РЯДОК.

   Було пʼять: вік, що сталося з оновленням, версія функції, заморожені,
   застарілі. Кожен писався як пояснення — і разом вони стали стіною
   тексту під кожною відповіддю, яку перестають читати цілком. А тоді
   мовчанням стає вже вона сама: потрібне тоне разом із рештою.

   Лишаємо те, без чого числа брехали б. Вік — бо «спенд сьогодні»
   дванадцятиденної давнини це не сьогодні. Кількість невключених — бо
   сума без них менша за справжню, і без цифри це виглядає як
   загублений спенд. Причини (заморожений / застарілий) складаємо в
   одне число: дія з них однакова — піти подивитись у Cabinets, де
   кожен кабінет підписаний окремо.

   Версію функції прибрано з підпису й лишено тільки в рядку помилки:
   «це взагалі задеплоєно?» питають саме тоді, коли щось не вийшло. */
const seenLine = (p: Park): string => {
  const out = p.frozen + p.stale;
  return (p.seen ? '\n\n\u{1F551} ' + ago(p.seen)
                 : '\n\n\u{1F551} синхронізації ще не було')
    + (out ? ' \u00b7 ' + out + ' не враховано' : '')
    + (p.fresh ? '\n\u26A0 ' + p.fresh + ' \u00b7 ' + FN_VERSION : '');
};

/* Кількість і ціна в один рядок. Кількість без ціни не відповідає на
   питання «дорого чи ні», ціна без кількості — на питання «а чи є з
   чого її рахувати»: 50$ за лід при одному ліді й при сорока — це дві
   різні новини. */
const CONV_ROWS: [string, (c: Conv) => number][] = [
  ['Клацань', c => c.clicks], ['Лідів', c => c.leads],
  ['Реєстрацій', c => c.regs], ['Депозитів', c => c.deps]
];

/* Розділювач тисяч — як у сумах: 1240 і 1,240 читаються з різною
   швидкістю, а поруч із грошима, де він уже є, його відсутність
   виглядає як інше число. */
const cnt = (n: number): string => n.toLocaleString('en-US');

const convLines = (c: Conv, cur: string, pad: string): string =>
  CONV_ROWS.map(([label, get]) => pad + label + ': ' + cnt(get(c))
    + ' \u00b7 ' + per(c.spend, get(c), cur)).join('\n');

/* ЧОМУ СПЕНД У ЦЬОМУ БЛОЦІ МОЖЕ НЕ ЗБІГТИСЬ ІЗ ПІДСУМКОМ.

   Конверсії живуть у знімку оголошень, а в ньому немає видалених і
   архівних: вони витратили гроші, але Facebook їх у списку вже не
   віддає. Ціни ми рахуємо зі спенда самого знімка — інакше вони
   завищились би на цю різницю. Поки різниця в межах округлення, про
   неї нема чого говорити; коли перестає бути — кажемо, скільки саме
   спенда пішло в ціни. */
const covNote = (p: Park): string => {
  const parts: string[] = [];
  Object.keys(p.spend).forEach(cur => {
    const total = p.spend[cur];
    const got = (p.conv[cur] || { spend: 0 }).spend;
    if (total > 0 && got < total * 0.98)
      parts.push(cur + ' ' + Math.round(got / total * 100) + '%');
  });
  return parts.length
    ? '\n\u2139 ціни рахую зі спенда оголошень у знімку (' + parts.join(', ')
      + '): решта \u2014 на оголошеннях, яких у ньому вже немає.'
    : '';
};

function convBlock(p: Park): string {
  const curs = Object.keys(p.conv).filter(c => {
    const x = p.conv[c];
    return x.spend || x.clicks || x.leads || x.regs || x.deps;
  });
  /* Нічого не знайшли — так і кажемо. Чотири нулі виглядали б як
     «конверсій немає», хоч насправді немає знімка: таблиці ще не
     створили або синхронізація до неї не дійшла. Це різні новини, і
     друга означає, що треба йти щось робити. */
  if (!curs.length) return '\n\u2139 Клацань і конверсій не бачу: знімок '
    + 'оголошень порожній \u2014 або синхронізація ще не ходила, або в базі '
    + 'не виконано FB_RULES.sql.\n';
  /* Одна валюта — рівний список. Кілька — РОЗДІЛЬНО: ціна ліда в
     доларах і в гривнях не складається в одне число, а поставлені
     поруч без підпису валюти вони читаються як одне. */
  const body = curs.length === 1
    ? convLines(p.conv[curs[0]], curs[0], '')
    : curs.map(c => c + ':\n' + convLines(p.conv[c], c, '   ')).join('\n');
  /* Примітки — окремим абзацом, а не впритул до того, що йде далі:
     злиплі рядки читаються як один список, і «потребує уваги» нижче
     виглядало б частиною приписки про ціни. */
  const notes = (p.convCap ? '\n\u26A0 оголошень більше за ' + (SNAP_PAGE * SNAP_PAGES)
         + ' \u2014 конверсії порахував по перших.' : '') + covNote(p);
  return '\n' + body + '\n' + (notes ? notes + '\n' : '');
}

/* Айді, а не лише назва: саме ним кабінет шукають в Ads Manager і в
   антидетекті. Браузер — щоб знати, куди йти його відкривати. */
const cabSpendList = (p: Park): string => {
  if (!p.byCab.length) return '';
  const max = 20;
  return 'По кабінетах:\n'
    + p.byCab.slice(0, max).map(x => '   \u2022 ' + x.id
        + (x.who ? ' \u00b7 ' + x.who : '')
        + ' \u2014 ' + money(x.spend, x.cur)).join('\n')
    + (p.byCab.length > max ? '\n   …і ще ' + (p.byCab.length - max) : '')
    + '\n\n';
};

/* ─────────── ЧИСЛА ДАШБОРДА В ВІДПОВІДІ ───────────

   ОКРЕМИМ блоком, із датою в заголовку й підписаним джерелом.
   Підмішати їх до «Спенд сьогодні» було б найзручніше й найгірше: це
   інша обіцянка (останній залитий день, а не сьогодні) з іншого
   джерела (імпорт, а не Facebook). Два набори чисел під одним
   підписом — найкоротший шлях утратити довіру до обох.

   Валюта — долар, і це не припущення навмання: дашборд рахує
   daily_stats саме так на кожному екрані. Якщо колись перестане —
   виправляти треба в обох місцях разом.

   Ціни тут рахуємо тими самими дробами, що й дашборд: інсталь, реєстр
   і деп від спенда того ж дня. */
const HUB_ROWS_OUT: [string, (h: Hub) => number][] = [
  ['Інсталів', h => h.installs], ['Реєстрацій', h => h.regs],
  ['Депозитів', h => h.deps]
];

const hubCabList = (h: Hub): string => {
  if (!h.byCab.length) return '';
  const max = 20;
  return '\nПо кабінетах:\n'
    + h.byCab.slice(0, max).map(x => '   \u2022 ' + x.id
        + ' \u2014 ' + money(x.spend, 'USD')).join('\n')
    + (h.byCab.length > max ? '\n   …і ще ' + (h.byCab.length - max) : '') + '\n';
};

function hubBlock(p: Park, withCabs: boolean): string {
  const h = p.hub;
  if (!h) {
    /* Знімок старий, і запасу теж немає. Сказати ЧОМУ — єдина
       причина, через яку цей рядок узагалі існує: саме тут бот і
       замовкав, залишаючи людину з числами тижневої давнини й без
       жодної підказки, куди йти. */
    if (!p.hubErr) return '';
    return '\n\u{1F4D1} Числа дашборда теж не дістав: '
      + (p.hubErr === 'empty'
          ? 'у daily_stats порожньо \u2014 залийте вивантаження'
          : p.hubErr === 'no-date'
            ? 'у рядках немає дати'
            : p.hubErr.startsWith('only-ahead:')
              /* Єдине, що є в таблиці — рядки з майбутнього. Сказати тут
                 «нічого немає» означало б послати людину заливати те,
                 що вже залито, замість того, щоб показати биту дату. */
              ? 'усі дати в daily_stats з майбутнього (до '
                + p.hubErr.slice('only-ahead:'.length) + ') \u2014 зʼїхав стовпчик дати'
              : p.hubErr)
      + '\n';
  }
  const lines = HUB_ROWS_OUT.filter(([, get]) => get(h) > 0)
    .map(([label, get]) => label + ': ' + cnt(get(h))
      + ' \u00b7 ' + per(h.spend, get(h), 'USD'));
  /* «(імпорт)» у заголовку замість окремого рядка знизу: обіцянка та
     сама, а рядком менше. Сплутати з Facebook усе одно не вийде. */
  return '\n\u{1F4D1} Дашборд (імпорт) \u00b7 ' + h.day
    + (h.ahead ? ' \u00b7 є биті дати (до ' + h.ahead + ')' : '') + '\n'
    + 'Спенд: ' + money(h.spend, 'USD')
    + (h.cabs ? ' \u00b7 ' + h.cabs + ' кабінет(ів)' : '') + '\n'
    + (lines.length ? lines.join('\n') + '\n' : '')
    + (withCabs ? hubCabList(h) : '')
    + (h.cap ? '\u26A0 рядків більше за ' + HUB_ROWS + '\n' : '');
}

function cardSum(p: Park): string {
  const bad = p.banned.length + p.lost.length + p.sick.length;
  return '\u{1F4CA} Зведення\n\n'
    + 'Крутять: ' + p.live + ' з ' + p.total + '\n'
    + 'Оголошень активних: ' + p.ads + '\n'
    + 'Спенд сьогодні: ' + spendLine(p) + '\n'
    + convBlock(p)
    + hubBlock(p, false)
    + (bad ? '\n\u26A0 Потребує уваги: ' + bad + '\n'
           + (p.banned.length ? 'Забанені: ' + p.banned.length + '\n' : '')
           + (p.lost.length ? 'Токен не бачить: ' + p.lost.length + '\n' : '')
           + (p.sick.length ? 'Проблеми з оплатою: ' + p.sick.length + '\n' : '')
       : '\n\u2705 Проблемних кабінетів немає\n')
    /* Закриті — ПОЗА «потребує уваги». Вони там і стояли, під словом
       «Забанені», і саме через це щоранку виглядало, ніби вчора
       забанили ще три. */
    + (p.shut.length ? 'Закриті (свій архів): ' + p.shut.length + '\n' : '')
    + seenLine(p);
}

function cardSpend(p: Park): string {
  /* Порожній блок не має додавати порожнього рядка: зайвий відступ
     читається як «тут щось мало бути». */
  const hb = hubBlock(p, true);
  return '\u{1F4B0} Спенд сьогодні\n\n' + spendLine(p) + '\n\n'
    /* Підсумок не каже, КУДИ пішли гроші, — а наступне питання завжди
       саме це. Поки розкладу не було, за ним ішли в дашборд. */
    + cabSpendList(p)
    + (hb ? hb + '\n' : '')
    + 'Крутять: ' + p.live + ' кабінет(ів), ' + p.ads + ' оголошень'
    + seenLine(p);
}

function cardCabs(p: Park): string {
  if (!p.total) return '\u{1F5C2} Кабінетів не знайшлось.\n\n'
    + 'Або синхронізація ще не проходила, або токен не додано.'
    /* Знімка Facebook немає — але в імпорті кабінети є, і сказати
       «не знайшлось» на цьому місці означало б збрехати найгрубіше:
       людина їх бачить у дашборді просто зараз. Статусів із імпорту
       не буває, тож і не обіцяємо їх — кажемо, скільки кабінетів
       крутило й за який день. */
    + (p.hub && p.hub.cabs
        ? '\n\n\u{1F4D1} А в дашборді за ' + p.hub.day + ' їх ' + p.hub.cabs
          + ': спенд є, статусів у імпорті немає \u2014 за ними потрібна '
          + 'синхронізація.'
        : '');
  /* Тихі рахуємо відніманням, і заморожені теж треба відняти —
     інакше їхня кількість двічі потрапляє в підсумок. */
  const quiet = p.total - p.live - p.banned.length - p.lost.length
              - p.sick.length - p.shut.length;
  return '\u{1F5C2} Кабінети: ' + p.total + '\n\n'
    + 'Крутять: ' + p.live + '\n'
    + 'Тихі: ' + (quiet > 0 ? quiet : 0) + '\n'
    + (p.banned.length ? '\n\u{1F534} Забанені (' + p.banned.length + '):\n'
        + list(p.banned, 8) + '\n' : '')
    + (p.lost.length ? '\n\u{1F7E3} Токен не бачить (' + p.lost.length + '):\n'
        + list(p.lost, 8) + '\n' : '')
    + (p.sick.length ? '\n\u{1F7E1} Оплата (' + p.sick.length + '):\n'
        + list(p.sick, 8) + '\n' : '')
    /* Закриті — своїм заголовком і своїм (спокійним) кольором. Раніше
       вони лежали під 🔴 «Забанені», і кожен ранок читався як розгром. */
    + (p.shut.length ? '\n\u{1F4E6} Закриті \u2014 свій архів (' + p.shut.length + '):\n'
        + list(p.shut, 8) + '\n' : '')
    + seenLine(p);
}

async function cardDom(base: string, hdr: Record<string, string>,
                       uid: string): Promise<string> {
  const rows = await pick(base, hdr, 'domains'
    + '?select=domain,status,broken_since&created_by=eq.' + encodeURIComponent(uid)
    + '&limit=500');
  if (!rows.length) return '\u{1F310} Доменів у списку немає.';
  const bad = rows.filter(r => ['down', 'notfound', 'danger']
    .includes(String(r.status || '').toLowerCase()));
  if (!bad.length) return '\u{1F310} Домени: ' + rows.length
    + '\n\n\u2705 Усі відповідають.';
  const WORD: Record<string, string> = {
    down: 'не відповідає', notfound: '404', danger: 'мітка' };
  return '\u{1F310} Домени: ' + rows.length + '\n\n'
    + '\u26A0 Зламані: ' + bad.length + '\n'
    + bad.slice(0, 12).map(r => '   \u2022 ' + r.domain + ' \u2014 '
        + (WORD[String(r.status)] || r.status)).join('\n')
    + (bad.length > 12 ? '\n   …і ще ' + (bad.length - 12) : '');
}

const MENU = 'Що показати?';

Deno.serve(async (req) => {
  /* Telegram чекає 200 майже на все. Відповідь 500 він вважає збоєм і
     надсилає те саме повідомлення знову і знову — тож помилки ковтаємо
     тут, а не віддаємо назовні. */
  try {
    return await handle(req);
  } catch (_e) {
    return new Response('ok', { status: 200 });
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const want = Deno.env.get('TG_WEBHOOK_SECRET') || '';
  const got = req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  /* Секрет обов'язковий. Якщо його не налаштували, функція не
     «працює без захисту», а не працює взагалі: інакше адресу бота
     міг би смикати будь-хто, хто її вгадав. */
  if (!want || !sameSecret(got, want)) return new Response('forbidden', { status: 403 });

  const token = Deno.env.get('TG_BOT_TOKEN') || '';
  const base = Deno.env.get('SUPABASE_URL') || '';
  const svc = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!token || !base || !svc) return new Response('ok', { status: 200 });

  /* Від сервісної ролі, бо інакше нічого не вийде: шукати рядок за
     кодом треба ДО того, як стане відомо, чий він, а RLS саме цього й
     не дозволяє. */
  const hdr = { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json' };

  const upd = await req.json();

  /* ── натиснули inline-кнопку ── */
  /* Клавіатура тепер звичайна, під полем вводу, і callback не шле. Але
     повідомлення з inline-кнопками, надіслані раніше, лишаються в
     чаті назавжди — і хтось їх таки натисне. Викинути цю гілку
     означало б, що стара кнопка мовчки не працює. */
  const cb = upd?.callback_query;
  if (cb) {
    const cbChat = cb?.message?.chat?.id;
    // Кнопку відпускаємо ПЕРШОЮ дією: поки цього не зробиш, вона
    // крутиться, і бот виглядає мертвим, хоч і працює.
    await ackButton(token, String(cb.id || ''));
    if (cbChat) await answer(token, base, hdr, cbChat, String(cb.data || 'sum'));
    return new Response('ok', { status: 200 });
  }

  const msg = upd?.message || upd?.edited_message;
  const chat = msg?.chat?.id;
  const text = String(msg?.text || '').trim();
  if (!chat || !text) return new Response('ok', { status: 200 });

  const who = msg?.from?.username ? '@' + msg.from.username
            : [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(' ') || null;

  /* ── /start із кодом ── */
  if (text.startsWith('/start')) {
    const code = text.slice('/start'.length).trim();
    if (!code) {
      await reply(token, chat,
        'Привіт. Я надсилаю сповіщення про домени: що за ніч отримало мітку, '
        + 'перестало відповідати або віддає 404.\n\n'
        + 'А ще показую стан парку на запит: /status, /spend, /cabs, /domains.\n\n'
        + 'Щоб я знав, чиї кабінети й домени вам показувати, відкрийте дашборд → '
        + 'Settings → Telegram alerts → Connect Telegram. Там буде посилання, '
        + 'яке все зробить само.');
      return new Response('ok', { status: 200 });
    }

    const res = await fetch(base + '/rest/v1/tg_links'
      + '?select=user_id,email,team_name,code,code_expires'
      + '&code=eq.' + encodeURIComponent(code) + '&limit=1', { headers: hdr });
    const rows: Link[] = res.ok ? await res.json() : [];
    const row = rows[0];

    if (!row) {
      await reply(token, chat,
        'Цей код не підходить. Найчастіше це означає, що ним уже скористались — '
        + 'код одноразовий.\n\nВізьміть новий: дашборд → Settings → Telegram alerts → '
        + 'Connect Telegram.');
      return new Response('ok', { status: 200 });
    }
    if (row.code_expires && Date.parse(row.code_expires) < Date.now()) {
      await reply(token, chat,
        'Термін коду вийшов. ' + CODE_LIFE_HINT + '\n\n'
        + 'Візьміть новий: дашборд → Settings → Telegram alerts → Connect Telegram.');
      return new Response('ok', { status: 200 });
    }

    /* Код згоряє тут-таки, разом із записом чату. Один запит, тож
       двічі скористатись ним не вийде навіть у перегонах. */
    const patch = await fetch(base + '/rest/v1/tg_links?user_id=eq.' + encodeURIComponent(row.user_id), {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ chat_id: String(chat), tg_name: who,
                             linked_at: new Date().toISOString(),
                             code: null, code_expires: null })
    });
    if (!patch.ok) {
      const why = await patch.text();
      /* Найімовірніше спрацював унікальний індекс на chat_id: цей
         Telegram уже прив'язаний до іншого акаунта. Мовчати тут не
         можна — ззовні це виглядало б як «бот не відповів». */
      await reply(token, chat, /23505|duplicate/i.test(why)
        ? 'Цей Telegram уже прив\'язаний до іншого акаунта дашборда.\n\n'
          + 'Спершу відв\'яжіть його: надішліть мені /stop, а потім спробуйте код ще раз.'
        : 'Не вдалось зберегти зв\'язок. Спробуйте ще раз за хвилину.');
      return new Response('ok', { status: 200 });
    }

    await reply(token, chat,
      'Готово. Сповіщення про домени приходитимуть сюди.\n\n'
      + 'Акаунт: ' + (row.email || 'без пошти')
      + (row.team_name ? '\nКоманда: ' + row.team_name : '')
      + '\n\nПисатиму вранці і тільки тоді, коли є про що: домен отримав мітку, '
      + 'перестав відповідати або віддає 404. Якщо за ніч нічого не змінилось — мовчу.\n\n'
      + 'Відв\'язати будь-коли: /stop');
    return new Response('ok', { status: 200 });
  }

  /* ── /stop ── */
  if (text.startsWith('/stop')) {
    const res = await fetch(base + '/rest/v1/tg_links?chat_id=eq.' + encodeURIComponent(String(chat)), {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=representation' },
      body: JSON.stringify({ chat_id: null, tg_name: null, linked_at: null })
    });
    const rows = res.ok ? await res.json() : [];
    await reply(token, chat, rows.length
      ? 'Відв\'язано. Більше сюди не пишу.\n\nПередумаєте — дашборд → Settings → '
        + 'Telegram alerts → Connect Telegram.'
      : 'Цей чат ні до чого не прив\'язаний, тож і відв\'язувати нема чого.');
    return new Response('ok', { status: 200 });
  }

  /* ── запит про стан ── */
  const ASK: Record<string, string> = {
    '/status': 'sum', '/sum': 'sum', '/spend': 'spend',
    '/cabs': 'cabs', '/cabinets': 'cabs', '/domains': 'dom', '/menu': 'menu'
  };
  const cmd = BTN[text] || ASK[text.split(/[\s@]/)[0].toLowerCase()];
  if (cmd) {
    await answer(token, base, hdr, chat, cmd);
    return new Response('ok', { status: 200 });
  }

  /* ── усе інше ── */
  await reply(token, chat,
    'Що я вмію:\n\n'
    + '/status — зведення: скільки крутить, спенд, що зламалось\n'
    + '/spend — спенд за сьогодні\n'
    + '/cabs — кабінети докладніше\n'
    + '/domains — стан доменів\n'
    + '/menu — кнопки замість команд\n\n'
    + '/start <код> — прив\'язати цей чат до акаунта дашборда\n'
    + '/stop — відв\'язати\n\n'
    + 'Код береться в дашборді: Settings → Telegram alerts → Connect Telegram.',
    KEYS);
  return new Response('ok', { status: 200 });
}

/* Одна відповідь на всі входи — і команду, і кнопку. Інакше вони рано
   чи пізно розійшлись би, і /spend показував би не те, що кнопка
   «Спенд». */
async function answer(token: string, base: string, hdr: Record<string, string>,
                      chat: number | string, kind: string): Promise<void> {
  const link = await whoIs(base, hdr, chat);
  /* Чат не прив'язаний — жодних чисел. Бот ходить ключем сервісної
     ролі й бачить усе; показати стан парку тому, хто просто знайшов
     бота в пошуку, було б найдешевшою витокою з можливих. */
  if (!link || !link.user_id) {
    await reply(token, chat,
      'Цей чат ще не прив\'язаний до акаунта, тож показувати нема чого.\n\n'
      + 'Дашборд → Settings → Telegram alerts → Connect Telegram.');
    return;
  }
  if (kind === 'menu') { await reply(token, chat, MENU, KEYS); return; }
  if (kind === 'dom') {
    await reply(token, chat, await cardDom(base, hdr, link.user_id), KEYS);
    return;
  }
  /* Спершу оновлення, потім читання. Навпаки було б безглуздо: ми
     прочитали б старе, оновили базу й показали прочитане. */
  const f = await freshen(base, hdr, link.user_id);
  const p = await park(base, hdr, link.user_id);
  p.fresh = f.note;
  const text = kind === 'spend' ? cardSpend(p)
             : kind === 'cabs'  ? cardCabs(p)
             : cardSum(p);
  await reply(token, chat, text, KEYS);
}
