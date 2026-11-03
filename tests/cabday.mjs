/* ═══════════ ЧИЙ ДЕНЬ ПІД ЦИМ ЧИСЛОМ ═══════════

   «в мене щось не так з одним акаунтом, він підтягує не сьогоднішні
   дані».

   Найчастіше це не вада. Facebook рахує витрати ТІЛЬКИ в поясі самого
   кабінета — іншого розрізу він не віддає взагалі. Кабінет у Ташкенті
   вночі справді стоїть на іншій даті, ніж ти, і число під ним — те
   саме, що в його Ads Manager.

   Але з екрана це не відрізнити від справжньої вади: число як число.
   Саме мовчання й робило з різниці поясів загадку.

   Стенд тримає:
     1. збігається з твоїм днем — нічого не дописуємо;
     2. не збігається — сказано, що за день і в якому поясі, і що це
        не твоя дата;
     3. поясу немає — сказано, що взяли ТВІЙ, і що з цим робити;
     4. підпис є і на прочерку: «нуль за сьогодні» в кабінета, який ще
        живе вчорашньою датою, дивує найбільше;
     5. на періодах, ширших за день, підпису немає: там він брехав би. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8194;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const note = (tz, key) => page.evaluate(([t, k]) => {
  cabRange = { key: k };
  return cabDayNote(t === null ? null : { timezone_name: t });
}, [tz, key]);

/* Пояс, у якому зараз та сама дата, що й у браузера стенда: UTC може
   розійтись із ним залежно від години, тож беремо саме його. */
const myTz = await page.evaluate(() =>
  Intl.DateTimeFormat().resolvedOptions().timeZone);
const myDay = await page.evaluate(() => cabTzDay(''));

/* ── 1. той самий день ── */
const same = await note(myTz, 'today');
ok('свій пояс називає день', same.includes(myDay), same);
/* Щоденне «збігається з твоїм» привчило б не читати цей рядок. */
ok('і не кричить про різницю, якої немає',
  !/not your date/.test(same), same);

/* ── 2. інший день ──
   Кабінет за лінією зміни дати стоїть на іншій даті завжди: яку б
   годину не показував годинник стенда, Kiritimati і Niue в один
   момент мають різні дати. */
const far = await note('Pacific/Kiritimati', 'today');
const west = await note('Pacific/Niue', 'today');
const diff = [far, west].find(x => /not your date/.test(x));
ok('коли дата інша — про це сказано', !!diff, { far, west });
ok('і названо твою для порівняння',
  !!diff && diff.includes(myDay), diff);
ok('і названо пояс кабінета',
  !!diff && /Pacific\//.test(diff), diff);

/* ── 3. поясу немає ──
   Тоді число порахували за ТВОЄЮ датою — тобто можливо не за тією, за
   якою його рахує Facebook. Це вже не різниця поясів, а брак даних, і
   мовчати про нього не можна. */
const none = await note('', 'today');
ok('без поясу сказано, що дата ТВОЯ', /YOUR date/.test(none), none);
ok('і сказано, що з цим робити', /Sync now/.test(none), none);
ok('порожній fb поводиться так само', /YOUR date/.test(await note(null, 'today')), 'null');

/* ── 4. учора — той самий підпис, зсунутий ── */
const yest = await note(myTz, 'yest');
ok('учора теж підписане', yest.includes(myTz), yest);
ok('і це не сьогоднішня дата', !yest.includes(myDay + ' in'), { yest, myDay });

/* ── 5. ширші періоди ──
   «Цей місяць» рахується одним вікном на всі кабінети навмисно, тож
   підпис про чийсь день там був би неправдою. */
for (const k of ['week', 'month', '7d', 'all']) {
  ok('на періоді «' + k + '» підпису немає', (await note(myTz, k)) === '', k);
}

/* ── 6. ПІДПИС ДОЇЖДЖАЄ ДО КЛІТИНКИ ──

   Сам текст нічого не вартий, якщо його немає на екрані. Клітинку
   будує шматок усередині великого рендера, і витягти його окремо не
   можна, тож перевіряємо ЗІБРАНУ сторінку: підпис мусить стояти на
   обох гілках — і на числі, і на прочерку.

   Прочерк важливіший: «нуль за сьогодні» в кабінета, який ще живе
   вчорашньою датою, і є те, що дивує. */
const BUILT = fs.readFileSync('index.html', 'utf8');
const cellSrc = BUILT.slice(BUILT.indexOf('const inRange = cabSpendIn(c.fb);'),
                            BUILT.indexOf('const cell = col => {'));
ok('клітинка рахує підпис', /const dayTip = cabDayNote\(c\.fb\);/.test(cellSrc), cellSrc.slice(0, 90));
ok('і вішає його на число',
  /dayTip[\s\S]{0,80}title="\$\{cabEsc\(dayTip\)\}"[\s\S]{0,80}cabMoneyCur/.test(cellSrc), cellSrc);
ok('і на прочерк теж',
  /cab-na\$\{dayTip[\s\S]{0,120}cabEsc\(dayTip\)/.test(cellSrc), cellSrc);
/* Поки історії немає, число взагалі невідоме — там інша відповідь, і
   підмінювати її розмовою про пояси не можна. */
ok('а «історії ще немає» лишається собою',
  /No spend history yet/.test(cellSrc), cellSrc);

await done(browser, srv, errs);
