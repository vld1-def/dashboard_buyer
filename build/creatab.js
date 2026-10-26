// ===== ТАБЛИЦЯ КРЕАТИВІВ =====================================
//
// «список з всіх креативів… важно побачити яке крео я лив, яке ні, і
// було б добре сразу туди добавляти крео які є в гугл драйві але
// немає спенда».
//
// Відповідь на це питання вже була порахована в Creative Analyzer
// (фільтр «холодні»), але жила в бічному списку. Тут вона лежить
// таблицею: один рядок — один креатив у одному гео, і спенд 0 сам
// каже, що це крео ще не лилось.
//
// ОДНА ТАБЛИЦЯ, ГЕО КОЛОНКОЮ. Так вибрав власник: вісім гео
// вкладками означало б вісім перемикань, щоб порівняти, а тут усе
// сортується разом за спендом.
//
// БЕЗ КОМЕНТАРІВ І БЕЗ РЕДАГУВАННЯ — теж його рішення: це вигрузка.
// Тому й Google-таблиця відпала: її єдина перевага була в
// редагуванні, а без нього сервісний акаунт і деплой функції не
// купують нічого.

let ctGeo = '';                  // фільтр гео
let ctQ = '';
let ctSort = { key: 's', dir: -1 };
let ctPeriod = 'all';            // 'all' | 'month'
let ctDrive = null;              // null — ще не сканували; [] — сканували
let ctDriveErr = '';
let ctBusy = false;

const ctEsc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const ctNum = v => Number(v) || 0;
const ctMoney = v => '$' + Math.round(v).toLocaleString('en-US');
/* Ціна без знаменника — це не «нуль», а «нема з чого рахувати».
   Нуль у стовпці CPI читався б як «інстал безкоштовний». */
const ctCost = (a, b) => b > 0 ? '$' + (a / b).toFixed(a / b >= 10 ? 1 : 2) : '—';

const CT_COLS = [
  { key: 's',   label: 'Spend',    fmt: r => ctMoney(r.s) },
  { key: 'cl',  label: 'Clicks',   fmt: r => r.cl.toLocaleString('en-US') },
  { key: 'i',   label: 'Installs', fmt: r => r.i.toLocaleString('en-US') },
  { key: 'r',   label: 'Regs',     fmt: r => r.r.toLocaleString('en-US') },
  { key: 'd',   label: 'Deps',     fmt: r => r.d.toLocaleString('en-US') },
  { key: 'cpi', label: 'CPI',      fmt: r => ctCost(r.s, r.i), val: r => r.i > 0 ? r.s / r.i : -1 },
  { key: 'cpa', label: 'CPA',      fmt: r => ctCost(r.s, r.d), val: r => r.d > 0 ? r.s / r.d : -1 }
];

/* ГЕО З ІМЕНІ ФАЙЛА, ПАПКА — ДРУГИМ ДЖЕРЕЛОМ.

   «Якраз в імені гео буде завжди, я спеціально цього притримуюсь, ну
   і як мінімум папка завжди з назвою гео».

   Беремо перший двобуквений кусок імені; якщо його немає — назву
   підпапки. А коли обидва є й РОЗХОДЯТЬСЯ — не вгадуємо молча:
   рядок отримує позначку, і видно, що ім'я каже одне, а папка інше.
   Молчазне вгадування в цьому проєкті вже двічі коштувало дня: з
   колонкою Country у Keitaro і з лендінгами не в тому гео. */
function ctGeoOf(fileName, folder) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '').toUpperCase();
  const byName = (base.split(/[^A-Z0-9]+/).find(t => /^[A-Z]{2}$/.test(t)) || '');
  const byDir = String(folder || '').trim().toUpperCase().split(/[^A-Z0-9]+/)[0] || '';
  const dirGeo = /^[A-Z]{2}$/.test(byDir) ? byDir : '';
  return {
    geo: byName || dirGeo || '—',
    clash: !!(byName && dirGeo && byName !== dirGeo) ? dirGeo : ''
  };
}

/* Файли з Drive разом із підпапкою, у якій лежать. crDriveAll() з
   аналізатора цього не віддає — там папка не потрібна була, а тут без
   неї гео для крео без спенда брати нізвідки. */
async function ctDriveScan() {
  if (typeof teamDriveFolderId === 'undefined' || !teamDriveFolderId)
    throw new Error('not configured');
  const fields = 'fields=' + encodeURIComponent('files(id,name,mimeType,webViewLink)');
  const out = [];
  const seen = new Set();
  const grab = async (parentId, folder) => {
    const q = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
    (await _driveList(`q=${q}&${fields}&pageSize=300`)).forEach(f => {
      if (f.mimeType === 'application/vnd.google-apps.folder') return;
      if (seen.has(f.id)) return;
      seen.add(f.id);
      out.push({ id: f.id, name: f.name, url: f.webViewLink || '', folder });
    });
  };
  await grab(teamDriveFolderId, '');
  for (const sub of await driveSubfolders()) await grab(sub.id, sub.name);
  return out;
}

