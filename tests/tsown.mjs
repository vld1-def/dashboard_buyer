/* Налаштування команди: свій рядок — перший («no ktid» під AppHeroes,
   бо читався шаблон асистента, а не свій). */
import { serve, open, checks } from './_harness.mjs';
const { ok, done } = checks();
const srv = await serve(8779);
const { browser, page, errs } = await open(8779, { viewport: { width: 1200, height: 800 } });
const r = await page.evaluate(async () => {
  const rows = [{ key: 'pwa_parse', value: 'ASSISTANT', created_by: 'u-oleh' }, { key: 'pwa_parse', value: 'MINE', created_by: 'u-me' },
                { key: 'role_access', value: 'ADMIN', created_by: 'u-admin' }];
  const q = filt => { const o = { select() { return o; }, eq(c, v) { if (c === 'key') filt = filt.filter(r => r.key === v); return o; },
    in(c, v) { filt = filt.filter(r => v.includes(r.key)); return o; }, limit() { return o; }, then(f) { return Promise.resolve({ data: filt, error: null }).then(f); } }; return o; };
  sb.from = () => q(rows.slice());
  window.myUid = 'u-me';
  return { one: await getTeamSetting('pwa_parse'), many: await getTeamSettings(['pwa_parse', 'role_access']), adminOnly: await getTeamSetting('role_access') };
});
ok('свій рядок важливіший за рядок асистента', r.one === 'MINE', r);
ok('getTeamSettings теж бере свій', r.many.pwa_parse === 'MINE', r.many);
ok('свого немає (ставив адмін) — береться рядок команди', r.adminOnly === 'ADMIN' && r.many.role_access === 'ADMIN', r);
await browser.close(); srv.close();
done();
