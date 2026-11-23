/* МІТКИ ДЕННИХ ЗВІТІВ. «у дейлі звітах ці теги не робочі». Мітки ніхто
   не читав при відкритті: після перезаходу зникали, а нова мітка
   перезаписувала збережені. І додавались лише по Enter. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8757;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const r = await page.evaluate(async () => {
  const store = { report_tags: JSON.stringify({ r2: ['old'] }) };
  window.getTeamSetting = async k => store[k] || null;
  window.setTeamSetting = async (k, v) => { store[k] = v; };
  try { getTeamSetting = window.getTeamSetting; setTeamSetting = window.setTeamSetting; } catch (e) {}
  const rows = [{ id: 'r1', date: '2026-11-23', comment: 'hi', team_name: 'T' }, { id: 'r2', date: '2026-11-22', comment: '', team_name: 'T' }];
  const q = { select: () => q, eq: async () => ({ data: rows, error: null }) };
  sb.from = () => q;
  currentMonthFilter = '2026-11';
  rpTags = {}; rpTagsLoadedFor = null;
  await refreshReports();
  const loaded = [...document.querySelectorAll('#report-list-container .rp-chip')].map(c => c.innerText.replace('✕', '').trim());
  // додати через вибір з підказки (change), без Enter
  const inp = document.querySelector('#report-list-container .rp-tag-add');
  inp.value = 'launch'; inp.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 50));
  const after = JSON.parse(store.report_tags);
  return { loaded, after };
});
ok('збережені мітки видно після відкриття', r.loaded.includes('old'), r.loaded);
ok('мітка додається й без Enter (вибір із підказки / вихід з поля)', (r.after.r1 || []).includes('launch'), r.after);
ok('нова мітка не стирає старі', (r.after.r2 || []).includes('old'), r.after);

await done(browser, srv, errs);
