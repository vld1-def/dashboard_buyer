/* ═══════════ САБКИ ШАБЛОНА ПІДТЯГУЮТЬСЯ САМІ ═══════════

   Набір сабок у постачальника той самий від шаблону до шаблону:
   Sub 2 — апка, Sub 20 (або 3) — креатив, Sub 5 — кабінет. Набирали
   його щоразу руками, а помилитись тут дорого: сабка не з того номера
   означає, що статистика за заливом не зійдеться з кампанією, і видно
   це аж у звіті.

   Стенд тримає межі, за якими підстановка не стає самоуправством:
     • джерело — МАПІНГ KEITARO, тобто те саме місце, яким імпорт читає
       вигрузку (інакше два боки колись розійдуться);
     • креатив береться за постачальником — та сама перебивка, що в
       імпорті;
     • мапінгу не заповнювали — беремо з сусіднього шаблону цього
       постачальника: це свідчення самої команди, а не наша здогадка;
     • немає й сусіда — типовий набір Keitaro, і названий саме так:
       ставка розумна, але це ставка;
     • вписане руками не затирається; кнопкою — замінюється цілком;
     • звідки взялось — написано під набором. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8149;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const setup = (km, items) => page.evaluate(([m, list]) => {
  currentTeam = 'TEAM';
  apMode = 'app';
  apItems = list.map(x => ({ ...x }));
  apFunnels = [{ ktid: '10708', funnel_name: 'Mostbet [satorapps]', geo: 'KG', is_app: true },
               { ktid: '11003', funnel_name: 'Pinco [trident]', geo: 'TJ', is_app: true }];
  apAccounts = [{ account_id: '123', provider_name: 'AgencyOne' }];
  apGeo = ''; apProv = ''; apEditId = null;
  apKmCache = null;
  window.__km = m;
  getTeamSetting = async k => (k === 'keitaro_map' && m ? JSON.stringify(m) : null);
  document.getElementById('apps-modal')?.classList.remove('hidden');
  apRenderTree(); apRender();
  return true;
}, [km, items]);

const KM = { acc: 'Sub ID 5', funnel: 'Sub ID 2', cr: 'Sub ID 3', crApp: 'Sub ID 20',
             prov: { trident: { cr: 'Sub ID 10' } } };

/* ─────────── з мапінгу Keitaro ─────────── */
await setup(KM, []);
const km = await page.evaluate(async () => {
  apNew();
  document.getElementById('ap-f-prov').value = 'satorapps';
  await apSubsPull(false);
  return { subs: apSubsDraft.map(x => [x.n, x.mode]),
           note: document.getElementById('ap-subs-note').textContent };
});
ok('сабки взялись із мапінгу: апка, креатив, кабінет',
  JSON.stringify(km.subs) === JSON.stringify([[2, 'app'], [5, 'acc'], [20, 'cid']]), km.subs);
ok('і сказано, звідки саме', /мапінгу Keitaro/.test(km.note), km.note);
ok('у рядку названо, що в якій сабці',
  /Sub 2 — апка/.test(km.note) && /Sub 20 — креатив/.test(km.note)
  && /Sub 5 — кабінет/.test(km.note), km.note);

/* Креатив — за постачальником: та сама перебивка, що в імпорті. */
const prov = await page.evaluate(async () => {
  apNew();
  document.getElementById('ap-f-prov').value = 'trident';
  await apSubsPull(true);
  return apSubsDraft.map(x => [x.n, x.mode]);
});
ok('у trident креатив іде в свою сабку, а не в загальну',
  JSON.stringify(prov) === JSON.stringify([[2, 'app'], [5, 'acc'], [10, 'cid']]), prov);

/* ─────────── немає мапінгу — беремо з сусіднього шаблону ─────────── */
await setup(null, [
  { id: 'a1', geo: 'KG', provider: 'satorapps', naming: 'n', subs: [
    { n: 4, mode: 'app', value: '' }, { n: 7, mode: 'cid', value: '' },
    { n: 9, mode: 'fixed', value: 'стала' }] },
  { id: 'a2', geo: 'UZ', provider: 'other', naming: 'n', subs: [{ n: 1, mode: 'fixed', value: 'чуже' }] }
]);
const twin = await page.evaluate(async () => {
  apNew();
  document.getElementById('ap-f-prov').value = 'satorapps';
  document.getElementById('ap-f-geo').value = 'KG';
  await apSubsPull(true);
  return { subs: apSubsDraft.map(x => [x.n, x.mode, x.value]),
           note: document.getElementById('ap-subs-note').textContent };
});
ok('без збереженого мапінгу набір копіюється з шаблону того ж постачальника',
  JSON.stringify(twin.subs) === JSON.stringify([[4, 'app', ''], [7, 'cid', ''], [9, 'fixed', 'стала']]),
  twin.subs);
