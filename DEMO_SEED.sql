-- ============================================================
--  ДЕМО-КОМАНДА ДЛЯ ПРЕЗЕНТАЦІЇ
--
--  Створює команду «DEMO» і засіває її вигаданими даними за
--  останні 4 місяці: кампанії, креативи, виплати, витрати,
--  таски, звіти, лінки, кабінети.
--
--  Команда з'явиться в перемикачі сама — список команд дашборд
--  будує з наявних team_name у daily_stats.
--
--  Де запускати: Supabase Dashboard -> SQL Editor -> New query -> Run.
--
--  БЕЗПЕКА: скрипт чіпає ВИКЛЮЧНО рядки з team_name = 'DEMO'.
--  Жодна справжня команда не зачеплена. Запускати можна скільки
--  завгодно разів — кожен запуск перезбирає демо з нуля.
--
--  Прибрати демо назовсім: розкоментуй блок у самому кінці.
-- ============================================================

BEGIN;

-- Відтворюваність: той самий сід -> ті самі цифри при кожному запуску.
SELECT setseed(0.42);

-- ── чистимо попереднє демо ───────────────────────────────────
DELETE FROM daily_stats      WHERE team_name = 'DEMO';
DELETE FROM creatives_stats  WHERE team_name = 'DEMO';
DELETE FROM payouts          WHERE team_name = 'DEMO';
DELETE FROM expenses         WHERE team_name = 'DEMO';
DELETE FROM tasks            WHERE team_name = 'DEMO';
DELETE FROM daily_reports    WHERE team_name = 'DEMO';
DELETE FROM quick_links      WHERE team_name = 'DEMO';
DELETE FROM change_log       WHERE team_name = 'DEMO';
DELETE FROM accounts_mapping WHERE team_name = 'DEMO';

-- ── довідники ────────────────────────────────────────────────
-- Гео справжні (це не таємниця), а оффери, кабінети й агенції
-- вигадані навмисне, щоб демо не можна було сплутати з бойовим.
-- cti = клік -> інстал, i2r = інстал -> рега, r2d = рега -> деп.
-- Числа підібрані так, щоб ROI по гео розійшовся приблизно від -12%
-- до +40%: два гео в мінусі (PL, ES) — на презентації є що показати
-- пальцем, а суцільний плюс по всіх виглядав би намальованим.
CREATE TEMP TABLE _geo(geo text, weight numeric, cpc numeric, cti numeric, i2r numeric, r2d numeric, payout numeric) ON COMMIT DROP;
INSERT INTO _geo VALUES
  ('BR', 0.22, 0.09, 0.0562, 0.52, 0.1036, 38),   -- ROI  +28%
  ('MX', 0.16, 0.12, 0.0571, 0.50, 0.1096, 44),   -- ROI  +15%
  ('IN', 0.14, 0.05, 0.0667, 0.42, 0.1140, 22),   -- ROI  +40%
  ('TR', 0.12, 0.08, 0.0571, 0.48, 0.1020, 30),   -- ROI   +5%
  ('PL', 0.11, 0.26, 0.0619, 0.55, 0.0884, 76),   -- ROI  -12%
  ('IT', 0.10, 0.31, 0.0674, 0.58, 0.1100, 88),   -- ROI  +22%
  ('ES', 0.09, 0.29, 0.0659, 0.56, 0.0889, 84),   -- ROI   -5%
  ('DE', 0.06, 0.38, 0.0704, 0.60, 0.1265, 96);   -- ROI  +35%

CREATE TEMP TABLE _offer(offer text, funnel text) ON COMMIT DROP;
INSERT INTO _offer VALUES
  ('Aurora Bet','aurora-lp1'), ('Aurora Bet','aurora-lp2'),
  ('Vertex Play','vertex-main'), ('Lumio Casino','lumio-quiz'),
  ('Nordic Spin','nordic-lp3');

