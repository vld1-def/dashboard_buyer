/* ═══════════ ПРИБРАТИ ВСІ КАБІНЕТИ БЕЗ ТОКЕНА ═══════════

   «No token» означає, що жоден токен цього кабінета вже не бачить:
   числа заморожені, зробити з ним нічого не можна, а рядок він займає
   нарівні з робочими. Таких назбирується десятками, і прибирати по
   одному — робота, якої ніхто не робить.

   Що тут важить:
     1. кнопка зʼявляється лише тоді, коли такі кабінети Є, і називає
        їх число: кнопка, яка нічого не зробить, гірша за її
        відсутність;
     2. питає перед тим, як чіпати сорок рядків, і каже, що це НЕ
        видалення — інакше нею не скористаються;
     3. відмова не чіпає жодного;
     4. бере рівно ті, що без токена, і жодного зайвого;
     5. одна невдача посеред списку не спиняє решту й не зникає. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8175;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

await page.evaluate(() => {
  window.__sw = { set: [], answer: true, fail: '' };
  window.toast = () => {};
  window.toastStep = () => ({ say: () => {}, done: (t, k) => { window.__sw.last = { t, k }; } });
  window.ask = async o => { window.__sw.asked = o; return window.__sw.answer; };
  cabSetStatus = async (id, st) => {
    if (window.__sw.fail && String(id) === window.__sw.fail) throw new Error('no');
    window.__sw.set.push({ id: String(id), st });
  };
  cabArchiveNew = async enc => { window.__sw.set.push({ id: 'new:' + decodeURIComponent(enc) }); };
  cabRender = () => {};
});

const run = extra => page.evaluate(async e => {
  cabAll = [
    { id: '1', state: 'notoken', row: { id: 'r1' } },
    { id: '2', state: 'running', row: { id: 'r2' } },
    { id: '3', state: 'notoken', row: { id: 'r3' } },
    { id: '4', state: 'notoken' }                    // ще не заведений у списку
  ];
  Object.assign(window.__sw, { set: [], asked: null, last: null }, e || {});
  await cabArchiveNoToken();
  return { set: window.__sw.set, asked: window.__sw.asked, last: window.__sw.last };
}, extra);

/* ── питання ── */
const yes = await run({ answer: true });
ok('у питанні стоїть число кабінетів',
  /Archive 3 cabinet/.test((yes.asked || {}).title || ''), yes.asked);
ok('сказано, що це не видалення',
  /history and your notes stay/.test((yes.asked || {}).body || ''), yes.asked);
ok('і чому вони взагалі мертві',
  /numbers are frozen/.test((yes.asked || {}).body || ''), yes.asked);

/* ── бере рівно тих, кого треба ── */
ok('архівуються тільки кабінети без токена', yes.set.length === 3, yes.set);
ok('робочий не чіпається', !yes.set.some(x => x.id === 'r2'), yes.set);
ok('заведені йдуть своїм рядком',
  yes.set.filter(x => x.st === 'archive').map(x => x.id).join(',') === 'r1,r3', yes.set);
/* Кабінет, якого ще немає в списку, архіву класти нікуди — його
   спершу заводять. Це вже вміє cabArchiveNew, тож кличемо саме її. */
ok('незаведений спершу заводиться', yes.set.some(x => x.id === 'new:4'), yes.set);
ok('у підсумку видно, скільки прибрано', /Archived 3/.test((yes.last || {}).t || ''), yes.last);

/* ── відмова ── */
const no = await run({ answer: false });
ok('відмова не чіпає жодного', no.set.length === 0, no.set);

/* ── одна невдача не спиняє решту ── */
const part = await run({ answer: true, fail: 'r1' });
ok('невдача на одному не спиняє решту', part.set.length === 2, part.set);
ok('і її видно числом, а не мовчанням',
  /1 did not go/.test((part.last || {}).t || ''), part.last);

/* ── кнопки немає, коли нема чого прибирати ── */
const none = await page.evaluate(() => {
  cabAll = [{ id: '2', state: 'running', row: { id: 'r2' } }];
  return typeof cabArchiveNoToken === 'function';
});
ok('дія існує навіть коли список порожній (кнопки — ні)', none === true);

await done(browser, srv, errs);
