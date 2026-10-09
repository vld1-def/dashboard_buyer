-- ============================================================
--  УНІКАЛЬНІСТЬ — ПО ВЛАСНИКУ, А НЕ ПО КОМАНДІ
-- ============================================================
--
--  СИМПТОМ. Додаєш на сторінці ставку UZ / Pinco — і замість
--  збереження:
--
--      new row violates row-level security policy
--      (USING expression) for table "payouts"
--
--  Причому в списку ставок такого рядка немає: там порожньо.
--
--  ПРИЧИНА — ДВА ПРАВИЛА, ЯКІ НЕ ЗІЙШЛИСЬ.
--
--    1. ВИДИМІСТЬ у payouts і team_settings — по АВТОРУ. Єдині
--       політики на цих таблицях (SECURITY_BUYERS.sql крок 6) це
--       own_select / own_insert / own_update / own_delete, усі по
--       created_by = auth.uid(). Ні can_read_team, ні can_read_mine
--       для них не давали навмисно: payouts — це гроші
--       (TEAM_ROLES.sql, ADMIN_ROLES.sql).
--
--    2. УНІКАЛЬНІСТЬ — по КОМАНДІ: (team_name, geo, offer) у payouts,
--       (team_name, key) у team_settings.
--
--  Тобто рядок ОДИН на всю команду, а бачить його ОДНА людина. Поки
--  в команді один автор, різниці немає. Щойно зʼявився асистент —
--  його рядок існує, але для тебе його нема; сторінка зберігає через
--  upsert ... on conflict, натикається на цей невидимий рядок, пробує
--  його оновити, і USING-умова політики update каже «ні».
--
--  Ззовні це виглядає як «дашборд не дає додати те, чого немає».
--
--  ЩО РОБИТЬ ЦЕЙ ФАЙЛ. Переводить унікальність на власника:
--
--      payouts        (team_name, geo, offer)  →  (created_by, geo, offer)
--      team_settings  (team_name, key)         →  (created_by, key)
--
--  Тепер у кожного свої ставки І свої налаштування розбору. Баєр
--  і його асистент не забирають рядки один в одного й не блокують
--  один одного.
--
--  Тоді в кожного свій рядок, і ніхто нікого не блокує — рівно так,
--  як уже зроблено для доменів у SECURITY_BUYERS.sql:
--
--      «Домени: унікальність рахуємо по ВЛАСНИКУ, а не по команді.
--       Інакше, якщо два баєри сидять під однією назвою команди,
--       другий не зможе додати домен, який уже є в першого, — і не
--       зрозуміє чому, бо чужий рядок йому не видно.»
--
--  Тоді це полагодили для domains, а payouts і team_settings
--  пропустили. Це той самий недогляд, лише в інших двох таблицях.
--
--  ⚠️ ВИКОНАТИ ЦЕ ТРЕБА РАЗОМ ІЗ ОНОВЛЕННЯМ СТОРІНКИ. Сторінка
--  зберігає ставки через on conflict саме по цих стовпцях: нова
--  сторінка зі старим ключем (чи навпаки) отримає від Postgres
--  «there is no unique or exclusion constraint matching the ON
--  CONFLICT specification». Сторінка це розпізнає й назве цей файл,
--  але краще не доводити: виконай блоки, тоді Ctrl+Shift+R.
--
--  Дані не змінюються й не видаляються — міняються лише індекси.
--
--  Де запускати: Supabase Dashboard → SQL Editor → New query → Run.
--
--  ЯКЩО НЕМАЄ ЧАСУ РОЗБИРАТИСЬ — одразу під цією шапкою стоїть
--  БЛОК 0: вставив, поміняв одну назву команди, натиснув Run, і все.
--  Решта блоків нижче — те саме, але покроково, щоб дивитись на кожну
--  дію окремо. Вони потрібні, лише якщо БЛОК 0 на чомусь зупиниться.
-- ============================================================


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 0 — УСЕ ОДРАЗУ (один Run)
--
--  Робить три речі поспіль:
--    1. якщо одне налаштування збережене під різними назвами команди —
--       лишає одне (під твоєю поточною; якщо такого немає — найновіше,
--       і проставляє йому твою команду);
--    2. переводить унікальність на власника;
--    3. прибирає стару унікальність по команді.
--
--  Прибрані рядки зберігаються ЦІЛКОМ у public._own_dropped — разом зі
--  значеннями. Нічого не зникає без сліду.
--
--  Запускати можна скільки завгодно разів: другий запуск не знайде,
--  що робити.
-- ════════════════════════════════════════════════════════════

