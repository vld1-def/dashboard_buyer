/* ══════════════════════════════════════════════════════════════════
   ШАБЛОНИ ЗАПУСКІВ.

   «Зберігаєш набір (гео, бюджет, креативи, апка, домен) під назвою і
   запускаєш його в новий кабінет одним кліком. … ми пробували, але
   щось нічого не вийшло».

   Як це тепер:
     1. На рядку кампанії у FB LIVE — «☆ Template». CRM бере в Facebook
        ЗНІМОК кампанії (адсети, таргетинг, піксель/апка, креативи) і
        кладе його в базу. Шаблон живе далі сам — навіть коли кабінет-
        зразок забанили.
     2. Кнопка «Templates» у FB LIVE — список шаблонів. «Launch» — вибрав
        кабінети, за потреби поміняв назву, бюджет на день і гео.
     3. «Check» — для кожного кабінета видно, що він бачить із
        потрібного: Сторінку поста, піксель, апку, валюту. Саме на цьому
        копії й ламались раніше — тепер це видно ДО запуску, і зрозуміло,
        що зробити. Піксель, якого кабінет не бачить, замінюється його
        власним; аудиторії старого кабінета прибираються.
     4. «Launch paused» — кампанія створюється в кожному кабінеті, ЗАВЖДИ
        на паузі. Вмикаєш сам.
   ══════════════════════════════════════════════════════════════════ */

const ltEsc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ltNum = v => String(v == null ? '' : v).replace(/\D/g, '');
let ltRows = [], ltCols = true, ltCur = null, ltRes = {}, ltBusy = false;

async function ltFn(body) {
  const { data: s } = await sb.auth.getSession();
  const res = await fetch(SUPABASE_URL + '/functions/v1/fb-launch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + (s?.session?.access_token || '') },
    // Ключ Drive — для креативів із бібліотеки Google Drive; ніде не зберігається.
    body: JSON.stringify(Object.assign({}, body, typeof _driveKey === 'function' && (body.spec || {}).ads ? { drive_key: _driveKey() } : {}))
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 404 && !j.error) throw new Error('the launch function is not deployed — deploy fb-launch');
  return { ok: res.ok && j.ok, status: res.status, j };
}

/* ── опис шаблону з самого знімка ── */
function ltSummary(spec) {
  const c = spec.campaign || {}, sets = spec.adsets || [], ads = spec.ads || [];
  const cur = spec.currency || '';
  const money = cents => {
    const v = Number(cents) / 100;
    if (!(v > 0)) return '';
    const sign = { USD: '$', EUR: '€', GBP: '£' }[cur];
    return sign ? sign + (v % 1 ? v.toFixed(2) : v) : v + ' ' + cur;
  };
  const cbo = Number(c.daily_budget) > 0;
  const budget = cbo ? money(c.daily_budget)
    : money(sets.reduce((a, s) => a + (Number(s.daily_budget) || 0), 0));
  const countries = [...new Set(sets.flatMap(s => (s.targeting && s.targeting.geo_locations && s.targeting.geo_locations.countries) || []))];
  const pixel = sets.some(s => s.promoted_object && s.promoted_object.pixel_id);
  const app = sets.some(s => s.promoted_object && s.promoted_object.application_id);
  const goal = String(c.objective || '').replace(/^OUTCOME_/, '').toLowerCase();
  return { sets: sets.length, ads: ads.length, budget, budgetVal: cbo ? Number(c.daily_budget) / 100
    : (sets.length ? sets.reduce((a, s) => a + (Number(s.daily_budget) || 0), 0) / 100 / sets.length : 0),
    cbo, countries, pixel, app, goal, cur };
}

function ltFlag(geo) {
  const g = String(geo || '').toLowerCase();
  return /^[a-z]{2}$/.test(g) && typeof tdFlag === 'function' ? tdFlag(g) : '';
}

/* ── 1. зберегти кампанію як шаблон ── */
window.ltSave = async function (campaignId, nameEnc) {
  const src = typeof cdAcc !== 'undefined' ? cdAcc : '';
  const name = decodeURIComponent(nameEnc || '');
  if (!src || !campaignId) return;
  const guess = (String(name).split(/[_\s-]+/).find(x => /^[A-Z]{2}$/.test(x)) || '');
  const v = await ask({ title: 'Save as template', ok: 'Save template',
    body: '“' + name + '”\n\nCRM takes a snapshot of this campaign — ad sets, targeting, pixel or app, creatives — '
      + 'and keeps it. You can launch it into any cabinet later, even if this one gets banned.',
    fields: [{ key: 'name', label: 'Template name', need: true, full: true, value: name },
             { key: 'geo', label: 'Geo (2 letters)', value: guess },
             { key: 'note', label: 'Note', value: '' }] });
  if (!v) return;
  const step = toastStep();
  step.say('Taking a snapshot from Facebook…');
  try {
    const r = await ltFn({ source_account: src, campaign_id: String(campaignId), snapshot: true });
    if (!r.ok) throw new Error(r.j.error || 'HTTP ' + r.status);
    const row = { team_name: currentTeam, name: String(v.name || name).trim().slice(0, 120),
      geo: String(v.geo || '').toUpperCase().trim().slice(0, 2) || null, note: String(v.note || '').trim() || null,
      source_account: ltNum(src), source_campaign: String(campaignId), spec: r.j.spec };
    if (window.myUid) row.created_by = window.myUid;
    const { error } = await sb.from('launch_templates').insert([row]);
    if (error) throw new Error(/launch_templates/.test(error.message) ? 'templates are not set up — run LAUNCH_TEMPLATES.sql' : error.message);
    const s = ltSummary(r.j.spec);
    step.done('Template saved: ' + row.name + ' · ' + s.sets + ' ad set(s), ' + s.ads + ' ad(s). Open it from Templates.', 'ok');
  } catch (e) {
    step.done('Template not saved: ' + e.message, 'error');
  }
};

/* ── 2. список ── */
async function ltLoad() {
  const { data, error } = await sb.from('launch_templates')
    .select('id,name,geo,note,source_account,source_campaign,spec,uses,last_used_at,created_at')
    .eq('team_name', currentTeam).order('created_at', { ascending: false }).limit(200);
  ltCols = !error;
  ltRows = error ? [] : (data || []);
  return error;
}

function ltBox() {
  let el = document.getElementById('lt-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lt-modal';
    el.className = 'lt-modal hidden';
    el.innerHTML = '<div class="lt-back" onclick="ltClose()"></div><div class="lt-card" role="dialog" aria-label="Launch templates"></div>';
    document.body.appendChild(el);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.classList.contains('hidden') && !ltBusy) ltClose(); });
  }
  return el;
}
window.ltClose = function () { const el = document.getElementById('lt-modal'); if (el) el.classList.add('hidden'); };

window.ltPanel = async function () {
  const el = ltBox();
  el.classList.remove('hidden');
  ltCur = null;
  el.querySelector('.lt-card').innerHTML = '<div class="lt-empty">Loading templates…</div>';
  const err = await ltLoad();
  ltPaintList(err);
};

function ltPaintList(err) {
  const card = ltBox().querySelector('.lt-card');
  const head = `<div class="lt-head"><div><h3>Launch templates</h3>
      <p>Saved campaigns you can launch into any cabinet — always paused.</p></div>
      <button type="button" class="lt-btn is-ghost" onclick="lcOpen()" title="Every video and image you uploaded — preview, geo, language, where it is used">Library</button>
      <button type="button" class="lt-x" onclick="ltClose()" title="Close (Esc)">×</button></div>`;
  if (err) {
    card.innerHTML = head + `<div class="lt-empty">${/launch_templates/.test(err.message || '')
      ? 'Templates are not set up yet — run <b>LAUNCH_TEMPLATES.sql</b> in Supabase.' : ltEsc(err.message)}</div>`;
    return;
  }
  if (!ltRows.length) {
    card.innerHTML = head + `<div class="lt-empty lt-howto">
      <div class="lt-howto-n">1</div><div>Open a cabinet in FB LIVE and press <b>☆ Template</b> on a campaign row.</div>
      <div class="lt-howto-n">2</div><div>Come back here and press <b>Launch</b> — pick cabinets, check what they can see, launch paused.</div></div>`;
    return;
  }
  card.innerHTML = head + `<div class="lt-list">${ltRows.map(r => {
    const s = ltSummary(r.spec || {});
    const when = r.last_used_at ? 'last launched ' + new Date(r.last_used_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : 'saved ' + new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `<div class="lt-item">
      <div class="lt-item-geo">${ltFlag(r.geo)}<span>${ltEsc(r.geo || '—')}</span></div>
      <div class="lt-item-main">
        <div class="lt-item-name">${ltEsc(r.name)}</div>
        <div class="lt-item-meta">
          <span>${s.sets} ad set${s.sets === 1 ? '' : 's'} · ${s.ads} ad${s.ads === 1 ? '' : 's'}</span>
          ${s.budget ? `<span>${ltEsc(s.budget)}/day${s.cbo ? ' (campaign)' : ''}</span>` : ''}
          ${s.countries.length ? `<span>${ltEsc(s.countries.join(', '))}</span>` : ''}
          ${s.goal ? `<span>${ltEsc(s.goal)}</span>` : ''}
          ${s.app ? '<span>app</span>' : s.pixel ? '<span>pixel</span>' : ''}
        </div>
        <div class="lt-item-sub">${ltEsc(when)}${r.uses ? ' · launched ' + r.uses + '×' : ''}${r.note ? ' · ' + ltEsc(r.note) : ''}</div>
      </div>
      <div class="lt-item-act">
        <button type="button" class="lt-btn is-go" onclick="ltOpen(${Number(r.id)})">Launch</button>
        <button type="button" class="lt-btn is-ghost" onclick="ltEdit(${Number(r.id)})" title="Edit what gets copied">Edit</button>
        <button type="button" class="lt-btn is-ghost is-del" onclick="ltDelete(${Number(r.id)})" title="Delete template">×</button>
      </div></div>`;
  }).join('')}</div>`;
}

window.ltRename = async function (id) {
  const r = ltRows.find(x => x.id === id); if (!r) return;
  const v = await ask({ title: 'Template', ok: 'Save', fields: [
    { key: 'name', label: 'Name', need: true, full: true, value: r.name },
    { key: 'geo', label: 'Geo', value: r.geo || '' }, { key: 'note', label: 'Note', value: r.note || '' }] });
  if (!v) return;
  const patch = { name: String(v.name).trim(), geo: String(v.geo || '').toUpperCase().trim().slice(0, 2) || null, note: String(v.note || '').trim() || null };
  const { error } = await sb.from('launch_templates').update(patch).eq('id', id);
  if (error) { toast('Not saved: ' + error.message, 'error'); return; }
  Object.assign(r, patch); ltPaintList();
};
window.ltDelete = async function (id) {
  const r = ltRows.find(x => x.id === id); if (!r) return;
  if (!await ask({ title: 'Delete template?', danger: true, ok: 'Delete', body: '“' + r.name + '” — campaigns launched from it stay as they are.' })) return;
  const { error } = await sb.from('launch_templates').delete().eq('id', id);
  if (error) { toast('Not deleted: ' + error.message, 'error'); return; }
  ltRows = ltRows.filter(x => x.id !== id); ltPaintList();
};

