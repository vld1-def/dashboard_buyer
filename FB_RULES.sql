-- ════════════════════════════════════════════════════════════
--  ПРАВИЛА: АВТОМАТИЧНЕ ВИМИКАННЯ ТОГО, ЩО НЕ ОКУПАЄТЬСЯ
-- ════════════════════════════════════════════════════════════
--
--  ЯК КОРИСТУВАТИСЬ ЦИМ ФАЙЛОМ
--  Це не один скрипт, який виконують цілком. Це блоки, які виконують
--  ПО ЧЕРЗІ в Supabase → SQL Editor: скопіювали блок, натиснули Run,
--  подивились результат, перейшли до наступного.
--
--  ПЕРЕД ПОЧАТКОМ має бути зроблено:
--    1. виконано FB_TOKENS.sql і FB_SYNC.sql, парк кабінетів видно;
--    2. задеплоєно функцію:  supabase functions deploy fb-rules
--
--  ЩО ЦЕ РОБИТЬ
--  Функція fb-rules обходить активні оголошення, рахує по них
--  сьогоднішні числа Facebook (спенд, клики по силці, ліди) і вимикає
--  те, що підпадає під ваші правила. Правила задаються в дашборді, на
--  сторінці Rules, і лежать у team_settings — окремої таблиці для них
--  немає навмисно.
--
--  ЧОГО ВОНА НЕ РОБИТЬ І НЕ БУДЕ
--  Вмикати назад. Ніколи. Увімкнути треба вибірково й свідомо, інакше
--  одне правило одного ранку підніме те, що глушили спеціально.
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1 — журнал вимкнень
--
--  Без нього функція працює, але історії не лишає: у відповіді видно
--  лише останній прогін. З ним сторінка Rules показує, що і чому
--  вимикалось, і це перше, що знадобиться, коли правило помилиться.
-- ════════════════════════════════════════════════════════════

create table if not exists public.fb_rule_log (
  id          bigserial primary key,
  created_by  uuid not null references auth.users(id) on delete cascade,
  team_name   text,
  at          timestamptz not null default now(),
  rule_id     text,
  rule_name   text,
  level       text,               -- ad / adset / campaign
  entity_id   text,
  entity_name text,
  account_id  text,
  metrics     jsonb,              -- чим саме керувались: spend, leads, кліки
  dry         boolean not null default true,
  ok          boolean not null default false,
  error       text
);

create index if not exists fb_rule_log_who_idx  on public.fb_rule_log (created_by, at desc);
create index if not exists fb_rule_log_rule_idx on public.fb_rule_log (rule_id, at desc);

alter table public.fb_rule_log enable row level security;

-- Свій журнал видно власнику. Пише в нього тільки функція — вона
-- ходить ключем сервісної ролі, і політики на неї не діють.
drop policy if exists fb_rule_log_read_own on public.fb_rule_log;
create policy fb_rule_log_read_own on public.fb_rule_log
  for select using (auth.uid() = created_by);


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — окремий секрет для розкладу
--
--  ЧОМУ НЕ ТОЙ САМИЙ, ЩО В fb-sync І check-domains.
--  Ті функції лише читають. Ця вимикає рекламу. Ключ, який умів тільки
--  читати, не повинен раптом почати вимикати — навіть якщо колись
--  витече з логів чи з чужого ноутбука. Тому в неї власний секрет, і
--  без нього розкладу для неї не існує: функція відповідає 400.
--
--  Придумайте довгий випадковий рядок (не пароль від чогось іншого!)
--  і покладіть його У ДВА МІСЦЯ:
--
--    1. у секрети функції:
--         supabase secrets set RULES_CRON_SECRET='ваш-довгий-рядок'
--       (там же має бути TG_BOT_TOKEN, якщо хочете сповіщення)
--
--    2. у сховище бази — блоком нижче.
-- ════════════════════════════════════════════════════════════

select vault.create_secret('ваш-довгий-рядок', 'fb_rules_cron_key');

-- Адреса функції — так само, як у FB_SYNC_CRON.sql. ЗАМІНІТЬ ВАШ-ПРОЄКТ.
select vault.create_secret(
  'https://ВАШ-ПРОЄКТ.supabase.co/functions/v1/fb-rules', 'fb_rules_url');


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 3 — перевірка руками, ДО розкладу
--
--  Має прийти 200 і json із rules / cabinets / would_pause. Поки всі
--  ваші правила стоять у режимі звіту (так вони й створюються), цей
--  виклик нічого не вимкне — він лише порахує.
-- ════════════════════════════════════════════════════════════

select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'fb_rules_url'),
  headers := jsonb_build_object(
    'content-type', 'application/json',
    'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets
                      where name = 'fb_rules_cron_key')),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
) as request_id;

-- Відповідь дивитись так (підставте номер із попереднього запиту):
--   select status_code, content from net._http_response where id = <request_id>;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 4 — розклад
--
--  Кожні 20 хвилин. Частіше за синхронізацію кабінетів навмисно:
--  зіпсоване оголошення витрачає гроші щохвилини, і година тут — це
--  година оплаченого сміття. Один прогін — це один запит на кабінет,
--  тобто дешевше за саму синхронізацію.
--
--  Хвилини 3, 23, 43 — щоб не стояти в черзі з усім, що ставили на
--  нульову хвилину, і не збігатись із fb-sync (7 і 37).
-- ════════════════════════════════════════════════════════════

select cron.schedule(
  'fb-rules',
  '3,23,43 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'fb_rules_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets
                        where name = 'fb_rules_cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$);


-- ════════════════════════════════════════════════════════════
--  ЯК ЦЕ ВИМКНУТИ, ЯКЩО ЩОСЬ ПІШЛО НЕ ТАК
--
--  Найшвидше — у дашборді: на сторінці Rules вимкнути саме те правило,
--  яке шкодить. Розклад при цьому лишається, решта правил працює.
--
--  Зупинити автоматику цілком:
--      select cron.unschedule('fb-rules');
--
--  Подивитись, що вона накоїла:
--      select at, rule_name, level, entity_name, metrics, dry, ok, error
--        from public.fb_rule_log
--       order by at desc limit 50;
--
--  Вимкнене вона назад НЕ увімкне — ні автоматично, ні кнопкою. Це
--  робиться руками в Ads Manager, і саме тому в журналі лежать id: за
--  ними знайти й підняти те, що вимкнули помилково.
-- ════════════════════════════════════════════════════════════
