<script>
/* ══════════════════════════════════════════════════════════════════
   ПРАВИЛА АВТОМАТИЧНОГО ВИМИКАННЯ — сторона дашборда

   Тут лише редактор і журнал. Рішення ухвалює функція fb-rules за
   розкладом: браузер для цього не годиться — його закривають.

   Правила лежать у team_settings під ключем fb_rules, одним об'єктом:
   { rules: [...] }. Окремої таблиці немає навмисно
   — правил одиниці, вони цілком налаштування, і зайвий SQL-крок при
   встановленні коштував би дорожче за користь.

   ІМЕНА МЕТРИК МУСЯТЬ ЗБІГАТИСЬ із METRICS у функції. Розійдуться — і
   правило тихо перестане перевірятись: функція просто відкине умову з
   незнайомою метрикою. Тому список тут один і той самий, і будь-яка
   зміна робиться в двох місцях одночасно.
   ══════════════════════════════════════════════════════════════════ */

/* Підказки тут не прикраса. Під словом CTR у Facebook живуть дві різні
   цифри: «CTR (all)» рахує будь-який клік по оголошенню, «CTR (link
   click-through rate)» — лише переходи за посиланням. Ми міряємо друге,
   і воно в рази менше. Поріг, виставлений за першою міркою, вимикає
   геть усе, що перейшло поріг спенду, — і виглядає це як поломка
   правил, хоч правило чесно зробило, що написано. */
const RL_METRICS = [
  { k: 'cpc_link',    label: 'Cost per link click', money: true,
    tip: 'Spend ÷ link clicks' },
  { k: 'cpl',         label: 'Cost per lead',       money: true,
    tip: 'Spend ÷ leads. A lead is the pixel lead event' },
  { k: 'cpm',         label: 'CPM',                 money: true,
    tip: 'Spend per 1000 impressions' },
  { k: 'spend',       label: 'Spend today',         money: true,
    tip: 'Spent today, in the account currency' },
  { k: 'ctr_link',    label: 'Link CTR, %',
    tip: 'Link clicks ÷ impressions, in percent — not Facebook’s “CTR (all)”, '
       + 'which also counts likes and clicks on the page. Usually under 5%, '
       + 'so a threshold like 30 matches almost everything' },
  { k: 'leads',       label: 'Leads',
    tip: 'Pixel lead events today' },
  /* Реєстрація й покупка — ті самі числа, що в колонках Reg і Result
     у Кампаніях. Facebook віддає кожну з них кількома іменами одразу
     (complete_registration і offsite_conversion.fb_pixel_complete_
     registration — це та сама реєстрація), тож рахується найточніший
     збіг і тільки він: складені, вони дали б подвійне число. */
  { k: 'cpr',         label: 'Cost per registration', money: true,
    tip: 'Spend ÷ registrations. Spent something and got none — the cost is ∞, '
       + 'so a rule like “> $5” catches it' },
  { k: 'regs',        label: 'Registrations',
    tip: 'Completed registrations today. No registration event at all counts as 0, '
       + 'not as “unknown”' },
  { k: 'cpp',         label: 'Cost per purchase', money: true,
    tip: 'Spend ÷ purchases. Spent something and got none — the cost is ∞' },
  { k: 'purchases',   label: 'Purchases',
    tip: 'Purchase events today' },
  { k: 'link_clicks', label: 'Link clicks',
    tip: 'Clicks that went to the link, not every click on the ad' },
  { k: 'imps',        label: 'Impressions' }
];
const RL_OPS = ['>', '>=', '<', '<=', '='];
const RL_LEVELS = [
  { k: 'ad',       label: 'Ad' },
  { k: 'adset',    label: 'Ad set' },
  { k: 'campaign', label: 'Campaign' }
];
/* Те, що Facebook називає конверсіями. Список навмисно короткий: усе
   інше (перегляди, реакції) лідом не є, і мовчки додавати його в
   знаменник ціни ліда означало б робити правила безглуздими. */
let rlRules = [], rlEdit = null, rlLog = [], rlLoaded = false;

