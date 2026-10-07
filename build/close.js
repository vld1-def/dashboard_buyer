
/* ═══════════ ЗЛІПОК МІСЯЦЯ ═══════════
   Ставки не версіонуються, а імпорт можна перезалити — тож підсумки за
   минулий місяць з часом змінюються заднім числом. Зліпок фіксує їх
   такими, якими ти місяць закрив, і показує, якщо жива цифра відʼїхала.

   Зберігаємо в team_settings (ключ snapshot_YYYY-MM) — окрема таблиця
   вимагала б міграції, а ця вже є і вміє upsert. */

const MC_KEY = m => 'snapshot_' + m;
const MC_FIELDS = [
  ['spend',    'Spend',    'money'],
  ['revenue',  'Revenue',  'money'],
  ['gross',    'Gross',    'money'],
  ['expenses', 'Expenses', 'money'],
  ['net',      'Net',      'money'],
  ['roi',      'ROI',      'pct'],
  ['regs',     'Regs',     'int'],
  ['deposits', 'Deps',     'int']
];

const mcFmt = (v, kind) =>
  kind === 'money' ? (typeof formatCurrency === 'function' ? formatCurrency(v) : '$' + Number(v).toFixed(2))
  : kind === 'pct' ? Math.round(Number(v) || 0) + '%'
  : String(Math.round(Number(v) || 0));

// Підсумки місяця з того, що зараз у памʼяті й у базі витрат.
async function mcCompute(month) {
  const rows = (typeof rawData !== 'undefined' ? rawData : [])
    .filter(r => String(r.date || '').startsWith(month));
  let spend = 0, regs = 0, deposits = 0, installs = 0, revenue = 0;
  const byGeo = {};
  rows.forEach(r => {
    const s = Number(r.spend) || 0;
    const d = Number(r.deposits) || 0;
    const rev = (typeof revenueOf === 'function' ? revenueOf(r) : 0);
    spend += s; regs += Number(r.regs) || 0; deposits += d;
    installs += Number(r.installs) || 0; revenue += rev;
    const g = String(r.geo || '??').toUpperCase().trim();
    (byGeo[g] = byGeo[g] || { spend: 0, deposits: 0, revenue: 0 });
    byGeo[g].spend += s; byGeo[g].deposits += d; byGeo[g].revenue += rev;
  });

  // Витрати тягнемо окремо: вони живуть у своїй таблиці й не залежать
  // від обраного в дашборді зрізу.
  let expenses = 0;
  try {
    const last = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
    const { data } = await sb.from('expenses').select('amount')
      .eq('team_name', currentTeam)
      .gte('date', month + '-01')
      .lte('date', `${month}-${String(last).padStart(2, '0')}`);
    expenses = (data || []).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  } catch (e) { console.warn('mcCompute expenses:', e); }

  const gross = revenue - spend;
  const net = gross - expenses;
  return {
    month, spend, revenue, gross, expenses, net,
    roi: spend > 0 ? (net / spend * 100) : 0,
    regs, deposits, installs,
    geo: Object.entries(byGeo)
      .map(([g, v]) => ({ geo: g, ...v, profit: v.revenue - v.spend }))
      .sort((a, b) => b.spend - a.spend),
    rows: rows.length
  };
}

function mcCell(label, val, kind) {
  return `<div class="mc-cell"><span class="k">${label}</span><span class="v">${mcFmt(val, kind)}</span></div>`;
}

async function openMonthClose() {
  document.getElementById('month-menu')?.classList.add('hidden');
  document.getElementById('close-modal').classList.remove('hidden');
  const m = (typeof currentMonthFilter !== 'undefined' && currentMonthFilter)
    ? currentMonthFilter : new Date().toISOString().slice(0, 7);
  document.getElementById('mc-month').textContent = m;
  document.getElementById('mc-diff-group').classList.add('hidden');
  document.getElementById('mc-live').innerHTML = '<p class="set-hint">Рахую…</p>';
  const live = await mcCompute(m);
  window.__mcLive = live;
  document.getElementById('mc-live').innerHTML =
    MC_FIELDS.map(([k, label, kind]) => mcCell(label, live[k], kind)).join('');
  mcRenderList();
}
function closeMonthClose() { document.getElementById('close-modal').classList.add('hidden'); }

