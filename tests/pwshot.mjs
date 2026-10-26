/* ═══════════ ДИЗАЙН PWA НА КАРТЦІ ═══════════

   «можна б було б додати дизайн нашої пва, щоб знати сразу як вона
   виглядає, пропоную зменшити ширину силок, і праворуч не великий
   блок… дати їм айдішки такі як в нас в назві компанії (ктайді)»

   Стенд тримає межі:
     • ключ — KTID, тобто третій кусок назви через «_», тим самим
       правилом, що й список доменів: два різні правила на один ключ
       дають дві різні відповіді;
     • один скрін видно в УСІХ кампаніях цієї воронки — у тому й сенс
       прив'язки до KTID, а не до назви з датою;
     • назва без KTID не отримує ні превю, ні кнопки: прив'язувати
       нічим, і кнопка на такій картці нічого не залила б;
     • підписані адреси зіставляються за ПОЛЕМ path, а не за порядком:
       переплутані адреси показали б чужий дизайн;
     • силки звужуються на ширину превю, а не лізуть під нього;
     • на весь екран відкривається поверх вікна, а не замість нього;
     • кадрів на воронку може бути кілька: у колонці слайдшоу, на весь
       екран — усі одразу сіткою;
     • старі одиночні скріни (ім'я без «__») групуються так само: їх
       не треба переливати. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8157;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, { viewport: { width: 1500, height: 950 } });

const ITEMS = [
  // дві кампанії ОДНІЄЇ воронки: ktid 10708-ex8g
  { id: 'p1', name: 'Mbank_KG_10708-ex8g_09/10', geo: 'KG', offer: 'Mbank',
    provider: 'Pwa Partners', links: ['https://a.site'] },
  { id: 'p2', name: 'Mbank_KG_10708-ex8g_10/10', geo: 'KG', offer: 'Mbank',
    provider: 'Pwa Partners', links: ['https://b.site'] },
  // своя воронка, скріна ще немає
  { id: 'p3', name: 'Pinco_TJ_22222-zzzz_09/10', geo: 'TJ', offer: 'Pinco',
    provider: 'SkakApp', links: ['https://c.site'] },
  // назва без KTID — одним словом
  { id: 'p4', name: 'Melbet', geo: 'UZ', offer: 'Melbet', links: ['https://d.site'] },
  /* Службова картка: «PARAMETERS» у гео. KTID у назві є, тобто без
     окремого правила вона отримала б і кнопку, і превю. */
  { id: 'p5', name: 'Mbank_PARAMETERS_10708-ex8g_09/10', geo: 'PARAMETERS',
    offer: 'Mbank', links: ['https://e.site'] },
  // те саме слово, перенесене в назву
  { id: 'p6', name: 'PARAMETERS_KG_33333-yyyy_09/10', geo: 'KG',
    offer: 'Mbank', links: ['https://f.site'] },
  /* А ось це НЕ службова картка: слово лише схоже. Превю мусить бути. */
  { id: 'p7', name: 'Parametrix_KG_44444-wwww_09/10', geo: 'KG',
    offer: 'Parametrix', links: ['https://g.site'] }
];

const setup = (shots, order) => page.evaluate(([items, have, shuffle]) => {
  currentTeam = 'TEAM';
  apMode = 'pwa';
  pwItems = items.map(x => ({ ...x }));
  pwGeo = ''; pwProv = ''; pwOne = ''; pwOnlyBad = false; pwDom = {}; pwDomErr = '';
  /* Підміняємо лише storage: решта сторінки лишається справжньою, і
     перевіряємо ми саму розмітку картки, а не Supabase. */
  window.__up = [];
  sb.storage = { from: () => ({
    list: async () => ({ data: have.map(n => ({ name: n })), error: null }),
    createSignedUrls: async paths => {
      const rows = paths.map(p => ({ path: p, signedUrl: 'https://shots.test/' + p.split('/').pop() + '.jpg' }));
      // Порядок навмисно інший, ніж просили: зіставляти треба за path.
      return { data: shuffle ? rows.slice().reverse() : rows, error: null };
    },
    upload: async (path, blob, opts) => { window.__up.push({ path, type: opts && opts.contentType }); return { error: null }; }
  }) };
  /* Вікно відкриваємо справді: перевірка «шар не закрив шаблони» на
     зачиненому вікні доводила б нічого. */
  document.getElementById('apps-modal').classList.remove('hidden');
  return pwShotLoad(true).then(() => { apSubPaint(); apModePaint(); apRenderMode(); return true; });
}, [items(), shots, order]);

