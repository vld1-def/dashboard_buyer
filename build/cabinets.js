/* ═══════════ CABINETS ═══════════
   Сторінка парку кабінетів. Три джерела, і вони НЕ рівноцінні.

     Facebook (fb_accounts, наповнює fb-sync щогодини) — знає напевно,
       чи кабінет вимкнено і за що, скільки відкручено сьогодні, скільки
       живого всередині. До нього бан тут виявлявся єдиним способом: хтось
       помічав і ставив галочку руками. Забанений кабінет виглядав просто
       «тихим», як і той, що просто взяв вихідний.

     Гроші (daily_stats) — історія: скільки за період, коли вперше й
       востаннє. Facebook цього не дасть: він віддає сьогодні.

     Людина (accounts_mapping) — те, чого не знає ніхто інший: чий це
       агент, який профіль, логін, і «живий, але ми його відклали».

   У СПИСКУ РІВНО ТЕ, ЩО ТОКЕН БАЧИТЬ ЗАРАЗ — і нічого більше.

   Довго тут було інакше: рядки народжувались із accounts_mapping, тож
   у таблиці сиділи кабінети, про які ми не знали нічого, крім того, що
   колись хтось вписав їх руками. Стан у них угадувався з мовчання
   звітів, чисел усередині не існувало, і єдине, що вони робили —
   розбавляли список рядками, яким не можна вірити.

   Тепер accounts_mapping рядків НЕ породжує. Вона лишилась там, де
   справді потрібна: у ній записано те, чого Facebook не знає й не
   скаже — чий це агент, який профіль, логін, картка, нотатка. Це
   додається до живого кабінета, а не вигадує власний.

   Зниклого (missing_since) тут теж немає: його числа заморожені на
   останньому, що встиг побачити токен, і серед живих вони брехали б
   свіжістю. Мовчазним зникнення не стає — про нього кричить Telegram
   і стрічка подій, яка живе на цій самій сторінці. */

/* SILENT ЗВІДСИ ПРИБРАНО. Він означав «гроші були, але не в останній
   імпортований день» — а це майже завжди говорило не про кабінет, а
   про те, що вечірній імпорт ще не приїхав. Жовтим світилось те, з чим
   нічого робити не треба, і поруч із справжніми бідами це знецінювало
   сам колір. Такі кабінети тепер Running.

   ARCHIVED, навпаки, ставить людина. Це єдиний спосіб прибрати з очей
   старі кабінети, не видаляючи їх: історія витрат лишається, а рядок
   більше не заважає в робочому списку. Автоматика його не ставить і не
   знімає — висновок «цим ми більше не користуємось» вона зробити не
   вміє. */
const CAB_STATE = {
  running: { label: 'Running',   dot: '#22C55E', tone: 'text-emerald-400', soft: 'rgba(34,197,94,.14)',  bd: 'rgba(34,197,94,.30)' },
  issue:   { label: 'Issue',     dot: '#F59E0B', tone: 'text-amber-400',   soft: 'rgba(245,158,11,.10)', bd: 'rgba(245,158,11,.25)' },
  banned:  { label: 'Banned',    dot: '#EF4444', tone: 'text-red-400',     soft: 'rgba(239,68,68,.14)',  bd: 'rgba(239,68,68,.32)' },
  review:  { label: 'In review', dot: '#38BDF8', tone: 'text-sky-400',     soft: 'rgba(56,189,248,.12)', bd: 'rgba(56,189,248,.30)' },
  /* Idle, а не «Never ran»: сюди потрапляє і кабінет, який ще не
     починали, і той, що відпрацював і стоїть. Спільне в них одне —
     зараз нічого не крутиться, і саме це підпис і має казати. У
     рядку, де ми справді знаємо, що кабінет не крутив жодного разу,
     так і написано (див. cabEverRan). */
  idle:    { label: 'Idle',      dot: '#6C6C76', tone: 'text-muted-dynamic', soft: 'var(--surface-2)',   bd: 'var(--border)' },
  /* Токен більше не бачить цей кабінет. Це не «нема кабінета» — це
     «нема очей»: числа лишились останніми відомими, і саме заради них
     рядок і потрібен. */
  notoken: { label: 'No token',   dot: '#A855F7', tone: 'text-fuchsia-400', soft: 'rgba(168,85,247,.12)', bd: 'rgba(168,85,247,.30)' },
  archived: { label: 'Archived',  dot: '#6C6C76', tone: 'text-muted-dynamic', soft: 'var(--surface-2)',   bd: 'var(--border)' }
};
// Порядок = що першим потрапляє на очі. Зверху те, що вимагає дії,
// внизу — те, що прибрали руками.
const CAB_ORDER = ['banned', 'notoken', 'issue', 'review', 'running', 'idle', 'archived'];
/* «Working» — те, з чим справді працюєш. Навмисне НЕ тільки running:
   issue якраз і є ті, що вимагають уваги, ховати їх за замовчуванням
   було б рівно навпаки до сенсу сторінки. Ховаємо лише мертвий вантаж
   — бани, архів і ті, що не крутили жодного разу. */
const CAB_WORKING = ['running', 'issue', 'review'];
// Колонки «де це було» можуть ще не існувати в базі — сторінка працює й без них.
const CAB_EXTRA = [
  { key: 'bm',      label: 'Business Manager' },
  { key: 'profile', label: 'Browser profile' },
  { key: 'login',   label: 'Login' },
  { key: 'card',    label: 'Card' }
];

let cabRows = [], cabFilter = 'working', cabGroup = 'agent', cabSel = null;
let cabCols = {}, cabLoaded = false;
let cabSort = { key: 'state', dir: 1 };

/* Те, що приїхало з Facebook. Таблиці може не бути зовсім (FB_SYNC.sql
   ще не виконано) — тоді cabFb лишається порожнім, обидві секції
   злипаються в одну, і сторінка працює рівно як раніше. */
let cabFb = [], cabFbErr = '', cabFbOld = '', cabAll = [];
/* Скільки рядків віддала база ДО відсіву по команді. Різниця між цим
   числом і довжиною cabFb — це рівно те, що ми сховали навмисно, і
   про що треба сказати, якщо після відсіву не лишилось нічого. */
let cabFbRaw = 0;
/* Написи чужих команд, що трапились у відповіді. */
let cabFbTeams = [];
/* Твої рядки з accounts_mapping, яким не знайшлось живого кабінета.
   Потрібні рівно в одному місці — у селекті ручної прив'язки. */
let cabFree = [];

/* Витрати за вибраний період: номер кабінета — сума. Окремо від
   cabFb, бо це інша таблиця й інша доля: fb_spend_daily могло ще не
   бути створено, і тоді період вибрати можна, а от показати за нього
   нічого — про що треба сказати вголос, а не малювати прочерки. */
let cabDays = {}, cabDaysErr = '';

/* Назви токенів за їх id. Потрібні не заради краси: у назві токена вже
   записано те, чого Facebook не знає й ніколи не скаже. */
let cabTokens = {};

const cabEsc = v => String(v == null ? '' : v)
  .replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* ── за який період дивимось витрати ──

   Довго тут було одне число — сьогодні. Воно відповідає рівно на
   одне питання й мовчить про решту: чи кабінет узагалі крутив цього
   тижня, чи просто сьогодні зранку ще ні. Різниця між цими двома
   станами й вирішує, чи йти його рятувати.

   Тепер період вибирається, а числа беруться з fb_spend_daily —
   по днях, як їх бачить Facebook. Вибір запамʼятовується.

   День у базі — у часовому поясі САМОГО кабінета. Межі періоду ми
   рахуємо у вашому. Для парку в одному поясі це те саме; для парку,
   розкиданого по світу, край періоду може розійтись на добу — і це
   чесніше, ніж зводити все до однієї дати, якої немає в жодному
   звіті Facebook. */
let cabRange = { key: 'today', since: '', until: '' };
try {
  const raw = JSON.parse(localStorage.getItem('cab_range') || 'null');
  if (raw && raw.key) cabRange = { key: raw.key, since: raw.since || '', until: raw.until || '' };
} catch (e) {}

/* Пресети «7 days» і «30 days» прибрано на прохання: дивляться сюди
   майже завжди за сьогодні, а довші відрізки лишились у Custom, де їх
   можна взяти точніше. Ключі 7d/30d у cabRangeDates навмисно лишаються
   робочими — у когось вони вже збережені в браузері, і ламати збережене
   заради двох кнопок не варто. */
const CAB_RANGES = [
  ['today', 'Today'], ['yest', 'Yesterday'], ['month', 'This month']
];

const cabDay = n => {
  const t = new Date();
  t.setDate(t.getDate() - n);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0')
       + '-' + String(t.getDate()).padStart(2, '0');
};

/* Межі вибраного періоду, завжди since <= until. Порожні поля в
   ручному режимі не вважаємо помилкою: одна дата означає один день. */
/* Перше число поточного місяця. Рахуємо з календаря, а не як «мінус
   30 днів»: «цей місяць» першого числа означає один день, а не місяць
   назад, і різниця тут якраз та, заради якої кнопку й просили. */
const cabMonthStart = () => {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-01';
};

function cabRangeDates() {
  if (cabRange.key === 'yest') return [cabDay(1), cabDay(1)];
  if (cabRange.key === 'month') return [cabMonthStart(), cabDay(0)];
  if (cabRange.key === '7d')   return [cabDay(6), cabDay(0)];
  if (cabRange.key === '30d')  return [cabDay(29), cabDay(0)];
  if (cabRange.key === 'custom') {
    const a = cabRange.since || cabRange.until || cabDay(0);
    const b = cabRange.until || cabRange.since || cabDay(0);
    return a <= b ? [a, b] : [b, a];
  }
  return [cabDay(0), cabDay(0)];
}

const cabNiceDay = d => {
  const t = new Date(d + 'T00:00:00');
  return isNaN(t) ? d : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function cabRangeLabel() {
  const fixed = CAB_RANGES.find(r => r[0] === cabRange.key);
  if (fixed) return fixed[1];
  const [a, b] = cabRangeDates();
  return a === b ? cabNiceDay(a) : cabNiceDay(a) + ' \u2013 ' + cabNiceDay(b);
}

window.cabSetRange = async function (key) {
  cabRange = { key, since: cabRange.since, until: cabRange.until };
  if (key === 'custom' && !cabRange.since && !cabRange.until) {
    cabRange.since = cabDay(6);
    cabRange.until = cabDay(0);
  }
  try { localStorage.setItem('cab_range', JSON.stringify(cabRange)); } catch (e) {}
  await cabDaysLoad();
  cabRender();
};

window.cabSetRangeDay = async function (which, value) {
  cabRange = { key: 'custom', since: cabRange.since, until: cabRange.until };
  cabRange[which] = value || '';
  try { localStorage.setItem('cab_range', JSON.stringify(cabRange)); } catch (e) {}
  await cabDaysLoad();
  cabRender();
};

/* Те, що можна вивести з назви токена. Формат назви твій:
   Агент_Номербраузера_idBM. Facebook про агента й браузер не знає
   нічого — а ти вже вписав їх, коли додавав токен, тож питати вдруге
   немає сенсу.

   БМ беремо все-таки в Facebook: він каже це сам і точно. Третя
   частина назви — запасний варіант, якщо Graph не віддав business. */
function cabFromToken(fb) {
  const label = fb ? String(cabTokens[fb.token_id] || '') : '';
  const parts = label.split('_').map(x => x.trim());
  return {
    label,
    agent:   parts[0] || '',
    browser: parts[1] || '',
    bm: (fb && fb.business_id) || parts[2] || ''
  };
}

/* ТАЙМЗОНА КАБІНЕТА — ФАКТ, І ВОНА ВЖЕ Є.

   Facebook віддає timezone_name («Asia/Tashkent»), fb-sync кладе її в
   fb_accounts від самого початку — просто ніде не показувалась. А
   питання, за чиїм годинником вважається «сьогодні», виникає щоразу,
   коли спенд у дашборді не збігається з Ads Manager.

   Поруч із назвою показуємо зсув: «Asia/Tashkent» нічого не каже про
   те, на скільки годин воно відрізняється від твого, а саме це й
   потрібно. Зсув беремо в браузера, а не з таблиці: він знає про
   перехід на літній час, а статична цифра — ні.

   Порожньо — значить fb-sync ще не привозив цього кабінета; це не нуль
   і не UTC, і вдавати, ніби ми знаємо, не можна. */
function cabTzOffset(name) {
  if (!name) return null;
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: name, timeZoneName: 'shortOffset' })
      .formatToParts(new Date()).find(x => x.type === 'timeZoneName');
    const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(String(p && p.value || ''));
    if (!m) return 0;                       // «GMT» без цифр — це рівно нуль
    const h = Number(m[1]), min = Number(m[2] || 0);
    return h + (h < 0 ? -min / 60 : min / 60);
  } catch (e) { return null; }              // назви, якої браузер не знає, не вигадуємо
}

function cabTzLabel(name) {
  const off = cabTzOffset(name);
  if (off == null) return '';
  const mine = -new Date().getTimezoneOffset() / 60;
  const d = off - mine;
  const sign = (v) => (v > 0 ? '+' : v < 0 ? '\u2212' : '');
  const num = (v) => sign(v) + (Number.isInteger(Math.abs(v))
    ? Math.abs(v) : Math.abs(v).toFixed(1));
  // «UTC+5 · на 2 години пізніше за тебе» — друга половина і є відповіддю.
  return 'UTC' + (off === 0 ? '' : num(off))
    + (d === 0 ? ' \u00b7 same as yours'
               : ' \u00b7 ' + Math.abs(d) + 'h ' + (d > 0 ? 'ahead of' : 'behind') + ' you');
}

/* Стан кабінета словами Facebook. unknown потрапляє в issue навмисно:
   незнайомий код — привід подивитись, а не привід малювати зелене. */