// Перелік збережених зліпків. Ключі лежать поруч із рештою налаштувань,
// тож відбираємо їх за префіксом.
async function mcRenderList() {
  const box = document.getElementById('mc-list');
  box.innerHTML = '<p class="set-hint">Завантажую…</p>';
  let snaps = [];
  try {
    const { data, error } = await sb.from('team_settings')
      .select('key,value').eq('team_name', currentTeam).like('key', 'snapshot_%');
    if (error) throw error;
    snaps = (data || []).map(r => {
      try { return { key: r.key, ...JSON.parse(r.value) }; } catch (e) { return null; }
    }).filter(Boolean).sort((a, b) => String(b.month).localeCompare(String(a.month)));
  } catch (e) {
    box.innerHTML = '<p class="set-hint">Не вдалось прочитати збережені зліпки.</p>';
    return;
  }
  if (!snaps.length) { box.innerHTML = '<p class="set-hint">Поки жодного зліпка.</p>'; return; }
  window.__mcSnaps = snaps;
  box.innerHTML = snaps.map((s, i) => `
    <div class="mc-row is-click" onclick="mcDiff(${i})">
      <span class="m">${s.month}</span>
      <span class="w">${String(s.takenAt || '').slice(0, 16).replace('T', ' ')}</span>
      <span class="p" style="color:${(s.net || 0) >= 0 ? 'var(--ok)' : 'var(--bad)'}">${mcFmt(s.net, 'money')}</span>
      <button class="mc-del" title="Delete" onclick="event.stopPropagation(); mcDelete('${s.month}')">&times;</button>
    </div>`).join('');
}

async function mcTake() {
  const m = document.getElementById('mc-month').textContent.trim();
  if (!m) return;
  const btn = document.getElementById('mc-take');
  btn.disabled = true;
  const snap = await mcCompute(m);
  snap.takenAt = new Date().toISOString();
  // Ставки, якими це пораховано — без них зліпок не пояснює сам себе
  try { snap.payouts = JSON.parse(JSON.stringify(globalPayouts || {})); } catch (e) {}
  try { snap.payoutModels = JSON.parse(JSON.stringify(payoutModels || {})); } catch (e) {}
  await setTeamSetting(MC_KEY(m), JSON.stringify(snap));
  btn.disabled = false;
  const saved = document.getElementById('mc-saved');
  saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 1400);
  mcRenderList();
}

async function mcDelete(month) {
  if (!await ask({ title: 'Delete the snapshot?', danger: true, ok: 'Delete',
    body: `The saved numbers for ${month} will be gone.` })) return;
  try {
    await sb.from('team_settings').delete()
      .eq('team_name', currentTeam).eq('key', MC_KEY(month));
  } catch (e) { alert('Could not delete: ' + (e.message || e)); }
  document.getElementById('mc-diff-group').classList.add('hidden');
  mcRenderList();
}

// Порівняння зліпка з тим, що рахується зараз. Саме тут видно, що минуле
// переписалось: ставка змінилась або дані перезалили.
async function mcDiff(i) {
  const snap = (window.__mcSnaps || [])[i];
  if (!snap) return;
  const g = document.getElementById('mc-diff-group');
  g.classList.remove('hidden');
  document.getElementById('mc-diff-month').textContent = snap.month;
  document.getElementById('mc-diff').innerHTML = '<p class="set-hint">Рахую…</p>';
  const live = await mcCompute(snap.month);
  document.getElementById('mc-diff-when').textContent =
    `Frozen on ${String(snap.takenAt || '').slice(0, 16).replace('T', ' ')}`;

  const rows = MC_FIELDS.map(([k, label, kind]) => {
    const a = Number(snap[k]) || 0, b = Number(live[k]) || 0;
    const diff = b - a;
    const eps = kind === 'int' ? 0.5 : (kind === 'pct' ? 0.05 : 0.5);
    const moved = Math.abs(diff) >= eps;
    const sign = diff > 0 ? '+' : '−';
    return `<div class="mc-drow ${moved ? 'moved' : 'same'}">
      <span class="n">${label}</span>
      <span class="num">${mcFmt(a, kind)}</span>
      <span class="num">${mcFmt(b, kind)}</span>
      <span class="num d">${moved ? sign + mcFmt(Math.abs(diff), kind) : '—'}</span>
    </div>`;
  }).join('');
  const moved = MC_FIELDS.filter(([k, , kind]) => {
    const d = Math.abs((Number(live[k]) || 0) - (Number(snap[k]) || 0));
    return d >= (kind === 'pct' ? 0.05 : 0.5);
  }).length;
  document.getElementById('mc-diff').innerHTML =
    `<div class="mc-drow head"><span>Metric</span><span class="num">Frozen</span><span class="num">Live</span><span class="num">Diff</span></div>` +
    rows +
    `<p class="set-hint">${moved
      ? `${moved} metric(s) drifted. Usually one of two reasons: a payout rate changed, or the data for this month was re-imported.`
      : 'Everything matches: live numbers equal the frozen ones.'}</p>`;
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('close-modal');
  if (m && !m.classList.contains('hidden')) closeMonthClose();
});
