/* ═══════════ ТОКЕНИ FACEBOOK ═══════════
   Місце, де живуть токени системних користувачів: із підписом, чий це
   БМ і які кабінети він бачить.

   ПРО БЕЗПЕКУ, бо вона тут не декоративна. Дашборд — статичний сайт,
   і все, що він уміє прочитати, читається будь-ким, хто відкриє
   сторінку й зазирне в консоль. Тому в fb_tokens права на стовпчик
   token забрано в усіх: записати можна, прочитати назад — ні, включно
   з власником. Дістане його лише Edge Function від сервісної ролі,
   коли ходитиме в Marketing API.

   Через це список показує все, КРІМ самого секрету, і «показати
   токен» тут не буде ніколи — не тому, що я забув, а тому, що база
   його не віддасть.

   ПЕРЕВІРКА в мить додавання, просто звідси: токен щойно вписали, він
   у руках, тож питаємо Graph API самі. Зберігаємо його ВІДПОВІДЬ —
   права, строк, список кабінетів. Через місяць це єдиний спосіб
   згадати, чому токен не бачить половини кабінетів. Окрема функція
   для цього не потрібна: запит іде з твого браузера з твоїм же
   токеном, нікуди більше він при цьому не потрапляє. */

/* ── підвкладки розділу «Інтеграції» ──
   Живуть тут, а не у віджетах, бо єдиний їхній споживач — цей розділ,
   і саме токени змусили його розділити. */
const ISUB = ['fb', 'tg', 'drive'];

window.setSubTab = function (which) {
  if (!ISUB.includes(which)) which = ISUB[0];
  try { localStorage.setItem('set_isub', which); } catch (e) {}
  ISUB.forEach(k => {
    document.getElementById('isub-pane-' + k)?.classList.toggle('sub-off', k !== which);
    document.getElementById('isub-' + k)?.classList.toggle('is-on', k === which);
  });
};

window.setSubTabInit = function () {
  let saved = 'fb';
  try { saved = localStorage.getItem('set_isub') || 'fb'; } catch (e) {}
  setSubTab(saved);
};

const FB_API = 'https://graph.facebook.com/v21.0';
/* Обов'язкове рівно одне: ads_read. Ним читається і сама статистика, і
   edge /insights рекламного кабінета — окремого дозволу для цього не
   існує.

   read_insights тут НЕ потрібен, хоч назва й підказує протилежне: він
   про інсайти Сторінок і застосунків, до реклами стосунку не має, і в
   списку дозволів системного користувача його зазвичай навіть не
   пропонують. Спершу я вписав його в обов'язкові — і цим позначав би
   жовтим «бракує прав» кожен цілком робочий токен. */
const FB_NEED = ['ads_read'];
const FB_NICE = ['ads_management', 'business_management'];

let fbRows = [];

/* ЧИЙ ЦЕ БРАУЗЕР — ПОРЯД ІЗ КАБІНЕТОМ, А НЕ В ІНШІЙ ВКЛАДЦІ.

   У вікні Accounts було видно лише id, назву і стан. А питання, яке
   виникає над цим списком найчастіше, — «де мені його відкривати».
   Відповідь лежала у Cabinets, тобто за два переходи звідси.

   Беремо з accounts_mapping.profile: це те саме поле, що заповнюється
   само з назви токена і правиться руками в Cabinets та Form. Другого
   джерела тут не заводимо — інакше вони б розійшлись, і жодному не
   можна було б вірити.

   Ключ і як написано, і самими цифрами: Facebook каже act_123…, а в
   таблиці лежить 123… (або навпаки). */
let fbProfiles = {};

const fbIdKeys = (v) => {
  const s2 = String(v == null ? '' : v).trim();
  if (!s2) return [];
  const d = s2.replace(/\D/g, '');
  return d && d !== s2 ? [s2, d] : [s2];
};

async function fbProfilesLoad() {
  fbProfiles = {};
  /* Колонки profile може ще не бути — тоді просто немає що показувати,
     і це не привід завалити список токенів. */
  let res = await sb.from('accounts_mapping').select('account_id,fb_account_id,profile');
  if (res.error) res = await sb.from('accounts_mapping').select('account_id,fb_account_id');
  if (res.error) return;
  (res.data || []).forEach(r => {
    const v = String(r.profile || '').trim();
    if (!v) return;
    fbIdKeys(r.account_id).forEach(k => fbProfiles[k] = v);
    fbIdKeys(r.fb_account_id).forEach(k => fbProfiles[k] = v);
  });
}

/* БРАУЗЕР — ТІЛЬКИ ТЕ, ЩО ВПИСАЛИ РУКОЮ.

   Доти, коли поле profile було порожнє, сюди підставлявся другий
   шматок назви токена (Агент_Браузер_БМ). Догадка виглядала в
   стовпчику точно так само, як записане значення, — а бути вона могла
   чим завгодно: назву токена пишуть як зручно, кабінет могли
   перенести на інший браузер, а токен лишився старим. Тобто вікно
   показувало те, чого ніхто не казав, і відрізнити це від правди було
   ніяк.

   Тепер порожнє лишається порожнім. Прочерк тут — не брак даних, а
   відповідь: у цього кабінета браузер не вписаний. */
function fbBrowserOf(accId) {
  return fbIdKeys(accId).map(k => fbProfiles[k]).find(Boolean) || '';
}

const fbEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── опитування Facebook ──
   Три запити: хто це, що вміє, які кабінети. Токен передаємо в тілі
   POST, а не в рядку запиту: адреси з токеном осідають у логах
   проксі, історії браузера й заголовку Referer. */
async function fbAsk(path, token, params) {
  const body = new URLSearchParams(Object.assign({ access_token: token }, params || {}));
  const res = await fetch(FB_API + path, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    // Graph приймає GET-запити методом POST, якщо попросити явно.
    body: body.toString() + '&method=GET'
  });
  const j = await res.json().catch(() => ({}));
  if (j && j.error) throw new Error(j.error.message || 'Graph API error');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return j;
}

async function fbInspect(token) {
  // debug_token каже про сам токен: права, строк, застосунок. Інші два
  // — що він реально бачить. Перше без другого нічого не гарантує:
  // права можуть бути, а кабінети системному юзеру не видані.
  const dbg = await fbAsk('/debug_token', token, { input_token: token });
  const d = (dbg && dbg.data) || {};
  const scopes = d.scopes || [];
  const expires = d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null;

  let accounts = [], bm = null;
  try {
    const a = await fbAsk('/me/adaccounts', token,
      { fields: 'id,name,account_status,business', limit: '200' });
    accounts = (a.data || []).map(x => ({
      id: x.id, name: x.name || '',
      status: x.account_status === 1 ? 'active' : 'inactive'
    }));
    const withBm = (a.data || []).find(x => x.business);
    if (withBm) bm = { id: withBm.business.id, name: withBm.business.name || '' };
  } catch (e) { /* кабінетів може не бути видно — це теж діагноз */ }

  const missing = FB_NEED.filter(s => !scopes.includes(s));
  /* Нуль кабінетів — теж не «ok». Формально з токеном усе гаразд, але
     зробити ним не можна нічого, і зелений кружечок на такому рядку
     прямо вводить в оману. */
  const status = !d.is_valid ? 'error'
    : (expires && Date.parse(expires) < Date.now()) ? 'expired'
    : missing.length ? 'no-scopes'
    : !accounts.length ? 'no-accounts'
    : 'ok';
  const note = status === 'error' ? 'Facebook says this token is not valid'
    : status === 'expired' ? 'Expired'
    : status === 'no-scopes' ? 'Missing permissions: ' + missing.join(', ')
    : status === 'no-accounts'
      ? 'Permissions are fine, but no ad account is visible — check Add Assets on the system user'
    : `Sees ${accounts.length} ad account(s)`;

  return { scopes, expires_at: expires, accounts, bm, app_id: d.app_id || null, status, note };
}