const CAB_FB_STATE = {
  active: '', banned: 'banned',
  /* closed і closing — ОКРЕМО від бана. Зведені в 'banned', вони
     перетворювали власне рішення на катастрофу: кабінет, відправлений
     в архів, після першої ж синхронізації ставав червоним «Banned».
     Розрізняє їх disable_reason — див. cabStateOf. */
  closed: 'closed', closing: 'closed',
  unsettled: 'issue', review: 'issue', grace: 'issue',
  /* unknown — це НЕ проблема, а наше незнання: Facebook віддав код
     стану, якого немає в нашому списку. Поки воно означало «issue»,
     робочий кабінет міг місяцями висіти жовтим, і жодна дія його
     звідти не виймала, бо діяти не було з чим. Тепер стан рахується
     далі як завжди (по грошах), а про сам код каже окремий чип. */
  unknown: ''
};

/* Скільки кампаній, адсетів і оголошень ЗАРАЗ крутиться. Знає це тільки
   Marketing API (effective_status), тому без токена — null, і в таблиці
   стоїть прочерк. Саме прочерк, а не нуль: нуль читався б як «нічого не
   запущено», хоча насправді ми просто не знаємо. */
function cabCounts(fb) {
  if (!fb) return null;
  const n = v => (v == null || v === '' ? null : Number(v));
  const c = n(fb.campaigns_active), a = n(fb.adsets_active), d = n(fb.ads_active);
  return (c == null && a == null && d == null) ? null : { campaigns: c, adsets: a, ads: d };
}

/* Зв'язок між твоїм підписом кабінета і номером з Facebook.

   Порядок навмисний: спершу те, що вказали руками, і лише потім
   здогадки. Здогадка, яка перебиває ручний вибір, — найгірший вид
   допомоги: її не видно, поки не стане пізно. */
function cabFbFor(row) {
  if (!cabFb.length) return null;
  const mine = String(row.fb_account_id || '').replace(/\D/g, '');
  if (mine) return cabFb.find(a => String(a.account_id) === mine) || null;
  const id = String(row.account_id || '').trim();
  if (!id) return null;
  /* Підпис і є номером — збіг точний, тлумачити нічого.
     Це перевіряємо ОКРЕМО від правила про шість цифр нижче: без цього
     короткий номер не зійшовся б сам із собою, кабінет опинився б
     одночасно в обох секціях — раз як твій рядок без токена, раз як
     «новий із Facebook». Рівно це й сталось на перевірці. */
  if (cabFb.some(a => String(a.account_id) === id))
    return cabFb.find(a => String(a.account_id) === id);
  const digits = id.replace(/\D/g, '');
  // Номер усередині підпису виду act_123… або ACC-123…. Шість цифр —
  // щоб «ACC-12» не почало випадково зчіплюватись із чимось.
  if (digits.length >= 6) {
    const byId = cabFb.find(a => String(a.account_id) === digits);
    if (byId) return byId;
  }
  // Назва кабінета у Facebook. Ознака слабша, тому лише повний збіг.
  const low = id.toLowerCase();
  return low ? (cabFb.find(a => String(a.name || '').trim().toLowerCase() === low) || null) : null;
}

// Коли востаннє ходили в Facebook. Беремо найсвіжіше по всьому парку:
// один кабінет міг не відповісти, і його час тут ні до чого.
function cabFbAt() {
  let last = '';
  cabFb.forEach(a => { if (a.synced_at && a.synced_at > last) last = a.synced_at; });
  return last;
}

function cabAgo(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!(ms >= 0)) return '';
  const m = Math.floor(ms / 60000);
  if (m < 60) return (m || 1) + 'm ago';
  const h = Math.floor(m / 60);
  return h < 24 ? h + 'h ago' : Math.floor(h / 24) + 'd ago';
}

/* effective_status словами. Facebook пише їх капсом через підкреслення
   й регулярно додає нові — тому незнайоме не ховаємо, а показуємо як є,
   просто в нижньому регістрі. */
const CAB_ST_WORD = {
  ACTIVE: 'active', PAUSED: 'paused',
  DISAPPROVED: 'rejected', PENDING_REVIEW: 'in review', PREAPPROVED: 'pre-approved',
  WITH_ISSUES: 'with issues', PENDING_BILLING_INFO: 'no billing',
  CAMPAIGN_PAUSED: 'campaign paused', ADSET_PAUSED: 'ad set paused',
  IN_PROCESS: 'processing', ARCHIVED: 'archived', DELETED: 'deleted',
  _more: 'not counted'
};

/* Статуси, які означають «саме це тебе й тримає»: їх видно окремим
   рядком, бо пауза — твій вибір, а відхилення — ні. */
const CAB_ST_BAD = ['DISAPPROVED', 'WITH_ISSUES', 'PENDING_BILLING_INFO'];

/* А це не «не крутиться» — це історія. Архівоване вже прибрано зі
   знаменника на боці імпорту, тож і в рядок «скільки не крутиться»
   воно потрапляти не мусить: інакше те саме число рахувалось би двічі
   по-різному. У підказці лишається — щоб було видно, куди поділась
   решта з Ads Manager. */
const CAB_ST_GONE = ['ARCHIVED', 'DELETED'];

const cabStWord = k => CAB_ST_WORD[k] || String(k).toLowerCase().replace(/_/g, ' ');

/* Скільки оголошень чекає на перевірці Facebook. Число тут потрібне
   саме числом, а не словом: «одне з тридцяти» і «тридцять з тридцяти»
   — це різні ранки. */
/* Через ЩО кабінет жовтий. Без цього «Issue» відповідає на питання
   «що?» і мовчить про «чому?»: ручна позначка, поставлена колись і
   забута, виглядає рівно як свіжий недоплачений рахунок. */
function cabIssueWhy(c) {
  if (c.state !== 'issue') return null;
  const st = c.fb ? String(c.fb.status || '') : '';
  const byFb = st ? CAB_FB_STATE[st] : '';
  // review має власний чип, докладніший за це слово — двічі не кажемо.
  if (byFb === 'issue' && st !== 'review') return {
    text: st,
    tip: 'Facebook itself says the cabinet is ' + st
       + '. It will go green here the moment Facebook says so \u2014 the next sync after that.'
  };
  if (String(c.row.status || '').toLowerCase() === 'problem') return {
    text: 'marked by hand',
    tip: 'Somebody pressed Issue on this cabinet by hand'
       + (c.fb ? ', while Facebook says ' + String(c.fb.status || '') : '')
       + '. Facebook cannot undo a human mark \u2014 open the cabinet and press OK to clear it.'
  };
  return null;
}

const cabPending = fb => Number(fb && fb.ads_by_status && fb.ads_by_status.PENDING_REVIEW) || 0;

/* Розбивка рядком, від більшого до меншого. Без ACTIVE, коли поруч уже
   стоїть «3/180»: повторювати ту саму трійку двічі — зайвий шум. */
/* Ввімкнено проти крутить. Різниця між цими числами — це й є кампанії,
   у яких усі оголошення відхилені або на перевірці: формально ON,
   фактично мертві. Саме через них «активних» було більше, ніж насправді. */
function cabOnTip(fb, edge) {
  if (!fb) return '';
  const on = Number(fb[edge + '_on']);
  const live = Number(fb[edge + '_active']);
  if (!Number.isFinite(on) || !Number.isFinite(live) || on <= live) return '';
  return on + ' switched on, ' + live + ' actually delivering';
}

function cabByStatus(by, skipActive) {
  if (!by || typeof by !== 'object') return '';
  return Object.entries(by)
    .filter(([k, n]) => Number(n) > 0 && !(skipActive && k === 'ACTIVE'))
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => n + ' ' + cabStWord(k))
    .join(' \u00b7 ');
}

const cabDayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const cabMoney = n => '$' + Math.round(n).toLocaleString('en-US');
const CAB_CUR = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', UAH: '\u20B4' };
/* Валюту беремо з кабінета, а не з дашборда: долар на євровому
   кабінеті — це не округлення, це інше число. */
function cabMoneyCur(n, cur) {
  const v = Math.round(Number(n) || 0).toLocaleString('en-US');
  const sign = CAB_CUR[cur];
  return sign ? sign + v : v + (cur ? ' ' + cur : '');
}

/* Те саме, але з копійками. Для спенду вони зайві — там ідеться про
   сотні, — а от борг по картці буває й у 43 центи, і округлений до
   нуля він читається як «нічого не винні», що прямо протилежне. */
function cabMoneyCents(n, cur) {
  const v = (Math.round((Number(n) || 0) * 100) / 100)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = CAB_CUR[cur];
  return sign ? sign + v : v + (cur ? ' ' + cur : '');
}

async function cabInit() {
  const host = document.getElementById('cab-list');
  if (!host) return;
  // Зайшов сюди — значить побачив: банер і лічильник гасимо на КОЖНОМУ
  // заході, не лише на першому. «Прочитано» має означати прочитано.
  const seen = () => { if (typeof evDismiss === 'function') evDismiss(); };
  /* Курс тягнемо, не чекаючи на нього: таблиця має зʼявитись одразу, а
     число в кнопці перерахується саме, щойно курс приїде. */
  fxLoad();
  if (cabLoaded) { cabRender(); seen(); return; }
  host.innerHTML = '<p class="text-center opacity-30 py-16 text-xs font-black uppercase tracking-widest">Loading…</p>';
  try {
    cabRows = await sbFetchAll('accounts_mapping',
      q => q.eq('team_name', currentTeam).order('account_id', { ascending: true }));
  } catch (e) {
    host.innerHTML = `<p class="text-center text-rose-400 py-16 text-xs font-bold">Error: ${e.message}</p>`;
    return;
  }
  const sample = cabRows[0] || {};
  CAB_EXTRA.forEach(c => cabCols[c.key] = c.key in sample);
  // Колонка зв'язку з Facebook теж може ще не існувати — тоді ручної
  // прив'язки не буде, лишиться автоматична за номером і назвою.
  cabCols.fb_account_id = 'fb_account_id' in sample;
  await cabFbLoad();
  await cabDaysLoad();
  if (typeof fpLoad === 'function') await fpLoad();
  cabLoaded = true;
  cabRender();
  /* Підписи дописуємо ПІСЛЯ малювання, не до: сторінка не мусить чекати
     на запис, якого людина не просила. Якщо запис пройде — перемалюємо. */
  cabAutoFill();
  seen();
}

/* ПІДПИСИ ДОПИСУЮТЬСЯ САМІ.

   Агент, браузер і БМ лежали в назві токена від самого початку, але
   щоб вони опинились у рядку кабінета, треба було відкрити кабінет і
   натиснути «Fill N field(s) from the token name». Тобто дані вже були,
   а на екрані їх не було — і в групуванні по браузеру кабінет лежав у
   «— no browser —», хоч браузер відомий.

   Кнопка була чесною, але неправильною: вона питала дозволу на те, що
   й так однозначне. Розбір назви не має варіантів: другий шматок — це
   браузер, і іншим він не буде.

   ТРИ МЕЖІ, І ЖОДНА З НИХ НЕ ПРО ЗРУЧНІСТЬ:

   1. Тільки ПОРОЖНІ поля. Вписане руками завжди свіжіше за розбір
      назви: людина могла перенести кабінет в інший браузер, а токен
      лишився старим. Затерти це означало б загубити єдине місце, де
      правда записана.
   2. Тільки СВОЇ рядки. Кабінети, яких ще немає в accounts_mapping,
      тут не заводяться: заводити рядок — окреме рішення, і робити його
      мовчки за людину не можна.
   3. Помилку запису — вголос. Мовчки не збережене виглядає як
      збережене, і наступного разу людина побачить порожнє поле знову,
      не знаючи чому. */
const CAB_AUTO = [['provider_name', 'agent'], ['profile', 'browser'], ['bm', 'bm']];

async function cabAutoFill() {
  const todo = [];
  cabAll.forEach(c => {
    if (!c.row || !c.row.id) return;        // чужий/ще не заведений — не наша справа
    const patch = {};
    CAB_AUTO.forEach(([col, from]) => {
      const v = String((c.tok && c.tok[from]) || '').trim();
      if (!v) return;
      if (String(c.row[col] || '').trim()) return;   // вписане руками не чіпаємо
      if (col !== 'provider_name' && !cabCols[col]) return;  // колонки ще немає
      patch[col] = v;
    });
    if (Object.keys(patch).length) todo.push({ c, patch });
  });
  if (!todo.length) return;

  /* Малюємо одразу, пишемо потім: рядок на екрані вже правильний, а
     якщо запис не вдасться — повертаємо як було і кажемо про це.

     ЯК БУЛО ЗАПАМʼЯТОВУЄМО ДО ЗАПИСУ В РЯДОК, а не після. Знято з
     тесту: знімок, зроблений після Object.assign, тримав уже НОВІ
     значення, і відкат нічого не відкочував — поле лишалось на екрані
     заповненим, хоч у базу не потрапило. Тобто саме та мовчазна
     неправда, проти якої тут усе й написано. */
  todo.forEach(t => {
    t.prev = {};
    Object.keys(t.patch).forEach(k => t.prev[k] = t.c.row[k]);
    Object.assign(t.c.row, t.patch);
  });
  cabRender();

  const bad = [];
  for (const { c, patch, prev } of todo) {
    const { error } = await sb.from('accounts_mapping').update(patch).eq('id', c.row.id);
    if (error) { Object.assign(c.row, prev); bad.push(error.message); }
  }
  if (bad.length) {
    cabRender();
    const msg = 'Could not fill ' + bad.length + ' cabinet(s) from the token name: ' + bad[0];
    if (typeof toast === 'function') toast(msg, 'bad'); else console.warn(msg);
  }
}

/* Що сказав Facebook. Окремо від accounts_mapping, бо це різні за
   природою речі: там твої підписи, тут факти, які ти не редагуєш.

   Помилку не показуємо як аварію: таблиці може просто не бути, і тоді
   сторінка має працювати так само, як працювала до токенів. */
