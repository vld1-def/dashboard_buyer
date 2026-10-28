/* ═══════════ ЧИ НЕ ЗАБАНИЛИ АПКУ В PLAY ═══════════

   Те, чого не може сторінка. Play не віддає CORS-заголовків, тож із
   браузера його відповідь прочитати неможливо: no-cors повертає статус
   0 і для живої апки, і для знесеної. Запит із сервера бачить
   справжній код.

   ЩО РОБИТЬ. Бере воронки, у яких заповнено app_id, питає сторінку
   апки й пише висновок у ту саму таблицю: стан, іконку, коли питали й
   що відповіли.

   ЧОМУ НЕ БАН ІЗ ПЕРШОГО 404, і це головне рішення тут. Play віддає
   404 не лише забаненим: є ліміт на частоту, є геоблок, є звичайні
   збої. А забанена воронка ЗНИКАЄ зі списку прілок — тобто хибний бан
   ховає робочу апку, і людина дізнається про це, коли піде її шукати.

   Тому дві перевірки поспіль. Перша невдача пише app_gone_since й
   стану НЕ чіпає; якщо й наступного разу те саме — ставиться ban.
   Відповіла між ними — app_gone_since стирається.

   ЧОМУ app_banned_by. Бан, поставлений цією функцією, вона має право
   зняти сама, коли апка знову відкрилась. Бан, поставлений людиною, —
   не має: вона могла забанити апку з причини, якої в Play не видно.

   ДВА ВХОДИ, І ВОНИ РІЗНІ НЕ ЛИШЕ КЛЮЧЕМ.

   1. РОЗКЛАД — заголовок x-cron-key зі спільним секретом. Ходить без
      людини, обходить увесь парк, ставить і знімає бани. Читає й пише
      ключем сервісної ролі, бо робить це за всіх одразу.

   2. ЛЮДИНА — звичайний Authorization зі своїм токеном і поле
      funnel_id у тілі. Одна воронка, без банів: лише подивитись, що
      зараз на сторінці, і забрати іконку.

      Ключ сервісної ролі тут НЕ береться СВІДОМО — так само, як у
      check-domains. Читаємо й пишемо токеном того, хто покликав, і
      межі ставить RLS: чужий рядок просто не прийде. Інакше цей вхід
      став би способом правити будь-яку воронку в базі.

   Навіщо другий вхід узагалі: іконка висіла до першого нічного
   обходу. Людина вписала посилання — і дивиться на порожнє місце, не
   знаючи, чи це поломка. Тепер картинка з'являється одразу.

   ЖОДНИХ ІМПОРТІВ — з тієї ж причини, що й у решті функцій: якщо
   імпорт не розвʼяжеться, функція падає ще до запуску, і ззовні це не
   відрізнити від несправного Play.

   Розгортання:
     supabase secrets set CHECK_APPS_CRON_KEY=...
     supabase functions deploy check-apps
*/

const PLAY = 'https://play.google.com/store/apps/details';
const TIMEOUT = 12_000;
/* Скільки апок за один виклик. Play не любить частих запитів з однієї
   адреси, тож ідемо по одній і з паузою — і чесно кажемо «є ще», якщо
   не встигли. Розклад добере хвіст наступного дня: порядок за
   найдавнішою перевіркою, тож голодування неможливе. */
const BATCH = 120;
const PAUSE_MS = 350;
const DEADLINE_MS = 110_000;

const FN_VERSION = '2026-10-28.2';

