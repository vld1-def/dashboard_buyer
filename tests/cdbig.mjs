/* БЮДЖЕТ: БІЛЬШЕ НІЖ УДЕСЯТЕРО — З ПІДТВЕРДЖЕННЯМ, А НЕ ЗАБОРОНОЮ.
   «коли піднімаю бюджет … руками через фб воно міняється, питання чи це
   код не дає змінити». Давав код: fb-pause відмовляв на ×10+. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { serve, open, checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/fb-pause/index.ts', 'utf8');
const src = (FN.match(/type BudgetPlan[\s\S]*?\nexport function budgetPlan[\s\S]*?\n}\n/) || [''])[0]
  .replace('export function', 'function');
ok('є budgetPlan', !!src);
const budgetPlan = new Function('type Json = any;\n' === '' ? '' : stripTypeScriptTypes('type Json = any;\n' + src) + '\nreturn budgetPlan;')();
const snap = [{ campaign_id: 'c1', campaign_name: 'C', campaign_daily_budget: 2001 }];
const no = budgetPlan(snap, 'c1', 520.01);
ok('без підтвердження ×26 не пройде', /tenfold/.test(no.error || ''), no);
const yes = budgetPlan(snap, 'c1', 520.01, true);
ok('з підтвердженням — пройде', !yes.error && yes.newMinor === 52001 && yes.field === 'daily_budget', yes);
ok('звичайна зміна — як і раніше', !budgetPlan(snap, 'c1', 40).error);
ok('функція бере big з тіла запиту', /bigOk = body\?\.big === true;/.test(FN) && /budgetPlan\(snap, id, wantBudget, bigOk\)/.test(FN));

const PORT = 8766;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const r = await page.evaluate(async () => {
  cdAcc = 'act_1'; cdRows = [{ campaign_id: 'c1', campaign_name: 'C', campaign_daily_budget: 2001 }];
  const asks = []; let n = 0;
  window.ask = async o => { asks.push(o); n++; return n === 1 ? '520.01' : true; };
  let sent = null;
  const rf = window.fetch;
  window.fetch = async (u, o) => /fb-pause/.test(String(u)) ? (sent = JSON.parse(o.body), new Response(JSON.stringify({ changed: true, was: 20.01, now: 520.01 }), { status: 200 })) : rf(u, o);
  window.cdSetBudget = () => {}; window.cdPaint = () => {};
  const fnName = Object.keys(window).find(k => /^cdBudget(Edit|Set|Ask|Change)$/.test(k) && typeof window[k] === 'function');
  if (!fnName) return { fn: Object.keys(window).filter(k => /^cdBudg/.test(k)) };
  await window[fnName]('c1');
  return { fn: fnName, title: asks[1] && asks[1].title, body: asks[1] && asks[1].body, sent };
});
ok('вікно каже, у скільки разів', /26× change/.test(r.title || ''), r);
ok('і попереджає про зайвий нуль', /extra or missing zero/.test(r.body || ''), r.body);
ok('підтвердження йде у функцію', r.sent && r.sent.big === true && r.sent.budget === 520.01, r.sent);

await done(browser, srv, errs);
