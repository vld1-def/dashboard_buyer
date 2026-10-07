/* ═══════════ ЕКСПОРТ ЗВІТУ КАБІНЕТА ═══════════

   Те саме, що ти робив руками: зайти у Facebook, зібрати звіт, скачати
   файл. Тільки кнопкою, і файл одразу в тому вигляді, який читає
   Form.html.

   ЧОМУ ЗАГОЛОВКИ САМЕ ТАКІ. Form.html розпізнає колонки за назвами, і
   назви ці відомі: 'reporting starts', 'campaign name', 'ad name',
   'amount spent', 'country', 'publisher platform'… Ми не вигадуємо
   формат — ми влучаємо в наявний. Тому цей файл можна залити тим самим
   імпортом, що й фебешний, і нічого в ньому не правити.

   ВАЛЮТА ЖИВЕ В ЗАГОЛОВКУ СПЕНДУ, і це не косметика: Form.html бере її
   саме звідти — «Amount spent (PLN)» — і за нею перераховує в долари
   за курсом того дня. Написати просто «Amount spent» означало б тихо
   видати злоті за долари. Тому валюта завжди в дужках.

   РЯДКИ БЕЗ ПЕРЕВОДІВ. Розбірник Form.html спершу ріже файл по
   рядках і лише потім розбирає лапки. Назва оголошення з переводом
   рядка розвалила б таблицю, тому переводи в значеннях замінюємо
   пробілом.

   ЩО ВВАЖАТИ РЕГОЮ Й ДЕПОМ, Facebook не знає. Він віддає конверсії як
   action_type своїми іменами. Вибір людини, один раз, зі списку того,
   що реально приходило в цей кабінет. Не вибрано — колонки в файлі
   просто немає: порожня колонка виглядала б як «нуль конверсій», а це
   інше твердження. */

/* Пари «гео + плейсмент» тут немає, і це межа Facebook, а не наша: на
   такий запит він відповідає #100 і перелічує, що не сходиться — разом
   із action_type, якого ми не просили. Той зʼявляється сам, щойно в
   полях є конверсії. Тобто або гео з плейсментом і без конверсій, або
   конверсії й один розріз. Конверсії важливіші. */
const FBR_BREAKDOWNS = [
  ['', 'By day'],   // те, що потрібне Form.html у 99 випадках зі 100
  ['country', 'By day + country'],
  ['placement', 'By day + placement']
];

/* Колонки розрізу. Ключі збігаються з тим, що Facebook кладе в рядок,
   заголовки — з тим, що шукає Form.html. */
const FBR_BD_COLS = {
  country: [['country', 'Country']],
  placement: [['publisher_platform', 'Publisher platform'],
              ['platform_position', 'Platform position'],
              ['impression_device', 'Impression device']]
};

/* Конверсії, які вміє приймати Form.html. label — що побачиш у
   налаштуванні, head — заголовок колонки у файлі. */
const FBR_CONV = [
  ['reg',  'Registration',   'Registrations completed'],
  ['dep',  'Deposit',        'Purchases'],
  ['inst', 'Install / lead', 'Leads']
];

/* ЗАГОЛОВОК МУСИТЬ НАЗИВАТИ ТЕ, ЩО В КОЛОНЦІ.

   Третій слот приймає і лід, і інсталь застосунку — у даних дашборда
   це одне поле (daily_stats.installs), тож Form.html заводить туди
   обидві назви однаково. Через це заголовок довго стояв сталим:
   «Leads» хоч ти вибери mobile_app_install.

   Для імпорту це справді нічого не міняло. Для людини — міняло все:
   вибираєш install, відкриваєш файл, а там Leads, і єдиний спосіб
   перевірити, що пішло насправді, — звіряти числа руками.

   Тепер заголовок іде за вибраною подією. Для APP-режиму це ще й
   точніше: коли у файлі поруч стоять обидві колонки, імпорт віддає
   перевагу «App installs» — тож назва, що збігається з подією, веде
   число туди, куди й задумано. */
const FBR_INSTALL_EVENTS = ['mobile_app_install', 'app_install'];
const fbrHead = (key, label, type) =>
  (key === 'inst' && FBR_INSTALL_EVENTS.includes(type)) ? 'App installs' : label;

