/* ═══════════ СТЕЛЯ ВИТРАТ — ЗМІНА З ПАНЕЛІ ═══════════

   Доти стелю міняли викликом із консолі. Тепер олівець стоїть у самій
   комірці Limit — і саме тому тут важить не вигляд, а межі:

     1. видно БУЛО і СТАНЕ. Зайвий нуль у цьому полі — це гроші, і
        єдине, що стоїть між друкарською помилкою й витратами, це
        екран, де обидва числа поруч;
     2. підняття червоне, опускання ні: перше дозволяє витрачати
        більше, друге лише гальмує;
     3. стеля на рівні витраченого або нижче не надсилається ЗОВСІМ —
        це зупинка кабінета, і робить її кнопка паузи;
     4. кабінет без стелі питається окремо: поставити вміємо,
        прибрати назад — ні;
     5. у Facebook іде число у валюті, а не в центах, і разом із ним
        allow_new_cap — рівно тоді, коли стелі не було;
     6. на екран лягає те, що ВІДДАВ Facebook, а не те, що просили;
     7. відмова нічого не надсилає. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8172;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

await page.evaluate(() => {
  window.__lim = { calls: [], answers: [], status: 200,
                   /* cap_after віддає Graph, тобто мінорними одиницями:
                      500000 центів = $5000. У базі ж валюта. */
                   body: { ok: true, cap_after: 500000, fixed: false } };
  window.toast = (t, k) => { (window.__lim.toasts = window.__lim.toasts || []).push({ t: String(t), k }); };
  window.toastStep = () => ({ say: () => {}, done: (t, k) => window.toast(t, k) });
  window.ask = async o => { window.__lim.asked = (window.__lim.asked || []).concat([o]);
                            return window.__lim.answers.shift(); };
  sb.auth.getSession = async () => ({ data: { session: { access_token: 'jwt' } } });
  const real = window.fetch;
  window.fetch = async (u, o) => {
    if (!/fb-limit/.test(String(u))) return real(u, o);
    window.__lim.calls.push(JSON.parse(o.body));
    return { ok: window.__lim.status < 400, status: window.__lim.status,
             json: async () => window.__lim.status < 400
               ? window.__lim.body : { error: 'no' } };
  };
});

const run = (fb, answers, extra) => page.evaluate(async ([f, a, e]) => {
  /* Тримаємо посилання на сам кабінет: після вдалої зміни малюється
     таблиця, а вона список перебирає — читати cabAll[0] наосліп після
     цього означає читати те, що лишилось, а не те, що міняли. */
  const c = { id: '123', state: 'running', age: 10, row: { status: 'active' },
              tok: { bm: '', browser: '' }, x: { all: 0, first: '', last: '' },
              fb: Object.assign({ token_id: 7, currency: 'USD', status: 'ACTIVE' }, f) };
  cabAll = [c];
  Object.assign(window.__lim, { calls: [], asked: [], toasts: [], answers: a }, e || {});
  await cabLimitEdit(encodeURIComponent('123'));
  return { calls: window.__lim.calls, asked: window.__lim.asked,
           toasts: window.__lim.toasts, cap: c.fb.spend_cap };
}, [fb, answers, extra]);

/* ── олівець є тільки там, де є чим міняти ── */
const pencil = await page.evaluate(() => {
  /* Картка кабінета малює значно більше за ліміт — і без решти полів
     падає ще до нього. Тому мінімальний, але повний кабінет. */
  const mk = tok => { cabAll = [{ id: '123', state: 'running', age: 10,
                        row: { status: 'active' }, tok: { bm: '', browser: '' },
                        x: { all: 0, first: '', last: '' },
                        fb: { token_id: tok, currency: 'USD', status: 'ACTIVE',
                              spend_cap: 1000, amount_spent: 10 } }];
    cabDetail(cabAll[0]);
    return !!document.querySelector('.cab-lim-ed'); };
  return { withTok: mk(7), without: mk(null) };
});
ok('олівець стоїть у комірці ліміту', pencil.withTok === true, pencil);
ok('без токена міняти нічим — олівця немає', pencil.without === false, pencil);

