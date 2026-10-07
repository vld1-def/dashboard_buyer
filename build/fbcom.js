/* ═══════════ КОМЕНТАРІ ПІД ОГОЛОШЕННЯМИ ═══════════

   Просили «автоматично чистити коментарі — або дати дозвіл чистити
   самому з дашборда». Тут друге, і це свідомий вибір, а не півміри.

   Автоматика, яка видаляє чужі повідомлення, помиляється мовчки. Під
   оголошенням лежить не лише спам: там питання від людей, які збирались
   купити, і відповіді самої команди. Видалене не лишає сліду, тож
   дізнатись, що саме зітерло, неможливо в принципі. Коли захочеш саме
   автоматику — вона має працювати за ПРАВИЛАМИ (слова, посилання), і
   писати ці правила мусиш ти.

   ДВІ ДІЇ, і різниця між ними велика:
     Hide   — коментар лишається видимим тільки своєму авторові. Той не
              бачить, що його сховали, і не йде писати ще раз зі злості.
              Оборотно.
     Delete — назавжди, без жодного способу повернути.
   Тому Hide тут — головна кнопка, а Delete питає підтвердження.

   Текст коментарів — чужий і сирий. Він іде в розмітку тільки через
   fcmEsc: рівно тут і виглядає найпривабливіше зламати сторінку чиїмось
   ім'ям із кутовою дужкою. */

let fcmFor = '';       // для якого кабінета розкрито
let fcmList = null;    // [] або null, поки їдуть
let fcmErr = '';
let fcmNote = '';      // «нема чого модерувати» тощо
let fcmMore = false;   // постів більше, ніж ми встигли обійти
/* Сторінки, до яких не пустило, і чому. Саме СТОРІНКИ: причина в них
   одна на всі їхні пости, і п'ять однакових стін тексту замість одного
   рядка — це не діагностика, це шум. */
let fcmBlocked = [];
let fcmPagesSeen = null;
let fcmSeen = 0, fcmPosts = 0;
let fcmSel = [];       // вибрані id
let fcmBusy = '';
let fcmMsg = { html: '', tone: '' };

const fcmEsc = v => String(v == null ? '' : v)
  .replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

