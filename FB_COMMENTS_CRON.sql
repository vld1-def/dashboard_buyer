-- ════════════════════════════════════════════════════════════
--  КОМЕНТАРІ ПІД ОГОЛОШЕННЯМИ — кожні 30 хвилин
-- ════════════════════════════════════════════════════════════
--
--  Блоки виконують ПО ЧЕРЗІ в Supabase → SQL Editor.
--
--  ПЕРЕД ПОЧАТКОМ:
--    1. виконано FB_SYNC.sql цілком, разом із блоком alter table
--       (потрібні колонки comments_scanned_at і comments_seen_at);
--    2. задеплоєно функцію З КОРЕНЯ ПРОЄКТУ:
--          supabase functions deploy fb-comments
--       (у supabase/config.toml їй вимкнена перевірка JWT шлюзом);
--    3. зроблено БЛОК 1-3 з FB_SYNC_CRON.sql — розширення, адреса
--       функції та спільний ключ. Ключ тут той самий, другого не треба.
--
--  ЩО ЦЕ РОБИТЬ
--  Обходить кабінети по колу — першими ті, яких найдовше не дивились, —
--  знаходить коментарі, написані з часу минулого обходу, ховає їх і
--  надсилає власнику кабінета в Telegram.
--
--  ЧОГО ЦЕ НЕ РОБИТЬ: не видаляє. Ніколи й нізвідки з розкладу.
--  Приховування оборотне, видалення — ні, тому видаляє тільки людина
--  кнопкою в дашборді.
--
--  ПЕРШИЙ ОБХІД кабінета нічого не ховає й ні про що не пише: він лише
--  запамʼятовує час. Інакше ввімкнення означало б сотню повідомлень про
--  коментарі піврічної давнини й сховану піврічну переписку.
--
--  ВИМКНУТИ ПРИХОВУВАННЯ, лишивши сповіщення:
--    Налаштування → Інтеграції → Facebook → «Hide new comments
--    automatically».
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 1 — ПРОБНИЙ ЗАПУСК, не чекаючи розкладу
--
--  Виконайте обидва запити: перший запускає обхід, другий показує, чим
--  він скінчився. Між ними зачекайте секунд 20-60.
-- ════════════════════════════════════════════════════════════

select net.http_post(
  url     := (select decrypted_secret from vault.decrypted_secrets
               where name = 'project_url') || '/functions/v1/fb-comments',
  headers := jsonb_build_object(
               'Content-Type', 'application/json',
               'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets
                                 where name = 'check_domains_cron_key')),
  body    := '{"action":"scan"}'::jsonb
) as request_id;


-- Другим запитом — що відповіла функція:
select status_code,
       convert_from(content, 'UTF8')::jsonb as answer
  from net._http_response
 order by id desc
 limit 1;

--  ЩО МАЄ БУТИ
--    scanned  — скільки кабінетів обійшли цього разу
--    found    — скільки нових коментарів знайшли
--    hidden   — скільки з них сховали
--    telegram — «N sent» або причина, чому не надіслали
--
--  Перший запуск майже напевно дасть found: 0 — і це правильно
--  (див. «ПЕРШИЙ ОБХІД» угорі). Запустіть ще раз за півгодини.
--
--  «the comment columns are missing» — не виконано блок alter table
--  з FB_SYNC.sql.


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — сам розклад
--
--  Виконуйте лише після того, як БЛОК 1 дав 200.
--  Кожні 30 хвилин. Хочете рідше — поміняйте '*/30 * * * *'
--  (наприклад, '0 * * * *' — щогодини).
-- ════════════════════════════════════════════════════════════

select cron.schedule(
  'fb-comments-scan',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'project_url') || '/functions/v1/fb-comments',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets
                                   where name = 'check_domains_cron_key')),
    body    := '{"action":"scan"}'::jsonb
  );
  $$
);


-- ────────────────────────────────────────────────────────────
--  ПЕРЕВІРИТИ, ЩО РОЗКЛАД СТОЇТЬ
--
--    select jobname, schedule, active from cron.job
--     where jobname = 'fb-comments-scan';
--
--  ЗУПИНИТИ:
--
--    select cron.unschedule('fb-comments-scan');
-- ────────────────────────────────────────────────────────────
