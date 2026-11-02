/* ═══════════ ІКОНКА КРЕАТИВА В РЯДКУ ОГОЛОШЕННЯ ═══════════

   У списку стояли назви — а назву креативу дає людина, і дві різні
   картинки часто звуться однаково з точністю до номера. Іконка
   відповідає на «що це взагалі» швидше за будь-який підпис.

   Що тут важить:

     1. рамка стоїть у КОЖНОГО оголошення, навіть без картинки:
        інакше назви в сусідніх рядках починались би з різних місць, а
        список, у якому половина рядків зсунута, читається як
        зламаний;
     2. порожня рамка каже, ЧОМУ вона порожня, і застаріле посилання
        теж (воно підписане й живе недовго);
     3. превʼю — те саме вікно, що в Creative Analyzer, і бере повну
        картинку, коли вона є, а кадр — коли ні (для відео кадр і є
        єдине, що Facebook дає);
     4. у кампанії й адсета іконки немає: креатив живе на оголошенні;
     5. клік по іконці не розкриває рядок;
     6. висота рядка зросла, і рівно настільько, скільки коштує сама
        іконка — це свідома ціна, і стенд тримає її в межах. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/fb-sync/index.ts', 'utf8');

/* ── 1. синк просить картинки й кладе їх у знімок ── */
/* Вигадане імʼя поля валить УВЕСЬ підзапит разом із доменами, тому
   обидва поля — давні й добре відомі: thumbnail_url (є і для відео —
   це кадр) та image_url (лише статика). */
ok('синк просить обидва поля креатива',
  /thumbnail_url,image_url/.test(FN.replace(/\s|'|\+/g, '')), '');

/* ── ОБКЛАДИНКА ВІДЕО ──

   thumbnail_url у відео-оголошень часто біла заглушка, а не кадр — і
   порожній білий квадрат у рядку не відрізнити від зламаного
   посилання. Справжня обкладинка лежить у полях, які ми вже тягнемо
   заради доменів, тож коштує вона нуль запитів. */
const picSrc = FN.match(/function adPics[\s\S]*?\n}/);
ok('у функції є свій добір картинки', !!picSrc);
const adPics = new Function(
  /* Знімаємо типи TypeScript: стенд проганяє САМЕ цей код, а не його
     копію — інакше перевіряли б не те, що задеплоїться. */
  (picSrc ? picSrc[0] : '')
    .replace(/ as Json/g, '')
    .replace(/: \{ th: string; im: string \}/g, '')
    .replace(/: Json|: string|: unknown/g, '')
  + '\nreturn adPics;')();

/* Відео: кадру немає, обкладинка в object_story_spec.video_data. */
const vid = adPics({ thumbnail_url: 'https://cdn/white.png',
  object_story_spec: { video_data: { image_url: 'https://cdn/cover.jpg' } } });
ok('у відео береться обкладинка, а не заглушка',
  vid.th === 'https://cdn/cover.jpg' && vid.im === 'https://cdn/cover.jpg', vid);
/* Пост із посиланням — picture; динамічний креатив — стрічка. */
const link = adPics({ object_story_spec: { link_data: { picture: 'https://cdn/post.jpg' } } });
ok('у посту з посиланням — його картинка', link.th === 'https://cdn/post.jpg', link);
const feed = adPics({ asset_feed_spec: { images: [{ url: 'https://cdn/feed.jpg' }] } });
ok('у динамічного креативу — перша з стрічки', feed.th === 'https://cdn/feed.jpg', feed);
const feedVid = adPics({ asset_feed_spec: { videos: [{ thumbnail_url: 'https://cdn/fv.jpg' }] } });
ok('і відео зі стрічки теж', feedVid.th === 'https://cdn/fv.jpg', feedVid);
/* Коли більше нічого немає — лишається thumbnail_url: він гірший, але
   це все, що Facebook дав. */
const only = adPics({ thumbnail_url: 'https://cdn/t.jpg' });
ok('без обкладинки лишається мініатюра',
  only.th === 'https://cdn/t.jpg' && only.im === 'https://cdn/t.jpg', only);
const none2 = adPics({});
ok('а без нічого — порожньо', !none2.th && !none2.im, none2);
ok('і кладе їх у рядок знімка',
  /thumb_url: a\.thumb \|\| null, image_url: a\.pic \|\| null/.test(FN), '');
/* На знімку стоять ПРАВИЛА. Відмовитись від нього через дві нові
   колонки означало б, що автопауза перестала працювати через картинку
   в інтерфейсі. */
ok('без колонок знімок усе одно пишеться',
  /SNAP_PIC_COLS\.some\(c => m\.includes\(c\)\)/.test(FN)
  && /SNAP_PIC_COLS\.forEach\(k => \{ delete c\[k\]; \}\)/.test(FN), '');
ok('і про потрібний ALTER TABLE сказано назовні',
  /creatives: picNote \|\| 'ok'/.test(FN)
  && /run the ALTER TABLE/.test(FN), '');
ok('колонки є у FB_RULES.sql',
  /add column if not exists thumb_url/.test(fs.readFileSync('FB_RULES.sql', 'utf8'))
  && /add column if not exists image_url/.test(fs.readFileSync('FB_RULES.sql', 'utf8')), '');

const PORT = 8180;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const ROWS = [
  { ad_id: 'a1', campaign_id: 'C1', campaign_name: 'Camp', adset_id: 'S1',
    adset_name: 'Set', name: 'Video ad', effective_status: 'ACTIVE',
    own_status: 'ACTIVE', spend: 30, impressions: 300, clicks: 9, link_clicks: 9,
    /* Відео: повної картинки не буде, лише кадр. */
    thumb_url: 'https://cdn.example/frame.jpg', image_url: '' },
  { ad_id: 'a2', campaign_id: 'C1', campaign_name: 'Camp', adset_id: 'S1',
    adset_name: 'Set', name: 'Static ad', effective_status: 'ACTIVE',
    own_status: 'ACTIVE', spend: 20, impressions: 200, clicks: 7, link_clicks: 7,
    thumb_url: 'https://cdn.example/small.jpg',
    image_url: 'https://cdn.example/full.jpg' },
  { ad_id: 'a3', campaign_id: 'C1', campaign_name: 'Camp', adset_id: 'S1',
    adset_name: 'Set', name: 'No picture', effective_status: 'ACTIVE',
    own_status: 'ACTIVE', spend: 10, impressions: 100, clicks: 5, link_clicks: 5 }
];

/* Малюємо СПРАВЖНІ рядки таблиці кабінетів: і вирівнювання, і висота
   рядка — це питання розмітки, а не рядка HTML.

   У ВИДИМИЙ контейнер, а не в #cab-list: сторінка відкривається не на
   кабінетах, і в прихованому вузлі всі розміри дорівнюють нулю — тобто
   перевірка вирівнювання була б зеленою, не перевіривши нічого. */
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
      box: !!(img || none),
      none: !!none,
      tip: (img || none || {}).title || '',
      stop: img ? String(img.getAttribute('onclick') || '') : '',
      left: lbl ? Math.round(lbl.getBoundingClientRect().left) : 0,
      h: Math.round(tr.getBoundingClientRect().height)
    };
  }));

