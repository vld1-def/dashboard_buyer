/* ═══════════ МЕНЮ PWA: ЗАКРІПЛЕНЕ ЗВЕРХУ, «ПІД УВАГОЮ» ГЕТЬ ═══════════

   Меню — це гео й постачальники, тобто те, ЧИМ ШУКАЮТЬ. Рядок «⚠ Під увагою»
   там був станом перевірки, а не способом пошуку, і займав місце
   зверху щодня. Він пішов із меню — але не з вікна: число в підписі
   й є той самий фільтр.

   Закріплення: гео й постачальників набирається десятками, а щодня працюють
   із трьома. Стенд тримає межі:
     • закріплене стоїть ЗВЕРХУ окремим блоком і клікається;
     • воно ж лишається у своєму гео — там його й відкріплюють;
     • закріплення переживає перемальовування й нове відкриття вікна;
     • воно НЕ їде в базу: це звичка одного браузера, не дані команди;
     • різні команди не перемішують свої закріплення;
     • закріплене на гео, якого вже немає, не малює порожнього рядка;
     • назва з апострофом не ламає клік. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8145;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const ITEMS = [
  { id: 'p1', name: 'Mbank_KG_1_09/10', geo: 'KG', provider: 'Pwa Partners', links: ['https://a.site'] },
  { id: 'p2', name: 'Mbank_KG_2_09/10', geo: 'KG', provider: 'Pwa Partners', links: ['https://b.site'] },
  { id: 'p3', name: "Olly_KG_3_09/10",  geo: 'KG', provider: "Olly's pwa", links: ['https://c.site'] },
  { id: 'p4', name: 'Pinco_TJ_4_09/10', geo: 'TJ', provider: 'SkakApp', links: ['https://d.site'] },
  { id: 'p5', name: 'Aviator_UZ_09/10', geo: 'UZ', provider: 'SkakApp', links: ['https://e.site'] }
];

const setup = (team = 'TEAM') => page.evaluate(([items, t]) => {
  currentTeam = t;
  apMode = 'pwa';
  pwItems = items.map(x => ({ ...x }));
  pwGeo = ''; pwProv = ''; pwOnlyBad = false; pwDomErr = '';
  pwPins = null;                       // перечитати з localStorage
  window.__wrote = [];
  sb.from = () => ({ upsert: async row => { window.__wrote.push(row); return { error: null }; } });
  // Один домен позначений небезпечним — отже «під увагою» є про що.
  pwDom = { 'a.site': { domain: 'a.site', status: 'danger' } };
  apSubPaint(); apRenderMode();
  return true;
}, [ITEMS, team]);

await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await setup();

/* ─────────── «під увагою» пішло з меню ─────────── */
const tree0 = await page.evaluate(() => document.getElementById('ap-tree').textContent);
ok('у меню немає рядка «Під увагою»', !/Під увагою/.test(tree0), tree0);
ok('а гео в меню є', /KG/.test(tree0) && /TJ/.test(tree0) && /UZ/.test(tree0), tree0);

const sub = await page.evaluate(() => ({
  txt: document.getElementById('ap-sub').textContent,
  btn: !!document.querySelector('#ap-sub .ap-sub-bad')
}));
ok('але число «під увагою» лишилось у підписі вікна', /1 під увагою/.test(sub.txt), sub.txt);
ok('і це кнопка, а не просто текст', sub.btn, sub);

const badOn = await page.evaluate(() => {
  document.querySelector('#ap-sub .ap-sub-bad').click();
  return { on: !!document.querySelector('#ap-sub .ap-sub-bad.is-on'),
           only: pwOnlyBad,
           list: document.getElementById('ap-list').textContent };
});
ok('кнопка в підписі фільтрує список', badOn.only && /KG/.test(badOn.list), badOn);
ok('і світиться, поки фільтр увімкнений', badOn.on, badOn);

const badOff = await page.evaluate(() => {
  pwPick('', '');
  return { on: !!document.querySelector('#ap-sub .ap-sub-bad.is-on'), only: pwOnlyBad };
});
ok('вибір гео знімає фільтр і гасить кнопку', !badOff.only && !badOff.on, badOff);

/* ─────────── закріплення гео ─────────── */
const pinned = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#ap-tree .ap-row')];
  const tj = rows.find(r => r.textContent.trim().startsWith('TJ'));
  tj.querySelector('.ap-pin').click();
  const after = [...document.querySelectorAll('#ap-tree .ap-row')].map(r => r.textContent.trim());
  return { cap: document.querySelector('#ap-tree .ap-tree-cap')?.textContent || '',
           first: after[1] || '', all: after,
           wrote: window.__wrote.length,
           stored: localStorage.getItem('pw_pins:TEAM') };
});
ok('закріплене стоїть зверху, під «Усі»', /^TJ/.test(pinned.first), pinned.all);
ok('і блок підписаний', /закріплені/.test(pinned.cap), pinned.cap);
ok('гео лишилось і в своєму місці — там його й відкріплюють',
  pinned.all.filter(t => t.startsWith('TJ')).length === 2, pinned.all);
