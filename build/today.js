<script>
/* ══════════════════════════════════════════════════════════════════
   TODAY — ЖИВІ ЧИСЛА З ОСТАННЬОГО SYNC NOW, ОДНІЄЮ ТАБЛИЦЕЮ

   «мені тільки лайв дані які тягнуться по апі … і кожен раз коли
   оновлюю каби оновлювати інформацію. Групування по гео, кабам,
   сразу визначення воронок, і список з крео (якщо одинакові крео
   збирати всю інфу в одне)».

   Джерело — лише fb_ad_today: те, що віддав Facebook при останньому
   Sync now, за сьогодні. Трекера тут немає навмисно. Свого запиту до
   знімка вікно не робить: рядки вже прочитав cabSnapLoad, і він же
   кличе tdOnSnap після кожного Sync now — вікно оновлюється само.

   Рахує тими самими функціями, що й розбір кабінета (cdLeadCount,
   cdPick, CD_INST) і що й PWA (pwMaskParse): ліди на екрані Cabinets і
   тут мусять бути одним числом, а воронка — тим самим ключем.
   ══════════════════════════════════════════════════════════════════ */

let tdMode = 'tree', tdOpenSet = new Set(), tdMaps = null, tdMapsAt = 0;

const tdEsc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const tdMoney = v => '$' + (Number(v) || 0).toLocaleString('en-US',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* Ціна за подію. Нуль подій при витратах — не «дорого», а «ще нема з
   чого рахувати»: прочерк, як і на сторінці кабінетів. */
const tdPer = (s, n) => n > 0 ? tdMoney(s / n) : '<span class="td-dim">—</span>';
/* Не прапорці: у Windows вони малюються двома літерами, і поруч із
   кодом виходило «KG KG». */
const tdFlag = () => '🌍';

/* ОДИН KTID, НАПИСАНИЙ ПО-РІЗНОМУ. «в фб 000_000, в кейтаро 000-000 …
   ігнорувати -_ типу не звертати уваги який». Порівнюємо без регістру,
   дефісів, підкреслень і пробілів — так само, як імпорт у Form.html
   (looseKey): воронка на екрані й у звіті мусить бути одна. */
const tdLoose = v => String(v == null ? '' : v).toLowerCase().replace(/[-_\s]+/g, '');

/* Назви кабінетів, браузери, воронки. Невеликі таблиці, раз на кілька
   хвилин — не на кожен Sync now. */
async function tdMapsLoad() {
  if (tdMaps && Date.now() - tdMapsAt < 5 * 60_000) return;
  const m = { cab: new Map(), tz: new Map(), br: new Map(), fn: new Map() };
  const own = q => (window.myUid ? q.eq('created_by', window.myUid) : q);
  try {
    const [a, b, f] = await Promise.all([
      own(sb.from('fb_accounts').select('account_id,name,timezone_name')),
      own(sb.from('accounts_mapping').select('account_id,profile')),
      sb.from('funnels_mapping').select('funnel_name,ktid,geo').eq('team_name', currentTeam)
    ]);
    (a.data || []).forEach(r => {
      const id = String(r.account_id).replace(/^act_/, '');
      m.cab.set(id, String(r.name || ''));
      if (r.timezone_name) m.tz.set(id, String(r.timezone_name));
    });
    (b.data || []).forEach(r => { if (r.profile) m.br.set(String(r.account_id).replace(/^act_/, ''), String(r.profile)); });
    (f.data || []).forEach(r => { if (r.ktid && tdLoose(r.ktid)) m.fn.set(tdLoose(r.ktid),
      { name: String(r.funnel_name || r.ktid), geo: String(r.geo || '').toUpperCase(),
        ktid: String(r.ktid).trim() }); });
  } catch (e) { /* без підписів таблиця однаково працює */ }
  if (typeof pwMaskLoad === 'function') { try { await pwMaskLoad(); } catch (e) {} }
  tdMaps = m; tdMapsAt = Date.now();
}

/* Рядок знімка → те, що показуємо. */
function tdRow(r) {
  const acts = Array.isArray(r.actions) ? r.actions : [];
  const acc = String(r.account_id || '').replace(/^act_/, '');
  const camp = String(r.campaign_name || '');
  const mask = typeof pwMask !== 'undefined' ? pwMask : '*_{geo}_{ktid}';
  const p = typeof pwMaskParse === 'function' ? pwMaskParse(mask, camp) : null;
  let ktid = String((p && p.ktid) || '').trim();
  let fn = ktid && tdMaps ? tdMaps.fn.get(tdLoose(ktid)) : null;
  /* МАСКА НЕ ДЛЯ ВСІХ НАЗВ. Апкові кампанії звуться інакше:
     cy638t_8wxg7hf7_bGcTwMmV_LTR11003_1098482592991689_TJ — ключ
     воронки (LTR11003) стоїть четвертим, а маска бере другий шматок.
     Тоді шукаємо серед шматків назви той, що є в мапінгу: вгадування
     тут немає, лише точний збіг із тим, що завели самі. */
  if (!fn && tdMaps) {
    for (const tok of camp.split(/[_\s]+/)) {
      const f = tdMaps.fn.get(tdLoose(tok));
      if (f) { fn = f; ktid = tok.trim(); break; }
    }
  }
  /* Жоден шматок не збігся цілим — ktid міг сам розпастись на шматки
     («10708_ry05» замість «10708-ry05») або назва йде через дефіси.
     Шукаємо відомий ktid у всій назві; з кількох — найдовший, а
     коротші за 4 знаки не шукаємо: вони знайдуться в будь-чому. */
  if (!fn && tdMaps) {
    const hay = tdLoose(camp);
    let bestLen = 0;
    tdMaps.fn.forEach((f, key) => {
      if (key.length >= 4 && key.length > bestLen && hay.includes(key)) { fn = f; ktid = f.ktid; bestLen = key.length; }
    });
  }
  /* Гео: з маски, якщо там справді код країни; далі — з воронки; далі —
     окремий дволітерний шматок назви кампанії чи оголошення (…_TJ,
     KG_15323). */
  const code = v => /^[A-Z]{2}$/.test(String(v || '').toUpperCase()) ? String(v).toUpperCase() : '';
  const tokGeo = s => (String(s || '').split(/[_\s-]+/).find(x => /^[A-Z]{2}$/.test(x)) || '');
  const geo = code(p && p.geo) || code(fn && fn.geo) || tokGeo(camp) || tokGeo(r.name);
  return {
    acc, cab: (tdMaps && tdMaps.cab.get(acc)) || '', br: (tdMaps && tdMaps.br.get(acc)) || '',
    geo: /^[A-Z]{2}$/.test(geo) ? geo : '??',
    fn: fn ? fn.name : ktid ? 'Unknown (' + ktid + ')' : 'No funnel in name',
    fnBad: !fn,
    cr: String(r.name || r.ad_id || ''), camp,
    s: Number(r.spend) || 0, im: Number(r.impressions) || 0, lc: Number(r.link_clicks) || 0,
    l: typeof cdLeadCount === 'function' ? cdLeadCount(acts, CD_LEAD_DEFAULT) : 0,
    i: (typeof cdPick === 'function' && cdPick(acts, CD_INST)) || 0,
    r: (typeof cdPick === 'function' && cdPick(acts, 'complete_registration')) || 0,
    d: (typeof cdPick === 'function' && cdPick(acts, 'purchase')) || 0,
    at: Date.parse(r.seen_at || '') || 0,
    tz: (tdMaps && tdMaps.tz.get(acc)) || ''
  };
}

/* ═══ СЬОГОДНІ — ЦЕ СЬОГОДНІ В ПОЯСІ КАБІНЕТА ═══

   «звідки взялось сьогодні аж 400 спенда, мені окремо по кабінетам
   стільки не підтягується».

   fb_ad_today не чиститься цілком: Sync now переписує рядки тих
   кабінетів, які синкав, а рядки решти лежать зі спендом того дня,
   коли їх синкали востаннє — 01.10, 16.10, 31.10. Вікно складало все
   підряд і на 07.11 показало $404, з яких сьогоднішніх було $116.39
   (рівно стільки, скільки в fb_spend_daily за день).

   Тому рядок рахується лише тоді, коли його бачили СЬОГОДНІ — у поясі
   самого кабінета, бо «сьогодні» для Facebook визначає саме він. */
const tdDay = (ms, tz) => {
  try { return new Date(ms).toLocaleDateString('en-CA', tz ? { timeZone: tz } : undefined); }
  catch (e) { return new Date(ms).toLocaleDateString('en-CA'); }
};
const tdIsToday = x => !!x.at && tdDay(x.at, x.tz) === tdDay(Date.now(), x.tz);

const tdSum = rows => rows.reduce((a, x) => ({ s: a.s + x.s, im: a.im + x.im, lc: a.lc + x.lc,
  l: a.l + x.l, i: a.i + x.i, r: a.r + x.r, d: a.d + x.d }),
  { s: 0, im: 0, lc: 0, l: 0, i: 0, r: 0, d: 0 });

/* Порядок — як просили: кожне число поруч зі своєю ціною
   (Clicks-CPC, Regs-CPR, Deps-CPA), а не лічильники окремо від цін. */
const TD_COLS = ['Spend', 'Impr.', 'CTR', 'CPM', 'Clicks', 'CPC', '📲', 'CPL / CPI', 'Regs', 'CPR', 'Deps', 'CPA'];
/* 📲 — ліди або інстали, як у листах правил: апка — інстали, веб —
   ліди. Є обидва — пишемо обидва, щоб не вибирати за людину. */
function tdCells(t) {
  const conv = t.l && t.i ? t.l + ' <span class="td-dim">L</span> · ' + t.i + ' <span class="td-dim">I</span>'
    : t.i ? t.i + ' <span class="td-dim">I</span>' : String(t.l);
  const cost = t.l && t.i ? tdPer(t.s, t.l) + ' · ' + tdPer(t.s, t.i)
    : t.i ? tdPer(t.s, t.i) : tdPer(t.s, t.l);
  const ctr = t.im > 0 ? (Math.round(t.lc / t.im * 10000) / 100) + '%' : '<span class="td-dim">—</span>';
  const cpm = t.im > 0 ? tdMoney(t.s / t.im * 1000) : '<span class="td-dim">—</span>';
  return `<td>${tdMoney(t.s)}</td><td>${t.im.toLocaleString('en-US')}</td><td>${ctr}</td><td>${cpm}</td>`
    + `<td>${t.lc}</td><td>${tdPer(t.s, t.lc)}</td>`
    + `<td>${conv}</td><td>${cost}</td><td>${t.r}</td><td>${tdPer(t.s, t.r)}</td>`
    + `<td class="${t.d ? 'td-good' : ''}">${t.d}</td><td>${tdPer(t.s, t.d)}</td>`;
}

/* ID кабінета, а не назва: назви тут «1», «3» і чуже ім'я з БМ, а
   шукають кабінет у браузері саме за ID. Назва — у підказці. */
const tdCab = x => (x.br ? '🌐 ' + tdEsc(x.br) + ' › ' : '') + '<span title="'
  + tdEsc(x.cab || '') + '">🏦 ' + tdEsc(x.acc) + '</span>';
const tdFn = (k, l) => l[0].fnBad
  ? '<span class="td-warn">⚠ ' + tdEsc(k) + '</span>'
  : '🔀 ' + tdEsc(k);

const TD_VIEWS = {
  tree: [
    [x => x.geo, k => tdFlag(k) + ' ' + tdEsc(k)],
    [x => x.acc, (k, l) => tdCab(l[0])],
    [x => x.fn, tdFn],
    [x => x.cr, k => '🎨 ' + tdEsc(k)]
  ],
  /* Однакова назва — один креатив, хоч би в скількох кабінетах і
     кампаніях він крутився. Розгорнувши, видно, де саме. */
  cre: [
    [x => x.cr, (k, l) => { const n = new Set(l.map(x => x.acc)).size;
      return '🎨 ' + tdEsc(k) + (n > 1 ? ' <span class="td-tag">' + n + ' cabinets</span>' : ''); }],
    [x => x.acc + '|' + x.camp, (k, l) => tdCab(l[0]) + ' <span class="td-dim">· '
      + tdEsc(l[0].camp) + '</span>']
  ],
  fun: [
    [x => x.fn, (k, l) => tdFn(k, l) + ' <span class="td-tag">' + tdFlag(l[0].geo) + ' ' + tdEsc(l[0].geo) + '</span>'],
    [x => x.cr, k => '🎨 ' + tdEsc(k)]
  ]
};

function tdTree(rows, levels) {
  let html = '';
  const walk = (list, depth, path) => {
    const [key, label] = levels[depth];
    const g = new Map();
    list.forEach(x => { const k = key(x); if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
    [...g.entries()].sort((a, b) => tdSum(b[1]).s - tdSum(a[1]).s).forEach(([k, l]) => {
      const id = path + '/' + k, leaf = depth === levels.length - 1, open = tdOpenSet.has(id);
      html += `<tr class="td-l${Math.min(depth, 1)}${leaf ? '' : ' td-x'}${open ? ' is-open' : ''}" data-id="${tdEsc(id)}">`
        + `<td style="padding-left:${10 + depth * 18}px"><span class="td-car">${leaf ? '' : '▸'}</span>${label(k, l)}</td>`
        + tdCells(tdSum(l)) + '</tr>';
      if (!leaf && open) walk(l, depth + 1, id);
    });
  };
  walk(rows, 0, '');
  return html;
}

function tdRender() {
  const box = document.getElementById('td-body');
  if (!box) return;
  if (typeof cabSnapErr !== 'undefined' && cabSnapErr) {
    box.innerHTML = '<p class="td-empty">Could not read today’s numbers: ' + tdEsc(cabSnapErr) + '</p>';
    return;
  }
  const all = (typeof cabSnapRows !== 'undefined' ? cabSnapRows : []).map(tdRow);
  /* Лише те, що сьогодні справді крутилось: нуль спенду й нуль показів
     — це рядок знімка про вимкнене, і в таблиці він лише шум. */
  const active = all.filter(x => x.s > 0 || x.im > 0);
  const rows = active.filter(tdIsToday);
  /* Скільки старого сховали — щоб «а де кабінет X» мало відповідь. */
  const old = active.filter(x => !tdIsToday(x));
  const oldCabs = new Set(old.map(x => x.acc)).size;
  const newest = all.reduce((m, x) => Math.max(m, x.at), 0);
  const mins = newest ? Math.max(0, Math.round((Date.now() - newest) / 60000)) : null;
  const sameDay = newest && new Date(newest).toDateString() === new Date().toDateString();
  document.getElementById('td-when').innerHTML = !newest ? 'No sync yet'
    : (sameDay ? 'Last Sync now: <b>' + (mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago'
        : Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min ago') + '</b>'
      : '<span class="td-warn">⚠ Numbers are from ' + new Date(newest).toLocaleDateString('en-GB')
        + ' — press Sync now for today</span>')
    + (oldCabs ? ' <span class="td-dim" title="These cabinets were last synced on an earlier day;'
        + ' their old numbers are not counted">· ' + oldCabs + ' cabinet(s) not synced today — hidden</span>' : '');

  const t = tdSum(rows);
  const crs = new Set(rows.map(x => x.cr)), multi = [...crs]
    .filter(c => new Set(rows.filter(x => x.cr === c).map(x => x.acc)).size > 1).length;
  const unk = new Set(rows.filter(x => x.fnBad).map(x => x.fn)).size;
  document.getElementById('td-kpis').innerHTML = [
    ['Spend', tdMoney(t.s)], ['Clicks · CPC', t.lc + ' · ' + tdPer(t.s, t.lc)],
    ['📲 Leads · Inst', t.l + ' · ' + t.i], ['Regs · Deps', t.r + ' · ' + t.d],
    ['Cabinets', new Set(rows.map(x => x.acc)).size],
    ['Creatives', crs.size + (multi ? ' <span class="td-tag">' + multi + ' in 2+ cabs</span>' : '')],
    ['Funnels', new Set(rows.map(x => x.fn)).size + (unk ? ' <span class="td-tag td-warn">⚠ ' + unk + ' unknown</span>' : '')]
  ].map(([l, v]) => `<div class="td-kpi"><div class="td-kl">${l}</div><div class="td-kv">${v}</div></div>`).join('');

  if (!rows.length) {
    box.innerHTML = '<p class="td-empty">Nothing spent today yet — or Sync now has not run today.</p>';
    return;
  }
  const head = tdMode === 'cre' ? 'Creative' : tdMode === 'fun' ? 'Funnel' : 'Geo › Cabinet › Funnel › Creative';
  box.innerHTML = '<table class="td-tbl"><thead><tr><th>' + head + '</th>'
    + TD_COLS.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>'
    + tdTree(rows, TD_VIEWS[tdMode])
    + '<tr class="td-tot"><td>Total</td>' + tdCells(t) + '</tr></tbody></table>';
}

/* Вікно створюємо при першому відкритті: на сторінці, де його ніхто не
   відкриває, йому нема чого займати місце в DOM. */
function tdEnsure() {
  let ov = document.getElementById('td-ov');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'td-ov'; ov.className = 'td-ov hidden';
  ov.innerHTML = `<div class="td-win" role="dialog" aria-label="Stat. Day">
    <div class="td-top">
      <h3 class="td-h">Stat. Day <span class="td-dim">· live from Facebook</span></h3>
      <span id="td-when" class="td-when"></span>
      <div class="td-seg" id="td-mode">
        <button type="button" data-m="tree" class="is-on">Geo › Cabinet › Funnel › Creative</button>
        <button type="button" data-m="cre">Creatives</button>
        <button type="button" data-m="fun">Funnels</button>
      </div>
      <div class="td-seg" id="td-exp">
        <button type="button" data-e="1">Expand all</button><button type="button" data-e="0">Collapse</button>
      </div>
      <button type="button" class="td-sync" onclick="cabSync()" title="Sync now">↻ Sync now</button>
      <button type="button" class="td-close" onclick="tdToggle(false)" aria-label="Close">✕</button>
    </div>
    <div id="td-kpis" class="td-kpis"></div>
    <div id="td-body" class="td-body"></div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) tdToggle(false); });
  ov.querySelector('#td-mode').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    tdMode = b.dataset.m; tdOpenSet.clear();
    ov.querySelectorAll('#td-mode button').forEach(x => x.classList.toggle('is-on', x === b));
    tdRender();
  });
  ov.querySelector('#td-exp').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    tdOpenSet.clear();
    if (b.dataset.e === '1') {
      const lv = TD_VIEWS[tdMode];
      const rows = (cabSnapRows || []).map(tdRow).filter(x => (x.s > 0 || x.im > 0) && tdIsToday(x));
      const add = (list, d, path) => { if (d >= lv.length - 1) return;
        const g = new Map(); list.forEach(x => { const k = lv[d][0](x); if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
        g.forEach((l, k) => { const id = path + '/' + k; tdOpenSet.add(id); add(l, d + 1, id); }); };
      add(rows, 0, '');
    }
    tdRender();
  });
  ov.querySelector('#td-body').addEventListener('click', e => {
    const tr = e.target.closest('tr.td-x'); if (!tr) return;
    const id = tr.dataset.id; tdOpenSet.has(id) ? tdOpenSet.delete(id) : tdOpenSet.add(id);
    tdRender();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !ov.classList.contains('hidden')) tdToggle(false);
  });
  return ov;
}

window.tdToggle = async function (want) {
  const ov = tdEnsure();
  const open = want === undefined ? ov.classList.contains('hidden') : !!want;
  ov.classList.toggle('hidden', !open);
  document.getElementById('cab-today-btn')?.classList.toggle('is-on', open);
  if (!open) return;
  document.getElementById('td-body').innerHTML = '<p class="td-empty">Loading…</p>';
  await tdMapsLoad();
  /* Знімка ще немає (сторінку відкрили щойно) — читаємо; інакше беремо
     вже прочитане. Після Sync now cabSnapLoad покличе tdOnSnap сам. */
  if (!cabSnapRows.length && typeof cabSnapLoad === 'function') await cabSnapLoad();
  tdRender();
};

/* Кличе cabSnapLoad після кожного перечитування знімка. */
window.tdOnSnap = function () {
  const ov = document.getElementById('td-ov');
  if (ov && !ov.classList.contains('hidden')) tdRender();
};
</script>
