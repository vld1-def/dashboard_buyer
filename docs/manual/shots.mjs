import { demo } from './demo.mjs';
const only = process.argv[2];
const { page, close } = await demo();
const clean = () => page.evaluate(() => document.querySelectorAll('.toast, #toast-wrap, .toast-wrap').forEach(x => x.remove()));
const shot = async (name, sel, fn) => {
  if (only && !name.startsWith(only)) return;
  try {
    if (fn) await page.evaluate(fn);
    await page.waitForTimeout(900); await clean();
    if (sel) { const el = await page.$(sel); await el.screenshot({ path: 'shots/' + name + '.png' }); }
    else await page.screenshot({ path: 'shots/' + name + '.png' });
    console.log('ok', name);
  } catch (e) { console.log('FAIL', name, String(e).slice(0, 160)); }
};
const esc = () => page.keyboard.press('Escape');
await shot('01-dashboard', null, () => navGo(''));
await shot('02-heatmap', null, () => navGo('heatmap'));
await shot('03-creatives', null, () => navGo('creatives'));
await shot('05-domains', null, () => navGo('domains'));
await shot('06-expenses', null, () => navGo('expenses'));
await shot('07-posts', null, () => navGo('posts'));
await shot('08-team', null, () => navGo('team'));
await shot('09-reports', null, () => navGo('reports'));
await shot('10-hub-campaigns', null, () => { navGo(''); hubOpen('dataset', document.body); });
await esc();
await shot('11-hub-records', null, () => hubOpen('records', document.body));
await esc();
await shot('12-hub-sources', null, () => hubOpen('providers', document.body));
await esc();
await shot('13-assistant', null, () => aqOpen());
await esc();
await shot('14-sheets', null, () => sheetsOpen());
await esc();
await shot('15-settings', null, () => { document.querySelectorAll('.hub-panel,.fs-panel').forEach(x => x.classList.add('hidden')); navGo(''); openSettingsModal(); });
await shot('15b-settings-payouts', null, () => switchSettingsTab('payouts'));
await shot('15c-settings-integr', null, () => switchSettingsTab('integrations'));
await esc();
await shot('16-uniq', null, () => { document.querySelectorAll('[id$="-modal"]').forEach(m => m.classList.add('hidden')); openUniqModal(); });
await esc();
await shot('17-more', null, () => { document.querySelectorAll('[id$="-modal"]').forEach(m => m.classList.add('hidden')); const b = [...document.querySelectorAll('button')].find(b => b.title === 'More'); b && b.click(); });
await esc();
await close();
