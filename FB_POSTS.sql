-- ═══════════ ПОСТИ НА СТОРІНКИ FACEBOOK ═══════════
--
-- Таблиця тримає те, чого Facebook не віддає назад зручно: ЩО саме ми
-- збирались опублікувати, коли, і що з цього вийшло. Без неї
-- запланований пост існує лише всередині Facebook, і подивитись, що ти
-- поставив на завтра, нема де.
--
-- ЧОТИРИ СТАНИ, І ВОНИ НЕ ВЗАЄМОЗАМІННІ:
--   draft     — чернетка, ще нікуди не пішла;
--   scheduled — віддана Facebook із часом публікації; post_id уже є;
--   published — вийшла; post_id є;
--   failed    — Facebook відмовив, і error каже чому.
-- «failed» навмисно окремо від «draft»: чернетку ніхто не відправляв, а
-- тут була спроба, і її причину треба показати, а не мовчки повернути
-- пост у чернетки, ніби нічого не було.
--
-- ЧОМУ error ТЕКСТОМ, А НЕ ПРАПОРЦЕМ. Facebook відмовляє десятками
-- різних способів: немає дозволу, Сторінка не видана системному
-- користувачеві, час публікації поза межами, посилання в чорному
-- списку. «Не вдалося» не допомагає жодного разу.
--
-- Виконати в Supabase → SQL Editor.

create table if not exists public.fb_posts (
  id          bigserial primary key,
  team_name   text not null,
  page_id     text not null,
  page_name   text,                      -- копія на момент створення: Сторінку можуть перейменувати

  message     text not null default '',
  link        text,                      -- куди веде пост
  image_url   text,                      -- картинка за адресою; Graph уміє брати її сам

  status      text not null default 'draft'
              check (status in ('draft','scheduled','published','failed')),
  publish_at  timestamptz,               -- для scheduled; NULL = «зараз»
  post_id     text,                      -- що повернув Facebook
  error       text,                      -- чому не вийшло, дослівно

  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists fb_posts_team_idx on public.fb_posts (team_name, created_at desc);
create index if not exists fb_posts_page_idx on public.fb_posts (team_name, page_id);

alter table public.fb_posts enable row level security;

-- Читає вся команда: пост від імені Сторінки — спільна справа, і
-- побачити, що хтось уже поставив на сьогодні, має кожен.
drop policy if exists fb_posts_read_team on public.fb_posts;
create policy fb_posts_read_team on public.fb_posts for select
  using (team_name in (select team_name from public.team_members where user_id = auth.uid()));

-- Пише автор свого рядка. Чужі чернетки правити не можна: пост іде від
-- Сторінки, і «хто це написав» має лишатись відповіддю.
drop policy if exists fb_posts_write_own on public.fb_posts;
create policy fb_posts_write_own on public.fb_posts for all
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create or replace function public.fb_posts_touch() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists fb_posts_touch_trg on public.fb_posts;
create trigger fb_posts_touch_trg before update on public.fb_posts
  for each row execute function public.fb_posts_touch();

select status, count(*) from public.fb_posts group by status;
