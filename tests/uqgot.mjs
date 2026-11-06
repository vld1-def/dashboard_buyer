/* ═══════════ ЩО ВЖЕ ЗАБРАНО ═══════════

   «зроби коли я скачую унікалізовані креативи, щоб кнопка DOWNLOAD
   мінялась на зелений якщо я скачав вже».

   Варіантів буває сорок, вони однакові з лиця й відрізняються
   підписом, а качають їх по одному. Повернувся через десять хвилин —
   і не знаєш, де спинився: або качаєш удруге, або пропускаєш.

   Зелений означає «ти натиснув», а не «файл лежить на диску»:
   браузер про завершення завантаження сторінці не каже, і скасоване
   збереження виглядає звідси так само, як вдале. Для «де я спинився»
   цього досить, і обіцяти більше не варто. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8205;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, { viewport: { width: 1200, height: 900 } });
const HTML = fs.readFileSync('index.html', 'utf8');

/* ── 1. ВІДЕО: КНОПКА ЗЕЛЕНІЄ ──
   Рядки відеорежиму малює ffmpeg, якого в стенді немає, тож беремо
   рівно ту розмітку, яку збирає fillRow, і перевіряємо поведінку
   кнопки на ній. */
const vid = await page.evaluate(() => {
  const b = document.getElementById('boot'); if (b) b.remove();
  const a = document.createElement('a');
  a.className = 'uq-dl shrink-0 bg-violet-600/80 hover:bg-violet-500 text-white '
              + 'text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition';
  a.textContent = 'Download';
  document.body.appendChild(a);
  const was = getComputedStyle(a).backgroundColor;
  uqGotMark(a);
  const now = getComputedStyle(a).backgroundColor;
  return { was, now, cls: a.className,
           tick: getComputedStyle(a, '::after').content };
});
ok('до завантаження кнопка не зелена', !/22,\s*163,\s*74/.test(vid.was), vid.was);
ok('після натискання — зелена', /22,\s*163,\s*74/.test(vid.now), vid.now);
/* Класи Tailwind знімаємо явно: інакше hover:bg-violet-500 перебив би
   колір рівно тоді, коли на кнопку наводять — тобто саме коли на неї
   й дивляться. */
ok('фіолетовий клас знято, щоб він не повернувся на hover',
  !/bg-violet-600/.test(vid.cls) && !/hover:bg-violet-500/.test(vid.cls), vid.cls);
/* Самим кольором не обмежуємось: різницю в кольорі бачать не всі. */
ok('і поруч стоїть галочка', /✓/.test(vid.tick), vid.tick);

/* ── 2. КАРТИНКИ: МІТКА ПЕРЕЖИВАЄ ПЕРЕМАЛЬОВКУ ──
   Сітка перемальовується (uiPaint), тож мітка на вузлі зникла б
   разом із ним. Пам'ятаємо ІМЕНЕМ. */
const img = await page.evaluate(async () => {
  /* uiPaint малює оригінал на canvas, тож bmp має бути справжнім
     ImageBitmap, а не заглушкою. */
  const c = document.createElement('canvas'); c.width = 10; c.height = 10;
  const bmp = await createImageBitmap(c);
  const mk = (name) => ({ srcName: 'a.jpg', name, blob: { size: 1000 },
                          url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
                          dist: 20, axes: '' });
  uiSrc = [{ name: 'a.jpg', w: 10, h: 10, bmp, base: '', hash: null }];
  uiOut = [mk('a__1.jpg'), mk('a__2.jpg')];
  uiPaint();
  const links = () => [...document.querySelectorAll('#ui-out .ui-dl')];
  const before = links().map(a => a.className);
  const first = links()[0];
  first.click();
  const afterClick = links()[0].className;
  uiPaint();                       // перемалювали сітку
  const after = links().map(a => ({ cls: a.className, txt: a.textContent.trim() }));
  return { before, afterClick, after, n: links().length };
});
ok('варіанти намальовані', img.n === 2, img.n);
ok('спершу жодного забраного', img.before.every(c => !/is-got/.test(c)), img.before);
ok('клік позначає саме цей варіант', /is-got/.test(img.afterClick), img.afterClick);
ok('мітка переживає перемальовку сітки',
  /is-got/.test(img.after[0].cls), img.after[0]);
ok('а сусідній лишається незабраним',
  !/is-got/.test(img.after[1].cls), img.after[1]);
/* Забране видно БЕЗ наведення: кнопка зазвичай з'являється на hover,
   а мітка потрібна саме тоді, коли мишу ще нікуди не вели. */
const vis = await page.evaluate(() => {
  const a = document.querySelector('#ui-out .ui-dl.is-got');
  const b = document.querySelector('#ui-out .ui-dl:not(.is-got)');
  return { got: a && getComputedStyle(a).opacity, plain: b && getComputedStyle(b).opacity,
           bg: a && getComputedStyle(a).backgroundColor };
});
ok('забране видно без наведення', Number(vis.got) === 1, vis);
ok('незабране лишається прихованим', Number(vis.plain) === 0, vis);
ok('і воно зелене', /22,\s*163,\s*74/.test(vis.bg || ''), vis.bg);
ok('замість стрілки — галочка', img.after[0].txt === '✓', img.after[0].txt);

/* ── 3. НОВІ ВАРІАНТИ — ЧИСТИЙ АРКУШ ──
   Лишити старі мітки означало б показати зеленим те, чого людина не
   бачила: варіанти інші. */
ok('нова генерація скидає мітки', /uiGot\.clear\(\);/.test(HTML), 'uiGot.clear');
const re = await page.evaluate(() => {
  uiGot.clear();
  uiPaint();
  return [...document.querySelectorAll('#ui-out .ui-dl')].map(a => a.className);
});
ok('після скидання забраних немає', re.every(c => !/is-got/.test(c)), re);

/* ── 4. ПРАВИТИ ТРЕБА ТАМ, ДЕ ЗБИРАЄТЬСЯ ──
   Блок відеогенерації build.py замінює цілком, тож правка в
   index-legacy.html туди не доїжджає — і саме на цьому збірка впала
   першого разу. Тримаємо перевірку на ЗІБРАНОМУ файлі. */
ok('кнопка у відеорядку зібраної сторінки має обробник',
  /download="\$\{base\}__v\$\{v\}\.mp4" onclick="uqGotMark\(this\)"/.test(HTML), 'fillRow');
const LEG = fs.readFileSync('index-legacy.html', 'utf8');
ok('а в legacy її не чіпали', !/uqGotMark/.test(LEG), 'index-legacy.html');

await done(browser, srv, errs);
