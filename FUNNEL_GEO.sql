-- ============================================================
--  ГЕО У ВОРОНКАХ
-- ============================================================
--
--  ЗАЧИМ. У funnels_mapping досі було лише дві речі про воронку:
--  назва й ktid. Під яке гео вона налаштована — ніде, і дізнатись це
--  можна було тільки з назви, якщо її туди вписали руками.
--
--  Найбільше це муляло під APP. Прілка — це завжди «апка під гео»:
--  той самий Pinco під UZ і під KZ це різні налаштування, різні
--  сабки й часто різні ktid. Без гео список апок у «Прілках» не
--  звузити, і людина щоразу вибирає з усього парку.
--
--  ЩО РОБИТЬ ЦЕЙ ФАЙЛ. Додає одну колонку. Дані не чіпаються:
--  у наявних рядків гео лишається порожнім, і сторінка це переживає
--  (порожнє гео означає «не вказано», а не «немає апок»).
--
--  Виконувати можна скільки завгодно разів.
-- ============================================================

alter table public.funnels_mapping
  add column if not exists geo text;

-- Пошук «які воронки під UZ» має бути дешевим: їх десятки, але
-- викликається він на кожне відкриття Прілок.
create index if not exists funnels_mapping_geo_idx
  on public.funnels_mapping (team_name, geo);


-- ════════════════════════════════════════════════════════════
--  ЗВІТ
--
--  Через таблицю, а не RAISE NOTICE: у SQL-редакторі Supabase
--  notice не видно, і там, де має бути підтвердження, лишається
--  «Success. No rows returned» — тобто невідомо, чи щось сталось.
-- ════════════════════════════════════════════════════════════

drop table if exists public._fun_geo;
create table public._fun_geo (
  "що"        text,
  "значення"  text
);
-- Службова таблиця теж під RLS: без цього її вміст видно всім
-- залогіненим, бо нові таблиці в public за замовчуванням видані
-- ролі authenticated.
alter table public._fun_geo enable row level security;

insert into public._fun_geo
select 'колонка geo', case when exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'funnels_mapping'
     and column_name = 'geo') then 'є' else 'НЕМА — щось пішло не так' end;

insert into public._fun_geo
select 'воронок усього', count(*)::text from public.funnels_mapping;

insert into public._fun_geo
select 'з них без гео', count(*)::text from public.funnels_mapping
 where geo is null or btrim(geo) = '';

insert into public._fun_geo
select 'гео, які вже стоять',
       coalesce(string_agg(distinct upper(btrim(geo)), ', ' order by upper(btrim(geo))), '—')
  from public.funnels_mapping where geo is not null and btrim(geo) <> '';

--  ⬇ ОСЬ ЦЕ Й Є ЗВІТ. Якщо тут порожньо — файл не виконався.
select * from public._fun_geo;

--  Далі: Form → Settings → Funnels, вписати гео наявним воронкам
--  (поле GEO поруч із назвою), тоді Ctrl+Shift+R.
--
--  І прибери звіт, коли переглянув:
--      drop table if exists public._fun_geo;
