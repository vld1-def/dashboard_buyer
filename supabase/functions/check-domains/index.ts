/* ═══════════ ПЕРЕВІРКА ДОМЕНІВ ═══════════
   Те, чого не може дашборд. Сторінка бачить лише «відповів / не
   відповів»: CORS не дає прочитати чужу відповідь, а no-cors повертає
   статус 0 і для 200, і для 404. Тут запит іде з сервера, де ніякого
   CORS немає, — звідси справжній код відповіді.

   Що робить:
     1. бере домени команди (через RLS — тільки ті, що належать тому,
        хто викликав);
     2. HEAD, а якщо сервер його не розуміє — GET;
     3. якщо є ключ — питає Google, чи домен не в чорному списку;
     4. пише статус назад.

   ЖОДНИХ ІМПОРТІВ. Раніше тут був supabase-js через jsr:. Бібліотека
   для двох запитів — зайва вага, а головне: якщо імпорт не розвʼяжеться,
   функція падає ще до запуску. Тоді шлюз віддає помилку БЕЗ CORS-
   заголовків, і браузер показує голе «Failed to fetch» — навіть коли з
   самим кодом усе гаразд. Діагностувати таке ззовні майже неможливо.

   PostgREST — це звичайний HTTP, і supabase-js під капотом робить рівно
   те саме: GET на /rest/v1/<таблиця> і PATCH з фільтром. RLS працює від
   заголовка Authorization, тобто від того, хто викликав.

   Розгортання: Supabase → Edge Functions → check-domains, або
     supabase functions deploy check-domains

   Ключ сервісної ролі тут свідомо НЕ використовується: інакше будь-хто,
   хто докличеться до функції, отримав би доступ до чужих рядків. */

// Та сама версія Graph API, що й у решти функцій: різні версії в одному
// проєкті означають, що колись одна з них відпаде тихо.
const GRAPH = 'https://graph.facebook.com/v21.0';

const TIMEOUT = 10_000;
const POOL = 8;
// Скільки доменів за один виклик. Edge Function має ліміт часу, і
// краще чесно повернути «є ще» і дати дашборду попросити наступну
// порцію, ніж обірватись посеред роботи, нічого не записавши.
const BATCH = 200;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type Verdict = { status: string; status_code: number | null };
type Row = { id: number; domain: string; team_name: string; status: string | null;
              created_by: string | null; broken_since: string | null };

/* ЩО САМЕ ОЗНАЧАЄ КОД ВІДПОВІДІ.

   Доти будь-який 4xx, крім 404, ішов у notfound — і домени, які
   чудово працюють у браузері, щоранку приходили як зламані.

   403 (а ще 401, 429 і 451) означає рівно протилежне «домен мертвий»:
   DNS розвʼязався, TLS потиснув руку, сервер ВІДПОВІВ — і відмовив
   саме НАМ. Для лендінга це нормальний стан: Cloudflare відсікає все,
   що не схоже на людину, а клоакінг віддає сторінку лише своєму
   трафіку з потрібного гео. Запит із серверної IP-адреси туди не
   потрапляє за визначенням.

   Тому в таких кодів свій стан — guarded. Він не ховається (видно
   окремою плиткою) і не здіймає тривогу: домену нічого не бракує,
   бракує нам доступу до нього.

   404 і 410 лишаються notfound: там сервер каже, що сторінки немає, і
   це вже про домен, а не про нас. */
const GUARDED = [401, 403, 429, 451];

function verdictOf(code: number): Verdict {
  return {
    status: code >= 200 && code < 400 ? 'ok'
          : GUARDED.includes(code) ? 'guarded'
          : code === 404 || code === 410 ? 'notfound'
          : code >= 500 ? 'down'
          : 'notfound',
    status_code: code
  };
}

async function probe(domain: string): Promise<Verdict> {
  /* ДРУГА СПРОБА НА МЕРЕЖЕВУ ВІДМОВУ. Одна обірвана зʼєднання з
     сотні — це не «домен упав», а мережа; а домен, записаний у
     зламані, йде в телеграм і підіймає людину вночі. Другої спроби
     досить, щоб відсіяти саме такі випадки, і вона коштує одного
     запиту лише там, де перший уже не вдався. */
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 800));
    for (const method of ['HEAD', 'GET'] as const) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), TIMEOUT);
      try {
        const res = await fetch('https://' + domain + '/', {
          method, redirect: 'follow', signal: ctl.signal,
          // Без цього частина хостингів віддає 403 просто через порожній UA.
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; domain-check/1.0)' }
        });
        // 405 на HEAD — сервер просто не вміє цей метод, це не діагноз.
        // Пробуємо GET, перш ніж записати домен у проблемні.
        if (method === 'HEAD' && (res.status === 405 || res.status === 501)) continue;
        return verdictOf(res.status);
      } catch (_e) {
        // DNS, сертифікат, відкинуте з'єднання, таймаут — з HTTP не
        // розрізняються, і для нас це однаково «не відповідає».
        if (method === 'GET') break;      // на другий заход, а не одразу у вирок
      } finally { clearTimeout(t); }
    }
  }
  return { status: 'down', status_code: null };
}

/* ── Чи домен у чорному списку Google ──

   Два різні продукти на тій самій базі:

   Web Risk (webrisk.googleapis.com) — комерційний. Безкоштовний обсяг
   плюс оплата за перевищення. Саме його вимагають умови Google для
   використання «for sale or revenue-generating purposes», тобто для
   нашого випадку.

   Safe Browsing v4 (safebrowsing.googleapis.com) — безкоштовний, але
   тільки для некомерційного використання. Лишаємо як запасний варіант,
   бо код уже написаний і комусь підійде.

   Якщо є обидва ключі — беремо Web Risk.

   ВАЖЛИВО ПРО СХЕМУ. Раніше тут надсилались і http, і https «про всяк
   випадок». Це було зайве: під час канонізації Google відкидає схему,
   логін, пароль і порт — збіг шукається лише за хостом і шляхом. Тому
   достатньо одного запису на домен. */

/* SOCIAL_ENGINEERING_EXTENDED_COVERAGE — окремий список Google саме під
   фішинг і сайти-обманки. За їхніми ж словами, він піднімає покриття
   таких сторінок «до 90% у деяких випадках». Без нього домен, на якому
   Chrome малює червоний екран «Небезпечний сайт», цілком може не
   знайтись у звичайному SOCIAL_ENGINEERING.

   У Safe Browsing v4 такого типу немає — там натомість
   POTENTIALLY_HARMFUL_APPLICATION, він додається нижче окремо. */
const THREATS = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'];
const THREATS_WR = THREATS.concat('SOCIAL_ENGINEERING_EXTENDED_COVERAGE');

// Web Risk: один GET на домен. Пакетного варіанта в Lookup API немає,
// тож женемо пулом, як і самі перевірки доменів.
async function flaggedWebRisk(domains: string[], key: string): Promise<Set<string>> {
  const out = new Set<string>();
  const qs = THREATS_WR.map(t => 'threatTypes=' + t).join('&');
  const queue = domains.slice();
  const worker = async () => {
    for (;;) {
      const d = queue.shift();
      if (!d) return;
      try {
        const url = 'https://webrisk.googleapis.com/v1/uris:search?' + qs
          + '&uri=' + encodeURIComponent('http://' + d + '/')
          + '&key=' + encodeURIComponent(key);
        const res = await fetch(url);
        if (!res.ok) continue;
        const j = await res.json();
        // Порожній обʼєкт у відповіді означає «збігів немає».
        if (j && j.threat) out.add(d);
      } catch (_e) { /* мітки — бонус, а не причина завалити перевірку */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, worker));
  return out;
}

// Safe Browsing v4: пакетно, до 500 записів за запит.
async function flaggedSafeBrowsing(domains: string[], key: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < domains.length; i += 450) {
    const chunk = domains.slice(i, i + 450);
    try {
      const res = await fetch(
        'https://safebrowsing.googleapis.com/v4/threatMatches:find?key=' + encodeURIComponent(key),
        { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client: { clientId: 'dashboard-buyer', clientVersion: '1.0' },
            threatInfo: {
              threatTypes: THREATS.concat('POTENTIALLY_HARMFUL_APPLICATION'),
              platformTypes: ['ANY_PLATFORM'],
              threatEntryTypes: ['URL'],
              threatEntries: chunk.map(d => ({ url: 'http://' + d + '/' }))
            }
          }) });
      if (!res.ok) continue;
      const j = await res.json();
      (j.matches || []).forEach((m: { threat?: { url?: string } }) => {
        const u = String(m?.threat?.url || '');
        const host = u.replace(/^[a-z]+:\/\//, '').split('/')[0];
        if (host) out.add(host.replace(/^www\./, ''));
      });
    } catch (_e) { /* те саме */ }
  }
  return out;
}

