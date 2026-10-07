// ===== Geo Breakdown → вкладка Costs ==================================
// Чотири графіки: скільки коштує клік, інстал, рега і деп у кожному гео.
// Рахуємо з creatives_stats — тільки там є clicks.
//
// Гео з нулем у знаменнику не малюємо: «немає депів» — це не «деп коштує
// $0», і нуль у стовпчику збрехав би. Такі гео виписуємо під графіком.

const GC_METRICS = [
  { key: 'cl', short: 'CPC', label: 'Cost per Click',   unit: 'clicks',   color: '#94A3B8' },
  { key: 'i',  short: 'CPI', label: 'Cost per Install', unit: 'installs', color: '#22C55E' },
  { key: 'r',  short: 'CPR', label: 'Cost per Reg',     unit: 'regs',     color: '#3B82F6' },
  { key: 'd',  short: 'CPD', label: 'Cost per Deposit', unit: 'deps',     color: '#F59E0B' }
];

window.gcCharts = [];

function gcDestroy() {
  (window.gcCharts || []).forEach(c => { try { c.destroy(); } catch (e) {} });
  window.gcCharts = [];
}

// CPC і CPD різняться на три порядки, тому одного формату на всіх мало:
// $0.42 без копійок було б нулем, $340.00 — сміттям у два знаки.
function gcMoney(v) {
  if (!isFinite(v)) return '—';
  if (v >= 100) return '$' + Math.round(v);
  if (v >= 10)  return '$' + v.toFixed(1).replace(/\.0$/, '');
  return '$' + v.toFixed(2);
}

// Підписи осі мають бути однакові між собою, інакше в одному ряду стоять
// «$5.00» і «$10.0». Тому точність беремо одну на всю вісь — з її максимуму.
function gcAxisFmt(max) {
  const d = max >= 50 ? 0 : max >= 5 ? 1 : 2;
  return v => '$' + (d ? Number(v).toFixed(d).replace(/\.0$/, '') : Math.round(v));
}

function renderGeoCostWidget(crData, el) {
  gcDestroy();

  const map = {};
  crData.forEach(c => {
    const g = (c.geo || '??').toUpperCase();
    if (!map[g]) map[g] = { cl: 0, i: 0, r: 0, d: 0, s: 0 };
    map[g].cl += Number(c.clicks)   || 0;
    map[g].i  += Number(c.installs) || 0;
    map[g].r  += Number(c.regs)     || 0;
    map[g].d  += Number(c.deps)     || 0;
    map[g].s  += Number(c.spend)    || 0;
  });

  // Довгий хвіст дрібних гео робить стовпчики нечитабельними, а оптимізувати
  // там нічого — лишаємо десятку за спендом.
  const top = Object.entries(map)
    .filter(([, m]) => m.s > 0)
    .sort((a, b) => b[1].s - a[1].s)
    .slice(0, 10);

  if (!top.length) {
    el.innerHTML = '<div class="col-span-2 text-center py-8 opacity-30 text-xs uppercase font-black">No spend in creatives_stats for this month</div>';
    return;
  }

  el.innerHTML = GC_METRICS.map(m => `
    <div class="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
      <div class="flex items-baseline justify-between mb-3">
        <span class="text-[12px] font-black uppercase tracking-widest" style="color:${m.color}">${m.short}</span>
        <span class="text-[9px] text-slate-500 uppercase tracking-widest">${m.label}</span>
      </div>
      <div style="height:${top.length * 28 + 34}px"><canvas id="gc-${m.key}"></canvas></div>
      <div id="gc-none-${m.key}" class="text-[9px] text-slate-600 font-bold mt-2 min-h-[12px]"></div>
    </div>`).join('');

  const textMain = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#E9E9EC';
  const gridCol  = 'rgba(255,255,255,.06)';

  GC_METRICS.forEach(m => {
    // Дешевше — вище: перший рядок графіка це найкраща ціна в місяці.
    const rows = top
      .filter(([, v]) => v[m.key] > 0)
      .map(([geo, v]) => [geo, v.s / v[m.key]])
      .sort((a, b) => a[1] - b[1]);

    const skipped = top.filter(([, v]) => !(v[m.key] > 0)).map(([g]) => g);
    const note = document.getElementById('gc-none-' + m.key);
    if (note) note.textContent = skipped.length ? 'No ' + m.unit + ': ' + skipped.join(', ') : '';

    const barCol = m.color;
    const cv = document.getElementById('gc-' + m.key);
    if (!cv) return;
    if (!rows.length) {
      cv.parentElement.innerHTML = '<div class="h-full flex items-center justify-center text-[10px] uppercase font-black opacity-25">No ' + m.unit + ' this month</div>';
      return;
    }

    window.gcCharts.push(new Chart(cv.getContext('2d'), {
      type: 'bar',
      data: {
        labels: rows.map(r => r[0]),
        datasets: [{
          data: rows.map(r => r[1]),
          // На білому тлі ті самі кольори блякнуть до ледь помітних —
          // у світлій темі підводимо їх до темного і ллємо щільніше.
          backgroundColor: cfAlpha(barCol, 0.5),
          borderColor: barCol,
          borderWidth: 1,
          borderRadius: 4,
          barThickness: 13
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 260 },
        // Підпис стоїть за кінцем стовпця — без цього поля його з'їдає край.
        layout: { padding: { right: 46 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              label: c => {
                const v = map[c.label] || {};
                return gcMoney(c.parsed.x) + '   ($' + Math.round(v.s).toLocaleString()
                     + ' / ' + Number(v[m.key]).toLocaleString() + ' ' + m.unit + ')';
              }
            }
          },
          datalabels: {
            anchor: 'end', align: 'right', offset: 4, clamp: true,
            color: textMain, font: { weight: '700', size: 10 },
            formatter: gcMoney
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: gridCol, drawBorder: false },
            ticks: { color: textMain, font: { size: 9 }, maxTicksLimit: 5,
                     callback: gcAxisFmt(rows[rows.length - 1][1]) }
          },
          y: {
            grid: { display: false, drawBorder: false },
            ticks: { color: textMain, font: { size: 10, weight: '700' } }
          }
        }
      }
    }));
  });
}
