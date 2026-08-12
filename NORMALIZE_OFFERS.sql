-- ══════════════════════════════════════════════════════════════════
--  BOOSTWIN → Boostwin  (команда IMPROVE, таблиця daily_stats)
-- ══════════════════════════════════════════════════════════════════
--  Причина: у прев'ю імпорту випадайка оферів віддавала значення в
--  капсі, і при виборі зі списку в базу писалось «BOOSTWIN» замість
--  «Boostwin». Той самий оффер став двома значеннями і двоївся у звітах.
--
--  Виплати не постраждали — ключ payout будується з toUpperCase()
--  з обох боків. creatives_stats.offer скрізь NULL, там нічого міняти.
--  Запускати в Supabase → SQL Editor.
-- ══════════════════════════════════════════════════════════════════

-- КРОК 1. Що саме зміниться (нічого не пише). Очікується: BOOSTWIN → 23 рядки.
SELECT offer, count(*) AS рядків
FROM daily_stats
WHERE team_name = 'IMPROVE'
  AND upper(offer) = 'BOOSTWIN'
GROUP BY offer
ORDER BY offer;

-- КРОК 2. Оновити.
UPDATE daily_stats
SET offer = 'Boostwin'
WHERE team_name = 'IMPROVE'
  AND upper(offer) = 'BOOSTWIN'
  AND offer <> 'Boostwin';

-- КРОК 3. Перевірка: має лишитись один рядок — Boostwin 51.
SELECT offer, count(*) AS рядків
FROM daily_stats
WHERE team_name = 'IMPROVE'
  AND upper(offer) = 'BOOSTWIN'
GROUP BY offer;


-- ── Решта команд (AdWave, OLD_TEAM) — НЕ виконується, лишено на потім ──
-- Там ті самі дублі по регістру: GOLDENBET/GoldenBet, JETTON/Jetton,
-- 1XBET, MELBET та інші — разом ще 136 рядків. Канонічний варіант
-- береться з payouts, тому назви вручну виписувати не треба:
--
-- UPDATE daily_stats d
-- SET offer = p.offer
-- FROM (SELECT DISTINCT team_name, offer FROM payouts) p
-- WHERE p.team_name = d.team_name
--   AND upper(p.offer) = upper(d.offer)
--   AND d.offer IS NOT NULL
--   AND d.offer <> p.offer;
