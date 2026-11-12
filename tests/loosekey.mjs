/* ═══════════ ІМПОРТ: ОДНЕ ІМ'Я, НАПИСАНЕ ПО-РІЗНОМУ ═══════════

   1. «в фб 000_000, в кейтаро 000-000 … креативи також змінюють регістр
      … ігнорувати -_ типу не звертати уваги який».
   2. «одинакові оффери на KG TJ але срм захотіла оффер від TJ показувати
      під КГ».

   Функції дістаємо з Form.html і проганяємо по-справжньому. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 400) : '')); } };

const F = fs.readFileSync('Form.html', 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => { const a = F.indexOf(from), b = F.indexOf(to, a); return a >= 0 && b > a ? F.slice(a, b) : ''; };

/* ── ktid ── */
const ktSrc = cut('const looseKey = v =>', 'function campParse(');
ok('помічники є у Form.html', ktSrc.length > 200);
const kt = new Function('mappingDB', ktSrc + '\nreturn { looseKey, ktidIndexBuild, ktidCanon, ktidFind };');
const db = { funnels: {
  '10708-ry05': 'MPlayCasino_KG_vld 10708-ry05', '10708-kyqn': 'MPlayCasino2_KG_vld 10708-kyqn',
  'kyqn': 'MPlayCasino2_KG_vld kyqn', '11115 -kwwk': 'ChickenRoad2 GE 11115 -kwwk',
  'CR11116': 'Chicken Road [satorapps]', '11129-19393': 'MPlay AppHeroes KG 11129-19393',
  'ab-c': 'x', 'a-bc': 'y', 'gf': 'short' } };
const K = kt(db);
K.ktidIndexBuild();

ok('дефіс, підкреслення, пробіл і регістр не важать', K.looseKey('10708_RY05') === K.looseKey('10708-ry05')
  && K.looseKey('11115 -kwwk') === '11115kwwk');
ok('ktid приводиться до написання з мапінгу', K.ktidCanon('10708_ry05') === '10708-ry05'
  && K.ktidCanon('10708-RY05') === '10708-ry05' && K.ktidCanon('cr11116') === 'CR11116'
  && K.ktidCanon('11115-kwwk') === '11115 -kwwk', [K.ktidCanon('10708_ry05'), K.ktidCanon('11115-kwwk')]);
ok('точний збіг лишається як є', K.ktidCanon('kyqn') === 'kyqn' && K.ktidCanon('10708-kyqn') === '10708-kyqn');
ok('невідомий ktid не вигадується', K.ktidCanon('99999-zzzz') === '99999-zzzz' && K.ktidCanon('') === '');
ok('два різні ktid з однаковим «звучанням» не зводяться', K.ktidCanon('abc') === 'abc' && K.ktidCanon('ab-c') === 'ab-c');

ok('назва через дефіси: ktid знайдено в ній', K.ktidFind('vld-KG-10708-ry05-0611-003') === '10708-ry05');
ok('назва, де дефіс ktid став підкресленням', K.ktidFind('MPlayC_KG_10708_ry05_06/11_003') === '10708-ry05');
ok('із кількох збігів — найдовший', K.ktidFind('x_KG_10708-kyqn_1') === '10708-kyqn');
ok('у чужій назві нічого не знаходиться', K.ktidFind('totally_other_campaign_77') === '');
ok('короткий ktid у назві не шукаємо', K.ktidFind('big_gf_campaign') === '');

/* Розбір PWA-назви: шаблон не ліг → ktid із назви, гео з воронки. */
const pwSrc = cut('function parsePwaCampaign(campName, country, prov) {', '// Розбір назви APP-кампанії');
ok('розбір PWA шукає відомий ktid, коли шаблон не впорався', /const found = ktidFind\(campName\);/.test(pwSrc)
  && /mappingDB\.funnelGeo\[found\]/.test(pwSrc));
ok('ключі креативів теж порівнюються «на слух»', (F.match(/\$\{looseKey\((cr|row\.cid)\)\}/g) || []).length === 2);
ok('гео воронки читається разом із мапінгом', /mappingDB\.funnelGeo\[r\.ktid\] = String\(r\.geo \|\| ''\)/.test(F)
  && /ktidIndexBuild\(\);/.test(F));

