/* ═══════════ АСИСТЕНТ: ВІЛЬНА РОЗМОВА ═══════════

   «дай повну свободу аі асистенту, щоб я міг будь що запитати і він
   дасть відповідь, бо зараз він туго працює, і зроби історію чату
   типу щоб кожен запит не був окремий а взаємодіяв з попереднім».

   «Туго» воно працювало не випадково. Модель уміла рівно одне:
   перекласти питання в план запиту до таблиці. Усе, що в цю форму не
   влазить — «чому CPA росте», «що робити з гео», «напиши план» —
   упиралось у «модель відповіла не планом», хоч відповідь у неї була.

   Просто дозволити їй говорити не можна: увесь сенс плану в тому, що
   ЧИСЛА РАХУЄ ДАШБОРД по своїх рядках. Модель, якій дозволили
   називати числа, називає їх упевнено й подекуди неправильно, і зовні
   правильне від неправильного не відрізнити.

   Тому вона обирає сама — говорити, рахувати, чи порахувати й
   говорити над порахованим. Стенд тримає рівно цю межу. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8203;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const ROWS = [
  { Geo: 'KG', Spend: '100', Deps: '4' },
  { Geo: 'TJ', Spend: '60',  Deps: '1' },
  { Geo: 'UZ', Spend: '40',  Deps: '2' }
];

await page.evaluate(rows => {
  window.__sent = [];
  window.__reply = null;          // що «відповідає» модель на хід chat
  window.__talk = 'Дорожчає TJ — там один деп на шістдесят доларів.';
  window.shDataset = () => ({
    id: 'sheet', title: 'report.csv',
    cols: [{ name: 'Geo', kind: 'text' }, { name: 'Spend', kind: 'num' },
           { name: 'Deps', kind: 'num' }],
    rows: rows.map(r => ({ ...r })), num: null
  });
  rawData = [];
  window.creativesRawData = [];
  aqCall = async body => {
    window.__sent.push(JSON.parse(JSON.stringify(body)));
    if (body.action === 'talk') {
      return { raw: window.__talk, model: 'claude-haiku-5-5', cost_usd: 0.00002 };
    }
    return { raw: JSON.stringify(window.__reply), model: 'claude-haiku-5-5',
             cost_usd: 0.00012, left_today: 99, problems: [] };
  };
  aqOpen();
}, ROWS);

const askWith = (reply, q) => page.evaluate(async ([r, text]) => {
  window.__reply = r;
  const inp = document.getElementById('aq-q');
  inp.value = text;
  await aqAsk();
  const bots = [...document.querySelectorAll('#aq-thread .aq-msg.is-bot')];
  const out = bots[bots.length - 1];
  return { txt: (out.textContent || '').replace(/\s+/g, ' ').trim(), html: out.innerHTML };
}, [reply, q]);

/* ── 1. ПИТАННЯ НЕ ПРО ТАБЛИЦЮ ДІСТАЄ ВІДПОВІДЬ ── */
const say = await askWith(
  { kind: 'say', text: 'Бо CPA росте, коли аудиторія вигорає.\n\nСпробуй нове крео.' },
  'чому cpa росте?');
ok('вільна відповідь показана словами', /аудиторія вигорає/.test(say.txt), say.txt);
ok('і другий абзац теж', /нове крео/.test(say.txt), say.txt);
ok('жодної таблиці під нею немає', !/aq-tbl/.test(say.html), say.html.slice(0, 200));
/* Доти саме тут і стояло «модель відповіла не планом» — тобто відмова
   на питання, на яке відповідь була. */
ok('і жодного «не планом»', !/не планом/.test(say.txt), say.txt);
ok('підписано, що цифр із таблиці тут немає',
  /без цифр із таблиці/.test(say.txt), say.txt);

/* Текст моделі — чужий текст, і в розмітку він іде лише екранованим. */
const esc = await askWith(
  { kind: 'say', text: '<img src=x onerror=alert(1)> & <b>жирним</b>' }, 'тест');
