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
// Скільки показників показуємо поруч. Більше — це вже не відповідь на
// питання, а вивантаження таблиці.
const AQ_MET_MAX = 6;

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

/* ДЕНЬ — ЦЕ НЕ ЧИСЛО Й НЕ ТЕКСТ.

   «2026-10-15» не парситься як число (два дефіси), тож досі такий
   стовпець рахувався текстом — а текст порівнюють лише на «дорівнює»
   і «містить». Питання «за останній тиждень» не мало де взятись.

   ISO-день тим і зручний, що як РЯДОК він сортується правильно:
   '2026-10-09' < '2026-10-15'. Тому окремого типу даних тут не
   заводимо — досить знати, що стовпець денний. */
const aqIsDay = v => /^\d{4}-\d{2}-\d{2}/.test(String(v == null ? '' : v).trim());

function aqKind(rows, key) {
  let num = 0, day = 0, all = 0;
  for (let i = 0; i < rows.length && i < AQ_PEEK; i++) {
    const v = rows[i][key];
    if (v == null || String(v).trim() === '') continue;
    all++;
    if (aqIsDay(v)) day++;
    else if (Number.isFinite(aqNum(v))) num++;
  }
  if (!all) return 'text';
  if (day * 2 >= all) return 'date';
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
  /* ДРУГИЙ РІВЕНЬ. «Яка воронка найкраще працювала по днях» — це два
     розрізи одночасно, і одним їх не підміниш: по днях без воронки
     видно тільки підсумок дня, по воронках без днів — тільки підсумок
     за весь період, а питали про перетин. Другий рівень без першого
     не існує, і сам по собі він той самий перший. */
  const group2 = plan.group2 && group && String(plan.group2) !== group ? String(plan.group2) : '';
  if (group2 && !has(group2)) return bad(group2);

  /* Один показник був замалою мовою. «Яке крео найкраще, РОЗПИШИ
     ЙОГО ДАНІ» — це не одне число, а картка: скільки витрачено,
     скільки депів, по чому вийшов депозит. Модель це й зрозуміла
     (вона так і написала в «say»), але сказати плану не могла — там
     було місце рівно на одну цифру. Тому показників тепер набір;
     перший лишається тим, ЗА ЧИМ сортуємо, решта просто показуються. */
  const metOf = raw => {
    const o = String((raw || {}).op || 'count');
    if (!AQ_MET.includes(o)) return { err: 'невідомий підрахунок «' + o + '»' };
    const out = { op: o };
    if (o === 'per') {
      out.num = String(raw.num || ''); out.den = String(raw.den || '');
      if (!has(out.num)) return bad(out.num);
      if (!has(out.den)) return bad(out.den);
    } else if (o !== 'count') {
      out.col = String(raw.col || '');
      if (!has(out.col)) return bad(out.col);
    }
    return { met: out };
  };

  const first = metOf(plan.metric || {});
  if (first.err) return first;
  const met = first.met;

  const more = [];
  for (const raw of (Array.isArray(plan.metrics) ? plan.metrics : []).slice(0, AQ_MET_MAX)) {
    const r = metOf(raw);
    if (r.err) return r;
    // Той самий показник двічі — просто зайвий стовпчик.
    if (!more.some(x => JSON.stringify(x) === JSON.stringify(r.met))
        && JSON.stringify(r.met) !== JSON.stringify(met)) more.push(r.met);
  }

  /* ПОРІГ НА ГРУПУ, А НЕ НА РЯДОК. «Найдешевший депозит, але не менше
     десяти депів» через where не виразити: where ріже РЯДКИ, а десять
     депів — це сума групи. Без цього «найкраще» завжди вигравало те,
     де даних майже немає: вісім рядків і один депозит. */
  let having = null;
  if (plan.having && plan.having.col) {
    const col = String(plan.having.col);
    if (!has(col)) return bad(col);
    const hop = String(plan.having.op || 'ge');
    if (!['ge', 'gt', 'le', 'lt'].includes(hop))
      return { err: 'невідомий поріг «' + hop + '»' };
    const val = aqNum(plan.having.val);
    if (Number.isFinite(val)) having = { col, op: hop, val };
  }

  const limit = Math.min(AQ_LIMIT_MAX, Math.max(1, Number(plan.limit) || 10));
  return { spec: { set: set.id, where, group, group2, metric: met, metrics: more, having,
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
        /* ДЕНЬ ПОРІВНЮЄМО ЯК ДЕНЬ. ISO-рядок сортується правильно сам,
           а числом він не читається взагалі — отже «з 14 жовтня»
           мовчки не знаходило б нічого. Беремо лише перші 10 знаків:
           у стовпці трапляється і «2026-10-15 03:40». */
        if (aqIsDay(s) && aqIsDay(w.val)) {
          const a = s.slice(0, 10), b = String(w.val).trim().slice(0, 10);
          return w.op === 'gt' ? a > b : w.op === 'ge' ? a >= b
               : w.op === 'lt' ? a < b : a <= b;
        }
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

  /* Ключ групи — одна або дві частини. Складаємо їх через \u0000:
     у даних цього знака немає, а будь-який видимий роздільник
     («·», «|») колись трапиться всередині самої назви лендінга, і дві
     різні групи злипнуться в одну. */
  const cell = (r, col) => String(r[col] == null || r[col] === '' ? '—' : r[col]);
  const by = new Map();
  rows.forEach(r => {
    const k = cell(r, spec.group) + (spec.group2 ? '\u0000' + cell(r, spec.group2) : '');
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  });
  let list = [...by.entries()].map(([k, rs]) => {
    const p = k.split('\u0000');
    return { k: p[0], k2: p[1] || '', ...aqAgg(set, rs, spec.metric), rows: rs.length,
             /* Решта показників — поруч, тими самими правилами. Саме
                вони й роблять із рядка таблиці картку: скільки
                витрачено, скільки депів, по чому вийшов депозит. */
             more: (spec.metrics || []).map(m => aqAgg(set, rs, m)) };
  });

  /* Поріг рахуємо по СУМІ групи — те, чого не вміє where. Групу без
     значення не судимо порогом: вона й так піде в хвіст. */
  if (spec.having) {
    const h = spec.having;
    list = list.filter(g => {
      const rs = by.get(g.k + (spec.group2 ? '\u0000' + g.k2 : ''));
      let sum = 0;
      (rs || []).forEach(r => { const x = aqNumOf(set, h.col, r[h.col]); if (Number.isFinite(x)) sum += x; });
      return h.op === 'ge' ? sum >= h.val : h.op === 'gt' ? sum > h.val
           : h.op === 'le' ? sum <= h.val : sum < h.val;
    });
  }
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

/* Підпис показника — те саме, що й у заголовку стовпця. Один рядок на
   два місця: інакше картка й таблиця називали б те саме по-різному. */
function aqMetName(m) {
  return m.op === 'count' ? 'рядків'
       : m.op === 'per' ? m.num + ' / ' + m.den
       : (AQ_MET_UA[m.op] || m.op) + ' ' + m.col;
}

/* ── ПЛАН СЛОВАМИ. Нашими, а не моделі: на екрані мусить стояти те,
      що ми СПРАВДІ зробили. ── */
const AQ_OP_UA = { eq: '=', ne: '≠', contains: 'містить', not_contains: 'не містить',
  /* Для дня «≥» читається як «з такого-то», і це саме те, що людина
     питала. Але підміняти знак словом не можна: стовпець може бути й
     числовим, і тоді «з 150» — нісенітниця. Тому лишаємо знак, а
     словами пояснює сам рядок плану. */
                   gt: '>', ge: '≥', lt: '<', le: '≤', empty: 'порожнє', not_empty: 'не порожнє' };
const AQ_MET_UA = { sum: 'сума', count: 'кількість рядків', avg: 'середнє',
                    min: 'мінімум', max: 'максимум', per: 'на одну подію' };

function aqPlanWords(spec, set) {
  const m = spec.metric;
  const what = m.op === 'count' ? 'кількість рядків'
    : m.op === 'per' ? `${m.num} / ${m.den} (сума на суму)`
    : `${AQ_MET_UA[m.op]} ${m.col}`;
  /* Назву набору сюди більше не пишемо: вона стоїть списком у шапці
     вікна, і повторювати її в кожному рядку плану — рівно те зайве,
     від якого ми й ішли. */
  const bits = [what];
  if (spec.where.length) bits.push('де ' + spec.where.map(w =>
    `${w.col} ${AQ_OP_UA[w.op]}${['empty', 'not_empty'].includes(w.op) ? '' : ' ' + w.val}`).join(' і '));
  if (spec.group) bits.push('по ' + spec.group + (spec.group2 ? ' × ' + spec.group2 : '')
    + (spec.sort === 'asc' ? ', знизу вгору' : ', згори вниз'));
  /* Поріг мусить бути в плані словами: він ВИКИДАЄ групи, і мовчазний
     відсів виглядає як «цього креатива просто немає». */
  if (spec.having) bits.push('лише де сума ' + spec.having.col + ' '
    + (AQ_OP_UA[spec.having.op] || spec.having.op) + ' ' + spec.having.val);
  if ((spec.metrics || []).length)
    bits.push('поруч: ' + spec.metrics.map(aqMetName).join(', '));
  return bits.join(', ');
}

/* Копійки не ховаємо за розміром числа. Перша версія округляла все,
   що більше тисячі, до цілого — і сума 1600.50 показувалась як 1601,
   тобто вже не те число, яке лежить у даних. Два знаки максимум:
   більше — це вже наше округлення, а не їхні дані. */
const aqFmt = v => v == null ? '—'
  : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

/* ═══════════ ЩО В СТОВПЦІ — БЕЗ МОДЕЛІ ═══════════

   Модель НЕ бачить значень — і це умова, а не вада: у вивантаженнях
   лежать sub-id, а часом і дані людей. Тому на питання «що тут
   лежить» вона відповідає тим, що має — структурою.

   Але дашборд значення бачить: вони в нього й завантажені. Тож
   відповідь складає САМ — локально, без запиту й без копійки витрат.
   Окремої кнопки під це немає й не треба: стовпці стоять у стрічці
   чипами, і клік по чипу й є те питання. Для чисел: скільки
   заповнено, межі й сума. Для тексту: які значення справді
   зустрічаються — саме їх і треба знати, щоб написати умову
   («Decline» чи «declined»?).

   Порожнє — це «—», а не нуль: стовпець, де числа немає, і стовпець,
   де воно нуль, — різні речі. */
const AQ_PEEK_VALS = 8;      // скільки різних значень показуємо
const AQ_PEEK_ROWS = 4000;   // скільки рядків читаємо на огляд

function aqPeekCol(set, col) {
  const rows = set.rows.slice(0, AQ_PEEK_ROWS);
  let filled = 0, n = 0, sum = 0, min = null, max = null;
  const freq = new Map();
  rows.forEach(r => {
    const raw = r[col.name];
    const t = String(raw == null ? '' : raw).trim();
    if (!t) return;
    filled++;
    if (col.kind === 'num') {
      const x = aqNumOf(set, col.name, raw);
      if (x == null) return;
      n++; sum += x;
      if (min == null || x < min) min = x;
      if (max == null || x > max) max = x;
    } else {
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  });
  const vals = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  return { filled, seen: rows.length, n, sum, min, max,
           uniq: freq.size, top: vals.slice(0, AQ_PEEK_VALS).map(v => v[0]) };
}


/* ══════════════ ЧАТ ══════════════

   Стрічка повідомлень, а не один екран, що перемальовується: друге
   питання майже завжди уточнює перше, і забрати попереднє число
   означає забрати те, з чим його порівнюють.

   Під кожною відповіддю один муторний рядок — план і ціна. Доти на
   екрані стояло п'ять абзаців службового тексту на одне число. Те, що
   треба бачити ЩОРАЗУ, — це число й план; решта (приватність, звідки
   беруться набори) сказана один раз і стоїть собі внизу. */
let aqSetId = '';          // який набір питаємо
let aqGreeted = '';        // для якого набору вже показали стовпці

function aqSetNow() {
  const sets = aqSets();
  return sets.find(s => s.id === aqSetId) || sets[0] || null;
}

const aqThread = () => document.getElementById('aq-thread');

/* Нове знизу, і прокрутка туди ж: відповідь, якої не видно без
   прокрутки, читається як відсутність відповіді. */
function aqPush(cls, html) {
  const box = aqThread();
  if (!box) return null;
  const el = document.createElement('div');
  el.className = 'aq-msg ' + cls;
  el.innerHTML = html;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}

/* Поле росте під текст — до межі, після якої починає прокручуватись
   саме. Тягнути за ріжок теж можна: resize лишається вертикальним. */
window.aqGrow = function (el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(180, Math.max(38, el.scrollHeight)) + 'px';
};

/* ── СТОВПЦІ ЧИПАМИ ──

   ДВІ ДІЇ НА ОДИН ЧИП, і це той самий поділ, що в силках PWA: часте —
   на самому чипі, рідкісне — окремою кнопкою поряд.

     клік по назві  → вставити її В ПИТАННЯ. Назви в вивантаженнях
                      довгі й з пробілами («Sub ID 5»), і набирати їх
                      руками означає помилятись на регістрі й пробілі —
                      а план із неіснуючим стовпцем просто відмовить;
     клік по «?»    → що в цьому стовпці (межі, значення), локально.

   Назва їде в АТРИБУТІ, а не в onclick: у заголовках вивантажень
   трапляються і лапки, і апострофи, і зібраний рядком виклик на них
   ламається. */
function aqChips(set) {
  return set.cols.map((c, i) => `<span class="aq-chip${c.kind === 'num' ? ' is-num' : ''}">
    <button type="button" class="aq-chip-n" data-c="${i}" onclick="aqPut(this)"
      title="Вставити «${aqEsc(c.name)}» у питання">${aqEsc(c.name)}</button>
    <button type="button" class="aq-chip-i" data-c="${i}" onclick="aqCol(this)"
      title="Що лежить у цьому стовпці">?</button>
  </span>`).join('');
}

/* Вставляємо В МІСЦЕ КУРСОРА, а не в кінець: питання набирають
   посередині («сума ___ без Decline»), і дописування в хвіст змусило б
   переставляти слова руками. У лапках — щоб назва з пробілами читалась
   як одне ціле і моделлю, і очима. */
window.aqPut = function (btn) {
  const set = aqSetNow();
  const inp = document.getElementById('aq-q');
  if (!set || !inp) return;
  const c = set.cols[Number(btn.getAttribute('data-c'))];
  if (!c) return;
  const txt = '«' + c.name + '»';
  const a = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
  const b = inp.selectionEnd == null ? a : inp.selectionEnd;
  const before = inp.value.slice(0, a), after = inp.value.slice(b);
  // Пробіл ставимо лише там, де його бракує: подвійний виглядає як огріх.
  const sep = before && !/\s$/.test(before) ? ' ' : '';
  inp.value = before + sep + txt + (after && !/^\s/.test(after) ? ' ' : '') + after;
  const pos = (before + sep + txt).length;
  inp.focus();
  try { inp.setSelectionRange(pos, pos); } catch (e) { /* старий браузер */ }
  aqGrow(inp);
};

window.aqCol = function (btn) {
  const set = aqSetNow();
  if (!set) return;
  const c = set.cols[Number(btn.getAttribute('data-c'))];
  if (!c) return;
  const i = aqPeekCol(set, c);
  const what = c.kind === 'num'
    ? (i.n ? `від <b>${aqFmt(i.min)}</b> до <b>${aqFmt(i.max)}</b> · сума <b>${aqFmt(i.sum)}</b>`
           : 'чисел не знайшлось')
    : (i.top.length
        ? i.top.map(v => `<span class="aq-v">${aqEsc(v)}</span>`).join(' ')
          + (i.uniq > i.top.length ? ` <span class="aq-dim">+${i.uniq - i.top.length} інших</span>` : '')
        : '—');
  aqPush('is-bot', `<p class="aq-h">${aqEsc(c.name)} <span class="aq-dim">· ${
      c.kind === 'num' ? 'число' : c.kind === 'date' ? 'дата' : 'текст'} · заповнено ${i.filled}${
      i.seen < set.rows.length ? ' з ' + i.seen + ' прочитаних' : ''}</span></p>
    <p class="aq-val">${what}</p>
    <p class="aq-meta">порахував дашборд, модель не питали</p>`);
};

/* ═══════════ ЗБЕРЕЖЕНІ ПИТАННЯ ═══════════

   Питання повторюються: «спенд за вчора по гео» питають щодня, і
   щодня набирають заново. Збережене стає кнопкою над полем — один
   клік замість рядка тексту.

   У БРАУЗЕРІ, А НЕ В БАЗІ: це звички одного чоловіка за одним
   комп'ютером, як і закріплене в меню PWA. Ключ із назвою команди —
   щоб два проєкти в одному браузері не перемішали свої кнопки. */
const AQ_SAVE_MAX = 12;
const aqSaveKey = () => 'aq_saved:' + (typeof currentTeam === 'string' ? currentTeam : '');
let aqSaved = null, aqLastQ = '';

function aqSavedGet() {
  if (aqSaved) return aqSaved;
  aqSaved = [];
  try {
    const raw = JSON.parse(localStorage.getItem(aqSaveKey()) || '[]');
    if (Array.isArray(raw)) aqSaved = raw
      .map(x => ({ name: String(x && x.name || '').slice(0, 40),
                   q: String(x && x.q || '').slice(0, 400) }))
      .filter(x => x.q);
  } catch (e) { /* приватний режим або зламаний JSON */ }
  return aqSaved;
}

function aqSavedPut() {
  try { localStorage.setItem(aqSaveKey(), JSON.stringify(aqSaved)); }
  catch (e) {
    if (typeof toast === 'function')
      toast('Кнопка не збереглась: браузер не дає писати в localStorage. '
          + 'До перезавантаження вона працює.', 'error', 8000);
  }
}

window.aqSave = async function () {
  const inp = document.getElementById('aq-q');
  /* Зберігаємо те, що в полі, а якщо воно порожнє — останнє спитане:
     кнопку найчастіше хочуть саме після того, як відповідь сподобалась. */
  const q = String((inp && inp.value) || aqLastQ || '').trim();
  if (!q) {
    if (typeof toast === 'function') toast('Спершу спитай щось — тоді буде що зберегти.', 'warn');
    return;
  }
  if (aqSavedGet().some(x => x.q === q)) {
    if (typeof toast === 'function') toast('Таке питання вже є кнопкою.', 'warn');
    return;
  }
  let name = q.slice(0, 28);
  if (typeof ask === 'function') {
    const v = await ask({
      title: 'Зберегти питання кнопкою',
      body: q,
      ok: 'Зберегти', cancel: 'Скасувати',
      fields: [{ key: 'name', label: 'Підпис кнопки', value: name, need: true,
                 hint: 'Коротко — кнопок поміщається кілька в рядок.' }]
    });
    if (!v) return;
    name = String(v.name || '').trim() || name;
  }
  aqSavedGet().unshift({ name, q });
  /* Межа не з економії: тринадцята кнопка витісняє поле питання за
     край екрана, і вікно перестає бути вікном питання. */
  if (aqSaved.length > AQ_SAVE_MAX) aqSaved.length = AQ_SAVE_MAX;
  aqSavedPut();
  aqPinsPaint();
};

window.aqUnsave = function (ev, i) {
  ev.stopPropagation();
  const list = aqSavedGet();
  if (i < 0 || i >= list.length) return;
  list.splice(i, 1);
  aqSavedPut();
  aqPinsPaint();
};

/* Клік по кнопці — питаємо одразу: саме за цим її й зберігали.

   НЕ aqRun: так зветься рахувальник, і window.aqRun = … тихо затер би
   його — на верхньому рівні function aqRun теж лежить у window.
   Знайшлось це стендом, бо зовні виглядало як «асистент перестав
   рахувати», без жодної помилки в консолі. */
window.aqPinRun = function (i) {
  const it = aqSavedGet()[i];
  const inp = document.getElementById('aq-q');
  if (!it || !inp) return;
  inp.value = it.q;
  aqGrow(inp);
  aqAsk();
};

function aqPinsPaint() {
  const el = document.getElementById('aq-pins');
  if (!el) return;
  const list = aqSavedGet();
  el.innerHTML = list.map((x, i) => `<span class="aq-pin" onclick="aqPinRun(${i})"
      title="${aqEsc(x.q)}">${aqEsc(x.name)}<button type="button" class="aq-pin-x"
      onclick="aqUnsave(event, ${i})" title="Прибрати кнопку">×</button></span>`).join('');
  el.classList.toggle('hidden', !list.length);
}

/* ── ВІКНО ── */
window.aqOpen = function (q) {
  const box = document.getElementById('aq-modal');
  if (!box) return;
  box.classList.remove('hidden');
  aqPaintSets();
  aqPinsPaint();
  const inp = document.getElementById('aq-q');
  if (inp) { if (q) { inp.value = q; aqGrow(inp); } inp.focus(); }
};
window.aqClose = function () { document.getElementById('aq-modal')?.classList.add('hidden'); };

/* Вибір набору — окреме повідомлення в стрічці, а не тиха зміна:
   інакше наступна відповідь приїхала б по іншій таблиці без жодної
   позначки, коли саме це сталось. */
window.aqPick = function (id) {
  aqSetId = String(id || '');
  try { localStorage.setItem('aq_set', aqSetId); } catch (e) { /* приватний режим */ }
  aqPaintSets();
};

function aqPaintSets() {
  const sel = document.getElementById('aq-set');
  const sub = document.getElementById('aq-sub');
  const sets = aqSets();
  if (!sel) return;

  if (!sets.length) {
    sel.innerHTML = '<option>немає відкритих даних</option>';
    sel.disabled = true;
    if (sub) sub.textContent = 'нічого не відкрито';
    if (aqGreeted !== '—none—') {
      aqGreeted = '—none—';
      aqPush('is-bot', `<p class="aq-val">Немає чого питати: відкрий файл у Таблицях або зайди на
        дашборд, щоб підтягнулась статистика.</p>
        <p class="aq-meta">Google-таблицю в рамці я не бачу — вона живе в Google, ми лише
        вбудовуємо її сторінку. Експортуй і відкрий файлом.</p>`);
    }
    return;
  }

  sel.disabled = false;
  let want = aqSetId;
  if (!want) { try { want = localStorage.getItem('aq_set') || ''; } catch (e) { want = ''; } }
  const set = sets.find(s => s.id === want) || sets[0];
  aqSetId = set.id;
  sel.innerHTML = sets.map(s => `<option value="${aqEsc(s.id)}"${
    s.id === set.id ? ' selected' : ''}>${aqEsc(s.title)}</option>`).join('');
  if (sub) sub.textContent = set.rows.length + ' рядк. · ' + set.cols.length + ' стовпц.';

  /* Стовпці показуємо один раз на набір: це і є відповідь на «що тут
     є», і повторювати її перед кожним питанням — те саме сміття, від
     якого ми тут і йдемо. */
  if (aqGreeted !== set.id) {
    aqGreeted = set.id;
    aqPush('is-bot', `<p class="aq-h">${aqEsc(set.title)} <span class="aq-dim">· ${
        set.rows.length} рядк.</span></p>
      <div class="aq-chips">${aqChips(set)}</div>
      <p class="aq-meta">Клік по стовпцю — що в ньому. Питання пиши словами.</p>`);
  }
}

window.aqAsk = async function () {
  if (aqBusy) return;
  const inp = document.getElementById('aq-q');
  const q = (inp?.value || '').trim();
  if (!q) return;
  const set = aqSetNow();
  if (!set) { aqPaintSets(); return; }

  aqLastQ = q;                       // щоб його можна було зберегти кнопкою
  aqPush('is-me', `<p class="aq-val">${aqEsc(q)}</p>`);
  if (inp) { inp.value = ''; aqGrow(inp); }

  aqBusy = true;
  document.getElementById('aq-go')?.setAttribute('disabled', 'disabled');
  const wait = aqPush('is-bot', '<p class="aq-val aq-dim">Думає…</p>');

  const fin = html => {
    if (wait) wait.innerHTML = html;
    const box = aqThread();
    if (box) box.scrollTop = box.scrollHeight;
    aqBusy = false;
    document.getElementById('aq-go')?.removeAttribute('disabled');
    inp?.focus();
  };

  let j;
  try {
    /* Їде ОДИН набір — той, що вибрано. Доти їхали всі відкриті, і
       модель мусила ще й угадати, про який питають: зайва здогадка на
       рівному місці, та ще й зайві назви стовпців у запиті. */
    j = await aqCall({ action: 'plan', q,
      /* Сьогоднішній день шлемо СВІЙ: функція живе в UTC, а питають із
         Києва — о другій ночі «вчора» розійшлось би на добу. */
      today: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString().slice(0, 10),
      sets: [{ id: set.id, title: set.title, rows: set.rows.length,
               cols: set.cols.map(c => ({ name: c.name, kind: c.kind })) }] });
  } catch (e) {
    const net = /failed to fetch|networkerror|load failed/i.test(e.message || '');
    fin(`<p class="aq-val is-bad">${(e.code === 'missing' || net)
      ? 'Функція ai не відповіла — спершу розгорни її: <span class="font-mono">supabase functions deploy ai</span>'
      : aqEsc(e.message)}</p>`);
    return;
  }

  let plan = null;
  try {
    const raw = String(j.plan_raw || '');
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) plan = JSON.parse(raw.slice(a, b + 1));
  } catch (e) { /* нижче скажемо, що плану немає */ }

  const cost = `${aqEsc(j.model || '')} · ~$${(j.cost_usd || 0).toFixed(5)}${
    j.left_today != null ? ' · лишилось сьогодні: ' + j.left_today : ''}`;

  const got = aqCheck(plan, [set]);
  if (got.err) {
    /* Найчастіша причина — питання про ВМІСТ («що тут є?»), а вмісту
       модель і не бачить. Відповідь на таке питання є в дашборда, і
       вона за один клік по стовпцю. */
    fin(`<p class="aq-val is-bad">${aqEsc(got.err)}</p>`
      + `<div class="aq-chips">${aqChips(set)}</div>`
      + `<p class="aq-meta">Клік по стовпцю — що в ньому. ${cost}</p>`);
    return;
  }

  const { spec } = got;
  const res = aqRun(spec, set);
  aqLast = { spec, set: set.id, res };

  /* Фільтр, який не знайшов нічого, — найчастіша причина нуля, і майже
     завжди це написання значення. Тому показуємо, ЩО справді лежить у
     тому стовпці: локально, нікуди не відправляючи. */
  let body;
  if (!res.rows) {
    const w = spec.where.find(x => !['empty', 'not_empty'].includes(x.op)) || spec.where[0];
    const vals = w ? [...new Set(set.rows.slice(0, 2000)
      .map(r => String(r[w.col] == null ? '' : r[w.col]).trim()).filter(Boolean))].slice(0, 12) : [];
    body = `<p class="aq-val">Жодного рядка під цю умову.</p>`
      + (vals.length ? `<p class="aq-meta">У «${aqEsc(w.col)}» зустрічається: ${
          vals.map(v => `<span class="aq-v">${aqEsc(v)}</span>`).join(' ')
          }${vals.length === 12 ? ' …' : ''}</p>` : '');
  } else if (spec.group && res.list.length === 1 && (spec.metrics || []).length) {
    /* ОДИН — ЦЕ КАРТКА, А НЕ ТАБЛИЦЯ З ОДНОГО РЯДКА. Питали «яке
       найкраще, розпиши його дані»: відповідь — назва й набір чисел
       під нею, а не шапка з одним рядком, у якій ще треба відшукати
       очима, де там що. */
    const g = res.list[0];
    const cell = (m, a) => `<div class="aq-kv"><span>${aqEsc(aqMetName(m))}</span><b>${
      aqFmt(a.v)}</b>${m.op === 'per' && a.den
        ? `<i>${aqFmt(a.num)} / ${aqFmt(a.den)}</i>` : ''}</div>`;
    body = `<p class="aq-h">${aqEsc(g.k)}${g.k2 ? ' · ' + aqEsc(g.k2) : ''}</p>`
      + `<div class="aq-card">${cell(spec.metric, g)}${
          (spec.metrics || []).map((m, i) => cell(m, g.more[i] || {})).join('')}
         <div class="aq-kv"><span>рядків</span><b>${g.rows}</b></div></div>`;
  } else if (spec.group) {
    const g2 = !!spec.group2;
    const ms = spec.metrics || [];
    body = `<table class="aq-tbl"><thead><tr><th>${aqEsc(spec.group)}</th>${
        g2 ? `<th>${aqEsc(spec.group2)}</th>` : ''}<th>${aqEsc(aqMetName(spec.metric))}</th>${
        ms.map(m => `<th>${aqEsc(aqMetName(m))}</th>`).join('')}<th>рядків</th></tr></thead>
       <tbody>${res.list.map(r => `<tr><td>${aqEsc(r.k)}</td>${
         g2 ? `<td>${aqEsc(r.k2)}</td>` : ''}<td class="aq-n">${aqFmt(r.v)}</td>${
         ms.map((m, i) => `<td class="aq-n">${aqFmt((r.more[i] || {}).v)}</td>`).join('')
         }<td class="aq-n aq-dim">${r.rows}</td></tr>`).join('')}</tbody></table>`;
  } else {
    body = `<p class="aq-big">${aqFmt(res.one.v)}</p>`
      + (spec.metric.op === 'per'
          ? `<p class="aq-meta">${aqEsc(spec.metric.num)} ${aqFmt(res.one.num)} / ${
              aqEsc(spec.metric.den)} ${aqFmt(res.one.den)}</p>` : '');
  }

  /* ПЛАН ОДНИМ РЯДКОМ — але він є завжди. Число без плану перевірити
     нічим; «як я зрозумів питання» своїми словами моделі лишаємо
     поруч, бо саме воно ловить неправильно зрозуміле питання. */
  fin(body
    + `<p class="aq-meta"><b>${aqEsc(aqPlanWords(spec, set))}</b> · ${res.rows} з ${res.total} рядк.${
        spec.group ? ' · груп: ' + res.groups : ''}</p>`
    + (spec.say ? `<p class="aq-meta">${aqEsc(spec.say)}</p>` : '')
    + `<p class="aq-meta aq-dim">рахував дашборд, модель склала план · ${cost}</p>`);
};
</script>
