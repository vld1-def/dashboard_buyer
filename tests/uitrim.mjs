/* ═══════════ ЩО ПРИБРАЛИ З ЕКРАНА ═══════════

   Чотири дрібниці з одного проходу очима, і всі про те саме: місце на
   екрані коштує, а рядок, який нічого не додає, коштує ще й уваги.

     1. «+N» у значках кампанії. Займало стільки ж, скільки справжній
        значок, а казало лише «є ще щось» — не що саме і не скільки.
     2. Власний «Active» на кампанії. Коли діти теж активні, поруч
        стоїть «5 active» — те саме з числом; коли всі діти в
        реджектах, «Active» прямо бреше: ввімкнено, а не крутиться
        нічого.
     3. Підзаголовок під «Creative Analyzer».
     4. Відступи у вузькій колонці Geo.

   Плюс дві міри: лінії між стовпцями стали помітніші, а список
   креативів більше не залежить висотою від сусідньої картки. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8198;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();
const HTML = fs.readFileSync('index.html', 'utf8');

const chips = (own, state, depth, kind) => page.evaluate(([o, st, d, k]) => {
  const el = document.createElement('div');
  el.innerHTML = cdChips({ kind: k, own: o, state: new Map(st) }, d);
  return { texts: [...el.querySelectorAll('.cd-st')].map(x => x.textContent.trim()),
           tip: el.querySelector('.cd-sts').getAttribute('title') || '' };
}, [own, state, depth, kind]);

/* ── 1. «+N» ── */
const many = await chips('PAUSED', [['ACTIVE', 2], ['DISAPPROVED', 3], ['PAUSED', 1]], 0, 'campaign');
ok('значків не більше двох', many.texts.length <= 2, many.texts);
ok('«+N» більше немає', !many.texts.some(t => /^\+\d/.test(t)), many.texts);
/* Прибрати лічильник можна лише тому, що повний розклад лишився в
   підказці — інакше ми б просто сховали частину станів. */
ok('але повний розклад лишився в підказці',
  /active/i.test(many.tip) && /rejected|disapprov/i.test(many.tip), many.tip);

/* ── 2. ВЛАСНИЙ «ACTIVE» ── */
/* Кампанія ввімкнена, усі оголошення відхилені. Доти перший значок
   казав «Active» — рівно навпроти питання, чому нічого не крутиться. */
const dead = await chips('ACTIVE', [['DISAPPROVED', 4]], 0, 'campaign');
ok('ввімкнена кампанія без живих не каже «Active»',
  !dead.texts.some(t => /^active$/i.test(t)), dead.texts);
ok('а про реджекти каже', dead.texts.some(t => /rejected|disapprov/i.test(t)), dead.texts);

/* Коли діти активні, число поруч каже те саме, тільки точніше. */
const live = await chips('ACTIVE', [['ACTIVE', 5]], 0, 'campaign');
ok('і не дублює «5 active» своїм «Active»',
  live.texts.filter(t => /active/i.test(t)).length === 1, live.texts);

/* ВИМКНЕНА кампанія свій значок лишає: він тут єдина відповідь, чому
   активні оголошення під нею стоять. Заради цього значок і заводили. */
const off = await chips('PAUSED', [['ACTIVE', 3]], 0, 'campaign');
ok('вимкнена кампанія про себе каже', off.texts.some(t => /off/i.test(t)), off.texts);
/* Незнайомий стан теж лишається: мовчати про те, чого не знаємо, — це
   те саме мовчання, з якого все й починається. */
const odd = await chips('SOME_NEW_STATE', [['ACTIVE', 1]], 0, 'campaign');
ok('незнайомий стан лишається видним',
  odd.texts.some(t => /some new state/i.test(t)), odd.texts);

/* ── 3. ПІДЗАГОЛОВОК ── */
ok('«Full Funnel Tracking» немає ніде на сторінці',
  !/Full Funnel/i.test(HTML), 'Full Funnel');
ok('а сама назва лишилась', /Creative Analyzer/.test(HTML), 'Creative Analyzer');

/* ── 4. ВІДСТУПИ GEO ──
   Правити треба в build/shell.html: розмітку в index-legacy збірка
   перебиває, і правка туди просто не доїжджає. */
const geo = (HTML.match(/<div id="geo-sidebar-col" class="([^"]*)"/) || [])[1] || '';
ok('у блоці Geo відступ менший', /\bp-3\b/.test(geo) && !/\bp-4\b/.test(geo), geo);

/* ── 5. ЛІНІЇ МІЖ СТОВПЦЯМИ ПОМІТНІШІ ── */
ok('лінії стовпців на 70%',
  /border-left: 1px solid color-mix\(in srgb, var\(--border\) 70%/.test(HTML), '70%');

/* ── 6. СПИСОК КРЕАТИВІВ ──
   min-height працював, лише поки картки праворуч немає; щойно креатив
   вибрано, висоту задавала вона, і список обривався знов. */
ok('висота списку задана, а не мінімальна',
  /lg:h-\[75vh\]/.test(HTML) && !/lg:min-h-\[75vh\]/.test(HTML), 'lg:h-[75vh]');
ok('а на вузькому екрані лишається нижня межа',
  /min-h-\[500px\]/.test(HTML), 'min-h-[500px]');

await done(browser, srv, errs);
