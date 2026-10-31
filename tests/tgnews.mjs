/* ═══════════ «ЩО НОВОГО» — РОЗСИЛКА В ТЕЛЕГРАМ ═══════════

   Надіслане не відкликати, і через це стенд тримає не вигляд блоку, а
   рівно ті місця, де помилка коштує дорого:

     1. «всім» спершу РАХУЄ отримувачів і ставить число в питання:
        «надіслати 14 людям?» і «надіслати всім?» — різні питання, і
        друге нічого не важить;
     2. відмова не надсилає нічого — жодного запиту після неї;
     3. «тільки собі» нічого не питає (це й є безпечний крок) і йде з
        прапорцем test, а не тим самим викликом;
     4. порожній текст не йде нікуди й не питає;
     5. у тілі запиту немає списку адресатів — кому слати, вирішує
        функція, і підсунути чужий chat_id нема куди;
     6. заблокований бот показується окремим числом, бо інакше «5 з
        20» читається як поломка;
     7. незадеплоєна функція називає крок розгортання. */
import { serve, open, checks } from './_harness.mjs';
import fs from 'node:fs';

const PORT = 8169;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

await page.evaluate(() => {
  /* fn у відповіді — підпис функції. Без нього дашборд відповіді не
     вірить, і правильно робить: саме так виглядає чужа функція під
     тією самою адресою. */
  window.__tg = { calls: [], answer: true, status: 200, fn: '2026-10-30.1',
                  body: { ok: true, total: 14, sent: 13, blocked: 1, failed: 0 },
                  dryTotal: 14 };
  window.toast = () => {};
  /* Сесії в стенді немає, а без неї tgNewsCall чесно зупиняється на
     «Сесія скінчилась» — і жодного запиту не буде. sb оголошений як
     const, переприсвоїти його не можна, але властивості об'єкта
     підміняються нормально. */
  sb.auth.getSession = async () => ({ data: { session: { access_token: 'jwt' } } });
  window.ask = async o => { window.__tg.asked = o; return window.__tg.answer; };
  const realFetch = window.fetch;
  window.fetch = async (url, opt) => {
    const u = String(url);
    if (!/tg-news/.test(u)) return realFetch(url, opt);
    const body = JSON.parse(opt.body);
    window.__tg.calls.push(body);
    const sign = o => window.__tg.fn ? Object.assign({ fn: window.__tg.fn }, o) : o;
    if (window.__tg.status >= 400)
      return { ok: false, status: window.__tg.status,
               json: async () => sign({ error: window.__tg.err || 'no' }) };
    return { ok: true, status: 200, json: async () => sign(
      body.dry ? { ok: true, dry: true, total: window.__tg.dryTotal } : window.__tg.body) };
  };
});

const run = (text, onlyMe, setup) => page.evaluate(async ([t, me, s]) => {
  Object.assign(window.__tg, s || {});
  window.__tg.calls = []; window.__tg.asked = null;
  document.getElementById('tg-news-text').value = t;
  await tgNews(me);
  return { calls: window.__tg.calls, asked: window.__tg.asked,
           status: document.getElementById('tg-news-status').textContent };
}, [text, onlyMe, setup]);

/* ── блок є і стоїть у телеграмі ── */
const has = await page.evaluate(() => {
  const t = document.getElementById('tg-news-text');
  return { there: !!t,
           inTg: !!(t && t.closest('#isub-pane-tg')),
           btns: [...document.querySelectorAll('[onclick^="tgNews("]')].map(b => b.textContent.trim()) };
});
ok('поле новини стоїть у вкладці Telegram', has.there && has.inTg, has);
ok('кнопок дві: собі й усім', has.btns.length === 2, has.btns);
/* «Тільки собі» першою: це той крок, яким дивляться, перш ніж
   побачать усі. */
ok('«тільки собі» стоїть першою', /me only/i.test(has.btns[0] || ''), has.btns);

