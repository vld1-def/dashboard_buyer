/* ═══════════ КОТРА ТАМ ГОДИНА ═══════════

   «а можемо створити ще модальне вікно з часом в різних країнах?»

   Гео беремо з уже завантажених даних, а не зі списку країн світу:
   дивляться сюди про ті гео, на які ллють, і шукати серед двохсот
   рядків означає не подивитись.

   Головне, що тут легко зробити неправильно, — підставити UTC гео, у
   якого ми поясу не знаємо. Виглядало б це як час, а за часом
   планують залив. Тож такі гео стоять окремим рядком і прямо кажуть,
   що часу для них немає.

   Стенд тримає:
     1. гео беруться саме з даних і без «??»;
     2. час кожного збігається з тим, що дає Intl для його поясу, —
        тобто ми не вигадуємо свою арифметику;
     3. невідомий пояс не отримує часу взагалі, а отримує пояснення;
     4. ніч видно не лише кольором, а й словом;
     5. закрите вікно не малює далі. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8199;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const paint = geos => page.evaluate(gs => {
  rawData = gs.map(g => ({ geo: g, spend: 1 }));
  openClockModal();
  const body = document.getElementById('clock-body');
  return {
    hidden: document.getElementById('clock-modal').classList.contains('hidden'),
    rows: [...body.querySelectorAll('.clk-row')].map(r => ({
      geo: r.querySelector('.clk-geo').textContent.trim(),
      time: r.querySelector('.clk-time').textContent.trim(),
      day: r.querySelector('.clk-day').textContent.trim(),
      part: r.querySelector('.clk-part').textContent.trim(),
      diff: r.querySelector('.clk-diff').textContent.trim(),
      name: r.querySelector('.clk-name').getAttribute('title') || '',
      night: r.classList.contains('is-night')
    })),
    none: (body.querySelector('.clk-none') || {}).textContent || '',
    /* Увесь текст вікна, а не лише відомі нам блоки: порожній стан
       малюється власним абзацом, і стенд, який дивиться тільки на
       .clk-row і .clk-none, його просто не побачить — на чому вже
       один раз і спіткнувся. */
    text: body.textContent.replace(/\s+/g, ' ').trim(),
    sub: document.getElementById('clock-sub').textContent.trim()
  };
}, geos);

/* ── 1. ГЕО З ДАНИХ ── */
const v = await paint(['KG', 'TJ', 'UZ', '??', 'kg', '']);
ok('вікно відкрилось', !v.hidden);
ok('гео беруться з даних', v.rows.map(r => r.geo).sort().join() === 'KG,TJ,UZ',
  v.rows.map(r => r.geo));
ok('«??» у список не йде', !v.rows.some(r => r.geo === '??'), v.rows.map(r => r.geo));
ok('і регістр не плодить дублів',
  v.rows.filter(r => r.geo === 'KG').length === 1, v.rows.map(r => r.geo));
ok('свій час теж видно', /You:/.test(v.sub), v.sub);

/* ── 2. ЧАС СПРАВЖНІЙ ──
   Звіряємо з тим, що для цього ж поясу дає сам браузер: власна
   арифметика поясів — найкоротший шлях до години різниці влітку. */
const real = await page.evaluate(() => ({
  KG: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bishkek', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
  TJ: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dushanbe', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}));
const byGeo = Object.fromEntries(v.rows.map(r => [r.geo, r]));
ok('час KG збігається з Intl', byGeo.KG.time === real.KG, { ours: byGeo.KG.time, intl: real.KG });
ok('час TJ збігається з Intl', byGeo.TJ.time === real.TJ, { ours: byGeo.TJ.time, intl: real.TJ });
ok('дата теж показана', /\d/.test(byGeo.KG.day), byGeo.KG.day);
ok('і пояс названий у підказці', /Asia\/Bishkek/.test(byGeo.KG.name), byGeo.KG.name);

/* ── 3. ПОРА ДОБИ СЛОВОМ ──
   Колір на тлі читають не всі, а «night» читають усі. */
ok('пора доби підписана словом',
  v.rows.every(r => /^(night|morning|day|evening)$/.test(r.part)), v.rows.map(r => r.part));
const nightRows = v.rows.filter(r => r.part === 'night');
ok('нічні рядки позначені й класом',
  nightRows.every(r => r.night), nightRows);

/* ── 4. НЕВІДОМИЙ ПОЯС ──
   Найлегша помилка тут — підставити UTC. Це виглядало б як час, а за
   часом планують залив. */
const unk = await paint(['KG', 'ZZ', 'XK']);
ok('гео без поясу в список не потрапляє',
  !unk.rows.some(r => r.geo === 'ZZ' || r.geo === 'XK'), unk.rows.map(r => r.geo));
ok('але про нього сказано', /ZZ/.test(unk.none) && /XK/.test(unk.none), unk.none);
ok('і сказано ЧОМУ часу немає',
  /do not know the timezone/i.test(unk.none), unk.none);

/* ── 5. КРАЇНА З КІЛЬКОМА ПОЯСАМИ ──
   Мовчазний вибір одного з чотирьох виглядав би як факт. */
const many = await paint(['US', 'KZ']);
const us = many.rows.find(r => r.geo === 'US');
ok('про решту поясів країни сказано', /more zone/.test(us.name), us.name);

/* ── 6. ПОРОЖНІ ДАНІ ── */
const none = await paint([]);
ok('без даних рядків немає', none.rows.length === 0, none.rows);
ok('але вікно пояснює, а не мовчить',
  /No geo in the loaded data/i.test(none.text), none.text);

/* ── 7. ЗАКРИТЕ ВІКНО НЕ МАЛЮЄ ──
   Лічильник щопівхвилини, забутий увімкненим, жив би до кінця сеансу. */
const timer = await page.evaluate(() => {
  closeClockModal();
  return { hidden: document.getElementById('clock-modal').classList.contains('hidden'),
           t: clockTimer };
});
ok('вікно закрилось', timer.hidden);
ok('і лічильник знято', timer.t === 0, timer);

await done(browser, srv, errs);
