/* ═══════════ FORM: KEITARO ЗАВЖДИ, СТАН АПКИ ═══════════

   1.  Тугл «уточнити з Keitaro» прибрано. Вимикали його рідше, ніж
       забували ввімкнути, а ціна забутого — залитий день із
       конверсіями самого Facebook: вони інші й лягають в інший день.
   21. Стан воронки (Active / Ban) правиться в тій самій таблиці, де
       її й заводили. Бан — не видалення: на KTID тримається вся
       залита статистика. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8136;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, {
  path: 'Form.html',
  init: () => {
    const mk = window.supabase.createClient;
    window.supabase.createClient = (...a) => {
      const c = mk(...a);
      c.auth.getSession = async () => ({ data: { session: { user: { id: 'u1' } } } });
      return c;
    };
    localStorage.setItem('selected_team', 'TEST');
    window.alert = m => { window.__alert = String(m); };
  }
});

/* ─────────── 1. Keitaro без тугла ─────────── */
const kt = await page.evaluate(() => ({
  toggle: !!document.getElementById('kt-toggle'),
  fn: typeof window.toggleKeitaro,
  zoneHidden: document.getElementById('csv-drop-zone-keitaro').classList.contains('hidden'),
  twoCols: document.getElementById('dual-zones').className.includes('md:grid-cols-2'),
  fbZone: !!document.getElementById('csv-drop-zone-dataset')
}));
ok('тугла більше немає ні в розмітці', !kt.toggle, kt);
ok('ні у коді', kt.fn === 'undefined', kt.fn);
ok('зона Keitaro стоїть відкритою завжди', !kt.zoneHidden, kt);
ok('обидві зони поруч, а не одна на всю ширину', kt.twoCols && kt.fbZone, kt);

/* Нічого не залив — нічого й не сталось: рівно як при вимкненому
   тугли, тілько без самого тугла. */
ok('без файлу Keitaro злиття не чіпає рядки', await page.evaluate(() => {
  keitaroAgg = null;
  mappingDB = { timezones: {}, agencies: {}, providers: {}, funnels: {}, funnelApp: {} };
  const fb = { r1: { date: '2026-10-01', acc: '123', geo: 'KG', _ktid: 'x',
                     funnel: '—', spend: 50, installs: 7, regs: 3, deps: 1 } };
  const out = applyKeitaroMerge(fb, {}).daily;
  return out.length === 1 && out[0].spend === 50 && out[0].deps === 1;
}));

/* ─────────── 21. стан воронки ─────────── */
const btn = await page.evaluate(() => ({
  live: funStateBtn({ id: 1, status: 'active' }),
  ban: funStateBtn({ id: 2, status: 'ban' }),
  old: funStateBtn({ id: 3 }),
  isBan: [funIsBan({ status: 'ban' }), funIsBan({ status: 'active' }), funIsBan({})]
}));
ok('жива воронка — Active', /Active</.test(btn.live) && /emerald/.test(btn.live), btn.live.slice(0, 120));
ok('забанена — Ban', /Ban</.test(btn.ban) && /red/.test(btn.ban), btn.ban.slice(0, 120));
ok('рядок без стану читається як Active', /Active</.test(btn.old), btn.old.slice(0, 80));
ok('ban розпізнається саме словом', JSON.stringify(btn.isBan) === JSON.stringify([true, false, false]), btn.isBan);
ok('клік перемикає в інший бік, а не в той самий',
  /toggleFunnelState\('1', true\)/.test(btn.live) && /toggleFunnelState\('2', false\)/.test(btn.ban),
  [btn.live.slice(0, 60), btn.ban.slice(0, 60)]);

const saved = await page.evaluate(async () => {
  window.__upd = [];
  sb.from = () => ({ update: patch => ({ eq: async (_c, id) => {
    window.__upd.push([id, patch]); return { error: null }; } }) });
  refreshFunnelsTable = async () => {};
  loadMappings = async () => {};
  await toggleFunnelState('7', true);
  return window.__upd;
});
ok('у базу пишемо status=ban', JSON.stringify(saved) === JSON.stringify([['7', { status: 'ban' }]]), saved);

/* Немає колонки — кажемо, який файл виконати, а не сиру помилку. */
ok('без міграції називаємо APP_STATUS.sql', await page.evaluate(async () => {
  window.__alert = '';
  sb.from = () => ({ update: () => ({ eq: async () => ({
    error: { message: 'column funnels_mapping.status does not exist' } }) }) });
  await toggleFunnelState('7', true);
  return /APP_STATUS\.sql/.test(window.__alert || '');
}));

ok('у таблиці воронок є стовпець стану', await page.evaluate(() =>
  [...document.querySelectorAll('#funnels-list-body')].length === 1
  && document.querySelector('#st-panel-funnels thead tr').textContent.includes('State')));

await done(browser, srv, errs);
