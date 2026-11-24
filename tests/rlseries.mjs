/* ═══════════ СЕРІЯ: КАМПАНІЮ ГАСИМО ЦІЛКОМ ═══════════

   Кабінет ...7985, ніч на 2026-11-15: шістнадцять однакових оголошень
   в одній кампанії, правило гасило по одному, бюджет перетікав на
   решту — останні стопи на $7.69, $8.17, $11.49 при порозі $1–2.2.

   Після трьох оголошень, погашених без результату, гаситься кампанія —
   якщо й вона сама за сьогодні підпадає під те саме правило.

   Рішення (seriesCamps) дістаємо з джерела й проганяємо без Facebook. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 600) : '')); } };

const FN = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8').replace(/\r\n/g, '\n');

const a = FN.indexOf('const SERIES_N = 3;');
const b = FN.indexOf('async function seriesPrior(');
const js = stripTypeScriptTypes(FN.slice(a, b));
const { seriesCamps, noResult, SERIES_N } =
  new Function(js + '\nreturn { seriesCamps, noResult, SERIES_N };')();

const hit = (id, camp, o = {}) => Object.assign({ id, level: 'ad', dry: false, campaign: camp, rule: 'r1',
  agg: { spend: 3, leads: 0, installs: 0 } }, o);
const row = (id, camp, o = {}) => ({ entity_id: id, metrics: Object.assign({ spend: 3, leads: 0, installs: 0, campaign: camp }, o) });

ok('поріг серії — три', SERIES_N === 3);
ok('«без результату» — ні ліда, ні інсталу', noResult({ leads: 0, installs: 0 }) && !noResult({ leads: 1, installs: 0 })
  && !noResult({ leads: 0, installs: 2 }) && noResult({}));

let d = seriesCamps([hit('a1', 'C'), hit('a2', 'C'), hit('a3', 'C')], []);
ok('три влучання в одному прогоні — серія', d.size === 1 && d.get('C').count === 3 && d.get('C').hit.id === 'a1', [...d]);

d = seriesCamps([hit('a3', 'C')], [row('a1', 'C'), row('a2', 'C')]);
ok('два з журналу + одне свіже — серія', d.size === 1 && d.get('C').count === 3);

d = seriesCamps([hit('a2', 'C')], [row('a1', 'C')]);
ok('двох замало', d.size === 0);

d = seriesCamps([], [row('a1', 'C'), row('a2', 'C'), row('a3', 'C')]);
ok('без свіжого влучання стара серія нічого не гасить', d.size === 0);

d = seriesCamps([hit('a1', 'C')], [row('a1', 'C'), row('a1', 'C'), row('a1', 'C')]);
ok('те саме оголошення, погашене кілька разів, — одне', d.size === 0);

d = seriesCamps([hit('a3', 'C')], [row('a1', 'C', { leads: 1 }), row('a2', 'C', { installs: 2 })]);
ok('погашені з лідом чи інсталом до серії не входять', d.size === 0);

d = seriesCamps([hit('a3', 'C', { agg: { spend: 9, leads: 2, installs: 0 } })], [row('a1', 'C'), row('a2', 'C')]);
ok('свіже влучання з лідами серію не запускає', d.size === 0);

d = seriesCamps([hit('a3', 'C')], [row('a1', 'D'), row('a2', 'D')]);
ok('чужа кампанія не рахується', d.size === 0);

d = seriesCamps([hit('a3', 'C')], [row('a1', undefined), row('a2', undefined)]);
ok('старі рядки журналу без кампанії не рахуються', d.size === 0);

d = seriesCamps([hit('a1', 'C', { dry: true }), hit('a2', 'C', { dry: true }), hit('a3', 'C', { dry: true })], []);
ok('звітне правило серію не запускає', d.size === 0);

d = seriesCamps([hit('s1', 'C', { level: 'adset' }), hit('a2', 'C'), hit('a3', 'C')], []);
ok('рахуються лише оголошення', d.size === 0);

d = seriesCamps([hit('a1', 'C'), hit('a2', 'C'), hit('a3', 'C'), hit('b1', 'D')], [row('b2', 'D'), row('b3', 'D')]);
ok('дві кампанії одного кабінета — кожна своя', d.size === 2 && d.get('D').count === 3);

/* ═══ ЯК ЦЕ ВШИТО В ПРОГІН ═══ */
const use = FN.slice(FN.indexOf('/* СЕРІЯ. Див. seriesCamps'), FN.indexOf('// Вимикаємо токеном, який це бачить'));
ok('кампанію судить те саме правило по її власних числах', /ruleHits\(r, c\.agg\)/.test(use)
  && /entsAt\('campaign'\)/.test(use));
ok('у перегляді й на знімку серія мовчить', /!forceDry && !fellBack\.has\(account\)/.test(use));
ok('влучання кампанії — рівня campaign, і вже погашену вдруге не беремо',
  /level: 'campaign', id: cid/.test(use) && /hits\.some\(h => h\.id === cid\)/.test(use));
ok('причина в листі каже про серію', /ads stopped here with no result/.test(use));
ok('збій перевірки серії не валить прогін', /series check failed/.test(use));
ok('кампанія їде в журнал', /metrics: \{ \.\.\.h\.agg, campaign: h\.campaign \|\| undefined \}/.test(FN)
  && /campaign: e\.campaign,/.test(FN));
ok('версія піднята', +((FN.match(/const FN_VERSION = 'rules-(\d+)';/) || [])[1] || 0) >= 21);

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
