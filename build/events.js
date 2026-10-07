/* ═══════════ ЖУРНАЛ ЗМІН КАБІНЕТІВ ═══════════
   Стан кабінета вже рахується з даних (cabStateOf). Тут ми лише
   запамʼятовуємо, коли він змінився, — щоб «кабінет забанився» не
   треба було помічати самому.

   Таблиця:
     account_events(id, team_name, account_id, at, kind,
                    from_state, to_state, note, source)

   `at` навмисно НЕ надсилаємо з браузера: нехай його ставить база
   (default now()). Годинник на компʼютері буває збитий, а події
   різних людей мусять лежати в одній шкалі часу.

   Якщо таблиці немає або RLS не пускає — evOn стає false, і вся ця
   надбудова тихо вимикається до перезавантаження сторінки. Дашборд
   мусить працювати й без неї. */

const EV_TABLE = 'account_events';
// Скільки подій тягнемо. Перший рядок по кабінету в цьому списку — його
// останній відомий стан, тож ліміт має бути з великим запасом: одна
// подія на реальну зміну, кілька сотень на місяць у великому парку.
const EV_LIMIT = 4000;
// Перший візит без позначки «бачив» не мусить вивалювати піврічну історію.
const EV_FIRST_WINDOW = 7 * 86400000;

// evOn: null — ще не пробували, true — працює, false — вимкнено до перезавантаження
let evRows = [], evOn = null, evTeam = '', evErr = '', evSyncing = false;
// Гачок перемальовки стоїть у loadData у двох місцях, та й дані можна
// перезавантажити руками. Звірятись частіше, ніж раз на хвилину, нема
// сенсу: між двома викликами поспіль стан кабінета не зміниться.
let evSyncAt = 0;
const EV_MIN_GAP = 60000;

const EV_TONE = {
  banned:  { rank: 3, tone: 'text-red-400',    word: 'banned' },
  issue:   { rank: 2, tone: 'text-amber-400',  word: 'has an issue' },
  /* Стану silent більше немає — його прибрали з кабінетів (див.
     CAB_STATE). Рядок лишається, щоб СТАРІ записи в стрічці читались
     як раніше: у базі вони вже лежать, і без цього перекладу вони
     показувались би як «never ran», тобто брехали б про минуле. */
  silent:  { rank: 1, tone: 'text-amber-400',  word: 'went quiet' },
  archived: { rank: 0, tone: 'text-muted-dynamic', word: 'was archived' },
  running: { rank: 0, tone: 'text-emerald-400', word: 'is running' },
  idle:    { rank: 0, tone: 'text-muted-dynamic', word: 'never ran' },
  /* Не стан, а дія: хтось зупинив кампанії руками. Рангу не даємо —
     це не те, що «вимагає уваги», а те, що вже зроблено свідомо. */
  paused:  { rank: 0, tone: 'text-violet-300', word: 'was stopped' }
};

const evRank = s => (EV_TONE[s] || EV_TONE.idle).rank;

function evAgo(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!(ms >= 0)) return '';
  const m = Math.floor(ms / 60000);
  if (m < 60) return (m || 1) + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

/* ── читання ── */

async function evLoad() {
  if (evOn === false) return [];
  const { data, error } = await sb.from(EV_TABLE).select('*')
    .eq('team_name', currentTeam)
    .order('at', { ascending: false })
    .limit(EV_LIMIT);
  if (error) {
    evOn = false; evErr = error.message;
    console.warn('account_events:', error.message);
    return [];
  }
  evOn = true; evErr = ''; evTeam = currentTeam; evRows = data || [];
  return evRows;
}

// Останній відомий стан по кожному кабінету. evRows уже відсортовані
// за часом спадно, тож перший зустрінутий рядок і є останнім.
/* Останній ВІДОМИЙ СТАН кожного кабінета.

   Рахуємо лише kind='state'. Ручну зміну статусу сюди свідомо пускаємо
   — вона теж стан, і наступна звірка через це не пише дубль. А от
   зупинка кампаній (kind='pause') — це дія, а не стан: якби вона сюди
   потрапляла, звірка одразу побачила б розбіжність і дописала зайву
   подію поверх. */
