/* ПОДІЇ НА ГОЛОВНОМУ ГРАФІКУ (chartev.js).
   «Тонкі вертикальні позначки на датах, коли щось сталося … максимально
   круто це пророби». Перевіряємо: що саме вважається подією, блок у
   тултіпі, перемикачі, нотатку з графіка. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8752;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const ts = (d, h = 12) => `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00`;

const r = await page.evaluate(([T]) => {
  const ts = (d, h = 12) => `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00`;
  try { localStorage.removeItem('ce_view'); } catch (e) {}
  const rows = [];
  for (let d = 1; d <= 12; d++) ['KG', 'UZ', 'ZM'].forEach(g => {
    if (g === 'ZM' && d < 5) return;
    if (g === 'UZ' && d > 6) return;
    rows.push({ date: '2026-11-' + String(d).padStart(2, '0'), geo: g, spend: 100 });
  });
  window.rawData = rows;
  const raw = {
    ev: [
      // кабінет 1: бан, «блимання» в issue, знову бан — це ОДИН бан
      { account_id: '1', at: ts(3), to_state: 'running' },
      { account_id: '1', at: ts(7), to_state: 'banned' },
      { account_id: '1', at: ts(8), to_state: 'banned' },
      { account_id: '2', at: ts(7, 15), to_state: 'banned' },
      { account_id: '2', at: ts(2), to_state: 'running' }
    ],
    dom: [{ domain: 'spin.top', broken_since: ts(9) }],
    apps: [{ funnel_name: 'Slots TJ', app_gone_since: ts(10), status: 'ban' },
           { funnel_name: 'Alive app', app_gone_since: ts(10), status: 'active' }],
    rules: [{ at: ts(7), rule_name: 'CPL stop' }, { at: ts(7, 13), rule_name: 'CPL stop' }],
    notes: [{ id: 'n1', text: 'Switched split', created_at: ts(11) }]
  };
  const by = ceBuild(raw, rows);
  return {
    bans7: (by['2026-11-07'] || {}).ban, bans8: (by['2026-11-08'] || {}).ban,
    start: [(by['2026-11-02'] || {}).start, (by['2026-11-03'] || {}).start],
    geo: (by['2026-11-05'] || {}).geo, geoFirst: (by['2026-11-01'] || {}).geo,
    geoff: (by['2026-11-07'] || {}).geoff,
    dom: (by['2026-11-09'] || {}).dom, app: (by['2026-11-10'] || {}).app,
    rule: (by['2026-11-07'] || {}).rule, note: (by['2026-11-11'] || {}).note
  };
}, ['T']);
ok('кабінет, що «блимає», — один бан, а не два', JSON.stringify(r.bans7) === '["1","2"]' && !r.bans8, r);
ok('новий кабінет — перший запуск', JSON.stringify(r.start) === '[["2"],["1"]]', r.start);
ok('нове гео — перша дата зі спендом', JSON.stringify(r.geo) === '["ZM"]', r.geo);
ok('гео з першого дня даних не «нове»', !r.geoFirst, r.geoFirst);
ok('гео, що зупинилось, — наступного дня після останнього спенду', JSON.stringify(r.geoff) === '["UZ"]', r.geoff);
ok('домен і забанена апка; жива апка — не подія', JSON.stringify(r.dom) === '["spin.top"]' && JSON.stringify(r.app) === '["Slots TJ"]', r);
ok('правила згруповані з лічильником', JSON.stringify(r.rule) === '["CPL stop ×2"]', r.rule);
ok('нотатка з графіка', r.note && r.note[0].text === 'Switched split', r.note);

/* ── тултіп і перемикачі на живому графіку-заглушці ── */
const tip = await page.evaluate(() => {
  const days = ['2026-11-07', '2026-11-08'];
  ceByDay = { '2026-11-07': { ban: ['p1', 'p2'], rule: ['CPL stop ×2'] } };
  const fake = { options: { plugins: { ceRail: { days } } } };
  window.chart1 = fake;
  const html = ceTipHtml(fake, { dataPoints: [{ dataIndex: 0 }] });
  const empty = ceTipHtml(fake, { dataPoints: [{ dataIndex: 1 }] });
  return { html, empty };
});
ok('у тултіпі — блок Events з кількістю й іменами', /Events/.test(tip.html) && /<b>2<\/b> cabinets banned/.test(tip.html) && /p1, p2/.test(tip.html), tip.html);
ok('правила типово сховані (шумні)', !/Rules fired/.test(tip.html), tip.html);
ok('порожній день підказує, як додати нотатку', /add a note/.test(tip.empty), tip.empty);

const tog = await page.evaluate(() => {
  const host = document.getElementById('ce-strip') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'ce-strip' }));
  ceToggle('rule');
  const withRule = ceTipHtml(window.chart1, { dataPoints: [{ dataIndex: 0 }] });
  ceToggle('ban');
  const noBan = ceTipHtml(window.chart1, { dataPoints: [{ dataIndex: 0 }] });
  ceToggle();
  const off = ceTipHtml(window.chart1, { dataPoints: [{ dataIndex: 0 }] });
  const stripOff = document.getElementById('ce-strip').innerText;
  ceToggle();
  return { withRule, noBan, off, stripOff, saved: localStorage.getItem('ce_view') };
});
ok('клік по чіпу вмикає тип', /CPL stop/.test(tog.withRule), tog.withRule);
ok('і вимикає', !/banned/.test(tog.noBan), tog.noBan);
ok('головний перемикач ховає все', tog.off === '' && /off/i.test(tog.stripOff), tog);
ok('вибір запамʼятовується', /"off":\["ban"\]/.test(tog.saved), tog.saved);

/* ── нотатка: пише в change_log з category chart на вибрану дату ── */
const note = await page.evaluate(async () => {
  const sent = [];
  window.currentTeam = window.currentTeam || 'T';
  const q = { select: () => q, eq: () => q, not: () => q, in: () => q, order: () => q, range: async () => ({ data: [], error: null }),
    insert: async rows => { sent.push(rows[0]); return { error: null }; } };
  sb.from = () => q;
  const cv = document.createElement('canvas'); document.body.appendChild(cv);
  const ch = { canvas: cv, height: 200, options: { layout: { padding: {} }, plugins: { ceRail: { days: ['2026-11-07'] } } },
    scales: { x: { getPixelForValue: () => 100 } }, update() {}, draw() {} };
  window.chart1 = ch;
  ceClick({ x: 101, y: 190 }, ch);
  const pop = document.getElementById('ce-pop');
  const shown = pop && pop.classList.contains('is-on');
  document.getElementById('ce-pop-t').value = 'New creatives';
  await ceNoteAdd('2026-11-07');
  const above = (ceClick({ x: 101, y: 50 }, ch), document.getElementById('ce-pop').classList.contains('is-on'));
  return { shown, sent, above };
});
ok('клік по рейці відкриває нотатку на цю дату', note.shown, note);
ok('нотатка пишеться з category chart на ту саму дату', note.sent.length === 1 && note.sent[0].category === 'chart'
  && note.sent[0].text === 'New creatives' && /^2026-11-07/.test(new Date(note.sent[0].created_at).toISOString().slice(0, 10)) || /2026-11-0[67]/.test(note.sent[0].created_at), note.sent);
ok('клік по самому графіку (не по рейці) нотатку не відкриває', !note.above, note);

await done(browser, srv, errs);
