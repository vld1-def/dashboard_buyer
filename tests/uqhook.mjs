/* Унікалізатор: окремого рядка Cover frame немає — поля хука в рядку Hook. */
import { serve, open, checks } from './_harness.mjs';
const { ok, done } = checks();
const srv = await serve(8778);
const { browser, page, errs } = await open(8778, { viewport: { width: 1400, height: 900 } });
const r = await page.evaluate(() => {
  try { bootDone(); } catch (e) {} ['boot', 'login-overlay', 'team-first-run'].forEach(i => document.getElementById(i)?.remove());
  openUniqModal();
  const q = s => document.querySelector(s);
  const one = { slot: !!q('#uqx-hook-slot #uq-cover'), hold: !!q('#uqx-hook-slot #uq-cover-dur'), tail: !!q('#uqx-hook-slot #uq-cover-tail'),
    coverTitle: [...document.querySelectorAll('#uniq-modal div')].some(d => d.childElementCount === 0 && /^Cover frame$/i.test(d.textContent.trim())) };
  uqExtraPaint(); uqExtraPaint();
  one.afterRepaint = !!q('#uqx-hook-slot #uq-cover') && document.querySelectorAll('#uq-cover').length === 1;
  return one;
});
ok('поля хука стоять у рядку Hook', r.slot && r.hold && r.tail, r);
ok('окремого рядка «Cover frame» немає', !r.coverTitle, r);
ok('після перемальовування блоку поля на місці й не задвоюються', r.afterRepaint, r);
ok('сторінка без помилок', errs.length === 0, errs);
await browser.close(); srv.close();
done();