/* ── 3. запуск: кабінети, перевірка, запуск ── */
function ltTargets() {
  const all = (typeof cabAll !== 'undefined' && Array.isArray(cabAll)) ? cabAll : [];
  return all.filter(c => c && c.fb && (typeof CAB_LIVE !== 'function' || CAB_LIVE(c)))
    .map(c => ({ id: ltNum(c.id), name: (c.row && (c.row.profile || c.row.provider_name)) || c.fb.name || '',
                 fbName: c.fb.name || '', cur: c.fb.currency || '', state: c.state || '' }))
    .filter(t => t.id);
}

window.ltOpen = function (id) {
  const r = ltRows.find(x => x.id === id); if (!r) return;
  const s = ltSummary(r.spec || {});
  ltCur = { r, s, picked: new Set(), q: '', name: r.name, budget: s.budgetVal ? String(Math.round(s.budgetVal * 100) / 100) : '',
            countries: s.countries.join(', '), camps: 1, adCopies: 1, pagesOf: {}, pageFor: {}, names: {},
            spec: JSON.parse(JSON.stringify(r.spec || {})), off: new Set() };
  ltRes = {};
  ltPaintLaunch();
};

function ltPaintLaunch() {
  const card = ltBox().querySelector('.lt-card');
  const { r, s } = ltCur;
  const targets = ltTargets();
  const q = ltCur.q.toLowerCase();
  const shown = targets.filter(t => !q || (t.id + ' ' + t.name + ' ' + t.fbName).toLowerCase().includes(q));
  const curWarn = t => s.cur && t.cur && t.cur !== s.cur;
  const res = id => ltRes[id];
  const badge = id => {
    const x = res(id);
    if (!x) return '';
    if (x.busy) return '<span class="lt-st is-busy">checking…</span>';
    if (x.done) return `<span class="lt-st ${x.done.ok ? 'is-ok' : 'is-fail'}">${x.done.ok ? (x.done.complete ? 'launched' : 'launched, partly') : 'not launched'}</span>`;
    if (x.err) return '<span class="lt-st is-fail">error</span>';
    const f = (x.checks || []).filter(c => c.level === 'fail').length, w = (x.checks || []).filter(c => c.level === 'warn').length;
    return `<span class="lt-st ${f ? 'is-fail' : w ? 'is-warn' : 'is-ok'}">${f ? f + ' problem' + (f > 1 ? 's' : '') : w ? 'ready, ' + w + ' note' + (w > 1 ? 's' : '') : 'ready'}</span>`;
  };
  const detail = id => {
    const x = res(id);
    if (!x || x.busy) return '';
    const icon = { ok: '✓', warn: '!', fail: '✕', unknown: '?' };
    const rows = [];
    if (x.err) rows.push(`<li class="is-fail"><i>✕</i>${ltEsc(x.err)}</li>`);
    (x.checks || []).forEach(c => rows.push(`<li class="is-${c.level}"><i>${icon[c.level] || '·'}</i>${ltEsc(c.text)}</li>`));
    if (x.done) {
      const d = x.done;
      (d.warnings || []).filter(w => /placeholder|no page|already in this cabinet|dynamic creative/.test(w)).forEach(w => rows.push(`<li class="is-warn"><i>!</i>${ltEsc(w)}</li>`));
      rows.push(d.ok ? `<li class="is-ok"><i>✓</i>Campaign created paused: ${d.adsets.made}/${d.adsets.of} ad sets${d.ads.of ? ', ' + d.ads.made + '/' + d.ads.of + ' ads' : ', no ads'}</li>`
        : `<li class="is-fail"><i>✕</i>${ltEsc(d.error || 'not launched')}</li>`);
      (d.problems || []).forEach(p => rows.push(`<li class="is-warn"><i>!</i>${ltEsc(p)}</li>`));
    }
    return rows.length ? `<ul class="lt-checks">${rows.join('')}</ul>` : '';
  };
  const picked = [...ltCur.picked];
  const checked = picked.filter(id => ltRes[id] && ltRes[id].checks && !ltRes[id].done);
  const blocked = picked.filter(id => ltRes[id] && (ltRes[id].checks || []).some(c => c.level === 'fail'));
  card.innerHTML = `<div class="lt-head"><div>
      <button type="button" class="lt-back-btn" onclick="ltPaintList()" ${ltBusy ? 'disabled' : ''}>← Templates</button>
      <h3>${ltFlag(r.geo)} ${ltEsc(r.name)}</h3>
      <p>${s.sets} ad set${s.sets === 1 ? '' : 's'} · ${s.ads} ad${s.ads === 1 ? '' : 's'}${s.budget ? ' · ' + ltEsc(s.budget) + '/day' : ''}${s.cur ? ' · ' + ltEsc(s.cur) : ''} · the <b>campaign</b> is created paused, ad sets and ads on</p></div>
      <div class="lt-head-r">
        <button type="button" class="lt-x" onclick="ltClose()" title="Close (Esc)" ${ltBusy ? 'disabled' : ''}>×</button>
        <input class="lt-search" placeholder="Search cabinet…" value="${ltEsc(ltCur.q)}" oninput="ltCur.q=this.value;ltPaintLaunch();document.querySelector('.lt-search').focus();document.querySelector('.lt-search').setSelectionRange(this.value.length,this.value.length)">
      </div></div>
    <div class="lt-form">
      <label><span>Campaign name</span><input id="lt-f-name" value="${ltEsc(ltCur.name)}" oninput="ltCur.name=this.value"></label>
      <label title="Daily budget${s.cbo ? ' of the campaign' : ' of each ad set'}"><span>Budget / day</span><input id="lt-f-budget" inputmode="decimal" value="${ltEsc(ltCur.budget)}" oninput="ltCur.budget=this.value" placeholder="as in template"></label>
      <label><span>Countries</span><input id="lt-f-geo" value="${ltEsc(ltCur.countries)}" oninput="ltCur.countries=this.value" placeholder="as in template"></label>
      <label class="lt-f-start"><span>Start (your time)</span><button type="button" id="lt-f-start" class="lt-dt-btn${ltCur.start ? ' is-set' : ''}"
        onclick="ltDtpOpen(this)" ${ltBusy ? 'disabled' : ''}
        title="When the ad sets may start. Empty — as soon as you switch them on. Set it here: after publishing Facebook does not let you change it">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>
        <span>${ltEsc(ltDtLabel(ltCur.start))}</span></button></label>
    </div>
    <div class="lt-form lt-form2">
      <label title="How many copies of the campaign go into each cabinet — names are numbered, you can edit them in the preview"><span>Campaigns per cabinet</span>
        <input type="number" min="1" max="20" value="${ltCur.camps}" oninput="ltCur.camps=Math.max(1,Math.min(20,Math.round(+this.value||1)))"></label>
      <label title="Each ad is created this many times inside its ad set — “Name”, “Name 2”, “Name 3”…"><span>Copies of each ad</span>
        <input type="number" min="1" max="10" value="${ltCur.adCopies}" oninput="ltCur.adCopies=Math.max(1,Math.min(10,Math.round(+this.value||1)))"></label>
    </div>
    <div class="lt-pick-h"><span>Cabinets · ${picked.length} picked</span></div>
    <div class="lt-cabs">${shown.length ? shown.map(t => `
      <div class="lt-cab${ltCur.picked.has(t.id) ? ' is-on' : ''}">
        <label class="lt-cab-row"><input type="checkbox" ${ltCur.picked.has(t.id) ? 'checked' : ''} ${ltBusy ? 'disabled' : ''} onchange="ltPick('${t.id}', this.checked)">
          <span class="lt-cab-name">${ltEsc(t.name || t.fbName || t.id)}</span>
          <span class="lt-cab-id">${ltEsc(t.id)}${t.cur ? ' · ' + ltEsc(t.cur) : ''}</span>
          ${curWarn(t) ? '<span class="lt-st is-fail" title="Budgets are numbers in the cabinet’s currency">other currency</span>' : badge(t.id)}</label>
        ${ltCur.picked.has(t.id) ? detail(t.id) : ''}
      </div>`).join('') : '<div class="lt-empty">No live cabinets match.</div>'}</div>
    <div class="lt-foot">
      <span>${blocked.length ? blocked.length + ' cabinet(s) will be skipped' : checked.length ? 'Checked — ready to launch' : 'Check shows what each cabinet will get — or launch right away'}</span>
      <button type="button" class="lt-btn is-ghost" onclick="ltCheck()" ${!picked.length || ltBusy ? 'disabled' : ''}>Check</button>
      <button type="button" class="lt-btn is-go" onclick="ltPreview()" ${!picked.length || ltBusy ? 'disabled' : ''}>Preview →</button>
    </div>`;
}

window.ltPick = function (id, on) {
  if (on) ltCur.picked.add(id); else ltCur.picked.delete(id);
  ltPaintLaunch();
};

function ltOverrides() {
  const b = Number(String(ltCur.budget || '').replace(',', '.'));
  const countries = String(ltCur.countries || '').split(/[\s,;]+/).map(x => x.toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x));
  const s = ltCur.s;
  const o = {};
  if (b > 0 && Math.abs(b - s.budgetVal) > 0.004) o.daily_budget = b;
  if (countries.length && countries.join(',') !== s.countries.join(',')) o.countries = countries;
  /* «Schedule, Start date — бо міняти не можу, кампанія опублікована».
     Час із поля — у поясі браузера; у Facebook іде точна мить (ISO). */
  if (ltCur.start) { const t = new Date(ltCur.start); if (!isNaN(t)) o.start_time = t.toISOString(); }
  return o;
}

window.ltCheck = async function () {
  if (ltBusy) return;
  ltBusy = true;
  const ids = [...ltCur.picked];
  ids.forEach(id => { ltRes[id] = { busy: true }; });
  ltPaintLaunch();
  await Promise.all(ids.map(async id => {
    try {
      const r = await ltFn({ spec: ltLaunchSpec(), target_account: id, check: true, page_id: ltCur.pageFor[id] || '' });
      ltRes[id] = r.ok ? { checks: r.j.checks || [] } : { err: r.j.error || 'HTTP ' + r.status, checks: r.j.checks || [] };
      if (r.ok) {
        if (Array.isArray(r.j.pages)) ltCur.pagesOf[id] = r.j.pages;
        else if (!ltCur.pagesOf[id]) ltCur.pagesOf[id] = [];
        if (!ltCur.pageFor[id] && r.j.page) ltCur.pageFor[id] = r.j.page;
      }
    } catch (e) { ltRes[id] = { err: e.message }; }
  }));
  ltBusy = false;
  ltPaintLaunch();
};

