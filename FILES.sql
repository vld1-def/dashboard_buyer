-- ============================================================
--  ФАЙЛИ — file_links
-- ============================================================
--
--  ЩО ТУТ ЛЕЖИТЬ І ЧОГО ТУТ НЕМАЄ.
--
--  Тут лежать ПОСИЛАННЯ на файли в Google Drive і те, що про них
--  треба памʼятати: що це, до якого кабінета, коли додали. Самих
--  файлів тут немає й бути не може.
--
--  Це не лінь, а єдиний спосіб зробити це безпечно. Купивши акаунт,
--  ви отримуєте файл, де лежать логін, пароль, пошта, 2FA і куки, —
--  тобто повний набір ключів. Дашборд стоїть на GitHub Pages, його
--  публічний ключ лежить у вихідному коді сторінки й сховати його
--  неможливо за задумом (див. SECURITY_RLS.sql). Один витік коштував
--  би не «хтось побачив статку», а всі акаунти одразу.
--
--  Тому ключі лишаються в Drive, під вашим доступом Google, а тут —
--  лише адреса й підпис. Хто не має доступу до папки, той за
--  посиланням не побачить нічого.
--
--  З ТІЄЇ Ж ПРИЧИНИ В NOTE НЕ МОЖНА ПИСАТИ ПАРОЛІ. Поле note — для
--  «взяв у такого-то», «під KG», «замінив 12.09». Сторінка про це
--  попереджає, але база не може, тож памʼятайте самі.
-- ============================================================

create table if not exists public.file_links (
  id          bigserial primary key,
  team_name   text        not null,
  created_by  uuid,
  title       text        not null,   -- що це
  url         text        not null,   -- адреса в Drive
  kind        text        not null default 'other',
  account_id  text,                   -- кабінет, якого це стосується
  note        text,
  at          timestamptz not null default now()
);

create index if not exists file_links_team_at_idx
  on public.file_links (team_name, at desc);


-- ============================================================
--  ДОСТУП
-- ============================================================
--  Тут RLS СУВОРІША за решту дашборда, і навмисно.
--
--  Більшість таблиць тут читає будь-хто з публічним ключем: статка —
--  це числа, і найгірше, що з ними станеться, це що їх побачать. А
--  список «ось усі наші акаунти й де лежать ключі від них» — це вже
--  карта, і роздавати її анонімам не можна навіть без самих ключів.
--
--  Тож читають лише залогінені, а міняє рядок той, хто його створив.
-- ============================================================

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

-- Анонімові не лишаємо нічого: без цього рядка grant за
-- замовчуванням пустив би публічний ключ до таблиці ще до політик.
revoke all on public.file_links from anon;
grant select, insert, update, delete on public.file_links to authenticated;
grant usage, select on sequence public.file_links_id_seq to authenticated;


-- ============================================================
--  АДРЕСА ПАПКИ
-- ============================================================
--  Кнопка «Open FILES folder» на сторінці бере адресу з налаштувань
--  команди — окремої таблиці для одного рядка не треба:
--
--    key = 'files_folder_url', value = 'https://drive.google.com/…'
--
--  Ставиться прямо на сторінці Files, руками вписувати не потрібно.
-- ============================================================
