<script>
/* ══════════════════════════════════════════════════════════════════
   УНІКАЛІЗАТОР СТАТИКИ

   Одна картинка на вході, кілька справді різних на виході. Усе
   рахується в цій самій вкладці: ні сервера, ні завантаження, ні
   сліду — креатив нікуди не їде, і це не обіцянка, а просто те, що
   інакше тут неможливо.

   ЧОМУ САМЕ ЦІ ПЕРЕТВОРЕННЯ. Платформи порівнюють не байти, а
   перцептивний хеш і класифікатор кадру. Тому в наборі немає нічого,
   що міняє лише файл: кожна вісь рухає саме картинку — обрізає,
   хилить, додає зерно, зсуває колір. Переліченого разом досить, щоб
   хеш поїхав, і водночас мало, щоб креатив лишився собою.

   ЩО МИ ПРО ЦЕ КАЖЕМО ЧЕСНО. Поруч із кожним варіантом стоїть
   відстань його хеша від оригіналу — з тієї ж причини, з якої в
   таблицях стоїть «≈»: інакше людина вірить, що зробила щось, не
   маючи жодного способу перевірити. Нуль означає «для машини це та
   сама картинка», і краще побачити його тут, ніж у кабінеті.

   Дзеркалення тут немає навмисно: на статиці з текстом і цифрами воно
   ламає сам креатив.
   ══════════════════════════════════════════════════════════════════ */

let uiSrc = [];      // { name, base, bmp, w, h, hash }
let uiOut = [];      // { srcName, name, blob, url, dist, axes }

/* Детермінований генератор. Один і той самий файл із тими самими
   налаштуваннями мусить давати той самий набір: інакше «перегенеруй»
   означало б «почни все спочатку», а назви файлів перестали б
   означати щось конкретне. */