/* Вхід людини йде з браузера, отже потрібні CORS-заголовки — і на
   самій відповіді, і на preflight. Без них браузер не покаже навіть
   чесну помилку: відповідь без них для нього просто не існує. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type Json = Record<string, any>;
type Row = {
  id: number; funnel_name: string | null; app_id: string | null;
  geo: string | null; status: string | null; app_gone_since: string | null;
  app_banned_by: string | null; app_icon: string | null;
};

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

/* Що Play сказав про цю апку.

   'live'    — сторінка справді показує апку;
   'gone'    — Play відповів, але апки на сторінці немає;
   'unknown' — ми не дізнались (мережа, таймаут, 429, 5xx, геоблок). Це
               НЕ діагноз апці, і чіпати її стан за цим не можна:
               інакше власний збій Play ми записували б у бан.

   ЧОМУ НЕ «404 = БАН», і це найважливіше рішення тут.

   Спершу тут стояла перевірка на 404. Вона ловила б лише знесені
   сторінки — а забанену апку Play показує ІНАКШЕ, і як саме, ми не
   знаємо: з нашого контейнера play.google.com закритий, перевірити
   форму тієї сторінки звідси неможливо.

   Тому правило перевернуте: ми не перелічуємо вигляди відмови (їх
   рівно стільки, скільки Google забажає), а шукаємо ДОКАЗ, що сторінка
   показує живу апку. Немає доказу — апки на цій сторінці немає, хоч би
   який код і текст Play повернув. Так перевірка не залежить від того,
   чого ми не знаємо.

   ДОКАЗ — будь-що з трьох:
     • розмітка SoftwareApplication (структуровані дані Play);
     • og:title + og:image РАЗОМ з ід пакета десь на сторінці;
   Жодного з них на сторінці помилки чи заглушки немає.

   ЩО МИ БАЧИЛИ — пишемо в app_note дослівно: код і які саме докази
   знайшлись. Коли щось визначиться не так, у рядку стоятиме причина, а
   не «не відповідає».

   ГЕОБЛОК — ОКРЕМО, І ЦЕ НЕ БАН. Апка під KG, яку спитали як зі США,
   чесно відповість «недоступна у вашій країні». Тому питаємо З ГЕО
   САМОЇ ВОРОНКИ, а якщо все одно натрапили на цю відповідь — кажемо
   «unknown», а не «gone». */
type Verdict = { state: 'live' | 'gone' | 'unknown'; code: number | null;
                 icon: string; note: string };

const ogTag = (html: string, prop: string): string => {
  const a = new RegExp('<meta[^>]+property=["\']og:' + prop
    + '["\'][^>]+content=["\']([^"\']+)', 'i').exec(html);
  if (a) return a[1];
  const b = new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:'
    + prop + '["\']', 'i').exec(html);
  return b ? b[1] : '';
};