/* ТЕМПУ СИНХРОНІЗАЦІЇ ТУТ БІЛЬШЕ НЕМА.

   Кабінети оновлюються лише руками, тож «як часто ходити саме» —
   питання без адресата. Разом із налаштуванням пішли fbPaceLoad,
   fbPaceSave і fbPacePaint: поля, які ні на що не впливають, гірші за
   відсутні — їх крутять і чекають наслідків.

   Що лишилось замість них: Sync now на сторінці кабінетів і ↻ в рядку
   окремого кабінета. Межу тримає сама функція fb-sync: вхід за
   розкладом вона відхиляє. */

/* ── список ── */

const FB_TONE = { ok: 'var(--ok)', expired: 'var(--bad)', error: 'var(--bad)',
                  'no-scopes': 'var(--warn)', 'no-accounts': 'var(--warn)',
                  unknown: 'var(--text-muted)' };

window.fbLoad = async function () {
  const box = document.getElementById('fb-list');
  if (!box) return;
  // Навмисно перелічуємо поля: select('*') спробував би дістати token,
  // а на нього немає прав — і весь запит упав би цілком.
  const { data, error } = await sb.from('fb_tokens')
    /* team_name тут не для показу, а тому що саме він вирішує, під
       якою командою опиниться все, що принесе синк. Див. fbTeamLine. */
    .select('id,label,team_name,bm_id,bm_name,scopes,expires_at,accounts,status,status_note,'
           + 'checked_at,note,proxy_host,proxy_ip,proxy_note,proxy_on,proxy_checked_at')
    .order('created_at', { ascending: false });
  if (error) {
    box.innerHTML = /fb_tokens|does not exist|schema cache/i.test(error.message)
      ? '<p class="set-hint">Token storage does not exist yet — run FB_TOKENS.sql, then reload.</p>'
      : `<p class="set-hint">Could not read: ${fbEsc(error.message)}</p>`;
    return;
  }
  fbRows = data || [];
  // Підписи браузерів — одним запитом на весь список, а не на кожне вікно.
  await fbProfilesLoad();
  fbCount();
  // Фільтр з'являється не одразу: на трьох токенах він лише займає
  // місце, на двадцяти без нього не обійтись.
  document.getElementById('fb-filter-wrap')?.classList.toggle('hidden', fbRows.length < 6);
  if (!fbRows.length) { box.innerHTML = '<p class="set-hint">No tokens added yet.</p>'; return; }
  fbPaint();
};

function fbCount() {
  const el = document.getElementById('fb-count');
  if (!el) return;
  el.textContent = fbRows.length;
  el.classList.toggle('hidden', !fbRows.length);
}

/* ── МЕРТВІ ТОКЕНИ ЗГОРТАЄМО ──
   Токен, який Facebook уже не приймає, з парку не зникає: він
   лишається в списку назавжди й відтісняє робочі вниз. Але й видаляти
   його за людину не можна — у ньому лежить назва, за якою підписані
   агент, браузер і БМ у кабінетах.

   Тому: робочі зверху, мертві — за одним рядком «show». Не приховані,
   а згорнуті: клікнув і бачиш усе, разом із кнопкою Remove.
   Під пошуком не згортаємо нічого — шукають і мертвий так само. */
const FB_DEAD = ['error', 'expired'];
let fbShowDead = false;
window.fbToggleDead = function () { fbShowDead = !fbShowDead; fbPaint(); };

window.fbPaint = function () {
  const box = document.getElementById('fb-list');
  if (!box) return;
  const q = (document.getElementById('fb-filter')?.value || '').toLowerCase().trim();
  const shown = !q ? fbRows : fbRows.filter(r =>
    [r.label, r.bm_name, r.bm_id, r.status,
     ...(Array.isArray(r.accounts) ? r.accounts.map(a => a.id + ' ' + (a.name || '')) : [])]
      .some(v => String(v || '').toLowerCase().includes(q)));
  if (!shown.length) { box.innerHTML = '<p class="set-hint">Nothing matches that.</p>'; return; }

  const dead = q ? [] : shown.filter(r => FB_DEAD.includes(String(r.status)));
  const live = q ? shown : shown.filter(r => !FB_DEAD.includes(String(r.status)));
  const fold = !dead.length ? '' : `
    <button type="button" class="fb-fold" onclick="fbToggleDead()">
      ${fbShowDead ? '\u2212' : '+'} ${dead.length} token(s) Facebook no longer accepts${
        fbShowDead ? '' : ' \u2014 show'}</button>`;
  const rows = live.concat(fbShowDead ? dead : []);

  box.innerHTML = (live.length ? '' : '<p class="set-hint">All tokens here have lost access.</p>')
    + rows.map(r => {
    const accs = Array.isArray(r.accounts) ? r.accounts.length : 0;
    const exp = r.expires_at
      ? new Date(r.expires_at).toLocaleDateString()
      : 'never expires';
    return `<div class="fb-row ${FB_DEAD.includes(String(r.status)) ? 'is-dead' : ''}">
      <div class="fb-main">
        <span class="fb-dot" style="background:${FB_TONE[r.status] || FB_TONE.unknown}"></span>
        <span class="fb-label">${fbEsc(r.label)}</span>
        ${r.bm_name || r.bm_id
          ? `<span class="fb-bm">${fbEsc(r.bm_name || '')} ${r.bm_id ? '· ' + fbEsc(r.bm_id) : ''}</span>` : ''}
      </div>
      <div class="fb-meta">
        ${accs} ad account(s) · ${fbEsc(exp)}
        ${r.status_note ? ' · ' + fbEsc(r.status_note) : ''}
        ${fbAgo(r.checked_at)}
      </div>
      ${fbTeamLine(r)}
      ${fbProxyLine(r)}
      <div class="fb-acts">
        <button type="button" class="set-btn fb-chk" onclick="fbCheck(${r.id})"
          title="Спитати Facebook прямо зараз: чи приймає він цей токен і що він бачить">Check</button>
        <button type="button" class="set-btn" onclick="fbShow(${r.id})">Accounts</button>
        <button type="button" class="set-btn" onclick="fbRename(${r.id})">Rename</button>
        <button type="button" class="set-btn" onclick="fbProxySet(${r.id})">Proxy</button>
        ${r.proxy_host ? `<button type="button" class="set-btn"
            onclick="fbProxyTest(${r.id})">Check proxy</button>` : ''}
        <button type="button" class="set-btn" onclick="fbDrop(${r.id})">Remove</button>
      </div>
    </div>`;
  }).join('') + fold;
};

/* ═══════════ НАЗВУ КОМАНДИ НОСИТЬ ТОКЕН ═══════════

   fb_tokens.team_name ставиться ОДИН раз — коли токен зберігали, з
   тієї команди, яка була вибрана тоді. Далі fb-sync штампує цією
   назвою все, що пише: fb_accounts, fb_spend_daily, fb_ad_today,
   fb_cabinet_pages.

   Перейменував команду — токен лишився зі старою назвою. І виходить
   розрив, який ззовні виглядає як вада: рядок, заведений рукою, лягає
   під НОВОЮ назвою (сторінка пише currentTeam), а все, що приносить
   синк по тому ж кабінету — під СТАРОЮ. А кабінети сторінка ріже
   саме по команді, тож такий кабінет просто зникає з очей.

   Тому рядок тут зʼявляється лише коли назви РІЗНІ — і одразу з
   кнопкою. Показувати команду завжди означало б додати в кожен рядок
   слово, яке ні про що не питає. */
