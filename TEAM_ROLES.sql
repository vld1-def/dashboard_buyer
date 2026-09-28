-- ════════════════════════════════════════════════════════════
--  РОЛІ: АДМІН, ТІМЛІД, БАЄР
-- ════════════════════════════════════════════════════════════
--
--  ЯК КОРИСТУВАТИСЬ ЦИМ ФАЙЛОМ
--  Це не один скрипт, який виконують цілком. Це блоки, які виконують
--  ПО ЧЕРЗІ в Supabase → SQL Editor: скопіювали блок, натиснули Run,
--  подивились результат, перейшли до наступного.
--
--  ЩО ЦЕ МІНЯЄ
--  Досі модель була одна: «бачиш тільки те, що створив сам»
--  (SECURITY_BUYERS.sql). Для баєра це правильно й лишається як є.
--  Але тімліду потрібно бачити свою команду цілком, а адміну — усі
--  команди, в яких він працював.
--
--  У SECURITY_BUYERS.sql це й було передбачено: «тімліда поки немає —
--  коли знадобиться, додамо роль окремо, нічого з написаного там
--  переробляти не доведеться». Оце воно й є: ми нічого не переписуємо,
--  а ДОДАЄМО другу політику на читання. Політики складаються через
--  АБО, тож стара «своє» лишається чинною, а нова дозволяє ще й
--  командне — рівно тим, кому належить.
--
--  ЧОГО ЦЕ НЕ РОБИТЬ. Тімлід не отримує права щось міняти: жодного
--  insert, update чи delete тут немає й не буде. Він аналізує, а в
--  роботу баєра не втручається — це рішення, а не недогляд.
--
--  ⚠️ СТАРЕ ПОСИЛАННЯ ?view=teamlead ЦИМ НЕ ЛІКУЄТЬСЯ І НЕ МАЄ.
--  Воно працювало на публічному читанні, якого після SECURITY_BUYERS
--  не лишається, і давало доступ спільним паролем в адресі — одним на
--  всіх, назавжди. Тімлід тепер заходить власним логіном, як усі.
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1 — хто є хто
--
--  Один рядок на людину. Без цієї таблиці дашборд не може навіть
--  підписати рядок іменем: auth.users із браузера не читається, і
--  розріз «по баєрах» показував би голі uuid.
--
--  role:
--    buyer — типово. Бачить тільки своє, як і раніше.
--    lead  — бачить свою команду цілком. ТІЛЬКИ читає.
--    admin — бачить усі команди. Теж тільки читає чуже; своє —
--            як звичайний баєр.
--
--  team_name у ліда — та сама назва, що в даних (наприклад IMPROVE).
--  В адміна вона ні на що не впливає: він бачить усі.
-- ════════════════════════════════════════════════════════════

create table if not exists public.team_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  team_name  text,
  -- Як підписувати людину на екрані. Порожньо — покажемо пошту.
  name       text,
  role       text not null default 'buyer',
  created_at timestamptz not null default now()
);

--  ⚠️ ТАБЛИЦЯ МОГЛА ІСНУВАТИ РАНІШЕ. create table if not exists у такому
--  разі НІЧОГО не робить — і колонок не додає. Саме так і сталось:
--  «column "name" of relation "team_members" does not exist».
--
--  Тому далі колонки додаються поіменно, як це зроблено і в FB_SYNC.sql.
--  Виконати можна і на новій таблиці, і на вже наявній: повторний
--  add column if not exists Postgres не турбує.

alter table public.team_members
  add column if not exists user_id    uuid references auth.users(id) on delete cascade,
  add column if not exists team_name  text,
  add column if not exists name       text,
  add column if not exists role       text,
  add column if not exists created_at timestamptz not null default now();

--  Роль без значення читається як «ніхто»: краще одразу зробити з неї
--  звичайного баєра, ніж лишити null і гадати.
update public.team_members set role = 'buyer' where role is null;
alter table public.team_members alter column role set default 'buyer';

--  on conflict (user_id) нижче вимагає унікальності саме по user_id. У
--  нової таблиці це первинний ключ, у старої могло бути інакше — тому
--  індекс створюємо окремо. Якщо ключ уже такий, зайвим це не буде.
create unique index if not exists team_members_user_uidx on public.team_members (user_id);

--  Обмеження додаємо як not valid: старі рядки могли мати будь-що в
--  role, і перевіряти їх заднім числом означало б впасти на тому, чого
--  ми не писали. Нові рядки воно перевіряє повністю.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'team_members_role_ok') then
    alter table public.team_members
      add constraint team_members_role_ok check (role in ('buyer', 'lead', 'admin')) not valid;
  end if;
end $$;

create index if not exists team_members_team_idx on public.team_members (team_name);