/* ── офер за гео ── */
const offSrc = cut('const offBase = o =>', '/* ОФЕР ІЗ НАЗВИ');
const mk = (offers) => {
  const knownOffers = [...new Set(offers.map(o => o[0]))].sort((a, b) => b.length - a.length);
  const offerGeos = {};
  offers.forEach(([o, g]) => { (offerGeos[o.toUpperCase()] = offerGeos[o.toUpperCase()] || new Set()).add(g); });
  return new Function('knownOffers', 'offerGeos', offSrc + '\nreturn matchOffer;')(knownOffers, offerGeos);
};
/* Справжній довідник команди на 2026-11-12. */
const M = mk([['Pin-up[30]', 'TJ'], ['Pin-Up[30]', 'TJ'], ['Pin-Up[20]', 'KG'], ['PIN-UP[30$]', 'KG'],
  ['Zazino[50]', 'KG'], ['Zazino', 'KG'], ['Boostwin[52]', 'KG'], ['Boostwin[45]', 'TJ'], ['Pinco', 'TJ']]);

ok('Pin-Up на KG із «30$» у рядку → офер KG, а не TJ',
  M('Pin-Up | Wheel With Girl KG | 30$ | kg', 'KG') === 'PIN-UP[30$]', M('Pin-Up | Wheel With Girl KG | 30$ | kg', 'KG'));
ok('Pin-Up на KG із «20$» → інша версія того ж гео',
  M('Pin-Up | Directlink Sign-Up Page Short Reg KG | 20$ | kgfb', 'KG') === 'Pin-Up[20]');
ok('той самий бренд на TJ → офер TJ', /^pin-up\[30\]$/i.test(M('Pin-Up | Wheel TJ | 30$ | tj', 'TJ')), M('Pin-Up | Wheel TJ | 30$ | tj', 'TJ'));
ok('Boostwin: KG і TJ розходяться по своїх версіях', M('[Partners] Boostwin KG | Reg', 'KG') === 'Boostwin[52]'
  && M('[Partners] Boostwin TJ | Reg', 'TJ') === 'Boostwin[45]');
ok('повна назва з дужками в рядку перемагає гео', M('offer Boostwin[45] something', 'KG') === 'Boostwin[45]');
ok('гео невідоме — поведінка як була', M('Zazino KG | Reg', '??') !== '' && M('Zazino KG | Reg') !== '');
ok('під гео рядка версій немає — лишається як було', M('Pinco UZ | Reg', 'UZ') === 'Pinco');
ok('чужого бренду не приписуємо', M('Some Other Brand | Reg', 'KG') === '');
ok('імпорт передає гео рядка в розпізнавання офера', /matchOffer\(r\[io\], landGeo \|\| geo\)/.test(F));

/* ── шаблон PWA з будь-яким роздільником ──
   «для пва просто додай патерн … я сам придумаю назву і впишу». */
const L = fs.readFileSync('index-legacy.html', 'utf8').replace(/\r\n/g, '\n');
const grab = (src, name) => (src.match(new RegExp('function ' + name + '\\(mask\\) \\{[\\s\\S]*?\\n\\}\\n')) || [''])[0];
const compF = new Function('const AP_MASK_CACHE = new Map();\n' + grab(F, 'apMaskCompile') + '\nreturn apMaskCompile;')();
const compL = new Function('const PW_MASK_CACHE = new Map();\n' + grab(L, 'pwMaskCompile') + '\nreturn pwMaskCompile;')();
const run = (comp, mask, name) => {
  const c = comp(mask), m = c && c.re.exec(name);
  if (!m) return null;
  const o = {}; c.keys.forEach((k, i) => { o[k] = String(m[i + 1] || '').trim(); });
  return o;
};
const CASES = [
  ['*_{geo}_{ktid}', 'Melbet_EG_10864-9lm5_19/09_001'],
  ['*_{geo}_{ktid}', 'MPlayC_KG_10708-ry05_06/11 003'],
  ['{ktid} {geo} *', '10708RY05 KG MPlayC 0611 003'],
  ['{ktid} {geo}', '10708RY05 KG MPlayC 0611 003'],
  ['{ktid} {geo}*', '10708RY05 KG'],
  ['{ktid} | {geo} | *', '10708RY05 | KG | MPlayC | 0611'],
  ['* {geo} {ktid}', 'MPlayC KG 10708RY05 0611'],
  ['{geo}.{ktid}.*', 'KG.10708RY05.MPlayC.0611'],
  ['{ktid} {geo} *', 'no-geo-here'],
  ['*&sub1={ktid}&geo={geo}', 'x=1&sub1=ABC123&geo=TJ&z=9']
];
ok('Form і дашборд розбирають назву однаково на всіх шаблонах',
  CASES.every(([m, n]) => JSON.stringify(run(compF, m, n)) === JSON.stringify(run(compL, m, n))),
  CASES.map(([m, n]) => [m, run(compF, m, n), run(compL, m, n)]));
