<script>
/* ══════════════════════════════════════════════════════════════════
   СТОРІНКА ТІМЛІДА

   Досі «тімлід» у дашборді означав ось що: той самий екран баєра,
   відкритий спільним паролем в адресі, з погашеними блоками. Він
   показував команду СУМАРНО — тобто не відповідав на єдине питання,
   заради якого тімлід взагалі заходить: у кого проблема.

   Тут інакше. Перший екран — смуга «що горить» і список людей.
   Сума по команді не каже, куди йти дивитись; рядок на людину — каже.

   ПРАВ НА ЗМІНУ ТУТ НЕМАЄ НАВМИСНО. Жодної кнопки Stop, жодного
   редагування, жодних токенів. Тімлід аналізує, а в роботу баєра не
   втручається — це рішення, а не недогляд.

   І головне: видимість пункту меню — це ввічливість, а не захист.
   Справжня межа стоїть у базі (TEAM_ROLES.sql): політики читання не
   віддадуть чужі рядки тому, кому не належить, хоч би що робили з
   розміткою в браузері.
   ══════════════════════════════════════════════════════════════════ */

let tmRole = 'buyer', tmTeam = '', tmWho = new Map();
let tmRows = [], tmCabs = [], tmStops = [], tmErr = '', tmLoaded = false;
let tmPick = '', tmRange = 'today', tmTeamSel = '';

const tmEsc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const tmMoney = (v) => '$' + Math.round(Number(v) || 0).toLocaleString('en-US');
const tmCents = (v) => '$' + (Math.round((Number(v) || 0) * 100) / 100)
  .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const tmDay = (n) => {
  const t = new Date();
  t.setDate(t.getDate() - n);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0')
       + '-' + String(t.getDate()).padStart(2, '0');
};
const TM_RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']];
function tmDates() {
  if (tmRange === '7d')  return [tmDay(6), tmDay(0)];
  if (tmRange === '30d') return [tmDay(29), tmDay(0)];
  if (tmRange === 'all') return ['0000-01-01', '9999-12-31'];
  return [tmDay(0), tmDay(0)];
}

/* Хто я і що мені видно. Роль лежить у team_members; немає рядка —
   отже баєр, і сторінки для нього просто не існує. Так само вирішує й
   база: спитати вона дозволить, а от чужих рядків не віддасть. */
window.tmWhoAmI = async function () {
  try {
    const { data: s } = await sb.auth.getUser();
    const uid = s?.user?.id;
    if (!uid) return { role: 'buyer', team: '' };
    const { data, error } = await sb.from('team_members')
      .select('user_id,team_name,name,role').eq('user_id', uid).limit(1);
    if (error) throw error;
    const me = (data || [])[0];
    tmRole = me?.role || 'buyer';
    tmTeam = me?.team_name || '';
  } catch (e) {
    /* Немає таблиці — значить TEAM_ROLES.sql ще не виконували. Це не
       привід ламати дашборд баєра: мовчки лишаємось баєром. */
    tmRole = 'buyer'; tmTeam = '';
  }
  document.body.classList.toggle('is-lead', tmRole === 'lead' || tmRole === 'admin');
  /* ТІМЛІД БАЧИТЬ ЛИШЕ СВОЮ СТОРІНКУ.

     Спершу здавалось, що досить показати йому Team поруч із рештою. На
     практиці вийшло інше: щойно він отримав право читати командні
     числа, ними наповнились і сторінки баєра — Geo Performance, графіки,
     а задачі взагалі показали чужі. Тобто людина, яка мала аналізувати
     команду, відкривала чийсь робочий стіл.

     Ховати це по одному віджету — програшна гра: наступний блок, який
     хтось додасть, знову стане видимим за замовчуванням. Тому правило
     одне: у тімліда в меню рівно одна сторінка. Адміна це не
     стосується — дашборд його власний.

     Це, знову ж, про зручність і ясність, а не про захист: чужих
     рядків не віддасть база (TEAM_ROLES.sql), хоч би що робили з
     розміткою. */
  document.body.classList.toggle('is-lead-only', tmRole === 'lead');
  if (tmRole === 'lead') tmKeepOnTeam();
  return { role: tmRole, team: tmTeam };
};