/* ── Другий і третій погляд: фільтрувальні DNS ──

   Web Risk — це думка Google, і тільки Google. Ми вже бачили, що домен
   із червоним екраном у Chrome може не знайтись у його ж Lookup API.
   Тому питаємо ще два джерела, які нічого не коштують і не мають ні
   квот, ні ліцензійних обмежень на комерційне використання.

   Прийом простий: резолвимо домен ДВІЧІ — через звичайний резолвер і
   через той, що фільтрує шкідливе. Різниця у відповідях і є вироком.

     1.1.1.1  (cloudflare-dns.com)           — без фільтра, це контроль
     1.1.1.2  (security.cloudflare-dns.com)  — блокує malware і фішинг,
                                               віддаючи 0.0.0.0
     9.9.9.9  (dns.quad9.net)                — блокує, віддаючи NXDOMAIN
                                               (Status 3)

   Домен, який контроль резолвить, а фільтр — ні, лежить у чиємусь
   списку загроз. Чий саме — записуємо, щоб було видно, хто сказав.

   Чому це варте свічок: Cloudflare і Quad9 збирають дані з десятків
   фідів (не лише від Google), тож разом вони бачать помітно більше.
   А коштує це рівно нічого. */

type Dns = { blocked: boolean; resolved: boolean };

async function doh(url: string, domain: string): Promise<Dns> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(url + '?name=' + encodeURIComponent(domain) + '&type=A',
      { headers: { accept: 'application/dns-json' }, signal: ctl.signal });
    if (!res.ok) return { blocked: false, resolved: false };
    const j = await res.json();
    const ans: { data?: string }[] = j.Answer || [];
    const ips = ans.map(a => String(a.data || '')).filter(x => /^\d+\.\d+\.\d+\.\d+$/.test(x));
    // NXDOMAIN (3) або відповідь 0.0.0.0 — це «заблоковано».
    const nx = j.Status === 3;
    const sink = ips.length > 0 && ips.every(ip => ip === '0.0.0.0');
    return { blocked: nx || sink, resolved: ips.some(ip => ip !== '0.0.0.0') };
  } catch (_e) {
    return { blocked: false, resolved: false };
  } finally { clearTimeout(t); }
}

// Повертає домен → хто його позначив.
async function flaggedByDns(domains: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const queue = domains.slice();
  const worker = async () => {
    for (;;) {
      const d = queue.shift();
      if (!d) return;
      const [plain, cf, q9] = await Promise.all([
        doh('https://cloudflare-dns.com/dns-query', d),
        doh('https://security.cloudflare-dns.com/dns-query', d),
        doh('https://dns.quad9.net/dns-query', d)
      ]);
      // Якщо навіть звичайний резолвер домен не знає — він просто
      // мертвий, а не позначений. Мовчання фільтра тут нічого не значить.
      if (!plain.resolved) continue;
      const by: string[] = [];
      if (cf.blocked) by.push('cloudflare');
      if (q9.blocked) by.push('quad9');
      if (by.length) out.set(d, by);
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, worker));
  return out;
}

Deno.serve(async (req) => {
  // OPTIONS — найперше й без жодних умов: це preflight, і якщо на нього
  // не відповісти CORS-заголовками, браузер не покаже навіть тексту
  // помилки, лише «Failed to fetch».
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });
  try {
    return await handle(req);
  } catch (e) {
    // Будь-яка несподівана помилка теж має приїхати з CORS-заголовками,
    // інакше в браузері вона виглядає як відсутність звʼязку.
    return new Response(JSON.stringify({ error: 'unhandled: ' + (e as Error).message }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
  }
});

/* Спільний секрет звіряємо по всій довжині, а не до першої розбіжності.
   Дешево, і знімає цілий клас питань до коду. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Скільки запитів Web Risk витрачено — пишемо в team_settings, поруч із
   рештою налаштувань команди. Окрема таблиця заради одного числа не
   потрібна, а так дашборд читає його тим самим getTeamSetting.

   Робить це лише нічний прогін: він іде від сервісної ролі, і RLS йому
   не завада. Ручну перевірку рахує сама сторінка — там запис іде від
   людини, і вигадувати їй created_by у функції було б зайвим ризиком. */
async function noteSpend(base: string, hdr: Record<string, string>,
                         byTeam: Map<string, number>): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  for (const [team, n] of byTeam) {
    if (!n || !team) continue;
    try {
      const res = await fetch(base + '/rest/v1/team_settings?select=value'
        + '&team_name=eq.' + encodeURIComponent(team) + '&key=eq.wr_usage', { headers: hdr });
      let cur: Record<string, number> = {};
      if (res.ok) {
        const rows = await res.json();
        try { cur = JSON.parse(rows?.[0]?.value || '{}') || {}; } catch (_e) { cur = {}; }
      }
      cur[month] = (cur[month] || 0) + n;
      // Пів року історії — досить, щоб побачити, чи витрати ростуть.
      const keep = Object.keys(cur).sort().slice(-6);
      const trimmed: Record<string, number> = {};
      keep.forEach(k => trimmed[k] = cur[k]);
      await fetch(base + '/rest/v1/team_settings', {
        method: 'POST',
        headers: { ...hdr, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ team_name: team, key: 'wr_usage', value: JSON.stringify(trimmed) })
      });
    } catch (_e) { /* лічильник — не причина завалити перевірку */ }
  }
}

/* ── повідомлення в Telegram ──

   Шлемо, тільки якщо є що сказати. Щоденне «все гаразд» перестають
   читати на третій день, і тоді разом з ним перестають помічати те
   єдине повідомлення, заради якого все й робилось.

   Токен бота і chat_id живуть у секретах функції. У дашборді їм не
   місце: це статичний сайт, який відкриває вся команда, і все
   збережене в ньому видно кожному, хто подивиться в консоль.

   Немає секретів — просто нічого не шлемо. Перевірка доменів від цього
   не залежить і має працювати сама по собі. */

const TG_MAX = 25;    // скільки доменів перелічуємо поіменно
/* Ліміт повідомлення в Telegram — 4096 символів, і за нього він
   відповідає 400. Двадцять пʼять звичайних доменів у нього вкладаються
   з великим запасом, але в домені дозволено 253 символи, а поруч ще
   список того, хто поставив мітку. Тож ріжемо не лише за кількістю, а
   й за довжиною: краще коротший список і хвіст «і ще N», ніж мовчання
   через відмову. */
const TG_LIMIT = 3900;

/* Які статуси вважаємо зламаним доменом. Один список на всю функцію:
   розійшовшись, він дав би найгірший різновид вади — домен, який в
   одному місці зламаний, а в іншому ні. */
const BAD = ['down', 'notfound', 'danger'];

