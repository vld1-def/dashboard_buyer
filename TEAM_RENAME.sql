-- ============================================================
--  ПЕРЕЙМЕНУВАТИ КОМАНДУ (назви задаються в КРОЦІ 0)
-- ============================================================
--
--  Назва команди — це ЯРЛИК, а не право доступу. Хто що бачить,
--  вирішує created_by і політики RLS (SECURITY_BUYERS.sql); team_name
--  лише підписує, до якого робочого місця належить рядок. Тому
--  перейменування нічого не ламає й нічого не відкриває — воно міняє
--  підпис.
--
--  Колонка team_name є в багатьох таблицях і зʼявлялась у різний час,
--  тому нижче не список, а обхід: беремо кожну таблицю схеми public,
--  у якої така колонка справді є. Забути одну таблицю зі списку
--  означало б лишити частину даних під старою назвою — і саме ця
--  частина потім зникла б з очей.
--
--  Нічого не видаляється й не створюється. Запит чіпає ЛИШЕ рядки, де
--  team_name = 'Makeberry'. Запускати можна скільки завгодно разів:
--  другий запуск не знайде що робити.
--
--  ⚠️ САМЕ ЦЕЙ СКРИПТ І ЛІКУЄ «КАБІНЕТИ ЛЕТЯТЬ ПІД СТАРОЮ НАЗВОЮ».
--  Назву команди носить САМ ТОКЕН: fb_tokens.team_name ставиться один
--  раз, коли токен зберігали, і fb-sync штампує цією назвою все, що
--  пише — fb_accounts, fb_spend_daily, fb_ad_today, fb_cabinet_pages.
--  Перейменування в дашборді токена не чіпає, тож рядок, заведений
--  рукою, лягає під НОВОЮ назвою, а все, що приносить синк по тому ж
--  кабінету — під СТАРОЮ. Обхід нижче проходить і fb_tokens, і саме
--  тому після нього синк починає писати правильно.
--
--  ⚠️ ПІСЛЯ ЦЬОГО ОДРАЗУ ПЕРЕМКНИ КОМАНДУ В ДАШБОРДІ.
--  У браузері лежить selected_team = 'Makeberry'. Поки він там, дашборд
--  питатиме налаштування під старою назвою й не знайде їх — правила,
--  шаблони розбору й решта виглядатимуть порожніми. Це не втрата даних,
--  це розбіжність ярликів: перемикач команди (ліва панель) уже
--  показуватиме Improve, натисни — і все повернеться.
--
--  Назад так само: поміняти назви місцями в КРОЦІ 0 і пройти кроки
--  1–3 ще раз.
--
--  Де запускати: Supabase Dashboard → SQL Editor → New query → Run.
-- ============================================================


-- ════════════════════════════════════════════════════════════
--  КРОК 0. НАЗВИ — ТУТ, І ТІЛЬКИ ТУТ
-- ════════════════════════════════════════════════════════════
--  Доти обидві назви стояли літералами в пʼяти місцях трьох блоків.
--  Виправити чотири з пʼяти — найлегша помилка в цьому файлі, і
--  коштувала б вона найгіршого: половина таблиць під новою назвою,
--  половина під старою, і жодної помилки на екрані.
--
--  Тепер назви лежать в одному рядку, а кроки 1–3 читають їх звідси.
--  Міняєш тут — міняється все.

drop table if exists public._rename_names;
create table public._rename_names (old_name text, new_name text);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ, як і решту службових таблиць: у Supabase нова
-- таблиця в public доступна ролі authenticated за замовчуванням. RLS
-- без жодної політики не віддає НІЧОГО, і цього достатньо.
alter table public._rename_names enable row level security;

--  ⬇⬇⬇ ОСЬ ТУТ ⬇⬇⬇  стара назва, нова назва
insert into public._rename_names values ('Makeberry', 'Improve');

select * from public._rename_names;


-- ════════════════════════════════════════════════════════════
--  КРОК 1. Подивитись, що саме зміниться
-- ════════════════════════════════════════════════════════════
--  Спершу порахуємо, не змінюючи нічого: де лежить 'Makeberry' і
--  скільки там рядків. Якщо тут порожньо — перейменовувати нема чого.