/* ── ПЕРЕГЛЯД ПЕРЕД ЗАПУСКОМ ──
   «коли нажимаю запуск, щоб спочатку прев'ю було з налаштуваннями і з
   можливістю редагувати, вибирати page, … скільки дублікатів кампанії
   робити (з можливістю редагування назви)». Тут видно кожен кабінет:
   Сторінку (вибір), назви ВСІХ кампаній, що підуть у нього (правляться),
   і що саме створиться. Запуск — лише звідси. */
function ltNumbered(base, count) {
  base = String(base || '').trim() || 'Campaign';
  if (count <= 1) return [base];
  const m = base.match(/^(.*?)(\d+)$/);
  const out = [];
  for (let k = 0; k < count; k++) {
    if (m) out.push(m[1] + String(Number(m[2]) + k).padStart(m[2].length, '0'));
    else out.push(base + ' ' + String(k + 1).padStart(3, '0'));
  }
  return out;
}
function ltLaunchable() {
  const s = ltCur.s;
  return [...ltCur.picked].filter(id => {
    const t = ltTargets().find(x => x.id === id);
    if (t && s.cur && t.cur && t.cur !== s.cur) return false;
    return !((ltRes[id] && ltRes[id].checks) || []).some(c => c.level === 'fail');
  });
}

/* Що піде в запуск: робоча копія мінус вимкнене галочками в перегляді. */
function ltLaunchSpec() {
  const sp = JSON.parse(JSON.stringify(ltCur.spec || ltCur.r.spec || {}));
  sp.ads = (sp.ads || []).filter((d, i) => !ltCur.off.has('a' + i));
  return sp;
}
window.ltPvToggle = function (k, on) { if (on) ltCur.off.delete(k); else ltCur.off.add(k); ltPaintPreview(); };
/* Правки цього запуску — у шаблон, якщо людина хоче їх лишити. */
window.ltPvSaveTpl = async function () {
  const sp = ltLaunchSpec();
  const { error } = await sb.from('launch_templates').update({ spec: sp }).eq('id', ltCur.r.id);
  if (error) { toast('Not saved: ' + error.message, 'error'); return; }
  ltCur.r.spec = sp;
  toast('Saved into the template', 'ok', 2500);
};

window.ltPreview = async function () {
  if (ltBusy) return;
  // Сторінки кабінетів приходять з перевірки — без неї вибору не буде.
  if ([...ltCur.picked].some(id => !ltCur.pagesOf[id])) await ltCheck();
  const ids = ltLaunchable();
  const all = ltNumbered(String(ltCur.name || '').trim() || ltCur.r.name, ids.length * ltCur.camps);
  ids.forEach((id, k) => { ltCur.names[id] = all.slice(k * ltCur.camps, (k + 1) * ltCur.camps); });
  ltPaintPreview();
};

function ltPaintPreview() {
  const card = ltBox().querySelector('.lt-card');
  const { r, s } = ltCur;
  const ids = ltLaunchable();
  const ov = ltOverrides();
  const total = ids.reduce((a, id) => a + (ltCur.names[id] || []).length, 0);
  const adsEach = s.ads * ltCur.adCopies;
  const facts = [s.sets + ' ad set' + (s.sets === 1 ? '' : 's'), adsEach + ' ad' + (adsEach === 1 ? '' : 's'),
    ov.daily_budget ? ov.daily_budget + ' ' + s.cur + '/day' : s.budget ? s.budget + '/day' : '',
    (ov.countries || s.countries).join(', '),
    ov.start_time ? 'start ' + new Date(ov.start_time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'starts when switched on']
    .filter(Boolean).join(' · ');
  const skipped = [...ltCur.picked].filter(id => !ids.includes(id));
  card.innerHTML = `<div class="lt-head"><div>
      <button type="button" class="lt-back-btn" onclick="ltPaintLaunch()" ${ltBusy ? 'disabled' : ''}>← Settings</button>
      <h3>Preview · ${total} campaign${total === 1 ? '' : 's'}</h3>
      <p>Each campaign: ${ltEsc(facts)}. Campaign paused, ad sets and ads on.</p></div>
      <div class="lt-head-r"><button type="button" class="lt-x" onclick="ltClose()" title="Close (Esc)" ${ltBusy ? 'disabled' : ''}>×</button></div></div>
    ${skipped.length ? `<p class="lt-pv-skip">Skipped: ${skipped.map(ltEsc).join(', ')} — another currency or a problem in the check.</p>` : ''}
    <div class="lt-pv">${ids.map(id => {
      const t = ltTargets().find(x => x.id === id) || { id };
      const pages = ltCur.pagesOf[id] || [];
      const x = ltRes[id] || {};
      return `<div class="lt-pv-cab">
        <div class="lt-pv-top"><b>${ltEsc(t.name || t.fbName || id)}</b><span class="lt-cab-id">${ltEsc(id)}</span>
          <label class="lt-pv-page"><span>Page</span>
            ${pages.length ? `<select class="lt-ed-in" onchange="ltCur.pageFor['${id}']=this.value" ${ltBusy ? 'disabled' : ''}>${pages.map(p =>
              `<option value="${ltEsc(p.id)}"${ltCur.pageFor[id] === p.id ? ' selected' : ''}>${ltEsc(p.name)}</option>`).join('')}</select>`
              : '<em>no page list — ads try the template’s page</em>'}</label>
          ${x.runs ? `<span class="lt-st ${x.runs.every(q => q.ok) ? 'is-ok' : 'is-warn'}">${x.runs.filter(q => q.ok).length}/${x.runs.length} launched</span>` : ''}</div>
        ${(ltCur.names[id] || []).map((n, k) => {
          const run = x.runs && x.runs[k];
          return `<div class="lt-pv-row"><span class="lt-pv-n">${k + 1}</span>
            <input class="lt-ed-in" value="${ltEsc(n)}" oninput="ltCur.names['${id}'][${k}]=this.value" ${ltBusy ? 'disabled' : ''}>
            ${run ? (run.busy ? '<span class="lt-st is-busy">creating…</span>' : run.ok
              ? `<span class="lt-st is-ok" title="${ltEsc((run.j.problems || []).concat(run.j.warnings || []).join('\n'))}">${run.j.ads.made}/${run.j.ads.of} ads</span>`
              : `<span class="lt-st is-fail" title="${ltEsc(run.error)}">failed</span>`) : ''}</div>
            ${run && !run.busy && (!run.ok || (run.j.problems || []).length) ? `<ul class="lt-checks">${(run.ok ? run.j.problems : [run.error]).map(p => `<li class="is-warn"><i>!</i>${ltEsc(p)}</li>`).join('')}</ul>` : ''}`;
        }).join('')}
      </div>`;
    }).join('') || '<div class="lt-empty">Nothing to launch — pick cabinets on the previous step.</div>'}
    <div class="lt-ed-sec lt-pv-ads-h"><span>Ads in this launch · ${(ltCur.spec.ads || []).length - [...ltCur.off].filter(k => k[0] === 'a').length}</span>
      <span class="lt-pv-ads-note">Changes here are for this launch only</span>
      <button type="button" class="lt-md-btn" onclick="ltPvSaveTpl()" ${ltBusy ? 'disabled' : ''} title="Keep these ad changes in the template too">Save to template</button></div>
    ${true ? `<div class="lt-pv-addrow">${(ltCur.spec.adsets || []).map((a, si) =>
      `<button type="button" class="lt-md-btn" onclick="ltAdAdd(${si})" ${ltBusy ? 'disabled' : ''}>+ Ad in “${ltEsc(a.name || 'ad set')}”</button>`).join('')}</div>` : ''}
    ${(() => { ltW = ltCur.spec; ltRepaintW = () => ltPaintPreview();
      return (ltCur.spec.ads || []).map((d, i) => ltAdCard(d, i, { off: ltCur.off, toggle: 'ltPvToggle' })).join(''); })()}
    </div>
    <div class="lt-foot">
      <span>${ltCur.adCopies > 1 ? 'Each ad ×' + ltCur.adCopies + ' · ' : ''}Names are yours to change before launch.</span>
      <button type="button" class="lt-btn is-ghost" onclick="ltPaintLaunch()" ${ltBusy ? 'disabled' : ''}>Back</button>
      <button type="button" class="lt-btn is-go" onclick="ltLaunch()" ${!total || ltBusy ? 'disabled' : ''}>Launch ${total} campaign${total === 1 ? '' : 's'}</button>
    </div>`;
}

window.ltLaunch = async function () {
  if (ltBusy) return;
  const ids = ltLaunchable();
  const ov = { ...ltOverrides(), ad_copies: ltCur.adCopies };
  const spec = ltLaunchSpec();
  if (!spec.ads.length) { toast('Every ad is switched off for this launch.', 'warn'); return; }
  ltBusy = true;
  let good = 0;
  for (const id of ids) {
    const names = (ltCur.names[id] || []).map(n => String(n).trim()).filter(Boolean);
    const prev = ltRes[id] || {};
    const runs = names.map(() => ({ busy: true }));
    ltRes[id] = Object.assign({}, prev, { runs });
    for (let k = 0; k < names.length; k++) {
      ltPaintPreview();
      try {
        const r = await ltFn({ spec, target_account: id, name: names[k], overrides: ov, page_id: ltCur.pageFor[id] || '' });
        runs[k] = r.ok ? { ok: true, j: r.j } : { ok: false, error: r.j.error || 'HTTP ' + r.status };
        if (r.ok) good++;
      } catch (e) { runs[k] = { ok: false, error: e.message }; }
      const last = runs[k];
      ltRes[id] = Object.assign({}, prev, { runs, done: last.ok ? last.j : { ok: false, error: last.error } });
    }
  }
  ltBusy = false;
  if (good) {
    const r = ltCur.r;
    r.uses = (r.uses || 0) + good; r.last_used_at = new Date().toISOString();
    await sb.from('launch_templates').update({ uses: r.uses, last_used_at: r.last_used_at }).eq('id', r.id);
    toast('Launched ' + good + ' campaign(s), paused. Press Sync now to see them in FB LIVE.', 'ok', 6000);
  }
  ltPaintPreview();
};


/* ── КАЛЕНДАР У НАШОМУ СТИЛІ ──
   «календар і час зроби в нашому стилі дизайну». Системний
   datetime-local у кожному браузері свій і з темою сторінки не
   дружить. Тут — склянна панель: місяць зі стрілками, дні (минулі
   недоступні), час годинами й хвилинами, і швидкі кнопки. Значення —
   той самий рядок 'YYYY-MM-DDTHH:mm' у поясі браузера, що й раніше. */
const LT_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ltPad = n => String(n).padStart(2, '0');
const ltDtStr = d => d.getFullYear() + '-' + ltPad(d.getMonth() + 1) + '-' + ltPad(d.getDate()) + 'T' + ltPad(d.getHours()) + ':' + ltPad(d.getMinutes());
function ltDtLabel(v) {
  if (!v) return 'When switched on';
  const d = new Date(v);
  if (isNaN(d)) return 'When switched on';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + ltPad(d.getHours()) + ':' + ltPad(d.getMinutes());
}
let ltDtp = null;   // { y, m, d: Date|null, h, mi, anchor }

window.ltDtpOpen = function (btn) {
  const cur = ltCur.start ? new Date(ltCur.start) : null;
  const base = cur && !isNaN(cur) ? cur : new Date(Date.now() + 864e5);
  ltDtp = { y: base.getFullYear(), m: base.getMonth(), d: cur && !isNaN(cur) ? new Date(cur) : null,
            h: cur && !isNaN(cur) ? cur.getHours() : 0, mi: cur && !isNaN(cur) ? cur.getMinutes() : 0, anchor: btn };
  let el = document.getElementById('lt-dtp');
  if (!el) {
    el = document.createElement('div'); el.id = 'lt-dtp';
    document.body.appendChild(el);
    document.addEventListener('pointerdown', e => {
      const p = document.getElementById('lt-dtp');
      if (p && p.classList.contains('is-on') && !p.contains(e.target) && !(e.target.closest && e.target.closest('#lt-f-start'))) ltDtpClose();
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('#lt-dtp.is-on')) { e.stopPropagation(); ltDtpClose(); } }, true);
  }
  ltDtpPaint();
  el.classList.add('is-on');
  ltDtpPlace();
};
window.ltDtpClose = function () { const el = document.getElementById('lt-dtp'); if (el) el.classList.remove('is-on'); };

