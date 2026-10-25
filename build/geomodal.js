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

/* ГРОШІ ПЕРЕД ЦІНАМИ.

   «додай ще два міні графіки, спенд і профіт». Спершу вони поїхали в
   блок Geo Breakdown на дашборді — не туди: тим блоком ніхто не
   користується, а відкривають саме це вікно, кліком по гео. Тому
   спенд і профіт стоять тут, і стоять ПЕРШИМИ: питання «скільки
   вклали і скільки знялось» передує питанню «скільки коштував деп».

   Стовпчики, а не лінії: профіт переходить нуль, і на стовпчиках це
   видно кольором та напрямком, без окремої осі. Ціни нижче лишаються
   лініями — вони нуль не переходять. */
const GM_MONEY = [
  { key: 'spend',  short: 'Spend',  label: 'Spend per day',   color: '#F43F5E' },
  { key: 'profit', short: 'Profit', label: 'Revenue − spend', color: '#10B981' }
];

const GM_METRICS = [
  { key: 'cl', short: 'CPC', label: 'Cost per Click',   unit: 'clicks',   color: '#94A3B8', src: 'cr' },
  { key: 'i',  short: 'CPI', label: 'Cost per Install', unit: 'installs', color: '#22C55E', src: 'daily' },
  { key: 'r',  short: 'CPR', label: 'Cost per Reg',     unit: 'regs',     color: '#3B82F6', src: 'daily' },
  { key: 'd',  short: 'CPD', label: 'Cost per Deposit', unit: 'deps',     color: '#F59E0B', src: 'daily' }
];

/* Два форматувальники переїхали сюди з geocost.js — того віджета вже
   немає (блок Geo Breakdown на дашборді прибраний), а формати
   лишились потрібні саме тут. */

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

window.gmCharts = [];

function gmDestroy() {
  (window.gmCharts || []).forEach(c => { try { c.destroy(); } catch (e) {} });
  window.gmCharts = [];
}

/* gcMoney не знає знака: −$1200 виходило «$-1200.00». Профіт мінусовий
   буває частіше, ніж хотілось би, тому формат окремий. */
const gmMoney = v => (!isFinite(v) ? '—' : (v < 0 ? '−' : '') + gcMoney(Math.abs(v)));