function items() { return ITEMS; }

await setup(['10708-ex8g'], true);

/* ─────────── ключ KTID ─────────── */
const keys = await page.evaluate(() => ({
  full: pwKtid('Mbank_KG_10708-ex8g_09/10'),
  short: pwKtid('Melbet'),
  two: pwKtid('Mbank_KG'),
  path: pwShotPath('10708-ex8g'),
  group: pwShotKey('10708-ex8g__1700000000000'),
  // Старий одиночний скрін лежить без суфікса взагалі.
  groupOld: pwShotKey('10708-ex8g'),
  // Те саме правило, що й у списку доменів: інакше скрін є, а на
  // картці його немає.
  same: typeof dmHeadInfo === 'function'
    ? dmHeadInfo('Mbank_KG_10708-ex8g_09/10').ktid : null
}));
ok('KTID — третій кусок назви', keys.full === '10708-ex8g', keys);
ok('те саме правило, що в списку доменів',
  keys.same === null || keys.same === keys.full, keys);
ok('назва без трьох кусків не дає KTID', keys.short === '' && keys.two === '', keys);
/* Ім'я з часом заливу — тобто кожен залив ДОДАЄ кадр, а не заміняє. */
ok('шлях у бакеті — команда/ktid__час',
  /^TEAM\/10708-ex8g__\d{10,}$/.test(keys.path), keys.path);
ok('ключ групування знімає суфікс часу',
  keys.group === '10708-ex8g' && keys.groupOld === '10708-ex8g', keys);

/* ─────────── превю на картці ─────────── */
const cards = await page.evaluate(() => [...document.querySelectorAll('#ap-list > div')].map(c => {
  const shot = c.querySelector('.pw-shot');
  const add = c.querySelector('.pw-shot-add');
  const main = c.querySelector('.pw-card-main');
  const r = c.getBoundingClientRect();
  return {
    name: (c.querySelector('code') || {}).textContent || '',
    src: shot ? shot.querySelector('img').getAttribute('src') : '',
    add: add ? add.textContent.replace(/\s+/g, ' ').trim() : '',
    mainW: main ? Math.round(main.getBoundingClientRect().width) : 0,
    cardW: Math.round(r.width),
    shotW: shot || add ? Math.round((shot || add).getBoundingClientRect().width) : 0
  };
}));

const c1 = cards.find(c => /10708-ex8g_09/.test(c.name));
const c2 = cards.find(c => /10708-ex8g_10/.test(c.name));
const c3 = cards.find(c => /22222-zzzz/.test(c.name));
const c4 = cards.find(c => /Melbet/.test(c.name));

ok('картка з дизайном показує його', /shots\.test\/10708-ex8g\.jpg/.test(c1.src), c1);
ok('друга кампанія ТОЇ Ж воронки показує той самий дизайн',
  c2.src === c1.src, { a: c1.src, b: c2.src });
ok('адреси зіставлені за path, а не за порядком відповіді',
  /10708-ex8g/.test(c1.src), c1.src);
ok('картка без дизайну показує кнопку заливу з KTID',
  !c3.src && /\+ дизайн/.test(c3.add) && /22222-zzzz/.test(c3.add), c3);
ok('назва без KTID не отримує ні превю, ні кнопки',
  !c4.src && !c4.add && c4.shotW === 0, c4);

/* ─────────── кілька кадрів на одну воронку ─────────── */
/* Три кадри: один старого вигляду (без суфікса) і два нових. Усі три
   мусять лягти в одну воронку. */
await setup(['10708-ex8g', '10708-ex8g__1700000000001', '10708-ex8g__1700000000002'], false);

const slide = await page.evaluate(() => {
  const box = document.querySelector('.pw-shot');
  return {
    kadrs: pwShotsOf('10708-ex8g').length,
    n: (box.querySelector('.pw-shot-n') || {}).textContent || '',
    dots: box.querySelectorAll('.pw-shot-dots i').length,
    on: [...box.querySelectorAll('.pw-shot-dots i')].findIndex(i => i.classList.contains('is-on')),
    navs: box.querySelectorAll('.pw-shot-nav').length,
    src: box.querySelector('img').getAttribute('src')
  };
});
ok('три файли однієї воронки — три кадри', slide.kadrs === 3, slide);
ok('старий скрін без суфікса потрапив у ту саму воронку',
  /10708-ex8g\.jpg/.test(slide.src), slide.src);
