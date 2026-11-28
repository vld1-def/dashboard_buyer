-- ════════════════════════════════════════════════════════════
--  ЖУРНАЛ CRON — ЧИСТКА ЩОНОЧІ
--
--  cron.job_run_details — службовий журнал планувальника: рядок на
--  КОЖЕН запуск задачі (коли, що, чи вдалося). Сам він не чиститься.
--  За два місяці (з 23.09) у ньому набралось 37 097 рядків і 80 MB —
--  більше, ніж уся статистика команди. CRM його не читає; потрібен він
--  лише щоб розібратись зі збоєм, і для цього вистачає тижня.
--
--  Чому не рідше запуски fb-limit-plans: він щохвилини лише ПЕРЕВІРЯЄ
--  (where exists), а функцію кличе, тільки коли план пора виконати.
--  Сповільнити його — означало б запізнення плану до 5 хвилин заради
--  самих лише рядків журналу, які ця чистка й так прибирає.
--
--  ПЕРЕВІРКА
--    select * from cron.job where jobname = 'cron-log-cleanup';
--    select count(*), min(start_time) from cron.job_run_details;
--
--  ВИМКНУТИ
--    select cron.unschedule('cron-log-cleanup');
-- ════════════════════════════════════════════════════════════

select cron.unschedule(jobid) from cron.job where jobname = 'cron-log-cleanup';

select cron.schedule(
  'cron-log-cleanup',
  '35 3 * * *',
  $$ delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '7 days' $$
);

-- Одразу прибрати те, що вже накопичилось. coalesce — бо в частини
-- запусків end_time порожній (не дочекались відповіді), і без нього вони
-- лишались би назавжди. Місце на диску повертає vacuum full (окремо,
-- поза транзакцією): 80 MB → 8.5 MB 28.11.2026.
delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '7 days';