const TG_MARK: Record<string, string> = {
  danger: '\u{1F534}', notfound: '\u{1F7E0}', down: '\u{26AB}'
};
const TG_WHAT: Record<string, string> = {
  danger: 'мітка', notfound: '404 — сторінки немає', down: 'не відповідає'
};
/* guarded у TG_WHAT немає навмисно: про домен, який просто не пускає
   робота, будити людину нема за чим. */
const TG_WAS: Record<string, string> = {
  ok: 'працював', danger: 'був із міткою', notfound: 'був 404',
  down: 'не відповідав', guarded: 'не пускав робота',
  unknown: 'не перевірявся'
};

/* ── ДОСІ ЗЛАМАНИЙ ──

   Доповідати лише про ЗМІНУ статусу — правильно рівно доти, доки
   зміна колись настає. Домен, який ліг і лежить, змінюється один раз:
   першої ночі. Далі кожен наступний прогін бачить «було down, стало
   down», не каже нічого — і мовчить, поки на ньому горять гроші.
   Саме так і сталось: два домени лежали, а в Telegram не прийшло
   нічого, бо доповідати не було про що.

   Тому друга половина звіту: домени, які лежать ДОСІ. Щоб вона не
   перетворилась на щоденний шум, у неї потрапляють не всі — лише ті,
   на яких ЩОСЬ КРУТИТЬСЯ (це робить нижче tgSend). Зламаний домен без
   жодного активного оголошення нікому не пече: він зачекає до ранку.

   Читаємо з таблиці, а не з результатів прогону, і це навмисно:
   домени з міткою фоновий прогін пропускає, щоб не палити квоту Web
   Risk, — а мовчати про них тим паче не можна. */
type Still = { domain: string; team: string; owner: string | null;
               status: string; since: string | null };

async function stillBroken(base: string, hdr: Record<string, string>,
                           team: string, skip: Set<string>): Promise<Still[]> {
  const qs = new URLSearchParams();
  qs.set('select', 'domain,team_name,status,created_by,broken_since');
  qs.set('status', 'in.(' + BAD.join(',') + ')');
  qs.set('limit', '500');
  if (team) qs.set('team_name', 'eq.' + team);
  try {
    const res = await fetch(base + '/rest/v1/domains?' + qs.toString(), { headers: hdr });
    if (!res.ok) return [];
    const rows: Record<string, unknown>[] = await res.json();
    return rows
      // Те, що зламалось цієї ж ночі, вже стоїть у першій половині
      // листа. Двічі про один домен — це не наполегливість, а шум.
      .filter(r => !skip.has(String(r?.domain || '')))
      .map(r => ({ domain: String(r?.domain || ''), team: String(r?.team_name || ''),
                   owner: r?.created_by == null ? null : String(r.created_by),
                   status: String(r?.status || ''),
                   since: r?.broken_since == null ? null : String(r.broken_since) }))
      .filter(x => x.domain);
  } catch (_e) { return []; }
}

/* «3 дні» замість «3 днів»: рядок читають спросоння, і кривий
   відмінок спотикає рівно тоді, коли треба швидко зрозуміти. */
function days(since: string | null): string {
  if (!since) return '';
  const ms = Date.now() - Date.parse(since);
  if (!(ms >= 0)) return '';
  const n = Math.floor(ms / 86_400_000);
  if (n < 1) return 'сьогодні';
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return n + ' днів';
  if (o === 1) return n + ' день';
  if (o >= 2 && o <= 4) return n + ' дні';
  return n + ' днів';
}

/* ── ЩО КРУТИТЬСЯ НА ЗЛАМАНОМУ ДОМЕНІ ──

   Сама по собі звістка «домен помер» коштує небагато: далі треба
   згадати, які кампанії на ньому, залізти в кожен кабінет і знайти їх
   руками. Саме ці хвилини й коштують грошей, бо відкрутка в цей час
   іде в нікуди.

   Відповідь уже лежить у базі: fb-sync пише поруч із кожним
   оголошенням хост, на який воно веде. Лишилось поставити питання з
   іншого боку — не «куди веде це оголошення», а «що живе на цьому
   домені».

   ACTIVE і тільки ACTIVE. Вимкнене на мертвому домені нікому не
   шкодить, а в списку воно б тільки заважало побачити те, що справді
   витрачає.

   Що з цим робимо — нижче, у блоці АВТОЗУПИНКИ. Коротко: мітку
   глушимо одразу, 404 і «не відповідає» — лише коли лежать довше за
   дві години, і кампанію цілком лише тоді, коли в ній не лишилось
   живих оголошень на робочих доменах. Причина обережності та сама, що
   колись робила цей блок суто звітним: 403 від Cloudflare нашому
   User-Agent виглядає як зламаний домен. */

type Live = { ad: string; campaign: string; campaignId: string;
              account: string; spend: number };

const LIVE_MAX = 4;     // скільки кампаній перелічуємо під доменом

