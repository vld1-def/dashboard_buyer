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
--  зберігає через on conflict саме по цих стовпцях: нова сторінка зі
--  старим ключем (чи навпаки) отримає від Postgres
--  «there is no unique or exclusion constraint matching the ON
--  CONFLICT specification». Сторінка це розпізнає й назве цей файл,
--  але краще не доводити: виконай блоки, тоді Ctrl+Shift+R.
--
--  Дані не змінюються й не видаляються — міняються лише індекси.
--
--  Де запускати: Supabase Dashboard → SQL Editor → New query → Run.
--  Блоки по одному, згори вниз.
-- ============================================================


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
--    нічому), тобто він уже мертвий, і новий ключ його не впорядкує.
--    Це наслідок невиконаного кроку 4 зі SECURITY_BUYERS.sql.
-- ════════════════════════════════════════════════════════════

drop table if exists public._own_check;
create table public._own_check (
  "таблиця" text, "біда" text, "автор" text, "що саме" text, "рядків" bigint);

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
select 'payouts', 'без автора — рядок не видно нікому', '—', 'усі такі разом', count(*)
  from public.payouts where created_by is null having count(*) > 0;

insert into public._own_check
select 'team_settings', 'без автора — рядок не видно нікому', '—', 'усі такі разом', count(*)
  from public.team_settings where created_by is null having count(*) > 0;

insert into public._own_check
select '—', 'перешкод немає: можна виконувати БЛОК 2', '—', '—', 0
 where not exists (select 1 from public._own_check);

--  ⬇ ОСЬ ЦЕ Й Є ЗВІТ. Якщо тут порожньо — блок не виконався.
select * from public._own_check order by "таблиця", "біда", "що саме";


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

do $$
declare
  tbl   text;
  cols  text;
  r     record;
  bad   bigint;
  dflt  text;
begin
  foreach tbl in array array['payouts', 'team_settings'] loop
    cols := case tbl when 'payouts' then 'created_by, geo, offer'
                     else 'created_by, key' end;

    -- 1. перешкоди з БЛОКУ 1
    execute format(
      'select count(*) from public._own_check where "таблиця" = %L and "рядків" > 0', tbl)
      into bad;
    if bad > 0 then
      raise exception
        'У таблиці «%» є % перешкод(и) з БЛОКУ 1 — спершу розберіться з ними, '
        'інакше новий ключ не створиться. Зіткнення: лишити один рядок із двох. '
        'Без автора: проставити created_by або видалити рядок.', tbl, bad;
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

--  Прибрати службові таблиці, коли все переглянули:
--      drop table if exists public._own_check, public._own_log;
