-- ============================================================
--  КІЛЬКА БАЄРІВ В ОДНІЙ БАЗІ — КОЖЕН БАЧИТЬ ЛИШЕ СВОЄ
-- ============================================================
--
--  Модель проста: у кожного рядка є автор (created_by). Бачиш,
--  редагуєш і видаляєш тільки те, що створив сам. Новий баєр
--  заходить у порожній дашборд і налаштовує його під себе.
--
--  Тімліда поки немає — коли знадобиться, додамо роль окремо,
--  нічого з написаного тут переробляти не доведеться.
--
--  ⚠️ ГОЛОВНЕ, ЩО МОЖЕ ПІТИ НЕ ТАК
--  Якщо увімкнути RLS ДО того, як заповнено created_by, усі старі
--  рядки стануть невидимі ВСІМ, включно з вами. Дані нікуди не
--  подінуться, але дашборд буде порожній. Тому кроки строго по
--  порядку, і крок 4 (перевірка) пропускати не можна.
--
--  Жоден запит нижче нічого НЕ видаляє. Тільки додає колонки,
--  заповнює порожні значення й створює політики.
--
--  Де запускати: Supabase Dashboard → SQL Editor → New query → Run.
-- ============================================================


-- ════════════════════════════════════════════════════════════
--  КРОК 1. Дізнатись свій uuid
-- ════════════════════════════════════════════════════════════
--  Запустіть окремо і скопіюйте id свого рядка.

select id, email, created_at from auth.users order by created_at;

--  Далі підставляйте його замість ВАШ-UUID-СЮДИ.
--  Виглядає приблизно так: 3f6c1a94-8b2e-4d77-9a01-5e8c2f3b7d10


-- ════════════════════════════════════════════════════════════
--  КРОК 2. Додати колонку автора в усі таблиці
-- ════════════════════════════════════════════════════════════
--  Поки що БЕЗ not null і БЕЗ default: спершу треба заповнити
--  старі рядки, інакше кроки поб'ються один об одного.

do $$
declare t text;
begin
  foreach t in array array[
    'daily_stats','creatives_stats','payouts','expenses',
    'tasks','daily_reports','team_settings','quick_links',
    'change_log','accounts_mapping','funnels_mapping',
    'bonus_tiers','sync_logs','account_events','domains'
  ]
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format(
        'alter table public.%I add column if not exists created_by uuid '
        'references auth.users(id) on delete set null;', t);
    end if;
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════
--  КРОК 3. Записати всі старі дані на себе
-- ════════════════════════════════════════════════════════════
--  Ось ті самі команди. Замініть ВАШ-UUID-СЮДИ на свій id з кроку 1
--  (зручно: Ctrl+H у редакторі) і запустіть усе разом.
--
--  ЧОМУ ЦЕ БЕЗПЕЧНО. У кожного рядка є "where created_by is null" —
--  запит чіпає ЛИШЕ рядки, у яких автора ще немає. Уже підписані не
--  перезаписуються. Нічого не видаляється, нічого не створюється:
--  тільки заповнюється порожня колонка. Запускати можна скільки
--  завгодно разів — другий запуск просто не знайде що робити.

update public.daily_stats      set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.creatives_stats  set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.payouts          set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.expenses         set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.tasks            set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.daily_reports    set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.team_settings    set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.quick_links      set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.change_log       set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.accounts_mapping set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.funnels_mapping  set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.account_events   set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
update public.domains          set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;

--  Якщо якоїсь таблиці у вас немає — цей рядок дасть помилку
--  "relation does not exist". Просто заберіть його й запустіть решту.
--  Те саме для bonus_tiers і sync_logs, якщо вони у вас є:
--
--    update public.bonus_tiers set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;
--    update public.sync_logs   set created_by = 'ВАШ-UUID-СЮДИ' where created_by is null;


-- ════════════════════════════════════════════════════════════
--  КРОК 4. ПЕРЕВІРКА. Не пропускати.
-- ════════════════════════════════════════════════════════════
--  Має повернути 0 в кожному рядку. Якщо десь не 0 — далі НЕ ЙТИ,
--  повернутись на крок 3 і розібратись, чому та таблиця лишилась
--  без автора.

select 'daily_stats'      t, count(*) без_автора from public.daily_stats      where created_by is null
union all select 'creatives_stats',  count(*) from public.creatives_stats  where created_by is null
union all select 'payouts',          count(*) from public.payouts          where created_by is null
union all select 'expenses',         count(*) from public.expenses         where created_by is null
union all select 'tasks',            count(*) from public.tasks            where created_by is null
union all select 'daily_reports',    count(*) from public.daily_reports    where created_by is null
union all select 'team_settings',    count(*) from public.team_settings    where created_by is null
union all select 'quick_links',      count(*) from public.quick_links      where created_by is null
union all select 'change_log',       count(*) from public.change_log       where created_by is null
union all select 'accounts_mapping', count(*) from public.accounts_mapping where created_by is null
union all select 'funnels_mapping',  count(*) from public.funnels_mapping  where created_by is null
union all select 'account_events',   count(*) from public.account_events   where created_by is null
union all select 'domains',          count(*) from public.domains          where created_by is null;