/* Колонки двома наборами навмисно.

   CORE — те, що є в таблиці з першого дня. NEW — те, що додавалось
   пізніше, і чого в базі може ще не бути, якщо ALTER з FB_SYNC.sql не
   виконано.

   Раніше вони йшли одним списком, і це коштувало дорого: запит падав
   цілком, cabFb ставав порожнім, і ВСІ кабінети зникали з розділу
   «Live from Facebook» — без жодного слова про причину. Виглядало як
   «дані пропали», хоча дані на місці, просто база на п'ять колонок
   старіша за сторінку.

   Тепер невідома колонка означає рівно те, чим вона є: кількох чисел
   не буде, поки не виконаєш ALTER. Решта працює. */
const CAB_FB_CORE = 'account_id,name,status,disable_reason,currency,card,spend_today,'
  + 'timezone_name,'
  + 'team_name,campaigns,campaigns_active,adsets,adsets_active,ads,ads_active,'
  + 'amount_spent,sync_error,synced_at,business_name,token_id';
const CAB_FB_NEW = 'business_id,campaigns_by_status,adsets_by_status,ads_by_status,'
  + 'campaigns_on,adsets_on,ads_on,daily_budget,missing_since,balance,card_last_seen';

// Немає таблиці зовсім — не те саме, що немає кількох колонок.
const CAB_NO_TABLE = /relation .* does not exist|42P01/i;

const CAB_NO_COLUMN = /column .* does not exist|schema cache|42703|PGRST204/i;

async function cabFbLoad() {
  cabFbErr = '';
  cabFbOld = '';
  try {
    let res = await sb.from('fb_accounts').select(CAB_FB_CORE + ',' + CAB_FB_NEW);
    if (res.error && CAB_NO_COLUMN.test(res.error.message || '')) {
      // База старіша за сторінку. Беремо те, що є, і кажемо про це вголос.
      cabFbOld = res.error.message;
      res = await sb.from('fb_accounts').select(CAB_FB_CORE);
    }
    if (res.error) throw res.error;
    /* КОМАНДОЮ РІЖЕМО, І ЦЕ ЄДИНЕ, ЩО ТУТ ТРИМАЄ МЕЖУ.

       Був день, коли цей фільтр прибрали — з доводом «RLS і так
       віддає лише свої рядки, тож фільтр може хіба сховати твоє». Довід
       хибний, і перевірити його треба було не головою, а в TEAM_ROLES.sql:
       на fb_accounts висить ДРУГА політика, fb_accounts_read_team, і
       вона дозволяє select по can_read_team(team_name). А can_read_team
       для ролі admin повертає true для будь-якої команди.

       Тобто в адміна запит віддає ВСІ рядки таблиці, і прибраний фільтр
       одразу притягнув у список чужі кабінети — разом із трьома
       наслідками: чуже видно, підписи агентів («Adcards») підмінились
       на запасний розбір назви токена, бо під чужий рядок свого
       accounts_mapping немає, і числа поїхали.

       Політики в Postgres складаються через OR. Межу тут тримає
       сторінка. */
    cabFbRaw = (res.data || []).length;
    cabFb = (res.data || []).filter(r => !r.team_name || r.team_name === currentTeam);
    /* Чиї саме написи ми прибрали. Потрібні для одного рядка нижче:
       «твій токен нічого не привіз» і «тут є 26 кабінетів, але чужих»
       — різні новини, а виглядали однаково. */
    cabFbTeams = [...new Set((res.data || []).map(r => String(r.team_name || '').trim())
      .filter(v => v && v !== currentTeam))];
    /* Назви токенів окремим запитом. Сам токен звідти не приїде й
       приїхати не може: права на цей стовпчик забрано в усіх. */
    const t = await sb.from('fb_tokens').select('id,label');
    cabTokens = {};
    (t.data || []).forEach(x => cabTokens[x.id] = x.label);
  } catch (e) {
    cabFb = [];
    cabFbRaw = 0;
    cabFbTeams = [];
    cabFbErr = CAB_NO_TABLE.test(e.message || '') ? 'not-set-up' : (e.message || 'error');
  }
}

/* Витрати по днях за вибраний період. Запитуємо саме діапазон, а не
   «останні 30 днів у памʼять»: історія в базі накопичується глибше за
   вікно, яке переписує імпорт, тож за минулий квартал теж можна
   спитати — і відповідь буде.

   Команду, як і в cabFbLoad, відсіюємо вже тут — і з тієї самої
   причини: в адміна політика fb_spend_daily_read_team віддає чужі
   рядки теж, а показати чужий спенд під своїм кабінетом гірше, ніж
   не показати нічого. */
async function cabDaysLoad() {
  cabDays = {};
  cabDaysErr = '';
  const [since, until] = cabRangeDates();
  try {
    const rows = await sbFetchAll('fb_spend_daily',
      q => q.gte('day', since).lte('day', until).order('day', { ascending: true }));
    rows.forEach(r => {
      if (r.team_name && r.team_name !== currentTeam) return;
      const id = String(r.account_id || '');
      if (!id) return;
      cabDays[id] = (cabDays[id] || 0) + (Number(r.spend) || 0);
    });
  } catch (e) {
    cabDaysErr = CAB_NO_TABLE.test(e.message || '') ? 'not-set-up' : (e.message || 'error');
  }
}

/* Скільки цей кабінет відкрутив за вибраний період.

   null означає «не знаємо», і це не нуль: коли таблиці історії ще
   немає, показати 0 було б брехнею про кабінет, який цілком може
   крутити. Єдиний виняток — «сьогодні»: це число лежить і в самому
   fb_accounts, тож на нього і спираємось, поки історії немає. */
function cabSpendIn(fb) {
  if (!fb) return null;
  const id = String(fb.account_id || '');
  if (!cabDaysErr) return cabDays[id] || 0;
  /* Запасний шлях, коли історії ще немає: сьогоднішнє число беремо з
     самого fb_accounts. Але в кабінета, якого токен уже не бачить, воно
     заморожене — і видати його за «сьогодні» означало б додати вчорашні
     гроші до сьогоднішньої суми. Ми цього не знаємо, отже null. */
  if (fb.missing_since) return null;
  return cabRange.key === 'today' ? (Number(fb.spend_today) || 0) : null;
}

/* Сказати, чому кабінетів немає.

   Найдорожча помилка попередньої версії була не в запиті, а тут: її не
   було. cabFbErr проставлявся й нікуди не виводився, тож кабінети
   просто зникали мовчки. Порожній екран без причини — найгірше, що
   сторінка може показати: незрозуміло навіть, це зламалось чи так і
   має бути. */
/* Останнє, що вже сказали. cabFbNote() кличеться з КОЖНОГО
   перемальовування — без цього те саме повідомлення вилітало б
   тостом на кожен клік по фільтру. */
let cabNoteSaid = '';

function cabFbNote() {
  const say = (html, kind) => {
    if (html === cabNoteSaid) return;
    cabNoteSaid = html;
    if (html) toast(html, kind, undefined, true);
  };
  if (cabFbErr === 'not-set-up') {
    say('Facebook data is not set up yet — run <span class="font-mono">FB_SYNC.sql</span>, '
      + 'deploy <span class="font-mono">fb-sync</span>, then press Sync now.', 'warn');
  } else if (cabFbErr) {
    say('Could not read Facebook data: ' + cabEsc(cabFbErr), 'error');
  } else if (cabFbOld) {
    say('Your database is a few columns behind this page, so some numbers are missing. '
      + 'Run the <span class="font-mono">alter table</span> block from '
      + '<span class="font-mono">FB_SYNC.sql</span>. Everything else works.', 'warn');
  } else if (cabDaysErr === 'not-set-up') {
    /* Той самий урок, що й з колонками: пусті клітинки без пояснення
       читаються як «кабінет нічого не крутить», а це протилежне
       правді. Кажемо, чого бракує і що з цим робити. */
    say('Spend history is not set up yet, so only <b>Today</b> has numbers. '
      + 'Run the <span class="font-mono">fb_spend_daily</span> block from '
      + '<span class="font-mono">FB_SYNC.sql</span>, redeploy '
      + '<span class="font-mono">fb-sync</span>, then press Sync now.', 'warn');
  } else if (cabDaysErr) {
    say('Could not read spend history: ' + cabEsc(cabDaysErr), 'error');
  } else if (!cabFb.length && cabFbRaw > 0) {
    /* ПОРОЖНЬО ПІСЛЯ ВІДСІВУ — І ЦЕ ДВІ НОВИНИ, НЕ ОДНА.

       Рядки приїхали, але всі чужі: ти адмін, тому база віддає й
       кабінети інших баєрів, а сторінка показує лише свою команду.
       Сказати тут просто «кабінетів немає» означало б приховати
       половину відповіді — і саме через це минулого разу зробили
       висновок, що фільтр ламає сторінку, і прибрали його. */
    say('Nothing here for <b>' + cabEsc(currentTeam) + '</b> yet. '
      + cabFbRaw + ' cabinet(s) are visible to you, but they are filed under '
      + (cabFbTeams.length
          ? 'other team name(s): <b>' + cabEsc(cabFbTeams.slice(0, 4).join(', ')) + '</b>'
            + (cabFbTeams.length > 4 ? '…' : '')
          : 'another team')
      + ' \u2014 other buyers\u2019 cabinets, hidden here on purpose. '
      + 'Switch the team at the top to look at theirs. '
      + 'For your own: press <b>Sync now</b>; if nothing changes, '
      + '<span class="font-mono">fb-sync</span> is not deployed.', 'warn');
  } else if (!cabFb.length && Object.keys(cabTokens).length) {
    /* ТОКЕН Є, КАБІНЕТІВ НЕМАЄ — і це не помилка, а черга.

       Вікно збереження токена показує «Ad accounts: 12» — відповідь
       Facebook просто зараз, вона лягає в fb_tokens.accounts. А ця
       сторінка читає fb_accounts, яку наповнює тільки fb-sync. Тож без
       жодної помилки людина бачила 12 кабінетів у вікні й порожнечу
       тут, і зрозуміти з екрана це було неможливо. */
    say('The token is saved, but the sync has not brought its cabinets yet — '
      + 'they live in a different table than the token. Press <b>Sync now</b>; '
      + 'if nothing changes, <span class="font-mono">fb-sync</span> is not deployed.', 'warn');
  } else if (!cabFb.length) {
    say('No Facebook tokens yet — add one in Settings → Facebook tokens, '
      + 'and its cabinets appear here right after.', 'warn');
  } else {
    // Усе налагодилось — забуваємо сказане, щоб наступна поломка
    // не змовчала лише через те, що вона та сама, що й минулого разу.
    cabNoteSaid = '';
  }
}

/* Старий код казав колір, тости говорять видами. Перекладач між ними
   один на всю сторінку: інакше кожен виклик вирішував би сам, і
   «червоне» означало б різне в різних місцях. */
const cabKind = tone => tone === 'var(--bad)' ? 'error'
                      : tone === 'var(--warn)' ? 'warn'
                      : tone === 'var(--ok)' ? 'ok' : '';

/* Кнопка «Sync now» на цій сторінці. Сама синхронізація живе у fbtok.js
   разом із токенами — тут лише виклик і перемальовка: дублювати запит
   заради другої кнопки означало б мати два місця, де його чинити. */
/* ЗВУЖЕНИЙ ПРОГІН: ОДИН КАБІНЕТ АБО ОДИН БРАУЗЕР.

   «Sync now» ганяє весь парк, і коли треба подивитись один кабінет, це
   хвилини очікування заради одного рядка. Але звуження тут не просто
   зручність: fb-sync у цьому режимі навмисно НЕ робить висновків про
   кабінети, яких не питали — інакше прогін по одному оголосив би решту
   втраченими.

   Браузер беремо не з рядка, а з назви токена (Агент_Браузер_БМ) — там
   же, де його бере сама функція. Один розбір на обидва боки. */
async function cabSyncScope(what, opts) {
  if (typeof fbSync !== 'function') return;
  const step = toastStep();
  let last = { html: '', kind: '' };
  const say = (html, tone) => { last = { html, kind: cabKind(tone) }; step.say(html, last.kind, true); };
  say('Syncing ' + cabEsc(what) + '…');
  try {
    await fbSync(say, opts);
    await cabFbLoad();
    await cabDaysLoad();
    step.done(last.html || ('Synced ' + cabEsc(what)), last.kind || 'is-ok', true);
    cabRender();
  } catch (e) {
    step.done('Could not sync ' + cabEsc(what) + ': ' + cabEsc(e.message || e), 'is-error', true);
  }
}

/* Один кабінет. fb-sync усе одно ходить токеном, якому він належить, —
   тож передаємо і токен (щоб не перебирати решту), і сам номер. */
window.cabSyncOne = async function (id) {
  const c = cabAll.find(x => String(x.id) === String(id));
  if (!c || !c.fb) return;
  await cabSyncScope(String(c.id), { token_id: c.fb.token_id, accounts: [String(c.id)] });
};

/* Одна група — те, по чому зараз згруповано. Для браузера це прямий
   відбір токенів; для решти (агент, стан, БМ) групу складають кабінети
   різних токенів, тож передаємо їхні номери поіменно. */
window.cabSyncGroup = async function (key) {
  const list = cabAll.filter(c => c.fb && cabGroupKey(c) === key);
  if (!list.length) return;
  if (cabGroup === 'profile') { await cabSyncScope(key, { browser: key }); return; }
  await cabSyncScope(key, { accounts: list.map(c => String(c.id)) });
};

