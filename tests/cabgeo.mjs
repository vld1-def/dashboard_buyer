/* ГЕО ПЕРЕД СТАТУСОМ У FB LIVE. «перед статусом ставити мітки, які гео
   тут зараз активні … мітки щоб можна було приховувати». Прапори, коди
   або сховано — вибір у меню Columns. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8748;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const TODAY = new Date().toISOString().slice(0, 10);
const FB = [
  { account_id: '1001', name: 'A 16', status: 'active', currency: 'USD', spend_today: 100, ads: 3, ads_active: 3, token_id: 't1' },
  { account_id: '1002', name: 'A 12', status: 'active', currency: 'USD', spend_today: 0, ads: 1, ads_active: 0, token_id: 't1' }
];
const ROWS = [{ account_id: '1001', provider_name: 'AgentX', profile: '0000' },
              { account_id: '1002', provider_name: 'AgentX', profile: '0001' }];
const ad = (id, acc, camp, st, spend) => ({ ad_id: id, account_id: acc, name: 'ad_' + id, adset_id: 's', adset_name: 's',
  campaign_id: 'c' + id, campaign_name: camp, effective_status: st, spend, impressions: 1, clicks: 0, link_clicks: 0,
  seen_at: TODAY, actions: [] });
const SNAP = [
  ad('a1', '1001', 'x_KG_123', 'ACTIVE', 10),
  ad('a2', '1001', 'x_PL_555', 'ACTIVE', 60),
  ad('a3', '1001', 'x_DE_1', 'PAUSED', 99),
  ad('b1', '1002', 'x_TJ_1', 'PAUSED', 5)
];

const setup = mode => page.evaluate(async ([fb, rows, snap, mode]) => {
  cabViewSave = async () => true;
  cabFbLoad = async () => {};
  tdMaps = { cab: new Map(), tz: new Map(), br: new Map(), fn: new Map() };
  sb.from = () => ({ select: () => ({ order: () => ({ range: async () => ({ data: snap, error: null }) }),
    range: async () => ({ data: snap, error: null }) }) });
  await cabSnapLoad();
  cabFb = fb; cabRows = rows; cabLoaded = true; cabTokens = { t1: 'AgentX_0000_BM' };
  cabRange = { key: 'today', since: '', until: '' };
  cabFilter = 'all';
  cabView = { pins: [], cols: null, order: [], geo: mode };
  cabRender();
}, [FB, ROWS, SNAP, mode]);

const geoOf = id => page.evaluate(i => {
  const tr = [...document.querySelectorAll('#cab-list .cab-tr')]
    .find(r => (r.querySelector('.cab-id') || {}).textContent === i);
  const g = tr && tr.querySelector('.cab-geo');
  if (!g) return null;
  return { codes: [...g.querySelectorAll('.cab-geo-c')].map(x => x.textContent),
    flags: [...g.querySelectorAll('img.td-flag')].map(x => x.src.split('/').pop()),
    tip: g.getAttribute('title') };
}, id);

await setup('flag');
await page.waitForTimeout(200);
{
  const g = await geoOf('1001');
  ok('прапори активних гео — більше спенду лівіше', g && g.flags.join(',') === 'pl.svg,kg.svg', g);
  ok('зупинене гео (DE) не показуємо', g && !g.flags.includes('de.svg'), g);
  ok('у підказці — оголошення й спенд по гео', g && /PL · 1 active ad · \$60/.test(g.tip), g && g.tip);
  ok('кабінет без активних оголошень — без міток', (await geoOf('1002')) === null);
}
await setup('code');
{
  const g = await geoOf('1001');
  ok('режим кодів — двобуквені коди', g && g.codes.join(',') === 'PL,KG', g);
}
await setup('off');
ok('сховано — міток немає', (await geoOf('1001')) === null);

{
  await page.evaluate(() => { cabView.geo = 'flag'; cabColsMenu(); });
  const sw = await page.evaluate(() => [...document.querySelectorAll('#cab-pop .cab-geo-sw')].map(b => b.textContent));
  ok('у меню Columns — перемикач Flags / Codes / Hide', sw.join('|') === 'Flags|Codes|Hide', sw);
  await page.evaluate(() => [...document.querySelectorAll('#cab-pop .cab-geo-sw')][2].click());
  await page.waitForTimeout(100);
  ok('Hide ховає мітки', (await page.evaluate(() => cabView.geo)) === 'off' && (await geoOf('1001')) === null);
}

await done(browser, srv, errs);