/* ЩО БЕРЕТЬСЯ САМО.

   Спершу вибір був обовʼязковий: три списки, і поки в них не ткнеш,
   файл неповний. Це неправильно поставлене питання — у переважній
   більшості кабінетів відповідь та сама, і питати її щоразу означає
   змушувати людину працювати за програму.

   Тепер подія береться за списком нижче: перша, яка справді є в цьому
   кабінеті. Немає жодної — беремо все одно першу, канонічну, і чесно
   підписуємо, що такої події тут не бачили. Стовпчик при цьому не
   зникає: Form.html чекає на нього, і його відсутність коштувала б
   зайвого вікна «чого бракує» на кожному імпорті.

   Порядок у списках не випадковий: зверху те, що Facebook віддає
   частіше. omni_* рахує і сайт, і застосунок; offsite_conversion.*
   — те, що приходить із пікселя. */
const FBR_GUESS = {
  reg:  ['complete_registration', 'offsite_conversion.fb_pixel_complete_registration',
         'omni_complete_registration', 'onsite_web_complete_registration'],
  dep:  ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase',
         'onsite_web_purchase', 'app_custom_event.fb_mobile_purchase'],
  inst: ['lead', 'offsite_conversion.fb_pixel_lead', 'omni_lead',
         'mobile_app_install', 'app_install']
};

/* ЧОМУ СПИСОК ПОДІЙ КОРОТШИЙ, НІЖ ВІДДАЄ FACEBOOK.

   У відповіді на кабінет приходять ВСІ action_type, які там були, —
   і конверсії, і все підряд: post_engagement, page_engagement,
   comment, like, post_reaction, link_click, video_view,
   landing_page_view, photo_view. У живому кабінеті це сорок-пʼятдесят
   рядків, із яких у справі три. Шукати серед них потрібну подію —
   робота, якої тут не має бути.

   Фільтр ПОЗИТИВНИЙ, а не список забороненого: назв «зайвого»
   Facebook додає швидше, ніж ми встигали б їх виписувати, а назви
   конверсій тримаються тих самих коренів роками. Усе, що містить
   «custom», лишається навмисно: власні події пікселя й застосунку
   (offsite_conversion.custom.123…, app_custom_event.fb_mobile_…) — це
   якраз ті, яких ми не можемо знати на імʼя, і саме в них у частини
   кабінетів лежить справжня конверсія.

   І головне: нічого не зникає назовсім. Під списками стоїть, скільки
   подій прибрано, і одним кліком вони повертаються. Фільтр, який тихо
   ховає потрібне й не каже про це, коштував би дорожче за весь список
   разом. */
const FBR_EV_KEEP = [
  'complete_registration', 'purchase', 'lead', 'install', 'custom',
  'add_payment_info', 'initiate_checkout', 'add_to_cart',
  'subscribe', 'start_trial', 'submit_application', 'contact',
  'spend_credits', 'credit_spent', 'donate',
  /* link_click тут не помилка. Строго кажучи це не конверсія, і
     кліки по посиланню вже йдуть у файл окремим стовпчиком із
     inline_link_clicks. Але подією вона буває потрібна: у частині
     заливів перший крок рахують саме по ній, і тоді її вибирають у
     слот. «Не конверсія за визначенням» — не підстава ховати те, чим
     користуються. */
  'link_click'
];
const fbrIsConv = t => {
  const s = String(t || '').toLowerCase();
  return FBR_EV_KEEP.some(k => s.includes(k));
};

let fbrAllEv = false;   // true — показати всі події, не тільки конверсії
let fbrFor = '';        // для якого кабінета розкрито блок
let fbrEvents = null;   // [{type,n}] — що приходить у цей кабінет
let fbrErr = '';
let fbrBusy = '';       // текст на час роботи; '' — вільно
/* Останнє сказане й яким тоном. Тримаємо станом, а не в DOM: панель
   кабінета перемальовується цілком, і повідомлення, записане прямо у
   вузол, зникало б рівно в ту мить, коли його дочитують. */
