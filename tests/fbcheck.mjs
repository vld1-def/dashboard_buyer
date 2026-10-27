/* ═══════════ ЧИ ЖИВИЙ ТОКЕН ФЕЙСБУКА ═══════════

   Стан токена писав лише Sync now: щоб дізнатись, що токен мертвий,
   треба було синхронізувати весь парк кабінетів. А прогін має дедлайн
   і ламається на ліміті Facebook, тож хвіст списку лишався з тим
   станом, який йому виставили тижні тому — у списку стояли зелені
   кружечки на кабінетах, яких давно немає.

   Стенд тримає:
     • кнопка є і в рядку токена, і над списком;
     • у запит іде check:true, а token_id — лише коли питають про один;
     • підсумок називає ЗЛАМАНІ токени, а не кількість перевірених;
     • «не дійшли до решти» не мовчить;
     • стара задеплоєна функція цього режиму не знає й робить повний
       прогін — про це сказано прямо, а не підсунуто як відповідь;
     • незадеплоєна функція називає команду;
     • у рядку видно, КОЛИ його перевіряли: зелений кружечок тижневої
       давності не відрізнити від свіжого, і це й була вся біда. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8145;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, {
  init: () => {
    const mk = window.supabase.createClient;
    window.supabase.createClient = (...a) => {
      const c = mk(...a);
      c.auth.getSession = async () => ({ data: { session: { access_token: 'jwt', user: { id: 'u1' } } } });
      return c;
    };
  }
});

const DAY = 86400000;
const setup = reply => page.evaluate(r => {
  window.__sent = [];
  fbRows = [];
  // fbLoad ходить у базу — підміняємо малюванням того, що віддала перевірка
  window.fbLoad = async () => { fbPaint(); };
  window.fetch = async (url, opt) => {
    window.__sent.push({ url: String(url), body: JSON.parse(opt.body || '{}') });
    return { status: r.status || 200, ok: (r.status || 200) < 400,
             json: async () => r.body };
  };
}, reply);

const paintRows = rows => page.evaluate(rows => {
  fbRows = rows;
  fbPaint();
  const box = document.getElementById('fb-list');
  return { html: box.innerHTML,
           rowBtns: [...box.querySelectorAll('.fb-chk')].map(b => b.getAttribute('onclick')) };
}, rows);

const ROW = (id, label, extra) => Object.assign(
  { id, label, status: 'ok', accounts: [{ id: 'act_1' }], expires_at: null,
    status_note: '', checked_at: new Date().toISOString() }, extra);

/* ─────────── кнопки на місці ─────────── */
const r1 = await paintRows([ROW(1, 'Oleh BM'), ROW(2, 'Ivan BM')]);
ok('у кожному рядку є своя кнопка перевірки',
  JSON.stringify(r1.rowBtns) === JSON.stringify(['fbCheck(1)', 'fbCheck(2)']), r1.rowBtns);
ok('над списком є кнопка на всі токени', await page.evaluate(() =>
  !!document.querySelector('.set-addrow .fb-chk[onclick="fbCheck(0)"]')));

/* ─────────── що саме їде у функцію ─────────── */
await setup({ body: { check: true, fn: 'x', tokens: [{ id: 1, label: 'Oleh BM', status: 'ok' }] } });
await page.evaluate(() => fbCheck(1));
const one = await page.evaluate(() => window.__sent[0]);
ok('питання про один токен несе його id',
  /functions\/v1\/fb-sync$/.test(one.url) && one.body.check === true && one.body.token_id === 1, one);

await setup({ body: { check: true, fn: 'x', tokens: [{ id: 1, label: 'A', status: 'ok' }] } });
await page.evaluate(() => fbCheck(0));
const all = await page.evaluate(() => window.__sent[0]);
ok('питання про всі токени id не несе',
  all.body.check === true && !('token_id' in all.body), all.body);

