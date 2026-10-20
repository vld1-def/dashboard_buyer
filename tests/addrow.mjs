/* ═══════════ ЗАВЕСТИ КАБІНЕТ І ВОРОНКУ НА МІСЦІ ═══════════

   Доти кабінет заводили в Settings → Cabinets, воронку — в Settings →
   Funnels, а користувались ними у вікнах Accounts і Прілки: інша
   сторінка, перезавантаження дашборда, і повернення назад руками.
   Тепер те саме збереження живе там, де про нього згадують.

   Стенд тримає те, що легко зламати:
     • обов'язкове поле не дає закрити вікно (кабінет без id ні до чого
       не прив'яжеться);
     • пишемо в ті самі таблиці й тими самими полями, що й форми;
     • другий кабінет під тим самим id не заводимо, а зайнятий KTID
       перезаписуємо тільки після питання;
     • у памʼяті лишається той рядок, який віддала база (з id і датою),
       а не той, що ми відправили. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8127;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* ─────────── ask() з кількома полями ─────────── */
const dlg = await page.evaluate(async () => {
  const p = ask({ title: 'Т', ok: 'Додати', fields: [
    { key: 'a', label: 'Account ID', need: true, full: true },
    { key: 'g', label: 'Гео', upper: true, value: 'kg' },
    { key: 'f', label: 'APP', type: 'checkbox', value: true }
  ] });
  const w = () => document.querySelector('.askwrap');
  const out = {
    labs: [...w().querySelectorAll('.ask-f-lab')].map(e => e.textContent.trim()),
    wide: !!w().querySelector('.askbox.is-wide'),
    star: w().querySelector('.ask-f-lab b') !== null
  };
  w().querySelector('.ask-yes').click();            // обов'язкове порожнє
  out.stillOpen = !!w();
  out.marked = !!w().querySelector('.ask-in.is-bad');
  w().querySelector('[data-k="a"]').value = '  1234  ';
  w().querySelector('.ask-yes').click();
  out.v = await p;
  out.closed = !document.querySelector('.askwrap');
  return out;
});
ok('поля підписані', JSON.stringify(dlg.labs) === JSON.stringify(['Account ID *', 'Гео']), dlg.labs);
ok('обов\'язкове позначене зірочкою', dlg.star);
ok('більше двох полів — ширше вікно', dlg.wide);
ok('порожнє обов\'язкове не закриває вікно', dlg.stillOpen && dlg.marked, dlg);
ok('відповідь — обʼєкт, значення обрізані', dlg.v && dlg.v.a === '1234', dlg.v);
ok('галочка приходить булевим, гео у верхньому регістрі',
  dlg.v && dlg.v.f === true && dlg.v.g === 'KG', dlg.v);
ok('після відповіді вікно закрите', dlg.closed);

ok('Esc — це відмова, а не порожні поля', await page.evaluate(async () => {
  const p = ask({ fields: [{ key: 'a', label: 'A' }] });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return (await p) === false;
}));

