<script>
/* ══════════════════════════════════════════════════════════════════
   СТОРІНКИ — ІНШИЙ ВХІД У ТІ САМІ КОМЕНТАРІ

   У картці кабінета давно є «Comments…»: що пишуть під оголошеннями
   ЦЬОГО кабінета. Питання робоче, але не єдине. Пост Сторінки живе
   довше за оголошення, а коментар під ним лишається й після того, як
   оголошення зупинили — і тоді кабінетний шлях до нього не веде
   ніяк: у списку оголошень того посту вже немає.

   Тому тут список САМИХ СТОРІНОК: усіх, які бачать твої токени. Видно
   відразу те, через що найчастіше й спотикаються, — де прибирати
   коментарі МОЖНА, а де Сторінку лише видали покрутити.

   ПОЗНАЧКИ. Коментар буває у трьох станах, і їх не варто плутати:
     visible — на людях;
     hidden  — бачить лише автор. Оборотно, і автор не знає, що його
               сховали, тож писати зі злості вдруге не йде;
     deleted — назавжди.
   Delete питає підтвердження, і видалене лишається в списку з
   позначкою до наступного перечитування: Facebook про видалене не
   пам'ятає нічого, тож якщо не показати це тут, не лишиться жодного
   слiду, що саме прибрали.

   МЕЖУ СТАВИТЬ НЕ ЦЕЙ ЕКРАН. page_id, який піде у функцію, нічого не
   доводить сам по собі: це рядок у тілі запиту. Функція звіряє його з
   тими Сторінками, які мають ТОКЕНИ ТОГО, ХТО ПРИЙШОВ, і токен
   Сторінки виводить із цієї ж перевіреної Сторінки. Тут — лише екран.

   Текст коментарів чужий і сирий, тож у розмітку він іде тільки через
   pgEsc. ══════════════════════════════════════════════════════════ */

let pgRows = null;       // null — ще не питали
let pgErr = '', pgProb = [];
let pgSel = '';          // яка Сторінка розкрита
let pgList = null;       // коментарі розкритої, null — їдуть
let pgListErr = '', pgNote = '', pgMore = false, pgCan = true;
let pgPicked = [];       // вибрані коментарі
let pgGone = [];         // що видалили цього разу — щоб лишився слід
let pgBusy = '';
let pgMsg = { html: '', tone: '' };

const pgEsc = v => String(v == null ? '' : v)
  .replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* ── ПАНЕЛЬ ПРАВОРУЧ ──
   Місце праве одне, тож картка кабінета й правила при цьому
   закриваються: дві панелі поруч розчавили б таблицю, заради якої
   сторінку й відкривали. */
window.pgPanel = function (want) {
  const box = document.getElementById('pages-panel');
  if (!box) return;
  const open = want === undefined ? box.classList.contains('hidden') : !!want;
  box.classList.toggle('hidden', !open);
  document.getElementById('cab-pages-btn')?.classList.toggle('is-on', open);
  if (!open) return;
  if (typeof rlPanel === 'function') rlPanel(false);
  if (typeof cabSel !== 'undefined' && cabSel) { cabSel = null; cabRender(); }
  pgLoad();
};

