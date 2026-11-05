/* ═══════════ ПАНЕЛЬ ПРАВИЛ: ПОЛЯ Й КНОПКИ ═══════════

   «і сразу дизайн блоку з правилами зроби нормальним / інпути кнопки
   все щоб гарно було».

   Під косметикою знайшлось дві справжні поломки, і стенд тримає
   насамперед їх:

     • поле «Cabinets» мало клас is-wide (flex: 1 1 200px), а лежало в
       КОЛОНЦІ .rl-f — у колонці flex-basis задає висоту, не ширину.
       Поле виростало на двісті пікселів заввишки й займало пів форми;
     • знак долара в полі «from spend» малювався ПІД самим полем: у
       поля є backdrop-filter, а це власний контекст накладання.

   Решта — про те, що видно з першого погляду: поля й кнопки однієї
   висоти, нічого не вилазить за край форми, фокус помітний, форма
   поділена на підписані частини, а AND/OR стоїть МІЖ умовами. */
import { serve, open, checks } from './_harness.mjs';
import fs from 'node:fs';

const PORT = 8201;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, { viewport: { width: 620, height: 1200 } });
const { ok, done } = checks();

/* Панель живе у верстці, схованій таблічними класами, яких у стенді
   немає (Tailwind сюди не доїжджає). Відкриваємо її по-справжньому —
   кнопкою «+ Rule», а не підміною стану. */
await page.evaluate(() => {
  const b = document.getElementById('boot'); if (b) b.remove();
  let n = document.querySelector('.rl-wrap');
  while (n && n !== document.body) { n.style.setProperty('display', 'block', 'important'); n = n.parentElement; }
  window.rlAdd();
});
await page.waitForTimeout(300);

const box = sel => page.evaluate(s => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect();
  return { h: Math.round(r.height), w: Math.round(r.width),
           l: Math.round(r.left), r: Math.round(r.right) };
}, sel);

/* ── 1. ПОЛЕ «CABINETS» НЕ ВИРОСТАЄ ВГОРУ ── */
const cabs = await box('#rl-f-cabs');
ok('поле «Cabinets» заввишки з одне поле, а не на пів форми',
  cabs && cabs.h <= 40, cabs);

/* ── 2. ОДНА ВИСОТА В УСЬОГО, ЩО СТОЇТЬ У РЯДОК ── */
const name = await box('#rl-f-name');
const lvl = await box('#rl-f-level');
const num = await box('.rl-cond .rl-in.is-num');
const btn = await box('.rl-btn');
ok('поле введення й селект однакової висоти',
  name && lvl && Math.abs(name.h - lvl.h) <= 1, [name, lvl]);
ok('число в умові тієї ж висоти, що й селект метрики',
  num && lvl && Math.abs(num.h - lvl.h) <= 1, [num, lvl]);
ok('кнопка не стоїть сходинкою поруч із полем',
  btn && lvl && Math.abs(btn.h - lvl.h) <= 2, [btn, lvl]);

/* ── 3. НІЩО НЕ ВИЛАЗИТЬ ЗА КРАЙ ФОРМИ ── */
const over = await page.evaluate(() => {
  const f = document.querySelector('.rl-form').getBoundingClientRect();
  return [...document.querySelectorAll('.rl-form .rl-in, .rl-form .rl-ax, .rl-form .rl-btn')]
    .map(e => ({ id: e.id || e.className, r: Math.round(e.getBoundingClientRect().right) }))
    .filter(x => x.r > Math.round(f.right) + 1);
});
ok('жодне поле не вилазить за праву межу форми', over.length === 0, over);

/* ── 4. ДОЛАР ВИДНО ── */
const dollar = await page.evaluate(() => {
  const pre = document.querySelector('.rl-pre');
  if (!pre) return null;
  const cs = getComputedStyle(pre, '::before');
  const inp = pre.querySelector('.rl-in');
  return { content: cs.content, z: cs.zIndex,
           padL: parseInt(getComputedStyle(inp).paddingLeft, 10) };
});
ok('у полі «from spend» намальовано $', dollar && /\$/.test(dollar.content), dollar);
/* Саме z-index і був поломкою: без нього долар лежав під полем. */
ok('і він над полем, а не під ним', dollar && Number(dollar.z) > 0, dollar);
ok('а текст у полі починається після долара', dollar && dollar.padL >= 18, dollar);

/* ── 5. СЕЛЕКТ ЗІ СВОЄЮ СТРІЛКОЮ ── */
const sel = await page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('rl-f-level'));
  return { ap: cs.appearance || cs.webkitAppearance, bg: cs.backgroundImage.slice(0, 40),
           padR: parseInt(cs.paddingRight, 10) };
});
ok('у селекта своя стрілка, а не рідна браузерна',
  sel.ap === 'none' && /svg/.test(sel.bg), sel);
ok('і текст у нього не заходить під стрілку', sel.padR >= 20, sel);

