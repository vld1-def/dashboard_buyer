<script>
/* ═══════════ ФАЙЛОВИЙ ПРОВІДНИК ═══════════

   Файли лежать у Supabase Storage, у ПРИВАТНОМУ бакеті: завантажити,
   подивитись і скачати можна лише залогіненому, і лише через короткі
   підписані адреси, які живуть десять хвилин. Публічного посилання на
   файл не існує взагалі — на відміну від бакета зі звітними фото,
   який читає будь-хто.

   Це важливо саме тут. У файлі купленого акаунта лежать логін, пошта,
   2FA і куки, і найгірше, що можна було б зробити, — покласти їх туди,
   звідки їх віддають без запитань. Тому бакет приватний, політики в
   FILES.sql дозволяють лише authenticated, а анонімові не лишено
   нічого.

   Метадані (назва, тег, кабінет, нотатка) лежать окремо в file_links:
   Storage вміє зберігати файл, але не вміє відповісти на питання «а
   що з цього під KG» — для цього потрібна таблиця. */

const FL_BUCKET = 'files';
const FL_KINDS = [
  { k: 'account', label: 'Account' },
  { k: 'proxy',   label: 'Proxy' },
  { k: 'card',    label: 'Card' },
  { k: 'creo',    label: 'Creative' },
  { k: 'doc',     label: 'Document' },
  { k: 'other',   label: 'Other' }
];
/* Стеля на файл. Не з примхи: сторінка тримає його в памʼяті, поки
   вантажить, а бакет — спільний на всю команду. Півсотні мегабайт
   вистачає на все, заради чого сюди заходять. */
const FL_MAX = 50 * 1024 * 1024;

let flRows = [], flLoaded = false, flBusy = false;

const flEsc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function flSize(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return Math.round(v / 1024) + ' KB';
  return (Math.round(v / 1024 / 1024 * 10) / 10) + ' MB';
}

/* Ім'я файла в бакеті робимо самі. Взяти те, що дала людина, не можна
   двічі: по-перше, Storage не приймає кирилицю й пробіли в ключі;
   по-друге, два однакові імені перезаписали б одне одного мовчки.
   Справжню назву зберігаємо в таблиці — там їй нічого не загрожує. */
function flFolder() {
  return String(currentTeam || '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40);
}

function flKey(name) {
  const ext = (String(name).match(/\.([A-Za-z0-9]{1,8})$/) || [])[1] || '';
  const rnd = Math.random().toString(36).slice(2, 10);
  return flFolder() + '/' + Date.now().toString(36) + '-' + rnd
    + (ext ? '.' + ext.toLowerCase() : '');
}

/* Куди саме лягає файл, написано в шапці вікна. Без цього рядка
   «завантажив — і не знаю, де воно» законне питання: бакет приватний,
   прямого посилання немає, і зі сторони видно лише список. */
function flWhere() {
  const el = document.getElementById('fl-where');
  if (el) el.textContent = 'Supabase Storage · private bucket “'
    + FL_BUCKET + '” · ' + (flFolder() || '—') + '/';
}

/* Відкривається модалкою, як Accounts, а не маршрутом. Різниця не
   косметична: маршрут міняв сторінку під ногами, і людина, яка зайшла
   подивитись один файл, поверталась не туди, де була. */
window.openFilesModal = async function () {
  document.getElementById('files-modal')?.classList.remove('hidden');
  flDropWire();
  flWhere();
  /* Уже завантажене показуємо одразу, а свіже тягнемо слідом: інакше
     кожне відкриття впиралось би в повний запит до бази. */
  if (flLoaded) { flRender(); flLoad(); return; }
  flLoaded = true;
  await flLoad();
};

window.closeFilesModal = function () {
  document.getElementById('files-modal')?.classList.add('hidden');
  /* Перегляд закриваємо разом із вікном: лишена рамка тримає
     з'єднання, а підписана адреса в розмітці живе довше, ніж треба. */
  flViewClose();
};

async function flLoad() {
  const box = document.getElementById('fl-list');
  if (box) box.innerHTML = '<p class="fl-empty">Loading…</p>';
  try {
    const { data, error } = await sb.from('file_links')
      .select('id,title,path,mime,size,kind,account_id,note,at,tags,cabs')
      .eq('team_name', currentTeam).order('at', { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    flRows = data || [];
  } catch (e) {
    flRows = [];
    if (box) {
      /* Таблиці ще немає — найчастіша причина, і в неї є рецепт.
         Ховати її за «щось пішло не так» означало б відправити людину
         шукати ваду там, де її немає. */
      box.innerHTML = '<p class="fl-empty">' + (/file_links|does not exist|42P01/i.test(e.message)
        ? 'No table yet — run FILES.sql, then reload.'
        : 'Could not read: ' + flEsc(e.message)) + '</p>';
      return;
    }
  }
  flRender();
}

/* ── завантаження ── */

window.flPick = function () { document.getElementById('fl-input')?.click(); };

/* Кидати файл можна на все вікно. Коли він уже в руці, цілитись у
   маленьку мішень — зайва робота, а промах поверх сторінки відкрив би
   файл у вкладці й загубив те, що було на екрані. */
function flDropWire() {
  const z = document.getElementById('fl-drop');
  if (!z || z.dataset.wired) return;
  z.dataset.wired = '1';
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover'].forEach(t => z.addEventListener(t, (e) => {
    stop(e); z.classList.add('is-over');
  }));
  ['dragleave', 'drop'].forEach(t => z.addEventListener(t, (e) => {
    stop(e); if (t === 'dragleave' && z.contains(e.relatedTarget)) return;
    z.classList.remove('is-over');
  }));
  z.addEventListener('drop', (e) => flChose(e.dataTransfer?.files));
}

window.flChose = async function (list) {
  const files = [...(list || [])];
  const inp = document.getElementById('fl-input');
  if (inp) inp.value = '';          // той самий файл мусить вантажитись двічі
  if (!files.length || flBusy) return;
  flBusy = true;
  let done = 0;
  for (const f of files) {
    const ok = await flUpload(f, ++done, files.length);
    if (!ok) break;
  }
  flBusy = false;
  await flLoad();
};

