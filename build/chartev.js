/* ══════════════════════════════════════════════════════════════════
   ПОДІЇ НА ГОЛОВНОМУ ГРАФІКУ.

   «Тонкі вертикальні позначки на датах, коли щось сталося». Графік
   показує ЩО сталося з грошима, але не ЧОМУ: стрибок спенду чи провал
   профіту доводилось пояснювати по памʼяті. Тепер під датами біжить
   рейка з подіями, які CRM і так знає сама — нічого вписувати не треба:

     • бани кабінетів і нові кабінети (журнал account_events);
     • нове гео й гео, що зупинилось (зі статистики графіка);
     • забанені апки (перевірка Play) і домени, що лягли;
     • спрацювання правил (fb_rule_log);
     • нотатка — лише якщо сам захочеш: клік по даті на рейці.
       Change log для цього не потрібен і на графік не тягнеться: беремо
       тільки нотатки, поставлені з самого графіка (category = 'chart').

   Наведення на дату — у склі-тултіпі зʼявляється блок «Events» з тим,
   що сталося цього дня (з іменами кабінетів, гео, апок). Великі події
   (нове гео, бан апки, сплеск банів) ще й тягнуть тонку вертикальну
   лінію через графік. Під шапкою — смужка з підсумком за період; клік
   по типу ховає чи показує його, вибір памʼятається.
   ══════════════════════════════════════════════════════════════════ */

/* Іконки — ті самі лінійні, що в тултіпі. Шлях один і для canvas
   (Path2D), і для HTML (svg), тож рейка й тултіп виглядають однаково. */
const CE_PATH = {
  ban: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M4.9 4.9l14.2 14.2',
  start: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
  geo: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20M2 12h20',
  geoff: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M10 15V9M14 15V9',
  app: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
  dom: 'M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71M5.17 11.75l-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71M8 2v3M2 8h3M16 19v3M19 16h3',
  rule: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
  note: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  plus: 'M12 5v14M5 12h14'
};

/* Порядок = важливість: на тісній рейці день показує найважливішу
   подію, решта — лічильником «+N» поруч. */
const CE_TYPES = [
  { k: 'note',  label: 'Notes',            color: '#f472b6' },
  { k: 'app',   label: 'Apps banned',      color: '#fb923c' },
  { k: 'dom',   label: 'Domains down',     color: '#facc15' },
  { k: 'geo',   label: 'New geo',          color: '#38bdf8' },
  { k: 'ban',   label: 'Cabinet bans',     color: '#f87171' },
  { k: 'geoff', label: 'Geo stopped',      color: '#94a3b8' },
  { k: 'start', label: 'Cabinets started', color: '#4ade80' },
  { k: 'rule',  label: 'Rules fired',      color: '#a78bfa' }
];
const CE_T = Object.fromEntries(CE_TYPES.map(t => [t.k, t]));
const ceSvg = (k, cls) => `<svg class="${cls || 'ce-ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:${(CE_T[k] || {}).color || 'currentColor'}" aria-hidden="true"><path d="${CE_PATH[k]}"/></svg>`;
const ceEsc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── вигляд: увімкнено чи ні, які типи сховані ── */
const CE_LS = 'ce_view';
function ceView() {
  try {
    const v = JSON.parse(localStorage.getItem(CE_LS) || '{}');
    return { on: v.on !== false, off: Array.isArray(v.off) ? v.off : ['rule'] };
  } catch (e) { return { on: true, off: ['rule'] }; }
}
function ceViewSet(v) { try { localStorage.setItem(CE_LS, JSON.stringify(v)); } catch (e) {} }
const ceShown = k => { const v = ceView(); return v.on && !v.off.includes(k); };

/* ── дані ──
   Тягнемо ВСЕ разом раз на кілька хвилин (журнал невеликий), а день
   рахуємо в поясі браузера — тим самим, яким підписані дати графіка. */
