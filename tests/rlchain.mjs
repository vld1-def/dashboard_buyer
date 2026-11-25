/* ═══════════ ІНСТАЛ → ЛІД → СТОП ═══════════

   «якщо в автоправилі є інстал і лід, то логічно що якщо немає даних
   по інсталу то дивитись по ліду, якщо і по ліду даних немає тоді
   стопати».

   Стенд бере справжні функції з fb-rules і ганяє їх на числах. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');
const pick = (re, what) => { const m = FN.match(re); ok('є ' + what, !!m); return m ? m[0] : ''; };

const ts = [
  pick(/const METRICS:[\s\S]*?\n};/, 'METRICS'),
  pick(/const PER_ONE[\s\S]*?\n};/, 'PER_ONE'),
  pick(/const APP_BLIND = \[[^\]]*\];/, 'APP_BLIND'),
  pick(/function condOk[\s\S]*?\n}/, 'condOk'),
  pick(/const CONV_INST_M[\s\S]*?\nfunction ruleHits[\s\S]*?\n}/, 'ланцюжок і ruleHits'),
  'type Cond = { m: string; op: string; v: number }; type Rule = any; type Agg = any;'
].join('\n');
const js = stripTypeScriptTypes(ts);
const { ruleHits, liveConds } = new Function(js + '\nreturn { ruleHits, liveConds };')();

const agg = o => ({ spend: 0, imps: 0, clicks: 0, linkClicks: 0,
                    leads: 0, regs: 0, purchases: 0, installs: 0, ...o });
const rule = (match, when) => ({ match, minSpend: 0, when });
const both = m => rule(m, [{ m: 'cpi', op: '>', v: 3 }, { m: 'cpl', op: '>', v: 5 }]);

for (const m of ['all', 'any']) {
  // Є інстали: судимо по CPI.
  ok(m + ': інстали дешеві — не стопаємо', !ruleHits(both(m), agg({ spend: 10, installs: 5 })));
  ok(m + ': інстали дорогі — стоп', ruleHits(both(m), agg({ spend: 10, installs: 2 })));
  ok(m + ': є інстали — ліди не голосують',
    liveConds(both(m), agg({ spend: 10, installs: 5 })).map(c => c.m).join() === 'cpi');
  // Інсталів нема, є ліди: судимо по CPL.
  ok(m + ': ліди дешеві — не стопаємо', !ruleHits(both(m), agg({ spend: 8, leads: 4 })));
  ok(m + ': ліди дорогі — стоп', ruleHits(both(m), agg({ spend: 12, leads: 2 })));
  ok(m + ': немає інсталів — судимо по лідах',
    liveConds(both(m), agg({ spend: 8, leads: 4 })).map(c => c.m).join() === 'cpl');
  // Ні того, ні того: стоп, щойно спенд більший за ціну однієї події.
  ok(m + ': нічого немає і спенд > порогу — стоп', ruleHits(both(m), agg({ spend: 4 })));
  ok(m + ': нічого немає, але спенд ще малий — чекаємо', !ruleHits(both(m), agg({ spend: 2 })));
}

// Інші умови судять як і раніше.
const withSpend = rule('all', [{ m: 'spend', op: '>', v: 20 }, { m: 'cpi', op: '>', v: 3 }, { m: 'cpl', op: '>', v: 5 }]);
ok('спенд-умова лишається в ланцюжку', !ruleHits(withSpend, agg({ spend: 12, leads: 1 })));
ok('і разом із дорогим лідом — стоп', ruleHits(withSpend, agg({ spend: 30, leads: 1 })));

// Правило лише з однією групою — без змін.
const onlyCpl = rule('all', [{ m: 'cpl', op: '>', v: 5 }]);
ok('правило лише на CPL не стає ланцюжком', liveConds(onlyCpl, agg({ installs: 3 })).length === 1);

ok('версію функції піднято', +((FN.match(/FN_VERSION = 'rules-(\d+)'/) || [])[1] || 0) >= 23);

await done(null, null, []);