await paint(true);
const flat = await shot();
const by = n => flat.find(r => r.name === n) || {};

ok('намальовано всі три оголошення', flat.length === 3, flat.map(r => r.name));
ok('картинка стоїть у рядку', by('Video ad').src === 'https://cdn.example/frame.jpg', by('Video ad'));
/* Для відео Facebook дає лише кадр — превʼю бере його. */
ok('у відео превʼю — кадр', by('Video ad').prev === 'https://cdn.example/frame.jpg', by('Video ad'));
/* А де є повна картинка, превʼю бере саме її: іконка 24px, розтягнута
   на превʼю, показала б мило замість креативу. */
ok('у статики превʼю — повна картинка',
  by('Static ad').prev === 'https://cdn.example/full.jpg'
  && by('Static ad').src === 'https://cdn.example/small.jpg', by('Static ad'));

/* ── рамка там, де картинки немає ── */
ok('без картинки рамка все одно є', by('No picture').box && by('No picture').none,
  by('No picture'));
/* Три причини — три різні підказки, і тут саме третя: у сусідніх
   рядках картинки є, отже й колонки, і синк на місці, а Facebook не
   дав картинки саме для цього креатива. Відсилати тут до SQL або до
   деплою означало б послати не туди. */
ok('і вона каже, чому порожня',
  /Facebook sent no picture/.test(by('No picture').tip), by('No picture').tip);
/* Головне, заради чого рамка й стоїть: назви в усіх рядках
   починаються з одного місця. */
/* > 0 обовʼязкове: у прихованому вузлі всі три дорівнювали б нулю, і
   перевірка була б зеленою, не перевіривши нічого. */
ok('назви стоять в одну лінію',
  by('No picture').left > 0
  && by('Video ad').left === by('No picture').left
  && by('Static ad').left === by('No picture').left,
  flat.map(r => r.name + ':' + r.left));

/* ── клік по іконці не розкриває рядок ── */
ok('клік по іконці не розкриває рядок',
  /cdPicOpen/.test(by('Video ad').stop), by('Video ad').stop);
/* Превʼю під курсором має стелю в 300px і зникає, щойно відвів мишу.
   Коли треба роздивитись креатив — цього мало, тож клік відкриває
   саму картинку. */
