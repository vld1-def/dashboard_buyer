/* ═══════════ ЗАВАНТАЖЕННЯ СТОРІНКИ ═══════════

   Сайт відкривався довго, і головне — неправильно: чотири запити
   стояли один за одним, хоча жоден не залежав від решти, а 250 КБ
   Chart.js блокували парсер у <head> ще до розмітки.

   Стенд тримає саму форму завантаження, а не секунди (їх тут нічим
   міряти чесно):
     • графіки НЕ висять у <head> — їх тягне cfLib на вимогу;
     • падіння бібліотеки локальне: графік каже чому, решта працює;
     • виплати й дані по днях стартують РАЗОМ, а не по черзі;
     • список команд не на шляху до екрана: тягнеться, коли
       відкривають випадайку, і один раз;
     • ярлики команди малюються без жодного запиту;
     • налаштування креативів — один запит на чотири ключі. */
import { serve, open, checks } from './_harness.mjs';
import { readFileSync } from 'node:fs';

const PORT = 8147;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const SRC = readFileSync('/home/user/dashboard_buyer/index.html', 'utf8');
const HEAD = SRC.slice(0, SRC.indexOf('</head>'));

/* ─────────── що лишилось у <head> ─────────── */
ok('chart.js більше не блокує парсер у head',
  !/<script[^>]+src="[^"]*chart\.js/.test(HEAD), HEAD.match(/<script[^>]+src="[^"]*"/g));
ok('плагін підписів теж', !/<script[^>]+src="[^"]*datalabels/.test(HEAD));
ok('supabase лишився синхронним — без нього не існує sb',
  /<script[^>]+src="[^"]*supabase-js/.test(HEAD));
ok('з\'єднання з базою ставимо заздалегідь',
  /<link rel="preconnect" href="https:\/\/[a-z0-9]+\.supabase\.co"/.test(HEAD), HEAD.slice(-400));