function evLastStates() {
  const m = {};
  evRows.forEach(e => {
    if (e.kind && e.kind !== 'state') return;
    const id = String(e.account_id || '');
    if (id && !(id in m)) m[id] = e.to_state;
  });
  return m;
}

/* ── запис ── */

/* cards: [{ id, state, hold }]. hold — «ще рано судити», такі кабінети
   просто пропускаємо: ні запису, ні втрати попереднього стану.

   Кабінет, якого ще немає в журналі, отримує рядок source='seed'. Це не
   подія, а точка відліку: інакше перший же захід намалював би банер із
   усім парком одразу. Сіється все, включно з idle, — щоб наступний
   «запустився» вже був справжнім переходом, а не ще одним seed. */
async function evSync(cards) {
  if (evOn === false || evSyncing) return;
  evSyncing = true;
  try {
    if (evOn === null || evTeam !== currentTeam) await evLoad();
    if (evOn === false) return;
    const last = evLastStates();
    const add = [];
    cards.forEach(c => {
      if (c.hold) return;
      const prev = last[c.id];
      if (prev === c.state) return;
      add.push({ team_name: currentTeam, account_id: c.id, kind: 'state',
                 from_state: prev || null, to_state: c.state,
                 source: prev ? 'auto' : 'seed' });
    });
    if (!add.length) return;
    const { data, error } = await sb.from(EV_TABLE).insert(add).select();
    if (error) {
      evOn = false; evErr = error.message;
      console.warn('account_events insert:', error.message);
      return;
    }
    // Свіже — на початок: evRows тримаємо відсортованими за спаданням часу.
    evRows = (data || []).concat(evRows);
  } finally { evSyncing = false; }
}

// Ручна зміна статусу — така сама подія, просто з іншим джерелом.
// Окремого kind їй не даємо навмисно: тоді evLastStates() бачив би її
// нарівні з автоматичними, і наступна синхронізація не писала б дубль.
async function evLog(accountId, from, to, note, source) {
  if (evOn === false || !accountId || from === to) return;
  const rec = { team_name: currentTeam, account_id: String(accountId), kind: 'state',
                from_state: from || null, to_state: to, source: source || 'manual' };
  if (note) rec.note = note;
  const { data, error } = await sb.from(EV_TABLE).insert([rec]).select();
  if (error) { evOn = false; evErr = error.message; return; }
  evRows = (data || []).concat(evRows);
  evPaint();
}

/* ── синхронізація після завантаження даних ── */

async function evBoot() {
  if (evOn === false || evSyncing) return;
  if (typeof rawData === 'undefined' || !rawData || !rawData.length) return;
  if (typeof cabFacts !== 'function') return;
  if (evTeam === currentTeam && Date.now() - evSyncAt < EV_MIN_GAP) return;
  evSyncAt = Date.now();

  let rows = [];
  try {
    /* ЖУРНАЛ МУСИТЬ СУДИТИ З ТОГО Ж, ЩО Й ЕКРАН.

       Тут стояв лише accRows — окремий кеш вікна Accounts. Кнопка
       Archive пише в базу і в cabRows, а в accRows не пише ніхто. Далі
       звірка брала застарілий рядок, рахувала з нього «banned», бачила,
       що востаннє записано «archived», — і дописувала перехід
       archived → banned. Кожні шістдесят секунд, без жодної дії
       людини, і в журналі це виглядало як справжня зміна статусу.

       Сам кабінет у базі при цьому лишався в архіві. Брехав журнал —
       але читають саме його. */
    if (typeof cabLoaded !== 'undefined' && cabLoaded
        && typeof cabRows !== 'undefined' && cabRows.length) {
      rows = cabRows;
    } else if (accTeam === currentTeam && accRows.length) {
      rows = accRows;
    } else {
      rows = await sbFetchAll('accounts_mapping',
        q => q.eq('team_name', currentTeam).order('account_id', { ascending: true }));
      // Той самий кеш, що й у вікні Accounts: воно відкриється миттєво
      // вже з першого разу, а не після власного запиту.
      accRows = rows; accTeam = currentTeam;
      accHasStatusCol = !rows.length || 'status' in rows[0];
    }
  } catch (e) { return; }

  const f = cabFacts();
  // Набір архівних будує сторінка кабінетів; журнал може прокинутись
  // раніше за неї, і тоді архів був би йому невидимий.
  if (typeof cabArchBuild === 'function') cabArchBuild();
  const cards = rows.map(r => {
    const id = String(r.account_id || '').trim();
    /* І з ТИМ САМИМ fb, що й таблиця. Без нього звірка не бачить ні
       втраченого токена, ні бана з Facebook — тобто рахує інший стан,
       ніж показано на екрані, і різниця між ними осідає в журналі
       вигаданими переходами. */
    const fb = typeof cabFbFor === 'function' ? cabFbFor(r) : null;
    const state = cabStateOf(r, f, fb);
    /* hold лишається в підписі, бо evSync його читає, — але тримати
       більше нічого: єдиний стан, який ми притримували на день-два,
       щоб не писати в стрічку щовечірнє «затих і ожив», був silent, а
       його більше немає. */
    return { id, state, hold: false };
  }).filter(c => c.id);

  await evSync(cards);
  evPaint();
}

