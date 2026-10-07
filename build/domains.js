/* ═══════════ DOMAINS ═══════════
   Список доменів по PWA і чи вони ще відповідають.

   ЧЕСНО ПРО ПЕРЕВІРКУ З БРАУЗЕРА
   Код відповіді чужого домена зі сторінки НЕ видно. CORS не дає
   прочитати відповідь, а режим no-cors повертає непрозорий об'єкт, де
   status завжди 0 — і для 200, і для 404. Тому тут рівно два висновки:
   «відповідає» і «не відповідає». Не відповідає — це мертвий DNS,
   протухлий сертифікат або відкинуте з'єднання.

   Справжні коди й мітки дає Edge Function check-domains — вона питає
   з сервера, де CORS не заважає, і пише source='server'. Кнопка
   перевірки одна: спершу сервер, а якщо його немає — браузерна проба
   як запасний шлях. */

const DM_STATE = {
  ok:       { label: 'Answers',      dot: '#22C55E', tone: 'text-emerald-400', soft: 'rgba(34,197,94,.14)',  bd: 'rgba(34,197,94,.30)' },
  danger:   { label: 'Flagged',      dot: '#EF4444', tone: 'text-red-400',     soft: 'rgba(239,68,68,.14)',  bd: 'rgba(239,68,68,.32)' },
  notfound: { label: 'Not found',    dot: '#F59E0B', tone: 'text-amber-400',   soft: 'rgba(245,158,11,.14)', bd: 'rgba(245,158,11,.32)' },
  down:     { label: 'No answer',    dot: '#EF4444', tone: 'text-red-400',     soft: 'rgba(239,68,68,.10)',  bd: 'rgba(239,68,68,.25)' },
  unknown:  { label: 'Not checked',  dot: '#6C6C76', tone: 'text-muted-dynamic', soft: 'var(--surface-2)',   bd: 'var(--border)' }
};
// Зверху те, що вимагає дії.
const DM_ORDER = ['danger', 'notfound', 'down', 'ok', 'unknown'];
const DM_BAD = ['danger', 'notfound', 'down'];

// Скільки перевірок одночасно. Більше — браузер просто ставить їх у
// чергу сам, а сторінка починає підвисати на сотні доменів.
const DM_POOL = 6;
const DM_TIMEOUT = 8000;
// Скільки доменів за раз шлемо у функцію явним списком. Він їде в
// PostgREST як in.(…) у рядку запиту — на сотнях доменів просто не
// влізе, тому ріжемо самі.
const DM_CHUNK = 120;

/* Іконка, а не емодзі. Емодзі малює система, і в кожній воно своє:
   розмір, колір і вертикаль стрибають, а пофарбувати його під тему
   не можна взагалі. SVG успадковує currentColor і поводиться як текст. */
const DM_ICON_COPY = '<svg class="i-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
  + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<rect x="9" y="9" width="12" height="12" rx="2"/>'
  + '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const DM_ICON_DONE = '<svg class="i-done" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
  + ' stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M20 6 9 17l-5-5"/></svg>';

let dmRows = [], dmFilter = '', dmGroup = 'pwa', dmSel = null, dmLoaded = false;
let dmSort = { key: 'status', dir: 1 };
let dmBusy = false;

/* ── розбір вставленого списку ──
   Формат у всіх свій, тож не вимагаємо жодного. Правило одне: рядок,
   який не схожий на домен, — це заголовок, усе під ним належить йому.
   Маркери списку, нумерацію, роздільники «---», протокол і шлях
   зрізаємо.

   Заголовком зазвичай стоїть ціла назва кампанії:

     Mbank_KG_10708-ex8g_18/09
     https://mplay-kg-games.website
     https://big-win-kg.forum
     ---

   Це краще, ніж просто назва PWA: разом із нею приїжджають гео і ktid,
   а ktid — це вже зв'язок із воронкою, тобто зі спендом. Тому заголовок
   зберігаємо цілим, а PWA/гео/ktid із нього виводимо. */
function dmParsePaste(text) {
  const out = [];
  let head = '';
  String(text || '').split(/\r?\n/).forEach(raw => {
    let line = raw.trim();
    if (!line) return;
    if (/^[-=_*~—]{3,}$/.test(line)) { head = ''; return; }   // роздільник між блоками
    // «- », «* », «• », «1. », «1) » на початку
    line = line.replace(/^[-*•·—]+\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
    if (!line) return;
    const clean = line.replace(/:$/, '').trim();
    const toks = clean.split(/[\s,;|\t]+/).map(dmNormDomain).filter(Boolean);
    // Рядок без жодного домена — заголовок. Саме так, а не «рядок без
    // крапки»: назва кампанії теж може містити крапку, а ось доменом
    // вона не буде.
    if (!toks.length) { head = clean; return; }
    const info = dmHeadInfo(head);
    toks.forEach(d => out.push({ domain: d, ...info }));
  });
  return out;
}

/* Mbank_KG_10708-ex8g_18/09 → pwa Mbank, geo KG, ktid 10708-ex8g.
   Позиції ті самі, що й у типовому шаблоні імпорту (*_{geo}_{ktid}).
   Якщо заголовок не схожий на назву кампанії — беремо його цілком як
   назву PWA, бо саме так виглядає простий список «Melbet / домени». */
function dmHeadInfo(head) {
  const h = String(head || '').trim();
  if (!h) return { pwa: null, geo: null, ktid: null, campaign: null };
  const p = h.split('_');
  if (p.length < 3) return { pwa: h, geo: null, ktid: null, campaign: null };
  return {
    pwa: (p[0] || '').trim() || h,
    geo: (p[1] || '').toUpperCase().trim() || null,
    ktid: (p[2] || '').trim() || null,
    campaign: h
  };
}

// https://foo.com/path?x=1 → foo.com
function dmNormDomain(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');   // протокол
  s = s.split('/')[0].split('?')[0].split('#')[0];
  s = s.replace(/^www\./, '').replace(/\.$/, '');
  s = s.split(':')[0];                             // порт
  // Мінімальна перевірка, що це взагалі схоже на домен
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : '';
}

const dmEsc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function dmAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (!(ms >= 0)) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 60) return (m || 1) + 'm';
  const h = Math.floor(m / 60);
  return h < 24 ? h + 'h' : Math.floor(h / 24) + 'd';
}

