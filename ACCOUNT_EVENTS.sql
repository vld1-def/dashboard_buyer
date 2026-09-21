-- ============================================================
--  ЖУРНАЛ ЗМІН КАБІНЕТІВ — account_events
-- ============================================================
--
--  Навіщо: щоб «кабінет забанився» не треба було помічати самому.
--  Дашборд і так рахує стан кожного кабінета з daily_stats
--  (running / silent / issue / banned / never ran). Ця таблиця лише
--  запам'ятовує, КОЛИ стан змінився.
--
--  Дашборд працює й без цієї таблиці: якщо її немає або RLS не пускає,
--  надбудова тихо вимикається, а на сторінці Cabinets замість стрічки
--  зʼявляється рядок «History is off: …». Нічого не ламається.
-- ============================================================

create table if not exists public.account_events (
  id          bigserial primary key,
  team_name   text        not null,
  account_id  text        not null,
  at          timestamptz not null default now(),
  kind        text        not null,          -- поки що завжди 'state'
  from_state  text,                          -- null = перший запис по кабінету
  to_state    text        not null,
  note        text,
  source      text        not null default 'manual'
  -- source:
  --   'seed'   — точка відліку, не подія. Ставиться при першій звірці,
  --              щоб перший захід не намалював банер з усім парком одразу.
  --   'auto'   — перехід, помічений із даних
  --   'manual' — статус переставили руками в панелі кабінета
);

create index if not exists account_events_team_acc_at_idx
  on public.account_events (team_name, account_id, at desc);

-- Стрічка «останні зміни» читає таблицю по команді й часу.
create index if not exists account_events_team_at_idx
  on public.account_events (team_name, at desc);


-- ============================================================
--  ЯКЩО ВМИКАЄТЕ RLS
-- ============================================================
--  За замовчуванням RLS на новій таблиці вимкнено, і публічний ключ
--  може і читати, і писати — так само, як у решті таблиць дашборда.
--
--  Якщо колись увімкнете RLS (SECURITY_RLS.sql), цю таблицю треба
--  додати в ті самі списки — інакше журнал просто перестане вестись:
--
--    alter table public.account_events enable row level security;
--    create policy "public_read" on public.account_events
--      for select to anon, authenticated using (true);
--    create policy "public_insert" on public.account_events
--      for insert to anon, authenticated with check (true);
--
--  Запис тут навмисно дозволено тому ж, хто читає: події пише сама
--  сторінка у фоні, а не людина.


-- ============================================================
--  ПРИБИРАННЯ (не обовʼязкове)
-- ============================================================
--  Один рядок на реальну зміну стану — таблиця росте повільно.
--  Сторінка тягне останні 4000 подій. Якщо колись переросте:
--
--    delete from public.account_events
--     where at < now() - interval '1 year'
--       and source <> 'seed';
-- ============================================================
