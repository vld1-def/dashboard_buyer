/* ═══════════ ФАЙЛИ: ЦІНА ФАЙЛА І ЦІНА ОДНОГО КАБІНЕТА ═══════════

   «вказую ціну 10$, і якщо там 10 кабінетів — уже зрозуміло, яка ціна
   одного».
     1. одиниці: @кабінети, а без них — рядки з акаунтами;
     2. у формі — ціна, кількість (сама рахується з файла) і «$10 ÷ 10 =
        $1.00 per row»; зберігаються price і units;
     3. у списку — «$10 · $1.00 each»; над @кабінетом — «Cost $X · файл»;
     4. без колонок (FILES_PRICE.sql) список файлів однаково читається. */
import { serve, open, checks } from './_harness.mjs';
import fs from 'node:fs';

const PORT = 8198;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const FL = fs.readFileSync('build/files.js', 'utf8');
const SQL = fs.readFileSync('FILES_PRICE.sql', 'utf8');

const r = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rows10 = Array.from({ length: 10 }, (_, i) => `login${i}:pass${i}:mail${i}@x.com:proxy`).join('\n');
  let patch = null;
  sb.storage = { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://f/x' } }) }) };
  window.fetch = async () => new Response(rows10);
  sb.from = () => ({ update: p => { patch = p; return { eq: async () => ({ error: null }) }; },
    select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: flRows }) }) }) }) });
  flPriceCols = true;
  flRows = [{ id: 1, title: 'a.txt', mime: 'text/plain', path: 'a', size: 1, kind: 'other', at: '2026-11-20', tags: [], cabs: [] },
            { id: 2, title: 'cabs.txt', mime: 'text/plain', path: 'b', size: 1, kind: 'other', at: '2026-11-20', tags: [], cabs: ['2222222222'], price: 6, units: 3 }];
  flEditOpen(0); await wait(150);
  const auto = document.getElementById('fl-f-units').value;
  const pr = document.getElementById('fl-f-price'); pr.value = '10'; pr.dispatchEvent(new Event('input'));
  const note = document.getElementById('fl-f-pnote').textContent;
  await flPut(0);
  flRows[0].price = 10; flRows[0].units = 10; flRender();
  const chip = document.querySelector('.fl-price')?.textContent;
  const b = document.createElement('button'); b.dataset.cab = '2222222222'; document.body.appendChild(b);
  cabAll = [{ id: 'x', fb: { account_id: '2222222222' }, state: 'running', x: { all: 50 } }];
  flCabTip(b);
  return { auto, note, patch, chip, tip: document.getElementById('fl-tip').textContent.replace(/\s+/g, ' '),
           cabsN: flUnitsOf('x\n@1111111111\n@2222222222\n@2222222222').n, rowsN: flUnitsOf('login:pass\nlogin2:pass2\n\n').n };
});
ok('кількість рядків рахується з файла сама', r.auto === '10', r);
ok('під полями — ціна одного', /\$10 ÷ 10 = \$1\.00 per row/.test(r.note), r.note);
ok('зберігаються ціна й кількість', r.patch && r.patch.price === 10 && r.patch.units === 10, r.patch);
ok('у списку — ціна файла й ціна одного', r.chip === '$10 · $1.00 each', r.chip);
ok('над @кабінетом — скільки він коштував', /Cost\s*\$2\.00 · cabs\.txt/.test(r.tip), r.tip);
ok('@кабінети — одиниці, без повторів', r.cabsN === 2, r.cabsN);
ok('без @міток — рядки з акаунтами', r.rowsN === 2, r.rowsN);
ok('без колонок список читається як раніше', /if \(error && \/price\|units\/i\.test\(error\.message \|\| ''\)\) \(\{ data, error \} = await ask\(base\)\);/.test(FL));
ok('SQL додає price і units', /add column if not exists price numeric/.test(SQL) && /add column if not exists units integer/.test(SQL));

/* «зараз 8 акаунтів @, пізніше решту добавиться — воно перерахує?»
   Автоматичне число перераховується; поправлене руками — ні. */
const grow = await page.evaluate(async () => {
  const cabs = n => Array.from({ length: n }, (_, i) => '@10000000' + String(i).padStart(2, '0')).join('\n');
  const writes = [];
  sb.from = () => ({ update: p => { writes.push(p); return { eq: async () => ({ error: null }) }; } });
  flPriceCols = true;
  flRows = [{ id: 7, title: 'batch.txt', tags: [], cabs: [], price: 10, units: null, units_fixed: false }];
  await flIndex(0, cabs(8), false);
  const at8 = [flRows[0].units, flMoney2(flPer(flRows[0]))];
  await flIndex(0, cabs(10), false);
  const at10 = [flRows[0].units, flMoney2(flPer(flRows[0]))];
  flRows[0].units = 12; flRows[0].units_fixed = true;
  await flIndex(0, cabs(14), false);
  return { at8, at10, fixed: flRows[0].units, wrote: writes.map(w => w.units) };
});
ok('8 @кабінетів — $10 ÷ 8', grow.at8[0] === 8 && grow.at8[1] === '$1.25', grow);
ok('дописали ще 2 — перераховано: $10 ÷ 10', grow.at10[0] === 10 && grow.at10[1] === '$1.00', grow);
ok('поправлене руками число файл не перебиває', grow.fixed === 12, grow);

await done(browser, srv, errs);