/* Рядки таблиці. Ключ — КРЕАТИВ + ГЕО: те саме крео в двох гео це два
   різні заливи з різною ціною, і зводити їх в один рядок означало б
   середнє, якого не існує. */
function ctRows() {
  const src = (typeof creativesRawData !== 'undefined' && creativesRawData)
    ? creativesRawData : (window.creativesRawData || []);
  const month = typeof currentMonthFilter === 'string' ? currentMonthFilter : '';
  const map = {};
  const cids = new Set();

  src.forEach(c => {
    const cid = String(c.creative_name || c.creative || c.cid || '').trim();
    if (!cid) return;
    if (ctPeriod === 'month' && month && !String(c.date || '').startsWith(month)) return;
    const geo = String(c.geo || '—').toUpperCase().trim() || '—';
    const k = cid + '\n' + geo;
    const o = map[k] || (map[k] = { cid, geo, s: 0, cl: 0, i: 0, r: 0, d: 0, drive: null, clash: '' });
    o.s  += ctNum(c.spend);
    o.cl += ctNum(c.clicks);
    o.i  += ctNum(c.installs);
    o.r  += ctNum(c.regs);
    o.d  += ctNum(c.deps);
    cids.add(cid.toLowerCase());
  });

  /* Файли з Drive, яких у статистиці немає ВЗАГАЛІ. Саме вони й
     відповідають на «що я ще не лив»: рядок зі спендом 0. */
  (ctDrive || []).forEach(f => {
    const nm = String(f.name).replace(/\.[^.]+$/, '').trim();
    if (!nm || cids.has(nm.toLowerCase())) return;
    const g = ctGeoOf(f.name, f.folder);
    const k = nm + '\n' + g.geo;
    if (map[k]) return;
    map[k] = { cid: nm, geo: g.geo, s: 0, cl: 0, i: 0, r: 0, d: 0,
               drive: f.url || '', clash: g.clash };
  });

  return Object.values(map);
}

function ctGeos(rows) {
  return [...new Set(rows.map(r => r.geo))].sort((a, b) => a.localeCompare(b));
}

function ctView() {
  const all = ctRows();
  const q = ctQ.trim().toLowerCase();
  const rows = all.filter(r =>
    (!ctGeo || r.geo === ctGeo) && (!q || r.cid.toLowerCase().includes(q)));
  const col = CT_COLS.find(c => c.key === ctSort.key);
  const val = r => col ? (col.val ? col.val(r) : r[col.key]) : r.s;
  rows.sort((a, b) => (val(a) - val(b)) * ctSort.dir
    || a.cid.localeCompare(b.cid));
  return { all, rows };
}

