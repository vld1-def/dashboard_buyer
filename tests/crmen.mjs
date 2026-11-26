/* CREATIVE ANALYZER → MENTIONS. «можеш додати згадування, зробити вкладку
   біля модерації». */
import { serve, open, checks } from './_harness.mjs';
const { ok, done } = checks();
const srv = await serve(8768);
const { browser, page, errs } = await open(8768);
const r = await page.evaluate(async () => {
  reportData = [
    { id: 'a', date: '2026-10-25', comment: '+ну як мінімум на одних крео інстал менше долара KG_tlJILzJw\nзвичайний рядок' },
    { id: 'b', date: '2026-10-22', comment: '|KG_VD_996|Mbank_KG_vld 10708-ex8g\n! kg_tljilzjw дивлюсь\n- KG_tlJILzJw2 це інший' }];
  rpTagsLoadedFor = currentTeam; crMenLoaded = true;
  rpTimes = { a: { [rpLineKey('+ну як мінімум на одних крео інстал менше долара KG_tlJILzJw')]: '2026-10-25T00:20:00' } };
  const m = crMentionsOf('KG_tlJILzJw');
  const t = crMentionsOf('KG_VD_996');
  currentCreativeID = 'KG_tlJILzJw';
  crTabNow = 'mentions'; crOpenPanels = new Set(['mentions']);
  await crRenderMentionsPanel();
  const el = document.getElementById('cr-panel-mentions');
  return { n: m.length, kinds: m.map(x => x.kind).join(), time: m.find(x => x.id === 'a').time,
           table: t[0] && t[0].text, rows: el.querySelectorAll('.cr-men').length, mark: el.querySelectorAll('mark').length,
           tab: !!document.querySelector('#cr-tabs [data-k="mentions"]'),
           date: el.querySelector('.cr-men-when b').textContent };
});
ok('знайдено обидві згадки, регістр не важливий', r.n === 2, r);
ok('довший ID з тим самим початком — не згадка', r.n === 2, r);
ok('мітки рядків — DONE і WATCH', r.kinds === 'DONE,WATCH', r);
ok('час рядка є', r.time === '00:20', r);
ok('рядок таблиці — без рамок', r.table === 'KG_VD_996 · Mbank_KG_vld 10708-ex8g', r);
ok('вкладка Mentions поруч із Moderation', r.tab, r);
ok('дата без сирих тегів', !/</.test(r.date) && /25 Oct/.test(r.date), r.date);
ok('у вкладці — згадки з підсвіченим креативом', r.rows === 2 && r.mark === 2, r);
await done(browser, srv, errs);