function fbTeamLine(r) {
  const mine = typeof currentTeam === 'string' ? currentTeam : '';
  const his = String(r.team_name || '');
  if (!his || !mine || his === mine) return '';
  return `<div class="fb-meta fb-teamwarn">⚠ This token files everything under
    <b>${fbEsc(his)}</b>, not <b>${fbEsc(mine)}</b> — the cabinets, spend and ads it
    brings land there, and this page hides them.
    <button type="button" class="set-btn" onclick="fbTeamMove(${r.id})"
      title="Writes the current team name onto the token and re-syncs just this token, so everything it brought gets the new name">Move to ${fbEsc(mine)}</button></div>`;
}

/* Перенести токен у поточну команду. Одна дія, бо для людини це одна
   річ — але робить вона дві: міняє підпис токена й одразу переганяє
   його синк. Без другої частини кабінети лишались би під старою
   назвою до наступного прогону, тобто «кнопка нічого не зробила».

   Переганяємо ТІЛЬКИ цей токен: цілий парк коштував би хвилини
   чекання за дію, яка стосується одного рядка. */
window.fbTeamMove = async function (id) {
  const r = fbRows.find(x => x.id === id);
  const mine = typeof currentTeam === 'string' ? currentTeam : '';
  if (!r || !mine) return;

  const go = await ask({
    title: 'Move this token to ' + mine + '?',
    ok: 'Move',
    body: 'It is filed under ' + String(r.team_name || '—') + ' now, so everything the '
        + 'sync brings with it — cabinets, today\u2019s ads, Pages, spend history — is '
        + 'written under that name, and this page only shows ' + mine + '.\n\n'
        + 'Moving it rewrites the label and re-syncs this one token, which re-stamps its '
        + 'cabinets and the last 30 days of spend.\n\n'
        + 'Spend older than that keeps the old name: for the whole history run '
        + 'TEAM_RENAME.sql.' });
  if (!go) return;

  const { error } = await sb.from('fb_tokens').update({ team_name: mine }).eq('id', id);
  if (error) { toast('Could not move: ' + error.message, 'error'); return; }
  await fbLoad();
  /* Перегін — тим самим шляхом, що й кнопка Sync now, тільки по
     одному токену: іншого способу перештампувати рядки зі сторінки
     немає, бо пише їх виключно fb-sync. */
  if (typeof fbSync === 'function') {
    const step = typeof toastStep === 'function' ? toastStep() : null;
    const say = (html, tone) => {
      if (step) step.say(html, tone === 'var(--bad)' ? 'error'
        : tone === 'var(--warn)' ? 'warn' : 'ok', true);
    };
    await fbSync(say, { token_id: id });
    if (step) step.done('Moved to ' + fbEsc(mine), 'ok', true);
  } else {
    toast('Moved to ' + mine + ' — press Sync now to re-stamp its cabinets', 'warn');
  }
  if (typeof cabRefresh === 'function') cabRefresh();
};

/* ПРОКСІ — РЯДКОМ, А НЕ ЗНАЧКОМ.

   Значок сказав би «проксі є». Але питання не в цьому: вписаний рядок
   і трафік, що справді через нього пішов, — різні речі, і між ними
   буває тиждень. Тому показуємо host:port, адресу, з якої вийшов
   останній запит, і що сказала перевірка.

   Самого рядка проксі тут немає й бути не може: у ньому логін і
   пароль, тож база його зі сторінки не віддає взагалі (FB_TOKENS.sql).
   Видно лише host:port, у якому нема чим скористатись. */
function fbProxyLine(r) {
  /* ЦЕЙ РЯДОК КАЗАВ НЕПРАВДУ, і це важливіше за все інше тут.

     Було: «No proxy — this token reads Facebook from the server
     address». Звідси випливає, що З проксі читає НЕ з адреси сервера.
     А через проксі зараз не ходить жодна функція за розкладом:
     fb-sync, fb-rules і решта б'ють у Graph напряму, і єдине місце,
     де проксі взагалі використовується, — оця перевірка.

     Тобто адреса одна й та сама що з проксі, що без. Поки це так,
     екран мусить казати саме це, а не натякати на протилежне. */
  if (!r.proxy_host) {
    return '<div class="fb-meta fb-proxy is-off">No proxy \u2014 reads Facebook '
         + 'from the server address</div>';
  }
  /* ВИМКНЕНО ПЕРЕВІРКОЮ. Окремий стан, а не просто жовтий: «не
     пройшло» і «не пройшло, і ми його вимкнули» — різні новини, і
     друга потребує від людини дії. */
  if (r.proxy_on === false) {
    const off = r.proxy_checked_at
      ? new Date(r.proxy_checked_at).toLocaleString(undefined, {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit' })
      : '';
    return `<div class="fb-meta fb-proxy is-dead">
        \u{1F310} ${fbEsc(r.proxy_host)} \u00b7 <b>turned off by the check</b>${
          off ? ' \u00b7 ' + fbEsc(off) : ''}
        ${r.proxy_note ? ' \u00b7 ' + fbEsc(r.proxy_note) : ''}
        <span class="fb-proxy-fix">The line is kept \u2014 fix the proxy and press
          <b>Check proxy</b>, it switches back on by itself.</span>
      </div>`;
  }
  /* Час — без секунд: рядок стоїть у списку токенів, і три зайві
     символи там коштують більше, ніж точність до секунди комусь
     колись знадобиться. */
  const when = r.proxy_checked_at
    ? new Date(r.proxy_checked_at).toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      })
    : 'not checked yet';
  const good = r.proxy_note === 'ok';
  /* «135.106.121.28:64207 → 135.106.121.28» — це одне й те саме двічі.
     Стрілка має сенс рівно тоді, коли Facebook побачив НЕ ту адресу,
     що вписана: тоді це новина. Коли ту саму — зайва половина рядка. */
  const hostOnly = String(r.proxy_host).split(':')[0];
  const other = r.proxy_ip && r.proxy_ip !== hostOnly && r.proxy_ip !== r.proxy_host;
  return `<div class="fb-meta fb-proxy ${good ? 'is-on' : 'is-warn'}">
      \u{1F310} ${fbEsc(r.proxy_host)}
      ${other ? ' \u2192 ' + fbEsc(r.proxy_ip) : ''}
      \u00b7 ${fbEsc(when)}
      ${r.proxy_note && !good ? ' \u00b7 ' + fbEsc(r.proxy_note) : ''}
    </div>`;
}

/* Назва — єдине в токені, що пишуть для себе, і єдине, що з часом
   перестає пасувати: БМ передали, кабінети переїхали, а підпис лишився
   старий. Перевипускати заради цього токен безглуздо. */
