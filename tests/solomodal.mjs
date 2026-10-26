/* ═══════════ ОДНЕ ВІКНО ЗА РАЗ ═══════════

   «відкриваю після того як вже якесь відкрите, і те що мені потрібне
   воно ховається за іншим модальним вікном».

   Кожне вікно відкривалось своєю функцією, і жодна не знала про решту.
   Тому перехоплюємо не відкриття, а саму появу: спостерігач ловить
   зняття hidden і закриває решту зі списку ВЕРХНІХ вікон.

   Стенд тримає межі:
     • нове вікно закриває попереднє;
     • закриває своєю функцією, а не просто дописує hidden;
     • діалог ask(), який законно стоїть ПОВЕРХ вікна, нічого не
       закриває — інакше питання гасило б те, про що питає;
     • форму з полями не закрити кліком по фону: там втрачається все
       набране;
     • просте питання без полів фоном закривається, як і було. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8156;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const vis = () => page.evaluate(() =>
  ['apps-modal', 'accounts-modal', 'uniq-modal', 'texts-modal', 'settings-modal',
   'geo-details-modal', 'data-check-modal']
    .filter(id => { const e = document.getElementById(id);
                    return e && !e.classList.contains('hidden'); }));

/* ─────────── нове закриває попереднє ─────────── */
await page.evaluate(() => { openUniqModal(); });
ok('відкрилось перше вікно', JSON.stringify(await vis()) === '["uniq-modal"]', await vis());

await page.evaluate(() => { openTextsModal(); });
const two = await vis();
ok('друге вікно закрило перше', JSON.stringify(two) === '["texts-modal"]', two);

await page.evaluate(() => { openAccountsModal(); });
const three = await vis();
ok('і третє — друге', JSON.stringify(three) === '["accounts-modal"]', three);

/* Закриття має йти через власну функцію вікна: вона чистить стан. */
const viaFn = await page.evaluate(async () => {
  window.__closed = [];
  const real = window.closeAccountsModal;
  window.closeAccountsModal = function () { window.__closed.push('accounts'); return real.apply(this, arguments); };
  openAppsModal();
  /* Спостерігач спрацьовує мікрозадачею — тобто вже ПІСЛЯ цього
     синхронного блока. Без паузи стенд читав би стан до закриття. */
  await new Promise(r => setTimeout(r, 30));
  return { closed: window.__closed, vis: !document.getElementById('apps-modal').classList.contains('hidden') };
});
ok('попереднє закрите СВОЄЮ функцією, а не дописаним hidden',
  viaFn.closed.includes('accounts') && viaFn.vis, viaFn);

/* ─────────── ask() стоїть поверх, нічого не гасить ─────────── */
const over = await page.evaluate(async () => {
  openAppsModal();
  const p = ask({ title: 'Питання', body: 'Поверх вікна', ok: 'Так', cancel: 'Ні' });
  await new Promise(r => setTimeout(r, 60));
  const state = {
    apps: !document.getElementById('apps-modal').classList.contains('hidden'),
    dialog: !!document.querySelector('.askwrap')
  };
  document.querySelector('.ask-no').click();
  await p;
  return state;
});
ok('діалог ask() не закриває вікно, над яким стоїть', over.apps && over.dialog, over);

/* ─────────── форму фоном не закрити ─────────── */
const form = await page.evaluate(async () => {
  const p = ask({ title: 'Додати кабінет', ok: 'Додати', cancel: 'Скасувати',
    fields: [{ key: 'acc', label: 'Account ID', need: true, full: true }] });
  await new Promise(r => setTimeout(r, 40));
  const wrap = document.querySelector('.askwrap');
  const inp = wrap.querySelector('[data-k="acc"]');
  inp.value = '1234567890';
  wrap.click();                                  // клік саме по фону
  await new Promise(r => setTimeout(r, 40));
  const stillHere = !!document.querySelector('.askwrap');
  const kept = stillHere && document.querySelector('[data-k="acc"]').value;
  // закриваємо як належить — кнопкою
  if (stillHere) document.querySelector('.ask-no').click();
  const res = await p;
  return { stillHere, kept, res, gone: !document.querySelector('.askwrap') };
});
ok('клік по фону не закриває форму', form.stillHere, form);
ok('і набране в ній лишається на місці', form.kept === '1234567890', form);
ok('кнопка «Скасувати» закриває як і раніше',
  form.res === false && form.gone, form);

/* ─────────── просте питання фоном закривається ─────────── */
const plain = await page.evaluate(async () => {
  const p = ask({ title: 'Видалити?', body: 'Без полів', ok: 'Так', cancel: 'Ні' });
  await new Promise(r => setTimeout(r, 40));
  document.querySelector('.askwrap').click();
  const res = await p;
  return { res, gone: !document.querySelector('.askwrap') };
});
ok('питання без полів фоном закривається, як і було',
  plain.res === false && plain.gone, plain);

await done(browser, srv, errs);
