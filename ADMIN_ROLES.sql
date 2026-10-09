-- ════════════════════════════════════════════════════════════
--  ДЕРЕВО РОЛЕЙ: АДМІН → ТІМЛІД → БАЄР → АСИСТЕНТ
-- ════════════════════════════════════════════════════════════
--
--  ЯК КОРИСТУВАТИСЬ ЦИМ ФАЙЛОМ
--  Це не один скрипт, який виконують цілком. Це блоки, які виконують
--  ПО ЧЕРЗІ в Supabase → SQL Editor: скопіювали блок, натиснули Run,
--  подивились результат, перейшли до наступного.
--
--  TEAM_ROLES.sql МУСИТЬ БУТИ ВИКОНАНИЙ ДО ЦЬОГО ФАЙЛУ. Звідти
--  беруться team_members, my_role(), my_team() і can_read_team().
--  Тут ми нічого з того не переписуємо — ДОДАЄМО четверту роль і
--  право запису для адміна.
--
-- ────────────────────────────────────────────────────────────
--  ХТО ЩО БАЧИТЬ. Напрямок тут важливіший за все інше у файлі.
--
--    buyer      — своє + свого асистента
--    assistant  — ТІЛЬКИ своє
--    lead       — свою команду цілком
--    admin      — усі команди
--
--  Асистент працює НА баєра, тож нагору видно, а не вниз: баєр читає
--  рядки свого асистента, асистент чужого не читає ніколи, і баєра
--  свого — теж ні.
--
--  ⚠️ ЧОМУ ЦЕ НЕ ЧЕРЕЗ team_name. Спокуса написати політику асистента
--  так само, як політику тімліда — через can_read_team. Так робити
--  НЕЛЬЗЯ: can_read_team повертає true для КОЖНОЇ команди, коли роль
--  admin, і політики складаються через АБО. Один раз ми на цьому вже
--  втратили продакшен: прибрали фільтр команди на сторінці кабінетів
--  «бо RLS і так віддає лише своє», і баєр побачив чужі кабінети.
--
--  Тому зв'язок баєр↔асистент іде ВИКЛЮЧНО через created_by — автора
--  рядка. Назва команди в цьому питанні не бере участі зовсім.
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1 — чий асистент
--
--  Один стовпчик: у кого цей асистент. У всіх інших ролей він
--  порожній, і це не «про запас», а умова — див. БЛОК 3.
-- ════════════════════════════════════════════════════════════

alter table public.team_members
  add column if not exists parent_id uuid
    references public.team_members(user_id) on delete set null;

-- Сам собі начальником бути не можна. Це єдине, що влазить у check:
-- решта правил потребує запитів, тож вона в тригері БЛОКУ 3.
alter table public.team_members
  drop constraint if exists team_members_parent_not_self;
alter table public.team_members
  add constraint team_members_parent_not_self check (parent_id is distinct from user_id);

-- Баєра питають «хто мої асистенти» на кожному завантаженні сторінки.
create index if not exists team_members_parent_idx
  on public.team_members(parent_id) where parent_id is not null;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — головний вимикач для пари баєр↔асистент
--
--  can_read_team лишається як є і відповідає за тімліда й адміна.
--  Ця функція відповідає рівно за одне: «це мій рядок або рядок мого
--  асистента».
--
--  security definer тут з тієї самої причини, що й у TEAM_ROLES:
--  функція читає team_members, а на team_members є політики.
--  set search_path — щоб її не можна було обдурити своєю схемою.
-- ════════════════════════════════════════════════════════════

