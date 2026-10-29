/* ═══════════ МІНІ-ПРАПОРЦІ ГЕО ═══════════

   Прапорці вже були в Creative Analyzer і в знімку звіту — двома
   різними <img> з тими самими адресами (в одному onerror був, у
   другому ні). Тепер їх малює одна функція, і вона ж додала прапорці
   в прілки, ПВА, тексти і Geo Performance.

   Що тут доводиться:
     1. прапорець є лише для дворівневого коду країни: «—», «??» і
        назва регіону лишаються без картинки, а не з битою іконкою;
     2. UK і EL ведуть на gb і gr — інакше Британія з Грецією були б
        єдиними країнами без прапорця;
     3. у деревах прапорець стоїть у рядку ГЕО і не стоїть у рядку
        постачальника чи категорії — там дволітерна назва дала б
        прапорець країни, якої ніхто не мав на увазі;
     4. в усіх чотирьох місцях картинка справді в DOM, а не лише в
        рядку: саме на цьому попередній стенд списку апок і погорів. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8162;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* ─────────── 1. сама функція ─────────── */
const h = await page.evaluate(() => {
  const src = c => (geoFlag(c).match(/flagcdn\.com\/w40\/([a-z-]+)\.png/) || [])[1] || '';
  return {
    ua: src('UA'), lower: src('kg'), spaced: src('  tj  '),
    uk: src('UK'), el: src('EL'),
    dash: geoFlag('—'), q: geoFlag('??'), empty: geoFlag(''),
    nul: geoFlag(null), long: geoFlag('LATAM'), one: geoFlag('U'),
    digits: geoFlag('12'), mixed: geoFlag('U1'),
    cls: geoFlag('UA', 'w-9 h-6'),
    plain: geoFlag('UA')
  };
});
ok('код країни дає прапорець', h.ua === 'ua', h);
ok('регістр і пробіли не заважають', h.lower === 'kg' && h.spaced === 'tj', h);
ok('UK веде на британський прапор', h.uk === 'gb', h.uk);
ok('EL веде на грецький', h.el === 'gr', h.el);
ok('«—» прапорця не дає', h.dash === '', h.dash);
ok('«??» прапорця не дає', h.q === '', h.q);
ok('порожнє і null прапорця не дають', h.empty === '' && h.nul === '', h);
ok('назва регіону прапорця не дає', h.long === '', h.long);
ok('одна літера, цифри й суміш прапорця не дають',
  h.one === '' && h.digits === '' && h.mixed === '', h);
ok('клас передається всередину', /w-9 h-6/.test(h.cls), h.cls);
ok('є запасний клас, коли його не дали', /w-4 h-3/.test(h.plain), h.plain);
ok('невідомий код прибирає себе сам, а не лишає рамку',
  /onerror="this\.remove\(\)"/.test(h.plain), h.plain);
ok('картинка не тягне на себе клік і не чекає видимості',
  /loading="lazy"/.test(h.plain) && /alt=""/.test(h.plain), h.plain);

/* ─────────── 2. дерево прілок ─────────── */
const apT = await page.evaluate(() => {
  apItems = [
    { id: 'a1', geo: 'KG', provider: 'My apps', naming: 'n1' },
    { id: 'a2', geo: 'TJ', provider: 'satorapps', naming: 'n2' },
    { id: 'a3', geo: '—', provider: 'satorapps', naming: 'n3' }
  ];
  apGeo = 'KG'; apProv = ''; apOpenWas = null;
  let err = '';
  try { apRenderTree(); } catch (e) { err = String(e); }
  const el = document.getElementById('ap-tree');
  const rows = [...el.querySelectorAll('.ap-row')].map(r => ({
    text: r.textContent.replace(/\s+/g, ' ').trim(),
    flag: (r.querySelector('img')?.getAttribute('src') || '')
  }));
  return { err, rows };
});
ok('дерево прілок малюється без помилки', apT.err === '', apT.err);
const apRow = t => apT.rows.find(r => r.text.startsWith(t)) || {};
ok('у рядку гео є прапорець', /flagcdn\.com\/w40\/kg\.png/.test(apRow('KG').flag), apT.rows);
ok('друге гео теж із прапорцем', /\/tj\.png/.test(apRow('TJ').flag), apT.rows);
ok('«—» у дереві лишається без прапорця', apRow('—').flag === '', apT.rows);
ok('«Усі» прапорця не отримує', apRow('Усі').flag === '', apT.rows);
ok('постачальник «My apps» не став Малайзією',
  (apT.rows.find(r => r.text.startsWith('My apps')) || {}).flag === '', apT.rows);

/* ─────────── 3. картка прілки ─────────── */
const apL = await page.evaluate(() => {
  apGeo = ''; apProv = '';
  let err = '';
  try { apRender(); } catch (e) { err = String(e); }
  const el = document.getElementById('ap-list');
  return { err, imgs: [...el.querySelectorAll('img')].map(i => i.getAttribute('src')) };
});
ok('список прілок малюється без помилки', apL.err === '', apL.err);
ok('на картках прілок є прапорці гео',
  apL.imgs.filter(s => /flagcdn/.test(s)).length === 2, apL.imgs);
