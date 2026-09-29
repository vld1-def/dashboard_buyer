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


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — доступ до таблиці
-- ════════════════════════════════════════════════════════════
--  Суворіше за решту дашборда, навмисно. Більшість таблиць читає
--  будь-хто з публічним ключем: статка — це числа, і найгірше, що з
--  ними станеться, це що їх побачать. А перелік того, що в команди
--  лежить по акаунтах, — це карта, і роздавати її анонімам не можна
--  навіть без самих файлів.

alter table public.file_links enable row level security;

drop policy if exists "files_read" on public.file_links;
create policy "files_read" on public.file_links
  for select to authenticated using (true);

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

-- Читають, пишуть і видаляють лише залогінені. Анонімові — нічого.
drop policy if exists "files_bucket_read" on storage.objects;
create policy "files_bucket_read" on storage.objects
  for select to authenticated using (bucket_id = 'files');

drop policy if exists "files_bucket_write" on storage.objects;
create policy "files_bucket_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'files');

drop policy if exists "files_bucket_drop" on storage.objects;
create policy "files_bucket_drop" on storage.objects
  for delete to authenticated using (bucket_id = 'files');


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
