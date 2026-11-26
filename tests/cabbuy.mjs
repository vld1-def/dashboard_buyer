/* ЦІНА КАБІНЕТА В FB LIVE. «суму ми зробили, але її десь треба
   показувати ще». Ціна файла ÷ кабінети в ньому стає колонкою «Cab cost»
   і рядком «Bought for» у картці кабінета. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8747;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const FB = [
  { account_id: '1001', name: 'A 16', status: 'active', currency: 'USD', spend_today: 10, ads: 1, ads_active: 1, token_id: 't1' },
  { account_id: '1002', name: 'A 12', status: 'active', currency: 'USD', spend_today: 0, ads: 1, ads_active: 1, token_id: 't1' }
];
const ROWS = [{ account_id: '1001', provider_name: 'AgentX', profile: '0000' },
              { account_id: '1002', provider_name: 'AgentX', profile: '0001' }];
const FILES = [
  { title: 'old.txt', cabs: ['1001'], price: 100, units: 2, at: '2026-01-01' },
  { title: 'pack.txt', cabs: ['1001', '9999', '8888', '7777'], price: 10, units: 4, at: '2026-02-01' }
];

await page.evaluate(async ([fb, rows, files]) => {
  cabViewSave = async () => true;
  cabFbLoad = async () => {};
  const q = { select: () => q, eq: () => q, not: () => q, order: () => q,
    limit: async () => ({ data: files, error: null }) };
  sb.from = () => q;
  await cabBuyLoad();
  cabFb = fb; cabRows = rows; cabLoaded = true; cabTokens = { t1: 'AgentX_0000_BM' };
  cabRange = { key: 'today', since: '', until: '' };
  cabFilter = 'all';
  cabView = { pins: [], cols: { buy: 1 }, order: [] };
  cabRender();
}, [FB, ROWS, FILES]);
await page.waitForTimeout(300);

const cell = id => page.evaluate(i => {
  const tr = [...document.querySelectorAll('#cab-list .cab-tr')]
    .find(r => (r.querySelector('.cab-id') || {}).textContent === i);
  const head = [...document.querySelectorAll('#cab-list thead th')].map(t => t.textContent.replace(/[↑↓]/g, '').trim());
  const k = head.indexOf('Cab cost');
  return tr && k >= 0 ? tr.cells[k].textContent.trim() : null;
}, id);

const c1 = await cell('1001');
ok('колонка Cab cost: свіжіший файл — $10 ÷ 4', c1 === '$2.50', c1);
const c2 = await cell('1002');
ok('кабінет без файла з ціною — прочерк', c2 === '—' || c2 === '', c2);

const card = await page.evaluate(async () => {
  const tr = [...document.querySelectorAll('#cab-list .cab-tr')]
    .find(r => (r.querySelector('.cab-id') || {}).textContent === '1001');
  cabPick('1001');
  await new Promise(r => setTimeout(r, 300));
  const t = (document.getElementById('cab-detail') || {}).innerText || '';
  return !/Bought for/i.test(t) ? true : t.slice(0, 300);
});
ok('у картці кабінета Bought for більше немає (прибрали на прохання)', card === true, card);

const bad = await page.evaluate(async () => {
  const q = { select: () => q, eq: () => q, not: () => q, order: () => q,
    limit: async () => ({ data: null, error: { message: 'column price does not exist' } }) };
  sb.from = () => q;
  await cabBuyLoad();
  return cabBuy.size;
});
ok('без колонок ціни — тихо порожньо', bad === 0, bad);

await done(browser, srv, errs);
