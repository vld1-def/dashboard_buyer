-- ════════════════════════════════════════════════════════════
--  ▶ AI В ДАШБОРДІ: ЛІЧИЛЬНИК І МЕЖА
--
--  ЗАЧИМ ВЗАГАЛІ ТАБЛИЦЯ. Сама модель коштує копійки, і саме через це
--  легко не помітити цикл, який кличе її в тисячу разів. Ліміт на день
--  і запис витрат — не економія, а те, що робить витрати ВИДИМИМИ: без
--  них «чому рахунок виріс» не має де взятись.
--
--  ЧОМУ НА ЛЮДИНУ, А НЕ НА КОМАНДУ. Межа існує, щоб помилка одного не
--  стала рахунком усіх. Команда ділить дані, але не ліміт.
--
--  ЩО ТУТ НЕ ЗБЕРІГАЄТЬСЯ: ні тексти запитів, ні відповіді. Лише
--  кількості. Банк текстів лежить там, де й лежав (team_settings →
--  texts_bank), і туда йде ТІЛЬКИ те, що людина вибрала руками.
--
--  Виконати: Supabase → SQL Editor → Run. Один раз.
-- ════════════════════════════════════════════════════════════

create table if not exists public.ai_usage (
  id          bigserial primary key,
  created_by  uuid not null default auth.uid(),
  day         date not null default (now() at time zone 'utc')::date,
  action      text not null,
  calls       integer not null default 0,
  in_tok      bigint  not null default 0,
  out_tok     bigint  not null default 0,
  updated_at  timestamptz not null default now(),
  -- Один рядок на (людина, день, дія): лічильник, а не журнал подій.
  -- Журнал на кожен виклик виріс би швидше за користь від нього.
  unique (created_by, day, action)
);

alter table public.ai_usage enable row level security;

-- Своє видно, чуже ні. Пише функція ключем сервісної ролі — їй політики
-- не потрібні, тож політики на запис тут немає навмисно: з браузера
-- лічильник не підробити.
drop policy if exists ai_usage_own_select on public.ai_usage;
create policy ai_usage_own_select on public.ai_usage
  for select using (created_by = auth.uid());

create index if not exists ai_usage_day_idx on public.ai_usage (created_by, day);


-- ════════════════════════════════════════════════════════════
--  ▶ СЕКРЕТИ ФУНКЦІЇ
--
--  Ключі в дашборді НЕ зберігаються: сторінку читає будь-хто, хто її
--  відкрив. Вони лежать у секретах функції.
--
--  ДВІ МОДЕЛІ, ДВІ РОЛІ:
--    тексти  → Grok (x.ai), ключ з console.x.ai
--    таблиці → Claude (питання по таблицях і CRM)
--
--    supabase secrets set XAI_API_KEY=xai-...
--    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
--
--  Немає ключа x.ai — тексти самі лишаються на Claude, і в вікні
--  текстів видно, яка модель відповіла.
--
--  Необов'язкові, із типовими значеннями в коді:
--    AI_TEXT_ENGINE — 'xai' або 'claude' (типово xai, якщо є ключ)
--    XAI_MODEL      — модель x.ai (типово grok-4.7)
--    AI_MODEL       — модель Anthropic (типово claude-haiku-5-5)
--    AI_DAY_LIMIT   — скільки викликів на людину за день (типово 100)
--    XAI_PRICE_IN / XAI_PRICE_OUT, AI_PRICE_IN / AI_PRICE_OUT
--                   — $ за млн токенів, якщо прайс змінився: саме з
--                     них рахується ціна, яку показує вікно
--
--  Розгорнути:
--    supabase functions deploy ai
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
--  ▶ ЗВІТ — скільки витратили
-- ════════════════════════════════════════════════════════════
select day, action, calls, in_tok, out_tok,
       -- УВАГА: тут ціни ОДНІЄЇ моделі — Haiku 5.5 ($0.10/млн вхідних,
       -- $0.50/млн вихідних). Тексти тепер пише Grok, і він дорожчий,
       -- тому для рядків з action='text' це число занижене. Точну ціну
       -- кожного виклику віддає сама функція (cost_usd), а тут поруч
       -- лежать самі токени — множ на свій прайс.
       round((in_tok * 0.10 + out_tok * 0.50) / 1000000.0, 4) as usd_approx
from public.ai_usage
order by day desc, action;
