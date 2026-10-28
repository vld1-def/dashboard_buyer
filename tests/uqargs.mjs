/* ═══════════ УНІКАЛІЗАТОР ВІДЕО · ЗСУВ КАДРУ ЗАМІСТЬ ПОВОРОТУ ═══════════

   Відео унікалізувалось дуже довго. Замір ffmpeg в один потік (саме таке
   ядро працює в браузері), 15 с 1080×1920, один варіант — 24.1 с:

     rotate 17.8 · декод 3.3 · кодування 3.0 · колір 1.5 · звук 1.1 · кроп 0.2

   Поворот — 74 % роботи, утричі більше за всю решту разом. Його замінив
   зсунутий кроп з ледь неоднаковим масштабом: та сама зміна сітки
   пікселів за 0 с (PSNR до оригіналу 20.7 проти 19.1 у повороту).

   Що доводить стенд:
     1. поворот виключений за замовчуванням, зсув — увімкнений;
     2. shift і size приходять двома сторонами окремо;
     3. вікно кропу зі зсувом не вилазить за кадр;
     4. масштаб повертає кадр у потрібний розмір і після зсуву;
     5. підпис варіанта показує і зсув, і обидві сторони розміру.

   І головне — аргументи проганяються СПРАВЖНІМ ffmpeg, якщо він є в
   системі. Вираз `crop=iw*0.96:ih*0.96:(iw-iw*0.96)/2+iw*0.0150:…`
   очима не перевіриш: помилку в ньому видно тільки на запуску. */
import { serve, open, checks } from './_harness.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8159;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

await page.evaluate(() => openUniqModal());

/* ─────────── 1. що ввімкнено за замовчуванням ─────────── */
const defs = await page.evaluate(() => {
  const o = {};
  UQ_PARAMS.forEach(p => { o[p.key] = document.getElementById('uq-on-' + p.key)?.checked; });
  return o;
});
ok('поворот виключений за замовчуванням', defs.rotate === false, defs);
ok('зсув кадру увімкнений', defs.shift === true, defs);
ok('кроп, колір, розмір, зерно увімкнені',
  defs.crop && defs.color && defs.size && defs.noise, defs);
ok('кожен параметр має галочку в DOM',
  Object.values(defs).every(v => typeof v === 'boolean'), defs);

const noPreset = await page.evaluate(() =>
  UQ_PARAMS.filter(p => UQ_PRESETS.mid[p.key] === undefined).map(p => p.key));
ok('кожен параметр має значення в пресеті', noPreset.length === 0, noPreset);
const empties = await page.evaluate(() =>
  UQ_PARAMS.filter(p => !document.getElementById('uq-v-' + p.key).value).map(p => p.key));
ok('пресет заповнив усі поля', empties.length === 0, empties);

/* ─────────── 2. uqPickParams ─────────── */
const pick = await page.evaluate(() => Array.from({ length: 30 }, () => uqPickParams()));
ok('поворот не потрапляє у варіанти, поки виключений',
  pick.every(p => p.rotate === undefined), pick[0]);
ok('зсув — дві сторони окремо',
  pick.every(p => p.shift && typeof p.shift.x === 'number' && typeof p.shift.y === 'number'), pick[0]);
ok('розмір — дві сторони окремо',
  pick.every(p => p.size && typeof p.size.x === 'number' && typeof p.size.y === 'number'), pick[0]);
ok('сторони розміру не завжди однакові',
  pick.some(p => p.size.x !== p.size.y), pick.map(p => p.size).slice(0, 4));
ok('зсув буває в обидві сторони',
  pick.some(p => p.shift.x > 0) && pick.some(p => p.shift.x < 0), pick.map(p => p.shift.x).slice(0, 8));
ok('зсув не перевищує виставлену межу', pick.every(p =>
  Math.abs(p.shift.x) <= 6 && Math.abs(p.shift.y) <= 6), pick.map(p => p.shift).slice(0, 4));

const offShift = await page.evaluate(() => {
  document.getElementById('uq-on-shift').checked = false;
  const p = uqPickParams();
  document.getElementById('uq-on-shift').checked = true;
  return p;
});
ok('вимкнений зсув просто не зʼявляється', offShift.shift === undefined, offShift);

const gone = await page.evaluate(() => {
  const el = document.getElementById('uq-on-crop');
  el.id = 'uq-on-crop-gone';
  let r;
  try { r = { ok: true, crop: uqPickParams().crop }; } catch (e) { r = { ok: false, err: String(e) }; }
  el.id = 'uq-on-crop';
  return r;
});
ok('зниклий параметр не валить uqPickParams', gone.ok && gone.crop === undefined, gone);

/* ─────────── 3. кадр на виході ─────────── */
const frames = await page.evaluate(() => ({
  both: uqOutFrame({ size: { x: -1, y: 2 } }, { w: 1080, h: 1920 }),
  zero: uqOutFrame({ size: { x: 0, y: 0 } }, { w: 1080, h: 1920 }),
  none: uqOutFrame({}, { w: 1080, h: 1920 }),
  blind: uqOutFrame({ size: { x: 3, y: 3 } }, { w: 0, h: 0 })
}));
ok('сторони кадру рахуються окремо',
  frames.both.w === 1070 && frames.both.h === 1958, frames.both);
ok('сторони кадру парні',
  [frames.both.w, frames.both.h, frames.zero.w].every(n => n % 2 === 0), frames);
ok('нульовий розмір лишає кадр як був',
  frames.zero.w === 1080 && frames.zero.h === 1920 && frames.none.w === 1080, frames);
ok('невідомий кадр дає null, а не вгадані числа', frames.blind === null, frames.blind);

