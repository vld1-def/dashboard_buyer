<script>
/* ══════════════════════════════════════════════════════════════════
   ЩО ВСЕРЕДИНІ КАБІНЕТА — дерево кампанія → адсет → оголошення

   Досі сторінка кабінетів відповідала на питання «чи крутить» і
   «скільки всього». На питання «а що саме з'їдає гроші» відповіді не
   було ніде: числа по кожному оголошенню вже лежали в базі (їх складає
   fb-sync для правил), але подивитись на них можна було тільки запитом
   у Supabase.

   Тому цей блок і читає той самий знімок, яким користуються правила.
   Одні й ті самі числа в обох місцях — інакше «правило вимкнуло, а я
   тут бачив інше» стало б питанням без відповіді.

   ДЕРЕВО, А НЕ ТРИ ОКРЕМІ ВКЛАДКИ. Кампанія, під нею адсети, під ними
   оголошення — так, як у репорт-білдері. Вкладки змушували тримати в
   голові, до чого належить рядок; дерево показує це саме.

   ЛІД — ЦЕ ПОДІЯ ПІКСЕЛЯ, і більше нічого. Довго тут був список із
   галочками, і кожна галочка додавала свою подію: лід-форми, інстали
   застосунку, згруповані ліди. Виходило число, яке не сходилось ні з
   чим — ні з Ads Manager, ні з очікуванням, — а знайти, яка саме
   галочка його роздула, можна було лише перебором.

   Тепер одна подія, та сама на екрані й у правилах (fb-rules тримає
   таку саму константу). Налаштування немає навмисно: вибір, який
   мовчки міняє число в десяти місцях, коштує дорожче за гнучкість,
   якою користуються раз на рік.
   ══════════════════════════════════════════════════════════════════ */

/* Усі імена, якими Facebook зве ОДИН І ТОЙ САМИЙ лід.

   Тут був лише offsite_conversion.fb_pixel_lead — і це була моя
   помилка. Боявся потрійного рахунку, а він і так неможливий:
   cdLeadCount зводить усі три імені до базової події й бере ОДНЕ
   значення (див. cdLeadBase нижче). Звуження нічого не лікувало, зате
   обнуляло колонку всім, у кого лід приїжджає під іншим іменем — а
   приїжджає він під тим, яке обере Facebook, і вибір цей не наш.

   mobile_app_install сюди НЕ повертаємо: інстал застосунку — інша
   подія, і скласти її з лідом означало б отримати число, яке ні про
   що. Кому потрібні інстали — це окрема колонка, а не домішка. */
const CD_LEAD_DEFAULT = ['lead', 'onsite_conversion.lead_grouped',
                         'offsite_conversion.fb_pixel_lead'];

/* ОДНУ Й ТУ САМУ ПОДІЮ FACEBOOK ВІДДАЄ КІЛЬКОМА ІМЕНАМИ ОДРАЗУ.

   Три ліди приїжджають так:
     lead                              3
     onsite_conversion.lead_grouped    3
     offsite_conversion.fb_pixel_lead  3
   — це не дев'ять лідів, а ті самі три, порахованих трьома способами.
   Поки ми просто складали все, що відмічене галочкою, стовпчик Lead
   показував утричі більше, а ціна ліда — утричі менше. Реєстрації цієї
   вади не мали, бо там cdPick бере ОДНЕ значення; сюди те саме не
   поширили, і саме тому клацання сходилось, а ліди — ні.

   Складати все одно треба: 'lead' і 'mobile_app_install' — це різні
   події, і людина може хотіти обидві. Тому зводимо тип до БАЗОВОЇ
   події, беремо по одному значенню на подію й лише тоді складаємо
   різні події.

   Яке саме значення на подію: якщо в списку є сама базова назва
   ('lead'), беремо її — у Facebook це загальне число, що вже містить
   і піксельні, і лід-форми. Якщо її не відмітили, а відмітили окремі
   джерела — складаємо їх: людина попросила саме ці джерела. */
const cdLeadBase = (t) => String(t || '')
  .replace(/^offsite_conversion\.fb_pixel_/, '')
  .replace(/^onsite_conversion\./, '')
  .replace(/^offsite_conversion\./, '')
  .replace(/_grouped$/, '');

/* ЩО САМЕ ПОРАХУВАЛИ. Число без розкладу не перевірити: коли на екрані
   на один лід більше, ніж в Ads Manager, питання завжди одне — який
   рядок зайвий. Тому тримаємо поруч із числом усі відмічені події з
   їхніми значеннями й позначкою, чи потрапили вони в суму. */
function cdLeadWhy(actions, want) {
  if (!Array.isArray(actions)) return [];
  const rows = [];
  const by = new Map();
  actions.forEach(x => {
    const t = String(x.action_type || '');
    if (!want.includes(t)) return;
    const b = cdLeadBase(t);
    if (!by.has(b)) by.set(b, []);
    by.get(b).push({ t, v: Number(x.value) || 0 });
  });
  by.forEach((list, b) => {
    const total = list.find(x => x.t === b);
    list.forEach(x => rows.push({ t: x.t, v: x.v, used: !total || x.t === b }));
  });
  return rows;
}

function cdLeadCount(actions, want) {
  if (!Array.isArray(actions)) return 0;
  const by = new Map();                     // базова подія → [{ type, value }]
  actions.forEach(x => {
    const t = String(x.action_type || '');
    if (!want.includes(t)) return;
    const b = cdLeadBase(t);
    if (!by.has(b)) by.set(b, []);
    by.get(b).push({ t, v: Number(x.value) || 0 });
  });
  let n = 0;
  by.forEach((list, b) => {
    const total = list.find(x => x.t === b);
    n += total ? total.v : list.reduce((a, x) => a + x.v, 0);
  });
  return n;
}

/* РЕЗУЛЬТАТ — це не «якась подія», а та сама, на яку оптимізується
   адсет. Facebook показує в Ads Manager саме її, тож і ми беремо ціль
   адсета (optimization_goal), а для конверсій — подію пікселя
   (promoted_object.custom_event_type). Обидва поля приїжджають тим
   самим підзапитом fb-sync, окремих звернень це не коштує.

   Без цього стовпчик «Result» довелось би вгадувати — і на кабінеті з
   реєстраціями він показував би ліди, тобто просто брехав. */
const CD_GOAL = {
  LEAD_GENERATION: 'lead', QUALITY_LEAD: 'lead',
  LINK_CLICKS: 'link_click', LANDING_PAGE_VIEWS: 'landing_page_view',
  APP_INSTALLS: 'mobile_app_install',
  APP_INSTALLS_AND_OFFSITE_CONVERSIONS: 'mobile_app_install',
  THRUPLAY: 'video_view', TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: 'video_view',
  POST_ENGAGEMENT: 'post_engagement', PAGE_LIKES: 'like',
  EVENT_RESPONSES: 'rsvp', VALUE: 'purchase',
  CONVERSATIONS: 'messaging_conversation_started_7d',
  REPLIES: 'messaging_conversation_started_7d',
  IMPRESSIONS: 'impressions',
  /* REACH — ОКРЕМО, і не 'impressions'. У Ads Manager під ціллю Reach
     стоїть охоплення: скільки РІЗНИХ людей побачили. Покази — скільки
     разів показали, і на тій самій кампанії це число більше, часом
     утричі. Підставляти одне замість іншого означало б показувати
     чуже число під правильним підписом.

     Самого охоплення синхронізація поки не привозить (у запиті
     insights його немає), тож показуємо покази — але підписуємо чесно,
     що це не те, що рахує Facebook. Краще видима розбіжність, ніж
     тиха. */
  REACH: 'reach_as_impressions'
  /* OFFSITE_CONVERSIONS тут навмисно немає: за неї відповідає подія
     пікселя нижче — саме вона й відрізняє реєстрацію від покупки. */
};
const CD_EVENT = {
  LEAD: 'lead', COMPLETE_REGISTRATION: 'complete_registration',
  PURCHASE: 'purchase', ADD_TO_CART: 'add_to_cart',
  INITIATED_CHECKOUT: 'initiate_checkout', ADD_PAYMENT_INFO: 'add_payment_info',
  SUBSCRIBE: 'subscribe', START_TRIAL: 'start_trial', DONATE: 'donate',
  CONTENT_VIEW: 'view_content', SEARCH: 'search', CONTACT: 'contact',
  SUBMIT_APPLICATION: 'submit_application', SCHEDULE: 'schedule'
};
const CD_REG = 'complete_registration';

/* ІНСТАЛИ АПКИ — ОКРЕМИМ СТОВПЧИКОМ, І ТІЛЬКИ КОЛИ ВОНИ Є.

   Досі інстали бачив лише той адсет, який на них і оптимізується: вони
   падали в «Result» разом з усім іншим. Але кабінет з апкою майже
   завжди змішаний — частина адсетів на інстали, частина на події
   всередині, — і в такому дереві «Result» складає різні одиниці, а
   інсталів як окремого числа не видно ніде.

   Стовпчик ставимо САМ, коли в дереві є хоч один інстал: порожня
   колонка на кожному PWA-кабінеті — це шум, а відсутня на APP-кабінеті
   — та сама вада, що й була. */
const CD_INST = 'mobile_app_install';

/* Чи є в цьому дереві взагалі інстали. Вирішується РАЗ на перемальовку
   і з ВЕРХНЬОГО рівня: він уже містить суму всіх дітей, тож обходити
   дерево вдруге не треба. */
let cdHasInst = false;

/* Як називати одиницю результату в комірці. Коротко: місця там на
   одне слово, а довге зіпхне число за край. */