/* ── завантаження ── */

async function dmInit() {
  const host = document.getElementById('dm-list');
  if (!host) return;
  // До перевірки на dmLoaded: інакше лічильник зʼявлявся б тільки при
  // першому заході на сторінку, а далі мовчав.
  dmWrLoad().then(dmWrPaint);
  if (dmLoaded) { dmRender(); return; }
  host.innerHTML = '<p class="text-center opacity-30 py-16 text-xs font-black uppercase tracking-widest">Loading…</p>';
  try {
    dmRows = await sbFetchAll('domains',
      q => q.eq('team_name', currentTeam).order('domain', { ascending: true }));
  } catch (e) {
    host.innerHTML = `<p class="text-center text-rose-400 py-16 text-xs font-bold">
      Error: ${dmEsc(e.message)}<br>
      <span class="opacity-60 text-[10px] font-normal">If the table does not exist yet — run DOMAINS.sql</span></p>`;
    return;
  }
  dmLoaded = true;
  dmRender();
}

/* ── перевірка ── */

// Один домен. Резолвиться — значить щось відповіло; кинуло — не відповіло.
// Коду відповіді тут не буде, скільки б ми не старались: no-cors його ховає.
async function dmProbe(domain) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), DM_TIMEOUT);
  try {
    await fetch('https://' + domain + '/?_=' + Date.now(),
      { mode: 'no-cors', cache: 'no-store', redirect: 'follow', signal: ctl.signal });
    return 'ok';
  } catch (e) {
    return 'down';
  } finally { clearTimeout(t); }
}

/* ── квота Web Risk ──

   Google не віддає «скільки лишилось» жодним API: у Cloud Console це
   видно в Billing → Reports, і на цьому все. Тому рахуємо самі — і
   можемо порахувати точно, бо ціна прогону відома наперед: Web Risk це
   рівно один запит на домен, а функція каже, скільки доменів вона
   перевірила. Фільтрувальний DNS безкоштовний і в лічильник не йде.

   Рахунок ведеться по команді, а не по людині: ключ у Google один на
   всіх, тож і квота спільна. І лічильник бачить рівно те, що витратив
   цей дашборд — якщо тим самим ключем користується ще щось, справжня
   цифра буде більша. */
const DM_WR_FREE = 100000;
const DM_WR_KEY  = 'wr_usage';
let dmWr = null;                                  // { '2026-09': 412, … }

const dmMonth = () => new Date().toISOString().slice(0, 7);

async function dmWrLoad() {
  if (dmWr) return dmWr;
  try { dmWr = JSON.parse((await getTeamSetting(DM_WR_KEY)) || '{}') || {}; }
  catch (e) { dmWr = {}; }
  return dmWr;
}

async function dmWrAdd(n) {
  if (!n) return;
  await dmWrLoad();
  const m = dmMonth();
  dmWr[m] = (dmWr[m] || 0) + n;
  // Пів року історії — досить, щоб побачити, чи витрати ростуть.
  const keep = Object.keys(dmWr).sort().slice(-6);
  dmWr = Object.fromEntries(keep.map(k => [k, dmWr[k]]));
  dmWrPaint();
  try { await setTeamSetting(DM_WR_KEY, JSON.stringify(dmWr)); } catch (e) {}
}

function dmWrPaint() {
  const el = document.getElementById('dm-quota');
  if (!el) return;
  const used = (dmWr || {})[dmMonth()] || 0;
  if (!used) { el.classList.add('hidden'); return; }
  const left = Math.max(0, DM_WR_FREE - used);
  const part = used / DM_WR_FREE;
  const n = x => x.toLocaleString('en-US').replace(/,/g, ' ');
  el.classList.remove('hidden');
  el.style.color = part > .95 ? 'var(--bad)' : part > .8 ? 'var(--warn)' : 'var(--text-muted)';
  el.textContent = `Web Risk: ${n(left)} left of ${n(DM_WR_FREE)}`;
  el.title = `Spent ${n(used)} lookup(s) in ${dmMonth()}.\n\n`
    + 'Counted here, not asked from Google: Web Risk has no "requests left" API. '
    + 'One domain = one lookup, and the check reports how many domains it went through, '
    + 'so the figure is exact for what this dashboard spends.\n\n'
    + 'Filtering DNS is free and unlimited — it is not counted.\n\n'
    + 'The authoritative number: Google Cloud Console → Billing → Reports, filtered to Web Risk API.';
}

/* ── перевірка ──

   Одна кнопка на все. Спершу сервер: лише він бачить справжній код
   відповіді й чорні списки. Сервера немає — тихо відкочуємось на
   браузерну пробу, яка вміє рівно одне: відповів домен чи ні. Краще
   грубий сигнал, ніж кнопка, яка не робить нічого.

   Раніше кнопок було дві, і це збивало з пантелику: «Check all»
   виглядав як головний, а насправді був найслабшим з двох і ще й
   стирав мітки. Тепер вибір робить не людина, а наявність сервера.

   ЩО саме перевіряти — вирішує те, що на екрані:
     - нічого не звужено → весь список команди, позначені пропускаються
       (мітку Google знімає рідко, а квота не безмежна);
     - стоїть фільтр або пошук → рівно ці рядки, і позначені теж. Якщо
       ти сам звузив список до Danger і натиснув перевірку — це і є
       прохання перевірити їх заново. */