ok('у колонці видно, який кадр із скількох', slide.n === '1/3', slide);
ok('крапок стільком ж, скільки кадрів, і горить перша',
  slide.dots === 3 && slide.on === 0, slide);
ok('стрілки є — туди й назад', slide.navs === 2, slide);

const flip = await page.evaluate(() => {
  const before = document.querySelector('#ap-list').innerHTML.length;
  document.querySelector('.pw-shot-nav.is-next').click();
  const box = document.querySelector('.pw-shot');
  return { i: box.getAttribute('data-i'),
           n: box.querySelector('.pw-shot-n').textContent,
           src: box.querySelector('img').getAttribute('src'),
           on: [...box.querySelectorAll('.pw-shot-dots i')].findIndex(i => i.classList.contains('is-on')),
           idx: pwShotIdx['10708-ex8g'],
           sameLen: document.querySelector('#ap-list').innerHTML.length === before };
});
ok('стрілка перемикає кадр', flip.n === '2/3' && flip.i === '1' && flip.on === 1, flip);
ok('і запам\'ятовує його на наступний рендер', flip.idx === 1, flip);

const wrapAround = await page.evaluate(() => {
  document.querySelector('.pw-shot-nav.is-prev').click();
  document.querySelector('.pw-shot-nav.is-prev').click();
  const box = document.querySelector('.pw-shot');
  return box.querySelector('.pw-shot-n').textContent;
});
ok('із першого кадру назад — на останній', wrapAround === '3/3', wrapAround);

/* ─────────── усі на одному екрані ─────────── */
const grid = await page.evaluate(() => {
  document.querySelector('.pw-shot img').click();
  const l = document.querySelector('.pw-shot-full');
  return {
    cells: l ? l.querySelectorAll('.pw-full-c img').length : 0,
    head: l ? (l.querySelector('.pw-full-n') || {}).textContent : '',
    kt: l ? (l.querySelector('.pw-full-kt') || {}).textContent : '',
    dels: l ? l.querySelectorAll('.pw-full-del').length : 0,
    apps: !document.getElementById('apps-modal').classList.contains('hidden')
  };
});
ok('на весь екран — ВСІ кадри сіткою', grid.cells === 3, grid);
ok('у шапці шару — воронка й кількість кадрів',
  grid.kt === '10708-ex8g' && /3 кадр/.test(grid.head), grid);
ok('у кожного кадру є кнопка видалення', grid.dels === 3, grid);
ok('вікно шаблонів при цьому не закривається', grid.apps, grid);

/* «Зближення коли кадри відкритті погано працює, дозволяй тільки одне
   зближення відкривати на повний екран»: доти кожен кадр перемикався
   сам по собі, і два розгорнутих ділили ту саму ширину. */
const big = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('.pw-full-c')];
  cs[0].click();
  const first = { big: cs[0].classList.contains('is-big'),
                  hid: getComputedStyle(cs[1]).display,
                  grid: document.querySelector('.pw-full-grid').classList.contains('has-big') };
  cs[1].click();                      // другий — поки перший розгорнутий
  const second = { only: document.querySelectorAll('.pw-full-c.is-big').length,
                   who: cs[1].classList.contains('is-big') && !cs[0].classList.contains('is-big') };
  cs[1].click();                      // той самий ще раз — назад у сітку
  const back = { big: document.querySelectorAll('.pw-full-c.is-big').length,
                 grid: document.querySelector('.pw-full-grid').classList.contains('has-big'),
                 shown: getComputedStyle(cs[0]).display };
  return { first, second, back };
});
ok('клік по кадру розгортає його', big.first.big && big.first.grid, big.first);
ok('решта кадрів на час зближення ховається', big.first.hid === 'none', big.first);
ok('розгорнутий ЛИШЕ ОДИН — новий знімає попередній',
  big.second.only === 1 && big.second.who, big.second);
ok('повторний клік повертає сітку',
  big.back.big === 0 && !big.back.grid && big.back.shown !== 'none', big.back);

const stay = await page.evaluate(() => {
  document.querySelector('.pw-full-grid').click();   // клік ПО СІТЦІ
  return !!document.querySelector('.pw-shot-full');
});
ok('клік по сітці шар не закриває — там і дивляться', stay);