/* ── «що змінилось, поки тебе не було» ── */

function evSeenKey() { return 'ev_seen_' + (currentTeam || ''); }
function evSeen() {
  try { return localStorage.getItem(evSeenKey()) || ''; } catch (e) { return ''; }
}

function evNew() {
  if (!evRows.length) return [];
  const seen = evSeen() || new Date(Date.now() - EV_FIRST_WINDOW).toISOString();
  return evRows.filter(e => e.source !== 'seed' && String(e.at || '') > seen);
}

function evDismiss() {
  try { localStorage.setItem(evSeenKey(), new Date().toISOString()); } catch (e) {}
  evPaint();
}

function evGoCabinets() { evDismiss(); navGo('cabinets'); }

function evPaint() {
  const news = evNew().slice().sort((a, b) =>
    evRank(b.to_state) - evRank(a.to_state) || String(b.at).localeCompare(String(a.at)));

  const badge = document.getElementById('cab-badge');
  if (badge) {
    badge.textContent = news.length ? String(news.length) : '';
    badge.className = 'sb-badge' + (news.some(e => evRank(e.to_state) >= 2) ? ' is-alert' : '');
    badge.style.display = news.length ? '' : 'none';
  }

  const box = document.getElementById('ev-banner');
  if (!box) return;
  if (!news.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }

  const bad = news.filter(e => evRank(e.to_state) >= 2).length;
  const SHOW = 5;
  const head = bad
    ? `${bad} cabinet${bad > 1 ? 's' : ''} need${bad > 1 ? '' : 's'} attention`
    : `${news.length} change${news.length > 1 ? 's' : ''} since your last visit`;

  box.innerHTML = `<div class="ev-bar ${bad ? 'is-bad' : ''}">
    <div class="ev-bar-main">
      <p class="ev-bar-head">${head}</p>
      <div class="ev-bar-list">
        ${news.slice(0, SHOW).map(e => `<span class="ev-chip">
            <b>${evEsc(e.account_id)}</b>
            <span class="${(EV_TONE[e.to_state] || EV_TONE.idle).tone}">${(EV_TONE[e.to_state] || EV_TONE.idle).word}</span>
            <i>${evAgo(e.at)}</i></span>`).join('')}
        ${news.length > SHOW ? `<span class="ev-chip ev-more">+${news.length - SHOW} more</span>` : ''}
      </div>
    </div>
    <div class="ev-bar-act">
      <button onclick="evGoCabinets()" class="ev-btn">Open Cabinets</button>
      <button onclick="evDismiss()" class="ev-x" title="Mark as seen">&times;</button>
    </div>
  </div>`;
  box.classList.remove('hidden');
}

const evEsc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── історія на сторінці кабінетів ── */

// Один рядок історії. Дублі гасимо тут, а не в базі: дві вкладки,
// відкриті одночасно, запишуть той самий перехід двічі, і окрема
// міграція з унікальним індексом заради цього не варта того.
function evKey(e) { return e.account_id + '|' + e.to_state + '|' + String(e.at || '').slice(0, 10); }

