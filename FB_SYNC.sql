-- ════════════════════════════════════════════════════════════
--  fb_accounts — що Facebook каже про кабінети
-- ════════════════════════════════════════════════════════════
--  Сюди щогодини складає дані функція fb-sync. Тільки те, що сказав
--  Facebook: ручні підписи лишаються в accounts_mapping і не
--  затираються.
--
--  Токена тут немає — він живе у fb_tokens і читається лише функцією.
--
--  Виконайте файл цілком. Повторний запуск безпечний.
-- ════════════════════════════════════════════════════════════

create table if not exists public.fb_accounts (
  id          bigserial primary key,
  created_by  uuid not null references auth.users(id) on delete cascade,
  team_name   text,
  token_id    bigint references public.fb_tokens(id) on delete set null,

  -- Без префікса act_: '1234567890'
  account_id  text not null,
  name        text,

  -- active | banned | unsettled | review | grace | closing | closed | unknown
  status       text,
  status_code  int,            -- account_status як число, на випадок нових
  disable_reason text,

  currency      text,
  timezone_name text,
  business_id   text,
  business_name text,

  -- «Visa *1234». Біна тут немає: Marketing API перших шести цифр не віддає.
  card        text,
  card_type   text,

  -- Гроші вже поділені на 100: Facebook віддає їх у центах.
  amount_spent numeric,        -- за весь час
  spend_cap    numeric,        -- 0 = ліміту немає
  balance      numeric,

  -- Денна стеля, яку Facebook ставить САМ (adtrust_dsl). В офіційному
  -- переліку полів кабінета її немає, але Graph її віддає. null тут
  -- означає «не сказав», а не «стелі немає».
  daily_limit  numeric,
  -- Передплачений кабінет чи картковий. Від цього залежить, що взагалі
  -- значить баланс, який показує Ads Manager.
  is_prepay    boolean,
  daily_budget numeric,        -- сума денних бюджетів того, що крутить

  -- Сьогодні — у часовому поясі кабінета, не вашому.
  spend_today       numeric,
  impressions_today bigint,
  clicks_today      bigint,

  -- Три різні числа:
  --   campaigns        — скільки їх узагалі (без архіву)
  --   campaigns_on     — скільки ввімкнено
  --   campaigns_active — скільки справді крутить (має живе оголошення)
  -- Кампанія буває ввімкнена й мертва: усі її оголошення відхилені.
  campaigns int, campaigns_on int, campaigns_active int,
  adsets    int, adsets_on    int, adsets_active    int,
  ads       int, ads_on       int, ads_active       int,

  -- {"ACTIVE":3,"DISAPPROVED":141,…}. Ключ _more — обʼєктів більше,
  -- ніж влізло в одну сторінку, і розбивка лише по порахованих.
  campaigns_by_status jsonb,
  adsets_by_status    jsonb,
  ads_by_status       jsonb,

  -- Помилка саме по цьому кабінету. Решта полів лишається з минулого
  -- разу: один кабінет, який не відповів, не стирає дані по інших.
  sync_error text,
  synced_at  timestamptz,

  -- Коли токен перестав бачити цей кабінет. Рядок не видаляємо — у
  -- ньому ваші підписи.
  missing_since timestamptz,

  created_at timestamptz not null default now(),

  -- Два токени одного БМ бачать ті самі кабінети й мають оновлювати
  -- той самий рядок.
  unique (created_by, account_id)
);

create index if not exists fb_accounts_team_idx on public.fb_accounts (team_name);
create index if not exists fb_accounts_token_idx on public.fb_accounts (token_id);


-- ────────────────────────────────────────────────────────────
--  ДОСТУП
--  Читає власник, пише лише сервісна роль (функція імпорту).
--  Політик insert/update для authenticated немає навмисно: правити
--  тут руками нічого, інакше дані розійдуться з Facebook.
-- ────────────────────────────────────────────────────────────

alter table public.fb_accounts enable row level security;

drop policy if exists "own_select" on public.fb_accounts;
create policy "own_select" on public.fb_accounts for select to authenticated
  using (created_by = auth.uid());

grant select on public.fb_accounts to authenticated;


-- ────────────────────────────────────────────────────────────
--  ЯКЩО ТАБЛИЦЯ ВЖЕ БУЛА
--  create table if not exists нових стовпчиків не додає.
-- ────────────────────────────────────────────────────────────

alter table public.fb_accounts
  add column if not exists campaigns_by_status jsonb,
  add column if not exists adsets_by_status    jsonb,
  add column if not exists ads_by_status       jsonb,
  add column if not exists campaigns_on  int,
  add column if not exists adsets_on     int,
  add column if not exists ads_on        int,
  add column if not exists daily_budget  numeric,
  add column if not exists missing_since timestamptz,
  -- Обхід коментарів. scanned_at — коли востаннє дивились (за ним
  -- вибирається черга: першими ті, кого давно не бачили). seen_at —
  -- час найновішого коментаря, який ми вже опрацювали; усе, що
  -- новіше, вважається новим.
  add column if not exists comments_scanned_at timestamptz,
  add column if not exists comments_seen_at    timestamptz,
  -- Денна стеля від Facebook і спосіб оплати. Без цього ALTER синк
  -- працює далі, просто мовчки не пише ці два числа — і так і каже
  -- рядком columns у відповіді.
  add column if not exists daily_limit numeric,
  add column if not exists is_prepay   boolean;


