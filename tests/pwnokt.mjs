/* ═══════════ «СТВОРИВ ШАБЛОН, А КНОПКИ ГРУЗИТИ НЕМАЄ» ═══════════

   Скрін дизайну кріпиться до KTID — це ТРЕТІЙ кусок назви кампанії
   через «_» (Mbank_KG_10708-ex8g_09/10 → 10708-ex8g). Ключ саме такий,
   бо назва щодня інша (у ній дата заливу), а воронка та сама.

   Назва на два куски KTID не дає. І клітинка лишалась просто
   ПОРОЖНЬОЮ: ні кнопки, ні пояснення. Ззовні це не відрізнити від
   поломки — що й сталось.

   Стенд тримає: з KTID є кнопка, без KTID є пояснення, і жодного разу
   не буває порожнього місця, яке мовчить. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8193;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

/* Колонка превю і підпис у заголовку — РІЗНІ місця, і перевіряємо
   обидва: колонки такій картці не дають навмисно (силкам потрібна
   ширина), а підпис стоїть серед інших підписів картки.

   mask задаємо стендом: у житті його читає pwMaskLoad із
   team_settings.pwa_parse, і саме ЙОГО значення тут і підміняємо. */
const look = (name, mask) => page.evaluate(([n, mk]) => {
  pwShots = {};
  pwMask = mk;
  const it = { name: n, geo: 'KG' };
  const d = document.createElement('div');
  d.innerHTML = pwNoKtid(it);
  const chip = d.firstElementChild;
  return { col: pwShotCol(it), ktid: pwKtid(n),
           chip: chip ? (chip.textContent || '').replace(/\s+/g, ' ').trim() : '',
           title: chip ? (chip.getAttribute('title') || '') : '' };
}, [name, mask || '*_{geo}_{ktid}']);

/* ── типовий шаблон ── */
const good = await look('Mbank_KG_10708-ex8g_09/10');
ok('за типовим шаблоном ktid на третьому місці', good.ktid === '10708-ex8g', good.ktid);
ok('і кнопка заливки на місці', /\+ дизайн/.test(good.col), good.col.slice(0, 80));
ok('на ній видно, до чого кріпимо', good.col.includes('10708-ex8g'), good.col.slice(0, 120));
ok('а підпису «нема ключа» на ній немає', good.chip === '', good.chip);

/* ── ЧУЖИЙ ШАБЛОН ──
   «інші баєри мають інші шаблони, наприклад в іншого баєра ktid в
   іншому місці стоїть, так як він вказав в мапінгу пва».

   Доти дашборд завжди брав ТРЕТІЙ кусок. Для цієї назви це 'KG' —
   тобто скрін ліг би під ключем «KG», спільним для всіх воронок
   цього гео. */
const other = await look('Mostbet_10864-9lm5_UZ_21/09', '*_{ktid}_{geo}');
ok('ktid береться з місця, вказаного в шаблоні',
  other.ktid === '10864-9lm5', other.ktid);
ok('і кнопка заливки з ним же', other.col.includes('10864-9lm5'), other.col.slice(0, 120));

/* Шаблон без роздільника «_» теж буває: ключ може сидіти в силці. */
const amp = await look('x&sub2=10999-ab12&sub3=KZ', '*&sub2={ktid}&sub3={geo}');
ok('шаблон на «&» теж розбирається', amp.ktid === '10999-ab12', amp.ktid);

/* ── назва, що не лягла під шаблон ── */
const bare = await look('Mbank_KG');
ok('ключа немає', bare.ktid === '', bare.ktid);
/* Колонку їй не дають НАВМИСНО: прикріпити дизайн ніде, а сто
   двадцять пікселів потрібні силкам. */
