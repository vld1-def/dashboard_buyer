/* ═══════════ СПІЛЬНИЙ СТЕНД ═══════════

   Стенди живуть У РЕПОЗИТОРІЇ, а не в тимчасовій теці. Попередній
   набір лежав у /tmp і зник разом із контейнером — разом із усім, що
   він доводив. Те, чим перевіряють код, мусить їхати поруч із кодом.

   ЩО ТУТ Є:
     serve()  — статичний сервер над згенерованим index.html
     open(port, {path, init, viewport})
              — Chromium із підміненим Supabase (його CDN закритий
                політикою проксі, і без підміни сторінка падає на
                `const sb = supabase.createClient(...)`, а разом із нею
                в вічну TDZ лягають усі змінні того блока)
     checks() — лічильник ok/fail з однаковим виводом у всіх стендах */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

export const ROOT = '/home/user/dashboard_buyer';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

export async function serve(port) {
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    try {
      const b = fs.readFileSync(f);
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(b);
    } catch (e) { res.writeHead(404); res.end('no'); }
  });
  await new Promise(r => srv.listen(port, r));
  return srv;
}

/* Помилки завантаження CDN не рахуємо за поломку сторінки: Chart,
   Tailwind і Supabase сюди не доїжджають за політикою проксі. */
const CDN = /Chart is not defined|tailwind is not defined|supabase is not defined|\bsb is not defined/;

export async function open(port, opts) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext(
    (opts && opts.viewport) ? { viewport: opts.viewport } : {})).newPage();
  await page.addInitScript(() => {
    const res = { data: [], error: null };
    const chain = () => {
      const o = new Proxy(function () {}, {
        get: (t, k) => k === 'then' ? (f => Promise.resolve(res).then(f)) : (() => o),
        apply: () => o });
      return o;
    };
    window.supabase = {
      createClient: () => ({
        from: () => chain(),
        rpc: () => chain(),
        auth: {
          getSession: async () => ({ data: { session: null } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          getUser: async () => ({ data: { user: null } }),
          signInWithPassword: async () => ({ data: {}, error: null }),
          signOut: async () => ({ error: null })
        },
        storage: { from: () => chain() },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {}
      })
    };
    window.tailwind = { config: {} };
  });
  /* Сторінка може мати свій гейт (Form.html без сесії відправляє на
     index.html). Стенд дописує, чого їй бракує, поверх підміни. */
  if (opts && opts.init) await page.addInitScript(opts.init);
  const errs = [];
  page.on('pageerror', e => { const t = String(e); if (!CDN.test(t)) errs.push(t.slice(0, 200)); });
  const file = (opts && opts.path) || 'index.html';
  await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  return { browser, page, errs };
}

export function checks() {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('ok   ' + name); return; }
    fail++;
    console.log('FAIL ' + name);
    if (extra !== undefined) console.log('       ' + JSON.stringify(extra).slice(0, 400));
  };
  const done = async (browser, srv, moreErrs) => {
    /* Стенд, який перевіряє лише джерело (у функції без UI перевіряти
       на сторінці нічого), приходить сюди без браузера. Тоді й рядка
       про сторінку бути не повинно: він сказав би про екран, якого в
       цьому стенді не було. */
    if (browser) {
      if (moreErrs && moreErrs.length) ok('сторінка без помилок', false, moreErrs);
      else ok('сторінка без помилок', true);
    }
    if (browser) await browser.close();
    if (srv) srv.close();
    console.log(`\n${pass} ok, ${fail} fail`);
    process.exit(fail ? 1 : 0);
  };
  return { ok, done, count: () => ({ pass, fail }) };
}