async function liveOn(base: string, hdr: Record<string, string>,
                      domains: string[]): Promise<Map<string, Live[]>> {
  const out = new Map<string, Live[]>();
  const want = [...new Set(domains.filter(Boolean))];
  if (!want.length) return out;
  /* in.() з лапками: у домені бувають дефіси й крапки, а PostgREST без
     лапок вважав би кому роздільником і на цьому спіткнувся. */
  const list = want.map(d => '"' + d.replace(/"/g, '') + '"').join(',');
  try {
    const res = await fetch(base + '/rest/v1/fb_ad_today'
      + '?select=ad_id,name,campaign_id,campaign_name,account_id,spend,link_domain'
      + '&effective_status=eq.ACTIVE'
      + '&link_domain=in.(' + encodeURIComponent(list) + ')', { headers: hdr });
    /* Колонки ще немає — DOMAIN_GUARD.sql не виконаний. Це не привід
       завалити перевірку доменів: вона працювала до цього поля й має
       працювати без нього. */
    if (!res.ok) return out;
    const rows: Record<string, unknown>[] = await res.json();
    rows.forEach((r: Record<string, unknown>) => {
      const d = String(r?.link_domain || '');
      if (!d) return;
      const list_ = out.get(d) || [];
      list_.push({
        ad: String(r?.ad_id || ''),
        campaign: String(r?.campaign_name || ''),
        // Зупиняти можна лише за id: назва кампанії не унікальна навіть
        // у межах кабінета, і глушити за нею означало б вгадувати.
        campaignId: String(r?.campaign_id || ''),
        account: String(r?.account_id || ''),
        spend: Number(r?.spend) || 0
      });
      out.set(d, list_);
    });
  } catch (_e) { /* немає таблиці чи звʼязку — домени це не спиняє */ }
  return out;
}

/* Оголошень під одним доменом бувають десятки, і перелічувати їх
   поіменно означало б втопити повідомлення. Людині потрібен кабінет і
   кампанія — далі вона знайде сама. */
/* «3 оголошень крутиться» — не українська. Правило просте й давно
   відоме: 1 — оголошення крутиться, 2-4 — оголошення крутяться, решта
   — оголошень крутиться, з окремим випадком на 11-14. Рядок читають
   спросоння, і кривий відмінок у ньому спотикає рівно тоді, коли
   треба швидко зрозуміти. */
function ads(n: number): string {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return n + ' оголошень крутиться';
  if (o === 1) return n + ' оголошення крутиться';
  if (o >= 2 && o <= 4) return n + ' оголошення крутяться';
  return n + ' оголошень крутиться';
}

function liveLines(list: Live[] | undefined): string {
  if (!list || !list.length) return '';
  const byCamp = new Map<string, { ads: number; spend: number; acc: string }>();
  list.forEach(l => {
    const key = l.account + '|' + (l.campaign || l.ad);
    const cur = byCamp.get(key);
    if (cur) { cur.ads++; cur.spend += l.spend; }
    else byCamp.set(key, { ads: 1, spend: l.spend, acc: l.account });
  });
  const total = list.reduce((n, l) => n + l.spend, 0);
  const camps = [...byCamp.entries()].sort((a, b) => b[1].spend - a[1].spend);
  const head = `\n     \u{25B8} ${ads(list.length)} — $${total.toFixed(2)} сьогодні`;
  const rows = camps.slice(0, LIVE_MAX).map(([key, v]) =>
    `\n       \u2022 ${v.acc || '?'} · «${key.split('|').slice(1).join('|')}»`
    + ` — ${v.ads} ого., $${v.spend.toFixed(2)}`);
  const rest = camps.length - rows.length;
  return head + rows.join('') + (rest > 0 ? `\n       …і ще ${rest}` : '');
}


/* ═══════════ АВТОЗУПИНКА НА МЕРТВОМУ ДОМЕНІ ═══════════

   Довго тут було «тільки звіт», і причина була вагома: перевірка
   домену помиляється. 403 від Cloudflare нашому User-Agent виглядає як
   зламаний сайт, а клоакінг-домени навмисно віддають чужим 4xx.
   Вимкнути живу кампанію через таку помилку дорожче, ніж доїхати на
   мертвому домені до ранку.

   Тепер зупиняємо — але за трьома правилами, кожне з яких закриває
   один клас саме тієї помилки:

     1. МІТКА (danger) — одразу. Її ставить не наш запит, а Google Web
        Risk і фільтруючі DNS. З міткою домен однаково не відкривається
        в людей, тож простій уже заплачений — лишається тільки не
        платити за трафік у нікуди.

     2. 404 і «не відповідає» — тільки коли лежить ДОВШЕ ЗА ДВІ
        ГОДИНИ. Один прогін може впертись у чужий 403 чи хвилинну
        аварію хостингу; те саме через дві години — вже ні.

     3. Кампанію глушимо ЦІЛКОМ лише коли всі її активні оголошення
        стоять на мертвих доменах. Є в ній живі — зупиняємо рівно ті
        оголошення, що ведуть у нікуди. Вимкнути разом із мертвим і
        робоче — та сама помилка, тільки дорожча.

   Стеля на прогін. Якщо DNS віддав збій на пів списку, 30 зупинених
   кампаній — неприємність, а 300 — катастрофа, яку збирати назад
   руками півдня. Упершись у стелю, глушимо найдорожче і кажемо це в
   листі.

   Вимикач — team_settings.domains_autopause = '0' (перемикач у вікні
   Domains). За замовчуванням увімкнено: нічний прогін існує саме для
   того, щоб гроші не горіли до ранку.

   Працює ЛИШЕ з розкладу (cron), де є ключ сервісної ролі. Виклик зі
   сторінки нічого не зупиняє: ручна перевірка — це «подивитись», і
   перетворювати її на «вимкнути» означало б, що кнопка Check робить
   щось, чого від неї не просили. */

const PAUSE_CAP = 30;                      // кампаній/оголошень за прогін
const PAUSE_WAIT_MS = 2 * 3_600_000;       // 404 і down: скільки терпимо

type PauseOut = { campaigns: string[]; ads: string[];
                  bad: { id: string; why: string }[];
                  capped: number; note: string };

/* Команди, які вимкнули автозупинку самі. Рядка немає — увімкнено. */
async function pauseOffTeams(base: string, hdr: Record<string, string>): Promise<Set<string>> {
  const off = new Set<string>();
  try {
    const res = await fetch(base + '/rest/v1/team_settings'
      + '?select=team_name,value&key=eq.domains_autopause', { headers: hdr });
    if (!res.ok) return off;
    const rows: Record<string, unknown>[] = await res.json();
    rows.forEach(r => {
      if (/^(0|off|false|no)$/i.test(String(r?.value ?? '')))
        off.add(String(r?.team_name || ''));
    });
  } catch (_e) { /* немає таблиці — вважаємо, що вимикача не ставили */ }
  return off;
}

/* Кампанії, у яких лишились активні оголошення НЕ на мертвих доменах.
   Такі не глушимо цілком. Оголошення з невідомим доменом теж робить
   кампанію змішаною: невідомо — це не те саме, що мертво. */
async function mixedCampaigns(base: string, hdr: Record<string, string>,
                              ids: string[], dead: Set<string>): Promise<Set<string>> {
  const mixed = new Set<string>();
  if (!ids.length) return mixed;
  try {
    const res = await fetch(base + '/rest/v1/fb_ad_today'
      + '?select=campaign_id,link_domain&effective_status=eq.ACTIVE'
      + '&campaign_id=in.(' + encodeURIComponent(ids.join(',')) + ')', { headers: hdr });
    if (!res.ok) { ids.forEach(i => mixed.add(i)); return mixed; }
    const rows: Record<string, unknown>[] = await res.json();
    rows.forEach(r => {
      const d = String(r?.link_domain || '');
      if (!dead.has(d)) mixed.add(String(r?.campaign_id || ''));
    });
  } catch (_e) {
    /* Не змогли перевірити — вважаємо змішаними всі. Помилитись у бік
       «зупинили лише оголошення» дешевше, ніж у бік «вимкнули живу
       кампанію». */
    ids.forEach(i => mixed.add(i));
  }
  return mixed;
}

/* Токен на кабінет: fb_accounts.token_id → fb_tokens.token. Потрібен
   ads_management — читальний токен зупинити нічого не може, і дізнатись
   це краще до першого запиту, а не з half-зупиненого кабінета. */
async function pauseTokens(base: string, hdr: Record<string, string>, accounts: string[]):
    Promise<{ tok: Map<string, string>; bad: Map<string, string> }> {
  const tok = new Map<string, string>(), bad = new Map<string, string>();
  if (!accounts.length) return { tok, bad };
  try {
    const aRes = await fetch(base + '/rest/v1/fb_accounts?select=account_id,token_id'
      + '&account_id=in.(' + encodeURIComponent(accounts.join(',')) + ')', { headers: hdr });
    if (!aRes.ok) { accounts.forEach(a => bad.set(a, 'cabinet list unreadable')); return { tok, bad }; }
    const accs: Record<string, unknown>[] = await aRes.json();
    const ids = [...new Set(accs.map(a => Number(a?.token_id)).filter(n => n > 0))];
    if (!ids.length) { accounts.forEach(a => bad.set(a, 'no token linked')); return { tok, bad }; }
    const tRes = await fetch(base + '/rest/v1/fb_tokens?select=id,label,token,scopes'
      + '&id=in.(' + ids.join(',') + ')', { headers: hdr });
    if (!tRes.ok) { accounts.forEach(a => bad.set(a, 'token unreadable')); return { tok, bad }; }
    const rows: Record<string, unknown>[] = await tRes.json();
    const byId = new Map(rows.map(r => [Number(r?.id), r]));
    accs.forEach(a => {
      const acc = String(a?.account_id || '');
      const t = byId.get(Number(a?.token_id));
      if (!t) { bad.set(acc, 'the token this cabinet came from is gone'); return; }
      const scopes: string[] = Array.isArray(t.scopes) ? t.scopes as string[] : [];
      if (!scopes.includes('ads_management')) {
        bad.set(acc, 'token "' + String(t.label || '') + '" is read-only (no ads_management)');
        return;
      }
      tok.set(acc, String(t.token || ''));
    });
    accounts.forEach(a => { if (!tok.has(a) && !bad.has(a)) bad.set(a, 'cabinet not found'); });
  } catch (e) {
    accounts.forEach(a => bad.set(a, (e as Error).message));
  }
  return { tok, bad };
}

/* Пакетна зупинка. Facebook бере до 50 операцій за запит; помилка на
   рівні всього пакета (протух токен, ліміт) приходить не масивом, а
   звичайним {error}, і тоді не зупинилось НІЧОГО — цей випадок мусить
   бути видно окремо від «ось це одне не вдалось». */
async function graphPause(token: string, ids: string[]):
    Promise<{ ok: string[]; bad: { id: string; why: string }[] }> {
  const ok: string[] = [], bad: { id: string; why: string }[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const batch = part.map(id => ({ method: 'POST', relative_url: id, body: 'status=PAUSED' }));
    try {
      const res = await fetch(GRAPH + '/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: token, include_headers: 'false',
                                    batch: JSON.stringify(batch) }).toString()
      });
      const j = await res.json().catch(() => null);
      if (j && !Array.isArray(j) && j.error) {
        part.forEach(id => bad.push({ id, why: String(j.error.message || 'Graph API error') }));
        continue;
      }
      if (!Array.isArray(j)) { part.forEach(id => bad.push({ id, why: 'unexpected answer' })); continue; }
      j.forEach((r: Record<string, unknown> | null, k: number) => {
        const id = part[k];
        if (!id) return;
        if (!r) { bad.push({ id, why: 'Facebook did not answer in time' }); return; }
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(String(r.body || '{}')); } catch (_e) { /* байдуже */ }
        const err = body?.error as Record<string, unknown> | undefined;
        if (Number(r.code) === 200 && body?.success !== false) ok.push(id);
        else bad.push({ id, why: String(err?.message || 'HTTP ' + r.code) });
      });
      /* Відповідей менше, ніж операцій, бути не повинно — але якщо так,
         про ці id не можна сказати ні «зупинено», ні «не зупинено».
         Мовчки загубити їх означало б доповісти меншу цифру, ніж ми
         насправді намагались зробити. */
      if (j.length < part.length) part.slice(j.length)
        .forEach(id => bad.push({ id, why: 'Facebook answered about fewer items than asked' }));
    } catch (e) {
      part.forEach(id => bad.push({ id, why: (e as Error).message }));
    }
  }
  return { ok, bad };
}

