/* ═══════════ REPORT BUILDER: ДОВГИЙ ЛЕНДІНГ НЕ НАКРИВАЄ ЧИСЛА ═══════════

   «коли я вибираю стовпець лендінг він перекриває дані тому що він
   великий, але сам стовпець не розтягується, чуть чуть розтягується
   мабуть є максимальна ширина».

   Максимальна ширина справді є — 340px, і вона потрібна: без неї один
   довгий лендінг розсував таблицю на пів екрана. Але клітинка стояла з
   whitespace-nowrap і БЕЗ обрізання, тому текст ішов за її межі й
   накривав спенд із профітом.

   Тепер текст переноситься: клітинка росте вниз, а не вбік. Стенд
   тримає саме це — геометрію, а не вигляд:
     • вміст не вилазить за межі клітинки;
     • клітинка не ширша за свою стелю;
     • числа починаються ПРАВОРУЧ від неї, а не під нею;
     • повний лендінг лишається в підказці — обрізати нічого, але
       прочитати цілком буває потрібно. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8155;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, { viewport: { width: 1440, height: 900 } });

const LONG = 'https://mplay-kg-games.website/landing/promo-aviator-big-win-2026/index-kg-ru-v3-final';
const ROWS = [
  { date: '2026-10-01', geo: 'KG', offer: 'Mbank', landing: LONG,
    spend: 1234.56, deposits: 12, regs: 120, installs: 400 },
  { date: '2026-10-02', geo: 'KG', offer: 'Mbank', landing: 'short.site',
    spend: 99.5, deposits: 1, regs: 10, installs: 40 }
];

const prep = ([rows]) => {
  currentMonthFilter = '2026-10';
  globalPayouts = { 'KG_DEFAULT': 100 }; payoutModels = { 'KG_DEFAULT': 'cpa' };
  rawData = rows; window.rawData = rows;
  rbGroups = ['landing']; rbMode = 'list'; rbTree = false;
  rbSort = { key: '__key', dir: 1 };
  /* Сторінку відкриваємо тим самим шляхом, що й людина: власні
     класи й роут ставить роутер, і виставляти їх руками означало б
     міряти геометрію блока, якого на екрані немає. */
  navGo('reports');
  rbRender();
  return true;
};
await page.evaluate(prep, [ROWS]);
// Роутер показує сторінку не в тому ж кадрі, тож міряємо після паузи:
// на схованому блоці всі розміри нулі, і перевірки були б про нічого.
await page.waitForTimeout(250);
const geom = await page.evaluate(() => {
  const tr = document.querySelector('#rb-table tbody tr');
  const td = tr && tr.querySelector('td');
  const next = tr && tr.querySelectorAll('td')[1];
  if (!td) return { err: 'немає рядка' };
  const r = td.getBoundingClientRect(), n = next.getBoundingClientRect();
  return {
    text: td.textContent.trim(),
    title: td.getAttribute('title') || '',
    // scrollWidth > clientWidth і означає «вміст вилазить за межі»
    overflow: td.scrollWidth - td.clientWidth,
    width: Math.round(r.width),
    height: Math.round(r.height),
    gap: Math.round(n.left - r.right),
    nowrap: getComputedStyle(td).whiteSpace
  };
});

ok('рядок із лендінгом намалювався', !geom.err && geom.text.includes('mplay-kg-games'), geom);
ok('вміст не вилазить за межі клітинки', geom.overflow <= 1, geom);
ok('клітинка не ширша за свою стелю (340px + padding)', geom.width <= 366, geom);
ok('числа починаються праворуч від неї, а не під нею', geom.gap >= 0, geom);
ok('текст переноситься, а не тримається одним рядком',
  geom.nowrap !== 'nowrap' && geom.height > 30, geom);
ok('повний лендінг лишився в підказці', geom.title === LONG, geom.title);

/* Короткий розріз не мусить рости в висоту — переніс лише там, де є що
   переносити. */
const short = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#rb-table tbody tr')];
  const td = rows[rows.length - 1].querySelector('td');
  return { text: td.textContent.trim(), height: Math.round(td.getBoundingClientRect().height) };
});
ok('короткий розріз лишається в один рядок',
  short.text === 'short.site' && short.height < 40, short);

await done(browser, srv, errs);