CREATE TEMP TABLE _acc(account text, provider text, tz int, status text) ON COMMIT DROP;
INSERT INTO _acc VALUES
  ('ACC-1041','Brightside Media', 0,'active'),
  ('ACC-1042','Brightside Media', 2,'active'),
  ('ACC-1108','Kestrel Agency',  -3,'active'),
  ('ACC-1109','Kestrel Agency',  -3,'problem'),
  ('ACC-1215','Onyx Traffic',     1,'active'),
  ('ACC-1216','Onyx Traffic',     1,'ban');

-- Період: три повні попередні місяці + поточний до сьогодні.
CREATE TEMP TABLE _day(d date) ON COMMIT DROP;
INSERT INTO _day
SELECT g::date FROM generate_series(
  date_trunc('month', CURRENT_DATE) - INTERVAL '3 months',
  CURRENT_DATE,
  INTERVAL '1 day') g;

-- ── daily_stats ──────────────────────────────────────────────
-- Форма кривої навмисне не пласка, щоб на презентації було що
-- показати: вихідні просідають, обсяг росте від місяця до місяця,
-- а ACC-1216 у середині періоду «ловить бан» і зупиняється.
INSERT INTO daily_stats (team_name, date, account, geo, offer, funnel, agent, spend, installs, regs, deposits)
SELECT
  'DEMO', d.d, a.account, g.geo, o.offer, o.funnel, a.provider,
  ROUND(v.spend::numeric, 2),
  v.installs,
  -- Дробову частину не округлюємо, а розігруємо: ROUND() на числах
  -- близьких до 0.5 (а депів на рядок саме стільки) зміщує підсумок на
  -- десятки відсотків і ламає всю економіку. FLOOR + жереб на залишок
  -- у середньому дає рівно те, що заклали в конверсії.
  FLOOR(v.regs_raw)::int + CASE WHEN random() < v.regs_raw - FLOOR(v.regs_raw) THEN 1 ELSE 0 END,
  FLOOR(v.deps_raw)::int + CASE WHEN random() < v.deps_raw - FLOOR(v.deps_raw) THEN 1 ELSE 0 END
FROM _day d
CROSS JOIN _geo g
CROSS JOIN _acc a
JOIN LATERAL (SELECT * FROM _offer ORDER BY random() LIMIT 1) o ON true
JOIN LATERAL (
  SELECT
    -- базовий денний бюджет * вага гео * вихідні * ріст по місяцях,
    -- і нуль після бану на ACC-1216
    (55 + random() * 45)
      * g.weight * 8
      * CASE WHEN EXTRACT(dow FROM d.d) IN (0,6) THEN 0.72 ELSE 1.0 END
      * (1 + 0.10 * EXTRACT(month FROM age(d.d, date_trunc('month', CURRENT_DATE) - INTERVAL '3 months')))
      * CASE WHEN a.account = 'ACC-1216'
               AND d.d > date_trunc('month', CURRENT_DATE) - INTERVAL '35 days'
             THEN 0 ELSE 1 END
      AS spend,
    -- Місячний дрейф ефективності: без нього ROI виходить однаковий
    -- усі чотири місяці до відсотка, і таблиця читається як намальована.
    (ARRAY[0.88, 1.09, 0.96, 1.14])[1 + (EXTRACT(month FROM d.d)::int % 4)]
      * (0.88 + random() * 0.26) AS luck
) b ON true
JOIN LATERAL (
  SELECT
    b.spend,
    GREATEST(ROUND(b.spend / g.cpc * g.cti)::int, 0) AS installs,
    b.spend / g.cpc * g.cti * g.i2r                       AS regs_raw,
    b.spend / g.cpc * g.cti * g.i2r * g.r2d * b.luck      AS deps_raw
) v ON true
WHERE b.spend > 1;