async function autoPause(base: string, hdr: Record<string, string>,
                         worse: Change[], still: Still[],
                         live: Map<string, Live[]>): Promise<PauseOut> {
  const out: PauseOut = { campaigns: [], ads: [], bad: [], capped: 0, note: '' };
  const off = await pauseOffTeams(base, hdr);
  const now = Date.now();

  // 1. Які домени мертві достатньо твердо, щоб глушити.
  const dead = new Set<string>();
  worse.forEach(w => { if (w.to === 'danger' && !off.has(w.team)) dead.add(w.domain); });
  still.forEach(x => {
    if (off.has(x.team)) return;
    if (x.status === 'danger') { dead.add(x.domain); return; }
    const since = x.since ? Date.parse(x.since) : NaN;
    if (Number.isFinite(since) && now - since > PAUSE_WAIT_MS) dead.add(x.domain);
  });
  if (!dead.size) { out.note = off.size ? 'off or nothing hard enough' : 'nothing hard enough'; return out; }

  // 2. Що на них зараз крутиться. Найдорожче — першим: у стелю
  //    впираємось тим, що менше витрачає, а не випадковим.
  const items: Live[] = [];
  dead.forEach(d => (live.get(d) || []).forEach(l => items.push(l)));
  if (!items.length) { out.note = 'nothing live on dead domains'; return out; }
  items.sort((a, b) => b.spend - a.spend);

  // 3. Кампанія цілком — лише якщо в ній не лишилось живого.
  const mixed = await mixedCampaigns(base, hdr,
    [...new Set(items.map(i => i.campaignId).filter(Boolean))], dead);

  const byAcc = new Map<string, string[]>();
  const camps = new Set<string>(), ads_ = new Set<string>();
  for (const i of items) {
    const whole = i.campaignId && !mixed.has(i.campaignId);
    const id = whole ? i.campaignId : i.ad;
    if (!id || !i.account) continue;
    if ((whole ? camps : ads_).has(id)) continue;
    if (camps.size + ads_.size >= PAUSE_CAP) { out.capped++; continue; }
    (whole ? camps : ads_).add(id);
    const list = byAcc.get(i.account) || [];
    list.push(id);
    byAcc.set(i.account, list);
  }
  if (!byAcc.size) { out.note = 'nothing to pause'; return out; }

  // 4. Токени й самі запити.
  const { tok, bad } = await pauseTokens(base, hdr, [...byAcc.keys()]);
  bad.forEach((why, acc) => out.bad.push({ id: acc, why }));
  for (const [acc, ids] of byAcc) {
    const t = tok.get(acc);
    if (!t) continue;
    const r = await graphPause(t, ids);
    r.ok.forEach(id => (camps.has(id) ? out.campaigns : out.ads).push(id));
    out.bad.push(...r.bad);
  }
  out.note = out.campaigns.length || out.ads.length ? 'paused' : 'nothing paused';
  return out;
}

function pauseLines(pz?: PauseOut): string {
  if (!pz) return '';
  const n = pz.campaigns.length + pz.ads.length;
  if (!n && !pz.bad.length) return '';
  /* Головне в цьому рядку — не цифра, а те, що це зробили МИ. Людина,
     яка зранку бачить зупинену кампанію, мусить дізнатись чому тут, а
     не шукати винного в історії змін Facebook. */
  const parts: string[] = [];
  if (pz.campaigns.length) parts.push(pz.campaigns.length + ' кампаній');
  if (pz.ads.length) parts.push(pz.ads.length + ' оголошень (решта кампанії жива)');
  let out = n ? `\n\n\u{1F6D1} Зупинено: ${parts.join(' + ')}` : '';
  if (pz.capped) out += `\n     стеля прогону — ${PAUSE_CAP}; ще ${pz.capped} лишились крутитись`;
  if (pz.bad.length) out += `\n     не вдалось зупинити: ${pz.bad.length} (${pz.bad[0].why})`;
  return out;
}

function tgText(worse: Change[], checked: number,
                live?: Map<string, Live[]>, head_?: string,
                still?: Still[], pz?: PauseOut): string {
  const teams = new Set(worse.map(w => w.team).concat((still || []).map(x => x.team)));
  const all = worse.slice(0, TG_MAX).map(w => {
    const what = TG_WHAT[w.to] || w.to;
    const why = w.to === 'danger' && w.flagged_by ? ` (${w.flagged_by})` : '';
    // Команду називаємо, лише коли їх кілька: в одній команді це шум.
    const who = teams.size > 1 ? ` · ${w.team}` : '';
    return `${TG_MARK[w.to] || '\u{26AA}'} ${w.domain} — ${what}${why}`
         + `\n     було: ${TG_WAS[w.from] || w.from}${who}`
         /* Найцінніший рядок у всьому повідомленні: не «домен помер», а
            «домен помер, і ось що зараз на ньому витрачає». */
         + liveLines(live?.get(w.domain));
  });
  /* checked === worse.length означає особистий лист: там у знаменнику
     стояло б те саме число, і «2 з 2» читалось би як «перевірено лише
     два домени». */
  /* «Погіршилось: 0» — не звіт, а спантеличення: людина відкриває
     лист саме тому, що щось не так. Коли нового немає, рядок мовчить,
     а далі йде те, заради чого лист і прийшов. */
  const head = (head_ || `\u{1F319} Домени · нічна перевірка\n`)
             + (!worse.length ? ''
                : checked > worse.length
                 ? `Погіршилось: ${worse.length} з ${checked}\n\n`
                 : `Погіршилось: ${worse.length}\n\n`);
  const lines = all.slice();
  const tail = () => {
    const rest = worse.length - lines.length;
    return rest > 0 ? `\n\n…і ще ${rest}. Решта — у дашборді, фільтр Problem.` : '';
  };

  /* Друга половина: лежить не перший день, і на ньому досі крутиться.
     Стоїть ПІСЛЯ нового, бо щойно зламане важливіше: там ще можна
     встигнути. Але стоїть — бо інакше про це не сказав би ніхто. */
  const old_ = (still || []).map(x => {
    const how = days(x.since);
    const who = teams.size > 1 ? ` · ${x.team}` : '';
    return `${TG_MARK[x.status] || '\u{26AA}'} ${x.domain} — ${TG_WHAT[x.status] || x.status}`
         + (how ? ` · ${how}` : '') + who
         + liveLines(live?.get(x.domain));
  });
  const oldHead = old_.length
    ? `\n\n\u{1F553} Досі зламані, і гроші йдуть: ${old_.length}\n\n` : '';
  const oldTail = () => {
    const rest = old_.length - shown_.length;
    return rest > 0 ? `\n\n…і ще ${rest} таких. Дашборд, фільтр Problem.` : '';
  };
  const shown_ = old_.slice(0, TG_MAX);

  const whole = () => {
    const top = (head + lines.join('\n') + tail())
      /* Коли нового немає, заголовок закінчується переносом, а далі йде
         ще один — і лист починається з порожнечі. Дрібниця, але саме з
         таких дрібниць складається «його явно робив робот». */
      .replace(/\n+$/, '');
    return top + (shown_.length ? oldHead + shown_.join('\n') + oldTail() : '')
         + pauseLines(pz);
  };
  /* Ріжемо СПЕРШУ старе: у листі, який не влазить, новина про свіжу
     поломку цінніша за нагадування про вчорашню. */
  while (shown_.length && whole().length > TG_LIMIT) shown_.pop();
  while (lines.length > 1 && whole().length > TG_LIMIT) lines.pop();
  return whole();
}