/* ── 6. ФОКУС ВИДНО ── */
const focus = await page.evaluate(() => {
  const e = document.getElementById('rl-f-name');
  e.focus();
  const cs = getComputedStyle(e);
  return { sh: cs.boxShadow, bc: cs.borderColor };
});
ok('фокус видно кільцем, а не лише рамкою в один піксель',
  focus.sh && focus.sh !== 'none', focus);

/* ── 7. ФОРМА ПОДІЛЕНА НА ПІДПИСАНІ ЧАСТИНИ ── */
const secs = await page.$$eval('.rl-form .rl-sec-h', hs => hs.map(h => h.textContent.trim()));
ok('форма поділена щонайменше на три підписані частини', secs.length >= 3, secs);
ok('серед них є про те, що правилу дозволено робити',
  secs.some(t => /may do/i.test(t)), secs);

/* ── 8. AND / OR СТОЇТЬ МІЖ УМОВАМИ ── */
await page.evaluate(() => {
  const draft = Object.assign(rlBlank(), {
    when: [{ m: 'cpl', op: '>', v: 2 }, { m: 'leads', op: '=', v: 0 }] });
  rlRules = [draft]; rlEdit = 0; rlPaint();
});
await page.waitForTimeout(200);
const joins = await page.$$eval('#rl-conds .rl-join', js => js.map(j => j.textContent.trim()));
ok('між двома умовами підписано, як вони складаються',
  joins.length === 1 && /^and$/i.test(joins[0]), joins);
/* Напис мусить мінятись разом із селектом, інакше поруч із «any match»
   стоятиме «and» — і правило читатиметься навпаки. */
await page.selectOption('#rl-f-match', 'any');
await page.waitForTimeout(250);
const joins2 = await page.$$eval('#rl-conds .rl-join', js => js.map(j => j.textContent.trim()));
ok('і змінюється разом із селектом', joins2.length === 1 && /^or$/i.test(joins2[0]), joins2);
ok('а умови від цього не загубились',
  (await page.$$('#rl-conds .rl-cond')).length === 2);

/* ── 9. ПЕРЕМИКАЧ КАЖЕ, ЩО БУДЕ, ЯКЩО ЙОГО НЕ ЧІПАТИ ── */
const ax = await page.$eval('.rl-ax', e => e.textContent.replace(/\s+/g, ' ').trim());
ok('перемикач пояснює, що без нього правило лише звітує',
  /report/i.test(ax) && /touches nothing/i.test(ax), ax);

/* ── 10. ПІДЗАГОЛОВОК ПАНЕЛІ ── */
const sub = await page.$eval('.rl-sub', e => e.textContent.replace(/\s+/g, ' ').trim());
ok('під заголовком сказано, як часто вони ходять', /15/.test(sub), sub);
ok('і що нове правило нічого не вимикає', /report/i.test(sub), sub);

/* ── 11. ПОПЕРЕДЖЕННЯ «НЕ ХОДИЛИ» — ПЛАШКА, А НЕ СТІНА ТЕКСТУ ── */
const warn = await page.evaluate(() => {
  rlRuns = []; rlRunPaint();
  const p = document.querySelector('.rl-run-no');
  if (!p) return null;
  const cs = getComputedStyle(p);
  return { bg: cs.backgroundColor, bd: cs.borderTopWidth, pad: cs.paddingTop };
});
ok('жовте попередження лежить у плашці з фоном і рамкою',
  warn && warn.bg !== 'rgba(0, 0, 0, 0)' && parseFloat(warn.bd) > 0, warn);

/* ── 12. В АНГЛІЙСЬКОМУ ІНТЕРФЕЙСІ НЕМАЄ УКРАЇНСЬКОГО ТЕКСТУ ──
   Примітка під полем гео лишалась українською в зібраному файлі:
   i18n.py перекладає за словником, а цього рядка в ньому не було. */
const geoNote = await page.evaluate(() => {
  const i = document.getElementById('rl-f-geo');
  if (!i) return null;
  i.value = ''; rlGeoNote();
  return (document.getElementById('rl-geo-note') || {}).textContent || '';
});
ok('примітка про порожнє гео попереджає', /EVERY geo/i.test(geoNote), geoNote);
ok('і вона англійською, як решта інтерфейсу',
  !/[Ѐ-ӿ]/.test(geoNote), geoNote);

/* Те саме по всьому зібраному файлу в межах панелі правил: кирилиця в
   видимому тексті — це недоперекладений рядок, а не коментар. */
const built = fs.readFileSync('/home/user/dashboard_buyer/index.html', 'utf8');
const cyrStrings = (built.match(/'[^'\n]*[Ѐ-ӿ][^'\n]*'/g) || [])
  .filter(s => /\brl-[a-z]/.test(s));
ok('у рядках панелі правил не лишилось кирилиці', cyrStrings.length === 0, cyrStrings.slice(0, 3));

await done(browser, srv, errs);