const opened = await page.evaluate(() => {
  const seen = [];
  const real = window.open;
  window.open = (u, t) => { seen.push({ u, t }); return null; };
  let bubbled = 0;
  const img = [...document.querySelectorAll('#t-box img.cd-thumb')]
    .find(x => x.getAttribute('data-name') === 'Static ad');
  img.closest('tr').addEventListener('click', () => { bubbled++; });
  img.click();
  window.open = real;
  return { seen, bubbled };
});
ok('клік відкриває саму картинку в новій вкладці',
  opened.seen.length === 1 && opened.seen[0].u === 'https://cdn.example/full.jpg'
  && opened.seen[0].t === '_blank', opened.seen);
ok('і не доходить до рядка', opened.bubbled === 0, opened);

/* ── превʼю тим самим вікном, що в Creative Analyzer ── */
const hov = await page.evaluate(() => {
  const seen = [];
  window.showImgPreview = (e, url, label) => seen.push({ url, label });
  let hidden = 0;
  window.hideImgPreview = () => { hidden++; };
  const img = document.querySelector('#t-box img.cd-thumb');
  cdPic({ clientX: 10, clientY: 10 }, img);
  cdPicOut();
  return { seen, hidden };
});
ok('наведення показує превʼю', hov.seen.length === 1, hov.seen);
ok('і підписує його назвою оголошення',
  hov.seen[0] && /ad$/.test(hov.seen[0].label), hov.seen);
ok('а відведення його ховає', hov.hidden === 1, hov);
/* Вікна превʼю на сторінці може не бути — іконка від цього не має
   ламатись. */
const safe = await page.evaluate(() => {
  const was = window.showImgPreview;
  delete window.showImgPreview;
  let threw = '';
  try { cdPic({ clientX: 1, clientY: 1 }, document.querySelector('#t-box img.cd-thumb')); }
  catch (e) { threw = String(e.message || e); }
  window.showImgPreview = was;
  return threw;
});
ok('без вікна превʼю нічого не падає', safe === '', { safe });

/* ── застаріле посилання ── */
const dead = await page.evaluate(() => {
  const img = document.querySelector('#t-box img.cd-thumb');
  cdPicDead(img);
  return { src: img.getAttribute('src'), cls: img.className, tip: img.title };
});
ok('застаріле посилання лишає рамку',
  dead.src === null && /is-none/.test(dead.cls), dead);
ok('і каже, що робити', /press Sync now/.test(dead.tip), dead.tip);

/* ── СТОРІНКА МУСИТЬ ПРОСИТИ ЦІ КОЛОНКИ ──

   Перша редакція їх не просила: колонки були в базі, їх писав синк, а
   запит дерева перелічує поля поіменно — і r.thumb_url приходило
   undefined. Кожне оголошення малювало порожню рамку, хоч картинка
   лежала в базі, і ззовні це виглядало як «SQL виконав, а зображень
   немає».

   Тому стенд іде справжнім завантажувачем, а заглушка поводиться як
   PostgREST: віддає РІВНО ті колонки, які попросили. Забув попросити —
   стенд червоний. */
const asked = await page.evaluate(async rows => {
  const seen = [];
  sb.from = () => ({
    select: cols => {
      seen.push(cols);
      const want = String(cols).split(',').map(c => c.trim());
      const cut = rows.map(r => {
        const o = {};
        want.forEach(c => { if (c in r) o[c] = r[c]; });
        return o;
      });
      return { eq: () => ({ limit: async () => ({ data: cut, error: null }) }) };
    }
  });
  cdFlat = true; cdFilt = ''; cdMarked = new Set(); cdOpenIds = new Set();
  cdAcc = '777';
  await cdLoad('777');
  const v = cdView();
  const n = (v.list || []).map(x => x.n).find(x => x.name === 'Static ad') || {};
  return { cols: seen.join(' | '), thumb: n.thumb || '', pic: n.pic || '',
           noPic: cdNoPic };
}, ROWS);
ok('запит просить обидві колонки картинки',
  /thumb_url/.test(asked.cols) && /image_url/.test(asked.cols), asked.cols);
ok('і вони доходять до вузла дерева',
  asked.thumb === 'https://cdn.example/small.jpg'
  && asked.pic === 'https://cdn.example/full.jpg', asked);
ok('коли картинки є — причини казати нема', asked.noPic === '', asked);

/* Колонок у базі немає: ярус відпадає, решта розбору лишається, і
   причина названа саме як «виконай SQL». */
