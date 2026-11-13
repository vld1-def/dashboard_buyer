/* ═══════════ FORM: ВОРОНКИ ЗА ГЕО РЯДКА ═══════════

   «У форм щоб воронки підтягувались під гео яке виставленне коли руками
   вписую».

   У таблиці записів список воронок лише сортувався: свої першими, а за
   ними весь довідник. І гео воронки бралось тільки з уже наявних записів
   — нова воронка, яка ще не крутилась, свого гео не мала. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 400) : '')); } };

const F = fs.readFileSync('Form.html', 'utf8').replace(/\r\n/g, '\n');
const a = F.indexOf("let recFunGeoCache = { table: '', n: -1, map: null };");
const b = F.indexOf('/* ГЕО — СПИСОК, А НЕ ВІЛЬНИЙ РЯДОК.');
ok('функції є у Form.html', a > 0 && b > a);

const mk = (rows, funnels, funnelGeo) => new Function('recRows', 'recCurrentTable', 'mappingDB',
  'const apFunnelData = k => mappingDB.funnels[k] || "";\n'
  + 'const recListValues = () => [...new Set([...Object.values(mappingDB.funnels), ...recRows.map(r => r.funnel).filter(Boolean)])].sort();\n'
  + F.slice(a, b) + '\nreturn { recFunnelOptions, recFunnelOptionsFor, recFunnelGeos };')(rows, 'daily_stats', { funnels, funnelGeo });

const FUN = { '10708-ry05': 'MPlayCasino_KG_vld', '10708-y3wz': 'MPlay_KG_vld', 'CFR11003': 'Chicken Fortune Road [satorapps]',
  '11115-yre8': 'Mega Slots GE', 'NEW1': 'Brand New TJ', 'NOGEO': 'Somewhere' };
const GEO = { '10708-ry05': 'KG', '10708-y3wz': 'kg', 'CFR11003': 'TJ', '11115-yre8': 'GE', 'NEW1': 'TJ', 'NOGEO': '' };
const ROWS = [{ funnel: 'MPlayCasino_KG_vld', geo: 'KG' }, { funnel: 'Chicken Fortune Road [satorapps]', geo: 'TJ' },
  { funnel: 'Old One', geo: 'UZ' }];
const R = mk(ROWS, FUN, GEO);

const kg = R.recFunnelOptionsFor('KG').map(o => o.v);
ok('гео KG — у списку лише воронки KG', JSON.stringify(kg) === JSON.stringify(['MPlay_KG_vld', 'MPlayCasino_KG_vld']), kg);
const tj = R.recFunnelOptionsFor('tj').map(o => o.v);
ok('гео в будь-якому регістрі; нова воронка з довідника теж тут',
  JSON.stringify(tj) === JSON.stringify(['Brand New TJ', 'Chicken Fortune Road [satorapps]']), tj);
ok('гео воронки береться і з довідника, не лише з записів', [...R.recFunnelGeos().get('Brand New TJ')].join() === 'TJ'
  && [...R.recFunnelGeos().get('MPlay_KG_vld')].join() === 'KG');
const none = R.recFunnelOptionsFor('').map(o => o.v);
ok('гео не вибране — показуємо всі', none.length === 7, none);
const br = R.recFunnelOptionsFor('BR').map(o => o.v);
ok('для гео ще нічого не заведено — теж усі, а не порожньо', br.length === 7, br);
ok('воронка з записів, якої немає в довіднику, знаходиться за своїм гео',
  R.recFunnelOptionsFor('UZ').map(o => o.v).join() === 'Old One');
ok('повний список, як і раніше, починається зі своїх', R.recFunnelOptions('GE')[0].v === 'Mega Slots GE'
  && R.recFunnelOptions('GE').length === 7);

ok('клітинка бере відфільтрований список', /dl\.innerHTML = recFunnelOptionsFor\(geo\)/.test(F));
ok('гео читається живим із клітинки рядка', /row\.querySelector\('\.rec-geo'\)/.test(F));
ok('масова правка лишилась із повним списком', /\? recFunnelOptions\(''\)/.test(F));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