let fbrMsg = { html: '', tone: '' };
/* Без розрізу за замовчуванням — і це не економія, а те, як
   влаштований імпорт на тому кінці.

   Form.html дістає гео з НАЗВИ КАМПАНІЇ: у PWA за шаблоном виду
   *_{geo}_{ktid}, в APP — за шаблоном профілю. Стовпець Country він
   читає лише тоді, коли в шаблоні немає {geo} — тобто майже ніколи.

   Розріз по країнах при цьому множить рядки: одна кампанія на пʼять
   країн дає пʼять рядків замість одного, і всі пʼять Form зведе до
   того самого гео з назви. Файл важчий, звіт довший, Facebook частіше
   ріже його по ліміту — і все це заради стовпця, який ніхто не
   відкриє. */
let fbrBd = '';

/* '' — брати само, '-' — не вивантажувати, будь-що інше — вибрана
   подія. «Брати само» і «не треба» навмисно різні значення: звести їх
   в одне означало б не розрізняти «я не вибрав» і «я не хочу». */
let fbrMap = { reg: '', dep: '', inst: '' };
let fbrMapLoaded = false;

const fbrEsc = v => String(v == null ? '' : v)
  .replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* Вибір «що є рега» — командний, не персональний: файли з різних
   кабінетів зводяться в одну таблицю, і різні правила в різних людей
   зробили б її несумісною сама з собою. */
async function fbrLoadMap() {
  if (fbrMapLoaded) return;
  fbrMapLoaded = true;
  try {
    const raw = await getTeamSetting('fb_report_map');
    if (raw) fbrMap = { ...fbrMap, ...JSON.parse(raw) };
  } catch (e) { /* немає — виберуть заново */ }
}

async function fbrSaveMap(key, value) {
  fbrMap[key] = value || '';
  try { await setTeamSetting('fb_report_map', JSON.stringify(fbrMap)); } catch (e) {}
}

window.fbrSetConv = async function (key, value) {
  await fbrSaveMap(key, value);
};

window.fbrEvFilter = function (on) {
  fbrAllEv = !on;
  cabRefresh();
};

window.fbrSetBd = function (v) {
  fbrBd = v;
};

/* ── виклик функції ──
   Окрема від fbSync: там прогін усього парку, тут звіт одного
   кабінета. Спільного в них лише спосіб постукати. */
