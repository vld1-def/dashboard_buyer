/* ═══════════ PWA: ДЕРЕВО ГЕО → ПОСТАЧАЛЬНИК ═══════════

   Другим рівнем дерева стояв ОФФЕР — вгадане з назви слово, якого в
   PWA майже ніколи немає. Гілка була порожня й відповідала на
   питання, якого тут не ставлять. Шукають навпаки: «де взята ця
   силка», тобто в кого з постачальників.

   Стенд тримає межі:
     • другий рівень — постачальники, і офферів у дереві немає;
     • хто без постачальника — видимий окремою гілкою, а не загублений;
     • гілка з дітьми має шеврон, і він повернутий лише коли відкрита;
     • діти їдуть у .ap-kids — вузол, на якому й тримається анімація;
     • поле в редакторі — СПИСОК: datalist із «Pwa Partners» і
       «SkakApp» плюс ті, що вже заведені, але вписати свого можна;
     • збережене їде в запис і одразу зʼявляється в дереві;
     • постачальник НЕ вгадується з назви — тільке те, що вписали;
     • нова кампанія підхоплює вибрану гілку;
     • пошук і картка знають про постачальника;
     • вставка списком каже, якого постачальника проставить, ДО вставки. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8152;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const ITEMS = [
  { id: 'p1', name: 'Mbank_KG_1_09/10', geo: 'KG', provider: 'Pwa Partners',
    offer: 'Mbank', links: ['https://a.site'] },
  { id: 'p2', name: 'Mbank_KG_2_09/10', geo: 'KG', provider: 'Pwa Partners',
    offer: 'Mbank', links: ['https://b.site'] },
  { id: 'p3', name: 'Olly_KG_3_09/10',  geo: 'KG', provider: 'SkakApp',
    offer: 'Olly', links: ['https://c.site'] },
  // Без постачальника — рівно те, що зараз у всіх старих записах.
  { id: 'p4', name: 'Pinco_KG_4_09/10', geo: 'KG', offer: 'Pinco', links: ['https://d.site'] },
  { id: 'p5', name: 'Aviator_TJ_09/10', geo: 'TJ', provider: 'Trident Pwa',
    offer: 'Aviator', links: ['https://e.site'] }
];

const setup = () => page.evaluate(items => {
  currentTeam = 'TEAM';
  apMode = 'pwa';
  pwItems = items.map(x => ({ ...x }));
  pwGeo = ''; pwProv = ''; pwOnlyBad = false; pwDomErr = ''; pwDom = {};
  pwEditId = null;
  window.__wrote = [];
  sb.from = () => ({ upsert: async row => { window.__wrote.push(row); return { error: null }; } });
  apSubPaint(); apModePaint(); apRenderMode();
  return true;
}, ITEMS);

await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await setup();

/* ─────────── другий рівень — постачальник ─────────── */
const closed = await page.evaluate(() =>
  [...document.querySelectorAll('#ap-tree .ap-row')].map(r => r.textContent.trim()));
ok('доки гілка закрита — у дереві лише гео', closed.length === 3, closed);

const openKG = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#ap-tree .ap-row')];
  rows.find(r => r.textContent.trim().startsWith('KG')).click();
  return {
    rows: [...document.querySelectorAll('#ap-tree .ap-row')].map(r => r.textContent.trim()),
    kids: [...document.querySelectorAll('#ap-tree .ap-kids .ap-row')].map(r => r.textContent.trim())
  };
});
ok('під гео стали постачальники',
  openKG.kids.some(t => /PWA PARTNERS/i.test(t)) && openKG.kids.some(t => /SKAKAPP/i.test(t)),
  openKG.kids);
ok('офферів у дереві немає — ні Mbank, ні Olly, ні Pinco',
  !/Mbank|Olly|Pinco/i.test(openKG.rows.join('|')), openKG.rows);
ok('числа біля постачальників — скільки кампаній саме в нього',
  openKG.kids.some(t => /PWA PARTNERS\s*2/i.test(t.replace(/\s+/g, ' '))), openKG.kids);
ok('чуже гео не розгорнулось',
  !openKG.rows.some(t => /TRIDENT/i.test(t)), openKG.rows);

