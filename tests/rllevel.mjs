/* ═══════════ КАМПАНІЯ Й АДСЕТ — ЦИФРАМИ FACEBOOK, А НЕ СУМОЮ АКТИВНИХ ═══════════

   Правило рівня кампанії складало її з АКТИВНИХ оголошень. Вимкнене
   сьогодні раніше оголошення зникало з суми разом зі своїми лідами.

     A — $20, 4 ліди, вимкнене опівдні
     B — $10, 0 лідів, активне
     правило: кампанія, CPL > $8

   Справжній CPL $30/4 = $7.50 — вимикати нема за що. Сума активних
   бачила лише B: CPL ∞ — і вимикала робочу кампанію.

   Стенд без браузера й без Playwright: шматки функції + підмінений
   fetch. Типи знімає сам Node. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (what, cond, extra) => {
  if (cond) { pass++; console.log('ok   ' + what); }
  else { fail++; console.log('FAIL ' + what + (extra !== undefined ? '\n       ' + JSON.stringify(extra).slice(0, 400) : '')); }
};

const FN = fs.readFileSync('supabase/functions/fb-rules/index.ts', 'utf8');
const grab = (re, what) => { const m = FN.match(re); ok('є ' + what, !!m); return m ? m[0] : ''; };

const src = [
  'type Json = any; type Agg = any; type Ent = any; type Rule = any; type Cond = any;',
  "const GRAPH = 'G';",
  grab(/const LIVE_LIMIT = [^\n]*/, 'LIVE_LIMIT'),
  grab(/const METRICS[\s\S]*?\n};/, 'METRICS'),
  grab(/const PER_ONE[\s\S]*?\n};/, 'PER_ONE'),
  grab(/const APP_BLIND = \[[^\]]*\];/, 'APP_BLIND'),
  grab(/function condOk[\s\S]*?\n}/, 'condOk'),
  grab(/function ruleHits[\s\S]*?\n}/, 'ruleHits'),
  grab(/function leadBase[\s\S]*?\n}/, 'leadBase'),
  grab(/function leadCount[\s\S]*?\n}/, 'leadCount'),
  grab(/function pickEvent[\s\S]*?\n}/, 'pickEvent'),
  grab(/const REG_EVENT[^\n]*/, 'REG_EVENT'), grab(/const BUY_EVENT[^\n]*/, 'BUY_EVENT'),
  grab(/const INST_EVENT[^\n]*/, 'INST_EVENT'),
  grab(/function aggOf[\s\S]*?\n}/, 'aggOf'),
  grab(/function aggZero[\s\S]*?\n}/, 'aggZero'),
  grab(/function addAgg[\s\S]*?\n}/, 'addAgg'),
  grab(/function atLevel[\s\S]*?\n}/, 'atLevel'),
  grab(/async function levelOf[\s\S]*?\n}/, 'levelOf')
].join('\n');

let lastUrl = '', answer = null;
const fakeFetch = async (url) => { lastUrl = url;
  return { ok: true, json: async () => answer }; };
const fx = new Function('fetch', stripTypeScriptTypes(src)
  + '\nreturn { levelOf, atLevel, ruleHits };')(fakeFetch);

const LEADS = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
const rule = { level: 'campaign', match: 'all', minSpend: 5, when: [{ m: 'cpl', op: '>', v: 8 }] };

/* Як було: живий список — лише активне B. */
const activeAds = [{ id: 'B', name: 'B', level: 'ad', account: '1', adset: 's1', adsetName: 'S',
  campaign: 'C1', campaignName: 'MPlay_KG_10708', agg: { spend: 10, imps: 500, clicks: 5,
  linkClicks: 4, leads: 0, regs: 0, purchases: 0, installs: 0 } }];
const oldCamp = fx.atLevel(activeAds, 'campaign')[0];
ok('стара сума бачить лише активне: $10 і 0 лідів', oldCamp.agg.spend === 10 && oldCamp.agg.leads === 0, oldCamp.agg);
ok('і через це правило вимкнуло б робочу кампанію', fx.ruleHits(rule, oldCamp.agg) === true);

