/* ═══════════ ЗАБАНИЛИ ПРІЛКУ → СТОП РЕКЛАМИ НА НЕЇ ═══════════

   «от це я давно хотів, її легко знаходити, так як в нас є ктід кожної
   прілки, і також є name pattern щоб розбирати назви компаній».

   check-apps після НОВОГО бану шукає у Facebook активні кампанії з KTID
   прілки в назві й ставить їх на паузу. Функцію дістаємо з джерела й
   проганяємо з підробними базою, Facebook і Telegram: справжню рекламу
   заради тесту зупиняти не можна. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 700) : '')); } };

const FN = fs.readFileSync('supabase/functions/check-apps/index.ts', 'utf8').replace(/\r\n/g, '\n');
const SRC = fs.readFileSync('index-legacy.html', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

const a = FN.indexOf("const GRAPH = 'https://graph.facebook.com");
const b = FN.indexOf('Deno.serve(async (req) => {');
ok('блок автопаузи є у функції', a > 0 && b > a);
const js = stripTypeScriptTypes(FN.slice(a, b));

/* Підробний світ. camps: кабінет → активні кампанії. */
function world({ camps, settings = [], accounts, tokens, tg = [{ user_id: 'u1', chat_id: '777' }], failPause = [], listFail = [] }) {
  const log = { paused: [], tgs: [], listed: [] };
  const fetchFake = async (url, opt = {}) => {
    const u = String(url);
    const json = v => ({ ok: true, status: 200, json: async () => v, text: async () => JSON.stringify(v) });
    if (u.includes('/rest/v1/team_settings')) return json(settings);
    if (u.includes('/rest/v1/fb_accounts')) return json(accounts);
    if (u.includes('/rest/v1/fb_tokens')) return json(tokens);
    if (u.includes('/rest/v1/tg_links')) return json(tg);
    if (u.includes('api.telegram.org')) { log.tgs.push(JSON.parse(opt.body)); return json({ ok: true }); }
    const m = u.match(/\/act_(\d+)\/campaigns/);
    if (m) {
      log.listed.push(m[1]);
      if (listFail.includes(m[1])) return json({ error: { message: 'token is dead' } });
      return json({ data: camps[m[1]] || [] });
    }
    if (/graph\.facebook\.com\/v[\d.]+\/$/.test(u)) {
      const batch = JSON.parse(new URLSearchParams(opt.body).get('batch'));
      return json(batch.map(x => {
        if (failPause.includes(x.relative_url)) return { code: 400, body: JSON.stringify({ error: { message: 'no permission' } }) };
        log.paused.push(x.relative_url);
        return { code: 200, body: JSON.stringify({ success: true }) };
      }));
    }
    throw new Error('unexpected fetch ' + u);
  };
  const Deno = { env: { get: k => (k === 'TG_BOT_TOKEN' ? 'bot' : '') } };
  const api = new Function('fetch', 'Deno', js + '\nreturn { banPause, nameHasKtid, settingOff, looseKey };')(fetchFake, Deno);
  return { api, log };
}

const ACC = [{ account_id: '111', token_id: 1 }, { account_id: 'act_222', token_id: 1 }, { account_id: '333', token_id: 2 }];
const TOK = [{ id: 1, token: 't1', status: 'ok' }, { id: 2, token: 't2', status: 'ok' }];
const CR = { id: 5, ktid: 'CR11116', funnel_name: 'Chicken Road [satorapps]', team_name: 'IMPROVE', created_by: 'u1' };

/* ── впізнавання назви ── */
const N = world({ camps: {}, accounts: [], tokens: [] }).api;
ok('KTID цілим шматком, без регістру', N.nameHasKtid('cy638t_8wxg7hf7_bGcTwMmV_CR11116_3191102584433243_GE', 'CR11116')
  && N.nameHasKtid('improve_9ncrn9vv_cr11116_139_ge', 'CR11116'));
