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
      + ' title="Open this cabinet">@' + id + '</button>')
    .replace(FL_TAG_RE, (_m, tag) =>
      '<button type="button" class="fl-t fl-t-tag" onclick="flTagGo(\''
      + flEsc(tag.toLowerCase()).replace(/'/g, '&#39;') + '\')"'
      + ' title="Show files with this tag">#' + tag + '</button>');
}

/* Мітка веде до кабінета — заради цього вона й мітка. Вікно
   зачиняємо: залишити його відкритим поверх кабінета означало б
   показати перехід, який нікуди не привів. */
window.flCabGo = function (id) {
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
   саме те, чого ми й хочемо. */
async function flSigned(row) {
  const { data, error } = await sb.storage.from(FL_BUCKET)
    .createSignedUrl(row.path, 600);
  if (error) throw new Error(error.message);
  return data?.signedUrl || '';
}

window.flGet = async function (i) {
  const r = flRows[i];
  if (!r) return;
  try {
    const url = await flSigned(r);
    const a = document.createElement('a');
    a.href = url; a.download = r.title; a.rel = 'noopener';
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
      : '<button type="button" class="fl-mini" onclick="flTxtEdit()">Edit</button>';
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
  const old = host.querySelector('.fl-txt-bar');
  const body = host.querySelector('.fl-txt, .fl-ta');
  if (old) old.remove();
  if (body) body.remove();
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

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  if (blob.size > FL_MAX) {
    if (typeof toast === 'function')
      toast('That would be ' + flSize(blob.size) + ' — the limit is ' + flSize(FL_MAX), 'error');
    return;
  }
  const btn = document.querySelector('.fl-txt-bar .is-main');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
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
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    /* Який саме крок відмовив — ми знаємо, і це вся різниця між
       порадою і загадкою. */
    const msg = !flRls(e) ? 'Could not save: ' + e.message
      : step === 'storage'
        ? 'Saving over a file needs one more rule in the bucket. '
          + 'Run FILES.sql again — it adds the update policy.'
        : 'This file was uploaded by someone else, so only they can change it.';
    if (typeof toast === 'function') toast(msg, 'error', 9000);
    return;
  }
  flTxt.text = text;
  flTxt.enc = 'utf-8';             // тепер це справді так
  flTxtPaint(false);
  if (typeof toast === 'function') toast('Saved.', 'ok', 2500);
  await flLoad();
};

window.flViewClose = function () {
  flViewAt++;                      // усе, що вантажиться, більше не наше
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
</script>
