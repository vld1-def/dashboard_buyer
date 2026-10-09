-- ============================================================
--  ПЕРЕЙМЕНУВАТИ КОМАНДУ: Makeberry → Improve
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
--  ⚠️ ПІСЛЯ ЦЬОГО ОДРАЗУ ПЕРЕМКНИ КОМАНДУ В ДАШБОРДІ.
--  У браузері лежить selected_team = 'Makeberry'. Поки він там, дашборд
--  питатиме налаштування під старою назвою й не знайде їх — правила,
--  шаблони розбору й решта виглядатимуть порожніми. Це не втрата даних,
--  це розбіжність ярликів: перемикач команди (ліва панель) уже
--  показуватиме Improve, натисни — і все повернеться.
--
--  Назад так само: поміняти 'Improve' і 'Makeberry' місцями.
--
--  Де запускати: Supabase Dashboard → SQL Editor → New query → Run.
-- ============================================================


-- ════════════════════════════════════════════════════════════
--  КРОК 1. Подивитись, що саме зміниться
-- ════════════════════════════════════════════════════════════
--  Спершу порахуємо, не змінюючи нічого: де лежить 'Makeberry' і
--  скільки там рядків. Якщо тут порожньо — перейменовувати нема чого.

do $$
declare t text; n bigint;
begin
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'team_name'
     order by table_name
  loop
    execute format('select count(*) from public.%I where team_name = %L', t, 'Makeberry')
      into n;
    if n > 0 then
      raise notice '% → % рядків', t, n;
    end if;
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════
--  КРОК 2. Перейменувати
-- ════════════════════════════════════════════════════════════
--  Виконувати, коли крок 1 показав очікуване. Кожен рядок у NOTICE —
--  скільки рядків справді змінилось у цій таблиці.

do $$
declare t text; n bigint;
begin
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'team_name'
     order by table_name
  loop
    execute format('update public.%I set team_name = %L where team_name = %L',
                   t, 'Improve', 'Makeberry');
    get diagnostics n = row_count;
    if n > 0 then
      raise notice '% → перейменовано % рядків', t, n;
    end if;
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════
--  КРОК 3. Перевірити, що старої назви не лишилось
-- ════════════════════════════════════════════════════════════
--  Має повернути нуль рядків. Якщо щось лишилось — назва там написана
--  інакше (пробіл, інший регістр), і цей рядок треба глянути руками:
--  мовчки підганяти регістр під збіг означало б зачепити те, чого ми
--  не бачили.

do $$
declare t text; n bigint;
begin
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'team_name'
     order by table_name
  loop
    execute format('select count(*) from public.%I where team_name = %L', t, 'Makeberry')
      into n;
    if n > 0 then
      raise notice 'ЛИШИЛОСЬ: % → % рядків', t, n;
    end if;
  end loop;
  raise notice 'перевірку завершено';
end $$;


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
--  рядків, і головне — чиї вони.
-- ════════════════════════════════════════════════════════════

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
      raise notice '% за ключем (%): % зіткнень, із них ваших %, чужих %',
        r.tbl, array_to_string(cols, ', '), n, mine, n - mine;
    else
      raise notice '% за ключем (%): % зіткнень, автора в таблиці немає — не чіпатимемо',
        r.tbl, array_to_string(cols, ', '), n;
    end if;
  end loop;
  raise notice 'огляд завершено; нічого не змінено';
end $$;


-- ════════════════════════════════════════════════════════════
--  ▶ ЗЛИТТЯ, КРОК 2 — прибрати зайві копії й перенести решту
--
--  Прибирається РІВНО те, чий двійник під новою назвою створений вами.
--
--  ⚠️ ПЕРЕНОСИТЬСЯ ВСЕ, ЩО МОЖЕ ПЕРЕНЕСТИСЬ. Перша редакція цього блоку
--  просто робила update по кожній таблиці — і падала на першому ж
--  зіткненні, яке лишилось нерозвʼязаним. Через це не переносилось
--  НІЧОГО, включно з daily_stats, де жодних зіткнень і бути не може.
--  Перевірено на живій базі: одна таблиця без created_by (sync_logs)
--  зупиняла весь блок.
--
--  Тому тепер рядок, який уперся б в унікальність, лишається на місці
--  під старою назвою, а все інше переїжджає. У кінці сказано, що саме
--  лишилось — це і є той короткий список, який вирішують руками.
-- ════════════════════════════════════════════════════════════

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
          raise notice 'прибрано зайвих копій у %: %', t, dropped;
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
      raise notice 'перенесено % → %: % рядків', t, NEW_TEAM, moved;
    end if;

    execute format('select count(*) from public.%I where team_name = %L', t, OLD_TEAM)
      into stuck;
    if stuck > 0 then
      raise warning '% — % рядків лишились під «%»: їхній двійник створений не вами. '
                    'Гляньте й вирішіть руками, чиє налаштування головне.',
                    t, stuck, OLD_TEAM;
    end if;
  end loop;
  raise notice 'злиття завершено';
end $$;


--  ⚠️ І ОДРАЗУ ПІСЛЯ ЦЬОГО — у браузері асистента перемкнути команду на
--  нову назву. Поки там лежить стара, наступний імпорт знову підпишеться
--  нею, і все повернеться. Дашборд тепер попереджає про це сам при вході.
