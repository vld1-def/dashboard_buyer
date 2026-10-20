/* КАБІНЕТ ПОКАЗУЄ ТЕ, ЩО FACEBOOK УЖЕ ПОРАХУВАВ.

   Доти в рядку кабінета стояли лише депозити з НАШОГО імпорту, і поки
   файл за сьогодні не залитий, стовпчик був порожній — хоч у дереві
   кампаній того самого кабінета покупки вже видно. Одне й те саме
   питання мало відповідь в одному місці й не мало в сусідньому.

   Знімок fb_ad_today лежить у базі по всіх кабінетах команди, тож
   підсумок на кабінет складається з тих самих рядків і не коштує
   жодного запиту до Facebook. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8731;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const TODAY = new Date().toISOString().slice(0, 10);
const FB = [
  { account_id: '1001', name: 'A 16', status: 'active', currency: 'USD', spend_today: 100,
    ads: 3, ads_active: 3, token_id: 't1' },
  { account_id: '1002', name: 'A 12', status: 'active', currency: 'USD', spend_today: 0,
    ads: 1, ads_active: 1, token_id: 't1' }
];
const ROWS = [{ account_id: '1001', provider_name: 'AgentX', profile: '0000' },
              { account_id: '1002', provider_name: 'AgentX', profile: '0001' }];

/* Знімок: два оголошення одного кабінета й одне іншого. Події в
   actions приходять саме так, як їх віддає Facebook. */
const SNAP = [
  { ad_id: 'a1', account_id: '1001', name: 'KG_1', adset_id: 's1', adset_name: 'set',
    campaign_id: 'c1', campaign_name: 'Camp', effective_status: 'ACTIVE',
    spend: 60, impressions: 6000, clicks: 30, link_clicks: 30, seen_at: TODAY,
    actions: [{ action_type: 'purchase', value: '3' },
              { action_type: 'complete_registration', value: '10' }] },
  { ad_id: 'a2', account_id: '1001', name: 'KG_2', adset_id: 's1', adset_name: 'set',
    campaign_id: 'c1', campaign_name: 'Camp', effective_status: 'ACTIVE',
    spend: 40, impressions: 4000, clicks: 20, link_clicks: 20, seen_at: TODAY,
    actions: [{ action_type: 'purchase', value: '1' },
              { action_type: 'lead', value: '5' }] },
  { ad_id: 'b1', account_id: '1002', name: 'PL_1', adset_id: 's9', adset_name: 'set2',
    campaign_id: 'c9', campaign_name: 'Camp2', effective_status: 'ACTIVE',
    spend: 7, impressions: 700, clicks: 7, link_clicks: 7, seen_at: TODAY, actions: [] }
];

await page.evaluate(async ([fb, rows, snap]) => {
  cabViewSave = async () => true;
  cabFbLoad = async () => {};
  rawData = [];
  // sbFetchAll ходить через sb.from — підміняємо саме його.
  sb.from = () => ({ select: () => ({ order: () => ({ range: async () =>
    ({ data: snap, error: null }) }), range: async () => ({ data: snap, error: null }) }) });
  await cabSnapLoad();
  cabFb = fb; cabRows = rows; cabLoaded = true; cabTokens = { t1: 'AgentX_0000_BM' };
  cabRange = { key: 'today', since: '', until: '' };
  cabFilter = 'all';
  cabView = { pins: [], cols: { buys: 1, cpbuy: 1, leads: 1, regs: 1, inst: 1, cpl: 1 }, order: [] };
  cabRender();
}, [FB, ROWS, SNAP]);
await page.waitForTimeout(300);

const cells = (id) => page.evaluate(i => {
  const tr = [...document.querySelectorAll('#cab-list .cab-tr')]
    .find(r => (r.querySelector('.cab-id') || {}).textContent === i);
  if (!tr) return null;
  const head = [...document.querySelectorAll('#cab-list thead th')]
    .map(t => t.textContent.replace(/[↑↓]/g, '').trim());
  const out = {};
  head.forEach((h, k) => { if (h) out[h] = (tr.cells[k].textContent || '').replace(/\s+/g, ' ').trim(); });
  return out;
}, id);

{
  const c = await cells('1001');
  console.log('1001', JSON.stringify(c));
  // 3 + 1 покупки з двох оголошень
  ok('покупки з Facebook підсумовані на кабінет', c['Purch'] === '4', c);
  // 100 / 4
  ok('і ціна покупки рахується з того самого знімка', c['Cost / purch'] === '$25', c);
  ok('реєстрації теж', c['Reg'] === '10', c);
  ok('і ліди', c['Lead'] === '5', c);
  // 100 / 5
  ok('ціна ліда — зі знімка, а не з наших грошей', c['Cost / lead'] === '$20', c);
}

{
  /* Кабінет, у якого подій немає, — це нуль, а не прочерк: його
     оголошення в знімку є, просто нічого не принесли. */
  const c = await cells('1002');
  console.log('1002', JSON.stringify(c));
  ok('кабінет без подій показує нуль, а не прочерк', c['Purch'] === '0', c);
  /* А от ціна покупки при нулі покупок — саме прочерк: ділити нема на
     що, і нескінченність тут нічого не пояснює. */
  ok('але ціна при нулі подій — прочерк', c['Cost / purch'] === '—', c);
}

{
  /* Немає знімка — немає й чисел. Прочерк означає «не знаємо», і це
     не те саме, що нуль: нуль стверджував би, що подій не було. */
  const none = await page.evaluate(async () => {
    cabSnap = {}; cabRender();
    const tr = [...document.querySelectorAll('#cab-list .cab-tr')]
      .find(r => (r.querySelector('.cab-id') || {}).textContent === '1001');
    const head = [...document.querySelectorAll('#cab-list thead th')]
      .map(t => t.textContent.replace(/[↑↓]/g, '').trim());
    return (tr.cells[head.indexOf('Purch')].textContent || '').trim();
  });
  ok('без знімка — прочерк, а не нуль', none === '—', none);
}

await done(browser, srv, errs);