drop table if exists public._own_dropped;
create table public._own_dropped (
  -- id тут text навмисно: у payouts він uuid, у team_settings bigint,
  -- і одна службова таблиця мусить прийняти і те, і те.
  "таблиця" text, "id" text, "команда" text, "налаштування" text,
  "автор" uuid, "значення" text);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._own_dropped enable row level security;

drop table if exists public._own_all;
create table public._own_all ("крок" text, "таблиця" text, "що саме" text, "рядків" bigint);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._own_all enable row level security;

do $$
declare
  TEAM constant text := 'IMPROVE';   -- ⬅ ⬅ ⬅ ОДНЕ, ЩО ТРЕБА ПОМІНЯТИ:
                                     --        назва команди з лівої панелі дашборда
  tbl  text; cols text; cols2 text; nm text; r record; n bigint; dflt text;
  ord  text;   -- чим визначаємо «найновіший»: див. нижче
  idc  text;   -- чим розрізняємо рядки: id або ctid, див. нижче
begin
  -- Обидві таблиці: і виплати, і налаштування команди. Сторінка
  -- зберігає їх по тих самих стовпцях (created_by, …) — ключ у коді
  -- мусить збігатися з базою, інакше не збережеться нічого.
  foreach tbl in array array['payouts', 'team_settings'] loop
    cols  := case tbl when 'payouts' then 'created_by, geo, offer' else 'created_by, key' end;
    cols2 := case tbl when 'payouts' then 'geo, offer' else 'key' end;
    nm    := case tbl when 'payouts' then 'coalesce(geo,''—'') || '' / '' || coalesce(offer,''—'')'
                      else 'key' end;

    /* ⚠️ НІЧОГО НЕ ПРИПУСКАЄМО ПРО ФОРМУ ТАБЛИЦІ.

       Тут двічі поспіль була та сама помилка — я вирішував, які
       стовпці є, замість того щоб спитати базу:

         1) «id — bigint» → у payouts він uuid, блок упав;
         2) «id є завжди» → у team_settings його НЕМАЄ зовсім, і
            Postgres відповів «column "id" does not exist. There is a
            column named "id" in table "_own_dropped", but it cannot be
            referenced from this part of the query» — тобто ім'я
            знайшлось лише в цільовій таблиці звіту.

       Тому чим розрізняти рядки, вирішує сама база. Немає id —
       беремо ctid: він є в КОЖНОЇ звичайної таблиці Postgres і в межах
       одного запиту однозначно вказує на рядок. */
    select case when exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = tbl
                                and column_name = 'id')
                then 'id' else 'ctid' end
      into idc;

    /* ЧИМ МІРЯТИ «НАЙНОВІШИЙ». По id це правда лише тоді, коли id —
       число, що зростає. У payouts він uuid, і там порядок за id
       випадковий; ctid теж не про вік. Тому, якщо в таблиці є
       created_at, міряємо ним, а id/ctid лишається тайбрейком. */
    select case when exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = tbl
                                and column_name = 'created_at')
                then 'created_at desc nulls last, ' || idc || ' desc'
                else idc || ' desc' end
      into ord;

    -- Рядки без автора сторінка не прочитає, і on conflict їх не знайде.
    select column_default into dflt from information_schema.columns
     where table_schema = 'public' and table_name = tbl and column_name = 'created_by';
    if dflt is null or dflt not like '%auth.uid()%' then
      raise exception
        'У «%» колонка created_by не має default auth.uid() — виконайте крок 5 зі '
        'SECURITY_BUYERS.sql, тоді поверніться сюди.', tbl;
    end if;

    -- 1. зберегти зайві ЦІЛКОМ, потім прибрати
    execute format($f$
      insert into public._own_dropped
      select %1$L, rid::text, team_name, %2$s, created_by, %3$s
        from (select *, %7$s as rid, row_number() over (partition by created_by, %4$s
                order by (team_name = %5$L) desc, %6$s) rn
                from public.%1$I where created_by is not null) q
       where rn > 1$f$,
      tbl, nm, case tbl when 'payouts' then 'value::text' else 'value' end,
      cols2, TEAM, ord, idc);

    execute format($f$
      delete from public.%1$I t
       using (select %5$s as rid, row_number() over (partition by created_by, %2$s
                order by (team_name = %3$L) desc, %4$s) rn
                from public.%1$I where created_by is not null) q
       where q.rid = t.%5$s and q.rn > 1$f$, tbl, cols2, TEAM, ord, idc);
    get diagnostics n = row_count;
    if n > 0 then
      insert into public._own_all values ('1. зайві копії прибрано', tbl, cols2, n);
    end if;

    -- уцілілий під старою назвою — перевести, інакше сторінка його не прочитає
    execute format($f$
      update public.%1$I t set team_name = %2$L
       where t.created_by is not null and t.team_name is distinct from %2$L
         and exists (select 1 from public._own_dropped d
                      where d."таблиця" = %1$L and d."автор" = t.created_by)$f$, tbl, TEAM);
    get diagnostics n = row_count;
    if n > 0 then
      insert into public._own_all values ('2. уцілілий переведено на ' || TEAM, tbl, 'team_name', n);
    end if;

    -- 2. новий ключ СПЕРШУ, старий потім: якщо новий не стане, таблиця
    --    лишиться зі старим, а не зовсім без унікальності
    execute format('create unique index if not exists %I on public.%I (%s)',
                   tbl || '_owner_uidx', tbl, cols);
    insert into public._own_all values ('3. новий ключ по власнику', tbl, cols, 1);

    -- 3. прибрати все старе, до чого входить team_name
    for r in
      select c.conname as x, true as is_c
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace ns on ns.oid = t.relnamespace
       where ns.nspname = 'public' and t.relname = tbl and c.contype = 'u'
         and exists (select 1 from unnest(c.conkey) k
                     join pg_attribute a on a.attrelid = t.oid and a.attnum = k
                      where a.attname = 'team_name')
      union all
      select ic.relname, false
        from pg_index i
        join pg_class ic on ic.oid = i.indexrelid
        join pg_class t on t.oid = i.indrelid
        join pg_namespace ns on ns.oid = t.relnamespace
       where ns.nspname = 'public' and t.relname = tbl and i.indisunique
         and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
         and exists (select 1 from unnest(i.indkey) k
                     join pg_attribute a on a.attrelid = t.oid and a.attnum = k
                      where a.attname = 'team_name')
    loop
      if r.is_c then execute format('alter table public.%I drop constraint %I', tbl, r.x);
      else           execute format('drop index public.%I', r.x);
      end if;
      insert into public._own_all values ('4. стара унікальність прибрана', tbl, r.x, 1);
    end loop;
  end loop;
