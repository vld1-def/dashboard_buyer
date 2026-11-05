/* ═══════════ ПРАВИЛА Й ІНСТАЛИ ═══════════

   «а правила розрізняють lead і інстал? бо мені здається воно шукає
   lead тільки».

   Шукало. Серед метрик правил були leads, regs, purchases — інсталів
   не було взагалі, хоча дашборд рахував їх давно (CD_INST у розборі
   кабінета) й показував окремою колонкою. Тобто на екрані інстал
   видно, а написати по ньому правило — ніяк.

   І це не просто сліпота. Facebook віддає апковій кампанії подію
   mobile_app_install і НЕ віддає 'lead' ніколи. Отже лідів нуль, ціна
   ліда — нескінченність, і правило «лід дорожчий за $4» спрацьовувало,
   щойно спенд перевищував ці $4.

   На живих числах із того ж звіту: TJ_AB_676, $24.44, дев'ять
   інсталів по $2.72 і нуль лідів — бо лідів там і не планувалось.
   Правило вимикало його як дороге.

   Стенд тримає обидві половини: інстали стали метрикою, і ціна ліда
   більше не виносить вироку там, де міряє не тим. */
import fs from 'node:fs';
import { checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');

const grab = (re, what) => {
  const m = FN.match(re);
  ok('у функції є ' + what, !!m);
  return m ? m[0] : '';
};
/* У типі Record<string, (a: Agg) => number | null> є свої «>», тож
   зрізати його до першого «>» не можна — беремо все до знака
   присвоєння. */
const plain = src => src
  .replace(/:\s*Record<[\s\S]*?>\s*=\s*\{/g, ' = {')
  .replace(/:\s*\(a:\s*Agg\)\s*=>\s*number\s*\|\s*null/g, '')
  .replace(/\(a:\s*Agg\)/g, '(a)')
  .replace(/\(c:\s*Cond,\s*a:\s*Agg\)/g, '(c, a)')
  .replace(/:\s*(boolean|number|string)\s*\|\s*null/g, '')
  .replace(/:\s*(Agg|boolean|number|string|void)\b/g, '');

const src = [
  grab(/const METRICS[\s\S]*?\n};/, 'список метрик'),
  grab(/const PER_ONE[\s\S]*?\n};/, 'PER_ONE'),
  grab(/const APP_BLIND = \[[^\]]*\];/, 'APP_BLIND'),
  grab(/function condOk[\s\S]*?\n}/, 'condOk')
].join('\n');
const sandbox = new Function(plain(src) + '\nreturn { METRICS, condOk };')();
const { METRICS, condOk } = sandbox;

const agg = o => ({ spend: 0, imps: 0, clicks: 0, linkClicks: 0,
                    leads: 0, regs: 0, purchases: 0, installs: 0, ...o });

/* ── 1. ІНСТАЛИ СТАЛИ МЕТРИКОЮ ── */
ok('метрика installs є', typeof METRICS.installs === 'function');
ok('і ціна інстала теж', typeof METRICS.cpi === 'function');
ok('installs рахує саме інстали',
  METRICS.installs(agg({ installs: 9 })) === 9);
ok('ціна інстала — спенд ÷ інстали',
  METRICS.cpi(agg({ spend: 24.48, installs: 9 })) === 2.72,
  METRICS.cpi(agg({ spend: 24.48, installs: 9 })));
/* Та сама домовленість, що й для решти цін: витратили й нічого не
   отримали — ціна нескінченна; не витратили — метрики немає. */
ok('витратив і жодного інстала — нескінченність',
  METRICS.cpi(agg({ spend: 10 })) === Infinity);
ok('ні витрат, ні інсталів — метрики немає',
  METRICS.cpi(agg({})) === null);
/* Складати інстали з лідами не можна: різні події, і сума не
   зійшлася б ні з екраном, ні з Ads Manager. */
ok('інстали не домішуються до лідів',
  METRICS.leads(agg({ leads: 2, installs: 9 })) === 2);

/* ── 2. ЦІНА ЛІДА НЕ ВИМИКАЄ АПКУ ──
   Головне в цій зміні. Числа — ті самі, що в звіті. */
const app = agg({ spend: 24.44, installs: 9, leads: 0 });
ok('ціна ліда на апці — нескінченність, як і була',
  METRICS.cpl(app) === Infinity);
ok('але вироку більше немає',
  condOk({ m: 'cpl', op: '>', v: 4 }, app) === null,
  condOk({ m: 'cpl', op: '>', v: 4 }, app));
/* «Не знаю» має бути null, а не false: у правилі з AND воно ламає
   весь збіг, у правилі з OR просто не голосує. False означав би
   «перевірено й не підпадає», а ми нічого не перевіряли. */
ok('саме «не знаю», а не «ні»',
  condOk({ m: 'cpl', op: '>', v: 4 }, app) !== false);
ok('те саме для ціни реєстрації',
  condOk({ m: 'cpr', op: '>', v: 2 }, app) === null);
ok('і для ціни депозита',
  condOk({ m: 'cpp', op: '>', v: 2 }, app) === null);

/* ── 3. ЗВИЧАЙНА КАМПАНІЯ НЕ ЗМІНИЛАСЬ ──
   Без інсталів поведінка та сама, що й була: витратив більше за
   поріг і не дав жодного ліда — вимикаємо. */
const plainAd = agg({ spend: 24.44, leads: 0 });
ok('без інсталів ціна ліда діє, як і діяла',
  condOk({ m: 'cpl', op: '>', v: 4 }, plainAd) === true);