ok('і джерело назване чесно', /сусіднього шаблону/.test(twin.note), twin.note);
ok('чужий постачальник у копію не потрапив',
  !twin.subs.some(x => x[2] === 'чуже'), twin.subs);

/* ─────────── ні мапінгу, ні сусіда — типовий набір, і так і сказано ─────────── */
await setup(null, []);
const none = await page.evaluate(async () => {
  apNew();
  document.getElementById('ap-f-prov').value = 'нікому-невідомий';
  await apSubsPull(true);
  return { subs: apSubsDraft.map(x => [x.n, x.mode]),
           note: document.getElementById('ap-subs-note').textContent };
});
ok('без нічого береться стандартна розкладка Keitaro',
  JSON.stringify(none.subs) === JSON.stringify([[2, 'app'], [5, 'acc'], [20, 'cid']]), none.subs);
/* Назвати це «мапінгом команди» було б неправдою: команда його не
   заповнювала. Ставка розумна, але це ставка, і рядок каже саме так. */
ok('і названо це типовим набором, а не налаштуванням команди',
  /типового набору Keitaro/.test(none.note), none.note);

/* ─────────── вписане руками не затирається ─────────── */
await setup(KM, []);
const keep = await page.evaluate(async () => {
  apNew();
  apSubsDraft = [{ n: 3, mode: 'fixed', value: 'моє значення' }];
  apSubsRender();
  document.getElementById('ap-f-prov').value = 'satorapps';
  await apSubsPull(false);                 // само — не чіпає
  const after = apSubsDraft.map(x => [x.n, x.mode, x.value]);
  await apSubsPull(true);                  // кнопкою — замінює
  return { after, byHand: apSubsDraft.map(x => [x.n, x.mode]) };
});
ok('автопідстановка не затирає вписане руками',
  JSON.stringify(keep.after) === JSON.stringify([[3, 'fixed', 'моє значення']]), keep.after);
ok('а кнопка замінює набір цілком — саме цього від неї й чекають',
  JSON.stringify(keep.byHand) === JSON.stringify([[2, 'app'], [5, 'acc'], [20, 'cid']]), keep.byHand);

/* ─────────── не-сабка в мапінгу не стає сабкою ─────────── */
await setup({ acc: 'Account ID', funnel: 'Offer', cr: 'Sub ID 3', crApp: 'Offer' }, []);
const bad = await page.evaluate(async () => {
  apNew();
  document.getElementById('ap-f-prov').value = 'satorapps';
  await apSubsPull(true);
  return apSubsDraft.map(x => [x.n, x.mode]);
});
/* У мапінгу поле може вказувати на звичайний стовпець, а не на сабку
   («Offer», «Account ID»). Такі в набір не йдуть: сабка з назвою
   стовпця — це не сабка. Креатив прілки теж «Offer», тож падаємо на
   загальний cr. */
ok('не-сабки в набір не потрапляють, а креатив відкочується на загальний стовпець',
  JSON.stringify(bad) === JSON.stringify([[3, 'cid']]), bad);

/* А коли на сабку не вказує взагалі ніщо — не підставляємо здогадку,
   а кажемо, що саме заповнити. */
await setup({ acc: 'Account ID', funnel: 'Offer', cr: 'Offer', crApp: 'Offer' }, []);
const empty = await page.evaluate(async () => {
  window.__toast = '';
  toast = (m) => { window.__toast = String(m); };
  apNew();
  document.getElementById('ap-f-prov').value = 'satorapps';
  await apSubsPull(true);
  return { subs: apSubsDraft.map(x => [x.n, x.mode]), said: window.__toast,
           note: document.getElementById('ap-subs-note').textContent };
});
ok('жодне поле не вказує на сабку — набір лишається як був',
  JSON.stringify(empty.subs) === JSON.stringify([[1, 'fixed']]), empty.subs);
ok('і сказано, що саме заповнити', /Keitaro Mapping/.test(empty.said), empty.said);
ok('рядок джерела при цьому порожній', !empty.note.trim(), empty.note);

/* Редактор уже збереженого шаблону нічого сам не переставляє. */
await setup(KM, [{ id: 'b1', geo: 'KG', provider: 'satorapps', naming: 'n',
                   subs: [{ n: 6, mode: 'fixed', value: 'як було' }] }]);
const edit = await page.evaluate(async () => {
  apEdit('b1');
  await new Promise(r => setTimeout(r, 120));
  return apSubsDraft.map(x => [x.n, x.mode, x.value]);
});
ok('у збереженому шаблоні сабки лишаються як були',
  JSON.stringify(edit) === JSON.stringify([[6, 'fixed', 'як було']]), edit);

await done(browser, srv, errs);
