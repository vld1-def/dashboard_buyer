/* БІБЛІОТЕКА КРЕАТИВІВ У CREATIVE ANALYZER + ПРЕВ'Ю.
   «я б також хотів його додати до Creative Analyzer, але щоб можна було
   клікаючи на креатив відкривати превю (і дивитись відео наприклад)». */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8763;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const r = await page.evaluate(async () => {
  const out = {};
  out.btn = !!document.querySelector('#creative-analyzer-section #cr-lib');
  window.teamDriveFolderId = 'F';
  teamDriveFolderId = 'F';
  window.creativesRawData = [
    { cid: 'KG_JS_674_1', spend: 120, installs: 30, regs: 10, deps: 3 },
    { cid: 'KG_JS_674_1', spend: 30, installs: 5, regs: 2, deps: 1 }];
  sb.from = () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) });
  lcDrive = [
    { id: 'v1', name: 'KG_JS_674_1 -v2.mp4', mimeType: 'video/mp4', folder: 'KG', size: '1048576' },
    { id: 'i1', name: 'NEW_ONE.png', mimeType: 'image/png', folder: '', size: '1000' }];
  lcSrc = 'drive';
  let picked = null; window.selectCreative = cid => { picked = cid; };
  crTags = { KG_JS_674_1: ['hook', 'ugc'] };
  await lcOpenCA();
  const card = document.querySelector('#lc-modal .lc-card');
  out.noSub = !/Google Drive folder/.test(card.innerText);
  out.noUp = !/Uploaded/.test(card.innerText);
  out.tagChips = [...card.querySelectorAll('.lc-tile .lc-tag')].map(x => x.textContent).join();
  out.hidden = !card.querySelector('.lc-tf') && !!card.querySelector('.lc-filt');
  card.querySelector('.lc-filt').click();
  const c2 = document.querySelector('#lc-modal .lc-card');
  out.tagBar = [...c2.querySelectorAll('.lc-tagpop .lc-tagpop-in:not(.lc-geopop) .lc-tf')].map(x => x.textContent.trim()).join();
  [...c2.querySelectorAll('.lc-tagpop-in:not(.lc-geopop) .lc-tf')].find(b => b.textContent.trim() === 'ugc').click();
  out.closedAfter = !document.querySelector('#lc-modal .lc-tagpop');
  out.dot = document.querySelector('#lc-modal .lc-filt')?.classList.contains('is-on');
  out.byTag = document.querySelectorAll('#lc-modal .lc-tile').length;
  lcTag = ''; lcTagOpen = true; lcPaint();
  const c3 = document.querySelector('#lc-modal .lc-card');
  out.geoChips = [...c3.querySelectorAll('.lc-geopop .lc-tf')].map(x => x.textContent.trim()).join();
  [...c3.querySelectorAll('.lc-geopop .lc-tf')].find(b => b.textContent.trim() === 'KG').click();
  out.byGeo = [...document.querySelectorAll('#lc-modal .lc-tile .lc-name')].map(x => x.textContent).join();
  out.geoDot = document.querySelector('#lc-modal .lc-filt')?.classList.contains('is-on');
  lcGeo = ''; lcTagOpen = false;
  lcQ = 'hook'; lcPaint();
  out.bySearch = document.querySelectorAll('#lc-modal .lc-tile').length;
  lcQ = ''; lcPaint();
  const tiles = [...document.querySelectorAll('#lc-modal .lc-tile')];
  out.tiles = tiles.length;
  out.stats = tiles[0].innerText.replace(/\s+/g, ' ');
  out.cold = tiles[1].innerText.replace(/\s+/g, ' ');
  out.play = !!tiles[0].querySelector('.lc-play') && !tiles[1].querySelector('.lc-play');
  tiles[0].click();
  const v = document.getElementById('lc-view');
  out.view = !!v && /drive\.google\.com\/file\/d\/v1\/preview/.test(v.innerHTML);
  out.foot = v ? v.querySelector('.lc-view-foot').innerText.replace(/\s+/g, ' ') : '';
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  out.escView = !document.getElementById('lc-view');
  out.libStill = !document.getElementById('lc-modal').classList.contains('hidden');
  tiles[1].click();
  out.img = /thumbnail\?id=i1/.test(document.getElementById('lc-view')?.innerHTML || '');
  lcViewClose();
  document.querySelectorAll('#lc-modal .lc-tile')[0].click();
  document.querySelector('#lc-view .lc-view-go')?.click();
  out.go = picked;
  out.closed = !document.getElementById('lc-view') && document.getElementById('lc-modal').classList.contains('hidden');
  // Вибір для шаблону: клік вибирає, око — прев'ю, цифр аналізатора немає.
  let set = null; window.ltMd = () => (set = {}); window.ltRepaintW = () => {};
  await lcOpen({ i: 0 });
  const t2 = document.querySelector('#lc-modal .lc-tile');
  out.pickEye = !!t2.querySelector('.lc-eye');
  out.pickNoCa = !/dep/.test(t2.innerText);
  t2.querySelector('.lc-eye').click();
  out.eyeView = !!document.getElementById('lc-view') && !set;
  lcViewClose();
  t2.click();
  out.pickSet = !!(set && set.drive_id === 'v1');
  return out;
});
ok('у шапці Creative Analyzer є кнопка Library', r.btn, r);
ok('бібліотека показує файли Drive', r.tiles === 2, r);
ok('підпису під заголовком немає', r.noSub, r);
ok('вкладки Uploaded з аналізатора немає', r.noUp, r);
ok('на картці — теги креативу', r.tagChips === 'hook,ugc', r.tagChips);
ok('теги сховані за іконкою-фільтром', r.hidden, r);
ok('іконка відкриває список тегів', r.tagBar === 'All,hook,ugc', r.tagBar);
ok('вибір тегу закриває список', r.closedAfter, r);
ok('іконка позначена, коли тег вибрано', r.dot === true, r);
ok('фільтр по тегу лишає його файли', r.byTag === 1, r);
ok('пошук знаходить по тегу', r.bySearch === 1, r);
ok('у фільтрі є гео (з підпапки й з назви)', r.geoChips === 'All,KG', r.geoChips);
ok('фільтр по гео лишає файли цього гео', r.byGeo === 'KG_JS_674_1 -v2.mp4', r.byGeo);
ok('гео теж позначає іконку', r.geoDot === true, r);
ok('на картці — цифри креативу з аналізатора', /\$150/.test(r.stats) && /4 dep/.test(r.stats), r.stats);
ok('файл без креативу — never launched', /never launched/.test(r.cold), r.cold);
ok('на відео — значок відтворення', r.play, r);
ok('клік відкриває плеєр Drive', r.view, r);
ok('під кадром — назва й цифри', /KG_JS_674_1/.test(r.foot) && /\$150 spend/.test(r.foot), r.foot);
ok('Escape закриває прев\'ю, бібліотека лишається', r.escView && r.libStill, r);
ok('картинка — великим кадром', r.img, r);
ok('«Open in Creative Analyzer» веде до креативу', r.go === 'KG_JS_674_1', r.go);
ok('і закриває вікна', r.closed, r);
ok('у виборі для шаблону — кнопка-око', r.pickEye, r);
ok('там цифр аналізатора немає', r.pickNoCa, r);
ok('око відкриває прев\'ю, не вибираючи', r.eyeView, r);
ok('клік по картці вибирає', r.pickSet, r);

await done(browser, srv, errs);