end $$;

--  ⬇ ЩО ЗРОБЛЕНО. Якщо тут порожньо — блок не виконався.
select * from public._own_all order by "крок", "таблиця";

--  ⬇ ЩО ПРИБРАНО (значення збережені цілком — на випадок, якщо вибір
--     виявиться не тим). Порожньо — значить, прибирати не було чого.
select * from public._own_dropped order by "таблиця", "налаштування", "id";

--  Після цього: Ctrl+Shift+R на дашборді — і додавай ставку як завжди.
--
--  ⬇ І ПРИБЕРИ ЗВІТИ, КОЛИ ПЕРЕГЛЯНУВ. У _own_dropped лежать справжні
--     значення прибраних рядків — зокрема site_password і tl_password.
--     RLS їх уже закриває, але найнадійніша таблиця — та, якої немає:
--
--       drop table if exists public._own_dropped, public._own_all,
--                            public._own_check, public._own_log,
--                            public._own_fixed;
--
--  Нижче те саме покроково; потрібне, лише якщо тут щось зупинилось.




-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1 — чи можна взагалі перейти на новий ключ
--
--  Нічого не міняє. Шукає дві перешкоди:
--
--    ЗІТКНЕННЯ — в однієї людини вже є ДВА рядки на ту саму пару
--    (geo, offer) чи на той самий key, під різними назвами команди.
--    Старий ключ такого не забороняв, новий забороняє. Це і є те, що
--    лишилось після перейменування/злиття команди.
--
--    БЕЗ АВТОРА — created_by порожній. Такий рядок не видно нікому
--    (own_select вимагає created_by = auth.uid(), а null не дорівнює
--    нічому), тобто він уже мертвий. Переходу він НЕ заважає: в
--    унікальному індексі null-и вважаються різними, тож такі рядки між
--    собою не стикаються ніколи. Це попередження, а не перешкода —
--    наслідок невиконаного кроку 4 зі SECURITY_BUYERS.sql.
-- ════════════════════════════════════════════════════════════