-- ════════════════════════════════════════════════════════════
--  fb_spend_daily — витрати кабінета по днях
-- ════════════════════════════════════════════════════════════
--  Заради вибору періоду на сторінці. У fb_accounts лежить лише
--  сьогодні — одне число, яке не відповідає на питання «а скільки
--  цей кабінет відкрутив минулого тижня».
--
--  День — у часовому поясі САМОГО кабінета, як і в звітах Facebook.
--
--  Кожен прогін переписує останні 30 днів. Це не марнотратство:
--  Facebook уточнює витрати заднім числом, і в базі має лежати
--  уточнена цифра, а не та, яку ми один раз побачили. Глибше за 30
--  днів записи просто лишаються — історія накопичується.
--
--  Дня без витрат тут немає зовсім: відсутній рядок і нуль читаються
--  однаково, а порожніх рядків було б більше, ніж даних.
-- ════════════════════════════════════════════════════════════

create table if not exists public.fb_spend_daily (
  created_by  uuid not null references auth.users(id) on delete cascade,
  account_id  text not null,
  day         date not null,

  spend       numeric,
  impressions bigint,
  clicks      bigint,

  currency    text,
  team_name   text,
  synced_at   timestamptz,

  primary key (created_by, account_id, day)
);

create index if not exists fb_spend_daily_day_idx
  on public.fb_spend_daily (created_by, day);

alter table public.fb_spend_daily enable row level security;

drop policy if exists "own_select" on public.fb_spend_daily;
create policy "own_select" on public.fb_spend_daily for select to authenticated
  using (created_by = auth.uid());

grant select on public.fb_spend_daily to authenticated;


-- ════════════════════════════════════════════════════════════
--  fb_cabinet_pages — з яких Сторінок крутять кабінети
-- ════════════════════════════════════════════════════════════
--  Номер Сторінки зашитий у кожному оголошенні
--  (effective_object_story_id має вигляд {page_id}_{post_id}), тож
--  імпорт бере його з тієї самої відповіді, що й статуси — окремих
--  запитів до Facebook це не коштує.
--
--  Рядок = пара «кабінет + Сторінка». Одна Сторінка на десять
--  кабінетів видно тільки згори, а саме це й важливо: бан такої
--  Сторінки забирає всі десять одразу.
--
--  can_moderate — чи має системний користувач цю Сторінку із задачею
--  модерації. false тут не помилка: крутити з чужої Сторінки можна,
--  а чистити під нею коментарі — ні.
-- ════════════════════════════════════════════════════════════

create table if not exists public.fb_cabinet_pages (
  created_by uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  page_id    text not null,

  page_name    text,      -- порожньо, якщо Сторінки не видно системному юзеру
  can_moderate boolean,

  ads   int,              -- скільки оголошень кабінета ведуть на цю Сторінку
  posts int,              -- скільки РІЗНИХ постів: один пост часто крутять кілька

  team_name text,
  seen_at   timestamptz,

  primary key (created_by, account_id, page_id)
);

create index if not exists fb_cabinet_pages_page_idx
  on public.fb_cabinet_pages (created_by, page_id);

alter table public.fb_cabinet_pages enable row level security;

drop policy if exists "own_select" on public.fb_cabinet_pages;
create policy "own_select" on public.fb_cabinet_pages for select to authenticated
  using (created_by = auth.uid());

grant select on public.fb_cabinet_pages to authenticated;


-- ────────────────────────────────────────────────────────────
--  ЗВ'ЯЗОК ІЗ ВАШОЮ НАЗВОЮ КАБІНЕТА
--  Сторінка зводить їх сама — по збігу номера або назви. Колонка
--  потрібна, коли не звелось: тоді в панелі кабінета зʼявляється
--  список «Facebook cabinet» і вибір запамʼятовується сюди.
-- ────────────────────────────────────────────────────────────

alter table public.accounts_mapping
  add column if not exists fb_account_id text;


-- ════════════════════════════════════════════════════════════
--  ПЕРЕВІРКА після першого прогону
--
--    select account_id, name, status, spend_today,
--           campaigns_on, campaigns_active, card, synced_at
--      from public.fb_accounts
--     order by spend_today desc nulls last;
--
--  Порожньо — імпорт ще не ходив: Cabinets → Sync now.
--  spend_today скрізь null — або сьогодні не крутили, або токену
--  бракує ads_read (видно у fb_tokens.status).
--
--  Історія по днях:
--
--    select day, sum(spend) from public.fb_spend_daily
--     group by day order by day desc;
-- ════════════════════════════════════════════════════════════
