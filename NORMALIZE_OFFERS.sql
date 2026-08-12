-- ══════════════════════════════════════════════════════════════════
--  Зведення регістру оффера в daily_stats до канонічного з payouts
-- ══════════════════════════════════════════════════════════════════
--  Причина: у прев'ю імпорту випадайка оферів віддавала значення в
--  капсі, і при виборі зі списку в базу писалось «BOOSTWIN» замість
--  «Boostwin». Той самий оффер став двома різними значеннями.
--
--  Виплати від цього НЕ постраждали — ключ payout будується з
--  toUpperCase() з обох боків. Постраждало групування у звітах.
--
--  creatives_stats.offer скрізь NULL — там нічого міняти.
--  Запускати в Supabase → SQL Editor.
-- ══════════════════════════════════════════════════════════════════

-- КРОК 1. Подивитись, що саме зміниться (нічого не пише).
SELECT d.team_name,
       d.offer AS було,
       p.offer AS стане,
       count(*) AS рядків
FROM daily_stats d
JOIN (SELECT DISTINCT team_name, offer FROM payouts) p
  ON p.team_name = d.team_name
 AND upper(p.offer) = upper(d.offer)
WHERE d.offer IS NOT NULL
  AND d.offer <> p.offer
GROUP BY 1, 2, 3
ORDER BY 1, 2;

-- КРОК 2. Якщо список влаштовує — оновити.
UPDATE daily_stats d
SET offer = p.offer
FROM (SELECT DISTINCT team_name, offer FROM payouts) p
WHERE p.team_name = d.team_name
  AND upper(p.offer) = upper(d.offer)
  AND d.offer IS NOT NULL
  AND d.offer <> p.offer;

-- Щоб зачепити лише IMPROVE (тобто тільки Boostwin), додай у КРОК 2:
--   AND d.team_name = 'IMPROVE'

-- КРОК 3. Перевірка: дублів по регістру більше бути не повинно.
SELECT team_name, upper(offer) AS ключ,
       count(DISTINCT offer) AS варіантів,
       string_agg(DISTINCT offer, ' | ') AS значення
FROM daily_stats
WHERE offer IS NOT NULL
GROUP BY 1, 2
HAVING count(DISTINCT offer) > 1
ORDER BY 1;
