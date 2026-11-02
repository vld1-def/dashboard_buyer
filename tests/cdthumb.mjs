/* ═══════════ КАРТИНКА КРЕАТИВА В РЯДКУ — З DRIVE ═══════════

   У списку стояли назви, а назву креативу дає людина: дві геть різні
   картинки регулярно звуться однаково з точністю до номера.

   Джерело — твій Google Drive, той самий, звідки бере превʼю Creative
   Analyzer. Не Facebook: той віддає те, що лежить у самому оголошенні
   (дарк-пост, старий креатив, пост іншої Сторінки), і посилання в
   нього підписані, тобто живуть годинами. У Drive лежить ТВІЙ файл,
   під твоєю назвою, і нікуди не дінеться.

   Що тут важить:

     1. збіг іде за НАЗВОЮ, і ріжеться вона лише по межі «не
        буквоцифра»: інакше KG_JS_674_10 зійшовся б за KG_JS_674_1;
     2. короткі шматки відкидаються: «KG» підійшло б до будь-якого
        файлу гео, і в рядку стояв би чужий креатив — а чуже гірше за
        порожнє, бо на нього дивляться й ухвалюють рішення;
     3. рамка стоїть у кожного оголошення, навіть без картинки, і
        каже, ЧОМУ вона порожня — причин чотири, і дії в них різні;
     4. скан папки один на сторінку й лише на вимогу: обхід із
        підпапками це десятки запитів;
     5. висота рядка зросла рівно на іконку — це свідома ціна. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8180;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const FILES = [
  { id: 'f1', name: 'KG_JS_674_1.mp4', mimeType: 'video/mp4',
    webViewLink: 'https://drive.google.com/file/d/f1/view' },
  /* Сусід по номеру: саме на ньому ламається наївний «починається з». */
  { id: 'f2', name: 'KG_JS_674_10.mp4', mimeType: 'video/mp4',
    webViewLink: 'https://drive.google.com/file/d/f2/view' },
  { id: 'f3', name: 'UZ_VD_951.jpg', mimeType: 'image/jpeg',
    webViewLink: 'https://drive.google.com/file/d/f3/view' }
];

const ROWS = [
  { ad_id: 'a1', campaign_id: 'C1', campaign_name: 'Camp', adset_id: 'S1',
    adset_name: 'Set', name: 'KG_JS_674_1', effective_status: 'ACTIVE',
    own_status: 'ACTIVE', spend: 30, impressions: 300, clicks: 9, link_clicks: 9 },
  { ad_id: 'a2', campaign_id: 'C1', campaign_name: 'Camp', adset_id: 'S1',
    adset_name: 'Set', name: 'UZ_VD_951 — copy 2', effective_status: 'ACTIVE',
    own_status: 'ACTIVE', spend: 20, impressions: 200, clicks: 7, link_clicks: 7 },
  { ad_id: 'a3', campaign_id: 'C1', campaign_name: 'Camp', adset_id: 'S1',
    adset_name: 'Set', name: 'PL_XX_000', effective_status: 'ACTIVE',
    own_status: 'ACTIVE', spend: 10, impressions: 100, clicks: 5, link_clicks: 5 }
];

await page.evaluate(files => {
  window.__d = { scans: 0 };
  teamDriveFolderId = 'folder-1';
  window.crDriveAllOnce = async () => { window.__d.scans++; return files; };
}, FILES);

/* Малюємо СПРАВЖНІ рядки таблиці кабінетів у ВИДИМИЙ вузол:
   вирівнювання й висота — питання розмітки, а в прихованому вузлі всі
   розміри нульові, тобто перевірка була б зеленою, не перевіривши
   нічого. */
