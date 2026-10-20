<script>
/* ══════════════════════════════════════════════════════════════════
   АСИСТЕНТ: ПИТАННЯ СЛОВАМИ

   ЩО ТУТ ГОЛОВНЕ — І ЧОМУ ЦЕ НЕ «СПИТАЙ У МОДЕЛІ».

   Модель НЕ рахує і не бачить жодного значення. Вона отримує питання
   й НАЗВИ стовпців, а віддає ПЛАН: що відфільтрувати, що згрупувати,
   що порахувати. Числа складає дашборд із тих рядків, які вже в
   нього є.

   Різниця не академічна. Модель, яку спитати «скільки ми залили на
   Pinco», назве ПРАВДОПОДІБНУ суму — і перевірити її можна лише
   порахувавши самому, тобто зробивши те, заради чого питали. План
   натомість видно очима: «сума Spend, де Status ≠ Decline» або
   сходиться з питанням, або ні. Тому на екрані завжди і число, і
   план, за яким воно вийшло.

   ЩО З ЦЬОГО ВИХОДИТЬ ЩЕ ОДНЕ: дані нікуди не їдуть. Файл, відкритий
   із комп'ютера, читається в браузері й лишається в ньому — так було
   задумано з самого початку (у вивантаженнях із партнерки їдуть
   sub-id, а часом і дані людей). Асистент цієї обіцянки не ламає: за
   межі браузера йдуть лише назви стовпців.

   ДЕ ВІН ПРАЦЮЄ. Над тим, що вже відкрите:
     • файл, відкритий у Таблицях (CSV/XLSX) — його рядки в пам'яті;
     • імпорт по днях (daily_stats) — те саме, на чому стоять KPI;
     • креативи (creatives_stats).
   Над Google-таблицею у рамці — НЕ працює, і це не недогляд: та
   таблиця живе в Google, ми лише вбудовуємо її сторінку й жодного
   рядка з неї не бачимо. Шлях для неї один — експортувати й відкрити
   файлом.
   ══════════════════════════════════════════════════════════════════ */

const AQ_OPS = ['eq', 'ne', 'contains', 'not_contains', 'gt', 'ge', 'lt', 'le', 'empty', 'not_empty'];
const AQ_MET = ['sum', 'count', 'avg', 'min', 'max', 'per'];
const AQ_LIMIT_MAX = 50;

let aqBusy = false, aqLast = null;

const aqEsc = v => String(v == null ? '' : v)
  .replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* ── ЯКИЙ СТОВПЕЦЬ ЧИМ Є ──

   Вид визначаємо по ДАНИХ, а не по назві: «Spend» буває текстом із
   валютою, а «ID» — числом, яке сумувати безглуздо. Дивимось на перші
   кількасот рядків: якщо більшість непорожніх значень читаються як
   число — стовпець числовий.

   Назва тут не аргумент саме тому, що вона приїхала з чужого файлу. */
const AQ_PEEK = 400;

function aqKind(rows, key) {
  let num = 0, all = 0;
  for (let i = 0; i < rows.length && i < AQ_PEEK; i++) {
    const v = rows[i][key];
    if (v == null || String(v).trim() === '') continue;
    all++;
    if (Number.isFinite(aqNum(v))) num++;
  }
  if (!all) return 'text';
  return num * 2 >= all ? 'num' : 'text';
}

/* Число з комірки. Той самий здоровий глузд, що в підсумку виділення:
   пробіли й валюта — не цифри, дужки — мінус, кома може бути як
   групуванням, так і дробом. Для файлу, відкритого в Таблицях,
   парсер беремо ЇХНІЙ (він вирішує по стовпчику цілком, а не по
   комірці) — там це вже зроблено краще. */
function aqNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let t = String(v == null ? '' : v).trim();
  if (!t) return NaN;
  const paren = /^\(.*\)$/.test(t);
  t = t.replace(/[\s  ]/g, '').replace(/[^0-9.,-]/g, '');
  if (!t || !/\d/.test(t)) return NaN;
  const lastC = t.lastIndexOf(','), lastD = t.lastIndexOf('.');
  if (lastC > lastD) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? (paren ? -n : n) : NaN;
}

