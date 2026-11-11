-- ════════════════════════════════════════════════════════════
--  НІЧНА ПЕРЕВІРКА ПРІЛОК НЕ ПРАЦЮВАЛА З 2026-10-28
--
--  Розклад apps-check запускався щоночі, але стукав на адресу
--  «https://ВАШ-ПРОЄКТ.supabase.co/…» з ключем-заглушкою: APP_LINK.sql
--  виконали, не замінивши два значення. Запит нікуди не доходив, і
--  прілки перевірялись лише коли їх відкривали на сторінці руками.
--
--  ЩО ЗРОБИТИ (один раз):
--   1. Придумай довгий ключ (30+ латинських літер і цифр).
--   2. Supabase → Edge Functions → Secrets → CHECK_APPS_CRON_KEY:
--      впиши цей ключ (старе значення заміниться).
--   3. Нижче заміни СЮДИ-ТОЙ-САМИЙ-КЛЮЧ на нього ж і виконай файл.
--
--  Розклад уже змінено на три рази за ніч: 22:40, 01:40 і 04:40 UTC
--  (00:40, 03:40 і 06:40 за Києвом узимку).
-- ════════════════════════════════════════════════════════════

select vault.update_secret(
  (select id from vault.secrets where name = 'check_apps_url'),
  'https://zsfumuiajrytmeycbtnn.supabase.co/functions/v1/check-apps');

select vault.update_secret(
  (select id from vault.secrets where name = 'check_apps_cron_key'),
  'СЮДИ-ТОЙ-САМИЙ-КЛЮЧ');

-- ПЕРЕВІРКА: запустити перевірку зараз і за хвилину глянути відповідь.
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'check_apps_url'),
--     headers := jsonb_build_object('content-type', 'application/json', 'x-cron-key',
--       (select decrypted_secret from vault.decrypted_secrets where name = 'check_apps_cron_key')),
--     body := '{}'::jsonb, timeout_milliseconds := 120000);
--   select status_code, left(content::text, 300) from net._http_response order by created desc limit 1;
--  200 і перелік прілок — працює. 401 — ключі в двох місцях різні.
