/* ═══════════ TELEGRAM ═══════════
   Тут живе тільки те, що можна безпечно тримати в статичному сайті.
   Токен бота — НІ: сторінку відкриває вся команда, і все, що в ній
   збережено, читається будь-ким. Токен лежить у секретах Supabase
   поруч із функцією, яка надсилає.

   Що робить ця частина: видає одноразовий код, яким баєр прив'язує
   свій Telegram до свого акаунта.

   ЧОМУ КОДОМ, А НЕ ПОШТОЮ. Напрошувалось простіше — бот питає пошту,
   людина відповідає. Але пошта не таємниця, це ім'я: хто завгодно
   вписав би чужу і читав би чужі сповіщення. Код видається лише тому,
   хто вже залогінений у дашборді, тобто вже довів, що він це він. */

const TG_EVENTS = ['ban', 'silent', 'nospend', 'daily'];
const TG_CODE_MIN = 15;           // скільки хвилин живе код

async function loadTelegramSettings() {
  const box = document.getElementById('tg-bot-input');
  if (!box) return;
  box.value = (await getTeamSetting('tg_bot_username')) || '';
  let ev = {};
  try { ev = JSON.parse(await getTeamSetting('tg_events') || '{}') || {}; } catch (e) {}
  TG_EVENTS.forEach(k => {
    const el = document.getElementById('tg-ev-' + k);
    // Типово ввімкнені бан і тиша: це те, заради чого сповіщення й потрібні.
    if (el) el.checked = k in ev ? !!ev[k] : (k === 'ban' || k === 'silent');
  });
  tgRefresh();
}

async function saveTelegramBot() {
  // Зрізаємо @ і посилання: люди вставляють і так, і так.
  const v = (document.getElementById('tg-bot-input').value || '')
    .trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').replace(/\?.*$/, '');
  document.getElementById('tg-bot-input').value = v;
  await setTeamSetting('tg_bot_username', v);
  tgRefresh();
}

async function saveTelegramEvents() {
  const ev = {};
  TG_EVENTS.forEach(k => ev[k] = !!(document.getElementById('tg-ev-' + k) || {}).checked);
  await setTeamSetting('tg_events', JSON.stringify(ev));
}

/* Мій рядок у tg_links. Його може не бути зовсім — тоді нічого не
   прив'язано; таблиці теж може не бути, якщо TELEGRAM.sql ще не
   виконали, і це треба сказати прямо, а не мовчки нічого не робити. */
async function tgMine() {
  const { data: u } = await sb.auth.getUser();
  const uid = u && u.user && u.user.id;
  if (!uid) return { error: 'no-session' };
  const { data, error } = await sb.from('tg_links')
    .select('user_id,email,chat_id,tg_name,linked_at,code,code_expires')
    .eq('user_id', uid).limit(1);
  if (error) return { error: 'no-table', message: error.message };
  return { uid, email: (u.user.email || ''), row: (data || [])[0] || null };
}

async function tgRefresh() {
  const box = document.getElementById('tg-link-status');
  const btn = document.getElementById('tg-link-btn');
  const off = document.getElementById('tg-unlink-btn');
  if (!box) return;

  const mine = await tgMine();
  const show = (html, canLink, canUnlink) => {
    box.innerHTML = html;
    if (btn) btn.classList.toggle('hidden', !canLink);
    if (off) off.classList.toggle('hidden', !canUnlink);
  };

  if (mine.error === 'no-session')
    return show('Log in to connect Telegram.', false, false);
  if (mine.error === 'no-table')
    return show('Telegram links are not set up yet — run TELEGRAM.sql, then reload.', false, false);

  const r = mine.row;
  if (r && r.chat_id) {
    const when = r.linked_at ? new Date(r.linked_at).toLocaleDateString() : '';
    return show(`Connected${r.tg_name ? ' to <b>' + tgEsc(r.tg_name) + '</b>' : ''}`
      + `${when ? ' · since ' + when : ''}<br>`
      + `<span class="opacity-60">Alerts about your own domains go to that chat. `
      + `Send /stop to the bot to disconnect from your side.</span>`, false, true);
  }
  show('Not connected. Alerts about your domains will go only to the shared chat, if one is set.',
       true, false);
}

function tgEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Код — з криптографічного генератора браузера, не з Math.random:
   вгадати його має бути неможливо, бо це ключ від чужих сповіщень.
   Telegram дозволяє в /start лише літери, цифри, _ і -, тож беремо
   base36. */
function tgCode() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