function renderGeoCostTab(geo) {
  const host = document.getElementById('geo-cost-list');
  if (!host) return;
  if (!cfWait(host, () => renderGeoCostTab(geo))) return;
  gmDestroy();

  const G = String(geo || '').toUpperCase();
  const month = currentMonthFilter;
  const inMonth = d => d && String(d).startsWith(month);
  const same = g => String(g || '').toUpperCase() === G;

  // день -> суми. spend тримаємо окремо для кожного джерела: у
  // creatives_stats він свій і з daily_stats не збігається.
  const day = {};
  const at = d => (day[d] || (day[d] = { s: 0, i: 0, r: 0, d: 0, cs: 0, cl: 0, rev: 0 }));

  // rawData — лексичний let у тому ж блоці; window.rawData тримається
  // синхронно з ним (loadData), але не був там завжди. Беремо через typeof, щоб код не
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
    /* Виручку беремо тією САМОЮ функцією, що й KPI-картка: модель
       виплат (CPA чи % від спенду) живе в ній одній, і другий
       підрахунок тут розійшовся б із профітом на дашборді. */
    m.rev += (typeof revenueOf === 'function' ? revenueOf(x) : 0);
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

  const card = (m, pre) => `
    <div class="gm-card bg-white/[0.02] border border-white/5 rounded-2xl p-4">
      <div class="flex items-baseline justify-between mb-3">
        <span class="text-[12px] font-black uppercase tracking-widest" style="color:${m.color}">${m.short}</span>
        <span class="text-[9px] text-slate-500 uppercase tracking-widest">${m.label}</span>
      </div>
      <div class="gm-canvas-box"><canvas id="${pre}-${m.key}"></canvas></div>
      <div id="${pre}-note-${m.key}" class="text-[9px] text-slate-600 font-bold mt-2 min-h-[12px]"></div>
    </div>`;

  host.innerHTML = GM_MONEY.map(m => card(m, 'gmm')).join('')
                 + GM_METRICS.map(m => card(m, 'gm')).join('');

  const textMain = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#E9E9EC';
  const gridCol  = 'rgba(255,255,255,.06)';
  const labels   = days.map(d => d.slice(8));   // тільки число місяця

  /* ─────────── спенд і профіт по днях ─────────── */
  GM_MONEY.forEach(m => {
    const vals = days.map(d => m.key === 'spend' ? day[d].s : day[d].rev - day[d].s);
    const live = vals.filter(v => v !== 0);
    const note = document.getElementById('gmm-note-' + m.key);
    const sum  = vals.reduce((a, b) => a + b, 0);
    if (note) {
      /* Підпис називає ТОТАЛ, а не кількість днів: на спенді й профіті
         перше питання саме «скільки всього», і без нього довелось би
         складати стовпчики очима. Для профіту ще й звідки він узявся —
         інакше «−$300» виглядає як помилка, а не як мінус. */
      const rev = days.reduce((a, d) => a + day[d].rev, 0);
      const spd = days.reduce((a, d) => a + day[d].s, 0);
      /* ВИРУЧКА В НУЛІ ПРИ ЖИВОМУ СПЕНДІ — майже завжди незаведена
         виплата, а не провал. Без цього рядка графік показує мінус на
         весь спенд, і виглядає це як катастрофа, хоча насправді
         бракує одного числа в налаштуваннях. */
      const noPay = rev === 0 && spd > 0;
      note.textContent = m.key === 'spend'
        ? gmMoney(sum) + ' total · ' + live.length + ' of ' + days.length + ' days with spend'
        : gmMoney(sum) + ' total · revenue ' + gmMoney(rev) + ' − spend ' + gmMoney(spd)
          + (noPay ? ' · revenue is zero: set the payout for ' + G + ' in Settings' : '');
    }
    const cv = document.getElementById('gmm-' + m.key);
    if (!cv) return;
    /* Нуль на всіх днях — це не графік, а порожнє полотно з віссю.
       Для профіту нуль буває й законний (виплати не заведені), тому
       кажемо, ЧОГО бракує, а не просто «немає даних». */
    if (!live.length) {
      cv.parentElement.innerHTML = '<div class="h-full flex items-center justify-center text-center px-3'
        + ' text-[10px] uppercase font-black opacity-25">'
        + (m.key === 'spend' ? 'No spend this month' : 'Zero every day: revenue equals spend')
        + '</div>';
      return;
    }

    const pos = cfAlpha(m.color, 0.75), neg = 'rgba(244,63,94,.75)';
    window.gmCharts.push(new Chart(cv.getContext('2d'), {
      type: 'bar',
      plugins: window.cfCrosshair ? [window.cfCrosshair] : [],
      data: {
        labels,
        datasets: [{
          data: vals,
          // Мінусовий день фарбуємо окремо: на профіті це головне, що
          // треба побачити, і однаковий колір у плюса й мінуса
          // примушував би читати напрямок стовпчика.
          backgroundColor: vals.map(v => v < 0 ? neg : pos),
          borderRadius: 3,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 260 },
        layout: { padding: { top: 6 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: c => month + '-' + c[0].label,
              label: c => {
                const v = day[days[c.dataIndex]];
                return m.key === 'spend'
                  ? gmMoney(v.s)
                  : gmMoney(v.rev - v.s) + '   (' + gmMoney(v.rev) + ' − ' + gmMoney(v.s) + ')';
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textMain, font: { size: 9 }, maxTicksLimit: 10 } },
          y: {
            grid: { color: gridCol },
            ticks: { color: textMain, font: { size: 9 }, maxTicksLimit: 4, callback: gmMoney }
          }
        }
      }
    }));
  });

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
