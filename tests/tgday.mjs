/* ═══════════ БОТ: STAT. DAY — ЗВІТ ЗА СЬОГОДНІ ПО ГЕО ═══════════

   «Кнопка в тг яка формує звіт за сьогодні по лайв кабам (fb today),
   скільки по гео спенда і показники» + «кнопку Зведення видалити, і
   замість неї буде нова».

   Справжній cardDay з бота, підмінений лише pick (запити до бази).
   Типи знімає сам Node. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 500) : '')); } };

const FN = fs.readFileSync('supabase/functions/telegram-bot/index.ts', 'utf8');
const grab = (re, w) => { const m = FN.match(re); ok('є ' + w, !!m); return m ? m[0] : ''; };
const src = [
  'type Act = any; type DayAgg = any;',
  grab(/const num = [^\n]*/, 'num'),
  grab(/const LEAD_EVENTS[\s\S]*?\];/, 'LEAD_EVENTS'),
  grab(/const leadBase = [\s\S]*?_grouped\$\/, ''\);/, 'leadBase'),
  grab(/function leadCount[\s\S]*?\n}/, 'leadCount'),
  grab(/function pickAct[\s\S]*?\n}/, 'pickAct'),
  grab(/const EV_REG[^\n]*/, 'EV_REG'), grab(/const EV_DEP[^\n]*/, 'EV_DEP'), grab(/const EV_INST[^\n]*/, 'EV_INST'),
  grab(/const SNAP_PAGE = [^\n]*/, 'SNAP_PAGE'), grab(/const SNAP_PAGES = [^\n]*/, 'SNAP_PAGES'),
  grab(/const DAY_MASK[\s\S]*?async function cardDay[\s\S]*?\n}\n/, 'cardDay')
].join('\n');

const now = new Date();
const iso = m => new Date(now.getTime() - m * 60000).toISOString();
const DB = {
  fb_accounts: [{ account_id: '1403209798694635', timezone_name: 'Asia/Bishkek' },
                { account_id: '3191102584433243', timezone_name: 'Asia/Dushanbe' },
                { account_id: '2890064408040391', timezone_name: 'Asia/Tashkent' }],
  team_settings: [{ value: '{"mask":"*_{geo}_{ktid}"}' }],
  funnels_mapping: [{ ktid: 'CFR11003', geo: 'TJ' }, { ktid: '10708-y3wz', geo: 'KG' }],
  fb_ad_today: [
    { account_id: '1403209798694635', name: 'KG_JS_633', campaign_name: 'MPlay_KG_10708-y3wz_07/11 001',
      spend: '5.65', impressions: '447', link_clicks: 0, seen_at: iso(12),
      actions: [{ action_type: 'lead', value: '2' }, { action_type: 'offsite_conversion.fb_pixel_lead', value: '2' }] },
    { account_id: '1403209798694635', name: '633_DV_KG', campaign_name: 'MPlay_KG_10708-y3wz_07/11 003',
      spend: '6.44', impressions: '1419', link_clicks: '8', seen_at: iso(12), actions: [] },
    { account_id: '3191102584433243', name: 'TJ_AB_592',
      campaign_name: 'cy638t_8wxg7hf7_bGcTwMmV_CFR11003_3191102584433243_TJ', spend: '50.78',
      impressions: '12927', link_clicks: '147', seen_at: iso(20),
      actions: [{ action_type: 'mobile_app_install', value: '59' },
                { action_type: 'complete_registration', value: '28' }, { action_type: 'purchase', value: '5' }] },
    // давній рядок — «UZ, яке я не лив цього місяця»
    { account_id: '2890064408040391', name: 'UZ_1', campaign_name: 'Slots_UZ_LTR10964_01',
      spend: '11.16', impressions: '1174', link_clicks: '34', seen_at: '2026-10-06T13:59:50Z', actions: [] }
  ]
};
const pick = async (_b, _h, path) => DB[path.split('?')[0]] ? (path.includes('offset=') && !path.includes('offset=0') ? [] : DB[path.split('?')[0]]) : [];
const { cardDay } = new Function('pick', stripTypeScriptTypes(src) + '\nreturn { cardDay };')(pick);

const t = await cardDay('B', {}, 'u', '');
console.log('\n' + t + '\n');
ok('заголовок Stat. Day і вік синку', /^📈 Stat\. Day · \d\d\.\d\d · last sync 12 min ago\n/.test(t), t.split('\n')[0]);
ok('підсумок: спенд, кліки, ліди й інстали', /💸 \$62\.87 · 🖱 155 · 📲 2 L · 59 I\n/.test(t), t);
ok('реєстрації й депозити', /📝 28 regs · 💰 5 deps\n/.test(t), t);
ok('гео TJ (з воронки, хоч маска дала «8wxg7hf7»)', /🌍 TJ\n💸\$50\.78 🖱147 📲59 📝28 💰5\nCPC \$0\.35 · CPI \$0\.86 · CPA \$10\.16/.test(t), t);
ok('гео KG (з маски), ліди не подвоєні', /🌍 KG\n💸\$12\.09 🖱8 📲2 📝0 💰0\nCPC \$1\.51 · CPL \$6\.05/.test(t), t);
ok('TJ вище за KG — сортування за спендом', t.indexOf('🌍 TJ') < t.indexOf('🌍 KG'));
ok('давнього UZ у звіті немає', !/UZ/.test(t), t);
ok('і про сховане сказано', /⚠ 1 cabinet\(s\) not synced today — not counted/.test(t), t);
ok('текст звіту англійською', !/[А-Яа-яІіЇїЄєҐґ]/.test(t));

/* Кнопка. */
ok('на клавіатурі Stat. Day замість «Зведення»',
  /keyboard: \[\[\{ text: B_DAY \}, \{ text: B_SPEND \}\]/.test(FN));
ok('стара «Зведення» ще відповідає, поки клавіатура не оновилась', /\[B_SUM\]: 'sum'/.test(FN));
ok('кнопка й /day ведуть у той самий звіт', /\[B_DAY\]: 'day'/.test(FN) && /'\/day': 'day'/.test(FN));
ok('звіт іде після оновлення синку, як і решта', /const f = await freshen\(base, hdr, link\.user_id\);\n\s*if \(kind === 'day'\)/.test(FN));
const v = Number((FN.match(/FN_VERSION = 'bot-(\d+)'/) || [])[1]);
ok('версія бота не нижче bot-14', v >= 14, v);

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
