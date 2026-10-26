-- ============================================================
--  ДИЗАЙН PWA — бакет 'pwa-shots'
-- ============================================================
--
--  У шаблонах PWA праворуч на картці стоїть превю: як ця пва
--  виглядає. Картинка лежить у Storage, а ключем їй служить KTID із
--  назви кампанії (Mbank_KG_10708-ex8g_09/10 → 10708-ex8g).
--
--  ЧОМУ KTID, А НЕ НАЗВА КАМПАНІЇ. Назва щодня інша — у ній дата
--  заливу. Воронка та сама. Прив'язка до назви означала б заливати
--  той самий скрін щодня наново.
--
--  ШЛЯХ: <team_name>/<ktid>. Перший кусок шляху і є те, чим
--  розмежовані команди — політики нижче дивляться саме на нього.
--
--  БАКЕТ ЗАКРИТИЙ. Дизайн — не логіни з куками (для таких є бакет
--  'files', див. FILES.sql), але й не те, що варто віддавати кожному,
--  хто вгадав шлях: за скріном видно і оффер, і підхід. Тому
--  приватний бакет і короткі підписані адреси, які дашборд просить
--  на пів години.
--
--  ЧОГО ЦЕ НЕ РЯТУЄ. Хто має доступ до проєкту Supabase — має доступ
--  і до картинок. Закривається шлях «відкрив сторінку — забрав усе»,
--  а не «адмін бази бачить усе».
-- ============================================================

-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1 — сам бакет
-- ════════════════════════════════════════════════════════════
--  on conflict do update, а не do nothing: якщо бакет колись
--  створили публічним, цей рядок мусить його закрити, а не
--  промовчати.

insert into storage.buckets (id, name, public)
values ('pwa-shots', 'pwa-shots', false)
on conflict (id) do update set public = false;


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — політики: своя команда, і лише вона
-- ════════════════════════════════════════════════════════════
--  Дизайн — спільна річ команди, а не особиста: його заливає один, а
--  дивляться всі. Тому межа тут КОМАНДА, а не автор файла (на
--  відміну від бакета 'files', де межа саме автор).
--
--  my_team() і my_role() приходять із TEAM_ROLES.sql — виконай його
--  раніше, якщо ще не виконував.
--
--  split_part(name, '/', 1) — перший кусок шляху, тобто назва
--  команди. Admin бачить усі команди: він і так бачить усі дані.

do $$
declare
  cond text := '(split_part(name, ''/'', 1) = public.my_team() '
             || 'or public.my_role() = ''admin'')';
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'my_team') then
    raise exception 'немає public.my_team() — спершу виконай TEAM_ROLES.sql';
  end if;

  execute 'drop policy if exists "pwashots_read" on storage.objects';
  execute format(
    'create policy "pwashots_read" on storage.objects '
    'for select to authenticated using (bucket_id = ''pwa-shots'' and %s)', cond);

  execute 'drop policy if exists "pwashots_write" on storage.objects';
  execute format(
    'create policy "pwashots_write" on storage.objects '
    'for insert to authenticated with check (bucket_id = ''pwa-shots'' and %s)', cond);

  -- Перезалив поверх наявного скріна — це UPDATE, а не insert. Без
  -- цієї політики перший залив проходить, а заміна падає з «new row
  -- violates row-level security policy».
  execute 'drop policy if exists "pwashots_edit" on storage.objects';
  execute format(
    'create policy "pwashots_edit" on storage.objects '
    'for update to authenticated using (bucket_id = ''pwa-shots'' and %s) '
    'with check (bucket_id = ''pwa-shots'' and %s)', cond, cond);

  execute 'drop policy if exists "pwashots_delete" on storage.objects';
  execute format(
    'create policy "pwashots_delete" on storage.objects '
    'for delete to authenticated using (bucket_id = ''pwa-shots'' and %s)', cond);
end $$;


-- ════════════════════════════════════════════════════════════
--  ▶ ПЕРЕВІРКА
-- ════════════════════════════════════════════════════════════
--  Бакет мусить бути приватним, політик — чотири.

select id, public from storage.buckets where id = 'pwa-shots';
select policyname from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'pwashots_%'
 order by policyname;
