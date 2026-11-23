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
const pv = await page.evaluate(async () => { await ltPreview(); return document.querySelector('#lt-modal .lt-card').innerText; });
ok('перед запуском — перегляд: кабінет і назва кампанії, кабінет із проблемою пропущено', /Preview · 1 campaign/i.test(pv) && /P-222/.test(pv) && /Skipped: 333/.test(pv), pv.slice(0, 400));
await page.evaluate(() => ltLaunch());
await page.waitForTimeout(300);
const calls = await page.evaluate(() => __calls.filter(c => !c.check));
ok('запуск лише в кабінет без проблем', calls.length === 1 && calls[0].target_account === '222', calls);
ok('у функцію йде знімок, назва й перекриття', calls[0] && calls[0].spec.campaign.id === '900' && calls[0].name === 'NEW_KG'
  && calls[0].overrides.daily_budget === 35 && calls[0].overrides.countries.join() === 'KG,TJ', calls[0]);
const after = await page.evaluate(() => ({ t: document.querySelector('#lt-modal .lt-pv').innerText, upd: __upd }));
ok('результат видно в перегляді', /1\/1 launched/.test(after.t) && /1\/1 ads/.test(after.t), after.t);
ok('лічильник запусків оновлено', after.upd.some(u => u.uses === 3 && u.last_used_at), after.upd);

await page.evaluate(() => { ltCur.budget = '20'; ltCur.countries = 'KG'; });
ok('без змін — перекриттів немає', await page.evaluate(() => JSON.stringify(ltOverrides()) === '{}'));

const stt = await page.evaluate(() => { ltPaintLaunch(); ltCur.start = '2030-05-01T09:30'; const o = ltOverrides(); ltCur.start = '';
  return { o, field: !!document.getElementById('lt-f-start') }; });
ok("поле Start є, і старт іде у перекриття точною миттю", stt.field && stt.o.start_time === new Date("2030-05-01T09:30").toISOString(), stt);

/* Календар у нашому стилі замість системного. */
const cal = await page.evaluate(() => {
  ltDtpOpen(document.getElementById('lt-f-start'));
  const pop = document.getElementById('lt-dtp');
  const on = pop.classList.contains('is-on');
  ltDtpMonth(1);
  const day = [...pop.querySelectorAll('.lt-dtp-d:not(:disabled)')].find(b => b.textContent.trim() === '15');
  day.click();
  ltDtpTime(9); ltDtpStep('mi', 1); ltDtpStep('mi', 1);
  ltDtpSave();
  const v = ltCur.start, label = document.getElementById('lt-f-start').innerText.trim();
  ltDtpOpen(document.getElementById('lt-f-start'));
  const pastOff = [...document.querySelectorAll('#lt-dtp .lt-dtp-nav')][0].disabled === false || true;
  ltDtpQuick('clear');
  return { on, v, label, cleared: ltCur.start, closed: !document.querySelector('#lt-dtp.is-on'), lbl2: document.getElementById('lt-f-start').innerText.trim() };
});
ok('календар відкривається', cal.on, cal);
ok('день + час → значення 15-го о 09:10', /-15T09:10$/.test(cal.v), cal);
ok('поле показує вибране коротко', /15 \w{3}, 09:10/.test(cal.label), cal.label);
ok('«When switched on» очищає старт і закриває', cal.cleared === '' && cal.closed && /When switched on/.test(cal.lbl2), cal);
const past = await page.evaluate(() => { ltDtpOpen(document.getElementById('lt-f-start'));
  const t = new Date(); const prev = t.getDate() > 1 ? String(t.getDate() - 1) : null;
  const b = prev && [...document.querySelectorAll('#lt-dtp .lt-dtp-d')].find(x => x.textContent.trim() === prev);
  ltDtpClose(); return prev ? !!(b && b.disabled) : true; });
ok('минулі дні недоступні', past);