async function dmCheck() {
  if (dmBusy) return;
  const q = (document.getElementById('dm-search')?.value || '').trim();
  const narrowed = !!dmFilter || !!q;
  const shown = dmShown();
  if (!dmRows.length) return;
  if (narrowed && !shown.length) { toast('Nothing is shown to check.', 'warn', 3000); return; }

  dmBusy = true;
  const btn = document.getElementById('dm-check-btn');
  const say = t => { if (btn) btn.textContent = t; };
  say('Checking…');

  /* Позначених рахуємо ДО прогону. Після — у це число потрапили б і ті,
     кого цей самий прогін щойно позначив, і підсумок казав би «пропущено
     1», хоча пропущено нуль, а знайдено один. */
  const wasFlagged = dmRows.filter(r => r.status === 'danger').length;
  const srv = await dmCheckServer(narrowed ? shown.map(r => r.domain) : null, say);

  if (srv.ok) {
    dmBusy = false; say('Check'); dmRender();
    if (!srv.total) { toast('Nothing to check — everything shown is already flagged.', 'warn', 5000); return; }
    const NAMES = { 'web-risk': 'Web Risk', 'safe-browsing': 'Safe Browsing', dns: 'filtering DNS' };
    const where = String(srv.flags || '').split('+').filter(Boolean).map(k => NAMES[k] || k).join(' + ');
    // Скільки не чіпали. Мовчазний пропуск виглядав би як «перевірило не
    // всіх», і довіри до цифри не було б.
    const skipped = narrowed ? 0 : wasFlagged;
    const tail = skipped ? ` Skipped ${skipped} already flagged — filter to Danger and check again to re-check those.` : '';
    /* ЦЯ кнопка в Telegram не пише — і ніде про це не було сказано.
       Людина натискала «Check», бачила зламаний домен і чекала
       повідомлення, якого ця гілка не шле й не збирається: тривоги
       йдуть тільки з нічного прогону. Мовчання тут виглядає точно як
       зламаний бот, і саме так і виглядало. */
    const tg = srv.broken ? '\n\nTelegram alerts go out with the nightly run, not from this button.' : '';
    toast(where
      ? `Checked ${srv.total} domain(s) via ${where}. Flagged: ${srv.flagged}.` + tail + tg
      : `Checked ${srv.total} domain(s) — HTTP codes only.\n\n`
        + 'No blacklist source answered. Filtering DNS needs no key and should always work, '
        + 'so this usually means the function could not reach the network.',
      where ? '' : 'warn', where ? 5000 : 9000);
    return;
  }

  /* Сервера немає. Кажемо про це один раз і тут же робимо те, що ще
     можемо — не лишаємо людину з помилкою і без результату. */
  const swept = await dmSweep(shown, say);
  dmBusy = false; say('Check'); dmRender();
  const head = srv.reason === 'missing'
    ? 'The check-domains function is not deployed, so this was a browser check only.'
    : srv.reason === 'auth'
    ? 'Log in first — the server check runs as you. This was a browser check only.'
    : 'The server check did not go through, so this was a browser check only.';
  // Нуль перевірених — це не результат, а глухий кут: усе видиме
  // позначене, а зняти мітку браузер не може. Так і кажемо, замість
  // «0 checked: 0 answered, 0 did not».
  const body = swept.total
    ? `${swept.total} checked: ${swept.total - swept.down} answered, ${swept.down} did not.`
      + (swept.skipped ? ` Skipped ${swept.skipped} flagged — a browser cannot clear a flag.` : '')
      + '\n\nHTTP codes and Google flags need the server.'
    : `Nothing left to check: all ${swept.skipped} shown domain(s) are flagged, `
      + 'and only the server check can confirm or clear a flag.';
  toast(`${head}\n\n${body}`, 'warn', 9000);
}

/* Серверна частина. Повертає {ok}, а не кидає: рішення, що робити
   далі, приймає dmCheck, і йому потрібна причина, а не виняток.

   only — явний список доменів. Функція вважає його свідомим вибором і
   фільтр «пропускай позначені» не вмикає. Шлемо порціями: цей список
   їде в PostgREST як in.(…) у рядку запиту, і на сотнях доменів він
   просто не влізе. */
async function dmCheckServer(only, say) {
  let total = 0, flagged = 0, flags = 'none', spent = 0, broken = 0;
  const apply = j => {
    (j.results || []).forEach(x => {
      const row = dmRows.find(r => String(r.id) === String(x.id));
      if (!row) return;
      row.status = x.status; row.status_code = x.status_code;
      row.flagged_by = x.flagged_by;
      row.source = x.source; row.checked_at = x.checked_at;
    });
    total += j.checked || 0;
    // Яким саме списком питали — це єдиний спосіб побачити, чи ключ
    // узагалі підхопився. Без нього danger не зʼявиться ніколи, і
    // ззовні це виглядає як «перевірка нічого не знайшла».
    flags = j.flags || flags;
    /* Скільки коштувала порція. Нова функція каже це прямо; стара
       такого поля не знає, і тоді рахуємо самі — Web Risk це один запит
       на домен. Так лічильник працює і до оновлення функції, і після,
       не рахуючи те саме двічі. */
    spent += typeof j.spent === 'number' ? j.spent
           : (/web-risk|safe-browsing/.test(String(j.flags || '')) ? (j.checked || 0) : 0);
    flagged += (j.results || []).filter(x => x.status === 'danger').length;
    /* Зламане — це не лише мітка. «Не відповідає» рахується окремо від
       flagged саме тому, що саме воно й було в людини: два домени
       лежали як down, а flagged лишався нулем. */
    broken += (j.results || []).filter(x => DM_BAD.includes(x.status)).length;
    say(`Checking ${total}…`);
    dmRender();
  };

  try {
    const { data: sess } = await sb.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) return { ok: false, reason: 'auth' };
    const call = async body => {
      const res = await fetch(SUPABASE_URL + '/functions/v1/check-domains', {
        method: 'POST',
        // apikey поруч із Authorization: шлюз Supabase очікує обидва, і без
        // ключа запит можна не побачити взагалі — замість відповіді прийде
        // відмова ще на підході.
        headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY,
                   'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ team: currentTeam }, body))
      });
      if (res.status === 404) throw Object.assign(new Error('not deployed'), { reason: 'missing' });
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { msg = (await res.json()).error || msg; } catch (e) {}
        throw new Error(msg);
      }
      return res.json();
    };

    if (only) {
      for (let i = 0; i < only.length; i += DM_CHUNK) apply(await call({ domains: only.slice(i, i + DM_CHUNK) }));
    } else {
      // Функція віддає порціями: Edge Function обмежена в часі, і на
      // сотнях доменів чесна порція краща за обрив посеред роботи.
      // after — курсор: без нього вона щоразу віддавала б ту саму першу
      // порцію, і цикл ганяв би її по колу.
      let after = 0;
      for (let pass = 0; pass < 50; pass++) {
        const j = await call({ after });
        apply(j);
        after = j.next || after;
        if (!j.more || !j.next) break;
      }
    }
    await dmWrAdd(spent);
    return { ok: true, total, flagged, flags, broken };
  } catch (e) {
    await dmWrAdd(spent);   // що встигли витратити — витрачено
    /* «Failed to fetch» означає рівно одне: браузер не зміг виконати
       запит. ЧОМУ саме — він не знає й не скаже, бо відповідь без
       CORS-заголовків для нього просто не існує. Три причини виглядають
       однаково: функції немає, функція падає на старті, увімкнена
       перевірка JWT (preflight OPTIONS іде без Authorization завжди).
       Тому причину не називаємо — пояснення дає dmCheckHelp. */
    const net = /failed to fetch|networkerror|load failed/i.test(e.message || '');
    return { ok: false, reason: e.reason || (net ? 'net' : 'error'), error: e.message };
  }
}

