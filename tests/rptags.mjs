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

/* Цифри дня біля міток і календар біля PDF. */
const c = await page.evaluate(async () => {
  window.rawData = [{ date: '2026-11-23', geo: 'KG', spend: 1200 }, { date: '2026-11-23', geo: 'TJ', spend: 300 }];
  try { rawData = window.rawData; } catch (e) {}
  try { globalPayouts = { KG_DEFAULT: 0 }; } catch (e) {}
  reportData = [{ id: 'r1', date: '2026-11-23', comment: 'hi' }, { id: 'r2', date: '2026-11-22', comment: '' }, { id: 'r3', date: '2026-10-05', comment: 'oct' }];
  currentMonthFilter = '2026-11'; rpMonth = null;
  document.getElementById('report-modal').classList.remove('hidden');
  renderReports();
  const day = (document.querySelector('#report-list-container .rp-day') || {}).innerText || '';
  const noDay = document.querySelectorAll('#report-list-container .rp-day:not(.is-empty)').length;
  rpCalOpen(document.getElementById('rp-cal-btn'));
  const marked = [...document.querySelectorAll('#rp-cal .has-rp')].map(b => b.innerText);
  rpCalGo('2026-11-22');
  const open22 = !document.getElementById('report-content-r2').classList.contains('hidden');
  rpCalOpen(document.getElementById('rp-cal-btn')); rpCalMove(-1);
  const oct = [...document.querySelectorAll('#rp-cal .has-rp')].map(b => b.innerText);
  rpCalGo('2026-10-05');
  const octShown = !!document.getElementById('report-content-r3') && !document.getElementById('report-content-r3').classList.contains('hidden');
  const helpBg = getComputedStyle(document.querySelector('.rp-help-box')).backgroundColor;
  return { day, noDay, marked, open22, oct, octShown, helpBg };
});
ok('біля міток — спенд і профіт дня', /\$1,500/.test(c.day) && /−\$1,500/.test(c.day), c.day);
ok('день без статистики — без цифр, а не нулі', c.noDay === 1, c.noDay);
ok('календар позначає дні зі звітом', c.marked.join() === '22,23', c.marked);
ok('клік по даті відкриває звіт цього дня', c.open22, c);
ok('інший місяць — теж відкривається, фільтр дашборду не чіпаємо', c.oct.join() === '5' && c.octShown, c);
ok('підказка «i» має щільний фон', !/rgba\(0, 0, 0, 0\)|transparent/.test(c.helpBg), c.helpBg);

await done(browser, srv, errs);