const rlEsc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/* ── ПАНЕЛЬ ПРАВОРУЧ, а не сторінка ──
   Правила про той самий парк кабінетів, тож і живуть на його сторінці —
   поруч із карткою кабінета й тим самим рухом: натиснув, воно виїхало.
   Праве місце одне, тому картка кабінета при цьому закривається: дві
   панелі поруч розчавили б таблицю, заради якої сторінку й відкривали. */
window.rlPanel = function (want) {
  const box = document.getElementById('rules-panel');
  if (!box) return;
  const open = want === undefined ? box.classList.contains('hidden') : !!want;
  box.classList.toggle('hidden', !open);
  document.getElementById('cab-rules-btn')?.classList.toggle('is-on', open);
  if (open) {
    if (typeof cabSel !== 'undefined' && cabSel) { cabSel = null; cabRender(); }
    rlInit();
  }
};

window.rlInit = async function () {
  if (rlLoaded) { rlPaint(); return; }
  rlLoaded = true;
  try {
    const raw = await getTeamSetting('fb_rules');
    const v = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    rlRules = Array.isArray(v.rules) ? v.rules : [];
  } catch (e) { /* немає налаштування — починаємо з чистого */ }
  rlPaint();
  rlLogLoad();
};

async function rlSave() {
  await setTeamSetting('fb_rules', JSON.stringify({ rules: rlRules }));
  if (typeof setSaved === 'function') setSaved();
}

/* Журнал. Таблиці може ще не бути — тоді просто кажемо про це, а не
   ховаємо порожній блок: інакше «чому тут нічого» лишилось би без
   відповіді. */
async function rlLogLoad() {
  const box = document.getElementById('rl-log');
  if (!box) return;
  try {
    const { data, error } = await sb.from('fb_rule_log')
      .select('at,rule_name,level,entity_name,entity_id,account_id,metrics,dry,ok,error')
      .order('at', { ascending: false }).limit(40);
    if (error) throw new Error(error.message);
    rlLog = data || [];
  } catch (e) {
    box.innerHTML = /fb_rule_log|does not exist|schema cache/i.test(e.message)
      ? '<p class="rl-empty">No history table yet — run FB_RULES.sql and it starts filling by itself.</p>'
      : '<p class="rl-empty">Could not read the history: ' + rlEsc(e.message) + '</p>';
    return;
  }
  rlLogPaint();
}