/* Браузерна проба по всьому видимому списку — запасний шлях.

   Позначені рядки обходить. Проба вміє рівно одне: відповів домен чи
   ні. А домен із міткою Google відповідає цілком нормально — саме тому
   мітка й небезпечна. Тож проба повернула б 'ok' і записала його
   поверх 'danger', стерши висновок, якого вона робити не вміє. */
async function dmSweep(shown, say) {
  const targets = shown.filter(r => r.status !== 'danger');
  const skipped = shown.length - targets.length;
  if (!targets.length) return { total: 0, down: 0, skipped };

  let done = 0;
  const queue = targets.slice();
  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      row.status = await dmProbe(row.domain);
      row.source = 'browser';
      row.status_code = null;
      row.checked_at = new Date().toISOString();
      done++; say(`Checking ${done}/${targets.length}`);
      // Малюємо по ходу, а не в кінці: на сотні доменів це кілька
      // хвилин, і дивитись увесь час на незмінну таблицю неприємно.
      if (done % 5 === 0) dmRender();
    }
  };
  await Promise.all(Array.from({ length: Math.min(DM_POOL, queue.length) }, worker));

  /* Пишемо один update на кожен отриманий статус, а не на кожен домен:
     статусів усього кілька, тож це 2-3 запити замість сотень.

     Навмисно НЕ upsert. По-перше, PostgREST вимагає, щоб усі об'єкти в
     пачці мали однакові ключі, а поле зі значенням undefined випадає з
     JSON — тож один домен без нотатки ламав би весь запит. По-друге,
     upsert тягнув би за собою pwa, note й решту, яких ця операція не
     стосується. Тут міняються рівно чотири колонки. */
  const at = new Date().toISOString();
  const byStatus = {};
  targets.forEach(r => (byStatus[r.status] = byStatus[r.status] || []).push(r.id));
  try {
    for (const [status, ids] of Object.entries(byStatus)) {
      const { error } = await sb.from('domains')
        .update({ status, status_code: null, source: 'browser', checked_at: at })
        .in('id', ids);
      if (error) throw error;
    }
  } catch (e) { console.warn('domains update:', e.message); }

  return { total: targets.length, down: targets.filter(r => r.status === 'down').length, skipped };
}

/* Чому серверної перевірки може не бути — окремою кнопкою, а не в
   тості: читати це треба один раз, а перевіряти щодня. */
function dmCheckHelp() {
  tell('Why the server check may be silent',
    'The server check runs in a Supabase Edge Function. If it does not answer, '
    + 'the browser cannot say why — a reply without CORS headers does not exist for it.\n\n'
    + 'Check in this order:\n\n'
    + '1. Supabase → Edge Functions → check-domains → Logs.\n'
    + '   Empty right after pressing Check = the request never reached the function.\n'
    + '   An entry with an error = it started and crashed, and the reason is right there.\n\n'
    + '2. The function is deployed under exactly this name: check-domains.\n'
    + '   Renaming it in the dashboard does not change its URL.\n\n'
    + '3. Settings → JWT Verification is off. The browser sends an OPTIONS request first, '
    + 'always without an Authorization header, so Supabase rejects it before the function runs.\n\n'
    + 'Until it works, Check still runs in your browser: it can tell whether a domain answers, '
    + 'but not its HTTP code and not whether Google flagged it.');
}

/* Перевірка одного рядка. Спершу пробуємо сервер: лише він бачить
   справжній код і чорний список, і лише через нього можна ПЕРЕВІРИТИ
   ЗАНОВО вже позначений домен — масовий прогін такі пропускає, щоб не
   палити квоту. Явний список доменів функція вважає свідомим вибором і
   фільтр не вмикає.

   Сервера немає — тихо відкочуємось на браузерну пробу: краще грубий
   сигнал, ніж кнопка, яка не робить нічого. */
