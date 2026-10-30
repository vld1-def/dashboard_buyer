/* ═══════════ СТОРІНКА ТІМЛІДА ═══════════

   Окрема сторінка замість режиму дашборда: там увесь код і всі дані
   однаково приїжджали в браузер, а «закрито» означало лише «не
   намальовано».

   Пускає звичайний вхід плюс рядок у team_members — він дає і роль, і
   команду. Команду НЕ передають параметром: підмінити її в посиланні
   неможливо, якщо її ніхто не приймає ззовні.

   Що доводиться:
     1. кожна з пʼяти відмов називає СВОЮ причину, а не «access denied»;
     2. «Моя команда» йде від складу команди, а не від рядків: людина
        без запусків лишається в списку з прочерками, а не зникає;
     3. рядок без created_by — не ще один баєр, а незаповнена колонка,
        і сказано саме це;
     4. числа збігаються з дашбордом: та сама формула виручки і те саме
        правило дублів ставок (активна перемагає вимкнену). */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8164;
const { ok, count } = checks();
const srv = await serve(PORT);

/* Дубль Supabase, який уміє відповідати по-різному на різні фільтри:
   team_members питають двічі — про себе (eq user_id) і про команду
   (eq team_name). */
const INIT = () => {
  window.__tl = { uid: null, tables: {}, me: null, members: null };
  window.supabase = {
    createClient: () => ({
      from: t => {
        const f = {};
        const o = {};
        o.select = () => o; o.order = () => o; o.limit = () => o; o.in = () => o;
        o.eq = (c, v) => { f[c] = v; return o; };
        o.then = (res, rej) => {
          /* team_members питають двічі: про себе (eq user_id) і про
             склад команди (eq team_name). Розрізняємо за фільтром. */
          const r = (t === 'team_members')
            ? (f.user_id ? window.__tl.me : window.__tl.members)
            : window.__tl.tables[t];
          return Promise.resolve(r || { data: [], error: null }).then(res, rej);
        };
        return o;
      },
      auth: { getSession: async () => ({
        data: { session: window.__tl.uid ? { user: { id: window.__tl.uid } } : null } }) }
    })
  };
};

const ME = { user_id: 'u1', team_name: 'Makeberry', name: 'Олег', role: 'lead' };
const MEMBERS = [
  { user_id: 'u1', name: 'Олег',  role: 'lead' },
  { user_id: 'u2', name: 'Марія', role: 'buyer' },
  { user_id: 'u3', name: '',      role: 'buyer' }
];
const ROWS = [
  { date: '2026-10-05', geo: 'KG', offer: 'DEFAULT', spend: 100, regs: 10, deposits: 4, created_by: 'u1' },
  { date: '2026-10-20', geo: 'KG', offer: 'DEFAULT', spend: 120, regs: 5,  deposits: 2, created_by: 'u2' },
  { date: '2026-10-10', geo: 'TJ', offer: 'DEFAULT', spend: 200, regs: 8,  deposits: 0, created_by: 'u1' },
  { date: '2026-10-11', geo: 'KG', offer: 'DEFAULT', spend: 60,  regs: 3,  deposits: 1, created_by: 'u9' },
  { date: '2026-10-12', geo: 'KG', offer: 'DEFAULT', spend: 40,  regs: 2,  deposits: 1 },
  { date: '2026-09-15', geo: 'KG', offer: 'DEFAULT', spend: 50,  regs: 2,  deposits: 1, created_by: 'u1' }
];
const PAYS = [
  { geo: 'KG', offer: 'DEFAULT', value: 50,  model: 'cpa',   active: true },
  { geo: 'KG', offer: 'DEFAULT', value: 999, model: 'cpa',   active: false },
  { geo: 'TJ', offer: 'DEFAULT', value: 30,  model: 'spend', active: true }
];

const { browser, page, errs } = await open(PORT, { path: 'teamlead.html', init: INIT });
const H = () => page.evaluate(() => ({
  h: document.getElementById('tl-gate-h').textContent,
  p: document.getElementById('tl-gate-p').textContent,
  gate: getComputedStyle(document.getElementById('tl-gate')).display,
  app: getComputedStyle(document.getElementById('tl-app')).display
}));
const boot = s => page.evaluate(async st => {
  Object.assign(window.__tl, st);
  await tlBoot();
}, s);

