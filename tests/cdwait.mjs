/* ОЧІКУВАННЯ ПІД ЧАС ПЕРЕМИКАННЯ. «клікаю включити чи виключити
   компанію, я чекаю і не розумію, чи воно працює … в сповіщеннях додати
   анімацію прогрузки». Поки Facebook відповідає: вимикач уже в новому
   положенні з крутилкою, а сповіщення крутиться. Відповів — усе зникає,
   і лишається результат. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8756;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const r = await page.evaluate(async () => {
  window.ask = async () => true;
  cdAcc = 'act_1';
  let release;
  const gate = new Promise(res => { release = res; });
  const real = window.fetch;
  window.fetch = async (url, opt) => {
    if (!String(url).includes('fb-pause')) return real(url, opt);
    await gate;
    return new Response(JSON.stringify({ paused: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  sb.auth.getSession = async () => ({ data: { session: { access_token: 'x' } } });
  document.querySelectorAll('#toast-wrap .toast').forEach(t => t.remove());
  const p = cdFlip('c1', 'campaign', encodeURIComponent('Camp KG'), true);
  await new Promise(res => setTimeout(res, 50));
  const sw = cdSwitch({ id: 'c1', kind: 'campaign', sw: 'ACTIVE' }, 'Camp KG');
  const during = {
    pending: cdPending.has('c1'),
    wait: /is-wait/.test(sw), shownOff: !/is-on/.test(sw),
    busyToast: !!document.querySelector('#toast-wrap .toast.is-busy'),
    text: (document.querySelector('#toast-wrap .toast.is-busy') || {}).innerText || ''
  };
  release();
  await p;
  await new Promise(res => setTimeout(res, 250));
  const after = {
    pending: cdPending.has('c1'),
    busy: document.querySelectorAll('#toast-wrap .toast.is-busy:not(.out)').length,
    result: [...document.querySelectorAll('#toast-wrap .toast:not(.out)')].map(t => t.innerText).join(' | ')
  };
  return { during, after };
});
ok('поки чекаємо — вимикач у очікуванні', r.during.pending && r.during.wait, r.during);
ok('і вже в новому положенні (вимкнено)', r.during.shownOff, r.during);
ok('сповіщення з анімацією прогрузки', r.during.busyToast && /Switching off: Camp KG/.test(r.during.text), r.during);
ok('відповів — очікування зникло', !r.after.pending && r.after.busy === 0, r.after);
ok('лишився результат', /Switched off: Camp KG/.test(r.after.result), r.after);

await done(browser, srv, errs);