/* ─────────── хто без постачальника ─────────── */
ok('хто без постачальника — окремою гілкою, а не загублений',
  openKG.kids.some(t => /БЕЗ ПОСТАЧАЛЬНИКА/i.test(t)), openKG.kids);

const noneBranch = await page.evaluate(() => {
  const row = [...document.querySelectorAll('#ap-tree .ap-kids .ap-row')]
    .find(r => /БЕЗ ПОСТАЧАЛЬНИКА/i.test(r.textContent));
  row.click();
  return { prov: pwProv, list: document.getElementById('ap-list').textContent };
});
ok('і вона фільтрує саме їх', noneBranch.prov === '—'
  && /Pinco_KG_4/.test(noneBranch.list) && !/Mbank_KG_1/.test(noneBranch.list), noneBranch);

/* ─────────── шеврон і обгортка анімації ─────────── */
const caret = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#ap-tree .ap-row')];
  const geoRow = r => /^(KG|TJ)/.test(r.textContent.trim());
  const kg = rows.find(r => r.textContent.trim().startsWith('KG'));
  const tj = rows.find(r => r.textContent.trim().startsWith('TJ'));
  const kids = document.querySelector('#ap-tree .ap-kids');
  return {
    kgOpen: !!kg.querySelector('.ap-caret.is-open'),
    tjCaret: !!tj.querySelector('.ap-caret'),
    tjOpen: !!tj.querySelector('.ap-caret.is-open'),
    kidsCarets: [...document.querySelectorAll('#ap-tree .ap-kids .ap-caret')].length,
    kh: kids ? kids.style.getPropertyValue('--kh') : '',
    anim: kids ? getComputedStyle(kids).animationName : '',
    hidden: kids ? getComputedStyle(kids).overflow : ''
  };
});
ok('у відкритого гео шеврон повернутий', caret.kgOpen, caret);
ok('у закритого шеврон є, але не повернутий', caret.tjCaret && !caret.tjOpen, caret);
ok('у постачальників шеврона немає — глибше нічого не розгортається',
  caret.kidsCarets === 0, caret);
ok('діти в .ap-kids, і на ньому заведена анімація розгортання',
  caret.anim === 'ap-kids-in' && caret.hidden === 'hidden', caret);
ok('висота для анімації порахована з кількості дітей',
  /^\d+px$/.test(caret.kh) && parseInt(caret.kh, 10) >= 120, caret);

/* ─────────── поле постачальника в редакторі ─────────── */
const ed = await page.evaluate(() => {
  pwPick('KG', 'SkakApp');
  pwNew();
  const i = document.getElementById('pw-f-prov');
  return {
    has: !!i,
    val: i ? i.value : null,
    list: i ? i.getAttribute('list') : null,
    opts: [...document.querySelectorAll('#pw-prov-list option')].map(o => o.value),
    order: [...document.querySelectorAll('#ap-editor input')].map(x => x.id)
  };
});
ok('у редакторі є поле постачальника', ed.has, ed);
ok('і воно зі списком (datalist), а не вільним текстом',
  ed.list === 'pw-prov-list' && ed.opts.length >= 3, ed);
ok('у списку і задані «Pwa Partners» та «SkakApp»…',
  ed.opts.includes('Pwa Partners') && ed.opts.includes('SkakApp'), ed.opts);
ok('…і той, якого завели самі', ed.opts.includes('Trident Pwa'), ed.opts);
ok('нова кампанія підхоплює вибрану гілку', ed.val === 'SkakApp', ed);
ok('постачальник стоїть перед оффером',
  ed.order.indexOf('pw-f-prov') < ed.order.indexOf('pw-f-offer'), ed.order);

/* Вписане своє — приймається, а не відкидається. */
const saved = await page.evaluate(async () => {
  document.getElementById('pw-f-name').value = 'Mbank_KG_9_09/10';
  document.getElementById('pw-f-prov').value = 'Моя контора';
  document.getElementById('pw-f-links').value = 'https://new.site';
  await pwSubmit();
  pwPick('KG', '');
  return {
    rec: pwItems.find(x => x.name === 'Mbank_KG_9_09/10') || null,
    kids: [...document.querySelectorAll('#ap-tree .ap-kids .ap-row')].map(r => r.textContent.trim()),
    wrote: window.__wrote.length
  };
});
ok('вписаний свій постачальник зберігся в записі',
  saved.rec && saved.rec.provider === 'Моя контора', saved.rec);
