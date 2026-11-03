/* ═══════════ ЕКРАНОВАНІ ПОСЛІДОВНОСТІ В СИРОМУ HTML ═══════════

   «зроби нормальну назву замість цього ❄ Cold».

   На кнопці справді стояло «❄ Cold» — буквально, цими десятьма
   символами. У рядку JavaScript «❄» розгортається в сніжинку; у
   сирому HTML не розгортається нічим, бо там це просто текст.

   Поруч, у тій самій групі, був другий такий: «≤ $» замість
   «≤ $». Тобто помилка не одинична, а характерна: розмітку правлять
   тим самим рухом, що й рядки в коді, і escape туди переїжджає разом
   із текстом.

   Стенд дивиться ЗІБРАНУ сторінку — саме її бачить людина — і лише
   те, що поза <script> і поза коментарями. Усередині JS escape
   доречний, у коментарях він нікому не видний.

   Перевіряємо й сам підпис кнопки: він мусить читатись без
   розгадування. */
import fs from 'node:fs';
import { checks } from './_harness.mjs';

const { ok, done } = checks();
const HTML = fs.readFileSync('index.html', 'utf8');

/* Вирізаємо <script>…</script> і <!-- … -->: лишається рівно те, що
   браузер покаже як текст. */
const bare = (() => {
  let s = HTML, out = '', i = 0;
  while (i < s.length) {
    const a = s.indexOf('<script', i);
    if (a < 0) { out += s.slice(i); break; }
    out += s.slice(i, a);
    const b = s.indexOf('</script>', a);
    if (b < 0) break;
    i = b + 9;
  }
  return out.replace(/<!--[\s\S]*?-->/g, '');
})();

const ESC = /\\u[0-9a-fA-F]{4}/g;
const hits = [...bare.matchAll(ESC)].map(m =>
  bare.slice(Math.max(0, m.index - 40), m.index + 16).replace(/\s+/g, ' ').trim());

ok('у розмітці немає неперетворених \\uXXXX', hits.length === 0, hits.slice(0, 5));

/* Те саме для &#; -подібних описок і для \n, який у HTML теж нічого
   не переносить, а показується як два символи. */
const NL = /[^\\]\\n(?![a-zA-Z])/g;
const nls = [...bare.matchAll(NL)].map(m =>
  bare.slice(Math.max(0, m.index - 40), m.index + 10).replace(/\s+/g, ' ').trim());
ok('і немає \\n, який нічого не переносить', nls.length === 0, nls.slice(0, 5));

/* ── ПІДПИС КНОПКИ ──
   Сніжинка була метафорою, яку треба розгадувати, та ще й не
   показувалась. «Cold» однаково зветься й трафік, і ліди, і
   аудиторія — щоразу інше. */
const btn = HTML.slice(HTML.indexOf('id="cr-cold"'), HTML.indexOf('id="cr-cold"') + 500);
const label = (btn.match(/>([^<>]+)<\/button>/) || [])[1] || '';
ok('кнопка підписана словами', /barely ran/i.test(label.trim()), label.trim());
ok('і без сніжинки', !/❄|\\u2744/.test(label), label.trim());
/* Підказка лишається: вона каже те, чого в двох словах не скажеш —
   що фільтр не зважає на вибраний період. */
ok('а підказка пояснює, що період не діє',
  /ignores the date range/i.test(btn), btn.slice(0, 200));

/* ── ЗНАК ПОРІВНЯННЯ ПОРУЧ ── */
ok('поріг підписаний справжнім «≤»', bare.includes('≤ $'), '≤ $');

await done(null, null, []);