async function tgPost(token: string, chat: string, text: string): Promise<string> {
  try {
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // Без parse_mode навмисно: домени рясніють крапками й дефісами,
      // а розмітка Telegram на них спотикається і відповідає 400.
      // Текст і так читається, а ламатись тут нема чому.
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
    });
    if (res.ok) return 'sent';
    // Причину віддаємо назад: її видно в net._http_response, і це
    // єдиний спосіб дізнатись, що бот мовчить не просто так.
    let why = 'HTTP ' + res.status;
    try { why = (await res.json()).description || why; } catch (_e) { /* хай буде код */ }
    return 'failed: ' + why;
  } catch (e) {
    return 'failed: ' + (e as Error).message;
  }
}

/* Кожному своє.

   Домени належать конкретним людям (created_by), і сповіщення мають
   ходити так само. Спільний чат лишається, але як доповнення для
   тімліда, а не як єдиний спосіб: інакше баєр бачить чужі домени, а
   свої мусить вишукувати серед них.

   Кому куди писати — в tg_links. Хто себе не прив'язав, того просто
   немає в розсилці: це не помилка, а вибір людини. */
async function tgSend(base: string, hdr: Record<string, string>,
                      worse: Change[], checked: number,
                      broken: Still[] = [], live_?: Map<string, Live[]>,
                      pz?: PauseOut): Promise<string> {
  const token = Deno.env.get('TG_BOT_TOKEN') || '';
  if (!token) return 'not configured';

  const shared = Deno.env.get('TG_CHAT_ID') || '';
  const out: string[] = [];

  /* Питаємо ОДИН раз на всі зламані домени, а не в кожному листі:
     рядки однакові, а запитів було б стільки, скільки людей. */
  /* Нічний прогін уже питав це для автозупинки — другий запит дав би
     ті самі рядки й шанс розійтись із тим, що ми справді зупинили. */
  const live = live_ || await liveOn(base, hdr,
    worse.map(w => w.domain).concat(broken.map(b => b.domain)));

  /* ОСЬ ДЕ нагадування перестає бути щоденним шумом: у лист іде не
     кожен зламаний домен, а лише той, на якому ЗАРАЗ щось крутиться.
     Домен, який ліг і нічого не витрачає, зачекає до ранку — і хай
     чекає мовчки, бо інакше через тиждень ці листи перестануть
     читати, а разом із ними й той єдиний, заради якого все це. */
  const still = broken.filter(b => (live.get(b.domain) || []).length > 0);

  if (!worse.length && !still.length) return 'nothing to report';

  // Спільний чат бачить усе — на те він і спільний.
  if (shared) out.push('shared:'
    + await tgPost(token, shared, tgText(worse, checked, live, undefined, still, pz)));

  const byOwner = new Map<string, Change[]>();
  worse.forEach(w => {
    if (!w.owner) return;   // нічий домен нікому й не адресуєш
    const list = byOwner.get(w.owner);
    if (list) list.push(w); else byOwner.set(w.owner, [w]);
  });
  /* Нагадування адресуємо так само поіменно. Власник, у якого сьогодні
     нічого нового не зламалось, листа досі не отримував би зовсім —
     хоча саме його домен і горить третю добу. */
  const stillBy = new Map<string, Still[]>();
  still.forEach(x => {
    if (!x.owner) return;
    const list = stillBy.get(x.owner);
    if (list) list.push(x); else stillBy.set(x.owner, [x]);
  });
  stillBy.forEach((_v, owner) => { if (!byOwner.has(owner)) byOwner.set(owner, []); });

  if (byOwner.size) {
    let links: { user_id: string; chat_id: string }[] = [];
    try {
      const res = await fetch(base + '/rest/v1/tg_links?select=user_id,chat_id&chat_id=not.is.null',
        { headers: hdr });
      if (res.ok) links = await res.json();
    } catch (_e) { /* таблиці може не бути — тоді просто нікому писати */ }

    const chats = new Map(links.map(l => [l.user_id, l.chat_id]));
    let sent = 0, unlinked = 0;
    const fails: string[] = [];
    for (const [owner, list] of byOwner) {
      const chat = chats.get(owner);
      if (!chat) { unlinked++; continue; }
      // checked ділити по людях чесно не вийде — вибірка йде по всіх
      // одразу. Тому кажемо, скільки саме в нього, а не частку від
      // чужого числа.
      const r = await tgPost(token, chat,
        tgText(list, list.length, live, undefined, stillBy.get(owner) || [], pz));
      if (r === 'sent') sent++; else fails.push(r);
    }
    out.push(`buyers: ${sent} sent`
      + (unlinked ? `, ${unlinked} not linked` : '')
      + (fails.length ? `, ${fails.length} failed (${fails[0]})` : ''));
  }

  return out.length ? out.join(' | ') : 'not configured';
}

type Batch = {
  error?: string; status?: number;
  checked: number; more: boolean; next: number; flags: string; spent: number;
  results: Result[]; changed: Change[]; byTeam: Map<string, number>;
};
type Result = { id: number; domain: string; status: string; status_code: number | null;
                flagged_by: string | null; source: string; checked_at: string;
                broken_since: string | null };
type Change = { domain: string; team: string; owner: string | null;
                from: string; to: string; flagged_by: string | null };

/* Одна порція. Винесено окремо, бо викликати її треба двома різними
   способами: сторінка просить по одній і сама веде курсор (так видно
   поступ), нічний прогін крутить їх поспіль до кінця списку. */