/* ─────────── 4. рядок фільтрів ─────────── */
const META = { w: 1080, h: 1920, dur: 15 };
const A = { crop: 4, shift: { x: 1.5, y: -1.2 }, color: { gamma: 2, sat: -2, con: 1, hue: 1.5 },
            size: { x: -1, y: 2 }, noise: 6, trim: { head: 0.4, tail: 0.5 } };
const a1 = await page.evaluate(([p, m]) => uqBuildArgs(p, m, '28', 'strip', 'superfast'), [A, META]);
const vf1 = a1[a1.indexOf('-vf') + 1] || '';
ok('без повороту фільтра rotate немає', !vf1.includes('rotate='), vf1);
ok('кроп зсунутий по x', vf1.includes('+iw*0.0150'), vf1);
ok('кроп зсунутий по y', vf1.includes('-ih*0.0120'), vf1);
ok('масштаб повертає кадр у потрібний розмір', vf1.includes('scale=1070:1958'), vf1);
ok('setsar стоїть після масштабу', vf1.indexOf('setsar=1') > vf1.indexOf('scale='), vf1);
ok('зерно лишилось', vf1.includes('noise=alls=6'), vf1);
ok('-ss перед -i нікуди не зник', a1.indexOf('-ss') < a1.indexOf('-i'), a1.slice(0, 6));
ok('без зміни гучності звук копіюється', a1.join(' ').includes('-c:a copy'), a1);

// зсув без кропу мусить сам створити собі запас — інакше вікно вилізе за кадр
const noCrop = await page.evaluate(([m]) => {
  const out = {};
  for (const s of [0.5, 2, 4, 6]) {
    const args = uqBuildArgs({ shift: { x: s, y: s } }, m, '28', 'strip', 'superfast');
    out[s] = args[args.indexOf('-vf') + 1];
  }
  return out;
}, [META]);
const inFrame = Object.entries(noCrop).every(([s, v]) => {
  const cf = +(v.match(/crop=iw\*([\d.]+)/) || [])[1];
  return cf > 0 && cf < 1 && (1 - cf) / 2 >= +s / 100 - 1e-9;   // півзапасу ≥ зсуву
});
ok('вікно кропу лишається в кадрі на будь-якому зсуві', inFrame, noCrop);
ok('зсув сам створює запас кропу',
  /crop=iw\*0\.98/.test(noCrop['0.5']) && /crop=iw\*0\.76/.test(noCrop['6']), noCrop);
ok('масштаб додається й коли ввімкнений лише зсув',
  noCrop['2'].includes('scale=1080:1920'), noCrop['2']);

const rot = await page.evaluate(([m]) => {
  const args = uqBuildArgs({ rotate: 1.2, crop: 4, size: { x: 0, y: 0 } }, m, '28', 'strip', 'superfast');
  return args[args.indexOf('-vf') + 1];
}, [META]);
ok('з поворотом rotate стоїть першим', rot.startsWith('rotate='), rot);
ok('поворот додає запас кропу', /crop=iw\*0\.9360/.test(rot), rot);

/* ─────────── 5. підпис варіанта ─────────── */
const d = await page.evaluate(p => uqDescribe(p), A);
ok('підпис показує зсув двома сторонами', d.includes('зсув +1.5/-1.2%'), d);
ok('підпис показує розмір двома сторонами', d.includes('розмір -1/+2%'), d);
ok('підпис не згадує поворот, якого немає', !d.includes('поворот'), d);

/* ─────────── 6. справжній ffmpeg ─────────── */
if (spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status !== 0) {
  console.log('note ffmpeg у системі немає — аргументи перевірені лише як рядки');
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uqargs-'));
  const src = path.join(dir, 'in.mp4');
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x568:rate=24:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', src]);
  const small = { w: 320, h: 568, dur: 2 };
  const run = (args, out) => spawnSync('ffmpeg',
    ['-y', '-v', 'error', ...args.map(a => a === 'out.mp4' ? out : a)],
    { cwd: dir, encoding: 'utf8' });

  const sets = await page.evaluate(m => {
    const out = [];
    for (let i = 0; i < 8; i++) out.push(uqPickParams());
    // і один набір із увімкненим поворотом — найдовший ланцюжок фільтрів
    document.getElementById('uq-on-rotate').checked = true;
    out.push(uqPickParams());
    document.getElementById('uq-on-rotate').checked = false;
    // і крайній зсув без кропу — саме там вікно могло б вилізти за кадр
    out.push({ shift: { x: 6, y: 6 } });
    return out.map(p => ({ p, args: uqBuildArgs(p, m, '28', 'strip', 'superfast') }));
  }, small);

  const bad = sets.map(({ p, args }, i) => {
    const r = run(args, `v${i}.mp4`);
    if (r.status !== 0) return `${i}: ${(r.stderr || '').trim().slice(0, 180)}`;
    const sz = fs.statSync(path.join(dir, `v${i}.mp4`)).size;
    return sz > 1000 ? null : `${i}: файл ${sz} Б при ${JSON.stringify(p).slice(0, 80)}`;
  }).filter(Boolean);
  ok('ffmpeg приймає всі десять наборів і дає непорожні файли', bad.length === 0, bad);

  // кадр на виході мусить бути рівно тим, що обіцяв uqOutFrame
  const want = await page.evaluate(([p, m]) => uqOutFrame(p, m), [sets[0].p, small]);
  const got = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:nk=1',
    path.join(dir, 'v0.mp4')], { encoding: 'utf8' }).stdout.trim().split(/[,\n]/).map(Number);
  ok('кадр на виході такий, як порахував uqOutFrame',
    got[0] === want.w && got[1] === want.h, { want, got });

  fs.rmSync(dir, { recursive: true, force: true });
}

await done(browser, srv, errs);
