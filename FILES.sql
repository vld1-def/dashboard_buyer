-- ============================================================
--  ФАЙЛОВИЙ ПРОВІДНИК — бакет 'files' + таблиця file_links
-- ============================================================
--
--  Файли лежать у Supabase Storage, у ПРИВАТНОМУ бакеті. Завантажити,
--  подивитись і скачати можна лише залогіненому, і лише через короткі
--  підписані адреси, які дашборд просить на десять хвилин. Публічного
--  посилання на файл не існує взагалі — на відміну від бакета
--  report-images, який читає будь-хто (див. SECURITY_RLS.sql).
--
--  Ця різниця тут головна. У файлі купленого акаунта лежать логін,
--  пошта, 2FA і куки — повний набір ключів. Найгірше, що можна було б
--  зробити, це покласти їх туди, звідки їх віддають без запитань.
--
--  ЩО ЦЕ НЕ РЯТУЄ. Файл лежить у вашому Supabase, і той, хто має
--  доступ до проєкту, має доступ і до файлів. Дашборд закриває шлях
--  «зайшов на сторінку — забрав усе», а не «адмін бази бачить усе».
--  Тримати тут ключі від сорока акаунтів — це свідомий вибір, у якому
--  один витік коштує всього парку. Менеджер паролів для такого
--  безпечніший; тут зручніше.
-- ============================================================


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1 — таблиця з підписами
-- ════════════════════════════════════════════════════════════
--  Storage уміє зберігати файл, але не вміє відповісти на питання «а
--  що з цього під KG». Для цього й таблиця.

create table if not exists public.file_links (
  id          bigserial primary key,
  team_name   text        not null,
  created_by  uuid,
  title       text        not null,   -- справжня назва файла
  path        text        not null,   -- ключ у бакеті
  mime        text,
  size        bigint,
  kind        text        not null default 'other',
  account_id  text,                   -- кабінет, якого це стосується
  note        text,
  at          timestamptz not null default now()
);

-- Колонки для тих, у кого таблиця лишилась із попередньої версії, де
-- зберігалось посилання на Drive замість самого файла.
alter table public.file_links
  add column if not exists path text,
  add column if not exists mime text,
  add column if not exists size bigint;

-- І прибираємо саме те посилання. Тут не можна обмежитись додаванням
-- колонок: у старій версії url був NOT NULL, а нова його не заповнює
-- ніколи — тож кожне завантаження падало б із «null value in column
-- "url" violates not-null constraint». Колонка належала задуму, де
-- файли лежали в Drive; у новому вона не потрібна й лише заважає.
alter table public.file_links drop column if exists url;

create index if not exists file_links_team_at_idx
  on public.file_links (team_name, at desc);

-- ── МІТКИ ВСЕРЕДИНІ ФАЙЛА ──
-- У тексті пишуть @1149896616961527 (кабінет) і #прогріта (вільний
-- тег). Дашборд вибирає їх із вмісту й кладе сюди.
--
-- Чому окремими колонками, а не пошуком по самому файлу: файли лежать
-- у приватному бакеті, і щоб знайти тег, довелось би скачати всі до
-- одного — двісті підписаних адрес і двісті завантажень на кожен
-- пошук. Мітки в таблиці роблять пошук одним запитом.
alter table public.file_links add column if not exists tags text[];
alter table public.file_links add column if not exists cabs text[];

-- gin — щоб «які файли з тегом X» лишалось швидким і на тисячі рядків.
create index if not exists file_links_tags_idx
  on public.file_links using gin (tags);
create index if not exists file_links_cabs_idx
  on public.file_links using gin (cabs);


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — доступ до таблиці
-- ════════════════════════════════════════════════════════════
--  Суворіше за решту дашборда, навмисно. Більшість таблиць читає
--  будь-хто з публічним ключем: статка — це числа, і найгірше, що з
--  ними станеться, це що їх побачать. А перелік того, що в команди
--  лежить по акаунтах, — це карта, і роздавати її анонімам не можна
--  навіть без самих файлів.
--
--  ⚠️ ЧИТАННЯ БУЛО using (true) — І ЦЕ БУЛА ПОМИЛКА.
--  Писати, правити й видаляти могли лише свої рядки, а ЧИТАТИ — будь-хто
--  залогінений. Поки баєр був один, «залогінений» означало «я». Другий
--  баєр у тому ж проєкті — і він бачить перелік чужих файлів: які
--  кабінети, які мітки, які нотатки. У самих файлах лежать логін,
--  пошта, 2FA і куки, тож навіть перелік — це вже карта.
--
--  Тепер видно тільки своє. Дашборд не змінюється: він і так питає
--  рядки своєї команди, просто тепер база не віддасть чужі.

alter table public.file_links enable row level security;

-- Старі рядки без автора. Після наступної політики вони зникнуть з
-- очей — не загубляться, а саме перестануть показуватись, бо нема з
-- чим звіряти. Кажемо про це ДО того, як це станеться.
do $$
declare n bigint;
begin
  select count(*) into n from public.file_links where created_by is null;
  if n > 0 then
    raise notice '⚠️ % файл(ів) без автора — після цього блоку вони зникнуть зі списку.', n;
    raise notice '   Підписати їх на себе: update public.file_links set created_by = auth.uid() where created_by is null;';
    raise notice '   (виконувати тим акаунтом, якому вони належать)';
  end if;
end $$;

drop policy if exists "files_read" on public.file_links;
create policy "files_read" on public.file_links
  for select to authenticated using (auth.uid() = created_by);

drop policy if exists "files_insert" on public.file_links;
create policy "files_insert" on public.file_links
  for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "files_update" on public.file_links;
create policy "files_update" on public.file_links
  for update to authenticated using (auth.uid() = created_by);

