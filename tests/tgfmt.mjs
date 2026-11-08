/* ═══════════ ПОВІДОМЛЕННЯ ПРАВИЛ: ОДИН РЯДОК НА ОГОЛОШЕННЯ ═══════════

   Формат узгоджено з людиною по кроках 2026-11-07: варіант «один
   рядок», англійською, браузер перед кабінетом, ліди й інстали під
   одним 📲, довга кампанія обрізана З ПОЧАТКУ, порожній рядок між
   кабінетами, лінія над правилом і без порожнього рядка під ним.

   Стенд збирає СПРАВЖНЄ повідомлення з чисел того дня (fb_rule_log) і
   звіряє його з погодженим зразком символ у символ: формат, який
   людина затвердила, не має право «поплисти» тихо.

   Типи TypeScript знімає сам Node (stripTypeScriptTypes), тож шматки
   функції беремо як є, без регулярок-чистильників. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');

const grab = (re, what) => {
  const m = FN.match(re);
  ok('є ' + what, !!m);
  return m ? m[0] : '';
};

const src = [
  'type Hit = any; type Agg = any; type Rule = any; type Cond = any;',
  grab(/function money[\s\S]*?\n}/, 'money'),
  grab(/const METRICS[\s\S]*?\n};/, 'METRICS'),
  grab(/const METRIC_LABEL[\s\S]*?\n};/, 'METRIC_LABEL'),
  grab(/const METRIC_MONEY = [^\n]*/, 'METRIC_MONEY'),
  grab(/function fmtMetric[\s\S]*?\n}/, 'fmtMetric'),
  grab(/const PER_ONE[\s\S]*?\n};/, 'PER_ONE'),
  grab(/const APP_BLIND = \[[^\]]*\];/, 'APP_BLIND'),
  grab(/function condOk[\s\S]*?\n}/, 'condOk'),
  grab(/function whyHit[\s\S]*?\n}/, 'whyHit'),
  grab(/const CONV_INSTALL = [^\n]*/, 'CONV_INSTALL'),
  grab(/function convPick[\s\S]*?\n}/, 'convPick'),
  grab(/const TG_LINE = [^\n]*/, 'TG_LINE'),
  grab(/const TG_CAMP_MAX = [^\n]*/, 'TG_CAMP_MAX'),
  grab(/const tgMark[^\n]*/, 'tgMark'),
  grab(/const TG_WHAT[\s\S]*?};/, 'TG_WHAT'),
  grab(/function tgCamp\([\s\S]*?\n}/, 'tgCamp'),
  grab(/function tgCounts[\s\S]*?\n}/, 'tgCounts'),
  grab(/const tgOne = [\s\S]*?h\.error : ''\);/, 'tgOne'),
  grab(/function tgPath[\s\S]*?\n}/, 'tgPath'),
  grab(/function tgScope[\s\S]*?\n}/, 'tgScope'),
  grab(/function tgGroup[\s\S]*?\n}/, 'tgGroup'),
  grab(/function tgBody[\s\S]*?\n}/, 'tgBody'),
  grab(/function tgText[\s\S]*?\n}/, 'tgText')
].join('\n');

const tg = new Function('TG_MAX', 'TG_LIMIT', stripTypeScriptTypes(src)
  + '\nreturn { tgText, tgBody, tgCamp, tgCounts, whyHit, convPick };')(20, 3500);

const agg = o => ({ spend: 0, imps: 0, clicks: 0, linkClicks: 0,
                    leads: 0, regs: 0, purchases: 0, installs: 0, ...o });

/* Правила й числа — з team_settings і fb_rule_log того дня. */
const KG = { id: 'rmupcvbgc', name: 'Click OR Lead KG', dry: false, level: 'ad',
  match: 'any', minSpend: 4, geo: ['KG'],
  when: [{ m: 'cpc_link', op: '>', v: 2 }, { m: 'cpl', op: '>', v: 3.5 }] };