--  ⚠️ ЗВІТ — ТАБЛИЦЕЮ, А НЕ ЧЕРЕЗ RAISE NOTICE. DO-блок не повертає
--  рядків ніколи, а notice редактор Supabase не показує — тож перша
--  редакція цього кроку виглядала як «Success. No rows returned»,
--  тобто ніяк. Видно її було лише в psql.

drop table if exists public._rename_report;
create table public._rename_report ("таблиця" text, "рядків зі старою назвою" bigint);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._rename_report enable row level security;

do $$
declare t text; n bigint; o text;
begin
  select old_name into o from public._rename_names;
  if o is null then
    raise exception 'Спершу виконай КРОК 0 — назви беруться звідти.';
  end if;
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'team_name'
       and table_name not in ('_rename_report', '_rename_names',
                              '_merge_report', '_merge_log')
     order by table_name
  loop
    execute format('select count(*) from public.%I where team_name = %L', t, o)
      into n;
    if n > 0 then
      insert into public._rename_report values (t, n);
    end if;
  end loop;

  if not exists (select 1 from public._rename_report) then
    insert into public._rename_report values ('— старої назви в базі немає —', 0);
  end if;
end $$;

--  ⬇ ОСЬ ЦЕ Й Є ЗВІТ. Якщо тут порожньо — блок не виконався.
select * from public._rename_report order by 2 desc, 1;


-- ════════════════════════════════════════════════════════════
--  КРОК 2. Перейменувати
-- ════════════════════════════════════════════════════════════
--  Виконувати, коли крок 1 показав очікуване. Кожен рядок у звіті
--  внизу — скільки рядків справді змінилось у цій таблиці.
--
--  ⚠️ ЦЕЙ БЛОК — ТІЛЬКИ ДЛЯ ПЕРЕЙМЕНУВАННЯ, НЕ ДЛЯ ЗЛИТТЯ.
--  Якщо нова назва ВЖЕ Є в даних, простий update упреться в
--  унікальність і впаде:
--
--      duplicate key value violates unique constraint
--      Key (team_name, geo, offer)=(IMPROVE, UZ, Pinco) already exists
--
--  Це не поломка, а інша задача: дві назви треба ЗЛИТИ, вирішивши по
--  кожному налаштуванню, чиє головне. Для цього є блоки ЗЛИТТЯ в кінці
--  файлу. Щоб ніхто не дізнавався про це з помилки Postgres, блок
--  спершу сам перевіряє й зупиняється з поясненням.

drop table if exists public._rename_done;
create table public._rename_done ("таблиця" text, "перейменовано рядків" bigint);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._rename_done enable row level security;

do $$
declare t text; n bigint; clash bigint; o text; nw text;
begin
  select old_name, new_name into o, nw from public._rename_names;
  if o is null or nw is null then
    raise exception 'Спершу виконай КРОК 0 — назви беруться звідти.';
  end if;
  execute format('select count(*) from public.daily_stats where team_name = %L', nw)
    into clash;
  if clash > 0 then
    raise exception
      'Назва «%» вже є в даних (% рядків у daily_stats). Це ЗЛИТТЯ, а не '
      'перейменування: простий update упреться в унікальність. Виконуйте '
      'блоки «ЗЛИТТЯ, КРОК 1» і «ЗЛИТТЯ, КРОК 2» у кінці цього файлу — '
      'вони вирішують зіткнення за автором рядка.', nw, clash;
  end if;
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'team_name'
       and table_name not in ('_rename_report', '_rename_done', '_rename_names',
                              '_merge_report', '_merge_log')
     order by table_name
  loop
    execute format('update public.%I set team_name = %L where team_name = %L',
                   t, nw, o);
    get diagnostics n = row_count;
    if n > 0 then
      insert into public._rename_done values (t, n);
    end if;
  end loop;

  if not exists (select 1 from public._rename_done) then
    insert into public._rename_done values ('— нічого не знайшлось під старою назвою —', 0);
  end if;
end $$;

--  ⬇ ОСЬ ЦЕ Й Є ЗВІТ. Якщо тут порожньо — блок не виконався.
select * from public._rename_done order by 2 desc, 1;


-- ════════════════════════════════════════════════════════════
--  КРОК 3. Перевірити, що старої назви не лишилось
-- ════════════════════════════════════════════════════════════
--  Має повернути нуль рядків. Якщо щось лишилось — назва там написана
--  інакше (пробіл, інший регістр), і цей рядок треба глянути руками:
--  мовчки підганяти регістр під збіг означало б зачепити те, чого ми
--  не бачили.