/* ── 1-2. було і стане, підняття червоне ── */
const up = await run({ spend_cap: 1000, amount_spent: 200 }, ['2000', true]);
ok('перше вікно показує, скільки стоїть зараз',
  /Now \$1,?000/.test((up.asked[0] || {}).body || ''), up.asked[0]);
ok('і скільки вже витрачено проти неї',
  /\$200/.test((up.asked[0] || {}).body || ''), up.asked[0]);
ok('друге вікно показує БУЛО → СТАНЕ',
  /\$1,?000.*→.*\$2,?000/s.test((up.asked[1] || {}).body || ''), up.asked[1]);
ok('підняття позначене небезпечним', (up.asked[1] || {}).danger === true, up.asked[1]);
ok('і сказано, чим воно обертається',
  /free to spend more/.test((up.asked[1] || {}).body || ''), up.asked[1]);

const down = await run({ spend_cap: 1000, amount_spent: 200 }, ['500', true]);
ok('опускання не червоне — воно лише гальмує',
  (down.asked[1] || {}).danger === false, down.asked[1]);

/* ── 5. що саме йде у функцію ── */
ok('у функцію йде число У ВАЛЮТІ, а не в центах',
  up.calls.length === 1 && up.calls[0].set_major === 2000, up.calls);
ok('і номер кабінета рядком', up.calls[0].account_id === '123', up.calls[0]);
ok('allow_new_cap не проситься там, де стеля вже є',
  up.calls[0].allow_new_cap === false, up.calls[0]);

/* ── 6. на екрані те, що віддав Facebook ── */
/* 500000 мінорних = $5000 у базі: межу одиниць видно саме тут. */
ok('стеля береться з відповіді, а не з того, що просили',
  up.cap === 5000, up.cap);
ok('і сказано новим числом', (up.toasts || []).some(t => /\$5,?000/.test(t.t)), up.toasts);

/* Виправлення одиниць функція робить сама — на екрані це згадка, а не
   питання: людина просила стелю, а не калібрування. */
const fixed = await run({ spend_cap: 1000, amount_spent: 200 }, ['2000', true],
  { body: { ok: true, cap_after: 200000, fixed: true } });
ok('виправлення одиниць згадується одним рядком',
  (fixed.toasts || []).some(t => /units corrected/.test(t.t)), fixed.toasts);

/* ── 3. нижче витраченого не надсилається зовсім ── */
const stop = await run({ spend_cap: 1000, amount_spent: 900 }, ['500']);
ok('стеля нижче витраченого не йде у Facebook', stop.calls.length === 0, stop.calls);
ok('і сказано, що це зупинка кабінета',
  (stop.toasts || []).some(t => /stop at once/.test(t.t)), stop.toasts);
ok('і куди йти по зупинку', (stop.toasts || []).some(t => /pause/.test(t.t)), stop.toasts);

/* ── 4. кабінет без стелі ── */
const fresh = await run({ spend_cap: 0, amount_spent: 10 }, ['300', true]);
ok('кабінет без стелі попереджає, що прибрати не вийде',
  /removing it again is not/.test((fresh.asked[1] || {}).body || ''), fresh.asked[1]);
ok('і просить allow_new_cap саме там', fresh.calls[0].allow_new_cap === true, fresh.calls[0]);

/* ── 7. відмова ── */
const no = await run({ spend_cap: 1000, amount_spent: 10 }, ['2000', false]);
ok('відмова не надсилає нічого', no.calls.length === 0, no.calls);
const esc = await run({ spend_cap: 1000, amount_spent: 10 }, [false]);
ok('закрите перше вікно теж нічого не надсилає', esc.calls.length === 0, esc.calls);
const same = await run({ spend_cap: 1000, amount_spent: 10 }, ['1000']);
ok('те саме число не витрачає зміну з десяти добових', same.calls.length === 0, same.calls);

/* ── незадеплоєна функція ── */
const gone = await run({ spend_cap: 1000, amount_spent: 10 }, ['2000', true], { status: 404 });
ok('незадеплоєна функція названа кроком розгортання',
  (gone.toasts || []).some(t => /deploy fb-limit/.test(t.t)), gone.toasts);

await done(browser, srv, errs);