function rlLogPaint() {
  const box = document.getElementById('rl-log');
  if (!box) return;
  if (!rlLog.length) {
    box.innerHTML = '<p class="rl-empty">Nothing yet. Either no rule matched, or none of them ran.</p>';
    return;
  }
  const money = v => '$' + (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-US');
  box.innerHTML = rlLog.map(r => {
    const m = r.metrics || {};
    const cpc = Number(m.linkClicks) > 0 ? money(m.spend / m.linkClicks) : '∞';
    const cpl = Number(m.leads) > 0 ? money(m.spend / m.leads) : '∞';
    const mark = r.dry ? '\u{1F441}' : r.ok ? '⛔' : '⚠';
    return `<div class="rl-log-row ${r.dry ? 'is-dry' : r.ok ? '' : 'is-bad'}">
      <span class="rl-log-m">${mark}</span>
      <span class="rl-log-n" title="${rlEsc(r.entity_id)}${r.account_id ? ' · cab ' + rlEsc(r.account_id) : ''}">${rlEsc(r.entity_name || r.entity_id)}</span>
      <span class="rl-log-lv">${rlEsc(r.level)}</span>
      <span class="rl-log-x">${money(m.spend)} · click ${cpc} · lead ${cpl} · ${Number(m.leads) || 0} lead(s)</span>
      <span class="rl-log-r">${rlEsc(r.rule_name)}</span>
      <span class="rl-log-t">${String(r.at || '').slice(0, 16).replace('T', ' ')}</span>
      ${r.error ? `<span class="rl-log-e">${rlEsc(r.error)}</span>` : ''}
    </div>`;
  }).join('');
}

/* Людською мовою — щоб список правил читався, а не розшифровувався. */
function rlWords(r) {
  const one = (c) => {
    const m = RL_METRICS.find(x => x.k === c.m);
    const v = m && m.money ? '$' + c.v : c.v;
    return (m ? m.label : c.m) + ' ' + c.op + ' ' + v;
  };
  return (r.when || []).map(one).join(r.match === 'any' ? '  OR  ' : '  AND  ');
}

function rlPaint() {
  const box = document.getElementById('rl-list');
  if (!box) return;
  if (!rlRules.length && rlEdit == null) {
    box.innerHTML = '<p class="rl-empty">No rules yet. Press “+ Rule” — the first one starts in report-only mode.</p>';
    return;
  }
  box.innerHTML = rlRules.map((r, i) => i === rlEdit ? rlForm(r, i) : `
    <div class="rl-row ${r.on === false ? 'is-off' : ''}">
      <div class="rl-row-top">
        <span class="rl-name">${rlEsc(r.name || 'rule')}</span>
        <span class="rl-tag ${r.dry === false ? 'is-live' : ''}">${r.dry === false ? 'live' : 'report only'}</span>
        <span class="rl-tag">${rlEsc((RL_LEVELS.find(l => l.k === r.level) || RL_LEVELS[0]).label)}</span>
        ${r.on === false ? '<span class="rl-tag is-dim">off</span>' : ''}
        <span class="rl-row-acts">
          <button type="button" class="rl-mini" onclick="rlToggle(${i})">${r.on === false ? 'Enable' : 'Disable'}</button>
          <button type="button" class="rl-mini" onclick="rlOpen(${i})">Edit</button>
          <button type="button" class="rl-mini is-bad" onclick="rlDrop(${i})">Delete</button>
        </span>
      </div>
      <div class="rl-when">${rlEsc(rlWords(r))}</div>
      <div class="rl-scope">from $${rlEsc(r.minSpend == null ? 10 : r.minSpend)} spent${
        (r.geo || []).length ? ' · geo ' + rlEsc(r.geo.join('/')) : ''}${
        r.nameHas ? ' · FB name has “' + rlEsc(r.nameHas) + '”' : ''}${
        (r.cabs && r.cabs.length) ? ' · ' + r.cabs.length + ' cabinet(s)' : ' · all cabinets'}</div>
    </div>`).join('') + (rlEdit === -1 ? rlForm(rlBlank(), -1) : '');
}

function rlBlank() {
  return { id: 'r' + Date.now().toString(36), name: '', on: true, dry: true,
           level: 'ad', match: 'all', minSpend: 10,
           when: [{ m: 'cpc_link', op: '>', v: 1.5 }], cabs: [], nameHas: '', geo: [] };
}

function rlForm(r, i) {
  const cond = (c, k) => `<div class="rl-cond">
      <select class="rl-in" data-f="m" data-k="${k}"
        title="${rlEsc((RL_METRICS.find(m => m.k === c.m) || {}).tip || '')}">
        ${RL_METRICS.map(m => `<option value="${m.k}" ${c.m === m.k ? 'selected' : ''}>${m.label}</option>`).join('')}
      </select>
      <select class="rl-in is-op" data-f="op" data-k="${k}">
        ${RL_OPS.map(o => `<option value="${o}" ${c.op === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
      <input class="rl-in is-num" data-f="v" data-k="${k}" type="number" step="0.01" value="${rlEsc(c.v)}">
      ${(r.when.length > 1) ? `<button type="button" class="rl-mini is-bad" onclick="rlCondDrop(${k})">✕</button>` : ''}
    </div>`;
  return `<div class="rl-form" id="rl-form">
    <div class="rl-form-top">
      <input class="rl-in is-wide" id="rl-f-name" placeholder="Rule name — e.g. Expensive link clicks" value="${rlEsc(r.name)}">
      <select class="rl-in" id="rl-f-level">
        ${RL_LEVELS.map(l => `<option value="${l.k}" ${r.level === l.k ? 'selected' : ''}>${l.label}</option>`).join('')}
      </select>
      <select class="rl-in" id="rl-f-match">
        <option value="all" ${r.match !== 'any' ? 'selected' : ''}>AND</option>
        <option value="any" ${r.match === 'any' ? 'selected' : ''}>OR</option>
      </select>
    </div>
    <div id="rl-conds">${r.when.map(cond).join('')}</div>
    <button type="button" class="rl-mini" onclick="rlCondAdd()">+ condition</button>
    <div class="rl-form-bot">
      <label class="rl-f"><span class="rl-f-l">Only from spend, $</span>
        <input class="rl-in is-num" id="rl-f-min" type="number" step="0.5" min="0.01" value="${rlEsc(r.minSpend == null ? 10 : r.minSpend)}"></label>
      <label class="rl-f"><span class="rl-f-l">Geo (blank = any)</span>
        <input class="rl-in" id="rl-f-geo" placeholder="KG, UZ"
          title="Two-letter country codes. Taken from the name in Facebook — the ad's, its ad set's or its campaign's — because Facebook does not report a country on an ad row. The code must stand on its own: Mostbet_KG and KG_15323 match, MostbetKG does not."
          value="${rlEsc((r.geo || []).join(', '))}"></label>
      ${r.nameHas ? `<label class="rl-f"><span class="rl-f-l">Old name filter</span>
        <span class="rl-in" style="display:flex;align-items:center;gap:.5rem">
          <span class="font-mono truncate" title="This rule still only looks at names containing this text. The field was replaced by Geo; the filter is kept so the rule does not silently start covering everything.">“${rlEsc(r.nameHas)}”</span>
          <button type="button" class="rl-mini is-bad" onclick="rlDropHas()">✕</button>
        </span></label>` : ''}
      <label class="rl-f"><span class="rl-f-l">Cabinets (blank = all)</span>
        <input class="rl-in is-wide" id="rl-f-cabs" placeholder="1149896616961527, 778" value="${rlEsc((r.cabs || []).join(', '))}"></label>
      <label class="rl-ax"><input type="checkbox" id="rl-f-live" ${r.dry === false ? 'checked' : ''}>
        <span>Allowed to switch things off</span></label>
    </div>
    <div class="rl-form-acts">
      <button type="button" class="rl-btn is-main" onclick="rlPut(${i})">Save</button>
      <button type="button" class="rl-btn" onclick="rlCancel()">Cancel</button>
    </div>
  </div>`;
}

/* Читаємо форму щоразу з DOM, а не тримаємо чернетку в пам'яті: одне
   джерело правди й жодних розбіжностей між тим, що бачить людина, і
   тим, що збережеться. */
function rlFromForm() {
  const conds = [...document.querySelectorAll('#rl-conds .rl-cond')].map(el => ({
    m: el.querySelector('[data-f="m"]').value,
    op: el.querySelector('[data-f="op"]').value,
    v: Number(el.querySelector('[data-f="v"]').value)
  })).filter(c => Number.isFinite(c.v));
  const min = Number(document.getElementById('rl-f-min')?.value);
  return {
    name: String(document.getElementById('rl-f-name')?.value || '').trim(),
    level: document.getElementById('rl-f-level')?.value || 'ad',
    match: document.getElementById('rl-f-match')?.value === 'any' ? 'any' : 'all',
    minSpend: Number.isFinite(min) && min > 0 ? min : 10,
    dry: !document.getElementById('rl-f-live')?.checked,
    /* Спадкове поле лишаємо як є: мовчки його прибрати означало б
       розширити правило, яке вміє вимикати оголошення. Прибрати можна
       кнопкою — свідомо. */
    nameHas: String((rlEdit >= 0 ? (rlRules[rlEdit] || {}) : {}).nameHas || '').trim(),
    geo: String(document.getElementById('rl-f-geo')?.value || '')
      .split(/[,\s]+/).map(x => x.trim().toUpperCase())
      .filter(x => /^[A-Z]{2}$/.test(x)),
    cabs: String(document.getElementById('rl-f-cabs')?.value || '')
      .split(/[,\s]+/).map(x => x.replace(/^act_/, '').trim()).filter(Boolean),
    when: conds
  };
}

/* Прибрати спадковий фільтр по назві — свідомо й окремою дією.
   Він обмежував правило, тож зникнути сам, разом із полем, не мав
   права: правило, яке вміє вимикати оголошення, мовчки розширювати
   не можна. */
window.rlDropHas = function () {
  if (rlEdit >= 0 && rlRules[rlEdit]) { rlRules[rlEdit].nameHas = ''; rlPaint(); }
};

window.rlAdd = function () { rlEdit = -1; rlPaint(); };
window.rlOpen = function (i) { rlEdit = i; rlPaint(); };
window.rlCancel = function () { rlEdit = null; rlPaint(); };

window.rlCondAdd = function () {
  const draft = rlFromForm();
  draft.when.push({ m: 'cpl', op: '>', v: 2.5 });
  rlDraft(draft);
};
window.rlCondDrop = function (k) {
  const draft = rlFromForm();
  draft.when.splice(k, 1);
  if (!draft.when.length) draft.when = [{ m: 'cpc_link', op: '>', v: 1.5 }];
  rlDraft(draft);
};
// Перемальовуємо саму лише форму: список правил під нею не змінювався.
function rlDraft(draft) {
  const i = rlEdit;
  const keep = i >= 0 ? { ...rlRules[i], ...draft } : { ...rlBlank(), ...draft };
  const box = document.getElementById('rl-form');
  if (box) box.outerHTML = rlForm(keep, i);
}

window.rlPut = async function (i) {
  const v = rlFromForm();
  if (!v.when.length) { if (typeof toast === 'function') toast('A rule needs at least one condition', 'warn'); return; }
  if (!v.name) v.name = rlWords(v) || 'rule';
  const base = i >= 0 ? rlRules[i] : rlBlank();
  const next = { ...base, ...v, on: base.on !== false };
  if (i >= 0) rlRules[i] = next; else rlRules.push(next);
  rlEdit = null;
  await rlSave();
  rlPaint();
};

window.rlToggle = async function (i) {
  rlRules[i].on = rlRules[i].on === false;
  await rlSave();
  rlPaint();
};

window.rlDrop = async function (i) {
  const r = rlRules[i];
  const go = typeof ask === 'function'
    ? await ask({ title: 'Delete the rule?', danger: true, ok: 'Delete',
                  body: `Delete “${r.name || 'rule'}”?\n\nWhat it already switched off stays switched off — `
                      + 'deleting the rule does not turn anything back on.' })
    : confirm('Delete this rule?');
  if (!go) return;
  rlRules.splice(i, 1);
  rlEdit = null;
  await rlSave();
  rlPaint();
};


/* «Check now» рахує й нічого не чіпає — dry:true поверх правил. Це
   свідомо: кнопка, яка вимикає рекламу з першого кліку, рано чи пізно
   буде натиснута випадково. Справжні вимкнення робить розклад. */
window.rlCheck = async function () {
  const note = document.getElementById('rl-note');
  if (note) note.textContent = 'Asking Facebook…';
  try {
    const { data: s } = await sb.auth.getSession();
    const res = await fetch(SUPABASE_URL + '/functions/v1/fb-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json',
                 Authorization: 'Bearer ' + (s?.session?.access_token || '') },
      body: JSON.stringify({ dry: true })
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error('the fb-rules function is not deployed yet');
    if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
    /* stale кажемо окремо й першим: «нічого не вимкнулось» через
       застарілий знімок і «нічого не підпало під правила» — це різні
       відповіді, і плутати їх не можна. */
    if (note) note.textContent = `${j.rules || 0} rule(s) · ${j.cabinets || 0} cabinet(s) · `
      + `${j.ads || 0} ad(s) looked at · ${j.would_pause || 0} would be switched off`
      + (j.stale ? ` · ${j.stale} cabinet(s) skipped: the numbers are stale, Facebook was not synced` : '')
      + (j.problems && j.problems.length ? ' · ' + j.problems[0] : '');
    if (typeof toast === 'function')
      toast((j.would_pause || 0) + ' would be switched off — nothing was touched');
    rlLogLoad();
  } catch (e) {
    if (note) note.textContent = 'Could not check: ' + e.message;
    if (typeof toast === 'function') toast('Could not check: ' + e.message, 'error');
  }
};
</script>
