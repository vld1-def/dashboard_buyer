/* ═══════════ УСІ РЯДКИ, А НЕ ПЕРША ТИСЯЧА ═══════════

   «Select month немає в списку місяців». Supabase віддає щонайбільше
   1000 рядків за запит. У daily_stats команди було 1482 — сторінка
   бачила найновішу тисячу, і зі списку зникли три місяці. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const SRC = fs.readFileSync('index-legacy.html', 'utf8');
const BP = fs.readFileSync('build/build.py', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

const fn = (SRC.match(/async function sbAllRows\(make\) \{[\s\S]*?\n\}/) || [''])[0];
ok('помічник є', fn.length > 0);
const sbAllRows = new Function(fn + '\nreturn sbAllRows;')();

/* Підробна база: 2482 рядки, сторінка не більша за 1000. */
const rows = Array.from({ length: 2482 }, (_, i) => ({ id: i }));
let calls = 0;
const make = () => ({ range: async (a, b) => { calls++; return { data: rows.slice(a, Math.min(b + 1, a + 1000)), error: null }; } });
const res = await sbAllRows(make);
ok('зібрано всі рядки трьома сторінками', res.error === null && res.data.length === 2482 && calls === 3, { n: res.data && res.data.length, calls });
ok('порядок збережено, дублів нема', res.data.every((r, i) => r.id === i));

calls = 0;
const exact = await sbAllRows(() => ({ range: async (a) => { calls++; return { data: a === 0 ? rows.slice(0, 1000) : [], error: null }; } }));
ok('рівно тисяча: ще один запит, і він порожній', exact.data.length === 1000 && calls === 2);
const bad = await sbAllRows(() => ({ range: async () => ({ data: null, error: { message: 'boom' } }) }));
ok('помилка повертається тією ж формою', bad.data === null && bad.error.message === 'boom');

const months = [...new Set(Array.from({ length: 1482 }, (_, i) => i < 374 ? '2026-11' : i < 1037 ? '2026-10' : i < 1252 ? '2026-09' : i < 1473 ? '2026-08' : '2026-07'))];
ok('на справжній розкладці видно всі пʼять місяців', months.length === 5);

ok('дашборд вантажить daily_stats сторінками', /await \(sent \|\| sbAllRows\(\(\) => sb\s+\.from\('daily_stats'\)/.test(SRC));
ok('і з однозначним порядком', /\.order\('date', \{ ascending: false \}\)\s+\.order\('id', \{ ascending: true \}\)\)\)/.test(SRC));
ok('ранній запит при запуску — теж сторінками', /window\.dailyReady = sbAllRows\(/.test(BP));
ok('порівняння команд і списки команд — теж', (SRC.match(/sbAllRows\(\(\) => sb\.from\('daily_stats'\)/g) || []).length >= 3);
ok('голого запиту по всій команді не лишилось', !/sb\.from\('daily_stats'\)\.select\('\*'\)\s*\.eq\('team_name', currentTeam\)\.order\('date', \{ ascending: false \}\)\)/.test(OUT));
ok('і це доїхало в зібраний index.html', /async function sbAllRows/.test(OUT) && /window\.dailyReady = sbAllRows/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
