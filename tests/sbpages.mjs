/* Сторінки Supabase паралельно (sbAllRows) — ті самі рядки, в тому ж
   порядку, і tw.css замість cdn.tailwindcss.com. */
import fs from 'node:fs';
import { serve, open, checks, ROOT } from './_harness.mjs';
const { ok, done } = checks();
const srv = await serve(8773);
const { browser, page } = await open(8773);
const r = await page.evaluate(async () => {
  const run = async (total, failAt) => {
    let calls = 0, maxPar = 0, cur = 0;
    const make = () => ({ range: async (a, b) => { calls++; cur++; maxPar = Math.max(maxPar, cur);
      await new Promise(r => setTimeout(r, 20)); cur--;
      if (failAt != null && a >= failAt) return { data: null, error: { message: 'boom' } };
      const rows = []; for (let i = a; i <= Math.min(b, total - 1); i++) rows.push(i); return { data: rows, error: null }; } });
    const res = await sbAllRows(make);
    return { n: res.data ? res.data.length : null, inOrder: res.data ? res.data.every((v, i) => v === i) : null, err: !!res.error, calls, maxPar };
  };
  return { small: await run(500), exact: await run(1000), mid: await run(1794), big: await run(11862), fail: await run(5000, 2000) };
});
ok('500 рядків — один запит', r.small.n === 500 && r.small.calls === 1, r.small);
ok('рівно 1000 — дочитує й зупиняється', r.exact.n === 1000 && r.exact.inOrder, r.exact);
ok('1794 рядки — усі, по порядку', r.mid.n === 1794 && r.mid.inOrder, r.mid);
ok('11 862 — усі, по порядку, сторінки паралельно', r.big.n === 11862 && r.big.inOrder && r.big.maxPar >= 3, r.big);
ok('помилка сторінки — повертає помилку, а не півсписку', r.fail.err && r.fail.n === null, r.fail);
const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
ok('CDN Tailwind прибрано', !/cdn\.tailwindcss\.com/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
ok('tw.css підключено в кінці head і зібрано', /tw\.css\?v=\w+">\s*<\/head>/.test(html) && fs.statSync(ROOT + '/tw.css').size > 20000);
await browser.close(); srv.close();
done();