const noCol = await page.evaluate(async rows => {
  sb.from = () => ({
    select: cols => ({
      eq: () => ({ limit: async () => {
        if (/thumb_url/.test(cols)) return { data: null,
          error: { message: "column fb_ad_today.thumb_url does not exist" } };
        const want = String(cols).split(',').map(c => c.trim());
        return { data: rows.map(r => {
          const o = {}; want.forEach(c => { if (c in r) o[c] = r[c]; }); return o;
        }), error: null };
      } })
    })
  });
  cdAcc = '777';
  await cdLoad('777');
  return { rows: cdRows.length, noPic: cdNoPic, err: cdErr,
           names: cdRows.map(r => r.name) };
}, ROWS);
ok('без колонок розбір кабінета не зникає',
  noCol.rows === 3 && !noCol.err, noCol);
ok('і причина названа як «виконай SQL»', noCol.noPic === 'sql', noCol);

/* Колонки є, значень немає — це вже про деплой, і це рівно те, що
   буває зразу після ALTER TABLE. Дві різні причини, дві різні дії. */
const noVal = await page.evaluate(async rows => {
  const bare = rows.map(r => ({ ...r, thumb_url: null, image_url: null }));
  sb.from = () => ({
    select: cols => {
      const want = String(cols).split(',').map(c => c.trim());
      return { eq: () => ({ limit: async () => ({ data: bare.map(r => {
        const o = {}; want.forEach(c => { if (c in r) o[c] = r[c]; }); return o;
      }), error: null }) }) };
    }
  });
  cdAcc = '777';
  await cdLoad('777');
  const v = cdView();
  /* Підказку беремо з САМОЇ рамки, а не першим title у рядку: першим
     там стоїть галочка мультивибору. */
  const html = (v.list || []).map(x => cdFields(x.n, x.depth).name).join('');
  const box = document.createElement('div');
  box.innerHTML = html;
  return { noPic: cdNoPic,
           tip: (box.querySelector('.cd-thumb.is-none') || {}).title || '' };
}, ROWS);
ok('колонки є, картинок немає — причина про деплой', noVal.noPic === 'sync', noVal);
ok('і рамка каже саме про деплой',
  /deploy fb-sync/.test(noVal.tip) && !/ALTER TABLE/.test(noVal.tip), noVal.tip);

/* А КОЛИ СИНХРОНІЗАЦІЯ САМА СКАЗАЛА ЧОМУ — показуємо її слова, а не
   свою здогадку. «Задеплой fb-sync» тому, хто щойно його задеплоїв, —
   рівно та помилка, на якій цей проєкт уже обпікся з доменами. */
const said = await page.evaluate(() => {
  cdPicNote = 'the deployed fb-sync is 2026-10-27.1, this page expects 2026-11-02.2';
  cdNoPic = 'sync';
  const box = document.createElement('div');
  box.innerHTML = cdPicCell({ kind: 'ad', id: 'x', name: 'Ad', thumb: '', pic: '' });
  const tip = (box.querySelector('.cd-thumb.is-none') || {}).title || '';
  cdPicNote = '';
  return tip;
});
ok('слова самої синхронізації важливіші за здогадку',
  /2026-10-27\.1/.test(said) && /The last sync said/.test(said), said);

/* ── кампанія й адсет ── */
await paint(false);
const tree = await shot();
const camp = tree.find(r => r.name === 'Camp') || {};
const set = tree.find(r => r.name === 'Set') || {};
ok('у кампанії іконки немає', camp.box === false, camp);
ok('в адсета теж', set.box === false, set);
ok('а в оголошень дерева вона є',
  (tree.find(r => r.name === 'Video ad') || {}).box === true, tree.map(r => r.name));

/* ── висота рядка ── */
const tall = await page.evaluate(() => {
  const one = document.querySelector('#t-box tr.cab-node .cd-thumb');
  /* Висоту іконки беремо зі стилю, а не з rect: сторінка живе під
     body { zoom: .9 }, і 24px у ній міряються як 21.6. */
  const h = one ? Math.round(parseFloat(getComputedStyle(one).height)) : 0;
  /* Та сама таблиця без іконок: різниця і є ціна іконки. */
  document.querySelectorAll('#t-box .cd-thumb').forEach(e => e.remove());
  const rows = [...document.querySelectorAll('#t-box tr.cab-node')];
  return { icon: h, bare: Math.round(rows[rows.length - 1].getBoundingClientRect().height) };
});
const withPic = (tree.find(r => r.name === 'No picture') || {}).h;
ok('іконка саме 24px', tall.icon === 24, tall);
/* Ціна свідома: рядок вищий приблизно на висоту іконки, і не більше.
   Якщо колись виросте сильніше — це вже не іконка, а перешкода. */
ok('рядок вищий не більше, ніж на іконку',
  withPic - tall.bare > 0 && withPic - tall.bare <= 12, { withPic, bare: tall.bare });

await done(browser, srv, errs);
