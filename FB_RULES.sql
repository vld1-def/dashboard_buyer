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
--  Функція fb-rules дивиться на сьогоднішні числа кожного активного
--  оголошення (спенд, клики по силці, ліди) і вимикає те, що підпадає
--  під ваші правила. Правила задаються в дашборді, на сторінці Rules, і
--  лежать у team_settings — окремої таблиці для них немає навмисно.
--
--  ЗВІДКИ ВОНА БЕРЕ ЦІ ЧИСЛА — і чому це важливо для лімітів Facebook.
--  Не з Facebook. Їх складає fb-sync у таблицю fb_ad_today тим самим
--  пакетом, яким щопівгодини обходить кабінети: список оголошень вона
--  тягнула й раніше — заради статусів і Сторінок, — тож цифри доїхали
--  одним підзапитом, а не окремим обходом усього парку.
--
--  Тобто правила НЕ додають жодного запиту на читання. До Facebook вони
--  ідуть рівно тоді, коли треба щось вимкнути, і рівно за цим. Якби
--  замість цього кожен прогін правил сам обходив кабінети, на сорока
--  кабінетах це були б додаткові сто двадцять запитів на годину за ті
--  самі дані, які вже лежать у базі.
--
--  ЧОГО ВОНА НЕ РОБИТЬ І НЕ БУДЕ
--  Вмикати назад. Ніколи. Увімкнути треба вибірково й свідомо, інакше
--  одне правило одного ранку підніме те, що глушили спеціально.
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1 — знімок активних оголошень
--
--  Те, на що дивляться правила. Пише його fb-sync, читає fb-rules.
--  Без цієї таблиці правила не бачать нічого й нічого не роблять —
--  але й не ламаються: fb-sync у відповіді напише «no table yet», а
--  сторінка Rules скаже те саме.
--
--  Рядок живе один прогін: fb-sync прибирає з знімка все, що вже не
--  ввімкнене. Тому таблиця не росте — у ній рівно стільки рядків,
--  скільки зараз ввімкнено оголошень.
--
--  ВВІМКНЕНЕ — це не те саме, що ACTIVE. Сюди потрапляє й реджект, і те,
--  що чекає перевірки: саме воно й потрібне на екрані кабінета, бо
--  ввімкнене, але не крутиться, — це питання номер один. Пауз тут
--  немає: вимкнене вимкнули свідомо.
--
--  ПРАВИЛА при цьому дивляться ЛИШЕ на ACTIVE — фільтр стоїть у
--  fb-rules. Вимикати те, що вже й так не крутиться, змісту немає.
--
--  actions лежить сирим: що саме вважати лідом — налаштування правил
--  (галочки на сторінці Rules), і зміна галочки не повинна вимагати
--  нового походу в Facebook.
-- ════════════════════════════════════════════════════════════

create table if not exists public.fb_ad_today (
  created_by   uuid not null references auth.users(id) on delete cascade,
  ad_id        text not null,
  team_name    text,
  account_id   text not null,
  name         text,
  effective_status text,
  adset_id     text,
  adset_name   text,
  campaign_id  text,
  campaign_name text,
  optimization_goal text,
  custom_event_type text,
  spend        numeric,
  impressions  bigint,
  clicks       bigint,
  link_clicks  bigint,
  actions      jsonb,
  seen_at      timestamptz not null default now(),
  primary key (created_by, ad_id)
);

create index if not exists fb_ad_today_acc_idx on public.fb_ad_today (account_id, seen_at desc);

