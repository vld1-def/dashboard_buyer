
/* ═══════════ ЗАРПЛАТНА ЧЕРНЕТКА ═══════════
   Bonus Calculator рахує бонус із числа, яке вбиваєш руками. Тут те саме
   число береться з реального місяця — і бажано з ЗАМОРОЖЕНОГО, бо ставки
   не версіонуються: інакше сума, яку ти собі порахував, через тиждень
   може стати іншою.

   Бонус рахується тією ж calcBonus, що й у калькуляторі, — щоб дві
   вкладки одного вікна не розходились між собою. */

const psMoney = n => (typeof formatCurrency === 'function')
  ? formatCurrency(n) : '$' + (Number(n) || 0).toFixed(2);

async function psInit() {
  const sel = document.getElementById('ps-month');
  if (!sel) return;
  // Місяці беремо і з даних, і зі збережених зліпків: місяць міг бути
  // закритий тоді, коли його рядки вже поза поточним зрізом.
  let months = [];
  try { months = getAvailableMonths(rawData || []); } catch (e) {}
  try {
    const { data } = await sb.from('team_settings')
      .select('key').eq('team_name', currentTeam).like('key', 'snapshot_%');
    (data || []).forEach(r => months.push(String(r.key).replace('snapshot_', '')));
  } catch (e) {}
  months = [...new Set(months.filter(Boolean))].sort().reverse();
  if (!months.length) months = [new Date().toISOString().slice(0, 7)];
  sel.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');
  if (typeof currentMonthFilter !== 'undefined' && months.includes(currentMonthFilter)) {
    sel.value = currentMonthFilter;
  }
  const base = await getTeamSetting('payslip_base');
  document.getElementById('ps-base').value = base != null ? base : '';
  await psRender();
}

async function psSaveBase() {
  await setTeamSetting('payslip_base', String(document.getElementById('ps-base').value || ''));
}
async function psSaveAdv() {
  const m = document.getElementById('ps-month').value;
  await setTeamSetting('payslip_adv_' + m, String(document.getElementById('ps-adv').value || ''));
}

async function psRender() {
  const out = document.getElementById('ps-out');
  const note = document.getElementById('ps-note');
  if (!out) return;
  const month = document.getElementById('ps-month').value;
  const wantSnap = document.getElementById('ps-source').value === 'snap';
  const basis = document.getElementById('ps-basis').value;
  out.innerHTML = '<p class="set-hint" style="padding:10px 12px">Calculating…</p>';

  // Аванси зберігаються помісячно. Підтягуємо їх САМЕ при зміні місяця:
  // якби робили це на кожному перерахунку, щойно введене число затиралось
  // би збереженим просто тому, що курсор уже не в полі.
  const advEl = document.getElementById('ps-adv');
  if (psRender._month !== month) {
    psRender._month = month;
    const advSaved = await getTeamSetting('payslip_adv_' + month);
    advEl.value = advSaved != null ? advSaved : '';
  }

  let src = null, frozenAt = null;
  if (wantSnap) {
    const raw = await getTeamSetting('snapshot_' + month);
    if (raw) { try { src = JSON.parse(raw); frozenAt = src.takenAt; } catch (e) {} }
  }
  const fromSnap = !!src;
  if (!src) src = await mcCompute(month);

  const profit = basis === 'net' ? Number(src.net) || 0 : Number(src.gross) || 0;
  const { total: bonus, idx, rate } = (typeof calcBonus === 'function')
    ? calcBonus(Math.max(0, profit)) : { total: 0, idx: -1, rate: 0 };

  const base = parseFloat(document.getElementById('ps-base').value) || 0;
  const adv  = parseFloat(advEl.value) || 0;
  const pay  = bonus + base - adv;

  const tierLabel = idx >= 0 && bonusTiers && bonusTiers[idx]
    ? (bonusTiers[idx].max_profit != null
        ? `$${Number(bonusTiers[idx].min_profit).toLocaleString()} – $${Number(bonusTiers[idx].max_profit).toLocaleString()}`
        : `$${Number(bonusTiers[idx].min_profit).toLocaleString()}+`)
    : '—';

  const L = (label, val, sub, cls) => `<div class="ps-line ${cls || ''}">
      <span class="l">${label}${sub ? `<span class="sub">${sub}</span>` : ''}</span>
      <span class="r">${val}</span></div>`;

  out.innerHTML =
    L('Profit · ' + (basis === 'net' ? 'net' : 'gross'), psMoney(profit),
      fromSnap ? `frozen snapshot · ${String(frozenAt || '').slice(0, 16).replace('T', ' ')}`
               : 'live numbers — can still change') +
    L('Tier', idx >= 0 ? `${Math.round(rate * 100)}%` : '—', tierLabel) +
    L('Bonus', psMoney(bonus)) +
    (base ? L('Base', psMoney(base)) : '') +
    (adv  ? L('Advances', '−' + psMoney(adv), null, 'minus') : '') +
    L('To pay', psMoney(pay), null, 'total' + (pay < 0 ? ' neg' : ''));

  window.__psText =
    `Payout draft · ${month}\n` +
    `Profit (${basis}): ${psMoney(profit)}${fromSnap ? ' [frozen]' : ' [live]'}\n` +
    `Tier: ${tierLabel} · ${Math.round(rate * 100)}%\n` +
    `Bonus: ${psMoney(bonus)}\n` +
    (base ? `Base: ${psMoney(base)}\n` : '') +
    (adv  ? `Advances: -${psMoney(adv)}\n` : '') +
    `To pay: ${psMoney(pay)}`;

  note.textContent = fromSnap
    ? 'Based on a frozen snapshot — this amount will not change.'
    : (wantSnap
        ? 'No snapshot for this month, so live numbers are used. Freeze the month in Month close to pin the amount.'
        : 'Live numbers: change a payout rate or re-import the data and this amount changes too.');
}

function psCopy() {
  const t = window.__psText || '';
  if (!t) return;
  navigator.clipboard?.writeText(t);
  const b = document.querySelector('#bpanel-slip button[onclick="psCopy()"]');
  if (b) { const old = b.textContent; b.textContent = 'Copied'; setTimeout(() => b.textContent = old, 1200); }
}