const CD_UNIT = {
  lead: 'leads', complete_registration: 'regs', purchase: 'purchases',
  link_click: 'clicks',
  /* Не «LPV»: три великі літери на телефоні читаються як завгодно, і
     одного разу прочитались як «ipv». Довше, зате однозначно. */
  landing_page_view: 'LP views', impressions: 'impr.',
  mobile_app_install: 'installs', video_view: 'views',
  post_engagement: 'engage', like: 'likes', rsvp: 'RSVP',
  add_to_cart: 'carts', initiate_checkout: 'checkouts',
  add_payment_info: 'pay info', subscribe: 'subs', start_trial: 'trials',
  donate: 'donations', view_content: 'views', search: 'searches',
  contact: 'contacts', submit_application: 'applications',
  schedule: 'bookings',
  'messaging_conversation_started_7d': 'chats',
  // Підпис навмисно незручний: він має впадати в око, поки охоплення
  // не привозиться по-справжньому.
  reach_as_impressions: 'impr. (not reach)'
};
const cdUnitWord = (u) => CD_UNIT[u] || String(u || '').replace(/_/g, ' ');

/* СТАН ОГОЛОШЕННЯ. У знімку лежить те, що ввімкнене, — а ввімкнене не
   означає «крутиться»: реджект теж ввімкнений, просто Facebook його не
   показує. Без цього стовпчика такий рядок виглядав як звичайний із
   нульовим спендом, тобто як «погано працює», а не «не працює зовсім».

   Порядок у списку — від найгіршого: саме він вирішує, що показати на
   кампанії, коли всередині різне. */
const CD_STATE = [
  { k: 'DISAPPROVED',          s: 'bad',  t: 'Rejected',
    why: 'Facebook rejected it — switched on, showing nothing' },
  { k: 'WITH_ISSUES',          s: 'bad',  t: 'Issues',
    why: 'Facebook has a problem with it — switched on, showing nothing' },
  { k: 'PENDING_BILLING_INFO', s: 'bad',  t: 'No billing',
    why: 'No valid payment method on the cabinet' },
  { k: 'PENDING_REVIEW',       s: 'wait', t: 'In review',
    why: 'Waiting for Facebook review' },
  { k: 'IN_PROCESS',           s: 'wait', t: 'Processing',
    why: 'Facebook is still processing it' },
  { k: 'PREAPPROVED',          s: 'wait', t: 'Pre-approved',
    why: 'Running while review finishes' },
  /* Вимкнене — не біда, а рішення. Тому окремий колір, не червоний і
     не жовтий: це не те, що треба лагодити, а те, що треба бачити.
     CAMPAIGN_PAUSED і ADSET_PAUSED кажуть, що вимкнули НЕ це, а щось
     над ним, — і без цієї різниці людина шукала б вимикач не там. */
  { k: 'PAUSED',               s: 'off',  t: 'Off',
    why: 'Switched off — the switch on this row is the one that did it' },
  { k: 'CAMPAIGN_PAUSED',      s: 'off',  t: 'Campaign off',
    why: 'Its campaign is switched off — the switch is one level up' },
  { k: 'ADSET_PAUSED',         s: 'off',  t: 'Ad set off',
    why: 'Its ad set is switched off — the switch is one level up' },
  { k: 'ARCHIVED',             s: 'off',  t: 'Archived',
    why: 'Archived in Facebook' },
  /* «On», а не «Active». Active читалось як назва стану у Facebook —
     тобто як щось поруч із «Rejected» і «In review», — і людина не
     могла зрозуміти, чи це стан, чи просто «ввімкнено». А це саме
     «ввімкнено»: те саме, що показує перемикач у кінці рядка, тільки
     словом. Решта підписів лишається станами, бо станами й є. */
  { k: 'ACTIVE',               s: 'ok',   t: 'On',
    why: 'Switched on and running' }
];
const cdState = (k) => CD_STATE.find(x => x.k === String(k || '').toUpperCase());

/* УВІМКНЕНИЙ — ЦЕ ПРО ВЛАСНИЙ ВИМИКАЧ, а не про те, чи щось показують.
   Різниця тут не теоретична: у реджекта вимикач увімкнений, просто
   Facebook його не показує; в оголошення під вимкненою кампанією
   вимикач теж увімкнений — вимкнули не його.

   Тому вимкненими вважаємо рівно два стани: PAUSED (вимкнули саме це)
   та ARCHIVED. CAMPAIGN_PAUSED і ADSET_PAUSED — ні: вимикач цієї
   сутності стоїть в «увімкнено», і натиснути його ще раз означало б
   нічого не зробити. Саме так показує й Facebook. */
const CD_OFF = ['PAUSED', 'ARCHIVED', 'DELETED'];
const cdIsOn = (k) => !CD_OFF.includes(String(k || '').toUpperCase());

/* А ЦЕ ІНШЕ ПИТАННЯ, і плутати їх не можна.

   cdIsOn каже, чи ввімкнений вимикач САМОГО рядка — і читає для цього
   status, справжнє положення вимикача. cdLive каже, чи щось узагалі
   крутиться, і читає effective_status.

   Довго перемикач вгадував своє положення з effective_status, бо
   status ми просто не питали. На реджектах здогадка виявилась хибною:
   вимкнене оголошення показувалось як ввімкнене. Тепер обидва поля
   приїжджають із Facebook, і вгадувати нема чого.

   «ТІЛЬКИ АКТИВНІ» — ЦЕ АКТИВНІ, А НЕ ВВІМКНЕНІ.

   Спершу цей фільтр ховав лише вимкнене, а реджекти лишав — навмисно:
   гроші на них виділені, і саме їх треба побачити. На живому кабінеті
   вийшло навпаки. Увімкнених із реджектом бувають десятки, вони
   забивають список, і серед них не видно тих кількох, що справді
   крутяться, — тобто фільтр не відповідав на єдине питання, заради
   якого його вмикають.

   Реджекти при цьому нікуди не зникають із очей: є стовпчик Status, є
   «N not running» у шапці, і є рядок про те, скільки саме сховано і на
   яку суму (cdHidden нижче). Сховане, про яке сказано числом, — не те
   саме, що сховане молча.

   Список БІЛИЙ, а не чорний, і це важливіше за самий зміст фільтра.
   Чорний означав би, що кожен новий стан Facebook за замовчуванням
   вважається живим, — а нові стани зʼявляються, і жоден із них ще не
   був живим: ні DISAPPROVED, ні WITH_ISSUES, ні PENDING_BILLING_INFO
   не крутяться, хоч вимикач у них і стоїть на «так». */
const CD_DELIVERS = ['ACTIVE'];
const cdLive = (k) => CD_DELIVERS.includes(String(k || '').toUpperCase());

let cdAcc = '', cdRows = [];
/* Чому в дереві немає ока: '' — усе гаразд, 'sql' — немає колонки,
   'sync' — колонка є, але знімок старий. Мовчазна відсутність кнопки
   читається як «розробник її загубив», і саме так її й прочитали. */
let cdNoDom = '';
// Список подій-лідів більше не налаштовується — див. CD_LEAD_DEFAULT.
const cdLeads = CD_LEAD_DEFAULT;
let cdErr = '', cdBusy = false, cdSeen = 0, cdOpenIds = new Set();

/* «Тільки активні». Памʼятаємо між заходами: це не режим перегляду, а
   налаштування робочого місця — хто його вмикає, той майже завжди
   хоче його й завтра. Памʼять браузера може бути недоступна (режим
   інкогніто, заборонені дані сайту), тож читання й запис у try. */
let cdOnly = (() => { try { return localStorage.getItem('cd_only_live') === '1'; }
                      catch (e) { return false; } })();

/* МУЛЬТИВИБІР. Вимкнути пʼять оголошень п'ятьма кліками з п'ятьма
   підтвердженнями — це не робота, а покарання. Тому галочки на рядках
   і одна дія на всіх.

   Тримаємо саме id, а не посилання на вузли: дерево перебудовується
   при кожному перемальовуванні, і вузол, збережений у Set, наступної
   ж секунди стає чужим об'єктом. */
let cdMarked = new Set();

window.cdMark = function (id, on) {
  if (on) cdMarked.add(String(id)); else cdMarked.delete(String(id));
  cdPaint();
};
window.cdMarkClear = function () { cdMarked = new Set(); cdPaint(); };

window.cdSetOnly = function (v) {
  cdOnly = !!v;
  try { localStorage.setItem('cd_only_live', cdOnly ? '1' : '0'); } catch (e) {}
  /* Галочки з рядків, яких більше не видно, знімаємо. Інакше смуга
     каже «5 picked», на екрані їх два, а «Switch off» перемкне всі
     пʼять — дія над тим, чого людина зараз не бачить. Відколи фільтр
     ховає й реджекти, це перестало бути теорією: саме реджекти й
     відмічають, щоб вимкнути пачкою. */
  if (cdOnly && cdMarked.size) {
    const live = new Set(cdShown().map(r => String(r.ad_id)));
    /* Знімаємо лише з ОГОЛОШЕНЬ: вибраною буває й кампанія, а її id
       серед ad_id немає — вона нікуди не зникла. */
    cdRows.forEach(r => {
      const id = String(r.ad_id);
      if (!live.has(id)) cdMarked.delete(id);
    });
  }
  cdPaint();
};

/* Фільтруємо ВХІДНІ рядки, а не готові. Інакше кампанія показувала б
   суму, в якій половина рядків прихована, — тобто число, що не
   сходиться з тим, що під ним видно. */
function cdShown() {
  if (!cdOnly) return cdRows;
  /* Рядок без стану лишаємо: ми не знаємо, що з ним, а мовчки ховати
     те, чого не знаєш, — найгірший з варіантів. */
  return cdRows.filter(r => {
    /* Власний вимикач перевіряємо ОКРЕМО, і після переходу на білий
       список він потрібен не менше: рядок без effective_status ми
       лишаємо видимим (див. нижче), і без цієї перевірки разом із ним
       лишилось би й вимкнене, про стан якого база просто не знає. */
    if (r.own_status && !cdIsOn(r.own_status)) return false;
    return !r.effective_status || cdLive(r.effective_status);
  });
}
// База старіша за сторінку: немає колонок зі станом кампанії й адсета.
let cdOld = '';

