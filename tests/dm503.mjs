/* ═══════════ 503 — ЦЕ ДВА РІЗНІ ДОМЕНИ ═══════════

   «в доменах що за помилка 503? він позначає домен але він робочий».

   Правило було одне на всі пʼятисоті: code >= 500 → down. Але 503 —
   «сервіс недоступний» — у нашій справі найчастіше означає не лежачий
   хостинг, а щит: Cloudflare під «Under Attack», DDoS-Guard, Sucuri,
   Incapsula. Для людини з потрібного гео домен відкривається, для
   нашого робота з дата-центру — ні. Це рівно те, заради чого в коді
   вже є guarded.

   ЦІНА ПОМИЛКИ НЕ КОСМЕТИЧНА. Домен, що пролежав у down довше за
   PAUSE_WAIT_MS (дві години), потрапляє в «мертві достатньо твердо,
   щоб глушити» — тобто хибний 503 через дві години ГАСИТЬ РОБОЧИЙ
   ЗАЛИВ. Саме тому тут не «показує не те», а «вимикає не те».

   Але оголосити щитом усі 503 теж не можна: справді лежачий хостинг
   віддає той самий код. Тому дивимось, ХТО відповів.

   Стенд тримає обидві сторони межі. */
import fs from 'node:fs';
import { checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/check-domains/index.ts', 'utf8');

const grab = (re, what) => {
  const m = FN.match(re);
  ok('у функції є ' + what, !!m);
  return m ? m[0] : '';
};
/* Необовʼязковий параметр зрізаємо ПЕРШИМ: інакше правило нижче
   зʼїдає його тип і лишає «h?», на якому розбір і падає. */
const plain = src => src
  .replace(/(\w)\?\s*:\s*Headers\s*\|\s*null/g, '$1')
  .replace(/:\s*Headers\s*\|\s*null/g, '')
  .replace(/:\s*(Verdict|string|number|boolean)\b/g, '')
  .replace(/ as const/g, '');

const src = [
  grab(/const GUARDED = \[[^\]]*\];/, 'список GUARDED'),
  grab(/const SHIELD_HEADERS = \[[\s\S]*?\];/, 'заголовки щитів'),
  grab(/const SHIELD_SERVERS = [^\n]*/, 'перелік щитів у server'),
  grab(/function shieldOf[\s\S]*?\n}/, 'shieldOf'),
  grab(/function verdictOf[\s\S]*?\n}/, 'verdictOf')
].join('\n');
const verdictOf = new Function(plain(src) + '\nreturn verdictOf;')();

const H = o => new Headers(o || {});

/* ── ЩИТ НАЗВАВСЯ → guarded ──
   Жодного гасіння: guarded не входить ні в BAD, ні в список
   «мертвих достатньо твердо». */
const shields = [
  ['Cloudflare у server', { server: 'cloudflare' }],
  ['cf-ray', { 'cf-ray': '8f2a1b', server: 'nginx' }],
  ['cf-mitigated', { 'cf-mitigated': 'challenge' }],
  ['DDoS-Guard', { server: 'ddos-guard' }],
  ['Sucuri', { 'x-sucuri-id': '12ab' }],
  ['Incapsula/Imperva', { 'x-iinfo': '1-2-3' }],
  ['Akamai', { server: 'AkamaiGHost' }],
  ['DataDome', { 'x-datadome': 'protected' }]
];
for (const [what, hdr] of shields) {
  const v = verdictOf(503, H(hdr));
  ok('503 за щитом (' + what + ') — не падіння', v.status === 'guarded', v);
}
ok('і код при цьому зберігається', verdictOf(503, H({ server: 'cloudflare' })).status_code === 503);

/* ── ЩИТ НЕ НАЗВАВСЯ → down, як і було ──
   Справді лежачий хостинг віддає той самий 503, і мовчати про нього
   не можна: інакше ми поміняли б одну сліпу пляму на іншу. */
ok('503 без щита лишається падінням',
  verdictOf(503, H({ server: 'nginx/1.24' })).status === 'down', verdictOf(503, H({ server: 'nginx/1.24' })));
ok('503 зовсім без заголовків — теж',
  verdictOf(503, null).status === 'down', verdictOf(503, null));
ok('503 з порожнім server — теж',
  verdictOf(503, H({})).status === 'down', verdictOf(503, H({})));

/* ── 502 І 504 ЛИШАЮТЬСЯ ПАДІННЯМ НАВІТЬ ЗА ЩИТОМ ──
   Вони означають, що сам origin за щитом не відповідає: щит
   справний, лежить саме домен. Якби ми й їх віднесли до guarded,
   мертвий домен за Cloudflare не підняв би тривоги ніколи. */
for (const code of [500, 502, 504]) {
  const v = verdictOf(code, H({ server: 'cloudflare', 'cf-ray': '8f2a1b' }));
  ok(code + ' за Cloudflare — усе одно падіння', v.status === 'down', v);
}

/* ── РЕШТА ПРАВИЛ НЕ ЗРУШИЛАСЬ ── */
ok('200 — ok', verdictOf(200, H({ server: 'cloudflare' })).status === 'ok');
ok('301 — ok', verdictOf(301, null).status === 'ok');
ok('403 — guarded, як і був', verdictOf(403, null).status === 'guarded');
ok('429 — guarded', verdictOf(429, null).status === 'guarded');
ok('404 — notfound', verdictOf(404, H({ server: 'cloudflare' })).status === 'notfound');
ok('410 — notfound', verdictOf(410, null).status === 'notfound');

/* ── І ЗАГОЛОВКИ СПРАВДІ ДОЇЖДЖАЮТЬ ДО ВИРОКУ ──
   Без цього рядка вся перевірка вище міряла б функцію, яку ніхто не
   кличе з заголовками. */
ok('probe передає заголовки у verdictOf',
  /return verdictOf\(res\.status, res\.headers\)/.test(FN), 'verdictOf(res.status, res.headers)');
/* guarded не глушить оголошення — саме це й робить виправлення
   вартим. */
ok('guarded не входить до BAD',
  /const BAD = \['down', 'notfound', 'danger'\]/.test(FN), 'BAD');

await done(null, null, []);