const gone = await page.evaluate(() => {
  document.querySelector('.pw-shot-full').click();   // клік повз сітку
  return !document.querySelector('.pw-shot-full');
});
ok('клік повз сітку закриває', gone);

/* ─────────── видалення кадру ─────────── */
const del = await page.evaluate(async () => {
  window.__rm = [];
  const base = sb.storage.from();
  sb.storage = { from: () => ({
    list: base.list, createSignedUrls: base.createSignedUrls, upload: base.upload,
    remove: async paths => { window.__rm.push(...paths); return { error: null }; }
  }) };
  window.ask = async () => true;                     // підтвердження
  document.querySelector('.pw-shot img').click();
  document.querySelector('.pw-full-del').click();
  await new Promise(r => setTimeout(r, 80));
  return { rm: window.__rm, open: !!document.querySelector('.pw-shot-full') };
});
ok('видалення прибирає саме той кадр', del.rm.length === 1
  && /10708-ex8g/.test(del.rm[0]), del);
ok('шар при цьому лишається відкритим', del.open, del);

/* ─────────── службова картка PARAMETERS ─────────── */
const prm = cards.find(c => /Mbank_PARAMETERS/.test(c.name));
const prm2 = cards.find(c => /^PARAMETERS_KG/.test(c.name));
const near = cards.find(c => /Parametrix/.test(c.name));
ok('картка з PARAMETERS у гео не отримує ні превю, ні кнопки',
  prm && !prm.src && !prm.add && prm.shotW === 0, prm);
ok('те саме слово в назві — так само',
  prm2 && !prm2.src && !prm2.add && prm2.shotW === 0, prm2);
ok('і силки на ній лишаються на всю ширину', prm.mainW === 0, prm);
ok('схоже слово (Parametrix) превю НЕ втрачає',
  near && (near.src || near.add) && near.shotW > 0, near);

/* ─────────── силки звузились ─────────── */
ok('превю стоїть вузькою колонкою (~120px)', c1.shotW >= 110 && c1.shotW <= 130, c1);
ok('силки звузились на її ширину, а не лізуть під неї',
  c1.mainW > 0 && c1.mainW <= c1.cardW - c1.shotW, c1);
ok('картка без превю віддає всю ширину силкам', c4.mainW === 0, c4);

/* ─────────── на весь екран ─────────── */
const full = await page.evaluate(() => {
  document.querySelector('.pw-shot').click();
  const l = document.querySelector('.pw-shot-full');
  return { open: !!l, src: l ? l.querySelector('img').getAttribute('src') : '',
           apps: !document.getElementById('apps-modal').classList.contains('hidden') };
});
ok('клік по превю відкриває на весь екран', full.open && /10708-ex8g/.test(full.src), full);
ok('і вікно шаблонів при цьому НЕ закривається', full.apps, full);

const closed = await page.evaluate(() => {
  document.querySelector('.pw-shot-full').click();
  return !document.querySelector('.pw-shot-full');
});
ok('клік по шару закриває його', closed);

/* ─────────── залив ─────────── */
const up = await page.evaluate(async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  await pwShotUpload('22222-zzzz', blob, null);
  return window.__up;
});
ok('залив кладе файл під шлях команда/ktid__час',
  up.length === 1 && /^TEAM\/22222-zzzz__\d{10,}$/.test(up[0].path), up);
ok('і перезаписує як jpeg', up[0].type === 'image/jpeg', up);

/* ─────────── бакета ще немає ─────────── */
const noBucket = await page.evaluate(async () => {
  window.__toast = [];
  const realToast = window.toast;
  window.toast = (m, k) => { window.__toast.push(String(m)); };
  sb.storage = { from: () => ({
    upload: async () => ({ error: { message: 'Bucket not found' } }),
    list: async () => ({ data: [], error: null }),
    createSignedUrls: async () => ({ data: [], error: null })
  }) };
  await pwShotUpload('22222-zzzz', new Blob([new Uint8Array([1])], { type: 'image/png' }), null);
  window.toast = realToast;
  return window.__toast.join(' | ');
});
ok('бакета немає — кажемо, що саме виконати, а не код помилки',
  /PWASHOTS\.sql/.test(noBucket), noBucket);

await done(browser, srv, errs);
