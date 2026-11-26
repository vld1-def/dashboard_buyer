<script>
/* ══════════════════════════════════════════════════════════════════
   STAT. DAY — ЧИСЛА ЗА ДЕНЬ ОДНІЄЮ ТАБЛИЦЕЮ
   (сьогодні — живі з останнього Sync now; минулі дні — з календаря,
   див. «КАЛЕНДАР» нижче)

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
/* ПРАПОР — КАРТИНКОЮ, А НЕ ЕМОДЗІ. «Як мінімум додати прапори».
   Емодзі-прапори у Windows малюються двома літерами, і поруч із кодом
   виходило «KG KG» — тому тут довго стояв глобус. Беремо SVG з набору
   flag-icons (cdnjs): один файл на країну, і вантажиться лише той, що
   справді є в таблиці. Не завантажився чи гео невідоме — картинка
   просто зникає, код країни поруч лишається. */
const TD_FLAGS = 'https://cdnjs.cloudflare.com/ajax/libs/flag-icons/7.2.3/flags/4x3/';
const tdFlag = geo => {
  const c = String(geo || '').trim().toLowerCase();
  return /^[a-z]{2}$/.test(c)
    ? '<img class="td-flag" src="' + TD_FLAGS + c + '.svg" alt="" loading="lazy" onerror="this.remove()">'
    : '<span class="td-flag is-none" aria-hidden="true"></span>';
};

/* ЦІНА ПРОТИ СЕРЕДНЬОЇ ПО ТАБЛИЦІ.
   Дванадцять стовпців цифр читати рядок за рядком довго; а питання до
   них одне — де дешевше за середнє, а де дорожче. Тому ціну (CPC, CPL,
   CPI, CPR, CPA) фарбуємо: на п'яту частину нижче середньої — зелена,
   на чверть вище — червона. Решта лишається як є: розфарбована вся
   таблиця читалась би гірше за нерозфарбовану.
   Середня — з підсумку ЦІЄЇ таблиці (tdAvg), а не якась стала. */
let tdAvg = null;
const tdPrice = (t, k) => {
  const n = t[k];
  if (!(n > 0)) return '<span class="td-dim">—</span>';
  const v = t.s / n, txt = tdMoney(v);
  /* Для лідів та інсталів середня — лише по тих рядках, де вони Є.
     Веб-кампанії дають ліди, апкові — інстали; поділити спенд усієї
     таблиці на самі ліди означало б завищити середню рівно на спенд
     апок — і тоді «дешевше за середнє» горіло б зеленим у кожному
     рядку. */
  const N = tdAvg ? tdAvg[k] : 0;
  const S = tdAvg ? (tdAvg.sBy && tdAvg.sBy[k] != null ? tdAvg.sBy[k] : tdAvg.s) : 0;
  if (!(N > 0) || !(S > 0) || !(v > 0)) return txt;
  const avg = S / N;
  if (Math.abs(v - avg) < 0.005) return txt;         // сам підсумок — із собою не порівнюємо
  return v <= avg * 0.8 ? '<span class="td-good">' + txt + '</span>'
       : v >= avg * 1.25 ? '<span class="td-bad">' + txt + '</span>' : txt;
};

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
  const cost = t.l && t.i ? tdPrice(t, 'l') + ' · ' + tdPrice(t, 'i')
    : t.i ? tdPrice(t, 'i') : tdPrice(t, 'l');
  const ctr = t.im > 0 ? (Math.round(t.lc / t.im * 10000) / 100) + '%' : '<span class="td-dim">—</span>';
  const cpm = t.im > 0 ? tdMoney(t.s / t.im * 1000) : '<span class="td-dim">—</span>';
  return `<td>${tdMoney(t.s)}</td><td>${t.im.toLocaleString('en-US')}</td><td>${ctr}</td><td>${cpm}</td>`
    + `<td>${t.lc}</td><td>${tdPrice(t, 'lc')}</td>`
    + `<td>${conv}</td><td>${cost}</td><td>${t.r}</td><td>${tdPrice(t, 'r')}</td>`
    + `<td class="${t.d ? 'td-good' : ''}">${t.d}</td><td>${tdPrice(t, 'd')}</td>`;
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

