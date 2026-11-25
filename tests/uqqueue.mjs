/* ЧЕРГА → УНІКАЛІЗАТОР БЕЗ ВІДКРИТТЯ ВІКНА.
   «коли клікаю на унікалізатор кнопку в списку щоб воно автоматом в
   список летіло, а не відкривало унікалізатор, або зробити кнопку
   масового додавання, але поки що зроби це тільки для черги». */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8764;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const r = await page.evaluate(async () => {
  const out = {};
  teamDriveFolderId = 'F'; window.teamDriveFolderId = 'F';
  window._driveKey = () => 'K';
  window.driveFindCreative = async cid => cid === 'BAD' ? null : ({ id: 'id_' + cid, name: cid + '.mp4', mimeType: 'video/mp4' });
  const realFetch = window.fetch;
  window.fetch = async (u, o) => /googleapis\.com\/drive/.test(String(u))
    ? new Response(new Blob([new Uint8Array(1000)], { type: 'video/mp4' }), { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': '1000' } })
    : realFetch(u, o);
  const modal = () => !document.getElementById('uniq-modal').classList.contains('hidden');
  document.getElementById('uniq-modal').classList.add('hidden');
  uqFiles.length = 0;

  // Кнопка масового додавання видно, лише коли черга не порожня.
  crQueue = []; crQueuePaint();
  out.btnHidden = document.getElementById('cr-queue-uq').classList.contains('hidden');
  crQueue = ['KG_1', 'TJ_2', 'BAD']; crQueuePaint();
  out.btnShown = !document.getElementById('cr-queue-uq').classList.contains('hidden');

  await crQueueToUniq();
  out.files = uqFiles.map(f => f.name).join();
  out.modalAfterBulk = modal();
  out.toast = [...document.querySelectorAll('.toast, #toast-wrap *')].map(x => x.textContent).join(' | ').slice(0, 300);

  // Повтор не дублює.
  await uqBgAdd(['KG_1']);
  out.noDup = uqFiles.length === 2;

  // Рядок у режимі черги — тихо в список.
  crQueueOnly = true;
  await crUniqRow(null, 'UZ_3');
  await new Promise(r => setTimeout(r, 50));
  out.rowAdded = uqFiles.some(f => f.name === 'UZ_3.mp4');
  out.modalAfterRow = modal();

  // Поза чергою — як було: відкриває вікно.
  crQueueOnly = false;
  crUniqRow(null, 'GE_4');
  out.modalOutside = modal();
  document.getElementById('uniq-modal').classList.add('hidden');
  return out;
});
ok('без черги кнопки масового додавання немає', r.btnHidden, r);
ok('з чергою — є', r.btnShown, r);
ok('уся черга лягла в список унікалізатора', r.files === 'KG_1.mp4,TJ_2.mp4', r.files);
ok('вікно при цьому не відкрилось', r.modalAfterBulk === false, r);
ok('повторне додавання не дублює', r.noDup, r);
ok('у режимі черги кнопка в рядку додає тихо', r.rowAdded && r.modalAfterRow === false, r);
ok('поза чергою кнопка відкриває унікалізатор, як раніше', r.modalOutside === true, r);

await done(browser, srv, errs);
