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
/* Скільки Сторінок приховано як недоступні — щоб сказати це числом,
   а не лишати людину гадати, куди поділась її Сторінка. */
let psHidden = 0;

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
  published: { l: 'опубліковано', c: 'is-ok' },
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
    /* У СПИСКУ ЛИШЕ ТІ, КУДИ МОЖНА ПОСТИТИ.

       Доти тут були всі Сторінки, які бачать кабінети, а недоступні
       підписувались «пост не піде». Вибирати зі списку, де половина
       позицій не працює, — це щоразу згадувати, яка з них яка. Тому
       недоступні не показуємо зовсім, а скільки їх відсіяно — видно
       під полем: мовчки вони зникати не мусять, інакше Сторінка
       «пропала» без причини. */
    const all = [...seen.values()];
    psHidden = all.filter(p => !p.can_moderate).length;
    psPages = all.filter(p => p.can_moderate).sort((a, b) =>
      String(a.page_name || a.page_id).localeCompare(String(b.page_name || b.page_id), 'uk'));
  } catch (e) {
    if (note) note.textContent = 'Не вдалось прочитати: ' + (e.message || e);
  }
  psPaintPages();
  psPaint();
  // Лого — другим заходом, щоб список не чекав на ще один запит.
  psLoadPics();
  if (loud && typeof toast === 'function') toast('Оновлено', 'ok', 1500);
};

function psPaintPages() {
  const sel = document.getElementById('ps-page');
  if (!sel) return;
  const hint = document.getElementById('ps-page-hint');
  if (!psPages.length) {
    sel.innerHTML = '<option value="">Сторінок не видно</option>';
    /* Дві різні біди з однаковим екраном: Сторінок немає зовсім — і
       Сторінки є, але жодну не видали системному користувачеві.
       Перша лікується синхронізацією, друга — Business Manager. */
    if (hint) {
      hint.textContent = psHidden
        ? 'Сторінки є (' + psHidden + '), але жодної не видано системному користувачеві. '
          + 'У Business Manager додай Сторінку системному юзеру із задачею контенту — '
          + 'без цього Facebook не дасть у неї постити.'
        : 'Жодної Сторінки не знайдено. Натисни Sync now на вкладці кабінетів — '
          + 'список Сторінок приходить звідти.';
      hint.className = 'ps-hint is-bad';
    }
    return;
  }
  sel.innerHTML = psPages.map(p =>
    `<option value="${psEsc(p.page_id)}">${psEsc(p.page_name || p.page_id)}</option>`).join('');
  sel.onchange = psPageHint;
  psPaintPicks();
  psPageHint();
}

/* У списку лишились тільки доступні, тож тут уже не попередження, а
   рахунок: скільки Сторінок сховано й чому їх не видно. */
