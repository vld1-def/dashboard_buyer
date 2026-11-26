/* ЧАС РЯДКІВ ЗВІТУ під міткою. «було б гуд якби під мітками був непримітний час коли я це писав». */
import { serve, open, checks } from './_harness.mjs';
const { ok, done } = checks();
const SP = '';
const srv = await serve(8767);
const { browser, page, errs } = await open(8767, { viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });

await page.evaluate(() => { try { bootDone(); } catch (e) {} ['boot', 'login-overlay', 'team-first-run'].forEach(i => document.getElementById(i)?.remove()); });
const r = await page.evaluate(async () => {
  window.__set = {}; window.setTeamSetting = async (k, v) => { __set[k] = v; }; window.getTeamSetting = async () => null;
  rpTagsLoadedFor = currentTeam;
  const txt = '! І так що залишилось по звітах\n! Тімлід каже профіт\n> План на завтра\nзвичайний рядок';
  await rpStampLines('r1', txt);
  // Старий рядок має свій час, новий — «зараз».
  const k = rpLineKey('! І так що залишилось по звітах');
  rpTimes.r1[k] = new Date(new Date().setHours(0, 20, 0, 0)).toISOString();
  await rpStampLines('r1', txt + '\n+ Новий рядок');
  reportData = [{ id: 'r1', date: new Date().toISOString().slice(0, 10), comment: txt + '\n+ Новий рядок' }];
  currentMonthFilter = reportData[0].date.slice(0, 7); rpMonth = '';
  document.getElementById('report-modal').classList.remove('hidden');
  renderReports();
  document.getElementById('report-content-r1').classList.remove('hidden');
  return { times: [...document.querySelectorAll('#report-content-r1 .rb-time')].map(x => x.textContent),
           saved: Object.keys(JSON.parse(__set.report_line_times).r1).length };
});
ok('старий рядок — свій час, нові — час збереження', r.times[0] === '00:20' && r.times.length === 4 && r.times.slice(1).every(t => /^\d\d:\d\d$/.test(t)), r);
ok('звичайний рядок без мітки часу не має', r.saved === 4, r);
await done(browser, srv, errs);
