/* Усі стенди по черзі. Паралельно не запускаємо: кожен підіймає свій
   Chromium, і на шести одночасно машина впирається в пам'ять, а падіння
   від браку пам'яті читається як падіння тесту. */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const files = readdirSync(dir)
  .filter(f => f.endsWith('.mjs') && f !== 'all.mjs' && !f.startsWith('_')).sort();

let bad = 0;
for (const f of files) {
  const r = spawnSync('node', [path.join(dir, f)], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').pop() || '';
  const fail = r.status !== 0;
  if (fail) bad++;
  console.log((fail ? 'FAIL ' : 'ok   ') + f.padEnd(16) + last);
  if (fail) console.log((r.stdout || '').split('\n').filter(l => l.startsWith('FAIL')).join('\n')
                      + '\n' + (r.stderr || '').slice(0, 600));
}
console.log(`\n${files.length - bad}/${files.length} стендів зелені`);
process.exit(bad ? 1 : 0);