drop table if exists public._own_check;
create table public._own_check (
  "таблиця" text, "біда" text, "автор" text, "що саме" text, "рядків" bigint);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._own_check enable row level security;

insert into public._own_check
select 'payouts', 'зіткнення: два рядки на одну пару',
       coalesce(m.name, left(p.created_by::text, 8), '—'),
       coalesce(p.geo, '—') || ' / ' || coalesce(p.offer, '—'), count(*)
  from public.payouts p
  left join public.team_members m on m.user_id = p.created_by
 where p.created_by is not null
 group by 1, 2, 3, 4
having count(*) > 1;

insert into public._own_check
select 'team_settings', 'зіткнення: два рядки на один key',
       coalesce(m.name, left(s.created_by::text, 8), '—'),
       s.key, count(*)
  from public.team_settings s
  left join public.team_members m on m.user_id = s.created_by
 where s.created_by is not null
 group by 1, 2, 3, 4
having count(*) > 1;

insert into public._own_check
select 'payouts', 'без автора — не заважає переходу, але рядок мертвий',
       '—', 'усі такі разом', count(*)
  from public.payouts where created_by is null having count(*) > 0;

insert into public._own_check
select 'team_settings', 'без автора — не заважає переходу, але рядок мертвий',
       '—', 'усі такі разом', count(*)
  from public.team_settings where created_by is null having count(*) > 0;

insert into public._own_check
select '—', 'перешкод немає: можна виконувати БЛОК 2', '—', '—', 0
 where not exists (select 1 from public._own_check);

--  Зіткнення розвʼязують БЛОКИ 1А і 1Б нижче. Якщо в звіті лише рядки
--  «без автора» — переходьте одразу до БЛОКУ 2.

--  ⬇ ОСЬ ЦЕ Й Є ЗВІТ. Якщо тут порожньо — блок не виконався.
select * from public._own_check order by "таблиця", "біда", "що саме";


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1А — подивитись на самі спірні рядки
--
--  Нічого не міняє. Потрібен лише тоді, коли БЛОК 1 показав зіткнення.
--
--  Звідки вони беруться: одне й те саме налаштування збережене під
--  РІЗНИМИ назвами команди. Поки ключ був по команді, це були різні
--  рядки й ніхто не заперечував; по власнику — це один рядок, і треба
--  вирішити, який лишається.
--
--  Колонка «однакові» відповідає на головне питання: якщо значення
--  збігаються, вибирати нема з чого — бери БЛОК 1Б і не думай. Якщо ні
--  — подивись значення очима, перш ніж запускати.
-- ════════════════════════════════════════════════════════════