async function probe(appId: string, geo: string): Promise<Verdict> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  /* Країну беремо з гео воронки: ці апки й робляться під одну країну, і
     питати їх зі США означало б щодня отримувати «недоступна у вашій
     країні» на цілком живій апці. Не схоже на код країни — питаємо як
     зі США, бо хоч щось питати треба. */
  const gl = /^[A-Za-z]{2}$/.test(geo) ? geo.toUpperCase() : 'US';
  try {
    const url = PLAY + '?id=' + encodeURIComponent(appId)
              + '&hl=en&gl=' + encodeURIComponent(gl);
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        /* Без User-Agent Play частіше віддає сторінку-заглушку. Це не
           маскування під людину: ми й не ховаємось, просто просимо ту
           саму сторінку, що й браузер. */
        'user-agent': 'Mozilla/5.0 (compatible; dashboard-app-check/1.0)',
        'accept-language': 'en-US,en;q=0.9'
      }
    });
    if (res.status === 429) {
      return { state: 'unknown', code: 429, icon: '',
               note: 'Play: забагато запитів (429) — стан не чіпаємо' };
    }
    if (res.status >= 500) {
      return { state: 'unknown', code: res.status, icon: '',
               note: 'Play: HTTP ' + res.status + ' — це збій Play, стан не чіпаємо' };
    }

    const html = await res.text().catch(() => '');

    /* Недоступна в ЦІЙ країні — не бан. Питали як із gl, і саме це й
       кажемо: інакше рядок читався б як «апки більше немає». */
    if (/isn.t available in your country|not available in your country|item isn.t available/i.test(html)) {
      return { state: 'unknown', code: res.status, icon: '',
               note: 'Play: недоступна для країни ' + gl + ' — це не бан, стан не чіпаємо' };
    }

    const icon = ogTag(html, 'image');
    const title = ogTag(html, 'title');
    const ld = /"@type"\s*:\s*"SoftwareApplication"/.test(html);
    const hasPkg = html.includes(appId);
    const live = ld || (!!title && !!icon && hasPkg);

    if (live) {
      return { state: 'live', code: res.status, icon,
               note: 'Play: сторінка апки на місці (HTTP ' + res.status + ')' };
    }
    /* Доказу немає. ЩО САМЕ ми бачили — у нотатку: коли щось визначиться
       не так, у рядку стоятиме причина, а не загадка. */
    const seen = [res.status === 404 ? '404' : 'HTTP ' + res.status,
                  ld ? 'ld+json є' : 'ld+json немає',
                  title ? 'og:title є' : 'og:title немає',
                  icon ? 'og:image є' : 'og:image немає',
                  hasPkg ? 'ід пакета на сторінці є' : 'ід пакета на сторінці немає'].join(', ');
    return { state: 'gone', code: res.status, icon: '',
             note: 'Play: апки на сторінці немає — ' + seen };
  } catch (e) {
    const msg = String((e as Error).message || e);
    return { state: 'unknown', code: null, icon: '',
             note: /abort/i.test(msg) ? 'Play не відповів за 12 с' : 'Play: ' + msg };
  } finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  /* Preflight іде ЗАВЖДИ без Authorization — відповідати на нього
     треба до будь-яких перевірок, інакше браузер не дійде й до запиту. */
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const base = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const svc = Deno.env.get('SERVICE_ROLE_KEY')
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!base) return reply({ error: 'function is not configured' }, 500);

  let body: Json = {};
  try { body = await req.json(); } catch (_e) { /* тіла може не бути */ }
  const one = Number(body?.funnel_id || 0) || 0;

  /* ═══ ВХІД ЛЮДИНИ: ОДНА ВОРОНКА, БЕЗ БАНІВ ═══

     Токеном того, хто покликав: межі ставить RLS, чужий рядок просто
     не прийде. Банів звідси не ставимо — рішення «апки більше немає»
     коштує зникнення воронки зі списку прілок, і приймати його має
     обхід, який бачить ДВІ перевірки поспіль, а не один клік. */
  if (one) {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return reply({ error: 'no authorization header' }, 401);
    const mine = { apikey: anon || svc, Authorization: auth,
                   'content-type': 'application/json' };
    let row: Row | null = null;
    try {
      const res = await fetch(base + '/rest/v1/funnels_mapping?id=eq.' + one
        + '&select=id,funnel_name,app_id,geo,status,app_gone_since,app_banned_by,app_icon'
        + '&limit=1', { headers: mine });
      if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
      row = (await res.json())[0] || null;
    } catch (e) {
      const msg = String((e as Error).message);
      return reply({ error: /app_id|column/i.test(msg)
        ? 'у funnels_mapping ще немає колонок апки — виконайте APP_LINK.sql'
        : msg }, 500);
    }
    if (!row) return reply({ error: 'воронки не знайдено' }, 404);
    const appId = String(row.app_id || '').trim();
    if (!appId) return reply({ error: 'у цієї воронки не вписане посилання на апку' }, 400);

    const v = await probe(appId, String(row.geo || ''));
    const patch: Json = { app_checked_at: new Date().toISOString(), app_note: v.note };
    if (v.state === 'live') { patch.app_gone_since = null; if (v.icon) patch.app_icon = v.icon; }
    try {
      await fetch(base + '/rest/v1/funnels_mapping?id=eq.' + one, {
        method: 'PATCH', headers: { ...mine, Prefer: 'return=minimal' },
        body: JSON.stringify(patch) });
    } catch (_e) { /* не записали — відповідь усе одно чесна */ }
    return reply({ fn: FN_VERSION, one: true, state: v.state,
                   icon: v.icon || '', note: v.note });
  }

  /* ═══ ВХІД РОЗКЛАДУ ═══ */
  const want = Deno.env.get('CHECK_APPS_CRON_KEY') || '';
  if (!svc) return reply({ error: 'function is not configured' }, 500);
  if (!want) return reply({
    error: 'CHECK_APPS_CRON_KEY is not set in the function secrets' }, 400);
  /* Порівнюємо повністю, а не починаючи з початку: рівність рядків тут
     і є вся перевірка. */
  const key = req.headers.get('x-cron-key') || '';
  if (key !== want) return reply({ error: 'bad or missing x-cron-key' }, 401);

  const hdr = { apikey: svc, Authorization: 'Bearer ' + svc,
                'content-type': 'application/json' };

  let rows: Row[] = [];
  try {
    /* Порядок — за найдавнішою перевіркою, nullsfirst. Так щойно
       додана апка перевіряється першою, а хвіст списку не голодує:
       саме на цьому колись погорів обхід кабінетів. */
    /* Порожній рядок відсіюємо вже тут, у JS, а не фільтром
       `app_id=neq.` — порожнє значення в рядку запиту PostgREST читає
       по-різному залежно від версії, і одного дня такий фільтр почав
       би мовчки пропускати все. */
    const q = 'funnels_mapping?select=id,funnel_name,app_id,geo,status,'
            + 'app_gone_since,app_banned_by,app_icon'
            + '&app_id=not.is.null'
            + '&order=app_checked_at.asc.nullsfirst,id.asc'
            + '&limit=' + BATCH;
    const res = await fetch(base + '/rest/v1/' + q, { headers: hdr });
    if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
    rows = (await res.json() as Row[]).filter(r => String(r.app_id || '').trim());
  } catch (e) {
    const msg = String((e as Error).message);
    return reply({ error: /app_id|column/i.test(msg)
      ? 'у funnels_mapping ще немає колонок апки — виконайте APP_LINK.sql'
      : msg }, 500);
  }

  if (!rows.length) return reply({ fn: FN_VERSION, checked: 0,
    note: 'жодної воронки з посиланням на апку — впишіть app_id у Прілках або Form → Funnels' });

  const at = new Date().toISOString();
  const until = Date.now() + DEADLINE_MS;
  const banned: string[] = [], freed: string[] = [], quiet: string[] = [];
  let live = 0, unknown = 0, done = 0;

  for (const r of rows) {
    if (Date.now() > until) break;
    done++;
    const v = await probe(String(r.app_id || ''), String(r.geo || ''));
    const patch: Json = { app_checked_at: at, app_note: v.note };

    if (v.state === 'live') {
      live++;
      patch.app_gone_since = null;
      if (v.icon) patch.app_icon = v.icon;
      /* Знімаємо лише СВІЙ бан. Людина могла забанити апку з причини,
         якої в Play не видно, і повертати її до життя за неї — значить
         одного ранку залити на те, що свідомо зупинили. */
      if (r.status === 'ban' && r.app_banned_by === 'robot') {
        patch.status = 'active';
        patch.app_banned_by = null;
        patch.app_note = 'Play: знову відкривається — бан знято обходом';
        freed.push(r.funnel_name || String(r.app_id));
      }
    } else if (v.state === 'gone') {
      if (!r.app_gone_since) {
        /* ПЕРША невдача. Стану не чіпаємо: саме тут Play і бреше
           найчастіше. Лише запамʼятовуємо день. */
        patch.app_gone_since = at;
        patch.app_note = v.note + ' — перша невдача, стан не змінено';
        quiet.push(r.funnel_name || String(r.app_id));
      } else if (r.status !== 'ban') {
        patch.status = 'ban';
        patch.app_banned_by = 'robot';
        patch.app_note = v.note + ' — друга перевірка поспіль, поставлено ban';
        banned.push(r.funnel_name || String(r.app_id));
      }
    } else {
      /* Ми не дізнались. Не діагноз: ні стану, ні app_gone_since не
         чіпаємо — інакше власний збій Play перетворювався б на бан.
         app_checked_at усе одно ставимо, щоб черга рухалась. */
      unknown++;
    }

    try {
      await fetch(base + '/rest/v1/funnels_mapping?id=eq.' + r.id, {
        method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
        body: JSON.stringify(patch)
      });
    } catch (_e) { /* один незаписаний рядок не привід валити обхід */ }

    if (PAUSE_MS) await new Promise(r2 => setTimeout(r2, PAUSE_MS));
  }

  const left = rows.length - done;
  return reply({
    fn: FN_VERSION, checked: done, live, unknown,
    banned, freed, first_miss: quiet,
    not_reached: left > 0 ? left : 0,
    note: left > 0
      ? 'Обійдено ' + done + ' з ' + rows.length
        + ' — забракло часу. Решту добере наступний запуск: черга йде за найдавнішою перевіркою.'
      : 'Обійдено ' + done + ' апок'
  });
});
