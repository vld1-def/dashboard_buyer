/* ═══════════ П'ЯТЬ ДРІБНИЦЬ, ЯКІ КОШТУЮТЬ ЩОДНЯ ═══════════

   Один захід, п'ять скарг, і три з них про те саме: екран показував
   одне, а робив інше.

     1. прев'ю креатива відкривалось плеєром у блоці на 240px;
     2. шапка унікалізатора несла рядок, який читають один раз;
     3. перевірка апки руками казала «апки немає» й лишала статус
        зеленим;
     4. імпорт Keitaro кидав рідний alert замість вікна з кнопкою;
     5. перезавантаження під час унікалізації мовчки викидало роботу. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8204;
const { ok, done } = checks();
const srv = await serve(PORT);

const HTML = fs.readFileSync('index.html', 'utf8');
const FORM = fs.readFileSync('Form.html', 'utf8');

/* ── 1. ПРЕВ'Ю — ВІКНОМ, А НЕ СМУЖКОЮ ── */
const { browser, page, errs } = await open(PORT, { viewport: { width: 1200, height: 800 } });

const dv = await page.evaluate(() => {
  const b = document.getElementById('boot'); if (b) b.remove();
  window._drivePlayInline('FILE123');
  const m = document.getElementById('dv-modal');
  if (!m) return { open: false };
  const f = m.querySelector('iframe');
  const box = m.querySelector('.dv-frame').getBoundingClientRect();
  return { open: true, src: f ? f.getAttribute('src') : '',
           w: Math.round(box.width), h: Math.round(box.height),
           fixed: getComputedStyle(m).position };
});
ok('клік по прев’ю відкриває вікно', dv.open, dv);
ok('а не смужку на 240px', dv.h > 300, dv);
/* Кадр на всю ширину вікна, а не в колонці картки: саме через це
   плеєр Drive зі своєю шапкою не лишав місця на сам кадр. */
ok('кадр широкий', dv.w > 700, dv);
ok('вікно поверх сторінки', dv.fixed === 'fixed', dv);
ok('це той самий файл', /FILE123\/preview/.test(dv.src), dv.src);

const closed = await page.evaluate(() => {
  window._driveClose();
  return !document.getElementById('dv-modal');
});
ok('і закривається', closed);
/* Escape мусить закривати, а обробник — зніматись разом із вікном:
   лишений висіти, він ловив би Escape уже для когось іншого. */
const esc = await page.evaluate(() => {
  window._drivePlayInline('F2');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  const gone = !document.getElementById('dv-modal');
  let after = false;
  window._driveLeak = () => { after = true; };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  return { gone, after };
});
ok('Escape закриває вікно', esc.gone, esc);
/* Постер більше не ріжемо: object-cover відтинав краї кадру, а саме
   по них креатив і впізнають. */
ok('постер не обрізається', /max-h-\[240px\] object-contain/.test(HTML), 'object-contain');

/* ── 2. ШАПКА УНІКАЛІЗАТОРА ── */
ok('рядок про обробку в браузері прибрано',
  !/processed in the browser, files are never uploaded/.test(HTML), 'uq-sub');
ok('і його більше ніде не підставляють',
  !/uq-sub/.test(HTML), 'uq-sub id');
ok('шапка стала нижчою', /px-5 py-3 border-b border-white\/5 flex justify-between/.test(HTML),
  'py-3');
/* Заголовок лишається: прибирали підзаголовок, а не вікно. */
ok('заголовок на місці', /Uniqueizer<\/h2>/.test(HTML));

/* ── 5. СТОРОЖ ПРИ ПЕРЕЗАВАНТАЖЕННІ ── */
const guard = await page.evaluate(() => {
  let added = 0, removed = 0;
  const a = window.addEventListener.bind(window);
  const r = window.removeEventListener.bind(window);
  window.addEventListener = (t, f, o) => { if (t === 'beforeunload') added++; return a(t, f, o); };
  window.removeEventListener = (t, f, o) => { if (t === 'beforeunload') removed++; return r(t, f, o); };
  const out = {};
  uqGuard(true);  out.one = { added, removed };
  /* Два режими можуть крутитись одночасно — той, що скінчився
     першим, не має знімати сторожа з другого. */
  uqGuard(true);  out.two = { added, removed };
  uqGuard(false); out.half = { added, removed };
  uqGuard(false); out.none = { added, removed };
  /* Нижче нуля лічильник іти не має: зайвий uqGuard(false) не мусить
     зробити наступний uqGuard(true) безсилим. */
  uqGuard(false);
  uqGuard(true);  out.again = { added, removed };
  window.addEventListener = a; window.removeEventListener = r;
  uqGuard(false);
  return out;
});
ok('робота ставить сторожа', guard.one.added === 1, guard.one);
ok('друга робота другого не додає', guard.two.added === 1, guard.two);
ok('і перша, що скінчилась, його не знімає', guard.half.removed === 0, guard.half);
ok('знімається, коли скінчились обидві', guard.none.removed === 1, guard.none);
ok('зайве зняття не ламає наступну роботу', guard.again.added === 2, guard.again);

/* Сторож вішається РІВНО на час роботи: постійний питав би й тоді,
   коли нічого не робиться, а від такого за тиждень перестають
   читати. */
