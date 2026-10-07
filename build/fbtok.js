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

/* Браузер кабінета: спершу те, що записано, потім — другий шматок
   назви токена (агент_браузер_БМ). Записане завжди головніше: кабінет
   могли перенести, а назва токена лишилась старою. */
function fbBrowserOf(accId, tokenLabel) {
  const hit = fbIdKeys(accId).map(k => fbProfiles[k]).find(Boolean);
  if (hit) return hit;
  return String(tokenLabel || '').split('_')[1] || '';
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

/* ── ТЕМП СИНХРОНІЗАЦІЇ ──
   Розклад у базі стукає щопівгодини й нічого не знає про наші
   побажання; вирішує сама функція fb-sync, зчитуючи оце налаштування.
   Через це темп міняється тут, а не в SQL — і людині не потрібен
   доступ до бази, щоб уночі ходити рідше.

   Зсув часу пишемо разом із вікном: «ніч з 0 до 8» без нього
   означало б ніч по Гринвічу, тобто не ту, про яку думали. */
/* 15 хвилин удень — стільки ж, скільки стукає розклад. Темп задає не
   лише свіжість чисел: правила йдуть слідом за синхронізацією, тож це
   водночас і те, як швидко правило встигне зупинити оголошення. */
const FB_PACE_DEF = { day: 15, night: 60, from: 0, to: 8 };

window.fbPaceLoad = async function () {
  const dEl = document.getElementById('fb-pace-day');
  if (!dEl) return;
  let v = {};
  try {
    const raw = await getTeamSetting('fb_sync_pace');
    v = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
  } catch (e) { v = {}; }
  const pick = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val); };
  pick('fb-pace-day', v.day || FB_PACE_DEF.day);
  pick('fb-pace-night', v.night || FB_PACE_DEF.night);
  pick('fb-pace-from', v.from == null ? FB_PACE_DEF.from : v.from);
  pick('fb-pace-to', v.to == null ? FB_PACE_DEF.to : v.to);
  const tz = document.getElementById('fb-pace-tz');
  // Показуємо, за чиїм годинником міряється ніч: інакше «з 0 до 8»
  // читається як «десь із нуля до восьми», і виглядає, ніби воно бреше.
  if (tz) tz.textContent = 'your clock, UTC'
    + (-new Date().getTimezoneOffset() >= 0 ? '+' : '\u2212')
    + Math.abs(-new Date().getTimezoneOffset() / 60);
};

window.fbPaceSave = async function () {
  const num = (id, lo, hi, fb) => {
    const n = Number(document.getElementById(id)?.value);
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : fb;
  };
  const pace = {
    day:   num('fb-pace-day', 5, 1440, FB_PACE_DEF.day),
    night: num('fb-pace-night', 5, 1440, FB_PACE_DEF.night),
    from:  num('fb-pace-from', 0, 23, FB_PACE_DEF.from),
    to:    num('fb-pace-to', 0, 23, FB_PACE_DEF.to),
    tz:    -new Date().getTimezoneOffset()
  };
  await setTeamSetting('fb_sync_pace', JSON.stringify(pace));
  if (typeof setSaved === 'function') setSaved();
};

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
    .select('id,label,bm_id,bm_name,scopes,expires_at,accounts,status,status_note,checked_at,note,'
           + 'proxy_host,proxy_ip,proxy_note,proxy_checked_at')
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
      </div>
      ${fbProxyLine(r)}
      <div class="fb-acts">
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

/* ПРОКСІ — РЯДКОМ, А НЕ ЗНАЧКОМ.

   Значок сказав би «проксі є». Але питання не в цьому: вписаний рядок
   і трафік, що справді через нього пішов, — різні речі, і між ними
   буває тиждень. Тому показуємо host:port, адресу, з якої вийшов
   останній запит, і що сказала перевірка.

   Самого рядка проксі тут немає й бути не може: у ньому логін і
   пароль, тож база його зі сторінки не віддає взагалі (FB_TOKENS.sql).
   Видно лише host:port, у якому нема чим скористатись. */