-- ── creatives_stats ──────────────────────────────────────────
-- Розріз креативів завжди вужчий за кампанійний: не кожен звіт
-- заливають по креативах. Тому беремо ~70% днів — так демо
-- показує і реальну ситуацію «CPC є не за кожен день».
INSERT INTO creatives_stats (team_name, date, account, cid, geo, funnel, device, platform, placement, spend, clicks, installs, regs, deps)
SELECT
  'DEMO', ds.date, ds.account,
  'CR-' || LPAD(((abs(hashtext(ds.geo || ds.offer)) % 18) + 1)::text, 3, '0'),
  ds.geo, ds.funnel,
  (ARRAY['iPhone','Android Smartphone','Android Tablet','iPad','Desktop'])[1 + (abs(hashtext(ds.geo || ds.date::text)) % 5)],
  (ARRAY['facebook','instagram','audience_network'])[1 + (abs(hashtext(ds.account || ds.date::text)) % 3)],
  (ARRAY['feed','stories','reels','marketplace','search'])[1 + (abs(hashtext(ds.offer || ds.date::text)) % 5)],
  ROUND((ds.spend * 0.92)::numeric, 2),
  GREATEST(ROUND(ds.spend * 0.92 / g.cpc)::int, 0),
  ds.installs, ds.regs, ds.deposits
FROM daily_stats ds
JOIN _geo g ON g.geo = ds.geo
WHERE ds.team_name = 'DEMO'
  AND (abs(hashtext(ds.date::text || ds.account)) % 10) < 7;

-- ── payouts ──────────────────────────────────────────────────
INSERT INTO payouts (team_name, geo, offer, value)
SELECT DISTINCT 'DEMO', g.geo, o.offer, g.payout
FROM _geo g CROSS JOIN (SELECT DISTINCT offer FROM _offer) o;

-- ── expenses ─────────────────────────────────────────────────
INSERT INTO expenses (team_name, date, category, amount, description)
SELECT 'DEMO', d,
       (ARRAY['Proxy','Accounts','Software','Team','Other'])[1 + (abs(hashtext(d::text || c::text)) % 5)],
       ROUND((120 + random() * 680)::numeric, 2),
       (ARRAY['Monthly proxy pool','Account batch','Spy tool subscription','Freelance designer','Misc'])[1 + (abs(hashtext(c::text || d::text)) % 5)]
FROM generate_series(
       date_trunc('month', CURRENT_DATE)::date - 90,
       CURRENT_DATE, INTERVAL '6 days') d,
     generate_series(1, 2) c;

-- ── accounts_mapping ─────────────────────────────────────────
INSERT INTO accounts_mapping (team_name, account_id, provider_name, timezone)
SELECT 'DEMO', account, provider, tz FROM _acc;

-- Колонок status / status_note у цій таблиці може ще не бути — дашборд
-- це окремо передбачає. Тому проставляємо їх лише якщо вони існують,
-- інакше весь скрипт упав би на цьому місці.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='accounts_mapping'
               AND column_name='status') THEN
    UPDATE accounts_mapping m SET status = a.status FROM _acc a
     WHERE m.team_name='DEMO' AND m.account_id = a.account;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='accounts_mapping'
               AND column_name='status_note') THEN
    UPDATE accounts_mapping m
       SET status_note = CASE a.status
             WHEN 'ban'     THEN 'Disabled mid-period, spend stopped'
             WHEN 'problem' THEN 'Limited reach, under review' END
      FROM _acc a
     WHERE m.team_name='DEMO' AND m.account_id = a.account AND a.status <> 'active';
  END IF;
END $$;

-- ── tasks ────────────────────────────────────────────────────
INSERT INTO tasks (team_name, text, status, priority, created_at)
SELECT 'DEMO', t.text, t.status, t.priority, NOW() - (t.days || ' days')::interval
FROM (VALUES
  ('Rebuild Aurora Bet landing for MX traffic','In progress','High',2),
  ('Test new creative batch on BR feed placement','In progress','High',1),
  ('Replace ACC-1216 after the ban','Not in progress','High',3),
  ('Renegotiate Nordic Spin payout for DE','Not in progress','Medium',5),
  ('Move Lumio Casino quiz funnel to the new tracker','Not in progress','Medium',6),
  ('Audit proxy pool, half the IPs are flagged','Not in progress','Low',8),
  ('Weekly report template for the client','Completed','Low',11),
  ('Close August books','Completed','Medium',16)
) AS t(text, status, priority, days);

