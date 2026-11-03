/* ═══════════ КОПІЮВАТИ КРЕАТИВ, ЯКИЙ ЩЕ НЕ ЛИВСЯ ═══════════

   «в креативах зроби кнопку копіювати креатив так як і до тих хто має
   дані».

   У списку креативів два різні рядки. Той, що має статистику, — <div>
   з кнопкою копіювання. Той, якого в статистиці немає взагалі (файл
   лежить у Drive і жодного разу не лився), — <a> у Drive, і кнопки в
   ньому не було.

   А ім'я такого креатива потрібне рівно для того ж, для чого й
   будь-яке інше: вставити в назву кампанії, знайти в Drive, спитати в
   когось. Копіювали його руками з екрана.

   Головна пастка тут — що рядок це СИЛКА: кнопка всередині неї без
   preventDefault і копіює, і відкриває вкладку Drive. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8196;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const row = await page.evaluate(() => {
  const html = crSidebarRow(
    { cid: 'KG_JS_674_3', s: 0, cl: 0, ins: 0, r: 0, dp: 0,
      _drive: { webViewLink: 'https://drive.google.com/file/d/abc/view', name: 'KG_JS_674_3.mp4' } },
    '', '', '');
  const d = document.createElement('div');
  d.innerHTML = html;
  const a = d.firstElementChild;
  const btn = a.querySelector('button');
  return { tag: a.tagName.toLowerCase(), href: a.getAttribute('href'),
           hasBtn: !!btn, onclick: btn ? btn.getAttribute('onclick') : '',
           title: btn ? btn.getAttribute('title') : '',
           text: a.textContent.replace(/\s+/g, ' ').trim() };
});

ok('рядок і далі веде в Drive', row.tag === 'a' && /drive\.google/.test(row.href), row);
ok('позначка «ніколи не лився» лишилась', /never ran/i.test(row.text), row.text);
ok('кнопка копіювання зʼявилась', row.hasBtn, row);
ok('і копіює саме імʼя креатива',
  /copyID\(event, 'KG_JS_674_3'\)/.test(row.onclick), row.onclick);
/* Без розширення: саме це ім'я стане cid, коли креатив поллється. З
   «.mp4» на кінці рядок у назві кампанії не зійшовся б зі
   статистикою. */
ok('без розширення файлу', !/\.mp4/.test(row.onclick), row.onclick);
ok('підпис той самий, що в решти', /copy creative id/i.test(row.title), row.title);

/* ── СИЛКА НЕ МАЄ ВІДКРИВАТИСЬ ВІД КОПІЮВАННЯ ──
   Кнопка стоїть усередині <a>. Без preventDefault клік і копіював би,
   і відкривав вкладку Drive — тобто кожне копіювання тягло б за собою
   вікно, якого не просили. */
const stopped = await page.evaluate(() => {
  let copied = '';
  navigator.clipboard.writeText = async t => { copied = t; };
  const d = document.createElement('div');
  d.innerHTML = crSidebarRow(
    { cid: 'KG_JS_674_3', s: 0, _drive: { webViewLink: 'https://drive.google.com/x', name: 'x' } },
    '', '', '');
  document.body.appendChild(d);
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  d.querySelector('button').dispatchEvent(ev);
  const out = { prevented: ev.defaultPrevented, copied };
  d.remove();
  return out;
});
ok('клік по кнопці не веде за силкою', stopped.prevented, stopped);
ok('а імʼя таки скопійовано', stopped.copied === 'KG_JS_674_3', stopped);

/* ── РЯДОК ЗІ СТАТИСТИКОЮ НЕ ЗМІНИВСЯ ── */
const normal = await page.evaluate(() => {
  crStars = new Set();
  const d = document.createElement('div');
  d.innerHTML = crSidebarRow({ cid: 'KG_JS_700', s: 42, cl: 1, ins: 10, r: 0, dp: 0 }, '', '', '');
  const el = d.firstElementChild;
  return { tag: el.tagName.toLowerCase(),
           copy: [...el.querySelectorAll('button')]
             .some(b => /copyID/.test(b.getAttribute('onclick') || '')) };
});
ok('рядок зі статистикою лишився div', normal.tag === 'div', normal);
ok('і його кнопка копіювання на місці', normal.copy, normal);

/* ── ГАЛОЧКА ПІСЛЯ КОПІЮВАННЯ ──

   Доти кнопку брали ВСЕРЕДИНІ .then(), з e.currentTarget. А він живе
   рівно стільки, скільки триває розсилання події: до моменту, коли
   обіцянка буферу обміну справдиться, там уже null.

   Тобто галочка не «іноді не зʼявлялась» — вона не зʼявлялась ніколи,
   а замість неї летіло «Cannot read properties of null», і мовчки:
   .then() без .catch() нікому не каже. Цей стенд її й знайшов. */
const tick = await page.evaluate(async () => {
  navigator.clipboard.writeText = async () => {};
  const d = document.createElement('div');
  d.innerHTML = crSidebarRow({ cid: 'A_B_C', s: 1 }, '', '', '');
  document.body.appendChild(d);
  const btn = [...d.querySelectorAll('button')]
    .find(b => /copyID/.test(b.getAttribute('onclick') || ''));
  const was = btn.innerHTML;
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 30));
  const out = { shown: btn.innerHTML, was, green: btn.classList.contains('text-green-500') };
  d.remove();
  return out;
});
ok('після копіювання видно галочку', tick.shown === '\u2705', tick);
ok('і кнопка позеленіла', tick.green, tick);

/* Відмова буфера обміну теж не мовчить: у незахищеному з'єднанні або
   без дозволу людина інакше бачила б кнопку без галочки й не знала,
   скопіювалось чи ні. */
const said = await page.evaluate(async () => {
  let msg = '';
  window.toast = t => { msg = String(t); };
  navigator.clipboard.writeText = async () => { throw new Error('denied'); };
  const d = document.createElement('div');
  d.innerHTML = crSidebarRow({ cid: 'A_B_C', s: 1 }, '', '', '');
  document.body.appendChild(d);
  [...d.querySelectorAll('button')]
    .find(b => /copyID/.test(b.getAttribute('onclick') || ''))
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 30));
  d.remove();
  return msg;
});
ok('а відмова буфера обміну сказана вголос', /could not copy/i.test(said), said);

await done(browser, srv, errs);