const TJ = { id: 'rmw3mbasg', name: 'Click OR Install TJ', dry: false, level: 'ad',
  match: 'any', minSpend: 2.5, geo: ['TJ'],
  when: [{ m: 'cpc_link', op: '>', v: 1.1 }, { m: 'cpi', op: '>', v: 2 }] };

const hit = (r, o) => {
  const h = { rule: r.id, ruleName: r.name, level: r.level, owner: 'u', team: 't',
    minSpend: r.minSpend, geos: r.geo, geoIn: '', dry: false, ok: true, error: '',
    acted: true, preview: false, fromSnap: false, ...o };
  h.why = tg.whyHit(r, h.agg);
  h.conv = tg.convPick(r, h.agg);
  return h;
};

const hits = [
  hit(KG, { id: '1', name: 'KG_JS_633', account: '1403209798694635', cabName: '3',
    browser: '4175', campaignName: 'MPlay_KG_10708-y3wz_07/11 001',
    agg: agg({ spend: 5.65, imps: 447 }) }),
  hit(KG, { id: '2', name: '633_DV_KG', account: '1403209798694635', cabName: '3',
    browser: '4175', campaignName: 'MPlay_KG_10708-y3wz_07/11 003',
    agg: agg({ spend: 6.44, imps: 1419, clicks: 18, linkClicks: 8 }) }),
  hit(KG, { id: '3', name: 'KG_VD_1109', account: '555', cabName: '5',
    browser: '4210', campaignName: 'MPlay_KG_10711-k2pq_07/11 001',
    agg: agg({ spend: 10.09, imps: 2491, clicks: 2, linkClicks: 1 }) }),
  hit(TJ, { id: '4', name: 'TJ_0iHVkg', account: '1058595677211850', cabName: '1',
    browser: '4327',
    campaignName: 'cy638t_8wxg7hf7_bGcTwMmV_TR211003_1058595677211850_TJ',
    agg: agg({ spend: 19.53, imps: 4281, clicks: 9, linkClicks: 9,
               installs: 3, purchases: 1 }) })
];

/* Погоджений зразок. Кабінет 5 / браузер 4210 у ньому — вигадані, щоб
   було видно розділення кабінетів; решта — живі числа. */
const WANT = [
  '⛔ 4 paused',
  '━━━━━━━━━━━━━━━',
  '📋 "Click OR Lead KG" · from $4.00 · 🌍 KG',
  /* 2026-11-08: назва, під нею числа, під ними причина; порожній
     рядок між креативами; кабінет — ID. */
  '🌐 4175 › 🏦 1403209798694635 › 📣 MPlay_KG_10708-y3wz_07/11 001',
  '⛔ KG_JS_633',
  '💸$5.65 🖱0 📲0',
  '⚡CPC ∞ > $2.00 · CPL ∞ > $3.50',
  '',
  '🌐 4175 › 🏦 1403209798694635 › 📣 MPlay_KG_10708-y3wz_07/11 003',
  '⛔ 633_DV_KG',
  '💸$6.44 🖱8 📲0',
  '⚡CPL ∞ > $3.50',
  '',
  '🌐 4210 › 🏦 555 › 📣 MPlay_KG_10711-k2pq_07/11 001',
  '⛔ KG_VD_1109',
  '💸$10.09 🖱1 📲0',
  '⚡CPC $10.09 > $2.00 · CPL ∞ > $3.50',
  '━━━━━━━━━━━━━━━',
  '📋 "Click OR Install TJ" · from $2.50 · 🌍 TJ',
  '🌐 4327 › 🏦 1058595677211850 › 📣 …_TR211003_1058595677211850_TJ',
  '⛔ TJ_0iHVkg',
  '💸$19.53 🖱9 📲3 💰1',
  '⚡CPC $2.17 > $1.10 · CPI $6.51 > $2.00'
].join('\n');

const got = tg.tgText(hits);
ok('повідомлення збігається з погодженим зразком символ у символ', got === WANT,
  got.split('\n').map((l, i) => l === WANT.split('\n')[i] ? '' : i + ': ' + l)
     .filter(Boolean));
console.log('\n' + got + '\n');