function ltDtpPlace() {
  const el = document.getElementById('lt-dtp'), btn = ltDtp && document.getElementById('lt-f-start');
  if (!el || !btn) return;
  const z = parseFloat(getComputedStyle(document.body).zoom) || 1;
  const r = btn.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight, vw = innerWidth / z, vh = innerHeight / z;
  let left = r.right / z - w, top = r.bottom / z + 8;
  if (top + h > vh - 8) top = r.top / z - h - 8;
  el.style.left = Math.max(8, Math.min(vw - w - 8, left)) + 'px';
  el.style.top = Math.max(8, top) + 'px';
}

function ltDtpPaint() {
  const el = document.getElementById('lt-dtp'); if (!el || !ltDtp) return;
  const { y, m, d, h, mi } = ltDtp;
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;                   // тиждень з понеділка
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let n = 1; n <= days; n++) {
    const dt = new Date(y, m, n);
    const past = dt < today;
    const sel = d && d.getFullYear() === y && d.getMonth() === m && d.getDate() === n;
    const isT = dt.getTime() === today.getTime();
    cells.push(`<button type="button" class="lt-dtp-d${sel ? ' is-sel' : ''}${isT ? ' is-today' : ''}" ${past ? 'disabled' : ''}
      onclick="ltDtpDay(${n})">${n}</button>`);
  }
  const canPrev = new Date(y, m, 1) > new Date(today.getFullYear(), today.getMonth(), 1);
  el.innerHTML = `
    <div class="lt-dtp-h">
      <button type="button" class="lt-dtp-nav" onclick="ltDtpMonth(-1)" ${canPrev ? '' : 'disabled'} aria-label="Previous month">‹</button>
      <b>${LT_MON[m]} ${y}</b>
      <button type="button" class="lt-dtp-nav" onclick="ltDtpMonth(1)" aria-label="Next month">›</button>
    </div>
    <div class="lt-dtp-w">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="lt-dtp-g">${cells.join('')}</div>
    <div class="lt-dtp-t">
      <span class="lt-dtp-tl">Time</span>
      <div class="lt-dtp-spin"><button type="button" onclick="ltDtpStep('h',-1)">−</button><b>${ltPad(h)}</b><button type="button" onclick="ltDtpStep('h',1)">+</button></div>
      <span class="lt-dtp-colon">:</span>
      <div class="lt-dtp-spin"><button type="button" onclick="ltDtpStep('mi',-1)">−</button><b>${ltPad(mi)}</b><button type="button" onclick="ltDtpStep('mi',1)">+</button></div>
      <div class="lt-dtp-q">${[0, 6, 9, 12, 18].map(x => `<button type="button" class="${h === x && mi === 0 ? 'is-on' : ''}" onclick="ltDtpTime(${x})">${ltPad(x)}:00</button>`).join('')}</div>
    </div>
    <div class="lt-dtp-f">
      <button type="button" class="lt-dtp-l" onclick="ltDtpQuick('tomorrow')">Tomorrow 00:00</button>
      <button type="button" class="lt-dtp-l" onclick="ltDtpQuick('clear')">When switched on</button>
      <button type="button" class="lt-btn is-go lt-dtp-ok" onclick="ltDtpSave()" ${d ? '' : 'disabled'}>Set</button>
    </div>`;
}
window.ltDtpMonth = function (k) { const t = new Date(ltDtp.y, ltDtp.m + k, 1); ltDtp.y = t.getFullYear(); ltDtp.m = t.getMonth(); ltDtpPaint(); };
window.ltDtpDay = function (n) { ltDtp.d = new Date(ltDtp.y, ltDtp.m, n); ltDtpPaint(); };
window.ltDtpStep = function (k, s) {
  if (k === 'h') ltDtp.h = (ltDtp.h + s + 24) % 24;
  else ltDtp.mi = (ltDtp.mi + s * 5 + 60) % 60 - ((ltDtp.mi + s * 5 + 60) % 60) % 5;
  ltDtpPaint();
};
window.ltDtpTime = function (h) { ltDtp.h = h; ltDtp.mi = 0; ltDtpPaint(); };
window.ltDtpQuick = function (q) {
  if (q === 'clear') { ltCur.start = ''; ltDtpClose(); ltPaintLaunch(); return; }
  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(0, 0, 0, 0);
  ltCur.start = ltDtStr(t); ltDtpClose(); ltPaintLaunch();
};
window.ltDtpSave = function () {
  if (!ltDtp.d) return;
  const t = new Date(ltDtp.d); t.setHours(ltDtp.h, ltDtp.mi, 0, 0);
  if (t.getTime() < Date.now()) { toast('That time has already passed — pick a later one.', 'warn'); return; }
  ltCur.start = ltDtStr(t); ltDtpClose(); ltPaintLaunch();
};


/* ── РЕДАКТОР ШАБЛОНУ ──
   «щоб коли я роблю template я міг редагувати його, типу що ми будемо
   копіювати, можливо щось там лишнє». Видно все, що піде в новий
   кабінет: кампанію, адсети, оголошення. Зайве — знімаєш галочку (воно
   зникає зі знімка після Save). Назви, бюджети, країни, вік — правиш.
   У оголошення є Post ID: вставив ID готового допису Сторінки, яку
   бачить кабінет, — оголошення робиться з нього, і режим розробки
   додатка тут не заважає (він блокує лише НОВІ дописи). */
let ltEd = null;
const ltMoney2 = cents => { const v = Number(cents) / 100; return v > 0 ? String(Math.round(v * 100) / 100) : ''; };
const ltCreativeKind = cr => !cr ? 'no creative'
  : cr.asset_feed_spec ? (cr.asset_feed_spec.optimization_type === 'LANGUAGE' ? 'languages' : 'dynamic creative') : (cr.effective_object_story_id || cr.object_story_id) ? 'post'
  : cr.object_story_spec ? 'creative description' : 'no creative';

/* Робоча копія, з якою працюють картки оголошень: у редакторі — знімок
   шаблону (ltEd.spec), у перегляді перед запуском — копія лише для цього
   запуску (ltCur.spec). Картка одна на обидва місця. */
let ltW = null, ltRepaintW = () => {};

window.ltEdit = function (id) {
  const r = ltRows.find(x => x.id === id); if (!r) return;
  ltEd = { r, spec: JSON.parse(JSON.stringify(r.spec || {})), off: new Set() };
  ltW = ltEd.spec; ltRepaintW = () => ltPaintEdit();
  ltPaintEdit();
};

/* Картка оголошення: назва, мови, свій креатив, URL-параметри, Post ID.
   offSet — множина вимкнених ('a'+i / 's'+i), toggle — що викликати на
   галочці; без них галочки немає. */
function ltAdCard(d, i, o) {
  const sets = ltW.adsets || [];
  const si = sets.findIndex(s2 => String(s2.id) === String(d.adset_id));
  const offA = o.off && o.off.has('a' + i);
  const on = !offA && !(o.off && o.off.has('s' + si));
  return `<div class="lt-ed-row${on ? '' : ' is-off'}">
      ${o.toggle ? `<label class="lt-ed-chk"><input type="checkbox" ${offA ? '' : 'checked'} onchange="${o.toggle}('a${i}', this.checked)"></label>` : '<span></span>'}
      <div class="lt-ed-main">
        <div class="lt-ed-line">
          <input class="lt-ed-in is-name" value="${ltEsc(d.name || '')}" oninput="ltW.ads[${i}].name=this.value" placeholder="Ad name">
          <button type="button" class="lt-md-btn" onclick="ltAdDup(${i})" title="Add a copy of this ad">Duplicate</button>
        </div>
        <div class="lt-ed-fields">
          <span class="lt-ed-meta">template creative: ${ltEsc(ltCreativeKind(d.creative))}${sets.length > 1 ? ' · in “' + ltEsc((sets[si] || {}).name || '?') + '”' : ''}</span>
        </div>
        ${ltLangBlock(d, i)}
        ${ltMediaBlock(d, i, (ltW.ads || []).length)}
        <details class="lt-ed-more"><summary>Post ID instead (optional)</summary>
          <input class="lt-ed-in" value="${ltEsc(d.post_id || '')}" oninput="ltW.ads[${i}].post_id=this.value.trim()" placeholder="PAGEID_POSTID — a ready post the cabinet can use"></details>
      </div></div>`;
}
const ltNewId = () => 'new_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
window.ltAdDup = function (i) {
  const d = JSON.parse(JSON.stringify(ltW.ads[i]));
  d.id = ltNewId(); d.name = String(d.name || 'Ad') + ' copy';
  ltW.ads.push(d);
  ltRepaintW();
};
window.ltAdAdd = function (setIdx) {
  const set = (ltW.adsets || [])[setIdx]; if (!set) return;
  const like = (ltW.ads || []).find(d => String(d.adset_id) === String(set.id));
  const d = like ? JSON.parse(JSON.stringify(like)) : { creative: {} };
  d.id = ltNewId(); d.adset_id = set.id; d.name = 'New ad';
  delete d.post_id;
  ltW.ads.push(d);
  ltRepaintW();
};
window.ltSetDup = function (i) {
  const a = JSON.parse(JSON.stringify(ltW.adsets[i]));
  const oldId = String(a.id);
  a.id = ltNewId(); a.name = String(a.name || 'Ad set') + ' copy';
  ltW.adsets.push(a);
  // Оголошення адсету копіюються разом із ним.
  (ltW.ads || []).filter(d => String(d.adset_id) === oldId).forEach(d => {
    const c = JSON.parse(JSON.stringify(d)); c.id = ltNewId(); c.adset_id = a.id; ltW.ads.push(c);
  });
  ltRepaintW();
};

