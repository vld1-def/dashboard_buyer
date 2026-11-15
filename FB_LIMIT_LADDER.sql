-- ════════════════════════════════════════════════════════════
--  ДРАБИНКА ЛІМІТІВ
--
--  «Ти даєш кабінету $5 на пробу. Якщо він відкрутив їх із нормальною
--  ціною ліда чи інсталу, CRM сама дає наступні … Якщо ціна погана,
--  лишає стояти.»  → умова «ціна результату не вища за X», сходинки —
--  однаковий крок N разів.
--
--  ОДИН РЯДОК — ОДНА ДРАБИНКА НА КАБІНЕТІ:
--    step_major   — скільки давати на кожній сходинці (ціла валюта);
--    steps_total  — скільки сходинок усього;
--    max_cost     — найбільша ціна ліда чи інсталу, за якої даємо далі;
--    steps_done   — скільки сходинок уже видано (0 — ще не починали).
--
--  ЯК ЦЕ ЖИВЕ. Сторінка лише кладе рядок. Усе решта робить fb-limit за
--  тим самим розкладом, що й ліміт за часом (fb-limit-plans, щохвилини):
--    • видає першу сходинку: скидає лічильник і ставить ліміт step_major;
--    • раз на кілька хвилин дивиться, чи ліміт відкручено;
--    • відкручено і ціна вклалась — видає наступну; не вклалась — чекає
--      пів години (результати доходять із запізненням) і зупиняється;
--    • ліміт змінили руками — драбинка знімається сама.
--
--  Facebook дозволяє 10 змін ліміту на кабінет за добу, тому сходинок
--  не більше восьми.
--
--  Безпечно виконувати повторно.
-- ════════════════════════════════════════════════════════════

create table if not exists public.fb_limit_ladder (
  id              bigserial primary key,
  created_by      uuid        not null default auth.uid(),
  team_name       text,
  account_id      text        not null,                 -- без act_
  step_major      numeric     not null check (step_major >= 1),
  steps_total     integer     not null check (steps_total between 1 and 8),
  max_cost        numeric     not null check (max_cost > 0),
  steps_done      integer     not null default 0,
  status          text        not null default 'active'
                  check (status in ('active','done','stopped','failed','cancelled')),
  base_results    numeric,                              -- лідів+інсталів на старті сходинки
  step_started_at timestamptz,
  hit_at          timestamptz,                          -- коли вперше побачили, що ліміт відкручено
  last_check_at   timestamptz,
  note            text,
  created_at      timestamptz not null default now(),
  done_at         timestamptz
);

create index if not exists fb_limit_ladder_active_idx
  on public.fb_limit_ladder (status, last_check_at);
create index if not exists fb_limit_ladder_owner_idx
  on public.fb_limit_ladder (created_by, account_id);
-- На кабінеті одночасно одна жива драбинка: дві видавали б ліміт навперебій.
create unique index if not exists fb_limit_ladder_one_active
  on public.fb_limit_ladder (account_id) where status = 'active';

alter table public.fb_limit_ladder enable row level security;

drop policy if exists fb_limit_ladder_own_select on public.fb_limit_ladder;
create policy fb_limit_ladder_own_select on public.fb_limit_ladder
  for select to authenticated using (created_by = auth.uid());

-- Покласти можна лише свою і лише «з нуля»: steps_done та стан веде функція.
drop policy if exists fb_limit_ladder_own_insert on public.fb_limit_ladder;
create policy fb_limit_ladder_own_insert on public.fb_limit_ladder
  for insert to authenticated
  with check (created_by = auth.uid() and status = 'active' and steps_done = 0);

-- Змінити — лише скасувати свою живу.
drop policy if exists fb_limit_ladder_own_cancel on public.fb_limit_ladder;
create policy fb_limit_ladder_own_cancel on public.fb_limit_ladder
  for update to authenticated
  using (created_by = auth.uid() and status = 'active')
  with check (created_by = auth.uid() and status = 'cancelled');

grant select, insert, update on public.fb_limit_ladder to authenticated;
grant usage, select on sequence public.fb_limit_ladder_id_seq to authenticated;

-- Розклад той самий, що й у ліміту за часом. Доти він стукав у функцію
-- лише коли є запланована зміна; тепер — ще й коли є жива драбинка.
select cron.unschedule('fb-limit-plans')
 where exists (select 1 from cron.job where jobname = 'fb-limit-plans');

select cron.schedule(
  'fb-limit-plans',
  '* * * * *',
  $$
  select net.http_post(
    url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'fb_rules_url'),
                   '/fb-rules', '/fb-limit'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets
                        where name = 'fb_rules_cron_key')),
    body := '{"cron":"plans"}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.fb_limit_plan
                 where status = 'pending' and run_at <= now())
     or exists (select 1 from public.fb_limit_ladder where status = 'active');
  $$);

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
--  ПЕРЕВІРКА
--    select id, account_id, step_major, steps_done, steps_total, max_cost, status, note
--      from public.fb_limit_ladder order by id desc limit 10;
--  ЗУПИНИТИ ВСІ
--    update public.fb_limit_ladder set status = 'cancelled' where status = 'active';
-- ════════════════════════════════════════════════════════════
