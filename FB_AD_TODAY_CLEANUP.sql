-- ════════════════════════════════════════════════════════════
--  ЗНІМОК fb_ad_today: ЩОДЕННЕ ОЧИЩЕННЯ АРХІВНИХ КАБІНЕТІВ
-- ════════════════════════════════════════════════════════════
--  «давай дані яким більше 14 днів чистити з fb today, займають
--  пам'ять, і сайт лагає» → «точніше якщо акаунт 14 днів в архіві».
--
--  ЧОМУ ЗНІМОК РОСТЕ. Sync now переписує рядки лише тих кабінетів,
--  які синкав. Рядки решти лишаються зі спендом дня, коли їх синкали
--  востаннє, — і сторінка Cabinets щоразу тягне їх усі, разом з
--  actions. На 2026-11-07 у таблиці було 8 250 рядків, з них 4 228 —
--  кабінетів, що лежать в архіві.
--
--  ПРАВИЛО: рядок видаляється, коли його кабінет В АРХІВІ (статус
--  'archive' в accounts_mapping) ВЖЕ 7+ ДНІВ (до 2026-11-10 було 14). Відлік — від ОСТАННЬОГО
--  переходу в архів у журналі account_events: кабінет, який повертали
--  з архіву й переархівували, починає відлік заново.
--
--  Кабінети не в архіві не чіпаються, хоч би якими старими були їхні
--  рядки. Знімок — не історія: наступний Sync now запише свіжі цифри
--  для будь-якого живого кабінета.
--
--  Розклад: щодня о 03:00 UTC. Виконати цей файл можна й повторно —
--  функція замінюється, розклад з тим самим іменем теж.
--
--  ОДНОРАЗОВО 2026-11-07 вже видалено 1 737 рядків: кабінет в архіві
--  І рядок не оновлювався 14+ днів (01.10–20.10, 36 кабінетів).
-- ════════════════════════════════════════════════════════════

-- 2026-11-23: «почистити старі дані в архіві» і «архів чистити раз в 3 дня».
-- 2026-11-26: «пройшло багато днів а воно щось не чистить». Архів чистився
-- справно — на ньому лишалось 184 рядки. Знімок роздували ІНШІ рядки:
-- 3 128 рядків, яких Facebook не оновлював 3–7 тижнів (38 забанених і 11
-- «active» кабінетів без оголошень, не в архіві). Знімок — лише «сьогодні»,
-- історія спенду лежить у fb_spend_daily, тож рядок, не оновлений 3+ дні, —
-- просто застарілі цифри. Тепер видаляємо: архівні кабінети І все, що не
-- оновлювалось 3+ дні. Розклад — щодня о 03:00 UTC.
-- Того ж дня вручну: видалено 3 312 рядків, лишилось 658 (19 кабінетів).
create or replace function public.fb_ad_today_cleanup()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  with arch as (
    select distinct regexp_replace(m.account_id, '\D', '', 'g') as id from public.accounts_mapping m where lower(m.status) = 'archive'
    union
    select distinct regexp_replace(coalesce(m.fb_account_id, ''), '\D', '', 'g') from public.accounts_mapping m where lower(m.status) = 'archive'
  ), gone as (
    delete from public.fb_ad_today t
     where t.seen_at < now() - interval '3 days'
        or exists (select 1 from arch a where a.id <> '' and a.id = t.account_id)
    returning 1
  )
  select count(*) into n from gone;
  return n;
end;
$$;
revoke all on function public.fb_ad_today_cleanup() from public, anon, authenticated;

select cron.schedule(
  'fb-ad-today-cleanup',
  '0 3 * * *',
  $$ select public.fb_ad_today_cleanup(); $$
);

-- ════════════════════════════════════════════════════════════
--  ПЕРЕВІРКА
--    select * from cron.job where jobname = 'fb-ad-today-cleanup';
--    select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'fb-ad-today-cleanup')
--     order by start_time desc limit 5;
--
--  ВИМКНУТИ
--    select cron.unschedule('fb-ad-today-cleanup');
-- ════════════════════════════════════════════════════════════
