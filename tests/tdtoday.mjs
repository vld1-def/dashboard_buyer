/* ═══════════ ВІКНО TODAY: ГЕО, ВОРОНКА, КРЕАТИВ ═══════════

   «Групування по гео, кабам, сразу визначення воронок, і список з
   крео (якщо одинакові крео збирати всю інфу в одне)».

   Стенд без браузера: справжні today.js, cabdrill.js і розбір маски з
   index-legacy.html, підмінені лише база й знімок. Назви кампаній —
   живі, з fb_ad_today за 2026-11-07. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const legacy = fs.readFileSync('index-legacy.html', 'utf8');
const cab = fs.readFileSync('build/cabdrill.js', 'utf8');
const td = fs.readFileSync('build/today.js', 'utf8').replace(/^<script>|<\/script>\s*$/g, '');
const pick = (s, re, w) => { const m = s.match(re); ok('є ' + w, !!m); return m ? m[0] : ''; };
const helpers = [
  pick(legacy, /const PW_DEFAULT_MASK[^\n]*\n/, 'PW_DEFAULT_MASK'),
  "let pwMask = '*_{geo}_{ktid}'; const PW_MASK_CACHE = new Map();",
  pick(legacy, /function pwMaskCompile[\s\S]*?\n}\n/, 'pwMaskCompile'),
  pick(legacy, /function pwMaskParse[\s\S]*?\n}\n/, 'pwMaskParse'),
  pick(cab, /const CD_LEAD_DEFAULT[\s\S]*?;\n/, 'CD_LEAD_DEFAULT'),
  pick(cab, /const cdLeadBase = [\s\S]*?_grouped\$\/, ''\);\n/, 'cdLeadBase'),
  pick(cab, /function cdLeadCount[\s\S]*?\n}\n/, 'cdLeadCount'),
  pick(cab, /const CD_INST[^\n]*\n/, 'CD_INST'),
  pick(cab, /function cdPick[\s\S]*?\n}\n/, 'cdPick')
].join('\n');

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null };
const T = new Function(helpers + '\nlet cabSnapRows = [], cabSnapErr = "";\n' + td
  + '\nreturn { tdRow, tdSum, setMaps: m => { tdMaps = m; }, TD_VIEWS };')();

T.setMaps({
  cab: new Map([['3191102584433243', 'Zlata Garacheva'], ['1403209798694635', '3']]),
  br: new Map([['3191102584433243', '4327'], ['1403209798694635', '4175']]),
  fn: new Map([['cfr11003', { name: 'Chicken Fortune Road [satorapps]', geo: 'TJ' }],
               ['10708-y3wz', { name: 'MPlay KG', geo: 'KG' }]])
});

/* 1. Веб-кампанія: маска *_{geo}_{ktid} спрацьовує сама. */
const kg = T.tdRow({ account_id: '1403209798694635', name: 'KG_JS_633',
  campaign_name: 'MPlay_KG_10708-y3wz_07/11 001', spend: '5.65', impressions: '447', link_clicks: 0,
  actions: [{ action_type: 'lead', value: '2' }, { action_type: 'offsite_conversion.fb_pixel_lead', value: '2' }] });
ok('веб: гео з маски', kg.geo === 'KG', kg);
ok('веб: воронка за ktid з маски', kg.fn === 'MPlay KG' && !kg.fnBad, kg);
ok('ліди не подвоюються (lead + fb_pixel_lead — ті самі два)', kg.l === 2, kg.l);
ok('кабінет і браузер підписані', kg.cab === '3' && kg.br === '4175', kg);

/* 2. Апкова кампанія: маска бере не той шматок — шукаємо ключ серед шматків. */
const tj = T.tdRow({ account_id: '3191102584433243', name: 'TJ_AB_592',
  campaign_name: 'cy638t_8wxg7hf7_bGcTwMmV_CFR11003_3191102584433243_TJ', spend: '50.78',
  impressions: '12927', link_clicks: '147',
  actions: [{ action_type: 'mobile_app_install', value: '59' },
            { action_type: 'complete_registration', value: '28' }, { action_type: 'purchase', value: '5' }] });
ok('апка: воронка знайдена серед шматків назви', tj.fn === 'Chicken Fortune Road [satorapps]' && !tj.fnBad, tj);
ok('апка: гео — з воронки, а не «8W» з маски', tj.geo === 'TJ', tj.geo);
ok('інстали, реєстрації, депозити', tj.i === 59 && tj.r === 28 && tj.d === 5, tj);

/* 3. Невідомий ключ — не вгадуємо, а кажемо. */
const un = T.tdRow({ account_id: '1', name: 'GE_1', campaign_name: 'Slots_GE_11115-kwwk_01/11',
  spend: '3', impressions: '10' });
ok('ключа немає в мапінгу — «Unknown (ktid)» і позначка', un.fn === 'Unknown (11115-kwwk)' && un.fnBad, un);
ok('гео при цьому з маски', un.geo === 'GE', un.geo);

/* 4. Однакова назва — один креатив. */
const rows = [kg, { ...kg, acc: '999', s: 3 }, tj];
const key = T.TD_VIEWS.cre[0][0];
const groups = new Map(); rows.forEach(r => { const k = key(r); groups.set(k, (groups.get(k) || []).concat(r)); });
ok('однакові назви з різних кабінетів — один рядок', groups.get('KG_JS_633').length === 2 && groups.size === 2);
ok('і суми складаються', Math.abs(T.tdSum(groups.get('KG_JS_633')).s - 8.65) < 1e-9);

/* 5. Проводка: знімок перечитали — вікно знає. */
const CJ = fs.readFileSync('build/cabinets.js', 'utf8');
ok('cabSnapLoad тримає сирі рядки', /cabSnapRows = rows\.filter/.test(CJ));
ok('і кличе tdOnSnap після кожного перечитування', /if \(typeof tdOnSnap === 'function'\) tdOnSnap\(\);/.test(CJ));
ok('кнопка Today поруч із Rules', /id="cab-today-btn" onclick="tdToggle\(\)"/.test(fs.readFileSync('build/cabinets.html', 'utf8')));
const built = fs.readFileSync('index.html', 'utf8');
ok('усе це доїхало в зібраний index.html', /window\.tdToggle = async function/.test(built)
  && /id="cab-today-btn"/.test(built) && /\.td-ov \{/.test(built));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