/* ── окремі рішення, кожне — бо про нього просили ── */
ok('кампанія ріжеться з ПОЧАТКУ і рівно до 30 знаків',
  tg.tgCamp('cy638t_8wxg7hf7_bGcTwMmV_TR211003_1058595677211850_TJ').length === 30
  && tg.tgCamp('cy638t_8wxg7hf7_bGcTwMmV_TR211003_1058595677211850_TJ').endsWith('_TJ')
  && tg.tgCamp('cy638t_8wxg7hf7_bGcTwMmV_TR211003_1058595677211850_TJ').startsWith('…'));
ok('коротка кампанія не чіпається', tg.tgCamp('MPlay_KG_1') === 'MPlay_KG_1');

/* У правилі з OR — лише та умова, що спрацювала. */
/* 633_DV_KG: CPC $0.81 не спрацював, CPL ∞ — так. */
ok('⚡ каже лише те, що спрацювало', !/CPC/.test(hits[1].why) && /CPL/.test(hits[1].why),
  hits[1].why);

/* 📲: апка — інстали, веб — ліди; обидва — те, за чим спрацювало. */
const both = agg({ spend: 30, linkClicks: 30, leads: 2, installs: 3 });
ok('ліди+інстали, спрацював CPI → під 📲 інстали',
  tg.convPick({ ...TJ }, both) === 'installs');
ok('ліди+інстали, правило лише на CPL → ліди',
  tg.convPick({ ...KG, when: [{ m: 'cpl', op: '>', v: 1 }] }, both) === 'leads');
ok('веб без подій — ліди', tg.convPick(KG, agg({ spend: 5 })) === 'leads');

/* Без браузера — просто без 🌐, а не «🌐  ›». */
const nob = tg.tgText([hit(KG, { id: '9', name: 'X', account: '7', cabName: 'Z',
  browser: '', campaignName: 'C', agg: agg({ spend: 5 }) })]);
ok('немає браузера — немає й значка', /\n🏦 7 › 📣 C\n/.test(nob) && !/🌐/.test(nob), nob);

/* Звіт, помилка й не-оголошення. */
const mix = tg.tgText([
  hit(KG, { id: 'a', name: 'A', account: '7', cabName: 'Z', browser: '1',
    campaignName: 'C', agg: agg({ spend: 5 }), dry: true, ok: false }),
  hit(KG, { id: 'b', name: 'B', account: '7', cabName: 'Z', browser: '1',
    campaignName: 'C', agg: agg({ spend: 5 }), ok: false, error: 'boom' }),
  hit({ ...KG, level: 'campaign' }, { id: 'c', name: 'Camp1', level: 'campaign',
    account: '7', cabName: 'Z', browser: '1', campaignName: 'Camp1',
    agg: agg({ spend: 5 }) })
]);
ok('підсумок англійською з усіма трьома видами',
  /^⛔ 1 paused · 👁 1 report only · ⚠ 1 failed\n/.test(mix), mix);
ok('помилка окремим рядком', /\n⚠ boom/.test(mix), mix);
ok('кампанія-сутність підписана й не дублює себе',
  /⛔ campaign: Camp1/.test(mix) && (mix.match(/Camp1/g) || []).length === 1, mix);

ok('у листі не лишилось української', !/[А-Яа-яІіЇїЄєҐґ]/.test(got + mix + nob));

/* ── версія ── */
const v = Number((FN.match(/FN_VERSION = 'rules-(\d+)'/) || [])[1]);
ok('версію функції піднято не нижче rules-16', v >= 16,
  (FN.match(/FN_VERSION = '[^']+'/) || [])[0]);

/* Черга, яка не голодує з хвоста — лишається, як і була. */
ok('початок черги зсувається з часом',
  /const from = tokens\.length \? slot % tokens\.length : 0;/.test(FN), 'rotate');
ok('і черга йде по колу',
  /tokens\.slice\(from\)\.concat\(tokens\.slice\(0, from\)\)/.test(FN), 'wrap');

await done(null, null, []);