async function runBatch(base: string, hdr: Record<string, string>,
                        o: { team: string; only: string[] | null; after: number; force: boolean }
                       ): Promise<Batch> {
  const empty = { checked: 0, more: false, next: o.after, flags: '', spent: 0,
                  results: [] as Result[], changed: [] as Change[], byTeam: new Map<string, number>() };

  const qs = new URLSearchParams();
  // status потрібен не для фільтра, а щоб знати, що саме змінилось:
  // нічний прогін має доповідати про зміни, а не про весь список.
  // created_by — щоб знати, кому саме писати в Telegram.
  qs.set('select', 'id,domain,team_name,status,created_by,broken_since');
  qs.set('order', 'id.asc');
  qs.set('limit', String(BATCH + 1));
  if (o.team) qs.set('team_name', 'eq.' + o.team);
  if (o.after) qs.set('id', 'gt.' + o.after);
  if (o.only) qs.set('domain', 'in.(' + o.only.map(d => '"' + d.replace(/"/g, '') + '"').join(',') + ')');
  // Явний список доменів — це теж свідомий вибір, тож фільтр не вмикаємо.
  if (!o.force && !o.only) qs.set('status', 'neq.danger');

  let data: Row[] = [];
  try {
    const res = await fetch(base + '/rest/v1/domains?' + qs.toString(), { headers: hdr });
    if (!res.ok) return { ...empty, error: 'select failed: ' + res.status + ' ' + (await res.text()), status: 400 };
    data = await res.json();
  } catch (e) {
    return { ...empty, error: 'select failed: ' + (e as Error).message, status: 500 };
  }

  const rows = data.slice(0, BATCH);
  const more = data.length > BATCH;
  if (!rows.length) return empty;

  const verdicts = new Map<number, Verdict>();
  const queue = rows.slice();
  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      verdicts.set(row.id, await probe(row.domain));
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, worker));

  // Web Risk має перевагу: він — комерційний варіант, і саме його
  // вимагають умови Google, якщо перевірка обслуговує бізнес.
  const wrKey = Deno.env.get('WEB_RISK_KEY') || '';
  const sbKey = Deno.env.get('SAFE_BROWSING_KEY') || '';
  const names = rows.map(r => r.domain);
  // Google і DNS питаємо паралельно — вони незалежні, і чекати одне на
  // одного нема сенсу.
  const [bad, dns] = await Promise.all([
    wrKey ? flaggedWebRisk(names, wrKey)
          : sbKey ? flaggedSafeBrowsing(names, sbKey)
          : Promise.resolve(new Set<string>()),
    flaggedByDns(names)
  ]);
  const google = wrKey ? 'web-risk' : sbKey ? 'safe-browsing' : '';
  const flags = [google, 'dns'].filter(Boolean).join('+');

  const at = new Date().toISOString();
  const changed: Change[] = [];
  const results: Result[] = rows.map(r => {
    const v = verdicts.get(r.id)!;
    // Хто саме сказав «погано». Домен у чорному списку віддає звичайні
    // 200, тому мітка завжди важливіша за код відповіді.
    const by = (bad.has(r.domain) ? [google || 'blacklist'] : []).concat(dns.get(r.domain) || []);
    const status = by.length ? 'danger' : v.status;
    const flagged_by = by.length ? by.join(', ') : null;
    const was = r.status || 'unknown';
    if (status !== was) changed.push({ domain: r.domain, team: r.team_name,
                                       owner: r.created_by, from: was, to: status, flagged_by });
    /* ВІДКОЛИ лежить. Без цієї дати нагадування вміло б сказати лише
       «досі зламаний», а «досі зламаний, третю добу» — зовсім інша
       терміновість. Ставимо, коли зламався; знімаємо, коли ожив;
       не чіпаємо, поки лежить — інакше лічильник щоночі обнулявся б.
       Уже зламаний, а дати немає — це старі рядки з часів до цієї
       колонки: починаємо лік із сьогодні, бо вигадувати минуле гірше,
       ніж не знати його. */
    const bad_ = BAD.includes(status);
    const broken_since = !bad_ ? null : (r.broken_since || at);
    return { id: r.id, domain: r.domain, status, status_code: v.status_code,
             flagged_by, source: 'server', checked_at: at, broken_since };
  });

  // По одному PATCH на рядок: upsert писав би й ті колонки, яких ми не
  // читали, і затирав би PWA з нотатками порожнечею.
  await Promise.all(results.map(r =>
    fetch(base + '/rest/v1/domains?id=eq.' + encodeURIComponent(String(r.id)), {
      method: 'PATCH',
      headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: r.status, status_code: r.status_code,
                             flagged_by: r.flagged_by, source: 'server', checked_at: at,
                             broken_since: r.broken_since })
    }).catch(() => null)));

  // Web Risk — рівно один запит на домен, тож перевірені домени і є
  // витрата. DNS безкоштовний і в рахунок не йде.
  const spent = google ? rows.length : 0;
  const byTeam = new Map<string, number>();
  if (spent) rows.forEach(r => byTeam.set(r.team_name, (byTeam.get(r.team_name) || 0) + 1));

  return { checked: results.length, more, next: rows[rows.length - 1].id,
           flags, spent, results, changed, byTeam };
}

/* ── ПРОБНЕ СПОВІЩЕННЯ ──

   Щоб побачити, як виглядає тривога, не треба чекати, поки домен
   справді помре. Але й брехати не можна: повідомлення, яке нічим не
   відрізняється від справжнього, одного дня переплутають — і саме те,
   справжнє, не сприймуть всерйоз. Тому заголовок інший і сказано
   прямо, що це проба.

   Дані беремо СПРАВЖНІ, наскільки вони є: домен — перший проблемний
   зі списку людини, а як такого немає, то просто перший; живі
   оголошення — з бази, за тим самим запитом, що й у бойовому шляху.
   Порожньо — значить порожньо, і в повідомленні так і буде написано.
   Намальовані цифри показали б те, чого перевірка не вміє.

   Летить ЛИШЕ тому, хто натиснув: hdr тут — токен людини, і RLS віддає
   з tg_links рівно її рядок. Пробна тривога, яка будить усю команду, —
   найкращий спосіб добитись, щоб сповіщення вимкнули. */
async function testAlert(base: string, hdr: Record<string, string>,
                         team: string): Promise<Record<string, unknown>> {
  const token = Deno.env.get('TG_BOT_TOKEN') || '';
  if (!token) return { error: 'TG_BOT_TOKEN is not set in the function secrets' };

  let chat = '';
  try {
    const res = await fetch(base + '/rest/v1/tg_links?select=chat_id&chat_id=not.is.null&limit=1',
      { headers: hdr });
    if (res.ok) chat = String((await res.json())?.[0]?.chat_id || '');
  } catch (_e) { /* нижче скажемо, що чату немає */ }
  if (!chat) return { error: 'your Telegram is not linked — open the bot and press Start first' };

  /* Беремо реальний домен, щоб у повідомленні стояло щось упізнаване.
     Спершу той, що вже позначений проблемним: на ньому найімовірніше і
     є що показати. */
  const was = 'ok';
  let domain = '', to = 'down', flagged: string | null = null;
  try {
    const qs = (extra: string) => '?select=domain,status,flagged_by&limit=1'
      + (team ? '&team_name=eq.' + encodeURIComponent(team) : '') + extra;
    for (const extra of ['&status=in.(danger,down,notfound)', '']) {
      const res = await fetch(base + '/rest/v1/domains' + qs(extra), { headers: hdr });
      if (!res.ok) continue;
      const r = (await res.json())?.[0];
      if (!r?.domain) continue;
      domain = String(r.domain);
      if (extra) { to = String(r.status || 'down'); flagged = r.flagged_by || null; }
      break;
    }
  } catch (_e) { /* лишиться зразок нижче */ }
  const sample = !domain;
  if (sample) domain = 'example-domain.top';

  const worse: Change[] = [{ domain, team: team || '—', owner: null,
                             from: was, to, flagged_by: flagged }];
  const live = await liveOn(base, hdr, [domain]);
  const found = (live.get(domain) || []).length;

  /* Хвіст пояснює рівно те, що людина зараз бачить, — і окремо те,
     чого вона НЕ побачить: автопаузи тут немає і не буде без окремого
     рішення. Мовчання про це — найгірший варіант: із тривоги, яка
     виглядає рішучою, легко зробити висновок, що воно само вимкне. */
  const tail = '\n\n' + (found
      ? 'Так виглядатиме справжня тривога.'
      : sample
        ? 'Домен вигаданий: у списку ще немає жодного.'
        : 'Під доменом порожньо — активних оголошень на ньому зараз немає. '
          + 'У справжній тривозі тут був би список кабінетів і кампаній.')
    + '\nНічого не вимкнено: сповіщення тільки повідомляє.';

  const text = tgText(worse, 1, live,
    '\u{1F9EA} Пробне сповіщення · не тривога\n') + tail;
  const r = await tgPost(token, chat, text);
  return r === 'sent'
    ? { test: 'sent', domain, live: found, sample }
    : { error: r.replace(/^failed: /, '') };
}