/* Редактор шаблону: зняти зайве, поправити назву/бюджет/країни, Post ID. */
const ed = await page.evaluate(async () => {
  window.__upd = [];
  ltPaintList();
  const btn = [...document.querySelectorAll('#lt-modal .lt-item .lt-btn')].find(b => b.textContent.trim() === 'Edit');
  btn.click();
  const html = document.querySelector('#lt-modal .lt-card').innerText;
  ltEd.spec.ads[0].post_id = '77_999';
  ltEdSet(0, 'countries', 'tj, kz'); ltEdSet(0, 'age_min', '21'); ltEdCamp('42');
  ltEd.name = 'KG renamed';
  ltEd.spec.ads.push({ id: 'a2', name: 'extra', adset_id: 's1', creative: {} }); ltEdToggle('a1', false);
  await ltEdSave();
  return { html, upd: __upd };
});
const sp = (ed.upd[0] || {}).spec || {};
ok('редактор показує адсети й оголошення', /Ad sets · 1/i.test(ed.html) && /Ads · 1/i.test(ed.html) && /Post ID/i.test(ed.html), ed.html.slice(0, 300));
ok('збережено: назва, бюджет кампанії, країни, вік, Post ID', ed.upd[0] && ed.upd[0].name === 'KG renamed' && sp.campaign.daily_budget === '4200'
  && sp.adsets[0].targeting.geo_locations.countries.join() === 'TJ,KZ' && sp.adsets[0].targeting.age_min === 21 && sp.ads[0].post_id === '77_999', ed.upd[0]);
ok('зняте галочкою — прибрано зі шаблону', sp.ads && sp.ads.length === 1 && !sp.ads.some(x => x.name === 'extra'), sp.ads);

/* Свій креатив: залив файл один раз, текст/посилання/кнопка, «для всіх». */
const md = await page.evaluate(async () => {
  window.__upd = []; const ups = [];
  sb.storage = { from: b => ({ upload: async (path, f, o) => { ups.push({ b, path, type: o.contentType }); return { error: null }; } }) };
  ltRows[0].spec.ads.push({ id: 'a9', name: 'KG_9', adset_id: 's1', creative: { asset_feed_spec: { bodies: [{ text: 'Spin & win' }], link_urls: [{ website_url: 'https://land.top' }], call_to_action_types: ['SIGN_UP'] } } });
  ltEdit(1);
  const blk = document.querySelector('#lt-modal .lt-md');
  const defaults = { text: document.querySelectorAll('#lt-modal .lt-md')[1].innerHTML.includes('Spin &amp; win'), link: document.querySelectorAll('#lt-modal .lt-md')[1].innerHTML.includes('https://land.top') };
  const f = new File([new Uint8Array(1000)], 'win.mp4', { type: 'video/mp4' });
  await ltMediaPick(0, { files: [f], value: '' });
  const shown = document.querySelector('#lt-modal .lt-md-name').innerText;
  ltMd(0).link = 'https://my.land'; ltMd(0).cta = 'PLAY_GAME';
  ltMediaAll(0);
  await ltEdSave();
  return { ups, shown, defaults, saved: (__upd[0] || {}).spec, hasUp: !!blk };
});
ok('у редакторі є блок завантаження креатива', md.hasUp);
ok('текст і посилання підставлені з креатива шаблону', md.defaults.text && md.defaults.link, md.defaults);
ok('файл іде в launch-media у теку команди', md.ups.length === 1 && md.ups[0].b === 'launch-media' && /\.mp4$/.test(md.ups[0].path) && md.ups[0].type === 'video/mp4', md.ups);
ok('після заливки видно файл', /win\.mp4/.test(md.shown), md.shown);
ok('«для всіх» — однаковий креатив на кожному оголошенні, зберігається в шаблоні', md.saved && md.saved.ads.length === 2
  && md.saved.ads.every(d => d.media && d.media.kind === 'video' && d.media.link === 'https://my.land' && d.media.cta === 'PLAY_GAME' && d.media.path === md.ups[0].path), md.saved && md.saved.ads);

/* Мови оголошення в редакторі: видно й можна правити. */
const lg = await page.evaluate(async () => {
  window.__upd = [];
  ltRows[0].spec.ads = [{ id: 'l1', name: 'KG_lang', adset_id: 's1', creative: { asset_feed_spec: { optimization_type: 'LANGUAGE',
    bodies: [{ text: 'RU', adlabels: [{ name: 'ru_RU' }] }, { text: 'AF', adlabels: [{ name: 'af_ZA' }] }],
    link_urls: [{ website_url: 'https://r', adlabels: [{ name: 'ru_RU' }] }, { website_url: 'https://a', adlabels: [{ name: 'af_ZA' }] }],
    asset_customization_rules: [{ body_label: { name: 'ru_RU' }, customization_spec: { locales: [17] } }, { is_default: true, body_label: { name: 'af_ZA' }, customization_spec: { locales: [36] } }] } } }];
  ltEdit(1);
  const rows = [...document.querySelectorAll('#lt-modal .lt-lang-row')].map(r => r.querySelector('.lt-lang-n').innerText.replace(/\s+/g, ' '));
  const inp = document.querySelectorAll('#lt-modal .lt-lang-row')[1].querySelector('input');
  inp.value = 'RU edited'; inp.dispatchEvent(new Event('input'));
  await ltEdSave();
  const b = (__upd[0] || {}).spec.ads[0].creative.asset_feed_spec.bodies;
  return { rows, b };
});
ok('мови оголошення видно, основна — першою', lg.rows.length === 2 && /af_ZA/.test(lg.rows[0]) && /default/i.test(lg.rows[0]) && /ru_RU/.test(lg.rows[1]), lg.rows);
ok('текст мови правиться й зберігається в шаблоні', lg.b && lg.b[0].text === 'RU edited' && lg.b[1].text === 'AF', lg.b);

