/* ══════════════════════════════════════════════════════════════════
   Cashflow Overview.
   Daily — spend і net profit одним рядом; над точками підписи сум.
   Geo   — одна лінія на кожне гео, по днях (спенд за день).
   Вигляд (стовпчики / лінія / гостра / область) береться з налаштувань.
   ══════════════════════════════════════════════════════════════════ */

const CF_SPEND = '#EAB308', CF_PROFIT = '#22C55E', CF_LOSS = '#EF4444';
const CF_GEO_COLORS = ['#8B5CF6', '#22C55E', '#EAB308', '#3B82F6', '#EC4899',
                       '#22D3EE', '#F97316', '#A3E635', '#F43F5E', '#60A5FA'];

// Вертикальна пунктирна лінія під курсором — щоб було видно, на якій даті стоїш.
const cfCrosshair = {
  id: 'cfCrosshair',
  afterDatasetsDraw(chart) {
    const act = chart.tooltip && chart.tooltip._active;
    if (!act || !act.length) return;
    const x = act[0].element.x;
    const { top, bottom } = chart.chartArea;
    const c = chart.ctx;
    c.save();
    c.setLineDash([4, 4]);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,255,255,.38)';
    c.beginPath();
    c.moveTo(x, top);
    c.lineTo(x, bottom);
    c.stroke();
    c.restore();
  }
};
window.cfCrosshair = cfCrosshair;

// Вигляд графіка вибирається в налаштуваннях і живе в localStorage
function cfStyle() {
  const v = localStorage.getItem('chart_style');
  return ['bars', 'line', 'sharp', 'area'].includes(v) ? v : 'bars';
}