async function flUpload(file, n, total) {
  const box = document.getElementById('fl-list');
  if (box) box.innerHTML = '<p class="fl-empty">Uploading ' + n + ' of ' + total
    + ' — ' + flEsc(file.name) + '…</p>';
  if (file.size > FL_MAX) {
    if (typeof toast === 'function')
      toast(file.name + ' is ' + flSize(file.size) + ' — the limit is ' + flSize(FL_MAX), 'warn');
    return true;                    // один завеликий не спиняє решту
  }
  const path = flKey(file.name);
  try {
    const up = await sb.storage.from(FL_BUCKET).upload(path, file, {
      cacheControl: '3600', upsert: false,
      contentType: file.type || 'application/octet-stream'
    });
    if (up.error) throw new Error(up.error.message);
  } catch (e) {
    if (typeof toast === 'function')
      /* Бакета ще немає — це не «щось пішло не так», а невиконаний
         FILES.sql, і сказати треба саме це. */
      toast(/bucket|not found|404/i.test(e.message)
        ? 'No bucket yet — run FILES.sql'
        : 'Upload failed: ' + e.message, 'error');
    return false;
  }
  try {
    const { data: s } = await sb.auth.getUser();
    const { error } = await sb.from('file_links').insert({
      team_name: currentTeam, created_by: s?.user?.id || null,
      title: file.name, path, mime: file.type || '', size: file.size,
      kind: 'other', account_id: null, note: null
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    /* Рядок не записався — прибираємо й файл. Інакше в бакеті осідає
       сміття, якого ніхто вже не побачить і не видалить. */
    try { await sb.storage.from(FL_BUCKET).remove([path]); } catch (_e) {}
    if (typeof toast === 'function') toast('Could not save: ' + e.message, 'error');
    return false;
  }
  return true;
}

/* ── список ── */

function flRender() {
  const q = String(document.getElementById('fl-q')?.value || '').trim().toLowerCase();
  /* #тег і @кабінет шукаємо ТОЧНО, а не підрядком: #kg не має
     витягувати #kg-old, інакше «покажи файли цього тегу» перестає
     означати те, що обіцяє. Решта — звичайний пошук по тексту картки,
     як було. */
  const exact = /^[#@]/.test(q) ? q.slice(1) : '';
  const rows = !q ? flRows : flRows.filter(r => exact
    ? (q[0] === '#' ? (r.tags || []) : (r.cabs || [])).includes(exact)
    : (r.title + ' ' + (r.note || '') + ' ' + (r.account_id || '') + ' '
       + (r.tags || []).join(' ') + ' ' + (r.cabs || []).join(' '))
      .toLowerCase().includes(q));

  const cnt = document.getElementById('fl-count');
  if (cnt) cnt.textContent = flRows.length
    ? (q ? rows.length + ' of ' + flRows.length : flRows.length + ' file(s)') : '';

  const box = document.getElementById('fl-list');
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = '<p class="fl-empty">' + (q
      ? 'Nothing matches “' + flEsc(q) + '”.'
      : 'Empty. Drop a file anywhere here, or press “+ Upload”.') + '</p>';
    return;
  }
  const kind = (k) => (FL_KINDS.find(x => x.k === k) || FL_KINDS[FL_KINDS.length - 1]).label;
  box.innerHTML = '<div class="fl-tbl">' + rows.map((r) => {
    const i = flRows.indexOf(r);
    return '<div class="fl-row">'
      + '<span class="fl-kind">' + flEsc(kind(r.kind)) + '</span>'
      + '<button type="button" class="fl-name" onclick="flView(' + i + ')"'
      + ' title="Open here">' + flEsc(r.title) + '</button>'
      + (r.account_id ? '<span class="fl-cab" title="Cabinet">' + flEsc(r.account_id) + '</span>' : '<span></span>')
      /* Мітки видно в рядку — інакше, щоб дізнатись, що в файлі, його
         щоразу треба відкривати, а вся користь тегів саме в тому, щоб
         не відкривати. */
      + '<span class="fl-note">' + flTagChips(r) + flEsc(r.note || '') + '</span>'
      + '<span class="fl-at">' + flSize(r.size) + '</span>'
      + '<span class="fl-at">' + String(r.at || '').slice(0, 10) + '</span>'
      + '<span class="fl-acts">'
      + '<button type="button" class="fl-mini" onclick="flGet(' + i + ')" title="Download">↓</button>'
      + '<button type="button" class="fl-mini" onclick="flEditOpen(' + i + ')">Edit</button>'
      + '<button type="button" class="fl-mini is-bad" onclick="flDrop(' + i + ')">✕</button>'
      + '</span></div>';
  }).join('') + '</div>';
}

/* «new row violates row-level security policy» — правда, і ні про що.

   База каже, що правило не пустило, але не каже ЯКЕ і що з цим
   робити. Для людини це нічим не краще за «щось пішло не так»: вона
   бачить помилку з незнайомими словами й не має жодної зачіпки.

   А причин рівно дві, і вони різні: або в бакеті бракує політики на
   перезапис (FILES.sql виконаний не до кінця чи зі старої версії),
   або файл залив хтось інший і міняти його може тільки він. */
function flRls(e) {
  return /row-level security|violates row.level/i.test(String((e && e.message) || ''));
}

/* ── МІТКИ ВСЕРЕДИНІ ФАЙЛА ──

   @1149896616961527 — кабінет, #прогріта — вільний тег.

   Два різні знаки навмисно. Кабінет — це не просто слово: за ним
   можна перейти, його можна звірити зі списком, і плутати його з
   довільною позначкою не варто. А ще так не треба вгадувати, чи 16
   цифр у рядку — це айді кабінета, чи номер картки, чи sub_id.

   Розбираємо ВМІСТ, а не картку файла: мітка має стояти там, де
   людина її написала, поруч із рядком, якого вона стосується. */
const FL_CAB_RE = /@(\d{6,20})\b/g;
/* Літери, цифри, підкреслення й дефіс — і кирилиця теж: теги пишуть
   українською, і #прогріта має працювати так само, як #warm. */
const FL_TAG_RE = /#([\p{L}\p{N}_-]{1,40})/gu;

function flTags(text) {
  const t = String(text || '');
  const uniq = (re, cut) => {
    const out = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(t)) !== null) {
      const v = cut(m[1]);
      if (v && !out.includes(v) && out.length < 60) out.push(v);
    }
    return out;
  };
  return { cabs: uniq(FL_CAB_RE, v => v),
           // Теги зводимо до нижнього регістру: #KG і #kg — один тег,
           // інакше пошук ділив би файли навпіл на рівному місці.
           tags: uniq(FL_TAG_RE, v => v.toLowerCase()) };
}

// Однакові набори? Тоді й писати нема чого.
function flSameTags(a, b) {
  const A = (a || []).slice().sort(), B = (b || []).slice().sort();
  return A.length === B.length && A.every((v, i) => v === B[i]);
}

/* Записуємо мітки в картку файла — щоб пошук був одним запитом, а не
   двомастами завантажень із приватного бакета.

   Обрізаний файл НЕ чіпаємо: ми бачили лише перші 400 КБ, і затерти
   ними мітки з решти означало б втратити те, чого ми не читали. Та
   сама причина, з якої такий файл не дається правити. */
async function flIndex(i, text, cut) {
  const r = flRows[i];
  if (!r || cut) return;
  const { tags, cabs } = flTags(text);
  if (flSameTags(tags, r.tags) && flSameTags(cabs, r.cabs)) return;
  r.tags = tags; r.cabs = cabs;
  try {
    await sb.from('file_links').update({ tags, cabs }).eq('id', r.id);
  } catch (_e) {
    /* Колонок ще немає — FILES.sql не виконаний. Мітки на екрані від
       цього працюють, не працює лише пошук по них, і валити через це
       перегляд файла було б ціною, вищою за втрату. */
  }
  flRender();
}

/* Показуємо мітки клікабельними. Спершу екрануємо ВЕСЬ текст, і лише
   потім вставляємо розмітку — у зворотному порядку вміст файла став
   би розміткою сторінки, а у файлах з акаунтами трапляється будь-що. */
