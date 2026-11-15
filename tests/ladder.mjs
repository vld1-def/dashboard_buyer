/* ═══════════ ДРАБИНКА ЛІМІТІВ ═══════════

   Кабінет дістає ліміт сходинками: відкрутив сходинку з ціною ліда чи
   інсталу не вищою за задану — дістає наступну; ні — лишається стояти.
   Умова — «ціна результату не вища за X», сходинки — однаковий крок.

   Рішення й увесь прохід дістаємо з fb-limit і проганяємо з підробними
   базою, Facebook і Telegram: справжній ліміт заради тесту чіпати не
   можна. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 700) : '')); } };

const FN = fs.readFileSync('supabase/functions/fb-limit/index.ts', 'utf8').replace(/\r\n/g, '\n');
const SQL = fs.readFileSync('FB_LIMIT_LADDER.sql', 'utf8');
const CB = fs.readFileSync('build/cabinets.js', 'utf8');
const CSS = fs.readFileSync('build/design.css', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

const a = FN.indexOf('const LAD_BATCH = 20;');
ok('блок драбинки є у функції', a > 0);
const numSrc = (FN.match(/function num\(v: unknown\)[\s\S]*?\n\}\n/) || [''])[0];
const js = stripTypeScriptTypes('const MINOR = 100;\nconst ACC_FIELDS = "f";\n' + numSrc + FN.slice(a));

/* ── саме рішення ── */
const D = new Function(js + '\nreturn { ladDecide, ladResults, LAD_GRACE_MS };')();
const L = (o) => Object.assign({ step_major: 10, steps_total: 5, steps_done: 1, max_cost: 4, base_results: 100, hit_at: null }, o);
const NOW = Date.parse('2026-11-13T12:00:00Z');
const ago = min => new Date(NOW - min * 60000).toISOString();

ok('ще не починали — видаємо першу сходинку', D.ladDecide(L({ steps_done: 0 }), NOW, 21500, 0, 100).act === 'next');
ok('ліміт ще крутиться — чекаємо', D.ladDecide(L(), NOW, 600, 1000, 103).act === 'wait');
const good = D.ladDecide(L(), NOW, 980, 1000, 103);
ok('відкручено, 3 результати за $9.80 → $3.27 ≤ $4 — наступна', good.act === 'next' && Math.abs(good.cost - 3.2667) < 0.01, good);
ok('рівно на межі ціни — теж наступна', D.ladDecide(L({ max_cost: 4.9 }), NOW, 980, 1000, 102).act === 'next');
const bad1 = D.ladDecide(L(), NOW, 990, 1000, 102);
ok('ціна вища за межу: спершу фіксуємо момент і чекаємо', bad1.act === 'hold', bad1);
ok('у межах пів години — ще чекаємо результатів', D.ladDecide(L({ hit_at: ago(10) }), NOW, 990, 1000, 102).act === 'wait');
const late = D.ladDecide(L({ hit_at: ago(10) }), NOW, 990, 1000, 103);
ok('результати доїхали за цей час — наступна', late.act === 'next', late);
const stop = D.ladDecide(L({ hit_at: ago(31) }), NOW, 990, 1000, 102);
ok('пів години минуло, ціна $4.95 > $4 — стоп', stop.act === 'stop' && /above 4/.test(stop.why), stop);
const zero = D.ladDecide(L({ hit_at: ago(31) }), NOW, 990, 1000, 100);
ok('нуль результатів — стоп із причиною', zero.act === 'stop' && /no leads or installs/.test(zero.why), zero);
ok('остання сходинка відкручена — кінець, а не ще одна', D.ladDecide(L({ steps_done: 5 }), NOW, 990, 1000, 110).act === 'done');
const hand = D.ladDecide(L(), NOW, 300, 5000, 103);
ok('ліміт змінили руками — драбинка знімається', hand.act === 'cancel' && /changed by hand/.test(hand.why), hand);
ok('Facebook не віддав ліміт — нічого не робимо', D.ladDecide(L(), NOW, null, null, 103).act === 'wait');
const blind = D.ladDecide(L({ hit_at: ago(31) }), NOW, 990, 1000, null);
ok('Facebook не віддав результатів — стоп, а не сходинка наосліп', blind.act === 'stop' && /did not return results/.test(blind.why), blind);
ok('старт без відомих результатів теж не дає сходинку наосліп',
  D.ladDecide(L({ base_results: null, hit_at: ago(31) }), NOW, 990, 1000, 120).act === 'stop');

