/* ═══════════ ПОСИЛАННЯ НА АПКУ В PLAY ═══════════

   Апку банять мовчки: вона лежить у списку рівно так само, як живі,
   шаблон під неї вибирають очима, і неймінг забаненої апки спокійно
   їде в кабінет. APP_STATUS.sql дав стан active/ban, але ставили його
   руками — тобто тоді, коли хтось помітив.

   Тепер у воронки є app_id, і щоденний обхід (check-apps) сам ставить
   бан. Стенд тримає те, що з цього живе в браузері:
     • поле НЕОБОВ'ЯЗКОВЕ і з'являється лише для апки;
     • вставити можна і пакет, і цілу адресу Play — ід дістається;
     • не схоже на пакет — поле лишається порожнім, а не заповненим
       сміттям, за яким обхід щодня ходив би в нікуди;
     • той самий розбір в обох місцях: дашборд і Form мусять заводити
       один ід однаково;
     • іконка стоїть У рядку неймінга, тож висота блока не міняється;
     • іконки немає — немає й місця під неї. */
import { serve, open, checks } from './_harness.mjs';
import fs from 'node:fs';

const PORT = 8147;
const { ok, count } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* ─────────── розбір того, що вставили ─────────── */
const ID = await page.evaluate(() => {
  const t = v => apAppId(v);
  return {
    plain: t('com.fortunedra.gontrheb'),
    spaced: t('  com.fortunedra.gontrheb  '),
    url: t('https://play.google.com/store/apps/details?id=com.fortunedra.gontrheb'),
    urlTail: t('https://play.google.com/store/apps/details?id=com.fortunedra.gontrheb&hl=uk&gl=UA'),
    urlFirst: t('https://play.google.com/store/apps/details?hl=uk&id=com.a.b'),
    three: t('com.a.b.c'),
    empty: t(''),
    junk: t('просто текст'),
    oneWord: t('fortunedra'),
    notPkg: t('https://example.com/app'),
    digitStart: t('1com.a.b')
  };
});
ok('пакет береться як є', ID.plain === 'com.fortunedra.gontrheb', ID.plain);
ok('пробіли по краях не заважають', ID.spaced === 'com.fortunedra.gontrheb', ID.spaced);
ok('з адреси Play ід дістається', ID.url === 'com.fortunedra.gontrheb', ID.url);
ok('хвіст адреси не заважає', ID.urlTail === 'com.fortunedra.gontrheb', ID.urlTail);
ok('id не першим параметром — теж', ID.urlFirst === 'com.a.b', ID.urlFirst);
ok('три частини — теж пакет', ID.three === 'com.a.b.c', ID.three);
ok('порожнє лишається порожнім', ID.empty === '', ID.empty);
ok('не схоже на пакет — порожнє, а не сміття',
  ID.junk === '' && ID.oneWord === '' && ID.notPkg === '' && ID.digitStart === '', ID);

/* ─────────── поле в діалозі ─────────── */
const fields = kind => page.evaluate(async isApp => {
  currentTeam = 'T';
  apFunnels = [];
  apItems = [];
  window.__p = apAddFunnel(isApp);
  await new Promise(r => setTimeout(r, 60));
  const w = document.querySelector('.askwrap');
  const keys = [...w.querySelectorAll('[data-k]')].map(e => e.dataset.k);
  const lab = [...w.querySelectorAll('.ask-f-lab')].map(e => e.textContent.trim());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await window.__p;
  return { keys, lab };
}, kind);

const fApp = await fields(true);
ok('для апки поле посилання є, і стоїть після гео',
  JSON.stringify(fApp.keys) === JSON.stringify(['name', 'ktid', 'geo', 'app_id', 'is_app']),
  fApp.keys);
ok('і воно не обов\'язкове — без зірочки',
  fApp.lab.some(l => /Апка в Play/.test(l) && !/\*/.test(l)), fApp.lab);

const fFun = await fields(false);
ok('для звичайної воронки поля немає: Play про неї нічого не знає',
  !fFun.keys.includes('app_id'), fFun.keys);

/* ─────────── таблиця воронок у Form не падає ───────────

   Колонка Play app id кликала esc(), а esc у Form.html живе лише
   ВСЕРЕДИНІ двох інших функцій — звідси його не видно. Уся
   renderFunnelsTable падала на першому ж рядку, і таблиця лишалась із
   попереднього малюнка: половина воронок є, решти немає, і жодного
   слова про те, чому.

   Стенд дашборда цього не ловив і не міг: то інший файл. */
await browser.close();