async function handle(req: Request): Promise<Response> {

  const base = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;

  /* Два входи, і це не одне й те саме.

     Звичайний — зі сторінки. Заголовок Authorization несе токен людини,
     PostgREST рахує від нього RLS, і функція бачить рівно ті домени, що
     й вона сама. Ключ сервісної ролі тут свідомо НЕ використовується.

     Нічний — з розкладу. О пʼятій ранку ніхто не залогінений, токена
     взяти нізвідки, тож RLS від нього не порахуєш. Для цього окремий
     заголовок x-cron-key зі спільним секретом: звірили — і тільки тоді
     беремо ключ сервісної ролі й обходимо всі команди.

     Чому саме так, а не «покласти ключ сервісної ролі в розклад»: у
     розкладі лежить CRON_SECRET, який уміє рівно одне — запустити
     перевірку доменів. Ключ сервісної ролі вміє все й лишається в
     секретах функції. */
  const cronKey = req.headers.get('x-cron-key') || '';
  let hdr: Record<string, string>;
  let cron = false;

  if (cronKey) {
    const want = Deno.env.get('CRON_SECRET') || '';
    const svc = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!want || !svc) return new Response(JSON.stringify({
      error: 'scheduled run is not configured: set CRON_SECRET and SERVICE_ROLE_KEY in the function secrets' }),
      { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });
    if (!sameSecret(cronKey, want)) return new Response(JSON.stringify({ error: 'bad cron key' }),
      { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });
    cron = true;
    hdr = { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json' };
  } else {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return new Response(JSON.stringify({ error: 'no authorization header' }),
      { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });
    // apikey + Authorization — те саме, що надсилає supabase-js. RLS
    // рахується від Authorization, тобто від того, хто викликав.
    hdr = { apikey: anon, Authorization: auth, 'content-type': 'application/json' };
  }

  let team = '';
  let only: string[] | null = null;
  let after = 0;
  // Перевіряти домен, який уже позначений, — витрачати квоту Web Risk
  // намарно: мітку Google знімає рідко, а безкоштовних запитів 100 000
  // на місяць. Тому за замовчуванням такі пропускаємо. Перевірити
  // конкретний домен примусово можна, передавши force або список
  // domains — тоді це свідомий вибір, а не фоновий прогін.
  let force = false;
  // Проба сповіщення. Нічого не перевіряє й нічого не пише — тільки
  // шле повідомлення тому, хто натиснув.
  let test = false;
  try {
    const body = await req.json();
    team = String(body?.team || '');
    test = body?.test === true;
    // Курсор. Без нього кожен наступний виклик повертав би ті самі перші
    // BATCH рядків, і дашборд ганяв би одну порцію по колу, так і не
    // дійшовши до решти списку.
    after = Number(body?.after || 0) || 0;
    force = body?.force === true;
    if (Array.isArray(body?.domains) && body.domains.length) only = body.domains.map(String);
  } catch (_e) { /* тіла може не бути */ }

  /* Нічний прогін крутить порції сам: розклад стріляє один раз, і
     лишити півсписка неперевіреним до завтра — гірше, ніж попрацювати
     хвилину. Дедлайн потрібен, бо в Edge Function час не нескінченний:
     упершись у нього, чесно віддаємо more і скільки встигли. */
  if (cron) {
    const deadline = Date.now() + 110_000;
    let checked = 0, flags = '', spent = 0, more = false;
    const changed: Change[] = [];
    const byTeam = new Map<string, number>();
    for (let pass = 0; pass < 200; pass++) {
      const b = await runBatch(base, hdr, { team, only, after, force });
      if (b.error) {
        // Витрачене вже витрачено: обірвавшись мовчки, ми б загубили
        // рахунок за все, що функція встигла перевірити до помилки.
        await noteSpend(base, hdr, byTeam);
        return new Response(JSON.stringify({ error: b.error, checked, spent }),
          { status: b.status || 500, headers: { ...CORS, 'content-type': 'application/json' } });
      }
      checked += b.checked;
      spent += b.spent;
      flags = b.flags || flags;
      changed.push(...b.changed);
      b.byTeam.forEach((n, t) => byTeam.set(t, (byTeam.get(t) || 0) + n));
      after = b.next;
      more = b.more;
      if (!b.more || !b.checked) { more = false; break; }
      if (Date.now() > deadline) break;
    }
    await noteSpend(base, hdr, byTeam);
    /* Що змінилось — окремо від того, що перевірено. Саме це піде в
       Telegram, коли дійдуть руки: доповідати треба про нові проблеми,
       а не про те, що двісті доменів як працювали, так і працюють. */
    const worse = changed.filter(c => BAD.includes(c.to));
    /* Те, що лежить ДОСІ. Без цього прогін мовчав про домен, який
       ліг учора й горить далі: змін немає — отже, нема про що
       доповідати. Було саме так, і коштувало це двох доменів. */
    const still = await stillBroken(base, hdr, team,
      new Set(worse.map(w => w.domain)));
    /* Спершу гасимо, потім доповідаємо: лист, у якому написано «ось що
       горить», а гроші при цьому горять далі, — половина роботи. А
       список живого питаємо один раз на обидві потреби. */
    const live = await liveOn(base, hdr,
      worse.map(w => w.domain).concat(still.map(b => b.domain)));
    const paused = await autoPause(base, hdr, worse, still, live);
    const telegram = await tgSend(base, hdr, worse, checked, still, live, paused);
    return new Response(JSON.stringify({
      cron: true, checked, more, next: after, flags, spent,
      changed: changed.length, telegram, worse,
      // Що саме зупинено — у відповіді теж: журнал функції лишається
      // єдиним місцем, де це видно, якщо Telegram не налаштований.
      paused: { campaigns: paused.campaigns, ads: paused.ads,
                failed: paused.bad.length, capped: paused.capped, note: paused.note },
      // Скільки всього лежить — окремо від того, скільки пішло в лист
      // (у лист ідуть лише ті, на яких щось крутиться).
      broken: still.length
    }), { headers: { ...CORS, 'content-type': 'application/json' } });
  }

  /* Проба йде перед перевіркою: вона нічого не перевіряє і квоти не
     витрачає — лише показує, як виглядає повідомлення. */
  if (test) {
    const r = await testAlert(base, hdr, team);
    return new Response(JSON.stringify(r),
      { status: r.error ? 400 : 200, headers: { ...CORS, 'content-type': 'application/json' } });
  }

  const b = await runBatch(base, hdr, { team, only, after, force });
  if (b.error) return new Response(JSON.stringify({ error: b.error }),
    { status: b.status || 500, headers: { ...CORS, 'content-type': 'application/json' } });

  return new Response(JSON.stringify({
    checked: b.checked, more: b.more, flags: b.flags,
    // Скільки запитів Web Risk коштувала ця порція. Сторінка веде
    // лічильник сама — писати team_settings від імені людини у функції
    // означало б вигадувати їй created_by.
    spent: b.spent,
    // Звідки продовжувати наступним викликом.
    next: b.next,
    results: b.results
  }), { headers: { ...CORS, 'content-type': 'application/json' } });
}
