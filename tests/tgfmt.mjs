/* ═══════════ ПОВІДОМЛЕННЯ ПРАВИЛ: КОМПАКТНО Й ЗГРУПОВАНО ═══════════

   «скоротимо до просто Правило: «Click OR Lead KG»… якщо вимкнуто два
   оголошення але з одного кабу, то групуємо в один каб а не пишемо
   два рази… більше інформативних смайликів, розділяй на блоки…
   забув задеплоїти щоб появились в повідомленні інфа по кількості
   кліків».

   І головне, що стояло за скаргою: «дуже багато спенда де не
   зупинило вчасно правило». Лист не казав НІ слова про поріг, нижче
   якого правило не має права дивитись, — а саме він і пояснює
   «$10.09»: до десяти доларів рішення не ухвалюється взагалі.

   Стенд не перевіряє розмітку по шматках — він збирає справжнє
   повідомлення з тих самих прикладів, які прислала людина. */
import fs from 'node:fs';
import { checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');

const grab = (re, what) => {
  const m = FN.match(re);
  ok('є ' + what, !!m);
  return m ? m[0] : '';
};

const src = [
  grab(/function money[\s\S]*?\n}/, 'money'),
  grab(/function plural[\s\S]*?\n}/, 'plural'),
  grab(/const METRICS[\s\S]*?\n};/, 'METRICS'),
  grab(/function metricCounts[\s\S]*?\n}/, 'metricCounts'),
  grab(/function metricPrices[\s\S]*?\n}/, 'metricPrices'),
  grab(/function ruleScope[\s\S]*?\n}/, 'ruleScope'),
  grab(/const tgMark[\s\S]*?;/, 'tgMark'),
  grab(/const TG_WHAT[\s\S]*?\n  ad: 'ad'[^;]*;/, 'TG_WHAT'),
  grab(/const tgOne = \(h: Hit, pad: string\)[\s\S]*?h\.error : ''\);/, 'tgOne'),
  grab(/function tgGroup[\s\S]*?\n}/, 'tgGroup'),
  grab(/function tgCamps[\s\S]*?\n}/, 'tgCamps'),
  grab(/function tgBody[\s\S]*?\n}/, 'tgBody')
].join('\n');

