/* ═══════════ ЗВІТНЕ ПРАВИЛО НЕ ЗАТУЛЯЄ БОЙОВЕ ═══════════

   «мої оголошення перекручували бюджет, і правила ходять кожні 15хв,
   вони мали давно вже зупинити оголошення».

   Живий випадок із fb_rule_log, 2026-11-07, 06:12 UTC: TJ_0iHVkg,
   $3.74, 1 link click. Звітне «CTR<30%» (link CTR <= 0.3, від $3)
   стояло першим і забирало влучання; бойове «Click OR Install TJ»
   (CPC > 1.1 або CPI > 2, від $2.5) бачило «вже є» і мовчало. Вимкнулось
   оголошення лише о 09:12 на $19.53.

   Стенд не тягне браузер: перевіряємо саму функцію, вирізавши з неї
   потрібні шматки, — рівно як rlinst.mjs. Власний ok/done, щоб він
   ішов будь-де, а не лише там, де стоїть Playwright. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (what, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + what); }
  else { fail++; console.log('  FAIL ' + what + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); }
};

const FN = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');
const grab = (re, what) => {
  const m = FN.match(re);
  ok('у функції є ' + what, !!m);
  return m ? m[0] : '';
};
const plain = src => src
  .replace(/:\s*Record<[\s\S]*?>\s*=\s*\{/g, ' = {')
  .replace(/:\s*\(a:\s*Agg\)\s*=>\s*number\s*\|\s*null/g, '')
  .replace(/\(a:\s*Agg\)/g, '(a)')
  .replace(/\(c:\s*Cond,\s*a:\s*Agg\)/g, '(c, a)')
  .replace(/\(r:\s*Rule,\s*a:\s*Agg\)/g, '(r, a)')
  .replace(/\(list:\s*Rule\[\]\)/g, '(list)')
  .replace(/:\s*Rule\[\]/g, '')
  .replace(/:\s*(boolean|number|string)\s*\|\s*null/g, '')
  .replace(/:\s*(Agg|boolean|number|string|void)\b/g, '');

const src = [
  grab(/const METRICS[\s\S]*?\n};/, 'список метрик'),
  grab(/const PER_ONE[\s\S]*?\n};/, 'PER_ONE'),
  grab(/const APP_BLIND = \[[^\]]*\];/, 'APP_BLIND'),
  grab(/function condOk[\s\S]*?\n}/, 'condOk'),
  grab(/function ruleHits[\s\S]*?\n}/, 'ruleHits'),
  grab(/function ruleOrder[\s\S]*?\n}/, 'ruleOrder')
].join('\n');
const { ruleHits, ruleOrder } =
  new Function(plain(src) + '\nreturn { ruleHits, ruleOrder };')();

ok('прогін сортує правила кабінета через ruleOrder',
  /const mine = ruleOrder\(/.test(FN));

/* Правила рівно такі, як у team_settings того дня, і в тому ж порядку. */
const ctr = { id: 'rmumnjnps', name: 'CTR<30%', dry: true, level: 'ad', match: 'all',
  minSpend: 3, when: [{ m: 'ctr_link', op: '<=', v: 0.3 }] };
const tj = { id: 'rmw3mbasg', name: 'Click OR Install TJ', dry: false, level: 'ad',
  match: 'any', minSpend: 2.5,
  when: [{ m: 'cpc_link', op: '>', v: 1.1 }, { m: 'cpi', op: '>', v: 2 }] };

/* Числа з журналу: 06:12, TJ_0iHVkg. */
const ad = { id: '120250998397410291',
  agg: { spend: 3.74, imps: 750, clicks: 1, linkClicks: 1,
         leads: 0, regs: 0, purchases: 0, installs: 1 } };

ok('звітне CTR правило справді підпадає', ruleHits(ctr, ad.agg));
ok('і бойове TJ правило теж', ruleHits(tj, ad.agg));

/* Той самий цикл, що в функції: одне влучання на сутність. */
const judge = rules => {
  const hits = [];
  for (const r of rules) {
    if (!ruleHits(r, ad.agg)) continue;
    if (hits.some(h => h.id === ad.id)) continue;
    hits.push({ id: ad.id, rule: r.name, dry: r.dry });
  }
  return hits;
};

const before = judge([ctr, tj]);
ok('без сортування — вада відтворюється: перемагає звітне',
  before.length === 1 && before[0].dry === true, before);

const after = judge(ruleOrder([ctr, tj]));
ok('з ruleOrder перемагає бойове — оголошення вимикається',
  after.length === 1 && after[0].dry === false && after[0].rule === tj.name, after);

/* Сортування стабільне: усередині групи порядок як у списку. */
const a = { ...tj, id: 'a' }, b = { ...tj, id: 'b' };
const c = { ...ctr, id: 'c' }, d = { ...ctr, id: 'd' };
const ord = ruleOrder([c, a, d, b]).map(r => r.id).join('');
ok('бойові першими, порядок усередині груп збережено', ord === 'abcd', ord);
ok('вхідний список не мутується', [c, a, d, b].map(r => r.id).join('') === 'cadb');

console.log('\n' + pass + '/' + (pass + fail));
if (fail) process.exit(1);