function aqColsOf(rows) {
  const keys = new Set();
  for (let i = 0; i < rows.length && i < 20; i++) Object.keys(rows[i] || {}).forEach(k => keys.add(k));
  return [...keys]
    // Технічні поля не показуємо й у план не пускаємо: питання про id
    // рядка або про team_name ніхто не ставить.
    .filter(k => !/^(id|team_name|created_by|created_at|updated_at)$/i.test(k) && !k.startsWith('_'))
    .map(name => ({ name, kind: aqKind(rows, name) }));
}

/* ── НАБОРИ, ЯКІ ЗАРАЗ ВІДКРИТІ ──
   Саме «відкриті», а не «усі, що є в базі»: асистент відповідає по
   тому, що вже завантажено на сторінку. Інакше питання тягнуло б за
   собою запит, якого людина не просила, і відповідь залежала б від
   того, чи встиг він приїхати. */
function aqSets() {
  const out = [];
  try {
    const sh = typeof shDataset === 'function' ? shDataset() : null;
    if (sh && sh.rows.length) out.push(sh);
  } catch (e) { /* файл не відкритий */ }
  try {
    if (typeof rawData !== 'undefined' && Array.isArray(rawData) && rawData.length)
      out.push({ id: 'daily', title: 'Імпорт по днях (daily_stats)',
                 cols: aqColsOf(rawData), rows: rawData });
  } catch (e) { /* сторінка ще не завантажила дані */ }
  const cr = (window.creativesRawData || []);
  if (cr.length) out.push({ id: 'creatives', title: 'Креативи (creatives_stats)',
                            cols: aqColsOf(cr), rows: cr });
  return out;
}

