/* ═══════════ УНІКАЛІЗАТОР: НАКЛАДАННЯ, КІНЦІВКИ, БІБЛІОТЕКА ═══════════

   «хочу додати іконку в якесь місце на відео» + «бібліотека хуків та
   кінцівок».

   НАКЛАДАННЯ. Картинка (PNG з прозорістю — іконка, плашка, лого)
   ставиться мишкою на кадр першого відео: позиція й ширина — частками
   кадру, тож та сама іконка стане на те саме місце в будь-якому розмірі.
   Можна задати, з якої по яку секунду вона видна, і прозорість. «Jitter»
   зсуває її в кожній копії на кілька пікселів — копії відрізняються й
   цим.

   КІНЦІВКИ. Відео або картинка, що приклеюється в кінець. Кілька
   кінцівок — чергуються по копіях: v1 — перша, v2 — друга…

   ХУКИ. Початок і далі робить «Cover frame» вище — бібліотека лише
   підставляє туди збережений файл, щоб не вантажити його щоразу.

   ЯК ЦЕ ПРАЦЮЄ. Основний прохід (унікалізація, склейка з хуком) не
   чіпаємо. Накладання й кінцівка — другим проходом ffmpeg по вже готовій
   копії, і лише коли вони задані. Метадані другий прохід переносить з
   першого (-map_metadata 0), тож вибір у «Metadata» не губиться.

   БІБЛІОТЕКА. Файли — у сховищі launch-media (папка команди, uq/…),
   опис — у таблиці uq_clips (UQ_CLIPS.sql). ══════════════════════════ */

let uqOv = [];      // { id, name, data, url, x, y, w, from, to, op, jit }
let uqEnds = [];    // { id, name, data, ext, kind, url, dur }
const UQ_END_IMG_SEC = 1.5;   // скільки стоїть картинка-кінцівка

const uqEsc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uqId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

window.uqPostNeeded = () => uqOv.length > 0 || uqEnds.length > 0;

/* ── блок у вікні ── */
function uqExtraMount() {
  if (document.getElementById('uq-extra')) return;
  const params = document.getElementById('uq-params');
  if (!params || !params.parentNode) return;
  const box = document.createElement('div');
  box.id = 'uq-extra';
  box.className = 'uqx';
  params.parentNode.insertBefore(box, params);
  uqExtraPaint();
}

function uqExtraPaint() {
  const box = document.getElementById('uq-extra');
  if (!box) return;
  const chip = (it, kind) => `<span class="uqx-chip">
      ${it.kind === 'video' ? '<i class="uqx-v">▶</i>' : `<img src="${uqEsc(it.url)}" alt="">`}
      <b title="${uqEsc(it.name)}">${uqEsc(it.name)}</b>
      ${kind === 'ov' ? `<button type="button" title="Position, size, time" onclick="uqOvEdit('${it.id}')">✎</button>` : ''}
      <button type="button" title="Remove" onclick="${kind === 'ov' ? 'uqOvDrop' : 'uqEndDrop'}('${it.id}')">×</button></span>`;
  box.innerHTML = `
    <div class="uqx-row">
      <div class="uqx-h"><b>Overlays</b><span>icons, badges, logos on top of the video</span></div>
      <div class="uqx-list">${uqOv.map(o => chip(o, 'ov')).join('') || '<em>none</em>'}</div>
      <div class="uqx-acts">
        <label class="uqx-btn">+ Image<input type="file" accept="image/png,image/webp,image/jpeg" hidden onchange="uqOvAdd(this)"></label>
        <button type="button" class="uqx-btn" onclick="uqLibOpen('overlay')">Library</button>
      </div>
    </div>
    <div class="uqx-row">
      <div class="uqx-h"><b>Ending</b><span>${uqEnds.length > 1 ? uqEnds.length + ' endings take turns: v1 gets the 1st, v2 the 2nd…' : 'glued after the video'}</span></div>
      <div class="uqx-list">${uqEnds.map(e => chip(e, 'end')).join('') || '<em>none</em>'}</div>
      <div class="uqx-acts">
        <label class="uqx-btn">+ File<input type="file" accept="video/*,image/*" hidden onchange="uqEndAdd(this)"></label>
        <button type="button" class="uqx-btn" onclick="uqLibOpen('ending')">Library</button>
      </div>
    </div>
    <div class="uqx-row">
      <div class="uqx-h"><b>Hook</b><span>the Cover frame above — keep good ones in the library</span></div>
      <div class="uqx-list"><em>${typeof uqCover !== 'undefined' && uqCover ? uqEsc(uqCover.name || 'cover set') : 'not set'}</em></div>
      <div class="uqx-acts">
        <button type="button" class="uqx-btn" onclick="uqLibOpen('hook')">Library</button>
        ${typeof uqCover !== 'undefined' && uqCover ? '<button type="button" class="uqx-btn" onclick="uqHookSave()">Save to library</button>' : ''}
      </div>
    </div>`;
}