/* Саме по собі нутро не відкривається. Кабінет відкривають не тільки
   заради нього: частіше — щоб скачати експорт або дописати нотатку, а
   таблиця на пів екрана в такі хвилини просто заважає. Тому вибір
   кабінета більше нічого не вантажить — ні запиту, ні малювання, — а
   показує його кнопка в картці.

   ВІДКРИТО — ЦЕ ПРО КОНКРЕТНИЙ КАБІНЕТ, а не про сторінку взагалі. Тому
   ніякого окремого «хочу бачити» тут немає: відкритий кабінет і є
   cdAcc. Спершу цей прапорець був — мовляв, раз відкривши, людина
   дивитиметься так і наступний кабінет, — і вийшло найгірше: клік по
   кабінету то розгортав таблицю на пів екрана, то ні, залежно від
   невидимого стану. Правило мусить бути одне й просте: клік по
   кабінету НІКОЛИ не відкриває нутро, відкриває тільки кнопка, і
   тільки для того кабінета, на якому її натиснули. */

/* Дерево чи просто список оголошень. Дерево відповідає на «де саме
   гроші», список — на «яке оголошення найдорожче»; це різні питання, і
   вигравати має те, яке зараз. */
let cdFlat = false;

window.cdIsOpen = (acc) => !!cdAcc && String(acc || '') === cdAcc;
window.cdBtnLabel = (acc) => cdIsOpen(acc) ? 'Hide campaigns & ads' : 'Campaigns & ads';

/* Кнопка живе внизу блока кабінетів, а не в картці: відкриває вона те,
   що зʼявиться просто під нею. Малюємо її тут же, поруч зі станом —
   інакше підпис рано чи пізно розійдеться зі справою, і «Hide»
   ховатиме те, чого вже немає. */
let cdFor = '';

/* ОДИН РЯДОК НА ВСЕ. Раніше їх було два: смуга з кнопкою «Hide
   campaigns & ads» і окрема шапка таблиці зі стрічкою стану та
   вкладками. Два рядки коштували близько сорока пікселів висоти —
   рівно тієї, якої бракує самій таблиці, заради якої сюди й заходять.

   Вкладки й фільтр живуть тут, а не в таблиці, ще й тому, що вони про
   те саме, що й кнопка: що саме показано. Кнопка відкриває список,
   вкладки перемикають його вигляд, галочка ховає рядки — одна думка,
   один рядок. */
window.cdBar = function (account) {
  const bar = document.getElementById('cab-inside-bar');
  if (!bar) return;
  cdFor = String(account || '').trim();
  if (!cdFor) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  bar.innerHTML = `<button type="button" class="cab-inside-btn"
      id="cab-inside-btn" onclick="cdToggleOpen('${encodeURIComponent(cdFor)}')"
      title="Campaigns, ad sets and ads of this cabinet with today’s numbers">${
        cdBtnLabel(cdFor)}</button>
    <span class="cab-inside-who">${cdEsc(cdFor)}</span>`
    + (cdIsOpen(cdFor) ? cdHeadBits() : '');
};

/* Стрічка стану й вкладки. Окремо від cdBar, бо перемальовуються вони
   з різних приводів: смуга — коли змінився кабінет, ці — коли
   змінився вигляд таблиці. */
function cdHeadBits() {
  const age = cdSeen ? Math.round((Date.now() - cdSeen) / 60000) : null;
  const when = age == null ? ''
    : age < 2 ? 'just synced' : age + ' min ago';
  return `<p class="cd-s">${when}${cdBad()}${cdHidden()}${cdDomNote()}</p>
    <div class="cd-tabs">
      <button type="button" class="cd-tab${cdFlat ? '' : ' is-on'}"
        onclick="cdSetFlat(false)" title="Campaign, then its ad sets, then their ads">Tree</button>
      <button type="button" class="cd-tab${cdFlat ? ' is-on' : ''}"
        onclick="cdSetFlat(true)" title="Just the ads, most expensive first">Ads only</button>
      ${cdFlat ? '' : `<button type="button" class="cd-tab" onclick="cdAll(true)">Expand all</button>
      <button type="button" class="cd-tab" onclick="cdAll(false)">Collapse</button>`}
      <label class="cd-only" title="Show only what Facebook is actually showing. Rejected, blocked, in-review and switched-off rows are hidden — the line above says how many and how much they spent.">
        <input type="checkbox" id="cd-only" ${cdOnly ? 'checked' : ''}
          onchange="cdSetOnly(this.checked)"><span>Only live</span></label>
    </div>`;
}

/* Одним рядком, поруч із «3 not running»: це та сама категорія —
   те, що варто знати, не шукаючи. */
/* Що сказала синхронізація про домени минулого разу. Читаємо один раз
   і тримаємо: причина міняється не частіше, ніж раз на прогін. */
let cdLinkNote = null;
async function cdLinkWhy() {
  if (cdLinkNote !== null) return;
  cdLinkNote = '';
  try {
    if (typeof getTeamSetting === 'function')
      cdLinkNote = String((await getTeamSetting('fb_link_note')) || '');
  } catch (e) { cdLinkNote = ''; }
  if (cdLinkNote && cdAcc) cdPaint();
}

function cdDomNote() {
  if (!cdNoDom) return '';
  const sep = (cdSeen || cdBad()) ? ' · ' : '';
  /* Причина від самої синхронізації важливіша за нашу здогадку: вона
     каже, що ВІДПОВІВ Facebook, а не що ми припускаємо. */
  if (cdNoDom === 'sync' && cdLinkNote)
    return sep + '<span class="cd-nodom" title="' + cdEsc('This is what the last sync reported. '
      + 'Press Sync now after deploying fb-sync to refresh it.')
      + '">no domains: ' + cdEsc(cdLinkNote) + '</span>';
  const text = cdNoDom === 'sql' ? 'no domains: run DOMAIN_GUARD.sql'
                                 : 'no domains: sync once';
  const tip = cdNoDom === 'sql'
    ? 'The link_domain column is missing. Run DOMAIN_GUARD.sql in Supabase, deploy fb-sync, then press Sync now.'
    : 'The column is there, but no ad carries a domain yet. Deploy fb-sync and press Sync now.';
  return sep + '<span class="cd-nodom" title="' + cdEsc(tip) + '">' + text + '</span>';
}

function cdBtnSync() {
  const b = document.getElementById('cab-inside-btn');
  if (b) b.textContent = cdBtnLabel(cdFor);
}

window.cdToggleOpen = function (accEnc) {
  const acc = decodeURIComponent(accEnc || '').trim();
  if (!acc) return;
  if (cdIsOpen(acc)) return cdHide();
  /* Повертаємо саму обіцянку: так кнопку можна дочекатись — і в тесті,
     і там, де після відкриття треба щось зробити. */
  return cdLoad(acc);
};

const cdEsc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const cdMoney = (v) => '$' + (Math.round((Number(v) || 0) * 100) / 100)
  .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

window.cdHide = function () {
  /* Вибір теж скидаємо. Галочки, які пережили закриття панелі, — це
     пастка: смуги дії на екрані немає, людина про них не памʼятає, а
     наступний «Switch off» вимкне те, чого вона зараз не бачить. */
  cdAcc = ''; cdRows = []; cdErr = ''; cdOpenIds = new Set(); cdMarked = new Set();
  /* Відкрите око не переживає закриття: інакше показаний домен
     дочекався б наступної людини за цим екраном. */
  cdEyed = new Set();
  /* Смугу з кнопкою не чіпаємо: кабінет вибраний, просто нутро
     закрите. Прибирає її той, хто зняв вибір, — cdBar(''). */
  const box = document.getElementById('cab-inside');
  /* Вміст прибираємо, а не лише ховаємо: лишений у розмітці, він
     наступного разу встигає блимнути числами минулого кабінета. */
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
  cdBtnSync();
};

/* Картку кабінета перемальовують і без нас — збереглось поле, приїхала
   синхронізація. Нутро при цьому має лишатись як було, якщо кабінет той
   самий, і зникати, якщо вибрали інший. */
window.cdOpen = function (account) {
  const id = String(account || '').trim();
  cdBar(id);
  if (id !== cdAcc) cdHide();
  else cdBtnSync();
};