function uiRnd(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function uiSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* dHash: 9×8 у сірому, далі порівнюємо кожен піксель із сусідом
   праворуч — 64 біти. Беремо його, а не середнє (aHash): середнє
   надто легко обдурити зміною яскравості, тобто саме тим, що ми тут і
   робимо, і тоді число поруч із варіантом хвалило б нас даремно. */
function uiHash(img, w, h) {
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h, 0, 0, 9, 8);
  const d = g.getImageData(0, 0, 9, 8).data;
  const grey = [];
  for (let i = 0; i < 72; i++)
    grey.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  const bits = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits.push(grey[y * 9 + x] > grey[y * 9 + x + 1] ? 1 : 0);
  return bits;
}
function uiDist(a, b) {
  if (!a || !b) return null;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

const uiAx = (k) => !!document.getElementById('ui-ax-' + k)?.checked;

window.uiFmtChanged = function () {
  const png = document.getElementById('ui-fmt')?.value === 'image/png';
  document.getElementById('ui-q-wrap')?.classList.toggle('is-off', png);
};

window.uiPick = async function (files) {
  const list = [...(files || [])];
  if (!list.length) return;
  const note = document.getElementById('ui-note');
  if (note) note.textContent = 'Reading ' + list.length + ' file(s)…';
  for (const f of list) {
    try {
      const bmp = await createImageBitmap(f);
      const base = String(f.name).replace(/\.[^.]+$/, '');
      uiSrc.push({ name: f.name, base, bmp, w: bmp.width, h: bmp.height,
                   hash: uiHash(bmp, bmp.width, bmp.height) });
    } catch (e) {
      if (typeof toast === 'function') toast('Could not read ' + f.name, 'error');
    }
  }
  uiPaint();
};

window.uiClear = function () {
  uiOut.forEach(o => { try { URL.revokeObjectURL(o.url); } catch (e) {} });
  uiSrc = []; uiOut = [];
  const el = document.getElementById('ui-files');
  if (el) el.value = '';
  uiPaint();
};

/* Один варіант. Порядок дій має значення: спершу геометрія (обрізка й
   нахил) на чистому полотні, далі колір фільтром при перемальовуванні,
   і тільки потім зерно — по готових пікселях. Зерно перед масштабуванням
   згладилось би й зникло. */
async function uiOne(src, i, opts) {
  const rnd = uiRnd(uiSeed(src.base + '|' + i + '|' + opts.sig));
  const W = src.w, H = src.h;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const axes = [];

  // ── геометрія ──
  let cut = 0, deg = 0;
  if (opts.crop) { cut = 0.01 + rnd() * 0.03; axes.push('c' + Math.round(cut * 100)); }
  if (opts.rot) { deg = (rnd() * 1.6 - 0.8); axes.push('r' + deg.toFixed(1)); }

  // Нахил вимагає запасу: повернуте зображення інакше лишає порожні
  // кути, і «унікалізація» перетворюється на чорні трикутники.
  const grow = deg ? 1 + Math.abs(deg) / 40 : 1;
  const sx = W * cut / 2, sy = H * cut / 2;
  const sw = W * (1 - cut), sh = H * (1 - cut);

  if (opts.color) {
    const br = (0.97 + rnd() * 0.06).toFixed(3);
    const ct = (0.97 + rnd() * 0.07).toFixed(3);
    const st = (0.95 + rnd() * 0.12).toFixed(3);
    const hu = Math.round(rnd() * 8 - 4);
    g.filter = `brightness(${br}) contrast(${ct}) saturate(${st}) hue-rotate(${hu}deg)`;
    axes.push('k' + hu);
  }
  g.save();
  g.translate(W / 2, H / 2);
  if (deg) g.rotate(deg * Math.PI / 180);
  g.scale(grow, grow);
  g.drawImage(src.bmp, sx, sy, sw, sh, -W / 2, -H / 2, W, H);
  g.restore();
  g.filter = 'none';

  // ── вінʼєтка ──
  if (opts.vig) {
    const a = 0.06 + rnd() * 0.08;
    const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35,
                                      W / 2, H / 2, Math.max(W, H) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,' + a.toFixed(3) + ')');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    axes.push('v');
  }

  // ── накладка ──
  if (opts.over) {
    const pad = Math.round(Math.min(W, H) * (0.03 + rnd() * 0.03));
    const size = Math.max(11, Math.round(Math.min(W, H) * (0.03 + rnd() * 0.02)));
    const corner = Math.floor(rnd() * 4);
    const x = corner % 2 ? W - pad : pad;
    const y = corner < 2 ? pad + size : H - pad;
    g.globalAlpha = 0.5 + rnd() * 0.3;
    if (opts.text) {
      g.font = '700 ' + size + 'px system-ui, sans-serif';
      g.textAlign = corner % 2 ? 'right' : 'left';
      g.fillStyle = '#fff';
      g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = size / 3;
      g.fillText(opts.text, x, y);
      g.shadowBlur = 0;
    } else {
      /* Тексту немає — кладемо маленький прямокутник. Не емодзі: воно
         малюється шрифтом системи, і на іншому компʼютері той самий
         «варіант» вийшов би іншим. */
      g.fillStyle = 'rgba(255,255,255,.9)';
      const w2 = size * 1.6, h2 = Math.max(2, Math.round(size / 5));
      g.fillRect(corner % 2 ? x - w2 : x, y - h2, w2, h2);
    }
    g.globalAlpha = 1;
    axes.push('o' + corner);
  }

  // ── зерно ──
  if (opts.noise) {
    const amp = 3 + Math.round(rnd() * 6);
    const d = g.getImageData(0, 0, W, H);
    const p = d.data;
    for (let k = 0; k < p.length; k += 4) {
      const n = (rnd() * 2 - 1) * amp;
      p[k] += n; p[k + 1] += n; p[k + 2] += n;
    }
    g.putImageData(d, 0, 0);
    axes.push('n' + amp);
  }

  const blob = await new Promise(res => c.toBlob(res, opts.fmt, opts.q));
  const ext = opts.fmt === 'image/png' ? 'png' : 'jpg';
  const stem = (opts.prefix || src.base).replace(/[\\/:*?"<>|]+/g, '_');
  return { srcName: src.name, name: stem + '_u' + String(i).padStart(2, '0') + '.' + ext,
           blob, url: URL.createObjectURL(blob),
           dist: uiDist(src.hash, uiHash(c, W, H)), axes: axes.join(' ') };
}

/* ═══════════ НЕ ЗАКРИВАЙ, ПОКИ ВОНО КРУТИТЬСЯ ═══════════

   «зроби перевірку, коли в мене йде унікалізація, і я хочу
   перезагрузити сторінку, ти питай мене чи точно я хочу це зробити».

   Робота живе ТІЛЬКИ у вкладці: відео крутить ffmpeg у браузері,
   картинки — canvas, нічого нікуди не вивантажується. Тобто
   перезавантаження не «перерве й продовжить» — воно викине все, що
   встигло нарахуватись, і повернутись до цього нічим.

   Питає сам браузер: власного вікна тут не поставити, бо сторінку
   вже закривають. Текст теж його — Chrome і Firefox свій показують і
   чужого не беруть; наш рядок лишається для тих, хто його ще читає.

   Сторож вішається РІВНО на час роботи. Постійний beforeunload
   питав би й тоді, коли нічого не робиться, — а від такого питання
   за тиждень перестають читати й тиснуть «піти» не дивлячись. */
let uqGuards = 0;
function uqBeforeUnload(e) {
  e.preventDefault();
  e.returnValue = '';
  return '';
}
/* Рахунок, а не прапорець: обидва режими можуть крутитись одночасно,
   і той, що скінчився першим, не має знімати сторожа з другого. */
window.uqGuard = function (on) {
  uqGuards = Math.max(0, uqGuards + (on ? 1 : -1));
  if (uqGuards === 1 && on) window.addEventListener('beforeunload', uqBeforeUnload);
  if (uqGuards === 0) window.removeEventListener('beforeunload', uqBeforeUnload);
};

/* ═══════════ ЩО ВЖЕ ЗАБРАНО ═══════════

   «зроби коли я скачую унікалізовані креативи, щоб кнопка DOWNLOAD
   мінялась на зелений якщо я скачав вже».

   Варіантів буває сорок, вони однакові з лиця й відрізняються
   підписом — а качають їх по одному, між справами. Повернувся через
   десять хвилин і не знаєш, де спинився: або качаєш удруге, або
   пропускаєш.

   ЩО САМЕ ПОЗНАЧАЄ ЗЕЛЕНИЙ. Що ти натиснув, а не що файл лежить на
   диску: браузер про завершення завантаження сторінці не каже, і
   скасоване збереження виглядає звідси так само, як вдале. Для
   «де я спинився» цього досить, і обіцяти більше не варто.

   Пам'ять — на сеанс і в сторінці: це мітка про те, що робиться
   просто зараз, а не запис про креатив. Нові варіанти — чистий
   аркуш, і це правильно: вони інші. */
const uiGot = new Set();

/* Для картинок позначаємо ІМЕНЕМ, а не самим елементом: сітка
   перемальовується (uiPaint), і мітка на вузлі зникла б разом із ним.
   Ім'я варіанта унікальне в межах набору. */
window.uiGotMark = function (el, name) {
  if (name) uiGot.add(name);
  if (el) el.classList.add('is-got');
};

/* Відео малюються рядками один раз і не перемальовуються, тож тут
   вистачає класу на самій кнопці. Класи Tailwind міняємо явно:
   інакше hover:bg-violet-500 перебив би колір рівно тоді, коли на
   кнопку наводять, тобто саме коли на неї й дивляться. */
window.uqGotMark = function (a) {
  if (!a) return;
  a.classList.remove('bg-violet-600/80', 'hover:bg-violet-500');
  a.classList.add('uq-got');
};

window.uiGen = async function () {
  if (!uiSrc.length) {
    if (typeof toast === 'function') toast('Add an image first', 'warn');
    return;
  }
  const n = Math.max(1, Math.min(40, Number(document.getElementById('ui-n')?.value) || 5));
  const fmt = document.getElementById('ui-fmt')?.value || 'image/jpeg';
  const opts = {
    fmt,
    q: (Number(document.getElementById('ui-q')?.value) || 92) / 100,
    prefix: String(document.getElementById('ui-prefix')?.value || '').trim(),
    text: String(document.getElementById('ui-text')?.value || '').trim(),
    crop: uiAx('crop'), rot: uiAx('rot'), noise: uiAx('noise'),
    color: uiAx('color'), vig: uiAx('vig'), over: uiAx('over')
  };
  // Підпис набору входить у зерно генератора: змінив налаштування —
  // отримав інші варіанти, повторив те саме — отримав ті самі.
  opts.sig = [fmt, opts.q, opts.text, opts.crop, opts.rot, opts.noise,
              opts.color, opts.vig, opts.over].join(',');

  if (!(opts.crop || opts.rot || opts.noise || opts.color || opts.vig || opts.over)) {
    if (typeof toast === 'function') toast('Nothing is switched on to vary', 'warn');
    return;
  }

  const note = document.getElementById('ui-note');
  uqGuard(true);
  try {
  uiOut.forEach(o => { try { URL.revokeObjectURL(o.url); } catch (e) {} });
  /* Варіанти інші — і мітки «забрано» разом із ними. Лишити старі
     означало б показати зеленим те, чого людина не бачила. */
  uiGot.clear();
  uiOut = [];
  for (const src of uiSrc) {
    for (let i = 1; i <= n; i++) {
      if (note) note.textContent = `${src.name}: ${i} of ${n}…`;
      // Віддаємо кадр браузеру, інакше сторінка стоїть колом на великій пачці
      await new Promise(r => setTimeout(r, 0));
      uiOut.push(await uiOne(src, i, opts));
    }
  }
  uiPaint();
  } finally { uqGuard(false); }
};

function uiPaint() {
  const out = document.getElementById('ui-out');
  const note = document.getElementById('ui-note');
  if (!out) return;
  if (!uiSrc.length) {
    out.innerHTML = '';
    if (note) note.textContent = '';
    return;
  }
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const kb = (b) => (b / 1024 < 1024 ? Math.round(b / 1024) + ' KB'
                                     : (b / 1048576).toFixed(1) + ' MB');

  out.innerHTML = uiSrc.map(src => {
    const mine = uiOut.filter(o => o.srcName === src.name);
    /* Нуль і одиниця — це «та сама картинка» для будь-якого хеша, і
       казати про це треба голосно: саме такий варіант людина й залила б
       у кабінет, думаючи, що зробила роботу. */
    const cell = (o) => `<figure class="ui-cell ${o.dist != null && o.dist < 5 ? 'is-same' : ''}">
        <img src="${o.url}" alt="" loading="lazy">
        <figcaption>
          <span class="ui-cell-n">${esc(o.name)}</span>
          <span class="ui-cell-m">${kb(o.blob.size)}${o.axes ? ' · ' + esc(o.axes) : ''}</span>
        </figcaption>
        <span class="ui-badge" title="Perceptual hash distance from the original, out of 64. Under 5 — a machine sees the same picture.">${
          o.dist == null ? '?' : o.dist}</span>
        <a class="ui-dl${uiGot.has(o.name) ? ' is-got' : ''}" href="${o.url}"
           download="${esc(o.name)}" onclick="uiGotMark(this, '${esc(o.name)}')"
           title="${uiGot.has(o.name) ? 'Already saved' : 'Save this one'}">${
             uiGot.has(o.name) ? '✓' : '↓'}</a>
      </figure>`;
    return `<section class="ui-group">
      <h3 class="ui-group-h">${esc(src.name)}
        <span class="ui-group-s">${src.w}×${src.h} · ${mine.length} variant(s)</span></h3>
      <div class="ui-row">
        <figure class="ui-cell is-src">
          <img src="" alt="" loading="lazy" data-src-name="${esc(src.name)}">
          <figcaption><span class="ui-cell-n">original</span></figcaption>
        </figure>
        ${mine.map(cell).join('')}
      </div>
    </section>`;
  }).join('');

  // Оригінал малюємо з самого bitmap: тримати ще один objectURL на файл
  // тільки для превʼю немає сенсу.
  uiSrc.forEach(src => {
    const img = out.querySelector(`img[data-src-name="${CSS.escape(src.name)}"]`);
    if (!img) return;
    const c = document.createElement('canvas');
    const k = 240 / Math.max(src.w, src.h);
    c.width = Math.max(1, Math.round(src.w * k));
    c.height = Math.max(1, Math.round(src.h * k));
    c.getContext('2d').drawImage(src.bmp, 0, 0, c.width, c.height);
    img.src = c.toDataURL('image/jpeg', 0.8);
  });

  if (note) {
    const same = uiOut.filter(o => o.dist != null && o.dist < 5).length;
    note.textContent = uiOut.length
      ? uiOut.length + ' variant(s) ready'
        + (same ? ' — ' + same + ' of them a machine still sees as the original'
                  + ' (switch on another axis, or raise the grain)' : '')
      : uiSrc.length + ' image(s) loaded — press Generate';
  }
}

/* ── ZIP без жодної бібліотеки ──
   Складаємо «store» — без стиснення. JPEG і PNG вже стиснуті, deflate
   над ними виграв би одиниці відсотків, а тягнути заради цього
   бібліотеку з CDN на статичний сайт — ні. Дата в архіві стала
   навмисно: той самий набір має давати той самий файл. */
const UI_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function uiCrc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = UI_CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

window.uiZip = async function () {
  if (!uiOut.length) {
    if (typeof toast === 'function') toast('Nothing to pack yet', 'warn');
    return;
  }
  const enc = new TextEncoder();
  const parts = [], dir = [];
  let at = 0;
  const DOS_TIME = 0, DOS_DATE = 0x2821;     // 2000-01-01, стала на всі архіви

  for (const o of uiOut) {
    const nameU8 = enc.encode(o.name);
    const data = new Uint8Array(await o.blob.arrayBuffer());
    const crc = uiCrc32(data);

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034B50, true);       // підпис локального заголовка
    lh.setUint16(4, 20, true);               // потрібна версія
    lh.setUint16(6, 0, true);                // без прапорців
    lh.setUint16(8, 0, true);                // метод: store
    lh.setUint16(10, DOS_TIME, true);
    lh.setUint16(12, DOS_DATE, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameU8.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameU8, data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014B50, true);       // підпис запису каталогу
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, DOS_TIME, true);
    ch.setUint16(14, DOS_DATE, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameU8.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, at, true);              // де лежить локальний заголовок
    dir.push(new Uint8Array(ch.buffer), nameU8);

    at += 30 + nameU8.length + data.length;
  }

  const dirBytes = dir.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, uiOut.length, true);
  end.setUint16(10, uiOut.length, true);
  end.setUint32(12, dirBytes, true);
  end.setUint32(16, at, true);
  end.setUint16(20, 0, true);

  const blob = new Blob([...parts, ...dir, new Uint8Array(end.buffer)],
                        { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'uniq_' + new Date().toISOString().slice(0, 10) + '.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

/* ── ДВА РЕЖИМИ В ОДНОМУ ВІКНІ ──
   Відео крутить ffmpeg (старий код, нижче в документі), статику —
   canvas. Перемикач лише показує потрібну панель: спільного стану в них
   немає, і робота одного не чіпає інший. */
/* Блок «з Drive» один на обидва режими: стоїть у рядку вибору файлів
   того режиму, який зараз відкритий. */
window.uqDrivePlace = function (m) {
  const box = document.getElementById('uq-drive');
  const slot = document.getElementById(m === 'image' ? 'uq-drive-slot-image' : 'uq-drive-slot-video');
  if (box && slot && box.parentElement !== slot) slot.appendChild(box);
};
document.addEventListener('DOMContentLoaded', () => uqDrivePlace('video'));

window.uqMode = function (m) {
  const img = m === 'image';
  uqDrivePlace(img ? 'image' : 'video');
  document.getElementById('ui-pane')?.classList.toggle('hidden', !img);
  document.getElementById('uq-pane')?.classList.toggle('hidden', img);
  document.getElementById('uq-tab-image')?.classList.toggle('is-on', img);
  document.getElementById('uq-tab-video')?.classList.toggle('is-on', !img);
};

/* Перетягування на всю картку, а не лише на рамку: кидають зазвичай
   туди, куди дивляться. */
(function () {
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  document.addEventListener('dragover', e => {
    if (!e.target.closest || !e.target.closest('#ui-pane')) return;
    stop(e);
    document.getElementById('ui-drop')?.classList.add('is-over');
  });
  document.addEventListener('dragleave', e => {
    if (!e.target.closest || !e.target.closest('#ui-pane')) return;
    document.getElementById('ui-drop')?.classList.remove('is-over');
  });
  document.addEventListener('drop', e => {
    if (!e.target.closest || !e.target.closest('#ui-pane')) return;
    stop(e);
    document.getElementById('ui-drop')?.classList.remove('is-over');
    const files = [...(e.dataTransfer?.files || [])].filter(f => /^image\//.test(f.type));
    if (files.length) uiPick(files);
  });
})();

/* ═══════════ УНІКАЛІЗАТОР: ДОДАТИ КРЕАТИВ З DRIVE ЗА НАЗВОЮ ═══════════

   «в унікалізаторі додавання через назву: вибираємо крео — і воно
   тягне з Google Drive» і «в Creative Analyzer кнопка до кожного крео,
   яка автоматично додає в унікалізатор».

   Файл шукаємо тим самим шляхом, що й прев'ю креатива (driveFindCreative:
   підпапки гео, корінь папки команди, решта підпапок, точний збіг
   назви), і качаємо його з Drive за API-ключем — папка й так мусить
   бути відкрита за посиланням, інакше не було б і прев'ю. Відео йде в
   чергу ffmpeg, картинка — у режим зображень. Байти нікуди, крім цього
   браузера, не йдуть. */
let uqDriveBusy = false;
/* ОБРИВ ПІД ЧАС УНІКАЛІЗАЦІЇ. «Could not add GE_03jek: Failed to fetch»
   — коли поруч кодує ffmpeg. Він забирає пам'ять і потоки вкладки
   (Parallel: Auto — кілька копій одразу), і браузер обриває велике
   завантаження без коду й причини. Після кодування той самий файл
   качається нормально. Тому такий креатив стає в чергу й докачується
   сам, щойно унікалізація закінчиться; без унікалізації — одна повторна
   спроба за кілька секунд. */
let uqDriveWait = [], uqDriveTimer = null;
function uqDriveLater(cid) {
  if (!uqDriveWait.includes(cid)) uqDriveWait.push(cid);
  uqDriveSay('Uniqueizing is using the browser right now — ' + uqDriveWait.join(', ')
    + ' will be added as soon as it finishes.');
  if (uqDriveTimer) return;
  uqDriveTimer = setInterval(async () => {
    if (typeof uqBusy !== 'undefined' && uqBusy) return;
    clearInterval(uqDriveTimer); uqDriveTimer = null;
    const list = uqDriveWait.splice(0);
    for (const c of list) await uqDriveAdd(c, true);
  }, 3000);
}

function uqDriveSay(t, bad) {
  const el = document.getElementById('uq-drive-st');
  if (!el) return;
  el.textContent = t || '';
  el.classList.toggle('is-bad', !!bad);
}

// Підказки: креативи зі статистики й файли з Drive, якщо їх уже обходили.
window.uqDriveList = function () {
  const dl = document.getElementById('uq-drive-list');
  if (!dl) return;
  const names = new Set();
  (window.creativesRawDataAll || window.creativesRawData || []).forEach(d => { if (d && d.cid) names.add(String(d.cid).trim()); });
  if (typeof crColdFiles !== 'undefined' && Array.isArray(crColdFiles))
    crColdFiles.forEach(f => names.add(String(f.name || '').replace(/\.[^.]+$/, '').trim()));
  dl.innerHTML = [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map(n => `<option value="${String(n).replace(/"/g, '&quot;')}">`).join('');
};

window.uqDriveAdd = async function (name, retried) {
  const inp = document.getElementById('uq-drive-in');
  const cid = String(name != null ? name : (inp && inp.value) || '').trim();
  if (!cid || uqDriveBusy) return;
  if (typeof teamDriveFolderId === 'undefined' || !teamDriveFolderId) {
    uqDriveSay('The Drive folder is not set — add it in Settings → Integrations → Google Drive.', true);
    return;
  }
  uqDriveBusy = true;
  uqDriveSay('Looking for ' + cid + ' in Drive…');
  try {
    const f = await driveFindCreative(cid);
    if (!f || !f.id) { uqDriveSay('No file named ' + cid + ' in the Drive folder.', true); return; }
    const res = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id)
      + '?alt=media&key=' + _driveKey());
    if (!res.ok) throw new Error(res.status === 403 || res.status === 404
      ? 'Drive did not give the file (' + res.status + ') — the folder must be shared with anyone who has the link'
      : 'Drive ' + res.status);
    // Читаємо шматками — щоб показувати, скільки вже скачано.
    const total = Number(res.headers.get('content-length')) || 0;
    const parts = []; let got = 0;
    const rd = res.body && res.body.getReader ? res.body.getReader() : null;
    if (rd) {
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); got += value.length;
        uqDriveSay('Downloading ' + f.name + ' · ' + (total ? Math.round(got / total * 100) + '%' : (got / 1048576).toFixed(1) + ' MB'));
      }
    } else parts.push(new Uint8Array(await res.arrayBuffer()));
    const type = String(f.mimeType || res.headers.get('content-type') || '');
    const file = new File(parts, f.name, { type });
    if (/^video\//.test(type) || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(f.name)) {
      uqMode('video');
      const seen = new Set(uqFiles.map(x => x.name + '|' + x.size));
      if (!seen.has(file.name + '|' + file.size)) uqFiles.push(file);
      if (uqBusy) uqQueueDirty = true;
      uqRenderFileList();
      uqDriveSay('Added ' + f.name + ' to the video queue.');
    } else if (/^image\//.test(type) || /\.(png|jpe?g|webp)$/i.test(f.name)) {
      uqMode('image');
      await uiPick([file]);
      uqDriveSay('Added ' + f.name + ' to images.');
    } else {
      uqDriveSay(f.name + ' is neither a video nor an image.', true);
    }
    if (inp && name == null) inp.value = '';
  } catch (e) {
    const net = e instanceof TypeError;          // «Failed to fetch»: відповіді не було взагалі
    if (inp && name == null) inp.value = '';
    if (net && typeof uqBusy !== 'undefined' && uqBusy) {
      uqDriveBusy = false;
      uqDriveLater(cid);
      return;
    }
    if (net && !retried) {
      uqDriveBusy = false;
      uqDriveSay('The download broke off — trying ' + cid + ' once more…');
      await new Promise(r => setTimeout(r, 4000));
      return uqDriveAdd(cid, true);
    }
    uqDriveSay('Could not add ' + cid + ': ' + (net
      ? 'the download broke off (network or not enough memory in this tab). Try again in a moment.'
      : (e.message || e)), true);
  } finally {
    uqDriveBusy = false;
  }
};

