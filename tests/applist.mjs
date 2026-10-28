/* ═══════════ СПИСОК АПОК СТОВПЦЯМИ · «?» У ДОМЕНАХ · СПИСОК КРЕО ═══════════

   1. Підпис апки був одним рядком через роздільники:
      «TJ · Fortune Dragon [satorapps] — FD11003». Поки апок три —
      читається; на двадцяти око щоразу шукає, де закінчується назва й
      починається KTID, бо вони в кожному рядку на іншому місці.
      Тепер стовпці, вирівняні пробілами під моноширинний шрифт.

   2. Кнопки «?» у доменах більше немає — пояснення переїхало в тост
      відмови, бо читають його рівно тоді, коли воно знадобилось.

   3. Обгортка списку креативів малювала ДРУГУ картку поруч із карткою
      справа, хоч це той самий блок. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8146;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* ─────────── 1. стовпці ─────────── */
const L = [
  { ktid: 'FD11003', funnel_name: 'Fortune Dragon [satorapps]', geo: 'TJ', is_app: true },
  { ktid: 'CS11003', funnel_name: 'Cleopatra Slot [satorapps]', geo: 'TJ', is_app: true },
  { ktid: 'VP11003', funnel_name: 'VIP Chicken [satorapps]',    geo: 'TJ', is_app: true },
  { ktid: 'J711003', funnel_name: 'Joker 777 [satorapps]',      geo: 'TJ', is_app: true },
  { ktid: 'X1',      funnel_name: 'Без постачальника',          geo: 'KG', is_app: true }
];

// назви без постачальника — те, що має стояти стовпцем
const apNames = ['Fortune Dragon', 'Cleopatra Slot', 'VIP Chicken', 'Joker 777',
                 'Без постачальника'];

const lab = await page.evaluate(list => {
  const pad = apFunnelPad(list);
  return { pad, rows: list.map(f => apFunnelLabel(f, pad)),
           parts: apFunnelParts(list[0]) };
}, L);

ok('постачальник виноситься зі скобок у свій стовпець',
  lab.parts.name === 'Fortune Dragon' && lab.parts.prov === 'satorapps'
  && lab.parts.geo === 'TJ' && lab.parts.ktid === 'FD11003', lab.parts);

/* Стовпці — це однакові позиції в КОЖНОМУ рядку. Саме це й перевіряємо,
   а не те, як рядок виглядає: шукаємо, на якому місці стоїть значення. */
const atOf = (row, val) => row.indexOf(val);
const same = vals => [...new Set(vals)].length === 1 && vals[0] > 0;

ok('назва починається в усіх рядках на тому самому місці',
  same(L.map((f, i) => atOf(lab.rows[i], apNames[i]))),
  L.map((f, i) => atOf(lab.rows[i], apNames[i])));
ok('KTID — так само',
  same(L.map((f, i) => atOf(lab.rows[i], f.ktid))),
  L.map((f, i) => atOf(lab.rows[i], f.ktid)));
ok('постачальник — так само, і порожній стовпець місця не зсуває',
  same(L.filter(f => /\[/.test(f.funnel_name))
        .map(f => atOf(lab.rows[L.indexOf(f)], 'satorapps'))),
  lab.rows);

ok('ширина рахується по найдовшому в ЦЬОМУ списку, а не зі стелі',
  lab.pad.name === 'Без постачальника'.length
  && lab.pad.prov === 'satorapps'.length, lab.pad);

ok('апка без постачальника лишає KTID у своєму стовпці',
  atOf(lab.rows[4], 'X1') === atOf(lab.rows[0], 'FD11003'),
  [lab.rows[0], lab.rows[4]]);
ok('хвостових пробілів немає: в <option> їх ріжуть по-різному',
  lab.rows.every(r => r === r.replace(/\s+$/, '')), lab.rows);

ok('довга назва ріжеться, щоб список не був ширший за вікно',
  await page.evaluate(() => {
    const f = { ktid: 'K', geo: 'TJ', funnel_name: 'X'.repeat(80) + ' [prov]' };
    return apFunnelParts(f).name.length === 30 && apFunnelParts(f).name.endsWith('…');
  }));

ok('без ktid і без гео нічого не падає', await page.evaluate(() => {
  const r = apFunnelLabel({ funnel_name: 'Сама назва' }, apFunnelPad([{ funnel_name: 'Сама назва' }]));
  return typeof r === 'string' && r.includes('Сама назва');
}));

ok('у списку стоїть моноширинний шрифт — інакше стовпці розповзуться',
  await page.evaluate(() => {
    const s = document.createElement('select');
    s.className = 'ap-pick';
    document.body.appendChild(s);
    const f = getComputedStyle(s).fontFamily;
    s.remove();
    return /mono/i.test(f);
  }));

/* ─────────── 2. домени: кнопки «?» немає ─────────── */
const dm = await page.evaluate(() => ({
  btn: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === '?'),
  fn: typeof window.dmCheckHelp,
  check: !!document.querySelector('[onclick*="dmCheck("]')
}));
ok('кнопки «?» у доменах більше немає', !dm.btn, dm);
ok('і функції, яку вона кликала, теж', dm.fn === 'undefined', dm.fn);
ok('кнопка Check лишилась на місці', dm.check, dm);
ok('пояснення переїхало в тост відмови — там, де воно й потрібне',
  await page.evaluate(() => {
    const src = typeof window.dmCheck === 'function' ? window.dmCheck.toString() : '';
    return /Edge Functions/.test(src) && /JWT Verification/.test(src)
        && /check-domains/.test(src);
  }));

/* ─────────── 3. обгортка списку креативів ─────────── */
const cr = await page.evaluate(() => {
  const list = document.getElementById('creative-list-sidebar');
  const wrap = list.closest('.lg\\:col-span-3');
  const st = getComputedStyle(wrap);
  return { bg: st.backgroundColor, border: st.borderTopWidth,
           cls: wrap.className,
           // список розтягнутий на всю обгортку
           fills: (() => {
             const a = list.getBoundingClientRect(), b = wrap.getBoundingClientRect();
             return Math.round(b.bottom - a.bottom) <= 2;
           })() };
});
ok('обгортка не малює своєї картки: ні заливки…',
  /rgba\(0, 0, 0, 0\)|transparent/.test(cr.bg), cr.bg);
ok('…ні рамки', cr.border === '0px', cr.border);
ok('своїх відступів теж немає', /\bp-0\b/.test(cr.cls), cr.cls);
ok('список доходить до низу обгортки', cr.fills, cr);

await done(browser, srv, errs);
