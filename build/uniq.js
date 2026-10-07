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
  uiOut.forEach(o => { try { URL.revokeObjectURL(o.url); } catch (e) {} });
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
        <a class="ui-dl" href="${o.url}" download="${esc(o.name)}" title="Save this one">↓</a>
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
   немає, і робота одного не чіпає інший. Підзаголовок міняємо разом із
   панеллю, бо «Відео · обробка в браузері» над налаштуваннями картинок
   виглядало б як помилка. */
window.uqMode = function (m) {
  const img = m === 'image';
  document.getElementById('ui-pane')?.classList.toggle('hidden', !img);
  document.getElementById('uq-pane')?.classList.toggle('hidden', img);
  document.getElementById('uq-tab-image')?.classList.toggle('is-on', img);
  document.getElementById('uq-tab-video')?.classList.toggle('is-on', !img);
  const sub = document.getElementById('uq-sub');
  if (sub) sub.textContent = img
    ? 'Images · in the browser, files stay on this computer'
    : 'Video · in the browser, files stay on this computer';
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
</script>
