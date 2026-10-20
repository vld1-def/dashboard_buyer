/* ═══════════ ДОМЕН ЗНАЄ, ЧИЙ ВІН ═══════════

   17. Вставляв домени, вибирав PWA — і рядок лягав без гео. У таблиці
       це читається як початок нової PWA, хоч кампанія з цією самою
       силкою давно є.
   18. Силки PWA-кампаній — це і є відповідь «ця адреса чия», тільки
       лежить вона в іншому ключі (team_settings → pwa_links), і список
       доменів про неї не знав нічого.

   Стенд тримає межі, за якими це не стає вгадуванням:
     • збіг лише по ПОВНОМУ домену після тієї самої нормалізації;
     • дописуємо лише ПОРОЖНІ поля — вписане руками свіжіше;
     • група підставляє гео тільки коли сама собі не суперечить;
     • помилка запису вголос і з відкотом. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8135;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const PWA_ITEMS = [
  { id: 'p1', name: 'Mbank_KG_10708-ex8g_09/10', geo: 'KG', offer: 'Mbank',
    links: ['https://mplay-kg.website/', 'www.second-kg.site'] },
  { id: 'p2', name: 'Pinco_TJ_11003_09/10', geo: 'TJ', offer: 'Pinco',
    links: ['pinco-tj.website'] }
];

const setup = () => page.evaluate(items => {
  currentTeam = 'TEAM';
  window.__upd = [];
  getTeamSetting = async k => (k === 'pwa_links' ? JSON.stringify(items) : null);
  dmPwaMap = null;
  sb.from = () => ({ update: patch => ({ eq: async (_c, id) => {
    window.__upd.push([id, patch]);
    return { error: null };
  } }) });
  return true;
}, PWA_ITEMS);

await setup();

/* ─────────── 18. домен сам підтягує свою PWA ─────────── */
await page.evaluate(() => {
  dmRows = [
    // той самий домен іншим написанням — має зійтись
    { id: 1, domain: 'mplay-kg.website', pwa: '', geo: '', ktid: '', campaign: '' },
    // уже підписаний руками — не чіпаємо
    { id: 2, domain: 'second-kg.site', pwa: 'Моя назва', geo: 'UZ', ktid: '', campaign: '' },
    // жодна кампанія його не згадує
    { id: 3, domain: 'nobody.website', pwa: '', geo: '', ktid: '', campaign: '' }
  ];
  dmLoaded = true;
});
await page.evaluate(() => dmAutoLink());
await page.waitForTimeout(120);
const linked = await page.evaluate(() => ({
  rows: dmRows.map(r => [r.domain, r.pwa, r.geo, r.ktid]),
  upd: window.__upd
}));
ok('порожній рядок дописався з силок кампанії',
  JSON.stringify(linked.rows[0]) === JSON.stringify(['mplay-kg.website', 'Mbank', 'KG', '10708-ex8g']),
  linked.rows[0]);
ok('вписане руками не затирається',
  linked.rows[1][1] === 'Моя назва' && linked.rows[1][2] === 'UZ', linked.rows[1]);
ok('але порожнє в тому ж рядку дописалось', linked.rows[1][3] === '10708-ex8g', linked.rows[1]);
ok('чужий домен лишився ні з чим',
  JSON.stringify(linked.rows[2]) === JSON.stringify(['nobody.website', '', '', '']), linked.rows[2]);
ok('у базу пішли рівно ті рядки, що змінились', linked.upd.length === 2, linked.upd);
ok('і рівно ті поля, що були порожні',
  JSON.stringify(Object.keys(linked.upd.find(u => u[0] === 2)[1])) === JSON.stringify(['ktid', 'campaign']),
  linked.upd);

/* Відмова бази мусить відкотити екран: інакше рядок виглядає
   підписаним, а наступного разу знову порожній і без причини. */
ok('помилка запису відкочує екран', await page.evaluate(async () => {
  dmPwaMap = null;
  dmRows = [{ id: 9, domain: 'mplay-kg.website', pwa: '', geo: '', ktid: '', campaign: '' }];
  sb.from = () => ({ update: () => ({ eq: async () => ({ error: { message: 'nope' } }) }) });
  await dmAutoLink();
  return dmRows[0].pwa === '' && dmRows[0].geo === '';
}));

/* ─────────── 17. вибрана PWA підставляє гео ─────────── */
await setup();
await page.evaluate(() => {
  dmRows = [
    { id: 1, domain: 'a-kg.site', pwa: 'Mbank', geo: 'KG', ktid: '10708-ex8g' },
    { id: 2, domain: 'b-kg.site', pwa: 'Mbank', geo: 'KG', ktid: '10708-ex8g' },
    { id: 3, domain: 'c-tj.site', pwa: 'Pinco', geo: 'TJ', ktid: '11003' },
    { id: 4, domain: 'd-uz.site', pwa: 'Pinco', geo: 'UZ', ktid: '11009' }
  ];
  dmLoaded = true;
  document.getElementById('dm-paste-text').value = 'new-one.website\nnew-two.website';
});
await page.evaluate(() => dmPwaLoad());

const g1 = await page.evaluate(() => {
  document.getElementById('dm-paste-group').innerHTML =
    '<option value="">x</option><option value="Mbank">Mbank</option><option value="Pinco">Pinco</option>';
  document.getElementById('dm-paste-group').value = 'Mbank';
  return dmPasteRows();
});
ok('вибрана PWA підставила гео і ktid',
  g1.every(r => r.pwa === 'Mbank' && r.geo === 'KG' && r.ktid === '10708-ex8g'), g1);

/* Та сама PWA під двома гео — вибирати навмання не можна. */
const g2 = await page.evaluate(() => {
  document.getElementById('dm-paste-group').value = 'Pinco';
  return { rows: dmPasteRows(), info: dmGroupInfo('Pinco') };
});
ok('неоднозначна група гео не вигадує', g2.rows.every(r => !r.geo) && g2.info.geos === 2, g2);
ok('і каже про це в прев\'ю', await page.evaluate(() => {
  dmPastePreview();
  const t = document.getElementById('dm-paste-preview').textContent;
  return /without geo/.test(t) && /2 geos/.test(t);
}));

/* Домен, який уже перелічений у силках кампанії, знає все сам —
   навіть без вибору групи. */
const g3 = await page.evaluate(() => {
  document.getElementById('dm-paste-group').value = '';
  document.getElementById('dm-paste-text').value = 'https://pinco-tj.website/promo?a=1';
  return dmPasteRows();
});
ok('домен із силок кампанії підписується сам',
  g3.length === 1 && g3[0].pwa === 'Pinco' && g3[0].geo === 'TJ' && g3[0].ktid === '11003', g3);

/* Заголовок у тексті точніший за все інше: він і є та кампанія. */
const g4 = await page.evaluate(() => {
  document.getElementById('dm-paste-group').value = '';
  document.getElementById('dm-paste-text').value = 'Mbank_UZ_55500_09/10\nfresh-uz.website';
  return dmPasteRows();
});
ok('заголовок у тексті важить більше за довідник',
  g4[0].geo === 'UZ' && g4[0].ktid === '55500', g4);

await done(browser, srv, errs);