const paint = flat => page.evaluate(([rows, isFlat]) => {
  cdRows = rows; cdErr = ''; cdSeen = Date.now();
  cdFlat = !!isFlat; cdFilt = ''; cdMarked = new Set(); cdOpenIds = new Set();
  if (!isFlat) { cdOpenIds.add('campaign:C1'); cdOpenIds.add('ad set:S1'); }
  const v = cdView();
  const html = (v.list || []).map(x => cabNodeRow(x.n, x.depth, x.band, cabColsShown())).join('');
  let box = document.getElementById('t-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 't-box';
    box.style.cssText = 'position:fixed;left:0;top:0;width:900px;z-index:9999;background:#000';
    document.body.appendChild(box);
  }
  box.innerHTML = '<table class="cab-tbl"><tbody>' + html + '</tbody></table>';
  return (v.list || []).length;
}, [ROWS, flat]);

const shot = () => page.evaluate(() =>
  [...document.querySelectorAll('#t-box tr.cab-node')].map(tr => {
    const img = tr.querySelector('img.cd-thumb');
    const none = tr.querySelector('.cd-thumb.is-none');
    const lbl = tr.querySelector('.cd-lbl');
    return {
      name: (lbl && lbl.textContent.trim()) || '',
      src: img ? img.getAttribute('src') : '',
      prev: img ? img.getAttribute('data-prev') : '',
      open: img ? img.getAttribute('data-open') : '',
      box: !!(img || none),
      none: !!none,
      tip: (img || none || {}).title || '',
      left: lbl ? Math.round(lbl.getBoundingClientRect().left) : 0,
      h: Math.round(tr.getBoundingClientRect().height)
    };
  }));

/* ── 1. збіг за назвою ── */
await paint(true);
await page.waitForFunction(() => cdDrive !== null);
await paint(true);
const flat = await shot();
const by = n => flat.find(r => r.name === n) || {};

ok('намальовано всі три оголошення', flat.length === 3, flat.map(r => r.name));
ok('картинка береться з Drive за id файлу',
  /drive\.google\.com\/thumbnail\?id=f1/.test(by('KG_JS_674_1').src), by('KG_JS_674_1'));
/* Саме той файл, а не сусід по номеру. Ріжемо лише по межі «не
   буквоцифра» — на цьому ж правилі стоїть і Creative Analyzer. */
ok('сусід по номеру не підміняє файл',
  !/id=f2/.test(by('KG_JS_674_1').src), by('KG_JS_674_1'));
/* Назва оголошення довша за назву файлу — хвіст ріжеться. */
ok('хвіст у назві оголошення не заважає',
  /id=f3/.test(by('UZ_VD_951 — copy 2').src), by('UZ_VD_951 — copy 2'));
ok('превʼю просить більший розмір, ніж іконка',
  /sz=w640/.test(by('UZ_VD_951 — copy 2').prev)
  && /sz=w48/.test(by('UZ_VD_951 — copy 2').src), by('UZ_VD_951 — copy 2'));
ok('клік веде на сам файл у Drive',
  by('UZ_VD_951 — copy 2').open === 'https://drive.google.com/file/d/f3/view',
  by('UZ_VD_951 — copy 2'));
ok('у підказці стоїть назва файлу',
  /UZ_VD_951\.jpg/.test(by('UZ_VD_951 — copy 2').tip), by('UZ_VD_951 — copy 2').tip);

/* ── 2. рамка без картинки ── */
ok('без файлу рамка все одно є',
  by('PL_XX_000').box && by('PL_XX_000').none, by('PL_XX_000'));
ok('і каже, якої саме назви не знайшла',
  /No file in your Drive folder is named pl_xx_000/.test(by('PL_XX_000').tip),
  by('PL_XX_000').tip);
/* Головне, заради чого рамка й стоїть: назви в усіх рядках
   починаються з одного місця. */
ok('назви стоять в одну лінію',
  by('PL_XX_000').left > 0
  && by('KG_JS_674_1').left === by('PL_XX_000').left
  && by('UZ_VD_951 — copy 2').left === by('PL_XX_000').left,
  flat.map(r => r.name + ':' + r.left));

/* ── 3. скан один на сторінку ── */
await paint(true);
const scans = await page.evaluate(() => window.__d.scans);
ok('папку скануємо один раз на всі рядки', scans === 1, { scans });