let ceRaw = null, ceAt = 0, ceTeam = '', ceBusy = null;
const ceDay = ts => { const d = new Date(ts); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

async function cePaged(table, cols, build) {
  const PAGE = 1000; let all = [], from = 0;
  for (;;) {
    const { data, error } = await build(sb.from(table).select(cols)).range(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE || all.length > 20000) return all;
    from += PAGE;
  }
}

async function ceLoad(force) {
  if (typeof sb === 'undefined' || !currentTeam) return null;
  if (!force && ceRaw && ceTeam === currentTeam && Date.now() - ceAt < 5 * 60_000) return ceRaw;
  if (ceBusy) return ceBusy;
  ceBusy = (async () => {
    const team = currentTeam;
    const safe = p => p.catch(() => []);
    const [ev, dom, apps, rules, notes] = await Promise.all([
      safe(cePaged('account_events', 'account_id,at,to_state,from_state',
        q => q.eq('team_name', team).eq('kind', 'state').in('to_state', ['banned', 'running']).order('at', { ascending: true }))),
      safe(cePaged('domains', 'domain,broken_since,status', q => q.eq('team_name', team).not('broken_since', 'is', null))),
      safe(cePaged('funnels_mapping', 'funnel_name,app_id,app_gone_since,status', q => q.eq('team_name', team).not('app_gone_since', 'is', null))),
      safe(cePaged('fb_rule_log', 'at,rule_name,entity_name,account_id', q => q.eq('team_name', team).eq('dry', false).eq('ok', true))),
      safe(cePaged('change_log', 'id,text,created_at', q => q.eq('team_name', team).eq('category', 'chart')))
    ]);
    ceRaw = { ev, dom, apps, rules, notes };
    ceAt = Date.now(); ceTeam = team;
    return ceRaw;
  })();
  try { return await ceBusy; } finally { ceBusy = null; }
}

/* Імʼя кабінета для списку: профіль браузера / агент — як у FB LIVE. */
function ceCabName(id) {
  const d = String(id || '').replace(/\D/g, '');
  const fb = (typeof cabFb !== 'undefined' ? cabFb : []).find(x => String(x.account_id || '').replace(/\D/g, '') === d);
  const row = (typeof cabRows !== 'undefined' ? cabRows : []).find(x => String(x.account_id || '').replace(/\D/g, '') === d);
  return (row && (row.profile || row.provider_name)) || (fb && fb.name) || d;
}

/* Події по днях. stats — рядки статистики, з яких намальований графік:
   з них же рахуємо гео (перша і остання дата зі спендом). */
function ceBuild(raw, data) {
  const byDay = {};
  const put = (day, k, item) => {
    if (!day) return;
    const d = byDay[day] || (byDay[day] = {});
    (d[k] || (d[k] = [])).push(item);
  };
  if (raw) {
    /* Бан — перший бан кабінета, новий — перший запуск. Журнал «блимає»
       (banned → issue → banned), і без цього один кабінет давав би
       кілька банів. */
    const firstBan = {}, firstRun = {};
    raw.ev.forEach(e => {
      const id = String(e.account_id || '');
      if (e.to_state === 'banned' && !firstBan[id]) firstBan[id] = e.at;
      if (e.to_state === 'running' && !firstRun[id]) firstRun[id] = e.at;
    });
    Object.entries(firstBan).forEach(([id, at]) => put(ceDay(at), 'ban', ceCabName(id)));
    Object.entries(firstRun).forEach(([id, at]) => put(ceDay(at), 'start', ceCabName(id)));
    raw.dom.forEach(r => put(ceDay(r.broken_since), 'dom', r.domain));
    raw.apps.forEach(r => { if (String(r.status || '').toLowerCase() === 'ban') put(ceDay(r.app_gone_since), 'app', r.funnel_name || r.app_id); });
    const rl = {};
    raw.rules.forEach(r => { const d = ceDay(r.at); const k = d + '|' + (r.rule_name || 'Rule'); rl[k] = (rl[k] || 0) + 1; });
    Object.entries(rl).forEach(([k, n]) => { const [d, name] = k.split('|'); put(d, 'rule', name + (n > 1 ? ' ×' + n : '')); });
    raw.notes.forEach(r => put(ceDay(r.created_at), 'note', { id: r.id, text: r.text }));
  }
  /* Гео — з усієї завантаженої статистики, а не лише з видимого вікна:
     інакше кожне гео було б «новим» у перший день періоду. */
  const all = (typeof rawData !== 'undefined' && rawData && rawData.length) ? rawData : (data || []);
  const first = {}, last = {};
  let maxDay = '', minDay = '';
  all.forEach(r => {
    if (!(Number(r.spend) > 0)) return;
    const g = String(r.geo || '').toUpperCase().trim(), d = String(r.date || '');
    if (!g || g === '??' || !d) return;
    if (!first[g] || d < first[g]) first[g] = d;
    if (!last[g] || d > last[g]) last[g] = d;
    if (d > maxDay) maxDay = d;
    if (!minDay || d < minDay) minDay = d;
  });
  const shift = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return ceDay(t); };
  Object.keys(first).forEach(g => {
    if (first[g] > minDay) put(first[g], 'geo', g);
    // Зупинилось: останній спенд щонайменше 3 дні тому від свіжої дати.
    if (maxDay && last[g] <= shift(maxDay, -3)) put(shift(last[g], 1), 'geoff', g);
  });
  return byDay;
}