ok('текст моделі екранується, а не виконується',
  !/<img|<b>/.test(esc.html) && /&lt;img/.test(esc.html), esc.html.slice(0, 200));

/* ── 2. ПИТАННЯ ПРО ТАБЛИЦЮ — ЯК І БУЛО ── */
await page.evaluate(() => { window.aqNew(); window.__sent = []; });
const tbl = await askWith({ kind: 'plan', talk: false, plan: {
  set: 'sheet', group: 'Geo', metric: { op: 'sum', col: 'Spend' },
  sort: 'desc', limit: 10, say: 'спенд по гео' } }, 'спенд по гео');
ok('таблиця малюється', /aq-tbl/.test(tbl.html), tbl.html.slice(0, 120));
ok('і сказано, що рахував дашборд', /рахував дашборд/.test(tbl.txt), tbl.txt);
ok('другого ходу без talk немає',
  (await page.evaluate(() => window.__sent.filter(x => x.action === 'talk').length)) === 0);

/* ── 3. TALK: СЛОВА НАД ПОРАХОВАНИМ ── */
await page.evaluate(() => { window.aqNew(); window.__sent = []; });
const both = await askWith({ kind: 'plan', talk: true, plan: {
  set: 'sheet', group: 'Geo', metric: { op: 'per', num: 'Spend', den: 'Deps' },
  sort: 'desc', limit: 10, say: 'ціна депа по гео' } }, 'чому депи дорогі?');
ok('таблиця на місці', /aq-tbl/.test(both.html), both.html.slice(0, 120));
ok('і слова моделі під нею', /один деп на шістдесят/.test(both.txt), both.txt);
ok('слова відокремлені від чисел', /aq-said/.test(both.html));

const talk = await page.evaluate(() => window.__sent.find(x => x.action === 'talk'));
ok('другий хід справді стався', !!talk, talk);
/* ОСЬ ТУТ дані СВІДОМО їдуть у модель — і більше ніде. Саме тому хід
   окремий: щоб межу було видно, а не щоб вона розчинилась. */
ok('у другий хід поїхало пораховане', talk && /TJ/.test(String(talk.result || '')), talk);
ok('і числа в ньому — ті самі, що на екрані',
  talk && /60/.test(String(talk.result || '')), talk && talk.result);
ok('питання поїхало разом із ним', talk && talk.q === 'чому депи дорогі?', talk);

/* ── 4. ПАМ'ЯТЬ НЕСЕ ПИТАННЯ, А НЕ ВМІСТ СТОВПЦІВ ── */
const hist = (await page.evaluate(() => window.__sent[window.__sent.length - 1])).history || [];
ok('історія не порожня', hist.length >= 2, hist);
ok('питання людини в ній є', hist.some(m => /чому депи дорогі/.test(m.content)), hist);
/* Назви гео — це ВМІСТ стовпця. Поклавши пораховане в пам'ять, ми
   возили б їх у кожному наступному запиті, довіку. */
ok('а вмісту стовпців — немає',
  hist.filter(m => m.role === 'assistant').every(m => !/\bTJ\b|\bKG\b/.test(m.content)),
  hist.filter(m => m.role === 'assistant').map(m => m.content));

/* ── 5. ДРУГИЙ ХІД — НАДБУДОВА, А НЕ УМОВА ── */
await page.evaluate(() => { window.aqNew(); window.__sent = []; });
const broke = await page.evaluate(async () => {
  const real = aqCall;
  aqCall = async body => {
    window.__sent.push(body);
    if (body.action === 'talk') throw new Error('мережа лягла');
    return { raw: JSON.stringify({ kind: 'plan', talk: true, plan: {
      set: 'sheet', group: 'Geo', metric: { op: 'sum', col: 'Spend' },
      sort: 'desc', limit: 10 } }), model: 'm', cost_usd: 0 };
  };
  const inp = document.getElementById('aq-q');
  inp.value = 'чому?';
  await aqAsk();
  aqCall = real;
  const out = [...document.querySelectorAll('#aq-thread .aq-msg.is-bot')].pop();
  return { txt: (out.textContent || '').replace(/\s+/g, ' ').trim(), html: out.innerHTML };
});
/* Таблиця вже порахована й на екрані: втратити її через те, що не
   вийшов коментар, означало б проміняти факт на прикрасу. */