async function cdLoad(account) {
  const box = document.getElementById('cab-inside');
  if (!box) return;
  const id = String(account || '').trim();
  if (!id) return cdHide();
  box.classList.remove('hidden');
  if (id !== cdAcc) { cdRows = []; cdErr = ''; cdOpenIds = new Set(); cdMarked = new Set(); }
  cdAcc = id;
  cdBtnSync();
  cdPaint();

  /* СТОВПЧИК «STATUS» ДОВГО БУВ ПОРОЖНІЙ, і причина була тут: колонку
     effective_status додали і в таблицю, і в fb-sync, а в цей select —
     ні. Код нижче чесно читав r.effective_status, отримував undefined і
     малював «unknown» для всього, що є. Тобто стовпчик працював рівно
     так, ніби Facebook нічого не сказав, хоч сказав.

     campaign_status і adset_status — ВЛАСНИЙ стан кампанії та адсета.
     Вивести його з оголошень не можна: кампанія буває PAUSED сама по
     собі, а її оголошення при цьому ACTIVE. */
  const CD_CORE = 'ad_id,name,adset_id,adset_name,campaign_id,campaign_name,'
    + 'effective_status,optimization_goal,custom_event_type,'
    + 'spend,impressions,clicks,link_clicks,actions,seen_at';
  const CD_NEW = 'campaign_status,adset_status,'
    + 'campaign_daily_budget,campaign_lifetime_budget,'
    + 'adset_daily_budget,adset_lifetime_budget,'
    + 'own_status,campaign_own_status,adset_own_status';
  /* Окремим ярусом, а не в CD_NEW. Ярус — це все або нічого: якби
     link_domain лежав поруч із бюджетами, невиконаний DOMAIN_GUARD.sql
     забрав би з собою й бюджети, й вимикачі. Так брак однієї колонки
     коштує рівно її. */
  const CD_DOM = 'link_domain';
  cdNoDom = '';
  const CD_NO_COLUMN = /column .* does not exist|schema cache|42703|PGRST204/i;

  try {
    /* База може бути старішою за сторінку: блок 1 FB_RULES.sql із
       новими колонками ще не виконали. Тоді беремо те, що є, — але не
       падаємо з «column does not exist», бо через одну колонку зник би
       весь розбір кабінета. */
    let res = await sb.from('fb_ad_today')
      .select(CD_CORE + ',' + CD_NEW + ',' + CD_DOM).eq('account_id', id).limit(1000);
    if (res.error && CD_NO_COLUMN.test(res.error.message || '')) {
      // Спершу без домену: він наймолодший, і найімовірніше саме його й бракує.
      cdNoDom = 'sql';
      res = await sb.from('fb_ad_today')
        .select(CD_CORE + ',' + CD_NEW).eq('account_id', id).limit(1000);
    }
    if (res.error && CD_NO_COLUMN.test(res.error.message || '')) {
      cdOld = res.error.message;
      res = await sb.from('fb_ad_today').select(CD_CORE).eq('account_id', id).limit(1000);
    } else cdOld = '';
    const { data, error } = res;
    if (error) throw new Error(error.message);
    cdRows = data || [];
    cdErr = '';
    cdSeen = cdRows.reduce((a, r) => Math.max(a, Date.parse(r.seen_at || '') || 0), 0);
    /* Колонка є, а доменів немає — значить синхронізація ще не ходила
       з новою fb-sync. Ззовні це не відрізнити від «ока не існує», і
       саме тому про це треба сказати вголос, а не мовчати. */
    if (!cdNoDom && cdRows.length
        && !cdRows.some(r => String(r.link_domain || '').trim())) { cdNoDom = 'sync'; cdLinkWhy(); }
  } catch (e) {
    cdRows = [];
    cdErr = /fb_ad_today|does not exist|schema cache/i.test(e.message)
      ? 'no-table' : e.message;
  }
  if (cdAcc === id) cdPaint();
}

window.cdSetFlat = function (v) { cdFlat = !!v; cdPaint(); };

/* УВАГА: це розгортання дерева, а не вимикач. Ім'я коротке й
   спокусливе — перемикач стану вже одного разу назвали так само й
   мовчки затерли цю функцію: дерево перестало розкриватись, а помилки
   не було жодної. Вимикач тепер зветься cdFlip. */
window.cdToggle = function (k) {
  if (cdOpenIds.has(k)) cdOpenIds.delete(k); else cdOpenIds.add(k);
  cdPaint();
};

/* Розгорнути все / згорнути все. На кабінеті з тридцятьма кампаніями
   розкривати по одній — робота, а не перегляд. */
window.cdAll = function (open) {
  cdOpenIds = new Set();
  if (open) cdRows.forEach(r => {
    cdOpenIds.add('campaign:' + (r.campaign_id || ''));
    cdOpenIds.add('ad set:' + (r.adset_id || ''));
  });
  cdPaint();
};

/* Одна подія, а не сума всіх схожих. Facebook на ту саму реєстрацію
   часто віддає і complete_registration, і offsite_conversion.fb_pixel_
   complete_registration; склавши їх, ми показали б подвійне число. Тому
   беремо найточніший збіг і тільки його. */
function cdPick(actions, suf) {
  if (!suf || !Array.isArray(actions)) return null;
  let best = null, rank = 99;
  actions.forEach(x => {
    const t = String(x.action_type || '');
    const r = t === suf ? 0
      : t === 'offsite_conversion.fb_pixel_' + suf ? 1
      : t === 'onsite_conversion.' + suf ? 2
      : (t.endsWith('.' + suf) || t.endsWith('_' + suf)) ? 3 : 99;
    if (r < rank) { rank = r; best = Number(x.value) || 0; }
  });
  return rank === 99 ? null : best;
}

/* На що оптимізується це оголошення. Порожньо — значить fb-sync ще не
   привезла ціль (стара версія функції або стара колонка в базі), і
   тоді «Result» покаже прочерк: вигадане число тут гірше за чесне
   «не знаю». */
function cdSuffix(r) {
  const g = String(r.optimization_goal || '').toUpperCase();
  if (CD_GOAL[g]) return CD_GOAL[g];
  return CD_EVENT[String(r.custom_event_type || '').toUpperCase()] || '';
}

function cdMetrics(r) {
  const acts = Array.isArray(r.actions) ? r.actions : [];
  const suf = cdSuffix(r);
  const imps = Number(r.impressions) || 0;
  return {
    spend: Number(r.spend) || 0,
    imps,
    clicks: Number(r.link_clicks) || 0,
    leads: cdLeadCount(acts, cdLeads),
    leadWhy: cdLeadWhy(acts, cdLeads),
    regs: cdPick(acts, CD_REG) || 0,
    installs: cdPick(acts, CD_INST) || 0,
    result: !suf ? null
          : (suf === 'impressions' || suf === 'reach_as_impressions') ? imps
          : (cdPick(acts, suf) || 0),
    /* ОДИНИЦЯ результату — не прикраса. «Result 1240» на адсеті, який
       оптимізується на кліки, читається точно так само, як 1240
       депозитів. Число без своєї одиниці — найтихіший спосіб збрехати. */
    unit: suf || '',
    goal: String(r.optimization_goal || r.custom_event_type || ''),
    state: String(r.effective_status || '').toUpperCase(),
    host: String(r.link_domain || '').trim()
  };
}

/* Дерево кампанія → адсет → оголошення. Числа батька — сума дітей, і
   рахуються вони тут, а не в SQL: правило на рівні кампанії складає їх
   так само, тож розійтись вони не можуть. */
function cdNode(id, name, kind) {
  /* own — ВЛАСНИЙ стан вузла, як його каже Facebook. Для оголошення це
     те саме, що в state; для кампанії й адсета — інша річ, і саме вона
     відповідає на «чому воно не витрачає». Складене з дітей на це
     питання не відповідає: у вимкненої кампанії оголошення можуть бути
     хоч усі ACTIVE, просто їх ніхто не показує. */
  /* own — що ПОКАЗУЄ Facebook (effective_status): з нього підписи в
     стовпчику Status. sw — положення самого вимикача (status): з нього
     перемикач. Два різні поля, два різні питання. */
  return { id: String(id || ''), name: name || '', kind, own: '', sw: '', budget: null,
           leadBy: new Map(),        // подія → { v, used } по всіх дітях
           spend: 0, imps: 0, clicks: 0, leads: 0, regs: 0, installs: 0,
           result: 0, hasResult: false, goals: new Set(),
           /* ЯКІ саме одиниці склались у result. Набором, бо під
              кампанією бувають адсети з різними цілями, і тоді їхня
              сума — не число, а каша: кліки плюс покупки. */
           units: new Set(),
           /* Набором, а не рядком: під кампанією цілком законно стоять
              оголошення на різні домени, і схлопнути це в одне значення
              означало б показати перше-ліпше як «той самий». */
           hosts: new Set(),
           state: new Map(), ads: 0, kids: [] };
}
function cdAdd(n, m) {
  (m.leadWhy || []).forEach(x => {
    const cur = n.leadBy.get(x.t) || { v: 0, used: x.used };
    cur.v += x.v;
    // Якщо хоч десь подія пішла в суму — так і кажемо: саме цей рядок
    // і відповідає за число, яке людина бачить.
    cur.used = cur.used || x.used;
    n.leadBy.set(x.t, cur);
  });
  n.spend += m.spend; n.imps += m.imps; n.clicks += m.clicks;
  n.leads += m.leads; n.regs += m.regs; n.installs += m.installs; n.ads++;
  if (m.result != null) { n.result += m.result; n.hasResult = true;
                          if (m.unit) n.units.add(m.unit); }
  if (m.goal) n.goals.add(m.goal);
  if (m.host) n.hosts.add(m.host);
  n.state.set(m.state, (n.state.get(m.state) || 0) + 1);
}

function cdTree() {
  const camps = new Map();
  cdShown().forEach(r => {
    const m = cdMetrics(r);
    const cid = String(r.campaign_id || ''), sid = String(r.adset_id || '');
    let c = camps.get(cid);
    if (!c) { c = cdNode(cid, r.campaign_name, 'campaign'); c.by = new Map(); camps.set(cid, c); }
    // Власний стан беремо з першого рядка, де він узагалі є: у всіх
    // оголошень однієї кампанії він той самий, а порожній буває тоді,
    // коли база ще без цих колонок.
    if (!c.own) c.own = String(r.campaign_status || '').toUpperCase();
    if (!c.sw) c.sw = String(r.campaign_own_status || '').toUpperCase();
    if (!c.budget) c.budget = cdBudget(r.campaign_daily_budget, r.campaign_lifetime_budget);
    let s = c.by.get(sid);
    if (!s) { s = cdNode(sid, r.adset_name, 'ad set'); c.by.set(sid, s); c.kids.push(s); }
    if (!s.own) s.own = String(r.adset_status || '').toUpperCase();
    if (!s.sw) s.sw = String(r.adset_own_status || '').toUpperCase();
    if (!s.budget) s.budget = cdBudget(r.adset_daily_budget, r.adset_lifetime_budget);
    const a = cdNode(r.ad_id, r.name, 'ad');
    a.own = m.state;
    a.sw = String(r.own_status || '').toUpperCase();
    cdAdd(a, m); cdAdd(s, m); cdAdd(c, m);
    a.ads = 0;
    s.kids.push(a);
  });
  const bySpend = (a, b) => b.spend - a.spend;
  const list = [...camps.values()].sort(bySpend);
  list.forEach(c => {
    c.kids.sort(bySpend);
    c.kids.forEach(s => s.kids.sort(bySpend));
  });
  return list;
}