drop table if exists public._rename_left;
create table public._rename_left ("таблиця" text, "лишилось рядків" bigint);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._rename_left enable row level security;

do $$
declare t text; n bigint; o text;
begin
  select old_name into o from public._rename_names;
  if o is null then
    raise exception 'Спершу виконай КРОК 0 — назви беруться звідти.';
  end if;
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'team_name'
       and table_name not in ('_rename_report', '_rename_done', '_rename_left',
                              '_rename_names', '_merge_report', '_merge_log')
     order by table_name
  loop
    execute format('select count(*) from public.%I where team_name = %L', t, o)
      into n;
    if n > 0 then
      insert into public._rename_left values (t, n);
    end if;
  end loop;

  if not exists (select 1 from public._rename_left) then
    insert into public._rename_left values ('— чисто, старої назви не лишилось —', 0);
  end if;
end $$;

--  ⬇ ОСЬ ЦЕ Й Є ЗВІТ. Один рядок «чисто» — це успіх.
select * from public._rename_left order by 2 desc, 1;


-- ════════════════════════════════════════════════════════════
--  Схожі назви, якщо раптом десь інакше
-- ════════════════════════════════════════════════════════════
--  Одним запитом: які взагалі назви команд є в даних і скільки їх.
--  Корисно, якщо крок 3 щось показав.

select team_name, count(*) as rows from public.daily_stats group by 1 order by 2 desc;


-- ════════════════════════════════════════════════════════════
--  ЗЛИТТЯ ДВОХ НАЗВ В ОДНУ (а не просто перейменування)
-- ════════════════════════════════════════════════════════════
--
--  КОЛИ ЦЕ ПОТРІБНО. Асистент при першому вході назвав робоче місце
--  по-своєму («OlehV»), цією назвою підписався кожен його імпорт, і
--  тепер його рядки не доходять до звіту баєра. Треба не перейменувати
--  порожню назву в порожню, а ЗЛИТИ дві наявні в одну.
--
--  І тоді простий update падає:
--
--      duplicate key value violates unique constraint
--
--  Бо частина таблиць має унікальність із team_name у ключі:
--      team_settings   (team_name, key)
--      payouts         (team_name, geo, offer)
--      domains         (team_name, domain)
--      і будь-яка інша, яку додадуть потім
--
--  ⚠️ ДАНІ ЦЕ НЕ ЗАЧІПАЄ. У daily_stats і creatives_stats унікальності
--  по team_name немає — їхні рядки просто стають поруч і підсумовуються.
--  Падає лише на НАЛАШТУВАННЯХ: обидва мали свій fb_report_map, свій
--  keitaro_map, свої виплати.
--
--  ЯК ВИРІШУЄМО — ЗА АВТОРОМ. Якщо рядок із таким самим ключем під
--  новою назвою створили ВИ, то це ваше налаштування, і воно головне:
--  копія асистента зайва й прибирається. Якщо ж той, що лишається,
--  створив не ви — нічого не чіпаємо й кажемо про це вголос. Вирішувати
--  за двох людей, чиє налаштування правильне, цей скрипт не має права.
--
--  ЗАПОВНІТЬ ТРИ ЗНАЧЕННЯ НИЖЧЕ. Вони потрібні в обох блоках.
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
--  ▶ ЗЛИТТЯ, КРОК 1 — подивитись, що саме зіткнеться
--
--  Нічого не міняє. Показує: у якій таблиці, за яким ключем, скільки
--  рядків і чиї вони.
--
--  ⚠️ ЧОМУ ТУТ ТАБЛИЦЯ, А НЕ RAISE NOTICE. Перша редакція писала все
--  через notice — і в SQL Editor Supabase це виглядало як «Success.
--  No rows returned», тобто ніяк. DO-блок рядків не повертає ніколи, а
--  notice редактор не показує; їх видно лише в psql. Тож звіт тепер
--  складається в таблицю, і останній select її показує.
-- ════════════════════════════════════════════════════════════

drop table if exists public._merge_report;
create table public._merge_report (
  "таблиця" text, "ключ" text, "зіткнень" bigint,
  "ваших" bigint, "чужих" bigint, "що буде" text);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._merge_report enable row level security;

