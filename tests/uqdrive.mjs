/* ═══════════ УНІКАЛІЗАТОР: КРЕАТИВ З DRIVE ЗА НАЗВОЮ ═══════════

   «в унікалізаторі додавання через назву — тягне з Google Drive» і «в
   Creative Analyzer кнопка до кожного крео, що додає в унікалізатор».
     1. поле з підказками над вкладками Відео / Зображення;
     2. файл шукається тим самим driveFindCreative, що й прев'ю;
     3. відео — у чергу ffmpeg, картинка — у режим зображень;
     4. немає файлу чи папки — сказано прямо;
     5. кнопка в рядку списку й у шапці картки креатива. */
import { serve, open, checks } from './_harness.mjs';
import fs from 'node:fs';

const PORT = 8195;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const LEG = fs.readFileSync('index-legacy.html', 'utf8');

const r = await page.evaluate(async () => {
  teamDriveFolderId = 'F';
  const files = { V: { id: 'v1', name: 'V.mp4', mimeType: 'video/mp4' }, I: { id: 'i1', name: 'I.png', mimeType: 'image/png' } };
  driveFindCreative = async cid => files[cid] || null;
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  const png = await new Promise(res => c.toBlob(res, 'image/png'));
  window.fetch = async url => String(url).includes('/files/v1?alt=media')
    ? new Response(new Uint8Array(1000), { headers: { 'content-type': 'video/mp4' } })
    : new Response(png, { headers: { 'content-type': 'image/png' } });
  await uqDriveAdd('V');
  const vid = uqFiles.map(f => f.name).join();
  await uqDriveAdd('V');                                   // повтор — без дубля
  const once = uqFiles.length;
  await uqDriveAdd('I');
  const img = uiSrc.map(x => x.name).join();
  await uqDriveAdd('X');
  const miss = document.getElementById('uq-drive-st').textContent;
  teamDriveFolderId = null;
  await uqDriveAdd('V');
  const nofolder = document.getElementById('uq-drive-st').textContent;
  return { vid, once, img, miss, nofolder, field: !!document.getElementById('uq-drive-in') };
});
ok('поле «з Drive» у вікні унікалізатора', r.field);
ok('відео — у чергу', r.vid === 'V.mp4', r);
ok('той самий файл двічі не додається', r.once === 1, r);
ok('картинка — у режим зображень', r.img === 'I.png', r);
ok('немає файлу — сказано', /No file named X/.test(r.miss), r.miss);
ok('немає папки Drive — сказано, де її вказати', /Settings → Integrations → Google Drive/.test(r.nofolder), r.nofolder);
ok('кнопка в рядку списку креативів', /onclick="crToUniq\(event, '\$\{cidEsc\}'\)"/.test(LEG));
ok('і в шапці картки креатива', /onclick="crToUniq\(event, currentCreativeID\)"/.test(LEG));

await done(browser, srv, errs);