/* ── 1-2. усім: рахунок, питання з числом, відмова ── */
const no = await run('Додано в СРМ: пости', false, { answer: false });
ok('перед розсилкою рахуються отримувачі',
  no.calls.length === 1 && no.calls[0].dry === true, no.calls);
ok('у питанні стоїть ЧИСЛО людей, а не «всім»',
  /14 людям/.test((no.asked || {}).title || ''), no.asked);
ok('у питанні видно сам текст', /Додано в СРМ/.test((no.asked || {}).body || ''), no.asked);
ok('сказано, що відкликати не можна',
  /не можна/.test((no.asked || {}).body || ''), no.asked);
ok('відмова не надсилає нічого', no.calls.length === 1, no.calls);

/* ── 3. усім: згода ── */
const yes = await run('Додано в СРМ: пости', false, { answer: true });
ok('після згоди йде сама розсилка', yes.calls.length === 2, yes.calls);
ok('у розсилці немає списку адресатів',
  !('chat_id' in yes.calls[1]) && !('to' in yes.calls[1]), yes.calls[1]);
ok('і вона не позначена як тест', yes.calls[1].test === false, yes.calls[1]);
/* ── 6. заблокованих показуємо окремо ── */
ok('видно, скільки дійшло з кількох', /13 з 14/.test(yes.status), yes.status);
ok('заблокований бот — окреме число, а не «не дійшло»',
  /1 заблокували/.test(yes.status), yes.status);

/* ── 3. тільки собі ── */
const mine = await run('Додано в СРМ: пости', true, { answer: false });
ok('«тільки собі» нічого не питає', mine.asked === null, mine);
ok('і йде з прапорцем test',
  mine.calls.length === 1 && mine.calls[0].test === true, mine.calls);

/* ── 4. порожній текст ── */
const empty = await run('   ', false, {});
ok('порожній текст не йде нікуди', empty.calls.length === 0, empty.calls);
ok('і не питає, а каже, чого бракує', empty.asked === null && /текст/i.test(empty.status), empty);

/* ── 7. незадеплоєна функція ── */
const gone = await run('Додано в СРМ: пости', true, { fn: '', status: 404 });
ok('незадеплоєна функція названа кроком розгортання',
  /deploy tg-news/.test(gone.status), gone.status);

/* ── відповідь не від tg-news ── */

/* «account_id is required» у телеграмі може прийти лише від ЧУЖОЇ
   функції: tg-news такого не каже зроду. Без цієї перевірки людина
   йшла б шукати кабінет, якого не вказувала. */
const alien = await run('Додано в СРМ: пости', true,
  { fn: '', status: 400, err: 'account_id is required' });
ok('чужу відповідь названо чужою', /не від tg-news/.test(alien.status), alien);
ok('і показано, що саме відповіло', /account_id is required/.test(alien.status), alien);
ok('і сказано, чим це лікується', /deploy tg-news/.test(alien.status), alien);

/* 404 лишається окремим випадком: функції немає зовсім, і це інша
   фраза, ніж «під адресою щось інше». */
const gone404 = await run('Додано в СРМ: пости', true, { fn: '', status: 404 });
ok('404 названо саме незадеплоєною функцією',
  /ще не задеплоєна/.test(gone404.status), gone404);

/* ── межі самої функції ── */
const FN = fs.readFileSync('supabase/functions/tg-news/index.ts', 'utf8');
ok('адресатів функція бере сама, а не з тіла запиту',
  /tg_links\?select=user_id,chat_id/.test(FN) && !/body\?\.chat/.test(FN));
ok('test звужує вибірку до того, хто покликав',
  /test \? '&user_id=eq\.' \+ encodeURIComponent\(me\)/.test(FN));
ok('текст ріжеться до межі Telegram ДО відправки', /slice\(0, TG_MAX\)/.test(FN));
ok('403 рахується окремо від збою', /status === 403/.test(FN) && /blocked\+\+/.test(FN));
ok('токен бота у відповідь не потрапляє', !/bot[,:]/.test(FN.split('return reply').slice(1).join('')));

await done(browser, srv, errs);