ok('у базу не пішло нічого: це звичка браузера, а не дані команди',
  pinned.wrote === 0, pinned.wrote);
ok('зберіглось під ключем команди', /TJ/.test(pinned.stored || ''), pinned.stored);

/* Клік по закріпленому рядку — той самий фільтр. */
const jump = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#ap-tree .ap-row')];
  rows[1].click();
  return { geo: pwGeo, prov: pwProv, list: document.getElementById('ap-list').textContent };
});
ok('клік по закріпленому вибирає його гео',
  jump.geo === 'TJ' && !jump.prov && /Pinco/.test(jump.list), jump);

/* ─────────── закріплення постачальника, і апостроф у назві ─────────── */
const offPin = await page.evaluate(() => {
  pwPick('KG', '');
  const rows = [...document.querySelectorAll('#ap-tree .ap-row')];
  const olly = rows.find(r => r.textContent.includes("Olly's pwa"));
  olly.querySelector('.ap-pin').click();
  const after = [...document.querySelectorAll('#ap-tree .ap-row')].map(r => r.textContent.trim());
  return { all: after, top: after.slice(1, 3) };
});
ok('закріплений постачальник показується з гео, щоб його було видно з будь-якого місця',
  offPin.top.some(t => /KG · Olly's pwa/.test(t)), offPin.top);

const offJump = await page.evaluate(() => {
  pwPick('UZ', '');                 // пішли в інше гео
  const rows = [...document.querySelectorAll('#ap-tree .ap-row')];
  const pinRow = rows.find(r => /Olly's pwa/.test(r.textContent));
  pinRow.click();
  return { geo: pwGeo, prov: pwProv, list: document.getElementById('ap-list').textContent };
});
ok('апостроф у назві не ламає клік — постачальник вибрався',
  offJump.geo === 'KG' && offJump.prov === "Olly's pwa" && /Olly_KG_3/.test(offJump.list), offJump);

/* ─────────── переживає нове відкриття вікна ─────────── */
const again = await page.evaluate(() => {
  pwPins = null;                   // як після перезавантаження сторінки
  pwGeo = ''; pwProv = '';
  pwRenderTree();
  return [...document.querySelectorAll('#ap-tree .ap-row')].map(r => r.textContent.trim());
});
ok('закріплене лишається після перезавантаження',
  again.slice(1, 3).some(t => /^TJ/.test(t)) && again.slice(1, 3).some(t => /Olly/.test(t)), again);

/* ─────────── відкріплення ─────────── */
const unpin = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#ap-tree .ap-row')];
  const top = rows.find(r => /^TJ/.test(r.textContent.trim()));
  top.querySelector('.ap-pin').click();
  const after = [...document.querySelectorAll('#ap-tree .ap-row')].map(r => r.textContent.trim());
  return { all: after, tj: after.filter(t => t.startsWith('TJ')).length };
});
ok('відкріплення з блоку зверху прибирає рядок, лишаючи гео на місці',
  unpin.tj === 1, unpin.all);

/* ─────────── чуже закріплення не видно ─────────── */
const other = await page.evaluate(async () => {
  currentTeam = 'OTHER';
  pwPins = null;
  pwRenderTree();
  return { cap: !!document.querySelector('#ap-tree .ap-tree-cap'),
           rows: [...document.querySelectorAll('#ap-tree .ap-row')].map(r => r.textContent.trim()) };
});
ok('інша команда — свої закріплення, а не чужі', !other.cap, other.rows);

/* ─────────── закріплене на гео, якого вже немає ─────────── */
const gone = await page.evaluate(() => {
  currentTeam = 'TEAM';
  /* Третій ключ — СТАРОГО вигляду, з оффера ('o'). Таких у людей
     повно в localStorage, і вони не мають прикидатись постачальником:
     рядок «KG · Mbank» знизу нічого не фільтрував би. */
  try { localStorage.setItem('pw_pins:TEAM',
    JSON.stringify(['g\nZZ', 'p\nKG\nPwa Partners', 'o\nKG\nMbank'])); } catch (e) {}
  pwPins = null;
  pwRenderTree();
  const rows = [...document.querySelectorAll('#ap-tree .ap-row')].map(r => r.textContent.trim());
  return { rows, zz: rows.some(t => t.startsWith('ZZ')),
           mbank: rows.some(t => /KG · Mbank/.test(t)) };
});
ok('закріплене на гео, якого вже немає, не малює порожнього рядка',
  !gone.zz && gone.rows.slice(1, 2).some(t => /KG · Pwa Partners/.test(t)), gone.rows);
ok('старе закріплення на оффер тихо зникло, а не стало постачальником',
  !gone.mbank, gone.rows);

await done(browser, srv, errs);
