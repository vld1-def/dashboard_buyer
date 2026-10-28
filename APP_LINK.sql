-- ════════════════════════════════════════════════════════════
--  ▶ ПОСИЛАННЯ НА АПКУ В PLAY — І ЩОДЕННА ПЕРЕВІРКА БАНУ
--
--  ЗАЧИМ. Апку банять мовчки. Вона лежить у списку рівно так само, як
--  живі, шаблон під неї вибирають очима, і неймінг забаненої апки
--  спокійно їде в кабінет. APP_STATUS.sql дав стан active/ban, але
--  ставити його доводилось руками — тобто рівно тоді, коли хтось
--  помітив. Помічали через дні.
--
--  Тепер у воронки є app_id — те, що стоїть у адресі Play:
--      play.google.com/store/apps/details?id=com.fortunedra.gontrheb
--                                            ^^^^^^^^^^^^^^^^^^^^^^^
--  Функція check-apps щодня питає ту сторінку й пише стан.
--
--  ЧОМУ НЕ БАН ІЗ ПЕРШОГО 404. Play віддає 404 не лише забаненим: є
--  ліміт на частоту, є геоблок, є звичайні збої. А забанена воронка
--  ЗНИКАЄ зі списку прілок — тобто хибний бан ховає робочу апку, і
--  людина дізнається про це, коли піде її шукати.
--
--  Тому дві перевірки поспіль. Перша невдача пише app_gone_since й
--  лишає стан недоторканим; якщо й наступного разу те саме — ставиться
--  ban. Відповіла між ними — app_gone_since стирається.
--
--  ЧОМУ app_banned_by. Бан, поставлений роботом, робот має право зняти
--  сам, коли апка знову відкрилась. Бан, поставлений людиною, — не
--  має: вона могла забанити апку з причини, якої в Play не видно.
--
--  Виконати: Supabase → SQL Editor → Run. Блоки 1 і 2 — один раз.
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1 — колонки
-- ════════════════════════════════════════════════════════════

alter table public.funnels_mapping
  add column if not exists app_id         text,
  add column if not exists app_icon       text,
  add column if not exists app_checked_at timestamptz,
  add column if not exists app_gone_since timestamptz,
  add column if not exists app_note       text,
  add column if not exists app_banned_by  text;

--  Хто поставив бан. Порожньо — людина (або бан стоїть іще з часів до
--  цієї міграції). 'robot' — обхід, і лише такий бан обхід зніме сам.
alter table public.funnels_mapping
  drop constraint if exists funnels_mapping_app_banned_by_chk;
alter table public.funnels_mapping
  add constraint funnels_mapping_app_banned_by_chk
  check (app_banned_by is null or app_banned_by in ('robot'));

--  Обхід бере рядки за найдавнішою перевіркою. Без індексу це
--  послідовне читання всієї таблиці щодня — поки воронок сотня, дарма,
--  але коштує він нічого.
create index if not exists funnels_mapping_app_check_idx
  on public.funnels_mapping (app_checked_at nulls first)
  where app_id is not null and app_id <> '';

--  APP_STATUS.sql міг бути не виконаний — без status обхід не має куди
--  писати висновок. Додаємо те саме, що й там: повторний запуск
--  нічого не зіпсує.
alter table public.funnels_mapping
  add column if not exists status text default 'active';
update public.funnels_mapping set status = 'active' where status is null;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — секрети для розкладу
--
--  Той самий спосіб, що й у DOMAINS_CRON.sql: функція має свій вхід за
--  спільним секретом (заголовок x-cron-key), бо розклад ходить без
--  людини й без її токена.
--
--  Секрет вигадайте довгий і випадковий. Один і той самий рядок має
--  стояти ТУТ і в секретах функції:
--      supabase secrets set CHECK_APPS_CRON_KEY=...
--
--  Якщо виконати цей блок удруге, буде помилка про дублікат імені —
--  секрет уже створено. Міняти значення: vault.update_secret.
-- ════════════════════════════════════════════════════════════

select vault.create_secret(
  'https://ВАШ-ПРОЄКТ.supabase.co/functions/v1/check-apps',
  'check_apps_url',
  'Щоденна перевірка апок у Play: адреса функції');

select vault.create_secret(
  'СЮДИ-ВАШ-СЕКРЕТ',
  'check_apps_cron_key',
  'Щоденна перевірка апок у Play: спільний секрет');


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 3 — перевірити зараз, не чекаючи ночі
--
--  Той самий запит, який робитиме розклад. Спрацює він — спрацює й
--  розклад. Другий запит — окремим запуском, секунд через двадцять.
-- ════════════════════════════════════════════════════════════

select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets
           where name = 'check_apps_url'),
  headers := jsonb_build_object(
    'content-type', 'application/json',
    'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets
                      where name = 'check_apps_cron_key')),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000);

--  ↓ окремим запуском
select status_code, content, created
  from net._http_response
 order by created desc
 limit 3;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 4 — щоденний розклад
--
--  Раз на добу, і цього досить: бан — подія не щогодинна, а кожен
--  зайвий обхід це запити до Play з однієї адреси, тобто найкоротший
--  шлях до ліміту.
--
--  04:40 UTC — не рівна година навмисно: о рівній туди стукають усі
--  розклади світу.
-- ════════════════════════════════════════════════════════════

do $$
declare n text;
begin
  for n in select jobname from cron.job where jobname like 'apps-check%' loop
    perform cron.unschedule(n);
    raise notice 'прибрано старе завдання: %', n;
  end loop;
end $$;

select cron.schedule(
  'apps-check',
  '40 4 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
             where name = 'check_apps_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets
                        where name = 'check_apps_cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$);

--  Що стоїть зараз — єдиний спосіб знати напевне:
--      select jobname, schedule, active from cron.job
--       where jobname like 'apps%';


-- ════════════════════════════════════════════════════════════
--  ▶ ЗВІТ — що вийшло
-- ════════════════════════════════════════════════════════════

select 'колонка app_id', case when exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'funnels_mapping'
     and column_name = 'app_id') then 'є' else 'НЕМА' end
union all
select 'колонка status', case when exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'funnels_mapping'
     and column_name = 'status') then 'є' else 'НЕМА' end
union all
select 'завдання apps-check', coalesce(
  (select schedule from cron.job where jobname = 'apps-check'), 'НЕМА');

--  Скільки апок під наглядом і коли їх востаннє питали:
--      select funnel_name, app_id, status, app_checked_at, app_note
--        from public.funnels_mapping
--       where app_id is not null and app_id <> ''
--       order by app_checked_at nulls first;
