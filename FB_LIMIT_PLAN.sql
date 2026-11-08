-- ════════════════════════════════════════════════════════════
--  ЛІМІТ КАБІНЕТА ЗА РОЗКЛАДОМ — fb_limit_plan
-- ════════════════════════════════════════════════════════════
--  «Створити штуку, яка міняє саме ліміт, щоб можна було виставляти,
--  в котрій годині це міняти. Можна прям там, де руками міняємо,
--  додати кнопку».
--
--  Сторінка (кнопка ⏰ біля олівця ліміту в картці кабінета) кладе сюди
--  запис: кабінет, точна сума, коли. Розклад щохвилини кличе fb-limit
--  ключем розкладу правил; функція забирає записи, чий час настав, і
--  міняє стелю тим самим кодом, що й кнопка ✎. Результат — у цьому ж
--  рядку і в Telegram автора.
--
--  Запізнення понад 30 хв не виконується (status = 'missed'): стеля,
--  піднята на годину пізніше за план, — уже не той план.
--
--  Facebook дозволяє не більше 10 змін стелі на кабінет за добу — і
--  ручні, і заплановані рахуються разом. Сторінка не дасть запланувати
--  понад 10 на один день.
--
--  ПЕРЕДУМОВИ (уже є, якщо працюють правила): секрет RULES_CRON_SECRET
--  у функціях, записи fb_rules_cron_key і fb_rules_url у Vault
--  (FB_RULES.sql). Адресу fb-limit виводимо з fb_rules_url.
--
--  Виконати можна повторно: усе через if not exists / or replace, а
--  cron.schedule з тим самим іменем замінює розклад.
-- ════════════════════════════════════════════════════════════

create table if not exists public.fb_limit_plan (
  id          bigserial primary key,
  created_by  uuid        not null default auth.uid(),
  team_name   text,
  account_id  text        not null,           -- без act_
  set_major   numeric     not null check (set_major > 0),  -- у цілій валюті
  allow_new   boolean     not null default false,           -- кабінет без стелі
  run_at      timestamptz not null,
  status      text        not null default 'pending'
              check (status in ('pending','running','done','failed','missed','cancelled')),
  result      text,
  cap_after   numeric,                        -- як віддав Facebook, мінорні одиниці
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists fb_limit_plan_due_idx
  on public.fb_limit_plan (status, run_at);
create index if not exists fb_limit_plan_owner_idx
  on public.fb_limit_plan (created_by, account_id);

alter table public.fb_limit_plan enable row level security;

-- Кожен бачить і міняє лише своє. Виконує розклад сервісним ключем.
drop policy if exists fb_limit_plan_own_select on public.fb_limit_plan;
create policy fb_limit_plan_own_select on public.fb_limit_plan
  for select to authenticated using (created_by = auth.uid());

drop policy if exists fb_limit_plan_own_insert on public.fb_limit_plan;
create policy fb_limit_plan_own_insert on public.fb_limit_plan
  for insert to authenticated with check (created_by = auth.uid() and status = 'pending');

-- Оновлювати з дашборда можна лише одне: скасувати своє заплановане.
drop policy if exists fb_limit_plan_own_cancel on public.fb_limit_plan;
create policy fb_limit_plan_own_cancel on public.fb_limit_plan
  for update to authenticated
  using (created_by = auth.uid() and status = 'pending')
  with check (created_by = auth.uid() and status = 'cancelled');

grant select, insert, update on public.fb_limit_plan to authenticated;
grant usage, select on sequence public.fb_limit_plan_id_seq to authenticated;

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
                 where status = 'pending' and run_at <= now());
  $$);

-- ════════════════════════════════════════════════════════════
--  Розклад стукає у функцію ЛИШЕ коли є що виконувати (where exists):
--  порожня хвилина не коштує жодного виклику.
--
--  ПЕРЕВІРКА
--    select * from cron.job where jobname = 'fb-limit-plans';
--    select id, account_id, set_major, run_at, status, result
--      from public.fb_limit_plan order by id desc limit 20;
--
--  ВИМКНУТИ
--    select cron.unschedule('fb-limit-plans');
-- ════════════════════════════════════════════════════════════