async function dmCheckOne(idEnc) {
  const id = decodeURIComponent(idEnc);
  const row = dmRows.find(r => String(r.id) === String(id));
  if (!row) return;
  const was = row.status;
  row.status = 'unknown'; dmRender();

  try {
    const { data: sess } = await sb.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('no session');
    const res = await fetch(SUPABASE_URL + '/functions/v1/check-domains', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY,
                 'content-type': 'application/json' },
      body: JSON.stringify({ team: currentTeam, domains: [row.domain] })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const x = (j.results || [])[0];
    if (!x) throw new Error('empty');
    row.status = x.status; row.status_code = x.status_code;
    row.flagged_by = x.flagged_by;
    row.source = x.source; row.checked_at = x.checked_at;
    dmRender();
    return;
  } catch (e) {
    row.status = was;   // сервер не вийшов — повертаємо як було і пробуємо самі
  }

  /* Мітку браузером не знімають. Позначений домен відповідає так само,
     як здоровий, тож проба скаже 'ok' — і це буде не перевірка, а
     стирання чужого висновку. Сервера немає — лишаємо рядок як був. */
  if (was === 'danger') {
    row.status = was; dmRender();
    toast('This domain is flagged. Only the server check can confirm or clear that — '
        + 'a browser can only tell whether the domain answered at all.', 'warn', 6000);
    return;
  }

  row.status = await dmProbe(row.domain);
  row.source = 'browser';
  row.status_code = null;
  row.checked_at = new Date().toISOString();
  dmRender();
  try {
    await sb.from('domains').update({
      status: row.status, status_code: null, source: 'browser', checked_at: row.checked_at
    }).eq('id', row.id);
  } catch (e) { console.warn('domains update:', e.message); }
}

/* ── вставка списку ── */

function dmTogglePaste() {
  const box = document.getElementById('dm-paste');
  if (!box) return;
  box.classList.toggle('hidden');
  if (box.classList.contains('hidden')) return;
  dmFillGroups();
  document.getElementById('dm-paste-text')?.focus();
}

/* Список наявних груп у випадайці. Додавати домени до вже заведеної PWA
   інакше можна було тільки одним способом: згадати її заголовок дослівно
   й надрукувати його перед списком. Тепер — вибрати зі списку. */