ok('таблиця лишається, коли слова не вийшли', /aq-tbl/.test(broke.html), broke.html.slice(0, 120));
ok('і про невдачу сказано', /Словами не вийшло/.test(broke.txt), broke.txt);

/* ── 6. СТАРА ФУНКЦІЯ ЩЕ НЕ РОЗГОРНУТА ──
   Сторінка оновлюється сама, функція — ні. Поки ai стара, вона
   віддає plan_raw і нічого не знає про kind: питати все одно має
   працювати, інакше деплой стає умовою того, що вікно взагалі
   відкривається. */
await page.evaluate(() => { window.aqNew(); window.__sent = []; });
const old = await page.evaluate(async () => {
  const real = aqCall;
  aqCall = async body => {
    window.__sent.push(body);
    return { plan_raw: JSON.stringify({ set: 'sheet', group: 'Geo',
      metric: { op: 'sum', col: 'Spend' }, sort: 'desc', limit: 10 }),
      model: 'm', cost_usd: 0 };
  };
  const inp = document.getElementById('aq-q');
  inp.value = 'спенд по гео';
  await aqAsk();
  aqCall = real;
  const out = [...document.querySelectorAll('#aq-thread .aq-msg.is-bot')].pop();
  return out.innerHTML;
});
ok('зі старою функцією таблиця все одно рахується', /aq-tbl/.test(old), old.slice(0, 160));

/* ── 7. БОКУ ФУНКЦІЇ ── */
const FN = fs.readFileSync('supabase/functions/ai/index.ts', 'utf8');
ok('функція знає дії chat і talk',
  /\['text', 'plan', 'chat', 'talk'\]\.includes\(action\)/.test(FN));
ok('розмова йде на Claude, як і план',
  /\['plan', 'chat', 'talk'\]\.includes\(action\) \? 'claude'/.test(FN));
ok('моделі прямо сказано не називати чисел із голови',
  /NEVER STATE A NUMBER THAT WAS NOT COMPUTED/.test(FN));
ok('і що відмовляти через «це не запит до таблиці» більше не можна',
  /Do not refuse a question/.test(FN));

/* Anthropic відмовляє ВСЬОМУ запиту, коли перший хід не від людини
   або дві однакові ролі стоять поспіль. Обрізання історії згори легко
   робить і те, і те, тож це не косметика. */
const histSrc = FN.match(/function histOf[\s\S]*?\n}/)[0]
  .replace(/\(body:\s*Json\)/, '(body)')
  .replace(/:\s*\{ role: string; content: string \}\[\]/g, '')
  .replace(/\(m:\s*Json\)/g, '(m)')
  .replace(/\(acc:\s*\{ role: string; content: string \}\[\], m\)/, '(acc, m)');
const histOf = new Function('HIST_MAX', 'HIST_LEN', histSrc + '\nreturn histOf;')(16, 4000);

ok('порожня історія лишається порожньою', histOf({}).length === 0);
ok('ассистент першим не лишається',
  histOf({ history: [{ role: 'assistant', content: 'а' }, { role: 'user', content: 'б' }] })[0].role === 'user');
const glued = histOf({ history: [
  { role: 'user', content: 'перше' }, { role: 'user', content: 'друге' },
  { role: 'assistant', content: 'відповідь' }] });
ok('дві однакові ролі поспіль склеюються, а не викидаються',
  glued.length === 2 && /перше/.test(glued[0].content) && /друге/.test(glued[0].content), glued);
ok('і ролі в підсумку чергуються',
  glued.every((m, i) => !i || m.role !== glued[i - 1].role), glued.map(m => m.role));
ok('порожні ходи не їдуть', histOf({ history: [
  { role: 'user', content: 'так' }, { role: 'assistant', content: '   ' }] }).length === 1);

await done(browser, srv, errs);
