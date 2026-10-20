/* ═══════════ ФІЛЬТР КАБІНЕТІВ ПО МІСЯЦЯХ (Form.html) ═══════════

   «Хочеться розуміти, скільки цього місяця в мене кабінетів було» —
   дата додавання в рядку вже стоїть, тож питання вирішує фільтр, а не
   новий запит. Стенд доводить три речі, які легко зламати очима:
     • місяці зібрані з наявних дат, найновіший першим, із кількістями;
     • рядок без дати не приписаний до жодного місяця;
     • число біля заголовка каже «показано зі скількох», а не просто
       довжину таблиці — інакше порожній результат фільтра не
       відрізнити від порожньої таблиці. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8124;
const { ok, done } = checks();
const srv = await serve(PORT);
/* Form.html без сесії сама йде на index.html, а без назви команди —
   теж. Даємо їй і те, і те, щоб дійти до таблиці кабінетів. */
const { browser, page, errs } = await open(PORT, {
  path: 'Form.html',
  init: () => {
    const mk = window.supabase.createClient;
    window.supabase.createClient = (...a) => {
      const c = mk(...a);
      c.auth.getSession = async () => ({ data: { session: { user: { id: 'u1' } } } });
      return c;
    };
    localStorage.setItem('selected_team', 'TEST');
    window.alert = () => {};
  }
});

const seed = rows => page.evaluate(r => {
  allProviders = r;            // лексичне let: через window не дійде
  accFillMonths();
  filterProviders();
}, rows);

const state = () => page.evaluate(() => ({
  opts: [...document.getElementById('acc-month').options].map(o => [o.value, o.textContent]),
  sel: document.getElementById('acc-month').value,
  cnt: document.getElementById('acc-count').textContent,
  ids: [...document.querySelectorAll('#providers-list-body tr')]
    .map(tr => tr.firstElementChild.textContent.trim())
}));

const pick = m => page.evaluate(v => {
  document.getElementById('acc-month').value = v;
  filterProviders();
}, m);

const ROWS = [
  { id: 1, account_id: 'act_1', created_at: '2026-10-03T10:00:00Z', provider_name: 'Alpha' },
  { id: 2, account_id: 'act_2', created_at: '2026-10-19T10:00:00Z', provider_name: 'Beta' },
  { id: 3, account_id: 'act_3', created_at: '2026-09-01T10:00:00Z', provider_name: 'Alpha' },
  { id: 4, account_id: 'act_4', added_at: '2026-08-15T10:00:00Z', provider_name: 'Gamma' },
  { id: 5, account_id: 'act_5', provider_name: 'Gamma' }   // без дати
];

ok('select#acc-month є в розмітці', await page.locator('#acc-month').count() === 1);
ok('span#acc-count є в розмітці', await page.locator('#acc-count').count() === 1);

await seed(ROWS);
let s = await state();

ok('перший пункт — усі місяці', s.opts[0] && s.opts[0][0] === '' && /All months/.test(s.opts[0][1]), s.opts);
ok('місяці зібрані з обох дат, найновіший першим',
  JSON.stringify(s.opts.slice(1).map(o => o[0])) === JSON.stringify(['2026-10', '2026-09', '2026-08']), s.opts);
ok('у назві місяця стоїть кількість',
  s.opts[1][1] === 'Oct 2026 · 2' && s.opts[3][1] === 'Aug 2026 · 1', s.opts);
ok('без фільтра показані всі рядки, разом із тим, що без дати',
  JSON.stringify(s.ids) === JSON.stringify(['act_1', 'act_2', 'act_3', 'act_4', 'act_5']), s.ids);
ok('без фільтра число — просто скільки їх', s.cnt.trim() === '5', s.cnt);

await pick('2026-10');
s = await state();
ok('вибраний місяць лишає тільки свої рядки',
  JSON.stringify(s.ids) === JSON.stringify(['act_1', 'act_2']), s.ids);
ok('число каже «показано зі скількох»', s.cnt.trim() === '2 / 5', s.cnt);

await pick('2026-08');
s = await state();
ok('місяць із added_at теж фільтрує',
  JSON.stringify(s.ids) === JSON.stringify(['act_4']), s.ids);

/* Рядок без дати: він не стверджує нічого про час, тож приписати його
   до місяця було б вигадкою — і в жодному місяці його немає. */
const noDate = await page.evaluate(() => ['2026-10', '2026-09', '2026-08'].every(m => {
  document.getElementById('acc-month').value = m;
  filterProviders();
  return ![...document.querySelectorAll('#providers-list-body tr')]
    .some(tr => tr.firstElementChild.textContent.trim() === 'act_5');
}));
ok('рядок без дати не попадає ні в який місяць', noDate);

/* Текст і місяць працюють разом, а не один замість одного. */
await page.evaluate(() => {
  document.getElementById('acc-month').value = '2026-10';
  document.getElementById('acc-search').value = 'alpha';
  filterProviders();
});
s = await state();
ok('місяць і пошук звужують разом',
  JSON.stringify(s.ids) === JSON.stringify(['act_1']), s.ids);
ok('нічого не знайшлось — видно, що це фільтр, а не порожня таблиця',
  await page.evaluate(() => {
    document.getElementById('acc-search').value = 'zzz';
    filterProviders();
    return document.getElementById('acc-count').textContent.trim() === '0 / 5'
      && /No accounts linked yet/.test(document.getElementById('providers-list-body').textContent);
  }));

await page.evaluate(() => { document.getElementById('acc-search').value = ''; });

/* Перемальовка таблиці не має мовчки скидати вибір. */
await page.evaluate(() => { document.getElementById('acc-month').value = '2026-09'; filterProviders(); });
await page.evaluate(r => { allProviders = r; accFillMonths(); filterProviders(); }, ROWS);
s = await state();
ok('вибраний місяць переживає перемальовку', s.sel === '2026-09', s);
ok('і таблиця після перемальовки лишається звуженою',
  JSON.stringify(s.ids) === JSON.stringify(['act_3']), s.ids);

/* А якщо місяця більше немає серед дат — вибір падає на «усі», бо
   фільтр по місяцю, якого немає, показував би вічну пустку. */
await page.evaluate(() => { document.getElementById('acc-month').value = '2026-08'; filterProviders(); });
await seed(ROWS.filter(r => r.id !== 4));
s = await state();
ok('зник місяць — вибір повертається на «усі»', s.sel === '', s);
ok('і рядки знову всі', s.ids.length === 4, s.ids);

await done(browser, srv, errs);
