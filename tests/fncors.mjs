/* ═══════════ ПЕРЕД POST БРАУЗЕР ШЛЕ OPTIONS ═══════════

   І цей preflight за стандартом іде БЕЗ Authorization — завжди. Зі
   звичайною перевіркою JWT шлюз Supabase відкидає саме його, функція
   не бачить запиту зовсім, а на екрані стоїть голе «Failed to fetch»:
   не «немає прав», не «не задеплоєно», а без причини.

   Через це кожна функція, яку кличе браузер, мусить мати запис у
   supabase/config.toml. Файл це пояснює й сам, але пояснення не
   заважає забути — я забув одразу про три: fb-limit, fb-post і
   tg-news. Зловити таке можна лише списком, тому список тут.

   Стенд не відкриває сторінку: він звіряє ДЖЕРЕЛА з конфігом. */
import fs from 'node:fs';
import path from 'node:path';
import { checks } from './_harness.mjs';

const { ok, done } = checks();

/* Кого кличе браузер — беремо з самого коду, а не зі списку руками:
   список руками розійшовся б із кодом рівно тоді, коли додали нову
   функцію, тобто саме тоді, коли він і потрібен. */
const SRC = ['index-legacy.html', ...fs.readdirSync('build')
  .filter(f => f.endsWith('.js')).map(f => path.join('build', f))];
const called = new Set();
SRC.forEach(f => {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/functions\/v1\/([a-z0-9-]+)/gi)) called.add(m[1]);
});
ok('у коді знайдено виклики функцій', called.size >= 5, [...called]);

const TOML = fs.readFileSync('supabase/config.toml', 'utf8');
const listed = new Set(
  [...TOML.matchAll(/^\[functions\.([a-z0-9-]+)\]/gim)].map(m => m[1]));

const missing = [...called].filter(n => !listed.has(n));
ok('кожна функція, яку кличе браузер, має запис у config.toml',
  missing.length === 0, missing);

/* Сам запис без вимкненої перевірки нічого не дає: preflight усе одно
   не дійде. Тому дивимось не лише наявність блоку, а й що в ньому. */
const off = new Set();
TOML.split(/^\[functions\./m).slice(1).forEach(part => {
  const name = (part.match(/^([a-z0-9-]+)\]/i) || [])[1];
  if (name && /verify_jwt\s*=\s*false/.test(part)) off.add(name);
});
const stillOn = [...called].filter(n => listed.has(n) && !off.has(n));
ok('і перевірку шлюзом у ньому вимкнено', stillOn.length === 0, stillOn);

/* Три, яких бракувало. Названі поіменно, щоб помилку не можна було
   «полагодити», просто прибравши виклик із коду. */
['fb-limit', 'fb-post', 'tg-news'].forEach(n =>
  ok('у config.toml є ' + n, off.has(n), [...off]));

/* І навпаки: у конфігу не має бути записів під функції, яких немає на
   диску — такий запис виглядає як налаштування, а не налаштовує
   нічого. */
const onDisk = new Set(fs.readdirSync('supabase/functions')
  .filter(f => fs.existsSync(path.join('supabase/functions', f, 'index.ts'))));
const ghosts = [...listed].filter(n => !onDisk.has(n));
ok('у конфігу немає записів під неіснуючі функції', ghosts.length === 0, ghosts);

await done(null, null, []);
