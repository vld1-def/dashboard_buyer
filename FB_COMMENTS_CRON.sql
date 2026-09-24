-- ════════════════════════════════════════════════════════════
--  КОМЕНТАРІ ПІД ОГОЛОШЕННЯМИ — кожні 30 хвилин
-- ════════════════════════════════════════════════════════════
--
--  Блоки виконують ПО ЧЕРЗІ в Supabase → SQL Editor: скопіювали блок,
--  натиснули Run, подивились результат, перейшли до наступного.
--
--  ПЕРЕД ПОЧАТКОМ:
--    1. виконано FB_SYNC.sql цілком, разом із блоком alter table
--       (потрібні колонки comments_scanned_at і comments_seen_at);
--    2. задеплоєно функцію З КОРЕНЯ ПРОЄКТУ:
--          supabase functions deploy fb-comments
--       У supabase/config.toml їй вимкнена перевірка JWT шлюзом —
--       розклад ходить без токена людини. Деплоїте звідкись іншого
--       або через інтерфейс — додайте флаг явно:
--          supabase functions deploy fb-comments --no-verify-jwt
--    3. зроблено БЛОКИ 1-3 з FB_SYNC_CRON.sql: розширення, адреса
--       fb-sync і спільний ключ. Ключ тут той самий, другого не треба,
--       а адресу цієї функції БЛОК 2 нижче виведе з адреси fb-sync.
--
--  ЩО ЦЕ РОБИТЬ
--  Обходить кабінети по колу — першими ті, яких найдовше не дивились, —
--  знаходить коментарі, написані з часу минулого обходу, ховає їх і
--  надсилає власнику кабінета в Telegram разом із текстом.
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
--  ▶ БЛОК 1 — чи все на місці
--
--  Цей блок нічого не міняє. Він дивиться, що вже лежить у сховищі, і
--  каже, з чого починати. Без нього наступні блоки впираються в
--  «null value in column url» — помилку, з якої незрозуміло нічого.
-- ════════════════════════════════════════════════════════════

select
  (select count(*) from vault.decrypted_secrets where name = 'fb_sync_url')
    as "адреса fb-sync",
  (select count(*) from vault.decrypted_secrets where name = 'check_domains_cron_key')
    as "спільний ключ",
  (select count(*) from vault.decrypted_secrets where name = 'fb_comments_url')
    as "адреса fb-comments",
  case
    when (select count(*) from vault.decrypted_secrets where name = 'fb_sync_url') = 0
      then 'немає адреси fb-sync — спершу зробіть БЛОК 2 з FB_SYNC_CRON.sql'
    when (select count(*) from vault.decrypted_secrets where name = 'check_domains_cron_key') = 0
      then 'немає спільного ключа — спершу зробіть БЛОК 3 з FB_SYNC_CRON.sql'
    when (select count(*) from vault.decrypted_secrets where name = 'fb_comments_url') > 0
      then 'усе на місці, адреса вже є — БЛОК 2 пропускаємо, далі БЛОК 3'
    else 'усе на місці — далі БЛОК 2'
  end as "що далі";


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 2 — адреса функції
--
--  Вписувати нічого не треба: беремо адресу fb-sync, яка вже лежить у
--  сховищі, і міняємо в ній хвіст. Так неможливо помилитись у назві
--  проєкту, і другого місця, де ту саму адресу довелось би правити
--  руками, не зʼявляється.
--
--  Якщо БЛОК 1 сказав «адреса вже є» — цей блок ПРОПУСТІТЬ:
--  vault.create_secret на друге те саме імʼя відповість помилкою.
--
--  У відповідь прийде UUID. Це не секрет, нікуди його вставляти не
--  треба — просто номер рядка у сховищі. Порожня відповідь означає,
--  що адреси fb-sync немає: поверніться до БЛОКУ 1.
-- ════════════════════════════════════════════════════════════

select vault.create_secret(
  replace(s.decrypted_secret, '/fb-sync', '/fb-comments'),
  'fb_comments_url',
  'Коментарі під оголошеннями: адреса функції')
from vault.decrypted_secrets s
where s.name = 'fb_sync_url';


-- Перевірити, що вийшло (сама адреса, без секретів):
select decrypted_secret as "адреса"
  from vault.decrypted_secrets
 where name = 'fb_comments_url';

--  Має бути:  https://ВАШ-ПРОЄКТ.supabase.co/functions/v1/fb-comments


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 3 — ПРОБНИЙ ЗАПУСК, не чекаючи розкладу
--
--  Виконайте ОБИДВА запити: перший запускає обхід, другий показує, чим
--  він скінчився. Між ними зачекайте секунд 20-60.
-- ════════════════════════════════════════════════════════════

select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets
           where name = 'fb_comments_url'),
  headers := jsonb_build_object(
    'content-type', 'application/json',
    'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets
                      where name = 'check_domains_cron_key')),
  body := '{"action":"scan"}'::jsonb,
  -- Функція сама стежить за часом і виходить на 100-й секунді.
  timeout_milliseconds := 120000
) as request_id;


-- Другим запитом — що відповіла функція.
--
-- Без жодних перетворень навмисно: у pg_net колонка content у різних
-- версіях то text, то bytea, і будь-яке приведення типу працює рівно
-- на одній із них. Читається воно й так, а запит, який залежить від
-- версії розширення, у інструкції не має права стояти.
select status_code, content, created
  from net._http_response
 order by created desc
 limit 3;

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
--
--  Порожня відповідь або status_code 000 — функція не відповіла:
--  перевірте, що вона задеплоєна.


-- ════════════════════════════════════════════════════════════
--  ▶ БЛОК 4 — сам розклад
--
--  Виконуйте лише після того, як БЛОК 3 дав 200.
--
--  Кожні півгодини, на 13-й і 43-й хвилині. Не на нульовій і не на
--  тридцятій навмисно: там уже стоїть усе, що ставили «раз на пів
--  години», і ставати в ту саму чергу нема потреби. Заразом
--  розходимось із щогодинним fb-sync, який ходить на сьомій.
--
--  Хочете рідше — поміняйте розклад на '13 * * * *' (щогодини).
-- ════════════════════════════════════════════════════════════

select cron.schedule(
  'fb-comments-scan',
  '13,43 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
             where name = 'fb_comments_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets
                        where name = 'check_domains_cron_key')),
    body := '{"action":"scan"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$);


-- ────────────────────────────────────────────────────────────
--  ПЕРЕВІРИТИ, ЩО РОЗКЛАД СТОЇТЬ
--
--    select jobname, schedule, active from cron.job
--     where jobname = 'fb-comments-scan';
--
--  ЯК ХОДИТЬ (останні прогони):
--
--    select status_code, content, created
--      from net._http_response
--     order by created desc
--     limit 10;
--
--  ЗУПИНИТИ:
--
--    select cron.unschedule('fb-comments-scan');
-- ────────────────────────────────────────────────────────────