async function pgCall(body) {
  const { data: sess } = await sb.auth.getSession();
  const token = sess && sess.session && sess.session.access_token;
  if (!token) throw new Error('not signed in');
  const res = await fetch(SUPABASE_URL + '/functions/v1/fb-comments', {
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

/* Та сама порада, що й у кабінетному шляху: «не відповіла» майже
   завжди означає «ще не розгорнута», і казати це прямо коштує
   дешевше, ніж шукати. */
function pgWhy(e) {
  const msg = String(e.message || '');
  const net = /failed to fetch|networkerror|load failed/i.test(msg);
  if (e.code === 'missing' || net)
    return 'The fb-comments function did not answer — deploy it first: '
         + '<span class="font-mono">supabase functions deploy fb-comments</span>';
  /* Стара версія функції про Сторінки не знає й падає на тому, що в
     неї немає account_id. Сире «account_id is required» відправило б
     шукати ваду в цьому екрані, тоді як лікується воно одним
     розгортанням. */
  if (/account_id is required|unknown action/i.test(msg))
    return 'The deployed fb-comments is older than this page: it does not know about Pages yet. '
         + 'Redeploy it — <span class="font-mono">supabase functions deploy fb-comments</span>';
  return pgEsc(msg);
}

window.pgLoad = async function (force) {
  if (pgRows && !force) { pgPaint(); return; }
  pgErr = ''; pgProb = [];
  if (force) { pgSel = ''; pgList = null; pgGone = []; }
  pgRows = null;
  pgPaint();
  try {
    const j = await pgCall({ action: 'pages' });
    pgRows = Array.isArray(j.pages) ? j.pages : [];
    pgProb = Array.isArray(j.problems) ? j.problems : [];
  } catch (e) {
    pgRows = [];
    pgErr = pgWhy(e);
  }
  pgPaint();
};

window.pgPick = async function (idEnc) {
  const id = decodeURIComponent(idEnc);
  if (pgSel === id) { pgSel = ''; pgPaint(); return; }
  pgSel = id;
  pgList = null; pgListErr = ''; pgNote = ''; pgMore = false;
  pgPicked = []; pgGone = []; pgMsg = { html: '', tone: '' };
  pgPaint();
  try {
    const j = await pgCall({ action: 'page_list', page_id: id });
    pgList = Array.isArray(j.comments) ? j.comments : [];
    pgNote = j.note || '';
    pgMore = !!j.more;
    pgCan = j.can_moderate !== false;
    pgProb = Array.isArray(j.problems) ? j.problems : [];
  } catch (e) {
    pgList = [];
    pgListErr = pgWhy(e);
  }
  if (pgSel === id) pgPaint();
};

window.pgToggle = function (idEnc) {
  const id = decodeURIComponent(idEnc);
  const i = pgPicked.indexOf(id);
  if (i < 0) pgPicked.push(id); else pgPicked.splice(i, 1);
  pgPaint();
};

window.pgPickAll = function (on) {
  pgPicked = on ? (pgList || []).filter(c => !pgGone.includes(c.id)).map(c => c.id) : [];
  pgPaint();
};

window.pgAct = async function (what) {
  if (pgBusy || !pgSel) return;
  const ids = (pgList || []).filter(c => pgPicked.includes(c.id)).map(c => c.id);
  if (!ids.length) return;

  if (what === 'delete' && !await ask({ title: 'Delete for good?', danger: true, ok: 'Delete',
      body: 'Delete ' + ids.length + ' comment(s)?\n\n'
        + 'There is no way back. If you only want them out of sight, use Hide — the author '
        + 'still sees their own comment and does not come back to repost it.' })) return;

  pgBusy = 'Working…';
  pgPaint();
  let done = 0; const bad = [];
  try {
    const j = await pgCall({ action: 'page_act', page_id: pgSel, what, comment_ids: ids });
    done = Number(j.done) || 0;
    (j.problems || []).forEach(p => bad.push(p));
  } catch (e) {
    bad.push(e.message);
  }
  pgBusy = '';

  /* Видалене тримаємо на екрані з позначкою: Facebook про нього не
     пам'ятає нічого, і якби ми просто перечитали список, не лишилось
     би жодного слiду, що саме прибрали. Приховане ж перечитується
     чесно — там стан бере сам Facebook. */
  if (what === 'delete' && done) {
    ids.forEach(id => { if (!pgGone.includes(id)) pgGone.push(id); });
    pgPicked = [];
    pgMsg = { html: done + ' comment(s) deleted'
      + (bad.length ? '<br>' + bad.slice(0, 3).map(pgEsc).join('<br>') : ''),
      tone: bad.length ? 'var(--warn)' : 'var(--ok)' };
    pgPaint();
    return;
  }

  const word = what === 'hide' ? 'hidden' : 'shown again';
  pgMsg = { html: done + ' comment(s) ' + word
    + (bad.length ? '<br>' + bad.slice(0, 3).map(pgEsc).join('<br>') : ''),
    tone: bad.length ? 'var(--warn)' : 'var(--ok)' };
  // Перечитуємо: стан «сховано» знає Facebook, а не ми.
  const keep = pgSel;
  pgSel = '';
  await pgPick(encodeURIComponent(keep));
};

/* Короткий підпис часу: у стрічці важливо «давно чи щойно», а не
   число. Повна дата — у title. */
function pgAgo(iso) {
  const t = Date.parse(iso || '');
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return m + 'm';
  if (m < 1440) return Math.round(m / 60) + 'h';
  return Math.round(m / 1440) + 'd';
}

function pgRowHtml(r) {
  const enc = encodeURIComponent(String(r.page_id)).replace(/'/g, '%27');
  const open = pgSel === String(r.page_id);
  return `<div class="pg-item ${open ? 'is-open' : ''}">
    <button type="button" class="pg-pick" onclick="pgPick('${enc}')"
      title="${r.can_moderate
        ? 'Read and moderate what people write under this Page'
        : 'Read only: this token was not given the Moderate content task on this Page'}">
      ${/* АВАТАР. Сторінки впізнають по лого швидше, ніж по назві —
            особливо коли їх двадцять і половина зветься схоже.

            Адреса веде на CDN Facebook і з часом протухає. Тому
            onerror прибирає саме зображення, а не ламає рядок: краще
            список без картинок, ніж список із порожніми рамками.
            referrerpolicy — щоб Facebook не діставав адресу нашої
            сторінки з кожного завантаження аватарки. */
        r.pic ? `<img class="pg-pic" src="${pgEsc(r.pic)}" alt="" loading="lazy"
                   referrerpolicy="no-referrer" onerror="this.remove()">`
              : '<span class="pg-pic is-none"></span>'}
      <span class="pg-name">${pgEsc(r.name || '#' + r.page_id)}</span>
      <span class="pg-tags">
        ${r.can_moderate ? '' : '<span class="fcm-tag">read only</span>'}
        ${r.token ? `<span class="pg-tok" title="Seen through the token ${pgEsc(r.token)}">${pgEsc(r.token)}</span>` : ''}
      </span>
      <span class="pg-arrow">${open ? '&minus;' : '+'}</span></button>
    ${open ? pgComments() : ''}</div>`;
}

function pgComments() {
  if (pgList === null) return `<p class="fbr-hint">Asking Facebook… this walks the latest posts
    of the Page, so it takes a moment.</p>`;

  const rows = pgList.map(c => {
    const gone = pgGone.includes(c.id);
    const on = pgPicked.includes(c.id);
    const enc = encodeURIComponent(c.id).replace(/'/g, '%27');
    return `<label class="fcm-row ${on ? 'is-on' : ''} ${gone || c.is_hidden ? 'is-hidden' : ''}">
      <input type="checkbox" ${on ? 'checked' : ''} ${gone ? 'disabled' : ''}
        onchange="pgToggle('${enc}')">
      <span class="fcm-body">
        <span class="fcm-top">
          <b>${pgEsc(c.from || 'someone')}</b>
          <span title="${pgEsc(c.created_time || '')}">${pgAgo(c.created_time)}</span>
          ${gone ? '<span class="fcm-tag is-bad">deleted</span>'
                 : c.is_hidden ? '<span class="fcm-tag">hidden</span>'
                               : '<span class="fcm-tag is-ok">visible</span>'}
          ${c.likes ? '<span class="fcm-tag">&#9829; ' + c.likes + '</span>' : ''}
        </span>
        <span class="fcm-text">${pgEsc(c.message) || '<i>no text — a photo or a sticker</i>'}</span>
        <span class="fcm-ad" title="The post this comment sits under">${pgEsc(c.ad)}${
          c.live ? '' : ' · not published'}</span>
      </span></label>`;
  }).join('');

  const n = pgPicked.length;
  /* Про «лише читати» кажемо НЕЗАЛЕЖНО від того, чи є коментарі:
     якщо сказати це тільки разом зі списком, то на тихій Сторінці
     брак прав виявився б аж у мить, коли під нею вперше щось
     написали й натиснули Hide. */
  const ro = pgCan ? '' : `<p class="fbr-hint">Read only: to hide or delete here, give this Page
       the Moderate content task in Business Manager and add
       <span class="font-mono">pages_manage_engagement</span> to the token.</p>`;
  const acts = !pgCan
    ? ''
    : `<div class="fcm-acts">
      <button type="button" onclick="pgAct('hide')" ${n && !pgBusy ? '' : 'disabled'}
        title="Only the author keeps seeing it. Reversible.">Hide${n ? ' ' + n : ''}</button>
      <button type="button" onclick="pgAct('unhide')" ${n && !pgBusy ? '' : 'disabled'}
        title="Put them back in public view">Show</button>
      <button type="button" onclick="pgAct('delete')" class="is-bad"
        ${n && !pgBusy ? '' : 'disabled'} title="Gone for good">Delete</button>
    </div>`;

  return `<div class="pg-cm">
    ${pgListErr ? `<p class="fbr-hint is-bad">${pgListErr}</p>` : ''}
    ${ro}
    ${!pgList.length
      ? `<p class="fbr-hint">${pgEsc(pgNote) || 'Nothing has been written under the latest posts of this Page.'}</p>`
      : `<label class="fcm-all"><input type="checkbox" ${
            n && n === pgList.filter(c => !pgGone.includes(c.id)).length ? 'checked' : ''}
            onchange="pgPickAll(this.checked)"> ${pgList.length} comment(s)</label>
         <div class="fcm-list">${rows}</div>
         ${acts}`}
    ${pgMore ? '<p class="fbr-hint">Only the latest posts were walked — older ones are not checked yet.</p>' : ''}
    ${pgBusy ? `<p class="fbr-hint">${pgBusy}</p>` : ''}
    <p class="fbr-hint"${pgMsg.tone ? ` style="color:${pgMsg.tone}"` : ''}>${pgMsg.html}</p>
  </div>`;
}

function pgPaint() {
  const list = document.getElementById('pg-list');
  const note = document.getElementById('pg-note');
  if (!list) return;
  /* Підпис ховається, коли Сторінки є (нижче). Повертаємо його на
     початку КОЖНОЇ перемальовки: інакше перша ж помилка після
     успішного списку лягла б у схований елемент і не з'явилась би
     на екрані зовсім. */
  if (note) note.style.display = '';

  if (pgRows === null) {
    if (note) { note.textContent = 'Asking Facebook which Pages your tokens have…'; note.className = 'rl-note'; }
    list.innerHTML = '';
    return;
  }
  if (pgErr) {
    if (note) { note.innerHTML = pgErr; note.className = 'rl-note is-warn'; }
    list.innerHTML = '';
    return;
  }

  const q = (document.getElementById('pg-q')?.value || '').toLowerCase().trim();
  const rows = pgRows.filter(r => !q || String(r.name || '').toLowerCase().includes(q)
                                      || String(r.page_id).includes(q));
  const can = pgRows.filter(r => r.can_moderate).length;

  /* НАД СПИСКОМ — НІЧОГО, ПОКИ СТОРІНКИ Є.

     Тут стояв рядок «N Page(s) · N where comments can be moderated»
     і під ним скарги токенів. Коли Сторінки на екрані, обидва
     повторюють те, що й так видно: порахувати два рядки можна очима,
     а право модерації стоїть міткою «read only» на самій Сторінці.

     Коли ж Сторінок НЕМАЄ, лишається рівно навпаки: порожня панель
     сама по собі не каже нічого, і тоді текст — єдине, що пояснює
     причину. Скарги токенів тут і є причиною («токен не вміє читати
     коментарі»), тому в цьому випадку вони лишаються. */
  if (note) {
    const empty = !pgRows.length;
    note.className = 'rl-note';
    note.innerHTML = empty
      ? 'No Pages: the tokens in Settings do not have any Page assigned to their system user.'
        + (pgProb.length ? '<br>' + pgProb.map(pgEsc).join('<br>') : '')
      : '';
    // Порожній <p> лишав би над списком свій відступ — саме той
    // проміжок, через який текст і заважав.
    if (!empty) note.style.display = 'none';
  }

  list.innerHTML = !rows.length
    ? '<p class="fbr-hint">Nothing matches the filter.</p>'
    : rows.map(pgRowHtml).join('');
}
</script>
