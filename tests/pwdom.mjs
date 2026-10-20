/* ═══════════ 18. ДОМЕНИ ПІДТЯГУЮТЬСЯ ДО PWA ШАБЛОНІВ ═══════════

   Зв'язок працював лише В ОДНУ СТОРОНУ: силки кампанії проставляли
   домену PWA й гео (це тримає dmlink.mjs). Назад — ніяк, і коли
   домени заводять першими, у шаблоні PWA вони не з'являлись.

   Межі, за якими підстановка не стає вгадуванням:
     • збіг по парі PWA + гео, і лише по ній;
     • порожнє гео домена — невідомість, а не розбіжність;
     • різні гео — не підходить;
     • без оффера не шукаємо нічого;
     • домен, який уже стоїть силкою, не пропонуємо вдруге — навіть
       коли силка написана з www і з хвостом;
     • у links кладе НАТИСКАННЯ, а не завантаження;
     • відмова бази відкочує екран. */
import { serve, open, checks } from './_harness.mjs';
import { readFileSync } from 'node:fs';

const PORT = 8141;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* Без цих двох стовпців зв'язок неможливий у принципі: саме ними
   домен підписаний у своєму списку. */
const SRC = readFileSync('/home/user/dashboard_buyer/index.html', 'utf8');
ok('pwDomLoad читає з доменів pwa і geo',
  /\.select\('domain, status, flagged_by, checked_at, source, pwa, geo'\)/.test(SRC));

const DOM = [
  // той самий домен, що вже стоїть силкою — тільки написаний інакше
  { domain: 'mplay-kg.website', pwa: 'Mbank', geo: 'KG', status: 'ok' },
  { domain: 'mplay-kg-2.website', pwa: 'Mbank', geo: 'KG', status: 'ok' },
  // гео не вписане — нічому не суперечить
  { domain: 'mplay-kg-3.website', pwa: 'Mbank', geo: '', status: 'unknown' },
  // та сама PWA, але інше гео
  { domain: 'mplay-uz.website', pwa: 'Mbank', geo: 'UZ', status: 'ok' },
  // чужа PWA
  { domain: 'pinco-tj.website', pwa: 'Pinco', geo: 'TJ', status: 'ok' },
  // домен без PWA — його ні до чого прикласти
  { domain: 'nobody.website', pwa: '', geo: '', status: 'unknown' }
];

const setup = () => page.evaluate(d => {
  currentTeam = 'TEAM';
  apMode = 'pwa';
  window.__saved = [];
  pwDom = {};
  d.forEach(r => { pwDom[r.domain] = r; });
  pwItems = [
    { id: 'p1', name: 'Mbank_KG_10708-ex8g_09/10', geo: 'KG', offer: 'Mbank',
      links: ['https://www.mplay-kg.website/promo?a=1'] },
    { id: 'p2', name: 'Pinco_TJ_11003_09/10', geo: 'TJ', offer: 'Pinco', links: [] }
  ];
  pwGeo = ''; pwOffer = ''; pwOnlyBad = false; pwDomErr = '';
  sb.from = () => ({ upsert: async row => {
    window.__saved.push(JSON.parse(row.value));
    return { error: null };
  } });
  return true;
}, DOM);

await setup();

/* ─────────── сам підбір ─────────── */
const pool = await page.evaluate(() => ({
  mbank: pwPoolOf(pwItems[0]),
  pinco: pwPoolOf(pwItems[1]),
  noOffer: pwDomPool('', 'KG', []),
  noGeo: pwDomPool('Mbank', '', [])
}));
ok('підтягує домени своєї PWA і свого гео',
  JSON.stringify(pool.mbank) === JSON.stringify(['mplay-kg-2.website', 'mplay-kg-3.website']),
  pool.mbank);
ok('силка, що вже стоїть, не пропонується вдруге — навіть з www і хвостом',
  !pool.mbank.includes('mplay-kg.website'), pool.mbank);
ok('інше гео тієї ж PWA не підходить', !pool.mbank.includes('mplay-uz.website'), pool.mbank);
ok('чужа PWA не підходить', !pool.mbank.includes('pinco-tj.website'), pool.mbank);
ok('домен без PWA не підходить нікуди',
  !pool.mbank.concat(pool.pinco).includes('nobody.website'), pool);
ok('порожня кампанія бере все своє', JSON.stringify(pool.pinco) === JSON.stringify(['pinco-tj.website']),
  pool.pinco);