do $$
declare
  OLD_TEAM constant text := 'OlehV';            -- ⬅ стара назва (чия приходить)
  NEW_TEAM constant text := 'IMPROVE';          -- ⬅ ваша назва
  MY_UUID  constant uuid := 'ВАШ-UUID-СЮДИ';    -- ⬅ Authentication → Users → User UID
  r record; cols text[]; cond text; n bigint; mine bigint; has_author boolean;
begin
  for r in
    select c.relname as tbl, array_agg(a.attname order by k.ord) as keycols
      from pg_index i
      join pg_class c on c.oid = i.indrelid
      join pg_namespace ns on ns.oid = c.relnamespace
      cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
     where ns.nspname = 'public' and i.indisunique and c.relkind = 'r'
       and c.relname not like '\_%'   -- службові таблиці звітів
     group by c.relname, i.indexrelid
    having 'team_name' = any(array_agg(a.attname))
  loop
    cols := array_remove(r.keycols, 'team_name');
    continue when cardinality(cols) = 0;

    select string_agg(format('o.%I is not distinct from n.%I', x, x), ' and ')
      into cond from unnest(cols) as x;

    execute format(
      'select count(*) from public.%1$I o join public.%1$I n on %2$s
        where o.team_name = %3$L and n.team_name = %4$L',
      r.tbl, cond, OLD_TEAM, NEW_TEAM) into n;
    continue when n = 0;

    select exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = r.tbl
                      and column_name = 'created_by') into has_author;

    if has_author then
      execute format(
        'select count(*) from public.%1$I o join public.%1$I n on %2$s
          where o.team_name = %3$L and n.team_name = %4$L and n.created_by = %5$L',
        r.tbl, cond, OLD_TEAM, NEW_TEAM, MY_UUID) into mine;
      insert into public._merge_report values (
        r.tbl, array_to_string(cols, ', '), n, mine, n - mine,
        case when mine = n then 'копії асистента приберуться, ваше лишиться'
             when mine = 0 then 'НІЧОГО не чіпатимемо — двійник створив не ви'
             else format('%s приберуться, %s лишаться вам на рішення', mine, n - mine) end);
    else
      insert into public._merge_report values (
        r.tbl, array_to_string(cols, ', '), n, null, null,
        'у таблиці немає created_by — не чіпатимемо');
    end if;
  end loop;

  if not exists (select 1 from public._merge_report) then
    insert into public._merge_report values
      ('—', '—', 0, 0, 0, 'зіткнень немає: можна переходити до КРОКУ 2');
  end if;
end $$;

--  ⬇ ОСЬ ЦЕ Й Є ЗВІТ. Якщо тут порожньо — блок не виконався.
select * from public._merge_report order by "зіткнень" desc, "таблиця";


-- ════════════════════════════════════════════════════════════
--  ▶ ЗЛИТТЯ, КРОК 2 — прибрати зайві копії й перенести решту
--
--  Прибирається РІВНО те, чий двійник під новою назвою створений вами.
--
--  ⚠️ ПЕРЕНОСИТЬСЯ ВСЕ, ЩО МОЖЕ ПЕРЕНЕСТИСЬ. Перша редакція просто
--  робила update по кожній таблиці — і падала на першому ж зіткненні,
--  яке лишилось нерозвʼязаним. Через це не переносилось НІЧОГО,
--  включно з daily_stats, де жодних зіткнень бути не може. Перевірено
--  на живій базі: одна таблиця без created_by зупиняла весь блок.
--
--  Тому рядок, який уперся б в унікальність, лишається на місці під
--  старою назвою, а все інше переїжджає. Внизу — звіт, що саме сталось.
-- ════════════════════════════════════════════════════════════

drop table if exists public._merge_log;
create table public._merge_log ("таблиця" text, "що зроблено" text, "рядків" bigint);