/* Скільки з них ввімкнені, але не крутяться. У шапці, бо це те, заради
   чого сюди й заходять, — а не те, що треба шукати очима по дереву. */
function cdBad() {
  const bad = cdShown().filter(r => {
    const st = cdState(r.effective_status);
    return st && st.s === 'bad';
  }).length;
  if (!bad) return '';
  // Крапку ставимо лише тоді, коли ліворуч від неї щось є: без
  // заголовка стрічка інакше починалась би з розділового знака.
  const sep = cdSeen ? ' · ' : '';
  return sep + '<span class="cd-warn">' + bad + ' not running</span>';
}

/* ЩО САМЕ СХОВАВ ФІЛЬТР — і на яку суму.

   Коротший список сам по собі не новина. Новина — ЧОМУ він коротший.
   Без цього рядка «Only live» виглядав би як поломка або як «у
   кабінеті більше нічого немає», а десятки реджектів зникли б з очей
   зовсім — тобто ми поміняли б одну сліпу пляму на іншу.

   Спенд тут не для краси: сховані рядки не йдуть і в підсумок, і без
   цього числа різниця між «$14» під фільтром і «$28» без нього
   лишалась би без відповіді. */
const CD_HID_WORD = {
  bad: 'rejected or blocked', wait: 'waiting on review',
  off: 'switched off',
  /* Стан каже ACTIVE, а власний вимикач — ні. Суперечність із
     Facebook, але вирішує вимикач: не крутиться. */
  ok: 'switched off'
};

function cdHidBits() {
  if (!cdOnly) return null;
  const live = new Set(cdShown().map(r => String(r.ad_id)));
  const hid = cdRows.filter(r => !live.has(String(r.ad_id)));
  if (!hid.length) return null;
  const by = {};
  let spend = 0;
  hid.forEach(r => {
    const st = cdState(r.effective_status);
    /* Стану немає в словнику — отже сховав його вимикач, бо лише він і
       може сховати рядок із незнайомим станом. */
    const k = st ? st.s : 'off';
    by[k] = (by[k] || 0) + 1;
    spend += Number(r.spend) || 0;
  });
  return { n: hid.length, by, spend };
}

const cdHidWords = (h) => ['bad', 'wait', 'off', 'ok']
  .filter(k => h.by[k]).map(k => h.by[k] + ' ' + CD_HID_WORD[k]).join(', ');

function cdHidden() {
  const h = cdHidBits();
  if (!h) return '';
  const words = cdHidWords(h);
  // Крапку ставимо лише тоді, коли ліворуч від неї щось є.
  const sep = (cdSeen || cdBad()) ? ' \u00b7 ' : '';
  return sep + '<span class="cd-warn">Only live hides ' + h.n
    + (words ? ': ' + words : '')
    + (h.spend ? ' \u00b7 ' + cdMoney(h.spend) + ' spent' : '') + '</span>';
}

/* Просто оголошення, без батьків. Сортуємо так само за спендом: у
   списку це єдиний спосіб відповісти на «що найдорожче», а батьків
   лишаємо підписом, щоб рядок не втратив адресу. */
function cdAds() {
  return cdShown().map(r => {
    const n = cdNode(r.ad_id, r.name, 'ad');
    const m = cdMetrics(r);
    n.own = m.state;
    n.sw = String(r.own_status || '').toUpperCase();
    cdAdd(n, m);
    n.ads = 0;
    n.where = [r.campaign_name, r.adset_name].filter(Boolean).join(' · ');
    return n;
  }).sort((a, b) => b.spend - a.spend);
}

function cdPaint() {
  const box = document.getElementById('cab-inside');
  if (!box) return;

  /* Заголовка тут немає навмисно. «Inside <номер>» повторював номер,
     який стоїть рядком вище, а «Today's numbers from the last sync»
     пояснював те, що видно з самої таблиці.

     Стрічка стану й вкладки теж переїхали — у смугу з кнопкою (cdBar).
     Вони про те саме, що й кнопка: що саме показано. Тримати їх
     окремим рядком означало б платити висотою двічі за одну думку. */
  const head = '';
  cdBar(cdFor);

  if (cdErr === 'no-table') {
    box.innerHTML = head + '<p class="cd-empty">The snapshot table does not exist yet — run '
      + 'block 1 of FB_RULES.sql, then press Sync now.</p>';
    return;
  }
  if (cdErr) { box.innerHTML = head + '<p class="cd-empty">Could not read: ' + cdEsc(cdErr) + '</p>'; return; }
  if (!cdRows.length) {
    box.innerHTML = head + '<p class="cd-empty">Nothing active in the snapshot. '
      + 'Either this cabinet is not running anything, or the sync has not filled it yet — press Sync now.</p>';
    return;
  }

  /* Фільтр сховав усе. Порожня таблиця без пояснення читається як
     «нічого не крутиться» або як поломка — а насправді це ми самі
     щойно попросили сховати. */
  if (cdOnly && !cdShown().length) {
    /* Причину називаємо словами: «нічого не крутиться» і «все
       відхилено» — це дві різні новини, і друга означає, що треба йти
       щось робити. Поки тут стояло одне «switched off», друга читалась
       як перша. */
    const h = cdHidBits();
    const words = h ? cdHidWords(h) : '';
    box.innerHTML = head + '<p class="cd-empty">Nothing is live here right now'
      + (words ? ' \u2014 ' + words : '') + '. '
      + 'Untick “Only live” to see it all.</p>';
    return;
  }

  const body = [];
  /* Верхній рівень тримаємо окремо: з нього ж рахується підсумок. У
     дереві це кампанії, у списку — оголошення; нижні рівні вже складені
     в кампанії, і брати обидва означало б порахувати все двічі. */
  const top = cdFlat ? cdAds() : cdTree();
  /* Стовпчик інсталів ставимо САМ — і тільки коли вони є. Порожня
     колонка на кожному PWA-кабінеті це шум, а відсутня на APP-кабінеті
     — та сама вада, через яку інсталів не було видно ніде. */
  cdHasInst = top.some(n => (n.installs || 0) > 0);
  /* Смуга чергується по КАМПАНІЯХ, а не по рядках: рядків у кампанії
     скільки завгодно, і чергування по них розрізало б саме ту групу,
     яку ми й намагаємось показати цілою.

     У списку оголошень кампаній немає, тож там чергуємо по рядках —
     це звичайна зебра, і вона теж допомагає не з'їхати очима. */
  let band = 0;
  if (cdFlat) top.forEach((a, k) => body.push(cdRow(a, 0, k % 2)));
  else top.forEach(c => {
    const b = band++ % 2;
    body.push(cdRow(c, 0, b));
    if (!cdOpenIds.has('campaign:' + c.id)) return;
    c.kids.forEach(s => {
      body.push(cdRow(s, 1, b));
      if (!cdOpenIds.has('ad set:' + s.id)) return;
      s.kids.forEach(a => body.push(cdRow(a, 2, b)));
    });
  });

  box.innerHTML = head + cdMarkBar() + `<div class="cd-wrap custom-scrollbar">
    <table class="cd-tbl">
      <thead><tr>
        <th>${cdFlat ? 'Ad' : 'Campaign / ad set / ad'}</th>
        <th title="Switched on is not the same as running">Status</th>
        <th class="ta-r" title="Campaign budget (CBO) or ad set budget (ABO) — Facebook keeps it on one level, not both">Budget</th>
        <th class="ta-r">Spend</th>
        <th class="ta-r" title="What the ad set optimizes for">Result</th>
        <th class="ta-r">Cost per result</th>
        <th class="ta-r" title="Cost per 1000 impressions">CPM</th>
        <th class="ta-r" title="Link clicks ÷ impressions, in percent — not Facebook’s “CTR (all)”, which also counts likes and clicks on the page. This is the number the rules measure.">Link CTR</th>
        <th class="ta-r">Link clicks</th>
        <th class="ta-r" title="Cost per link click">CPC</th>
        <th class="ta-r">Lead</th>
        <th class="ta-r">Cost per lead</th>
        <th class="ta-r" title="Completed registrations">Reg</th>
        <th class="ta-r">Cost per reg</th>
        ${cdHasInst ? `<th class="ta-r" title="Mobile app installs. This column appears on its own when there are any \u2014 on a cabinet without an app it would be an empty column on every row.">Install</th>
        <th class="ta-r">Cost per install</th>` : ''}
        <th></th>
      </tr></thead>
      <tbody>${body.join('')}${cdFill()}</tbody>
      ${cdTotalRow(top)}
    </table></div>`;
}

/* РЯДОК-ЗАПОВНЮВАЧ. Без нього підсумок притиснути до низу не вийде,
   і це не примха верстки, а те, як працює position: sticky: він зсуває
   елемент лише в межах прокрутки. Коли рядків мало й гортати нема чого,
   зсувати теж нема чого — підсумок лишається одразу під останнім
   рядком, а під ним зяє порожнеча до краю блока.

   Тож віддаємо ту порожнечу рядку, який нічого не показує: він
   розтягується на весь залишок висоти й штовхає підсумок униз. Коли
   рядків багато, залишку немає, рядок стискається в нуль, і далі
   працює вже липкість.

   Тестам він не заважає: у ньому немає .cd-lbl, за яким вони й
   впізнають рядки таблиці. */