let ceByDay = {};

/* Велика подія — тягне вертикальну лінію. Бани — лише сплеск: удвічі
   більше за звичайний день і щонайменше 5, бо по кілька банів на день
   буває щодня, і лінія на кожній даті перестала б щось означати. */
function ceBig(day, days) {
  const d = ceByDay[day];
  if (!d) return null;
  for (const k of ['note', 'app', 'dom', 'geo']) if (d[k] && ceShown(k)) return k;
  if (d.ban && ceShown('ban')) {
    const counts = days.map(x => (ceByDay[x] && ceByDay[x].ban ? ceByDay[x].ban.length : 0)).filter(Boolean).sort((a, b) => a - b);
    const med = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
    if (d.ban.length >= 5 && d.ban.length >= med * 2) return 'ban';
  }
  return null;
}
const ceTypesOf = day => CE_TYPES.filter(t => ceByDay[day] && ceByDay[day][t.k] && ceShown(t.k));

/* ── рейка на canvas ── */
const cePath2D = {};
const ceP2 = k => cePath2D[k] || (cePath2D[k] = new Path2D(CE_PATH[k]));
let ceFade = 1, ceHoverPlus = -1;

window.ceRail = {
  id: 'ceRail',
  beforeDatasetsDraw(chart) {
    const o = chart.options.plugins.ceRail;
    if (!o || !o.days || !ceView().on) return;
    // Лінії великих подій — під даними, щоб не перекривали стовпці.
    const { top, bottom } = chart.chartArea, xs = chart.scales.x, c = chart.ctx;
    c.save();
    o.days.forEach((day, i) => {
      const k = ceBig(day, o.days);
      if (!k) return;
      const x = xs.getPixelForValue(i);
      const g = c.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, cfAlpha(CE_T[k].color, 0));
      g.addColorStop(1, cfAlpha(CE_T[k].color, .42 * ceFade));
      c.strokeStyle = g; c.lineWidth = 1.5; c.setLineDash([3, 4]);
      c.beginPath(); c.moveTo(x, top); c.lineTo(x, bottom); c.stroke();
    });
    c.restore();
  },
  afterDraw(chart) {
    const o = chart.options.plugins.ceRail;
    if (!o || !o.days || !ceView().on) return;
    const xs = chart.scales.x, c = chart.ctx;
    const y = chart.height - 12;
    const act = chart.tooltip && chart.tooltip._active && chart.tooltip._active[0];
    const hot = act ? act.index : -1;
    const step = o.days.length > 1 ? Math.abs(xs.getPixelForValue(1) - xs.getPixelForValue(0)) : 40;
    c.save();
    // Сама рейка — ледь помітна лінія, щоб значки стояли «на чомусь».
    c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(chart.chartArea.left, y); c.lineTo(chart.chartArea.right, y); c.stroke();
    o.days.forEach((day, i) => {
      const x = xs.getPixelForValue(i);
      const types = ceTypesOf(day);
      const isHot = i === hot;
      if (!types.length) {
        // Порожній день під курсором — плюсик: клік додає нотатку.
        if (isHot) ceBadge(c, x, y, 'plus', 'rgba(255,255,255,.55)', 1, true, 0);
        return;
      }
      const main = types[0];
      const extra = step >= 34 ? types.slice(1, 3) : [];
      const more = types.length - 1 - extra.length;
      // Додаткові типи — маленькими кружками праворуч від головного.
      extra.forEach((t, j) => ceDot(c, x + 12 + j * 8, y, t.color, ceFade));
      ceBadge(c, x, y, main.k, main.color, ceFade, isHot, more);
    });
    c.restore();
  }
};