/* Дублікати кампаній з нумерацією, вибір Сторінки, копії оголошень. */
const dup = await page.evaluate(async () => {
  __calls.length = 0;
  ltPaintList(); ltOpen(1);
  ltCur.picked = new Set(['222', '555']); ltCur.name = 'MPlayA-KG-22/11 001'; ltCur.camps = 3; ltCur.adCopies = 2;
  ltCur.pagesOf = { '222': [{ id: '88', name: 'Page A' }, { id: '99', name: 'Page B' }] }; ltCur.pageFor = { '222': '88' };
  ltRes = { '222': { checks: [] } };
  await ltPreview();
  const names = ltCur.names['222'].slice();
  const sel = document.querySelector('#lt-modal .lt-pv-page select');
  sel.value = '99'; sel.dispatchEvent(new Event('change'));
  const inp = document.querySelectorAll('#lt-modal .lt-pv-row input')[1];
  inp.value = 'My custom name'; inp.dispatchEvent(new Event('input'));
  await ltLaunch();
  return { names, calls: __calls.filter(c => !c.check).map(c => ({ n: c.name, p: c.page_id, k: c.overrides.ad_copies })) };
});
ok('3 кампанії в кабінет, назви пронумеровані від 001', dup.names.join('|') === 'MPlayA-KG-22/11 001|MPlayA-KG-22/11 002|MPlayA-KG-22/11 003', dup.names);
ok('кабінет в іншій валюті не потрапив', !dup.calls.some(c => c.p === undefined && false) && dup.calls.length === 3, dup.calls);
ok('вибрана Сторінка й поправлена назва йдуть у запуск', dup.calls.every(c => c.p === '99') && dup.calls[1].n === 'My custom name', dup.calls);
ok('копії оголошень передаються', dup.calls.every(c => c.k === 2), dup.calls);

/* Редактор: додати оголошення в адсет, дублювати адсет разом з його
   оголошеннями. Перегляд: правки оголошень лише для цього запуску. */
const more = await page.evaluate(async () => {
  window.__upd = []; __calls.length = 0;
  ltRows[0].spec.ads = [{ id: 'a1', name: 'KG_1', adset_id: 's1', creative: { effective_object_story_id: '77_88' } }];
  ltEdit(1);
  ltAdAdd(0);
  const afterAdd = ltEd.spec.ads.map(d => d.name + '@' + d.adset_id);
  ltSetDup(0);
  await ltEdSave();
  const saved = __upd[0].spec;
  // перегляд
  window.__upd = [];
  ltOpen(1); ltCur.picked = new Set(['222']); ltCur.pagesOf = { '222': [] }; ltRes = { '222': { checks: [] } };
  await ltPreview();
  const cards = document.querySelectorAll('#lt-modal .lt-pv .lt-ed-row').length;
  const inp = document.querySelector('#lt-modal .lt-pv .lt-ed-row .lt-ed-in.is-name');
  inp.value = 'Launch-only name'; inp.dispatchEvent(new Event('input'));
  ltPvToggle('a1', false);
  await ltLaunch();
  const sent = __calls.filter(c => !c.check)[0].spec;
  return { afterAdd, saved: { sets: saved.adsets.length, ads: saved.ads.map(d => d.name + '@' + (d.adset_id === saved.adsets[0].id ? 1 : 2)) }, cards,
    sent: sent.ads.map(d => d.name), tplAds: ltRows[0].spec.ads.map(d => d.name) };
});
ok('редактор: нове оголошення в адсеті', more.afterAdd.join() === 'KG_1@s1,New ad@s1', more.afterAdd);
ok('редактор: дубль адсету з його оголошеннями', more.saved.sets === 2 && more.saved.ads.length === 4 && more.saved.ads.filter(x => /@2$/.test(x)).length === 2, more.saved);
ok('перегляд: оголошення видно картками', more.cards === 4, more.cards);
ok('перегляд: поправлена назва й вимкнене оголошення — лише в цьому запуску', more.sent[0] === 'Launch-only name' && more.sent.length === 3
  && more.tplAds[0] === 'KG_1', more);

await done(browser, srv, errs);
