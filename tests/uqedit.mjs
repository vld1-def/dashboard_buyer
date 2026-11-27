/* УНІКАЛІЗАТОР: НАКЛАДАННЯ, КІНЦІВКИ, БІБЛІОТЕКА.
   «хочу додати іконку в якесь місце на відео» + «бібліотека хуків та
   кінцівок». Аргументи другого проходу перевірено справжнім ffmpeg 6.1. */
import { serve, open, checks } from './_harness.mjs';
const { ok, done } = checks();
const srv = await serve(8770);
const { browser, page, errs } = await open(8770);
const r = await page.evaluate(() => {
  openUniqModal();
  uqOv = [{ id: 'a', name: 'i.png', data: new Uint8Array(1), url: '', x: 0.6, y: 0.05, w: 0.3, from: 0.5, to: 2, op: 0.8, jit: false }];
  uqEnds = [{ id: 'e', name: 'e.mp4', data: new Uint8Array(1), kind: 'video', ext: 'mp4', url: '', dur: 1.5 },
            { id: 'f', name: 'f.png', data: new Uint8Array(1), kind: 'image', ext: 'png', url: '', dur: 1.5 }];
  const out = { w: 360, h: 640 };
  const v1 = uqPostArgs(1, out, {}).args.join(' '), v2 = uqPostArgs(2, out, {}).args.join(' ');
  const v3 = uqPostArgs(3, out, {}).args.join(' ');
  const noOut = (() => { const e = uqEnds; uqEnds = []; const a = uqPostArgs(1, null, {}).args.join(' '); uqEnds = e; return a; })();
  uqExtraPaint();
  const box = document.getElementById('uq-extra');
  return { need: uqPostNeeded(), v1, v2, v3, noOut, block: !!box, chips: box ? box.querySelectorAll('.uqx-chip').length : 0, endRow: box ? /\bEnding\b/.test(box.innerText) : true,
           rot: box ? /take turns/.test(box.textContent) : false };
});
ok('другий прохід потрібен, коли є накладання чи кінцівка', r.need === true, r);
ok('іконка — у пікселях кадру: 108 px, x=216, y=32', /scale=108:-2/.test(r.v1) && /overlay=x=216:y=32/.test(r.v1), r.v1);
ok('час показу й прозорість', /enable='between\(t,0.5,2\)'/.test(r.v1) && /colorchannelmixer=aa=0.80/.test(r.v1), r.v1);
ok('кінцівки чергуються: v1 — перша, v2 — друга, v3 — знову перша',
  /-i end0\.mp4/.test(r.v1) && /-loop 1 -t 1.5 -i end1\.png/.test(r.v2) && /-i end0\.mp4/.test(r.v3), [r.v1, r.v2]);
ok('кінцівка під кадр копії', /scale=360:640:force_original_aspect_ratio=increase,crop=360:640/.test(r.v1), r.v1);
ok('метадані переносяться з першого проходу', /-map_metadata 0/.test(r.v1) && /use_metadata_tags/.test(r.v1), r.v1);
ok('кадр невідомий — scale2ref з перевіреними виразами', /scale2ref=w='iw\*0.3000':h='ow\/main_a'/.test(r.noOut), r.noOut);
ok('блок у вікні унікалізатора: накладання є, рядка Ending немає (прибрали на прохання)', r.block && r.chips === 1 && !r.endRow && r.rot, r);
await done(browser, srv, errs);
