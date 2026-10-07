// ===== Модалка гео → вкладка Costs ====================================
// Решта вкладок модалки — таблиці розрізів усередині одного гео. Ця
// показує, як ціна рухалась по днях місяця: скільки коштував клік,
// інстал, рега і деп.
//
// Джерела різні навмисне. Уся модалка будується з rawData (daily_stats),
// і три з чотирьох ліній беремо звідти ж, щоб цифри сходились із
// сусідніми вкладками. Кліків у daily_stats немає взагалі, тому CPC —
// єдина лінія з creatives_stats. Якщо креативів не залито, три лінії
// однаково працюють.

const GM_METRICS = [
  { key: 'cl', short: 'CPC', label: 'Cost per Click',   unit: 'clicks',   color: '#94A3B8', src: 'cr' },
  { key: 'i',  short: 'CPI', label: 'Cost per Install', unit: 'installs', color: '#22C55E', src: 'daily' },
  { key: 'r',  short: 'CPR', label: 'Cost per Reg',     unit: 'regs',     color: '#3B82F6', src: 'daily' },
  { key: 'd',  short: 'CPD', label: 'Cost per Deposit', unit: 'deps',     color: '#F59E0B', src: 'daily' }
];

window.gmCharts = [];

function gmDestroy() {
  (window.gmCharts || []).forEach(c => { try { c.destroy(); } catch (e) {} });
  window.gmCharts = [];
}

function renderGeoCostTab(geo) {
  gmDestroy();
  const host = document.getElementById('geo-cost-list');
  if (!host) return;

  const G = String(geo || '').toUpperCase();
  const month = currentMonthFilter;
  const inMonth = d => d && String(d).startsWith(month);
  const same = g => String(g || '').toUpperCase() === G;

  // день -> суми. spend тримаємо окремо для кожного джерела: у
  // creatives_stats він свій і з daily_stats не збігається.
  const day = {};
  const at = d => (day[d] || (day[d] = { s: 0, i: 0, r: 0, d: 0, cs: 0, cl: 0 }));

  // rawData — лексичний let у тому ж блоці, а не властивість window
  // (window.rawData не існує взагалі). Беремо через typeof, щоб код не
  // зламався, якщо колись поїде в окремий <script>.
  const daily = (typeof rawData !== 'undefined' && rawData) ? rawData : (window.rawData || []);
  const crea  = (typeof creativesRawData !== 'undefined' && creativesRawData)
    ? creativesRawData : (window.creativesRawData || []);

  daily.forEach(x => {
    if (!inMonth(x.date) || !same(x.geo)) return;
    const m = at(x.date);
    m.s += Number(x.spend)    || 0;
    m.i += Number(x.installs) || 0;
    m.r += Number(x.regs)     || 0;
    m.d += Number(x.deposits) || 0;
  });
  crea.forEach(c => {
    if (!inMonth(c.date) || !same(c.geo)) return;
    const m = at(c.date);
    m.cs += Number(c.spend)  || 0;
    m.cl += Number(c.clicks) || 0;
  });

  const days = Object.keys(day).sort();
  if (!days.length) {
    host.innerHTML = '<div class="text-center py-16 text-xs font-black uppercase tracking-widest opacity-40">'
      + 'No data for ' + G + ' this month</div>';
    return;
  }

  host.innerHTML = GM_METRICS.map(m => `
    <div class="gm-card bg-white/[0.02] border border-white/5 rounded-2xl p-4">
      <div class="flex items-baseline justify-between mb-3">
        <span class="text-[12px] font-black uppercase tracking-widest" style="color:${m.color}">${m.short}</span>
        <span class="text-[9px] text-slate-500 uppercase tracking-widest">${m.label}</span>
      </div>
      <div class="gm-canvas-box"><canvas id="gm-${m.key}"></canvas></div>
      <div id="gm-note-${m.key}" class="text-[9px] text-slate-600 font-bold mt-2 min-h-[12px]"></div>
    </div>`).join('');

  const textMain = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#E9E9EC';
  const gridCol  = 'rgba(255,255,255,.06)';
  const labels   = days.map(d => d.slice(8));   // тільки число місяця

  GM_METRICS.forEach(m => {
    const vals = days.map(d => {
      const v = day[d];
      const spend = m.src === 'cr' ? v.cs : v.s;
      const n = v[m.key];
      // Ділити на нуль не можна, і нуль тут не «безкоштовно», а «даних
      // немає» — Chart.js такі точки просто не малює і рве лінію.
      return n > 0 && spend > 0 ? spend / n : null;
    });

    const have = vals.filter(v => v != null);
    const note = document.getElementById('gm-note-' + m.key);
    if (note) {
      note.textContent = have.length
        ? have.length + ' of ' + days.length + ' days with ' + m.unit
        : 'No ' + m.unit + ' this month';
    }

    const cv = document.getElementById('gm-' + m.key);
    if (!cv) return;
    if (!have.length) {
      cv.parentElement.innerHTML = '<div class="h-full flex items-center justify-center text-[10px] uppercase font-black opacity-25">'
        + 'No ' + m.unit + '</div>';
      return;
    }

    const barCol = m.color;
    const max = Math.max.apply(null, have);

    window.gmCharts.push(new Chart(cv.getContext('2d'), {
      type: 'line',
      plugins: window.cfCrosshair ? [window.cfCrosshair] : [],
      data: {
        labels,
        datasets: [{
          data: vals,
          spanGaps: true,          // день без подій не має рвати лінію навпіл
          borderColor: barCol,
          backgroundColor: cfAlpha(barCol, 0.12),
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: barCol
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 260 },
        layout: { padding: { top: 6 } },
        // Ловити мишею саму точку на 30 днях незручно, тому реагуємо на
        // весь стовпець дня: наводиш будь-де по вертикалі — бачиш цифру.
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          // Підписів над точками навмисне немає: цифра показується при
          // наведенні. Так лінія лишається чистою на будь-якій кількості днів.
          datalabels: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: c => month + '-' + c[0].label,
              label: c => {
                const v = day[days[c.dataIndex]];
                const spend = m.src === 'cr' ? v.cs : v.s;
                return gcMoney(c.parsed.y) + '   ($' + Math.round(spend).toLocaleString()
                     + ' / ' + Number(v[m.key]).toLocaleString() + ' ' + m.unit + ')';
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textMain, font: { size: 9 }, maxTicksLimit: 10 } },
          y: {
            beginAtZero: true,
            grid: { color: gridCol },
            ticks: { color: textMain, font: { size: 9 }, maxTicksLimit: 4, callback: gcAxisFmt(max) }
          }
        }
      }
    }));
  });
}
