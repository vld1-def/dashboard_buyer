/* ═══════════ ПЕРЕВІРКА ПРОКСІ ТОКЕНА ═══════════

   Усе, що ходить у Facebook за розкладом, крутиться на інфраструктурі
   Supabase — отже з її адрес. Один набір адрес на всі токени й усі
   кабінети. Проксі на кожен токен це розводить: кабінет читається з
   тієї адреси, з якої ти в нього й заходиш.

   ЦЯ ФУНКЦІЯ НІЧОГО НЕ МІНЯЄ В FACEBOOK І НЕ СИНХРОНІЗУЄ. Вона робить
   три запити й каже, що вийшло. Саме тому вона зʼявилась ПЕРШОЮ, до
   того як на проксі перевели синхронізацію: якщо рантайм не вміє
   createHttpClient, це має зʼясуватись тут, а не посеред нічного
   прогону, коли парк лишиться без оновлення.

   ЩО САМЕ ПЕРЕВІРЯЄМО, І ЧОМУ ТРИ ЗАПИТИ:

   1. Адреса БЕЗ проксі. Без неї «проксі працює» нічим не підтверджене:
      однакові адреси в обох рядках означають, що запит пішов повз
      проксі, і це найважливіше, що тут можна побачити.
   2. Адреса ЧЕРЕЗ проксі. Вона й має стояти в кабінеті.
   3. Graph через проксі. Проксі може віддавати сторінку, але не
      пускати до Facebook — а нам потрібен саме Facebook.

   ТОКЕН І РЯДОК ПРОКСІ НАЗОВНІ НЕ ЙДУТЬ. У відповіді лише адреси,
   host:port і слова про те, що сталось. Рядок проксі містить логін і
   пароль, тож поводимось із ним як із токеном (див. FB_TOKENS.sql).

   ЖОДНИХ ІМПОРТІВ — з тієї ж причини, що й у решті функцій: якщо
   імпорт не розвʼяжеться, функція падає ще до запуску, і ззовні це не
   відрізнити від несправного проксі.

   Розгортання:
     supabase functions deploy fb-proxy
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';
/* Хто я ззовні. Сторонній сервіс, і це свідомо: сам Facebook своєї
   адреси не повертає, а без неї перевірка перетворюється на «запит
   пройшов» — тобто на те саме «начебто». Відповідь береться
   якнайкоротша, і невдача тут не фатальна: головний висновок дає
   Graph, а адреса — пояснення до нього. */
const IP_ECHO = 'https://api.ipify.org?format=json';
const STEP_MS = 15_000;

type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

async function whoAmI(base: string, anon: string, auth: string): Promise<string> {
  try {
    const res = await fetch(base + '/auth/v1/user', {
      headers: { apikey: anon, Authorization: auth }
    });
    if (!res.ok) return '';
    const u = await res.json().catch(() => ({}));
    return String(u?.id || '');
  } catch (_e) { return ''; }
}

/* Кожен крок зі своїм дедлайном. Мертвий проксі не відповідає взагалі,
   і без цього функція висіла б до стелі платформи, а людина дивилась
   би на вічний спіннер замість слова «не відповів». */
function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

/* РОЗБІР РЯДКА ПРОКСІ.

   Приймаємо те, що дають постачальники: host:port, host:port:user:pass
   і звичайний URL зі схемою. Останній формат найпоширеніший у
   антидетектах, і вимагати від людини переписувати його в URL означало
   б отримувати помилки там, де їх можна не мати.

   Повертаємо окремо адресу без секретів — саме вона потім лежить у
   базі як proxy_host і світиться в інтерфейсі. */
function parseProxy(raw: string): {
  url: string; host: string; user: string; pass: string; scheme: string;
} | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  if (/^[a-z0-9]+:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const scheme = u.protocol.replace(':', '');
      return {
        url: u.protocol + '//' + u.host,
        host: u.host,
        user: decodeURIComponent(u.username || ''),
        pass: decodeURIComponent(u.password || ''),
        scheme
      };
    } catch (_e) { return null; }
  }

  const p = s.split(':');
  if (p.length === 2) return { url: 'http://' + s, host: s, user: '', pass: '', scheme: 'http' };
  if (p.length === 4) {
    const host = p[0] + ':' + p[1];
    return { url: 'http://' + host, host, user: p[2], pass: p[3], scheme: 'http' };
  }
  return null;
}

/* Клієнт із проксі. Якщо рантайм не вміє createHttpClient — кажемо це
   прямо й окремим словом: це не «проксі не працює», це «тут його не
   буде взагалі», і дії з цього різні. */
