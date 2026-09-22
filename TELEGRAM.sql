-- ════════════════════════════════════════════════════════════
--  ЗВ'ЯЗОК БАЄРА З TELEGRAM — tg_links
-- ════════════════════════════════════════════════════════════
--
--  Навіщо: щоб кожен баєр отримував сповіщення ТІЛЬКИ про свої домени,
--  у свій чат, а не всі в один спільний.
--
--  ЧОМУ НЕ ПОШТОЮ. Спокуса зробити так: бот питає «яка твоя пошта?»,
--  людина відповідає — і готово. Але пошта не таємниця, це просто
--  ім'я. Хто завгодно, хто знайде бота, вписує чужу пошту і починає
--  отримувати чужі сповіщення — список доменів, мітки, що впало. Бот
--  не має жодного способу перевірити, що пише саме власник пошти.
--
--  Тому зв'язуємо кодом. Код видає сам дашборд і тільки тому, хто в
--  ньому залогінений — тобто той, хто вже довів, що він це він. Код
--  живе 15 хвилин і згоряє після першого використання. Пошту бот
--  показує, коли зв'язок утворився, — але як підтвердження «це справді
--  твій акаунт», а не як спосіб увійти.
--
--  Виконайте цей файл цілком, одним запуском.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tg_links (
  -- Один баєр — один чат. Тому user_id і є ключем.
  user_id      uuid primary key references auth.users(id) on delete cascade,
  team_name    text,
  -- Пошту пише сам дашборд, коли видає код: у нього вона вже є, і так
  -- боту не потрібні адмінські права, щоб її дізнатись.
  email        text,
  -- Заповнюється ботом у мить, коли код спрацював.
  chat_id      text,
  tg_name      text,
  linked_at    timestamptz,
  -- Одноразовий код. Після використання бот його стирає.
  code         text,
  code_expires timestamptz,
  created_at   timestamptz not null default now()
);

-- Код має бути унікальним, поки він живий: інакше два баєри теоретично
-- могли б отримати однаковий, і другий забрав би чужий зв'язок.
create unique index if not exists tg_links_code_uidx
  on public.tg_links (code) where code is not null;

-- Один чат — один баєр. Інакше, прив'язавши свій Telegram до двох
-- акаунтів, можна було б читати сповіщення обох.
create unique index if not exists tg_links_chat_uidx
  on public.tg_links (chat_id) where chat_id is not null;


-- ────────────────────────────────────────────────────────────
--  ДОСТУП
-- ────────────────────────────────────────────────────────────
--  Тут RLS потрібен завжди, а не «якщо захочете»: у таблиці лежать
--  коди, а код — це ключ від чужих сповіщень.
--
--  Бот працює від сервісної ролі й RLS не бачить — інакше він не зміг
--  би знайти рядок за кодом, ще не знаючи, чий він.
-- ────────────────────────────────────────────────────────────

alter table public.tg_links enable row level security;

drop policy if exists "own_select" on public.tg_links;
create policy "own_select" on public.tg_links for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own_insert" on public.tg_links;
create policy "own_insert" on public.tg_links for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own_update" on public.tg_links;
create policy "own_update" on public.tg_links for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own_delete" on public.tg_links;
create policy "own_delete" on public.tg_links for delete to authenticated
  using (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════
--  ДАЛІ — ДВА КРОКИ НЕ ТУТ
-- ════════════════════════════════════════════════════════════
--
--  1. СЕКРЕТИ ФУНКЦІЙ
--     Project Settings → Edge Functions → Secrets:
--
--        TG_BOT_TOKEN      — токен від @BotFather
--        TG_WEBHOOK_SECRET — довгий випадковий рядок, придумайте свій:
--                              select encode(gen_random_bytes(24), 'hex');
--                            Ним Telegram підписує кожен свій запит до
--                            бота, і функція відкидає все інше. Без
--                            нього адресу бота може смикати будь-хто.
--        TG_CHAT_ID        — НЕОБОВ'ЯЗКОВО. Спільний чат, куди йде
--                            повний список по всіх баєрах. Зручно
--                            тімліду. Не треба — не ставте.
--
--  2. РОЗГОРНУТИ БОТА Й ПІДКЛЮЧИТИ ЙОГО ДО TELEGRAM
--
--        supabase functions deploy telegram-bot --no-verify-jwt
--        supabase functions deploy check-domains
--
--     --no-verify-jwt тут обов'язково: Telegram не знає нічого про
--     токени Supabase і надсилає звичайний POST. Замість JWT функцію
--     захищає TG_WEBHOOK_SECRET, який вона звіряє на кожному запиті.
--
--     Те саме можна зробити й мишкою, і це надійніше, бо не залежить
--     від версії CLI: Edge Functions → telegram-bot → Details →
--     вимкнути Verify JWT.
--
--     Те саме записано і в supabase/config.toml, щоб наступний деплой
--     без прапорця не ввімкнув перевірку назад. Якщо ваш CLI на цей
--     файл лається — видаліть його і користуйтесь прапорцем або
--     перемикачем: на роботу функції сам файл не впливає.
--
--     Ознака того, що JWT не вимкнено: у getWebhookInfo нижче
--     last_error_message буде про 401, а в логах функції — порожньо.
--     Запит до неї просто не доходить.
--
--     Потім скажіть Telegram, куди слати (одним рядком у браузері):
--
--        https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://<ПРОЄКТ>.supabase.co/functions/v1/telegram-bot&secret_token=<TG_WEBHOOK_SECRET>
--
--     Відповідь {"ok":true,"result":true,"description":"Webhook was set"}
--     означає, що бот на зв'язку.
--
--     Перевірити стан пізніше:
--        https://api.telegram.org/bot<ТОКЕН>/getWebhookInfo
--     last_error_message там — найшвидший спосіб зрозуміти, чому бот
--     мовчить.
--
--  3. У ДАШБОРДІ
--     Settings → Telegram alerts → впишіть username бота (без @) і
--     натисніть «Connect Telegram». Далі все зробить посилання.
-- ════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
--  ПОДИВИТИСЬ, ХТО ПІДКЛЮЧЕНИЙ
-- ────────────────────────────────────────────────────────────
--      select email, tg_name, linked_at,
--             case when chat_id is null then 'не підключено' else 'підключено' end as стан
--        from public.tg_links order by linked_at desc nulls last;
--
--  Відв'язати когось руками:
--      update public.tg_links
--         set chat_id = null, tg_name = null, linked_at = null
--       where email = 'buyer@example.com';
-- ════════════════════════════════════════════════════════════