function ltPaintEdit() {
  const card = ltBox().querySelector('.lt-card');
  const { r, spec, off } = ltEd;
  const c = spec.campaign || {}, sets = spec.adsets || [], ads = spec.ads || [];
  const cbo = Number(c.daily_budget) > 0;
  const cur = spec.currency || '';
  const setRow = (a, i) => {
    const t = a.targeting || {}, g = t.geo_locations || {};
    const on = !off.has('s' + i);
    return `<div class="lt-ed-row${on ? '' : ' is-off'}">
      <label class="lt-ed-chk"><input type="checkbox" ${on ? 'checked' : ''} onchange="ltEdToggle('s${i}', this.checked)"></label>
      <div class="lt-ed-main">
        <div class="lt-ed-line">
          <input class="lt-ed-in is-name" value="${ltEsc(a.name || '')}" oninput="ltEd.spec.adsets[${i}].name=this.value" placeholder="Ad set name">
          <button type="button" class="lt-md-btn" onclick="ltAdAdd(${i})" title="Add an ad into this ad set">+ Ad</button>
          <button type="button" class="lt-md-btn" onclick="ltSetDup(${i})" title="Copy this ad set with its ads">Duplicate</button>
        </div>
        <div class="lt-ed-fields">
          ${cbo ? '' : `<label><span>Budget/day ${ltEsc(cur)}</span><input class="lt-ed-in" inputmode="decimal" value="${ltMoney2(a.daily_budget)}" oninput="ltEdSet(${i},'budget',this.value)"></label>`}
          <label><span>Countries</span><input class="lt-ed-in" value="${ltEsc((g.countries || []).join(', '))}" oninput="ltEdSet(${i},'countries',this.value)"></label>
          <label><span>Age</span><span class="lt-ed-age"><input class="lt-ed-in" inputmode="numeric" value="${ltEsc(t.age_min || '')}" oninput="ltEdSet(${i},'age_min',this.value)" placeholder="18">–<input class="lt-ed-in" inputmode="numeric" value="${ltEsc(t.age_max || '')}" oninput="ltEdSet(${i},'age_max',this.value)" placeholder="65"></span></label>
          <span class="lt-ed-meta">${ltEsc(String(a.optimization_goal || '').toLowerCase().replace(/_/g, ' '))}${a.promoted_object && a.promoted_object.custom_event_type ? ' · ' + ltEsc(String(a.promoted_object.custom_event_type).toLowerCase()) : ''}${a.is_dynamic_creative ? ' · dynamic creative (off in copies)' : ''}</span>
        </div>
      </div></div>`;
  };
  const adRow = (d, i) => ltAdCard(d, i, { off, toggle: 'ltEdToggle' });
  card.innerHTML = `<div class="lt-head"><div>
      <button type="button" class="lt-back-btn" onclick="ltPaintList()">← Templates</button>
      <h3>Edit template</h3>
      <p>What gets copied into a new cabinet. Untick what is not needed — it is dropped from the template on Save.</p></div>
      <div class="lt-head-r"><button type="button" class="lt-x" onclick="ltClose()" title="Close (Esc)">×</button></div></div>
    <div class="lt-ed-sec">Template</div>
    <div class="lt-form lt-ed-top">
      <label><span>Template name</span><input value="${ltEsc(r.name)}" oninput="ltEd.name=this.value"></label>
      <label><span>Geo</span><input value="${ltEsc(r.geo || '')}" oninput="ltEd.geo=this.value" maxlength="2"></label>
      <label><span>Campaign name</span><input value="${ltEsc(c.name || '')}" oninput="ltEd.spec.campaign.name=this.value"></label>
      ${cbo ? `<label><span>Budget/day ${ltEsc(cur)}</span><input inputmode="decimal" value="${ltMoney2(c.daily_budget)}" oninput="ltEdCamp(this.value)"></label>` : ''}
    </div>
    <div class="lt-ed-sec">Ad sets · ${sets.length}</div>
    ${sets.map(setRow).join('') || '<div class="lt-empty">No ad sets</div>'}
    <div class="lt-ed-sec">Ads · ${ads.length}</div>
    ${ads.map(adRow).join('') || '<div class="lt-empty">No ads</div>'}
    <div class="lt-foot">
      <span>${off.size ? off.size + ' item(s) will be dropped' : 'Saved into this template; campaigns already launched are not touched'}</span>
      <button type="button" class="lt-btn is-ghost" onclick="ltPaintList()">Cancel</button>
      <button type="button" class="lt-btn is-go" onclick="ltEdSave()">Save</button>
    </div>`;
}

window.ltEdToggle = function (k, on) { if (on) ltEd.off.delete(k); else ltEd.off.add(k); ltPaintEdit(); };
window.ltEdCamp = function (v) {
  const n = Number(String(v).replace(',', '.'));
  ltEd.spec.campaign.daily_budget = n > 0 ? String(Math.round(n * 100)) : ltEd.spec.campaign.daily_budget;
};
window.ltEdSet = function (i, k, v) {
  const a = ltEd.spec.adsets[i];
  a.targeting = a.targeting || {};
  if (k === 'budget') { const n = Number(String(v).replace(',', '.')); if (n > 0) a.daily_budget = String(Math.round(n * 100)); }
  if (k === 'countries') {
    const list = String(v).split(/[\s,;]+/).map(x => x.toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x));
    if (list.length) a.targeting.geo_locations = { countries: list };
  }
  if (k === 'age_min' || k === 'age_max') {
    const n = Math.round(Number(v));
    if (n >= 13 && n <= 65) a.targeting[k] = n; else if (!String(v).trim()) delete a.targeting[k];
  }
};

window.ltEdSave = async function () {
  const { r, spec, off } = ltEd;
  const keepSets = spec.adsets.filter((a, i) => !off.has('s' + i));
  if (!keepSets.length) { toast('Keep at least one ad set.', 'warn'); return; }
  const setIds = new Set(keepSets.map(a => String(a.id)));
  const keepAds = spec.ads.filter((d, i) => !off.has('a' + i) && setIds.has(String(d.adset_id)));
  const next = { ...spec, adsets: keepSets, ads: keepAds };
  const patch = { spec: next };
  if (ltEd.name !== undefined && String(ltEd.name).trim()) patch.name = String(ltEd.name).trim();
  if (ltEd.geo !== undefined) patch.geo = String(ltEd.geo).toUpperCase().trim().slice(0, 2) || null;
  const { error } = await sb.from('launch_templates').update(patch).eq('id', r.id);
  if (error) { toast('Not saved: ' + error.message, 'error'); return; }
  Object.assign(r, patch);
  toast('Template saved: ' + keepSets.length + ' ad set(s), ' + keepAds.length + ' ad(s)', 'ok');
  ltPaintList();
};


/* ── СВІЙ КРЕАТИВ ОГОЛОШЕННЯ ──
   «з пост айді щось треба придумати, це зайоб кожен раз створювати й
   витягувати айді». Відео чи картинку заливаєш ОДИН раз у шаблон (у
   сховище launch-media), поруч — текст, заголовок, посилання, кнопка. При
   кожному запуску fb-launch сама заливає файл у новий кабінет і робить
   справжнє оголошення на Сторінці цього кабінета. Текст і посилання
   спершу підставляються з креатива шаблону, якщо там вони були. */
const LT_CTA = ['LEARN_MORE', 'SIGN_UP', 'PLAY_GAME', 'DOWNLOAD', 'GET_OFFER', 'SHOP_NOW', 'APPLY_NOW', 'CONTACT_US'];
function ltAdDefaults(d) {
  const cr = d.creative || {}, af = cr.asset_feed_spec || {}, o = cr.object_story_spec || {};
  const ld = o.link_data || {}, vd = o.video_data || {};
  return {
    text: (af.bodies && af.bodies[0] && af.bodies[0].text) || ld.message || vd.message || '',
    title: (af.titles && af.titles[0] && af.titles[0].text) || ld.name || vd.title || '',
    link: (af.link_urls && af.link_urls[0] && af.link_urls[0].website_url) || ld.link || (vd.call_to_action && vd.call_to_action.value && vd.call_to_action.value.link) || '',
    cta: (af.call_to_action_types && af.call_to_action_types[0]) || (vd.call_to_action && vd.call_to_action.type) || (ld.call_to_action && ld.call_to_action.type) || 'LEARN_MORE'
  };
}
function ltMd(i) {
  const d = ltW.ads[i];
  if (!d.media) d.media = ltAdDefaults(d);
  return d.media;
}
/* МОВИ ОГОЛОШЕННЯ (Languages у Ads Manager). «глянь, чи шаблон
   створився з мовами». Видно кожну мову з її текстом, заголовком і
   посиланням — їх можна правити; при запуску оголошення відтворюється
   мовним, а не одномовною копією. */
const ltIsLang = d => !!(d.creative && d.creative.asset_feed_spec && d.creative.asset_feed_spec.optimization_type === 'LANGUAGE');
function ltLangs(d) {
  const af = d.creative.asset_feed_spec;
  const rules = af.asset_customization_rules || [];
  const names = [];
  rules.slice().sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default)).forEach(r => {
    const n = (r.body_label || r.title_label || r.link_url_label || {}).name;
    if (n && !names.includes(n)) names.push(n);
  });
  const of = (arr, n) => (arr || []).find(e => (e.adlabels || []).some(l => l.name === n));
  return names.map((n, k) => ({ n, def: k === 0 && rules.some(r => r.is_default),
    body: of(af.bodies, n), title: of(af.titles, n), link: of(af.link_urls, n) }));
}
function ltLangBlock(d, i) {
  if (!ltIsLang(d)) return '';
  const langs = ltLangs(d);
  window.__ltLang = window.__ltLang || {};
  window.__ltLang[i] = langs;
  return `<div class="lt-lang"><div class="lt-lang-h">Languages · ${langs.length} — kept on launch</div>
    ${langs.map((L, k) => `<div class="lt-lang-row">
      <span class="lt-lang-n">${ltEsc(L.n)}${L.def ? '<em>default</em>' : ''}</span>
      <input class="lt-ed-in" value="${ltEsc(L.body ? L.body.text : '')}" placeholder="Text" ${L.body ? '' : 'disabled'} oninput="__ltLang[${i}][${k}].body.text=this.value">
      <input class="lt-ed-in" value="${ltEsc(L.title ? L.title.text : '')}" placeholder="Headline" ${L.title ? '' : 'disabled'} oninput="__ltLang[${i}][${k}].title.text=this.value">
      <input class="lt-ed-in" value="${ltEsc(L.link ? L.link.website_url : '')}" placeholder="Link" ${L.link ? '' : 'disabled'} oninput="__ltLang[${i}][${k}].link.website_url=this.value.trim()">
      ${(() => { const lm = (d.lang_media || {})[L.n];
        return lm && (lm.path || lm.drive_id)
          ? `<span class="lt-lang-v" title="${ltEsc(lm.name || '')}">▶ ${ltEsc((lm.name || 'video').slice(0, 14))}<button type="button" onclick="ltLangDrop(${i}, '${ltEsc(L.n)}')" title="Remove">×</button></span>`
          : `<span class="lt-lang-vv"><label class="lt-lang-v is-up" title="Upload a separate video for ${ltEsc(L.n)}">+ video<input type="file" accept="video/*" hidden onchange="ltLangPick(${i}, '${ltEsc(L.n)}', this)"></label><button type="button" class="lt-lang-v is-up" onclick="lcPickFor(${i}, '${ltEsc(L.n)}')" title="Pick from the library">lib</button></span>`; })()}
    </div>`).join('')}</div>`;
}