alter table public.team_members enable row level security;

--  Подивитись, що вийшло. Якщо таблиця вже була чиясь — тут це й буде
--  видно, до того як щось у неї писати.
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'team_members'
--  order by ordinal_position;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — хто я такий
--
--  Дві функції, якими користуються всі політики нижче.
--
--  security definer тут ОБОВ'ЯЗКОВО, і ось чому: політика на
--  team_members питатиме my_role(), а my_role() читає team_members.
--  Звичайна функція впала б у нескінченну рекурсію. З definer вона
--  виконується правами власника й політик не проходить — рекурсії
--  немає.
--
--  set search_path = public — щоб функцію не можна було обдурити,
--  підсунувши свою схему з таблицею team_members.
-- ════════════════════════════════════════════════════════════

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.team_members where user_id = auth.uid()), 'buyer');
$$;

create or replace function public.my_team()
returns text language sql stable security definer set search_path = public as $$
  select (select team_name from public.team_members where user_id = auth.uid());
$$;

/*  Головний вимикач. Повертає true, якщо мені дозволено читати чужий
    рядок цієї команди.

    Адмін — будь-яку команду. Тімлід — рівно свою. Баєр — ніколи:
    йому лишається стара політика «своє», і вона нікуди не ділась.   */
create or replace function public.can_read_team(row_team text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.my_role()
           when 'admin' then true
           when 'lead'  then row_team is not distinct from public.my_team()
           else false
         end;
$$;

grant execute on function public.my_role(), public.my_team(),
                         public.can_read_team(text) to authenticated;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 3 — свій рядок видно завжди, команду — кому належить
--
--  Без першої політики людина не побачить навіть власного імені, а
--  без другої тімлід не зможе підписати рядки іменами баєрів.
-- ════════════════════════════════════════════════════════════

drop policy if exists team_members_read_self on public.team_members;
create policy team_members_read_self on public.team_members
  for select using (user_id = auth.uid());

drop policy if exists team_members_read_team on public.team_members;
create policy team_members_read_team on public.team_members
  for select using (public.can_read_team(team_name));


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 4 — читання командних даних
--
--  Додаємо ОДНУ політику на читання до кожної таблиці, де є
--  team_name. Стара політика «своє» лишається: політики складаються
--  через АБО, тож баєр нічого не втрачає й нічого нового не бачить.
--
--  Тут навмисно НЕМАЄ payouts, expenses і bonus_tiers: тімліду вони не
--  потрібні, а видане один раз зайве право потім не забереш непомітно.
--  Знадобиться — додасте назву в список і виконаєте блок ще раз.
--
--  fb_tokens тут немає й не буде НІКОЛИ: сам токен закритий навіть від
--  власника, і роль цього не міняє.
-- ════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'daily_stats', 'creatives_stats', 'daily_reports', 'tasks',
    'accounts_mapping', 'funnels_mapping', 'change_log', 'account_events',
    'domains', 'fb_accounts', 'fb_ad_today', 'fb_rule_log'
  ]
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('drop policy if exists %I on public.%I', t || '_read_team', t);
      execute format(
        'create policy %I on public.%I for select using (public.can_read_team(team_name))',
        t || '_read_team', t);
    end if;
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 5 — завести себе адміном
--
--  Підставте свій uuid (де взяти — КРОК 1 у SECURITY_BUYERS.sql:
--  select id, email from auth.users order by created_at).
--
--  Поки цього рядка немає, ви звичайний баєр: my_role() типово
--  повертає 'buyer'. Це навмисно — права з'являються тільки тоді,
--  коли їх видали явно.
-- ════════════════════════════════════════════════════════════