function cdFill() {
  /* Ширина — за фактом, а не числом у коді: коли зʼявляється пара
     стовпчиків інсталів, прибитий «15» лишив би останні колонки без
     заповнювача, і підсумок поїхав би вгору саме на APP-кабінетах. */
  return '<tr class="cd-fill" aria-hidden="true"><td colspan="'
    + (cdHasInst ? 17 : 15) + '"></td></tr>';
}

/* Смуга дії. Зʼявляється лише коли щось вибрано: постійна смуга з
   нулем вибраних забирає висоту й нічого не каже. */
function cdMarkBar() {
  const n = cdMarked.size;
  if (!n) return '';
  return `<div class="cd-mkbar">
      <span class="cd-mkn">${n} picked</span>
      <button type="button" class="cd-tab" ${cdBusy ? 'disabled' : ''}
        onclick="cdFlipMany(false)">Switch off</button>
      <button type="button" class="cd-tab" ${cdBusy ? 'disabled' : ''}
        onclick="cdFlipMany(true)">Switch on</button>
      <button type="button" class="cd-tab" onclick="cdMarkClear()">Clear</button>
    </div>`;
}

/* Перемкнути все вибране однією дією. Facebook приймає до двохсот
   адрес за раз, і fb-pause тримає ту саму стелю — тож ділити на пачки
   тут нема чого.

   Питаємо один раз на всю пачку, а не на кожен рядок: пʼять
   підтверджень поспіль перестають читати вже на другому. */
