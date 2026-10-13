-- ════════════════════════════════════════════════════════════
--  ▶ ЛЕНДІНГИ
--
--  ЗАЧИМ. У Keitaro «оффер» називається повністю так:
--
--      [Riddick's Partners] Pinco TJ | Form Girl | 50$ | Valera
--
--  Дашборд досі зводив це до короткого «Pinco» (matchOffer) — бо на
--  короткій назві тримаються виплати, звіти й злиття. А решта рядка
--  губилась, хоча саме вона й відповідає на питання «який лендінг
--  крутився»: під одним оффером їх кілька, і заходять вони по-різному.
--
--  ЩО ЛЕЖИТЬ У КОЛОНЦІ. Повний рядок як є, з нормалізованими
--  пробілами. НЕ розібраний на частини: порядок після «|» не
--  гарантований (у когось виплата друга, у когось імені немає), і
--  перший же оффер з іншим порядком тихо заллявся б не в ту графу.
--  Вгадувати тут нема чого — це те, що ти сам написав у Keitaro.
--
--  ЧОМУ ЦЕ НЕ ЛАМАЄ СУМИ. Лендінг строго дрібніший за офер: кожен
--  лендінг належить одному оферу. Імпорт тепер розносить спенд по
--  лендінгах замість оферів, тож рядків стає більше, а суми по оферах
--  лишаються ті самі.
--
--  Виконати: Supabase → SQL Editor → Run. Один раз.
-- ════════════════════════════════════════════════════════════

alter table public.daily_stats
  add column if not exists landing text;

-- Питання до цієї колонки одне: «які лендінги були в команди» (і далі
-- розріз по них). Без індексу це перебір усієї таблиці; з ним —
-- читання рівно потрібних рядків. Частковий, бо старі рядки лендінга
-- не мають і ніколи не матимуть.
create index if not exists daily_stats_landing_idx
  on public.daily_stats (team_name, landing)
  where landing is not null;


-- ════════════════════════════════════════════════════════════
--  ▶ ЗВІТ — що вийшло
-- ════════════════════════════════════════════════════════════

drop table if exists public._land_check;
create table public._land_check (what text, val text);
alter table public._land_check enable row level security;

insert into public._land_check
select 'колонка landing', case when exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'daily_stats'
     and column_name = 'landing') then 'є' else 'НЕМА' end;

insert into public._land_check
select 'індекс', case when exists (
  select 1 from pg_indexes
   where schemaname = 'public' and indexname = 'daily_stats_landing_idx')
  then 'є' else 'НЕМА' end;

insert into public._land_check
select 'рядків усього', count(*)::text from public.daily_stats;

insert into public._land_check
select 'з них із лендінгом', count(*)::text
  from public.daily_stats where landing is not null and btrim(landing) <> '';

-- Старі рядки лишаються без лендінга — це нормально: він зʼявляється
-- з наступного імпорту. Переписувати історію нема з чого: повного
-- рядка в базі ніколи не було.
insert into public._land_check
select 'лендінгів різних', count(distinct landing)::text
  from public.daily_stats where landing is not null;

select * from public._land_check;

-- Прибрати звіт, коли подивились:
--   drop table if exists public._land_check;