function ceBadge(c, x, y, k, color, a, hot, more) {
  const r = hot ? 10 : 8.5;
  c.save();
  c.globalAlpha = a;
  c.shadowColor = hot ? cfAlpha(color.startsWith('#') ? color : '#ffffff', .55) : 'transparent';
  c.shadowBlur = hot ? 12 : 0;
  c.fillStyle = color.startsWith('#') ? cfAlpha(color, .16) : 'rgba(255,255,255,.08)';
  c.strokeStyle = color.startsWith('#') ? cfAlpha(color, hot ? .95 : .6) : color;
  c.lineWidth = 1.2;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
  c.shadowBlur = 0;
  const s = (r * 1.15) / 24;
  c.translate(x - 12 * s, y - 12 * s); c.scale(s, s);
  c.strokeStyle = color; c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round';
  c.stroke(ceP2(k));
  c.restore();
  if (more > 0) {
    c.save(); c.globalAlpha = a;
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '800 9px ' + (Chart.defaults.font.family || 'sans-serif');
    c.textBaseline = 'middle'; c.fillText('+' + more, x + r + 2, y - r + 2);
    c.restore();
  }
}
function ceDot(c, x, y, color, a) {
  c.save(); c.globalAlpha = a * .9; c.fillStyle = color;
  c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill(); c.restore();
}

/* ── блок «Events» у тултіпі ── */
window.ceTipHtml = function (chart, tooltip) {
  if (chart !== window.chart1 || !ceView().on) return '';
  const o = chart.options.plugins.ceRail;
  const p = tooltip.dataPoints && tooltip.dataPoints[0];
  if (!o || !p) return '';
  const day = o.days[p.dataIndex];
  const types = ceTypesOf(day);
  if (!types.length) return `<div class="ce-tip-hint">${ceSvg('plus', 'ce-ic is-dim')}Click the date on the rail below to add a note</div>`;
  const list = (arr, max) => {
    const names = arr.map(x => typeof x === 'string' ? x : x.text);
    return names.slice(0, max).map(ceEsc).join(', ') + (names.length > max ? ` <i>+${names.length - max}</i>` : '');
  };
  const say = {
    ban:   a => `<b>${a.length}</b> cabinet${a.length === 1 ? '' : 's'} banned`,
    start: a => `<b>${a.length}</b> cabinet${a.length === 1 ? '' : 's'} started`,
    geo:   a => `New geo <b>${a.map(ceEsc).join(', ')}</b>`,
    geoff: a => `Stopped <b>${a.map(ceEsc).join(', ')}</b>`,
    app:   a => `App banned: <b>${list(a, 3)}</b>`,
    dom:   a => `Domain down: <b>${list(a, 3)}</b>`,
    rule:  a => `Rules fired: ${list(a, 3)}`,
    note:  a => a.map(n => `<span class="ce-note">${ceEsc(n.text)}</span>`).join('')
  };
  const sub = { ban: a => list(a, 5), start: a => list(a, 5) };
  return `<div class="ce-tip"><div class="ce-tip-h">Events</div>${types.map(t => {
    const a = ceByDay[day][t.k];
    return `<div class="ce-tip-row">${ceSvg(t.k)}<div><div class="ce-tip-t">${say[t.k](a)}</div>${
      sub[t.k] ? `<div class="ce-tip-s">${sub[t.k](a)}</div>` : ''}</div></div>`;
  }).join('')}</div>`;
};