window.fbRename = async function (id) {
  const r = fbRows.find(x => x.id === id);
  if (!r) return;
  const name = await ask({ title: 'Rename this token', ok: 'Save',
    body: 'How you call it between yourselves. Facebook never sees this name.',
    input: { value: r.label || '', placeholder: 'BM Oleh \u00b7 UZ' } });
  if (name === false) return;
  const v = String(name).trim();
  if (!v) { toast('A token without a name is a token you will not recognise', 'warn'); return; }
  if (v === r.label) return;
  const { error } = await sb.from('fb_tokens').update({ label: v }).eq('id', id);
  if (error) { toast('Could not rename: ' + error.message, 'bad'); return; }
  r.label = v;
  fbPaint();
  toast('Renamed', 'ok');
};

/* ВПИСАТИ ПРОКСІ. Порожній рядок стирає — і це не те саме, що
   скасувати: стерти проксі треба вміти, інакше токен назавжди лишиться
   привʼязаним до адреси, яку в тебе вже забрали. */
window.fbProxySet = async function (id) {
  const r = fbRows.find(x => x.id === id);
  if (!r) return;
  const val = await ask({ title: 'Proxy for this token', ok: 'Save',
    body: 'Everything this token reads from Facebook will go through it.\n\n'
        + 'host:port, host:port:user:pass, or a full URL (http:// or socks5://).\n\n'
        + 'Leave it empty to remove the proxy. What you type is stored the way the '
        + 'token is: the page can never read it back \u2014 only the host is shown.',
    /* ВИДИМИМ, А НЕ ЗІРОЧКАМИ. Ховати введене має сенс там, де його
       набирають по памʼяті й помилку видно одразу по відмові. Рядок
       проксі копіюють із панелі постачальника, він довгий, і єдиний
       спосіб помітити зайвий пробіл чи обрізаний хвіст — побачити його.
       Від чужих очей зірочки тут усе одно не рятують: секрет уже лежить
       у буфері обміну. */
    input: { value: '', placeholder: '1.2.3.4:8000:user:pass' } });
  if (val === false) return;
  const raw = String(val).trim();
  /* host:port дістаємо тут-таки, щоб було що показати: сам рядок назад
     не прочитається ніколи, і без цього список мовчав би про те, що
     проксі взагалі вписаний. */
  const host = fbProxyHost(raw);
  if (raw && !host) {
    toast('Could not read that as a proxy \u2014 expected host:port, host:port:user:pass or a URL', 'warn');
    return;
  }
  /* proxy_on: true — новий рядок дістає чистий аркуш. Інакше проксі,
     вимкнений перевіркою місяць тому, лишався б вимкненим і після
     того, як його замінили на інший. */
  const patch = raw
    ? { proxy: raw, proxy_host: host, proxy_ip: null, proxy_note: null,
        proxy_on: true, proxy_checked_at: null }
    : { proxy: null, proxy_host: null, proxy_ip: null, proxy_note: null,
        proxy_on: true, proxy_checked_at: null };
  const { error } = await sb.from('fb_tokens').update(patch).eq('id', id);
  if (error) {
    toast(/proxy/.test(error.message)
      ? 'No proxy columns yet \u2014 run the proxy block of FB_TOKENS.sql'
      : 'Could not save: ' + error.message, 'bad');
    return;
  }
  Object.assign(r, { proxy_host: patch.proxy_host, proxy_ip: null,
                     proxy_note: null, proxy_on: true, proxy_checked_at: null });
  fbPaint();
  toast(raw ? 'Saved \u2014 now press Check proxy' : 'Proxy removed', 'ok');
};

// Той самий розбір, що й у функції fb-proxy: два формати постачальників
// і звичайний URL. Тут він потрібен рівно для показу.
function fbProxyHost(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^[a-z0-9]+:\/\//i.test(s)) {
    try { return new URL(s).host; } catch (e) { return ''; }
  }
  const p = s.split(':');
  if (p.length === 2) return s;
  if (p.length === 4) return p[0] + ':' + p[1];
  return '';
}

/* ПЕРЕВІРКА. Головне в її відповіді — дві адреси: з якої виходить
   прямо і з якої вийшло через проксі. Однакові означають, що запит
   пішов повз проксі, і все, заради чого він додавався, не сталось. */
window.fbProxyTest = async function (id) {
  const r = fbRows.find(x => x.id === id);
  if (!r) return;
  toast('Checking ' + (r.proxy_host || 'the proxy') + '\u2026', 'info');
  try {
    const { data: s } = await sb.auth.getSession();
    const res = await fetch(SUPABASE_URL + '/functions/v1/fb-proxy', {
      method: 'POST',
      headers: { 'content-type': 'application/json',
                 Authorization: 'Bearer ' + (s?.session?.access_token || '') },
      body: JSON.stringify({ token_id: id })
    });
    const j = await res.json().catch(() => ({}));
    if (j.error) {
      tell('Proxy check', j.error);
      return;
    }
    await fbLoad();
    tell(j.ok ? 'Proxy works' : 'Proxy did not work',
        'Token: ' + (j.label || '') + '\n'
      /* Чим саме спробували. Без цього рядка «не працює» не відрізнити
         від «ми спробували не так»: той самий проксі без логіна й за
         схемою http поводиться зовсім інакше, ніж socks5 із паролем. */
      + 'Proxy: ' + (j.host || '\u2014')
      + (j.tried ? ' \u00b7 tried as ' + j.tried : '')
      + ' \u00b7 ' + (j.with_login ? 'with login' : 'no login') + '\n\n'
      + 'Without it Facebook sees: ' + (j.direct_ip || 'could not tell') + '\n'
      + 'Through it Facebook sees: ' + (j.proxy_ip || 'could not tell') + '\n\n'
      + (j.note === 'ok'
          ? 'Both addresses differ and Facebook answered through the proxy \u2014 that is what we wanted.'
          : j.note)
      /* ЩО МИ З ЦИМ ЗРОБИЛИ — окремим рядком. Вимкнути проксі мовчки
         означало б, що людина побачить мітку через тиждень і не
         зрозуміє, звідки вона взялась. */
      + (j.proxy_on === false
          ? '\n\nTurned off for this token. The line you typed is kept \u2014 fix the '
            + 'proxy and press Check proxy again, it switches back on by itself.'
          : j.proxy_on === true && j.note === 'ok'
            ? '\n\nSwitched on for this token.'
            : ''));
  } catch (e) {
    tell('Proxy check', 'Could not reach the check function: ' + e.message
      + '\n\nDeploy it first:  supabase functions deploy fb-proxy');
  }
};

/* ═══════════ ВІКНО ACCOUNTS — ТІЛЬКИ РУЧНЕ ═══════════

   Тут не лишилось нічого, що міняється саме собою.

   Було три такі речі, і всі три приходили ззовні: позначка
   «(inactive)» біля кабінета — зі статусу, який віддав Facebook;
   рядки «Permissions» і «Checked» — зі стану токена, а його переписує
   КОЖЕН прогін синку. Через це список після синхронізації виглядав
   інакше, хоч людина його не чіпала, — і вікно, у яке заходять
   подивитись «що я сюди вписав», відповідало чимось іншим.

   Лишається те, що поставила рука: номер кабінета, назва, з якою його
   завели, і браузер із твого рядка в кабінетах. Сам список теж
   ручний: його пише збереження токена й кнопка Check, і більше ніхто.

   Стан токена нікуди не подівся — він у самому рядку списку, разом із
   кружечком, приміткою і «checked …». Там йому й місце: там на нього
   дивляться, коли питання саме про стан. */