/* І межа «спершу витрать більше за поріг» лишилась. */
ok('а поки спенд менший за поріг — не знаємо',
  condOk({ m: 'cpl', op: '>', v: 40 }, plainAd) === null);

/* ── 4. ЦІНА КЛІКА НА АПКУ ПОШИРЮЄТЬСЯ ──
   Кліки є і в апок: нуль кліків при витратах — це справді дорого, а
   не «інша подія». Тому сюди послаблення не йде. */
const noClicks = agg({ spend: 24.44, installs: 9, linkClicks: 0 });
ok('ціна кліка на апці виносить вирок',
  condOk({ m: 'cpc_link', op: '>', v: 2 }, noClicks) === true,
  condOk({ m: 'cpc_link', op: '>', v: 2 }, noClicks));

/* ── 5. ПРАВИЛО НА ІНСТАЛИ ПРАЦЮЄ ── */
ok('дорогий інстал ловиться',
  condOk({ m: 'cpi', op: '>', v: 2 }, agg({ spend: 24.48, installs: 9 })) === true);
ok('дешевий — ні',
  condOk({ m: 'cpi', op: '>', v: 3 }, agg({ spend: 24.48, installs: 9 })) === false);

/* ── 6. ТРИ МІСЦЯ, ДЕ ЖИВЕ НОВЕ ПОЛЕ ──
   aggOf його рахує, а aggZero і addAgg мовчазні: забудеш — на
   оголошенні інстали є, на кампанії нуль, і ціна там нескінченна. */
ok('нуль знає про інстали', /installs: 0 \}/.test(FN), 'aggZero');
ok('складання рівнів теж', /to\.installs \+= from\.installs/.test(FN), 'addAgg');
ok('і подія названа тим самим іменем, що в дашборді',
  /INST_EVENT = 'mobile_app_install'/.test(FN), 'INST_EVENT');
const DASH = fs.readFileSync('build/cabdrill.js', 'utf8');
ok('а в дашборді — те саме', /CD_INST = 'mobile_app_install'/.test(DASH), 'CD_INST');

/* ── 7. І ЇХ ВИДНО НА СТОРІНЦІ ПРАВИЛ ── */
const RL = fs.readFileSync('build/rules.js', 'utf8');
ok('метрику можна вибрати у правилі', /k: 'cpi'/.test(RL) && /k: 'installs'/.test(RL), 'rules.js');
ok('і підказка каже, навіщо вона',
  /no lead events at all/.test(RL), 'tip');

/* ── 8. У ТЕЛЕГРАМІ ІНСТАЛИ ПІДПИСАНІ, А «0 ЛІДІВ» НЕ ВИГАДАНО ──

   Апп-кампанія не має подій ліда взагалі, тож «0 лідів» стоятиме в ній
   завжди — і в повідомленні, яке читають із телефона, це перше, на що
   падає око. Коли лідів немає, а інстали є, головним числом рядка
   мають бути інстали. */
const tgSrc = [
  grab(/function money[\s\S]*?\n}/, 'money'),
  grab(/function plural[\s\S]*?\n}/, 'plural'),
  grab(/function metricCounts[\s\S]*?\n}/, 'metricCounts'),
  grab(/function metricPrices[\s\S]*?\n}/, 'metricPrices')
].join('\n');
const tgPlain = tgSrc
  .replace(/\(h:\s*Hit\)/g, '(h)')
  .replace(/\(v:\s*number\)/g, '(v)')
  .replace(/\(n:\s*number,\s*one:\s*string,\s*few:\s*string,\s*many:\s*string\)/g,
           '(n, one, few, many)')
  .replace(/:\s*string\[\]\s*=/g, ' =')
  .replace(/\)\s*:\s*string\s*\{/g, ') {');
const tg = new Function('METRICS',
  tgPlain + '\nreturn { metricCounts, metricPrices };')(METRICS);

const line = o => tg.metricCounts({ agg: agg(o) });
const price = o => tg.metricPrices({ agg: agg(o) });

const appLine = line({ spend: 48, installs: 12 });
ok('в апп-кампанії інстали підписані', /12 інстал/.test(appLine), appLine);
ok('і «0 лідів» у ній не вигадано', !/лід/.test(appLine), appLine);
ok('а витрати лишились на місці', /\$48\.00/.test(appLine), appLine);

const both = line({ spend: 30, leads: 3, installs: 7 });
ok('де є і ліди, і інстали — видно обоє',
  /3 ліди/.test(both) && /7 інстал/.test(both), both);

const web = line({ spend: 20, leads: 0 });
ok('на веб-кампанії без інсталів «0 лідів» лишається',
  /0 лідів/.test(web), web);

ok('множина в інсталів жива, а не «інстал(ів)»',
  /1 інстал$/.test(line({ installs: 1 }))
  && /5 інсталів/.test(line({ installs: 5 })),
  [line({ installs: 1 }), line({ installs: 5 })]);

const cpi = price({ spend: 48, installs: 12 });
ok('ціну інстала теж видно', /CPI \$4\.00/.test(cpi), cpi);
ok('а ціни ліда без лідів немає', !/CPL/.test(cpi), cpi);

/* ── 9. ВЕРСІЯ ── */
const fnv = Number((FN.match(/FN_VERSION = 'rules-(\d+)'/) || [])[1]);
ok('версію функції піднято не нижче rules-13', fnv >= 13,
  (FN.match(/FN_VERSION = '[^']+'/) || [])[0]);

await done(null, null, []);
