/* ═══════════ ПЕРЕВІРИТИ ВСІ ПРІЛКИ ═══════════

   «зроби ще кнопку перевірити прілки (типу масово) в FORM, ну і
   можеш також додати в модальне вікно прілок».

   Кнопка «↻» була на кожному рядку, а прілок у команди під сотню:
   обійти їх руками — сто кліків і сто очікувань.

   Масовий обхід у check-apps уже є, але він ЗА РОЗКЛАДОМ і вимагає
   x-cron-key, якого в людини немає й бути не може. Тому кнопка —
   це цикл по тій самій людській перевірці однієї воронки: ті самі
   права (RLS), та сама поведінка щодо банів, нічого нового на боці
   функції. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8206;
const { ok, done } = checks();
const srv = await serve(PORT);

const FORM = fs.readFileSync('Form.html', 'utf8');
const HTML = fs.readFileSync('index.html', 'utf8');

/* ── 1. ДВІ КОПІЇ — ОДНЕ ТІЛО ──
   Form.html і index.html — два окремі застосунки без спільного
   модуля, тож функція копіюється дослівно. Копії, що розійшлись,
   означали б дві різні перевірки під однією назвою — тому звіряємо
   символ у символ. */
const grab = (src, name) => {
  const i = src.indexOf('async function appCheckAll(say) {');
  const j = src.indexOf('\nfunction appCheckSay(o) {', i);
  ok('у ' + name + ' є appCheckAll', i >= 0 && j > i);
  return i >= 0 && j > i ? src.slice(i, j) : name;
};
const a = grab(FORM, 'Form.html');
const b = grab(HTML, 'index.html');
ok('обидві копії дослівно однакові', a === b,
  a === b ? '' : [a.length, b.length]);

/* ── 2. ЩО САМЕ ВОНА РОБИТЬ ── */
ok('ходить у ту саму людську перевірку однієї воронки',
  /functions\/v1\/check-apps/.test(a) && /funnel_id: rows\[i\]\.id/.test(a), 'endpoint');
/* Ключа розкладу в людини немає — і просити його тут нема в кого. */
ok('ключа розкладу не вигадує', !/x-cron-key'\s*:/.test(a), 'no cron key');
/* Паралельно було б швидше рівно до того моменту, як Play почав би
   відповідати 429 — а 429 у нас означає «не дізнались». */
ok('ходить по черзі, а не всі одразу',
  /for \(let i = 0; i < rows\.length; i\+\+\)/.test(a) && !/Promise\.all/.test(a), 'sequential');
/* Фільтр у таблиці звузив би й перевірку, а «перевірити всі» має
   означати всі. */
ok('список бере з бази, а не з намальованого на екрані',
  /from\('funnels_mapping'\)[\s\S]{0,80}select\('id,app_id'\)/.test(a), 'from db');
ok('воронки без апки пропускає',
  /filter\(r => String\(r\.app_id \|\| ''\)\.trim\(\)\)/.test(a), 'has app_id');
/* Сто однакових помилок поспіль нічого не додають, а чекати на них
   доведеться хвилини. */
ok('на поломці самої функції зупиняється', /\bbreak;/.test(a), 'break');
ok('а на поганій одній апці — йде далі', /\bcontinue;/.test(a), 'continue');

/* ── 3. ПІДСУМОК ── */
const say = await (async () => {
  const { browser, page, errs } = await open(PORT, { viewport: { width: 900, height: 700 } });
  const r = await page.evaluate(() => ({
    none: appCheckSay({ n: 0, error: 'жодної воронки з апкою' }),
    clean: appCheckSay({ n: 12, live: 12, gone: 0, unknown: 0, failed: 0, banned: 0, freed: 0 }),
    mixed: appCheckSay({ n: 12, live: 8, gone: 3, unknown: 1, failed: 0, banned: 2, freed: 1 })
  }));
  await browser.close();
  return { r, errs };
})();
ok('порожній парк каже про це', /жодної воронки/.test(say.r.none), say.r.none);
/* Нулі не показуємо: рядок читають із телефона, і «0 забанено» — це
   слово, яке треба прочитати, щоб зрозуміти, що нічого не сталось. */
ok('чистий обхід — без нулів',
  say.r.clean === '12 перевірено', say.r.clean);
ok('а в змішаному видно, що саме сталось',
  /2 забанено/.test(say.r.mixed) && /1 розбанено/.test(say.r.mixed)
  && /3 не відповідають/.test(say.r.mixed) && /1 не дізнались/.test(say.r.mixed), say.r.mixed);

/* ── 4. КНОПКИ НА МІСЦІ ── */
ok('у Form кнопка стоїть у шапці KTID Mappings',
  /KTID Mappings<\/h3>[\s\S]{0,400}funAppCheckAll\(this\)/.test(FORM), 'Form.html');
/* Кнопка «↻» на рядку лишається: вона про одну апку, нова — про парк. */
ok('а поштучна перевірка нікуди не ділась', /funAppRecheck\('/.test(FORM), 'funAppRecheck');
ok('у вікні прілок кнопка теж є', /id="ap-checkall"/.test(HTML), 'index.html');
/* У режимі PWA апок немає — там ця кнопка була б про чуже. */
ok('і в режимі PWA вона ховається',
  /ap-checkall[\s\S]{0,200}classList\.toggle\('hidden', pwa\)/.test(HTML), 'hidden in pwa');

/* ── 5. ПОКИ ЙДЕ — КНОПКА МОВЧАТИ НЕ МАЄ ──
   Сто перевірок тривають хвилини, і мовчазна кнопка за цей час
   встигає отримати ще п'ять натискань. */
ok('у Form кнопка вимикається на час обходу',
  /btn\.disabled = true/.test(FORM) && /finally \{[\s\S]{0,160}btn\.disabled = false/.test(FORM), 'Form');
ok('і показує, на якій апці стоїмо',
  /btn\.textContent = t/.test(FORM), 'progress');
ok('у вікні прілок хід пишеться в підзаголовок',
  /sub\.textContent = t/.test(HTML), 'ap-sub');

await done(null, srv, say.errs);