-- ⚠️ ЗАКРИВАЄМО ОДРАЗУ. У Supabase нові таблиці в public доступні ролі
-- authenticated за замовчуванням, а в цих звітах лежать СПРАВЖНІ
-- значення — зокрема site_password і tl_password. Службова таблиця не
-- має бути відкритішою за ту, з якої її наповнили.
--
-- RLS без жодної політики не віддає НІЧОГО, і цього достатньо: власник
-- таблиці тут postgres, а PostgREST ходить як anon/authenticated. Саме
-- revoke не пишемо навмисно — він вимагав би, щоб ці ролі існували, і
-- на звичайному Postgres блок падав би на неіснуючій ролі.
alter table public._merge_log enable row level security;

do $$
declare
  OLD_TEAM constant text := 'OlehV';            -- ⬅ ті самі три значення
  NEW_TEAM constant text := 'IMPROVE';
  MY_UUID  constant uuid := 'ВАШ-UUID-СЮДИ';
  t text; r record; cols text[]; cond text; guards text[];
  dropped bigint; moved bigint; stuck bigint; has_author boolean;
begin
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'team_name'
       and table_name not in ('_merge_report', '_merge_log',
                              '_rename_report', '_rename_done', '_rename_left')
     order by table_name
  loop
    select exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t
                      and column_name = 'created_by') into has_author;
    guards := array[]::text[];

    -- усі унікальні ключі цієї таблиці, де бере участь team_name
    for r in
      select array_agg(a.attname order by k.ord) as keycols
        from pg_index i
        join pg_class c on c.oid = i.indrelid
        join pg_namespace ns on ns.oid = c.relnamespace
        cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
        join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
       where ns.nspname = 'public' and c.relname = t
         and i.indisunique and c.relkind = 'r'
       group by i.indexrelid
      having 'team_name' = any(array_agg(a.attname))
    loop
      cols := array_remove(r.keycols, 'team_name');
      continue when cardinality(cols) = 0;
      select string_agg(format('o.%I is not distinct from n.%I', x, x), ' and ')
        into cond from unnest(cols) as x;

      -- 1. зайва копія: двійник під новою назвою створений ВАМИ
      if has_author then
        execute format(
          'delete from public.%1$I o
            where o.team_name = %3$L
              and exists (select 1 from public.%1$I n
                           where n.team_name = %4$L and n.created_by = %5$L and %2$s)',
          t, cond, OLD_TEAM, NEW_TEAM, MY_UUID);
        get diagnostics dropped = row_count;
        if dropped > 0 then
          insert into public._merge_log values (t, 'прибрано зайвих копій', dropped);
        end if;
      end if;

      /* 2. те, що лишилось зіткненим, НЕ переносимо: воно чуже.
         Умову лишаємо як є — «o.» тут це псевдонім таблиці в update
         нижче. Спроба підставити замість нього повну назву таблиці
         ламає запит: коли в update є псевдонім, звертатись до таблиці
         її повним імʼям уже не можна. */
      guards := guards || format(
        'not exists (select 1 from public.%1$I n where n.team_name = %2$L and %3$s)',
        t, NEW_TEAM, cond);
    end loop;

    execute format('update public.%I o set team_name = %L where o.team_name = %L%s',
                   t, NEW_TEAM, OLD_TEAM,
                   case when cardinality(guards) = 0 then ''
                        else ' and ' || array_to_string(guards, ' and ') end);
    get diagnostics moved = row_count;
    if moved > 0 then
      insert into public._merge_log values (t, 'перенесено під ' || NEW_TEAM, moved);
    end if;

    execute format('select count(*) from public.%I where team_name = %L', t, OLD_TEAM)
      into stuck;
    if stuck > 0 then
      insert into public._merge_log values
        (t, 'ЛИШИЛОСЬ під ' || OLD_TEAM || ' — двійник створений не вами, вирішіть руками', stuck);
    end if;
  end loop;

  if not exists (select 1 from public._merge_log) then
    insert into public._merge_log values ('—', 'нічого не знайдено під старою назвою', 0);
  end if;
end $$;

--  ⬇ ОСЬ ЦЕ Й Є ЗВІТ.
select * from public._merge_log order by "таблиця", "що зроблено";

--  Прибрати службові таблиці, коли все переглянули:
--      drop table if exists public._merge_report, public._merge_log;


--  ⚠️ І ОДРАЗУ ПІСЛЯ ЦЬОГО — у браузері асистента перемкнути команду на
--  нову назву. Поки там лежить стара, наступний імпорт знову підпишеться
--  нею, і все повернеться. Дашборд тепер попереджає про це сам при вході.