ok('ліди з кількох імен не подвоюються, інстали додаються',
  D.ladResults([{ action_type: 'lead', value: '3' }, { action_type: 'offsite_conversion.fb_pixel_lead', value: '3' },
    { action_type: 'mobile_app_install', value: '5' }, { action_type: 'link_click', value: '90' }]) === 8);

/* ── увесь прохід ── */
function world({ ladder, acct, insights, capFlowOk = true }) {
  const log = { patches: [], tgs: [], capCalls: [] };
  const state = { row: Object.assign({}, ladder) };
  const fetchFake = async (url, opt = {}) => {
    const u = String(url), json = v => ({ ok: true, status: 200, json: async () => v, text: async () => JSON.stringify(v) });
    if (u.includes('/rest/v1/fb_limit_ladder')) {
      if (opt.method === 'PATCH') {
        const patch = JSON.parse(opt.body);
        log.patches.push(patch);
        Object.assign(state.row, patch);
        return json([state.row]);
      }
      return json(state.row.status === 'active' ? [state.row] : []);
    }
    if (u.includes('/rest/v1/fb_accounts')) return json([{ account_id: '111', token_id: 1, team_name: 'T' }]);
    if (u.includes('/rest/v1/fb_tokens')) return json([{ token: 'tok', scopes: ['ads_management'] }]);
    if (u.includes('/rest/v1/tg_links')) return json([{ chat_id: '777' }]);
    if (u.includes('api.telegram.org')) { log.tgs.push(JSON.parse(opt.body).text); return json({ ok: true }); }
    throw new Error('unexpected fetch ' + u);
  };
  const graph = async (path) => /insights/.test(path)
    ? (insights === 'fail' ? (() => { throw new Error('insights down'); })() : { data: [{ actions: insights }] })
    : { account_id: '111', currency: 'USD', spend_cap: String(acct.cap), amount_spent: String(acct.spent) };
  const rest = async (_b, _h, q) => (await (await fetchFake('https://db/rest/v1/' + q)).json());
  const tgTell = async (_b, _h, _o, text) => { log.tgs.push(text); };
  const capFlow = async (...args) => {
    log.capCalls.push(args);
    return { ok: capFlowOk, status: capFlowOk ? 200 : 409,
             json: async () => capFlowOk ? { ok: true, cap_after: 1000 } : { error: 'Facebook said no' } };
  };
  const run = new Function('fetch', 'graph', 'rest', 'tgTell', 'capFlow', js + '\nreturn runLadders;')(fetchFake, graph, rest, tgTell, capFlow);
  return { run: () => run('https://db', {}), log, state };
}
const ROW = { id: 7, created_by: 'u1', account_id: '111', step_major: 10, steps_total: 3, steps_done: 0,
  max_cost: 4, base_results: null, hit_at: null, last_check_at: null, status: 'active' };
const A = n => [{ action_type: 'lead', value: String(n) }];

const w1 = world({ ladder: ROW, acct: { cap: 0, spent: 21500 }, insights: A(100) });
await w1.run();
ok('старт: ліміт 10 від нуля, зі скиданням лічильника', w1.log.capCalls.length === 1
  && w1.log.capCalls[0][3] === 10 && w1.log.capCalls[0][4] === true && w1.log.capCalls[0][5] === true, w1.log.capCalls);
ok('у рядку — перша сходинка і точка відліку результатів', w1.state.row.steps_done === 1 && w1.state.row.base_results === 100
  && w1.state.row.status === 'active', w1.state.row);
ok('про сходинку сказано в Telegram', w1.log.tgs.some(t => /ladder step 1\/3: \$10/.test(t)), w1.log.tgs);

const w2 = world({ ladder: { ...ROW, steps_done: 1, base_results: 100 }, acct: { cap: 1000, spent: 990 }, insights: A(104) });
await w2.run();
ok('відкручено дешево — друга сходинка', w2.log.capCalls.length === 1 && w2.state.row.steps_done === 2
  && w2.state.row.base_results === 104 && /previous step cost \$2\.48/.test(w2.log.tgs.join('|')), w2.state.row);

