/* ВІКНО ШАБЛОНІВ ЗАПУСКУ (launchtpl.js): список → кабінети → Check →
   Launch paused. Facebook і база — підробні; перевіряємо, що людина
   бачить і що йде у функцію. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8753;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, { viewport: { width: 1200, height: 900 } });
const { ok, done } = checks();

const SPEC = { v: 1, source_account: '111', currency: 'USD',
  campaign: { id: '900', name: 'MPlay_KG_1', objective: 'OUTCOME_LEADS', daily_budget: '2000' },
  adsets: [{ id: 's1', name: 'set', targeting: { geo_locations: { countries: ['KG'] } }, promoted_object: { pixel_id: '5' } }],
  ads: [{ id: 'a1', name: 'KG_1', adset_id: 's1', creative: { effective_object_story_id: '77_88' } }] };

await page.evaluate(([SPEC]) => {
  window.__calls = []; window.__upd = [];
  window.currentTeam = window.currentTeam || 'T';
  const rows = [{ id: 1, name: 'KG Melbet standard', geo: 'KG', note: 'best one', source_account: '111', source_campaign: '900',
    spec: SPEC, uses: 2, last_used_at: null, created_at: '2026-11-20T10:00:00Z' }];
  const q = { select: () => q, eq: () => q, order: () => q,
    limit: async () => ({ data: rows, error: null }),
    update: p => { window.__upd.push(p); return { eq: async () => ({ error: null }) }; } };
  sb.from = () => q;
  sb.auth.getSession = async () => ({ data: { session: { access_token: 'jwt' } } });
  window.ask = async () => true;
  cabAll = [
    { id: '222', state: 'running', fb: { name: 'Cab 222', currency: 'USD' }, row: { profile: 'P-222' } },
    { id: '333', state: 'idle', fb: { name: 'Cab 333', currency: 'USD' }, row: { profile: 'P-333' } },
    { id: '444', state: 'banned', fb: { name: 'Dead', currency: 'USD' }, row: {} },
    { id: '555', state: 'running', fb: { name: 'Euro', currency: 'EUR' }, row: { profile: 'P-555' } }
  ];
  const real = window.fetch;
  window.fetch = async (url, opt) => {
    if (!String(url).includes('/functions/v1/fb-launch')) return real(url, opt);
    const b = JSON.parse(opt.body); window.__calls.push(b);
    const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
    if (b.check) return J(b.target_account === '333'
      ? { ok: true, checks: [{ level: 'ok', text: 'currency USD' }, { level: 'fail', text: 'page 77 is not available to this cabinet — add it to the cabinet’s business' }] }
      : { ok: true, checks: [{ level: 'ok', text: 'currency USD' }, { level: 'ok', text: 'page My Page' }, { level: 'warn', text: 'pixel 5 is not shared — its own pixel “Own” will be used' }] });
    return J({ ok: true, mode: 'launch', complete: true, adsets: { made: 1, of: 1 }, ads: { made: 1, of: 1 }, problems: [] });
  };
}, [SPEC]);

await page.evaluate(() => ltPanel());
await page.waitForTimeout(300);
const list = await page.evaluate(() => document.querySelector('#lt-modal .lt-list').innerText);
ok('список шаблонів: назва, структура, бюджет, гео', /KG Melbet standard/.test(list) && /1 ad set · 1 ad/.test(list)
  && /\$20\/day/.test(list) && /launched 2×/.test(list), list);

await page.evaluate(() => ltOpen(1));
const cabs = await page.evaluate(() => [...document.querySelectorAll('.lt-cab-row')].map(x => x.innerText.replace(/\s+/g, ' ')));
ok('лише живі кабінети (забанений відсутній)', cabs.length === 3 && !cabs.some(x => /Dead/.test(x)), cabs);
ok('кабінет в іншій валюті позначено', cabs.some(x => /P-555/.test(x) && /other currency/.test(x)), cabs);
const form = await page.evaluate(() => ({ name: document.getElementById('lt-f-name').value, b: document.getElementById('lt-f-budget').value, g: document.getElementById('lt-f-geo').value }));
ok('форма заповнена з шаблону', form.name === 'KG Melbet standard' && form.b === '20' && form.g === 'KG', form);

await page.evaluate(() => { ltPick('222', true); ltPick('333', true); });
await page.evaluate(() => ltCheck());
await page.waitForTimeout(200);
const st = await page.evaluate(() => [...document.querySelectorAll('.lt-cab.is-on')].map(x => x.innerText.replace(/\s+/g, ' ')));
ok('перевірка: готовий кабінет із приміткою', st.some(x => /P-222/.test(x) && /ready, 1 note/.test(x) && /Own/.test(x)), st);
ok('перевірка: проблема з поясненням, що робити', st.some(x => /P-333/.test(x) && /1 problem/.test(x) && /business/.test(x)), st);
ok('перевірка не запускає', await page.evaluate(() => __calls.every(c => c.check)));

await page.evaluate(() => { ltCur.budget = '35'; ltCur.countries = 'kg, tj'; ltCur.name = 'NEW_KG'; });
await page.evaluate(() => ltLaunch());
await page.waitForTimeout(300);
const calls = await page.evaluate(() => __calls.filter(c => !c.check));
ok('запуск лише в кабінет без проблем', calls.length === 1 && calls[0].target_account === '222', calls);
ok('у функцію йде знімок, назва й перекриття', calls[0] && calls[0].spec.campaign.id === '900' && calls[0].name === 'NEW_KG'
  && calls[0].overrides.daily_budget === 35 && calls[0].overrides.countries.join() === 'KG,TJ', calls[0]);
const after = await page.evaluate(() => ({ t: document.querySelector('.lt-cab.is-on').innerText, upd: __upd }));
ok('результат видно на кабінеті', /launched/.test(after.t) && /Created paused: 1\/1 ad sets/.test(after.t), after.t);
ok('лічильник запусків оновлено', after.upd.some(u => u.uses === 3 && u.last_used_at), after.upd);

await page.evaluate(() => { ltCur.budget = '20'; ltCur.countries = 'KG'; });
ok('без змін — перекриттів немає', await page.evaluate(() => JSON.stringify(ltOverrides()) === '{}'));

const stt = await page.evaluate(() => { ltCur.start = '2030-05-01T09:30'; const o = ltOverrides(); ltCur.start = '';
  return { o, field: !!document.getElementById('lt-f-start') }; });
ok("поле Start є, і старт іде у перекриття точною миттю", stt.field && stt.o.start_time === new Date("2030-05-01T09:30").toISOString(), stt);

await done(browser, srv, errs);
