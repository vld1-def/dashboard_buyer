/* ═══════════ ІНСТАЛИ В ТЕЛЕГРАМ-БОТІ ═══════════

   «в телеграм треба також підписувати інстали, якщо немає лідів».

   Бот рахував клацання, лідів, реєстрації й депозити — усе, крім
   інсталів. На апп-кампанії це давало рядок «Лідів: 0 · —» як
   найголовнішу новину дня, хоч подій ліда в ній немає взагалі: нуль
   там стоятиме завжди, скільки б вона не приносила.

   Блок із чисел дашборда («Інсталів») їх уже показував, тобто два
   джерела під одним підписом казали різне. Тепер однаково. */
import fs from 'node:fs';
import { checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/telegram-bot/index.ts', 'utf8');

const grab = (re, what) => {
  const m = FN.match(re);
  ok('у боті є ' + what, !!m);
  return m ? m[0] : '';
};

/* ── СПІЛЬНИЙ СЛОВНИК ПОДІЙ ──
   Бот, правила й дашборд мусять називати інстал одним іменем: інакше
   три екрани про те саме «сьогодні» покажуть три різні числа. */
const RULES = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');
const evBot = (FN.match(/const EV_INST = '([^']+)'/) || [])[1];
const evRule = (RULES.match(/const INST_EVENT = '([^']+)'/) || [])[1];
ok('бот знає подію інстала', !!evBot, evBot);
ok('і називає її так само, як правила', evBot === evRule, [evBot, evRule]);

/* ── РЯДКИ БЛОКУ ── */
const src = [
  grab(/const CONV_ROWS[\s\S]*?\n];/, 'список рядків'),
  grab(/const convRows =[\s\S]*?: true\);/, 'вибір рядків')
].join('\n');
const plain = src
  .replace(/:\s*\[string,\s*\(c:\s*Conv\)\s*=>\s*number\]\[\]/g, '')
  .replace(/\(c:\s*Conv\)/g, '(c)');
const { CONV_ROWS, convRows } = new Function(
  plain + '\nreturn { CONV_ROWS, convRows };')();

const conv = o => ({ spend: 0, clicks: 0, leads: 0, regs: 0, deps: 0, inst: 0, ...o });
const labels = o => convRows(conv(o)).map(([l]) => l);

ok('інстали є серед рядків блоку',
  CONV_ROWS.some(([l]) => l === 'Інсталів'), CONV_ROWS.map(([l]) => l));

/* ── 1. АПП-КАМПАНІЯ: ІНСТАЛИ Є, ЛІДІВ НЕМАЄ ── */
const app = labels({ clicks: 90, inst: 12 });
ok('інстали підписані окремим рядком', app.includes('Інсталів'), app);
ok('а «Лідів: 0» не вигадано', !app.includes('Лідів'), app);
ok('клацання лишились на місці', app.includes('Клацань'), app);

/* ── 2. І ТЕ, Й ТЕ ── */
const both = labels({ clicks: 90, leads: 3, inst: 7 });
ok('де є і ліди, і інстали — видно обоє',
  both.includes('Лідів') && both.includes('Інсталів'), both);

/* ── 3. ЗВИЧАЙНИЙ ПАРК БЕЗ АПОК ── */
const web = labels({ clicks: 90, leads: 0 });
ok('без інсталів рядок про лідів лишається', web.includes('Лідів'), web);
/* Нуль інсталів — не новина, а зайвий рядок у повідомленні, яке
   читають із телефона. */
ok('і зайвого рядка про інстали не зʼявляється', !web.includes('Інсталів'), web);

/* ── 4. РЕШТА РЯДКІВ НЕ ЗАЧЕПЛЕНА ──
   Реєстрації й депозити читають як «подій не було», і це правда:
   вони лишаються нулями, як і були. */
['Реєстрацій', 'Депозитів'].forEach(l => {
  ok('«' + l + '» лишається завжди',
    labels({}).includes(l) && labels({ inst: 5 }).includes(l), labels({ inst: 5 }));
});

/* ── 5. ВАЛЮТА З САМИМИ ІНСТАЛАМИ НЕ ВИПАДАЄ З БЛОКУ ──
   Відбір валют раніше дивився на spend/clicks/leads/regs/deps: парк,
   де є лише інстали, зник би цілком. */
const curPick = grab(/return x\.spend \|\|[^;]*;/, 'відбір валют');
ok('валюта з самими інсталами не губиться', /x\.inst/.test(curPick), curPick);

/* ── 6. ВЕРСІЯ ── */
const v = Number((FN.match(/FN_VERSION = 'bot-(\d+)'/) || [])[1]);
ok('версію бота піднято не нижче bot-13', v >= 13,
  (FN.match(/FN_VERSION = '[^']+'/) || [])[0]);

await done(null, null, []);