function dmFillGroups() {
  const sel = document.getElementById('dm-paste-group');
  if (!sel) return;
  const keep = sel.value;
  const names = [...new Set(dmRows.map(r => String(r.pwa || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">Group: from the text</option>'
    + names.map(n => `<option value="${dmEsc(n)}">${dmEsc(n)}</option>`).join('');
  if (keep && names.includes(keep)) sel.value = keep;
}

function dmPasteGroup() {
  return (document.getElementById('dm-paste-group')?.value || '').trim();
}

function dmPastePreview() {
  const el = document.getElementById('dm-paste-preview');
  if (!el) return;
  const parsed = dmPasteRows();
  if (!parsed.length) { el.innerHTML = 'Nothing recognised yet.'; return; }
  const have = new Set(dmRows.map(r => String(r.domain).toLowerCase()));
  const seen = new Set();
  let dup = 0, add = 0;
  const groups = {}, kt = new Set();
  parsed.forEach(p => {
    if (have.has(p.domain) || seen.has(p.domain)) { dup++; return; }
    seen.add(p.domain); add++;
    (groups[p.pwa || '— no PWA —'] = groups[p.pwa || '— no PWA —'] || []).push(p.domain);
    if (p.ktid) kt.add(p.ktid);
  });
  el.innerHTML = `<b class="text-dynamic">${add}</b> new`
    + (dup ? ` · <span class="text-amber-400">${dup} already here, skipped</span>` : '')
    + (add ? '<br>' + Object.entries(groups).map(([g, d]) =>
        `<span class="opacity-70">${dmEsc(g)}</span> — ${d.length}`).join(' · ') : '')
    + (add && kt.size ? `<br><span class="opacity-60">KTID picked up from the headers: ${
        [...kt].slice(0, 8).map(dmEsc).join(', ')}${kt.size > 8 ? ` +${kt.size - 8}` : ''}</span>` : '');
}

/* Розбір плюс вибрана група. Коли група задана явно, вона перекриває
   заголовки з тексту — інакше вибір у випадайці нічого б не означав для
   списку, у якому заголовки вже є. Гео й ktid при цьому не вигадуємо:
   вони належать конкретній кампанії, а не групі. */
function dmPasteRows() {
  const g = dmPasteGroup();
  const parsed = dmParsePaste(document.getElementById('dm-paste-text')?.value || '');
  return g ? parsed.map(p => ({ ...p, pwa: g })) : parsed;
}

async function dmPasteSave() {
  const ta = document.getElementById('dm-paste-text');
  const parsed = dmPasteRows();
  const have = new Set(dmRows.map(r => String(r.domain).toLowerCase()));
  const seen = new Set();
  const fresh = [];
  parsed.forEach(p => {
    if (have.has(p.domain) || seen.has(p.domain)) return;
    seen.add(p.domain);
    fresh.push({ team_name: currentTeam, domain: p.domain, pwa: p.pwa || null,
                 geo: p.geo || null, ktid: p.ktid || null, campaign: p.campaign || null,
                 status: 'unknown' });
  });
  if (!fresh.length) { alert('Nothing new to add.'); return; }
  const btn = document.getElementById('dm-paste-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  try {
    const { data, error } = await sb.from('domains').insert(fresh).select();
    if (error) throw error;
    dmRows = dmRows.concat(data || []);
    if (ta) ta.value = '';
    dmPastePreview();
    dmTogglePaste();
    dmRender();
  } catch (e) {
    alert('Could not add: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Add'; }
  }
}

/* ── таблиця ── */

function dmSetGroup(v) { dmGroup = v; dmRender(); }
function dmSetFilter(k) { dmFilter = (dmFilter === k) ? '' : k; dmSel = null; dmRender(); }
function dmPick(idEnc) {
  const id = decodeURIComponent(idEnc);
  dmSel = (dmSel === id) ? null : id;
  dmRender();
  /* Питаємо базу лише коли картку відкрили: у списку буває дві сотні
     доменів, і запит під кожен коштував би дорожче за відповідь на
     питання, якого ніхто не поставив. */
  if (dmSel) {
    const row = dmRows.find(r => String(r.id) === String(dmSel));
    if (row) dmLiveLoad(row.domain);
  }
}
function dmSortBy(k) {
  if (dmSort.key === k) dmSort.dir = -dmSort.dir;
  else dmSort = { key: k, dir: k === 'status' ? 1 : 1 };
  dmRender();
}

// Рядки, які зараз на екрані — їх і перевіряємо кнопкою «Check all».
// Перевіряти приховані фільтром було б несподівано: натиснув на
// «Not checked», а чекає весь список.
function dmShown() {
  const q = (document.getElementById('dm-search')?.value || '').toLowerCase().trim();
  return dmRows.filter(r => {
    const st = r.status || 'unknown';
    const inFilter = !dmFilter ? true
      : dmFilter === 'bad' ? DM_BAD.includes(st)
      : st === dmFilter;
    return inFilter && (!q || [r.domain, r.pwa, r.note, r.geo, r.ktid, r.campaign]
      .some(v => String(v || '').toLowerCase().includes(q)));
  });
}

function dmRender() {
  const list = document.getElementById('dm-list');
  const tiles = document.getElementById('dm-tiles');
  if (!list) return;

  const counts = {};
  DM_ORDER.forEach(k => counts[k] = 0);
  dmRows.forEach(r => counts[r.status || 'unknown'] = (counts[r.status || 'unknown'] || 0) + 1);
  const bad = DM_BAD.reduce((a, k) => a + counts[k], 0);

  /* Колір передаємо змінними — і клас .flt однаково обслуговує цю
     сторінку й Domains. Нуль притлумлюємо: фільтр, який нічого не
     покаже, не має виглядати запрошувально. */
  const tile = (k, label, n, colour, soft, bd) => `
    <button type="button" onclick="dmSetFilter('${k}')"
      class="flt ${dmFilter === k ? 'is-on' : ''} ${n ? '' : 'is-zero'}"
      style="--flt:${colour};--flt-soft:${soft};--flt-bd:${bd}">
      <span class="flt-dot"></span>
      <span class="flt-name">${label}</span>
      <span class="flt-n">${n}</span></button>`;
  if (tiles) {
    tiles.innerHTML = `<div class="flt-row">
      ${tile('bad', 'Problem', bad, '#EF4444', 'rgba(239,68,68,.14)', 'rgba(239,68,68,.32)')}
      ${DM_ORDER.map(k => tile(k, DM_STATE[k].label, counts[k],
          DM_STATE[k].dot, DM_STATE[k].soft, DM_STATE[k].bd)).join('')}
      ${tile('', 'All', dmRows.length, 'var(--text-muted)', 'var(--surface-3)', 'var(--border)')}
    </div>`;
  }

  let shown = dmShown();
  if (!dmRows.length) {
    list.innerHTML = `<p class="text-center opacity-30 py-16 text-xs font-black uppercase tracking-widest">
      No domains yet — use <span class="text-violet-400">Paste list</span></p>`;
    dmDetail(null);
    return;
  }
  if (!shown.length) {
    list.innerHTML = `<p class="text-center opacity-30 py-16 text-xs font-black uppercase tracking-widest">Nothing here</p>`;
    dmDetail(null);
    return;
  }

  const rank = s => DM_ORDER.indexOf(s || 'unknown');
  const val = {
    status: r => rank(r.status), domain: r => String(r.domain || ''),
    pwa: r => String(r.pwa || ''), ktid: r => String(r.ktid || ''),
    geo: r => String(r.geo || ''), checked: r => String(r.checked_at || '')
  };
  const get = val[dmSort.key] || val.status;
  shown = shown.slice().sort((a, b) => {
    const A = get(a), B = get(b);
    const d = typeof A === 'string' ? A.localeCompare(B) : A - B;
    return (dmSort.key === 'status' ? d : d * dmSort.dir)
        || String(a.domain).localeCompare(String(b.domain));
  });

  /* До назви воронки дописуємо країну. Поки гео було одне, група
     «Mbank» означала однозначну річ; із другою країною під тією самою
     назвою опиняються два різні набори доменів, і відрізнити їх у
     заголовку групи стає ніяк — стовпчик Geo видно лише в рядках, а
     дивляться саме на групу.

     Гео може й не бути (домен завели руками, не за шаблоном) — тоді
     лишається сама назва: дописувати «— no geo —» означало б зробити
     найдовший підпис у найменш цікавої групи. */
  const keyOf = r => dmGroup === 'pwa'
                     ? (r.pwa ? r.pwa + (r.geo ? ' · ' + r.geo : '') : '— no PWA —')
                   : dmGroup === 'status' ? DM_STATE[r.status || 'unknown'].label
                   : '';
  const groups = {};
  shown.forEach(r => (groups[keyOf(r)] = groups[keyOf(r)] || []).push(r));

  const arrow = k => dmSort.key === k ? (dmSort.dir < 0 ? ' ↓' : ' ↑') : '';
  const th = (k, label, cls) => `<th class="${cls || ''}" onclick="dmSortBy('${k}')">${label}${arrow(k)}</th>`;
  const COLS = 7;

  list.innerHTML = `<table class="cab-tbl">
    <thead><tr>
      ${th('status', 'Status')}
      ${th('domain', 'Domain')}
      ${th('pwa', 'PWA')}
      ${th('geo', 'Geo', 'ta-c')}
      ${th('ktid', 'KTID')}
      ${th('checked', 'Checked', 'ta-r')}
      <th class="ta-c">·</th>
    </tr></thead><tbody>
    ${Object.entries(groups).map(([g, items]) => {
      const nBad = items.filter(i => DM_BAD.includes(i.status)).length;
      const head = g ? `<tr class="cab-grp"><td colspan="${COLS}">
          <span class="cab-grp-name">${dmEsc(g)}</span>
          <span class="cab-grp-sub">${items.length}${nBad ? ` · <span class="text-red-400">${nBad} problem</span>` : ''}</span></td></tr>` : '';
      return head + items.map(dmRowHtml).join('');
    }).join('')}
    </tbody></table>`;

  dmDetail(shown.find(r => String(r.id) === String(dmSel)) || null);
}

function dmRowHtml(r) {
  const S = DM_STATE[r.status || 'unknown'];
  const enc = encodeURIComponent(String(r.id)).replace(/'/g, '%27');
  return `<tr class="cab-tr ${String(dmSel) === String(r.id) ? 'is-sel' : ''}" onclick="dmPick('${enc}')">
    <td><span class="cab-dot" style="background:${S.dot}"></span><span class="${S.tone} cab-state">${S.label}${
      r.status_code ? ` · ${r.status_code}` : ''}</span>${
      r.flagged_by ? `<span class="cab-chip" title="Which blacklist flagged it">${dmEsc(r.flagged_by)}</span>` : ''}</td>
    <td><button onclick="event.stopPropagation();dmCopy('${enc}',this)" class="dm-copy"
        title="Copy with https://" aria-label="Copy domain with https://">${DM_ICON_COPY}${DM_ICON_DONE}</button
      ><a href="https://${dmEsc(r.domain)}" target="_blank" rel="noopener"
        onclick="event.stopPropagation()" class="cab-id hover:underline">${dmEsc(r.domain)}</a>
      ${r.source === 'browser' ? '<span class="cab-src" title="Checked from the browser: it only tells whether the domain answered, not the HTTP code.">&#9998;</span>' : ''}</td>
    <td class="cab-dim">${dmEsc(r.pwa) || '—'}</td>
    <td class="ta-c cab-dim">${dmEsc(r.geo) || '—'}</td>
    <td class="cab-dim" title="${dmEsc(r.campaign || '')}">${dmEsc(r.ktid) || '—'}</td>
    <td class="ta-r cab-dim">${dmAgo(r.checked_at)}</td>
    <td class="ta-c"><button onclick="event.stopPropagation();dmCheckOne('${enc}')"
      class="cab-link" title="Check this one">&#8635;</button></td>
  </tr>`;
}

function dmDetail(r) {
  const box = document.getElementById('dm-detail');
  if (!box) return;
  if (!r) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  const S = DM_STATE[r.status || 'unknown'];
  const enc = encodeURIComponent(String(r.id));
  box.innerHTML = `<div class="card p-4 rounded-2xl">
    <div class="flex items-start justify-between gap-2 mb-3">
      <div class="min-w-0">
        <p class="text-[13px] font-black text-dynamic truncate">${dmEsc(r.domain)}</p>
        <p class="text-[10px] font-black uppercase tracking-widest ${S.tone}">${S.label}</p>
      </div>
      <button onclick="dmPick('${enc}')" class="text-slate-500 hover:text-red-400 text-lg leading-none">&times;</button>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      ${[['Checked', dmAgo(r.checked_at)],
         ['Source', r.source || '—'],
         ['HTTP', r.status_code || '—'],
         ['Flagged by', r.flagged_by || '—'],
         ['Geo', r.geo || '—'],
         ['KTID', r.ktid || '—'],
         ['Added', String(r.created_at || '').slice(0, 10) || '—']]
        .map(([k, v]) => `<div class="rounded-lg px-2 py-1.5" style="background:var(--surface-2)">
            <p class="text-[9px] font-black uppercase tracking-widest" style="color:var(--text-muted)">${k}</p>
            <p class="text-[12px] font-black text-dynamic font-mono">${dmEsc(v)}</p></div>`).join('')}
    </div>

    ${dmLiveBlock(r.domain)}

    ${r.campaign ? `<p class="text-[10px] font-mono mb-3 break-all" style="color:var(--text-muted)"
      title="The line this domain was pasted under">${dmEsc(r.campaign)}</p>` : ''}

    ${r.source === 'browser' ? `<p class="text-[10px] font-bold mb-3" style="color:var(--text-muted)">
      Checked from the browser, so HTTP is empty on purpose: a page cannot read the status code of another domain.
      A 404 and a working page look the same from here. Real codes need the Edge Function.</p>` : ''}

    <label class="block text-[9px] font-black uppercase tracking-widest mb-1" style="color:var(--text-muted)">PWA</label>
    <input value="${dmEsc(r.pwa || '')}" onchange="dmSaveField('${r.id}','pwa',this.value)"
      class="w-full bg-black/25 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-dynamic outline-none focus:border-violet-500 mb-2">

    <label class="block text-[9px] font-black uppercase tracking-widest mb-1" style="color:var(--text-muted)">Note</label>
    <textarea rows="3" onchange="dmSaveField('${r.id}','note',this.value)"
      class="w-full bg-black/25 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-dynamic outline-none focus:border-violet-500"
      placeholder="Where it is registered, which cabinet it ran on">${dmEsc(r.note || '')}</textarea>

    <div class="flex gap-2 mt-3">
      <button onclick="dmCheckOne('${enc}')"
        class="flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition
               text-violet-300 hover:text-white hover:bg-violet-600"
        style="border:1px solid rgba(139,92,246,.35)">Check</button>
      <button onclick="dmDelete('${enc}')"
        class="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition
               text-red-400 hover:text-white hover:bg-red-600"
        style="border:1px solid rgba(239,68,68,.35)">Delete</button>
    </div>
  </div>`;
}

/* Копіюємо саме з https://, бо домен майже завжди потрібен як посилання:
   вставити в браузер, у кабінет, у чат. Дописувати схему руками щоразу —
   те дрібне тертя, яке й робить список незручним.

   navigator.clipboard працює лише на https і лише з жесту користувача —
   тут і те, і те є. Але в старих браузерах його може не бути, тому
   запасний шлях через прихований textarea лишаємо. */
async function dmCopy(idEnc, btn) {
  const id = decodeURIComponent(idEnc);
  const row = dmRows.find(r => String(r.id) === String(id));
  if (!row) return;
  const text = 'https://' + row.domain;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e2) {}
    ta.remove();
  }
  /* Галочка просто на кнопці. Тост про копіювання перекриває підсумок
     перевірки й узагалі забагато шуму для дії, яку роблять десятками. */
  if (btn) {
    btn.classList.add('is-done');
    setTimeout(() => btn.classList.remove('is-done'), 1100);
  } else {
    toast(text, '', 1600);
  }
}

async function dmSaveField(id, key, value) {
  const row = dmRows.find(r => String(r.id) === String(id));
  if (!row) return;
  const prev = row[key];
  row[key] = value;
  const patch = {}; patch[key] = value;
  const { error } = await sb.from('domains').update(patch).eq('id', id);
  if (error) { row[key] = prev; alert('Could not save: ' + error.message); }
  dmRender();
}

async function dmDelete(idEnc) {
  const id = decodeURIComponent(idEnc);
  const row = dmRows.find(r => String(r.id) === String(id));
  if (!row) return;
  if (!await ask({ title: 'Remove from the list?', danger: true, ok: 'Remove',
    body: `Remove ${row.domain}?\n\nThis only deletes the row here — the domain itself is not touched.` })) return;
  const { error } = await sb.from('domains').delete().eq('id', id);
  if (error) { alert('Could not delete: ' + error.message); return; }
  dmRows = dmRows.filter(r => String(r.id) !== String(id));
  dmSel = null;
  dmRender();
}

/* ── ЩО КРУТИТЬСЯ НА ЦЬОМУ ДОМЕНІ ──

   Питання ставиться з іншого боку, ніж усе решта на цій сторінці: не
   «куди веде оголошення», а «що живе на домені». Відповідь пише
   fb-sync — поруч із кожним оголошенням лежить хост, на який воно
   веде.

   Тягнемо на вимогу, коли картку розгорнули, а не разом зі списком:
   у списку буває дві сотні доменів, і запит під кожен з них коштував
   би дорожче, ніж відповідь на питання, якого ніхто не поставив. */
const dmLive = {};          // домен → масив рядків | 'loading' | 'none'

async function dmLiveLoad(domain) {
  if (dmLive[domain] !== undefined) return;
  dmLive[domain] = 'loading';
  try {
    const { data, error } = await sb.from('fb_ad_today')
      .select('ad_id,name,campaign_name,account_id,spend')
      .eq('link_domain', domain).eq('effective_status', 'ACTIVE')
      .order('spend', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    dmLive[domain] = (data || []).length ? data : 'none';
  } catch (e) {
    /* Колонки ще немає — DOMAIN_GUARD.sql не виконаний. Це найчастіша
       причина, і в неї є рецепт; ховати її за «щось пішло не так»
       означало б відправити людину шукати ваду там, де її немає. */
    dmLive[domain] = /link_domain|does not exist|42703|fb_ad_today|42P01/i.test(e.message)
      ? 'nocol' : 'none';
  }
  dmRender();
}

/* Оголошення згортаємо в кампанії: під одним доменом їх бувають
   десятки, а шукати людина піде все одно за кабінетом і кампанією. */
function dmLiveBlock(domain) {
  const v = dmLive[domain];
  const wrap = (inner) => `<div class="dm-live rounded-lg px-2 py-2 mb-3" style="background:var(--surface-2)">
      <p class="text-[9px] font-black uppercase tracking-widest mb-1" style="color:var(--text-muted)">Live on this domain</p>
      ${inner}</div>`;
  const note = (t) => wrap(`<p class="text-[10px] font-bold" style="color:var(--text-muted)">${t}</p>`);
  if (v === undefined || v === 'loading') return note('Looking…');
  if (v === 'nocol') return note('Run DOMAIN_GUARD.sql, then sync once — after that this shows what is live here.');
  if (v === 'none') return note('Nothing active points here right now.');

  const by = new Map();
  v.forEach(r => {
    const key = (r.account_id || '?') + '|' + (r.campaign_name || r.ad_id);
    const cur = by.get(key);
    if (cur) { cur.ads++; cur.spend += Number(r.spend) || 0; }
    else by.set(key, { ads: 1, spend: Number(r.spend) || 0 });
  });
  const total = v.reduce((n, r) => n + (Number(r.spend) || 0), 0);
  const rows = [...by.entries()].sort((a, b) => b[1].spend - a[1].spend).map(([key, x]) => {
    const [acc, ...rest] = key.split('|');
    return `<div class="flex items-center justify-between gap-2 text-[10px] font-bold py-0.5">
        <span class="truncate text-dynamic" title="${dmEsc(rest.join('|'))}">${dmEsc(rest.join('|'))}</span>
        <span class="font-mono flex-shrink-0" style="color:var(--text-muted)">${dmEsc(acc)} · ${x.ads} · $${x.spend.toFixed(2)}</span>
      </div>`;
  });
  return wrap(`<p class="text-[10px] font-black text-dynamic mb-1">${v.length} ad(s) · $${total.toFixed(2)} today</p>`
    + rows.join(''));
}

/* ── ПРОБНЕ СПОВІЩЕННЯ ──

   Побачити, як виглядає тривога, треба ДО того, як домен справді
   помре — інакше перший раз, коли її читають, збігається з першим
   разом, коли вона потрібна. Лист іде лише тому, хто натиснув. */
async function dmTestAlert() {
  const btn = document.getElementById('dm-test-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    const { data: sess } = await sb.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) throw new Error('no session');
    const res = await fetch(SUPABASE_URL + '/functions/v1/check-domains', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY,
                 'content-type': 'application/json' },
      body: JSON.stringify({ team: currentTeam, test: true })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error || 'HTTP ' + res.status);
    toast(j.live
      ? 'Sent to your Telegram — ' + j.live + ' live ad(s) on ' + j.domain
      : 'Sent to your Telegram — nothing active on ' + j.domain + ' right now', 'ok');
  } catch (e) {
    toast('Test failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Test alert'; }
  }
}

window.dmInit = dmInit;
window.dmCheck = dmCheck;
window.dmCheckHelp = dmCheckHelp;
window.dmTestAlert = dmTestAlert;