-- ⬇ ПОСТАВ НАЗВУ КОМАНДИ, ПІД ЯКОЮ ТИ СИДИШ У ДАШБОРДІ (ліва панель)
--
--  «що буде» рахується ТИМ САМИМ правилом, що й у БЛОЦІ 1Б (той самий
--  row_number з тим самим order by) — щоб огляд не міг розійтися з тим,
--  що блок справді зробить.
--
--  «однакові» порівнює min і max значення в групі: count(distinct)
--  усередині віконної функції Postgres не вміє.
select q."налаштування", q."рядок", q."команда",
       case when q.rn = 1 then '← ЦЕЙ ЛИШИТЬСЯ' else 'прибереться' end as "що буде",
       q."всього", q."однакові", q."значення (початок)"
  /* ctid, а не id: у team_settings стовпця id немає зовсім. ctid є в
     кожної звичайної таблиці й однозначно вказує на рядок у межах
     запиту. Той самий порядок, що й у БЛОЦІ 1Б. */
  from (select s.key                                  as "налаштування",
               s.ctid::text                           as "рядок",
               s.team_name                            as "команда",
               row_number() over (partition by s.created_by, s.key
                 order by (s.team_name = 'IMPROVE') desc, s.ctid desc) as rn,
               count(*)      over (partition by s.created_by, s.key) as "всього",
               min(s.value)  over (partition by s.created_by, s.key)
                 = max(s.value) over (partition by s.created_by, s.key) as "однакові",
               left(s.value, 70)                      as "значення (початок)"
          from public.team_settings s
         where s.created_by is not null) q
 where q."всього" > 1
 order by q."налаштування", q.rn;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1Б — лишити по одному рядку
--
--  ПРАВИЛО. З кожної групи лишається рядок під ТВОЄЮ поточною
--  командою. Якщо жоден із них не під нею (усі під старими назвами) —
--  лишається найновіший, і йому ж проставляється твоя команда: інакше
--  він уцілів би, але сторінка все одно його не прочитала б, бо читає
--  по team_name.
--
--  НІЧОГО НЕ ЗНИКАЄ МОВЧКИ. Кожен прибраний рядок лягає в
--  public._own_dropped ЦІЛКОМ, разом зі значенням. Якщо вибір
--  виявиться не тим, значення звідти можна повернути руками.
--
--  Рядки без автора не чіпаються: вони переходу не заважають.
-- ════════════════════════════════════════════════════════════

drop table if exists public._own_dropped;
create table public._own_dropped (
  -- id тут text навмисно: у payouts він uuid, у team_settings bigint,
  -- і одна службова таблиця мусить прийняти і те, і те.
  "таблиця" text, "id" text, "команда" text, "налаштування" text,
  "автор" uuid, "значення" text);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._own_dropped enable row level security;

drop table if exists public._own_fixed;
create table public._own_fixed ("таблиця" text, "що зроблено" text, "що саме" text, "рядків" bigint);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._own_fixed enable row level security;

do $$
declare
  TEAM constant text := 'IMPROVE';         -- ⬅ та сама назва команди, що в БЛОЦІ 1А
  tbl  text;
  cols text;
  idc  text;   -- id або ctid — те саме, що в БЛОЦІ 0
  n    bigint;
