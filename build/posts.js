/* ═══════════ ПОСТИ НА СТОРІНКИ ═══════════

   Сторінка пише В БАЗУ, а публікує функція. Токен Сторінки у вкладку
   не потрапляє ніколи: браузер шле у fb-post лише номер рядка, решту
   функція читає сама. Так само влаштовані fb-proxy і fb-comments.

   ЧОМУ СПЕРШУ РЯДОК, А ПОТІМ ВІДПРАВКА. Якби браузер слав текст прямо
   у функцію, то пост, який Facebook відхилив, не лишав би по собі
   нічого: ні тексту, ні причини. Рядок створюється до відправки, тому
   відмова має куди лягти і її видно в черзі.

   СПИСОК СТОРІНОК — З fb_cabinet_pages. Це ті Сторінки, які бачать
   твої кабінети; інших ми однаково не дістанемо. can_moderate каже,
   чи видана Сторінка системному користувачеві — без цього пост не
   піде, і краще сказати про це ДО того, як людина написала текст. */

let psPosts = [], psPages = [], psF = '', psBusy = false;

/* КАРТИНКА: ФАЙЛ ЛЕЖИТЬ У НАС, FACEBOOK ОТРИМУЄ ТИМЧАСОВЕ ПОСИЛАННЯ.

   Бакет приватний. Коли пост відправляється, fb-post підписує
   посилання на хвилини й віддає його Graph — Facebook качає картинку
   в момент виклику, навіть для запланованого поста: саме зображення
   створюється одразу, відкладається лише публікація.

   У рядку зберігається не адреса, а шлях із позначкою storage:. Так
   видно з одного погляду, чиє це зображення — наше чи чуже, — і
   підписувати треба лише перше. */
const PS_BUCKET = 'post-images';
const PS_MARK = 'storage:';
let psUp = null;                 // {path, url} щойно залитого файлу

const psEsc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PS_ST = {
  draft:     { l: 'чернетка',   c: '' },
  scheduled: { l: 'заплановано', c: 'is-warn' },
  published: { l: 'вийшов',     c: 'is-ok' },
  failed:    { l: 'відмова',    c: 'is-bad' }
};

function psSay(t, bad) {
  const el = document.getElementById('ps-say');
  if (!el) return;
  el.textContent = t || '';
  el.className = 'ps-hint' + (bad ? ' is-bad' : '');
}

/* МЕЖА РОЗМІРУ. Facebook приймає до 4 МБ на зображення у постах; до
   того ж кожен зайвий мегабайт — це час заливу й час, поки Graph його
   качає. Зменшуємо довгу сторону до 1600: для стрічки цього з запасом
   (Meta радить від 1200 по ширині), а вага падає в рази.

   Якщо canvas не впорався — заливаємо як є: важка картинка краща за
   жодної. */
