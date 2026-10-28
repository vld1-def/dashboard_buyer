/* ═══════════ ПОСИЛАННЯ НА АПКУ В PLAY ═══════════

   Апку банять мовчки: вона лежить у списку рівно так само, як живі,
   шаблон під неї вибирають очима, і неймінг забаненої апки спокійно
   їде в кабінет. APP_STATUS.sql дав стан active/ban, але ставили його
   руками — тобто тоді, коли хтось помітив.

   Тепер у воронки є app_id, і щоденний обхід (check-apps) сам ставить
   бан. Стенд тримає те, що з цього живе в браузері:
     • поле НЕОБОВ'ЯЗКОВЕ і з'являється лише для апки;
     • вставити можна і пакет, і цілу адресу Play — ід дістається;
     • не схоже на пакет — поле лишається порожнім, а не заповненим
       сміттям, за яким обхід щодня ходив би в нікуди;
     • той самий розбір в обох місцях: дашборд і Form мусять заводити
       один ід однаково;
     • іконка стоїть У рядку неймінга, тож висота блока не міняється;
     • іконки немає — немає й місця під неї. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8147;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* ─────────── розбір того, що вставили ─────────── */
const ID = await page.evaluate(() => {
  const t = v => apAppId(v);
  return {
    plain: t('com.fortunedra.gontrheb'),
    spaced: t('  com.fortunedra.gontrheb  '),
    url: t('https://play.google.com/store/apps/details?id=com.fortunedra.gontrheb'),
    urlTail: t('https://play.google.com/store/apps/details?id=com.fortunedra.gontrheb&hl=uk&gl=UA'),
    urlFirst: t('https://play.google.com/store/apps/details?hl=uk&id=com.a.b'),
    three: t('com.a.b.c'),
    empty: t(''),
    junk: t('просто текст'),
    oneWord: t('fortunedra'),
    notPkg: t('https://example.com/app'),
    digitStart: t('1com.a.b')
  };
});
ok('пакет береться як є', ID.plain === 'com.fortunedra.gontrheb', ID.plain);
ok('пробіли по краях не заважають', ID.spaced === 'com.fortunedra.gontrheb', ID.spaced);
ok('з адреси Play ід дістається', ID.url === 'com.fortunedra.gontrheb', ID.url);
ok('хвіст адреси не заважає', ID.urlTail === 'com.fortunedra.gontrheb', ID.urlTail);
ok('id не першим параметром — теж', ID.urlFirst === 'com.a.b', ID.urlFirst);
ok('три частини — теж пакет', ID.three === 'com.a.b.c', ID.three);
ok('порожнє лишається порожнім', ID.empty === '', ID.empty);
ok('не схоже на пакет — порожнє, а не сміття',
  ID.junk === '' && ID.oneWord === '' && ID.notPkg === '' && ID.digitStart === '', ID);

/* ─────────── поле в діалозі ─────────── */
const fields = kind => page.evaluate(async isApp => {
  currentTeam = 'T';
  apFunnels = [];
  apItems = [];
  window.__p = apAddFunnel(isApp);
  await new Promise(r => setTimeout(r, 60));
  const w = document.querySelector('.askwrap');
  const keys = [...w.querySelectorAll('[data-k]')].map(e => e.dataset.k);
  const lab = [...w.querySelectorAll('.ask-f-lab')].map(e => e.textContent.trim());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await window.__p;
  return { keys, lab };
}, kind);

const fApp = await fields(true);
ok('для апки поле посилання є, і стоїть після гео',
  JSON.stringify(fApp.keys) === JSON.stringify(['name', 'ktid', 'geo', 'app_id', 'is_app']),
  fApp.keys);
ok('і воно не обов\'язкове — без зірочки',
  fApp.lab.some(l => /Апка в Play/.test(l) && !/\*/.test(l)), fApp.lab);

const fFun = await fields(false);
ok('для звичайної воронки поля немає: Play про неї нічого не знає',
  !fFun.keys.includes('app_id'), fFun.keys);

/* ─────────── іконка біля неймінга ─────────── */
const card = sel => page.evaluate(sel => {
  currentTeam = 'T';
  apFunnels = [{ ktid: 'K1', funnel_name: 'Mostbet [satorapps]', geo: 'KG', is_app: true,
                 app_id: 'com.a.b', app_icon: sel ? 'https://play-lh.example/icon.png' : '' }];
  apItems = [{ id: 'i1', geo: 'KG', provider: 'satorapps',
               naming: 'KG_{app}_test', deeplink: '', subs: [] }];
  apMode = 'app';
  try { localStorage.setItem('ap_pick', JSON.stringify({ i1: 'K1' })); } catch (e) {}
  apRenderMode();
  const img = document.querySelector('#ap-list .ap-ico');
  const code = document.querySelector('#ap-list .ap-copy');
  const row = code && code.parentElement;
  const r = e => e.getBoundingClientRect();
  return { has: !!img,
           src: img ? img.getAttribute('src') : '',
           lazy: img ? img.getAttribute('loading') : '',
           drops: img ? (img.getAttribute('onerror') || '') : '',
           rowH: row ? Math.round(r(row).height) : 0,
           icoH: img ? Math.round(r(img).height) : 0,
           inRow: !!(img && row && img.parentElement === row) };
}, sel);

const withIco = await card(true);
ok('іконка стоїть, і з адреси, яку привіз обхід',
  withIco.has && /play-lh/.test(withIco.src), withIco);
ok('вантажиться ліниво — список може бути довгим', withIco.lazy === 'lazy', withIco.lazy);
ok('не завантажилась — прибирає себе сама, а не лишає рамку з хрестиком',
  /this\.remove\(\)/.test(withIco.drops), withIco.drops);
ok('іконка стоїть У рядку неймінга, а не під ним', withIco.inRow, withIco);
ok('розмір іконки прибитий до висоти рядка неймінга',
  withIco.icoH >= 26 && withIco.icoH <= 29, withIco.icoH);

const noIco = await card(false);
ok('немає іконки — немає й місця під неї', !noIco.has, noIco);
/* ВИСОТУ РЯДКА ТУТ НЕ ПОРІВНЮЄМО, і це свідомо. Рядок неймінга
   складається з класів Tailwind (py-1.5, text-[12px]), а Tailwind у
   стенд не доїжджає — відтворити його метрики підміною однієї
   властивості не вийшло, і порівняння міряло б не іконку, а те, чого
   в стенді немає.

   Натомість перевіряємо сам договір, який і тримає висоту: іконка
   рівно 28px (стільки ж, скільки рядок неймінга в справжній
   сторінці) і не розтягується. Поки це так, блок вищим не стане. */
await card(true);                     // останній малюнок був без іконки
const box = await page.evaluate(() => {
  const i = document.querySelector('#ap-list .ap-ico');
  const st = getComputedStyle(i);
  return { w: st.width, h: st.height, grow: st.flexGrow, shrink: st.flexShrink };
});
// Субпікселі тут від масштабу вікна, а не від розмітки — округляємо.
const px = v => Math.round(parseFloat(v));
ok('іконка квадратна й рівно 28px — як і рядок неймінга',
  px(box.w) === 28 && px(box.h) === 28, box);
ok('і не розтягується разом із рядком',
  box.grow === '0' && box.shrink === '0', box);

await done(browser, srv, errs);