/* ─────────── підсумок говорить про зламане ─────────── */
const say = () => page.evaluate(() => document.getElementById('fb-check-status').textContent.trim());

await setup({ body: { check: true, fn: 'x', tokens: [
  { id: 1, label: 'Oleh BM', status: 'ok', note: 'Sees 4 ad account(s)' },
  { id: 2, label: 'Ivan BM', status: 'expired', note: 'Expired' },
  { id: 3, label: 'Dead BM', status: 'no-accounts', note: 'no ad account is visible' }
] } });
await page.evaluate(() => fbCheck(0));
const sum = await say();
ok('підсумок називає скільком зламано',
  /2 of 3 not working/.test(sum), sum);
ok('і називає їх іменами й станом',
  /Ivan BM — expired/.test(sum) && /Dead BM — no-accounts/.test(sum), sum);
ok('живий токен у підсумок не лізе', !/Oleh BM/.test(sum), sum);

await setup({ body: { check: true, fn: 'x', tokens: [{ id: 1, label: 'A', status: 'ok' }] } });
await page.evaluate(() => fbCheck(0));
ok('усі живі — так і сказано', /All 1 token\(s\) work/.test(await say()), await say());

await setup({ body: { check: true, fn: 'x', not_reached: 7,
  tokens: [{ id: 1, label: 'A', status: 'ok' }] } });
await page.evaluate(() => fbCheck(0));
ok('до решти не дійшли — про це сказано, і сказано що робити',
  /7 not reached yet/.test(await say()) && /press Check again/.test(await say()), await say());

/* ─────────── стара функція ─────────── */
await setup({ body: { fn: '2026-01-01', tokens: 3, accounts: 40, changed: 2 } });
await page.evaluate(() => fbCheck(0));
const old = await say();
ok('стара функція не підсовує підсумок синку як відповідь',
  /does not know the check mode/.test(old) && /ran a full sync instead/.test(old), old);
ok('і називає команду розгортання', /supabase functions deploy fb-sync/.test(old), old);

/* ─────────── немає функції ─────────── */
await setup({ status: 404, body: {} });
await page.evaluate(() => fbCheck(0));
ok('незадеплоєна функція називає команду, а не «HTTP 404»',
  /deploy it first/.test(await say()) && !/404/.test(await say()), await say());

await setup({ status: 500, body: { error: 'SERVICE_ROLE_KEY is not set' } });
await page.evaluate(() => fbCheck(0));
ok('відмову функції переказуємо дослівно',
  /SERVICE_ROLE_KEY is not set/.test(await say()), await say());

/* ─────────── коли перевіряли ─────────── */
const ago = await paintRows([
  ROW(1, 'Fresh', { checked_at: new Date(Date.now() - 2 * 3600000).toISOString() }),
  ROW(2, 'Stale', { checked_at: new Date(Date.now() - 9 * DAY).toISOString() }),
  ROW(3, 'Never', { checked_at: null })
]);
ok('свіжу перевірку показуємо годинами', /checked 2h ago/.test(ago.html), ago.html.slice(0, 500));
ok('тиждень без перевірки виділений',
  /checked <b style="color:var\(--warn\)">9d ago<\/b>/.test(ago.html), ago.html);
ok('жодного разу не перевіряли — так і написано',
  /<b style="color:var\(--warn\)">never checked<\/b>/.test(ago.html), ago.html);

/* ─────────── одна перевірка за раз ─────────── */
ok('друге натискання під час перевірки нічого не шле', await page.evaluate(async () => {
  window.__sent = [];
  let release;
  window.fetch = () => new Promise(r => { release = () => r({ status: 200, ok: true,
    json: async () => ({ check: true, tokens: [] }) }); });
  const p = fbCheck(0);
  const second = await fbCheck(0);
  const sentWhileBusy = window.__sent.length;
  release(); await p;
  return second === null && sentWhileBusy === 0;
}));

await done(browser, srv, errs);