function clientFor(p: { url: string; user: string; pass: string }): Json {
  const make = (Deno as Json).createHttpClient;
  if (typeof make !== 'function') {
    throw new Error('NO_HTTP_CLIENT');
  }
  const cfg: Json = { url: p.url };
  if (p.user || p.pass) cfg.basicAuth = { username: p.user, password: p.pass };
  return make({ proxy: cfg });
}

async function ipThrough(client: Json | null): Promise<string> {
  const t = withTimeout(STEP_MS);
  try {
    const opt: Json = { signal: t.signal };
    if (client) opt.client = client;
    const res = await fetch(IP_ECHO, opt);
    if (!res.ok) return '';
    const j = await res.json().catch(() => ({}));
    return String(j?.ip || '');
  } catch (_e) {
    return '';
  } finally { t.done(); }
}

async function graphThrough(client: Json, token: string): Promise<string> {
  const t = withTimeout(STEP_MS);
  try {
    const res = await fetch(GRAPH + '/me?fields=id', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: token, method: 'GET' }).toString(),
      signal: t.signal,
      client
    } as Json);
    const j = await res.json().catch(() => ({}));
    if (j && j.error) return 'Facebook: ' + (j.error.message || 'error');
    if (!res.ok) return 'Facebook: HTTP ' + res.status;
    return '';
  } catch (e) {
    return (e as Error).message;
  } finally { t.done(); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const base = Deno.env.get('SUPABASE_URL') || '';
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!base || !svc || !anon) return reply({ error: 'function is not configured' }, 500);

  /* Жодного спільного секрету: цю функцію кличе людина з дашборда, і
     межі ставить саме її uid. Розкладу тут немає взагалі. */
  const auth = req.headers.get('Authorization') || '';
  if (!auth) return reply({ error: 'no authorization header' }, 401);
  const owner = await whoAmI(base, anon, auth);
  if (!owner) return reply({ error: 'could not verify who is calling' }, 401);

  let id = 0;
  try { id = Number((await req.json())?.token_id || 0); } catch (_e) { /* далі впаде на перевірці */ }
  if (!id) return reply({ error: 'token_id is required' }, 400);

  const hdr = { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json' };
  let rows: Json[] = [];
  try {
    /* created_by у запиті обовʼязковий: ключ сервісної ролі бачить
       чужі токени так само, як свої. */
    const res = await fetch(base + '/rest/v1/fb_tokens?select=id,label,token,proxy'
      + '&id=eq.' + id + '&created_by=eq.' + encodeURIComponent(owner) + '&limit=1',
      { headers: hdr });
    if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
    rows = await res.json();
  } catch (e) {
    const msg = (e as Error).message;
    return reply({ error: /proxy/.test(msg)
      ? 'no proxy column yet — run the proxy block of FB_TOKENS.sql'
      : msg }, 500);
  }

  const row = rows[0];
  if (!row) return reply({ error: 'token not found' }, 404);

  const p = parseProxy(String(row.proxy || ''));
  /* Пряма адреса потрібна й тоді, коли проксі немає: це відповідь на
     «а звідки воно ходить зараз». */
  const direct = await ipThrough(null);
  if (!p) {
    return reply({ ok: false, label: row.label, direct_ip: direct,
                   note: 'no proxy set for this token' });
  }

  let client: Json;
  try { client = clientFor(p); }
  catch (e) {
    const why = (e as Error).message === 'NO_HTTP_CLIENT'
      ? 'this runtime has no Deno.createHttpClient — a proxy cannot be used here'
      : (e as Error).message;
    return reply({ ok: false, label: row.label, host: p.host,
                   direct_ip: direct, note: why });
  }

  const viaIp = await ipThrough(client);
  const graphErr = await graphThrough(client, String(row.token || ''));

  /* Однакові адреси — найважливіше, що тут можна побачити: запит пішов
     повз проксі, і все, заради чого він додавався, не сталось. */
  const samePlace = !!viaIp && !!direct && viaIp === direct;
  const ok = !!viaIp && !graphErr && !samePlace;
  const note = graphErr ? graphErr
    : samePlace ? 'the proxy answered from the same address as a direct call — traffic did not go through it'
    : !viaIp ? 'the proxy did not answer'
    : 'ok';

  try {
    await fetch(base + '/rest/v1/fb_tokens?id=eq.' + id
      + '&created_by=eq.' + encodeURIComponent(owner), {
      method: 'PATCH',
      headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({
        proxy_host: p.host, proxy_ip: viaIp || null,
        proxy_note: note, proxy_checked_at: new Date().toISOString()
      })
    });
  } catch (_e) { /* не записали — відповідь усе одно чесна */ }

  return reply({ ok, label: row.label, host: p.host, scheme: p.scheme,
                 direct_ip: direct, proxy_ip: viaIp, note });
});