ok('чужа прілка зі схожим KTID не чіпається', !N.nameHasKtid('x_y_LCR11116_1_GE', 'CR11116')
  && !N.nameHasKtid('x_y_CR111160_1_GE', 'CR11116') && !N.nameHasKtid('x_y_CR1111_6', 'CR11116X'));
ok('KTID з дефісом, а в назві підкреслення — той самий', N.nameHasKtid('MPlayC_KG_10708_ry05_06/11 003', '10708-ry05')
  && N.nameHasKtid('mplayc-kg-10708-RY05-0611', '10708-ry05') && N.nameHasKtid('x_KG_10708-ry05_1', '10708-ry05'));
ok('KTID із пробілом у мапінгу теж знаходиться', N.nameHasKtid('Slots_GE_11115-kwwk_01/11', '11115 -kwwk'));
ok('половина KTID — не збіг', !N.nameHasKtid('x_KG_10708_zzzz', '10708-ry05') && !N.nameHasKtid('x_ry05_y', '10708-ry05'));
ok('короткий KTID не шукаємо зовсім', !N.nameHasKtid('big_gf_campaign', 'gf'));
ok('вимикач читається в усіх виглядах', N.settingOff('{"on":false}') && N.settingOff({ on: false }) && N.settingOff('off')
  && !N.settingOff('{"on":true}') && !N.settingOff(null) && !N.settingOff('{}'));

/* ── головний випадок ── */
const w1 = world({ accounts: ACC, tokens: TOK, camps: {
  '111': [{ id: 'c1', name: 'cy_8w_bG_CR11116_111_GE' }, { id: 'c2', name: 'cy_8w_bG_VC11116_111_GE' }],
  '222': [{ id: 'c3', name: 'Improve_9N_cr11116_222_GE_2' }],
  '333': [{ id: 'c4', name: 'x_y_z_LCR11116_333_GE' }] } });
const r1 = await w1.api.banPause('https://db', {}, [CR]);
ok('зупинено саме кампанії цієї прілки, з усіх кабінетів', w1.log.paused.sort().join() === 'c1,c3', w1.log.paused);
ok('чужі кампанії в тих самих кабінетах крутять далі', !w1.log.paused.includes('c2') && !w1.log.paused.includes('c4'));
ok('кабінети питаємо у Facebook, а не у знімку', w1.log.listed.sort().join() === '111,222,333', w1.log.listed);
ok('у звіті: що зупинено і де', r1[0].paused.length === 2 && r1[0].on === true
  && r1[0].paused.some(p => p.account === '222' && p.id === 'c3'), r1[0]);
ok('власнику пішло повідомлення в Telegram зі списком', w1.log.tgs.length === 1 && w1.log.tgs[0].chat_id === '777'
  && /App banned in the store: Chicken Road \[satorapps\] \(CR11116\)/.test(w1.log.tgs[0].text)
  && /Paused 2 campaign\(s\)/.test(w1.log.tgs[0].text) && /cy_8w_bG_CR11116_111_GE/.test(w1.log.tgs[0].text), w1.log.tgs[0]);

/* ── вимикач ── */
const w2 = world({ accounts: ACC, tokens: TOK, settings: [{ value: '{"on":false}', created_by: 'u1' }],
  camps: { '111': [{ id: 'c1', name: 'cy_8w_bG_CR11116_111_GE' }] } });
const r2 = await w2.api.banPause('https://db', {}, [CR]);
ok('автопаузу вимкнено — нічого не зупиняємо', w2.log.paused.length === 0 && r2[0].on === false && r2[0].running.length === 1, r2[0]);
ok('але кажемо, що досі крутить', /Auto-pause is OFF/.test(w2.log.tgs[0].text) && /cy_8w_bG_CR11116_111_GE/.test(w2.log.tgs[0].text));
const w3 = world({ accounts: ACC, tokens: TOK, settings: [{ value: '{"on":false}', created_by: 'someone-else' }],
  camps: { '111': [{ id: 'c1', name: 'cy_8w_bG_CR11116_111_GE' }] } });
await w3.api.banPause('https://db', {}, [CR]);
ok('чужий вимикач мою автопаузу не вимикає', w3.log.paused.join() === 'c1');

