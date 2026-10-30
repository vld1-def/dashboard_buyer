/* ═══════════ ПРОКСІ ВПИСУЄТЬСЯ РАЗОМ ІЗ ТОКЕНОМ ═══════════

   Доти проксі додавали окремим кроком — уже після того, як токен
   збережений. Між цими двома кроками токен ходив у Facebook зі своєї
   адреси, і саме цей проміжок і треба було прибрати.

   Що тут доводиться:
     1. поле стоїть у тій самій формі, що й токен, і воно
        НЕОБОВʼЯЗКОВЕ: порожнє — це відповідь «без проксі», а не
        пропущений крок, і збереження має пройти;
     2. рядок, який не читається як проксі, зупиняє ДО звернення у
        Facebook — інакше токен збережеться, проксі ні, і вийде рівно
        той стан, якого ми позбуваємось;
     3. у рядок бази лягає і сам проксі, і розібраний host, а
        перевірка (proxy_ip, note) лишається порожньою: вдавати
        перевірене до натискання Check proxy не можна;
     4. після збереження поле чиститься — у ньому логін і пароль. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8167;
const { ok, done } = checks();
const srv = await serve(PORT);

/* ДВА РІЗНІ МОМЕНТИ, І ПЛУТАТИ ЇХ НЕ МОЖНА.

   Клієнт бази лежить у `const sb` — властивості window це не торкається
   й переприсвоїти його не можна зовсім. Тому його підміняють ДО
   завантаження, через supabase.createClient, як у решті стендів.

   А `fbInspect` оголошена як function у тому ж скрипті, і window.alert
   перехоплює toast.js — обидва перетруть усе, покладене до
   завантаження. Їх ставимо ПІСЛЯ. */
const { browser, page, errs } = await open(PORT, { init: () => {
  window.__tk = { rows: [], alerts: [] };
  const real = window.supabase.createClient;
  window.supabase.createClient = (...a) => {
    const c = real(...a);
    c.from = () => ({
      insert: rows => { window.__tk.rows.push(rows[0]);
        return { select: async () => ({ data: [{ id: 1 }], error: null }) }; },
      /* Ланцюжок читання в цьому файлі довший за insert і в різних
         місцях різний, тож віддаємо щось, що відповідає на будь-який
         порядок викликів: стенд про збереження, а не про читання. */
      select: function q() { const r = {}; ['eq', 'order', 'limit', 'in', 'is']
        .forEach(m => r[m] = () => r);
        r.then = (res) => res({ data: [], error: null });
        return r; }
    });
    c.auth.getUser = async () => ({ data: { user: { id: 'u1' } } });
    return c;
  };
} });

await page.evaluate(() => {
  window.alert = m => window.__tk.alerts.push(String(m));
  window.ask = async () => true;                    // «Save this token?» — так
  window.toast = () => {};
  currentTeam = 'team';
  fbInspect = async () => ({
    scopes: ['ads_read', 'ads_management'], expires_at: null,
    accounts: ['act_1'], app_id: '1', bm: { id: '9', name: 'BM' },
    status: 'ok', note: ''
  });
});


const fill = (tok, lab, px) => page.evaluate(async ([t, l, p]) => {
  document.getElementById('fb-token-input').value = t;
  document.getElementById('fb-label-input').value = l;
  document.getElementById('fb-proxy-input').value = p;
  window.__tk.rows = []; window.__tk.alerts = [];
  await fbAdd();
  return { rows: window.__tk.rows, alerts: window.__tk.alerts,
           left: document.getElementById('fb-proxy-input').value };
}, [tok, lab, px]);

/* ── 1. поле там, де токен ── */
const where = await page.evaluate(() => {
  const px = document.getElementById('fb-proxy-input');
  const tk = document.getElementById('fb-token-input');
  if (!px || !tk) return { has: false };
  return { has: true,
    /* Та сама картка налаштувань, що й токен: якщо поле поїде в інший
       блок, воно знову стане «окремим кроком», тільки ближчим. */
    sameGroup: px.closest('.set-group') === tk.closest('.set-group'),
    optional: !px.required && /optional/i.test(px.placeholder) };
});
ok('поле проксі стоїть у формі токена', where.has && where.sameGroup, where);
ok('і підписане як необовʼязкове', where.optional, where);

/* ── 2. без проксі зберігається ── */
const bare = await fill('TOKEN', 'Oleh BM', '');
ok('без проксі токен зберігається', bare.rows.length === 1, bare.alerts);
ok('порожнє поле лягає як «немає», а не як порожній рядок',
  bare.rows[0] && bare.rows[0].proxy === null && bare.rows[0].proxy_host === null, bare.rows[0]);

/* ── 3. разом із проксі ── */
const withPx = await fill('TOKEN', 'Oleh BM', '1.2.3.4:8000:user:pass');
ok('проксі лягає в той самий рядок, що й токен',
  withPx.rows.length === 1 && withPx.rows[0].proxy === '1.2.3.4:8000:user:pass', withPx.rows[0]);
ok('host розібраний — інакше в списку не буде що показати',
  withPx.rows[0] && withPx.rows[0].proxy_host === '1.2.3.4:8000', withPx.rows[0]);
/* Перевірка проксі — окрема дія. Поки її не зробили, у рядку не має
   бути нічого, що виглядає як її результат. */
ok('перевіреним проксі не вдає', withPx.rows[0]
  && !withPx.rows[0].proxy_ip && !withPx.rows[0].proxy_note
  && !withPx.rows[0].proxy_checked_at, withPx.rows[0]);
ok('поле чиститься — у ньому логін і пароль', withPx.left === '', withPx);

/* ── 4. сміття зупиняє до збереження ── */
const bad = await fill('TOKEN', 'Oleh BM', 'не проксі зовсім');
ok('нечитабельний проксі не зберігає нічого', bad.rows.length === 0, bad);
ok('і каже, чого саме чекали', bad.alerts.some(a => /host:port/.test(a)), bad.alerts);
ok('і що порожнє поле — теж відповідь',
  bad.alerts.some(a => /empty/i.test(a)), bad.alerts);

await done(browser, srv, errs);