ok('постійного beforeunload немає',
  !/window\.addEventListener\('beforeunload'/.test(HTML.replace(/uqGuards === 1 && on\) window\.addEventListener\('beforeunload'[^\n]*/g, '')),
  'лише в uqGuard');
/* Віддаємо сторожа навіть на помилці: збій у середині лишив би
   сторінку назавжди «зайнятою». */
ok('робота з картинками віддає сторожа через finally',
  /\} finally \{ uqGuard\(false\); \}/.test(HTML), 'finally');
ok('і відеорежим теж знімає його', (HTML.match(/uqGuard\(false\)/g) || []).length >= 2);

await browser.close();

/* ── 3. ПЕРЕВІРКА АПКИ РУКАМИ СТАВИТЬ БАН ── */
const FN = fs.readFileSync('supabase/functions/check-apps/index.ts', 'utf8');
const manual = FN.slice(FN.indexOf('═══ ВХІД ЛЮДИНИ'), FN.indexOf('═══ ВХІД РОЗКЛАДУ'));
ok('«апки немає» з кнопки ставить бан', /patch\.status = 'ban';/.test(manual));
ok('сторінка каже, що статус змінено',
  /статус змінено на/.test(FORM) && /бан знято/.test(FORM), 'Form.html');
/* Доти екран обіцяв протилежне — і це була правда, через яку він сам
   собі суперечив: нотатка «апки немає» й зелена пігулка поруч. */
ok('і старої обіцянки людині більше не показують',
  !/статус не міняється від ручної перевірки: бан ставить/.test(FORM), 'Form.html');
/* Функції теж оголошеннями, а не присвоєннями у window: присвоєння
   виконується по порядку, і якщо вище щось кинуло (а в цьому файлі
   кидає, коли не доїхав CDN supabase), вікна просто не існує. */
ok('вікно оголошено, а не присвоєно', /\nfunction fmTell\(/.test(FORM), 'fmTell');

/* ── 4. АЛЕРТ ПРИ ІМПОРТІ — ВІКНОМ ІЗ КНОПКОЮ ── */
/* Form.html без сесії відправляє на index.html — тоді перевіряти тут
   нічого, бо ми вже не на тій сторінці. Підміняємо сесію, як решта
   стендів по цьому файлу. */
const { browser: b2, page: p2, errs: e2 } = await open(PORT, {
  path: 'Form.html',
  init: () => {
    const mk = window.supabase.createClient;
    window.supabase.createClient = (...a) => {
      const c = mk(...a);
      c.auth.getSession = async () => ({ data: { session: { user: { id: 'u1' } } } });
      return c;
    };
    localStorage.setItem('selected_team', 'TEST');
  }
});
await p2.waitForFunction(() => typeof window.fmTell === 'function', null, { timeout: 8000 });
const fm = await p2.evaluate(() => {
  let went = null;
  window.switchMode = m => { went = (went || '') + 'mode:' + m + ' '; };
  window.stSwitch = n => { went = (went || '') + 'tab:' + n; };
  fmTell('Accounts with no timezone', 'Not counted: 123, 456 <b>x</b>',
    [{ label: 'Add cabinet', primary: true, run: () => fmGoLink('123') },
     { label: 'Later' }]);
  const box = document.getElementById('fm-modal');
  const btns = [...document.querySelectorAll('#fm-btns button')];
  const out = { open: box.classList.contains('open'),
                title: document.getElementById('fm-title').textContent,
                body: document.getElementById('fm-body').textContent,
                html: document.getElementById('fm-body').innerHTML,
                labels: btns.map(b => b.textContent) };
  btns[0].click();
  out.after = box.classList.contains('open');
  out.went = went;
  out.acc = (document.getElementById('prov-acc') || {}).value;
  return out;
});
ok('замість alert — вікно', fm.open, fm);
ok('із заголовком і переліком кабінетів',
  /no timezone/i.test(fm.title) && /123, 456/.test(fm.body), fm);
/* Номери кабінетів приїхали з файлу — тобто це чужий текст, і в
   розмітку він іти не має. */
ok('текст із файлу екранується', !/<b>/.test(fm.html) && /&lt;b&gt;/.test(fm.html), fm.html);
ok('є кнопка «додати кабінет»', fm.labels.some(l => /Add cabinet/i.test(l)), fm.labels);
ok('клік по ній закриває вікно', fm.after === false, fm);
/* Кнопка мусить ВЕСТИ, а не радити: вкладка, панель і номер уже в
   полі — інакше вона економить клік і лишає всю роботу. */
ok('і веде в налаштування, на панель кабінетів',
  /mode:providers/.test(fm.went || '') && /tab:cabinets/.test(fm.went || ''), fm.went);
ok('з уже підставленим номером', fm.acc === '123', fm.acc);

const escaped = await p2.evaluate(() => {
  fmTell('x', 'y');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  return document.getElementById('fm-modal').classList.contains('open');
});
ok('Escape закриває й це вікно', escaped === false);
/* Вікно без жодного способу його закрити гірше за alert. */
const bare = await p2.evaluate(() => {
  fmTell('x', 'y');
  return [...document.querySelectorAll('#fm-btns button')].length;
});
ok('без кнопок усе одно є чим закрити', bare >= 1, bare);

ok('самого alert у цьому місці більше немає',
  !/alert\('Accounts with no timezone/.test(FORM), 'Form.html');

await done(b2, srv, [...errs, ...e2]);