{
  const { browser: b2, page: p2, errs: e2 } = await open(PORT, {
    path: 'Form.html',
    init: () => {
      const mk = window.supabase.createClient;
      window.supabase.createClient = (...a) => {
        const c = mk(...a);
        c.auth.getSession = async () => ({ data: { session: { user: { id: 'u1' },
          access_token: 'jwt-for-the-stand' } } });
        return c;
      };
      localStorage.setItem('selected_team', 'T');
      window.alert = m => { window.__alert = String(m); };
    }
  });
  const tbl = await p2.evaluate(() => {
    const rows = [
      { id: 1, funnel_name: 'Crazy Wheel [tridentapps]', ktid: 'CW1', geo: 'KG', is_app: true },
      { id: 2, funnel_name: 'Fortune Dragon [satorapps]', ktid: 'FD1', geo: 'TJ', is_app: true },
      { id: 3, funnel_name: 'Mostbet [snatchapps]', ktid: 'MB1', geo: 'UZ', is_app: true },
      { id: 4, funnel_name: 'Без постачальника "лапки"', ktid: 'NP1', geo: 'PL' },
      { id: 5, funnel_name: 'Joker [satorapps]', ktid: 'JK1', geo: 'TJ', is_app: true,
        app_id: 'com.a.b', app_checked_at: '2026-10-28T00:00:00Z', app_note: 'Play: ok' }
    ];
    allFunnels = rows; funTag = '';
    const inp = document.getElementById('funnel-search'); if (inp) inp.value = '';
    let err = '';
    try { renderFunnelsTable(rows); } catch (e) { err = String(e); }
    const body = document.getElementById('funnels-list-body');
    return { err, n: body.querySelectorAll('tr').length,
             html: body.innerHTML,
             recheck: [...body.querySelectorAll('button')]
               .filter(b => b.textContent.trim() === '↻').length };
  });
  ok('таблиця воронок малюється без помилки', tbl.err === '', tbl.err);
  ok('і показує ВСІ воронки, а не половину', tbl.n === 5, tbl.n);
  ok('кнопка перевірки — лише там, де вписане посилання', tbl.recheck === 1, tbl.recheck);
  ok('іконок у таблиці більше немає', !/<img/.test(tbl.html));
  ok('лапки в назві розмітку не ламають',
    /Без постачальника/.test(tbl.html), tbl.html.slice(0, 120));
  /* ─────────── кнопка ↻ і відповідь функції ───────────

     Кнопка писала «задеплой check-apps» тому, хто щойно її задеплоїв.
     Причина була не в деплої: функція обирала вхід через
     Number(funnel_id), і id, який не є числом, давав 0 — запит людини
     тихо падав у вхід розкладу й отримував «bad or missing
     x-cron-key». Сторінка робила з цього єдиний висновок, який уміла.

     Тепер версія задеплоєної функції їде в КОЖНІЙ відповіді, і
     сторінка більше не вгадує: немає fn — деплой старий, є fn —
     деплой свіжий і причина інша. */
  const call = await p2.evaluate(async () => {
    const seen = { bodies: [], msgs: [] };
    const realFetch = window.fetch;
    window.showStatus = m => seen.msgs.push(String(m));
    const answer = payload => async (url, opt) => {
      seen.bodies.push({ url: String(url), body: JSON.parse(opt.body) });
      return { ok: false, status: 401, json: async () => payload };
    };
    const out = {};
    window.fetch = answer({ error: 'bad or missing x-cron-key' });
    await funAppCheck('3f2b9c14-aa01-4d7e-9f10-77c0de5512ab');
    out.old = seen.msgs.pop();
    window.fetch = answer({ fn: '2026-10-29.1', error: 'bad or missing x-cron-key' });
    await funAppCheck('3f2b9c14-aa01-4d7e-9f10-77c0de5512ab');
    out.fresh = seen.msgs.pop();
    window.fetch = answer({ fn: '2026-10-29.1', error: 'воронки не знайдено' });
    await funAppCheck(5);
    out.other = seen.msgs.pop();
    window.fetch = realFetch;
    out.bodies = seen.bodies;
    return out;
  });
  ok('без версії у відповіді — кажемо, що деплой старий',
    /older than this page/.test(call.old || ''), call.old);
  ok('із версією — більше не женемо деплоїти',
    !/older than this page/.test(call.fresh || ''), call.fresh);
  ok('із версією — називаємо саму версію',
    /2026-10-29\.1/.test(call.fresh || ''), call.fresh);
  ok('із версією — називаємо id, який не прийняли',
    /3f2b9c14-aa01-4d7e-9f10-77c0de5512ab/.test(call.fresh || ''), call.fresh);
  ok('будь-яка інша помилка теж несе версію',
    /воронки не знайдено/.test(call.other || '') && /2026-10-29\.1/.test(call.other || ''), call.other);
  ok('id летить у тілі таким, яким його дали, а не числом',
    call.bodies.length === 3
    && call.bodies[0].body.funnel_id === '3f2b9c14-aa01-4d7e-9f10-77c0de5512ab'
    && call.bodies[2].body.funnel_id === 5, call.bodies);
  ok('запит іде саме у check-apps',
    call.bodies.every(b => /\/functions\/v1\/check-apps$/.test(b.url)), call.bodies.map(b => b.url));

  await b2.close();
  if (e2.length) ok('Form.html без помилок', false, e2);
}

/* ─────────── правило живе у самій функції ───────────

   Браузер її не запускає, тож перевіряємо те, від чого залежить
   маршрут: вхід обирається за НАЯВНІСТЮ funnel_id, а не за тим, чи
   він число. Саме Number(...) і відправляв людей деплоїти наново. */
{
  const FN = fs.readFileSync('supabase/functions/check-apps/index.ts', 'utf8');
  ok('вхід людини більше не вимагає, щоб id був числом',
    !/Number\(body\?\.funnel_id/.test(FN));
  ok('id читається як рядок',
    /const one = String\(body\?\.funnel_id \?\? ''\)\.trim\(\)/.test(FN));
  ok('id екранується в обох запитах до funnels_mapping',
    (FN.match(/id=eq\.'\s*\n?\s*\+ encodeURIComponent\(one\)|id=eq\.' \+ encodeURIComponent\(one\)/g) || []).length === 2,
    (FN.match(/id=eq\.[^\n]*/g) || []));
  ok('версія їде в кожній відповіді',
    /JSON\.stringify\(\{ fn: FN_VERSION, \.\.\.body \}\)/.test(FN));
  ok('версію більше не дублюють в окремій відповіді',
    !/reply\(\{ fn: FN_VERSION, one: true/.test(FN));
}

srv.close();
/* Підсумок друкуємо самі: done() із гарнеса закриває браузер і сервер,
   а ми вже закрили обидва — стенд працює з ДВОМА сторінками, бо
   перевіряє і дашборд, і Form.html. */
const c = count();
console.log(`\n${c.pass} ok, ${c.fail} fail`);
process.exit(c.fail ? 1 : 0);