/* Як тепер: Facebook віддає кампанію цілком — A + B. */
answer = { data: [{ campaign_id: 'C1', campaign_name: 'MPlay_KG_10708', spend: '30',
  impressions: '1500', clicks: '20', inline_link_clicks: '15',
  actions: [{ action_type: 'lead', value: '4' }, { action_type: 'offsite_conversion.fb_pixel_lead', value: '4' }] }] };
const notes = [];
const now = await fx.levelOf('tok', '1', 'campaign', LEADS, m => notes.push(m));
ok('кампанія одна, з власним id і назвою', now.length === 1 && now[0].id === 'C1'
  && now[0].name === 'MPlay_KG_10708' && now[0].level === 'campaign', now);
ok('у ній увесь спенд і всі ліди дня: $30, 4 (не 8 — дублікати подій не складаються)',
  now[0].agg.spend === 30 && now[0].agg.leads === 4, now[0].agg);
ok('посилальні кліки взяті з inline_link_clicks', now[0].agg.linkClicks === 15, now[0].agg);
ok('CPL $7.50 — правило «CPL > $8» більше не вимикає робочу кампанію',
  fx.ruleHits(rule, now[0].agg) === false);
ok('у кампанії немає адсета — перевірка «батька вже вимкнули» не зачепить чужий',
  now[0].adset === '' && now[0].adsetName === '');

/* Запит. */
ok('питаємо insights кабінета', /^G\/act_1\/insights\?/.test(lastUrl), lastUrl);
ok('на рівні кампанії', /[?&]level=campaign/.test(lastUrl), lastUrl);
ok('за сьогодні в поясі кабінета', /date_preset=today/.test(lastUrl), lastUrl);
const filt = decodeURIComponent((lastUrl.match(/filtering=([^&]*)/) || [])[1] || '');
ok('лише ті, що зараз ACTIVE', /"campaign\.effective_status"/.test(filt) && /"ACTIVE"/.test(filt), filt);
ok('токен не в адресі', !/access_token|tok/.test(lastUrl), lastUrl);

/* Адсет. */
answer = { data: [{ campaign_id: 'C1', campaign_name: 'Camp', adset_id: 'S1', adset_name: 'Set', spend: '12' }] };
const as = await fx.levelOf('tok', '1', 'adset', LEADS, () => {});
ok('адсет: id, назва й батьківська кампанія', as[0].id === 'S1' && as[0].name === 'Set'
  && as[0].adset === 'S1' && as[0].campaign === 'C1' && as[0].campaignName === 'Camp', as[0]);
ok('і фільтр по adset.effective_status', /adset\.effective_status/.test(decodeURIComponent(lastUrl)));

/* Відмова — помилка нагору, а прогін (див. entsAt) складає з активних і каже про це. */
answer = { error: { message: 'boom' } };
let threw = '';
try { await fx.levelOf('tok', '1', 'campaign', LEADS, () => {}); } catch (e) { threw = e.message; }
ok('відмова Facebook — помилка, а не порожній список', threw === 'boom', threw);

/* Проводка в прогоні. */
ok('прогін бере сутності через entsAt', /\(await entsAt\(r\.level\)\)\.filter/.test(FN));
ok('для не-оголошень — levelOf', /got = await levelOf\(/.test(FN));
ok('на відмові — сума активних і рядок у problems',
  /summed from active ads instead/.test(FN) && /got = atLevel\(ads as Ent\[\], level\);\n\s*}/.test(FN));
ok('на знімку (Facebook уже відмовив) у Graph удруге не ходимо',
  /if \(fellBack\.has\(account\)\) got = atLevel/.test(FN));
const v = Number((FN.match(/FN_VERSION = 'rules-(\d+)'/) || [])[1]);
ok('версія не нижче rules-18', v >= 18, v);

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