/* ── смужка-підсумок під шапкою графіка ── */
function ceStrip(days) {
  const el = document.getElementById('ce-strip');
  if (!el) return;
  const v = ceView();
  const tot = {};
  (days || []).forEach(d => { const e = ceByDay[d]; if (e) Object.keys(e).forEach(k => tot[k] = (tot[k] || 0) + e[k].length); });
  const chips = CE_TYPES.filter(t => tot[t.k]).map(t => {
    const on = v.on && !v.off.includes(t.k);
    return `<button type="button" class="ce-chip${on ? '' : ' is-off'}" onclick="ceToggle('${t.k}')"
      title="${ceEsc(t.label)}: ${tot[t.k]} in this period. Click to ${on ? 'hide' : 'show'} on the chart">${ceSvg(t.k)}<b>${tot[t.k]}</b></button>`;
  }).join('');
  el.innerHTML = `<button type="button" class="ce-chip ce-master${v.on ? ' is-on' : ''}" onclick="ceToggle()"
      title="${v.on ? 'Hide' : 'Show'} events on the chart">${ceSvg('note', 'ce-ic')}<span>Events</span></button>`
    + (v.on ? chips || '<span class="ce-none">nothing happened in this period</span>' : '<span class="ce-none">off</span>');
}

window.ceToggle = function (k) {
  const v = ceView();
  if (!k) v.on = !v.on;
  else { v.on = true; v.off = v.off.includes(k) ? v.off.filter(x => x !== k) : v.off.concat(k); }
  ceViewSet(v);
  ceRefresh();
};

/* Перемалювати графік під нові події чи вигляд — без перебудови. */
function ceRefresh() {
  const ch = window.chart1;
  if (!ch || !ch.options.plugins.ceRail) return;
  const pad = ch.options.layout && ch.options.layout.padding;
  if (pad) pad.bottom = ceView().on ? 26 : 0;
  if (typeof ch.update === 'function') ch.update('none');
  ceStrip(ch.options.plugins.ceRail.days);
}

/* Викликає renderTrend після кожного малювання графіка. */
window.ceAttach = async function (chart, data) {
  ceByDay = ceBuild(ceRaw, data);
  ceStrip(chart.options.plugins.ceRail.days);
  try { await ceLoad(); } catch (e) { return; }
  if (window.chart1 !== chart) return;
  ceByDay = ceBuild(ceRaw, data);
  ceStrip(chart.options.plugins.ceRail.days);
  // Плавна поява значків і ліній — раз на графік, коли події приїхали.
  if (!chart.$ceShown) {
    chart.$ceShown = true;
    const t0 = performance.now();
    const tick = now => {
      ceFade = Math.min(1, (now - t0) / 420);
      if (window.chart1 === chart) chart.draw();
      if (ceFade < 1) requestAnimationFrame(tick);
    };
    ceFade = 0; requestAnimationFrame(tick);
  } else chart.draw();
};

/* ── клік по рейці: нотатка на цю дату ── */
window.ceClick = function (evt, chart) {
  const o = chart.options.plugins.ceRail;
  if (!o || !ceView().on) return;
  if (evt.y < chart.height - 26) return;
  const xs = chart.scales.x;
  let best = -1, dist = 1e9;
  o.days.forEach((d, i) => { const dx = Math.abs(xs.getPixelForValue(i) - evt.x); if (dx < dist) { dist = dx; best = i; } });
  if (best < 0 || dist > 22) return;
  cePop(o.days[best], chart, xs.getPixelForValue(best));
};