window.cdFlipMany = async function (on) {
  const ids = [...cdMarked];
  if (!ids.length) return;
  const what = ids.length + ' item(s)';
  const go = typeof ask === 'function'
    ? await ask(on
        ? { title: 'Switch them on?', ok: 'Switch on',
            body: `Switch on ${what} in Facebook?\n\n`
                + 'They start spending again. Anything switched off ABOVE them stays off.' }
        : { title: 'Switch them off?', danger: true, ok: 'Switch off',
            body: `Switch off ${what} in Facebook?\n\nEverything under them stops too.` })
    : confirm((on ? 'Switch on ' : 'Switch off ') + what + '?');
  if (!go) return;

  cdBusy = true; cdPaint();
  try {
    const { data: s } = await sb.auth.getSession();
    const res = await fetch(SUPABASE_URL + '/functions/v1/fb-pause', {
      method: 'POST',
      headers: { 'content-type': 'application/json',
                 Authorization: 'Bearer ' + (s?.session?.access_token || '') },
      body: JSON.stringify({ account_id: cdAcc, ids, on: !!on })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
    const done = Number(j.paused) || 0;
    /* Правимо стан у себе лише тоді, коли пройшли ВСІ. Скільки саме
       пройшло, Facebook каже числом, а не списком, — тож на частковому
       успіху чесніше не чіпати нічого й дочекатись синхронізації, ніж
       розфарбувати навмання.

       З тієї ж причини вибір на частковому успіху НЕ скидаємо: людина
       бачить ті самі галочки й може спробувати ще раз. Повторне
       вимкнення вже вимкненого нічого не ламає, а от втрачений список
       із пʼяти рядків довелось би збирати наново. */
    if (done === ids.length) {
      ids.forEach(id => cdSetOwn(id, on ? 'ACTIVE' : 'PAUSED'));
      cdMarked = new Set();
    }
    if (typeof toast === 'function') {
      if (done === ids.length) toast('Switched ' + (on ? 'on' : 'off') + ': ' + done);
      else if (done) toast('Switched ' + done + ' of ' + ids.length
        + ' — ' + ((j.problems || [])[0] || 'Facebook refused the rest'), 'warn');
      else toast('Nothing switched: '
        + ((j.problems || [])[0] || j.note || 'Facebook refused'), 'error');
    }
  } catch (e) {
    if (typeof toast === 'function') toast('Could not switch: ' + e.message, 'error');
  }
  cdBusy = false;
  cdPaint();
};


/* СМУГИ ПІД КАМПАНІЮ.

   У дереві три рівні, і на екрані вони зливаються в суцільну стіну:
   де скінчилась одна кампанія й почалась наступна, видно хіба по
   відступу назви — а відступ ліворуч, коли очі вже поїхали вправо, до
   чисел. Через це рядок легко прочитати не під тією кампанією.

   Тому кожна наступна кампанія отримує іншу яскравість тла, а її
   адсети й оголошення — ту саму, що й вона. Виходить блок, який видно
   одним поглядом, не читаючи назв.

   Це НЕ оцінка. Спершу тут фарбувалось «дорожче/дешевше за середнє», і
   це відповідало на питання, якого не ставили: у таблиці й так є
   числа, щоб судити, а бракувало саме межі між групами. */

/* ПІДСУМОК. Рахуємо з верхнього рівня — кампаній у дереві, оголошень у
   списку: нижні рівні вже складені в них, і брати обидва означало б
   порахувати все двічі.

   Похідні числа (CPM, CTR, ціна за щось) рахуються ІЗ СУМ, а не як
   середнє по рядках. Середнє з середніх — інше число: кампанія на
   три долари важила б у ньому стільки ж, скільки кампанія на триста. */
/* РІЗНІ ОДИНИЦІ НЕ СКЛАДАЮТЬСЯ.

   Кампанія, де один адсет оптимізується на кліки, а інший на покупки,
   складала їх в одне число — і воно виходило велике. Зрозуміти з
   екрана, що воно безглузде, було неможливо: колонка не казала, ЩО
   рахує. Саме так «результатів багато» й бралось там, де депозитів
   бути не могло.

   Тепер: одна одиниця — число з її назвою; кілька — «mixed» і перелік
   у підказці. Прочерк замість суми тут не втрата, а відмова брехати. */
function cdResultCell(n) {
  /* ЩО СКАЗАВ САМ FACEBOOK. Колонка показує подію, на яку
     оптимізується адсет, — і коли число виглядає дивним, перше
     питання завжди одне: а яка там ціль? Доки відповідь лежала тільки
     в коді, перевірити її з екрана було нічим, і спір «у Facebook
     інакше» не мав де закінчитись. Тепер ціль стоїть у підказці як є,
     її ж словами. */
  const goals = [...(n.goals || [])];
  const said = !goals.length ? ''
    : '\nFacebook calls the goal: ' + goals.join(', ');
  if (!n.hasResult) return { text: cdNone, per: cdNone,
                             tip: 'The sync has not brought the goal yet' + said };
  const u = [...(n.units || [])];
  if (u.length > 1) return {
    text: 'mixed', per: cdNone,
    tip: 'Different ad sets count different things: '
       + u.map(cdUnitWord).join(', ') + '. Adding them up would mean nothing — '
       + 'open the ad sets to see each on its own.' + said
  };
  const word = u.length ? cdUnitWord(u[0]) : '';
  /* Ціль Reach — єдиний випадок, де ми свідомо показуємо не те, що
     Facebook: охоплення синхронізація не привозить. Мовчати про це
     не можна. */
  const warn = u[0] === 'reach_as_impressions'
    ? '\nFacebook counts Reach here — unique people. The sync brings '
      + 'impressions only, and on the same ad set that number is larger.' : '';
  return {
    text: String(n.result) + (word ? '<span class="cd-unit">' + cdEsc(word) + '</span>' : ''),
    per: cdPer(n.spend, n.result),
    tip: (word ? 'Counted: ' + word : 'What the ad set optimizes for') + warn + said
  };
}

function cdTotalRow(list) {
  if (!list || !list.length) return '';
  const t = { spend: 0, imps: 0, clicks: 0, leads: 0, regs: 0, installs: 0, result: 0,
              hasResult: false, ads: 0, units: new Set() };
  list.forEach(n => {
    t.spend += n.spend; t.imps += n.imps; t.clicks += n.clicks;
    t.leads += n.leads; t.regs += n.regs; t.installs += n.installs || 0;
    t.ads += n.ads || 1;
    // Підсумок складає ті самі одиниці, що й рядки, — і спотикається
    // об ту саму кашу, якщо їх кілька. Тож і поводиться так само.
    if (n.hasResult) { t.result += n.result; t.hasResult = true;
                       (n.units || []).forEach(u => t.units.add(u)); }
  });
  const tRes = cdResultCell(t);

  const cpm = t.imps > 0 ? cdMoney(t.spend / t.imps * 1000) : cdNone;
  const ctr = t.imps > 0
    ? (Math.round(t.clicks / t.imps * 10000) / 100).toFixed(2) + '%' : cdNone;

  return `<tfoot><tr class="cd-tot">
    <td>Total</td>
    <td></td>
    <td class="ta-r cd-num">${cdBudgetText(cdTotalBudget(list))}</td>
    <td class="ta-r cd-num cd-spend">${cdMoney(t.spend)}</td>
    <td class="ta-r cd-num" title="${cdEsc(tRes.tip)}">${tRes.text}</td>
    <td class="ta-r cd-num">${tRes.per}</td>
    <td class="ta-r cd-num">${cpm}</td>
    <td class="ta-r cd-num">${ctr}</td>
    <td class="ta-r cd-num">${t.clicks}</td>
    <td class="ta-r cd-num">${cdPer(t.spend, t.clicks)}</td>
    <td class="ta-r cd-num">${t.leads}</td>
    <td class="ta-r cd-num">${cdPer(t.spend, t.leads)}</td>
    <td class="ta-r cd-num">${t.regs}</td>
    <td class="ta-r cd-num">${cdPer(t.spend, t.regs)}</td>
    ${cdHasInst ? `<td class="ta-r cd-num">${t.installs}</td>
    <td class="ta-r cd-num">${cdPer(t.spend, t.installs)}</td>` : ''}
    <td></td>
  </tr></tfoot>`;
}

/* Загальний бюджет. У Facebook він стоїть або на кампанії, або на її
   адсетах — ніколи на обох, тож беремо з кампанії, а як там порожньо,
   складаємо її адсети. Подвійного рахунку тут бути не може.

   Денний і довічний не складаємо разом: це різні величини, і сума
   «50 на добу плюс 1200 за весь час» не означає нічого. Коли трапилось
   і те, і те, показуємо денний — його й дивляться щодня. */
function cdTotalBudget(list) {
  let daily = 0, life = 0;
  list.forEach(n => {
    const own = n.budget;
    if (own) { if (own.kind === 'daily') daily += own.v; else life += own.v; return; }
    (n.kids || []).forEach(k => {
      if (!k.budget) return;
      if (k.budget.kind === 'daily') daily += k.budget.v; else life += k.budget.v;
    });
  });
  if (daily > 0) return { v: daily, kind: 'daily' };
  if (life > 0) return { v: life, kind: 'lifetime' };
  return null;
}

/* Ціна — нескінченність, коли витрати є, а результату немає. Прочерк
   тут означав би «нуль», а це різні речі: саме ці рядки й вимикають
   правила. */
/* БЮДЖЕТ. У Facebook він стоїть АБО на кампанії (CBO), АБО на кожному
   адсеті (ABO) — ніколи на обох. Тому порожньо тут означає не «нуль», а
   «бюджет на іншому рівні», і малювати замість нього нуль не можна.

   Числа приїжджають у дрібних одиницях: 5000 — це 50.00. Так само, як
   баланс кабінета, який колись через це показував $0 замість $0.43. */
function cdBudget(daily, life) {
  const d = daily === null || daily === undefined || daily === '' ? null : Number(daily);
  const l = life === null || life === undefined || life === '' ? null : Number(life);
  if (Number.isFinite(d) && d > 0) return { v: d / 100, kind: 'daily' };
  if (Number.isFinite(l) && l > 0) return { v: l / 100, kind: 'lifetime' };
  return null;
}

/* Денний бюджет підписуємо, довічний теж: «$50» без слова читалось би
   як те саме число в обох випадках, а це дві різні величини — одна за
   добу, друга за весь час. */
const cdBudgetText = (b) => !b ? cdNone
  : b.kind === 'daily' ? cdMoney(b.v) + ' <span class="cd-bq">/day</span>'
  : cdMoney(b.v) + ' <span class="cd-bq">total</span>';

/* Розклад під підказкою. Читається як відповідь на питання «чому саме
   стільки»: що Facebook прислав, що з цього порахували, а що прибрали
   як те саме іншим іменем.

   Подія, яку НЕ порахували, теж у списку — саме вона найчастіше і є
   відповіддю: побачивши «app installs 1 — counted», людина зніме
   галочку й отримає своє число, а не гадатиме. */
function cdLeadTip(n) {
  const rows = [...n.leadBy.entries()].filter(([, x]) => x.v !== 0);
  if (!rows.length) return 'Nothing Facebook calls a lead came in for this row.';
  const out = rows.map(([t, x]) =>
    t + ' ' + x.v + (x.used ? ' — counted' : ' — same event under another name, not added'));
  return 'Lead = ' + n.leads + '\n' + out.join('\n')
       + '\n\nFacebook reports the same lead under several names; only one of them is counted. The dashboard and the rules count it identically.';
}

const cdPer = (spend, n) => n > 0 ? cdMoney(spend / n)
  : (spend > 0 ? '<span class="cd-inf" title="Money spent, nothing back yet">∞</span>'
               : '<span class="cd-na">—</span>');
const cdNone = '<span class="cd-na">—</span>';

/* Один значок на оголошенні; на кампанії — розклад. Показуємо не
   «більшість», а найгірше: одна кампанія з трьох робочих і одним
   реджектом — це кампанія, у якій є реджект, і саме його треба бачити.

   Порожнє замість вигаданого «Active»: рядок зі старого знімка стану не
   знає, і домальовувати йому «все добре» — та сама брехня, що нуль
   замість прочерка. */
function cdChips(n) {
  const ad = n.kind === 'ad';
  const parts = [];
  /* ВЛАСНИЙ СТАН ВУЗЛА — ПЕРШИМ І ЗАВЖДИ. Раніше в кампанії стояв лише
     розклад її оголошень, і вимкнена кампанія з активними оголошеннями
     виглядала робочою: «5 active» — і все. Тепер спершу видно, що
     вимкнена саме вона, а розклад дітей лишається поруч.

     Для оголошення own і є його стан, тож дублювати не треба: нижній
     цикл намалює те саме. */
  if (!ad && n.own) {
    const st = cdState(n.own);
    parts.push(st
      ? { s: st.s, why: st.why, text: st.t, self: true }
      : { s: 'wait', why: 'Facebook reports this state',
          text: String(n.own).toLowerCase().replace(/_/g, ' '), self: true });
  }
  CD_STATE.forEach(st => {
    const cnt = n.state.get(st.k) || 0;
    if (!cnt) return;
    // Один підпис на всі стани: «2 on», «1 rejected», «3 off». Окремий
    // випадок для ACTIVE тут колись був лише заради слова «active».
    parts.push({ s: st.s, why: st.why,
      text: ad ? st.t : cnt + ' ' + st.t.toLowerCase() });
  });
  const other = [...n.state.entries()].filter(([k]) => k && !cdState(k));
  if (other.length) parts.push({ s: 'wait', why: 'Facebook reports this state',
    text: ad ? String(other[0][0]).toLowerCase().replace(/_/g, ' ')
             : other.reduce((a, [, v]) => a + v, 0) + ' other' });
  const none = n.state.get('') || 0;
  if (none) parts.push({ s: 'na', text: ad ? '—' : none + ' unknown',
    why: 'The sync has not brought the status yet — deploy fb-sync, then press Sync now' });

  /* Більше двох значків у рядок не влазить, а перенос робить рядок
     удвічі вищим — на тридцяти кампаніях це вже інша таблиця. Тому
     показуємо два найгірші, решту рахуємо в «+N», а повний розклад
     лишаємо в підказці: він потрібен рідко, а висота рядка — завжди. */
  const show = parts.slice(0, 2);
  const rest = parts.length - show.length;
  const all = parts.map(x => x.text).join(', ');
  return `<span class="cd-sts" title="${cdEsc(all)}">`
    + show.map(x => `<span class="cd-st cd-st-${x.s}${x.self ? ' is-self' : ''}" title="${
        cdEsc(x.why)}">${cdEsc(x.text)}</span>`).join('')
    + (rest ? `<span class="cd-st cd-st-na">+${rest}</span>` : '')
    + '</span>';
}

/* ── ДОМЕН, НА ЯКИЙ ВЕДЕ ОГОЛОШЕННЯ ──

   За замовчуванням прихований, і це не примха. Дерево кампаній
   відкривають на зустрічах, у демонстрації екрана і на скриншотах у
   чат — а домен це рівно те, чого показувати стороннім не варто:
   зібравши їх, людина ззовні бачить усю сітку. Тому домен лежить під
   оком, і відкривається той рядок, який справді потрібен.

   Ховаємо не стилем, а текстом: приховане через CSS лишається в
   розмітці — на скриншоті його немає, зате в коді сторінки є. */
let cdEyed = new Set();

const CD_DOTS = '\u2022\u2022\u2022\u2022\u2022';
const CD_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
  + '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const CD_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
  + '<path d="M17.9 17.9A10.7 10.7 0 0 1 12 20c-7 0-11-8-11-8a19.8 19.8 0 0 1 5.1-5.9m3.6-1.7A10.7'
  + ' 10.7 0 0 1 12 4c7 0 11 8 11 8a19.8 19.8 0 0 1-2.2 3.2m-6.7-1.1a3 3 0 1 1-4.2-4.2"/>'
  + '<line x1="1" y1="1" x2="23" y2="23"/></svg>';

/* Домени беремо з даних у момент кліку, а НЕ кладемо в розмітку
   заздалегідь. Це не дрібниця: і data-атрибут, і title у підказці —
   та сама витока, просто на крок далі. Прихований напис, який видно в
   коді сторінки, нікого не захищає. */
function cdHostsFor(key) {
  const i = key.indexOf(':');
  const kind = key.slice(0, i), id = key.slice(i + 1);
  const field = kind === 'ad' ? 'ad_id' : kind === 'campaign' ? 'campaign_id' : 'adset_id';
  const out = new Set();
  cdShown().forEach(r => {
    if (String(r[field] || '') !== id) return;
    const h = String(r.link_domain || '').trim();
    if (h) out.add(h);
  });
  return [...out];
}

function cdDomText(hosts) {
  /* Під кампанією цілком законно стоять оголошення на різні домени.
     Показати перший із них як «домен кампанії» — саме та напівправда,
     через яку потім шукають не там. */
  return hosts.length === 1 ? hosts[0] : hosts.length + ' domains';
}

window.cdEye = function (key, el) {
  if (cdEyed.has(key)) cdEyed.delete(key); else cdEyed.add(key);
  const on = cdEyed.has(key);
  /* Перемальовуємо ОДИН рядок, а не все дерево: cdPaint згорнув би
     прокрутку й зняв фокус, а змінився рівно один напис. */
  const cell = el.closest('.cd-name');
  const box = cell && cell.querySelector('.cd-dom');
  if (box) {
    const hosts = cdHostsFor(key);
    box.className = 'cd-dom' + (on ? ' is-on' : '');
    box.textContent = on ? cdDomText(hosts) : CD_DOTS;
    box.title = on && hosts.length > 1 ? hosts.join(', ') : '';
  }
  el.innerHTML = on ? CD_EYE_OFF : CD_EYE;
  el.classList.toggle('is-on', on);
  el.title = on ? 'Hide the domain' : 'Show the domain this runs on';
};

function cdDom(n, key) {
  /* Око — ТІЛЬКИ на оголошенні. На кампанії воно чесно відповідало
     «2 domains» — і саме тому було ні про що: питання завжди про
     конкретне оголошення, а не про те, скільки доменів набралось
     під гілкою. А ще кожен зайвий рядок з оком — це ще одна кнопка
     в комірці назви, якої на телефоні і так бракує. */
  if (n.kind !== 'ad') return '';
  if (!n.hosts.size) return '';
  const on = cdEyed.has(key);
  const k = cdEsc(key).replace(/'/g, '&#39;');
  /* Підказка НЕ називає домени, поки око закрите: інакше досить
     навести мишу — і ховати не було чого. */
  const tip = on ? 'Hide the domain' : 'Show the domain this runs on';
  const body = on ? cdEsc(cdDomText([...n.hosts])) : CD_DOTS;
  return `<button type="button" class="cd-eye${on ? ' is-on' : ''}"
      onclick="event.stopPropagation();cdEye('${k}', this)"
      title="${tip}" aria-label="Show the domain">${on ? CD_EYE_OFF : CD_EYE}</button>`
    + `<span class="cd-dom${on ? ' is-on' : ''}">${body}</span>`;
}

function cdRow(n, depth, band) {
  const key = n.kind + ':' + n.id;
  const kids = n.kids.length > 0;
  const open = cdOpenIds.has(key);
  /* Розкриває вся назва, а не сам трикутник: цілитись у чотирнадцять
     пікселів на рядку, де й так тісно, — заняття, а не клік. */
  const twist = `<span class="cd-twist${kids ? (open ? ' is-on' : '') : ' cd-leaf'}"></span>`;
  const hit = kids
    ? ` onclick="cdToggle('${cdEsc(key).replace(/'/g, '&#39;')}')"` : '';

  /* Назви немає — значить знімок старий: fb-sync привозить її разом із
     числами. Показуємо id, але видно, що це id, а не назва: мовчки
     підсунути номер замість назви — те саме, що показати нуль замість
     «не знаю». */
  const named = String(n.name || '').trim();
  const label = named
    ? `<span class="cd-lbl">${cdEsc(named)}</span>`
    : `<span class="cd-lbl cd-noname" title="The sync has not brought the name yet — deploy fb-sync, then press Sync now">#${cdEsc(n.id)}</span>`;
  const count = n.kind === 'ad'
    ? (n.where ? `<span class="cd-where">${cdEsc(n.where)}</span>` : '')
    : `<span class="cd-cnt">${n.ads} ad${n.ads === 1 ? '' : 's'}</span>`;

  const res = cdResultCell(n);
  const goalTip = res.tip;
  const result = res.text;
  const perResult = res.per;

  const cpm = n.imps > 0 ? cdMoney(n.spend / n.imps * 1000) : cdNone;
  const ctr = n.imps > 0
    ? (Math.round(n.clicks / n.imps * 10000) / 100).toFixed(2) + '%' : cdNone;


  /* Галочка стоїть у комірці назви, а не окремим стовпчиком: власного
     стовпчика на неї немає де взяти, а клік по ній не повинен
     розкривати дерево — звідси stopPropagation. */
  const mark = `<input type="checkbox" class="cd-mk" ${cdMarked.has(String(n.id)) ? 'checked' : ''}
      onclick="event.stopPropagation()"
      onchange="cdMark('${cdEsc(n.id)}', this.checked)"
      title="Pick this ${n.kind} to switch together with others">`;

  return `<tr class="cd-r cd-d${depth}${band ? ' is-band' : ''}${cdMarked.has(String(n.id)) ? ' is-mk' : ''}">
    <td class="cd-name${kids ? ' cd-can' : ''}"${hit}
        title="${cdEsc(n.id)}${kids ? ' · click to ' + (open ? 'collapse' : 'expand') : ''}"
        >${mark}${twist}${label}${cdDom(n, key)}${count}</td>
    <td>${cdChips(n)}</td>
    <td class="ta-r cd-num">${cdBudgetText(n.budget)}</td>
    <td class="ta-r cd-num cd-spend">${cdMoney(n.spend)}</td>
    <td class="ta-r cd-num" title="${cdEsc(goalTip)}">${result}</td>
    <td class="ta-r cd-num" title="${cdEsc(goalTip)}">${perResult}</td>
    <td class="ta-r cd-num">${cpm}</td>
    <td class="ta-r cd-num">${ctr}</td>
    <td class="ta-r cd-num">${n.clicks}</td>
    <td class="ta-r cd-num">${cdPer(n.spend, n.clicks)}</td>
    <td class="ta-r cd-num has-tip" title="${cdEsc(cdLeadTip(n))}">${n.leads}</td>
    <td class="ta-r cd-num">${cdPer(n.spend, n.leads)}</td>
    <td class="ta-r cd-num">${n.regs}</td>
    <td class="ta-r cd-num">${cdPer(n.spend, n.regs)}</td>
    ${cdHasInst ? `<td class="ta-r cd-num">${n.installs}</td>
    <td class="ta-r cd-num">${cdPer(n.spend, n.installs)}</td>` : ''}
    <td class="ta-r">${cdSwitch(n, named)}</td>
  </tr>`;
}

/* ПЕРЕМИКАЧ, а не кнопка «Stop». Кнопка вміла одне — вимкнути, — і
   після натискання рядок виглядав так само, як до нього: незрозуміло
   було навіть те, чи спрацювало. Перемикач показує стан і міняє його в
   обидва боки, як в Ads Manager.

   Стан беремо з власного вимикача вузла, а не з того, чи щось
   показують: реджект увімкнений, оголошення під вимкненою кампанією
   теж увімкнене. */
function cdSwitch(n, named) {
  /* Положення вимикача беремо з status, а не з effective_status. Поки
     бази ще без цієї колонки, sw порожній — тоді чесно показуємо
     «не знаємо» пунктиром, а не вгадуємо, як робили раніше. */
  const known = !!n.sw;
  const on = known && cdIsOn(n.sw);
  const title = !known
    ? 'Facebook has not told us the switch position of this ' + n.kind
      + ' yet — deploy fb-sync, run block 1 of FB_RULES.sql, then press Sync now'
    : on ? 'Switched on. Click to switch off in Facebook'
         : 'Switched off. Click to switch on in Facebook';
  return `<button type="button" class="cd-sw${on ? ' is-on' : ''}${known ? '' : ' is-na'}"
      role="switch" aria-checked="${on}" ${cdBusy ? 'disabled' : ''}
      onclick="cdFlip('${cdEsc(n.id)}', '${n.kind}', '${encodeURIComponent(named || n.id)}', ${on})"
      title="${cdEsc(title)}"><span class="cd-sw-k"></span></button>`;
}

/* Перемкнути одну сутність руками. Ходить у ту саму функцію, що й
   кнопка «зупинити кабінет», — єдине місце в проєкті, яке щось міняє у
   Facebook від імені людини.

   Питаємо щоразу, і в обидва боки. Вимкнення зупиняє те, що працює;
   увімкнення починає витрачати гроші. Жодна з цих дій не є тією, яку
   можна зробити випадковим кліком по рядку таблиці. */
window.cdFlip = async function (id, kind, nameEnc, isOn) {
  const name = decodeURIComponent(nameEnc);
  const off = !!isOn;                     // зараз увімкнене → вимикаємо
  const go = typeof ask === 'function'
    ? await ask(off
        ? { title: 'Switch it off?', danger: true, ok: 'Switch off',
            body: `Switch off the ${kind} “${name}” in Facebook?\n\n`
                + 'Everything under it stops too.' }
        : { title: 'Switch it on?', ok: 'Switch on',
            body: `Switch on the ${kind} “${name}” in Facebook?\n\n`
                + 'It starts spending again. Anything switched off ABOVE it stays off — '
                + 'then nothing will show until that is switched on too.' })
    : confirm((off ? 'Switch off ' : 'Switch on ') + kind + ' "' + name + '"?');
  if (!go) return;

  cdBusy = true; cdPaint();
  try {
    const { data: s } = await sb.auth.getSession();
    const res = await fetch(SUPABASE_URL + '/functions/v1/fb-pause', {
      method: 'POST',
      headers: { 'content-type': 'application/json',
                 Authorization: 'Bearer ' + (s?.session?.access_token || '') },
      body: JSON.stringify({ account_id: cdAcc, ids: [id], on: !off })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
    const word = off ? 'off' : 'on';
    if (j.paused) {
      /* Знімок про це ще не знає — він приїде наступною синхронізацією.
         Але лишити рядок у старому положенні означало б показати
         людині, що нічого не сталось. Тому правимо його в себе: це не
         вигадане число, а те, що Facebook щойно підтвердив. */
      cdSetOwn(id, off ? 'PAUSED' : 'ACTIVE');
      if (typeof toast === 'function') toast('Switched ' + word + ': ' + name);
    } else if (typeof toast === 'function') {
      toast('Not switched ' + word + ': '
        + ((j.problems || [])[0] || j.note || 'Facebook refused'), 'error');
    }
  } catch (e) {
    if (typeof toast === 'function')
      toast('Could not switch ' + (off ? 'off' : 'on') + ': ' + e.message, 'error');
  }
  cdBusy = false;
  cdPaint();
};

/* Правимо стан у себе, у знімку в памʼяті. Рядків на одну кампанію
   багато — по одному на кожне оголошення, — тож правити треба всі, що
   її стосуються, інакше наступне ж перемальовування візьме стан із
   сусіднього рядка й поверне вимикач назад. */
function cdSetOwn(id, state) {
  cdRows.forEach(r => {
    if (String(r.campaign_id) === String(id)) {
      r.campaign_status = state; r.campaign_own_status = state;
    }
    if (String(r.adset_id) === String(id)) {
      r.adset_status = state; r.adset_own_status = state;
    }
    if (String(r.ad_id) === String(id)) {
      r.effective_status = state; r.own_status = state;
    }
  });
}
</script>