window.fbShow = function (id) {
  const r = fbRows.find(x => x.id === id);
  if (!r) return;
  const accs = Array.isArray(r.accounts) ? r.accounts : [];
  /* Стовпчики вирівнюємо пробілами під найдовше значення: вікно
     показує звичайний текст, і без вирівнювання три поля підряд
     читаються як одне речення. */
  const wId = Math.max(...accs.map(a => String(a.id || '').length), 2);
  const wBr = Math.max(...accs.map(a => fbBrowserOf(a.id).length), 7);
  const pad = (v, n) => String(v == null ? '' : v).padEnd(n);
  const line = a => pad(a.id, wId) + '  '
    + pad(fbBrowserOf(a.id) || '\u2014', wBr) + '  '
    + (a.name || '');
  tell(r.label,
    (accs.length
      ? 'Ad accounts:\n'
        + pad('ID', wId) + '  ' + pad('BROWSER', wBr) + '  NAME\n'
        + accs.map(line).join('\n')
        + '\n\nNothing here updates on its own. The list is what the token saw when '
        + 'you last saved it or pressed Check; the browser is what you typed in for '
        + 'that cabinet, and a dash means it is not filled in there yet.'
      : 'No ad accounts visible.\n\nMost common cause: the system user has no Ad '
        + 'Accounts assigned in Business Settings \u2192 Add Assets.'));
};

window.fbDrop = async function (id) {
  const r = fbRows.find(x => x.id === id);
  if (!await ask({ title: 'Remove the token?', danger: true, ok: 'Remove',
    body: `Remove “${r ? r.label : id}”?\n\n`
      + 'This deletes the token from the database but does NOT revoke it at Facebook. '
      + 'If it could have leaked, revoke it there too: '
      + 'Business Settings → System Users → Revoke.' })) return;
  const { error } = await sb.from('fb_tokens').delete().eq('id', id);
  if (error) return alert('Could not remove: ' + error.message);
  fbLoad();
};

/* ── додавання ── */

window.fbAdd = async function () {
  const tokEl = document.getElementById('fb-token-input');
  const labEl = document.getElementById('fb-label-input');
  const pxEl  = document.getElementById('fb-proxy-input');
  const out = document.getElementById('fb-add-status');
  const token = (tokEl.value || '').trim();
  const label = (labEl.value || '').trim();
  if (!token) return alert('Paste the token first');
  if (!label) return alert('Give it a name — in a month you will not remember whose BM this is');

  /* ПРОКСІ — ТУТ-ТАКИ, І НЕОБОВʼЯЗКОВЕ.

     Доти воно вписувалось окремим кроком після збереження, і між цими
     кроками токен уже ходив у Facebook зі своєї адреси. Порожнє поле —
     повноцінна відповідь «без проксі», а не пропущений крок, тож
     мовчки воно нічого не ламає.

     А ось нечитабельний рядок зупиняє ДО звернення в Facebook: інакше
     токен збережеться, проксі — ні, і вийде рівно той стан, якого ми
     й позбуваємось. */
  const proxyRaw = pxEl ? (pxEl.value || '').trim() : '';
  const proxyHost = proxyRaw ? fbProxyHost(proxyRaw) : '';
  if (proxyRaw && !proxyHost) {
    return alert('Could not read that as a proxy — expected host:port, '
      + 'host:port:user:pass or a URL. Leave it empty if there is no proxy.');
  }

  const say = (t, tone) => { out.innerHTML = t; out.style.color = tone || 'var(--text-muted)'; };
  say('Asking Facebook…');

  let info;
  try { info = await fbInspect(token); }
  catch (e) {
    return say('Facebook refused: ' + fbEsc(e.message)
      + '<br><span class="opacity-60">Usually an expired token, or one cut short when copying.</span>',
      'var(--bad)');
  }

  // Показуємо, що знайшли, ДО збереження: краще побачити «0 кабінетів»
  // тут, ніж за тиждень, коли імпорт мовчки привезе порожнечу.
  const nice = FB_NICE.filter(s => !(info.scopes || []).includes(s));
  const warn = info.status !== 'ok'
    ? `\n\nStatus: ${info.note}`
    : nice.length ? `\n\nWill work, but without ${nice.join(', ')} the dashboard cannot pause campaigns.` : '';
  const ok = await ask({ title: 'Save this token?', ok: 'Save',
    body: `Permissions: ${(info.scopes || []).join(', ') || '—'}\n`
      + `Expires: ${info.expires_at ? new Date(info.expires_at).toLocaleString() : 'never'}\n`
      + `Ad accounts: ${info.accounts.length}\n`
      + (info.bm ? `BM: ${info.bm.name || ''} (${info.bm.id})\n` : '')
      /* Проксі називаємо в тому ж вікні: інакше «зберіг із проксі» і
         «зберіг без» виглядають однаково, а різниця між ними — те, з
         якої адреси токен піде в Facebook. */
      + `Proxy: ${proxyHost || 'none'}`
      + warn });
  if (!ok) return say('');

  const { data: u } = await sb.auth.getUser();
  const row = {
    created_by: u && u.user && u.user.id,
    team_name: currentTeam,
    label, token,
    bm_id: info.bm ? info.bm.id : null,
    bm_name: info.bm ? info.bm.name : null,
    scopes: info.scopes, expires_at: info.expires_at,
    accounts: info.accounts, app_id: info.app_id,
    status: info.status, status_note: info.note,
    /* Сам рядок проксі лягає поруч із токеном і так само не читається
       назад: у списку видно лише host. Перевірку (proxy_ip, note)
       лишаємо порожньою — її робить кнопка Check proxy, і вдавати
       перевірене до першого виклику не можна. */
    proxy: proxyRaw || null, proxy_host: proxyHost || null,
    /* checked_at НЕ СТАВИМО, і це важливо.

       fb-sync обходить токени за давністю перевірки
       (checked_at.asc.nullsfirst) — саме щоб хвіст списку не голодував.
       Поки тут стояло «зараз», щойно доданий токен опинявся в кінці
       черги, позаду всіх: не «перевірений щойно», а «найсвіжіше
       перевірений». Тобто рівно навпаки до задуму.

       Порожнє значення чесніше й за змістом: ми ще жодного разу не
       ходили по його кабінети — ми лише спитали Facebook, хто він. */
    checked_at: null
  };
  const { data: saved, error } = await sb.from('fb_tokens').insert([row]).select('id');
  if (error) {
    /* Стовпців проксі ще немає — це невиконана міграція, а не збій
       збереження, і сказати треба саме це: інакше людина піде
       перевіряти токен, з яким усе гаразд. */
    return say(/proxy/.test(error.message)
      ? 'No proxy columns yet — run the proxy block of FB_TOKENS.sql'
      : 'Could not save: ' + fbEsc(error.message), 'var(--bad)');
  }

  // Чистимо поле одразу: токен не має лишатись у формі, яку хтось
  // побачить через плече. Проксі — так само: у ньому логін і пароль.
  tokEl.value = ''; labEl.value = '';
  if (pxEl) pxEl.value = '';

  /* ЗБЕРЕГТИ ТОКЕН І ПОКАЗАТИ КАБІНЕТИ — РІЗНІ РЕЧІ, і через це
     зникали кабінети «без жодної помилки».

     У вікні збереження написано «Ad accounts: 12» — це відповідь
     Facebook просто зараз, вона лягає в fb_tokens.accounts. А сторінка
     Cabinets читає ЗОВСІМ ІНШУ таблицю, fb_accounts, і наповнює її
     тільки fb-sync. Тож людина бачила «12 кабінетів» у вікні, тиснула
     Save, не отримувала жодної помилки — і йшла в Cabinets, де порожньо,
     бо синхронізація до цього токена ще не дійшла.

     Тому запускаємо її одразу й саме для цього токена: один токен —
     це секунди, а не хвилина на весь парк. */
  const id = saved && saved[0] && saved[0].id;
  say('Saved. Nobody can read this token back — not even you. That is deliberate.', 'var(--ok)');
  if (!id) { fbLoad(); return; }
  const r = await fbSync(t => say('Saved \u00b7 ' + t), { token_id: id });
  /* fbSync сам пише підсумок через say. Додаємо лише те, чого він не
     знає: куди тепер дивитись і що сторінку треба перечитати. */
  if (r && r.accounts) {
    say(out.innerHTML + '<br><span class="opacity-60">The cabinets are in Cabinets now — '
      + 'reload that page if it is already open.</span>', 'var(--ok)');
  }
  fbLoad();
};