drop policy if exists "files_delete" on public.file_links;
create policy "files_delete" on public.file_links
  for delete to authenticated using (auth.uid() = created_by);

-- Без цього рядка публічний ключ дістався б до таблиці ще до політик.
revoke all on public.file_links from anon;
grant select, insert, update, delete on public.file_links to authenticated;
grant usage, select on sequence public.file_links_id_seq to authenticated;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 3 — бакет
-- ════════════════════════════════════════════════════════════
--  public = false — це і є та сама межа. Ставити true тут не можна
--  ніколи: у публічному бакеті адреса файла вгадується з його шляху, і
--  жодні політики цього вже не закриють.

insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do update set public = false;

-- ⚠️ І ТУТ БУЛО ВІДКРИТО ДЛЯ ВСІХ ЗАЛОГІНЕНИХ.
-- Закритий рядок у таблиці нічого не вартий, якщо сам файл віддається
-- кожному, хто ввійшов: шлях видно в підписаній адресі, а підписану
-- адресу бакет видавав будь-кому. Другий баєр міг не лише СКАЧАТИ
-- чужий файл з логінами й куками, а й ВИДАЛИТИ його.
--
-- Тепер кожна дія — лише над своїм. Автора файла Storage проставляє
-- сам при завантаженні; insert лишається без умови саме тому, що в
-- мить вставки автора ще немає — його ставить Storage після неї.
--
-- Колонка автора в storage.objects називається по-різному в різних
-- версіях Supabase (owner uuid — стара, owner_id text — нова). Тому не
-- вгадуємо, а дивимось, що є насправді: політика, написана під
-- неіснуючу колонку, не створиться зовсім, і бакет лишиться відкритим.
do $$
declare
  has_new boolean;
  ocol    text;   -- як називається колонка автора в цій версії Supabase
  cond    text;   -- умова «це моє» для політик
begin
  select exists (select 1 from information_schema.columns
                  where table_schema = 'storage' and table_name = 'objects'
                    and column_name = 'owner_id') into has_new;

  if has_new then
    ocol := 'owner_id';
    cond := 'owner_id = auth.uid()::text';
  elsif exists (select 1 from information_schema.columns
                 where table_schema = 'storage' and table_name = 'objects'
                   and column_name = 'owner') then
    ocol := 'owner';
    cond := 'owner = auth.uid()';
  else
    raise exception 'у storage.objects немає ні owner_id, ні owner — політику власника не побудувати';
  end if;

  -- Файли, завантажені до того, як автор узагалі записувався. Беремо
  -- його з підпису в file_links: шлях у бакеті і є path рядка, тож
  -- здогадуватись нема про що.
  execute format(
    'update storage.objects o set %I = f.created_by%s '
    'from public.file_links f '
    'where o.bucket_id = ''files'' and o.name = f.path '
    '  and f.created_by is not null and o.%I is null',
    ocol, case when has_new then '::text' else '' end, ocol);

  execute 'drop policy if exists "files_bucket_read" on storage.objects';
  execute format(
    'create policy "files_bucket_read" on storage.objects '
    'for select to authenticated using (bucket_id = ''files'' and %s)', cond);

  execute 'drop policy if exists "files_bucket_write" on storage.objects';
  execute
    'create policy "files_bucket_write" on storage.objects '
    'for insert to authenticated with check (bucket_id = ''files'')';

  -- Перезаписати наявний файл — це UPDATE на storage.objects, а не
  -- insert. Без цієї політики правка тексту у вікні падає з «new row
  -- violates row-level security policy»: завантажити новий файл можна,
  -- видалити можна, а зберегти поверх — ні.
  execute 'drop policy if exists "files_bucket_edit" on storage.objects';
  execute format(
    'create policy "files_bucket_edit" on storage.objects '
    'for update to authenticated using (bucket_id = ''files'' and %s) '
    'with check (bucket_id = ''files'' and %s)', cond, cond);

  execute 'drop policy if exists "files_bucket_drop" on storage.objects';
  execute format(
    'create policy "files_bucket_drop" on storage.objects '
    'for delete to authenticated using (bucket_id = ''files'' and %s)', cond);
end $$;

-- Файли в бакеті, у яких автора так і не знайшлось: рядка в file_links
-- немає або в рядку порожній created_by. Після політик вище вони не
-- відкриються нікому. Мовчати про це не можна — зникле без пояснення
-- читається як втрата.
do $$
declare n bigint; ocol text;
begin
  select case when exists (select 1 from information_schema.columns
                            where table_schema = 'storage' and table_name = 'objects'
                              and column_name = 'owner_id')
              then 'owner_id' else 'owner' end into ocol;
  execute format(
    'select count(*) from storage.objects where bucket_id = ''files'' and %I is null', ocol)
    into n;
  if n > 0 then
    raise notice '⚠️ % файл(ів) у бакеті без автора — вони більше не відкриються.', n;
    raise notice '   Знайти їх: select name from storage.objects where bucket_id = ''files'' and % is null;', ocol;
  end if;
end $$;


-- ════════════════════════════════════════════════════════════
--  ПОТІМ: подивитись і прибрати
-- ════════════════════════════════════════════════════════════
--
--  Скільки чого лежить:
--      select kind, count(*), pg_size_pretty(sum(size)::bigint)
--        from public.file_links group by kind order by 2 desc;
--
--  Сміття в бакеті — файли, на які вже немає рядка. Такого не має
--  бути: дашборд прибирає файл, якщо рядок не записався. Але якщо
--  колись трапиться, знайти їх можна так:
--      select o.name from storage.objects o
--       where o.bucket_id = 'files'
--         and not exists (select 1 from public.file_links f where f.path = o.name);
-- ════════════════════════════════════════════════════════════