const P = (m, n) => run(compF, m, n) || {};
ok('старий шаблон через «_» працює як і раніше', P('*_{geo}_{ktid}', 'Melbet_EG_10864-9lm5_19/09_001').geo === 'EG'
  && P('*_{geo}_{ktid}', 'Melbet_EG_10864-9lm5_19/09_001').ktid === '10864-9lm5'
  && P('*_{geo}_{ktid}', 'MPlayC_KG_10708-ry05_06/11 003').ktid === '10708-ry05');
ok('шаблон із пробілами: ktid і гео', P('{ktid} {geo} *', '10708RY05 KG MPlayC 0611 003').ktid === '10708RY05'
  && P('{ktid} {geo} *', '10708RY05 KG MPlayC 0611 003').geo === 'KG');
ok('останнє поле шаблону бере одне слово, а не весь хвіст', P('{ktid} {geo}', '10708RY05 KG MPlayC 0611 003').geo === 'KG'
  && P('* {geo} {ktid}', 'MPlayC KG 10708RY05 0611').ktid === '10708RY05', P('{ktid} {geo}', '10708RY05 KG MPlayC 0611 003'));
ok('поле перед «*» не тягнеться до кінця назви', P('{ktid} {geo}*', '10708RY05 KG').geo === 'KG');
ok('риски й крапки теж годяться', P('{ktid} | {geo} | *', '10708RY05 | KG | MPlayC | 0611').geo === 'KG'
  && P('{geo}.{ktid}.*', 'KG.10708RY05.MPlayC.0611').ktid === '10708RY05');
ok('шаблон із «&» лишився як був', P('*&sub1={ktid}&geo={geo}', 'x=1&sub1=ABC123&geo=TJ&z=9').ktid === 'ABC123'
  && P('*&sub1={ktid}&geo={geo}', 'x=1&sub1=ABC123&geo=TJ&z=9').geo === 'TJ');
ok('назва не за шаблоном — не розбирається', run(compF, '{ktid} {geo} *', 'no-geo-here') === null);
ok('біля поля шаблону сказано про пробіли', /\{ktid\} \{geo\} \*<\/span> reads/.test(F));

/* ── свій шаблон у кожного постачальника ──
   «Можеш додати типу як постачальник і шаблон, в кейтаро якщо що ми в
   source передаємо інфу про постачальника». */
const provSrc = cut('let pwaProvMasks = {};', '/* ═══════════ PWA: налаштування шаблону ═══════════ */');
ok('блок шаблонів постачальників є', provSrc.length > 300);
const mkProv = (funnels, main, provs) => {
  const mappingDB = { funnels };
  const env = new Function('mappingDB', 'pwaMask', 'COUNTRY_TO_ISO',
    'const AP_MASK_CACHE = new Map();\n' + grab(F, 'apMaskCompile')
    + (F.match(/function apParseMask\(mask, parts, adName, country\) \{[\s\S]*?\n\}\n/) || [''])[0]
    + ktSrc + provSrc
    + '\npwaProvMasks = ' + JSON.stringify(provs) + ';\nktidIndexBuild();'
    + '\nreturn { pwaParseAny, pwaProvParse, pwaProvText, pwaMasksFor };');
  return env(mappingDB, main, { kyrgyzstan: 'KG' });
};
const FUN = { '10708-ry05': 'MPlayCasino_KG_vld 10708-ry05', 'SKAK4HE1': 'MPlay_KG [SkakApp]', '1112919393': 'MPlay AppHeroes KG' };
const PV = mkProv(FUN, '*_{geo}_{ktid}', { skakapp: '{ktid} {geo} *', appheroes: '*-{geo}-{ktid}' });

