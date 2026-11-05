/* ═══════════ МЕРТВИЙ ПРОКСІ ВИМИКАЄТЬСЯ САМ ═══════════

   «давай краще в налаштуваннях відключати проксі якщо воно не ворк».

   Проксі вмирають тихо: оплата скінчилась, IP забанили, постачальник
   переїхав. У налаштуваннях він при цьому далі стоїть зеленим рядком,
   і людина вважає, що кабінет читається з її адреси.

   Тепер вердикт перевірки вмикає й вимикає його сам. САМ РЯДОК
   ЛИШАЄТЬСЯ: у ньому логін і пароль, назад зі сторінки їх не
   прочитати, і стирати через відмову, яка може бути тимчасовою,
   означало б змусити вводити все заново.

   ОКРЕМО Й ГОЛОВНЕ — рядок «No proxy» казав неправду. З нього
   випливало, що З проксі токен читає НЕ з адреси сервера. А через
   проксі не ходить жодна функція за розкладом: fb-sync, fb-rules і
   решта бʼють у Graph напряму, і єдине місце, де проксі взагалі
   використовується, — оця перевірка. */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8202;
const { ok, done } = checks();

const FN = fs.readFileSync('supabase/functions/fb-proxy/index.ts', 'utf8');
const SQL = fs.readFileSync('FB_TOKENS.sql', 'utf8');
const JS = fs.readFileSync('build/fbtok.js', 'utf8');

/* ── 1. СТОВПЧИК Є, І ЙОГО ВИДНО ЗІ СТОРІНКИ ── */
ok('у базі зʼявився proxy_on',
  /add column if not exists proxy_on\s+boolean/.test(SQL),
  (SQL.match(/add column if not exists proxy_on[^,;]*/) || [])[0]);
/* Без grant сторінка стовпчика не побачить — і стан «вимкнено» для
   неї не існуватиме, хоч у базі він і стоїть. */
ok('і сторінці дозволено його читати',
  /grant select \([\s\S]*?proxy_on[\s\S]*?\)\s*\n\s*on public\.fb_tokens/.test(SQL));
/* Старі рядки, додані до цього стовпчика, не мають вимкнутись самі. */
ok('старі рядки лишаються увімкненими', /proxy_on\s+boolean default true/.test(SQL));

/* ── 2. ВЕРДИКТ ПЕРЕВІРКИ ВМИКАЄ Й ВИМИКАЄ ── */
ok('перевірка пише proxy_on у базу', /proxy_on:\s*ok/.test(FN));
ok('і каже сторінці, що зробила', (FN.match(/proxy_on:\s*ok/g) || []).length >= 2);
/* Рядок проксі лишається: стерти його перевірка не має права. */
ok('сам рядок проксі перевірка не стирає',
  !/proxy:\s*null/.test(FN) && !/proxy:\s*''/.test(FN));

/* ── 3. СТОРІНКА ЧИТАЄ СТОВПЧИК ── */
ok('сторінка просить proxy_on у запиті', /proxy_note,proxy_on,proxy_checked_at/.test(JS));
/* Новий рядок дістає чистий аркуш: інакше проксі, вимкнений місяць
   тому, лишався б вимкненим і після заміни на інший. */
ok('новий проксі зберігається увімкненим',
  (JS.match(/proxy_on:\s*true/g) || []).length >= 2, 'fbtok.js');

/* ── 4. ЯК ЦЕ ВИГЛЯДАЄ НА ЕКРАНІ ── */
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT, { viewport: { width: 1100, height: 800 } });

const lineFor = row => page.evaluate(r => {
  const html = fbProxyLine(r);
  const d = document.createElement('div');
  d.innerHTML = html;
  return { html, text: (d.textContent || '').replace(/\s+/g, ' ').trim(),
           cls: (d.firstElementChild || {}).className || '' };
}, row);

const dead = await lineFor({ proxy_host: '1.2.3.4:8000', proxy_on: false,
  proxy_note: 'the proxy did not answer',
  proxy_checked_at: '2026-11-05T10:00:00Z' });
ok('вимкнений проксі має власний стан, а не просто жовтий',
  /is-dead/.test(dead.cls), dead.cls);
ok('і сказано, що його вимкнула саме перевірка',
  /turned off by the check/i.test(dead.text), dead.text);
ok('і чому', /did not answer/.test(dead.text), dead.text);
/* Найважливіше для людини: рядок не загублено, і що робити далі. */
ok('сказано, що введений рядок лишився', /line is kept/i.test(dead.text), dead.text);
ok('і як повернути', /Check proxy/.test(dead.text), dead.text);

const live = await lineFor({ proxy_host: '1.2.3.4:8000', proxy_on: true,
  proxy_note: 'ok', proxy_ip: '1.2.3.4',
  proxy_checked_at: '2026-11-05T10:00:00Z' });
ok('робочий проксі лишився зеленим', /is-on/.test(live.cls), live.cls);
ok('і без слова про вимкнення', !/turned off/i.test(live.text), live.text);

/* Старий рядок без стовпчика (proxy_on === undefined) не має читатись
   як вимкнений: інакше після деплою функції, але до виконання SQL,
   усі проксі разом стануть червоними. */
const old = await lineFor({ proxy_host: '1.2.3.4:8000', proxy_note: 'ok',
  proxy_ip: '1.2.3.4', proxy_checked_at: '2026-11-05T10:00:00Z' });
ok('рядок без стовпчика не вважається вимкненим',
  !/is-dead/.test(old.cls), old.cls);

/* ── 5. РЯДОК «NO PROXY» БІЛЬШЕ НЕ БРЕШЕ ── */
const none = await lineFor({});
ok('без проксі так і сказано', /No proxy/.test(none.text), none.text);
/* «same as every other one» означало «а з проксі — інакше». Неправда:
   через проксі зараз не ходить жодна функція за розкладом. */
ok('і немає натяку, що з проксі адреса була б інша',
  !/same as every other/i.test(none.text), none.text);

/* Те саме по зібраному файлу: стара обіцянка не мала лишитись ніде. */
const built = fs.readFileSync('/home/user/dashboard_buyer/index.html', 'utf8');
ok('і в зібраному файлі її теж немає',
  !/same as every other one/.test(built), 'index.html');

await done(browser, srv, errs);
