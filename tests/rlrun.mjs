/* ═══════════ ЧИ ПРАВИЛА ВЗАГАЛІ ХОДЯТЬ ═══════════

   «Чому правила в кабінетах не спрацювали? Перевірка не працює?»

   Сторінка на це питання не відповідала, і навіть зізнавалась у
   цьому: порожній журнал писав «Nothing yet. Either no rule matched,
   or none of them ran» — дві протилежні новини одним рядком. У
   першій робити нічого не треба, у другій — задеплоїти функцію,
   поставити секрет або полагодити розклад.

   Різницю видно лише зсередини прогону, тож тепер прогін лишає по
   собі слід у тому самому журналі (level='run') навіть коли не
   зробив нічого.

   Стенд тримає:
     1. «жодного разу» називає, ЩО перевірити, і в якому порядку;
     2. прогін, який нічого не зробив, видно як прогін;
     3. пропущені через застарілий знімок — голосно: саме вони
        найчастіше й означають «нічого не вимкнулось»;
     4. давній прогін каже, що розклад міг стати;
     5. рядки про прогін не плутаються з діями;
     6. ланцюг «синк → правила» більше не мовчить у підсумку синку. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8183;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* Панель малюється у свій вузол, тож спершу її треба відкрити. */
await page.evaluate(() => {
  getTeamSetting = async () => null;
  sb.from = () => ({ select: () => ({ order: () => ({ limit: async () =>
    ({ data: [], error: null }) }) }) });
  rlPanel(true);
});

const paint = runs => page.evaluate(r => {
  rlRuns = r; rlLog = [];
  rlRunPaint(); rlLogPaint();
  return { run: document.getElementById('rl-run').textContent.replace(/\s+/g, ' ').trim(),
           log: document.getElementById('rl-log').textContent.replace(/\s+/g, ' ').trim() };
}, runs);

/* ── 1. жодного прогону ── */
const never = await paint([]);
ok('кажемо прямо, що правила не ходили',
  /never run/.test(never.run), never.run);
/* Три речі, і саме в тому порядку, у якому їх перевіряють. */
ok('названо функцію', /fb-rules/.test(never.run), never.run);
ok('названо секрет', /RULES_CRON_SECRET/.test(never.run), never.run);
ok('названо розклад', /FB_RULES\.sql/.test(never.run), never.run);
/* Найшвидша перевірка — руками: якщо так працює, винен розклад. */
ok('і спосіб перевірити це за хвилину', /Check now/.test(never.run), never.run);
ok('журнал відсилає до того рядка, а не гадає',
  /see the line above/.test(never.log), never.log);

/* ── 2. прогін, який нічого не зробив ── */
const at = m => new Date(Date.now() - m * 60000).toISOString();
const quiet = await paint([{ level: 'run', at: at(6),
  metrics: { cabinets: 12, ads: 340, stale: 0, paused: 0, would: 0 } }]);
ok('видно, коли перевіряли', /6 min ago/.test(quiet.run), quiet.run);
ok('і скільки саме дивились',
  /12 cabinet\(s\)/.test(quiet.run) && /340 ad\(s\)/.test(quiet.run), quiet.run);
/* Це і є відповідь на питання: ходять, просто нічого не підпадає. */
ok('сказано, що нічого не підпало', /nothing matched/.test(quiet.run), quiet.run);
ok('і журнал більше не гадає',
  /the rules do run/.test(quiet.log), quiet.log);

/* ── 3. застарілий знімок ── */
const stale = await paint([{ level: 'run', at: at(3),
  metrics: { cabinets: 9, ads: 120, stale: 4, paused: 0, would: 0 } }]);
ok('пропущені через знімок названі числом',
  /4 skipped/.test(stale.run), stale.run);
ok('і сказано, що саме застаріло', /snapshot was too old/.test(stale.run), stale.run);

/* ── 4. давній прогін ── */
const old = await paint([{ level: 'run', at: at(200),
  metrics: { cabinets: 3, ads: 50, stale: 0, paused: 0, would: 0 } }]);
ok('давній прогін показується в годинах', /3 h ago/.test(old.run), old.run);
/* Саме так виглядає розклад, що тихо став. */
ok('і сказано, що розклад міг стати',
  /schedule may have stopped/.test(old.run), old.run);

/* ── 5. що зробили ── */
const did = await paint([{ level: 'run', at: at(2),
  metrics: { cabinets: 5, ads: 80, stale: 0, paused: 2, would: 0 } }]);
ok('вимкнене рахується', /2 switched off/.test(did.run), did.run);
const rep = await paint([{ level: 'run', at: at(2),
  metrics: { cabinets: 5, ads: 80, stale: 0, paused: 0, would: 3 } }]);