const t1 = PV.pwaProvParse('SkakApp = {ktid} {geo} *\n\n  appheroes=*-{geo}-{ktid}  \nrubbish line\n= nothing');
ok('список «постачальник = шаблон» читається, регістр назви не важить',
  JSON.stringify(t1) === JSON.stringify({ skakapp: '{ktid} {geo} *', appheroes: '*-{geo}-{ktid}' }), t1);
ok('і пишеться назад у тому ж вигляді', PV.pwaProvText(t1) === 'appheroes = *-{geo}-{ktid}\nskakapp = {ktid} {geo} *');

const k1 = PV.pwaParseAny('SKAK4HE1 KG MPlay 0611 003', 'skakapp');
ok('рядок Keitaro: шаблон свого постачальника', k1 && k1.ktid === 'SKAK4HE1' && k1.geo === 'KG' && k1._mask === '{ktid} {geo} *', k1);
const k2 = PV.pwaParseAny('SKAK4HE1 KG MPlay 0611 003', 'SkakApp');
ok('назва постачальника зі стовпця Source — у будь-якому регістрі', k2 && k2.ktid === 'SKAK4HE1');
const f1 = PV.pwaParseAny('SKAK4HE1 KG MPlay 0611 003');
ok('рядок Facebook постачальника не знає — шаблон знаходиться сам', f1 && f1.ktid === 'SKAK4HE1' && f1.geo === 'KG', f1);
const f2 = PV.pwaParseAny('MPlayC_KG_10708-ry05_06/11 003');
ok('стара назва через «_» читається загальним шаблоном', f2 && f2.ktid === '10708-ry05' && f2.geo === 'KG' && f2._mask === '*_{geo}_{ktid}', f2);
const f3 = PV.pwaParseAny('vld-KG-1112919393');
ok('третій постачальник — своїм шаблоном через дефіси', f3 && f3.ktid === '1112919393' && f3.geo === 'KG' && f3._mask === '*-{geo}-{ktid}', f3);
const f4 = PV.pwaParseAny('SKAK4HE1 KG MPlay 0611 003', 'appheroes');
ok('чужий постачальник у Source не заважає знайти правильний шаблон', f4 && f4.ktid === 'SKAK4HE1', f4);
const f5 = PV.pwaParseAny('NEWONE1 TJ Something', 'skakapp');
ok('нова воронка, якої ще немає в мапінгу, теж розбирається', f5 && f5.ktid === 'NEWONE1' && f5.geo === 'TJ', f5);
const f6 = PV.pwaParseAny('just some words here');
ok('назва не за жодним шаблоном — нічого не вигадуємо', !f6 || !/^[A-Za-z]{2}$/.test(String(f6.geo || '')), f6);

const PLAIN = mkProv(FUN, '*_{geo}_{ktid}', {});
const p1 = PLAIN.pwaParseAny('Melbet_EG_10864-9lm5_19/09_001');
ok('без списку постачальників усе як раніше', p1 && p1.geo === 'EG' && p1.ktid === '10864-9lm5', p1);
ok('порядок: свій, загальний, решта', JSON.stringify(PV.pwaMasksFor('skakapp')) === JSON.stringify(['{ktid} {geo} *', '*_{geo}_{ktid}', '*-{geo}-{ktid}']),
  PV.pwaMasksFor('skakapp'));

ok('Keitaro передає постачальника зі стовпця Source у розбір назви', /campParse\(campRaw, '', '', false, undefined, rowProv\)/.test(F));
ok('визначення «PWA чи прілка» теж бачить усі шаблони', /const r = pwaParseAny\(campName\);/.test(F));
ok('шаблони зберігаються разом із загальним', /tsSave\('pwa_parse', \{ mask, prov \}/.test(F));
ok('шаблон постачальника без {ktid} зберегти не дасть', /has no \{ktid\}\. Add it before saving/.test(F));
ok('у Form є поле зі списком і підказка', /id="pwa-prov"/.test(F) && /provider = pattern/.test(F));
ok('перевірка на зразку каже, який шаблон спрацював', /matched by \$\{who \? 'provider '/.test(F));
ok('дашборд теж читає шаблони постачальників', /pwMaskMore = Object\.keys\(pv\)/.test(L) && /for \(const m of pwMaskMore\)/.test(L));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