async function tgConnect() {
  const bot = (document.getElementById('tg-bot-input').value || '').trim().replace(/^@/, '');
  if (!bot) { alert('Enter the bot username first — the one BotFather gave you, without @.'); return; }

  const mine = await tgMine();
  if (mine.error) { alert('Cannot connect: ' + (mine.message || mine.error)); return; }

  const code = tgCode();
  const row = {
    user_id: mine.uid,
    // Пошту кладемо самі: так боту не потрібні адмінські права, щоб
    // показати, до якого акаунта він прив'язався.
    email: mine.email,
    team_name: currentTeam,
    code,
    code_expires: new Date(Date.now() + TG_CODE_MIN * 60000).toISOString()
  };
  const { error } = await sb.from('tg_links').upsert(row, { onConflict: 'user_id' });
  if (error) { alert('Cannot create the code: ' + error.message); return; }

  const link = 'https://t.me/' + bot + '?start=' + code;
  const box = document.getElementById('tg-link-status');
  box.innerHTML = `Open this link and press Start:<br>
    <a href="${tgEsc(link)}" target="_blank" rel="noopener"
       class="font-mono break-all" style="color:var(--accent)">${tgEsc(link)}</a><br>
    <span class="opacity-60">The code works once and expires in ${TG_CODE_MIN} minutes.
    If the link does not open, send the bot: <span class="font-mono">/start ${tgEsc(code)}</span></span>`;
  document.getElementById('tg-link-btn')?.classList.add('hidden');
  window.open(link, '_blank', 'noopener');
}

async function tgUnlink() {
  if (!await ask({ title: 'Disconnect Telegram?', danger: true, ok: 'Disconnect',
    body: 'Domain alerts will stop arriving in your Telegram.' })) return;
  const mine = await tgMine();
  if (mine.error || !mine.uid) return;
  const { error } = await sb.from('tg_links')
    .update({ chat_id: null, tg_name: null, linked_at: null, code: null, code_expires: null })
    .eq('user_id', mine.uid);
  if (error) { alert('Could not disconnect: ' + error.message); return; }
  tgRefresh();
}

/* ── перевірка звʼязку ──

   Питання, яке виникає рівно тоді, коли все налаштовано, а нічого не
   приходить: це тиша від того, що новин немає, чи від того, що щось
   не так? Відповісти на нього з дашборда неможливо — токен бота тут
   не зберігається й зберігатись не буде.

   Тому питаємо ту саму функцію, яка й розсилає: вона єдина має
   токен. Маршрут навмисно той самий, що в справжніх сповіщень —
   секрет, tg_links, sendMessage. Тест, який іде іншою дорогою,
   перевіряє не те, що треба.

   Пише тільки в ТВІЙ чат. Смикати командний чат заради перевірки —
   найкоротший шлях до того, щоб бота вимкнули. */
async function tgTest() {
  const box = document.getElementById('tg-test-status');
  const btn = document.getElementById('tg-test-btn');
  const say = (html, colour) => {
    if (!box) return;
    box.innerHTML = html;
    box.style.color = colour || 'var(--text-muted)';
  };
  if (btn) btn.disabled = true;
  say('Asking the function to send it\u2026');
  try {
    const { data: sess } = await sb.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('not signed in');

    const res = await fetch(SUPABASE_URL + '/functions/v1/fb-sync', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY,
                 'content-type': 'application/json' },
      body: JSON.stringify({ test: true })
    });
    if (res.status === 404) throw Object.assign(new Error('not deployed'), { code: 'missing' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);

    if (j.test === 'sent')
      return say('Sent. If it is not in your Telegram within a few seconds, '
        + 'the chat is linked to a different bot than the one now in the secrets.', 'var(--ok)');
    /* Кожна відмова має власну причину й власну дію. Одне «не
       вдалося» на всі випадки залишало б людину рівно там, де вона й
       була: щось не так, а що — невідомо. */
    if (j.test === 'not configured')
      return say('The function has no bot token. Add <span class="font-mono">TG_BOT_TOKEN</span> '
        + 'to the fb-sync secrets \u2014 not here, and not in the database.', 'var(--warn)');
    if (j.test === 'not linked')
      return say('Your Telegram is not connected yet \u2014 press Connect Telegram above '
        + 'and start the bot.', 'var(--warn)');
    if (j.test === 'no links table')
      return say('Telegram links are not set up \u2014 run <span class="font-mono">TELEGRAM.sql</span>.',
        'var(--warn)');
    say('Telegram refused it: ' + tgEsc(String(j.note || j.test || 'unknown')), 'var(--bad)');
  } catch (e) {
    const net = /failed to fetch|networkerror|load failed/i.test(e.message || '');
    say(e.code === 'missing' || net
      ? 'The fb-sync function did not answer \u2014 it is either not deployed '
        + '(<span class="font-mono">supabase functions deploy fb-sync</span>) or failing on start-up.'
      : 'Could not send: ' + tgEsc(e.message), 'var(--bad)');
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.tgTest = tgTest;
window.tgConnect = tgConnect;
window.tgUnlink = tgUnlink;
window.tgRefresh = tgRefresh;
window.saveTelegramBot = saveTelegramBot;