/* БЕЗ DRIVE — СІРИМ, А НЕ ПРИХОВАНИМ. «показувати тільки якщо в
   налаштуваннях доданий Google Drive, або сірим, щоб люди розуміли, що
   функція заблокована». Сховати означало б, що про неї ніхто не дізнається;
   сірий блок із підказкою й посиланням на налаштування каже і що вона є,
   і що зробити. Перевіряємо щоразу, як відкривається вікно: папку могли
   щойно додати. */
const uqDriveOn = () => typeof teamDriveFolderId !== 'undefined' && !!teamDriveFolderId;
window.uqDrivePaint = function () {
  const on = uqDriveOn();
  document.getElementById('uq-drive')?.classList.toggle('is-off', !on);
  ['uq-drive-in', 'uq-drive-btn'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !on; });
  document.querySelectorAll('.cr-uq-head').forEach(b => {
    b.classList.toggle('is-off', !on);
    b.title = on ? 'Open the Uniqueizer with this creative from Drive'
      : 'Connect Google Drive in Settings → Integrations to use this';
  });
};
// Відкрити налаштування одразу на вкладці Google Drive.
window.uqDriveSetup = function () {
  if (typeof closeUniqModal === 'function') closeUniqModal();
  if (typeof openSettingsModal === 'function') openSettingsModal();
  if (typeof switchSettingsTab === 'function') switchSettingsTab('integrations');
  if (typeof setSubTab === 'function') setSubTab('drive');
};
// Щоразу, як відкривається вікно унікалізатора, — свіжий стан Drive.
if (typeof openUniqModal === 'function' && !openUniqModal.__drive) {
  const open0 = openUniqModal;
  window.openUniqModal = function () { const r = open0.apply(this, arguments); uqDrivePaint(); return r; };
  window.openUniqModal.__drive = true;
}

