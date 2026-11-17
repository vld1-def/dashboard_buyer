-- ═══════════ МОДЕРАЦІЯ КРЕАТИВІВ: ЖУРНАЛ REJECT / ACTIVE ═══════════
--
-- «створити розділ, де буде список reject, active і дата, і буде
-- лічильник; з FB LIVE тягнути статуси; інший статус не потрібен, і
-- дублікатів не робити; прописувати, на якому кабінеті реджект».
--
-- ЩО ТУТ ЛЕЖИТЬ. Знімок fb_ad_today переписується при кожному Sync,
-- тож учорашніх статусів у ньому вже немає. Цей журнал їх ТРИМАЄ:
-- fb-sync при кожному прогоні дописує сюди оголошення зі статусом
-- ACTIVE (пройшло модерацію й крутиться) або DISAPPROVED (реджект).
--
-- БЕЗ ДУБЛІКАТІВ. Ключ — оголошення + статус: одне оголошення з одним
-- статусом записується ОДИН раз назавжди, скільки б синків його не
-- бачили. Відхилили, а після правки пропустили — два записи: реджект і
-- active. Тобто лічильник рахує ЗАПУСКИ через модерацію, а не синки.
--
-- Креатив — це назва оголошення (name). cr_key — та сама назва,
-- зведена так само, як у правилах під креатив: без регістру, «-» = «_»,
-- без розширення файлу. За ним сторінка й шукає записи креатива.
--
-- reason — причина реджекту від Facebook (ad_review_feedback), якщо
-- він її дав.
--
-- Рахуємо з дня, коли це виконали: минулих реджектів Facebook не
-- віддає.
--
-- Виконати в Supabase → SQL Editor. Повторний запуск нічого не ламає.

create table if not exists public.fb_ad_moderation (
  created_by  uuid not null references auth.users(id) on delete cascade,
  team_name   text,
  ad_id       text not null,
  status      text not null check (status in ('ACTIVE', 'DISAPPROVED')),
  account_id  text not null,
  ad_name     text,
  cr_key      text,
  reason      text,
  first_seen  timestamptz not null default now(),
  primary key (created_by, ad_id, status)
);

create index if not exists fb_ad_moderation_cr_idx
  on public.fb_ad_moderation (cr_key, first_seen desc);
create index if not exists fb_ad_moderation_team_idx
  on public.fb_ad_moderation (team_name, first_seen desc);

alter table public.fb_ad_moderation enable row level security;

-- Читає власник; асистент — свого баєра; тімлід — свою команду; адмін —
-- усіх. Ті самі правила, що й для решти даних (TEAM_ROLES.sql,
-- ADMIN_ROLES.sql). Пише лише fb-sync ключем сервісної ролі, тож
-- політик на запис немає навмисно.
drop policy if exists fb_ad_moderation_read on public.fb_ad_moderation;
create policy fb_ad_moderation_read on public.fb_ad_moderation
  for select using (
    auth.uid() = created_by
    or public.can_read_mine(created_by)
    or public.can_read_team(team_name)
  );

grant select on public.fb_ad_moderation to authenticated;
