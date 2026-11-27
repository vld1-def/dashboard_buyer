/* Порядок старту: дашборд → FB LIVE → решта у фоні. Статично — по коду
   зібраної сторінки, бо стенд не має справжньої бази й таймінгів. */
import fs from 'node:fs';
import { ROOT, checks } from './_harness.mjs';
const { ok, done } = checks();
const H = fs.readFileSync(ROOT + '/index.html', 'utf8');
const onload = H.slice(H.indexOf('window.onload = async'), H.indexOf('function normalizeDate'));
ok('після loadData — лише задачі й витрати, потім bootDone і фон',
  /await loadData\(\);[\s\S]*refreshTasks\(\);[\s\S]*loadExpenses\(\);[\s\S]*bootDone\?\.\(\);\s*bootBackground\(\);/.test(onload));
ok('креативи, звіти й посилання при старті не тягнуться одразу',
  !/refreshReports\(\);|loadQuickLinks\(\);|loadDriveFolderSetting\(\);/.test(onload));
const bg = H.slice(H.indexOf('async function bootBackground'), H.indexOf('async function bootBackground') + 900);
ok('фон: спершу FB LIVE, потім брама подій, потім решта по одному',
  /cabPreload\(\)[\s\S]*bgGateOpen\(\)[\s\S]*loadCreatives, refreshReports, loadQuickLinks, loadDriveFolderSetting[\s\S]*for \(const f of later\)[\s\S]*await f\(\)/.test(bg));
ok('loadData тягне креативи лише після першого старту',
  /if \(window\.bootBgStarted\) loadCreatives\(\);/.test(H));
ok('позначки подій на графіку чекають браму', /await window\.bgGate/.test(H));
ok('FB LIVE: один проміс на фон і перехід', /let cabLoadP = null/.test(H) && /window\.cabPreload = async function/.test(H));
done();