ok('а CDN графіків лишився в коді — його тягне cfLib',
  /CF_LIB = \[/.test(SRC) && /cdn\.jsdelivr\.net\/npm\/chart\.js/.test(SRC));

/* ─────────── бібліотека графіків: на вимогу й без фатальності ─────────── */
const lazy = await page.evaluate(() => ({
  noChart: typeof Chart === 'undefined',
  hasWait: typeof cfWait === 'function',
  hasLib: typeof cfLib === 'function'
}));
ok('на завантаженні Chart ще немає', lazy.noChart, lazy);
ok('але є чим його дотягнути', lazy.hasWait && lazy.hasLib, lazy);

/* Головне: падіння бібліотеки НЕ вбиває сторінку. Доти
   Chart.register на верхньому рівні валив увесь script-блок, і всі
   його const лишались у вічному TDZ — пів дашборда мовчки не
   працювало. */
const fail = await page.evaluate(async () => {
  const box = document.createElement('div');
  box.innerHTML = '<canvas id="t-cv"></canvas>';
  document.body.appendChild(box);
  const cv = document.getElementById('t-cv');
  let again = 0;
  const can = cfWait(cv, () => { again++; });
  await new Promise(r => setTimeout(r, 600));   // CDN тут закритий проксі
  return { can, again, said: box.textContent,
           // решта блока жива: беремо константу з того самого місця
           alive: typeof CF_LIB !== 'undefined' && Array.isArray(CF_LIB) };
});
ok('поки бібліотеки немає, графік не малюється', fail.can === false, fail);
ok('а на місці графіка сказано, чому його немає',
  /бібліотека не завантажилась/.test(fail.said), fail.said);
ok('повторного малювання не було: бібліотека не доїхала', fail.again === 0, fail);
ok('і решта сторінки при цьому жива', fail.alive, fail);

/* ─────────── форма завантаження: що з чим паралельно ───────────
   Кожен запит у стенді «їде» 150 мс. Доти їх було сім поспіль: роль,
   хто я, свій рядок, імена, доступи, виплати, дані — тобто секунда з
   гаком на самих лише кругосвітках. Тепер усе, що не залежить одне
   від одного, стартує разом. */
const boot = await page.evaluate(async () => {
  const DELAY = 150;
  window.__calls = [];
  const res = { data: [], error: null };
  const chain = () => new Proxy(function () {}, {
    get: (t, k) => k === 'then'
      ? (f => new Promise(r => setTimeout(() => r(res), DELAY)).then(f))
      : (() => chain()),
    apply: () => chain()
  });
  const mark = name => { window.__calls.push({ name, at: Math.round(performance.now()) }); };
  sb.from = t => { mark(t); return chain(); };
  sb.rpc = n => { mark('rpc:' + n); return chain(); };
  sb.auth.getSession = async () => ({ data: { session: { access_token: 'x' } } });
  sb.auth.getUser = async () => { mark('getUser'); return { data: { user: { id: 'u1' } } }; };
  /* Браузер «той самий»: інакше cacheGuard чистить сховище як після
     зміни акаунта, і перший запуск питає назву команди — тобто чекає
     на людину, а не на мережу. */
  try {
    localStorage.setItem('cache_uid', 'u1');
    localStorage.setItem('selected_team', 'TEAM');
  } catch (e) {}
  currentTeam = 'TEAM';
  teamsLoaded = false;
  window.dailyReady = null; window.payoutsReady = null;
  // Своє авторство вже відоме — другий getUser не має статись.
  if (typeof authUser === 'function') { /* обіцянка всередині widgets */ }

  const t0 = performance.now();
  const out = await Promise.race([
    window.onload().then(() => 'done'),
    new Promise(r => setTimeout(() => r('TIMEOUT'), 8000))
  ]);
  const ms = Math.round(performance.now() - t0);
  const at = n => (window.__calls.find(c => c.name === n) || {}).at;
  const n = name => window.__calls.filter(c => c.name === name).length;
  return { out, ms, names: window.__calls.map(c => c.name),
           pay: at('payouts'), day: at('daily_stats'),
           members: at('team_members'), role: at('rpc:my_role'),
           users: n('getUser') };
});
ok('завантаження доходить до кінця', boot.out === 'done', boot);
ok('дані по днях не чекають на роль',
  boot.day != null && boot.role != null && boot.day <= boot.role + 60,
  { day: boot.day, role: boot.role });
ok('виплати їдуть разом із даними',
  boot.pay != null && Math.abs(boot.pay - boot.day) < 60, { pay: boot.pay, day: boot.day });
ok('роль, імена й доступи — одним залпом, а не по черзі',
  boot.members != null && Math.abs(boot.members - boot.role) < 60,
  { members: boot.members, role: boot.role });
/* «Хто я» — одна обіцянка на всіх охочих. Доти його питали двічі
   підряд (cacheGuard і roleBoot), а це дві кругосвітки в /auth/v1/user
   за тією самою відповіддю. Нуль у стенді теж правильно: відповідь
   могла приїхати ще раніше — док питає її на завантаженні. */
ok('«хто я» за все завантаження питаємо щонайбільше раз', boot.users <= 1, boot.users);
ok('і повторні охочі беруть ту саму відповідь', await page.evaluate(async () => {
  window.__calls = [];
  await Promise.all([window.authUser(), window.authUser(), window.authUser()]);
  return window.__calls.filter(c => c.name === 'getUser').length <= 1;
}));
/* Сім запитів по 150 мс поспіль — це понад секунду. Паралельно
   лишається два кроки: залп і таргет, який знає місяць лише після
   даних. Беремо з запасом на рендер. */
ok('завантаження вкладається у два кроки, а не в сім',
  boot.ms < 600, boot.ms + ' мс · ' + JSON.stringify(boot.names));

/* ─────────── список команд не на шляху до екрана ─────────── */
ok('стовпець team_name з усієї таблиці на завантаженні не читається',
  boot.names.filter(t => t === 'daily_stats').length === 1, boot.names);

const teams = await page.evaluate(async () => {
  window.__calls = [];
  const before = document.getElementById('team-list').children.length;
  toggleTeamMenu();                       // відкрили — тягнемо
  await new Promise(r => setTimeout(r, 400));
  const once = window.__calls.filter(c => c.name === 'daily_stats').length;
  toggleTeamMenu(); toggleTeamMenu();     // вдруге й втретє
  await new Promise(r => setTimeout(r, 400));
  return { before, once,
           twice: window.__calls.filter(c => c.name === 'daily_stats').length };
});
ok('своя команда стоїть у меню ще до запиту', teams.before >= 1, teams);
ok('назви інших команд тягнемо саме при відкритті меню', teams.once === 1, teams);
ok('і рівно один раз за сеанс', teams.twice === 1, teams);

/* ─────────── ярлики команди — без запиту ─────────── */
const labels = await page.evaluate(() => {
  window.__calls = [];
  currentTeam = 'Makeberry';
  paintTeamLabels();
  return { calls: window.__calls.length,
           label: document.getElementById('active-team-label').innerText,
           title: document.getElementById('main-title').textContent };
});
ok('ярлики команди малюються без жодного запиту', labels.calls === 0, labels);
ok('і показують саму команду', /MAKEBERRY/.test(labels.label) && /Makeberry/.test(labels.title), labels);

/* ─────────── налаштування креативів: один запит на чотири ключі ─────────── */
const settings = await page.evaluate(async () => {
  window.__calls = [];
  const got = await getTeamSettings(['creative_stars', 'creative_tags',
                                     'creative_format', 'report_tags']);
  return { calls: window.__calls.filter(c => c.name === 'team_settings').length,
           map: got && typeof got === 'object' };
});
ok('чотири ключі налаштувань — один запит, а не чотири',
  settings.calls === 1 && settings.map, settings);

await done(browser, srv, errs);