/* ═══════════ ЗАПУСТИТИ СИНХРОНІЗАЦІЮ ═══════════
   Сам похід у Marketing API зі сторінки неможливий: токен закритий
   навіть від власника, дістає його лише Edge Function від сервісної
   ролі. Тут — виклик цієї функції, і більше нічого.

   САМ СПИСОК КАБІНЕТІВ ЖИВЕ НЕ ТУТ. Він був тут рівно один реліз, і це
   було не те місце: дивитись на стан кабінетів ходять на вкладку
   Cabinets, а не в налаштування, куди заходять раз на місяць. У
   налаштуваннях лишились токени — тобто те, що тут справді
   налаштовують.

   Показувати результат функція не вміє й не мусить: хто покликав, той і
   каже, куди писати. Через це один і той самий виклик обслуговує і
   кнопку на Cabinets, і будь-що, що зʼявиться потім, — без другої копії
   запиту, яку довелось би чинити двічі. */

/* ЯКІ КАБІНЕТИ ОНОВИЛИСЬ — ПОІМЕННО.

   Підсумок казав «40 ad account(s) from 3 token(s)»: число, з якого не
   видно, чи твій кабінет серед тих сорока. А питають після Sync now
   саме це — особливо коли кабінет щойно додали або він щойно віджив.

   Порядок — по спенду вниз: з цього боку на парк і дивляться. Хто не
   вліз у перелік, порахований числом, а не промовчаний. Кабінет, який
   приїхав із помилкою, стоїть окремо й зі своїм знаком: «оновлено»
   про нього було б неправдою. */
const FB_CABS_SHOW = 12;

function fbCabMoney(v, cur) {
  const n = Number(v) || 0;
  if (!n) return '';
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur === 'USD' ? '$' + s : s + ' ' + (cur || '');
}

/* ХТО З ТОКЕНІВ ЗʼЇВ ЧАС. Показуємо, лише коли прогін справді довгий:
   у швидкому це зайвий рядок, а от у довгому це єдине місце, де видно,
   що винен один токен зі ста кабінетами, а не «все повільне».

   graph — скільки з того ми просто чекали на Facebook. Коли це майже
   весь час токена, прискорювати треба запити до Facebook; коли ні —
   шукати в себе. */
const FB_SLOW_AFTER_MS = 20_000;

function fbSlowList(j) {
  const slow = Array.isArray(j.slowest) ? j.slowest : [];
  if (!slow.length || !(Number(j.took_ms) >= FB_SLOW_AFTER_MS)) return '';
  const sec = v => (Number(v) || 0) / 1000;
  const rows = slow.slice(0, 3).filter(x => sec(x.ms) >= 1).map(x =>
    fbEsc(x.label) + ' ' + sec(x.ms).toFixed(1) + 's'
    + (x.accounts ? ' \u00b7 ' + x.accounts + ' cab' : '')
    + (x.graph_ms ? ' \u00b7 ' + Math.round(100 * x.graph_ms / Math.max(1, x.ms))
        + '% waiting on Facebook' : ''));
  if (!rows.length) return '';
  return '<br><span class="opacity-70">slowest: ' + rows.join('<br>') + '</span>';
}

function fbCabList(j) {
  const all = Array.isArray(j.cabs) ? j.cabs : [];
  if (!all.length) return '';
  const broke = all.filter(c => c.err);
  const fine = all.filter(c => !c.err);
  /* КОЖЕН КАБІНЕТ — СВОЇМ РЯДКОМ, із галочкою на початку. Коли вони
     йшли через крапку одним абзацом, знайти серед сорока свій можна
     було лише вчитуючись — а питання завжди одне й те саме: «мій
     підтягнуло чи ні». Галочка в нульовій колонці і є тим якорем, за
     який чіпляється око. */
  const one = c => '\u2713 ' + fbEsc(c.id)
    + (c.name ? ' \u00b7 ' + fbEsc(c.name) : '')
    + (fbCabMoney(c.spend, c.cur) ? ' \u00b7 ' + fbEsc(fbCabMoney(c.spend, c.cur)) : '');
  /* Загальну кількість беремо з cabs_total, а не з довжини переліку:
     функція свій перелік теж обрізає, і рахувати обрізане означало б
     сказати «60», коли їх триста. */
  const total = Number(j.cabs_total) || all.length;
  const shown = fine.slice(0, FB_CABS_SHOW);
  const hidden = total - shown.length - broke.length;
  return '<br><span class="fb-cabs">' + shown.map(one).join('<br>')
    + (hidden > 0 ? '<br><span class="opacity-60">\u2026and ' + hidden + ' more</span>' : '')
    + '</span>'
    + (broke.length
        ? '<br><span class="opacity-70">'
          + broke.slice(0, FB_CABS_SHOW).map(c => '\u00d7 ' + fbEsc(c.id)
              + (c.name ? ' \u00b7 ' + fbEsc(c.name) : '')
              + ' \u2014 came back incomplete').join('<br>')
          + (broke.length > FB_CABS_SHOW
              ? '<br>\u2026and ' + (broke.length - FB_CABS_SHOW) + ' more' : '')
          + '</span>'
        : '');
}


let fbSyncing = false;

/* Версія fb-sync, під яку зібрана ця сторінка. Підставляє build.py,
   читаючи її з коду самої функції. */
const FB_FN_WANT = '';

/* ЧИ ЖИВИЙ ТОКЕН — ОКРЕМОЮ КНОПКОЮ.

   Стан токена писав тільно Sync now: щоб дізнатись, що токен мертвий,
   треба було синхронізувати весь парк кабінетів — хвилину чекання і
   ліміт Facebook на кожен кабінет. А прогін має дедлайн, тож хвіст
   списку лишався з тим станом, який йому виставили тижні тому: у
   списку стояли зелені кружечки на кабінетах, яких давно немає.

   Перевірка питає два запити на токен і не чіпає нічого, крім
   діагностики самого токена. Кнопка є і в рядку (цей), і над списком
   (усі): «цей протух?» і «які з двадцяти ще живі?» — різні питання.

   ПІДСУМОК ГОВОРИТЬ ПРО ЗЛАМАНЕ. «Перевірено 20» не відповідає на те,
   заради чого натискали: потрібні імена тих, що не працюють. */
let fbChecking = false;

/* Коли перевіряли. Без цього зелений кружечок не відрізнити від
   зеленого кружечка тижневої давності — а це й була вся біда. */
function fbAgo(iso) {
  if (!iso) return ' · <b style="color:var(--warn)">never checked</b>';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
  const when = d > 0 ? d + 'd ago' : h > 0 ? h + 'h ago' : 'just now';
  // Тиждень без перевірки — це вже не «коли», а «невідомо»
  return ' · checked ' + (d >= 7 ? '<b style="color:var(--warn)">' + when + '</b>' : when);
}

