/* ═══════════ ЛІМІТ ВІД НУЛЯ ═══════════

   «Я ставлю 5$ значить я хочу щоб 5$ відкрутило і зупинилось …
   раніше я в срм ставив 5$ і в фб в лімітах також ставилось 5$».

   Стелю Facebook порівнює з лічильником витраченого. На кабінеті, де
   лічильник доріс до 215, «5» означало «стань негайно», і поле
   відмовляло. Тепер разом із лімітом лічильник скидається — як кнопкою
   Reset в Ads Manager.

   І сторінку, і серверну функцію дістаємо з джерела й проганяємо з
   підробним Facebook: справжній кабінет для перевірки чіпати не можна. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 600) : '')); } };

const CB = fs.readFileSync('build/cabinets.js', 'utf8');
const FN = fs.readFileSync('supabase/functions/fb-limit/index.ts', 'utf8').replace(/\r\n/g, '\n');
const OUT = fs.readFileSync('index.html', 'utf8');

/* ═══ СТОРІНКА ═══ */
const a = CB.indexOf('window.cabLimitEdit = async function (enc) {');
const b = CB.indexOf('/* ═══════════ ЛІМІТ ЗА РОЗКЛАДОМ');
const src = CB.slice(a, b).replace('window.cabLimitEdit =', 'const cabLimitEdit =');
const money = 'const CAB_CUR = { USD: "$" };\n'
  + (CB.match(/function cabMoneyCur\(n, cur\) \{[\s\S]*?\n\}/) || [''])[0] + '\n'
  + (CB.match(/function cabMoneyCents\(n, cur\) \{[\s\S]*?\n\}/) || [''])[0] + '\n';

async function page({ fb, answers, status = 200, body }) {
  const log = { calls: [], asked: [], toasts: [], synced: 0 };
  const c = { id: '123', fb: Object.assign({ currency: 'USD' }, fb) };
  const env = {
    cabAll: [c], SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k',
    sb: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } },
    ask: async o => { log.asked.push(o); return answers.shift(); },
    toast: (t, k) => log.toasts.push({ t: String(t), k }),
    toastStep: () => ({ say: () => {}, done: (t, k) => log.toasts.push({ t: String(t), k }) }),
    cabRender: () => {}, cabDetail: () => {}, cabSyncOne: async () => { log.synced++; },
    fetch: async (_u, o) => {
      const sent = JSON.parse(o.body);
      log.calls.push(sent);
      return { ok: status < 400, status,
               json: async () => status < 400
                 ? (body || { ok: true, reset: true, cap_after: sent.set_major * 100, spent_after_reset: 0 })
                 : { error: 'Facebook said no' } };
    }
  };
  const f = new Function(...Object.keys(env), money + src + '\nreturn cabLimitEdit;')(...Object.values(env));
  await f(encodeURIComponent('123'));
  return Object.assign(log, { cap: c.fb.spend_cap, spent: c.fb.amount_spent });
}

const p1 = await page({ fb: { spend_cap: 0, amount_spent: 215 }, answers: ['5', true] });
ok('«5» при витрачених 215 іде у функцію як 5, а не відмовляє', p1.calls.length === 1 && p1.calls[0].set_major === 5, p1);
ok('разом із проханням скинути лічильник', p1.calls[0].reset === true && p1.calls[0].account_id === '123');
ok('кабінет без стелі — з allow_new_cap і попередженням', p1.calls[0].allow_new_cap === true
  && /removing it again is not/.test(p1.asked[1].body), p1.asked[1]);
ok('перше вікно каже, що лічильник обнулиться', /reset to\s+zero/.test(p1.asked[0].body) && p1.asked[0].input.value === '', p1.asked[0]);
ok('у підтвердженні: було → стане від нуля', /no limit\s+→\s+\$5 from zero/.test(p1.asked[1].body)
  && /goes back to zero/.test(p1.asked[1].body), p1.asked[1].body);
ok('на екрані нова стеля й обнулене витрачене', p1.cap === 5 && p1.spent === 0
  && p1.toasts.some(t => /Limit is now \$5, spent against it \$0\.00/.test(t.t)), p1);
ok('після зміни кабінет перечитується сам', p1.synced === 1);

const p2 = await page({ fb: { spend_cap: 300, amount_spent: 248.37 }, answers: ['10.6', true] });
ok('дробове округлюється до цілої валюти, і про це сказано', p2.calls[0].set_major === 11
  && /whole USD only: \$11/.test(p2.asked[1].body), p2.asked[1].body);
ok('стеля вже є — allow_new_cap не проситься, старе видно у вікні', p2.calls[0].allow_new_cap === false
  && /\$300 \(spent \$248\.37\)/.test(p2.asked[1].body), p2.asked[1].body);

const bad = await page({ fb: { spend_cap: 0, amount_spent: 215 }, answers: ['abc'] });
ok('не число — нічого не йде у Facebook', bad.calls.length === 0 && bad.toasts.some(t => /Not a limit/.test(t.t)));
const esc = await page({ fb: { spend_cap: 0, amount_spent: 215 }, answers: [false] });
ok('закрите перше вікно — жодного виклику', esc.calls.length === 0);
const no = await page({ fb: { spend_cap: 0, amount_spent: 215 }, answers: ['5', false] });
ok('відмова на підтвердженні — жодного виклику', no.calls.length === 0);
const err = await page({ fb: { spend_cap: 0, amount_spent: 215 }, answers: ['5', true], status: 409 });
ok('відмова Facebook на екрані, стеля в картці не змінилась', err.toasts.some(t => /Facebook said no/.test(t.t)) && err.cap === 0, err);
const old = await page({ fb: { spend_cap: 300, amount_spent: 10 }, answers: ['500', true],
  body: { ok: true, cap_after: 50000 } });