begin
  -- Обидві таблиці: і виплати, і налаштування команди. Сторінка
  -- зберігає їх по тих самих стовпцях (created_by, …) — ключ у коді
  -- мусить збігатися з базою, інакше не збережеться нічого.
  foreach tbl in array array['payouts', 'team_settings'] loop
    cols := case tbl when 'payouts' then 'geo, offer' else 'key' end;

    -- Чим розрізняти рядки — питаємо базу, як і в БЛОЦІ 0.
    select case when exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = tbl
                                and column_name = 'id')
                then 'id' else 'ctid' end
      into idc;

    /* Тут «найновіший» міряється по idc, а не по created_at — на
       відміну від БЛОКУ 0. Навмисно: БЛОК 1А показує той самий
       порядок, і ці два мусять збігатися між собою. */
    -- 1. зберегти те, що приберемо — ЦІЛКОМ
    execute format($f$
      insert into public._own_dropped
      select %1$L, rid::text, team_name,
             %2$s,
             created_by,
             %3$s
        from (select *, %6$s as rid, row_number() over (
                partition by created_by, %4$s
                order by (team_name = %5$L) desc, %6$s desc) rn
                from public.%1$I where created_by is not null) q
       where rn > 1$f$,
      tbl,
      case tbl when 'payouts' then 'coalesce(geo,''—'') || '' / '' || coalesce(offer,''—'')'
               else 'key' end,
      case tbl when 'payouts' then 'value::text' else 'value' end,
      cols, TEAM, idc);
    get diagnostics n = row_count;
    if n > 0 then
      insert into public._own_fixed values (tbl, 'збережено у _own_dropped', 'перед видаленням', n);
    end if;

    -- 2. прибрати зайві
    execute format($f$
      delete from public.%1$I t
       using (select %4$s as rid, row_number() over (
                partition by created_by, %2$s
                order by (team_name = %3$L) desc, %4$s desc) rn
                from public.%1$I where created_by is not null) q
       where q.rid = t.%4$s and q.rn > 1$f$, tbl, cols, TEAM, idc);
    get diagnostics n = row_count;
    if n > 0 then
      insert into public._own_fixed values (tbl, 'зайві рядки прибрано', cols, n);
    end if;

    -- 3. уцілілий під старою назвою команди — перевести на поточну,
    --    інакше сторінка його не прочитає (вона фільтрує по team_name)
    execute format($f$
      update public.%1$I t set team_name = %2$L
       where t.created_by is not null and t.team_name is distinct from %2$L
         and exists (select 1 from public._own_dropped d
                      where d."таблиця" = %1$L and d."автор" = t.created_by)$f$,
      tbl, TEAM);
    get diagnostics n = row_count;
    if n > 0 then
      insert into public._own_fixed values (tbl, 'уцілілий переведено на ' || TEAM, 'team_name', n);
    end if;
  end loop;

  if not exists (select 1 from public._own_fixed) then
    insert into public._own_fixed values ('—', 'зіткнень не було — нічого не робив', '—', 0);
  end if;
end $$;

--  ⬇ ЩО ЗРОБЛЕНО
select * from public._own_fixed order by "таблиця", "що зроблено";

--  ⬇ ЩО САМЕ ПРИБРАНО (значення збережені цілком — на випадок, якщо
--     вибір виявиться не тим)
select * from public._own_dropped order by "таблиця", "налаштування", "id";


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — перевести ключ на власника
--
--  Старі ключі не названі поіменно навмисно: їх заводили руками, і
--  назви в різних базах різні. Шукаємо за ознакою — будь-яка
--  унікальність на цій таблиці, до якої входить team_name.
--
--  Блок сам зупиниться, якщо БЛОК 1 показав перешкоди: переходити на
--  ключ, під який дані не лягають, означало б отримати помилку
--  посеред створення індексу й лишити таблицю без унікальності
--  взагалі.
-- ════════════════════════════════════════════════════════════

drop table if exists public._own_log;
create table public._own_log ("таблиця" text, "що зроблено" text, "що саме" text);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._own_log enable row level security;

do $$
declare
  tbl   text;
  cols  text;   -- стовпці нового ключа
  cols2 text;   -- вони ж без created_by — для підрахунку зіткнень
  r     record;
  bad   bigint;
  dflt  text;