-- Назви кампанії й адсета та ціль адсета. Окремим блоком, бо таблиця
-- могла зʼявитись раніше за них: Postgres на повторний add column if not
-- exists не лається, тож виконати це можна і на новій, і на вже наявній.
--
-- optimization_goal і custom_event_type — це те, на що оптимізується
-- адсет. З них екран кабінета рахує «Result»: без них він показував би
-- ліди там, де насправді реєстрації.
--
-- campaign_status і adset_status — ВЛАСНИЙ стан кампанії та адсета, а
-- не складений з оголошень. Вивести його з дітей не можна: кампанія
-- буває PAUSED сама по собі, а її оголошення при цьому ACTIVE —
-- Facebook просто не показує їх. Поки стан кампанії складався з
-- оголошень, така кампанія виглядала робочою, і питання «чому вона
-- нічого не витрачає» лишалось без відповіді.
alter table public.fb_ad_today
  add column if not exists adset_name        text,
  add column if not exists campaign_name     text,
  add column if not exists optimization_goal text,
  add column if not exists custom_event_type text,
  add column if not exists effective_status  text,
  add column if not exists campaign_status   text,
  add column if not exists adset_status      text,
  -- Бюджет у Facebook стоїть АБО на кампанії (CBO), АБО на кожному
  -- адсеті (ABO) — ніколи на обох. Тримаємо обидва рівні: інакше
  -- половина кабінетів бачила б прочерк і не розуміла чому.
  -- Числа в дрібних одиницях, як їх віддає Graph: 5000 = 50.00.
  add column if not exists campaign_daily_budget    numeric,
  add column if not exists campaign_lifetime_budget numeric,
  add column if not exists adset_daily_budget       numeric,
  add column if not exists adset_lifetime_budget    numeric,
  -- status, а НЕ effective_status: це положення самого вимикача
  -- (ACTIVE / PAUSED / ARCHIVED). Те саме оголошення з вимикачем ACTIVE
  -- буде DISAPPROVED, якщо його відхилили, і CAMPAIGN_PAUSED, якщо
  -- вимкнули кампанію над ним. Поки ми мали лише effective_status,
  -- положення вимикача доводилось вгадувати — і на реджектах здогадка
  -- була хибною.
  add column if not exists own_status               text,
  add column if not exists campaign_own_status      text,
  add column if not exists adset_own_status         text;

alter table public.fb_ad_today enable row level security;

-- Свої оголошення видно власнику. Пише тільки fb-sync — вона ходить
-- ключем сервісної ролі, і політики на неї не діють.
drop policy if exists fb_ad_today_read_own on public.fb_ad_today;
create policy fb_ad_today_read_own on public.fb_ad_today
  for select using (auth.uid() = created_by);


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — журнал вимкнень
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
--  ▶ БЛОК 3 — окремий секрет для розкладу
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
--  ▶ БЛОК 4 — перевірка руками, ДО розкладу
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
--  ▶ БЛОК 5 — розклад
--
--  Через пʼять хвилин після синхронізації: о 12 і 42, коли fb-sync
--  ходить о 7 і 37. Саме в такому порядку, бо правила дивляться на
--  знімок, який вона щойно оновила.
--
--  Частіше немає сенсу: свіжіших чисел усе одно не буде. Прогін правил
--  тепер не коштує жодного запиту до Facebook — лише читання з бази, —
--  але ганяти його між синхронізаціями означало б перечитувати ті самі
--  рядки й слати ті самі повідомлення.
--
--  Якщо fb-sync пропустила прогін і знімок застарів більше ніж на 90
--  хвилин, правила НЕ діють: у відповіді буде stale і причина по
--  кожному кабінету. Вимикати оголошення за годинними числами означало
--  б гасити те, що ви вже виправили.
-- ════════════════════════════════════════════════════════════

select cron.schedule(
  'fb-rules',
  '12,42 * * * *',
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
--  Подивитись, на що вона дивиться (знімок і його свіжість):
--      select account_id, count(*) as ads, max(seen_at) as fresh
--        from public.fb_ad_today
--       group by account_id order by fresh;
--
--  Вимкнене вона назад НЕ увімкне — ні автоматично, ні кнопкою. Це
--  робиться руками в Ads Manager, і саме тому в журналі лежать id: за
--  ними знайти й підняти те, що вимкнули помилково.
-- ════════════════════════════════════════════════════════════