ok('стара функція без reset — попередження, а не тиша', old.toasts.some(t => /did not reset the spent/.test(t.t))
  && old.spent === 10, old);
const gone = await page({ fb: { spend_cap: 0, amount_spent: 215 }, answers: ['5', true], status: 404 });
ok('незадеплоєна функція названа кроком розгортання', gone.toasts.some(t => /deploy fb-limit/.test(t.t)));

/* ═══ СЕРВЕРНА ФУНКЦІЯ ═══ */
const fa = FN.indexOf('const MINOR = 100;');
const fb1 = FN.indexOf('function num(v: unknown)');
const fb2 = FN.indexOf('Deno.serve(');
const fc = FN.indexOf('async function capFlow(');
const fd = FN.indexOf('/* ═══════════ ЗМІНА ЛІМІТУ ЗА РОЗКЛАДОМ');
const js = stripTypeScriptTypes('const MINOR = 100;\nconst ACC_FIELDS = "f";\n'
  + FN.slice(fb1, fb2) + FN.slice(fc, fd));

/* Підробний кабінет. Числа — мінорні одиниці, як у Graph. */
async function server({ cap, spent, set, allowNew = true, reset = true, resetNeedsCap = false, resetBroken = false }) {
  const st = { cap, spent, posts: [] };
  const graph = async (_path, _tok, params = {}, method = 'GET') => {
    if (method === 'GET') return { account_id: '1', currency: 'USD', spend_cap: String(st.cap), amount_spent: String(st.spent) };
    st.posts.push(Object.assign({}, params));
    if (params.spend_cap_action === 'reset') {
      if (resetNeedsCap && !st.cap) throw new Error('no cap to reset against');
      if (!resetBroken) st.spent = 0;
      return { success: true };
    }
    st.cap = Number(params.spend_cap) * 100;
    return { success: true };
  };
  const reply = (body, status = 200) => ({ status, body });
  const capFlow = new Function('graph', 'reply', js + '\nreturn capFlow;')(graph, reply);
  const res = await capFlow('act_1', 'tok', ['ads_management'], set, allowNew, reset);
  return Object.assign(res, { st });
}

const s1 = await server({ cap: 0, spent: 21500, set: 5 });
ok('без стелі, витрачено 215, ліміт 5: стоїть 5, лічильник 0', s1.status === 200 && s1.st.cap === 500 && s1.st.spent === 0, s1);
ok('спершу скидання, потім стеля — не навпаки', s1.st.posts[0].spend_cap_action === 'reset' && s1.st.posts[1].spend_cap === '5', s1.st.posts);
ok('відповідь каже, що лічильник скинуто', s1.body.reset === true && s1.body.spent_after_reset === 0 && s1.body.spent_before === 21500, s1.body);

const s2 = await server({ cap: 0, spent: 21537, set: 5, resetNeedsCap: true });
ok('скидання без стелі не пройшло → тимчасова стеля 216+5, потім скидання', s2.status === 200
  && s2.st.posts.map(p => p.spend_cap_action || p.spend_cap).join(',') === 'reset,221,reset,5', s2.st.posts);
ok('і в підсумку стоїть 5 від нуля', s2.st.cap === 500 && s2.st.spent === 0);

const s3 = await server({ cap: 0, spent: 21500, set: 5, resetBroken: true });
ok('лічильник не скинувся зовсім — стелю 5 НЕ ставимо', s3.status === 409 && s3.body.reset_failed === true
  && s3.st.cap !== 500, s3);
ok('лишається безпечна тимчасова стеля «витрачено + 5»', s3.st.cap === 22000 && /220/.test(s3.body.error), s3.body);

const s4 = await server({ cap: 30000, spent: 29000, set: 10, resetBroken: true });
ok('зі стелею: скидання не вдалось — нічого не змінено', s4.status === 409 && s4.st.cap === 30000
  && /Ліміт не змінено/.test(s4.body.error), s4);

const s5 = await server({ cap: 30000, spent: 29000, set: 10 });
ok('зі стелею 300 і витраченими 290: стає 10 від нуля', s5.status === 200 && s5.st.cap === 1000 && s5.st.spent === 0, s5.st);

const s6 = await server({ cap: 30000, spent: 29000, set: 100, reset: false });
ok('без reset (розклад) стара перевірка на місці', s6.status === 409 && s6.st.posts.length === 0, s6);
const s7 = await server({ cap: 30000, spent: 10000, set: 400, reset: false });
ok('без reset стеля ставиться як раніше, лічильник не чіпаємо', s7.status === 200 && s7.st.cap === 40000 && s7.st.spent === 10000
  && s7.body.reset === false, s7);
const s8 = await server({ cap: 0, spent: 21500, set: 5, allowNew: false });
ok('кабінет без стелі без явної згоди не чіпаємо — і лічильник теж', s8.status === 409 && s8.st.posts.length === 0, s8);

ok('розклад ліміту лічильник не скидає', /capFlow\([^)]*\)/.test(FN.slice(fd)) && !/reset/.test((FN.slice(fd).match(/capFlow\([^)]*\)/) || [''])[0]));
ok('версія функції піднята', /const FN_VERSION = '2026-11-11\.1';/.test(FN));
ok('і це доїхало в зібраний index.html', /reset: true \}\)/.test(OUT) && /from zero/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