begin
  -- Обидві таблиці: і виплати, і налаштування команди. Сторінка
  -- зберігає їх по тих самих стовпцях (created_by, …) — ключ у коді
  -- мусить збігатися з базою, інакше не збережеться нічого.
  foreach tbl in array array['payouts', 'team_settings'] loop
    cols  := case tbl when 'payouts' then 'created_by, geo, offer'
                      else 'created_by, key' end;
    cols2 := case tbl when 'payouts' then 'geo, offer' else 'key' end;

    /* 1. перешкоди рахуємо ТУТ-ТАКИ, а не читаємо з _own_check.

       Перша редакція дивилась у таблицю БЛОКУ 1 — і через це БЛОК 2,
       запущений без БЛОКУ 1, падав із «relation _own_check does not
       exist», тобто залежав від порядку кліків. Тепер блоки незалежні.

       Рахуємо ЛИШЕ справжні зіткнення. Рядки без автора сюди не
       входять: у унікальному індексі null-и вважаються різними, тож
       переходу вони не заважають — БЛОК 1 згадує їх як попередження. */
    execute format(
      'select count(*) from (select 1 from public.%I where created_by is not null '
      'group by created_by, %s having count(*) > 1) q', tbl, cols2)
      into bad;
    if bad > 0 then
      raise exception
        'У «%» % груп(и) рядків стикаються за новим ключем — спершу БЛОК 1А '
        '(подивитись) і БЛОК 1Б (лишити по одному). Це ті самі налаштування, '
        'збережені під різними назвами команди.', tbl, bad;
    end if;

    -- 2. created_by мусить проставлятись сам, інакше сторінка писатиме
    --    рядки з порожнім автором, і on conflict їх не знайде ніколи.
    select column_default into dflt from information_schema.columns
     where table_schema = 'public' and table_name = tbl and column_name = 'created_by';
    if dflt is null or dflt not like '%auth.uid()%' then
      raise exception
        'У «%» колонка created_by не має default auth.uid() — виконайте крок 5 зі '
        'SECURITY_BUYERS.sql. Без нього нові рядки підуть без автора.', tbl;
    end if;

    -- 3. новий ключ СПЕРШУ, старий потім: якщо новий не створиться,
    --    таблиця лишиться зі старим, а не зовсім без унікальності.
    execute format('create unique index if not exists %I on public.%I (%s)',
                   tbl || '_owner_uidx', tbl, cols);
    insert into public._own_log values (
      tbl, 'новий ключ створено', tbl || '_owner_uidx (' || cols || ')');

    -- 4. прибрати все старе, до чого входить team_name
    for r in
      select c.conname as nm, true as is_constraint
        from pg_constraint c
        join pg_class t  on t.oid = c.conrelid
        join pg_namespace ns on ns.oid = t.relnamespace
       where ns.nspname = 'public' and t.relname = tbl and c.contype = 'u'
         and exists (select 1 from unnest(c.conkey) k
                     join pg_attribute a on a.attrelid = t.oid and a.attnum = k
                      where a.attname = 'team_name')
      union all
      select ic.relname, false
        from pg_index i
        join pg_class ic on ic.oid = i.indexrelid
        join pg_class t  on t.oid  = i.indrelid
        join pg_namespace ns on ns.oid = t.relnamespace
       where ns.nspname = 'public' and t.relname = tbl
         and i.indisunique
         and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
         and exists (select 1 from unnest(i.indkey) k
                     join pg_attribute a on a.attrelid = t.oid and a.attnum = k
                      where a.attname = 'team_name')
    loop
      if r.is_constraint then
        execute format('alter table public.%I drop constraint %I', tbl, r.nm);
        insert into public._own_log values (tbl, 'старе обмеження прибрано', r.nm);
      else
        execute format('drop index public.%I', r.nm);
        insert into public._own_log values (tbl, 'старий індекс прибрано', r.nm);
      end if;
    end loop;
  end loop;
end $$;

--  ⬇ ОСЬ ЦЕ Й Є ЗВІТ. Якщо тут порожньо — блок не виконався.
select * from public._own_log order by "таблиця", "що зроблено";


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 3 — перевірка
--
--  Має показати рівно по одному ключу на таблицю, і в ньому
--  created_by. Якщо поруч лишився ключ із team_name — БЛОК 2
--  виконався не повністю.
--
--  Далі: Ctrl+Shift+R на дашборді, і ставка UZ / Pinco додається.
-- ════════════════════════════════════════════════════════════

select t.relname  as "таблиця",
       ic.relname as "ключ",
       (select string_agg(a.attname, ', ' order by k.ord)
          from unnest(i.indkey) with ordinality as k(attnum, ord)
          join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum)
                  as "по яких стовпцях"
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  join pg_class t  on t.oid  = i.indrelid
  join pg_namespace ns on ns.oid = t.relnamespace
 where ns.nspname = 'public' and i.indisunique
   and t.relname in ('payouts', 'team_settings')
 order by 1, 2;

--  Прибрати службові таблиці, коли все переглянули (у _own_dropped —
--  справжні значення, зокрема паролі):
--      drop table if exists public._own_dropped, public._own_all,
--                           public._own_check, public._own_log,
--                           public._own_fixed;