/* ── файли ── */
async function uqFileBytes(file) { return new Uint8Array(await file.arrayBuffer()); }
function uqVideoDur(url) {
  return new Promise(res => {
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true;
    const done = d => res(Number.isFinite(d) && d > 0 ? d : 0);
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(0);
    setTimeout(() => done(0), 6000);
    v.src = url;
  });
}

window.uqOvAdd = async function (input, fromLib) {
  const f = fromLib || (input.files && input.files[0]);
  if (input) input.value = '';
  if (!f) return;
  const o = { id: uqId(), name: f.name, data: await uqFileBytes(f),
              url: URL.createObjectURL(f), x: 0.62, y: 0.06, w: 0.3, from: '', to: '', op: 1, jit: true };
  uqOv.push(o);
  uqExtraPaint();
  if (!fromLib) uqLibSave('overlay', f).catch(() => {});
  uqOvEdit(o.id);
};
window.uqOvDrop = function (id) {
  const o = uqOv.find(x => x.id === id);
  if (o) { try { URL.revokeObjectURL(o.url); } catch (e) {} }
  uqOv = uqOv.filter(x => x.id !== id);
  uqExtraPaint();
};
window.uqEndAdd = async function (input, fromLib) {
  const f = fromLib || (input.files && input.files[0]);
  if (input) input.value = '';
  if (!f) return;
  const kind = /^video\//.test(f.type) || /\.(mp4|mov|webm|m4v)$/i.test(f.name) ? 'video' : 'image';
  const url = URL.createObjectURL(f);
  const e = { id: uqId(), name: f.name, data: await uqFileBytes(f), kind, url,
              ext: (f.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'png')).toLowerCase().slice(0, 5),
              dur: kind === 'video' ? await uqVideoDur(url) : UQ_END_IMG_SEC };
  uqEnds.push(e);
  uqExtraPaint();
  if (!fromLib) uqLibSave('ending', f).catch(() => {});
};
window.uqEndDrop = function (id) {
  const e = uqEnds.find(x => x.id === id);
  if (e) { try { URL.revokeObjectURL(e.url); } catch (er) {} }
  uqEnds = uqEnds.filter(x => x.id !== id);
  uqExtraPaint();
};

/* ── бібліотека ── */
let uqLibRole = '', uqLibRows = [], uqLibUrls = {};
async function uqLibSave(role, file) {
  const kind = /^video\//.test(file.type) ? 'video' : 'image';
  const ext = (file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'png')).toLowerCase().slice(0, 5);
  const path = String(currentTeam || 'team') + '/uq/' + role + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
  const { error } = await sb.storage.from('launch-media').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  const row = { team_name: currentTeam, role, kind, path, name: file.name, size: file.size };
  if (window.myUid) row.created_by = window.myUid;
  const { error: e2 } = await sb.from('uq_clips').insert([row]);
  if (e2) throw new Error(/uq_clips/.test(e2.message) ? 'the library is not set up — run UQ_CLIPS.sql' : e2.message);
}
window.uqHookSave = async function () {
  if (typeof uqCover === 'undefined' || !uqCover) return;
  const video = uqCover.kind === 'video';
  const type = video ? 'video/' + (uqCover.ext === 'mov' ? 'quicktime' : uqCover.ext || 'mp4') : 'image/png';
  const f = new File([uqCover.data], uqCover.name || ('hook.' + (video ? uqCover.ext || 'mp4' : 'png')), { type });
  try { await uqLibSave('hook', f); toast('Hook saved to the library', 'ok', 1800); }
  catch (e) { toast('Not saved: ' + e.message, 'error'); }
};