function ltMediaBlock(d, i, total) {
  const m = d.media || ltAdDefaults(d);
  const lang = ltIsLang(d);
  const has = !!(m.path || m.drive_id);
  const file = has
    ? `<div class="lt-md-file"><span class="lt-md-ic">${m.kind === 'video' ? '▶' : '▣'}</span>
        <span class="lt-md-name">${m.drive_id ? '<em class="lt-md-drv">Drive</em>' : ''}${ltEsc(m.name || String(m.path || '').split('/').pop())}${m.size ? ' · ' + (m.size / 1048576).toFixed(1) + ' MB' : ''}</span>
        <label class="lt-md-btn">Replace<input type="file" accept="video/*,image/*" hidden onchange="ltMediaPick(${i}, this)"></label>
        <button type="button" class="lt-md-btn" onclick="lcPickFor(${i}, '')">From library</button>
        <button type="button" class="lt-md-btn" onclick="ltMediaDrop(${i})">Remove</button></div>`
    : `<label class="lt-md-up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
        <span>${ltIsLang(d) ? 'Upload a video for all languages (optional)' : 'Upload video or image — CRM puts it into every new cabinet'}</span><input type="file" accept="video/*,image/*" hidden onchange="ltMediaPick(${i}, this)"></label>
      <button type="button" class="lt-md-btn lt-md-lib" onclick="lcPickFor(${i}, '')">or pick from the library</button>`;
  return `<div class="lt-md">
    ${file}
    <label class="lt-md-ut"><span>URL parameters</span><input class="lt-ed-in" value="${ltEsc(d.url_tags !== undefined ? d.url_tags : ((d.creative || {}).url_tags || ''))}"
      oninput="ltW.ads[${i}].url_tags=this.value.trim()" placeholder="utm_source=fb&sub1={{ad.id}}"></label>
    ${lang ? `<p class="lt-md-note">${has ? 'This video goes to every language.' : 'No video here — the template’s own videos are copied from its cabinet while that cabinet is alive. Upload one to be safe.'}</p>` : ''}
    <div class="lt-ed-fields"${lang ? ' hidden' : ''}>
      <label class="is-wide"><span>Text</span><input class="lt-ed-in" value="${ltEsc(m.text || '')}" oninput="ltMd(${i}).text=this.value"></label>
      <label><span>Headline</span><input class="lt-ed-in" value="${ltEsc(m.title || '')}" oninput="ltMd(${i}).title=this.value"></label>
      <label class="is-wide"><span>Link</span><input class="lt-ed-in" value="${ltEsc(m.link || '')}" oninput="ltMd(${i}).link=this.value.trim()" placeholder="https://"></label>
      <label><span>Button</span><select class="lt-ed-in" onchange="ltMd(${i}).cta=this.value">${LT_CTA.map(c =>
        `<option value="${c}"${(m.cta || 'LEARN_MORE') === c ? ' selected' : ''}>${c.replace(/_/g, ' ').toLowerCase()}</option>`).join('')}</select></label>
    </div>
    ${has && total > 1 ? `<button type="button" class="lt-md-all" onclick="ltMediaAll(${i})">Use this creative for all ${total} ads</button>` : ''}
  </div>`;
}

window.ltMediaPick = async function (i, input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const kind = /^video\//.test(file.type) ? 'video' : /^image\//.test(file.type) ? 'image' : '';
  if (!kind) { toast('Pick a video or an image.', 'warn'); return; }
  if (file.size > 200 * 1048576) { toast('The file is over 200 MB — too big to keep in a template.', 'warn'); return; }
  const step = toastStep();
  step.say('Uploading ' + file.name + '…');
  try {
    const m = await ltUploadFile(file, kind);
    Object.assign(ltMd(i), { path: m.path, kind, name: m.name, size: m.size });
    step.done('Uploaded — press Save to keep it in the template', 'ok');
    ltRepaintW();
  } catch (e) {
    step.done('Not uploaded: ' + e.message, 'error');
  }
};
window.ltMediaDrop = function (i) {
  const m = ltMd(i); delete m.path; delete m.drive_id; delete m.kind; delete m.name; delete m.size;
  ltRepaintW();
};
window.ltMediaAll = function (i) {
  const src = ltMd(i);
  ltW.ads.forEach((d, k) => { if (k !== i) d.media = JSON.parse(JSON.stringify(src)); });
  ltRepaintW();
  toast('The same creative is now on every ad — press Save', 'ok', 2500);
};


/* Окреме відео під мову: «окремі відео під мови». Лежить у
   d.lang_media[мова]; при запуску іде саме цій мові. */
async function ltUploadFile(file, kind) {
  const ext = (file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase().slice(0, 5);
  const path = String(currentTeam || 'team') + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const { error } = await sb.storage.from('launch-media').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(/bucket/i.test(error.message) ? 'storage is not set up — run LAUNCH_MEDIA.sql' : error.message);
  const meta = { path, kind, name: file.name, size: file.size };
  await lcRemember(meta, file);
  return meta;
}
window.ltLangPick = async function (i, lang, input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (!/^video\//.test(file.type)) { toast('Pick a video for this language.', 'warn'); return; }
  const step = toastStep();
  step.say('Uploading the ' + lang + ' video…');
  try {
    const m = await ltUploadFile(file, 'video');
    const d = ltW.ads[i];
    d.lang_media = d.lang_media || {};
    d.lang_media[lang] = m;
    step.done(lang + ' video uploaded — press Save', 'ok');
    ltRepaintW();
  } catch (e) { step.done('Not uploaded: ' + e.message, 'error'); }
};
window.ltLangDrop = function (i, lang) {
  const d = ltW.ads[i];
  if (d.lang_media) delete d.lang_media[lang];
  ltRepaintW();
};


/* ══ БІБЛІОТЕКА КРЕАТИВІВ ══
   «Усі відео й картинки — в одному місці з прев'ю; вибирати їх, а не
   заливати знову». Кожне завантаження (шаблон, перегляд, мова) саме
   лягає в launch_creatives; для відео знімаємо кадр-мініатюру. Library —
   сітка з прев'ю, гео, мовою й тим, у скількох шаблонах креатив стоїть.
   «From library» біля кожного завантаження — вибір без повторної
   заливки. */
let lcRows = [], lcQ = '', lcKind = '', lcPick = null, lcUrls = {};
/* «я думав library це з гугл драйва підтягує». Головна вкладка —
   Google Drive команди: усі відео й картинки папки та підпапок (назва
   підпапки — зазвичай гео), прев'ю від самого Drive. Вибір ставить на
   оголошення посилання на файл Drive — при запуску fb-launch бере його
   звідти сама, через браузер нічого не качається. */
let lcSrc = 'drive', lcDrive = null, lcDriveErr = '';
/* «додати до Creative Analyzer, але щоб клікаючи на креатив відкривати
   прев'ю (і дивитись відео)». lcCa — бібліотеку відкрили з аналізатора:
   на картках цифри креативу, у прев'ю — перехід до нього. */
let lcCa = false;
/* Тег із аналізатора, по якому зараз фільтр бібліотеки ('' — усі). */
let lcTag = '';
const lcDriveOn = () => typeof teamDriveFolderId !== 'undefined' && !!teamDriveFolderId;
async function lcDriveLoad(force) {
  if (lcDrive && !force) return;
  lcDriveErr = '';
  try {
    const fields = 'fields=' + encodeURIComponent('files(id,name,mimeType,thumbnailLink,size,modifiedTime)');
    const out = [], seen = new Set();
    const grab = async (pid, folder) => {
      const q = encodeURIComponent(`'${pid}' in parents and trashed=false`);
      (await _driveList(`q=${q}&${fields}&pageSize=500&orderBy=modifiedTime desc`)).forEach(f => {
        if (seen.has(f.id) || !/^(video|image)\//.test(f.mimeType || '')) return;
        seen.add(f.id);
        out.push({ ...f, folder });
      });
    };
    await grab(teamDriveFolderId, '');
    for (const sub of await driveSubfolders()) await grab(sub.id, sub.name);
    lcDrive = out;
  } catch (e) { lcDrive = []; lcDriveErr = e.message || 'Google Drive error'; }
}

/* Кадр відео — на 1-й секунді, 480 px завширшки, JPEG. Не вийшло
   (кодек, CORS) — тихо без мініатюри: прев'ю буде значком. */
function lcThumb(file) {
  return new Promise(res => {
    try {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'metadata';
      const url = URL.createObjectURL(file);
      const done = b => { URL.revokeObjectURL(url); res(b); };
      v.onloadeddata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (e) { done(null); } };
      v.onseeked = () => {
        try {
          const w = 480, h = Math.round(w * (v.videoHeight || 270) / (v.videoWidth || 480));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(v, 0, 0, w, h);
          c.toBlob(b => done(b), 'image/jpeg', .8);
        } catch (e) { done(null); }
      };
      v.onerror = () => done(null);
      setTimeout(() => done(null), 8000);
      v.src = url;
    } catch (e) { res(null); }
  });
}

async function lcRemember(meta, file) {
  try {
    let thumb = null;
    if (meta.kind === 'video' && file) {
      const b = await lcThumb(file);
      if (b) {
        const tp = meta.path.replace(/\.[^./]+$/, '') + '_thumb.jpg';
        const { error } = await sb.storage.from('launch-media').upload(tp, b, { contentType: 'image/jpeg', upsert: true });
        if (!error) thumb = tp;
      }
    }
    const row = { team_name: currentTeam, path: meta.path, kind: meta.kind, name: meta.name || null, size: meta.size || null, thumb_path: thumb };
    if (window.myUid) row.created_by = window.myUid;
    const { data } = await sb.from('launch_creatives').insert([row]).select().limit(1);
    if (data && data[0]) lcRows.unshift(data[0]);
  } catch (e) { /* бібліотека — зручність; завантаження без неї однаково працює */ }
}

async function lcLoad() {
  const { data, error } = await sb.from('launch_creatives').select('*').eq('team_name', currentTeam)
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(/launch_creatives/.test(error.message) ? 'the library is not set up — run LAUNCH_CREATIVES.sql' : error.message);
  lcRows = data || [];
  // Прев'ю — підписаними посиланнями, однією пачкою.
  const paths = [...new Set(lcRows.map(r => r.kind === 'image' ? r.path : r.thumb_path).filter(Boolean))].filter(p => !lcUrls[p]);
  if (paths.length) {
    try {
      const { data: sg } = await sb.storage.from('launch-media').createSignedUrls(paths, 3600);
      (sg || []).forEach(x => { if (x && x.path && x.signedUrl) lcUrls[x.path] = x.signedUrl; });
    } catch (e) { /* без прев'ю */ }
  }
}

/* У скількох шаблонах стоїть файл: шукаємо його шлях у знімках. */
const lcUsed = path => (ltRows || []).filter(r => JSON.stringify(r.spec || {}).includes(path)).length;

function lcBox() {
  let el = document.getElementById('lc-modal');
  if (!el) {
    el = document.createElement('div'); el.id = 'lc-modal'; el.className = 'lt-modal lc-modal hidden';
    el.innerHTML = '<div class="lt-back" onclick="lcClose()"></div><div class="lt-card lc-card" role="dialog" aria-label="Creative library"></div>';
    document.body.appendChild(el);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.classList.contains('hidden') && !document.getElementById('lc-view')) { e.stopPropagation(); lcClose(); } }, true);
  }
  return el;
}
window.lcClose = function () { const el = document.getElementById('lc-modal'); if (el) el.classList.add('hidden'); lcPick = null; lcCa = false; };