function evDedup(list) {
  const seen = {};
  return list.filter(e => (seen[evKey(e)] ? false : (seen[evKey(e)] = 1)));
}

function evLine(e, withId) {
  const T = EV_TONE[e.to_state] || EV_TONE.idle;
  const from = e.from_state ? `${e.from_state} &rarr; ` : '';
  return `<div class="ev-row">
    <span class="ev-dot ${T.tone}">&bull;</span>
    ${withId ? `<span class="ev-row-id">${evEsc(e.account_id)}</span>` : ''}
    <span class="ev-row-txt"><span class="ev-dim">${from}</span><span class="${T.tone}">${evEsc(e.to_state)}</span></span>
    ${e.source === 'manual' ? '<span class="ev-tag">by hand</span>' : ''}
    ${e.note ? `<span class="ev-tag">${evEsc(e.note)}</span>` : ''}
    <span class="ev-row-at" title="${evEsc(e.at)}">${evAgo(e.at)}</span>
  </div>`;
}

// Історія одного кабінета — у бічну панель.
function evForAccount(id, max) {
  if (evOn === false) return '';
  const list = evDedup(evRows.filter(e => e.account_id === id && e.source !== 'seed')).slice(0, max || 6);
  if (!list.length) return '';
  return `<div class="ev-panel">
    <p class="ev-panel-head">History</p>
    ${list.map(e => evLine(e, false)).join('')}
  </div>`;
}


// Спільна стрічка по всьому парку. Згорнута за замовчуванням: це довідка,
// а не те, заради чого відкривають сторінку.
/* ── що змінилось, поки тебе не було ──

   Раніше це був згорнутий блок «Recent changes» угорі сторінки. Він
   займав місце постійно, а читали його один раз — і далі гортали повз,
   бо в згорнутому вигляді він однаково нічого не каже.

   Тепер — тости: зайшов, побачив, воно зникло саме. Історія від цього
   не губиться, вона лишається там, де за нею приходять свідомо: у
   панелі конкретного кабінета (evForAccount).

   Тости показуємо ОДИН раз на завантаження сторінки. evFeedPaint
   смикається з кожної перемальовки таблиці, і без цієї засувки кожен
   клік по фільтру викидав би ту саму пачку заново. */
const evShown = {};

function evFeedPaint() {
  const box = document.getElementById('cab-feed');
  if (box) box.innerHTML = '';

  if (evOn === false) {
    // Журнал не працює — сказати про це треба, але теж один раз.
    if (!evShown._off) {
      evShown._off = 1;
      if (typeof toast === 'function')
        toast('History is off: ' + (evErr || 'account_events is not reachable'), 'warn', 6000);
    }
    return;
  }
  if (typeof toast !== 'function') return;

  // Спершу найгірше: саме через нього сюди й заходять.
  const news = evDedup(evNew()).sort((a2, b2) =>
    evRank(b2.to_state) - evRank(a2.to_state) || String(b2.at).localeCompare(String(a2.at)));
  const fresh = news.filter(e => !evShown[evKey(e)]);
  if (!fresh.length) return;

  /* Три, а не чотири. Тостів на екрані вміщається чотири, і четвертим
     іде підсумок «…і ще N» — інакше він витісняв би найперший, тобто
     рівно той, що найгірший і стоїть угорі. Перевірка це й показала. */
  const SHOW = 3;
  fresh.forEach(e => evShown[evKey(e)] = 1);
  fresh.slice(0, SHOW).forEach(e => {
    const T = EV_TONE[e.to_state] || EV_TONE.idle;
    const kind = evRank(e.to_state) >= 2 ? 'error' : evRank(e.to_state) >= 1 ? 'warn' : 'ok';
    toast(e.account_id + ' — ' + T.word + (e.note ? ' · ' + e.note : ''),
      kind, kind === 'ok' ? 4000 : 9000);
  });
  if (fresh.length > SHOW)
    toast('…and ' + (fresh.length - SHOW) + ' more change(s). Open a cabinet to see its history.', '', 9000);
}

window.evBoot = evBoot;
window.evPaint = evPaint;
window.evDismiss = evDismiss;
window.evGoCabinets = evGoCabinets;