function cfAlpha(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1],16)}, ${parseInt(m[2],16)}, ${parseInt(m[3],16)}, ${a})`;
}

// Заливка area-графіка: вертикальний градієнт від повного кольору під лінією
// до повної прозорості внизу. Chart.js дає область побудови тільки після
// першого макета, тому це scriptable-колбек, а не готове значення.
function cfGradient(chart, color) {
  const area = chart.chartArea;
  if (!area || !area.bottom) return cfAlpha(color, 0.18);  // перший кадр
  const key = color + '|' + Math.round(area.top) + '|' + Math.round(area.bottom);
  const cache = chart._cfGrad || (chart._cfGrad = {});
  if (cache[key]) return cache[key];
  // Заливка в повний колір різала очі й глушила лінію та сітку під собою.
  // Тому колір заливки трохи зводимо до тла, а вгорі лишаємо 0.62 замість 1:
  // площа читається, але не перебиває саму лінію, яка лишилась яскравою.
  const soft = cfMix(color, cfSurface(), 0.32);
  const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, cfAlpha(soft, 0.62));
  g.addColorStop(0.55, cfAlpha(soft, 0.26));
  g.addColorStop(1, cfAlpha(soft, 0));
  cache[key] = g;
  return g;
}

// Колір тла картки: у темній темі мішаємо до нього, у світлій — до білого.
function cfSurface() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#0E0E12';
}

// Лінійне змішування двох hex-кольорів: t = 0 лишає перший, t = 1 дає другий.
function cfMix(a, b, t) {
  const hex = h => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
    return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : null;
  };
  const A = hex(a), B = hex(b);
  if (!A || !B) return a;
  const c = i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  return '#' + c(0) + c(1) + c(2);
}

// Штрихування як у макеті: діагональні смуги всередині стовпця.
function cfStripe(ctx, color) {
  const key = '_cfpat_' + color;
  if (window[key]) return window[key];
  const c = document.createElement('canvas');
  c.width = c.height = 10;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, 10, 10);
  x.strokeStyle = 'rgba(0,0,0,.20)';
  x.lineWidth = 3.5;
  x.beginPath(); x.moveTo(-3, 13); x.lineTo(13, -3);
  x.moveTo(2, 18); x.lineTo(18, 2);
  x.moveTo(-8, 8); x.lineTo(8, -8);
  x.stroke();
  const pat = ctx.createPattern(c, 'repeat');
  window[key] = pat;
  return pat;
}

function cfMoney(v) {
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

// Підпис над точкою: місця мало, але $1K замість $1 234 — надто грубо.
// Тому до 10K лишаємо один знак після коми.
/* СКІЛЬКИ МІСЦЯ ПРОСИТЬ КРАЙНІЙ ПІДПИС.

   Підпис над точкою центрований по ній, а перша й остання точки
   стоять рівно на межі області побудови. Половина числа тому виходить
   за межу й зрізається краєм полотна. clamp: true тут не рятує — він
   притискає ЯКІР, а не сам напис.

   Тому міряємо текст тим самим шрифтом, яким його малюватимуть, і
   лишаємо збоку його половину. Прибити константою не можна: «$8» і
   «-$128.4K» просять різного, і будь-яке одне число або зріже довге,
   або лишить діру біля короткого. */
function cfEdgePad(ctx, texts) {
  const was = ctx.font;
  const fam = (getComputedStyle(document.body).fontFamily || 'sans-serif');
  ctx.font = '700 10px ' + fam;
  let w = 0;
  texts.forEach(t => {
    if (t == null || t === '') return;
    w = Math.max(w, ctx.measureText(String(t)).width);
  });
  ctx.font = was;
  // +2 — щоб літера не впиралась у край впритул.
  return w ? Math.ceil(w / 2) + 2 : 0;
}

function cfMoneyTight(v) {
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${sign}$${Math.round(a / 1e3)}K`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(a)}`;
}

function renderTrend(data) {
  const el = document.getElementById('chart-trend');
  if (!el || !data.length) return;
  if (window.chart1) window.chart1.destroy();
  const ctx = el.getContext('2d');

  const daysUA = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const blank = () => ({ s: 0, r: 0, d: 0, i: 0, rev: 0 });
  const add = (o, row) => {
    o.s += Number(row.spend) || 0;
    o.r += Number(row.regs) || 0;
    o.d += Number(row.deposits) || 0;
    o.i += Number(row.installs) || 0;
    o.rev += (typeof revenueOf === 'function' ? revenueOf(row) : 0);
  };

  const sd = [...new Set(data.map(d => d.date))].sort();
  const labels = sd.map(d => {
    const dt = new Date(d);
    return `${dt.getDate()} (${daysUA[dt.getDay()]})`;
  });

  const style = cfStyle();
  const isGeo = currentChartMode === 'geo';
  // У режимі гео стовпчики на кожне гео × кожен день зливаються в кашу,
  // тому там завжди лінії — як і було в оригіналі.
  const isBar = style === 'bars' && !isGeo;

  const muted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#8A8A95';
  const textMain = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#E9E9EC';
  const gridC = 'rgba(255,255,255,.055)';

  const shape = (color, perPoint) => isBar
    ? {
        backgroundColor: perPoint || cfStripe(ctx, color),
        borderWidth: 0, borderRadius: 8, borderSkipped: false,
        barPercentage: 0.7, categoryPercentage: 0.76
      }
    : {
        borderColor: color,
        // Градієнт — лише коли площа справді заливається; для звичайних ліній
        // backgroundColor йде в легенду й тултип, там градієнт зайвий.
        backgroundColor: style === 'area' && !isGeo
          ? (c => cfGradient(c.chart, color))
          : cfAlpha(color, 0.18),
        borderWidth: 2.5,
        tension: style === 'sharp' ? 0 : 0.38,
        fill: style === 'area' && !isGeo,
        pointRadius: 2.5,
        pointHoverRadius: 4,
        pointBackgroundColor: color,
        pointBorderWidth: 0
      };

  let datasets, stats = null;
  // Береги під крайні підписи. У режимі гео підписів немає — беруться типові.
  let padL = 2, padR = 8;

  if (!isGeo) {
    const m = {};
    sd.forEach(d => m[d] = blank());
    data.forEach(row => { if (m[row.date]) add(m[row.date], row); });
    stats = sd.map(d => m[d]);

    const profits = stats.map(v => Math.round(v.rev - v.s));

    /* Міряємо обидва набори, а не лише видимий: легенда перемикає їх
       на льоту, і берег, розрахований під один, зрізав би інший. */
    const spends = stats.map(v => Math.round(v.s));
    const edge = (arr, i) => (arr.length ? cfMoneyTight(Number(arr[i])) : '');
    padL = Math.max(padL, cfEdgePad(ctx, [edge(spends, 0), edge(profits, 0)]));
    padR = Math.max(padR, cfEdgePad(ctx,
      [edge(spends, spends.length - 1), edge(profits, profits.length - 1)]));

    // Підписи над точками: поки видно spend — його суми; якщо spend вимкнули
    // в легенді, а net profit лишили — тоді суми профіту.
    const labelFor = idx => ({
      display: c => {
        const ch = c.chart;
        const spendOn = ch.isDatasetVisible(0);
        return idx === 0 ? spendOn : (!spendOn && ch.isDatasetVisible(1));
      },
      anchor: 'end',
      align: c => (Number(c.dataset.data[c.dataIndex]) < 0 ? 'bottom' : 'top'),
      offset: 2,
      clamp: true,
      color: textMain,
      font: { weight: '700', size: 10 },
      formatter: v => cfMoneyTight(Number(v))
    });

    datasets = [
      {
        label: 'Spend',
        data: stats.map(v => Math.round(v.s)),
        datalabels: labelFor(0),
        ...shape(CF_SPEND)
      },
      {
        label: 'Net Profit',
        data: profits,
        datalabels: labelFor(1),
        ...shape(CF_PROFIT, isBar
          ? (c => cfStripe(ctx, profits[c.dataIndex] >= 0 ? CF_PROFIT : CF_LOSS))
          : null)
      }
    ];
  } else {
    // Одна лінія на гео, по днях. Найбільші за спендом — першими.
    const totals = {};
    data.forEach(row => {
      const g = (row.geo || '??').toUpperCase().trim();
      totals[g] = (totals[g] || 0) + (Number(row.spend) || 0);
    });
    const geos = Object.keys(totals).sort((a, b) => totals[b] - totals[a]).slice(0, 10);

    const perGeo = {};
    geos.forEach(g => { perGeo[g] = {}; sd.forEach(d => perGeo[g][d] = blank()); });
    data.forEach(row => {
      const g = (row.geo || '??').toUpperCase().trim();
      if (perGeo[g] && perGeo[g][row.date]) add(perGeo[g][row.date], row);
    });

    datasets = geos.map((g, i) => {
      const color = CF_GEO_COLORS[i % CF_GEO_COLORS.length];
      const series = sd.map(d => perGeo[g][d]);
      return {
        label: g,
        data: series.map(v => Math.round(v.s)),
        allStats: series,
        datalabels: { display: false },
        ...shape(color)
      };
    });
  }

  // --- ФІКС НАВЕДЕННЯ ПІД body{zoom:0.9} ---
  // Chart.js бере позицію курсора з offsetX, а той під CSS zoom рахується в іншому
  // масштабі, ніж розміри канваса. Рахуємо позицію самі — з clientX і
  // getBoundingClientRect(), тож масштаб уже не має значення.
  if (!window._chartZoomFix) {
    window._chartZoomFix = true;
    Chart.register({
      id: 'zoomFix',
      beforeEvent(chart, args) {
        const ev = args.event, ne = ev && ev.native;
        if (!ne) return;
        const src = (ne.touches && ne.touches[0]) || ne;
        if (src.clientX == null) return;
        const r = chart.canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        ev.x = Math.round((src.clientX - r.left) / r.width * chart.width);
        ev.y = Math.round((src.clientY - r.top) / r.height * chart.height);
        args.inChartArea = chart.isPointInArea(ev);
      }
    });
  }

  window.chart1 = new Chart(ctx, {
    type: isBar ? 'bar' : 'line',
    plugins: [cfCrosshair],
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 18, bottom: 0, left: padL, right: padR } },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: muted, usePointStyle: true, pointStyle: 'rectRounded',
            boxWidth: 8, boxHeight: 8, padding: 14,
            font: { weight: '700', size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(18, 18, 22, 0.97)',
          borderColor: 'rgba(139, 92, 246, 0.35)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          /* Показуємо тільки ті гео, де в цей день був спенд. Нуль
             означає «нічого не крутили», і блок про нього — шість
             рядків нулів, які лише відсувають потрібне. Коли не
             крутило жодне, під фільтр не проходить ніхто, і тултіпа
             немає зовсім — саме так і треба. */
          filter(item) {
            if (!isGeo) return true;
            const v = (item.dataset.allStats || [])[item.dataIndex];
            return !!v && v.s > 0;
          },
          callbacks: {
            label(c) {
              const v = isGeo ? (c.dataset.allStats || [])[c.dataIndex]
                              : (c.datasetIndex === 0 ? stats[c.dataIndex] : null);
              if (!v) return null;
              const profit = v.rev - v.s;
              const cpl = v.r > 0 ? (v.s / v.r).toFixed(1) : 0;
              const cpa = v.d > 0 ? (v.s / v.d).toFixed(1) : 0;
              const cpi = v.i > 0 ? (v.s / v.i).toFixed(1) : 0;
              const head = isGeo ? ` \u{1F4CD} ${c.dataset.label}` : ' \u{1F4CD} TOTAL';
              return [
                head,
                ` 💰 Spend: $${Math.round(v.s).toLocaleString()}`,
                ` 🏦 Revenue: $${Math.round(v.rev).toLocaleString()}`,
                ` 📈 Net Profit: ${profit >= 0 ? '+' : '−'}$${Math.abs(Math.round(profit)).toLocaleString()}` +
                  (v.s > 0 ? `  ·  ROI ${Math.round(profit / v.s * 100)}%` : ''),
                ` 📲 Inst: ${v.i}   📝 Reg: ${v.r}   🎯 Dep: ${v.d}`,
                ` 💵 CPI: $${cpi} | CPL: $${cpl} | CPA: $${cpa}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: muted, font: { weight: '600', size: 11 } },
          grid: { display: false },
          border: { display: false }
        },
        y: {
          ticks: { color: muted, font: { weight: '600', size: 11 }, callback: v => cfMoney(v) },
          grid: { color: gridC },
          border: { display: false }
        }
      }
    }
  });
}