/* ─────────── 1. пʼять відмов, кожна про своє ─────────── */
let g = await H();
ok('без входу сторінка закрита', g.gate !== 'none' && g.app === 'none', g);
ok('і каже саме про вхід', /спершу увійди/i.test(g.h), g.h);
ok('у відмові є посилання на дашборд', /дашборд/i.test(g.p), g.p);

await boot({ uid: 'u1', me: { data: null, error: { message: 'relation "team_members" does not exist' } } });
g = await H();
ok('таблиці ролей немає — сказано саме це', /не вдалось прочитати команду/i.test(g.h), g.h);
ok('і названо, чого бракує', /TEAM_ROLES\.sql/.test(g.p), g.p);

await boot({ uid: 'u1', me: { data: [], error: null } });
g = await H();
ok('немає свого рядка — окрема причина', /тебе ще немає в команді/i.test(g.h), g.h);

await boot({ uid: 'u1', me: { data: [{ ...ME, role: 'buyer' }], error: null } });
g = await H();
ok('баєра не пускає', /для тімліда/i.test(g.h), g.h);
ok('і каже, яка в нього роль', /buyer/.test(g.p), g.p);

await boot({ uid: 'u1', me: { data: [{ ...ME, team_name: '' }], error: null } });
g = await H();
ok('роль є, команди немає — теж окрема причина', /немає команди/i.test(g.h), g.h);

await boot({ uid: 'u1', me: { data: [ME], error: null }, members: { data: MEMBERS, error: null },
  tables: { daily_stats: { data: null, error: { message: 'permission denied for table daily_stats' } } } });
g = await H();
ok('відмова бази не лишає порожній екран', /не віддала статистику/i.test(g.h), g.h);
ok('і переказує справжню помилку', /permission denied/.test(g.p), g.p);

/* ─────────── 2. сторінка з даними ─────────── */
const app = await page.evaluate(async ([me, members, rows, pays]) => {
  window.__tl.me = { data: [me], error: null };
  window.__tl.members = { data: members, error: null };
  window.__tl.tables = { daily_stats: { data: rows, error: null }, payouts: { data: pays, error: null } };
  await tlBoot();
  return {
    gate: getComputedStyle(document.getElementById('tl-gate')).display,
    team: document.getElementById('tl-team').textContent,
    period: document.getElementById('tl-period').textContent,
    month: document.getElementById('tl-month').value,
    navs: [...document.querySelectorAll('.tl-nav')].map(b => b.textContent),
    kpi: [...document.querySelectorAll('.tl-kpi')].map(k => ({
      k: k.querySelector('p').textContent,
      v: k.querySelector('b').textContent,
      note: k.querySelector('.tl-note')?.textContent || '' }))
  };
}, [ME, MEMBERS, ROWS, PAYS]);
ok('тімліда пускає', app.gate === 'none', app.gate);
ok('команда підписана в меню', app.team === 'Makeberry', app.team);
ok('меню має свої розділи',
  JSON.stringify(app.navs) === JSON.stringify(
    ['Огляд', 'Моя команда', 'Капи', 'Сьогодні', 'По гео', 'По місяцях']), app.navs);
ok('у шапці видно, скільки людей у команді', /3 людей у команді/.test(app.period), app.period);
ok('свіжий місяць вибраний сам', app.month === '2026-10', app.month);

const kv = n => (app.kpi.find(x => x.k === n) || {});
ok('спенд команди за місяць', kv('Spend').v === '$520.00', app.kpi);
ok('валовий прибуток', kv('Gross Profit').v === '$-60.00', app.kpi);
ok('ROI під профітом', /ROI -12%/.test(kv('Gross Profit').note), app.kpi);
ok('депозити й реєстрації', kv('Deposits').v === '8' && /28 reg/.test(kv('Deposits').note), app.kpi);

/* ─────────── 3. «Моя команда» ─────────── */
const team = await page.evaluate(() => {
  document.querySelector('.tl-nav[data-sec="team"]').click();
  return {
    head: document.getElementById('tl-panel-h').textContent,
    rows: [...document.querySelectorAll('#tl-body tbody tr')].map(tr => ({
      cls: tr.className,
      cells: [...tr.querySelectorAll('td')].map(td => td.textContent.replace(/\s+/g, ' ').trim()),
      chip: tr.querySelector('.tl-chip')?.textContent || '' })),
    foot: [...document.querySelectorAll('#tl-body tfoot td')].map(td => td.textContent.trim())
  };
});
ok('розділ про людей', team.head === 'Люди', team.head);
ok('люди відсортовані за спендом',
  team.rows.slice(0, 3).map(r => r.cells[0].replace(r.chip, '')).join('|') === 'Олег|Марія|u3', team.rows);