ok('і одразу став гілкою в дереві',
  saved.kids.some(t => /МОЯ КОНТОРА/i.test(t)), saved.kids);
ok('збереження пішло в базу', saved.wrote === 1, saved.wrote);

/* ─────────── постачальника не вгадують ─────────── */
const noGuess = await page.evaluate(async () => {
  pwPick('', '');
  pwNew();
  document.getElementById('pw-f-name').value = 'SkakApp_UZ_77_09/10';
  document.getElementById('pw-f-links').value = 'https://uz.site';
  await pwSubmit();
  return pwItems.find(x => x.name === 'SkakApp_UZ_77_09/10') || null;
});
ok('постачальник НЕ вгадується з назви — навіть коли вона його містить',
  noGuess && !noGuess.provider, noGuess);
ok('а гео з назви так само вгадується, як і було', noGuess && noGuess.geo === 'UZ', noGuess);

/* ─────────── пошук і картка ─────────── */
await setup();
const search = await page.evaluate(() => {
  const s = document.getElementById('ap-search');
  s.value = 'skakapp';
  apRenderMode();
  const txt = document.getElementById('ap-list').textContent;
  s.value = '';
  apRenderMode();
  return txt;
});
ok('пошук знаходить по постачальнику',
  /Olly_KG_3/.test(search) && !/Mbank_KG_1/.test(search), search.slice(0, 200));

const card = await page.evaluate(() => {
  pwPick('TJ', '');
  return document.getElementById('ap-list').textContent.replace(/\s+/g, ' ');
});
ok('картка каже, чий це постачальник', /Trident Pwa/.test(card), card.slice(0, 200));

/* ─────────── вставка списком ─────────── */
const bulkOn = await page.evaluate(() => {
  pwPick('KG', 'Pwa Partners');
  pwPaste();
  document.getElementById('pw-bulk').value = 'Mbank_KG_55_09/10\nhttps://bulk1.site';
  pwBulkParse();
  return document.getElementById('pw-bulk-out').textContent.replace(/\s+/g, ' ');
});
ok('вставка каже, якого постачальника проставить — ДО вставки',
  /Постачальник у нових: Pwa Partners/.test(bulkOn), bulkOn.slice(0, 300));

const bulkDone = await page.evaluate(async () => {
  await pwBulkApply();
  return pwItems.find(x => x.name.startsWith('Mbank_KG_55')) || null;
});
ok('і справді проставляє його у вставлені',
  bulkDone && bulkDone.provider === 'Pwa Partners', bulkDone);

const bulkOff = await page.evaluate(() => {
  pwPick('', '');
  pwPaste();
  document.getElementById('pw-bulk').value = 'Mbank_KG_56_09/10\nhttps://bulk2.site';
  pwBulkParse();
  return document.getElementById('pw-bulk-out').textContent.replace(/\s+/g, ' ');
});
ok('а без вибраної гілки — каже, що постачальника не впише',
  /не вписується/.test(bulkOff), bulkOff.slice(0, 300));

/* ─────────── прілки не зачеплені ─────────── */
const app = await page.evaluate(() => {
  apMode = 'app';
  apItems = [{ id: 'a1', geo: 'KG', provider: 'Satorapps', naming: 'x', note: '' }];
  apGeo = ''; apProv = '';
  apModePaint(); apRenderMode();
  const rows = [...document.querySelectorAll('#ap-tree .ap-row')].map(r => r.textContent.trim());
  return { rows, kids: document.querySelectorAll('#ap-tree .ap-kids').length };
});
ok('у прілках дерево гео → постачальник як було', app.rows.some(t => /KG/.test(t)), app.rows);
ok('і розгортання туди не поїхало — там інший довідник',
  app.kids === 0, app);

await done(browser, srv, errs);
