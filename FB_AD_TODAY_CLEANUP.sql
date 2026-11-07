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
--  'archive' в accounts_mapping) ВЖЕ 14+ ДНІВ. Відлік — від ОСТАННЬОГО
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

create or replace function public.fb_ad_today_cleanup()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  with arch as (
    -- Кабінет зараз в архіві і з якої миті — останній перехід у 'archived'.
    select replace(m.account_id, 'act_', '') as account_id,
           m.team_name, m.created_by,
           (select max(e.at) from public.account_events e
             where e.account_id = m.account_id
               and e.team_name = m.team_name
               and e.to_state = 'archived') as since
      from public.accounts_mapping m
     where lower(m.status) = 'archive'
  ), gone as (
    delete from public.fb_ad_today t
     using arch a
     where a.account_id = t.account_id
       and (a.team_name = t.team_name or a.created_by = t.created_by)
       and a.since is not null
       and a.since < now() - interval '14 days'
    returning 1
  )
  select count(*) into n from gone;
  return n;
end;
$$;

-- Кличе лише розклад. Ні гостям, ні залогіненим викликати її через
-- /rest/v1/rpc нема потреби: вона видаляє чужі рядки теж.
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
