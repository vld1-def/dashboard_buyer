/* ═══════════ ЯК МИ ВИРІШУЄМО, ЩО АПКИ В PLAY БІЛЬШЕ НЕМА ═══════════

   Єдиний стенд, якому не потрібен браузер: перевіряється правило з
   Edge Function check-apps, а воно чисте — рядок на вході, висновок на
   виході.

   ЧОМУ ВІН ВЗАГАЛІ Є. Спершу в функції стояло «404 = бан». Так воно
   ловило б лише знесені сторінки: забанену апку Play показує ІНАКШЕ, і
   як саме — ми не знаємо, бо з нашого контейнера play.google.com
   закритий і подивитись неможливо.

   Тому правило перевернуте: не перелічуємо вигляди відмови (їх рівно
   стільки, скільки Google забажає), а шукаємо ДОКАЗ живої сторінки.
   Немає доказу — апки на сторінці немає, хоч би який код Play повернув.

   Беремо правило з самого файлу функції, а не з копії: копія розійшлась
   би з оригіналом рівно тоді, коли перевірка найпотрібніша. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = readFileSync(path.join(root, 'supabase/functions/check-apps/index.ts'), 'utf8');

const m = /const ogTag =[\s\S]*?\n};/.exec(src);
if (!m) { console.log('FAIL у check-apps більше немає ogTag\n\n0 ok, 1 fail'); process.exit(1); }
const ogTag = new Function('return ' + m[0].replace('const ogTag =', '')
  .replace(/: string/g, '').replace(/\n};$/, '\n}'))();

/* Те саме правило живості, що й у функції. Якщо воно там зміниться, а
   тут ні — впаде перевірка нижче, і це теж частина договору. */
const RULE = /const live = ld \|\| \(!!title && !!icon && hasPkg\);/;
const verdict = (html, appId) => {
  const icon = ogTag(html, 'image'), title = ogTag(html, 'title');
  const ld = /"@type"\s*:\s*"SoftwareApplication"/.test(html);
  const hasPkg = html.includes(appId);
  return { live: ld || (!!title && !!icon && hasPkg), icon, title, ld, hasPkg };
};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok   ' + name); return; }
  fail++; console.log('FAIL ' + name);
  if (extra !== undefined) console.log('       ' + JSON.stringify(extra).slice(0, 300));
};

const APP = 'com.fortunedra.gontrheb';
const ICON = 'https://play-lh.googleusercontent.com/abc=w240';
const real = `<html><head>
  <meta property="og:title" content="Fortune Dragon">
  <meta property="og:image" content="${ICON}">
  <meta property="og:url" content="https://play.google.com/store/apps/details?id=${APP}">
  </head><body>ok</body></html>`;

/* ─────────── читання og-тегів ─────────── */
ok('og:image читається', ogTag(real, 'image') === ICON, ogTag(real, 'image'));
ok('og:title читається', ogTag(real, 'title') === 'Fortune Dragon', ogTag(real, 'title'));
ok('зворотний порядок атрибутів теж — Play пише і так, і так',
  ogTag('<meta content="https://play-lh.x/i" property="og:image">', 'image')
    === 'https://play-lh.x/i');
ok('одинарні лапки теж',
  ogTag("<meta property='og:image' content='https://play-lh.x/j'>", 'image')
    === 'https://play-lh.x/j');
ok('немає тега — порожньо, а не падіння', ogTag('<html></html>', 'image') === '');
ok('og:image не плутається з og:image_alt',
  ogTag('<meta property="og:image_alt" content="alt"><meta property="og:image" content="R">', 'image')
    !== 'alt');

/* ─────────── висновок ─────────── */
ok('справжня сторінка апки — жива', verdict(real, APP).live, verdict(real, APP));
ok('структуровані дані самі по собі доводять живу',
  verdict('<script type="application/ld+json">{"@type": "SoftwareApplication"}</script>', APP).live);

ok('сторінка 404 — апки немає',
  !verdict('<html><body>We&#39;re sorry, the requested URL was not found on this server.</body></html>', APP).live);
ok('заглушка Play із власними og-тегами — апки немає',
  !verdict('<meta property="og:title" content="Google Play"><meta property="og:image" content="https://www.gstatic.com/play.png">', APP).live);
ok('порожня відповідь — апки немає', !verdict('', APP).live);
ok('og-теги є, але сторінка про ІНШУ апку — не жива',
  !verdict(real.replace(APP, 'com.other.app'), APP).live);
ok('є картинка, але немає назви — не жива',
  !verdict(`<meta property="og:image" content="${ICON}">${APP}`, APP).live);

/* ─────────── правило не розійшлось із функцією ─────────── */
ok('у функції стоїть те саме правило живості, що й тут', RULE.test(src),
  (src.match(/const live = .*/) || [''])[0]);
ok('геоблок відокремлений від бану: питаємо з гео воронки',
  /not available in your country/i.test(src) && /gl=/.test(src)
  && /probe\(appId: string, geo: string\)/.test(src));
ok('429 і 5xx не чіпають стан',
  /429[\s\S]{0,200}unknown/.test(src) && /res\.status >= 500[\s\S]{0,200}unknown/.test(src));
ok('що саме бачили — лягає в нотатку',
  /ld\+json немає|og:title немає/.test(src));

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