ok('роль видно чипом', team.rows[0].chip === 'lead' && team.rows[1].chip === 'buyer', team.rows);
ok('спенд людини — сума її рядків', team.rows[0].cells[1] === '$300.00', team.rows[0]);
ok('ROI людини з її ж чисел', team.rows[0].cells[6] === '-13%', team.rows[0]);
/* Людина в команді є, запусків цього місяця немає. Нуль сказав би
   «крутив і не витратив» — тому прочерки, і рядок позначений. */
ok('людина без запусків лишається в списку', team.rows[2].cells[0].startsWith('u3'), team.rows[2]);
ok('і показана прочерками, а не нулями',
  team.rows[2].cells[1] === '—' && team.rows[2].cells[5] === '—', team.rows[2]);
ok('такий рядок позначений окремо', /tl-idle/.test(team.rows[2].cls), team.rows[2].cls);
/* Автор рядків, якого немає в team_members: показуємо, але чесно. */
ok('чужий автор показаний і підписаний',
  team.rows[3].cells[0].startsWith('u9') && /не в команді/.test(team.rows[3].chip), team.rows[3]);
ok('рядки без автора не домальовані нікому',
  /без автора/.test(team.rows[4].cells[0]) && /created_by/.test(team.rows[4].cells[0]), team.rows[4]);
ok('підсумок дорівнює місяцю', team.foot[1] === '$520.00', team.foot);

