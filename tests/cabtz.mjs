/* ═══════════ ЧИЄ «СЬОГОДНІ» В РЯДКУ КАБІНЕТА ═══════════

   fb-sync кладе день у fb_spend_daily за часовим поясом САМОГО
   кабінета, а таблиця питала дату браузера. Доки обидва в одному
   поясі, різниці немає — і саме тому вада живе непомітно, а
   проявляється вночі: у кабінета ще вчора, у тебе вже сьогодні, і в
   стовпчику «Spend» стоїть учорашній підсумок.

   Дерево кампаній цього не мало ніколи: воно питає Facebook наживо й
   теж у поясі кабінета. Через це «в кампаніях усе добре, а в
   кабінетах ні» — і через це ж вада виглядала як щось дрібне.

   Стенд ставить два кабінети в різні пояси, кладе їм гроші на різні
   дати й перевіряє, що кожен бере СВІЙ день. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8174;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const got = await page.evaluate(() => {
  /* Рахуємо від справжньої «сьогодні» браузера: стенд має працювати
     будь-якого дня, а не того, коли його написали. */
  const mine = cabDay(0);
  const before = cabShiftDay(mine, -1);
  const before2 = cabShiftDay(mine, -2);
  const after = cabShiftDay(mine, 1);

  /* Який пояс сьогодні ПОЗАДУ моєї дати, а який ПОПЕРЕДУ — залежить
     від години, коли стенд запущено. Тому пояс не вгадуємо, а беремо
     той, що дає потрібну дату прямо зараз; якщо такого немає (ми
     рівно посеред доби за UTC), пропускаємо цю половину. */
  const tzWith = want => ['Pacific/Kiritimati', 'Asia/Tokyo', 'Europe/Kyiv',
    'America/New_York', 'America/Los_Angeles', 'Pacific/Midway']
    .find(z => cabTzDay(z) === want) || '';

  const tzBack = tzWith(before);   // у кабінета ще вчора
  const tzAhead = tzWith(after);   // у кабінета вже завтра

  cabRange = { key: 'today', since: '', until: '' };
  cabDaysErr = '';
  cabDays = {
    A: { spend: 0, imps: 0, clicks: 0, by: {
      [mine]:   { spend: 100, imps: 1, clicks: 1 },
      [before]: { spend: 777, imps: 7, clicks: 7 },
      /* Позавчора потрібне саме для «вчора» кабінета, у якого сьогодні
         ще вчорашня дата: його «вчора» — це не твоє вчора. */
      [before2]: { spend: 333, imps: 3, clicks: 3 },
      [after]:  { spend: 555, imps: 5, clicks: 5 } } },
    B: { spend: 0, imps: 0, clicks: 0, by: {
      [mine]: { spend: 100, imps: 1, clicks: 1 } } }
  };
  const ask = (id, tz) => cabSpendIn({ account_id: id, timezone_name: tz });

  const out = { mine, tzBack, tzAhead };
  out.local = ask('A', '');                       // пояса немає — локальна дата
  if (tzBack) out.back = ask('A', tzBack);
  if (tzAhead) out.ahead = ask('A', tzAhead);

  // «Вчора» теж рахується від дня кабінета, а не від твого
  cabRange = { key: 'yest', since: '', until: '' };
  if (tzBack) out.yestBack = ask('A', tzBack);

  // Довші періоди лишаються сумою вікна — щоб «цей місяць» у сусідніх
  // рядках не охоплював різні дні.
  cabDays.A.spend = 1234;
  cabRange = { key: 'month', since: '', until: '' };
  out.month = ask('A', tzBack || 'Asia/Tokyo');

  // Дня немає зовсім — нуль, а не чуже число
  cabRange = { key: 'today', since: '', until: '' };
  out.missing = tzBack ? ask('B', tzBack) : null;
  return out;
});

ok('без пояса лишається локальна дата', got.local === 100, got);

if (got.tzBack) {
  ok('кабінет, у якого ще вчора, бере СВІЙ день', got.back === 777, got);
  ok('«вчора» теж рахується від дня кабінета', got.yestBack === 333, got);
  /* Саме це й бачив користувач: день є в базі, але під датою кабінета,
     а не під твоєю — і на екран ішло 0 або чуже число. */
  ok('якщо дня кабінета немає — нуль, а не чужий день', got.missing === 0, got);
} else {
  ok('пояс «позаду» не знайшовся — цю половину пропущено', true, got);
  ok('(та сама)', true); ok('(та сама)', true);
}

if (got.tzAhead) ok('кабінет, у якого вже завтра, теж бере свій день',
  got.ahead === 555, got);
else ok('пояс «попереду» не знайшовся — пропущено', true, got);

ok('довший період лишається сумою вікна', got.month === 1234, got);

await done(browser, srv, errs);