const w3 = world({ ladder: { ...ROW, steps_done: 1, base_results: 100, hit_at: ago(40) }, acct: { cap: 1000, spent: 990 }, insights: A(101) });
const realNow = Date.now; Date.now = () => NOW;
await w3.run();
Date.now = realNow;
ok('дорого і час вийшов — стоп, ліміт не чіпаємо', w3.log.capCalls.length === 0 && w3.state.row.status === 'stopped'
  && /stopped at step 1\/3/.test(w3.log.tgs.join('|')), w3.state.row);

const w4 = world({ ladder: { ...ROW, steps_done: 3, base_results: 100 }, acct: { cap: 1000, spent: 1000 }, insights: A(110) });
await w4.run();
ok('остання сходинка відкручена — драбинка завершена', w4.state.row.status === 'done' && w4.log.capCalls.length === 0);

const w5 = world({ ladder: { ...ROW, steps_done: 1, base_results: 100 }, acct: { cap: 5000, spent: 100 }, insights: A(100) });
await w5.run();
ok('ліміт змінили руками — знята, ліміт не чіпаємо', w5.state.row.status === 'cancelled' && w5.log.capCalls.length === 0
  && /changed by hand/.test(w5.log.tgs.join('|')));

const w6 = world({ ladder: ROW, acct: { cap: 0, spent: 21500 }, insights: A(100), capFlowOk: false });
await w6.run();
ok('Facebook відмовив — драбинка failed і причина в Telegram', w6.state.row.status === 'failed'
  && /FAILED at step 1\/3/.test(w6.log.tgs.join('|')) && /Facebook said no/.test(w6.log.tgs.join('|')), w6.state.row);

const w7 = world({ ladder: { ...ROW, steps_done: 1, base_results: 100 }, acct: { cap: 1000, spent: 400 }, insights: A(101) });
await w7.run();
ok('ще крутиться — лише позначка перевірки, без дій', w7.log.capCalls.length === 0 && w7.state.row.status === 'active'
  && w7.log.patches.length === 1 && 'last_check_at' in w7.log.patches[0] && w7.log.tgs.length === 0, w7.log.patches);

/* ── де це живе ── */
ok('розклад запускає і плани, і драбинки', /ladders = await runLadders\(base, cronHdr\);/.test(FN));
ok('сходинка — той самий capFlow зі скиданням', /capFlow\(act, token, scopes, Number\(l\.step_major\), true, true\)/.test(FN));
ok('версія функції піднята', /const FN_VERSION = '2026-11-13\.1';/.test(FN));
ok('таблиця: одна жива драбинка на кабінет', /create unique index if not exists fb_limit_ladder_one_active[\s\S]*?where status = 'active'/.test(SQL));
ok('таблиця: сходинок не більше восьми', /steps_total between 1 and 8/.test(SQL));
ok('сторінка не може покласти драбинку «посеред ходу»', /with check \(created_by = auth\.uid\(\) and status = 'active' and steps_done = 0\)/.test(SQL));
ok('розклад стукає й тоді, коли є жива драбинка', /or exists \(select 1 from public\.fb_limit_ladder where status = 'active'\)/.test(SQL));

/* ── сторінка ── */
ok('кнопка Ladder поруч з Edit і Schedule', /onclick="cabLadderAdd\('\$\{enc\}'\)"/.test(CB));
ok('стан драбинки видно під лімітом, із хрестиком', /Ladder \$\{Number\(lad\.steps_done\)\}\/\$\{Number\(lad\.steps_total\)\}/.test(CB)
  && /onclick="cabLadderDrop\(/.test(CB));
ok('перед стартом показано суму всього й умову', /up to ' \+ m\(step \* steps\) \+ ' in total/.test(CB)
  && /Next step only if a lead or install cost/.test(CB));
ok('друга драбинка на той самий кабінет не кладеться', /already has a ladder/.test(CB));
ok('без таблиці кнопка каже, що виконати', /run FB_LIMIT_LADDER\.sql/.test(CB));
ok('картка ширша, а ліміт на весь ряд', /#cab-detail \{ flex: 0 0 384px; width: 384px; \}/.test(CSS)
  && /\.cab-fb \.grid > \*:has\(\.cab-lim-acts\) \{ grid-column: 1 \/ -1; \}/.test(CSS));
ok('групування по картці', /cabGroup === 'card'/.test(CB) && /<option value="card">Group: card<\/option>/.test(OUT));
ok('і це доїхало в зібраний index.html', /cabLadderAdd = async function/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
