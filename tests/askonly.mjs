/* ═══════════ ЖОДНОГО СИСТЕМНОГО ВІКНА ═══════════

   alert() перехоплений давно, confirm() переписаний на ask(), а
   prompt() лишався — і саме він стрічався там, де міняють гроші:
   «New daily budget for …» відкривалось сірим вікном браузера з
   написом «github.io каже:». Поруч із рештою сторінки це виглядає
   так, ніби щось зламалось, а не так, ніби в тебе питають.

   Стенд тримає три речі:

     1. У зібраній сторінці prompt() не лишилось зовсім, а кожен
        confirm(), що там є, — запасна гілка `typeof ask === 'function'
        ? … : confirm(…)`, тобто код, у який при живому шарі дизайну
        не заходять. Перевіряти це текстом доводиться тому, що
        натиснути всі двадцять місць стенд не може, а пропустити одне
        означає лишити користувача віч-на-віч із сірим вікном;

     2. ask() з полем справді повертає рядок, а Esc — false. На цьому
        тримаються всі переписані місця: бюджет, нова команда, копія
        шаблону під інші гео;

     3. саме те вікно бюджету, з якого все почалось, тепер наше:
        відкривається .askbox із поточним числом у полі. */
import { serve, open, checks } from './_harness.mjs';
import fs from 'node:fs';

const PORT = 8166;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* ── 1. що лишилось у зібраній сторінці ── */

const HTML = fs.readFileSync('index.html', 'utf8');
/* Беремо код без коментарів: пояснення, чому prompt() тут більше
   немає, саме слово prompt містить, і збіг по всьому файлу падав би
   на тексті про власну відсутність. */
const CODE = HTML.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const proms = (CODE.match(/[^.\w]prompt\(/g) || []);
ok('prompt() у зібраній сторінці не лишилось', proms.length === 0, proms.slice(0, 3));

/* Кожен confirm() має бути ДРУГОЮ гілкою тернарника з typeof ask.
   Дивимось 120 символів перед ним: гілка пишеться поруч. */
const confs = [...CODE.matchAll(/[^.\w]confirm\(/g)];
/* Гілка пишеться поруч, але сам виклик ask() між ними буває на
   півдесятка рядків. Тому вікно більше, і вимагаємо, щоб між
   `typeof ask` і confirm не було крапки з комою: інакше це вже
   наступна команда, а не друга гілка того самого тернарника. */
const naked = confs.filter(m => {
  const back = CODE.slice(Math.max(0, m.index - 1200), m.index);
  const i = back.lastIndexOf("typeof ask === 'function'");
  return i < 0 || back.slice(i).includes(';');
});
ok('кожен confirm() — лише запасна гілка при живому ask()',
  naked.length === 0, naked.map(m => CODE.slice(m.index, m.index + 60)));
ok('запасні гілки не вигадані — вони справді є', confs.length > 0);

/* Небезпечні місця мусять бути червоними: видалення дня, усієї
   історії команди, таска, звіту, виплати, тексту. Якщо кнопка «так»
   у них виглядає як звичайна, вікно перестає відрізнятись від
   нешкідливого питання. */
/* Перевіряємо ДЖЕРЕЛА, а не зібрану сторінку: у збірці рядки
   проходять через словник build/i18n.py і «Видалити таск?» стає
   «Delete this task?». Шукати в зібраному означало б шукати те, чого
   там уже немає. */
const SRC = ['index-legacy.html', 'build/cabinets.js', 'build/posts.js']
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');
['Видалити таск?', 'Видалити звіт?', 'Видалити виплату?',
 'Delete ALL data?', 'Видалити цей текст?', 'Прибрати цей запис?'].forEach(t => {
  const i = SRC.indexOf(t);
  ok('червона кнопка: ' + t, i > 0 && /danger: true/.test(SRC.slice(i - 200, i + 300)));
});

/* ОДНА МОВА В ОДНОМУ ВІКНІ. Словник перекладає підрядками, і через це
   заголовок уже був англійським, а кнопка під ним — українською:
   «Delete this task?» / «Видалити». Для людини це виглядає як
   недороблене вікно, і помітити таке очима в двадцяти місцях
   неможливо — тому це перевірка, а не уважність. */
const UA = /[а-яіїєґА-ЯІЇЄҐ]/;
const mixed = [...HTML.matchAll(/await ask\(\{[\s\S]{0,320}?\}\)\)/g)].map(m => {
  const t = (m[0].match(/title: '([^']{0,60})/) || [])[1];
  const o = (m[0].match(/ok: '([^']{0,30})/) || [])[1];
  return t && o && UA.test(t) !== UA.test(o) ? t + ' / ' + o : null;
}).filter(Boolean);
ok('заголовок і кнопка в одному вікні однією мовою', mixed.length === 0, mixed);

/* ── 2. ask() з полем ── */

const typed = await page.evaluate(async () => {
  const p = ask({ title: 'Поле', ok: 'Далі', input: { value: '12.5' } });
  await new Promise(r => setTimeout(r, 30));
  const box = document.querySelector('.askwrap .ask-in');
  if (!box) return { err: 'поля немає' };
  const pre = box.value;
  box.value = '7.25';
  document.querySelector('.askwrap .ask-yes').click();
  return { pre, got: await p };
});
ok('поле відкривається з поточним значенням', typed.pre === '12.5', typed);
ok('ask() з полем повертає введений рядок', typed.got === '7.25', typed);

const esc = await page.evaluate(async () => {
  const p = ask({ title: 'Поле', input: { value: 'x' } });
  await new Promise(r => setTimeout(r, 30));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return await p;
});
/* Esc мусить бути саме false, а не порожній рядок: порожнім рядком
   у цих вікнах стирають значення, і злити їх означало б прийняти
   скасування за «зроби порожнім». */
ok('Esc — це відмова (false), а не порожнє значення', esc === false, { esc });

const nothingLeft = await page.evaluate(() => document.querySelectorAll('.askwrap').length);
ok('вікно прибирається за собою', nothingLeft === 0, { nothingLeft });

/* ── 3. те саме вікно бюджету ── */

const bud = await page.evaluate(async () => {
  cdBudgetOf = () => ({ kind: 'daily', v: 12.5 });
  cdBudgetEdit('23', encodeURIComponent('Campaign «KZ»'));
  await new Promise(r => setTimeout(r, 60));
  const box = document.querySelector('.askwrap .askbox');
  const out = {
    own: !!box,
    title: box ? (box.querySelector('.ask-title') || {}).textContent : '',
    body: box ? (box.querySelector('.ask-body') || {}).textContent : '',
    value: box ? (box.querySelector('.ask-in') || {}).value : ''
  };
  const no = document.querySelector('.askwrap .ask-no');
  if (no) no.click();
  return out;
});
ok('бюджет питається нашим вікном, не системним', bud.own, bud);
ok('у заголовку сказано, який саме бюджет', /daily budget/i.test(bud.title || ''), bud);
ok('видно назву кампанії', /Campaign/.test(bud.body || ''), bud);
ok('видно, скільки стоїть зараз', /12\.50/.test(bud.body || ''), bud);
ok('поле вже містить поточне число', bud.value === '12.5', bud);

const gone = await page.evaluate(async () => {
  await new Promise(r => setTimeout(r, 40));
  return document.querySelectorAll('.askwrap').length;
});
ok('відмова закриває вікно', gone === 0, { gone });

await done(browser, srv, errs);