-- insert into public.team_members (user_id, team_name, name, role)
-- values ('ВАШ-UUID-СЮДИ', 'IMPROVE', 'Влад', 'admin')
-- on conflict (user_id) do update
--   set role = excluded.role, name = excluded.name, team_name = excluded.team_name;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 6 — завести тімліда і баєрів
--
--  ⚠️ ЦЕЙ БЛОК НЕ ОБОВ'ЯЗКОВИЙ, І ЙОГО МОЖНА ВІДКЛАСТИ. Тімліда ще
--  немає? Пропустіть його зовсім. Сторінка Team працює вже після блоку
--  5: адмін бачить усі команди, тож подивитись на неї й перевірити
--  цифри можна своїм логіном, без жодного тімліда.
--
--  Коли людина з'явиться — повернетесь сюди й додасте один рядок. Нічого
--  переробляти не доведеться: роль — це просто рядок у таблиці.
--
--  БАЄРІВ варто додати вже зараз, якщо їхні акаунти є: без цих рядків
--  сторінка не знає імен і показує уривок uuid. На доступ це не впливає
--  (баєр і так бачить своє) — лише на підпис у таблиці.
--
--  Тімлід прив'язаний до ОДНІЄЇ команди: team_name у нього має точно
--  збігатися з тим, що стоїть у даних (IMPROVE — не improve і не
--  «Improve»). Не збігеться — він побачить порожньо, і це буде схоже
--  на поломку, хоч це одруківка.
--
--  Баєрів заводити не обов'язково: без рядка людина й так бачить своє.
--  Але варто — інакше в таблиці тімліда замість імені стоятиме uuid.
--
--  ⚠️ ЩО САМЕ ЗА UUID. Це id КОРИСТУВАЧА з auth.users — тієї людини,
--  яка заходитиме в дашборд своїм логіном. Не номер кабінета, не
--  команда і не ваш власний id.
--
--  Немає ще акаунта? У дашборді реєстрації немає, тільки вхід — тож
--  користувача створюють у Supabase: Authentication → Users → Add user
--  (пошта й пароль). Після цього він з'явиться в auth.users.
--
--  ЗРУЧНІШЕ — ЗА ПОШТОЮ, а не копіюванням uuid: варто переставити один
--  символ, і рядок мовчки ляже на неіснуючого користувача. Варіант
--  нижче сам знаходить id за поштою, а якщо пошти немає в auth.users —
--  просто нічого не вставить, і це одразу видно по «0 rows».
-- ════════════════════════════════════════════════════════════

--  ▸ ВАРІАНТ 1 — за поштою (рекомендую)

-- insert into public.team_members (user_id, team_name, name, role)
-- select u.id, v.team_name, v.name, v.role
--   from auth.users u
--   join (values
--     ('lead@example.com',   'IMPROVE', 'Ім''я',  'lead'),
--     ('buyer1@example.com', 'IMPROVE', 'Олег',  'buyer'),
--     ('buyer2@example.com', 'IMPROVE', 'Ірина', 'buyer')
--   ) as v(email, team_name, name, role) on lower(u.email) = lower(v.email)
-- on conflict (user_id) do update
--   set role = excluded.role, name = excluded.name, team_name = excluded.team_name;

--  Перевірити, що всіх знайшло: скільки рядків — стільки й людей.
-- select tm.role, tm.name, tm.team_name, u.email
--   from public.team_members tm join auth.users u on u.id = tm.user_id
--  order by tm.role, tm.name;


--  ▸ ВАРІАНТ 2 — якщо все-таки хочете вручну.
--     Де взяти: select id, email from auth.users order by created_at;

-- insert into public.team_members (user_id, team_name, name, role) values
--   ('UUID-ТІМЛІДА', 'IMPROVE', 'Ім''я',  'lead'),
--   ('UUID-БАЄРА-1', 'IMPROVE', 'Олег',  'buyer'),
--   ('UUID-БАЄРА-2', 'IMPROVE', 'Ірина', 'buyer')
-- on conflict (user_id) do update
--   set role = excluded.role, name = excluded.name, team_name = excluded.team_name;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 7 — перевірка
--
--  ⚠️ НЕ ПЕРЕВІРЯЙТЕ РОЛЬ ЧЕРЕЗ my_role() ТУТ. У SQL Editor немає
--  залогіненого користувача: auth.uid() там порожній, тож my_role()
--  чесно поверне 'buyer' навіть адміну. Це не поломка ролей — це інше
--  місце виконання. Роль перевіряється в браузері, під логіном.
--
--  Тому тут дивимось не на роль, а на те, що ЛЕЖИТЬ у таблицях.
-- ════════════════════════════════════════════════════════════

--  ▸ 1. Кого завели і з якою роллю.
--     Немає рядка — людина лишається звичайним баєром.

-- select tm.role, tm.name, tm.team_name, u.email
--   from public.team_members tm join auth.users u on u.id = tm.user_id
--  order by tm.role, tm.name;


--  ▸ 2. Чи збігається назва команди тімліда з тією, що в даних.
--     Найчастіша причина порожньої сторінки — саме тут: «Improve»
--     проти «IMPROVE» база вважає різними командами, і мовчки.

-- select team_name, count(*) as rows from public.daily_stats
--  group by team_name order by rows desc;


--  ▸ 3. Чи підписані рядки авторами.
--     created_by = null означає, що КРОК 3 із SECURITY_BUYERS.sql ще
--     не виконано. Сторінка тімліда тоді не розкладе дані по людях —
--     і прямо про це скаже жовтою смугою, а не намалює одного
--     «невідомого баєра».

-- select created_by, team_name, count(*) as rows, round(sum(spend)::numeric, 2) as spend
--   from public.daily_stats
--  group by created_by, team_name
--  order by spend desc nulls last;