async function aqCall(body) {
  const { data: sess } = await sb.auth.getSession();
  const token = sess && sess.session && sess.session.access_token;
  if (!token) throw new Error('not signed in');
  const res = await fetch(SUPABASE_URL + '/functions/v1/ai', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY,
               'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 404) throw Object.assign(new Error('not deployed'), { code: 'missing' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
  return j;
}

/* ── ПЕРЕВІРКА ПЛАНУ ──

   Межа стоїть тут, а не у функції: саме тут відомо, які стовпці
   справді існують. План, що посилається на стовпець, якого немає, —
   не привід показати нуль: це привід сказати, чого бракує, і
   перелічити те, що є.

   Жодного eval: план — це дані, а не код. Усе, чого в білому списку
   немає, відкидається. */
function aqCheck(plan, sets) {
  if (!plan || typeof plan !== 'object') return { err: 'модель відповіла не планом' };
  if (plan.error) return { err: String(plan.error) };

  const set = sets.find(s => s.id === plan.set) || (sets.length === 1 ? sets[0] : null);
  if (!set) return { err: 'не зрозуміло, про який набір даних питання' };
  const names = set.cols.map(c => c.name);
  const has = n => names.includes(n);
  const bad = n => ({ err: 'у «' + set.title + '» немає стовпця «' + n + '». Є: '
    + names.slice(0, 24).join(', ') + (names.length > 24 ? ' …' : '') });

  const where = (Array.isArray(plan.where) ? plan.where : []).slice(0, 8).map(w => ({
    col: String(w && w.col || ''), op: String(w && w.op || 'eq'),
    val: w && w.val != null ? String(w.val) : ''
  }));
  for (const w of where) {
    if (!has(w.col)) return bad(w.col);
    if (!AQ_OPS.includes(w.op)) return { err: 'невідома умова «' + w.op + '»' };
  }

  const group = plan.group ? String(plan.group) : '';
  if (group && !has(group)) return bad(group);

  const m = plan.metric || {};
  const op = String(m.op || 'count');
  if (!AQ_MET.includes(op)) return { err: 'невідомий підрахунок «' + op + '»' };
  const met = { op };
  if (op === 'per') {
    met.num = String(m.num || ''); met.den = String(m.den || '');
    if (!has(met.num)) return bad(met.num);
    if (!has(met.den)) return bad(met.den);
  } else if (op !== 'count') {
    met.col = String(m.col || '');
    if (!has(met.col)) return bad(met.col);
  }

  const limit = Math.min(AQ_LIMIT_MAX, Math.max(1, Number(plan.limit) || 10));
  return { spec: { set: set.id, where, group, metric: met,
                   sort: plan.sort === 'asc' ? 'asc' : 'desc', limit,
                   say: String(plan.say || '').slice(0, 300) }, set };
}

/* ── ПІДРАХУНОК. ТУТ І ТІЛЬКИ ТУТ ── */
function aqNumOf(set, col, v) {
  // У файлі Таблиць парсер свій — він вирішує по стовпчику цілком.
  if (set.num) { const x = set.num(col, v); if (x != null) return x; }
  return aqNum(v);
}

function aqKeep(set, row, where) {
  return where.every(w => {
    const raw = row[w.col];
    const s = String(raw == null ? '' : raw).trim();
    const sl = s.toLowerCase(), vl = String(w.val || '').trim().toLowerCase();
    switch (w.op) {
      case 'empty': return !s;
      case 'not_empty': return !!s;
      case 'contains': return sl.includes(vl);
      case 'not_contains': return !sl.includes(vl);
      case 'eq': return sl === vl;
      case 'ne': return sl !== vl;
      default: {
        /* Порівняння чисел — числами. Рядкове «9» > «10» дало б
           відповідь, яка виглядає як відповідь. */
        const a = aqNumOf(set, w.col, raw), b = aqNum(w.val);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
        return w.op === 'gt' ? a > b : w.op === 'ge' ? a >= b
             : w.op === 'lt' ? a < b : a <= b;
      }
    }
  });
}

function aqAgg(set, rows, met) {
  if (met.op === 'count') return { v: rows.length, n: rows.length };
  if (met.op === 'per') {
    /* Ціна події — це сума/сума, а не середнє з рядкових часток.
       Середнє по рядках дало б вагу рядку з одним депозитом таку ж, як
       рядку з сотнею: число вийшло б завжди й завжди неправильне. */
    let num = 0, den = 0, n = 0;
    rows.forEach(r => {
      const a = aqNumOf(set, met.num, r[met.num]), b = aqNumOf(set, met.den, r[met.den]);
      if (Number.isFinite(a)) num += a;
      if (Number.isFinite(b)) den += b;
      if (Number.isFinite(a) || Number.isFinite(b)) n++;
    });
    return { v: den ? num / den : null, n, num, den };
  }
  const vals = [];
  rows.forEach(r => { const x = aqNumOf(set, met.col, r[met.col]); if (Number.isFinite(x)) vals.push(x); });
  if (!vals.length) return { v: null, n: 0 };
  if (met.op === 'sum') return { v: vals.reduce((a, b) => a + b, 0), n: vals.length };
  if (met.op === 'avg') return { v: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length };
  if (met.op === 'min') return { v: Math.min(...vals), n: vals.length };
  return { v: Math.max(...vals), n: vals.length };
}

function aqRun(spec, set) {
  const rows = set.rows.filter(r => aqKeep(set, r, spec.where));
  if (!spec.group) return { rows: rows.length, total: set.rows.length, one: aqAgg(set, rows, spec.metric) };

  const by = new Map();
  rows.forEach(r => {
    const k = String(r[spec.group] == null || r[spec.group] === '' ? '—' : r[spec.group]);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  });
  const list = [...by.entries()].map(([k, rs]) => ({ k, ...aqAgg(set, rs, spec.metric), rows: rs.length }));
  /* Групи без значення — в хвіст, а не в початок: «найдешевший CPA»
     при сортуванні за зростанням інакше завжди вертав би групу, де
     депозитів нема зовсім, тобто де ціни немає. */
  list.sort((a, b) => {
    if (a.v == null && b.v == null) return 0;
    if (a.v == null) return 1;
    if (b.v == null) return -1;
    return spec.sort === 'asc' ? a.v - b.v : b.v - a.v;
  });
  return { rows: rows.length, total: set.rows.length, list: list.slice(0, spec.limit),
           groups: list.length };
}

/* ── ПЛАН СЛОВАМИ. Нашими, а не моделі: на екрані мусить стояти те,
      що ми СПРАВДІ зробили. ── */
const AQ_OP_UA = { eq: '=', ne: '≠', contains: 'містить', not_contains: 'не містить',
                   gt: '>', ge: '≥', lt: '<', le: '≤', empty: 'порожнє', not_empty: 'не порожнє' };
const AQ_MET_UA = { sum: 'сума', count: 'кількість рядків', avg: 'середнє',
                    min: 'мінімум', max: 'максимум', per: 'на одну подію' };

function aqPlanWords(spec, set) {
  const m = spec.metric;
  const what = m.op === 'count' ? 'кількість рядків'
    : m.op === 'per' ? `${m.num} / ${m.den} (сума на суму)`
    : `${AQ_MET_UA[m.op]} ${m.col}`;
  const bits = [what, 'у «' + set.title + '»'];
  if (spec.where.length) bits.push('де ' + spec.where.map(w =>
    `${w.col} ${AQ_OP_UA[w.op]}${['empty', 'not_empty'].includes(w.op) ? '' : ' ' + w.val}`).join(' і '));
  if (spec.group) bits.push('по ' + spec.group
    + (spec.sort === 'asc' ? ', знизу вгору' : ', згори вниз'));
  return bits.join(', ');
}

/* Копійки не ховаємо за розміром числа. Перша версія округляла все,
   що більше тисячі, до цілого — і сума 1600.50 показувалась як 1601,
   тобто вже не те число, яке лежить у даних. Два знаки максимум:
   більше — це вже наше округлення, а не їхні дані. */
const aqFmt = v => v == null ? '—'
  : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

/* ── ВІКНО ── */
window.aqOpen = function (q) {
  const box = document.getElementById('aq-modal');
  if (!box) return;
  box.classList.remove('hidden');
  aqPaintSets();
  const inp = document.getElementById('aq-q');
  if (inp) { if (q) inp.value = q; inp.focus(); }
};
window.aqClose = function () { document.getElementById('aq-modal')?.classList.add('hidden'); };

function aqPaintSets() {
  const el = document.getElementById('aq-sets');
  const sub = document.getElementById('aq-sub');
  if (!el) return;
  const sets = aqSets();
  if (sub) sub.textContent = sets.length
    ? sets.length + ' набір(ів) відкрито'
    : 'немає відкритих даних';
  if (!sets.length) {
    el.innerHTML = `<p class="aq-note">Немає чого питати: відкрий файл у Таблицях або зайди на
      дашборд, щоб підтягнулась статистика.<br>
      <span class="opacity-70">Google-таблицю в рамці асистент не бачить — вона живе в Google,
      ми лише вбудовуємо її сторінку. Експортуй і відкрий файлом.</span></p>`;
    return;
  }
  el.innerHTML = sets.map(s => `<span class="aq-set"><b>${aqEsc(s.title)}</b>
      <span>${s.rows.length} рядк. · ${s.cols.length} стовпц.</span></span>`).join('');
}

window.aqAsk = async function () {
  if (aqBusy) return;
  const q = (document.getElementById('aq-q')?.value || '').trim();
  const out = document.getElementById('aq-out');
  if (!q || !out) return;
  const sets = aqSets();
  if (!sets.length) { aqPaintSets(); return; }

  aqBusy = true;
  document.getElementById('aq-go')?.setAttribute('disabled', 'disabled');
  out.innerHTML = '<p class="aq-note">Думає…</p>';
  let j;
  try {
    j = await aqCall({ action: 'plan', q,
      sets: sets.map(s => ({ id: s.id, title: s.title, rows: s.rows.length,
                             cols: s.cols.map(c => ({ name: c.name, kind: c.kind })) })) });
  } catch (e) {
    const net = /failed to fetch|networkerror|load failed/i.test(e.message || '');
    out.innerHTML = `<p class="aq-note is-bad">${(e.code === 'missing' || net)
      ? 'Функція ai не відповіла — спершу розгорни її: <span class="font-mono">supabase functions deploy ai</span>'
      : aqEsc(e.message)}</p>`;
    aqBusy = false;
    document.getElementById('aq-go')?.removeAttribute('disabled');
    return;
  }
  aqBusy = false;
  document.getElementById('aq-go')?.removeAttribute('disabled');

  let plan = null;
  try {
    const raw = String(j.plan_raw || '');
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) plan = JSON.parse(raw.slice(a, b + 1));
  } catch (e) { /* нижче скажемо, що плану немає */ }

  const got = aqCheck(plan, sets);
  if (got.err) {
    out.innerHTML = `<p class="aq-note is-bad">${aqEsc(got.err)}</p>`
      + `<p class="aq-cost">${aqEsc(j.model || '')} · ~$${(j.cost_usd || 0).toFixed(5)}</p>`;
    return;
  }

  const { spec, set } = got;
  const res = aqRun(spec, set);
  aqLast = { spec, set: set.id, res };

  const head = `<p class="aq-plan"><b>Порахував:</b> ${aqEsc(aqPlanWords(spec, set))}</p>`
    + `<p class="aq-rows">${res.rows} рядк. зі ${res.total}${
        spec.group ? ' · груп: ' + res.groups : ''}</p>`
    + (spec.say ? `<p class="aq-say">Як я зрозумів питання: ${aqEsc(spec.say)}</p>` : '');

  /* Фільтр, який не знайшов нічого, — найчастіша причина нуля, і
     майже завжди це написання значення. Тому показуємо, ЩО справді
     лежить у тому стовпці: локально, нікуди не відправляючи. */
  let hint = '';
  if (!res.rows && spec.where.length) {
    const w = spec.where.find(x => !['empty', 'not_empty'].includes(x.op)) || spec.where[0];
    const vals = [...new Set(set.rows.slice(0, 2000)
      .map(r => String(r[w.col] == null ? '' : r[w.col]).trim()).filter(Boolean))].slice(0, 12);
    hint = `<p class="aq-note">Під умову не підійшов жоден рядок. У стовпці
      <b>${aqEsc(w.col)}</b> зустрічається: ${vals.map(v => `<span class="aq-v">${aqEsc(v)}</span>`).join(' ')
      }${vals.length === 12 ? ' …' : ''}</p>`;
  }

  const body = spec.group
    ? `<table class="aq-tbl"><thead><tr><th>${aqEsc(spec.group)}</th><th>${
        aqEsc(spec.metric.op === 'count' ? 'рядків' : spec.metric.op === 'per'
          ? spec.metric.num + '/' + spec.metric.den : spec.metric.col)}</th><th>рядків</th></tr></thead>
       <tbody>${res.list.map(r => `<tr><td>${aqEsc(r.k)}</td><td class="aq-n">${
         aqFmt(r.v)}</td><td class="aq-n aq-dim">${r.rows}</td></tr>`).join('')}</tbody></table>`
    : `<p class="aq-big">${aqFmt(res.one.v)}</p>`
      + (spec.metric.op === 'per'
          ? `<p class="aq-rows">${aqEsc(spec.metric.num)} ${aqFmt(res.one.num)} / ${
              aqEsc(spec.metric.den)} ${aqFmt(res.one.den)}</p>` : '');

  out.innerHTML = head + hint + (res.rows ? body : '')
    + `<p class="aq-cost">Числа порахував дашборд із відкритих рядків — модель склала лише план.
        ${aqEsc(j.model || '')} · ~$${(j.cost_usd || 0).toFixed(5)}${
        j.left_today != null ? ' · лишилось сьогодні: ' + j.left_today : ''}</p>`;
};
</script>