/* ═══ ПОШУК ═══
   «в stat.day додай пошук».

   Шукає по всьому, що видно в рядку: гео, ID і назва кабінета, браузер,
   воронка, креатив, кампанія. Кілька слів — усі мусять знайтись
   (KG 674 — креатив 674 саме в KG). Дефіс, підкреслення й пробіл не
   розрізняються: «10708 ry05» знаходить «10708-ry05», бо назви в
   Facebook і в трекері пишуться по-різному.

   Знайдене розкривається саме: шукали креатив — він і має бути видно,
   а не сховано під трьома згорнутими рівнями. Великі числа вгорі й
   далі кажуть про весь день; про знайдене каже рядок підсумку. */
let tdQ = '';
function tdHit(x, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [x.geo, x.acc, x.cab, x.br, x.fn, x.cr, x.camp].map(v => String(v == null ? '' : v)).join(' ').toLowerCase();
  const loose = tdLoose(hay);
  return words.every(w => hay.includes(w) || loose.includes(tdLoose(w)));
}

// Скільки відсотків спенду таблиці припадає на рядок (для смужки).
const tdShare = s => (tdAvg && tdAvg.s > 0 ? Math.max(0, Math.min(100, Math.round(s / tdAvg.s * 1000) / 10)) : 0);

function tdTree(rows, levels) {
  let html = '';
  const walk = (list, depth, path) => {
    const [key, label] = levels[depth];
    const g = new Map();
    list.forEach(x => { const k = key(x); if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
    [...g.entries()].sort((a, b) => tdSum(b[1]).s - tdSum(a[1]).s).forEach(([k, l]) => {
      /* Пошук розкриває все лише в дереві «Geo › … › Creative»: там знайдене
         сховане на четвертому рівні. На вкладках Creatives і Funnels —
         список: «щоб був список, а не групування по дефолту». */
      const id = path + '/' + k, leaf = depth === levels.length - 1,
            open = (!!tdQ && tdMode === 'tree') || tdOpenSet.has(id);
      html += `<tr class="td-l${Math.min(depth, 1)}${leaf ? '' : ' td-x'}${open ? ' is-open' : ''}" data-id="${tdEsc(id)}">`
        /* Смужка — частка рядка в спенді всієї таблиці: де йдуть гроші,
           видно без читання цифр. */
        + `<td style="padding-left:${10 + depth * 18}px"><span class="td-car">${leaf ? '' : '▸'}</span>${label(k, l)}`
        + `<div class="td-bar"><i style="width:${tdShare(tdSum(l).s)}%"></i></div></td>`
        + tdCells(tdSum(l)) + '</tr>';
      if (!leaf && open) walk(l, depth + 1, id);
    });
  };
  walk(rows, 0, '');
  return html;
}

/* ═══ КАЛЕНДАР: БУДЬ-ЯКИЙ МИНУЛИЙ ДЕНЬ ═══

   «кнопки TODAY YESTERDAY та інші видалимо. В модальному вікні STAT
   DAY туди додамо календар замість sync now».

   Сьогодні — живий знімок fb_ad_today: по оголошеннях, з лідами,
   воронками й креативами. Знімок ОДИН, і кожен Sync now його
   переписує, тож за вчора в ньому вже нічого немає. Минулий день
   лежить лише у fb_spend_daily — по кабінетах: спенд, покази, кліки.
   Тому за минулий день вікно показує рівно це, і каже про це прямо:
   порожні колонки лідів і депозитів на вчорашній даті читались би як
   «учора нічого не прийшло».

   День у fb_spend_daily — у поясі САМОГО кабінета, як його бачить
   Facebook; так само рахує й сторінка. */
let tdDate = '';                       // '' — сьогодні; інакше YYYY-MM-DD
let tdHist = { day: '', rows: [], err: '' };
const tdNow = () => tdDay(Date.now());
const tdShift = (d, n) => {
  const t = new Date(d + 'T12:00:00');   // полудень: перехід на літній час не зсуне дату
  t.setDate(t.getDate() + n);
  return tdDay(t.getTime());
};
const tdNice = d => {
  const t = new Date(d + 'T12:00:00');
  return isNaN(t) ? d : t.toLocaleDateString('en-GB',
    { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

async function tdHistLoad(day) {
  const out = { day, rows: [], err: '' };
  try {
    const raw = await sbFetchAll('fb_spend_daily', q => q.eq('day', day));
    out.rows = raw.filter(r => !r.team_name || r.team_name === currentTeam).map(r => {
      const acc = String(r.account_id || '').replace(/^act_/, '');
      const sp = Number(r.spend) || 0;
      /* У долари — тим самим курсом, що й сума на сторінці. Курсу
         немає — лишаємо як є: число без перерахунку чесніше за нуль. */
      const usd = typeof fxToUsd === 'function' ? fxToUsd(sp, r.currency) : sp;
      return { acc, cab: (tdMaps && tdMaps.cab.get(acc)) || '', br: (tdMaps && tdMaps.br.get(acc)) || '',
        s: usd == null ? sp : usd, im: Number(r.impressions) || 0, lc: Number(r.clicks) || 0,
        l: 0, i: 0, r: 0, d: 0 };
    }).filter(x => x.s > 0 || x.im > 0);
  } catch (e) {
    out.err = /does not exist|42P01|schema cache/i.test(e.message || '')
      ? 'the fb_spend_daily table is not set up yet — run its block from FB_SYNC.sql'
      : (e.message || 'error');
  }
  /* Поки чекали відповіді, могли вибрати інший день — чужу відповідь
     на екран не кладемо. */
  if (tdDate === day) tdHist = out;
}

/* Стан календаря в шапці: дата в полі, «далі» гасне на сьогодні,
   кнопка Today є лише тоді, коли ми не на сьогодні. Режими дерева й
   Expand all на минулому дні ховаються: там один рівень — кабінети. */
function tdCalPaint() {
  const ov = document.getElementById('td-ov');
  if (!ov) return;
  const today = tdNow(), inp = ov.querySelector('#td-date');
  inp.max = today;
  inp.value = tdDate || today;
  ov.querySelector('[data-d="1"]').disabled = !tdDate;
  ov.querySelector('.td-cal-now').classList.toggle('hidden', !tdDate);
  ov.querySelector('#td-mode').classList.toggle('is-off', !!tdDate);
  ov.querySelector('#td-exp').classList.toggle('is-off', !!tdDate);
  ov.querySelector('#td-sub').textContent = tdDate ? '· ' + tdNice(tdDate) : '· live from Facebook';
}

window.tdSetDate = async function (day) {
  const today = tdNow();
  day = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) && day < today ? day : '';
  tdDate = day;
  tdCalPaint();
  if (!day) { tdRender(); return; }
  document.getElementById('td-body').innerHTML = '<p class="td-empty">Loading…</p>';
  await tdHistLoad(day);
  if (tdDate === day) tdRender();
};

function tdRenderHist() {
  const box = document.getElementById('td-body');
  const day = tdDate;
  document.getElementById('td-when').innerHTML =
    'Cabinet totals for the day, as Facebook reported them';
  if (tdHist.day !== day) { box.innerHTML = '<p class="td-empty">Loading…</p>'; return; }
  if (tdHist.err) {
    document.getElementById('td-kpis').innerHTML = '';
    box.innerHTML = '<p class="td-empty">Could not read ' + tdEsc(tdNice(day)) + ': ' + tdEsc(tdHist.err) + '</p>';
    return;
  }
  const rows = tdHist.rows, t = tdSum(rows);
  const ctr = t.im > 0 ? (Math.round(t.lc / t.im * 10000) / 100) + '%' : '—';
  const hero = [
    [tdMoney(t.s), 'Spend · ' + tdEsc(tdNice(day))],
    [t.lc.toLocaleString('en-US'), 'Clicks · CPC ' + tdPer(t.s, t.lc)],
    [t.im.toLocaleString('en-US'), 'Impressions · CTR ' + ctr]
  ].map(([v, l]) => `<div class="td-hero"><div class="td-hv">${v}</div><div class="td-hl">${l}</div></div>`).join('');
  document.getElementById('td-kpis').innerHTML = '<div class="td-heroes">' + hero + '</div>'
    + '<div class="td-facts"><span>' + rows.length + ' cabinets</span>'
    + '<span class="td-note">Leads, funnels and creatives are kept for today only — '
    + 'earlier days hold cabinet totals. Clicks here are all clicks, not link clicks.</span></div>';
  if (!rows.length) {
    box.innerHTML = '<p class="td-empty">Nothing was spent on ' + tdEsc(tdNice(day))
      + ' — or the sync was not running that day.</p>';
    return;
  }
  const num = v => v > 0 ? v.toLocaleString('en-US') : '<span class="td-dim">—</span>';
  const cells = x => `<td>${tdMoney(x.s)}</td><td>${num(x.im)}</td>`
    + `<td>${x.im > 0 ? (Math.round(x.lc / x.im * 10000) / 100) + '%' : '<span class="td-dim">—</span>'}</td>`
    + `<td>${x.im > 0 ? tdMoney(x.s / x.im * 1000) : '<span class="td-dim">—</span>'}</td>`
    + `<td>${num(x.lc)}</td><td>${tdPer(x.s, x.lc)}</td>`;
  const share = s => (t.s > 0 ? Math.max(0, Math.min(100, Math.round(s / t.s * 1000) / 10)) : 0);
  box.innerHTML = '<table class="td-tbl td-hist"><thead><tr><th>Cabinet</th>'
    + ['Spend', 'Impr.', 'CTR', 'CPM', 'Clicks', 'CPC'].map(c => '<th>' + c + '</th>').join('')
    + '</tr></thead><tbody>'
    + rows.slice().sort((a, b) => b.s - a.s).map(x =>
        `<tr class="td-l1"><td style="padding-left:10px">${tdCab(x)}`
        + (x.cab ? ' <span class="td-dim">· ' + tdEsc(x.cab) + '</span>' : '')
        + `<div class="td-bar"><i style="width:${share(x.s)}%"></i></div></td>${cells(x)}</tr>`).join('')
    + '<tr class="td-tot"><td>Total</td>' + cells(t) + '</tr></tbody></table>';
}

/* ВИТРАТИ В АРХІВНИХ КАБІНЕТАХ. «чому в Today 681$, а в Stat. Day 671?»
   Архівні кабінети вікно не читає (знімок їх відсікає — див.
   cabSnapLoad), а сума на сторінці FB LIVE рахує сьогоднішній спенд по
   всіх кабінетах. Обидва числа правдиві, але різниця без пояснення
   читається як вада. Тому кажемо, скільки витрачено сьогодні в
   архівних і в яких — тим самим числом, що й FB LIVE (cabSpendToday). */
function tdArchNote() {
  if (typeof cabSnapArchIds !== 'function' || typeof cabSpendToday !== 'function'
      || typeof cabFb === 'undefined') return '';
  const arch = new Set(cabSnapArchIds());
  if (!arch.size) return '';
  const hit = (cabFb || []).filter(fb => arch.has(String(fb.account_id || '').replace(/\D/g, '')))
    .map(fb => ({ id: String(fb.account_id), name: String(fb.name || ''), v: Number(cabSpendToday(fb)) || 0,
                  cur: String(fb.currency || 'USD').toUpperCase() }))
    .filter(x => x.v > 0);
  if (!hit.length) return '';
  const usd = hit.reduce((a, x) => {
    const u = typeof fxToUsd === 'function' ? fxToUsd(x.v, x.cur) : (x.cur === 'USD' ? x.v : null);
    return a + (u == null ? 0 : u);
  }, 0);
  const list = hit.map(x => (x.name && x.name !== x.id ? x.name + ' ' : '') + x.id + ': ' + tdMoney(x.v)
    + (x.cur !== 'USD' ? ' ' + x.cur : '')).join('\n');
  return ' <span class="td-warn" title="' + tdEsc('Archived cabinets are not in this table, but they spent today:\n'
    + list + '\n\nThe total on the FB LIVE page includes them. Archived cabinets are not synced any more — '
    + 'if one is still running, take it out of the archive.') + '">· +' + tdMoney(usd) + ' in ' + hit.length
    + ' archived cabinet' + (hit.length > 1 ? 's' : '') + ' — not in this table</span>';
}

function tdRender() {
  const box = document.getElementById('td-body');
  if (!box) return;
  if (tdDate) { tdRenderHist(); return; }
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
        + ' — close this window and press Sync for today</span>')
    + (oldCabs ? ' <span class="td-dim" title="These cabinets were last synced on an earlier day;'
        + ' their old numbers are not counted">· ' + oldCabs + ' cabinet(s) not synced today — hidden</span>' : '')
    + tdArchNote();

  const t = tdSum(rows);
  const crs = new Set(rows.map(x => x.cr)), multi = [...crs]
    .filter(c => new Set(rows.filter(x => x.cr === c).map(x => x.acc)).size > 1).length;
  const unk = new Set(rows.filter(x => x.fnBad).map(x => x.fn)).size;
  /* ТРИ ВЕЛИКІ ЧИСЛА, РЕШТА — РЯДКОМ. Сім однакових плиток не казали,
     на що дивитись першим. Перше питання до дня — скільки витрачено, що
     за це прийшло і чи є депозити; кабінети, креативи й воронки — це
     вже довідка, і їй досить одного тихого рядка. */
  tdAvg = { ...t, sBy: {
    l: rows.filter(x => x.l > 0).reduce((a, x) => a + x.s, 0),
    i: rows.filter(x => x.i > 0).reduce((a, x) => a + x.s, 0) } };
  const convBig = t.l && t.i ? t.l + ' <span class="td-dim">L</span> · ' + t.i + ' <span class="td-dim">I</span>'
    : t.i ? String(t.i) : String(t.l);
  const convSub = t.l && t.i ? 'Leads ' + tdPer(t.s, t.l) + ' · Installs ' + tdPer(t.s, t.i)
    : t.i ? 'Installs · CPI ' + tdPer(t.s, t.i) : 'Leads · CPL ' + tdPer(t.s, t.l);
  const hero = [
    [tdMoney(t.s), 'Spend today', ''],
    [convBig, convSub, ''],
    [String(t.d), 'Deps · CPA ' + tdPer(t.s, t.d), t.d ? ' is-good' : '']
  ].map(([v, l, c]) => `<div class="td-hero${c}"><div class="td-hv">${v}</div><div class="td-hl">${l}</div></div>`).join('');
  const facts = [
    new Set(rows.map(x => x.acc)).size + ' cabinets',
    crs.size + ' creatives' + (multi ? ' <span class="td-tag">' + multi + ' in 2+ cabs</span>' : ''),
    new Set(rows.map(x => x.fn)).size + ' funnels'
      + (unk ? ' <span class="td-tag td-warn">⚠ ' + unk + ' unknown</span>' : ''),
    t.lc + ' clicks · CPC ' + tdPer(t.s, t.lc),
    t.r + ' regs · CPR ' + tdPer(t.s, t.r)
  ].map(x => '<span>' + x + '</span>').join('');
  document.getElementById('td-kpis').innerHTML =
    '<div class="td-heroes">' + hero + '</div><div class="td-facts">' + facts + '</div>';

  if (!rows.length) {
    box.innerHTML = '<p class="td-empty">Nothing spent today yet — or Sync now has not run today.</p>';
    return;
  }
  const head = tdMode === 'cre' ? 'Creative' : tdMode === 'fun' ? 'Funnel' : 'Geo › Cabinet › Funnel › Creative';
  const shown = tdQ ? rows.filter(x => tdHit(x, tdQ)) : rows;
  if (!shown.length) {
    box.innerHTML = '<p class="td-empty">Nothing matches \u201c' + tdEsc(tdQ) + '\u201d today.</p>';
    return;
  }
  const body = tdTree(shown, TD_VIEWS[tdMode]);
  /* Підсумок не фарбуємо: він і є середня, з якою порівнюють решту, а
     червоний Total читався б як «усе погано» там, де це просто сума. */
  const avg = tdAvg;
  tdAvg = null;
  const total = tdCells(tdQ ? tdSum(shown) : t);
  tdAvg = avg;
  box.innerHTML = '<table class="td-tbl"><thead><tr><th>' + head + '</th>'
    + TD_COLS.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>'
    + body
    + '<tr class="td-tot"><td>' + (tdQ ? 'Found \u00b7 ' + shown.length + ' of ' + rows.length + ' ads' : 'Total')
    + '</td>' + total + '</tr></tbody></table>';
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
      <h3 class="td-h">Stat. Day <span class="td-dim" id="td-sub">· live from Facebook</span></h3>
      <span id="td-when" class="td-when"></span>
      <input id="td-q" class="td-q" type="search" spellcheck="false" autocomplete="off"
        placeholder="Search: creative, cabinet, funnel, geo\u2026" aria-label="Search in Stat. Day">
      <div class="td-seg" id="td-mode">
        <button type="button" data-m="tree" class="is-on">Geo › Cabinet › Funnel › Creative</button>
        <button type="button" data-m="cre">Creatives</button>
        <button type="button" data-m="fun">Funnels</button>
      </div>
      <div class="td-seg" id="td-exp">
        <button type="button" data-e="1">Expand all</button><button type="button" data-e="0">Collapse</button>
      </div>
      <!-- Календар на місці кнопки Sync now. Синхронізація лишилась
           одна — головною кнопкою на сторінці; друга така сама у вікні
           лише питала «а котра з них справжня». Стрілки гортають по
           дню: «що було вчора» — це один клік, а не вибір дати. -->
      <div class="td-cal" id="td-cal">
        <button type="button" data-d="-1" title="Previous day" aria-label="Previous day">‹</button>
        <input type="date" id="td-date" aria-label="Day" title="Pick a day">
        <button type="button" data-d="1" title="Next day" aria-label="Next day">›</button>
        <button type="button" class="td-cal-now hidden" data-d="0" title="Back to today’s live numbers">Today</button>
      </div>
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
  ov.querySelector('#td-cal').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const n = Number(b.dataset.d);
    tdSetDate(n ? tdShift(tdDate || tdNow(), n) : '');
  });
  ov.querySelector('#td-date').addEventListener('change', e => tdSetDate(e.target.value));
  /* Клік будь-де по полю відкриває календар, а не ставить курсор у
     «день/місяць/рік»: сюди приходять вибрати день, а не друкувати. */
  ov.querySelector('#td-date').addEventListener('click', e => {
    try { e.target.showPicker(); } catch (err) { /* старий браузер — лишається рідна поведінка */ }
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
  ov.querySelector('#td-q').addEventListener('input', e => {
    tdQ = String(e.target.value || '').trim();
    tdRender();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || ov.classList.contains('hidden')) return;
    /* Esc спершу стирає пошук, і лише другим натиском закриває вікно:
       закрити все через те, що хотів скинути фільтр, — прикро. */
    const q = ov.querySelector('#td-q');
    if (tdQ && q) { q.value = ''; tdQ = ''; tdRender(); return; }
    tdToggle(false);
  });
  return ov;
}

window.tdToggle = async function (want) {
  const ov = tdEnsure();
  const open = want === undefined ? ov.classList.contains('hidden') : !!want;
  ov.classList.toggle('hidden', !open);
  document.getElementById('cab-today-btn')?.classList.toggle('is-on', open);
  if (!open) return;
  /* Відкривається завжди на сьогодні: вчорашня дата, лишена з минулого
     разу, показала б учорашні числа під кнопкою «Stat. Day». */
  tdDate = '';
  tdCalPaint();
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
