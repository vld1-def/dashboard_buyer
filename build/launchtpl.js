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
    body: JSON.stringify(body)
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
        <button type="button" class="lt-btn is-ghost" onclick="ltRename(${Number(r.id)})" title="Rename">✎</button>
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
            countries: s.countries.join(', ') };
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
      rows.push(d.ok ? `<li class="is-ok"><i>✓</i>Created paused: ${d.adsets.made}/${d.adsets.of} ad sets${d.ads.of ? ', ' + d.ads.made + '/' + d.ads.of + ' ads' : ', no ads'}</li>`
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
      <p>${s.sets} ad set${s.sets === 1 ? '' : 's'} · ${s.ads} ad${s.ads === 1 ? '' : 's'}${s.budget ? ' · ' + ltEsc(s.budget) + '/day' : ''}${s.cur ? ' · ' + ltEsc(s.cur) : ''} · everything is created <b>paused</b></p></div>
      <button type="button" class="lt-x" onclick="ltClose()" title="Close (Esc)" ${ltBusy ? 'disabled' : ''}>×</button></div>
    <div class="lt-form">
      <label><span>Campaign name</span><input id="lt-f-name" value="${ltEsc(ltCur.name)}" oninput="ltCur.name=this.value"></label>
      <label><span>Budget / day${s.cbo ? ' (campaign)' : ' (each ad set)'}</span><input id="lt-f-budget" inputmode="decimal" value="${ltEsc(ltCur.budget)}" oninput="ltCur.budget=this.value" placeholder="as in template"></label>
      <label><span>Countries</span><input id="lt-f-geo" value="${ltEsc(ltCur.countries)}" oninput="ltCur.countries=this.value" placeholder="as in template"></label>
      <label class="lt-f-start"><span>Start · your time</span><input id="lt-f-start" type="datetime-local" value="${ltEsc(ltCur.start || '')}"
        oninput="ltCur.start=this.value" title="When the ad sets may start. Empty — as soon as you switch them on. Set it here: after publishing Facebook does not let you change it"></label>
    </div>
    <div class="lt-pick-h"><span>Cabinets · ${picked.length} picked</span>
      <input class="lt-search" placeholder="Search cabinet…" value="${ltEsc(ltCur.q)}" oninput="ltCur.q=this.value;ltPaintLaunch();document.querySelector('.lt-search').focus();document.querySelector('.lt-search').setSelectionRange(this.value.length,this.value.length)"></div>
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
      <button type="button" class="lt-btn is-go" onclick="ltLaunch()" ${!picked.length || ltBusy ? 'disabled' : ''}>Launch paused</button>
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
      const r = await ltFn({ spec: ltCur.r.spec, target_account: id, check: true });
      ltRes[id] = r.ok ? { checks: r.j.checks || [] } : { err: r.j.error || 'HTTP ' + r.status, checks: r.j.checks || [] };
    } catch (e) { ltRes[id] = { err: e.message }; }
  }));
  ltBusy = false;
  ltPaintLaunch();
};

window.ltLaunch = async function () {
  if (ltBusy) return;
  const ids = [...ltCur.picked];
  const name = String(ltCur.name || '').trim() || ltCur.r.name;
  const ov = ltOverrides();
  const extra = [ov.daily_budget ? 'budget ' + ov.daily_budget + '/day' : '', ov.countries ? 'countries ' + ov.countries.join(', ') : '',
    ov.start_time ? 'start ' + new Date(ov.start_time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''].filter(Boolean).join(', ');
  if (!await ask({ title: 'Launch paused?', ok: 'Launch paused',
    body: '“' + name + '” into ' + ids.length + ' cabinet(s)' + (extra ? ' — ' + extra : '') + '.\n\n'
      + 'Ads are always created: from the template’s posts where the cabinet has the page, otherwise placeholders you swap. '
      + 'Everything is created PAUSED. Cabinets in another currency are skipped.' })) return;
  ltBusy = true;
  let good = 0;
  for (const id of ids) {
    const prev = ltRes[id] || {};
    if ((prev.checks || []).some(c => c.level === 'fail')) continue;
    ltRes[id] = Object.assign({}, prev, { busy: true });
    ltPaintLaunch();
    try {
      const r = await ltFn({ spec: ltCur.r.spec, target_account: id, name, overrides: ov });
      ltRes[id] = { checks: r.j.checks || prev.checks || [], done: r.ok ? r.j : { ok: false, error: r.j.error || 'HTTP ' + r.status } };
      if (r.ok) good++;
    } catch (e) { ltRes[id] = { checks: prev.checks || [], done: { ok: false, error: e.message } }; }
    ltPaintLaunch();
  }
  ltBusy = false;
  if (good) {
    const r = ltCur.r;
    r.uses = (r.uses || 0) + good; r.last_used_at = new Date().toISOString();
    await sb.from('launch_templates').update({ uses: r.uses, last_used_at: r.last_used_at }).eq('id', r.id);
    toast('Launched paused in ' + good + ' cabinet(s). Press Sync now to see them in FB LIVE.', 'ok', 6000);
  }
  ltPaintLaunch();
};