window.fbCheck = async function (id) {
  if (fbChecking) return null;
  const box = document.getElementById('fb-check-status');
  const tell = (t, c) => { if (box) { box.innerHTML = t; box.style.color = c || ''; } };
  fbChecking = true;
  document.querySelectorAll('.fb-chk').forEach(b => { b.disabled = true; });
  tell(id ? 'Asking Facebook about this token\u2026' : 'Asking Facebook about every token\u2026');
  try {
    const { data: sess } = await sb.auth.getSession();
    const jwt = sess && sess.session && sess.session.access_token;
    if (!jwt) throw new Error('not signed in');
    const res = await fetch(SUPABASE_URL + '/functions/v1/fb-sync', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + jwt, 'apikey': SUPABASE_KEY,
                 'content-type': 'application/json' },
      body: JSON.stringify(id ? { check: true, token_id: id } : { check: true })
    });
    if (res.status === 404) throw Object.assign(new Error('not deployed'), { code: 'missing' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);

    /* СТАРА ФУНКЦІЯ ЦЬОГО РЕЖИМУ НЕ ЗНАЄ — і мовчки робить повний
       прогін. Тобто натиснув «Check», а воно пішло синхронізувати
       парк. Сказати про це треба прямо: інакше людина читає підсумок
       синку як відповідь на своє питання. */
    if (j.check !== true) {
      await fbLoad();
      tell('The deployed fb-sync is older than this page and does not know the check mode'
        + (j.fn ? ' (it says ' + fbEsc(j.fn) + ', the page expects ' + fbEsc(FB_FN_WANT) + ')' : '')
        + ' \u2014 it ran a full sync instead. Deploy it: '
        + '<span class="font-mono">supabase functions deploy fb-sync</span>', 'var(--warn)');
      return j;
    }

    await fbLoad();
    const list = Array.isArray(j.tokens) ? j.tokens : [];
    if (!list.length) { tell('Nothing to check.', 'var(--warn)'); return j; }
    const bad = list.filter(t => t.status !== 'ok');
    const tail = j.not_reached ? ' \u00b7 ' + j.not_reached + ' not reached yet, press Check again' : '';
    tell(bad.length
      ? '<b>' + bad.length + ' of ' + list.length + ' not working:</b> '
        + bad.map(t => fbEsc(t.label) + ' \u2014 ' + fbEsc(t.status)
            + (t.note ? ' (' + fbEsc(t.note) + ')' : '')).join('; ') + tail
      : 'All ' + list.length + ' token(s) work.' + tail,
      bad.length ? 'var(--bad)' : 'var(--ok)');
    return j;
  } catch (e) {
    tell((e.code === 'missing' || /failed to fetch|networkerror|load failed/i.test(e.message || ''))
      ? 'The fb-sync function did not answer \u2014 deploy it first: '
        + '<span class="font-mono">supabase functions deploy fb-sync</span>'
      : 'Could not check: ' + fbEsc(e.message), 'var(--bad)');
    return null;
  } finally {
    fbChecking = false;
    document.querySelectorAll('.fb-chk').forEach(b => { b.disabled = false; });
  }
};

