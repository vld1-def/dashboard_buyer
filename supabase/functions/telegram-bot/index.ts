/* ═══════════ БОТ TELEGRAM ═══════════
   Приймає те, що Telegram шле на webhook, і вміє рівно дві речі:
   прив'язати чат до баєра і відв'язати назад.

   ЧОМУ КОДОМ, А НЕ ПОШТОЮ
   Напрошується простіше: бот питає пошту, людина відповідає, готово.
   Але пошта — не таємниця, це ім'я. Хто завгодно вписав би чужу і
   почав отримувати чужі сповіщення: домени, мітки, що впало. Перевірити
   бот нічого не може — у нього немає способу спитати пароль.

   Код видає сам дашборд і лише тому, хто в ньому залогінений, тобто
   вже довів, що він це він. Код живе чверть години і згоряє після
   першого використання. Пошту бот показує у відповідь — але як
   підтвердження «так, це твій акаунт», а не як спосіб увійти.

   ЧОМУ БЕЗ ПЕРЕВІРКИ JWT
   Telegram нічого не знає про токени Supabase і шле звичайний POST.
   Тому функція розгортається з --no-verify-jwt, а замість JWT її
   захищає спільний секрет: Telegram додає його заголовком до кожного
   запиту, і все без нього ми відкидаємо ще до читання тіла.

   ЖОДНИХ ІМПОРТІВ — з тієї ж причини, що й у check-domains: якщо
   імпорт не розв'яжеться, функція падає ще до запуску, і ззовні це
   не відрізнити від несправного бота.

   Розгортання:
     supabase functions deploy telegram-bot --no-verify-jwt
*/

const CODE_LIFE_HINT = 'Код живе 15 хвилин.';

type Link = {
  user_id: string; email: string | null; team_name: string | null;
  code: string | null; code_expires: string | null;
};

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function reply(token: string, chat: number | string, text: string): Promise<void> {
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // Без parse_mode: у пошті й іменах трапляються символи, на яких
      // розмітка Telegram спотикається і відповідає 400.
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
    });
  } catch (_e) { /* не відповіли — не привід падати */ }
}