/* ─────────── 4. гео, місяці, ставки ─────────── */
const rest = await page.evaluate(() => {
  const read = () => ({
    rows: [...document.querySelectorAll('#tl-body tbody tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.textContent.trim())),
    foot: [...document.querySelectorAll('#tl-body tfoot td')].map(td => td.textContent.trim()),
    flags: [...document.querySelectorAll('#tl-body img')].map(i => i.getAttribute('src'))
  });
  document.querySelector('.tl-nav[data-sec="geo"]').click();
  const geo = read();
  document.querySelector('.tl-nav[data-sec="month"]').click();
  const month = read();
  return { geo, month };
});
ok('гео за спендом', rest.geo.rows.map(r => r[0]).join('|') === 'KG|TJ', rest.geo.rows);
/* Для KG дві ставки: активна $50 і вимкнена $999. Перемогла б друга —
   профіт був би в двадцять разів більший, і цього ніхто б не помітив. */
ok('активна ставка перемагає вимкнену', rest.geo.rows[0][5] === '$80.00', rest.geo.rows);
/* TJ іде за моделлю spend: 30% від спенду. Депозитів нуль — за cpa
   виручка була б нульова, а профіт −$200. */
ok('модель spend рахується відсотком від спенду', rest.geo.rows[1][5] === '$-140.00', rest.geo.rows);
ok('прапорці в гео є', rest.geo.flags.some(s => /\/kg\.png/.test(s)), rest.geo.flags);
ok('місяці свіжим зверху',
  rest.month.rows.map(r => r[0]).join('|') === '2026-10|2026-09', rest.month.rows);
ok('розділ місяців не звужений фільтром', rest.month.foot[1] === '$570.00', rest.month.foot);

/* ─────────── 4b. МАКЕТНІ РОЗДІЛИ ───────────

   Капи і «Сьогодні» намальовані: таблиці капів у базі ще немає. На
   одному екрані з ними живуть справжні числа, тому головне тут — щоб
   було ВИДНО, де що. Сторінка, на якій не видно, де правда, гірша за
   сторінку без половини блоків. */
const mock = await page.evaluate(() => {
  const go = s => { document.querySelector(`.tl-nav[data-sec="${s}"]`).click();
    return document.getElementById('tl-body'); };
  /* #tl-body — ОДИН елемент на всі розділи: перехід перемальовує
     його вміст. Тому кожен розділ треба дочитати ДО переходу, інакше
     перевірка мовчки дивиться на наступний. Саме на цьому стенд
     спіймав сам себе. */
  const caps = go('caps');
  const out = {
    capsMock: !!caps.querySelector('.tl-mock'),
    capNote: caps.textContent.includes('у поясі кожної капи'),
    capRows: [...caps.querySelectorAll('tbody tr')].map(tr => ({
      cells: [...tr.querySelectorAll('td')].map(td => td.textContent.trim()),
      tag: tr.querySelector('.tl-tag')?.textContent.trim() || '',
      bar: tr.querySelector('.tl-bar')?.className || '',
      w: tr.querySelector('.tl-bar i')?.style.width || '' })),
    strip: [...caps.querySelectorAll('.tl-strip > div')].map(d =>
      d.querySelector('p').textContent + '=' + d.querySelector('b').textContent)
  };
  const today = go('today');
  Object.assign(out, {
    todayMock: !!today.querySelector('.tl-mock'),
    alerts: today.querySelectorAll('.tl-alert').length,
    health: today.querySelectorAll('.tl-strip > div').length,
    todayTeam: [...today.querySelectorAll('tbody tr')].map(tr =>
      tr.querySelector('td').textContent.trim()),
    notStarted: today.textContent.includes('не стартував')
  });
  // а тепер СПРАВЖНІ розділи — на них плашки бути не мусить
  out.realMock = ['team', 'geo', 'month'].some(s => !!go(s).querySelector('.tl-mock'));
  return out;
});
ok('капи позначені як макет', mock.capsMock === true);
ok('«Сьогодні» позначене як макет', mock.todayMock === true);
ok('на справжніх розділах плашки НЕМАЄ', mock.realMock === false);
ok('рядок на кожну капу', mock.capRows.length === 6, mock.capRows.length);
ok('перелита капа названа перелитою',
  mock.capRows.find(r => r.cells[0] === 'UZ')?.tag === 'перелита', mock.capRows);
ok('і її залишок відʼємний',
  mock.capRows.find(r => r.cells[0] === 'UZ')?.cells[4] === '-4', mock.capRows);
ok('майже повна відрізняється від повної',
  mock.capRows.find(r => r.cells[0] === 'KG')?.tag === 'майже повна'
  && mock.capRows.find(r => r.cells[0] === 'AZ')?.tag === 'повна', mock.capRows);
ok('капа, якої не торкались, не плутається з повною',
  mock.capRows.find(r => r.cells[0] === 'KZ')?.tag === 'ще нічого', mock.capRows);
ok('незадана капа каже про себе, а не показує нуль',
  mock.capRows.find(r => r.cells[0] === 'PL')?.tag === 'капи не задано'
  && mock.capRows.find(r => r.cells[0] === 'PL')?.cells[2] === '—', mock.capRows);
ok('смужка перелитої пофарбована окремо',
  /is-over/.test(mock.capRows.find(r => r.cells[0] === 'UZ')?.bar || ''), mock.capRows);
ok('смужка не вилазить за 100%',
  mock.capRows.every(r => !r.w || parseInt(r.w) <= 100), mock.capRows.map(r => r.w));
ok('підсумок каже, скільки ще лити',
  mock.strip.some(x => /Лишилось відлити=105/.test(x)), mock.strip);
ok('перелиті й майже повні пораховані окремо',
  mock.strip.some(x => /Майже повні=1/.test(x)) && mock.strip.some(x => /Перелиті=1/.test(x)), mock.strip);
ok('про часовий пояс сказано прямо', mock.capNote === true);
ok('тривоги на місці', mock.alerts === 7, mock.alerts);
ok('здоровʼя парку чотирма плитками', mock.health === 4, mock.health);
ok('видно, хто сьогодні не стартував', mock.notStarted === true);
ok('команда на сьогодні — рядок на людину', mock.todayTeam.length === 4, mock.todayTeam);

/* ─────────── 5. порожньо ─────────── */
const empty = await page.evaluate(async () => {
  window.__tl.tables.daily_stats = { data: [], error: null };
  await tlBoot();
  document.querySelector('.tl-nav[data-sec="geo"]').click();
  return document.getElementById('tl-body').textContent.trim();
});
ok('порожня статистика каже про себе', /жодного рядка/i.test(empty), empty);

await browser.close();
srv.close();
if (errs.length) ok('сторінка без помилок', false, errs);
else ok('сторінка без помилок', true);
const c = count();
console.log(`\n${c.pass} ok, ${c.fail} fail`);
process.exit(c.fail ? 1 : 0);