-- ════════════════════════════════════════════════════════════
--  КРОК 5. Автор проставляється сам
-- ════════════════════════════════════════════════════════════
--  default auth.uid() означає, що база сама підписує кожен новий
--  рядок тим, хто його вставив. У дашборді та Form.html не треба
--  міняти ЖОДНОГО рядка коду — вони просто не надсилають цю
--  колонку, і база підставляє її сама.

do $$
declare t text;
begin
  foreach t in array array[
    'daily_stats','creatives_stats','payouts','expenses',
    'tasks','daily_reports','team_settings','quick_links',
    'change_log','accounts_mapping','funnels_mapping',
    'bonus_tiers','sync_logs','account_events','domains'
  ]
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('alter table public.%I alter column created_by set default auth.uid();', t);
      execute format('create index if not exists %I on public.%I (created_by);',
                     t || '_created_by_idx', t);
    end if;
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════
--  КРОК 6. Політики
-- ════════════════════════════════════════════════════════════
--  Лише для authenticated. anon (не залогінений) не отримує нічого:
--  публічний ключ зі сторінки більше не дає доступу до даних сам
--  по собі — потрібен вхід.
--
--  Стара політика public_read зі SECURITY_RLS.sql прибирається:
--  вона дозволяла читати всім підряд.

do $$
declare t text;
begin
  foreach t in array array[
    'daily_stats','creatives_stats','payouts','expenses',
    'tasks','daily_reports','team_settings',
    'change_log','accounts_mapping','funnels_mapping',
    'bonus_tiers','sync_logs','account_events','domains'
  ]
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('alter table public.%I enable row level security;', t);

      execute format('drop policy if exists "public_read" on public.%I;', t);
      execute format('drop policy if exists "auth_insert" on public.%I;', t);
      execute format('drop policy if exists "auth_update" on public.%I;', t);
      execute format('drop policy if exists "auth_delete" on public.%I;', t);
      execute format('drop policy if exists "own_select" on public.%I;', t);
      execute format('drop policy if exists "own_insert" on public.%I;', t);
      execute format('drop policy if exists "own_update" on public.%I;', t);
      execute format('drop policy if exists "own_delete" on public.%I;', t);

      execute format(
        'create policy "own_select" on public.%I for select to authenticated '
        'using (created_by = auth.uid());', t);
      execute format(
        'create policy "own_insert" on public.%I for insert to authenticated '
        'with check (created_by = auth.uid());', t);
      execute format(
        'create policy "own_update" on public.%I for update to authenticated '
        'using (created_by = auth.uid()) with check (created_by = auth.uid());', t);
      -- Видалити чуже не може ніхто. Своє — можна: без цього
      -- повторний імпорт за той самий день не зміг би перезаписатись.
      execute format(
        'create policy "own_delete" on public.%I for delete to authenticated '
        'using (created_by = auth.uid());', t);
    end if;
  end loop;
end $$;


-- ── quick_links окремо: там є спільні посилання ──
--  У таблиці є прапорець is_public — посилання, які видно всім.
--  Якби вона потрапила в цикл вище, спільні посилання зникли б
--  у всіх, крім автора.

alter table public.quick_links enable row level security;
drop policy if exists "public_read" on public.quick_links;
drop policy if exists "auth_insert" on public.quick_links;
drop policy if exists "auth_update" on public.quick_links;
drop policy if exists "auth_delete" on public.quick_links;
drop policy if exists "own_select" on public.quick_links;
drop policy if exists "own_insert" on public.quick_links;
drop policy if exists "own_update" on public.quick_links;
drop policy if exists "own_delete" on public.quick_links;

create policy "own_select" on public.quick_links for select to authenticated
  using (created_by = auth.uid() or is_public = true);
create policy "own_insert" on public.quick_links for insert to authenticated
  with check (created_by = auth.uid());
create policy "own_update" on public.quick_links for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "own_delete" on public.quick_links for delete to authenticated
  using (created_by = auth.uid());


-- ════════════════════════════════════════════════════════════
--  КРОК 7. Нові баєри
-- ════════════════════════════════════════════════════════════
--  Supabase → Authentication → Users → Add user (email + пароль).
--  Більше нічого робити не треба: людина заходить і бачить порожній
--  дашборд, бо жодного рядка з її created_by ще немає. Далі вона
--  сама заводить свої виплати, воронки й кабінети.
--
--  Перевірити, хто скільки має даних:
--
--    select u.email, count(d.*) rows_daily
--      from auth.users u
--      left join public.daily_stats d on d.created_by = u.id
--     group by u.email order by 2 desc;


-- ════════════════════════════════════════════════════════════
--  ЯКЩО ЩОСЬ ПІШЛО НЕ ТАК — ВІДКОТИТИ
-- ════════════════════════════════════════════════════════════
--  Вимикає захист і повертає все як було. Дані не зачіпаються:
--  колонка created_by лишається заповненою, просто перестає на
--  щось впливати. Можна вмикати назад тим самим кроком 6.
--
--  do $$
--  declare t text;
--  begin
--    foreach t in array array[
--      'daily_stats','creatives_stats','payouts','expenses',
--      'tasks','daily_reports','team_settings','quick_links',
--      'change_log','accounts_mapping','funnels_mapping',
--      'bonus_tiers','sync_logs','account_events','domains'
--    ]
--    loop
--      if exists (select 1 from information_schema.tables
--                 where table_schema='public' and table_name=t) then
--        execute format('alter table public.%I disable row level security;', t);
--      end if;
--    end loop;
--  end $$;
-- ============================================================