create or replace function public.can_read_mine(row_author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select row_author = auth.uid()
      or exists (
           select 1 from public.team_members a
            where a.user_id   = row_author
              and a.parent_id = auth.uid()
              and a.role      = 'assistant');
$$;

--  Кого я веду. Сторінці потрібно, щоб підписати рядки в репорті
--  іменами, а не голими uuid.
create or replace function public.my_assistants()
returns setof uuid language sql stable security definer set search_path = public as $$
  select user_id from public.team_members
   where parent_id = auth.uid() and role = 'assistant';
$$;

grant execute on function public.can_read_mine(uuid), public.my_assistants() to authenticated;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 3 — дерево не може бути кривим
--
--  Тригер, а не домовленість. Сторінка адміна — це зручність; якщо
--  правило живе тільно в ній, досить одного запиту з консолі, щоб
--  зробити асистента адміном.
--
--  Що він тримає:
--    • роль — тільки з чотирьох відомих;
--    • assistant мусить мати parent_id, і той мусить бути БАЄРОМ;
--    • усі інші ролі parent_id не мають;
--    • ланцюжків немає: асистент асистента неможливий;
--    • роль, команду й parent_id міняє ТІЛЬКИ адмін.
--
--  ⚠️ ПРО SQL EDITOR. У редакторі немає залогіненого користувача:
--  auth.uid() там порожній, а my_role() через те віддає 'buyer'.
--  Якби тригер перевіряв роль беззастережно, ви б не змогли призначити
--  першого адміна — звідси й не звідки. Тому перевірка «тільки адмін»
--  діє лише коли auth.uid() є, тобто коли запит прийшов з браузера.
-- ════════════════════════════════════════════════════════════

create or replace function public.team_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  parent_role text;
begin
  if new.role not in ('buyer', 'assistant', 'lead', 'admin') then
    raise exception 'unknown role %. Allowed: buyer, assistant, lead, admin', new.role;
  end if;

  -- Роль, команду й начальника міняє тільки адмін. З SQL Editor
  -- (auth.uid() порожній) — можна: інакше першого адміна не призначити.
  if tg_op = 'UPDATE' and auth.uid() is not null and public.my_role() <> 'admin' then
    if new.role      is distinct from old.role
    or new.parent_id is distinct from old.parent_id
    or new.team_name is distinct from old.team_name
    or new.user_id   is distinct from old.user_id then
      raise exception 'role, team and parent are changed by an admin only';
    end if;
  end if;

  if new.role = 'assistant' then
    if new.parent_id is null then
      raise exception 'an assistant must have a buyer (parent_id)';
    end if;
    select role into parent_role from public.team_members where user_id = new.parent_id;
    if parent_role is null then
      raise exception 'parent_id points to nobody';
    end if;
    -- Ланцюжків немає навмисно. Дерево рівно таке, як просили:
    -- баєр і його асистент, без асистентів в асистента.
    if parent_role <> 'buyer' then
      raise exception 'an assistant can only belong to a buyer, not to a %', parent_role;
    end if;
  elsif new.parent_id is not null then
    raise exception 'parent_id is only for an assistant (role is %)', new.role;
  end if;

  return new;
end $$;

drop trigger if exists team_members_guard_trg on public.team_members;
create trigger team_members_guard_trg
  before insert or update on public.team_members
  for each row execute function public.team_members_guard();


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 4 — баєр бачить рядки свого асистента
--
--  Додаємо ОДНУ політику на читання до таблиць, де є created_by.
--  Стара політика «своє» з SECURITY_BUYERS.sql лишається: політики
--  складаються через АБО, тож ніхто нічого не втрачає.
--
--  ⚠️ СПИСОК РІВНО ТАКИЙ, ЩО ПОТРІБЕН, І НЕ БІЛЬШИЙ. У TEAM_ROLES.sql
--  уже була ця помилка: туди поклали tasks «про запас», і тімлід
--  побачив чужі особисті задачі.
--
--  Тут — те, що асистент РОБИТЬ для баєра: заливає статистику,
--  креативи, пише денні звіти. Баєр мусить це бачити, бо це його
--  робота чужими руками.
--
--  Чого тут немає і чому:
--    payouts, expenses, bonus_tiers — гроші. Асистент їх не заводить,
--      а баєру своє видно й так.
--    tasks — особисте. Урок вище.
--    fb_tokens — ніколи. Токен закритий навіть від власника.
-- ════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array['daily_stats', 'creatives_stats', 'daily_reports', 'change_log']
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('drop policy if exists %I on public.%I', t || '_read_mine', t);
      execute format(
        'create policy %I on public.%I for select using (public.can_read_mine(created_by))',
        t || '_read_mine', t);
      raise notice 'політику читання «своє + асистента» видано: %', t;
    else
      raise notice 'таблиці немає, пропущено: %', t;
    end if;
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 5 — хто змінює роли
--
--  Досі в team_members не було ЖОДНОЇ політики запису: роли ставились
--  руками тут, у редакторі. Сторінка адміна без цього блоку буде
--  картинкою, яка нічого не зберігає.
--
--  Три політики, і кожна вузька:
--    admin_write  — адмін робить із таблицею що треба;
--    insert_self  — будь-хто заводить СВІЙ рядок як buyer. Це те, як
--                   людина взагалі з'являється в списку: інакше адмін
--                   не має звідки взяти user_id (auth.users з браузера
--                   не читається), і кожного нового довелось би
--                   додавати руками в SQL;
--    rename_self  — підписати себе іменем. Роль, команду й начальника
--                   ця політика змінити не дасть: їх тримає тригер
--                   БЛОКУ 3, а не чесне слово.
-- ════════════════════════════════════════════════════════════

drop policy if exists team_members_admin_write on public.team_members;
create policy team_members_admin_write on public.team_members
  for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

drop policy if exists team_members_insert_self on public.team_members;
create policy team_members_insert_self on public.team_members
  for insert to authenticated
  with check (user_id = auth.uid() and role = 'buyer' and parent_id is null);

drop policy if exists team_members_rename_self on public.team_members;
create policy team_members_rename_self on public.team_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.team_members to authenticated;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 6 — призначити себе адміном
--
--  Виконується ОДИН раз і саме тут, у редакторі: з браузера цього не
--  зробити, бо міняти роль дозволено лише адміну, а його ще немає.
--
--  Свій UUID: Supabase → Authentication → Users → ваш рядок → User UID.
-- ════════════════════════════════════════════════════════════

-- insert ... on conflict — щоб працювало і коли рядок уже є.
insert into public.team_members (user_id, team_name, name, role)
values ('ВАШ-UUID-СЮДИ', 'IMPROVE', 'Vlad', 'admin')
on conflict (user_id) do update set role = 'admin';


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 7 — перевірити, що вийшло
-- ════════════════════════════════════════════════════════════

--  Дерево. Асистенти мають бути підписані своїм баєром.
select m.role, coalesce(m.name, '—') as "хто", m.team_name as "команда",
       coalesce(p.name, '—') as "начальник"
  from public.team_members m
  left join public.team_members p on p.user_id = m.parent_id
 order by case m.role when 'admin' then 1 when 'lead' then 2
                      when 'buyer' then 3 else 4 end, m.name;

--  Політики читання «своє + асистента». Рядків має бути стільки,
--  скільки таблиць назвав БЛОК 4.
--      select tablename, policyname from pg_policies
--       where schemaname = 'public' and policyname like '%_read_mine'
--       order by tablename;

--  Тригер на місці:
--      select tgname from pg_trigger
--       where tgrelid = 'public.team_members'::regclass and not tgisinternal;

--  Що дерево кривим не стане — перевіряється спробою. Обидва запити
--  МУСЯТЬ впасти з помилкою; якщо хоч один пройшов, БЛОК 3 не виконано:
--
--      -- асистент без баєра
--      update public.team_members set role = 'assistant', parent_id = null
--       where user_id = 'UUID-АСИСТЕНТА';
--
--      -- асистент асистента
--      update public.team_members set parent_id = 'UUID-ІНШОГО-АСИСТЕНТА'
--       where user_id = 'UUID-АСИСТЕНТА';