/* ── невдачі ── */
const w4 = world({ accounts: ACC, tokens: TOK, failPause: ['c1'], listFail: ['333'],
  camps: { '111': [{ id: 'c1', name: 'a_CR11116_b' }], '222': [{ id: 'c3', name: 'a_CR11116_c' }] } });
const r4 = await w4.api.banPause('https://db', {}, [CR]);
ok('одна невдала пауза не валить решти', w4.log.paused.join() === 'c3' && r4[0].paused.length === 1);
ok('невдачі названі поіменно', r4[0].failed.some(f => f.id === 'c1' && /no permission/.test(f.why))
  && r4[0].failed.some(f => f.account === '333' && /token is dead/.test(f.why)), r4[0].failed);
ok('і вони є в повідомленні', /Could not pause 2/.test(w4.log.tgs[0].text));

const w5 = world({ accounts: ACC, tokens: TOK, camps: { '111': [{ id: 'c9', name: 'totally_other' }] } });
const r5 = await w5.api.banPause('https://db', {}, [CR]);
ok('кампаній на прілку немає — нічого не чіпаємо, але про бан кажемо', w5.log.paused.length === 0
  && /No active campaigns with this app/.test(w5.log.tgs[0].text) && r5[0].paused.length === 0);

const w6 = world({ accounts: ACC, tokens: [{ id: 1, token: 't1', status: 'error' }, { id: 2, token: '', status: 'ok' }],
  camps: { '111': [{ id: 'c1', name: 'a_CR11116_b' }] } });
const r6 = await w6.api.banPause('https://db', {}, [CR]);
ok('мертвим токеном у Facebook не ходимо', w6.log.listed.length === 0 && /No cabinets with a working token/.test(r6[0].note));

const w7 = world({ accounts: ACC, tokens: TOK, camps: { '111': [{ id: 'c1', name: 'a_b' }] } });
const r7 = await w7.api.banPause('https://db', {}, [{ ...CR, ktid: 'gf' }, { ...CR, ktid: 'CR11116', team_name: '' }]);
ok('воронка без команди чи з коротким KTID пропускається', r7.length === 0 && w7.log.listed.length === 0);

/* ── де це викликається ── */
ok('нічний обхід зупиняє лише щойно забанені', /bannedRows\.push\(r\);/.test(FN)
  && (FN.match(/bannedRows\.push\(r\);/g) || []).length === 2 && /paused = await banPause\(base, hdr, bannedRows\);/.test(FN));
ok('і ручна перевірка однієї прілки теж', /if \(did === 'banned' && svc\)/.test(FN) && /\}, \[row\]\);/.test(FN));
ok('воронка читається разом із ktid і власником', (FN.match(/ktid,team_name,created_by/g) || []).length >= 2);
ok('звіт про паузу їде у відповіді', /first_miss: quiet, paused,/.test(FN) && /note: v\.note, did, paused \}\)/.test(FN));
ok('нічого не вмикається назад', !/status=ACTIVE/.test(FN.slice(a, b)));
ok('версія функції піднята', /const FN_VERSION = '2026-11-12\.1';/.test(FN));

/* ── сторінка ── */
ok('вимикач стоїть поруч із перевіркою апок', /id="ap-banpause" onclick="apBanPauseToggle\(this\)"/.test(SRC));
ok('пишеться в налаштування власника', /key: 'app_ban_pause', value: JSON\.stringify\(\{ on: next \}\)/.test(SRC));
ok('вимкнення питає підтвердження', /Turn auto-pause off\?/.test(SRC));
ok('у режимі PWA вимикача не видно', /const bp = document\.getElementById\('ap-banpause'\);\s+if \(bp\) bp\.classList\.toggle\('hidden', pwa\);/.test(SRC));
ok('ручна перевірка каже, скільки кампаній зупинено', /paused ' \+ o\.paused \+ ' campaign\(s\) on banned apps/.test(SRC));
ok('і це доїхало в зібраний index.html', /id="ap-banpause"/.test(OUT) && /apBanPauseToggle = async function/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
