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
--  Ключ Anthropic у дашборді НЕ зберігається: сторінку читає будь-хто,
--  хто її відкрив. Він лежить у секретах функції:
--
--    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
--
--  Необов'язкові, із типовими значеннями в коді:
--    AI_MODEL      — модель (типово claude-haiku-5-5)
--    AI_DAY_LIMIT  — скільки викликів на людину за день (типово 100)
--
--  Розгорнути:
--    supabase functions deploy ai
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
--  ▶ ЗВІТ — скільки витратили
-- ════════════════════════════════════════════════════════════
select day, action, calls, in_tok, out_tok,
       -- Ціни Haiku 5.5 на момент написання: $0.10/млн вхідних,
       -- $0.50/млн вихідних. Якщо вони змінились, це місце бреше —
       -- саме тому поруч стоять і самі токени.
       round((in_tok * 0.10 + out_tok * 0.50) / 1000000.0, 4) as usd_approx
from public.ai_usage
order by day desc, action;
