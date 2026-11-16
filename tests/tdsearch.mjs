/* ═══════════ STAT. DAY: ПОШУК ═══════════

   «в stat.day додай пошук».

   Збіг (tdHit) дістаємо з джерела й проганяємо на рядках, якими їх
   бачить таблиця. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 500) : '')); } };

const TD = fs.readFileSync('build/today.js', 'utf8').replace(/\r\n/g, '\n');
const OUT = fs.readFileSync('index.html', 'utf8');

const loose = (TD.match(/const tdLoose = .*\n/) || [''])[0];
const a = TD.indexOf('let tdQ = \'\';');
const b = TD.indexOf('// Скільки відсотків спенду таблиці');
const { tdHit } = new Function(loose + TD.slice(a, b) + '\nreturn { tdHit };')();

const row = { geo: 'KG', acc: '1835964327750715', cab: 'Farm 7', br: '4175', fn: 'Crazy Wheel',
              cr: 'KG_JS_674', camp: 'MPlayC_KG_10708-ry05_07/11' };
const tj = { geo: 'TJ', acc: '1035842112877985', cab: '3', br: '4327', fn: 'Aviator', cr: 'TJ_6nI2a', camp: 'cy638t_LTR11003_TJ' };

ok('порожній пошук пропускає все', tdHit(row, '') && tdHit(row, '   '));
ok('креатив — за шматком назви, без огляду на регістр', tdHit(row, 'js_674') && tdHit(row, 'JS_674') && !tdHit(tj, 'js_674'));
ok('кабінет — за ID і за назвою', tdHit(row, '7750715') && tdHit(row, 'farm') && !tdHit(tj, 'farm'));
ok('браузер, воронка, гео, кампанія', tdHit(row, '4175') && tdHit(row, 'crazy') && tdHit(tj, 'tj') && tdHit(row, 'mplayc'));
ok('кілька слів — усі мусять знайтись', tdHit(row, 'kg 674') && !tdHit(row, 'tj 674') && tdHit(tj, 'aviator 4327'));
ok('дефіс, підкреслення й пробіл не розрізняються', tdHit(row, '10708_ry05') && tdHit(row, '10708 ry05') && tdHit(row, 'js-674') && tdHit(row, 'crazywheel'));
ok('чого немає — того не знаходить', !tdHit(row, 'zzz') && !tdHit(row, 'kg zzz'));
ok('порожні поля рядка не ламають пошук', tdHit({ geo: 'KG', acc: '1', cab: null, br: undefined, fn: '', cr: 'x', camp: '' }, 'kg') === true);

ok('знайдене розкривається саме', /open = !!tdQ \|\| tdOpenSet\.has\(id\)/.test(TD));
ok('таблиця малює лише знайдене, а підсумок каже скільки', /const shown = tdQ \? rows\.filter\(x => tdHit\(x, tdQ\)\) : rows;/.test(TD)
  && /tdTree\(shown, TD_VIEWS\[tdMode\]\)/.test(TD) && /'Found \\u00b7 ' \+ shown\.length \+ ' of ' \+ rows\.length/.test(TD));
ok('нічого не знайдено — сказано словами', /Nothing matches/.test(TD));
ok('поле стоїть у шапці вікна й перемальовує таблицю', /<input id="td-q" class="td-q"/.test(TD)
  && /querySelector\('#td-q'\)\.addEventListener\('input'/.test(TD));
ok('Esc спершу стирає пошук, потім закриває вікно', /if \(tdQ && q\) \{ q\.value = ''; tdQ = ''; tdRender\(\); return; \}/.test(TD));
ok('і це доїхало в зібраний index.html', /function tdHit\(x, q\)/.test(OUT) && /\.td-q \{/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
