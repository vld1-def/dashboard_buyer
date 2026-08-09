-- ============================================================
--  DASHBOARD BUYER — ЗАХИСТ БАЗИ (Supabase Row Level Security)
-- ============================================================
--
--  ГОЛОВНЕ, ЩО ТРЕБА ЗРОЗУМІТИ:
--
--  1) Ключ 'sb_publishable_...' у коді сторінки — ПУБЛІЧНИЙ за задумом.
--     Його НЕ можна сховати у статичному сайті. Захист дає НЕ ключ,
--     а RLS-політики нижче. Тому "ховати ключ" сенсу не має.
--
--  2) Зараз будь-хто з цим ключем може ЧИТАТИ, ПИСАТИ і ВИДАЛЯТИ всі дані.
--     Цей файл це закриває: читати можна публічно, а писати/видаляти —
--     лише залогіненим через Supabase Auth.
--
--  ⚠️ ВАЖЛИВО: після застосування ЧАСТИНИ B збереження в дашборді та у
--     Form.html працюватиме ЛИШЕ якщо у застосунку доданий логін Supabase
--     Auth (email+пароль). Без логіна редагування перестане працювати
--     (читання лишиться). Тобто спочатку домовляємось про логін у коді,
--     потім вмикаємо B. ЧАСТИНУ A можна вмикати одразу.
--
--  Де запускати: Supabase Dashboard → SQL Editor → New query → Run.
-- ============================================================


-- ============================================================
--  ЧАСТИНА A — увімкнути RLS і дозволити ПУБЛІЧНЕ ЧИТАННЯ
--  (безпечно вмикати одразу — дашборд продовжить показувати дані)
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'daily_stats','creatives_stats','payouts','expenses',
    'tasks','daily_reports','team_settings','quick_links',
    'change_log','accounts_mapping','funnels_mapping'
  ]
  LOOP
    -- пропускаємо таблиці, яких немає
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

      EXECUTE format('DROP POLICY IF EXISTS "public_read" ON public.%I;', t);
      EXECUTE format(
        'CREATE POLICY "public_read" ON public.%I FOR SELECT TO anon, authenticated USING (true);', t);
    END IF;
  END LOOP;
END $$;

-- Після ЧАСТИНИ A: anon (публічний ключ) вже НЕ може писати/видаляти
-- (бо RLS увімкнено, а політик на INSERT/UPDATE/DELETE для anon немає).
-- Дашборд-перегляд працює. Але й твоє редагування через дашборд/Form.html
-- зупиниться, поки не додано логін і ЧАСТИНУ B.


-- ============================================================
--  ЧАСТИНА B — дозволити ЗАПИС лише залогіненим (authenticated)
--  Вмикати ПІСЛЯ того, як у застосунок додано Supabase Auth-логін.
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'daily_stats','creatives_stats','payouts','expenses',
    'tasks','daily_reports','team_settings','quick_links',
    'change_log','accounts_mapping','funnels_mapping'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS "auth_insert" ON public.%I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "auth_update" ON public.%I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "auth_delete" ON public.%I;', t);

      EXECUTE format(
        'CREATE POLICY "auth_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true);', t);
      EXECUTE format(
        'CREATE POLICY "auth_update" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', t);
      EXECUTE format(
        'CREATE POLICY "auth_delete" ON public.%I FOR DELETE TO authenticated USING (true);', t);
    END IF;
  END LOOP;
END $$;


-- ============================================================
--  STORAGE (звіти з фото — бакет 'report-images')
--  Читання публічне, завантаження — лише залогіненим.
-- ============================================================
-- Читання файлів:
DROP POLICY IF EXISTS "report_images_read" ON storage.objects;
CREATE POLICY "report_images_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'report-images');

-- Завантаження/зміна файлів лише залогіненим:
DROP POLICY IF EXISTS "report_images_write" ON storage.objects;
CREATE POLICY "report_images_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'report-images');


-- ============================================================
--  ПРО ПАРОЛЬ (site_password / tl_password)
-- ============================================================
--  Зараз пароль зберігається в team_settings і завантажується в браузер
--  у відкритому вигляді — його видно в DevTools → Network. Тобто це
--  "замок на дверях, а стіни немає": дані все одно тягнуться публічним
--  ключем повз пароль.
--
--  Правильно: замість власного пароля використовувати Supabase Auth
--  (email + пароль). Тоді:
--    - пароль ніколи не приходить у браузер;
--    - RLS вище реально захищає запис;
--    - можна дати кожному члену команди окремий акаунт і відкликати доступ.
--
--  Кроки:
--    1. Supabase → Authentication → Users → Add user (email + пароль).
--    2. У застосунок додається екран логіну (sb.auth.signInWithPassword).
--    3. Вмикаємо ЧАСТИНУ B цього файлу.
-- ============================================================