const plain = src
  .replace(/function tgGroup<T>\(list: T\[\], key: \(x: T\) => string\): \[string, T\[\]\]\[\]/,
           'function tgGroup(list, key)')
  .replace(/const order: string\[\] = \[\];/, 'const order = [];')
  .replace(/const by = new Map<string, T\[\]>\(\);/, 'const by = new Map();')
  .replace(/\(by\.get\(k\) as T\[\]\)/g, 'by.get(k)')
  .replace(/by\.get\(k\) as T\[\]/g, 'by.get(k)')
  .replace(/\(h: Hit, pad: string\)/g, '(h, pad)')
  .replace(/\(h: Hit\)/g, '(h)')
  .replace(/\(rows: Hit\[\]\)/g, '(rows)')
  .replace(/\(hits: Hit\[\]\)/g, '(hits)')
  .replace(/\(a: Agg\)/g, '(a)')
  .replace(/\(v: number\)/g, '(v)')
  .replace(/\(n: number, one: string, few: string, many: string\)/g, '(n, one, few, many)')
  /* Record<...> містить власні «>» і «=» всередині «=>», тож
     зрізаємо лише до знака присвоєння, і нежадібно. */
  .replace(/:\s*Record<[\s\S]*?>\s*=\s*\{/g, ' = {')
  .replace(/:\s*string\[\]\s*=/g, ' =')
  .replace(/\)\s*:\s*string\s*(=>|\{)/g, ') $1')
  .replace(/:\s*string\s*=>/g, ' =>');

const tg = new Function(plain + '\nreturn { tgBody, metricCounts, ruleScope };')();

const agg = o => ({ spend: 0, imps: 0, clicks: 0, linkClicks: 0,
                    leads: 0, regs: 0, purchases: 0, installs: 0, ...o });
const hit = o => ({ rule: 'r', ruleName: 'Click OR Lead KG', level: 'ad',
                    id: '1', name: 'KG_VD_1109', account: '1149896616961527',
                    campaignName: 'Mostbet_KG_new', owner: 'u', team: 't',
                    why: '', minSpend: 10, geos: ['KG'], geoIn: '',
                    agg: agg({}), dry: false, ok: true, error: '',
                    acted: true, preview: false, fromSnap: false, ...o });

/* ── 1. ПЕРШИЙ ПРИКЛАД ЛЮДИНИ ── */
const one = tg.tgBody([hit({
  agg: agg({ spend: 10.09, linkClicks: 1 }),
  why: 'cost per link click $10.09 > $2.00 OR cost per lead ∞ > $3.50' })]);

ok('заголовок правила короткий', /^\u{1F4CB} Правило: «Click OR Lead KG»/u.test(one), one);
/* Саме цього рядка й бракувало: «$10.09» перестає бути загадкою,
   щойно видно, що нижче $10 правило не дивиться взагалі. */
ok('і в ньому видно поріг спенду', /від \$10\.00/.test(one), one);
ok('гео теж лишилось одним суфіксом', /гео KG/.test(one), one);
/* Три рядки адреси («гео:», «cab:», «camp:») і дві лінії з рисок
   пішли: кабінет і кампанія тепер заголовки груп. */
ok('старого блоку адреси немає',
  !/cab: /.test(one) && !/camp: /.test(one) && !/──/.test(one), one);
ok('кабінет окремим заголовком', /\u{1F3E6} 1149896616961527/u.test(one), one);
ok('кампанія окремим заголовком', /\u{1F4E3} Mostbet_KG_new/u.test(one), one);
/* Те, по що людина й відкриває лист. */
/* \b після кирилиці не межа: \w у JS — лише ASCII. Ця пастка в
   проєкті ловить уже вдруге, тому перевіряємо оточення явно. */
ok('кліки нарешті в рядку чисел', /\u00b7 1 клік \u00b7/.test(one), one);
ok('а спенд і ліди лишились', /\$10\.09/.test(one) && /0 лідів/.test(one), one);
ok('CPC на місці', /CPC \$10\.09/.test(one), one);
ok('і причина теж', /> \$2\.00/.test(one), one);

/* ── 2. ДРУГИЙ ПРИКЛАД: АППКА ── */
const two = tg.tgBody([hit({
  name: 'TJ_0iHVkg', account: '778', campaignName: 'TJ_app',
  ruleName: 'Click OR Install TJ', minSpend: 15, geos: ['TJ'],
  agg: agg({ spend: 19.53, linkClicks: 9, purchases: 1, installs: 3 }),
  why: 'cost per link click $2.17 > $1.10 OR cost per install $6.51 > $2.00' })]);
ok('в аппці видно кліки, депи й інстали',
  /9 кліків/.test(two) && /1 деп\./.test(two) && /3 інстали/.test(two), two);
ok('і що поріг у цього правила свій', /від \$15\.00/.test(two), two);

/* ── 3. ГРУПУВАННЯ — ГОЛОВНЕ, ЩО ПРОСИЛИ ── */
const many = tg.tgBody([
  hit({ id: '1', name: 'KG_a' }),
  hit({ id: '2', name: 'KG_b' }),
  hit({ id: '3', name: 'KG_c', campaignName: 'Друга кампанія' }),
  hit({ id: '4', name: 'TJ_a', account: '778', campaignName: 'TJ_camp' }),
  hit({ id: '5', name: 'Інше', ruleName: 'Друге правило', minSpend: 5 })
]);
const count = (t, re) => (t.match(re) || []).length;
ok('два правила — два заголовки', count(many, /\u{1F4CB} Правило:/gu) === 2, many);
/* Доти шапка повторювалась на КОЖНІЙ трійці правило+каб+кампанія:
   три оголошення з одного кабінета давали три однакові шапки. */
ok('кабінет у межах правила написаний один раз',
  count(many, /\u{1F3E6} 1149896616961527/gu) === 2, many);
ok('кампанія — теж один раз на свої оголошення',
  count(many, /\u{1F4E3} Mostbet_KG_new/gu) === 2, many);
ok('усі п’ять оголошень на місці',
  ['KG_a', 'KG_b', 'KG_c', 'TJ_a', 'Інше'].every(n => many.includes(n)), many);
ok('порядок збережено — як сталось, так і написано',
  many.indexOf('KG_a') < many.indexOf('KG_b')
  && many.indexOf('KG_b') < many.indexOf('KG_c'), 'order');
/* Відступ і є тим, що показує належність: саме його просили замість
   ліній із підкреслень. */
ok('оголошення стоять з відступом під своєю кампанією',
  /\u{1F4E3} Mostbet_KG_new\n   ⛔ ad: KG_a/u.test(many), many);

/* ── 4. КАМПАНІЮ НЕ ПИШЕМО ДВІЧІ ──
   Коли вимкнена сутність і Є кампанією, окремий заголовок із тим
   самим іменем був би тим самим словом двічі поспіль. */
const camp = tg.tgBody([hit({ level: 'campaign', name: 'Mostbet_KG_new' })]);
ok('кампанія-сутність не дублює сама себе',
  count(camp, /Mostbet_KG_new/g) === 1, camp);

/* ── 5. ПРАВИЛО БЕЗ ФІЛЬТРА ГЕО ──
   Найнебезпечніший випадок: правило зветься «KG», а торкається всіх.
   Через це колись вимкнуло TJ, тому рядок лишається. */
const anyGeo = tg.tgBody([hit({ geos: [] })]);
ok('правило без фільтра гео каже про це', /гео: будь-яке/.test(anyGeo), anyGeo);

/* ── 6. ЧЕРГА, ЯКА НЕ ГОЛОДУЄ З ХВОСТА ──
   Токени йшли id.asc, а прогін має дедлайн: щойно він перестає
   встигати, обривається ЗАВЖДИ один і той самий хвіст, і ті кабінети
   не перевірялись ніколи. Зовні це й виглядає як «правило
   спізнилось». */
ok('початок черги зсувається з часом',
  /const from = tokens\.length \? slot % tokens\.length : 0;/.test(FN), 'rotate');
ok('і черга йде по колу',
  /tokens\.slice\(from\)\.concat\(tokens\.slice\(0, from\)\)/.test(FN), 'wrap');
ok('а до кого не дійшли — названо у відповіді',
  /skipped_total: tokens\.length - walked\.size/.test(FN), 'skipped');

/* ── 7. ВЕРСІЯ ── */
const v = Number((FN.match(/FN_VERSION = 'rules-(\d+)'/) || [])[1]);
ok('версію функції піднято не нижче rules-15', v >= 15,
  (FN.match(/FN_VERSION = '[^']+'/) || [])[0]);

await done(null, null, []);
