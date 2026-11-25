-- ═══════════ КОМЕНТАРІ ПО СТОРІНКАХ: ДЕ Є НОВІ ═══════════
--
-- «було б круто щоб коли відкриваю pages там сразу відкривались фанки
-- де є коменти». Розклад fb-comments (scan) пише сюди час останнього
-- нового коментаря на Сторінці; панель Pages ставить seen_at, коли
-- Сторінку відкрили. last_comment_at > seen_at — є непрочитане, і
-- панель розкриває таку Сторінку сама.
--
-- Пише лише функція (service role). Людина бачить тільки свої рядки.
-- Повторний запуск нічого не ламає.

create table if not exists public.fb_page_activity (
  created_by       uuid not null,
  page_id          text not null,
  page_name        text,
  last_comment_at  timestamptz,
  new_count        integer not null default 0,
  seen_at          timestamptz,
  primary key (created_by, page_id)
);

alter table public.fb_page_activity enable row level security;

drop policy if exists "fpa_read" on public.fb_page_activity;
create policy "fpa_read" on public.fb_page_activity
  for select to authenticated using (auth.uid() = created_by);

revoke all on public.fb_page_activity from anon;
grant select on public.fb_page_activity to authenticated;
