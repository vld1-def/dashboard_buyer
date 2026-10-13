-- ════════════════════════════════════════════════════════════
--  ▶ НИЖНЄ МЕНЮ ПО ЛЮДИНІ
--
--  ЗАЧИМ. Док знизу однаковий у всіх, а потрібен він різним людям
--  різний: асистенту нема що робити в налаштуваннях синхронізації,
--  баєру — у вікні з токенами. Досі ховати пункти можна було лише
--  персонально й лише собі (localStorage, стрілка «Ще»), тобто адмін
--  не мав як прибрати пункт у чужому меню.
--
--  ДЕ ЗБЕРІГАЄМО. У team_members, поряд із роллю. Причина не в
--  зручності: саме на цій таблиці вже стоїть політика
--  team_members_admin_write (адмін пише будь-який рядок) і
--  team_members_read_mine (людина читає свій). Нова таблиця означала б
--  ще один набір політик, який мусив би повторювати ті самі правила —
--  і колись із ними розійтись.
--
--  ЩО ЛЕЖИТЬ. Масив ПІДПИСІВ кнопок (title), не id: id у кнопок дока
--  немає, а title вже є ключем і для іконок, і для персональної
--  схованки. Невідомий підпис дашборд просто ігнорує, тож
--  перейменування пункту нічого не ламає — воно лише перестає його
--  ховати, і це видно одразу.
--
--  ЦЕ НЕ ЗАХИСТ ДАНИХ. Прибраний пункт меню — про порядок на екрані.
--  Хто що може прочитати, вирішує RLS (SECURITY_RLS.sql,
--  ADMIN_ROLES.sql), і док на це не впливає зовсім. Але й робити
--  вигляд, що це просто косметика, не варто: нижче стоїть тригер, який
--  не дає людині самій собі повернути прибрані пункти — інакше
--  налаштування адміна трималось би на чесному слові.
--
--  Виконати: Supabase → SQL Editor → Run. Один раз.
-- ════════════════════════════════════════════════════════════

alter table public.team_members
  add column if not exists dock_hidden text[] not null default '{}'::text[];


-- ════════════════════════════════════════════════════════════
--  ▶ МІНЯТИ ЦЕ МОЖЕ ТІЛЬКИ АДМІН
--
--  Політика team_members_rename_self дозволяє людині оновлювати свій
--  рядок — вона й потрібна, щоб підписати себе іменем. Але разом з
--  іменем вона дозволила б і dock_hidden, тобто кожен міг би зняти з
--  себе налаштування адміна одним запитом. Роль і начальника від того
--  самого вже боронить тригер БЛОКУ 3 в ADMIN_ROLES.sql — тут та сама
--  думка, окремим тригером, щоб файли не залежали один від одного.
-- ════════════════════════════════════════════════════════════

create or replace function public.dock_hidden_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Нічого не змінилось — нема про що говорити (так проходять
  -- звичайні оновлення імені).
  if tg_op = 'UPDATE' and new.dock_hidden is not distinct from old.dock_hidden then
    return new;
  end if;
  if tg_op = 'INSERT' and (new.dock_hidden is null or new.dock_hidden = '{}'::text[]) then
    return new;
  end if;

  -- my_role() приходить з TEAM_ROLES.sql і читає роль того, хто
  -- викликав. Немає функції — краще відмовити, ніж пустити всіх.
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'dock_hidden змінює тільки адмін (вікно Admin → Люди й роли)';
  end if;
  return new;
end $$;

drop trigger if exists team_members_dock_guard on public.team_members;
create trigger team_members_dock_guard
  before insert or update on public.team_members
  for each row execute function public.dock_hidden_guard();


-- ════════════════════════════════════════════════════════════
--  ▶ ЗВІТ — що вийшло
-- ════════════════════════════════════════════════════════════

drop table if exists public._dock_check;
create table public._dock_check (what text, val text);
alter table public._dock_check enable row level security;

insert into public._dock_check
select 'колонка dock_hidden', case when exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'team_members'
     and column_name = 'dock_hidden') then 'є' else 'НЕМА' end;

insert into public._dock_check
select 'тригер-охоронець', case when exists (
  select 1 from pg_trigger
   where tgname = 'team_members_dock_guard' and not tgisinternal) then 'є' else 'НЕМА' end;

insert into public._dock_check
select 'людей із прибраними пунктами', count(*)::text
  from public.team_members where dock_hidden <> '{}'::text[];

insert into public._dock_check
select 'хто саме: ' || coalesce(name, left(user_id::text, 8)),
       array_to_string(dock_hidden, ', ')
  from public.team_members where dock_hidden <> '{}'::text[];

select * from public._dock_check;

-- Прибрати звіт, коли подивились:
--   drop table if exists public._dock_check;
