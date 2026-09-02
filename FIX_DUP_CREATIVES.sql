-- ══════════════════════════════════════════════════════════════════
--  Прибрати подвоєні рядки креативів за 2026-09-01 (команда IMPROVE)
-- ══════════════════════════════════════════════════════════════════
--  За цю дату файл залився двічі: 37 рядків замість 22, кожен дубль —
--  точна копія (той самий крео, акаунт, девайс, плейсмент і той самий
--  спенд). Через це спенд по креативах $163.57, хоча реально $82.37
--  (daily_stats за цей день каже $82.31 — сходиться).
--
--  Видаляються ЛИШЕ точні копії: у порівнянні бере участь і spend,
--  тож рядки з однаковим ключем, але різними сумами, не постраждають.
--  Запускати в Supabase → SQL Editor.
-- ══════════════════════════════════════════════════════════════════

-- КРОК 1. Подивитись, що саме піде під видалення (очікується 15 рядків).
SELECT a.id, a.cid, a.account, a.device, a.platform, a.placement, a.spend
FROM public.creatives_stats a
JOIN public.creatives_stats b
  ON  b.team_name = a.team_name
  AND b.date      = a.date
  AND a.id > b.id
  AND a.account   IS NOT DISTINCT FROM b.account
  AND a.cid       IS NOT DISTINCT FROM b.cid
  AND a.device    IS NOT DISTINCT FROM b.device
  AND a.platform  IS NOT DISTINCT FROM b.platform
  AND a.placement IS NOT DISTINCT FROM b.placement
  AND a.geo       IS NOT DISTINCT FROM b.geo
  AND a.spend     IS NOT DISTINCT FROM b.spend
WHERE a.team_name = 'IMPROVE' AND a.date = '2026-09-01'
ORDER BY a.cid;

-- КРОК 2. Видалити.
DELETE FROM public.creatives_stats a
USING public.creatives_stats b
WHERE a.team_name = 'IMPROVE' AND a.date = '2026-09-01'
  AND b.team_name = a.team_name
  AND b.date      = a.date
  AND a.id > b.id
  AND a.account   IS NOT DISTINCT FROM b.account
  AND a.cid       IS NOT DISTINCT FROM b.cid
  AND a.device    IS NOT DISTINCT FROM b.device
  AND a.platform  IS NOT DISTINCT FROM b.platform
  AND a.placement IS NOT DISTINCT FROM b.placement
  AND a.geo       IS NOT DISTINCT FROM b.geo
  AND a.spend     IS NOT DISTINCT FROM b.spend;

-- КРОК 3. Перевірка: має вийти 22 рядки і приблизно $82.37.
SELECT count(*) AS rows, round(sum(spend)::numeric, 2) AS spend
FROM public.creatives_stats
WHERE team_name = 'IMPROVE' AND date = '2026-09-01';


-- ── Якщо колись знадобиться перевірити всю базу на такі дублі ──
-- SELECT team_name, date, count(*) - count(DISTINCT (account, cid, device, platform, placement, geo, spend)) AS extra
-- FROM public.creatives_stats
-- GROUP BY 1, 2 HAVING count(*) > count(DISTINCT (account, cid, device, platform, placement, geo, spend))
-- ORDER BY 1, 2;