/* ── 4. чотири причини порожньої рамки ── */
const why = await page.evaluate(async () => {
  const out = {};
  const run = () => {
    cdPicBy.clear();
    const box = document.createElement('div');
    box.innerHTML = cdPicCell({ kind: 'ad', id: 'x', name: 'KG_JS_674_1' });
    return (box.querySelector('.cd-thumb.is-none') || {}).title || '';
  };
  const keepDrive = cdDrive, keepFolder = teamDriveFolderId;
  teamDriveFolderId = null; cdDrive = []; out.noFolder = run();
  teamDriveFolderId = 'folder-1';
  cdDriveErr = 'Drive API 403'; out.err = run();
  cdDriveErr = ''; cdDrive = []; out.empty = run();
  cdDrive = keepDrive; teamDriveFolderId = keepFolder; cdPicBy.clear();
  /* Назва, у якій нема чого шукати: без числа це не назва креатива. */
  const box = document.createElement('div');
  box.innerHTML = cdPicCell({ kind: 'ad', id: 'y', name: 'just some ad' });
  out.noName = (box.querySelector('.cd-thumb.is-none') || {}).title || '';
  return out;
});
ok('папка не налаштована — кажемо саме це',
  /Settings → Integrations/.test(why.noFolder), why.noFolder);
ok('Drive відмовив — кажемо, що саме він відповів',
  /Drive API 403/.test(why.err), why.err);
ok('папка порожня — теж окремо', /no files in it/.test(why.empty), why.empty);
/* «KG» підійшло б до будь-якого файлу гео, тож короткі шматки не
   шукаємо взагалі — і кажемо, за чим саме збігаємо. */
ok('назва не схожа на креатив — пояснюємо, яка потрібна',
  /does not look like a creative name/.test(why.noName), why.noName);

/* ── 5. розріз назви ── */
const cids = await page.evaluate(() => ({
  full: cdCids('KG_JS_674_1 — copy'),
  short: cdCids('KG'),
  noNum: cdCids('some_ad_name'),
  oneWord: cdCids('kgjs674')
}));
ok('шматки йдуть від найдовшого', cids.full[0] === 'kg_js_674_1 — copy'.replace(/[^0-9a-zа-яіїєґ]+$/i, '')
  || cids.full[0].startsWith('kg_js_674_1'), cids.full);
ok('і серед них є сама назва креатива',
  cids.full.includes('kg_js_674_1'), cids.full);
ok('короткий шматок не шукаємо', cids.short.length === 0, cids.short);
ok('без числа — теж не назва', cids.noNum.length === 0, cids.noNum);
ok('і одне слово без роздільників теж', cids.oneWord.length === 0, cids.oneWord);

/* ── 6. кампанія й адсет ── */
await paint(false);
const tree = await shot();
ok('у кампанії іконки немає', (tree.find(r => r.name === 'Camp') || {}).box === false, tree);
ok('в адсета теж', (tree.find(r => r.name === 'Set') || {}).box === false, tree);
ok('а в оголошень дерева вона є',
  (tree.find(r => r.name === 'KG_JS_674_1') || {}).box === true, tree.map(r => r.name));

/* ── 7. висота рядка ── */
const tall = await page.evaluate(() => {
  const one = document.querySelector('#t-box tr.cab-node .cd-thumb');
  /* Висоту беремо зі стилю, а не з rect: сторінка живе під
     body { zoom: .9 }, і 24px у ній міряються як 21.6. */
  const h = one ? Math.round(parseFloat(getComputedStyle(one).height)) : 0;
  document.querySelectorAll('#t-box .cd-thumb').forEach(e => e.remove());
  const rows = [...document.querySelectorAll('#t-box tr.cab-node')];
  return { icon: h, bare: Math.round(rows[rows.length - 1].getBoundingClientRect().height) };
});
const withPic = (tree.find(r => r.name === 'PL_XX_000') || {}).h;
ok('іконка саме 24px', tall.icon === 24, tall);
ok('рядок вищий не більше, ніж на іконку',
  withPic - tall.bare > 0 && withPic - tall.bare <= 12, { withPic, bare: tall.bare });

await done(browser, srv, errs);