Deno.serve(async (req) => {
  /* Telegram чекає 200 майже на все. Відповідь 500 він вважає збоєм і
     надсилає те саме повідомлення знову і знову — тож помилки ковтаємо
     тут, а не віддаємо назовні. */
  try {
    return await handle(req);
  } catch (_e) {
    return new Response('ok', { status: 200 });
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const want = Deno.env.get('TG_WEBHOOK_SECRET') || '';
  const got = req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  /* Секрет обов'язковий. Якщо його не налаштували, функція не
     «працює без захисту», а не працює взагалі: інакше адресу бота
     міг би смикати будь-хто, хто її вгадав. */
  if (!want || !sameSecret(got, want)) return new Response('forbidden', { status: 403 });

  const token = Deno.env.get('TG_BOT_TOKEN') || '';
  const base = Deno.env.get('SUPABASE_URL') || '';
  const svc = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!token || !base || !svc) return new Response('ok', { status: 200 });

  /* Від сервісної ролі, бо інакше нічого не вийде: шукати рядок за
     кодом треба ДО того, як стане відомо, чий він, а RLS саме цього й
     не дозволяє. */
  const hdr = { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json' };

  const upd = await req.json();
  const msg = upd?.message || upd?.edited_message;
  const chat = msg?.chat?.id;
  const text = String(msg?.text || '').trim();
  if (!chat || !text) return new Response('ok', { status: 200 });

  const who = msg?.from?.username ? '@' + msg.from.username
            : [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(' ') || null;

  /* ── /start із кодом ── */
  if (text.startsWith('/start')) {
    const code = text.slice('/start'.length).trim();
    if (!code) {
      await reply(token, chat,
        'Привіт. Я надсилаю сповіщення про домени: що за ніч отримало мітку, '
        + 'перестало відповідати або віддає 404.\n\n'
        + 'Щоб я знав, чиї домени вам показувати, відкрийте дашборд → Settings → '
        + 'Telegram alerts → Connect Telegram. Там буде посилання, яке все зробить само.');
      return new Response('ok', { status: 200 });
    }

    const res = await fetch(base + '/rest/v1/tg_links'
      + '?select=user_id,email,team_name,code,code_expires'
      + '&code=eq.' + encodeURIComponent(code) + '&limit=1', { headers: hdr });
    const rows: Link[] = res.ok ? await res.json() : [];
    const row = rows[0];

    if (!row) {
      await reply(token, chat,
        'Цей код не підходить. Найчастіше це означає, що ним уже скористались — '
        + 'код одноразовий.\n\nВізьміть новий: дашборд → Settings → Telegram alerts → '
        + 'Connect Telegram.');
      return new Response('ok', { status: 200 });
    }
    if (row.code_expires && Date.parse(row.code_expires) < Date.now()) {
      await reply(token, chat,
        'Термін коду вийшов. ' + CODE_LIFE_HINT + '\n\n'
        + 'Візьміть новий: дашборд → Settings → Telegram alerts → Connect Telegram.');
      return new Response('ok', { status: 200 });
    }

    /* Код згоряє тут-таки, разом із записом чату. Один запит, тож
       двічі скористатись ним не вийде навіть у перегонах. */
    const patch = await fetch(base + '/rest/v1/tg_links?user_id=eq.' + encodeURIComponent(row.user_id), {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ chat_id: String(chat), tg_name: who,
                             linked_at: new Date().toISOString(),
                             code: null, code_expires: null })
    });
    if (!patch.ok) {
      const why = await patch.text();
      /* Найімовірніше спрацював унікальний індекс на chat_id: цей
         Telegram уже прив'язаний до іншого акаунта. Мовчати тут не
         можна — ззовні це виглядало б як «бот не відповів». */
      await reply(token, chat, /23505|duplicate/i.test(why)
        ? 'Цей Telegram уже прив\'язаний до іншого акаунта дашборда.\n\n'
          + 'Спершу відв\'яжіть його: надішліть мені /stop, а потім спробуйте код ще раз.'
        : 'Не вдалось зберегти зв\'язок. Спробуйте ще раз за хвилину.');
      return new Response('ok', { status: 200 });
    }

    await reply(token, chat,
      'Готово. Сповіщення про домени приходитимуть сюди.\n\n'
      + 'Акаунт: ' + (row.email || 'без пошти')
      + (row.team_name ? '\nКоманда: ' + row.team_name : '')
      + '\n\nПисатиму вранці і тільки тоді, коли є про що: домен отримав мітку, '
      + 'перестав відповідати або віддає 404. Якщо за ніч нічого не змінилось — мовчу.\n\n'
      + 'Відв\'язати будь-коли: /stop');
    return new Response('ok', { status: 200 });
  }

  /* ── /stop ── */
  if (text.startsWith('/stop')) {
    const res = await fetch(base + '/rest/v1/tg_links?chat_id=eq.' + encodeURIComponent(String(chat)), {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=representation' },
      body: JSON.stringify({ chat_id: null, tg_name: null, linked_at: null })
    });
    const rows = res.ok ? await res.json() : [];
    await reply(token, chat, rows.length
      ? 'Відв\'язано. Більше сюди не пишу.\n\nПередумаєте — дашборд → Settings → '
        + 'Telegram alerts → Connect Telegram.'
      : 'Цей чат ні до чого не прив\'язаний, тож і відв\'язувати нема чого.');
    return new Response('ok', { status: 200 });
  }

  /* ── усе інше ── */
  await reply(token, chat,
    'Я розумію дві команди:\n\n'
    + '/start <код> — прив\'язати цей чат до акаунта дашборда\n'
    + '/stop — відв\'язати\n\n'
    + 'Код береться в дашборді: Settings → Telegram alerts → Connect Telegram.');
  return new Response('ok', { status: 200 });
}