ok('колонки превю така картка не отримує', bare.col === '', bare.col);
/* А ось це й була вада: ніде жодного слова, чому кнопки немає. */
ok('але в заголовку сказано, що ключа немає', /no ktid/i.test(bare.chip), bare.chip);
/* Підказка мусить називати САМЕ той шаблон, за яким розбирали:
   «потрібен третій кусок» для чужого шаблону — неправда, а людина
   виправлятиме назву саме за цим рядком. */
ok('підказка називає шаблон', bare.title.includes('*_{geo}_{ktid}'), bare.title);
ok('і цитує саму назву', bare.title.includes('Mbank_KG'), bare.title);

/* Чужий шаблон, назва не під нього — підказка називає ЙОГО, а не
   типовий. */
const foreign = await look('Mbank_KG_10708_09/10', '*&sub2={ktid}&sub3={geo}');
ok('і для чужого шаблону теж називає саме його',
  foreign.title.includes('sub2={ktid}'), foreign.title);
/* Доти тут мовчки спрацьовував би третій кусок — і скрін ліг би під
   ключем, якого цей баєр ніде не задавав. */
ok('третій кусок при чужому шаблоні не береться',
  foreign.ktid === '', foreign.ktid);

/* ── PARAMETERS лишається винятком ──
   Це не воронка, а рядок параметрів: там дизайну не буває, і місце
   під нього порожнє НАВМИСНО. */
const par = await page.evaluate(() => ({
  col: pwShotCol({ name: 'X_Y_Z', geo: 'PARAMETERS' }),
  chip: pwNoKtid({ name: 'X_Y', geo: 'PARAMETERS' }) }));
ok('рядок параметрів лишається без колонки', par.col === '', par.col);
ok('і без підпису теж: тут мовчання доречне', par.chip === '', par.chip);

/* ── ДВІ КОПІЇ ОДНОГО РОЗБОРУ ──

   Імпорт розбирає назви у Form.html (apParseMask), дашборд — у себе
   (pwMaskParse). Файли різні: Form.html не проходить через build.py,
   спільного місця в них немає.

   Два розбори одного імені рано чи пізно дають дві різні відповіді —
   і тоді скрін лежить під одним ключем, а картка шукає його під
   іншим. Тож ганяємо однакові назви крізь обидві копії й звіряємо
   саме ВІДПОВІДІ, а не текст: перейменування в одній із них не має
   валити стенд, а зміна поведінки — має. */
const FORM = fs.readFileSync('Form.html', 'utf8');
const cut = (re, what) => {
  const m = FORM.match(re);
  ok('у Form.html є ' + what, !!m);
  return m ? m[0] : '';
};
const formParse = new Function(
  cut(/const AP_MASK_CACHE[\s\S]*?\nfunction apMaskCompile[\s\S]*?\n}/, 'apMaskCompile')
  + '\n'
  + cut(/function apParseMask[\s\S]*?\n  return out;\n}/, 'apParseMask')
  + '\nreturn apParseMask;')();

const CASES = [
  ['*_{geo}_{ktid}', 'Mbank_KG_10708-ex8g_09/10'],
  ['*_{geo}_{ktid}', 'Mbank_KG'],
  ['*_{ktid}_{geo}', 'Mostbet_10864-9lm5_UZ_21/09'],
  ['*&sub2={ktid}&sub3={geo}', 'x&sub2=10999-ab12&sub3=KZ'],
  ['*_{geo}_{ktid}', 'Melbet'],
  ['*_{geo}_{ktid}', 'A_B_C_D_E'],
  ['{geo}_{ktid}', 'KG_777-zz']
];
for (const [mask, name] of CASES) {
  const mine = await page.evaluate(([mk, n]) => {
    const r = pwMaskParse(mk, n);
    return r ? String(r.ktid || '') : null;
  }, [mask, name]);
  const theirs = (() => {
    const r = formParse(mask, name.split('_'), '', '');
    return r ? String(r.ktid || '') : null;
  })();
  ok('однаковий ktid для «' + name + '» за «' + mask + '»',
    mine === theirs, { mine, theirs });
}

await done(browser, srv, errs);
