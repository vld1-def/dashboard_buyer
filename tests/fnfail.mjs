/* ═══════════ «FAILED TO FETCH» КАЖЕ, ЩО СТАЛОСЬ ═══════════

   Незадеплоєна Edge-функція не віддає ні коду, ні причини: CORS-
   préflight отримує голий 404 без заголовків, fetch падає з
   TypeError, і на екрані стоїть «Failed to fetch». Слово в слово те
   саме — якщо функція не змогла стартувати або зникла мережа.

   Обробка 404 у місці виклику тут не рятує: відповіді немає взагалі.
   А місць цих пʼятнадцять, тож латка в кожному означала б забути її в
   шістнадцятому. Переклад стоїть один раз, на рівні fetch, і стенд
   тримає саме його межі:

     1. виклик функції, що не відповіла, називає ЇЇ ІМʼЯ і команду
        розгортання — інакше людина шукає ваду в кабінеті, з яким усе
        гаразд;
     2. імʼя береться з адреси, тож це працює і для функцій, яких ще
        немає в коді;
     3. названа не лише одна причина: вгадати ми не можемо, і
        впевнений тон тут був би брехнею;
     4. чужі адреси не чіпаються зовсім;
     5. відповідь від самої функції проходить незмінною — 404 від неї
        мусить лишитись 404, бо місця виклику його розрізняють. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8173;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* Мережі в стенді немає, тож будь-який зовнішній запит падає саме
   TypeError — рівно тим, що обгортка й має перекладати. Нічого
   підміняти не треба: перевіряємо той код, що стоїть на сторінці. */
const said = await page.evaluate(async () => {
  const call = async u => {
    try { await fetch(u, { method: 'POST' }); return 'ok'; }
    catch (e) { return String(e.message || e); }
  };
  const base = 'https://x.supabase.co/functions/v1/';
  return { known: await call(base + 'fb-limit'),
           other: await call(base + 'tg-news'),
           alien: await call('https://example.invalid/whatever') };
});
ok('незадеплоєна функція названа імʼям', /fb-limit/.test(said.known), said);
ok('і командою розгортання', /deploy fb-limit/.test(said.known), said);
ok('імʼя береться з адреси — працює для будь-якої функції',
  /tg-news/.test(said.other) && /deploy tg-news/.test(said.other), said);
ok('названі й інші причини, а не лише деплой',
  /стартувати/.test(said.known) && /мереж/.test(said.known), said);
ok('чужа адреса лишається з власною помилкою',
  !/deploy/.test(said.alien), said);

/* Відповідь від самої функції — навіть 404 — має дійти як є: саме за
   кодом місця виклику й відрізняють «немає рядка» від «немає функції». */
const pass = await page.evaluate(async () => {
  try {
    const r = await fetch('/functions/v1/fb-limit', { method: 'POST' });
    return { status: r.status, hasJson: typeof r.json === 'function' };
  } catch (e) { return { err: String(e.message || e) }; }
});
ok('відповідь від функції проходить незмінною',
  pass.status === 404 && pass.hasJson === true, pass);

/* Не-TypeError підміняти не можна: скасований запит і наш власний
   таймаут — не «функція не задеплоєна», і здогадка тут гірша за
   мовчання. */
const own = await page.evaluate(async () => {
  const ac = new AbortController();
  const p = fetch('https://x.supabase.co/functions/v1/fb-limit',
    { method: 'POST', signal: ac.signal });
  ac.abort();
  try { await p; return 'ok'; } catch (e) { return String(e.name || e); }
});
ok('скасований запит не видають за незадеплоєну функцію',
  !/deploy/.test(own), { own });

/* ─────────── стара задеплоєна версія ───────────

   Перевірка звʼязку з телеграмом шле {test:true} і жодного кабінета.
   Відповідь «account_id is required» означає рівно одне: у Supabase
   працює збірка, старша за цю сторінку. Пропустити її як є —
   відправити людину шукати кабінет, якого вона не вказувала. */
const stale = await page.evaluate(async () => {
  const keep = window.fetch;
  window.fetch = async () => ({ ok: false, status: 400,
    json: async () => ({ error: 'account_id is required' }) });
  sb.auth.getSession = async () => ({ data: { session: { access_token: 'jwt' } } });
  await tgTest();
  window.fetch = keep;
  return document.getElementById('tg-test-status').textContent;
});
ok('стару збірку функції названо саме нею', /older than this page/.test(stale), stale);
ok('і сказано, чим це лікується', /deploy fb-sync/.test(stale), stale);
ok('про кабінет не згадано жодним словом', !/account_id/.test(stale), stale);

await done(browser, srv, errs);
