/* Методичка: manual.html → Metodychka_CRM.pdf (Chromium). */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file://' + dir + '/manual.html', { waitUntil: 'load' });
await p.pdf({ path: dir + '/Metodychka_CRM.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true,
  displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font:8px Inter,sans-serif;color:#9a9aa8;padding:0 16mm;display:flex;justify-content:space-between"><span>Методичка CRM для баєра</span><span class="pageNumber"></span></div>' });
await b.close();
console.log('ok');