/* Курсор-рука над рейкою — видно, що туди можна клікнути. */
window.ceHover = function (evt, chart) {
  const o = chart.options.plugins.ceRail;
  const on = !!(o && ceView().on && evt.y >= chart.height - 26);
  chart.canvas.style.cursor = on ? 'pointer' : '';
};

function cePop(day, chart, x) {
  let el = document.getElementById('ce-pop');
  if (!el) {
    el = document.createElement('div'); el.id = 'ce-pop';
    document.body.appendChild(el);
    document.addEventListener('pointerdown', e => {
      const p = document.getElementById('ce-pop');
      if (p && p.classList.contains('is-on') && !p.contains(e.target) && e.target.tagName !== 'CANVAS') p.classList.remove('is-on');
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const p = document.getElementById('ce-pop'); if (p) p.classList.remove('is-on'); } });
  }
  const notes = (ceByDay[day] && ceByDay[day].note) || [];
  const nice = new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', weekday: 'short' });
  el.innerHTML = `<div class="ce-pop-h">${ceSvg('note')}<span>Note · ${ceEsc(nice)}</span>
      <button type="button" class="ce-pop-x" onclick="this.closest('#ce-pop').classList.remove('is-on')" title="Close (Esc)">×</button></div>
    ${notes.map(n => `<div class="ce-pop-n"><span>${ceEsc(n.text)}</span>
      <button type="button" onclick="ceNoteDel('${ceEsc(n.id)}')" title="Delete this note">×</button></div>`).join('')}
    <textarea id="ce-pop-t" rows="2" maxlength="300" placeholder="What happened — switched split, new creatives, stopped AU…"></textarea>
    <div class="ce-pop-f"><span>Only you see it, on this chart.</span>
      <button type="button" class="ce-pop-ok" onclick="ceNoteAdd('${day}')">Save</button></div>`;
  const z = parseFloat(getComputedStyle(document.body).zoom) || 1;
  const r = chart.canvas.getBoundingClientRect();
  el.classList.add('is-on');
  const w = el.offsetWidth, h = el.offsetHeight;
  const vw = window.innerWidth / z, vh = window.innerHeight / z;
  const left = Math.max(8, Math.min(vw - w - 8, r.left / z + x - w / 2));
  const top = Math.max(8, Math.min(vh - h - 8, r.top / z + chart.height - 40 - h));
  el.style.left = left + 'px'; el.style.top = top + 'px';
  const t = document.getElementById('ce-pop-t');
  if (t) {
    t.focus();
    t.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ceNoteAdd(day); };
  }
}

window.ceNoteAdd = async function (day) {
  const t = document.getElementById('ce-pop-t');
  const text = t ? t.value.trim() : '';
  if (!text) { if (t) t.focus(); return; }
  const row = { team_name: currentTeam, category: 'chart', text, created_at: new Date(day + 'T12:00:00').toISOString() };
  if (window.myUid) row.created_by = window.myUid;
  const { error } = await sb.from('change_log').insert([row]);
  if (error) { toast('Note not saved: ' + error.message, 'error'); return; }
  document.getElementById('ce-pop').classList.remove('is-on');
  await ceAfterEdit();
  toast('Note added to the chart', 'ok', 2000);
};
window.ceNoteDel = async function (id) {
  const { error } = await sb.from('change_log').delete().eq('id', id);
  if (error) { toast('Could not delete: ' + error.message, 'error'); return; }
  document.getElementById('ce-pop').classList.remove('is-on');
  await ceAfterEdit();
};
async function ceAfterEdit() {
  await ceLoad(true);
  const ch = window.chart1;
  if (!ch || !ch.options.plugins.ceRail) return;
  ceByDay = ceBuild(ceRaw, ch.$ceData);
  ceRefresh();
}