/* Тімлід міг лишити в адресі будь-який маршрут — з закладки чи просто
   з минулого разу. Повертаємо на Team: інакше він побачив би порожній
   дашборд і вирішив, що нічого не працює. */
function tmKeepOnTeam() {
  const now = String(location.hash || '').replace(/^#\/?/, '').split('/')[0];
  if (now !== 'team' && typeof navGo === 'function') navGo('team');
}

/* Команда, дані якої показуємо. Тімлід прив'язаний до своєї й
   перемкнути її не може — ні кнопкою, ні адресою: чужу йому все одно
   не віддадуть. Адмін вибирає. */
function tmActiveTeam() {
  if (tmRole === 'lead') return tmTeam || currentTeam;
  return tmTeamSel || currentTeam;
}

window.tmOpen = async function () {
  // Спершу дочекатись ролі, і лише тоді вирішувати, що показувати:
  // інакше на свіжому завантаженні тут завжди читалось би 'buyer'.
  await window.tmReady();
  if (tmRole !== 'lead' && tmRole !== 'admin') {
    const box = document.getElementById('tm-list');
    if (box) box.innerHTML = '<p class="tm-empty">This page is for team leads. '
      + 'If you need it, ask the admin to add you in TEAM_ROLES.sql.</p>';
    return;
  }
  if (!tmLoaded) await tmLoad();
  tmPaint();
};

async function tmLoad() {
  const team = tmActiveTeam();
  tmErr = '';
  try {
    /* Три джерела, і всі вже існують. Нічого нового в базу заради цієї
       сторінки не пишеться: вона читає те, що дашборд і так наповнює. */
    const [stats, cabs, stops, members] = await Promise.all([
      sbFetchAll('daily_stats', q => q.eq('team_name', team)),
      sb.from('fb_accounts').select('account_id,created_by,team_name,status,card,'
        + 'ads_active,ads,ads_by_status,missing_since,balance,spend_today,currency,synced_at')
        .eq('team_name', team),
      sb.from('fb_rule_log').select('created_by,at,rule_name,level,entity_name,ok')
        .eq('team_name', team).gte('at', tmDay(1) + 'T00:00:00').limit(500),
      sb.from('team_members').select('user_id,name,role').eq('team_name', team)
    ]);
    tmRows  = stats || [];
    tmCabs  = cabs?.data || [];
    tmStops = stops?.data || [];
    tmWho = new Map();
    (members?.data || []).forEach(m => tmWho.set(String(m.user_id), m));
  } catch (e) {
    tmErr = e.message || String(e);
  }
  tmLoaded = true;
}

window.tmSetRange = (k) => { tmRange = k; tmPaint(); };
window.tmSetWho = (uid) => { tmPick = tmPick === uid ? '' : uid; tmPaint(); };

/* Як підписати людину. Є ім'я в team_members — беремо його. Немає —
   показуємо обрізаний uuid і кажемо, що робити: підсунути замість
   імені «Баєр 1» означало б вигадати те, чого ми не знаємо. */
function tmName(uid) {
  const m = tmWho.get(String(uid || ''));
  if (m && m.name) return { text: m.name, known: true };
  if (!uid) return { text: 'not signed', known: false };
  return { text: String(uid).slice(0, 8), known: false };
}

/* Зводимо daily_stats по людях. Рядок без created_by — це не «ще один
   баєр», а незаповнена колонка: SECURITY_BUYERS.sql крок 3 не
   виконано. Тому такі рядки збираємо окремо й кажемо про це прямо. */
function tmByBuyer() {
  const [a, b] = tmDates();
  const by = new Map();
  tmRows.forEach(r => {
    const d = String(r.date || '');
    if (d < a || d > b) return;
    const uid = String(r.created_by || '');
    let e = by.get(uid);
    if (!e) {
      e = { uid, spend: 0, installs: 0, regs: 0, deps: 0, days: new Set(),
            offers: new Map(), geos: new Map() };
      by.set(uid, e);
    }
    const spend = Number(r.spend) || 0;
    e.spend += spend;
    e.installs += Number(r.installs) || 0;
    e.regs += Number(r.regs) || 0;
    e.deps += Number(r.deposits) || 0;
    if (d) e.days.add(d);
    const add = (map, k) => { if (k) map.set(k, (map.get(k) || 0) + spend); };
    add(e.offers, r.offer);
    add(e.geos, r.geo);
  });
  return [...by.values()].sort((x, y) => y.spend - x.spend);
}

/* Кабінети людини та її біди. Те саме, що видно на сторінці кабінетів,
   тільки згорнуте до числа: тімліду треба знати, ЧИ є проблема і в
   кого, а розбиратись у ній піде вже баєр. */
function tmCabsOf(uid) {
  return tmCabs.filter(c => String(c.created_by || '') === String(uid || ''));
}
function tmTrouble(cabs) {
  const bad = (c) => ['banned', 'unsettled', 'closed', 'closing'].includes(String(c.status || ''));
  const rejected = (c) => Number(c.ads_by_status?.DISAPPROVED) || 0;
  return {
    cabs: cabs.length,
    live: cabs.filter(c => String(c.status) === 'active' && !c.missing_since).length,
    banned: cabs.filter(bad).length,
    /* Токен втратив доступ — кабінет ніби живий, а піти в нього нема з
       чим. Це саме та тиша, яку тімлід і має помітити першим. */
    notoken: cabs.filter(c => c.missing_since).length,
    rejected: cabs.reduce((a, c) => a + rejected(c), 0),
    owed: cabs.reduce((a, c) => a + (Number(c.balance) || 0), 0)
  };
}

const tmPer = (spend, n) => n > 0 ? tmCents(spend / n)
  : (spend > 0 ? '<span class="tm-inf" title="Money spent, nothing back yet">∞</span>'
               : '<span class="tm-na">—</span>');

function tmFire() {
  const t = tmTrouble(tmCabs);
  const stops = tmStops.filter(s => s.ok).length;
  const chips = [
    ['banned', t.banned, 'cabinet(s) banned or unsettled', 'bad'],
    ['no token', t.notoken, 'cabinet(s) the token no longer reaches', 'bad'],
    ['rejected ads', t.rejected, 'ad(s) switched on but rejected by Facebook', 'bad'],
    ['rules stopped', stops, 'thing(s) the auto-pause rules switched off since yesterday', 'warn'],
    ['owed on cards', Math.round(t.owed), 'spent but not yet taken from the cards', 'warn']
  ].filter(x => x[1] > 0);

  if (!chips.length) {
    return '<div class="tm-fire tm-fire-ok">Nothing on fire: no bans, no lost tokens, '
         + 'no rejected ads.</div>';
  }
  return '<div class="tm-fire">' + chips.map(([label, n, why, tone]) =>
    `<span class="tm-chip tm-chip-${tone}" title="${tmEsc(n + ' ' + why)}">${
      n} ${tmEsc(label)}</span>`).join('') + '</div>';
}

/* Картки команди — ті самі, що в баєра на дашборді, і клас у них той
   самий (kpi-card). Людина ходить між сторінками, і число в такій самій
   рамці мусить означати таке саме; свій окремий вигляд тут означав би,
   що це інша величина. */
const TM_KPI = [
  { k: 'spend', label: 'Team spend', accent: '#8B5CF6', glow: 'rgba(139,92,246,.16)',
    ico: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>' },
  { k: 'regs', label: 'Registrations', accent: '#3B82F6', glow: 'rgba(59,130,246,.14)',
    ico: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
  { k: 'deps', label: 'Deposits', accent: '#22C55E', glow: 'rgba(34,197,94,.14)',
    ico: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
  { k: 'cpd', label: 'Cost per dep', accent: '#F59E0B', glow: 'rgba(245,158,11,.14)',
    ico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>' }
];

function tmKpi(rows, people) {
  const box = document.getElementById('team-kpi');
  if (!box) return;
  /* Суму беремо з УСІХ рядків, разом із незапідписаними: гроші пішли,
     хоч ми й не знаємо чиї, і ховати їх із суми означало б занизити
     спенд команди. А от людей рахуємо тільки відомих — «ще один баєр»
     із порожнього created_by не з'являється. */
  const sum = rows.reduce((a, r) => ({
    spend: a.spend + r.spend, regs: a.regs + r.regs, deps: a.deps + r.deps
  }), { spend: 0, regs: 0, deps: 0 });

  const value = (k) => k === 'spend' ? tmMoney(sum.spend)
    : k === 'regs' ? String(sum.regs)
    : k === 'deps' ? String(sum.deps)
    /* Ціна депозиту без депозитів — не нуль: нуль читався б як
       «безкоштовно», а це рівно навпаки. */
    : tmPer(sum.spend, sum.deps);

  const foot = (k) => k === 'spend'
      ? (people || []).length + ' buyer(s) with spend'
    : k === 'regs' ? tmPer(sum.spend, sum.regs) + ' each'
    : k === 'deps' ? (sum.regs ? Math.round(sum.deps / sum.regs * 100) + '% of registrations' : '')
    : '';

  box.innerHTML = TM_KPI.map(c => `
    <div class="kpi-card" style="--accent:${c.accent};--glow:${c.glow}">
      <div class="kpi-head">
        <span class="kpi-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-linecap="round" stroke-linejoin="round">${c.ico}</svg></span>
        <span class="kpi-label">${c.label}</span>
      </div>
      <p class="kpi-value">${value(c.k)}</p>
      <p class="kpi-foot">${foot(c.k)}</p>
    </div>`).join('');
}

/* Спенд по днях, лінія на баєра. Таблиця каже, ХТО скільки витратив;
   графік — коли це почалось і в кого стрибнуло. Це різні питання, тож
   одне одного вони не заміняють.

   Малюємо тільки коли днів більше одного: лінія з однієї точки — це не
   графік, а крапка, і місце вона займає як графік. */
const TM_COLORS = ['#8B5CF6', '#3B82F6', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6'];
let tmChart = null;

function tmDrawChart(people) {
  const wrap = document.getElementById('team-chart-wrap');
  const cv = document.getElementById('team-chart');
  if (!wrap || !cv || typeof Chart === 'undefined') return;

  const [a, b] = tmDates();
  const days = [...new Set(tmRows
    .filter(r => String(r.date || '') >= a && String(r.date || '') <= b)
    .map(r => String(r.date || '')).filter(Boolean))].sort();

  if (days.length < 2 || !people.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  const top = people.slice(0, TM_COLORS.length);
  const sets = top.map((p, i) => {
    const byDay = new Map();
    tmRows.forEach(r => {
      const d = String(r.date || '');
      if (d < a || d > b) return;
      if (String(r.created_by || '') !== p.uid) return;
      byDay.set(d, (byDay.get(d) || 0) + (Number(r.spend) || 0));
    });
    return { label: tmName(p.uid).text, data: days.map(d => byDay.get(d) || 0),
             borderColor: TM_COLORS[i], backgroundColor: TM_COLORS[i],
             borderWidth: 2, pointRadius: 0, tension: .3 };
  });

  document.getElementById('team-legend').innerHTML = top.map((p, i) =>
    `<span class="tm-leg"><i style="background:${TM_COLORS[i]}"></i>${
      tmEsc(tmName(p.uid).text)}</span>`).join('');

  if (tmChart) { try { tmChart.destroy(); } catch (e) {} }
  tmChart = new Chart(cv, {
    type: 'line',
    data: { labels: days.map(d => d.slice(5)), datasets: sets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, datalabels: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
        y: { grid: { color: 'rgba(148,163,184,.08)' }, ticks: { font: { size: 9 } } }
      }
    }
  });
}

function tmPaint() {
  const list = document.getElementById('tm-list');
  if (!list) return;

  const pick = document.getElementById('team-pick');
  /* Підпис, а не вибір. У тімліда команда одна й перемикати її нема на
     що. Адмін команди міняє тим самим перемикачем, що й завжди, — тут
     друга кнопка з тим самим змістом лише плодила б питання, яка з них
     головна. */
  if (pick) pick.innerHTML = `<span class="tm-team">${tmEsc(tmActiveTeam())}</span>`;
  const range = document.getElementById('team-range');
  if (range) {
    range.innerHTML = TM_RANGES.map(([k, l]) =>
      `<button type="button" class="tm-rg${k === tmRange ? ' is-on' : ''}"
         onclick="tmSetRange('${k}')">${l}</button>`).join('');
  }

  if (tmErr) {
    list.innerHTML = `<p class="tm-empty">Could not read the team: ${tmEsc(tmErr)}${
      /team_members|does not exist|schema cache/i.test(tmErr)
        ? '<br>Run TEAM_ROLES.sql first.' : ''}</p>`;
    return;
  }

  const rows = tmByBuyer();
  const unsigned = rows.find(r => !r.uid);
  const people = rows.filter(r => r.uid);

  document.getElementById('team-fire').innerHTML = tmFire();
  tmKpi(rows, people);
  tmDrawChart(people);

  if (!rows.length) {
    list.innerHTML = '<p class="tm-empty">No spend in this period.</p>';
    tmWhoPaint();
    return;
  }

  /* Рядки без автора — головна причина, чому сторінка може виглядати
     порожньою. Мовчати про це не можна: людина подумає, що команда
     нічого не крутить. */
  const warn = !unsigned ? '' : `<p class="tm-warn">${
    tmMoney(unsigned.spend)} of spend is not signed by any buyer — column created_by is
    empty in daily_stats. Run step 3 of SECURITY_BUYERS.sql to fill it, otherwise this
    page cannot tell whose it is.</p>`;

  list.innerHTML = warn + `<div class="tm-wrap custom-scrollbar">
    <table class="tm-tbl">
      <thead><tr>
        <th>Buyer</th>
        <th class="ta-r">Spend</th>
        <th class="ta-r">Reg</th>
        <th class="ta-r">Cost per reg</th>
        <th class="ta-r">Dep</th>
        <th class="ta-r">Cost per dep</th>
        <th class="ta-c" title="Live cabinets of all this buyer has">Cabinets</th>
        <th>Trouble</th>
      </tr></thead>
      <tbody>${people.map(p => {
        const who = tmName(p.uid);
        const t = tmTrouble(tmCabsOf(p.uid));
        const bad = [];
        if (t.banned) bad.push(`<span class="tm-chip tm-chip-bad">${t.banned} banned</span>`);
        if (t.notoken) bad.push(`<span class="tm-chip tm-chip-bad">${t.notoken} no token</span>`);
        if (t.rejected) bad.push(`<span class="tm-chip tm-chip-bad">${t.rejected} rejected</span>`);
        return `<tr class="tm-r${p.uid === tmPick ? ' is-on' : ''}"
          onclick="tmSetWho('${tmEsc(p.uid)}')">
          <td class="tm-name">${who.known ? tmEsc(who.text)
            : `<span class="tm-unknown" title="This user is not in team_members yet — add them in TEAM_ROLES.sql to see a name here">${
                tmEsc(who.text)}</span>`}</td>
          <td class="ta-r tm-num tm-spend">${tmMoney(p.spend)}</td>
          <td class="ta-r tm-num">${p.regs}</td>
          <td class="ta-r tm-num">${tmPer(p.spend, p.regs)}</td>
          <td class="ta-r tm-num">${p.deps}</td>
          <td class="ta-r tm-num">${tmPer(p.spend, p.deps)}</td>
          <td class="ta-c tm-num">${t.cabs ? t.live + '/' + t.cabs
            : '<span class="tm-na">—</span>'}</td>
          <td>${bad.join('') || '<span class="tm-na">—</span>'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  tmWhoPaint();
}

/* Панель обраного баєра. Не другий дашборд, а відповідь на «що саме в
   нього»: куди йдуть гроші і які кабінети болять. */
function tmWhoPaint() {
  const box = document.getElementById('team-who');
  if (!box) return;
  if (!tmPick) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const p = tmByBuyer().find(r => r.uid === tmPick);
  if (!p) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');

  const who = tmName(p.uid);
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const cabs = tmCabsOf(p.uid);
  const t = tmTrouble(cabs);
  const stops = tmStops.filter(s => String(s.created_by || '') === p.uid && s.ok);

  const cell = (k, v) => `<div class="rounded-lg px-2 py-1.5" style="background:var(--surface-2)">
      <p class="text-[9px] font-black uppercase tracking-widest" style="color:var(--text-muted)">${k}</p>
      <p class="text-[12px] font-black text-dynamic font-mono">${v}</p></div>`;

  const bars = (map, title) => {
    const rows = top(map, 5);
    if (!rows.length) return '';
    const max = rows[0][1] || 1;
    return `<p class="tm-h">${title}</p>` + rows.map(([k, v]) => `
      <div class="tm-bar"><span class="tm-bar-l">${tmEsc(k)}</span>
        <span class="tm-bar-t"><i style="width:${Math.max(3, Math.round(v / max * 100))}%"></i></span>
        <span class="tm-bar-v">${tmMoney(v)}</span></div>`).join('');
  };

  box.innerHTML = `<div class="card p-4 rounded-2xl">
    <div class="flex items-start justify-between gap-2 mb-3">
      <div class="min-w-0">
        <p class="text-[13px] font-black text-dynamic truncate">${tmEsc(who.text)}</p>
        <p class="text-[9px] font-bold" style="color:var(--text-muted)">${
          p.days.size} day(s) with spend in this period</p>
      </div>
      <button onclick="tmSetWho('${tmEsc(p.uid)}')"
        class="text-slate-500 hover:text-red-400 text-lg leading-none">&times;</button>
    </div>
    <div class="grid grid-cols-2 gap-2 mb-3">
      ${cell('Spend', tmMoney(p.spend))}
      ${cell('Installs', p.installs)}
      ${cell('Reg', p.regs)}
      ${cell('Dep', p.deps)}
    </div>
    ${bars(p.offers, 'Where the money goes')}
    ${bars(p.geos, 'Geo')}
    <p class="tm-h">Cabinets</p>
    <div class="grid grid-cols-2 gap-2">
      ${cell('Live', t.cabs ? t.live + '/' + t.cabs : '—')}
      ${cell('Not charged yet', t.owed > 0 ? tmCents(t.owed) : '—')}
    </div>
    ${t.banned || t.notoken || t.rejected ? `<p class="tm-h">Trouble</p>
      <ul class="tm-list">
        ${t.banned ? `<li>${t.banned} cabinet(s) banned or unsettled</li>` : ''}
        ${t.notoken ? `<li>${t.notoken} cabinet(s) the token no longer reaches</li>` : ''}
        ${t.rejected ? `<li>${t.rejected} ad(s) switched on but rejected</li>` : ''}
      </ul>` : ''}
    ${stops.length ? `<p class="tm-h">Rules stopped since yesterday</p>
      <ul class="tm-list">${stops.slice(0, 6).map(s =>
        `<li>${tmEsc(s.entity_name || s.level || '')}<span> · ${
          tmEsc(s.rule_name || '')}</span></li>`).join('')}</ul>` : ''}
  </div>`;
}

/* Роль питаємо один раз на сеанс і ще раз, коли зʼявився сеанс: на мить
   завантаження сторінки користувача може ще не бути, і тоді пункт меню
   не з'явився б узагалі — до перезавантаження.

   Нічого, крім видимості пункту, ця відповідь не вирішує: дані все одно
   віддає база, і віддає рівно те, що дозволено політиками. */
/* Роль приїжджає ЗАПИТОМ, а сторінку відкривають одразу — і між цими
   двома моментами tmRole ще дорівнює 'buyer'. Тому тримаємо не прапорець
   «запит іде», а сам проміс: кожен, кому потрібна роль, чекає на нього,
   замість читати змінну, яку ще не заповнили.

   Саме на цьому обпеклись: тімлід із закладкою на #/team бачив «This page
   is for team leads». Маршрут застосовувався до відповіді, tmOpen читав
   'buyer' і малював відмову — а коли роль нарешті приїжджала, ми були вже
   на потрібному маршруті, навігація не спрацьовувала вдруге, і відмова
   так і лишалась на екрані. Адміна, що заходив на #/team напряму, це
   стосувалось так само. */
let tmAsking = null;   // проміс запиту, що зараз іде
let tmReady  = null;   // останній запит — його й чекають

function tmBoot() {
  if (tmAsking) return tmAsking;
  tmAsking = (async () => {
    try { await tmWhoAmI(); } catch (e) { /* немає ролей — лишаємось баєром */ }
  })();
  tmReady = tmAsking;
  tmAsking.finally(() => { tmAsking = null; });
  return tmReady;
}
window.tmReady = () => tmReady || tmBoot();

try { sb.auth.onAuthStateChange(() => { tmBoot(); }); } catch (e) {}
tmBoot();
</script>
