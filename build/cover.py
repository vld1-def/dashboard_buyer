COVER_HTML = '''      <!-- Перший кадр -->
      <div class="rounded-xl px-3 py-2.5 flex flex-col md:flex-row md:items-center gap-3"
           style="background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.06)">
        <div class="md:w-44 shrink-0">
          <div class="text-[9px] font-black uppercase tracking-widest text-violet-400">Cover frame</div>
          <div class="text-[9px] font-bold text-slate-500 mt-0.5">optional &middot; the hook people see first</div>
        </div>
        <input type="file" id="uq-cover" accept="image/*" onchange="uqCoverPick(event)"
          class="text-[11px] font-bold text-slate-300 flex-1 min-w-0 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-violet-600/80 file:text-white file:font-black file:uppercase file:text-[9px] file:cursor-pointer">
        <div id="uq-cover-prev" class="hidden"></div>
        <div class="flex items-center gap-2 shrink-0">
          <label class="text-[9px] font-black uppercase tracking-widest text-slate-500"
                 title="How long the cover stays on screen. 0.1s is about three frames.">Hold</label>
          <input type="number" id="uq-cover-dur" min="0.04" max="3" step="0.02" value="0.1"
            class="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs font-bold text-white outline-none focus:border-violet-500">
          <span class="text-[9px] font-bold text-slate-500">s</span>
          <button onclick="uqCoverClear()" id="uq-cover-clear"
            class="hidden text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-400 transition">Remove</button>
        </div>
      </div>

'''

COVER_JS = '''// ── Перший кадр ──────────────────────────────────────────────────────────
// Обкладинка підкладається в ТОЙ САМИЙ прохід кодування, що й решта
// фільтрів. Варіант однаково перекодовується цілком, тож окремий кадр не
// коштує майже нічого — і не треба нічого склеювати через concat, де
// параметри двох шматків мусять збігатися байт у байт.
let uqCover = null;   // { data: Uint8Array, ext, url, name }

// КАРТИНКУ ПЕРЕКЛАДАЄМО В PNG ЩЕ ТУТ, У БРАУЗЕРІ.
//
// Байти файлу йшли в ffmpeg як є. Для jpg і png це працювало, а на AVIF
// (і на webp чи heic так само) ядро @ffmpeg/core просто не має декодера —
// у нього немає ні dav1d, ні aom. Воно падало на ВХОДІ, тобто гинув не
// кадр обкладинки, а весь варіант: «Conversion failed!» на кожному файлі
// черги, хоч із самим відео все гаразд.
//
// Браузер при цьому читає AVIF давно й без питань. Тож вантажимо
// картинку його силами й віддаємо ffmpeg готовий PNG. Так зникає цілий
// клас «формат не підтримується»: що відкрив браузер, те й спрацює.
//
// PNG, а не JPEG, навмисно: обкладинка — один кадр, на вагу це не
// впливає, зате прозорість і різкі краї не пливуть.
async function uqCoverToPng(file) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close && bmp.close();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('не вдалось перетворити картинку');
  return new Uint8Array(await blob.arrayBuffer());
}

async function uqCoverPick(e) {
  const f = e.target.files && e.target.files[0];
  uqCoverClear(true);
  if (!f) return;
  let buf;
  try {
    buf = await uqCoverToPng(f);
  } catch (err) {
    // Браузер теж не зміг — значить формат справді чужий. Кажемо це тут,
    // одразу, а не через півгодини чергою зламаних варіантів.
    const prev0 = document.getElementById('uq-cover-prev');
    if (prev0) {
      prev0.className = 'text-[11px] font-bold text-rose-400 flex-1 min-w-0';
      prev0.textContent = (f.type || f.name.split('.').pop()) + ': цей формат не читається — '
        + 'збережіть обкладинку в PNG або JPG';
    }
    const i = document.getElementById('uq-cover'); if (i) i.value = '';
    return;
  }
  uqCover = { data: buf, ext: 'png',
              url: URL.createObjectURL(f), name: f.name };
  const prev = document.getElementById('uq-cover-prev');
  if (prev) {
    prev.className = 'flex items-center gap-2 shrink-0';
    prev.innerHTML = '<img alt="" src="' + uqCover.url +
      '" style="height:40px;width:auto;border-radius:6px;border:1px solid rgba(255,255,255,.12)">';
  }
  document.getElementById('uq-cover-clear')?.classList.remove('hidden');
}

function uqCoverClear(keepInput) {
  if (uqCover && uqCover.url) { try { URL.revokeObjectURL(uqCover.url); } catch (e) {} }
  uqCover = null;
  const prev = document.getElementById('uq-cover-prev');
  if (prev) { prev.className = 'hidden'; prev.innerHTML = ''; }
  document.getElementById('uq-cover-clear')?.classList.add('hidden');
  if (!keepInput) { const i = document.getElementById('uq-cover'); if (i) i.value = ''; }
}

function uqCoverDur() {
  const v = parseFloat((document.getElementById('uq-cover-dur') || {}).value);
  return Math.min(3, Math.max(0.04, v || 0.1));
}

// Кожна копія ffmpeg має власну файлову систему, і writeFile ВІДЧІПЛЮЄ
// переданий буфер — тому щоразу віддаємо свіжий зріз, а не той самий масив.
async function uqWriteCover(ffw) {
  if (!uqCover) return;
  await ffw.writeFile('cover.' + uqCover.ext, uqCover.data.slice(0));
}

'''