window.cabSync = async function () {
  const btn = document.getElementById('cab-sync');
  if (!btn || typeof fbSync !== 'function') return;
  // Куди писати результат, вирішує той, хто кличе: сама fbSync про
  // розмітку нічого не знає й знати не мусить.
  const step = toastStep();
  /* Останнє сказане тримаємо окремо: fbSync повідомляє про хід роботи
     живим тостом, а коли все скінчилось, той самий текст має лишитись
     на екрані вже звичайним — і згаснути сам. */
  let last = { html: '', kind: '' };
  const say = (html, tone) => { last = { html, kind: cabKind(tone) }; step.say(html, last.kind, true); };
  btn.disabled = true;
  // Кнопка тепер має два вузли: підпис і час. Міняємо лише підпис.
  const lbl = btn.querySelector('span') || btn;
  const was = lbl.textContent;
  lbl.textContent = 'Syncing…';
  try {
    await fbSync(say);
    await cabFbLoad();
    await cabDaysLoad();
    if (typeof fpLoad === 'function') await fpLoad();
    /* Останнє, що сказала fbSync, лишаємо на екрані — але вже як
       звичайний тост, який згасне сам. Живий тост, забутий увімкненим,
       висів би до перезавантаження. */
    step.done(last.html, last.kind, true);
    cabRender();
  } finally {
    btn.disabled = false;
    lbl.textContent = was;
  }
};

/* Факти з грошей. «Крутить» звіряємо з останнім днем, який ВЗАГАЛІ є в
   даних, а не з сьогоднішньою датою: звіт за сьогодні ще не залитий, і
   інакше весь парк щоранку виглядав би мертвим. */
function cabFacts() {
  const daily = (typeof rawData !== 'undefined' && rawData) ? rawData : [];
  const map = {};
  let lastDay = '';
  daily.forEach(r => {
    const acc = String(r.account || '').trim();
    const d = String(r.date || '');
    if (!acc || !d) return;
    if (d > lastDay) lastDay = d;
    const o = map[acc] || (map[acc] = { spend: 0, first: d, last: d, byDay: {} });
    const s = Number(r.spend) || 0;
    o.spend += s;
    if (d < o.first) o.first = d;
    if (d > o.last) o.last = d;
    o.byDay[d] = (o.byDay[d] || 0) + s;
  });
  return { map, lastDay };
}

/* Стан кабінета. Джерел три, і порядок між ними не випадковий.

   Правило одне: проблему може ДОДАТИ будь-хто, а зняти чужу — ніхто.
   Facebook сказав «вимкнено» — жодна ручна позначка цього не стирає,
   бо бан це факт, а не думка. Людина позначила «проблема» — зелений
   статус із Facebook її не перебиває, бо Facebook не знає, що кабінет
   відклали свідомо.

   Те саме правило стоїть на доменах, і поставлене воно було не від
   доброго життя: автоматика, яка знімає мітку людини, одного разу вже
   стерла висновок, якого сама зробити не вміла. */
/* АРХІВ НЕ МОЖНА ЗАГУБИТИ.

   Довго він жив лише в тому рядку accounts_mapping, який ЗЧЕПИВСЯ з
   кабінетом Facebook. Не зчепився — і картка будувалась із порожнього
   рядка {account_id, _new}, де ніякого архіву немає. Людина клала
   кабінет в архів, а він після синхронізації виходив звідти й
   показував те, що каже Facebook.

   Зчеплення тут крихке навмисно: підпис може бути номером, може бути
   act_123…, може бути назвою кабінета. Будувати на ньому обіцянку
   «поклав в архів — лишиться в архіві назавжди» не можна.

   Тому архів рахується ОКРЕМО, по номерах, з УСІХ твоїх рядків — і
   тих, що зчепились, і тих, що ні. Поклав руками — лишається, хай там
   що каже Facebook і чи вгадало зчеплення. */
let cabArch = new Set();

function cabArchKeys(v) {
  const s2 = String(v == null ? '' : v).trim();
  if (!s2) return [];
  const d = s2.replace(/\D/g, '');
  // І як написано, і самими цифрами: підпис act_123… і номер 123… — це
  // один кабінет, і архів не має від цього залежати.
  return d && d !== s2 ? [s2, d] : [s2];
}

/* АРХІВ, ЯКИЙ ЗАГУБИВСЯ ДОРОГОЮ.

   Тричі поспіль кабінети «виходили з архіву», і тричі причина була
   різна: мовчазний запис, крихке зчеплення рядка з кабінетом,
   журнал, що судив із застарілого кеша. Спільне в них одне — з
   екрана не було видно НІЧОГО. Людина бачила кабінет не там, де
   поклала, і єдиним способом дізнатись причину був запит у базу.

   Тому тепер сторінка рахує це сама: скільки твоїх рядків позначені
   архівом проти того, скільки кабінетів справді показані архівними.
   Розійшлись — скажемо вголос і назвемо, котрі саме. Це не лікує
   жодну з причин, зате жодна більше не сховається. */
function cabArchLost() {
  const want = cabRows.filter(r => String(r.status || '').toLowerCase() === 'archive');
  if (!want.length) return [];
  /* Показаним вважається кабінет, який потрапив у cabAll зі станом
     archived. Рядок, що не зчепився з жодним кабінетом, сюди не
     рахуємо окремо: він видимий у «не привʼязані», і це інша розмова. */
  const shown = new Set();
  cabAll.forEach(c => { if (c.state === 'archived') {
    cabArchKeys(c.id).forEach(k => shown.add(k));
    if (c.fb) cabArchKeys(c.fb.account_id).forEach(k => shown.add(k));
  } });
  return want.filter(r => {
    const keys = cabArchKeys(r.account_id).concat(cabArchKeys(r.fb_account_id));
    if (!keys.length) return false;
    if (keys.some(k => shown.has(k))) return false;
    // Рядок без живого кабінета — не втрата архіву, а відсутній кабінет.
    return !!cabFbFor(r);
  }).map(r => String(r.account_id || r.id));
}

/* ЗАСУВКА.

   Тричі поспіль кабінети «виходили з архіву», і тричі причина була
   інша: мовчазний запис, крихке зчеплення рядка з кабінетом, журнал
   із застарілого кеша. Шукати четверту — марна робота, бо хиба щоразу
   та сама: архів тримався на тому, що потрібний рядок ДОЇДЕ. Не
   доїхав з будь-якої причини — і кабінет виринав там, звідки його
   прибрали.

   Тому архів більше не виводиться щоразу наново. Він ЗАПАМʼЯТОВУЄТЬСЯ
   і знімається рівно одним способом — рукою: натиснувши OK, Issue чи
   Ban. Жоден збій, жодне невдале зчеплення, жодна порожня відповідь
   кабінета звідти не виймають.

   Памʼять браузера може бути недоступна (інкогніто, заборонені дані
   сайту) — тоді засувка просто не переживе перезавантаження, а все
   інше працює як раніше. */
const CAB_ARCH_KEY = 'cab_archived';
const CAB_ARCH_MAX = 2000;

function cabArchLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(CAB_ARCH_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch (e) { return []; }
}
function cabArchSave() {
  try {
    localStorage.setItem(CAB_ARCH_KEY,
      JSON.stringify([...cabArch].slice(0, CAB_ARCH_MAX)));
  } catch (e) { /* немає памʼяті — працюємо без неї */ }
}

function cabArchBuild() {
  // Починаємо з того, що вже знали: засувка переживає перезавантаження.
  cabArch = new Set(cabArchLoad());
  cabRows.forEach(r => {
    const keys = cabArchKeys(r.account_id).concat(cabArchKeys(r.fb_account_id));
    if (!keys.length) return;
    /* Рядок ПРИЇХАВ і каже «не архів» — це свідомий стан, поставлений
       рукою, і він засувку знімає. Саме так її й належить знімати.
       А от рядок, якого немає (не зчепився, не завантажився, чужа
       команда), не каже нічого — і мовчання не має права нічого
       скасовувати. */
    const isArch = String(r.status || '').toLowerCase() === 'archive';
    keys.forEach(k => { if (isArch) cabArch.add(k); else cabArch.delete(k); });
  });
  cabArchSave();
}

function cabIsArch(row, fb) {
  if (String(row && row.status || '').toLowerCase() === 'archive') return true;
  if (!cabArch.size) return false;
  return cabArchKeys(row && row.account_id).some(k => cabArch.has(k))
      || cabArchKeys(fb && fb.account_id).some(k => cabArch.has(k));
}

function cabStateOf(row, f, fb) {
  /* Архів — перший і найсильніший: його поставила людина, і поставила
     саме для того, щоб більше цей кабінет не бачити. Якби нижче його
     перебивало «No token» чи «Banned», архівувати старий забанений
     кабінет — найчастіший випадок — було б неможливо взагалі. */
  if (cabIsArch(row, fb)) return 'archived';
  /* Далі: чи ми взагалі ще бачимо цей кабінет. Поки
     токен його не бачить, усе інше в рядку — вчорашня газета, і стан
     мусить казати саме це, а не показувати «Running» за замороженим
     спендом. */
  if (fb && fb.missing_since) return 'notoken';
  const byFb = fb ? CAB_FB_STATE[String(fb.status || 'unknown')] : '';
  /* Закритий кабінет — це архів, а НЕ бан. Різниця одна й перевірна:
     disable_reason. Facebook заповнює його, коли закрив кабінет сам і
     за щось конкретне — політика, ризик, платіж. Порожній при
     закритому означає, що його закрили навмисно.

     Плутати ці двоє дорого в обидва боки: власний архів лякає як бан,
     а справжній бан губиться серед архівів, і шукати його доводиться
     очима. */
  if (byFb === 'closed') return fb.disable_reason ? 'banned' : 'archived';
  if (byFb === 'banned') return 'banned';
  const st = String(row.status || 'active').toLowerCase();
  if (st === 'ban') return 'banned';
  if (byFb === 'issue') return 'issue';
  if (st === 'problem') return 'issue';
  /* Щойно запущений кабінет: усередині вже щось є, але Facebook не
     пропустив ще жодного оголошення. Досі це виглядало як «Never ran»
     — тобто як мертвий, хоча чекати тут саме й правильно, і єдина
     дія — не робити нічого. Вимагаємо нуль доставлених: кілька
     оголошень на перевірці є майже в кожного, хто щось міняв сьогодні,
     і перефарбовувати через них робочий кабінет означало б зробити
     цей стан шумом. */
  if (fb && cabPending(fb) > 0 && Number(fb.ads_active) === 0) return 'review';
  /* Facebook каже, що сьогодні вже відкручено — значить крутить, і не
     важливо, що вечірній імпорт ще не приїхав. Саме через це до токена
     робочий кабінет цілий день виглядав тихим. */
  if (fb && Number(fb.spend_today) > 0) return 'running';
  /* ЖИВІ ОГОЛОШЕННЯ — ЦЕ ВЖЕ ВІДПОВІДЬ. Досі стан питали тільки в
     грошей, і кабінет із увімкненими оголошеннями падав у «Never ran»
     щоразу, коли Facebook ще не порахував сьогоднішній спенд, а
     вечірній імпорт не приїхав. Тобто робочий кабінет підписувався як
     такий, що не крутив ЖОДНОГО разу, — і зранку це було нормою, а не
     винятком. Питаємо Facebook: він каже, скільки оголошень
     доставляється просто зараз. */
  if (fb && Number(fb.ads_active) > 0) return 'running';
  const x = f.map[String(row.account_id || '').trim()];
  /* Гроші були — значить кабінет робочий. Раніше тут розрізнялось, чи
     вони були саме в останній імпортований день, і якщо ні — кабінет
     ставав Silent. На практиці це майже завжди означало не «затих», а
     «вечірній імпорт ще не приїхав». */
  if (x && x.spend > 0) return 'running';
  return 'idle';
}

/* Чи крутив цей кабінет хоч колись. Потрібно рівно для підпису: стан
   idle означає «зараз нічого», а от «Never ran» — сильніше твердження,
   і для кабінета з історією витрат воно просто неправда.

   amount_spent — те, що Facebook витратив за весь час; воно лишається
   й тоді, коли в наших daily_stats по цьому кабінету нічого немає
   (підпис у витратах не збігається з номером — звичайна річ). */
function cabEverRan(x, fb) {
  if (x && x.spend > 0) return true;
  return !!(fb && Number(fb.amount_spent) > 0);
}

/* Хто саме поставив цей стан — щоб на рядку було видно, чому він такий.
   Без цього «Banned» від Facebook і «Banned», який хтось клацнув рік
   тому, виглядають однаково, а варті вони різного. */
function cabWhy(c) {
  if (c.fb && c.fb.missing_since) {
    const last = String(c.fb.status || '') || 'nothing';
    return { mark: '\u2716',
      text: 'No token sees this cabinet since ' + String(c.fb.missing_since).slice(0, 16).replace('T', ' ')
          + '. Facebook last said: ' + last
          + (c.fb.disable_reason ? ' \u00b7 ' + c.fb.disable_reason : '')
          + '. The numbers below are frozen at that moment \u2014 nothing about this cabinet updates '
          + 'any more. Its spend history and your own notes stay as they are.' };
  }
  const byFb = c.fb ? CAB_FB_STATE[String(c.fb.status || 'unknown')] : '';
  if (byFb && (c.state === 'banned' || c.state === 'issue')) {
    const why = c.fb.disable_reason ? ' · ' + c.fb.disable_reason : '';
    return { mark: '\u27F3', text: 'Facebook: ' + (c.fb.status || '') + why };
  }
  const st = String(c.row.status || 'active').toLowerCase();
  if (st === 'ban' || st === 'problem')
    return { mark: '\u270E', text: 'Set by hand' + (c.fb ? ', Facebook says ' + c.fb.status : '') };
  return { mark: '\u27F3', text: 'Facebook: ' + (c.fb.status || '') };
}

function cabSetGroup(v) { cabGroup = v; cabRender(); }
function cabSetFilter(k) { cabFilter = (cabFilter === k) ? '' : k; cabSel = null; cabRender(); }