window.lcOpen = async function (pick) {
  lcPick = pick || null;
  lcCa = false;
  if (!lcDriveOn() && lcSrc === 'drive') lcSrc = 'up';
  const el = lcBox(); el.classList.remove('hidden');
  el.querySelector('.lc-card').innerHTML = '<div class="lt-empty">Loading the library…</div>';
  try { await lcLoad(); } catch (e) { if (lcSrc === 'up') { el.querySelector('.lc-card').innerHTML = `<div class="lt-empty">${ltEsc(e.message)}</div>`; return; } }
  if (lcSrc === 'drive') await lcDriveLoad();
  lcPaint();
};
window.lcSrcSet = async function (k) {
  lcSrc = k;
  if (k === 'drive') { const c = document.querySelector('#lc-modal .lc-grid'); if (c) c.innerHTML = '<div class="lt-empty">Reading Google Drive…</div>'; await lcDriveLoad(); }
  lcPaint();
};
window.lcDriveChoose = function (id) {
  const f = (lcDrive || []).find(x => x.id === id); if (!f || !lcPick) return;
  const meta = { drive_id: f.id, kind: /^video\//.test(f.mimeType) ? 'video' : 'image', name: f.name, size: Number(f.size) || 0 };
  const { i, lang } = lcPick;
  if (lang) { const d = ltW.ads[i]; d.lang_media = d.lang_media || {}; d.lang_media[lang] = meta; }
  else { const m = ltMd(i); delete m.path; Object.assign(m, meta); }
  lcClose(); ltRepaintW();
  toast('Creative set from Google Drive: ' + f.name, 'ok', 2000);
};
/* Вибір для оголошення i (lang — для окремої мови). */
window.lcPickFor = function (i, lang) {
  lcOpen({ i, lang: lang || '', only: lang ? 'video' : '' });
};

function lcDriveTile(f) {
  const kind = /^video\//.test(f.mimeType) ? 'video' : 'image';
  const src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(f.id) + '&sz=w400';
  const used = (ltRows || []).filter(r => JSON.stringify(r.spec || {}).includes(f.id)).length;
  const fid = ltEsc(f.id).replace(/'/g, '');
  return `<div class="lc-tile is-pick" onclick="${lcPick ? `lcDriveChoose('${fid}')` : `lcViewDrive('${fid}')`}">
    <div class="lc-prev"><img src="${ltEsc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">
      <span class="lc-noprev">${kind === 'video' ? '▶' : '▣'}</span>
      <span class="lc-kind">${kind === 'video' ? '▶ video' : 'image'}</span>
      ${f.folder ? `<span class="lc-folder">${ltEsc(f.folder)}</span>` : ''}
      ${lcPlayIco(kind)}
      ${lcPick ? `<button type="button" class="lc-eye" title="Preview" onclick="event.stopPropagation();lcViewDrive('${fid}')">${LC_EYE}</button>` : ''}</div>
    <div class="lc-meta">
      <div class="lc-name" title="${ltEsc(f.name)}">${ltEsc(f.name)}</div>
      ${lcCa ? lcCaLine(f.name) + lcTagChips(f.name) : `<div class="lc-sub">${f.size ? (Number(f.size) / 1048576).toFixed(1) + ' MB · ' : ''}${used ? 'in ' + used + ' template' + (used > 1 ? 's' : '') : 'not used yet'}</div>`}
    </div></div>`;
}

function lcPaint() {
  const card = document.querySelector('#lc-modal .lc-card'); if (!card) return;
  if (lcSrc === 'drive') return lcPaintDrive(card);
  const q = lcQ.toLowerCase();
  const kind = (lcPick && lcPick.only) || lcKind;
  const rows = lcRows.filter(r => (!kind || r.kind === kind)
    && (!q || [r.name, r.geo, r.lang].join(' ').toLowerCase().includes(q)));
  const tile = r => {
    const src = lcUrls[r.kind === 'image' ? r.path : r.thumb_path];
    const used = lcUsed(r.path);
    return `<div class="lc-tile is-pick" onclick="${lcPick ? `lcChoose(${Number(r.id)})` : `lcViewUp(${Number(r.id)})`}">
      <div class="lc-prev">${src ? `<img src="${ltEsc(src)}" alt="" loading="lazy">` : `<span class="lc-noprev">${r.kind === 'video' ? '▶' : '▣'}</span>`}
        <span class="lc-kind">${r.kind === 'video' ? '▶ video' : 'image'}</span>
        ${lcPlayIco(r.kind)}
        ${lcPick ? `<button type="button" class="lc-eye" title="Preview" onclick="event.stopPropagation();lcViewUp(${Number(r.id)})">${LC_EYE}</button>` : ''}</div>
      <div class="lc-meta">
        <div class="lc-name" title="${ltEsc(r.name || '')}">${ltEsc(r.name || r.path.split('/').pop())}</div>
        ${lcCa ? lcCaLine(r.name || r.path.split('/').pop()) : ''}
        <div class="lc-sub">${r.size ? (r.size / 1048576).toFixed(1) + ' MB · ' : ''}${used ? 'in ' + used + ' template' + (used > 1 ? 's' : '') : 'not used yet'}</div>
        ${lcPick ? '' : `<div class="lc-tags" onclick="event.stopPropagation()">
          <input class="lt-ed-in" value="${ltEsc(r.geo || '')}" placeholder="Geo" maxlength="2" onchange="lcSet(${Number(r.id)}, 'geo', this.value)">
          <input class="lt-ed-in" value="${ltEsc(r.lang || '')}" placeholder="Language" onchange="lcSet(${Number(r.id)}, 'lang', this.value)">
          <button type="button" class="lt-md-btn" onclick="lcDelete(${Number(r.id)})" title="Delete from the library">×</button></div>`}
        ${lcPick || !(r.geo || r.lang) ? (r.geo || r.lang ? `<div class="lc-sub">${ltEsc([r.geo, r.lang].filter(Boolean).join(' · '))}</div>` : '') : ''}
      </div></div>`;
  };
  card.innerHTML = `<div class="lt-head"><div><h3>${lcPick ? 'Pick a creative' : 'Creative library'}</h3>
      ${lcPick ? '<p>Click a creative — it goes on the ad without uploading again. The eye opens a preview.</p>' : ''}</div>
      <div class="lt-head-r"><button type="button" class="lt-x" onclick="lcClose()" title="Close (Esc)">×</button>
        <input class="lt-search lc-search" placeholder="Search name, geo, language…" value="${ltEsc(lcQ)}" oninput="lcQ=this.value;lcPaint();const s=document.querySelector('.lc-search');s.focus();s.setSelectionRange(s.value.length,s.value.length)"></div></div>
    <div class="lc-bar">
      ${lcSrcTabs()}
      ${lcPick && lcPick.only ? '' : ['', 'video', 'image'].map(k => `<button type="button" class="lc-f${lcKind === k ? ' is-on' : ''}" onclick="lcKind='${k}';lcPaint()">${k ? k + 's' : 'All'}</button>`).join('')}
      <label class="lt-md-btn lc-up">+ Upload<input type="file" accept="${lcPick && lcPick.only === 'video' ? 'video/*' : 'video/*,image/*'}" multiple hidden onchange="lcUpload(this)"></label>
      <span class="lc-count">${rows.length} of ${lcRows.length}</span>
    </div>
    <div class="lc-grid">${rows.map(tile).join('') || `<div class="lt-empty">${lcRows.length ? 'Nothing matches.' : 'Nothing here yet — upload a video or an image.'}</div>`}</div>`;
}

window.lcSet = async function (id, k, v) {
  const r = lcRows.find(x => x.id === id); if (!r) return;
  const val = k === 'geo' ? String(v).toUpperCase().trim().slice(0, 2) : String(v).trim().slice(0, 20);
  const { error } = await sb.from('launch_creatives').update({ [k]: val || null }).eq('id', id);
  if (error) { toast('Not saved: ' + error.message, 'error'); return; }
  r[k] = val || null;
};
window.lcDelete = async function (id) {
  const r = lcRows.find(x => x.id === id); if (!r) return;
  const used = lcUsed(r.path);
  if (!await ask({ title: 'Delete from the library?', danger: true, ok: 'Delete',
    body: '“' + (r.name || r.path) + '”' + (used ? '\n\nIt is used in ' + used + ' template(s) — launches from them will lose this creative.' : '') })) return;
  const { error } = await sb.from('launch_creatives').delete().eq('id', id);
  if (error) { toast('Not deleted: ' + error.message, 'error'); return; }
  if (!used) { try { await sb.storage.from('launch-media').remove([r.path].concat(r.thumb_path ? [r.thumb_path] : [])); } catch (e) {} }
  lcRows = lcRows.filter(x => x.id !== id);
  lcPaint();
};
window.lcUpload = async function (input) {
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length) return;
  const step = toastStep();
  let n = 0;
  for (const f of files) {
    const kind = /^video\//.test(f.type) ? 'video' : /^image\//.test(f.type) ? 'image' : '';
    if (!kind || f.size > 200 * 1048576) continue;
    step.say('Uploading ' + f.name + ' (' + (n + 1) + '/' + files.length + ')…');
    try { await ltUploadFile(f, kind); n++; } catch (e) { toast('Not uploaded: ' + f.name + ' — ' + e.message, 'error'); }
  }
  step.done(n + ' file(s) added to the library', n ? 'ok' : 'error');
  try { await lcLoad(); } catch (e) {}
  lcPaint();
};
window.lcChoose = function (id) {
  const r = lcRows.find(x => x.id === id); if (!r || !lcPick) return;
  const meta = { path: r.path, kind: r.kind, name: r.name || r.path.split('/').pop(), size: r.size || 0 };
  const { i, lang } = lcPick;
  if (lang) {
    const d = ltW.ads[i];
    d.lang_media = d.lang_media || {};
    d.lang_media[lang] = meta;
  } else Object.assign(ltMd(i), meta);
  lcClose();
  ltRepaintW();
  toast('Creative set: ' + meta.name, 'ok', 2000);
};

/* ══ ПРЕВ'Ю: ВІДЕО ГРАЄ, КАРТИНКА НА ВЕСЬ ЕКРАН ══
   Те саме вікно, що й у картці креатива в аналізаторі (dv-modal), але
   з рядком під кадром: назва, цифри креативу й «Open in Creative
   Analyzer». Drive грає своїм плеєром (/preview), завантажене —
   звичайним <video> за підписаним посиланням. */
const LC_EYE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.9"/></svg>';
const lcPlayIco = kind => kind === 'video' ? '<span class="lc-play" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M5.5 3.6v8.8L12.4 8z" fill="currentColor"/></svg></span>' : '';

/* Цифри креативу з аналізатора — за весь час. Файл «KG_JS_674_1 -v2.mp4»
   належить креативу kg_js_674_1: те саме правило, що й у «Not
   launched» (crFileCid). */
let lcCaMap = null;
function lcCaStats() {
  if (lcCaMap) return lcCaMap;
  const m = {};
  (window.creativesRawData || []).forEach(d => {
    const cid = String(d.cid || '').trim().toLowerCase();
    if (!cid) return;
    const o = m[cid] || (m[cid] = { cid: String(d.cid).trim(), s: 0, i: 0, r: 0, d: 0 });
    o.s += Number(d.spend) || 0; o.i += Number(d.installs) || 0;
    o.r += Number(d.regs) || 0; o.d += Number(d.deps) || 0;
  });
  return (lcCaMap = m);
}
function lcCaOf(name) {
  const m = lcCaStats();
  const cid = typeof crFileCid === 'function' ? crFileCid(name, new Set(Object.keys(m)))
    : String(name).replace(/\.[^.]+$/, '').trim().toLowerCase();
  return cid && m[cid] ? m[cid] : null;
}
function lcCaLine(name) {
  const o = lcCaOf(name);
  if (!o) return '<div class="lc-sub lc-ca is-cold">never launched</div>';
  return `<div class="lc-sub lc-ca"><b>$${Math.round(o.s).toLocaleString()}</b> · ${o.i} inst · ${o.r} reg · <b class="${o.d ? 'is-dep' : ''}">${o.d} dep</b>${
    o.d ? ' · CPA $' + Math.round(o.s / o.d) : ''}</div>`;
}

/* ТЕГИ КРЕАТИВУ — ті самі, що в Creative Analyzer (crTags). */
function lcTagsOf(name) {
  const o = lcCaOf(name);
  return o && typeof crTagsOf === 'function' ? crTagsOf(o.cid) : [];
}
function lcTagChips(name) {
  const t = lcTagsOf(name);
  if (!t.length) return '';
  return `<div class="lc-tagrow">${t.slice(0, 3).map(x => `<span class="lc-tag">${ltEsc(x)}</span>`).join('')}${
    t.length > 3 ? `<span class="lc-tag is-more">+${t.length - 3}</span>` : ''}</div>`;
}
/* Теги, що стоять хоч на одному файлі папки, — від найчастішого. */
function lcTagList() {
  const n = {};
  (lcDrive || []).forEach(f => lcTagsOf(f.name).forEach(t => { n[t] = (n[t] || 0) + 1; }));
  return Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b));
}

