-- ════════════════════════════════════════════════════════════
--  «SCHEDULED» У КАБІНЕТІ
--
--  Facebook не має окремого стану «Scheduled»: адсет із датою старту в
--  майбутньому має effective_status ACTIVE, і CRM показувала Active.
--  Ads Manager виводить «Scheduled» саме з дати старту — тепер fb-sync
--  кладе її в знімок, а сторінка кабінета порівнює з поточним часом.
--
--  Безпечно виконувати повторно. Без цих колонок fb-sync пише знімок
--  без них (нічого не ламається), просто Scheduled не видно.
-- ════════════════════════════════════════════════════════════
alter table public.fb_ad_today
  add column if not exists adset_start_time timestamptz,
  add column if not exists adset_end_time   timestamptz;

notify pgrst, 'reload schema';