function flMark(text) {
  return flEsc(String(text || ''))
    .replace(FL_CAB_RE, (_m, id) =>
      '<button type="button" class="fl-t fl-t-cab" onclick="flCabGo(\'' + id + '\')"'
      + ' data-cab="' + id + '" onmouseenter="flCabTip(this)" onfocus="flCabTip(this)"'
      + ' onmouseleave="flCabTipHide()" onblur="flCabTipHide()">@' + id + '</button>')
    .replace(FL_TAG_RE, (_m, tag) =>
      '<button type="button" class="fl-t fl-t-tag" onclick="flTagGo(\''
      + flEsc(tag.toLowerCase()).replace(/'/g, '&#39;') + '\')"'
      + ' title="Show files with this tag">#' + tag + '</button>')
    // Позначка «вже в AdsPower» — видно одразу, який рядок відправлено.
    .replace(/\[ads:([\w-]+)\]/g, '<span class="fl-ads" title="Sent to AdsPower, profile #$1">[ads:$1]</span>');
}

/* СКІЛЬКИ ВІДКРУЧЕНО НА КАБІНЕТІ — ПРИ НАВЕДЕННІ НА @.
   «щоб при наведені підтягувало швидку інфу по кабу з daily stats, мені
   тільки треба скільки спенда на ньому було».

   Рахуємо з уже завантажених daily_stats (rawData), без запиту: файл
   читають рядок за рядком, і чекати мережу на кожну мітку — задовго.
   Підпис у daily_stats буває номером, act_123… або власною назвою, тому
   спершу питаємо сторінку кабінетів (вона знає, який рядок чий), а вже
   потім порівнюємо самі цифри. */
function flCabSpend(id) {
  const want = String(id);
  const digits = v => String(v == null ? '' : v).replace(/\D/g, '');
  if (typeof cabAll !== 'undefined' && Array.isArray(cabAll)) {
    const c = cabAll.find(c2 => digits(c2.fb && c2.fb.account_id) === want || digits(c2.id) === want);
    if (c && c.x && c.x.all > 0) return { sum: c.x.all, first: c.x.first, last: c.x.last };
  }
  const daily = (typeof rawData !== 'undefined' && Array.isArray(rawData)) ? rawData : [];
  let sum = 0, first = '', last = '', seen = false;
  daily.forEach(r => {
    if (digits(r.account) !== want) return;
    const d = String(r.date || '');
    seen = true;
    sum += Number(r.spend) || 0;
    if (d && (!first || d < first)) first = d;
    if (d > last) last = d;
  });
  return seen ? { sum, first, last } : null;
}

window.flCabTip = function (el) {
  const id = el && el.dataset ? el.dataset.cab : '';
  if (!id) return;
  let tip = document.getElementById('fl-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'fl-tip';
    document.body.appendChild(tip);
  }
  const f = flCabSpend(id);
  const day = d => d ? d.slice(8, 10) + '.' + d.slice(5, 7) : '';
  tip.innerHTML = f
    ? '<span class="fl-tip-k">Spend</span>$' + (Math.round(f.sum * 100) / 100).toLocaleString('en-US')
      + (f.first ? ' <span class="fl-tip-k" style="margin:0 0 0 6px">' + day(f.first)
        + (f.last && f.last !== f.first ? '–' + day(f.last) : '') + '</span>' : '')
    : '<span class="fl-tip-k" style="margin:0">No spend in daily stats</span>';
  tip.classList.remove('hidden');
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.max(6, Math.min(r.left, window.innerWidth - w - 6)) + 'px';
  tip.style.top = (r.top - h - 6 < 6 ? r.bottom + 6 : r.top - h - 6) + 'px';
};
window.flCabTipHide = function () {
  const tip = document.getElementById('fl-tip');
  if (tip) tip.classList.add('hidden');
};

/* Мітка веде до кабінета — заради цього вона й мітка. Вікно
   зачиняємо: залишити його відкритим поверх кабінета означало б
   показати перехід, який нікуди не привів. */
window.flCabGo = function (id) {
  flCabTipHide();
  closeFilesModal();
  if (typeof navGo === 'function') navGo('cabinets');
  if (typeof cabPick === 'function') cabPick(String(id));
};

window.flTagGo = function (tag) {
  flViewClose();
  const q = document.getElementById('fl-q');
  if (q) { q.value = '#' + tag; flRender(); }
};

/* У рядку списку мітки лише показуємо. Клікабельними вони живуть у
   відкритому файлі: там видно, ДО ЧОГО саме мітка стосується, а тут
   вона була б відірвана від свого рядка. */
const FL_CHIPS = 4;

function flTagChips(r) {
  const cabs = (r.cabs || []).map(c => ({ t: '@' + c, k: 'cab' }));
  const tags = (r.tags || []).map(t => ({ t: '#' + t, k: 'tag' }));
  const all = cabs.concat(tags);
  if (!all.length) return '';
  const show = all.slice(0, FL_CHIPS);
  return show.map(x => '<span class="fl-chip is-' + x.k + '">' + flEsc(x.t) + '</span>').join('')
    + (all.length > show.length
        ? '<span class="fl-chip is-more">+' + (all.length - show.length) + '</span>' : '');
}

/* ── підписана адреса ──
   Бакет приватний, тож прямого посилання на файл не існує. Просимо
   коротку підписану адресу рівно тоді, коли файл треба показати чи
   віддати, і не зберігаємо її: за десять хвилин вона мертва, і це
   саме те, чого ми й хочемо.

   ЧОМУ ТУТ ДРУГИЙ АРГУМЕНТ.

   Атрибут download у <a> діє ЛИШЕ для свого походження. Підписана
   адреса веде на домен Supabase Storage, а сторінка живе на GitHub
   Pages — для браузера це чужий сайт, і атрибут він просто відкидає.
   Тому «Скачати» відкривало файл у вкладці: картинку й PDF браузер
   малює сам, текст показує як сторінку.

   Полагодити це з боку сторінки не можна в принципі — вирішує
   заголовок відповіді. Storage уміє його виставити: параметр download
   у самій адресі дає Content-Disposition: attachment, і тоді файл
   зберігається, звідки б він не прийшов. Перегляд цей параметр не
   отримує — інакше вікно перегляду почало б скачувати замість
   показувати. */
async function flSigned(row, asDownload) {
  const { data, error } = await sb.storage.from(FL_BUCKET)
    .createSignedUrl(row.path, 600);
  if (error) throw new Error(error.message);
  const url = data?.signedUrl || '';
  if (!url || !asDownload) return url;
  // Дописуємо руками, а не опцією клієнта: так воно не залежить від
  // версії supabase-js, яка в сторінку приїжджає з CDN.
  return url + (url.includes('?') ? '&' : '?')
       + 'download=' + encodeURIComponent(flDownName(row));
}

/* Ім'я, під яким файл ляже на диск. Назва в довіднику може бути без
   розширення («Звіт за жовтень») — тоді беремо його зі шляху, інакше
   система не знає, чим відкривати. Лапки й слеші прибираємо: вони
   ламають заголовок Content-Disposition. */
function flDownName(row) {
  const ext = (String(row.path || '').match(/\.[a-z0-9]{1,8}$/i) || [''])[0];
  const raw = String(row.title || '').trim().replace(/[\\/"\r\n]+/g, ' ').trim();
  if (!raw) return 'file' + ext;
  return /\.[a-z0-9]{1,8}$/i.test(raw) ? raw : raw + ext;
}

window.flGet = async function (i) {
  const r = flRows[i];
  if (!r) return;
  try {
    const url = await flSigned(r, true);
    const a = document.createElement('a');
    // download лишаємо: на своєму походженні він працює, і це не шкодить.
    a.href = url; a.download = flDownName(r); a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) {
    if (typeof toast === 'function') toast('Could not download: ' + e.message, 'error');
  }
};

/* ── перегляд ──
   Показуємо те, що браузер уміє показати сам: картинки, PDF, текст.
   Для решти чесно кажемо, що переглянути не вийде, і лишаємо кнопку
   «скачати» — порожня рамка без пояснення гірша за пряму відмову. */
function flKindOf(r) {
  const m = String(r.mime || '').toLowerCase();
  const n = String(r.title || '').toLowerCase();
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(n)) return 'image';
  if (m === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
  if (m.startsWith('text/') || /\.(txt|csv|json|md|log)$/.test(n)) return 'text';
  return '';
}

/* ── текст і кирилиця ──
   Storage віддає .txt без charset, а браузер у такому разі вгадує — і
   на кирилиці вгадує погано: UTF-8 у рамці перетворюється на
   «Ð¿Ñ€Ð¸Ð²Ñ–Ñ‚». Тому текст не віддаємо в <iframe>, а тягнемо байти й
   розбираємо самі. Спершу UTF-8 у суворому режимі: якщо файл справді
   UTF-8, він пройде. Якщо ні — це майже завжди windows-1251, бо саме в
   ній віддають txt з даними акаунтів; латиниця в обох однакова, тож
   помилитись на англійському файлі неможливо. */
const FL_TXT_MAX = 400 * 1024;      // більше однаково ніхто не читає

function flDecode(buf, out) {
  const say = (e) => { if (out) out.enc = e; };
  const bytes = new Uint8Array(buf);
  /* BOM — це сам файл каже «я UTF-8». Віримо і прибираємо мітку, бо
     інакше вона лишається першим, невидимим символом тексту. */
  const bom = bytes.length > 2 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  const body = bom ? bytes.subarray(3) : bytes;
  try {
    const t = new TextDecoder('utf-8', { fatal: true }).decode(body);
    say('utf-8'); return t;
  } catch (_e) {
    try { const t = new TextDecoder('windows-1251').decode(body); say('windows-1251'); return t; }
    catch (_e2) { const t = new TextDecoder('utf-8').decode(body); say('utf-8'); return t; }
  }
}

/* Текст і приписка про обрізання — ОКРЕМО, і це не косметика.
   Раніше приписка приклеювалась до тексту, і поки його лише читали,
   різниці не було. Тепер текст можна зберегти назад — і приклеєний
   рядок «… shown first 400 KB» поїхав би у файл як його вміст.

   cache: 'no-store' і мітка часу — щоб після збереження не приїхала
   стара копія з кешу. Показати вчорашній вміст файла, який щойно
   змінили, гірше, ніж не показати нічого: людина вирішить, що
   збереження не спрацювало, і збереже ще раз поверх свіжого. */
async function flText(url) {
  const bust = url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
  const res = await fetch(bust, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  const cut = buf.byteLength > FL_TXT_MAX;
  const meta = {};
  const text = flDecode(cut ? buf.slice(0, FL_TXT_MAX) : buf, meta);
  return { text, cut, enc: meta.enc || 'utf-8' };
}

/* Поки чекаємо на підписану адресу, вікно могли вже закрити — і тоді
   писати в розмітку нема куди. Мітка каже, чи це ще ТОЙ САМИЙ перегляд:
   без неї закриття під час завантаження кидало помилку, а відкриття
   іншого файла дописувало б відповідь у чужу рамку. */
let flViewAt = 0;

window.flView = async function (i) {
  const r = flRows[i];
  const box = document.getElementById('fl-view');
  if (!r || !box) return;
  const mine = ++flViewAt;
  const how = flKindOf(r);
  box.classList.remove('hidden');
  box.innerHTML = '<div class="fl-view-box"><div class="fl-view-head">'
    + '<span class="fl-view-t">' + flEsc(r.title) + '</span>'
    + '<button type="button" class="fl-mini" onclick="flGet(' + i + ')">Download</button>'
    + '<button type="button" class="fl-mini is-bad" onclick="flViewClose()">✕</button>'
    + '</div><p class="fl-view-s">Loading…</p></div>';
  // Порожнє місце під відповідь. Його може вже не бути, коли ми
  // повернемось, — тому щоразу питаємо заново, а не тримаємо посилання.
  const slot = () => (flViewAt === mine ? box.querySelector('.fl-view-s') : null);
  if (!how) {
    const el = slot();
    if (el) el.textContent = 'This kind of file cannot be shown here — download it to open.';
    return;
  }
  let url = '';
  try { url = await flSigned(r); }
  catch (e) {
    const el = slot();
    if (el) el.textContent = 'Could not open: ' + e.message;
    return;
  }
  if (how === 'text') {
    let got = null;
    try { got = await flText(url); }
    catch (e) {
      const bad = slot();
      if (bad) bad.textContent = 'Could not read: ' + e.message;
      return;
    }
    const ok = slot();
    if (!ok) return;               // вікно закрили, поки ми читали
    flTxt = { i, path: r.path, mime: r.mime || '',
              text: got.text, cut: got.cut, enc: got.enc };
    ok.outerHTML = flTxtHtml(false);
    /* Мітки в уже завантаженому файлі мають знайтись, а не чекати, поки
       його хтось відкриє й перезбереже. Тому індексуємо на перегляді —
       але лише коли набір справді змінився, інакше кожне відкриття
       файла було б записом у базу. */
    flIndex(i, got.text, got.cut);
    return;
  }
  const el = slot();
  if (!el) return;                 // вікно закрили, поки ми чекали
  el.outerHTML = how === 'image'
    ? '<img class="fl-img" src="' + flEsc(url) + '" alt="' + flEsc(r.title) + '">'
    : '<iframe class="fl-frame" src="' + flEsc(url) + '" title="' + flEsc(r.title) + '"></iframe>';
};

/* ── ПРАВКА ТЕКСТУ ──

   Найчастіше треба дописати у файл кілька рядків — айді кабінетів,
   помітку, чий це акаунт. Заради цього качати файл, відкривати
   блокнотом і заливати назад — довше, ніж сама правка.

   Зберігаємо ЗАВЖДИ в UTF-8. Файли з даними акаунтів часто приїжджають
   у windows-1251, і записати їх назад тією ж кодовою сторінкою
   означало б тягти її за собою вічно. Але змінити кодування файла
   мовчки не можна — тому про це сказано просто над полем, ДО того як
   людина натисне Save, а не в тості після. */
let flTxt = null;

function flTxtHtml(editing) {
  if (!flTxt) return '';
  /* Обрізаний файл редагувати НЕ можна, і це не перестраховка: у полі
     було б лише перші 400 КБ, а Save записав би саме їх — решта файла
     зникла б без жодного сліду. Мовчазна втрата даних тут коштує
     найдорожче, бо помітять її не сьогодні. */
  const why = flTxt.cut
    ? 'Too big to edit here — only the first ' + Math.round(FL_TXT_MAX / 1024)
      + ' KB is shown. Download it to change the rest.'
    : editing && flTxt.enc !== 'utf-8'
    ? 'This file is ' + flTxt.enc + '. Saving rewrites it as UTF-8.'
    : '';
  const acts = flTxt.cut ? ''
    : editing
      ? '<button type="button" class="fl-mini is-main" onclick="flTxtSave()">Save</button>'
        + '<button type="button" class="fl-mini" onclick="flTxtBack()">Cancel</button>'
      : '<button type="button" class="fl-mini" onclick="flTxtEdit()">Edit</button>'
        + '<button type="button" class="fl-mini" onclick="flApOpen()"'
        + ' title="Create AdsPower profiles from the accounts in this file">AdsPower</button>';
  const body = editing
    ? '<textarea class="fl-ta" id="fl-ta" spellcheck="false">' + flEsc(flTxt.text) + '</textarea>'
    : '<pre class="fl-txt">' + flMark(flTxt.text)
      + (flTxt.cut ? '\n\n… shown first ' + Math.round(FL_TXT_MAX / 1024)
                     + ' KB — download for the rest.' : '') + '</pre>';
  return '<div class="fl-txt-bar">' + acts
    + (why ? '<span class="fl-txt-why">' + flEsc(why) + '</span>' : '')
    + '</div>' + body;
}

/* Перемальовуємо лише нутрощі рамки: шапка з назвою й «скачати» до
   правки стосунку не має, і смикати її означало б гасити фокус. */
function flTxtPaint(editing) {
  const box = document.getElementById('fl-view');
  const host = box && box.querySelector('.fl-view-box');
  if (!host || !flTxt) return;
  host.querySelectorAll('.fl-txt-bar, .fl-txt, .fl-ta, .fl-ap, .fl-ap-help').forEach(el => el.remove());
  host.insertAdjacentHTML('beforeend', flTxtHtml(editing));
  if (editing) document.getElementById('fl-ta')?.focus();
}

window.flTxtEdit = function () { if (flTxt && !flTxt.cut) flTxtPaint(true); };
window.flTxtBack = function () { flTxtPaint(false); };

window.flTxtSave = async function () {
  if (!flTxt || flTxt.cut) return;
  const el = document.getElementById('fl-ta');
  if (!el) return;
  const text = el.value;
  /* Нічого не змінилось — не пишемо. Зайвий запис створив би нову
     версію файла й новий час зміни на рівному місці. */
  if (text === flTxt.text) { flTxtPaint(false);
    if (typeof toast === 'function') toast('Nothing changed.', 'warn', 3000); return; }

  const btn = document.querySelector('.fl-txt-bar .is-main');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try { await flTxtPut(text); }
  catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    if (typeof toast === 'function') toast(e.message, 'error', 9000);
    return;
  }
  flTxtPaint(false);
  if (typeof toast === 'function') toast('Saved.', 'ok', 2500);
  await flLoad();
};

/* Сам запис файла — окремо від кнопки Save: ним же користується
   відправка в AdsPower, коли дописує позначки. Кидає помилку вже з
   людським текстом. */
async function flTxtPut(text) {
  if (!flTxt || flTxt.cut) throw new Error('This file cannot be changed here.');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  if (blob.size > FL_MAX)
    throw new Error('That would be ' + flSize(blob.size) + ' — the limit is ' + flSize(FL_MAX));
  let step = 'storage';
  try {
    const up = await sb.storage.from(FL_BUCKET).upload(flTxt.path, blob, {
      /* upsert: той самий шлях, той самий рядок у списку. Новий шлях
         лишив би поруч стару копію, і за тиждень ніхто не сказав би,
         котра з них справжня. */
      upsert: true, cacheControl: '3600',
      contentType: flTxt.mime || 'text/plain;charset=utf-8'
    });
    if (up.error) throw new Error(up.error.message);
    step = 'row';
    // Розмір у списку має відповідати файлові, інакше він бреше.
    // Мітки — разом із ним: дописав @кабінет і зберіг, а пошук його не
    // бачить до наступного відкриття — це той самий різновид тиші.
    const { tags, cabs } = flTags(text);
    const { error } = await sb.from('file_links')
      .update({ size: blob.size, tags, cabs }).eq('id', flRows[flTxt.i]?.id);
    if (error) throw new Error(error.message);
    const row = flRows[flTxt.i];
    if (row) { row.tags = tags; row.cabs = cabs; }
  } catch (e) {
    /* Який саме крок відмовив — ми знаємо, і це вся різниця між
       порадою і загадкою. */
    throw new Error(!flRls(e) ? 'Could not save: ' + e.message
      : step === 'storage'
        ? 'Saving over a file needs one more rule in the bucket. '
          + 'Run FILES.sql again — it adds the update policy.'
        : 'This file was uploaded by someone else, so only they can change it.');
  }
  flTxt.text = text;
  flTxt.enc = 'utf-8';             // тепер це справді так
}

window.flViewClose = function () {
  flViewAt++;                      // усе, що вантажиться, більше не наше
  flCabTipHide();
  if (flAp) { flAp.stop = true; flAp = null; }
  /* Текст забуваємо разом із рамкою: лишений у памʼяті, він при
     наступному Save поїхав би не в той файл. */
  flTxt = null;
  const box = document.getElementById('fl-view');
  /* Вміст прибираємо, а не лише ховаємо: лишена рамка тримає
     з'єднання, а підписана адреса в розмітці живе довше, ніж треба. */
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
};

/* ── підпис рядка ── */

window.flEditOpen = function (i) {
  const r = flRows[i];
  const box = document.getElementById('fl-view');
  if (!r || !box) return;
  box.classList.remove('hidden');
  box.innerHTML = `<div class="fl-form">
      <label class="fl-f is-wide"><span class="fl-f-l">Name</span>
        <input class="fl-in" id="fl-f-title" value="${flEsc(r.title)}"></label>
      <label class="fl-f"><span class="fl-f-l">Kind</span>
        <select class="fl-in" id="fl-f-kind">
          ${FL_KINDS.map(k => `<option value="${k.k}" ${r.kind === k.k ? 'selected' : ''}>${k.label}</option>`).join('')}
        </select></label>
      <label class="fl-f"><span class="fl-f-l">Cabinet</span>
        <input class="fl-in" id="fl-f-cab" placeholder="1149896616961527"
          value="${flEsc(r.account_id || '')}"></label>
      <label class="fl-f is-wide"><span class="fl-f-l">Note</span>
        <input class="fl-in" id="fl-f-note" placeholder="bought 12.09, farmed"
          value="${flEsc(r.note || '')}"></label>
      <div class="fl-form-acts">
        <button type="button" class="fl-btn is-main" onclick="flPut(${i})">Save</button>
        <button type="button" class="fl-btn" onclick="flViewClose()">Cancel</button>
      </div>
    </div>`;
};

window.flPut = async function (i) {
  const r = flRows[i];
  if (!r) return;
  const val = (id) => String(document.getElementById(id)?.value || '').trim();
  const title = val('fl-f-title') || r.title;
  try {
    const { error } = await sb.from('file_links').update({
      title, kind: val('fl-f-kind') || 'other',
      account_id: val('fl-f-cab') || null, note: val('fl-f-note') || null
    }).eq('id', r.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    if (typeof toast === 'function')
      toast(flRls(e)
        ? 'This file was uploaded by someone else, so only they can change it.'
        : 'Could not save: ' + e.message, 'error', flRls(e) ? 9000 : 5000);
    return;
  }
  flViewClose();
  await flLoad();
};

window.flDrop = async function (i) {
  const r = flRows[i];
  if (!r) return;
  const go = typeof ask === 'function'
    ? await ask({ title: 'Delete this file?', danger: true, ok: 'Delete',
                  body: 'Removes the file itself, not just the line. This cannot be undone.' })
    : confirm('Delete "' + r.title + '"? This removes the file itself.');
  if (!go) return;
  try {
    /* Спершу рядок, потім файл. У зворотному порядку невдале видалення
       рядка лишило б у списку запис, за яким нічого немає. */
    const { error } = await sb.from('file_links').delete().eq('id', r.id);
    if (error) throw new Error(error.message);
    await sb.storage.from(FL_BUCKET).remove([r.path]);
  } catch (e) {
    if (typeof toast === 'function')
      toast(flRls(e)
        ? 'This file was uploaded by someone else, so only they can delete it.'
        : 'Could not delete: ' + e.message, 'error', flRls(e) ? 9000 : 5000);
  }
  flViewClose();
  await flLoad();
};

/* ═══════════ АКАУНТИ З ФАЙЛА — В ADSPOWER ═══════════

   «файли які я загружаю в срм, розбирати на частини (визначати що є що
   можна в ручному режимі) і загружати в адспавер … щоб можна було
   декілька відправляти акаунтів, всі або вибирати декілька. також папку
   куди відправляти і у файлі позначати які вже відправлені».

   ЧОМУ ЧЕРЕЗ МІСТОК. Local API AdsPower слухає лише цей комп'ютер і не
   відповідає заголовками CORS — сторінці з сайту браузер туди ходити не
   дає. Edge function теж не дістане: вона в інтернеті, а 127.0.0.1 для
   неї — це вона сама. Тому поруч з AdsPower запускається маленька
   програма (tools/adspower-bridge.py), яка пропускає рівно чотири
   виклики: статус, список папок, створити папку, створити профіль.

   Логіни й куки йдуть так: браузер → місток на цьому ж комп'ютері →
   AdsPower. Ні в базу, ні на сервер вони звідси не потрапляють.

   ПОЗНАЧКА. Відправлений рядок дістає в кінці « [ads:123]», де 123 —
   номер профілю в AdsPower. Не #тег: тегів у файла стало б стільки,
   скільки в ньому акаунтів, і пошук по тегах потонув би в них. */
const FL_AP_URL = 'http://127.0.0.1:50326';
const FL_AP_MARK = /\s*\[ads:([\w-]+)\]/;
const FL_AP_TYPES = [['skip', '— skip'], ['name', 'Name'], ['login', 'Login'],
  ['pass', 'Password'], ['fakey', '2FA key'], ['cookie', 'Cookies'],
  ['ua', 'User-Agent'], ['proxy', 'Proxy'], ['note', 'Note']];
// Нотаток може бути кілька; решта — по одному стовпчику на файл.
const FL_AP_MANY = new Set(['skip', 'note']);

/* Рядок без хвоста: позначка про відправку і дописані руками @кабінет
   та #теги до полів акаунта не належать. */
function flApStrip(line) {
  let s = String(line || '');
  let sent = '';
  const m = s.match(FL_AP_MARK);
  if (m) { sent = m[1]; s = s.replace(FL_AP_MARK, ''); }
  let tail = '';
  const t = s.match(/(?:\s+[@#][\p{L}\p{N}_-]+)+\s*$/u);
  if (t) { tail = t[0].trim(); s = s.slice(0, t.index); }
  /* Куки в JSON містять і двокрапки, і крапки з комою — ділити рядок,
     не вийнявши їх, означало б порізати куки на сотню полів. */
  let cookie = '';
  const a = s.indexOf('[{'), b = s.lastIndexOf('}]');
  if (a >= 0 && b > a) {
    cookie = s.slice(a, b + 2);
    s = s.slice(0, a) + '\u0001' + s.slice(b + 2);
  }
  return { body: s.trim(), sent, tail, cookie };
}

/* Роздільник один на файл: файли з акаунтами однорідні, і вгадувати
   його для кожного рядка окремо означало б отримати різну кількість
   стовпчиків у сусідніх рядках. */
function flApDelim(bodies) {
  const count = (ch) => bodies.reduce((n, s) => n + (s.split(ch).length - 1), 0);
  const best = ['|', '\t', ';'].map(ch => [ch, count(ch)]).sort((x, y) => y[1] - x[1])[0];
  if (best[1] > 0) return best[0];
  const colon = bodies.filter(s => s.replace(/:\/\//g, '').includes(':')).length;
  if (colon && colon >= bodies.length / 2) return ':';
  return ' ';
}

function flApCells(st, delim) {
  let s = st.body;
  if (delim === ':') s = s.replace(/:\/\//g, '\u0002');
  const parts = delim === ' ' ? s.split(/\s+/) : s.split(delim);
  const cells = parts.map(v => v.replace(/\u0002/g, '://').replace('\u0001', st.cookie).trim());
  while (cells.length && !cells[cells.length - 1]) cells.pop();
  return cells;
}

function flApProxy(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(?:(socks5|https?):\/\/)?(?:([^:@\s]+):([^@\s]+)@)?([\w.-]+\.[\w-]+):(\d{2,5})$/i);
  if (m) return flApProxyCfg(m[1], m[4], m[5], m[2], m[3]);
  m = s.match(/^(?:(socks5|https?):\/\/)?([\w.-]+\.[\w-]+):(\d{2,5}):([^:\s]+):(\S+)$/i);
  if (m) return flApProxyCfg(m[1], m[2], m[3], m[4], m[5]);
  return null;
}
function flApProxyCfg(type, host, port, user, pass) {
  const cfg = { proxy_soft: 'other', proxy_type: (type || 'http').toLowerCase(),
                proxy_host: host, proxy_port: String(port) };
  if (user) { cfg.proxy_user = user; cfg.proxy_password = pass || ''; }
  return cfg;
}

// Що це за значення — на око. Людина поправить списком над стовпчиком.
function flApKind(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\[\s*\{/.test(s) || /(^|[;\s])c_user=/.test(s)) return 'cookie';
  if (/^Mozilla\//.test(s)) return 'ua';
  if (/^EAA[A-Za-z0-9]{20,}/.test(s)) return 'note';
  if (/^[A-Z2-7]{4}(?: ?[A-Z2-7]{4}){3,15}$/.test(s)) return 'fakey';
  if (flApProxy(s)) return 'proxy';
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s) || /^\+?\d{9,17}$/.test(s)) return 'login';
  return '';
}

function flApGuess(rows, cols) {
  const kinds = [];
  for (let c = 0; c < cols; c++) {
    const tally = {};
    rows.slice(0, 15).forEach(r => { const k = flApKind(r.cells[c]); if (k) tally[k] = (tally[k] || 0) + 1; });
    const top = Object.entries(tally).sort((x, y) => y[1] - x[1])[0];
    kinds.push(top ? top[0] : '');
  }
  const map = kinds.map(() => 'skip');
  const used = new Set();
  kinds.forEach((k, c) => {
    if (!k) return;
    if (FL_AP_MANY.has(k)) { map[c] = k; return; }
    if (used.has(k)) return;          // друга пошта — це пошта від пошти
    used.add(k); map[c] = k;
  });
  /* Пароль нічим не впізнати — впізнаємо за місцем: він стоїть одразу
     після логіна майже в кожному форматі, який продають. */
  const li = map.indexOf('login');
  if (li >= 0 && li + 1 < cols && map[li + 1] === 'skip' && !kinds[li + 1]) map[li + 1] = 'pass';
  return map;
}

function flApParse(text) {
  const lines = String(text || '').split(/\r?\n/);
  const pre = lines.map((l, i) => ({ line: i, st: flApStrip(l) }))
    .filter(x => x.st.body);
  const delim = flApDelim(pre.map(x => x.st.body.replace('\u0001', '')));
  const rows = pre.map(x => ({ line: x.line, cells: flApCells(x.st, delim),
                               sent: x.st.sent, tail: x.st.tail, sel: !x.st.sent, st: '' }))
    /* Одне слово без куків — це заголовок або нотатка, а не акаунт. */
    .filter(r => r.cells.length >= 2 || (r.cells[0] && flApKind(r.cells[0]) === 'cookie'));
  const cols = rows.reduce((n, r) => Math.max(n, r.cells.length), 0);
  return { rows, cols, delim, map: flApGuess(rows, cols) };
}

/* Тіло запиту на створення профілю. null — у рядку нема з чим входити:
   профіль без логіна й без куків був би порожнім браузером із чужою
   назвою, і шукати потім, що це було, довелося б руками. */
function flApBody(row, map, groupId, title) {
  const pick = (type) => {
    for (let c = 0; c < map.length; c++)
      if (map[c] === type && row.cells[c]) return row.cells[c];
    return '';
  };
  const login = pick('login'), cookie = pick('cookie');
  if (!login && !cookie) return null;
  const notes = [];
  map.forEach((t, c) => { if (t === 'note' && row.cells[c]) notes.push(row.cells[c]); });
  if (row.tail) notes.push(row.tail);
  notes.push('CRM: ' + title + ' line ' + (row.line + 1));
  const body = {
    group_id: String(groupId || '0'),
    name: (pick('name') || login || (title + ' #' + (row.line + 1))).slice(0, 100),
    domain_name: 'facebook.com',
    remark: notes.join(' | ').slice(0, 1500),
    user_proxy_config: flApProxy(pick('proxy')) || { proxy_soft: 'no_proxy' }
  };
  if (login) body.username = login;
  if (pick('pass')) body.password = pick('pass');
  if (pick('fakey')) body.fakey = pick('fakey').replace(/\s+/g, '');
  if (cookie) { body.cookie = cookie; body.ignore_cookie_error = '1'; }
  /* ЗАВЖДИ WINDOWS. «деякі профілі створились os ios — завжди віндовс
     вибирай». Без вказівки AdsPower бере систему навмання, а юзер-агент
     із файла буває телефонним — і профіль виходив айфоном. Свій UA
     лишаємо лише коли він сам від Windows; інакше просимо випадковий,
     але тільки Windows 10 чи 11. */
  const ua = pick('ua');
  body.fingerprint_config = /Windows NT/i.test(ua) ? { ua }
    : { random_ua: { ua_system_version: ['Windows 10', 'Windows 11'] } };
  return body;
}

// Дописуємо позначки, не чіпаючи ні порядку рядків, ні їхніх кінців.
function flApMarkText(text, done) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  return String(text).split(/\r?\n/).map((l, i) =>
    done[i] && !FL_AP_MARK.test(l) ? l.replace(/\s+$/, '') + ' [ads:' + done[i] + ']' : l).join(eol);
}

let flAp = null;

async function flApCall(path, body) {
  const res = await fetch(FL_AP_URL + path, body === undefined ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

window.flApOpen = function () {
  if (!flTxt || flTxt.cut) return;
  const p = flApParse(flTxt.text);
  let group = '0';
  try { group = localStorage.getItem('fl-ap-group') || '0'; } catch (e) {}
  flAp = { rows: p.rows, cols: p.cols, map: p.map, groups: [], group,
           bridge: 'wait', why: '', busy: false, stop: false };
  flApPaint();
  flApPing();
};

window.flApBack = function () {
  if (flAp && flAp.busy) return;
  flAp = null;
  flTxtPaint(false);
};

window.flApPing = async function () {
  if (!flAp) return;
  const mine = flAp;
  mine.bridge = 'wait'; flApPaint();
  try {
    const s = await flApCall('/status');
    if (flAp !== mine) return;
    if (!s || !s.bridge) throw new Error('not the bridge');
    if (!s.adspower) { mine.bridge = 'noads'; mine.why = s.why || ''; flApPaint(); return; }
    const groups = [];
    for (let page = 1; page <= 10; page++) {
      const g = await flApCall('/api/v1/group/list?page=' + page + '&page_size=100');
      const list = (g && g.data && g.data.list) || [];
      list.forEach(x => groups.push({ id: String(x.group_id), name: String(x.group_name || x.group_id) }));
      if (list.length < 100) break;
    }
    if (flAp !== mine) return;
    mine.groups = groups;
    if (mine.group !== '0' && !groups.some(g => g.id === mine.group)) mine.group = '0';
    mine.bridge = 'ok';
  } catch (e) {
    if (flAp !== mine) return;
    mine.bridge = 'down';
  }
  flApPaint();
};

/* «клікаю на кнопку і програма на компі відкривається».
   Сторінка запустити програму не може, але Windows уміє відкривати
   програму за власним посиланням — якщо його один раз зареєстрували
   (adspower-bridge-install.bat). Після adsbridge:// у посиланні нічого
   корисного немає й бути не може: установник програмі його не передає.

   Чи спрацювало — дізнатись нема як (браузер мовчить в обидва боки),
   тому просто кілька разів перепитуємо місток. */
window.flApStart = function () {
  if (!flAp || flAp.busy) return;
  const mine = flAp;
  try {
    const fr = document.createElement('iframe');
    fr.style.display = 'none';
    fr.src = 'adsbridge://start';
    document.body.appendChild(fr);
    setTimeout(() => fr.remove(), 4000);
  } catch (e) {}
  [2500, 5000, 9000].forEach(ms => setTimeout(() => {
    if (flAp === mine && mine.bridge === 'down') flApPing();
  }, ms));
};

window.flApMap = function (col, type) {
  if (!flAp || flAp.busy) return;
  /* Два стовпчики «Login» — це завжди помилка вибору, а не задум:
     попередній власник ролі мовчки стає пропущеним. */
  if (!FL_AP_MANY.has(type))
    flAp.map.forEach((t, c) => { if (t === type && c !== col) flAp.map[c] = 'skip'; });
  flAp.map[col] = type;
  flApPaint();
};
window.flApSel = function (i, on) {
  if (!flAp || flAp.busy || !flAp.rows[i] || flAp.rows[i].sent) return;
  flAp.rows[i].sel = !!on;
  flApPaint();
};
window.flApAll = function (on) {
  if (!flAp || flAp.busy) return;
  flAp.rows.forEach(r => { if (!r.sent) r.sel = !!on; });
  flApPaint();
};
window.flApGroup = async function (v) {
  if (!flAp || flAp.busy) return;
  if (v === '__new') {
    const name = (window.prompt('New folder name in AdsPower') || '').trim();
    if (!name) { flApPaint(); return; }
    try {
      const r = await flApCall('/api/v1/group/create', { group_name: name });
      if (!r || r.code !== 0) throw new Error((r && r.msg) || 'AdsPower refused');
      const id = String(r.data && r.data.group_id);
      flAp.groups.unshift({ id, name });
      v = id;
    } catch (e) {
      if (typeof toast === 'function') toast('Could not create the folder: ' + e.message, 'error', 7000);
      flApPaint();
      return;
    }
  }
  flAp.group = String(v);
  try { localStorage.setItem('fl-ap-group', flAp.group); } catch (e) {}
  flApPaint();
};
window.flApStop = function () { if (flAp) flAp.stop = true; };

window.flApSend = async function () {
  if (!flAp || flAp.busy || flAp.bridge !== 'ok' || !flTxt) return;
  const mine = flAp;
  const title = (flRows[flTxt.i] && flRows[flTxt.i].title) || 'file';
  const todo = mine.rows.filter(r => r.sel && !r.sent);
  if (!todo.length) return;
  mine.busy = true; mine.stop = false;
  todo.forEach(r => { r.st = 'queued'; });
  flApPaint();

  /* Позначки пишемо у файл кожні десять профілів, а не лише в кінці:
     закрита посеред роботи вкладка інакше лишила б двадцять створених
     профілів без жодного сліду у файлі — і наступного разу їх створили
     б удруге. */
  let pending = {}, made = 0, failed = 0, saveErr = '';
  const flush = async () => {
    if (!Object.keys(pending).length || !flTxt) return;
    try { await flTxtPut(flApMarkText(flTxt.text, pending)); pending = {}; saveErr = ''; }
    catch (e) { saveErr = e.message; }
  };

  for (const row of todo) {
    if (mine.stop || flAp !== mine) break;
    const body = flApBody(row, mine.map, mine.group, title);
    if (!body) { row.st = 'No login or cookies in this line'; row.bad = true; failed++; flApPaint(); continue; }
    row.st = 'sending…'; row.bad = false; flApPaint();
    let res = null;
    try { res = await flApCall('/api/v1/user/create', body); }
    catch (e) {
      row.st = 'The bridge stopped answering'; row.bad = true; failed++;
      mine.bridge = 'down';
      break;
    }
    if (res && res.code === 0 && res.data) {
      row.sent = String(res.data.serial_number || res.data.id || 'ok');
      row.sel = false; row.st = ''; row.bad = false;
      pending[row.line] = row.sent; made++;
      if (made % 10 === 0) await flush();
    } else {
      row.st = String((res && res.msg) || 'AdsPower refused').slice(0, 140); row.bad = true; failed++;
    }
    flApPaint();
  }
  await flush();
  mine.rows.forEach(r => { if (r.st === 'queued') r.st = ''; });
  mine.busy = false;
  if (flAp === mine) flApPaint();
  if (typeof toast === 'function') {
    if (saveErr)
      toast(made + ' profile(s) created, but the file could not be marked: ' + saveErr, 'error', 12000);
    else
      toast(made + ' profile(s) created in AdsPower' + (failed ? ', ' + failed + ' failed' : '')
        + (mine.stop ? ' — stopped' : '') + '.', failed ? 'warn' : 'ok', 6000);
  }
  if (made && !saveErr) await flLoad();
};

function flApCellHtml(v, type) {
  const s = String(v == null ? '' : v);
  if (!s) return '';
  // Пароль на екрані не світимо: файл відкривають і при людях.
  if (type === 'pass') return '••••••';
  return flEsc(s.length > 30 ? s.slice(0, 28) + '…' : s);
}

function flApHtml() {
  const a = flAp;
  const left = a.rows.filter(r => !r.sent);
  const n = left.filter(r => r.sel).length;
  const sentN = a.rows.length - left.length;
  const state = a.bridge === 'ok' ? '<span class="fl-ap-ok">● AdsPower connected</span>'
    : a.bridge === 'wait' ? '<span class="fl-ap-dim">Looking for AdsPower…</span>'
    : a.bridge === 'noads' ? '<span class="fl-ap-bad">● Bridge is on, AdsPower is not answering</span>'
    : '<span class="fl-ap-bad">● Bridge is not running</span>';
  const grp = '<select class="fl-ap-sel" onchange="flApGroup(this.value)"' + (a.busy || a.bridge !== 'ok' ? ' disabled' : '') + '>'
    + '<option value="0"' + (a.group === '0' ? ' selected' : '') + '>Ungrouped</option>'
    + a.groups.map(g => '<option value="' + flEsc(g.id) + '"' + (g.id === a.group ? ' selected' : '') + '>'
        + flEsc(g.name) + '</option>').join('')
    + '<option value="__new">+ New folder…</option></select>';
  const send = a.busy
    ? '<button type="button" class="fl-mini is-bad" onclick="flApStop()">Stop</button>'
    : '<button type="button" class="fl-mini is-main" onclick="flApSend()"'
      + (n && a.bridge === 'ok' ? '' : ' disabled') + '>Send ' + n + ' to AdsPower</button>';
  const bar = '<div class="fl-txt-bar fl-ap-bar">'
    + '<button type="button" class="fl-mini" onclick="flApBack()"' + (a.busy ? ' disabled' : '') + '>← Back</button>'
    + state + '<span class="fl-ap-dim">Folder</span>' + grp + send
    + '<span class="fl-ap-dim">' + a.rows.length + ' account(s)' + (sentN ? ', ' + sentN + ' already sent' : '') + '</span></div>';

  const help = a.bridge === 'down'
    ? '<div class="fl-ap-help"><b>The AdsPower bridge is not running on this computer.</b> '
      + '<button type="button" class="fl-mini is-main" onclick="flApStart()">Start bridge</button> '
      + '<button type="button" class="fl-mini" onclick="flApPing()">Check again</button>'
      + '<br><span class="fl-ap-dim">First time on this computer: download the three files into one '
      + 'folder and run <b>adspower-bridge-install.bat</b> once — after that the Start button works. '
      + '<a href="tools/adspower-bridge.py" download>adspower-bridge.py</a> · '
      + '<a href="tools/adspower-bridge.bat" download>adspower-bridge.bat</a> · '
      + '<a href="tools/adspower-bridge-install.bat" download>adspower-bridge-install.bat</a>. '
      + 'Without the install step, run adspower-bridge.bat by hand and keep its window open. '
      + 'Works only where AdsPower runs; if the browser asks to allow access to devices on the '
      + 'local network, allow it.</span></div>'
    : a.bridge === 'noads'
    ? '<div class="fl-ap-help"><b>Open AdsPower and sign in</b>, then '
      + '<button type="button" class="fl-mini" onclick="flApPing()">Check again</button>'
      + (a.why ? ' <span class="fl-ap-dim">' + flEsc(a.why) + '</span>' : '') + '</div>'
    : '';

  if (!a.rows.length)
    return bar + help + '<p class="fl-ap fl-ap-empty">No account lines found in this file. '
      + 'A line counts when it has at least two fields or cookies.</p>';

  const allOn = left.length > 0 && n === left.length;
  let head = '<th><input type="checkbox" title="All not sent yet"' + (allOn ? ' checked' : '')
    + (a.busy || !left.length ? ' disabled' : '') + ' onchange="flApAll(this.checked)"></th><th>#</th><th>AdsPower</th>';
  for (let c = 0; c < a.cols; c++) {
    head += '<th><select class="fl-ap-sel' + (a.map[c] === 'skip' ? ' is-skip' : '') + '"'
      + (a.busy ? ' disabled' : '') + ' onchange="flApMap(' + c + ', this.value)">'
      + FL_AP_TYPES.map(t => '<option value="' + t[0] + '"' + (a.map[c] === t[0] ? ' selected' : '') + '>'
          + t[1] + '</option>').join('') + '</select></th>';
  }
  const body = a.rows.map((r, i) => {
    let tds = '<td><input type="checkbox"' + (r.sel && !r.sent ? ' checked' : '')
      + (r.sent || a.busy ? ' disabled' : '') + ' onchange="flApSel(' + i + ', this.checked)"></td>'
      + '<td class="fl-ap-dim">' + (r.line + 1) + '</td>'
      /* Стан — одразу біля галочки, а не останнім стовпчиком: з куками
         й юзер-агентом таблиця широка, і «відправлено» ховалось би за
         правим краєм. */
      + '<td class="fl-ap-st">' + (r.sent ? '<span class="fl-ap-ok">✓ #' + flEsc(r.sent) + '</span>'
        : r.st ? '<span class="' + (r.bad ? 'fl-ap-bad' : 'fl-ap-dim') + '">' + flEsc(r.st) + '</span>' : '') + '</td>';
    for (let c = 0; c < a.cols; c++)
      tds += '<td class="' + (a.map[c] === 'skip' ? 'is-skip' : '') + '">' + flApCellHtml(r.cells[c], a.map[c]) + '</td>';
    return '<tr class="' + (r.sent ? 'is-sent' : '') + '">' + tds + '</tr>';
  }).join('');
  return bar + help + '<div class="fl-ap"><table class="fl-ap-tbl"><thead><tr>' + head
    + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

function flApPaint() {
  const box = document.getElementById('fl-view');
  const host = box && box.querySelector('.fl-view-box');
  if (!host || !flAp) return;
  /* Таблиця перемальовується цілою, тому місце прокрутки запам'ятовуємо:
     інакше після кожного створеного профілю список стрибав би вгору. */
  const old = host.querySelector('div.fl-ap');
  const top = old ? old.scrollTop : 0, left = old ? old.scrollLeft : 0;
  host.querySelectorAll('.fl-txt-bar, .fl-txt, .fl-ta, .fl-ap, .fl-ap-help').forEach(el => el.remove());
  host.insertAdjacentHTML('beforeend', flApHtml());
  const now = host.querySelector('div.fl-ap');
  if (now) { now.scrollTop = top; now.scrollLeft = left; }
}
</script>