window.uqLibOpen = async function (role) {
  uqLibRole = role;
  let el = document.getElementById('uq-lib');
  if (!el) {
    el = document.createElement('div');
    el.id = 'uq-lib'; el.className = 'lt-modal uq-lib';
    el.innerHTML = '<div class="lt-back" onclick="uqLibClose()"></div><div class="lt-card uq-lib-card"></div>';
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
  const card = el.querySelector('.uq-lib-card');
  card.innerHTML = '<div class="lt-empty">Loading the library…</div>';
  try {
    const { data, error } = await sb.from('uq_clips').select('*').eq('team_name', currentTeam).eq('role', role)
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(/uq_clips/.test(error.message) ? 'the library is not set up — run UQ_CLIPS.sql' : error.message);
    uqLibRows = data || [];
    const paths = uqLibRows.map(r => r.path).filter(p => !uqLibUrls[p]);
    if (paths.length) {
      const { data: sg } = await sb.storage.from('launch-media').createSignedUrls(paths, 3600);
      (sg || []).forEach(x => { if (x && x.path && x.signedUrl) uqLibUrls[x.path] = x.signedUrl; });
    }
  } catch (e) { card.innerHTML = `<div class="lt-empty">${uqEsc(e.message)}</div>`; return; }
  uqLibPaint();
};
window.uqLibClose = function () { const el = document.getElementById('uq-lib'); if (el) el.classList.add('hidden'); };

function uqLibPaint() {
  const card = document.querySelector('#uq-lib .uq-lib-card'); if (!card) return;
  const title = { hook: 'Hooks', ending: 'Endings', overlay: 'Overlays' }[uqLibRole];
  const accept = uqLibRole === 'overlay' ? 'image/*' : 'video/*,image/*';
  card.innerHTML = `<div class="lt-head"><div><h3>${title}</h3></div>
      <div class="lt-head-r"><button type="button" class="lt-x" onclick="uqLibClose()" title="Close">×</button></div></div>
    <div class="lc-bar"><label class="lt-md-btn lc-up">+ Upload<input type="file" accept="${accept}" multiple hidden onchange="uqLibUpload(this)"></label>
      <span class="lc-count">${uqLibRows.length}</span></div>
    <div class="lc-grid">${uqLibRows.map(r => {
      const u = uqLibUrls[r.path] || '';
      return `<div class="lc-tile is-pick" onclick="uqLibChoose(${Number(r.id)})">
        <div class="lc-prev">${r.kind === 'video'
          ? `<video src="${uqEsc(u)}#t=0.5" muted preload="metadata" playsinline></video>`
          : `<img src="${uqEsc(u)}" alt="" loading="lazy" class="${uqLibRole === 'overlay' ? 'is-contain' : ''}">`}
          <span class="lc-kind">${r.kind === 'video' ? '▶ video' : 'image'}</span>
          <button type="button" class="lc-eye uq-lib-del" title="Delete from the library" onclick="event.stopPropagation();uqLibDel(${Number(r.id)})">×</button></div>
        <div class="lc-meta"><div class="lc-name" title="${uqEsc(r.name || '')}">${uqEsc(r.name || r.path.split('/').pop())}</div></div></div>`;
    }).join('') || '<div class="lt-empty">Nothing here yet — upload a file.</div>'}</div>`;
}
window.uqLibUpload = async function (input) {
  const files = [...(input.files || [])]; input.value = '';
  for (const f of files) { try { await uqLibSave(uqLibRole, f); } catch (e) { toast('Not uploaded: ' + f.name + ' — ' + e.message, 'error'); } }
  uqLibOpen(uqLibRole);
};
window.uqLibDel = async function (id) {
  const r = uqLibRows.find(x => x.id === id); if (!r) return;
  if (!await ask({ title: 'Delete from the library?', danger: true, ok: 'Delete', body: '“' + (r.name || r.path) + '”' })) return;
  await sb.from('uq_clips').delete().eq('id', id);
  try { await sb.storage.from('launch-media').remove([r.path]); } catch (e) {}
  uqLibRows = uqLibRows.filter(x => x.id !== id); uqLibPaint();
};
window.uqLibChoose = async function (id) {
  const r = uqLibRows.find(x => x.id === id); if (!r) return;
  const step = toastStep(); step.say('Loading ' + (r.name || 'file') + '…');
  try {
    const res = await fetch(uqLibUrls[r.path]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const f = new File([blob], r.name || r.path.split('/').pop(), { type: blob.type || (r.kind === 'video' ? 'video/mp4' : 'image/png') });
    if (uqLibRole === 'overlay') await uqOvAdd(null, f);
    else if (uqLibRole === 'ending') await uqEndAdd(null, f);
    else if (typeof uqCoverPick === 'function') { await uqCoverPick({ target: { files: [f] } }); uqExtraPaint(); }
    step.done('Added: ' + f.name, 'ok');
    uqLibClose();
  } catch (e) { step.done('Not loaded: ' + e.message, 'error'); }
};

/* ── редактор накладання ── */
let uqEdId = '';
async function uqFrameUrl() {
  const f = typeof uqFiles !== 'undefined' && uqFiles[0];
  if (!f) return null;
  return await new Promise(res => {
    const url = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    const fin = d => { try { URL.revokeObjectURL(url); } catch (e) {} res(d); };
    v.onloadeddata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (e) { fin(null); } };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = v.videoWidth || 360; c.height = v.videoHeight || 640;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        fin({ src: c.toDataURL('image/jpeg', .8), w: c.width, h: c.height });
      } catch (e) { fin(null); }
    };
    v.onerror = () => fin(null);
    setTimeout(() => fin(null), 8000);
    v.src = url;
  });
}
window.uqOvEdit = async function (id) {
  const o = uqOv.find(x => x.id === id); if (!o) return;
  uqEdId = id;
  let el = document.getElementById('uq-ed');
  if (!el) {
    el = document.createElement('div');
    el.id = 'uq-ed'; el.className = 'lt-modal uq-ed';
    el.innerHTML = '<div class="lt-back" onclick="uqOvEdClose()"></div><div class="lt-card uq-ed-card"></div>';
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
  const card = el.querySelector('.uq-ed-card');
  card.innerHTML = '<div class="lt-empty">Taking a frame from the video…</div>';
  const fr = await uqFrameUrl();
  const W = 320, H = fr ? Math.round(W * fr.h / fr.w) : Math.round(W * 16 / 9);
  card.innerHTML = `<div class="lt-head"><div><h3>Place the overlay</h3>
      <p>Drag it where it should be, pull the corner to resize. ${fr ? '' : 'Add a video above to see its frame here.'}</p></div>
      <div class="lt-head-r"><button type="button" class="lt-x" onclick="uqOvEdClose()" title="Close">×</button></div></div>
    <div class="uq-ed-body">
      <div class="uq-ed-stage" id="uq-ed-stage" style="width:${W}px;height:${H}px;${fr ? `background-image:url('${fr.src}')` : ''}">
        <div class="uq-ed-ov" id="uq-ed-ov"><img src="${uqEsc(o.url)}" alt="" draggable="false"><i class="uq-ed-h" id="uq-ed-h"></i></div>
      </div>
      <div class="uq-ed-f">
        <label><span>Visible from, s</span><input class="lt-ed-in" id="uq-ed-from" inputmode="decimal" value="${uqEsc(o.from)}" placeholder="start"></label>
        <label><span>to, s</span><input class="lt-ed-in" id="uq-ed-to" inputmode="decimal" value="${uqEsc(o.to)}" placeholder="end"></label>
        <label><span>Opacity <b id="uq-ed-op-v">${Math.round(o.op * 100)}%</b></span><input type="range" id="uq-ed-op" min="10" max="100" value="${Math.round(o.op * 100)}"
          oninput="document.getElementById('uq-ed-op-v').textContent=this.value+'%';document.querySelector('#uq-ed-ov img').style.opacity=this.value/100"></label>
        <label class="uq-ed-chk"><input type="checkbox" id="uq-ed-jit" ${o.jit ? 'checked' : ''}> Jitter — shift it a few pixels in every variant</label>
        <button type="button" class="lt-md-btn uq-ed-ok" onclick="uqOvEdSave()">Done</button>
      </div>
    </div>`;
  const stage = document.getElementById('uq-ed-stage'), ov = document.getElementById('uq-ed-ov');
  const img = ov.querySelector('img');
  img.style.opacity = o.op;
  const place = () => {
    ov.style.left = (o.x * W) + 'px'; ov.style.top = (o.y * H) + 'px'; ov.style.width = (o.w * W) + 'px';
  };
  place();
  const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
  let mode = '', sx = 0, sy = 0, s0 = null;
  const down = (e, m) => {
    e.preventDefault(); e.stopPropagation();
    mode = m; sx = e.clientX; sy = e.clientY; s0 = { x: o.x, y: o.y, w: o.w };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const move = e => {
    const dx = (e.clientX - sx) / zoom / W, dy = (e.clientY - sy) / zoom / H;
    if (mode === 'move') {
      const hFrac = ov.offsetHeight / H;
      o.x = Math.min(1 - o.w, Math.max(0, s0.x + dx));
      o.y = Math.min(1 - hFrac, Math.max(0, s0.y + dy));
    } else o.w = Math.min(1 - o.x, Math.max(0.04, s0.w + dx));
    place();
  };
  const up = () => { mode = ''; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  ov.addEventListener('pointerdown', e => down(e, 'move'));
  document.getElementById('uq-ed-h').addEventListener('pointerdown', e => down(e, 'size'));
  void stage;
};
window.uqOvEdSave = function () {
  const o = uqOv.find(x => x.id === uqEdId);
  if (o) {
    const num = id => { const v = parseFloat(String(document.getElementById(id).value).replace(',', '.')); return Number.isFinite(v) && v >= 0 ? +v.toFixed(2) : ''; };
    o.from = num('uq-ed-from'); o.to = num('uq-ed-to');
    o.op = Math.max(0.1, Math.min(1, Number(document.getElementById('uq-ed-op').value) / 100));
    o.jit = document.getElementById('uq-ed-jit').checked;
  }
  uqOvEdClose();
  uqExtraPaint();
};
window.uqOvEdClose = function () { const el = document.getElementById('uq-ed'); if (el) el.classList.add('hidden'); };

/* ── другий прохід ffmpeg ── */
function uqPostArgs(v, out, opt) {
  const args = ['-i', 'pp_in.mp4'];
  const fc = [];
  let last = '[0:v]', n = 1;
  uqOv.forEach((o, i) => {
    args.push('-i', 'ov' + i + '.png');
    const jx = o.jit ? Math.round((Math.random() * 2 - 1) * 6) : 0;
    const jy = o.jit ? Math.round((Math.random() * 2 - 1) * 6) : 0;
    const op = o.op < 1 ? `,colorchannelmixer=aa=${o.op.toFixed(2)}` : '';
    const from = o.from === '' ? null : Number(o.from), to = o.to === '' ? null : Number(o.to);
    const en = from != null || to != null ? `:enable='between(t,${from || 0},${to != null ? to : 99999})'` : '';
    /* Кадр відомий (майже завжди) — розмір і місце в пікселях: так
       однаково в будь-якій збірці ffmpeg. Невідомий — scale2ref, де
       iw — ширина кадру (еталона), main_a — пропорції самої картинки
       (перевірено на ffmpeg 6.1: main_* там — вхід, що масштабується). */
    if (out) {
      const pw = Math.max(2, Math.round(out.w * o.w / 2) * 2);
      fc.push(`[${n}:v]format=rgba${op},scale=${pw}:-2[os${i}]`);
      fc.push(`${last}[os${i}]overlay=x=${Math.round(out.w * o.x) + jx}:y=${Math.round(out.h * o.y) + jy}:eof_action=repeat${en}[b${i}]`);
    } else {
      fc.push(`[${n}:v]format=rgba${op}[oi${i}]`);
      fc.push(`[oi${i}]${last}scale2ref=w='iw*${o.w.toFixed(4)}':h='ow/main_a'[os${i}][ob${i}]`);
      fc.push(`[ob${i}][os${i}]overlay=x='W*${o.x.toFixed(4)}+${jx}':y='H*${o.y.toFixed(4)}+${jy}':eof_action=repeat${en}[b${i}]`);
    }
    last = `[b${i}]`; n++;
  });
  const end = uqEnds.length && out ? uqEnds[(v - 1) % uqEnds.length] : null;
  if (end) {
    const ei = n++;
    if (end.kind === 'image') args.push('-loop', '1', '-t', String(UQ_END_IMG_SEC), '-i', 'end' + uqEnds.indexOf(end) + '.' + end.ext);
    else args.push('-i', 'end' + uqEnds.indexOf(end) + '.' + end.ext);
    const W = out.w, H = out.h;
    fc.push(`${last}fps=30,setsar=1[mv]`);
    fc.push(`[${ei}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,format=yuv420p[ev]`);
    fc.push(`[mv][ev]concat=n=2:v=1:a=0[vout]`);
    if (!opt.noAudio) {
      const af = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';
      let ea;
      if (end.kind === 'video' && !opt.endSilent) ea = `[${ei}:a]${af},asetpts=PTS-STARTPTS[ea]`;
      else {
        const ni = n++;
        args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
        ea = `[${ni}:a]atrim=0:${(end.dur || UQ_END_IMG_SEC).toFixed(2)},asetpts=PTS-STARTPTS,${af}[ea]`;
      }
      fc.push(`[0:a]${af}[ma]`, ea, '[ma][ea]concat=n=2:v=0:a=1[aout]');
    }
    args.push('-filter_complex', fc.join(';'), '-map', '[vout]', '-map', opt.noAudio ? '0:a?' : '[aout]');
    args.push('-c:a', 'aac', '-b:a', '128k');
  } else {
    if (fc.length) { args.push('-filter_complex', fc.join(';').replace(/\[b(\d+)\]$/, '[vout]'), '-map', '[vout]'); }
    else args.push('-map', '0:v');
    args.push('-map', '0:a?', '-c:a', 'copy');
  }
  args.push('-c:v', 'libx264', '-preset', opt.preset || 'veryfast', '-crf', String(opt.quality || 20), '-pix_fmt', 'yuv420p');
  // Метадані — з першого проходу: там уже стоїть вибране в «Metadata».
  const mm = (document.getElementById('uq-meta') || {}).value || 'fake';
  args.push('-map_metadata', '0', '-map_metadata:s:v', '0:s:v', '-map_metadata:s:a', '0:s:a');
  if (mm !== 'keep') {
    args.push('-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact');
    if (typeof uqNoBsf === 'undefined' || !uqNoBsf) args.push('-bsf:v', 'filter_units=remove_types=6');
  }
  args.push('-movflags', '+faststart+use_metadata_tags', 'pp_out.mp4');
  return { args, end };
}

window.uqPostPass = async function (ffw, data, v, out, opt0) {
  const opt = Object.assign({ quality: 20, preset: 'veryfast' }, opt0 || {});
  const sig = uqOv.map(o => o.id).join(',') + '|' + uqEnds.map(e => e.id).join(',');
  if (ffw.__uqPost !== sig) {
    for (let i = 0; i < uqOv.length; i++) await ffw.writeFile('ov' + i + '.png', uqOv[i].data.slice(0));
    for (let i = 0; i < uqEnds.length; i++) await ffw.writeFile('end' + i + '.' + uqEnds[i].ext, uqEnds[i].data.slice(0));
    ffw.__uqPost = sig;
  }
  await ffw.writeFile('pp_in.mp4', data.slice(0));
  const log = () => ((ffw.__log || []).join(' '));
  const run = async o => { if (ffw.__log) ffw.__log.length = 0; return ffw.exec(uqPostArgs(v, out, o).args); };
  let code = await run(opt);
  // Немає звуку в основному відео або в кінцівці — пробуємо без них.
  if (code !== 0 && /matches no streams|\[0:a\]|Stream specifier ':a'/i.test(log())) code = await run(Object.assign({}, opt, { noAudio: true }));
  else if (code !== 0 && /a\]|audio/i.test(log())) code = await run(Object.assign({}, opt, { endSilent: true }));
  if (code !== 0 && /filter_units|bitstream filter/i.test(log())) {
    if (typeof uqNoBsf !== 'undefined') uqNoBsf = true;
    code = await run(opt);
  }
  let res = null;
  try { res = await ffw.readFile('pp_out.mp4'); } catch (e) {}
  try { await ffw.deleteFile('pp_in.mp4'); await ffw.deleteFile('pp_out.mp4'); } catch (e) {}
  if (code !== 0 || !res || res.length < 1024) {
    const err = new Error('overlay / ending pass failed');
    err.tail = log().slice(-1500);
    throw err;
  }
  return res;
};

/* Блок монтуємо, щойно відкривається вікно унікалізатора. */
if (typeof openUniqModal === 'function' && !openUniqModal.__uqx) {
  const open0 = openUniqModal;
  window.openUniqModal = function () { const r = open0.apply(this, arguments); uqExtraMount(); uqExtraPaint(); return r; };
  window.openUniqModal.__uqx = true;
}
/* Хук міняється в «Cover frame» — рядок Hook у блоці теж. */
if (typeof uqCoverPick === 'function' && !uqCoverPick.__uqx) {
  const p0 = uqCoverPick;
  window.uqCoverPick = async function () { const r = await p0.apply(this, arguments); uqExtraPaint(); return r; };
  window.uqCoverPick.__uqx = true;
}
if (typeof uqCoverClear === 'function' && !uqCoverClear.__uqx) {
  const c0 = uqCoverClear;
  window.uqCoverClear = function () { const r = c0.apply(this, arguments); uqExtraPaint(); return r; };
  window.uqCoverClear.__uqx = true;
}