function lcViewer(media, name) {
  lcViewClose();
  const o = lcCaOf(name);
  const wrap = document.createElement('div');
  wrap.id = 'lc-view'; wrap.className = 'dv-modal lc-view';
  wrap.onclick = e => { if (e.target === wrap) lcViewClose(); };
  wrap.innerHTML = `<div class="dv-box">
      <button type="button" class="dv-x" title="Close (Esc)" onclick="lcViewClose()">&times;</button>
      <div class="dv-frame lc-view-frame">${media}</div>
      <div class="lc-view-foot">
        <span class="lc-view-name" title="${ltEsc(name)}">${ltEsc(name)}</span>
        ${lcCa ? lcTagsOf(name).map(x => `<span class="lc-tag">${ltEsc(x)}</span>`).join('') : ''}
        ${o ? `<span class="lc-view-st">$${Math.round(o.s).toLocaleString()} spend · ${o.i} inst · ${o.r} reg · ${o.d} dep${o.d ? ' · CPA $' + Math.round(o.s / o.d) : ''}</span>
          ${typeof selectCreative === 'function' ? `<button type="button" class="lc-view-go" onclick="lcGoCreative('${ltEsc(o.cid).replace(/'/g, '')}')">Open in Creative Analyzer →</button>` : ''}`
          : '<span class="lc-view-st">never launched</span>'}
      </div></div>`;
  document.body.appendChild(wrap);
  document.addEventListener('keydown', lcViewEsc, true);
}
function lcViewEsc(e) { if (e.key === 'Escape') { e.stopPropagation(); lcViewClose(); } }
window.lcViewClose = function () {
  document.removeEventListener('keydown', lcViewEsc, true);
  const v = document.getElementById('lc-view');
  if (v) { v.querySelectorAll('video').forEach(x => { try { x.pause(); } catch (e) {} }); v.remove(); }
};
window.lcViewDrive = function (id) {
  const f = (lcDrive || []).find(x => x.id === id);
  const name = f ? f.name : id;
  const media = f && /^image\//.test(f.mimeType)
    ? `<img src="https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000" alt="" referrerpolicy="no-referrer">`
    : `<iframe src="https://drive.google.com/file/d/${encodeURIComponent(id)}/preview" allow="autoplay" allowfullscreen></iframe>`;
  lcViewer(media, name);
};
window.lcViewUp = async function (id) {
  const r = lcRows.find(x => x.id === id); if (!r) return;
  const name = r.name || r.path.split('/').pop();
  let url = r.kind === 'image' ? lcUrls[r.path] : '';
  if (!url) {
    try {
      const { data } = await sb.storage.from('launch-media').createSignedUrl(r.path, 3600);
      url = data && data.signedUrl;
    } catch (e) { url = ''; }
  }
  if (!url) { toast('Could not open the file', 'error'); return; }
  lcViewer(r.kind === 'video'
    ? `<video src="${ltEsc(url)}" controls autoplay playsinline></video>`
    : `<img src="${ltEsc(url)}" alt="">`, name);
};
window.lcGoCreative = function (cid) {
  lcViewClose(); lcClose();
  try { if (typeof navGo === 'function') navGo('creatives'); } catch (e) {}
  selectCreative(cid);
  document.getElementById('creative-analyzer-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
/* З аналізатора: бібліотека для перегляду, з цифрами на картках. */
window.lcOpenCA = async function () {
  lcCaMap = null; lcTag = '';
  /* З аналізатора — лише Drive: «uploaded також приховай». */
  if (lcDriveOn()) lcSrc = 'drive';
  await lcOpen();
  lcCa = true;
  lcPaint();
};

function lcSrcTabs() {
  return `<div class="lc-src">
    <button type="button" class="${lcSrc === 'drive' ? 'is-on' : ''}" onclick="lcSrcSet('drive')" ${lcDriveOn() ? '' : 'disabled title="Connect Google Drive in Settings → Integrations"'}>Google Drive</button>
    <button type="button" class="${lcSrc === 'up' ? 'is-on' : ''}" onclick="lcSrcSet('up')">Uploaded</button></div>`;
}
function lcPaintDrive(card) {
  const q = lcQ.toLowerCase();
  const kind = (lcPick && lcPick.only) || lcKind;
  const all = lcDrive || [];
  const rows = all.filter(f => (!kind || f.mimeType.startsWith(kind + '/'))
    && (!lcCa || !lcTag || lcTagsOf(f.name).includes(lcTag))
    && (!q || (f.name + ' ' + (f.folder || '') + ' ' + (lcCa ? lcTagsOf(f.name).join(' ') : '')).toLowerCase().includes(q)));
  const tags = lcCa ? lcTagList() : [];
  card.innerHTML = `<div class="lt-head"><div><h3>${lcPick ? 'Pick a creative' : 'Creative library'}</h3>
      ${lcPick ? '<p>Click a file — CRM takes it straight from Google Drive at launch. The eye opens a preview.</p>' : ''}</div>
      <div class="lt-head-r"><button type="button" class="lt-x" onclick="lcClose()" title="Close (Esc)">×</button>
        <input class="lt-search lc-search" placeholder="${lcCa ? 'Search name, folder, tag…' : 'Search name or folder…'}" value="${ltEsc(lcQ)}" oninput="lcQ=this.value;lcPaint();const s=document.querySelector('.lc-search');s.focus();s.setSelectionRange(s.value.length,s.value.length)"></div></div>
    <div class="lc-bar">
      ${lcCa ? '' : lcSrcTabs()}
      ${lcPick && lcPick.only ? '' : ['', 'video', 'image'].map(k => `<button type="button" class="lc-f${lcKind === k ? ' is-on' : ''}" onclick="lcKind='${k}';lcPaint()">${k ? k + 's' : 'All'}</button>`).join('')}
      <button type="button" class="lt-md-btn" onclick="lcSrcSet('drive', lcDrive = null)" title="Read the Drive folder again">↻</button>
      <span class="lc-count">${rows.length} of ${all.length}</span>
    </div>
    ${tags.length ? `<div class="lc-tagbar"><span class="lc-tagbar-h">Tags</span>${['', ...tags].map(t => `<button type="button"
        class="lc-f lc-tf${lcTag === t ? ' is-on' : ''}" onclick="lcTag=decodeURIComponent('${encodeURIComponent(t)}');lcPaint()">${t ? ltEsc(t) : 'All'}</button>`).join('')}</div>` : ''}
    <div class="lc-grid">${lcDriveErr ? `<div class="lt-empty">Google Drive: ${ltEsc(lcDriveErr)}</div>`
      : rows.map(lcDriveTile).join('') || `<div class="lt-empty">${all.length ? 'Nothing matches.' : 'No videos or images in the Drive folder.'}</div>`}</div>`;
}