function psPageHint() {
  const el = document.getElementById('ps-page-hint');
  if (!el) return;
  /* Не починаємо зі «Ще »: словник build/i18n.py міняє це слово на
     «More», і рядок їхав наполовину англійським. */
  el.textContent = psHidden
    ? 'Сторінок приховано: ' + psHidden + ' — їх не видано системному користувачеві.'
    : '';
  el.className = 'ps-hint';
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
            data-send="${psEsc(p.id)}" onclick="psSend('${p.id}')">Опублікувати</button>` : ''}
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
  /* ХІД РОБОТИ ВИДНО НА ТІЙ КНОПЦІ, ЯКУ НАТИСНУЛИ.

     Доти підпис мінявся лише на головній кнопці форми, а з черги пост
     відправлявся мовчки: натиснув — і нічого, бо Facebook відповідає
     не миттєво. Людина тисне ще раз, і це вже другий пост.

     Тому кнопку шукаємо по тому, звідки прийшов виклик: з форми —
     головну, з рядка — його власну. Обидві гаснуть на час відправки:
     заблокована кнопка тут не прикраса, а єдине, що стоїть між
     затримкою і дублем у стрічці. */
  const btn = id
    ? document.querySelector('[data-send="' + String(id).replace(/"/g, '\\"') + '"]')
    : document.getElementById('ps-send');
  const was = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Відправляю…'; btn.classList.add('is-busy'); }
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
    /* Рядок під кнопкою легко не помітити — особливо коли дивишся на
       саму кнопку, а вона вже знову каже «Опублікувати». Тому відмова
       йде ще й тостом: пост, який не пішов, мусить про це сказати
       так само голосно, як той, що пішов. */
    const m = String(e.message || e);
    psSay(m, true);
    if (typeof toast === 'function') toast(m, 'error', 9000);
    await psLoad(false);
  } finally {
    psBusy = false;
    /* Повертаємо саме той підпис, що був: у рядку черги й у формі він
       однаковий сьогодні, але писати його тут наново означало б, що
       завтра кнопка повернеться з чужим словом. Перемальовка списку
       кнопку все одно замінить — це про той короткий проміжок, коли
       вона ще стара. */
    if (btn && btn.isConnected) {
      btn.disabled = false; btn.textContent = was; btn.classList.remove('is-busy');
    }
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


/* ═══════════ СПИСОК СТОРІНОК ІЗ ЛОГО ═══════════

   У select картинки не покладеш, а Сторінки впізнають по лого швидше,
   ніж по назві. Тому видимий список — це кнопки, а значення й далі
   лежить у прихованому select: решта коду (psForm, psSend) читає його
   так само, як читала, і нічого про картинки не знає.

   ЛОГО БЕРЕТЬСЯ ТІЄЮ Ж ФУНКЦІЄЮ, що й у панелі Pages. У нашій таблиці
   fb_cabinet_pages його немає, і заводити під нього стовпець означало б
   зберігати адресу, яка з часом протухає, — показували б старий
   логотип саме там, де по ньому й упізнають.

   Не приїхало — не біда: лишається літера. Список не має права
   зникнути через те, що картинка не дійшла. */
let psPics = {};

function psPaintPicks() {
  const box = document.getElementById('ps-pages');
  const sel = document.getElementById('ps-page');
  if (!box || !sel) return;
  const cur = sel.value || (psPages[0] && psPages[0].page_id) || '';
  if (sel.value !== cur) sel.value = cur;
  box.innerHTML = psPages.map(p => {
    const id = String(p.page_id);
    const name = p.page_name || id;
    const pic = psPics[id];
    return `<button type="button" class="ps-page-pick${id === String(cur) ? ' is-on' : ''}"
      data-id="${psEsc(id)}" onclick="psPickPage('${psEsc(id)}')" title="${psEsc(name)}">
      ${pic ? `<img class="ps-page-pic" src="${psEsc(pic)}" alt="" loading="lazy"
                 referrerpolicy="no-referrer" onerror="this.remove()">`
            : `<span class="ps-page-pic is-none">${psEsc(
                 String(name).trim().charAt(0).toUpperCase())}</span>`}
      <span class="ps-page-name">${psEsc(name)}</span></button>`;
  }).join('');
}

window.psPickPage = function (id) {
  const sel = document.getElementById('ps-page');
  if (!sel) return;
  sel.value = String(id);
  psPaintPicks();
  psPageHint();
};

/* Лого докладаємо ПІСЛЯ того, як список уже на екрані: він не має
   чекати на другий запит, а якщо той не дійде — просто лишиться з
   літерами. Тому жодного throw назовні. */
async function psLoadPics() {
  if (typeof pgCall !== 'function') return;
  try {
    const j = await pgCall({ action: 'pages' });
    const got = {};
    (j.pages || []).forEach(p => { if (p.pic) got[String(p.page_id)] = p.pic; });
    if (!Object.keys(got).length) return;
    psPics = got;
    psPaintPicks();
  } catch (_e) { /* немає лого — лишаються літери */ }
}