/* ПРАВЕ МІСЦЕ ОДНЕ. Панель правил, відкриваючись, закриває картку
   кабінета — а от навпаки цього не робилось, і в зворотному порядку
   (спершу правила, потім кабінет) обидві лишались відкритими. Тоді
   таблицю тисне з двох боків одразу: з тисячі пікселів лишалось
   шістсот, стовпчики кампаній злипались, і виглядало це так, ніби
   правила налізли на них зверху.

   Симетрія: хто відкрився останнім, той і займає праве місце. */
function cabPick(id) {
  cabSel = (cabSel === id) ? null : id;
  if (cabSel && typeof rlPanel === 'function') {
    const rl = document.getElementById('rules-panel');
    if (rl && !rl.classList.contains('hidden')) rlPanel(false);
  }
  cabRender();
}

// Спарклайн спенду за останні 14 днів — інлайновий SVG, без Chart.js:
// на сторінці таких графіків можуть бути десятки, і кожен інстанс
// Chart.js тут коштував би дорожче за всю решту рендера разом.
function cabSpark(byDay, lastDay, w, h) {
  if (!lastDay) return '';
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.parse(lastDay) - i * 86400000).toISOString().slice(0, 10);
    days.push(byDay[d] || 0);
  }
  const max = Math.max(...days, 1);
  const step = w / (days.length - 1);
  const pts = days.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.5"
      stroke-linejoin="round" stroke-linecap="round" opacity=".85"/></svg>`;
}

function cabSortBy(k) {
  if (cabSort.key === k) cabSort.dir = -cabSort.dir;
  else cabSort = { key: k, dir: k === 'id' || k === 'agent' ? 1 : -1 };
  cabRender();
}

/* Один кабінет у тому вигляді, у якому його малює таблиця: рядок із
   accounts_mapping (твої підписи), рядок із fb_accounts (факти) і те,
   що порахували гроші. Будь-якого з трьох може не бути. */
function cabMake(row, fb, id, f) {
  const x = f.map[id] || { spend: 0, first: '', last: '', byDay: {} };
  const state = cabStateOf(row, f, fb);
  return { row, fb, id, x, state, tok: cabFromToken(fb),
           // скільки днів як токен його не бачить — щоб стояло в підписі стану
           lost: (fb && fb.missing_since)
             ? cabDayDiff(String(fb.missing_since).slice(0, 10), f.lastDay || new Date().toISOString().slice(0, 10))
             : 0,
           age: x.first ? cabDayDiff(x.first, x.last) + 1 : 0 };
}

/* ═════ СКІЛЬКИ ВІДКРУЧЕНО ═════

   Парк буває в різних валютах, і доти сума показувалась як «$136 ·
   €120 · 400 PLN» <<EM>> чесно, але на це не можна глянути й зрозуміти,
   багато це чи мало. Тому зводимо в долари.

   Курс беремо з ECB (frankfurter.app, без ключа), раз на добу, і
   кладемо в localStorage: дашборд <<EM>> статичний сайт, і ходити по курс
   на кожну перемальовку таблиці було б і повільно, і без потреби.

   Зведене число ЗАВЖДИ з позначкою «≈». Курс учорашній, банк списав
   за своїм, і видавати таке за точну суму означало б зробити
   найпомітніше число на сторінці єдиним, якому не можна вірити.
   Натиснув на кнопку <<EM>> бачиш, із чого воно складене, без жодних
   перерахунків. Курс не приїхав <<EM>> показуємо розкладку, а не вигадуємо
   число. */

const FX_KEY = 'fx_usd';
const FX_TTL = 22 * 3600 * 1000;   // трохи менше доби: курс ECB оновлюється раз на день
let fxRates = null, fxAt = '', fxTried = false;

try {
  const raw = JSON.parse(localStorage.getItem(FX_KEY) || 'null');
  if (raw && raw.rates && Date.parse(raw.at) > Date.now() - FX_TTL) {
    fxRates = raw.rates; fxAt = raw.day || '';
  }
} catch (e) {}

/* Дві безкоштовні служби з однаковою формою відповіді: { rates: { PLN:
   3.9, ... } } <<EM>> скільки одиниць валюти за один долар. Друга потрібна
   не для надійності курсу, а для надійності відповіді: коли перша
   мовчить, число все одно має зʼявитись. */
const FX_SRC = [
  ['https://api.frankfurter.app/latest?from=USD', j => [j.rates, String(j.date || '')]],
  ['https://open.er-api.com/v6/latest/USD', j => [j.rates, String(j.time_last_update_utc || '').slice(5, 16)]]
];

async function fxLoad() {
  if (fxRates || fxTried) return;
  fxTried = true;                    // одна спроба на завантаження сторінки
  for (const [url, pick] of FX_SRC) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const [rates, day] = pick(await res.json());
      // Перевіряємо саме те, чим будемо ділити: об'єкт із числами.
      if (!rates || typeof rates !== 'object') continue;
      const ok = Object.values(rates).filter(v => Number.isFinite(Number(v)) && Number(v) > 0);
      if (ok.length < 5) continue;
      fxRates = rates; fxAt = day;
      try {
        localStorage.setItem(FX_KEY, JSON.stringify({ at: new Date().toISOString(), day, rates }));
      } catch (e) {}
      cabRender();
      return;
    } catch (e) { /* наступне джерело */ }
  }
}

// Скільки це в доларах. null означає «не знаємо курсу» — і це не нуль.
function fxToUsd(v, cur) {
  const c = String(cur || 'USD').toUpperCase();
  if (c === 'USD') return v;
  const r = fxRates && Number(fxRates[c]);
  return (Number.isFinite(r) && r > 0) ? v / r : null;
}

let cabSumRaw = false;
try { cabSumRaw = localStorage.getItem('cab_sum_raw') === '1'; } catch (e) {}
window.cabSumToggle = function () {
  cabSumRaw = !cabSumRaw;
  try { localStorage.setItem('cab_sum_raw', cabSumRaw ? '1' : '0'); } catch (e) {}
  cabRender();
};

function cabSumPaint(shown, all) {
  const box = document.getElementById('cab-sum');
  if (!box) return;

  // Сума по валютах. Рахуємо по тому, що ВИДНО: під фільтром «Banned»
  // загальнопаркове число відповідало б на питання, якого не ставили.
  const by = new Map();
  shown.forEach(c => {
    const v = Number(cabSpendIn(c.fb));
    if (!Number.isFinite(v) || v <= 0) return;
    const cur = String(c.fb.currency || 'USD').toUpperCase();
    by.set(cur, (by.get(cur) || 0) + v);
  });

  const parts = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const split = () => parts.map(([cur, v]) => cabMoneyCur(v, cur)).join(' \u00b7 ');

  let txt, approx = false, tip;
  if (!parts.length) {
    txt = cabMoneyCur(0, 'USD');
  } else if (cabSumRaw) {
    txt = split();
    tip = 'Split by currency. Click to convert to dollars.';
  } else {
    let usd = 0;
    const lost = [];
    parts.forEach(([cur, v]) => {
      const x = fxToUsd(v, cur);
      if (x == null) lost.push([cur, v]); else { usd += x; if (cur !== 'USD') approx = true; }
    });
    // Валюта, курсу якої немає, до долара НЕ додається: вигадане число
    // гірше за видиме «плюс стільки-то злотих».
    /* «$0 + 360 PLN» читається як «нуль доларів», хоча доларів тут
       просто немає. Коли перевести не вдалось нічого, показуємо те, що
       є, без порожнього доданка. */
    const rest = lost.map(([cur, v]) => cabMoneyCur(v, cur));
    txt = (usd > 0 || !rest.length)
      ? [cabMoneyCur(usd, 'USD')].concat(rest).join(' + ')
      : rest.join(' + ');
    tip = (approx ? 'Converted to dollars at the ECB rate' + (fxAt ? ' of ' + fxAt : '')
                  : 'All in dollars, nothing converted')
        + (lost.length ? '. No rate for ' + lost.map(x => x[0]).join(', ') + ', left as is' : '')
        + '. Click to see it split by currency.';
  }

  const whole = shown.length !== all.length ? all.length : 0;
  box.title = (tip || '') + (whole ? ' Showing ' + shown.length + ' of ' + whole + ' cabinet(s).' : '');
  box.innerHTML = `${approx ? '<span class="cab-sum-approx">\u2248</span>' : ''}
    <span class="cab-sum-n">${cabEsc(txt)}</span>
    <span class="cab-sum-k">${cabEsc(cabRangeLabel())}${whole ? ' \u00b7 ' + shown.length + '/' + whole : ''}</span>`;
}

function cabRender() {
  const list = document.getElementById('cab-list');
  const tiles = document.getElementById('cab-tiles');
  if (!list) return;

  const f = cabFacts();
  /* Перед будь-яким рахуванням станів: архів береться з твоїх рядків,
     а вони щойно могли змінитись. */
  cabArchBuild();

  /* ── злиття джерел ──

     Рядки народжує ТІЛЬКИ Facebook. accounts_mapping до них
     приклеюється: спершу покажчик «номер кабінета — твій рядок», далі
     кожен живий кабінет забирає свій.

     Номер для грошей беремо з ТВОГО рядка, коли він є: daily_stats
     ведеться за твоїм підписом, а не за номером Facebook, і підмінити
     одне іншим означало б загубити історію витрат усім, у кого підпис
     не збігається з номером. */
  const mineBy = new Map();
  cabRows.forEach(r => {
    const fb = cabFbFor(r);
    if (fb) mineBy.set(String(fb.account_id), r);
  });
  /* ЗНИКЛИЙ КАБІНЕТ ЛИШАЄТЬСЯ В СПИСКУ.
     Тут стояв .filter(a2 => !a2.missing_since) — і кабінет, у якого
     токен втратив доступ, зникав з екрана разом зі своїм спендом.
     У базі рядок при цьому цілий (fb-sync навмисне його не видаляє),
     але побачити його було нізвідки: ні скільки він відкрутив, ні що
     Facebook казав про нього останнім. Виглядало як видалення.

     Тепер він у списку, зі станом «No token», і його числа підписані
     як заморожені. У «Working» він не потрапляє — цим і тримається
     обіцянка, що робочий зріз показує тільки живе. */
  cabAll = cabFb
    .map(a2 => {
      const row = mineBy.get(String(a2.account_id));
      const id = row ? String(row.account_id || '').trim() : String(a2.account_id);
      return cabMake(row || { account_id: String(a2.account_id), _new: true }, a2, id, f);
    });
  /* Твої рядки, які не зчепились із жодним живим кабінетом. Самі по
     собі вони більше не показуються, але прив'язати їх руками треба
     вміти: інакше агент і нотатка, записані під власним підписом,
     ніколи не доїдуть до кабінета. */
  cabFree = cabRows.filter(r => !cabFbFor(r));
  const all = cabAll;

  // ── плитки-лічильники, вони ж фільтр ──
  const counts = {};
  CAB_ORDER.forEach(k => counts[k] = 0);
  all.forEach(c => counts[c.state]++);
  // Плитки тримаємо низькими й в один рядок: це навігація, а не зміст.
  // auto-fit замість брейкпойнтів — переносяться самі, коли вузько.
  /* Колір передаємо змінними — і клас .flt однаково обслуговує цю
     сторінку й Domains. Нуль притлумлюємо: фільтр, який нічого не
     покаже, не має виглядати запрошувально. */
  const tile = (k, label, n, colour, soft, bd) => `
    <button type="button" onclick="cabSetFilter('${k}')"
      class="flt ${cabFilter === k ? 'is-on' : ''} ${n ? '' : 'is-zero'}"
      style="--flt:${colour};--flt-soft:${soft};--flt-bd:${bd}">
      <span class="flt-dot"></span>
      <span class="flt-name">${label}</span>
      <span class="flt-n">${n}</span></button>`;
  const working = CAB_WORKING.reduce((a2, k) => a2 + counts[k], 0);
  if (tiles) {
    tiles.innerHTML = `<div class="flt-row">
      ${tile('working', 'Working', working, '#8B5CF6', 'rgba(139,92,246,.14)', 'rgba(139,92,246,.32)')}
      ${CAB_ORDER.map(k => tile(k, CAB_STATE[k].label, counts[k],
          CAB_STATE[k].dot, CAB_STATE[k].soft, CAB_STATE[k].bd)).join('')}
      ${tile('all', 'All', all.length - counts.archived, 'var(--text-muted)', 'var(--surface-3)', 'var(--border)')}
    </div>`
    /* Попередження стоїть ПІД плитками, тобто рівно там, куди людина
       дивиться, коли шукає свій кабінет. Ховати його в підказку чи в
       журнал означало б повторити те саме мовчання, через яке три
       рази поспіль причина лишалась невідомою. */
    + (() => {
        const lost = cabArchLost();
        if (!lost.length) return '';
        return `<p class="cab-archlost">
          \u26A0 ${lost.length} cabinet(s) are archived in your list but are not
          showing as Archived: ${cabEsc(lost.slice(0, 6).join(', '))}${
            lost.length > 6 ? ' …+' + (lost.length - 6) : ''}.
          The archive is stored, the screen is losing it \u2014 send this line over.</p>`;
      })();
  }

  /* Підказку про міграцію з екрана прибрано на прохання. Поля
     BM / profile / login / card зʼявляються самі, щойно ці колонки
     додадуть у accounts_mapping:
       ALTER TABLE public.accounts_mapping
         ADD COLUMN IF NOT EXISTS bm text,
         ADD COLUMN IF NOT EXISTS profile text,
         ADD COLUMN IF NOT EXISTS login text,
         ADD COLUMN IF NOT EXISTS card text;
     До того часу сторінка працює без них. */

  if (typeof evFeedPaint === 'function') evFeedPaint();

  // ── фільтр і пошук ──
  const q = (document.getElementById('cab-search')?.value || '').toLowerCase().trim();
  /* Архів у «All» не потрапляє — і це не примха. Архівують саме для
     того, щоб більше цей кабінет не бачити, а список, який усе одно
     його показує, робить архівування безглуздим. Побачити архів можна
     там, де його й просять: на власній плитці Archived. */
  const inFilter = c => (!cabFilter || cabFilter === 'all') ? c.state !== 'archived'
    : cabFilter === 'working' ? CAB_WORKING.includes(c.state)
    : c.state === cabFilter;
  const inText = c => !q || [c.id, c.row.provider_name, c.row.status_note,
            c.fb && c.fb.name, c.fb && c.fb.card, c.fb && c.fb.status,
            c.tok.agent, c.tok.browser, c.tok.bm, c.tok.label,
            ...CAB_EXTRA.map(e => c.row[e.key])]
           .some(v => String(v || '').toLowerCase().includes(q));
  let shown = all.filter(c => inFilter(c) && inText(c));

  cabFbNote();

  /* Коли востаннє ходили в Facebook — просто на кнопці. Окремий рядок
     під нею читали б раз і забували, а тут воно перед очима щоразу,
     коли виникає питання «а це свіже?». */
  const ago = document.getElementById('cab-sync-ago');
  if (ago) {
    const at = cabFbAt();
    ago.textContent = at ? cabAgo(at) : (cabFb.length ? '' : 'never');
    ago.title = at ? 'Last checked ' + new Date(at).toLocaleString() : 'Never synced yet';
  }

  /* Перемикач періоду. Малюємо тут, поруч із рештою стану сторінки:
     підпис на кнопці, заголовок стовпчика й число в ньому беруться з
     одного cabRange, і розійтись їм нема як. */
  const rng = document.getElementById('cab-range');
  if (rng) {
    const [a, b] = cabRangeDates();
    const rb = (k, l, tip) => `<button type="button" class="${cabRange.key === k ? 'is-on' : ''}"
        onclick="cabSetRange('${k}')"${tip ? ` title="${cabEsc(tip)}"` : ''}>${cabEsc(l)}</button>`;
    rng.innerHTML = `<div class="cab-srcsel">${
        CAB_RANGES.map(r => rb(r[0], r[1])).join('')
      }${rb('custom', 'Custom', 'Any two dates \u2014 history goes as deep as the sync has been running')}</div>`
      + (cabRange.key === 'custom' ? `<span class="cab-range-days">
          <input type="date" value="${a}" max="${cabDay(0)}"
                 onchange="cabSetRangeDay('since', this.value)">
          <span>\u2013</span>
          <input type="date" value="${b}" max="${cabDay(0)}"
                 onchange="cabSetRangeDay('until', this.value)">
        </span>` : '');
  }


  if (!shown.length) {
    /* «Nothing here» на порожньому зрізі — найгірша з відповідей:
       людина бачить порожнечу й не знає, чи це фільтр, чи справді
       нічого немає. */
    const why = cabFbErr
        ? 'Facebook data could not be read — see the note above the tiles'
      : !cabFb.length
        ? 'No token sees any cabinet yet — add one in Settings, then press Sync now'
      : 'Nothing here';
    cabSumPaint(shown, all);
    list.innerHTML =
      `<p class="text-center opacity-30 py-16 text-xs font-black uppercase tracking-widest">${why}</p>`;
    cabDetail(null);
    return;
  }

  cabSumPaint(shown, all);
  list.innerHTML = cabSection(shown);

  cabDetail(shown.find(c => c.id === cabSel) || null);
}

/* Таблиця. Набір колонок один — секцій більше немає, бо ділити стало
   нічого: усе в списку однаково живе й однаково повне. */
function cabSection(items) {
  if (!items.length) return '';

  const arrow = k => cabSort.key === k ? (cabSort.dir < 0 ? ' ↓' : ' ↑') : '';
  const th = (k, label, cls) => `<th class="${cls || ''}" onclick="cabSortBy('${k}')">${label}${arrow(k)}</th>`;

  // Типове сортування — за станом: зверху те, що вимагає дії.
  const rank = s2 => CAB_ORDER.indexOf(s2);
  const val = { state: c => rank(c.state), id: c => c.id,
                agent: c => String(c.row.provider_name || c.tok.agent || ''),
                today: c => (c.fb ? Number(cabSpendIn(c.fb)) || 0 : 0),
                spend: c => c.x.spend, age: c => c.age, last: c => c.x.last || '' };
  const get = val[cabSort.key] || val.state;
  const sorted = items.slice().sort((a, b) => {
    const A = get(a), B = get(b);
    const d = typeof A === 'string' ? A.localeCompare(B) : A - B;
    // За станом порядок фіксований (CAB_ORDER), тож напрямок не інвертуємо
    // всліпу — всередині однакового стану добиваємо спендом.
    return (cabSort.key === 'state' ? d : d * cabSort.dir) || b.x.spend - a.x.spend;
  });

  // ── групування ──
  const keyOf = cabGroupKey;
  const groups = {};
  sorted.forEach(c => (groups[keyOf(c)] = groups[keyOf(c)] || []).push(c));

  const COLS = 11;

  /* Ширину колонки номера рахуємо з того, що в ній справді лежить.
     Стала ширина вирівнює, але в команді з короткими номерами лишала б
     півтори сотні пікселів порожнечі в кожному рядку. Мінімум у 6 —
     щоб зовсім короткі номери не злипались із мітками; стеля у 22 —
     щоб один довгий підпис новоствореного кабінета не розсунув
     стовпчик на пів таблиці. */
  const idW = Math.min(22, Math.max(6, ...sorted.map(c => String(c.id).length)));

  /* Обгортка заради телефона: таблиця там ширша за екран, і без
     власного скролера її просто обрізало б. Обрізане читається як
     «даних немає», прокрутка — як «дані далі». Обгортаємо саме
     таблицю, а не весь список: у списку живе ще й розбір кабінета зі
     своєю прокруткою, і другий скролер навколо нього лише заважав би. */
  return `<div class="cab-scroll"><table class="cab-tbl" style="--cab-id-w:${idW}ch">
    <thead><tr>
      ${th('state', 'State')}
      ${th('id', 'Account')}
      ${th('agent', 'Agent')}
      <th class="ta-c" title="Campaigns that actually deliver: switched on AND with a live ad inside">Camp</th>
      <th class="ta-c" title="Ad sets that actually deliver: switched on AND with a live ad inside">Sets</th>
      <th class="ta-c" title="Ads running right now">Ads</th>
      ${th('today', cabEsc(cabRangeLabel()), 'ta-r')}
      ${th('spend', 'Spend', 'ta-r')}
      ${th('age', 'Days', 'ta-r')}
      ${th('last', 'Last spend', 'ta-r')}
      <th class="ta-c">14d</th>
    </tr></thead><tbody>
    ${Object.entries(groups).map(([g, list2]) => {
      const gh = g ? `<tr class="cab-grp"><td colspan="${COLS}">
          <span class="cab-grp-name">${g}</span>
          <span class="cab-grp-sub">${list2.length} · ${list2.filter(i => i.state === 'running').length} running ·
            ${cabMoney(list2.reduce((a2, i) => a2 + i.x.spend, 0))}</span>
          ${list2.some(i => i.fb) ? `<button class="cab-grp-sync" onclick="cabSyncGroup('${cabEsc(g).replace(/'/g, "\\'")}')"
            title="Ask Facebook about this group only. Faster than the whole park \u2014 and the cabinets you did not ask about are left alone, not marked as lost.">\u21bb sync</button>` : ''}
          </td></tr>` : '';
      return gh + list2.map(cabRowHtml).join('');
    }).join('')}
    </tbody></table></div>`;
}

/* Ключ групи рахується у двох місцях — при малюванні й при прогоні по
   групі. Друга копія розійшлася б із першою рівно тоді, коли її
   змінять, і кнопка прогнала б не ту групу, що написана поруч. */
function cabGroupKey(c) {
  return cabGroup === 'agent'   ? (c.row.provider_name || c.tok.agent || '— no agent —')
       : cabGroup === 'state'   ? CAB_STATE[c.state].label
       : cabGroup === 'profile' ? (c.row.profile || c.tok.browser || '— no browser —')
       : cabGroup === 'bm'      ? (c.row.bm || c.tok.bm || '— no BM —')
       : '';
}

function cabRowHtml(c) {
  const S = CAB_STATE[c.state];
  const n = cabCounts(c.fb);
  const why = cabWhy(c);
  const num = v => `<td class="ta-c cab-num">${v == null ? '<span class="cab-na">—</span>' : v}</td>`;
  // Те саме, але з розбивкою в підказці: щоб не відкривати панель
  // заради питання «а чому так мало».
  const numTip = (v, tip) => !tip ? num(v)
    : `<td class="ta-c cab-num has-tip" title="${cabEsc(tip)}">${
        v == null ? '<span class="cab-na">—</span>' : v}</td>`;
  const label = (c.state === 'notoken' && c.lost > 0) ? `${S.label} · ${c.lost}d`
    /* «Never ran» — сильне твердження, і казати його кабінету з
       історією витрат не можна. Idle означає «зараз нічого не
       крутиться», і це правда в обох випадках; різницю дописуємо лише
       там, де вона є. */
    : (c.state === 'idle' && !cabEverRan(c.x, c.fb)) ? 'Never ran'
    : S.label;
  /* НАЗВУ З FACEBOOK НЕ ПОКАЗУЄМО. Її вигадує той, хто заводив кабінет,
     вона нічого не каже про те, звідки цей кабінет запускають, і в
     рядку просто відсувала браузер — єдиний підпис, який тут справді
     потрібен. Кабінет упізнають за номером і браузером; за назвою —
     ніхто. Для пошуку й зчеплення з токеном назва лишається, вона
     просто не малюється. */
  const primary = c.id;
  /* Прочерк тут означає рівно «нуль за цей період», і нічого більше.
     Коли ми взагалі не знаємо — історії ще немає — показуємо знак
     питання: це різні відповіді, і плутати їх не можна. */
  const inRange = cabSpendIn(c.fb);
  const today = inRange == null ? '<span class="cab-na" title="No spend history yet — see the note above the tiles">?</span>'
    : inRange > 0 ? cabMoneyCur(inRange, c.fb.currency)
    : '<span class="cab-na">—</span>';
  return `<tr class="cab-tr ${cabSel === c.id ? 'is-sel' : ''} ${c.state === 'notoken' ? 'is-frozen' : ''}"
      onclick="cabPick('${encodeURIComponent(c.id).replace(/'/g, '%27')}')">
    <td><span class="cab-dot" style="background:${S.dot}"></span><span class="${S.tone} cab-state">${label}</span></td>
    <td>
      <span class="cab-src is-live" title="${String(why.text).replace(/"/g, '&quot;')}">${why.mark}</span>
      <span class="cab-id">${primary}</span>
      ${c.row.profile
        ? `<span class="cab-chip">${cabEsc(c.row.profile)}</span>`
        : c.tok.browser
          ? `<span class="cab-chip is-auto" title="Browser from the token name: ${cabEsc(c.tok.label)}">${cabEsc(c.tok.browser)}</span>`
          : ''}
      ${(() => { const w = cabIssueWhy(c); return w
        ? `<span class="cab-chip is-gone" title="${cabEsc(w.tip)}">${cabEsc(w.text)}</span>` : ''; })()}
      ${c.fb && String(c.fb.status) === 'unknown' ? `<span class="cab-chip is-auto" title="Facebook returned a status code this dashboard does not know yet. It is not treated as a problem \u2014 the state below comes from the money.">status unknown</span>` : ''}
      ${cabPending(c.fb) ? `<span class="cab-chip is-review" title="Facebook has not finished checking ${
        cabPending(c.fb)} ad(s) yet. Nothing to do but wait — it usually takes minutes, sometimes hours.">${
        cabPending(c.fb)} in review</span>` : ''}
      ${c.fb && String(c.fb.status) === 'review' ? `<span class="cab-chip is-gone" title="Facebook put the ad account ITSELF under review, not just its ads. Payments and delivery can stop while it lasts.">account in review</span>` : ''}
      ${c.fb && c.fb.missing_since ? `<span class="cab-chip is-gone" title="${cabEsc(why.text)}">frozen</span>` : ''}
      ${c.fb && !c.fb.missing_since && !c.fb.token_id ? `<span class="cab-chip is-gone" title="The token this cabinet came from was deleted, so nothing can go to Facebook for it — no export, no comments, no stopping campaigns. Press Sync now; if the token is gone from Settings, add it again first.">no token</span>` : ''}
    </td>
    <td class="cab-dim">${c.row.provider_name
      ? cabEsc(c.row.provider_name)
      : c.tok.agent
        ? `<span class="cab-auto" title="Agent from the token name: ${cabEsc(c.tok.label)}">${cabEsc(c.tok.agent)}</span>`
        : '—'}</td>
    ${numTip(n && n.campaigns, [cabOnTip(c.fb, 'campaigns'), cabByStatus(c.fb.campaigns_by_status)].filter(Boolean).join(' \u2014 '))}
    ${numTip(n && n.adsets, [cabOnTip(c.fb, 'adsets'), cabByStatus(c.fb.adsets_by_status)].filter(Boolean).join(' \u2014 '))}
    ${numTip(n && n.ads, cabByStatus(c.fb.ads_by_status))}
    <td class="ta-r cab-num cab-today">${today}</td>
    <td class="ta-r cab-num">${c.x.spend > 0 ? cabMoney(c.x.spend) : '<span class="cab-na">—</span>'}</td>
    <td class="ta-r cab-num">${c.age || '<span class="cab-na">—</span>'}</td>
    <td class="ta-r cab-dim">${c.x.last || '—'}</td>
    <td class="ta-c ${S.tone}" style="height:1px">${cabSpark(c.x.byDay, c.x.last, 58, 16)}</td>
  </tr>`;
}

/* «3 зі 180» — чесне число, яке нічого не пояснює. Цей рядок і є
   пояснення: що саме тримає решту. Відхилені й «з помилками» виділені
   кольором, бо пауза — твій вибір, а відхилення — ні. */
/* Кампанії, які ввімкнені й нічого не показують. Окремим рядком і
   червоним, бо це не «трохи менше, ніж здавалось» — це гроші, які ти
   вважаєш робочими, а вони стоять. */
function cabDead(fb) {
  if (!fb) return '';
  const n = Number(fb.campaigns_on) - Number(fb.campaigns_active);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `<p class="cab-fb-warn">${n} campaign(s) switched on but not delivering `
    + '\u2014 nothing inside them is approved and running.</p>';
}

function cabWhyNot(fb) {
  const by = fb && fb.ads_by_status;
  if (!by || typeof by !== 'object') return '';
  const skip = k => k === 'ACTIVE' || CAB_ST_GONE.includes(k);
  const rest = Object.entries(by)
    .filter(([k, v]) => Number(v) > 0 && !skip(k))
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => v + ' ' + cabStWord(k))
    .join(' \u00b7 ');
  if (!rest) return '';
  const n = Object.entries(by).reduce((a, [k, v]) => a + (skip(k) ? 0 : Number(v) || 0), 0);
  if (!n) return '';
  const bad = CAB_ST_BAD.some(k => Number(by[k]) > 0);
  return `<p class="${bad ? 'cab-fb-warn' : 'cab-fb-note'}">${n} ad(s) not running: ${cabEsc(rest)}</p>`;
}

function cabDetail(c) {
  const box = document.getElementById('cab-detail');
  if (!box) return;
  /* Разом із карткою кабінета показуємо і його нутро — кампанії з
     числами. Окремого кліку для цього немає навмисно: питання «що
     всередині» виникає рівно тоді, коли кабінет вибрали. */
  if (typeof cdOpen === 'function') { if (c) cdOpen(c.id); else { cdHide(); cdBar(''); } }
  /* Саме нутро не відкривається від вибору кабінета — див. cabdrill.js.
     Сюди заходять і просто по експорт, а таблиця на пів екрана в такі
     хвилини тільки заважає. */
  if (!c) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  const S = CAB_STATE[c.state];
  const esc = v => String(v == null ? '' : v)
    .replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const enc = encodeURIComponent(c.id);
  const why = cabWhy(c);

  const cell = (k, v, tip) => `<div class="rounded-lg px-2 py-1.5"${
      tip ? ` title="${esc(tip)}"` : ''} style="background:var(--surface-2)">
      <p class="text-[9px] font-black uppercase tracking-widest" style="color:var(--text-muted)">${k}</p>
      <p class="text-[12px] font-black text-dynamic font-mono">${v}</p></div>`;

  /* Чи показуємо картку з памʼяті, а не з цієї синхронізації. Порівнюємо
   час, коли її бачили востаннє, з часом самої синхронізації: збіг —
   значить приїхала щойно. Запас у дві хвилини на те, що великий парк
   обходиться не миттєво і час у рядках може розійтись. */
function cabCardOld(fb) {
  if (!fb || !fb.card) return false;
  const seen = Date.parse(fb.card_last_seen || '');
  const sync = Date.parse(fb.synced_at || '');
  if (!seen || !sync) return false;          // стара база — мовчимо, а не вигадуємо
  if (seen >= sync - 120000) return false;
  const d = new Date(seen);
  return d.toISOString().slice(0, 10);
}

/* Живих зі скількох. Одне число без другого брехливе в обидва боки:
     «3 кампанії» не каже, чи решта сорока вимкнена свідомо, чи їх
     просто немає. */
  const pair = (live, all) => (live == null && all == null) ? '—'
    : (live == null ? '?' : live) + '/' + (all == null ? '?' : all);

  const head = `<div class="flex items-start justify-between gap-2 mb-3">
      <div class="min-w-0">
        <p class="text-[13px] font-black text-dynamic truncate">${esc(c.id)}</p>
        <p class="text-[10px] font-black uppercase tracking-widest ${S.tone}">${S.label}</p>
        <p class="text-[9px] font-bold" style="color:var(--text-muted)">${esc(why.text)}</p>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        ${c.fb ? `<button class="cab-grp-sync" onclick="cabSyncOne('${enc}')"
          title="Ask Facebook about this one cabinet. Seconds instead of the whole park \u2014 and the cabinets you did not ask about are left alone, not marked as lost.">\u21bb sync</button>` : ''}
        ${c.fb && c.fb.missing_since ? `<button class="cab-grp-sync is-drop" onclick="cabDrop('${enc}')"
          title="No token sees this cabinet any more, so nothing will bring the row back. Removing it is only for cabinets like this one \u2014 a live cabinet would reappear on the next sync, and the button would look broken.">\u2715 remove</button>` : ''}
        <button onclick="cabPick('${enc}')" class="text-slate-500 hover:text-red-400 text-lg leading-none">&times;</button>
      </div>
    </div>`;

  // ── що каже Facebook ──
  const fbBlock = `<div class="cab-fb">
      <p class="cab-fb-head">Facebook<span>${cabFbAt() ? cabAgo(cabFbAt()) : 'never synced'}</span></p>
      <div class="grid grid-cols-2 gap-2">
        ${(() => {
          const v = cabSpendIn(c.fb);
          const [a, b] = cabRangeDates();
          return cell(esc(cabRangeLabel()),
            v == null ? '?' : v > 0 ? cabMoneyCur(v, c.fb.currency) : '—',
            v == null ? 'No spend history yet — run the fb_spend_daily block from FB_SYNC.sql'
                      : (a === b ? a : a + ' — ' + b) + ', as Facebook counts the day for this cabinet');
        })()}
        ${cell('State', esc(c.fb.status || '—'))}
        ${/* За чиїм годинником цей кабінет вважає «сьогодні». Без цього
              рядка розбіжність зі спендом в Ads Manager виглядає як
              поламаний підрахунок, а це просто інша доба. */
          cell('Timezone', c.fb.timezone_name
                 ? esc(String(c.fb.timezone_name).split('/').pop().replace(/_/g, ' '))
                   + (cabTzLabel(c.fb.timezone_name)
                      ? ` <span class="cab-cur">${esc(cabTzLabel(c.fb.timezone_name).split(' \u00b7 ')[0])}</span>`
                      : '')
                 : '—',
               c.fb.timezone_name
                 ? c.fb.timezone_name + '\n' + cabTzLabel(c.fb.timezone_name)
                   + '\n\nFacebook counts this cabinet\u2019s day by this clock, not yours. '
                   + 'That is why «today» here can differ from «today» in your own reports.'
                 : 'The sync has not brought this cabinet yet, so its clock is unknown \u2014 '
                   + 'this is not UTC, it is «we do not know».')}
        ${/* НАРАХОВАНО Й ЩЕ НЕ СПИСАНО. Facebook віддає це полем balance,
              і воно вже лежало в базі — просто ніде не показувалось. Це
              єдине, що він каже про гроші по картці: списань списком у
              Marketing API немає (перевірено кнопкою нижче: ребер
              transactions, invoices, adspaymentcycle не існує).

              Нуль і «не знаємо» тут різні речі: нуль означає «щойно
              списали, борг закрито», а прочерк — що поля не приїхало. */
          cell('Not charged yet', c.fb.balance == null ? '—'
                 : cabMoneyCents(c.fb.balance, c.fb.currency),
               c.fb.balance == null
                 ? 'Facebook did not send the balance for this cabinet'
                 : 'Spent but not yet taken from the card. Facebook charges it '
                   + 'when it reaches the billing threshold, or on the monthly date.')}
        ${cell('Campaigns', pair(c.fb.campaigns_active, c.fb.campaigns),
               cabByStatus(c.fb.campaigns_by_status))}
        ${cell('Ad sets', pair(c.fb.adsets_active, c.fb.adsets),
               cabByStatus(c.fb.adsets_by_status))}
        ${cell('Ads', pair(c.fb.ads_active, c.fb.ads),
               cabByStatus(c.fb.ads_by_status))}
        ${/* Валюта стоїть поруч із карткою навмисно: обидва рядки про
              те, ЧИМ платить кабінет. Окремою клітинкою вона з'їдала б
              місце заради трьох літер, які й так потрібні лише поруч із
              сумою. */
          (() => {
            /* Картка, яку Facebook уже не віддає, — не прочерк. Він
               перестає її показувати, щойно кабінет забанили або токен
               втратив доступ, а питання «чим цей кабінет платив»
               виникає саме тоді. fb-sync тепер памʼятає останню відому;
               тут лишається не видати її за теперішню. */
            const old = cabCardOld(c.fb);
            return cell('Card', (c.fb.card
                ? `<span${old ? ' style="opacity:.65"' : ''}>${esc(c.fb.card)}</span>${
                    old ? '<span class="cab-cur">was</span>' : ''}`
                : '—')
              + (c.fb.currency ? ` <span class="cab-cur">${esc(c.fb.currency)}</span>` : ''),
              (old ? 'Facebook no longer reports a card for this cabinet. This is the last '
                   + 'one we saw' + (old === true ? '' : ', on ' + old) + '.\n\n'
                 : '')
              + (c.fb.currency ? 'This cabinet is billed in ' + c.fb.currency : ''));
          })()}
      </div>
      ${cabDead(c.fb)}
      ${cabWhyNot(c.fb)}
      ${typeof fpForCab === 'function' ? fpForCab(c) : ''}
      ${c.fb.disable_reason ? `<p class="cab-fb-note">${esc(c.fb.disable_reason)}</p>` : ''}
      ${c.fb.sync_error ? `<p class="cab-fb-warn">${esc(c.fb.sync_error)}</p>` : ''}
    </div>`;

  /* Кабінет, який приїхав із токена, а в accounts_mapping його немає.
     Редагувати тут нічого: рядка, куди писати агента й профіль, ще не
     існує. Заводимо його одним натисканням, а не змушуємо йти в іншу
     вкладку й переписувати номер руками. */
  if (c.row._new) {
    /* Твої рядки, які не дістались жодного живого кабінета. Здебільшого
       це той самий кабінет під власним підписом, який автоматика не
       впізнала: підпис свій, а Facebook знає його під номером. Завести
       новий рядок замість того, щоб причепити старий, означало б
       залишити агента й нотатку висіти в порожнечі. */
    const link = (!cabFree.length || !cabCols.fb_account_id) ? ''
      : `<label class="block text-[9px] font-black uppercase tracking-widest mb-1 mt-3"
              style="color:var(--text-muted)">Or link a row you already have</label>
         <select onchange="cabLinkTo(this.value, '${esc(c.fb.account_id)}')"
           class="w-full bg-black/25 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-dynamic outline-none focus:border-violet-500">
           <option value="">${cabFree.length} row(s) not linked to any cabinet</option>
           ${cabFree.map(r => `<option value="${esc(r.id)}">${
             esc(r.account_id)}${r.provider_name ? ' \u00b7 ' + esc(r.provider_name) : ''}</option>`).join('')}
         </select>`;
    box.innerHTML = `<div class="card p-4 rounded-2xl">
      ${head}${fbBlock}
      <p class="text-[10px] font-bold mt-3 mb-2" style="color:var(--text-muted)">
        This one came from the token and is not in your list yet. Add it to write down
        the agent, profile, login and notes — Facebook knows none of that.</p>
      <button onclick="cabAdopt('${enc}')"
        class="w-full px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition
               bg-violet-600 text-white hover:brightness-110">Add to my list</button>
      <!-- Відкласти кабінет можна й НЕ заводячи його вручну: рядок
           заведеться сам, бо архіву треба десь лежати. Без цього
           «Archive» тут просто не існувало, і кабінет, який не хочеш
           бачити, лишався на екрані назавжди. -->
      <button onclick="cabArchiveNew('${enc}')"
        class="w-full mt-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition
               text-muted-dynamic hover:text-white"
        style="background:var(--surface-2);border:1px solid var(--border)"
        title="Adds it to your list and puts it straight into the archive">Archive it</button>
      ${link}
    </div>`;
    return;
  }

  /* Що можна взяти з назви токена й від Facebook. Своє завжди
     головніше: підставляємо це лише в ПОРОЖНІ поля, і то підказкою, а
     не значенням — щоб було видно, що воно ще не збережене. */
  const auto = { bm: c.tok.bm, profile: c.tok.browser };
  const field = e => cabCols[e.key]
    ? `<div class="mb-2">
         <label class="block text-[9px] font-black uppercase tracking-widest mb-1" style="color:var(--text-muted)">${
           e.key === 'profile' && c.tok.browser ? 'Browser' : e.label}</label>
         <input value="${String(c.row[e.key] || '').replace(/"/g, '&quot;')}"
           placeholder="${auto[e.key] ? cabEsc(auto[e.key]) + ' (from token)' : ''}"
           onchange="cabSaveField('${c.row.id}','${e.key}',this.value)"
           class="w-full bg-black/25 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-dynamic outline-none focus:border-violet-500"></div>`
    : '';

  /* КНОПКИ «Fill from the token name» БІЛЬШЕ НЕМА.

     Вона питала дозволу на те, що й так однозначне: другий шматок
     назви токена — це браузер, і іншим він не буде. Поки дозволу не
     дали, дані вже були, а на екрані їх не було. Тепер cabAutoFill
     дописує порожні поля сам, одразу після завантаження. */


  box.innerHTML = `<div class="card p-4 rounded-2xl">
    ${head}

    <div class="grid grid-cols-2 gap-2 mb-3">
      ${[['Spend', c.x.spend > 0 ? cabMoney(c.x.spend) : '—'],
         ['Days live', c.age || '—'],
         ['First spend', c.x.first || '—'],
         ['Last spend', c.x.last || '—']].map(([k, v]) => cell(k, v)).join('')}
    </div>

    <div class="mb-3 ${S.tone}">${cabSpark(c.x.byDay, c.x.last, 290, 38)}</div>

    ${fbBlock}

    <label class="block text-[9px] font-black uppercase tracking-widest mb-1 mt-3" style="color:var(--text-muted)">Status</label>
    <div class="flex gap-1 mb-3">
      ${[['active', 'OK'], ['problem', 'Issue'], ['ban', 'Ban'], ['archive', 'Archive']].map(([k, l]) => `
        <button onclick="cabSetStatus('${c.row.id}','${k}')"
          class="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition
                 ${String(c.row.status || 'active') === k ? 'bg-violet-600 text-white' : 'text-muted-dynamic hover:text-white'}"
          style="${String(c.row.status || 'active') === k ? '' : 'background:var(--surface-2)'}">${l}</button>`).join('')}
    </div>
    ${c.fb && CAB_FB_STATE[String(c.fb.status || '')] ? `<p class="cab-fb-warn mb-3">
        Facebook says this one is ${esc(c.fb.status)} — the buttons above cannot undo that.</p>` : ''}

    ${CAB_EXTRA.map(field).join('')}

    <label class="block text-[9px] font-black uppercase tracking-widest mb-1" style="color:var(--text-muted)">Note</label>
    <textarea rows="3" onchange="cabSaveField('${c.row.id}','status_note',this.value)"
      class="w-full bg-black/25 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-dynamic outline-none focus:border-violet-500"
      placeholder="What was launched here, which card, anything worth remembering">${String(c.row.status_note || '')}</textarea>

    ${typeof evForAccount === 'function' ? evForAccount(c.id) : ''}

    ${typeof fbrBlock === 'function' ? fbrBlock(c) : ''}

    ${typeof fcmBlock === 'function' ? fcmBlock(c) : ''}

    <button onclick="cabStopAll('${enc}')"
      class="w-full mt-3 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition
             text-red-400 hover:text-white hover:bg-red-600"
      style="border:1px solid rgba(239,68,68,.35)">Stop all campaigns</button>
  </div>`;
}

/* Завести кабінет, який приїхав із токена, у свій список. Номер і
   прив'язку ставимо самі — переписувати його руками означає рано чи
   пізно переставити цифру. */
window.cabAdopt = async function (idEnc) {
  const id = decodeURIComponent(idEnc);
  const c = cabAll.find(x => x.id === id);
  if (!c || !c.fb) return;
  const patch = { team_name: currentTeam, account_id: id };
  if (cabCols.fb_account_id) patch.fb_account_id = id;
  /* Заводимо вже підписаним: агент і браузер лежать у назві токена,
     БМ сказав Facebook. Змушувати переписувати це руками — єдиний
     спосіб отримати тут одруківку. */
  if (c.tok.agent) patch.provider_name = c.tok.agent;
  if (c.tok.browser && cabCols.profile) patch.profile = c.tok.browser;
  if (c.tok.bm && cabCols.bm) patch.bm = c.tok.bm;
  const { data, error } = await sb.from('accounts_mapping').insert(patch).select();
  if (error) return alert('Could not add: ' + error.message);
  if (data && data[0]) cabRows.push(data[0]);
  cabRender();
};

/* Покласти в архів кабінет, якого ще немає у твоєму списку.

   Архіву треба десь лежати: у синтетичного рядка {account_id, _new}
   немає ні id, ні місця під статус. Тому спершу заводимо рядок, потім
   ставимо архів — одним натисканням, бо ззовні це одна дія. */
window.cabArchiveNew = async function (idEnc) {
  await cabAdopt(idEnc);
  const id = decodeURIComponent(idEnc);
  const row = cabRows.find(r => String(r.account_id || '').trim() === id);
  if (!row) { alert('Could not archive: the row was not created.'); return; }
  await cabSetStatus(row.id, 'archive');
};

window.cabLinkTo = function (id, fbId) { return cabSaveField(id, 'fb_account_id', fbId); };


/* Зупинка всіх кампаній кабінета.

   Зупиняємо КАМПАНІЇ, і тільки їх: пауза на кампанії глушить усе, що
   під нею. Адсети й оголошення чіпати не треба, і на кабінеті з
   десятьма кампаніями це десять записів замість двохсот.

   Сам похід у Facebook — у функції fb-pause: токен закритий навіть від
   власника, і зі сторінки написати ним нічого не можна. Це не перешкода,
   яку варто обходити, а те, заради чого все й зроблено.

   Зворотної кнопки «увімкнути все» немає навмисно: вмикати треба
   вибірково й свідомо, інакше одна кнопка підніме те, що глушили
   спеціально. */
async function cabStopAll(idEnc) {
  const id = decodeURIComponent(idEnc);
  const c = cabAll.find(x => x.id === id);
  if (!c || !c.fb) return alert('This cabinet is not covered by a token — nothing to stop from here.');

  const n = cabCounts(c.fb);
  const what = n && n.campaigns != null ? `${n.campaigns} active campaign(s)` : 'every active campaign';
  /* Називаємо номером, а не назвою з Facebook: у списку людина бачить
     номер, і підтвердження мусить питати про ТЕ САМЕ, що в неї перед
     очима. Інакше зупиняєш «Main acc», а в таблиці такого немає. */
  const name = id;
  if (!await ask({ title: 'Stop everything?', danger: true, ok: 'Stop them',
    body: `Stop ${what} in ${name}?\n\n`
      + 'They will be paused in Facebook. Turning them back on is a separate, deliberate step '
      + '— there is no button for it here.' })) return;

  /* Поки зупиняємо — живий тост; усе, що йде далі, це вже
     результат, і він має згаснути сам. */
  const step = toastStep();
  const say = (html, tone) => step.done(html, cabKind(tone), true);
  step.say(`Pausing campaigns in ${cabEsc(name)}…`, '', true);

  let j;
  try {
    const { data: sess } = await sb.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('not signed in');
    const res = await fetch(SUPABASE_URL + '/functions/v1/fb-pause', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY,
                 'content-type': 'application/json' },
      body: JSON.stringify({ account_id: c.fb.account_id })
    });
    if (res.status === 404 && !res.headers.get('content-type')?.includes('json'))
      throw Object.assign(new Error('not deployed'), { code: 'missing' });
    j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
  } catch (e) {
    const net = /failed to fetch|networkerror|load failed/i.test(e.message || '');
    return say(e.code === 'missing' || net
      ? 'The fb-pause function did not answer. Either it is not deployed yet '
        + '(<span class="font-mono">supabase functions deploy fb-pause</span>), '
        + 'or JWT verification is on for it.'
      : 'Could not stop: ' + cabEsc(e.message), 'var(--bad)');
  }

  if (!j.total) return say(cabEsc(j.note || 'Nothing was running in this cabinet.'));

  /* Часткова невдача — не виняток, а очікуваний результат, і мовчати про
     неї найгірше: людина натиснула кнопку й вважає, що кабінет стоїть. */
  const bits = [`Paused ${j.paused} of ${j.total} campaign(s)`];
  if (j.failed) bits.push(`${j.failed} did not stop`);
  if (j.stopped) bits.push(cabEsc(j.stopped));
  say(bits.join(' · ')
    + (j.problems && j.problems.length
        ? '<br><span class="opacity-70">' + j.problems.map(cabEsc).join('<br>') + '</span>' : ''),
    j.failed ? 'var(--bad)' : 'var(--ok)');

  /* Числа в базі щойно застаріли. Не вгадуємо їх, а питаємо Facebook
     заново — і саме по цьому токену, щоб не ганяти весь парк. */
  if (typeof fbSync === 'function' && c.fb.token_id) {
    await fbSync(null, { token_id: c.fb.token_id });
    await cabFbLoad();
    cabRender();
  }
}

/* ПРИБРАТИ КАБІНЕТ ЗІ СПИСКУ.

   Рядки у fb_accounts пише лише fb-sync, і доти сторінка їх лише
   читала. Але після тестів у парку лишаються чужі кабінети: токен
   давно видалено, а рядок стоїть, псує лічильники й лізе в око.

   Прибирати можна ТІЛЬКИ те, чого вже не бачить жоден токен. Живий
   кабінет видалився б і повернувся найближчим прогоном — кнопка
   виглядала б зламаною, а людина думала б, що щось не так із правами.
   Та сама умова стоїть і в політиці бази, щоб обіцянка кнопки й
   дозвіл збігались, а не трималися на тому, що сторінка чемна.

   DELETE, що не зачепив жодного рядка, PostgREST віддає як порожній
   успіх — рівно та сама мовчанка, що й з UPDATE нижче. Тому питаємо
   .select(): рядок повернувся — прибрали; ні — кажемо чому. */
window.cabDrop = async function (id) {
  const c = cabAll.find(x => String(x.id) === String(id));
  if (!c || !c.fb || !c.fb.missing_since) return;
  if (!confirm('Remove cabinet ' + c.id + ' from the list?\n\n'
      + 'Only the row here goes away. Nothing changes in Facebook, and your own '
      + 'notes in Accounts stay. If a token ever sees this cabinet again, the row '
      + 'comes back with it.')) return;
  const step = toastStep();
  try {
    const { data, error } = await sb.from('fb_accounts')
      .delete().eq('account_id', String(c.id)).select('account_id');
    if (error) throw error;
    if (!(data && data.length)) {
      /* Найчастіша причина — не виконаний блок прав. Називаємо файл, бо
         «нічого не сталось» без адреси коштує півгодини пошуку. */
      step.done('Nothing was removed. Run the <span class="font-mono">own_delete_lost</span> '
        + 'block from <span class="font-mono">FB_SYNC.sql</span> \u2014 without it the page '
        + 'may only read this table.', 'is-warn', true);
      return;
    }
    cabSel = null;
    await cabFbLoad();
    cabRender();
    step.done('Cabinet ' + cabEsc(c.id) + ' removed from the list', 'is-ok', true);
  } catch (e) {
    step.done('Could not remove: ' + cabEsc(e.message || e), 'is-error', true);
  }
};

/* ЗАПИС, ЯКИЙ НІЧОГО НЕ ЗАПИСАВ.

   PostgREST на UPDATE, що не зачепив жодного рядка, повертає НЕ
   помилку, а порожній успіх. Не той id, RLS не пустила, рядок в іншій
   команді — назовні все три виглядають як «збережено».

   Саме через це архів «витягувало» назад: кнопка малювала Archived,
   у базі не мінялось нічого, і після першого ж перезавантаження
   статус повертався туди, звідки його бере Facebook. Причому
   НЕ ОДРАЗУ — а значить, і звʼязку з натисканням не видно.

   Тому питаємо .select(): рядок повернувся — записали; не повернувся
   — кажемо про це вголос і відкочуємо те, що намалювали. Мовчазна
   невдача тут гірша за будь-яку помилку: людина впевнена, що кабінет
   відкладено, і повертається до нього через тиждень. */
async function cabWrite(id, patch) {
  const { data, error } = await sb.from('accounts_mapping')
    .update(patch).eq('id', id).select('id');
  if (error) return error.message;
  if (!(data && data.length))
    return 'the row was not saved — it is not yours, or it belongs to another team (id ' + id + ')';
  /* Той самий рядок лежить ще й в accRows — окремому кеші вікна
     Accounts. Лишити його старим означає, що дві частини сторінки
     думають про кабінет різне, а журнал акуратно записує цю розбіжність
     як подію. Саме так архів і «змінював статус» сам собою. */
  if (typeof accRows !== 'undefined' && Array.isArray(accRows)) {
    const twin = accRows.find(r => String(r.id) === String(id));
    if (twin) Object.assign(twin, patch);
  }
  return '';
}

async function cabSaveField(id, key, value) {
  const row = cabRows.find(r => String(r.id) === String(id));
  /* Рядка немає в памʼяті — писати нікуди, і мовчати про це не можна:
     зовні це виглядає як звичайне збереження. */
  if (!row) { alert('Could not save: this cabinet is not in your list yet — press '
    + '“Add to my list” first.'); return; }
  const prev = row[key];
  row[key] = value;
  const patch = {}; patch[key] = value;
  const why = await cabWrite(id, patch);
  if (why) { row[key] = prev; alert('Could not save: ' + why); }
  cabRender();
}

async function cabSetStatus(id, status) {
  const row = cabRows.find(r => String(r.id) === String(id));
  if (!row) { alert('Could not save: this cabinet is not in your list yet — press '
    + '“Add to my list” first.'); return; }
  const prev = row.status;
  // Стан рахуємо до і після: ручний статус — це такий самий перехід, як
  // і той, що ми ловимо з грошей, і в журналі він має лежати поруч.
  const f = cabFacts();
  const fb = cabFbFor(row);
  const was = cabStateOf(row, f, fb);
  row.status = status;
  // Набір архівних щойно змінився — інакше журнал записав би перехід
  // «archived → archived» або навпаки проґавив би його.
  cabArchBuild();
  const now = cabStateOf(row, f, fb);
  cabRender();
  const why = await cabWrite(id, { status });
  /* Відкочуємо саме те, що намалювали. Лишити на екрані Archived, якого
     немає в базі, — це та сама тиша, тільки відкладена до наступного
     перезавантаження. */
  if (why) { row.status = prev; cabRender(); alert('Could not save: ' + why); return; }
  if (typeof evLog === 'function') await evLog(String(row.account_id || '').trim(), was, now, '', 'manual');
}

// Дані дашборда приїжджають після того, як сторінка вже намальована:
// зайшов одразу на #/cabinets — і весь парк показало б як «ніколи не
// крутив», бо rawData на той момент ще порожній. Тому loadData у кінці
// смикає перемальовку. Саме перемальовку, не перезавантаження списку.
function cabRefresh() {
  if (!cabLoaded) return;
  if (!document.getElementById('cab-list')) return;
  cabRender();
}

window.cabInit = cabInit;
window.cabRefresh = cabRefresh;