window.fbSync = async function (say, body) {
  if (fbSyncing) return null;
  // Нікуди писати — і не пишемо. Виклик від цього не ламається.
  const tell = typeof say === 'function' ? say : () => {};
  /* body: { token_id } — синхронізувати лише один токен. Потрібно там,
     де щойно щось змінили в одному кабінеті: ганяти через це весь парк
     означало б чекати хвилину замість секунди. */
  const payload = JSON.stringify(body || {});
  fbSyncing = true;
  tell('Asking Facebook — this takes up to a minute…');

  try {
    const { data: sess } = await sb.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('not signed in');

    const res = await fetch(SUPABASE_URL + '/functions/v1/fb-sync', {
      method: 'POST',
      // apikey поруч із Authorization: шлюз Supabase очікує обидва.
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY,
                 'content-type': 'application/json' },
      body: payload
    });
    if (res.status === 404) throw Object.assign(new Error('not deployed'), { code: 'missing' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);

    // Стан токенів міг змінитись під час прогону — перечитуємо, якщо
    // список токенів зараз на екрані.
    if (typeof fbLoad === 'function') await fbLoad();

    /* «ДОДАЙ ТОКЕН» ТОМУ, У КОГО ЇХ ДЕСЯТЬ.

       Тут стояло просто `if (!j.tokens)`. А j.tokens — це не скільки
       токенів є, а скільки ПРОЙШЛО до кінця. Коли жоден не вдався,
       число теж нуль — і людині, у якої токени на місці, екран радив
       їх додати. Причина при цьому приїжджала в тій самій відповіді,
       полем problems, і мовчки викидалась разом із нею.

       Тепер питаємо два різні числа. Старіша fb-sync tokens_total не
       шле — тоді відповідь та сама, що й була, але хоч causes
       видно. */
    const total = j.tokens_total === undefined ? j.tokens : j.tokens_total;
    if (!total) {
      tell('No tokens to sync — add one in Settings first.', 'var(--warn)');
      return j;
    }
    if (!j.tokens) {
      /* Причину несе сама відповідь. Показати її тут — єдиний спосіб
         її взагалі побачити: у журнал вона не лягає. */
      const why = (j.problems || []).map(fbEsc);
      tell('<b>' + total + ' token(s), and not one of them got through.</b>'
        + (why.length ? '<br>' + why.join('<br>') : ' The function said nothing about why.')
        + (j.took_ms ? '<br><span class="opacity-60">' + (j.took_ms / 1000).toFixed(1)
           + 's spent before giving up</span>' : ''), 'var(--bad)');
      return j;
    }

    /* ПІДСУМОК — ПРО КАБІНЕТИ, А НЕ ПРО ВНУТРІШНЄ ЖИТТЯ ФУНКЦІЇ.

       Раніше все йшло одним рядком через крапки: кількість, стан
       історії витрат, що з доменами, що з Telegram, версія функції —
       підряд, однаковим шрифтом. Серед цього тонуло єдине, заради чого
       натискають Sync now: ЧИ ПІДТЯГНУЛО МІЙ КАБІНЕТ.

       Тепер зверху галочка й кабінети поіменно, а службове — нижче, і
       ТІЛЬКИ коли воно про негаразд. «spend history: 40 day(s)» і
       «telegram: nothing to report» означають «усе гаразд»: писати їх
       щоразу означає вчити не читати цей кут екрана. */
    const head = `\u2713 ${j.accounts} cabinet(s) from ${j.tokens} token(s)`
      /* АРХІВНІ ПРОГІН ОБХОДИТЬ — і сказати це треба тут, поруч із
         числом кабінетів. Інакше з екрана видно лише, що кабінетів у
         підсумку менше, ніж у списку, і це читається як збій. */
      + (j.archived_skipped ? ` \u00b7 ${j.archived_skipped} archived skipped` : '')
      + (j.changed ? ` \u00b7 ${j.changed} changed state` : '')
      + (j.took_ms ? ` \u00b7 ${(j.took_ms / 1000).toFixed(1)}s` : '');

    const warn = [];
    if (j.failed) warn.push(`${j.failed} came back incomplete`);
    /* ЧОМУ ДОВГО — З АДРЕСОЮ, а не відчуттям. Функція міряє час
       кожного токена й окремо той, що пішов у Facebook; доти ці числа
       приїжджали у відповіді й нікуди не потрапляли.

       Кажемо лише коли довго: під десять секунд це звичайний прогін,
       і рядок про найповільніших щоразу привчав би його не читати. */
    if (j.took_ms > 20000 && (j.slowest || []).length) {
      const top = j.slowest.slice(0, 3).map(x =>
        fbEsc(x.label) + ' ' + (x.ms / 1000).toFixed(1) + 's'
        + (x.accounts ? ' / ' + x.accounts + ' cab' : '')
        + (x.graph_ms ? ' (' + (x.graph_ms / 1000).toFixed(1) + 's in Facebook)' : ''));
      warn.push('slowest: ' + top.join(', '));
    }
    if (j.throttled) warn.push('hit the Facebook rate limit — the rest comes in with the next run');
    /* ДО КОГО ЧЕРГА НЕ ДІЙШЛА — ПОІМЕННО, а не «more left».

       Прогін виходить достроково на власному дедлайні або на ліміті
       Facebook, і хвіст списку лишається необійденим. Поки тут стояло
       саме лише «ran out of time», побачити, ЧИЇ числа застаріли, було
       ніде — а застарівали вони на тижні. */
    if (j.skipped_total) {
      const names = (j.skipped || []).map(fbEsc).join(', ');
      warn.push('did not get to ' + j.skipped_total + ' token(s)'
        + (names ? ': ' + names : '') + ' — the next run starts with them');
    } else if (j.more) warn.push('ran out of time, more left');
    /* Історія витрат — окрема таблиця з окремою долею: її може ще не
       бути. Мовчати про це не можна, бо саме на неї спирається вибір
       періоду на вкладці Cabinets. Але «40 day(s)» — це не новина. */
    if (j.history && !/^\d+ day\(s\)$/.test(String(j.history)))
      warn.push('spend history: ' + j.history);
    /* Чому в знімку немає доменів. Саме тут, поруч із рештою підсумків:
       у дереві кампаній видно тільки НАСЛІДОК — ока немає, — а причину
       знає лише відповідь функції. */
    if (j.domains && j.domains !== 'ok') warn.push('domains: ' + j.domains);
    /* Картинки креативів. «ok» означає, що колонки є й іконки будуть;
       інакше тут стоїть те, що треба виконати — інакше іконки просто
       не зʼявляться, а причини не буде видно ніде. */
    if (j.creatives && j.creatives !== 'ok') warn.push('creatives: ' + j.creatives);
    /* ПРАВИЛА ЙДУТЬ ЛАНЦЮГОМ ЗА СИНКОМ, і доти про це не було ні
       слова: відповідь несла рядок rules, а екран його не показував.
       Тобто «not configured: set RULES_CRON_SECRET for fb-sync too»
       щогодини лежало у відповіді, якої ніхто не читає, а на сторінці
       Rules це виглядало як «правила не працюють».

       Мовчимо лише про «ok: …» — там немає новини. */
    if (j.rules && !/^ok:/.test(String(j.rules)) && !/^skipped:/.test(String(j.rules)))
      warn.push('rules: ' + j.rules);
    /* Кладемо причину туди, де видно НАСЛІДОК. У дереві кампаній
       людина бачить «немає доменів» і не має звідки дізнатись чому. */
    if (typeof setTeamSetting === 'function' && j.domains)
      setTeamSetting('fb_link_note', j.domains === 'ok' ? '' : String(j.domains))
        .catch(() => {});   // лічильник причин не привід завалити синхронізацію
    /* ТЕ САМЕ ПРО КАРТИНКИ КРЕАТИВІВ. Наслідок видно в дереві
       (порожня рамка), а причину знає лише відповідь функції — і
       найчастіша з них та, яку зі сторінки не видно взагалі:
       задеплоєна версія старіша, тож картинок у знімку немає й бути не
       може. Кладемо туди, де видно наслідок. */
    if (typeof setTeamSetting === 'function') {
      const old = FB_FN_WANT && j.fn !== FB_FN_WANT;
      const picWhy = old
        ? 'the deployed fb-sync is ' + (j.fn ? j.fn : 'older than this page')
          + ', this page expects ' + FB_FN_WANT + ' — deploy it, then press Sync now'
        : (j.creatives && j.creatives !== 'ok') ? String(j.creatives) : '';
      setTeamSetting('fb_pic_note', picWhy).catch(() => {});
    }
    /* Telegram: кажемо, лише коли НЕ склалось. «nothing to report» і
       «N sent» означають, що все відпрацювало як задумано; «not
       configured» і «0 sent, 1 not linked» — ні, і ось їх і видно. */
    if (j.telegram && !/^nothing to report$|^\d+ sent$/.test(String(j.telegram)))
      warn.push('telegram: ' + j.telegram);

    const probs = j.problems || [];
    const SHOW = 3;
    /* Задеплоєна функція старша за сторінку. Сказати про це треба
       ПЕРШИМ рядком: інакше шукатимуть ваду в правці, якої на сервері
       ще немає. Порожній j.fn — теж старша, просто настільки, що вона
       ще не вміла називати себе. */
    if (FB_FN_WANT && j.fn !== FB_FN_WANT)
      probs.unshift('The deployed fb-sync is older than this page ('
        + (j.fn ? fbEsc(j.fn) : 'no version') + ' vs ' + fbEsc(FB_FN_WANT)
        + '). Run: supabase functions deploy fb-sync');
    /* Порядок рядків — за тим, як на них дивляться: спершу галочка й
       кабінети (заради цього й натискали), потім те, що пішло не так.
       Негаразди зі своїм знаком і приглушені — не тому, що неважливі, а
       щоб їх було видно саме як виняток, а не як частину звіту. */
    const dim = (mark, list, max) => !list.length ? ''
      : '<br><span class="opacity-70">'
        + list.slice(0, max).map(x => mark + ' ' + fbEsc(x)).join('<br>')
        + (list.length > max ? '<br>\u2026and ' + (list.length - max) + ' more' : '')
        + '</span>';

    /* Порядок: галочка, кабінети, негаразди, і аж потім — хто зʼїв час.
       Перелік найповільніших зʼявляється саме тоді, коли список
       кабінетів найдовший, і поставити його ВИЩЕ означало б відсунути
       вниз те, заради чого кнопку й натискали. */
    tell('<b>' + fbEsc(head) + '</b>'
      + fbCabList(j)
      + dim('\u26A0', warn, 4)
      + dim('\u00d7', probs, SHOW)
      + fbSlowList(j),
      j.throttled || j.failed || probs.length || warn.length ? 'var(--warn)' : 'var(--ok)');
    return j;
  } catch (e) {
    /* «Failed to fetch» означає рівно одне: браузер не зміг виконати
       запит. ЧОМУ — він не знає й не скаже, бо відповідь без
       CORS-заголовків для нього просто не існує. Тому причину не
       вигадуємо, а перелічуємо ті три, що виглядають однаково. */
    const net = /failed to fetch|networkerror|load failed/i.test(e.message || '');
    tell(e.code === 'missing' || net
      ? 'The fb-sync function did not answer. Either it is not deployed yet '
        + '(<span class="font-mono">supabase functions deploy fb-sync</span>), '
        + 'or it fails on start-up, or JWT verification is on for it.'
      : 'Facebook sync failed: ' + fbEsc(e.message), 'var(--bad)');
    return null;
  } finally {
    fbSyncing = false;
  }
};
