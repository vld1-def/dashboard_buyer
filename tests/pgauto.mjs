/* PAGES: СТОРІНКИ З НОВИМИ КОМЕНТАРЯМИ РОЗКРИВАЮТЬСЯ САМІ.
   «було б круто щоб коли відкриваю pages там сразу відкривались фанки
   де є коменти». */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8765;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const r = await page.evaluate(async () => {
  window.__calls = [];
  const cm = id => [{ id: 'c' + id, story: 'p', ad: 'ad', live: true, message: 'hi ' + id, from: 'X',
                      created_time: new Date().toISOString(), is_hidden: false, likes: 0 }];
  pgCall = async b => {
    window.__calls.push(b);
    if (b.action === 'pages') return { fn: 'x', pages: [
      { page_id: '1', name: 'Alpha', can_moderate: true, pic: 'a', new_comments: 0 },
      { page_id: '2', name: 'Beta', can_moderate: true, pic: 'b', new_comments: 3 },
      { page_id: '3', name: 'Gamma', can_moderate: false, pic: 'c', new_comments: 1 }] };
    if (b.action === 'page_list') return { comments: cm(b.page_id), can_moderate: b.page_id !== '3' };
    if (b.action === 'page_act') return { done: 1 };
    return {};
  };
  pgPanel(true);
  await pgLoad(true);
  for (let i = 0; i < 20 && document.querySelectorAll('#pg-list .pg-item.is-open .fcm-row').length < 2; i++)
    await new Promise(r => setTimeout(r, 50));
  const out = {};
  out.open = [...document.querySelectorAll('#pg-list .pg-item.is-open')].map(e => e.dataset.page).sort().join();
  out.lists = __calls.filter(c => c.action === 'page_list').map(c => c.page_id).sort().join();
  out.badgesGone = !document.querySelector('#pg-list .pg-new');
  out.rows = document.querySelectorAll('#pg-list .pg-item.is-open .fcm-row').length;
  // Дія на одній Сторінці не чіпає іншу.
  pgToggle('c2', '2');
  __calls = [];
  await pgAct('hide', '2');
  out.act = (__calls.find(c => c.action === 'page_act') || {}).page_id;
  out.stillOpen = [...document.querySelectorAll('#pg-list .pg-item.is-open')].map(e => e.dataset.page).sort().join();
  // Повторне відкриття панелі (без force) не розкриває знову.
  __calls = [];
  pgPanel(false); pgPanel(true);
  await new Promise(r => setTimeout(r, 50));
  out.noReopen = !__calls.some(c => c.action === 'page_list');
  // Клік по розкритій — згортає.
  await pgPick('3');
  out.afterClose = [...document.querySelectorAll('#pg-list .pg-item.is-open')].map(e => e.dataset.page).sort().join();
  return out;
});
ok('сторінки з новими коментарями розкрились самі', r.open === '2,3', r);
ok('і лише вони — без зайвих походів у Facebook', r.lists === '2,3', r);
ok('коментарі обох видно одразу', r.rows === 2, r);
ok('позначки «new» на розкритих зникли', r.badgesGone, r);
ok('дія йде на ту Сторінку, де натиснули', r.act === '2', r);
ok('інші розкриті лишаються розкритими', r.stillOpen === '2,3', r);
ok('повторне відкриття панелі нічого не перечитує', r.noReopen, r);
ok('клік по розкритій згортає її', r.afterClose === '2', r);

/* Позначка «N new» на згорнутій. */
const b = await page.evaluate(async () => {
  pgCall = async x => x.action === 'pages' ? { fn: 'x', pages: Array.from({ length: 7 }, (_, i) => ({
    page_id: String(10 + i), name: 'P' + i, can_moderate: true, pic: 'p', new_comments: 2 })) }
    : { comments: [], can_moderate: true };
  await pgLoad(true);
  await new Promise(r => setTimeout(r, 300));
  return { open: document.querySelectorAll('#pg-list .pg-item.is-open').length,
           badges: [...document.querySelectorAll('#pg-list .pg-new')].map(e => e.textContent) };
});
ok('більше п\'яти — розкриваємо п\'ять', b.open === 5, b);
ok('решта з позначкою «2 new»', b.badges.length === 2 && b.badges[0] === '2 new', b);

await done(browser, srv, errs);
