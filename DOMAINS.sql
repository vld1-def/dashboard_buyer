-- ============================================================
--  ДОМЕНИ — список і стан
-- ============================================================
--
--  Домени, розкладені по PWA, і чи вони ще відповідають.
--
--  ВАЖЛИВО ПРО ПЕРЕВІРКУ З БРАУЗЕРА
--  Дашборд — статична сторінка, і з неї НЕ видно код відповіді чужого
--  домена: CORS не дає прочитати відповідь, а запит у режимі no-cors
--  повертає непрозорий об'єкт зі статусом 0. Тобто 200 і 404 з браузера
--  не розрізнити. Видно тільки одне: домен відповів чи ні.
--
--  Тому колонки status_code і source. Браузер пише source='browser' і
--  status 'ok' / 'down'. Справжні коди й мітки Safe Browsing зможе
--  писати Edge Function (source='server') — та сама, що для телеграму.
-- ============================================================

create table if not exists public.domains (
  id          bigserial primary key,
  team_name   text not null,
  domain      text not null,
  pwa         text,                       -- до якої PWA належить
  note        text,
  status      text not null default 'unknown',
  -- unknown  — ще не перевіряли
  -- ok       — відповідає
  -- down     — не відповідає: DNS, сертифікат, з'єднання відкинуто
  -- notfound — 404 та інші 4xx (тільки з сервера)
  -- danger   — мітка Safe Browsing чи схоже (тільки з сервера)
  status_code int,                        -- лише з сервера, з браузера завжди null
  source      text,                       -- 'browser' | 'server'
  checked_at  timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

-- Один домен — один рядок у межах команди. lower(), бо DOMAIN.COM і
-- domain.com це той самий домен, і дубль тут гарантовано з'явиться при
-- вставці списку з текстового файлу.
create unique index if not exists domains_team_domain_idx
  on public.domains (team_name, lower(domain));

create index if not exists domains_team_pwa_idx
  on public.domains (team_name, pwa);

create index if not exists domains_created_by_idx
  on public.domains (created_by);


-- ── Якщо вмикаєте SECURITY_BUYERS.sql ──
--  Додайте 'domains' у списки таблиць у тому файлі, або застосуйте
--  політики окремо:
--
--    alter table public.domains enable row level security;
--    create policy "own_select" on public.domains for select to authenticated
--      using (created_by = auth.uid());
--    create policy "own_insert" on public.domains for insert to authenticated
--      with check (created_by = auth.uid());
--    create policy "own_update" on public.domains for update to authenticated
--      using (created_by = auth.uid()) with check (created_by = auth.uid());
--    create policy "own_delete" on public.domains for delete to authenticated
--      using (created_by = auth.uid());
-- ============================================================
