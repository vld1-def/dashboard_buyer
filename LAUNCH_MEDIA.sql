-- ═══════════ КРЕАТИВИ ШАБЛОНІВ ЗАПУСКУ ═══════════
-- Відео й картинки, які людина один раз завантажує в редакторі шаблону.
-- fb-launch при запуску бере файл звідси й заливає в цільовий кабінет.
-- Тека — назва команди; доступ лише своїй команді (як у post-images).

-- ═══════════ КАРТИНКИ ДЛЯ ПОСТІВ ═══════════
--
-- Бакет під зображення, які йдуть у пости на Сторінки.
--
-- ЧОМУ ПРИВАТНИЙ, ХОЧ КАРТИНКА ВСЕ ОДНО СТАНЕ ПУБЛІЧНОЮ. Стане — коли
-- ти вирішиш її опублікувати. До того це чернетка: креатив, який ще
-- обирають, порівнюють і відкидають. Публічний бакет означав би, що
-- кожна відкинута проба лежить за передбачуваною адресою, і подивитись
-- її може хто завгодно, кому та адреса трапилась.
--
-- ЯК ТОДІ ЇЇ БАЧИТЬ FACEBOOK. Він і не бачить бакет. Коли пост
-- відправляється, функція fb-post підписує тимчасове посилання на цей
-- файл і віддає його Graph. Facebook качає картинку в момент виклику —
-- навіть для запланованого поста, бо саме зображення створюється
-- одразу, відкладається лише публікація. Тобто посилання живе хвилини,
-- а не вічність.
--
-- Межа — КОМАНДА, а не автор: картинку заливає один, а пост від
-- Сторінки ставить інший. Так само зроблено в 'pwa-shots'.
--
-- my_team() і my_role() приходять із TEAM_ROLES.sql.
--
-- Виконати в Supabase → SQL Editor.

insert into storage.buckets (id, name, public)
values ('launch-media', 'launch-media', false)
on conflict (id) do update set public = false;

do $$
declare
  cond text := '(split_part(name, ''/'', 1) = public.my_team() '
             || 'or public.my_role() = ''admin'')';
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'my_team') then
    raise exception 'немає public.my_team() — спершу виконай TEAM_ROLES.sql';
  end if;

  execute 'drop policy if exists "lmedia_read" on storage.objects';
  execute format(
    'create policy "lmedia_read" on storage.objects '
    'for select to authenticated using (bucket_id = ''launch-media'' and %s)', cond);

  execute 'drop policy if exists "lmedia_write" on storage.objects';
  execute format(
    'create policy "lmedia_write" on storage.objects '
    'for insert to authenticated with check (bucket_id = ''launch-media'' and %s)', cond);

  execute 'drop policy if exists "lmedia_edit" on storage.objects';
  execute format(
    'create policy "lmedia_edit" on storage.objects '
    'for update to authenticated using (bucket_id = ''launch-media'' and %s) '
    'with check (bucket_id = ''launch-media'' and %s)', cond, cond);

  execute 'drop policy if exists "lmedia_delete" on storage.objects';
  execute format(
    'create policy "lmedia_delete" on storage.objects '
    'for delete to authenticated using (bucket_id = ''launch-media'' and %s)', cond);
end $$;

-- ПЕРЕВІРКА: бакет приватний, політик чотири.
select id, public from storage.buckets where id = 'launch-media';
select policyname from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'lmedia_%';