/* ─────────── Accounts: + кабінет ─────────── */
const fill = vals => page.evaluate(v => {
  const w = document.querySelector('.askwrap');
  Object.entries(v).forEach(([k, val]) => {
    const el = w.querySelector(`[data-k="${k}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val; else el.value = val;
  });
  w.querySelector('.ask-yes').click();
}, vals);

await page.evaluate(() => {
  currentTeam = 'TEAM';
  accHasStatusCol = true;
  accRows = [
    { id: 1, account_id: '555', provider_name: 'AgentX', profile: 'AdsPower 1',
      timezone: 3, status: 'active', created_at: '2026-10-02T00:00:00Z' },
    { id: 2, account_id: '556', provider_name: 'AgentY', profile: '',
      timezone: 0, status: 'active', created_at: '2026-09-11T00:00:00Z' }
  ];
  window.__ins = [];
  sb.from = t => ({
    insert: rows => ({ select: async () => {
      window.__ins.push([t, rows[0]]);
      return { data: [{ ...rows[0], id: 7, created_at: '2026-10-20T06:00:00Z' }], error: null };
    } })
  });
  accFilter = '';
  renderAccountsModal();
});

/* Агент і браузер підказуються з уже заведених кабінетів: друкувати
   назву агенції наново щоразу — зайве. */
await page.evaluate(() => { window.__p = accAdd(); });
await page.waitForTimeout(80);
const hints = await page.evaluate(() => ({
  agents: [...document.querySelectorAll('#ask-dl-agent option')].map(o => o.value),
  keys: [...document.querySelectorAll('.askwrap [data-k]')].map(e => e.dataset.k)
}));
ok('у вікні ті самі поля, що й у формі Link Cabinet',
  JSON.stringify(hints.keys) === JSON.stringify(['acc', 'tz', 'agent', 'browser']), hints.keys);
ok('агента підказують уже відомі', JSON.stringify(hints.agents) === JSON.stringify(['AgentX', 'AgentY']), hints.agents);

await fill({ acc: ' 777 ', tz: '-8', agent: 'AgentZ', browser: 'AdsPower 12' });
await page.evaluate(() => window.__p);
const ins = await page.evaluate(() => ({ ins: window.__ins, rows: accRows.length,
  got: accRows[accRows.length - 1] }));
ok('пишемо в accounts_mapping', ins.ins.length === 1 && ins.ins[0][0] === 'accounts_mapping', ins.ins);
ok('рядок той самий, що й у формі: id, агент, пояс, браузер, команда',
  JSON.stringify(ins.ins[0][1]) === JSON.stringify({ account_id: '777', provider_name: 'AgentZ',
    timezone: -8, team_name: 'TEAM', profile: 'AdsPower 12' }), ins.ins[0][1]);
ok('у памʼяті лишається рядок бази — з id і датою',
  ins.got.id === 7 && ins.got.created_at === '2026-10-20T06:00:00Z', ins.got);
ok('новий кабінет видно в таблиці відразу',
  await page.evaluate(() => document.getElementById('accounts-modal-body').textContent.includes('777')));

/* Той самий id двічі — це не новий кабінет, а друга копія: статуси й
   нотатки розійшлись би по двох рядках. */
await page.evaluate(() => { window.__ins = []; window.__p = accAdd(); });
await page.waitForTimeout(80);
await fill({ acc: '555' });
await page.evaluate(() => window.__p);
ok('кабінет під уже зайнятим id не заводимо',
  await page.evaluate(() => window.__ins.length === 0 && accRows.filter(r => r.account_id === '555').length === 1));

/* ─────────── Accounts: місяці ─────────── */
const mon = await page.evaluate(() => {
  const sel = document.getElementById('acc-month');
  const opts = [...sel.options].map(o => [o.value, o.textContent]);
  sel.value = '2026-09';
  renderAccountsModal();
  const body = document.getElementById('accounts-modal-body').textContent;
  return { opts, only556: body.includes('556') && !body.includes('555'),
           head: (body.match(/\(([^)]*)\)/) || [])[1] };
});
ok('місяці зібрані з дати додавання, найновіший першим',
  JSON.stringify(mon.opts.map(o => o[0])) === JSON.stringify(['', '2026-10', '2026-09']), mon.opts);
ok('у назві місяця стоїть кількість', /Oct 2026 · 2/.test(mon.opts[1][1]), mon.opts[1]);
ok('вибраний місяць лишає тільки свої кабінети', mon.only556, mon);
ok('у шапці видно «показано зі скількох»', mon.head === '1 / 3', mon.head);
ok('зник місяць із даних — вибір падає на «усі»', await page.evaluate(() => {
  accRows = accRows.filter(r => r.created_at.slice(0, 7) !== '2026-09');
  renderAccountsModal();
  return document.getElementById('acc-month').value === '';
}));

/* ─────────── Воронки: + апка і + воронка ─────────── */
await page.evaluate(() => {
  apFunnels = [{ ktid: 'k1', funnel_name: 'Crazy Wheel [satorapps]', geo: 'KG', is_app: true }];
  apItems = []; pwItems = []; apMode = 'app';
  window.__up = [];
  sb.from = t => ({ upsert: row => Promise.resolve((window.__up.push([t, row]), { error: null })) });
});
await page.evaluate(() => { window.__p = apAddFunnel(true); });
await page.waitForTimeout(80);
const fdlg = await page.evaluate(() => ({
  keys: [...document.querySelectorAll('.askwrap [data-k]')].map(e => e.dataset.k),
  app: document.querySelector('.askwrap [data-k="is_app"]').checked,
  hint: [...document.querySelectorAll('.askwrap .ask-f-hint')].map(e => e.textContent).join(' | ')
}));
ok('у вікні воронки ті самі поля, що й у Funnel Mapper',
  JSON.stringify(fdlg.keys) === JSON.stringify(['name', 'ktid', 'geo', 'is_app']), fdlg.keys);
ok('з «+ Апка» позначка APP уже стоїть', fdlg.app);
ok('постачальники підказані з дужок уже збережених назв',
  /satorapps/.test(fdlg.hint), fdlg.hint);

await fill({ name: 'Mostbet [tridentapps]', ktid: 'k2', geo: 'kg', is_app: true });
await page.evaluate(() => window.__p);
const up = await page.evaluate(() => ({ up: window.__up, names: apFunnels.map(f => f.funnel_name) }));
ok('пишемо в funnels_mapping тими самими полями',
  up.up.length === 1 && up.up[0][0] === 'funnels_mapping'
  && JSON.stringify(up.up[0][1]) === JSON.stringify({ ktid: 'k2', funnel_name: 'Mostbet [tridentapps]',
       team_name: 'TEAM', is_app: true, geo: 'KG' }), up.up);
ok('довідник у памʼяті лишається відсортованим за назвою',
  JSON.stringify(up.names) === JSON.stringify(['Crazy Wheel [satorapps]', 'Mostbet [tridentapps]']), up.names);

/* Зайнятий KTID upsert перепише МОВЧКИ — тому питаємо. Відмова не
   зберігає нічого. */
await page.evaluate(() => { window.__up = []; window.__p = apAddFunnel(false); });
await page.waitForTimeout(80);
await fill({ name: 'Інша воронка', ktid: 'k1', geo: 'PL' });
await page.waitForTimeout(80);
const conf = await page.evaluate(() => {
  const w = document.querySelector('.askwrap');
  const txt = w ? w.textContent : '';
  if (w) w.querySelector('.ask-no').click();
  return txt;
});
await page.evaluate(() => window.__p);
ok('зайнятий KTID питає перед перезаписом', /KTID уже зайнятий/.test(conf), conf.slice(0, 120));
ok('відмова не зберігає й не псує довідник', await page.evaluate(() =>
  window.__up.length === 0 && apFunnels.find(f => f.ktid === 'k1').funnel_name === 'Crazy Wheel [satorapps]'));

/* ─────────── кнопки на місці ─────────── */
const btns = await page.evaluate(() => {
  apMode = 'app'; apModePaint();
  const appMode = !document.getElementById('ap-addfun').classList.contains('hidden');
  apMode = 'pwa'; apModePaint();
  const pwaMode = !document.getElementById('ap-addfun').classList.contains('hidden');
  pwShowEditor({ name: '', links: [] });
  const ed = document.getElementById('ap-editor');
  const row = ed.querySelector('#pw-f-name').parentElement;
  return { appMode, pwaMode,
           inRow: /apAddFunnel\(false\)/.test(row.innerHTML),
           flex: row.className.includes('flex') };
});
ok('«+ Апка» стоїть у прілках', btns.appMode);
ok('і не дублюється в PWA, де кнопка воронки в рядку кампанії', !btns.pwaMode);
ok('«+ Воронка» в одному рядку з назвою кампанії', btns.inRow && btns.flex, btns);

await done(browser, srv, errs);