ok('без оффера не підтягуємо нічого', pool.noOffer.length === 0, pool.noOffer);
ok('без гео кампанії підходять усі гео цієї PWA',
  pool.noGeo.length === 4, pool.noGeo);

/* ─────────── картка: пропозиція і підстановка ─────────── */
await page.evaluate(() => { apRenderTree(); apRenderMode(); });
const card = await page.evaluate(() => document.getElementById('ap-list').textContent);
ok('на картці видно, скільки доменів зі списку ще не в силках',
  /зі списку доменів/.test(card) && /підставити 2/.test(card), card.slice(0, 300));

const pulled = await page.evaluate(async () => {
  await pwDomPull('p1');
  return { links: pwItems[0].links, saved: window.__saved.length,
           /* Саме ПО ЦІЙ кампанії: сусідня (Pinco) свої домени ще не
              підставила, і її кнопка на екрані лишається. */
           mine: document.getElementById('ap-list').innerHTML.includes("pwDomPull('p1'"),
           other: document.getElementById('ap-list').innerHTML.includes("pwDomPull('p2'") };
});
ok('підстановка дописала силки зі схемою',
  JSON.stringify(pulled.links) === JSON.stringify([
    'https://www.mplay-kg.website/promo?a=1',
    'https://mplay-kg-2.website', 'https://mplay-kg-3.website']), pulled.links);
ok('і пішла в базу', pulled.saved === 1, pulled.saved);
ok('після підстановки цій кампанії пропонувати більше нічого',
  !pulled.mine && pulled.other, pulled);

/* Відмова бази мусить відкотити екран: силки, яких немає в базі, —
   це залив трафіку на адресу, якої ніхто не бачив. */
await setup();
const rolled = await page.evaluate(async () => {
  sb.from = () => ({ upsert: async () => ({ error: { message: 'nope' } }) });
  await pwDomPull('p2');
  return pwItems[1].links;
});
ok('помилка запису відкочує силки', rolled.length === 0, rolled);

/* ─────────── редактор: пропозиція під полем силок ─────────── */
await setup();
const ed = await page.evaluate(() => {
  pwEdit('p1');
  return document.getElementById('pw-pool').textContent;
});
ok('у редакторі домени стоять окремими кнопками',
  /mplay-kg-2\.website/.test(ed) && /mplay-kg-3\.website/.test(ed)
  && /2 ще не в силках/.test(ed), ed);
ok('і вже вставлену силку редактор не пропонує', !/\+ mplay-kg\.website/.test(ed), ed);

const one = await page.evaluate(() => {
  pwPoolAdd('mplay-kg-2.website');
  return { ta: document.getElementById('pw-f-links').value,
           pool: document.getElementById('pw-pool').textContent };
});
ok('натискання дописало силку в поле',
  one.ta.split('\n').includes('https://mplay-kg-2.website'), one.ta);
ok('і прибрало її з пропозиції',
  !/\+ mplay-kg-2\.website/.test(one.pool) && /1 ще не в силках/.test(one.pool), one.pool);

const all = await page.evaluate(() => {
  pwPoolAdd('*');
  return { ta: document.getElementById('pw-f-links').value,
           pool: document.getElementById('pw-pool').textContent };
});
ok('«підставити всі» дописує решту без дублів',
  all.ta.split('\n').length === 3 && new Set(all.ta.split('\n')).size === 3, all.ta);
ok('і пропозиція спорожніла', !/ще не в силках/.test(all.pool), all.pool);

/* Гео й оффер читаються з НАЗВИ — отже домени мусять з'явитись одразу
   після того, як назву вставили з кабінета, без дотику до полів. */
const guessed = await page.evaluate(() => {
  pwNew();
  document.getElementById('pw-f-name').value = 'Mbank_KG_10708-ex8g_09/10';
  pwNameHint();
  return document.getElementById('pw-pool').textContent;
});
ok('одна лише назва кампанії вже підтягує домени',
  /mplay-kg\.website/.test(guessed) && /3 ще не в силках/.test(guessed), guessed);

/* Порожньо з двох різних причин — і сказати, з якої саме, важливіше за
   сам факт порожнечі. */
const empty = await page.evaluate(() => {
  pwNew();
  document.getElementById('pw-f-name').value = 'щось своє';
  pwNameHint();
  return document.getElementById('pw-pool').textContent;
});
ok('без оффера редактор каже, чого саме бракує', /Впиши оффер/.test(empty), empty);

await done(browser, srv, errs);