function fbProxyLine(r) {
  if (!r.proxy_host) {
    return '<div class="fb-meta fb-proxy is-off">No proxy \u2014 this token reads Facebook '
         + 'from the server address, same as every other one</div>';
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
  const patch = raw
    ? { proxy: raw, proxy_host: host, proxy_ip: null, proxy_note: null, proxy_checked_at: null }
    : { proxy: null, proxy_host: null, proxy_ip: null, proxy_note: null, proxy_checked_at: null };
  const { error } = await sb.from('fb_tokens').update(patch).eq('id', id);
  if (error) {
    toast(/proxy/.test(error.message)
      ? 'No proxy columns yet \u2014 run the proxy block of FB_TOKENS.sql'
      : 'Could not save: ' + error.message, 'bad');
    return;
  }
  Object.assign(r, { proxy_host: patch.proxy_host, proxy_ip: null,
                     proxy_note: null, proxy_checked_at: null });
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
          : j.note));
  } catch (e) {
    tell('Proxy check', 'Could not reach the check function: ' + e.message
      + '\n\nDeploy it first:  supabase functions deploy fb-proxy');
  }
};

window.fbShow = function (id) {
  const r = fbRows.find(x => x.id === id);
  if (!r) return;
  const accs = Array.isArray(r.accounts) ? r.accounts : [];
  /* Стовпчики вирівнюємо пробілами під найдовше значення: вікно
     показує звичайний текст, і без вирівнювання три поля підряд
     читаються як одне речення. */
  const wId = Math.max(...accs.map(a => String(a.id || '').length), 2);
  const wBr = Math.max(...accs.map(a => fbBrowserOf(a.id, r.label).length), 7);
  const pad = (v, n) => String(v == null ? '' : v).padEnd(n);
  const line = a => pad(a.id, wId) + '  '
    + pad(fbBrowserOf(a.id, r.label) || '\u2014', wBr) + '  '
    + (a.name || '') + (a.status === 'active' ? '' : '  (inactive)');
  tell(r.label,
      `Permissions: ${(r.scopes || []).join(', ') || '—'}\n`
    + `Checked: ${r.checked_at ? new Date(r.checked_at).toLocaleString() : '—'}\n\n`
    + (accs.length
        ? 'Ad accounts:\n'
          + pad('ID', wId) + '  ' + pad('BROWSER', wBr) + '  NAME\n'
          + accs.map(line).join('\n')
          + '\n\nThe browser comes from Cabinets (or from the token name when it is '
          + 'not filled in there yet).'
        : 'No ad accounts visible.\n\nMost common cause: the system user has no Ad Accounts assigned in Business Settings → Add Assets.'));
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
  const out = document.getElementById('fb-add-status');
  const token = (tokEl.value || '').trim();
  const label = (labEl.value || '').trim();
  if (!token) return alert('Paste the token first');
  if (!label) return alert('Give it a name — in a month you will not remember whose BM this is');

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
      + (info.bm ? `BM: ${info.bm.name || ''} (${info.bm.id})` : '')
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
  if (error) return say('Could not save: ' + fbEsc(error.message), 'var(--bad)');

  // Чистимо поле одразу: токен не має лишатись у формі, яку хтось
  // побачить через плече.
  tokEl.value = ''; labEl.value = '';

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

    if (!j.tokens) { tell('No tokens to sync — add one in Settings first.', 'var(--warn)'); return j; }

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
      + (j.changed ? ` \u00b7 ${j.changed} changed state` : '')
      + (j.took_ms ? ` \u00b7 ${(j.took_ms / 1000).toFixed(1)}s` : '');

    const warn = [];
    if (j.failed) warn.push(`${j.failed} came back incomplete`);
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
    /* Кладемо причину туди, де видно НАСЛІДОК. У дереві кампаній
       людина бачить «немає доменів» і не має звідки дізнатись чому. */
    if (typeof setTeamSetting === 'function' && j.domains)
      setTeamSetting('fb_link_note', j.domains === 'ok' ? '' : String(j.domains))
        .catch(() => {});   // лічильник причин не привід завалити синхронізацію
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
