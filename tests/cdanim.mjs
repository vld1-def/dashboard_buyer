/* АНІМАЦІЯ ПОЯВИ КАМПАНІЙ І ОГОЛОШЕНЬ У FB LIVE.
   «Хочу анімацію появлення кампаній і оголошень». Граються лише рядки,
   яких щойно не було: перемальовка (Sync, галочка, фільтр) не смикає
   те, що вже стоїть. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8755;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const r = await page.evaluate(() => {
  const node = (kind, id) => ({ n: { kind, id, name: id, kids: [], ads: 1 }, depth: kind === 'campaign' ? 0 : 1, band: false });
  let list = [node('campaign', 'c1'), node('campaign', 'c2')];
  window.cdView = () => ({ list });
  window.cdFields = (n, depth) => ({ key: n.kind + ':' + n.id, name: n.name, sw: '', status: '', spend: '' });
  cabTreeId = 'act_1';
  const count = html => (html.match(/cd-in/g) || []).length;
  const first = cabTreeRows(10);
  const again = cabTreeRows(10);
  list = list.concat([node('adset', 's1'), node('ad', 'a1')]);
  const opened = cabTreeRows(10);
  const delays = [...opened.matchAll(/--cd-i:(\d+)/g)].map(m => Number(m[1]));
  cabTreeId = 'act_2';
  const other = cabTreeRows(10);
  cabTreeId = 'act_1'; cdHide(); cabTreeId = 'act_1';
  const reopen = cabTreeRows(10);
  return { first: count(first), again: count(again), opened: count(opened), delays, other: count(other), reopen: count(reopen) };
});
ok('відкрив кабінет — кампанії виїжджають', r.first === 2, r);
ok('перемальовка того самого — без анімації', r.again === 0, r);
ok('розгорнув кампанію — анімуються лише нові адсет і оголошення', r.opened === 2, r);
ok('сходинкою: кожен наступний трохи пізніше', r.delays.join() === '0,1', r.delays);
ok('інший кабінет — його рядки знову виїжджають', r.other === 4, r);
ok('закрив і відкрив знову — виїжджають знову', r.reopen === 4, r);

await done(browser, srv, errs);