/* ═══ У СПИСОК УНІКАЛІЗАТОРА — БЕЗ ВІДКРИТТЯ ВІКНА ═══
   «коли клікаю на унікалізатор кнопку в списку щоб воно автоматом в
   список летіло, а не відкривало унікалізатор, або зробити кнопку
   масового додавання, але поки що зроби це тільки для черги».

   Файли качаються по одному (uqDriveAdd і так не бере другий, поки
   йде перший), прогрес — у тості. Клікати можна далі: нові креативи
   стають у хвіст. Вікно унікалізатора потім відкривається вже з
   готовим списком. */
let uqBg = [], uqBgRun = false, uqBgDone = 0, uqBgBad = [];
window.uqBgAdd = async function (cids) {
  if (!uqDriveOn()) {
    toast('Connect Google Drive in Settings → Integrations — the Uniqueizer takes creatives from there', 'warn', 4000);
    return;
  }
  const have = new Set(uqFiles.map(f => String(f.name || '').replace(/\.[^.]+$/, '').trim().toLowerCase()));
  let skipped = 0;
  cids.forEach(c => {
    const k = String(c || '').trim();
    if (!k) return;
    if (have.has(k.toLowerCase()) || uqBg.includes(k)) { skipped++; return; }
    uqBg.push(k);
  });
  if (!uqBg.length) { if (skipped) toast('Already in the Uniqueizer list', 'ok', 2000); return; }
  if (uqBgRun) { toast('Added to the Uniqueizer line-up (' + uqBg.length + ' waiting)', 'ok', 1800); return; }
  uqBgRun = true; uqBgDone = 0; uqBgBad = [];
  const step = toastStep();
  try {
    while (uqBg.length) {
      const c = uqBg.shift();
      const n = uqBgDone + uqBgBad.length + 1, of = n + uqBg.length;
      step.say('Uniqueizer: downloading ' + c + (of > 1 ? ' (' + n + ' of ' + of + ')' : '') + '…');
      while (uqDriveBusy) await new Promise(r => setTimeout(r, 400));
      await uqDriveAdd(c);
      const st = document.getElementById('uq-drive-st');
      if (st && st.classList.contains('is-bad')) uqBgBad.push(c + ' — ' + st.textContent.replace(/^Could not add [^:]+: /, ''));
      else uqBgDone++;
    }
  } finally { uqBgRun = false; }
  const total = uqFiles.length;
  step.done(uqBgBad.length
    ? 'Uniqueizer: added ' + uqBgDone + ', not added ' + uqBgBad.length + ': ' + uqBgBad.join('; ')
    : 'Added ' + uqBgDone + ' to the Uniqueizer — ' + total + ' video(s) in its list. Open it from the menu to run.',
    uqBgBad.length ? 'warn' : 'ok');
};
/* Кнопка в рядку: у режимі черги — тихо в список, інакше — як було. */
window.crUniqRow = function (ev, cid) {
  if (typeof crQueueOnly !== 'undefined' && crQueueOnly) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    return uqBgAdd([cid]);
  }
  crToUniq(ev, cid);
};
/* Уся черга — одним кліком. */
window.crQueueToUniq = function () {
  if (typeof crQueue === 'undefined' || !crQueue.length) return;
  return uqBgAdd(crQueue.slice());
};

/* Кнопка в Creative Analyzer: відкрити унікалізатор і одразу додати
   туди цей креатив з Drive. Без Drive — відкриваємо вікно з сірим
   блоком і підказкою, а не тихо нічого. */
window.crToUniq = function (ev, cid) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  if (!cid) return;
  if (typeof openUniqModal === 'function') openUniqModal();
  uqDrivePaint();
  if (!uqDriveOn()) return;
  uqDriveList();
  uqDriveAdd(cid);
};
</script>