const PS_MAX_SIDE = 1600;
function psShrink(file) {
  return new Promise(resolve => {
    if (!/^image\//.test(file.type) || /gif$/i.test(file.type)) return resolve(file);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const k = Math.min(1, PS_MAX_SIDE / Math.max(img.width, img.height));
        if (k === 1 && file.size < 3.5 * 1048576) { URL.revokeObjectURL(url); return resolve(file); }
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => { URL.revokeObjectURL(url); resolve(b || file); }, 'image/jpeg', 0.9);
      } catch (e) { URL.revokeObjectURL(url); resolve(file); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

window.psPick = async function (input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  psSay('Заливаю картинку…');
  try {
    const small = await psShrink(file);
    /* Ім'я з часом і випадковим хвостом: два однакових «photo.jpg» від
       двох людей не мають перетирати один одного. */
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
    const path = String(currentTeam || 'team') + '/' + Date.now() + '_'
               + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await sb.storage.from(PS_BUCKET).upload(path, small,
      { contentType: small.type || file.type || 'image/jpeg', upsert: false });
    if (error) throw new Error(error.message);
    const { data: sg } = await sb.storage.from(PS_BUCKET).createSignedUrl(path, 3600);
    psUp = { path, url: (sg && sg.signedUrl) || '' };
    document.getElementById('ps-img').value = '';
    psPrev();
    psSay('Картинка готова');
  } catch (e) {
    const m = String(e.message || e);
    psSay(/bucket|not found|does not exist/i.test(m)
      ? 'Бакета post-images ще немає — виконай POST_IMAGES.sql'
      : 'Картинка не залилась: ' + m, true);
  }
};

window.psImgHint = function () {
  if (document.getElementById('ps-img')?.value.trim()) { psUp = null; psPrev(); }
};

function psPrev() {
  const box = document.getElementById('ps-prev');
  if (!box) return;
  const by = document.getElementById('ps-img')?.value.trim();
  const src = psUp ? psUp.url : by;
  box.innerHTML = src
    ? `<img src="${psEsc(src)}" alt="" onerror="this.remove()">
       <button type="button" class="ps-mini" onclick="psDropImg()">прибрати</button>
       <span class="ps-hint">${psUp ? 'файл у сховищі команди' : 'за адресою'}</span>`
    : '';
}

window.psDropImg = function () {
  psUp = null;
  const el = document.getElementById('ps-img'); if (el) el.value = '';
  psPrev();
};

function psCount() {
  const n = (document.getElementById('ps-msg')?.value || '').length;
  const el = document.getElementById('ps-count');
  if (el) el.textContent = n;
}

function psWhen() {
  const at = document.querySelector('input[name="ps-when"]:checked')?.value === 'at';
  const box = document.getElementById('ps-at');
  if (box) box.style.display = at ? '' : 'none';
}

window.psFilter = function (btn) {
  psF = btn.getAttribute('data-f') || '';
  document.querySelectorAll('.ps-tab').forEach(b => b.classList.toggle('is-on', b === btn));
  psPaint();
};

async function psInit() { if (!psPosts.length && !psPages.length) await psLoad(false); }

window.psLoad = async function (loud) {
  const note = document.getElementById('ps-note');
  if (note) note.textContent = '';
  try {
    const [pg, po] = await Promise.all([
      sb.from('fb_cabinet_pages').select('page_id,page_name,can_moderate')
        .eq('team_name', currentTeam),
      sb.from('fb_posts').select('*').eq('team_name', currentTeam)
        .order('created_at', { ascending: false }).limit(200)
    ]);
    /* Таблиці ще немає — це не поломка, а невиконана міграція, і
       сказати треба саме це: «не вдалося» відправить шукати проблему
       не туди. */
    if (po.error) {
      const m = String(po.error.message || '');
      if (note) note.textContent = /fb_posts|does not exist|schema cache/i.test(m)
        ? 'Таблиці fb_posts ще немає — виконай FB_POSTS.sql у Supabase, тоді онови сторінку.'
        : 'Пости не прочитались: ' + m;
      psPosts = [];
    } else psPosts = po.data || [];

    /* Одна Сторінка часто видно з кількох кабінетів — зводимо в одну
       позицію, інакше в списку буде один і той самий майданчик тричі. */
    const seen = new Map();
    (pg.data || []).forEach(p => {
      const k = String(p.page_id);
      const was = seen.get(k);
      if (!was || (!was.can_moderate && p.can_moderate)) seen.set(k, p);
    });
    psPages = [...seen.values()].sort((a, b) =>
      String(a.page_name || a.page_id).localeCompare(String(b.page_name || b.page_id), 'uk'));
  } catch (e) {
    if (note) note.textContent = 'Не вдалось прочитати: ' + (e.message || e);
  }
  psPaintPages();
  psPaint();
  if (loud && typeof toast === 'function') toast('Оновлено', 'ok', 1500);
};

function psPaintPages() {
  const sel = document.getElementById('ps-page');
  if (!sel) return;
  if (!psPages.length) {
    sel.innerHTML = '<option value="">Сторінок не видно</option>';
    document.getElementById('ps-page-hint').textContent =
      'Жодної Сторінки не знайдено. Натисни Sync now на вкладці кабінетів — список Сторінок приходить звідти.';
    return;
  }
  sel.innerHTML = psPages.map(p =>
    `<option value="${psEsc(p.page_id)}">${psEsc(p.page_name || p.page_id)}</option>`).join('');
  sel.onchange = psPageHint;
  psPageHint();
}

/* Сторінка без модерації видна, але постити в неї не вийде. Кажемо це
   одразу, а не після того, як людина написала текст і натиснула. */
function psPageHint() {
  const id = document.getElementById('ps-page')?.value;
  const p = psPages.find(x => String(x.page_id) === String(id));
  const el = document.getElementById('ps-page-hint');
  if (!el || !p) return;
  el.textContent = p.can_moderate
    ? 'Сторінка видана системному користувачеві — публікація можлива.'
    : 'Ця Сторінка не видана системному користувачеві. Пост не піде, поки її не додадуть у Business Manager із задачею контенту.';
  el.className = 'ps-hint' + (p.can_moderate ? '' : ' is-bad');
}

function psPaint() {
  const box = document.getElementById('ps-list');
  if (!box) return;
  const rows = psPosts.filter(p => !psF || p.status === psF);
  if (!rows.length) {
    box.innerHTML = `<p class="ps-empty">${psPosts.length
      ? 'За цим фільтром порожньо'
      : 'Жодного поста ще немає'}</p>`;
    return;
  }
  box.innerHTML = rows.map(p => {
    const st = PS_ST[p.status] || PS_ST.draft;
    const when = p.publish_at ? new Date(p.publish_at).toLocaleString('uk-UA',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="ps-row">
      <div class="ps-row-top">
        <span class="ps-tag ${st.c}">${st.l}</span>
        <span class="ps-page">${psEsc(p.page_name || p.page_id)}</span>
        ${when ? `<span class="ps-when-at">${psEsc(when)}</span>` : ''}
        ${p.status === 'draft' ? `<button type="button" class="ps-mini is-main"
            onclick="psSend('${p.id}')">Опублікувати</button>` : ''}
        ${p.status === 'draft' || p.status === 'failed'
          ? `<button type="button" class="ps-mini" onclick="psDrop('${p.id}')">×</button>` : ''}
      </div>
      <p class="ps-text">${psEsc(p.message || '').slice(0, 220) || '<i>без тексту</i>'}</p>
      ${p.link ? `<p class="ps-sub">${psEsc(p.link)}</p>` : ''}
      ${p.error ? `<p class="ps-err">${psEsc(p.error)}</p>` : ''}
    </div>`;
  }).join('');
}

function psForm() {
  const page = document.getElementById('ps-page')?.value || '';
  const p = psPages.find(x => String(x.page_id) === String(page));
  const at = document.querySelector('input[name="ps-when"]:checked')?.value === 'at';
  const when = at ? document.getElementById('ps-at')?.value : '';
  return {
    team_name: currentTeam,
    page_id: page,
    page_name: p ? (p.page_name || p.page_id) : page,
    message: document.getElementById('ps-msg')?.value || '',
    link: document.getElementById('ps-link')?.value || null,
    /* Залитий файл перемагає адресу: якщо людина щойно вибрала файл,
       це і є її вибір, а поле адреси могло лишитись від попереднього. */
    image_url: psUp ? (PS_MARK + psUp.path)
                    : (document.getElementById('ps-img')?.value || null),
    publish_at: when ? new Date(when).toISOString() : null
  };
}

async function psInsert(form) {
  const { data, error } = await sb.from('fb_posts').insert(form).select('id').limit(1);
  if (error) throw new Error(error.message);
  return data && data[0] && data[0].id;
}

window.psSave = async function () {
  const f = psForm();
  if (!f.page_id) { psSay('Спершу вибери Сторінку', true); return; }
  if (!f.message.trim() && !f.image_url) { psSay('Посту потрібен текст або картинка', true); return; }
  try {
    await psInsert(f);
    psSay('Збережено чернеткою');
    await psLoad(false);
  } catch (e) { psSay('Не зберіглось: ' + (e.message || e), true); }
};

/* Відправка: або нового (спершу створюємо рядок), або наявної
   чернетки за її id. Рядок існує до звернення у Facebook, тому
   відмові є куди лягти. */
window.psSend = async function (id) {
  if (psBusy) return;
  psBusy = true;
  const btn = document.getElementById('ps-send');
  if (btn && !id) { btn.disabled = true; btn.textContent = 'Відправляю…'; }
  try {
    let rowId = id;
    if (!rowId) {
      const f = psForm();
      if (!f.page_id) throw new Error('Спершу вибери Сторінку');
      if (!f.message.trim() && !f.image_url) throw new Error('Посту потрібен текст або картинка');
      rowId = await psInsert(f);
    }
    const { data: s } = await sb.auth.getSession();
    const jwt = s?.session?.access_token;
    if (!jwt) throw new Error('Сесія скінчилась — зайди ще раз');
    const res = await fetch(SUPABASE_URL + '/functions/v1/fb-post', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + jwt, apikey: SUPABASE_KEY,
                 'content-type': 'application/json' },
      body: JSON.stringify({ row_id: rowId })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      /* Функції ще немає — це не «щось пішло не так», а не виконаний
         крок розгортання, і сказати треба саме його. */
      throw new Error(res.status === 404
        ? 'Функція fb-post ще не задеплоєна: supabase functions deploy fb-post'
        : (j.error || 'HTTP ' + res.status));
    }
    psSay(j.status === 'scheduled' ? 'Заплановано на Сторінці ' + j.page : 'Опубліковано на ' + j.page);
    const msg = document.getElementById('ps-msg'); if (msg && !id) msg.value = '';
    if (!id) { psUp = null; const im = document.getElementById('ps-img'); if (im) im.value = ''; psPrev(); }
    psCount();
    await psLoad(false);
  } catch (e) {
    psSay(String(e.message || e), true);
    await psLoad(false);
  } finally {
    psBusy = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Опублікувати'; }
  }
};

/* Видаляємо лише те, що ще не пішло. Опублікований пост стирається в
   самому Facebook: прибрати рядок у нас означало б втратити слід від
   того, що зараз живе в стрічці. */
window.psDrop = async function (id) {
  const p = psPosts.find(x => String(x.id) === String(id));
  if (!p) return;
  if (!await ask({ title: 'Прибрати цей запис?', ok: 'Прибрати', danger: true,
      body: 'Зникне тільки рядок у черзі. У Facebook нічого не зміниться.' })) return;
  const { error } = await sb.from('fb_posts').delete().eq('id', id);
  if (error) { psSay('Не вийшло: ' + error.message, true); return; }
  await psLoad(false);
};

window.psInit = psInit;