async function fcmCall(body) {
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

function fcmWhy(e) {
  const net = /failed to fetch|networkerror|load failed/i.test(e.message || '');
  return (e.code === 'missing' || net)
    ? 'The fb-comments function did not answer — deploy it first: '
      + '<span class="font-mono">supabase functions deploy fb-comments</span>'
    : fcmEsc(e.message);
}

const fcmSay = (html, tone) => {
  fcmMsg = { html, tone: tone || 'var(--text-muted)' };
  const el = document.getElementById('fcm-msg');
  if (!el) return;
  el.innerHTML = html;
  el.style.color = fcmMsg.tone;
};

async function fcmLoad(id) {
  fcmList = null;
  fcmErr = '';
  fcmNote = '';
  fcmMore = false;
  fcmBlocked = [];
  fcmPagesSeen = null;
  fcmSel = [];
  cabRefresh();
  try {
    const j = await fcmCall({ action: 'list', account_id: id });
    fcmList = j.comments || [];
    fcmNote = j.note || '';
    fcmMore = !!j.more;
    fcmSeen = Number(j.looked) || 0;
    fcmPosts = Number(j.posts) || 0;
    fcmBlocked = Array.isArray(j.blocked) ? j.blocked : [];
    fcmPagesSeen = j.pages_seen == null ? null : Number(j.pages_seen);
    /* Сторінки, до яких не пустило, — не привід сховати решту, але й
       мовчати про них не можна: інакше «коментарів немає» означало б
       водночас «їх справді немає» і «нам не дали подивитись». */
  } catch (e) {
    fcmList = [];
    fcmErr = fcmWhy(e);
  }
  if (fcmFor === id) cabRefresh();
}

/* Вимикач автоприховування. Командний, бо рішення «ховати все
   підряд» стосується всієї команди, а не того, хто першим відкрив
   налаштування. Немає запису — ховаємо: зняти приховування можна
   однією кнопкою, а непоміченого спаму під оголошенням не повернеш. */
window.fcLoadAutoHide = async function () {
  const el = document.getElementById('fc-autohide');
  if (!el) return;
  let on = true;
  try { on = (await getTeamSetting('fb_comments_autohide')) !== '0'; } catch (e) {}
  el.checked = on;
};

window.fcSaveAutoHide = async function () {
  const el = document.getElementById('fc-autohide');
  if (!el) return;
  await setTeamSetting('fb_comments_autohide', el.checked ? '1' : '0');
};

window.fcmToggle = function (idEnc) {
  const id = decodeURIComponent(idEnc);
  if (fcmFor === id) { fcmFor = ''; cabRefresh(); return; }
  fcmFor = id;
  fcmMsg = { html: '', tone: '' };
  fcmLoad(id);
};

window.fcmPick = function (cid) {
  const i = fcmSel.indexOf(cid);
  if (i < 0) fcmSel.push(cid); else fcmSel.splice(i, 1);
  cabRefresh();
};

window.fcmPickAll = function (on) {
  fcmSel = on ? (fcmList || []).map(c => c.id) : [];
  cabRefresh();
};

/* Дію виконуємо по постах: функція звіряє пост зі списком кабінета, і
   один виклик на всі коментарі одного посту — це і менше запитів, і
   рівно та межа, яку вона перевіряє. */
window.fcmAct = async function (idEnc, action) {
  if (fcmBusy) return;
  const id = decodeURIComponent(idEnc);
  const picked = (fcmList || []).filter(c => fcmSel.includes(c.id));
  if (!picked.length) return;

  if (action === 'delete' && !await ask({ title: 'Delete for good?', danger: true, ok: 'Delete',
      body: 'Delete ' + picked.length + ' comment(s)?\n\n'
        + 'There is no way back. If you only want them out of sight, use Hide — '
        + 'the author still sees their own comment and does not come back to repost it.' })) return;

  const byStory = new Map();
  picked.forEach(c => {
    const list = byStory.get(c.story);
    if (list) list.push(c.id); else byStory.set(c.story, [c.id]);
  });

  fcmBusy = 'Working…';
  cabRefresh();
  let done = 0;
  const bad = [];
  for (const [story, ids] of byStory) {
    try {
      const j = await fcmCall({ action, account_id: id, story_id: story, comment_ids: ids });
      done += Number(j.done) || 0;
      (j.problems || []).forEach(p => bad.push(p));
    } catch (e) {
      bad.push(e.message);
    }
  }
  fcmBusy = '';
  const word = action === 'delete' ? 'deleted' : action === 'hide' ? 'hidden' : 'shown again';
  fcmSay(done + ' comment(s) ' + word
    + (bad.length ? '<br>' + bad.slice(0, 3).map(fcmEsc).join('<br>') : ''),
    bad.length ? 'var(--warn)' : 'var(--ok)');
  // Перечитуємо: після видалення список на екрані — вже не те, що там є.
  await fcmLoad(id);
};

/* Короткий підпис часу. Повна дата в title: у стрічці важливо «давно
   чи щойно», а не число. */
function fcmAgo(iso) {
  const t = Date.parse(iso || '');
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return m + 'm';
  if (m < 1440) return Math.round(m / 60) + 'h';
  return Math.round(m / 1440) + 'd';
}

function fcmBlock(c) {
  if (!c || !c.fb) return '';
  const id = c.id;
  const enc = encodeURIComponent(id).replace(/'/g, '%27');
  if (fcmFor !== id) {
    return `<button type="button" onclick="fcmToggle('${enc}')" class="fbr-open"
        title="Read and moderate the comments under this cabinet's ads">Comments…</button>`;
  }

  const head = `<p class="fbr-head">Comments
      <button type="button" onclick="fcmToggle('${enc}')" title="Close">&times;</button></p>`;

  /* Чому не видно частини коментарів. Одна Сторінка — один рядок, із
     кількістю постів за ним: причина спільна, і повторювати її стільки
     разів, скільки постів, означало б ховати її ж. */
  const blocked = !fcmBlocked.length ? '' : `<div class="fcm-blocked">
      <p class="fcm-blocked-head">${fcmBlocked.length} page(s) closed to this token${
        fcmPagesSeen != null ? ' \u00b7 the system user has ' + fcmPagesSeen + ' page(s) in total' : ''}</p>
      ${fcmBlocked.map(b => `<p class="fcm-blocked-row"><b>${fcmEsc(b.page)}</b>${
        b.posts > 1 ? ' (' + b.posts + ' posts)' : ''}<br>${fcmEsc(b.why)}</p>`).join('')}
    </div>`;

  if (fcmList === null) return `<div class="fbr">${head}
    <p class="fbr-hint">Asking Facebook… this walks every ad of the cabinet, so it takes a moment.</p></div>`;

  const rows = fcmList.map(x => {
    const on = fcmSel.includes(x.id);
    return `<label class="fcm-row ${on ? 'is-on' : ''} ${x.is_hidden ? 'is-hidden' : ''}">
      <input type="checkbox" ${on ? 'checked' : ''} onchange="fcmPick('${fcmEsc(x.id)}')">
      <span class="fcm-body">
        <span class="fcm-top">
          <b>${fcmEsc(x.from || 'someone')}</b>
          <span title="${fcmEsc(x.created_time || '')}">${fcmAgo(x.created_time)}</span>
          ${x.is_hidden ? '<span class="fcm-tag">hidden</span>' : ''}
          ${x.likes ? '<span class="fcm-tag">♥ ' + x.likes + '</span>' : ''}
        </span>
        <span class="fcm-text">${fcmEsc(x.message) || '<i>no text — a photo or a sticker</i>'}</span>
        <span class="fcm-ad" title="${fcmEsc(x.ad)}${
            x.live ? '' : ' — this ad is not running any more, so nothing new will be written here'}">${
          fcmEsc(x.ad)}${x.ads > 1 ? ' +' + (x.ads - 1) : ''}${
          x.live ? '' : ' \u00b7 stopped'}</span>
      </span></label>`;
  }).join('');

  const n = fcmSel.length;
  const acts = `<div class="fcm-acts">
      <button type="button" onclick="fcmAct('${enc}','hide')" ${n && !fcmBusy ? '' : 'disabled'}
        title="Only the author keeps seeing it. Reversible.">Hide${n ? ' ' + n : ''}</button>
      <button type="button" onclick="fcmAct('${enc}','unhide')" ${n && !fcmBusy ? '' : 'disabled'}
        title="Put them back in public view">Unhide</button>
      <button type="button" onclick="fcmAct('${enc}','delete')" class="is-bad"
        ${n && !fcmBusy ? '' : 'disabled'} title="Gone for good">Delete</button>
    </div>`;

  return `<div class="fbr">${head}
    ${fcmErr ? `<p class="fbr-hint is-bad">${fcmErr}</p>` : ''}
    ${blocked}
    ${!fcmList.length
      ? `<p class="fbr-hint">${fcmEsc(fcmNote) || 'Nothing has been written under these ads yet.'}</p>`
      : `<label class="fcm-all"><input type="checkbox" ${
            fcmSel.length === fcmList.length ? 'checked' : ''}
            onchange="fcmPickAll(this.checked)"> ${fcmList.length} comment(s)</label>
         <div class="fcm-list">${rows}</div>
         ${acts}`}
    ${fcmMore ? `<p class="fbr-hint">Checked ${fcmSeen} of ${fcmPosts} posts — the ones with a
       running ad first, since that is where new comments land. The rest are older posts
       nothing points at right now.</p>` : ''}
    <p id="fcm-msg" class="fbr-hint"${fcmMsg.tone ? ` style="color:${fcmMsg.tone}"` : ''}>${fcmMsg.html}</p>
  </div>`;
}