async function fbrCall(body) {
  const { data: sess } = await sb.auth.getSession();
  const token = sess && sess.session && sess.session.access_token;
  if (!token) throw new Error('not signed in');
  const res = await fetch(SUPABASE_URL + '/functions/v1/fb-report', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY,
               'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 404) throw Object.assign(new Error('not deployed'), { code: 'missing' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
  return j;
}

function fbrWhy(e) {
  const net = /failed to fetch|networkerror|load failed/i.test(e.message || '');
  return (e.code === 'missing' || net)
    ? 'The fb-report function did not answer — deploy it first: '
      + '<span class="font-mono">supabase functions deploy fb-report</span>'
    : fbrEsc(e.message);
}

window.fbrToggle = async function (idEnc) {
  const id = decodeURIComponent(idEnc);
  if (fbrFor === id) { fbrFor = ''; cabRefresh(); return; }
  fbrFor = id;
  fbrAllEv = false;
  fbrEvents = null;
  fbrErr = '';
  fbrMsg = { html: '', tone: '' };
  await fbrLoadMap();
  cabRefresh();
  /* Перелік подій тягнемо один раз на відкриття. Це окремий похід у
     Facebook, тож робити його на кожну перемальовку панелі не варто. */
  try {
    const j = await fbrCall({ action: 'events', account_id: id });
    fbrEvents = j.events || [];
  } catch (e) {
    fbrEvents = [];
    fbrErr = fbrWhy(e);
  }
  if (fbrFor === id) cabRefresh();
};

/* ── сам блок у панелі кабінета ── */
function fbrBlock(c) {
  if (!c || !c.fb) return '';
  const id = c.id;
  const enc = encodeURIComponent(id).replace(/'/g, '%27');
  if (fbrFor !== id) {
    return `<button type="button" onclick="fbrToggle('${enc}')" class="fbr-open"
        title="Build the same report you now export by hand in Ads Manager">Export report…</button>`;
  }

  const opt = (v, label, sel) =>
    `<option value="${fbrEsc(v)}"${sel === v ? ' selected' : ''}>${fbrEsc(label)}</option>`;

  /* Список лишається, але вибирати нічого не треба: зверху стоїть
     «беру само» з уже підставленою подією. Він тут для кабінета, у
     якого своя конверсія — а не для того, щоб питати щоразу. */
  /* Вибране руками й те, що взялось само, лишаються в списку завжди —
     навіть якщо фільтр їх не пропускає. Інакше select показав би не
     те, що насправді піде у файл: браузер, не знайшовши значення
     серед option, малює перший рядок. */
  const evOpts = key => {
    const keep = new Set([fbrMap[key], fbrPick(key)].filter(Boolean));
    return fbrEvents.filter(e => fbrAllEv || fbrIsConv(e.type) || keep.has(e.type));
  };

  const evSel = ([key, label, head]) => {
    if (fbrEvents === null) return `<p class="fbr-hint">${fbrEsc(label)}: looking…</p>`;
    const now = fbrPick(key);
    const auto = fbrMap[key] === '' ;
    const miss = auto && now && !fbrSeen(now);
    /* Подія поза звичним для слота — наприклад link_click у «install /
       lead». Вибір законний, але назва стовпчика при цьому НЕ стане
       «Link clicks»: Form.html кладе число в daily_stats.installs саме
       за заголовком, і перейменування відправило б його в колонку
       кліків, де вже й так стоять inline_link_clicks. Тож кажемо
       прямо, як стовпчик підпишеться, щоб це не з'ясовувалось уже у
       файлі. */
    const odd = now && !(FBR_GUESS[key] || []).includes(now);
    return `<label class="fbr-row"><span>${fbrEsc(label)}${
        miss ? ' <b class="fbr-warn">not seen here</b>' : ''}</span>
      <select onchange="fbrSetConv('${key}', this.value)">
        ${opt('', 'auto: ' + (now || '—'), fbrMap[key])}
        ${evOpts(key).map(e => opt(e.type, e.type + '  (' + e.n + ')', fbrMap[key])).join('')}
        ${opt('-', '— do not export —', fbrMap[key])}
      </select></label>${odd ? `<p class="fbr-hint">In the file this column is still named
        <b>${fbrEsc(fbrHead(key, head, now))}</b> — that is the header the import reads to know
        which field the number belongs to.</p>` : ''}`;
  };

  /* Скільки прибрано — рахуємо по тому ж правилу, що й фільтр, і без
     огляду на вибране: число має відповідати на питання «чого я не
     бачу», а не на «скільком слотам це не підійшло». */
  const hiddenEv = (fbrEvents || []).filter(e => !fbrIsConv(e.type)).length;
  const evMore = (fbrEvents && fbrEvents.length && hiddenEv)
    ? `<p class="fbr-hint">${fbrAllEv
        ? `All ${fbrEvents.length} events are listed, engagement included.
           <button type="button" onclick="fbrEvFilter(true)">show conversions only</button>`
        : `${hiddenEv} engagement events hidden (likes, comments, post and page engagement,
           views, saves) — they are not conversions.
           <button type="button" onclick="fbrEvFilter(false)">show all ${fbrEvents.length}</button>`}</p>`
    : '';

  const noEvents = fbrEvents && !fbrEvents.length && !fbrErr
    ? `<p class="fbr-hint">Facebook reported no conversions at all in this cabinet over the last
       30 days. The columns still go into the file, with zeros — Form.html expects them.</p>` : '';

  return `<div class="fbr">
    <p class="fbr-head">Export report
      <button type="button" onclick="fbrToggle('${enc}')" title="Close">&times;</button></p>

    <label class="fbr-row"><span>Rows</span>
      <select onchange="fbrSetBd(this.value)">
        ${FBR_BREAKDOWNS.map(b => opt(b[0], b[1], fbrBd)).join('')}
      </select></label>

    ${FBR_CONV.map(evSel).join('')}
    ${evMore}
    ${noEvents}
    ${fbrErr ? `<p class="fbr-hint is-bad">${fbrErr}</p>` : ''}

    <button type="button" onclick="fbrRun('${enc}')" class="fbr-go"
      ${fbrBusy ? 'disabled' : ''}>${fbrBusy ? fbrEsc(fbrBusy) : 'Download CSV'}</button>
    <p class="fbr-hint">Period: <b>${fbrEsc(cabRangeLabel())}</b></p>
    ${fbrBd === 'country' ? `<p class="fbr-hint">Form.html takes geo from the <b>campaign
      name</b>, not from this column \u2014 so this split only multiplies rows. Pick it only if
      your campaign-name pattern has no <span class="font-mono">{geo}</span> in it.</p>` : ''}
    ${fbrBd ? `<p class="fbr-hint">Facebook gives geo and placement only in separate reports.
      Take one now and the other later if you need both \u2014 but <b>do not import both for the
      same days</b>: Form.html adds rows up, and the spend would count twice.</p>` : ''}
    <p id="fbr-msg" class="fbr-hint"${fbrMsg.tone ? ` style="color:${fbrMsg.tone}"` : ''}>${fbrMsg.html}</p>
  </div>`;
}

const fbrSay = (html, tone) => {
  fbrMsg = { html, tone: tone || 'var(--text-muted)' };
  const el = document.getElementById('fbr-msg');
  if (!el) return;
  el.innerHTML = html;
  el.style.color = fbrMsg.tone;
};

/* ── значення однієї клітинки ──

   Розбито надвоє навмисно. Переводи рядків ламають розбірник Form.html
   (він ріже файл по рядках ще до того, як побачить лапки), і тому це
   правило ЗНАЧЕННЯ, а не формату: воно має діяти й у превʼю, інакше на
   екрані було б одне, а у файлі інше — і превʼю перестало б щось
   означати. Лапки ж — суто CSV, у таблиці на екрані їм нема чого
   робити. */
const fbrText = v => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ');

function fbrCell(v) {
  const s = fbrText(v);
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* Яку подію беремо для цієї колонки. Порядок такий:
     вибрана руками > перша зі списку здогадок, яка є в кабінеті >
     перша здогадка як є.
   Останній випадок — це кабінет, у якому такої конверсії за 30 днів
   не було жодної. Колонка все одно потрібна (Form.html її чекає), а
   нулі в ній чесні: конверсій справді не було. Але сказати про це
   людині треба, тож fbrSeen нижче позначає такий випадок. */
function fbrPick(key) {
  const chosen = fbrMap[key];
  if (chosen === '-') return '';            // сказали не вивантажувати
  if (chosen) return chosen;                // вибрали руками
  const guess = FBR_GUESS[key] || [];
  const seen = (fbrEvents || []).map(e => e.type);
  return guess.find(t => seen.includes(t)) || guess[0] || '';
}

// Чи бачили цю подію в кабінеті за останні 30 днів.
const fbrSeen = type => !!type && (fbrEvents || []).some(e => e.type === type);

/* Скільки разів сталася подія. Facebook складає всі конверсії в один
   масив actions — беремо звідти ту, яку вибрали. */
function fbrAction(row, type) {
  if (!type) return null;
  const hit = (Array.isArray(row.actions) ? row.actions : [])
    .find(a => String(a && a.action_type) === type);
  return hit ? (Number(hit.value) || 0) : 0;
}

/* Те, що піде у файл, але ще не файл: заголовки, рядки й номери
   стовпчиків із числами. Одна функція на превʼю і на CSV навмисно —
   інакше на екрані рано чи пізно було б не те, що в файлі, і превʼю
   перестало б щось означати. */
function fbrTable(rows, cur, bd) {
  /* Валюта — у заголовку спенду. Form.html читає її саме звідти. */
  /* Номер кабінета, а не назва. Назва в дашборді своя, рукописна, і з
     фебешною збігається далеко не завжди — імпорт за нею не знаходив
     кабінет і заводив новий. Номер один і той самий скрізь.

     Адсета й показів тут немає навмисно: Form.html їх не читає, а
     кожен зайвий стовпчик — це ще одна нагода мапперу помилитись. */
  const head = ['Reporting starts', 'Reporting ends', 'Account ID',
                'Campaign name', 'Ad name',
                'Amount spent (' + (cur || 'USD') + ')', 'Link clicks'];
  const take = [r => r.date_start, r => r.date_stop, r => r.account_id,
                r => r.campaign_name, r => r.ad_name,
                r => r.spend,
                // inline_link_clicks — це «кліки по посиланню», те саме,
                // що у фебешному експорті. clicks там ширше: рахує будь-який
                // клік по оголошенню, і плутати їх не можна.
                r => (r.inline_link_clicks != null ? r.inline_link_clicks : r.clicks)];

  (FBR_BD_COLS[bd] || []).forEach(([key, label]) => {
    head.push(label);
    take.push(r => r[key]);
  });

  FBR_CONV.forEach(([key, , label]) => {
    const type = fbrPick(key);
    if (!type) return;   // сказали не вивантажувати
    head.push(fbrHead(key, label, type));
    take.push(r => fbrAction(r, type));
  });

  /* Числові стовпчики: гроші, кліки й конверсії. Решта — текст, і
     підбивати по ній підсумок нема сенсу. */
  const num = [5, 6].concat(head.map((_, i) => i).slice(7 + (FBR_BD_COLS[bd] || []).length));

  return { head, num, body: rows.map(r => take.map(f => fbrText(f(r)))) };
}

function fbrCsv(t) {
  const out = [t.head.map(fbrCell).join(',')];
  t.body.forEach(row => out.push(row.map(fbrCell).join(',')));
  // BOM — щоб Excel не з'їв кирилицю в назвах кампаній.
  return String.fromCharCode(0xFEFF) + out.join('\n');
}

function fbrDownload(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Скільки сторінок згодні забрати. Це не «стільки рядків буває», а
   стеля, за якою файл усе одно ніхто не відкриє. Упершись у неї, ми
   кажемо про це вголос і не видаємо обрізане за повне. */
const FBR_MAX_CALLS = 40;

/* А це окрема стеля — на очікування, і рахується вона окремо саме
   тому, що це інша біда. Сторінок може бути багато чесно; а от звіт,
   який Facebook будує п'яту хвилину, він не добудує й на двадцятій.
   Спільний лічильник дав би вічний цикл у браузері: кожне очікування
   поверталось би до того самого місця, і кнопка крутилась би доти,
   доки не закриють вкладку. */
const FBR_MAX_WAIT = 150;   // ≈ 5 хвилин по 2 секунди

/* ── превʼю ──

   Файл, який лягає в теку завантажень, подивитись уже ніколи: його
   відкривають один раз, в імпорті, і там будь-яка дивина виглядає як
   дивина імпорту, а не експорту. Тому спершу показуємо те саме, що
   піде у файл, на екрані — із підсумками, які можна звірити з Ads
   Manager, не виходячи з дашборда.

   Показуємо перші рядки, а не всі: тисяча рядків у вікні нікому не
   потрібна, а перевіряють однаково перші. Скільки їх усього — сказано
   поруч. */
const FBR_PREV_ROWS = 40;
let fbrPrev = null;

const fbrNum = v => {
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

window.fbrPrevClose = function () {
  fbrPrev = null;
  const el = document.getElementById('fbr-prev');
  if (el) el.remove();
};

window.fbrPrevSave = function () {
  if (!fbrPrev) return;
  fbrDownload(fbrPrev.csv, fbrPrev.name);
  fbrSay(fbrPrev.rows + ' row(s) saved as <span class="font-mono">' + fbrEsc(fbrPrev.name)
    + '</span><br>Import it in Form.html the same way you import the Facebook one.', 'var(--ok)');
  fbrPrevClose();
};

function fbrPaintPrev() {
  document.getElementById('fbr-prev')?.remove();
  if (!fbrPrev) return;
  const t = fbrPrev.table;
  const shown = t.body.slice(0, FBR_PREV_ROWS);

  // Підсумки рахуємо по ВСІХ рядках, не лише по показаних: звіряють
  // саме їх, і сума половини файлу не звірилась би ні з чим.
  const totals = t.head.map((_, i) => t.num.includes(i)
    ? t.body.reduce((a, r) => a + fbrNum(r[i]), 0) : null);
  const money = i => i === 5;

  const box = document.createElement('div');
  box.id = 'fbr-prev';
  box.innerHTML = `<div class="fbr-prev-card">
      <div class="fbr-prev-head">
        <div>
          <p class="fbr-prev-title">${fbrEsc(fbrPrev.name)}</p>
          <p class="fbr-prev-sub">${fbrPrev.rows} row(s) \u00b7 ${t.head.length} columns${
            fbrPrev.cut ? ' \u00b7 <b style="color:var(--warn)">cut off, the report was longer</b>' : ''
          }${fbrPrev.rows > shown.length ? ' \u00b7 showing the first ' + shown.length : ''}</p>
        </div>
        <button type="button" onclick="fbrPrevClose()" title="Close">&times;</button>
      </div>
      <div class="fbr-prev-scroll"><table class="fbr-prev-tbl">
        <thead><tr>${t.head.map((h, i) =>
          `<th class="${t.num.includes(i) ? 'ta-r' : ''}">${fbrEsc(h)}</th>`).join('')}</tr></thead>
        <tbody>${shown.map(r => '<tr>' + r.map((v, i) =>
          `<td class="${t.num.includes(i) ? 'ta-r' : ''}">${fbrEsc(v) || '<span class="fbr-prev-na">\u2014</span>'}</td>`
          ).join('') + '</tr>').join('')}</tbody>
        <tfoot><tr>${totals.map((v, i) => `<td class="${t.num.includes(i) ? 'ta-r' : ''}">${
          v == null ? (i ? '' : 'total') : (money(i) ? v.toFixed(2) : Math.round(v).toLocaleString('en-US'))
        }</td>`).join('')}</tr></tfoot>
      </table></div>
      <div class="fbr-prev-acts">
        <button type="button" onclick="fbrPrevClose()">Close</button>
        <button type="button" class="is-go" onclick="fbrPrevSave()">Download CSV</button>
      </div>
    </div>`;
  box.addEventListener('click', e => { if (e.target === box) fbrPrevClose(); });
  document.body.appendChild(box);
}

window.fbrRun = async function (idEnc) {
  if (fbrBusy) return;
  const id = decodeURIComponent(idEnc);
  const c = (cabAll || []).find(x => x.id === id);
  if (!c || !c.fb) return;
  const [since, until] = cabRangeDates();

  fbrBusy = 'Working…';
  cabRefresh();
  fbrSay('Asking Facebook to build the report…');

  try {
    const start = await fbrCall({ action: 'start', account_id: id,
                                  since, until, breakdown: fbrBd });
    const run = start.run_id;

    const rows = [];
    let after = '';
    let pages = 0;
    let waits = 0;
    let cut = false;

    for (;;) {
      if (pages >= FBR_MAX_CALLS) { cut = true; break; }
      const j = await fbrCall({ action: 'fetch', account_id: id, run_id: run, after });
      if (!j.ready) {
        if (++waits > FBR_MAX_WAIT) throw new Error(
          'Facebook is still building this report after '
          + Math.round(FBR_MAX_WAIT * 2 / 60) + ' minutes. Take a shorter period '
          + 'or a simpler breakdown — it usually goes through then.');
        fbrSay('Facebook is building it… ' + (Number(j.percent) || 0) + '%');
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      pages++;
      rows.push(...(j.rows || []));
      fbrSay('Got ' + rows.length + ' row(s)…');
      after = j.after || '';
      if (!after) break;
    }

    if (!rows.length) {
      fbrSay('Facebook returned nothing for ' + since + ' – ' + until
        + '. Either the cabinet did not run then, or the period is outside its history.',
        'var(--warn)');
      return;
    }

    const name = (c.fb.account_id || id) + '_' + since + '_' + until
      + (fbrBd ? '_' + fbrBd : '') + '.csv';
    const table = fbrTable(rows, c.fb.currency, fbrBd);
    fbrPrev = { table, csv: fbrCsv(table), name, rows: rows.length, cut };
    fbrSay(cut
      ? '<b>The report was longer than this</b> — what you see is cut off. '
        + 'A shorter period or a simpler breakdown brings all of it.'
      : '', cut ? 'var(--warn)' : '');
    fbrPaintPrev();
  } catch (e) {
    fbrSay(fbrWhy(e), 'var(--bad)');
  } finally {
    fbrBusy = '';
    cabRefresh();
  }
};