ok('а режим «тільки показати» — окремо', /3 reported/.test(rep.run), rep.run);

/* ── 6. рядки про прогін не плутаються з діями ── */
const split = await page.evaluate(() => {
  const all = [
    { level: 'run', at: new Date().toISOString(), metrics: { cabinets: 1, ads: 2 } },
    { level: 'ad', at: new Date().toISOString(), rule_name: 'CPC', entity_name: 'Ad 1',
      entity_id: 'a1', metrics: { spend: 10, leads: 0, linkClicks: 5 }, dry: false, ok: true }
  ];
  rlRuns = all.filter(r => r.level === 'run');
  rlLog = all.filter(r => r.level !== 'run');
  rlRunPaint(); rlLogPaint();
  const log = document.getElementById('rl-log').textContent;
  return { rows: document.querySelectorAll('#rl-log .rl-log-row').length,
           hasAd: /Ad 1/.test(log), hasRun: /cabinet/.test(log) };
});
ok('дія лишається в журналі', split.rows === 1 && split.hasAd, split);
ok('а рядок про прогін у нього не лізе', split.hasRun === false, split);

/* ── 7. сам прогін лишає слід навіть без влучань ── */
const FN = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');
ok('слід пишеться завжди, а не лише при влучаннях',
  /await logRun\(base, hdr, seen, cron\);/.test(FN)
  && /level: 'run'/.test(FN), '');
/* Журнал і сторінка дивляться на created_by — отже й рахувати треба
   по власникові правил, інакше в чужому журналі лежали б чужі числа. */
ok('рахуємо по власникові правил', /seen\.get\(tokenOwner\)/.test(FN), '');
ok('пропущені через знімок потрапляють у слід', /mySeen\.stale\+\+/.test(FN), '');

/* ── 8. ланцюг «синк → правила» більше не мовчить ── */
const said = await page.evaluate(async () => {
  const out = [];
  sb.auth.getSession = async () => ({ data: { session: { access_token: 'x' } } });
  window.fbLoad = async () => {};
  window.setTeamSetting = async () => {};
  let body = {};
  window.fetch = async () => ({ ok: true, status: 200, json: async () => body });
  const run = async j => { body = j; fbSyncing = false;
    await fbSync(h => out.push(String(h))); return out[out.length - 1]; };
  return {
    bad: await run({ fn: FB_FN_WANT, tokens: 1, accounts: 4,
      rules: 'not configured: set RULES_CRON_SECRET for fb-sync too' }),
    good: await run({ fn: FB_FN_WANT, tokens: 1, accounts: 4, rules: 'ok: 0 paused, 0 reported' })
  };
});
ok('невдалий ланцюг видно в підсумку синку',
  /RULES_CRON_SECRET/.test(said.bad), said.bad);
/* «ok: …» — не новина: писати його щогодини означає вчити не читати
   цей кут екрана. */
ok('а вдалий не засмічує підсумок', !/rules:/.test(said.good), said.good);

/* ── 9. розклад ── */
const SQL = fs.readFileSync('FB_RULES.sql', 'utf8');
ok('правила ходять щочверть години', /'12,27,42,57 \* \* \* \*'/.test(SQL), '');
/* Через пʼять хвилин після синку: правила дивляться на знімок, який
   він щойно оновив. */
ok('і через пʼять хвилин після синку',
  /fb-sync ходить о 7, 22, 37 і 52/.test(SQL), '');

/* ── НА ЧОМУ СУДИЛИ ──

   Правило бере числа просто з Facebook. Коли він відмовив, воно
   судить по знімку від останнього Sync now — і саме тоді повертається
   стара вада з повторами. Рядок прогону мусить це показувати, бо
   інакше «вимкнули по свіжому» й «вимкнули по годинному» виглядають
   однаково. */
const runWith = m => page.evaluate(mm => {
  rlRuns = [{ at: new Date().toISOString(), metrics: mm }];
  rlRunPaint();
  return document.getElementById('rl-run').textContent.replace(/\s+/g, ' ').trim();
}, m);

const fresh = await runWith({ cabinets: 3, ads: 40, live: 3, fell_back: 0, paused: 1 });
ok('по свіжих числах про знімок не згадують',
  !/snapshot/i.test(fresh), fresh);
const fell = await runWith({ cabinets: 3, ads: 40, live: 1, fell_back: 2, paused: 1 });
ok('а відкат до знімка видно, і скільки саме',
  /2 judged on the last snapshot/.test(fell), fell);
ok('і він позначений як попередження',
  await page.evaluate(() => !!document.querySelector('#rl-run .rl-run-warn')));

await done(browser, srv, errs);