function ctRender() {
  const host = document.getElementById('ct-wrap');
  if (!host) return;
  const { all, rows } = ctView();
  const geos = ctGeos(all);
  const tot = rows.reduce((a, r) => {
    ['s', 'cl', 'i', 'r', 'd'].forEach(k => a[k] += r[k]); return a;
  }, { s: 0, cl: 0, i: 0, r: 0, d: 0 });
  const cold = rows.filter(r => r.s === 0).length;
  const arrow = k => ctSort.key === k ? (ctSort.dir < 0 ? ' ↓' : ' ↑') : '';

  host.innerHTML = `
    <div class="ct-bar">
      <select class="ct-in" onchange="ctSetGeo(this.value)">
        <option value="">All geos (${all.length})</option>
        ${geos.map(g => `<option value="${ctEsc(g)}"${g === ctGeo ? ' selected' : ''}>${ctEsc(g)} (${
          all.filter(r => r.geo === g).length})</option>`).join('')}
      </select>
      <input class="ct-in" placeholder="Search creative…" value="${ctEsc(ctQ)}"
        oninput="ctSetQ(this.value)">
      <div class="ct-seg">
        <button class="${ctPeriod === 'all' ? 'is-on' : ''}" onclick="ctSetPeriod('all')"
          title="Усі дні, які є в статистиці">All time</button>
        <button class="${ctPeriod === 'month' ? 'is-on' : ''}" onclick="ctSetPeriod('month')"
          title="Тільки вибраний місяць дашборда">This month</button>
      </div>
      <span class="ct-note">${rows.length} creatives · ${cold} without spend</span>
      <button class="ct-btn" onclick="ctDriveLoad(this)"
        title="Перечитати Google Drive — крео, яких немає в статистиці">${
        ctDrive === null ? '↻ Drive' : '↻ Drive (' + ctDrive.length + ')'}</button>
      <button class="ct-btn" onclick="ctCsv()" title="Завантажити цю таблицю як CSV">⇩ CSV</button>
    </div>
    ${ctDriveErr ? `<p class="ct-err">Drive не прочитався (${ctEsc(ctDriveErr)}) — ${
      /not configured/.test(ctDriveErr)
        ? 'папка команди не вказана: Settings → Integrations'
        : 'крео без спенда в таблиці не буде'}.</p>` : ''}
    <div class="ct-scroll">
      <table class="ct-tbl">
        <thead><tr>
          <th class="ct-l" onclick="ctSortBy('cid')">Creative${arrow('cid')}</th>
          <th class="ct-l" onclick="ctSortBy('geo')">Geo${arrow('geo')}</th>
          ${CT_COLS.map(c => `<th onclick="ctSortBy('${c.key}')">${c.label}${arrow(c.key)}</th>`).join('')}
        </tr></thead>
        <tbody>${rows.length ? rows.map(r => `<tr${r.s === 0 ? ' class="is-cold"' : ''}>
          <td class="ct-l">${r.drive
              ? `<a href="${ctEsc(r.drive)}" target="_blank" rel="noopener">${ctEsc(r.cid)}</a>`
              : ctEsc(r.cid)}</td>
          <td class="ct-l">${ctEsc(r.geo)}${r.clash
              ? `<span class="ct-clash" title="Ім'я файла каже ${ctEsc(r.geo)}, а лежить у папці ${
                  ctEsc(r.clash)} — одне з двох помилка">≠${ctEsc(r.clash)}</span>` : ''}</td>
          ${CT_COLS.map(c => `<td>${c.fmt(r)}</td>`).join('')}
        </tr>`).join('') : `<tr><td class="ct-empty" colspan="${CT_COLS.length + 2}">${
          all.length ? 'За цим фільтром нічого немає.'
                     : 'creatives_stats порожня — залий звіт у Data Hub → Campaigns.'}</td></tr>`}
        </tbody>
        ${rows.length ? `<tfoot><tr>
          <td class="ct-l">Total</td><td class="ct-l">${ctGeo || geos.length + ' geos'}</td>
          <td>${ctMoney(tot.s)}</td><td>${tot.cl.toLocaleString('en-US')}</td>
          <td>${tot.i.toLocaleString('en-US')}</td><td>${tot.r.toLocaleString('en-US')}</td>
          <td>${tot.d.toLocaleString('en-US')}</td>
          <td>${ctCost(tot.s, tot.i)}</td><td>${ctCost(tot.s, tot.d)}</td>
        </tr></tfoot>` : ''}
      </table>
    </div>`;
}

window.ctSetGeo = v => { ctGeo = v; ctRender(); };
window.ctSetQ = v => { ctQ = v; ctRender(); };
window.ctSetPeriod = v => { ctPeriod = v === 'month' ? 'month' : 'all'; ctRender(); };
window.ctSortBy = k => {
  /* Текст сортуємо від А, числа — від більшого: шукають найдорожче, а
     не найдешевше. */
  if (ctSort.key === k) ctSort.dir = -ctSort.dir;
  else ctSort = { key: k, dir: (k === 'cid' || k === 'geo') ? 1 : -1 };
  ctRender();
};

window.ctDriveLoad = async function (btn) {
  if (ctBusy) return;
  ctBusy = true;
  const was = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try { ctDrive = await ctDriveScan(); ctDriveErr = ''; }
  catch (e) { ctDrive = ctDrive || []; ctDriveErr = e.message || String(e); }
  ctBusy = false;
  if (btn) { btn.disabled = false; btn.textContent = was; }
  ctRender();
};

/* CSV — рівно ті рядки й стовпці, що на екрані. Вигрузка, яка не
   збігається з тим, що видно, гірша за її відсутність. */
window.ctCsv = function () {
  const { rows } = ctView();
  const head = ['Creative', 'Geo'].concat(CT_COLS.map(c => c.label));
  const cell = v => /[",;\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const body = rows.map(r => [r.cid, r.geo]
    .concat(CT_COLS.map(c => c.fmt(r).replace(/[$,]/g, ''))).map(cell).join(','));
  const blob = new Blob(['﻿' + [head.join(','), ...body].join('\n')],
    { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'creatives' + (ctGeo ? '-' + ctGeo : '') + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

/* Показ/ховання. Drive скануємо на ПЕРШОМУ відкритті й більше не
   тягнемо: це десяток запитів до Google, і робити їх на кожне
   перемикання вкладки означало б чекати щоразу. */
window.ctShow = function () {
  document.getElementById('sh-frame')?.classList.add('hidden');
  document.getElementById('sh-empty')?.classList.add('hidden');
  document.getElementById('ct-wrap')?.classList.remove('hidden');
  const open = document.getElementById('sh-open');
  if (open) open.style.display = 'none';
  ctRender();
  if (ctDrive === null) ctDriveLoad(null);
};
window.ctHide = function () {
  document.getElementById('ct-wrap')?.classList.add('hidden');
};
