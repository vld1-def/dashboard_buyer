/* ═══════════ «ЩО НОВОГО» — РОЗСИЛКА В ТЕЛЕГРАМ ═══════════

   Одне повідомлення всім, у кого телеграм підключений. Не звіт, не
   алерт — новина про те, що в СРМ зʼявилось.

   ЧОМУ ОКРЕМА ФУНКЦІЯ, А НЕ telegram-bot. Той живе вебхуком Telegram
   і закритий секретом вебхука: його адресу смикає Facebook... тобто
   Telegram, і більше ніхто. Дашборд туди достукатись не може й не
   мусить.

   ЧОМУ СЕРВІСНИЙ КЛЮЧ. RLS у tg_links віддає людині РІВНО ЇЇ рядок —
   і це правильно: чужий chat_id нікому не потрібен. Але розсилка за
   визначенням читає всі. Тому ключ сервісний, а межу тримає те, що
   функція ВЗАГАЛІ не приймає списку адресатів: кому слати, вирішує
   вона сама, а зовні приходить лише текст. Підсунути чужий chat_id
   нікуди.

   ВІДПРАВИТИ НЕ МОЖНА ВІДКЛИКАТИ. Тому:
     • є режим dry — порахувати, скільки людей отримає, нічого не
       надсилаючи. Підтвердження в дашборді показує саме це число;
     • є режим test — тільки собі, тим самим шляхом і тим самим
       текстом. Спершу подивись, як воно виглядає в чаті;
     • текст порожнім бути не може, і довжина обрізається до межі
       Telegram, а не відпадає помилкою після того, як половина вже
       пішла.

   ХТО ЗАБЛОКУВАВ БОТА — НЕ ПОМИЛКА. Telegram відповідає 403, і це
   нормальний стан: людина пішла. Рахуємо окремо й кажемо числом.

   Розгортання:
     supabase functions deploy tg-news
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const FN_VERSION = '2026-10-30.1';

/* Межа Telegram — 4096 символів на повідомлення. Ріжемо ДО відправки:
   обрізаний хвіст краще за половину розсилки й помилку посередині. */
const TG_MAX = 4096;

/* Telegram пускає близько 30 повідомлень на секунду на бота. Беремо з
   запасом: пауза кожні 20 — це секунда затримки на сотню людей і
   жодного 429. */
const BATCH = 20;
const PAUSE_MS = 1100;

type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify({ fn: FN_VERSION, ...body }),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function whoAmI(base: string, anon: string, auth: string): Promise<string> {
  const res = await fetch(base + '/auth/v1/user', { headers: { apikey: anon, Authorization: auth } });
  if (!res.ok) return '';
  const u = await res.json().catch(() => ({}));
  return String(u?.id || '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const base = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const svc = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const bot = Deno.env.get('TG_BOT_TOKEN') || '';
  if (!base || !svc) return reply({ error: 'функція не налаштована: немає SERVICE_ROLE_KEY' }, 500);
  /* Токен бота живе в секретах функції й у відповідь не потрапляє
     ніколи — сказати можна лише те, що його немає. */
  if (!bot) return reply({ error: 'TG_BOT_TOKEN не заданий у секретах функцій — '
    + 'бот без нього нічого не надішле' }, 400);

  const auth = req.headers.get('Authorization') || '';
  if (!auth) return reply({ error: 'no authorization header' }, 401);
  const me = await whoAmI(base, anon, auth);
  if (!me) return reply({ error: 'не вдалось підтвердити, хто кличе' }, 401);

  let body: Json = {};
  try { body = await req.json(); } catch (_e) {}
  const dry = body?.dry === true;
  const test = body?.test === true;
  const text = String(body?.text ?? '').trim().slice(0, TG_MAX);
  if (!dry && !text) return reply({ error: 'порожнє повідомлення не надсилається' }, 400);

  const hdr = { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json' };

  /* Кому. Список складає функція, а не той, хто покликав: у тілі
     запиту адресатів немає взагалі, тож і підсунути нікого не можна. */
  let rows: Json[] = [];
  try {
    const q = 'tg_links?select=user_id,chat_id&chat_id=not.is.null'
      + (test ? '&user_id=eq.' + encodeURIComponent(me) : '');
    const res = await fetch(base + '/rest/v1/' + q, { headers: hdr });
    if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
    rows = await res.json();
  } catch (e) {
    const m = String((e as Error).message);
    return reply({ error: /tg_links|does not exist/i.test(m)
      ? 'таблиці tg_links ще немає — виконай TELEGRAM.sql'
      : m }, 500);
  }

  const total = rows.length;
  if (dry) return reply({ ok: true, dry: true, total });
  if (!total) return reply({ error: test
    ? 'твій телеграм не підключений — натисни Connect Telegram вище'
    : 'жодного підключеного телеграма: нікому надсилати' }, 404);

  let sent = 0, blocked = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    try {
      const r = await fetch('https://api.telegram.org/bot' + bot + '/sendMessage', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        /* Без parse_mode: у тексті новини трапляються дужки й
           підкреслення, на яких розмітка Telegram відповідає 400 — і
           тоді не доходить нічого. */
        body: JSON.stringify({ chat_id: rows[i].chat_id, text,
                               disable_web_page_preview: true })
      });
      if (r.ok) sent++;
      /* 403 — людина заблокувала бота або видалила чат. Це не збій
         розсилки, а стан світу, і в підсумку він має бути окремим
         числом, інакше «5 з 20» виглядає як поломка. */
      else if (r.status === 403) blocked++;
      else failed++;
    } catch (_e) { failed++; }
    if ((i + 1) % BATCH === 0) await sleep(PAUSE_MS);
  }

  return reply({ ok: true, total, sent, blocked, failed, test });
});
