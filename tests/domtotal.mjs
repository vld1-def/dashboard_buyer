/* ═══════════ ТОТАЛ ПО ДОМЕНУ І РОЗРІЗ ПО ДОМЕНАХ ═══════════

   «Live on this domain» відповідає на питання «що тут крутиться
   ЗАРАЗ». А «скільки ми на цей домен залили за весь час» не мало де
   взятись: у статистиці домену не було зовсім.

   Тепер він лежить у daily_stats тим самим рядком, що й спенд, тож
   відповідь складається з rawData — того ж масиву, на якому стоять KPI
   і Report Builder. Жодного запиту.

   Стенд тримає головне: поки колонки в базі немає, блок каже ЩО
   виконати, а не показує нуль. Нуль тут читався б як «на цей домен
   нічого не заливали» — і це була б брехня. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8129;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const ROWS = [
  { date: '2026-10-01', account: '1', geo: 'KG', offer: 'Pinco', site: 'mplay-kg.website',
    spend: 25, installs: 10, regs: 5, deposits: 2 },
  { date: '2026-10-03', account: '1', geo: 'KG', offer: 'Pinco', site: 'mplay-kg.website',
    spend: 75, installs: 30, regs: 15, deposits: 6 },
  { date: '2026-10-03', account: '1', geo: 'KG', offer: 'Pinco', site: 'other-kg.website',
    spend: 40, installs: 8, regs: 4, deposits: 1 },
  { date: '2026-10-04', account: '1', geo: 'PL', offer: 'Pinco', site: null,
    spend: 11, installs: 1, regs: 0, deposits: 0 }
];

const block = await page.evaluate(rows => {
  rawData = rows;
  return { has: dmTotalBlock('mplay-kg.website'),
           none: dmTotalBlock('nobody-kg.website') };
}, ROWS);

ok('тотал — це сума по домену, а не по всій таблиці', /\$100\.00/.test(block.has), block.has);
ok('видно, за скільки днів і за який період',
  /2 day\(s\)/.test(block.has) && /2026-10-01 → 2026-10-03/.test(block.has), block.has);
ok('конверсії і ціна події — звідти ж',
  /40/.test(block.has) && /\$2\.50/.test(block.has) && /\$12\.50/.test(block.has), block.has);
ok('домен, якого немає в статистиці, каже це прямо',
  /No imported statistics/.test(block.none), block.none);
ok('чужий домен не підсумовує сусідній', !/\$140/.test(block.has), block.has);

/* Колонки ще немає — SITES.sql не виконаний. Нуль тут читався б як
   «нічого не заливали». */
ok('без колонки site блок називає файл, який це лагодить', await page.evaluate(() => {
  rawData = [{ date: '2026-10-01', spend: 10, installs: 1, regs: 0, deposits: 0 }];
  const h = dmTotalBlock('mplay-kg.website');
  return /SITES\.sql/.test(h) && !/\$0\.00/.test(h);
}));
ok('статистика ще не завантажена — теж не нуль', await page.evaluate(() => {
  rawData = [];
  return /not loaded/.test(dmTotalBlock('mplay-kg.website'));
}));

/* Блок стоїть у картці домену, а не окремим екраном. */
ok('блок відкривається разом із карткою домену', await page.evaluate(rows => {
  rawData = rows;
  dmRows = [{ id: 'd1', domain: 'mplay-kg.website', status: 'ok', group: 'pwa',
              checked_at: null, source: 'server' }];
  dmDetail(dmRows[0]);
  const box = document.getElementById('dm-detail');
  return !box.classList.contains('hidden')
      && /Total on this domain/.test(box.textContent)
      && /\$100\.00/.test(box.textContent);
}, ROWS));

/* ─────────── Report Builder ─────────── */
/* RB_DIMS читаємо з тексту сторінки, а не з живої змінної: у стенді
   блок зі звітом падає на Chart (його CDN закритий політикою проксі),
   і всі const того блока лишаються в TDZ. Функції це не чіпає — вони
   підняті, тому rbDimVal перевіряємо як є. */
const src = await page.evaluate(() => document.documentElement.innerHTML);
ok('у Report Builder є розріз Domain',
  /\{ key:'site',\s*label:'Domain' \}/.test(src));
ok('значенням групи стає сам домен', await page.evaluate(() =>
  rbDimVal({ site: 'mplay-kg.website' }, 'site') === 'mplay-kg.website'
  && rbDimVal({ site: null }, 'site') === '—'));
/* Розріз по домену читається з daily_stats — переводити звіт на
   креативи через нього не треба, там домену немає. */
ok('розріз по домену не тягне звіт у creatives_stats',
  /return \['device','placement','platform','creative'\]\.some\(k=>rbGroups\.includes\(k\)\)/.test(src));

await done(browser, srv, errs);