ok('картка без гео прапорця не отримала',
  !apL.imgs.some(s => /\/—\.png|undefined/.test(String(s))), apL.imgs);

/* ─────────── 4. дерево і картки ПВА ─────────── */
const pw = await page.evaluate(() => {
  pwItems = [
    { id: 'p1', geo: 'UZ', provider: 'prov', offer: 'o', name: 'n', links: ['x'] },
    { id: 'p2', geo: 'UK', provider: 'prov', offer: 'o', name: 'n', links: ['y'] }
  ];
  pwGeo = ''; pwProv = ''; pwOnlyBad = false;
  let err = '';
  try { pwRenderTree(); pwRender(); } catch (e) { err = String(e); }
  const t = [...document.getElementById('ap-tree').querySelectorAll('.ap-row')].map(r => ({
    text: r.textContent.replace(/\s+/g, ' ').trim(),
    flag: r.querySelector('img')?.getAttribute('src') || '' }));
  const l = [...document.getElementById('ap-list').querySelectorAll('img')]
    .map(i => i.getAttribute('src')).filter(s => /flagcdn/.test(s));
  return { err, t, l };
});
ok('ПВА малюється без помилки', pw.err === '', pw.err);
ok('у дереві ПВА гео з прапорцем',
  /\/uz\.png/.test((pw.t.find(r => r.text.startsWith('UZ')) || {}).flag), pw.t);
ok('UK у дереві ПВА показує британський прапор',
  /\/gb\.png/.test((pw.t.find(r => r.text.startsWith('UK')) || {}).flag), pw.t);
ok('на картках ПВА теж є прапорці', pw.l.length === 2, pw.l);

/* ─────────── 5. тексти ─────────── */
const tx = await page.evaluate(() => {
  txItems = [
    { id: 't1', geo: 'PL', cat: 'Push', lang: 'pl', title: 'A', text: 'a' },
    { id: 't2', geo: 'KZ', cat: 'Push', lang: 'kk', title: 'B', text: 'b' },
    { id: 't3', geo: '—',  cat: 'Push', lang: '',   title: 'C', text: 'c' }
  ];
  txCat = '';
  let err = '';
  // Гілку треба відкрити: категорії малюються лише під вибраним гео,
  // а саме на них і перевіряється, що прапорець туди не поліз.
  txGeo = 'PL';
  try { txRenderTree(); } catch (e) { err = String(e); }
  const t = [...document.getElementById('tx-tree').querySelectorAll('button')].map(b => ({
    text: b.textContent.replace(/\s+/g, ' ').trim(),
    flag: b.querySelector('img')?.getAttribute('src') || '' }));
  txGeo = '';
  try { txRender(); } catch (e) { err = err || String(e); }
  const l = [...document.getElementById('tx-list').querySelectorAll('img')]
    .map(i => i.getAttribute('src')).filter(s => /flagcdn/.test(s));
  return { err, t, l };
});
ok('тексти малюються без помилки', tx.err === '', tx.err);
ok('у дереві текстів гео з прапорцем',
  /\/pl\.png/.test((tx.t.find(r => r.text.startsWith('PL')) || {}).flag), tx.t);
ok('категорія «Push» прапорця не отримала',
  (tx.t.find(r => r.text.startsWith('Push')) || {}).flag === '', tx.t);
ok('«All» прапорця не отримало',
  (tx.t.find(r => r.text.startsWith('All')) || {}).flag === '', tx.t);
ok('на картках текстів прапорці лише там, де є гео', tx.l.length === 2, tx.l);

/* ─────────── 6. Geo Performance ─────────── */
const gp = await page.evaluate(() => {
  globalPayouts = {};
  let err = '';
  try {
    renderGeoList([
      { geo: 'KG', offer: 'DEFAULT', spend: 100, installs: 10, regs: 5, deposits: 1 },
      { geo: 'TJ', offer: 'DEFAULT', spend: 50,  installs: 4,  regs: 2, deposits: 0 },
      { geo: '',   offer: 'DEFAULT', spend: 10,  installs: 1,  regs: 0, deposits: 0 }
    ]);
  } catch (e) { err = String(e); }
  const el = document.getElementById('geo-list');
  return { err, html: el.innerHTML.slice(0, 200),
           imgs: [...el.querySelectorAll('img')].map(i => i.getAttribute('src')),
           cards: el.children.length };
});
ok('Geo Performance малюється без помилки', gp.err === '', gp.err);
ok('картки гео на місці', gp.cards === 3, gp);
ok('у Geo Performance є прапорці',
  gp.imgs.filter(s => /flagcdn/.test(s)).length === 2, gp.imgs);
ok('KG і TJ саме ті прапорці',
  gp.imgs.some(s => /\/kg\.png/.test(s)) && gp.imgs.some(s => /\/tj\.png/.test(s)), gp.imgs);
ok('гео «??» лишилось без картинки',
  !gp.imgs.some(s => /\/\?\?\.png/.test(s)), gp.imgs);

await done(browser, srv, errs);