-- ── daily_reports ────────────────────────────────────────────
-- Розмітка та сама, що й у справжніх звітах: + успіх, - проблема,
-- ! попередження, > план.
INSERT INTO daily_reports (team_name, comment, date)
SELECT 'DEMO', r.comment, NOW() - (r.days || ' days')::interval
FROM (VALUES
  ('+ BR held CPD under $40 all week' || chr(10) || '- ACC-1216 got banned, moved budget to ACC-1215' || chr(10) || '> Launch two new creatives on IT tomorrow', 1),
  ('+ New Aurora Bet landing lifted I2R from 64% to 71%' || chr(10) || '! DE CPC climbing for the third day' || chr(10) || '> Cut the weakest three creatives', 2),
  ('+ Record day on MX, 61 deposits' || chr(10) || '- Nordic Spin still under review on the advertiser side', 4),
  ('! Weekend dip deeper than usual across all geos' || chr(10) || '> Shift budget to weekdays next week', 6),
  ('+ Lumio Casino quiz funnel beat the main one on PL' || chr(10) || '+ Proxy pool replaced, no more flags', 9),
  ('- Tracker lost roughly 4 hours of postbacks, numbers restored manually' || chr(10) || '> Set up a backup postback endpoint', 13)
) AS r(comment, days);

-- ── quick_links ──────────────────────────────────────────────
INSERT INTO quick_links (team_name, name, url, is_public, position)
VALUES
  ('DEMO','Ads Manager','https://business.facebook.com/adsmanager', true, 0),
  ('DEMO','Tracker','https://example.com/tracker', true, 1),
  ('DEMO','Affiliate network','https://example.com/network', true, 2),
  ('DEMO','Creative drive','https://drive.google.com', false, 3),
  ('DEMO','Team board','https://example.com/board', false, 4);

-- ── change_log ───────────────────────────────────────────────
INSERT INTO change_log (team_name, category, text, created_at)
SELECT 'DEMO', c.category, c.text, NOW() - (c.days || ' days')::interval
FROM (VALUES
  ('payout','Nordic Spin DE raised from $88 to $96', 3),
  ('account','ACC-1216 banned, traffic moved to ACC-1215', 1),
  ('offer','Lumio Casino added for PL and IT', 8),
  ('funnel','aurora-lp2 replaced aurora-lp1 on MX', 5),
  ('payout','Aurora Bet BR lowered from $42 to $38', 12)
) AS c(category, text, days);

COMMIT;

-- ── що вийшло ────────────────────────────────────────────────
SELECT 'daily_stats'      AS table, count(*) FROM daily_stats      WHERE team_name='DEMO'
UNION ALL SELECT 'creatives_stats',  count(*) FROM creatives_stats  WHERE team_name='DEMO'
UNION ALL SELECT 'payouts',          count(*) FROM payouts          WHERE team_name='DEMO'
UNION ALL SELECT 'expenses',         count(*) FROM expenses         WHERE team_name='DEMO'
UNION ALL SELECT 'accounts_mapping', count(*) FROM accounts_mapping WHERE team_name='DEMO'
UNION ALL SELECT 'tasks',            count(*) FROM tasks            WHERE team_name='DEMO'
UNION ALL SELECT 'daily_reports',    count(*) FROM daily_reports    WHERE team_name='DEMO'
UNION ALL SELECT 'quick_links',      count(*) FROM quick_links      WHERE team_name='DEMO'
UNION ALL SELECT 'change_log',       count(*) FROM change_log       WHERE team_name='DEMO';

-- ============================================================
--  ПРИБРАТИ ДЕМО НАЗОВСІМ — розкоментуй і виконай:
--
-- DELETE FROM daily_stats      WHERE team_name = 'DEMO';
-- DELETE FROM creatives_stats  WHERE team_name = 'DEMO';
-- DELETE FROM payouts          WHERE team_name = 'DEMO';
-- DELETE FROM expenses         WHERE team_name = 'DEMO';
-- DELETE FROM tasks            WHERE team_name = 'DEMO';
-- DELETE FROM daily_reports    WHERE team_name = 'DEMO';
-- DELETE FROM quick_links      WHERE team_name = 'DEMO';
-- DELETE FROM change_log       WHERE team_name = 'DEMO';
-- DELETE FROM accounts_mapping WHERE team_name = 'DEMO';
-- ============================================================
