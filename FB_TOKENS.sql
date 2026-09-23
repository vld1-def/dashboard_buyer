-- ════════════════════════════════════════════════════════════
--  ТОКЕНИ FACEBOOK — fb_tokens
-- ════════════════════════════════════════════════════════════
--
--  Навіщо: щоб токени системних користувачів не жили в нотатках і
--  переписці, а лежали в одному місці з підписом, чий це БМ і які
--  кабінети він бачить.
--
--  ГОЛОВНЕ ПРО БЕЗПЕКУ. Дашборд — статичний сайт, і все, що він уміє
--  ПРОЧИТАТИ, читається будь-ким, хто його відкриє й зазирне в
--  консоль. Тому тут зроблено так:
--
--    записати токен — можна
--    прочитати назад — НЕ можна, нікому, включно з власником
--
--  Це не примха бази, а окремі права на стовпчик: authenticated має
--  select на всі поля, КРІМ token. Сторінка бачить назву, БМ,
--  кабінети, дату, стан перевірки — усе, крім самого секрету.
--
--  Дістає токен лише Edge Function від ключа сервісної ролі, коли
--  ходитиме в Marketing API. Тобто секрет ніколи не повертається в
--  браузер після того, як його туди вписали.
--
--  Перевірка токена відбувається в мить додавання, просто з твого
--  браузера: сторінка питає Graph API, які в токена права, коли він
--  протухне і які кабінети видно, і зберігає ВІДПОВІДЬ, а не токен.
--  Тому окрема функція для цього не потрібна.
--
--  Виконайте цей файл цілком, одним запуском.
-- ════════════════════════════════════════════════════════════

create table if not exists public.fb_tokens (
  id          bigserial primary key,
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team_name   text,

  -- Як ти його називаєш між собою: «БМ Олега», «основний», «під UZ».
  label       text not null,
  bm_id       text,
  bm_name     text,

  -- Сам секрет. Читати його зі сторінки не можна — див. права нижче.
  token       text not null,

  -- Те, що Graph API сказав у мить додавання. Зберігаємо відповідь, а
  -- не здогади: інакше через місяць неможливо згадати, чого цей токен
  -- не бачить половини кабінетів.
  scopes      text[],
  expires_at  timestamptz,          -- null = безстроковий
  accounts    jsonb,                -- [{id, name, status}] на момент перевірки
  app_id      text,

  -- Стан останньої перевірки: 'ok' | 'expired' | 'no-scopes' | 'error'
  status      text default 'unknown',
  status_note text,
  checked_at  timestamptz,

  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists fb_tokens_owner_idx on public.fb_tokens (created_by);


-- ────────────────────────────────────────────────────────────
--  ДОСТУП
-- ────────────────────────────────────────────────────────────
--  RLS тут обов'язковий і не обговорюється: у таблиці лежать ключі
--  від рекламних кабінетів.
-- ────────────────────────────────────────────────────────────

alter table public.fb_tokens enable row level security;

drop policy if exists "own_select" on public.fb_tokens;
create policy "own_select" on public.fb_tokens for select to authenticated
  using (created_by = auth.uid());

drop policy if exists "own_insert" on public.fb_tokens;
create policy "own_insert" on public.fb_tokens for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "own_update" on public.fb_tokens;
create policy "own_update" on public.fb_tokens for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "own_delete" on public.fb_tokens;
create policy "own_delete" on public.fb_tokens for delete to authenticated
  using (created_by = auth.uid());


-- ────────────────────────────────────────────────────────────
--  А ОСЬ І ГОЛОВНЕ: стовпчик token не віддається нікуди
-- ────────────────────────────────────────────────────────────
--  RLS каже, ЯКІ РЯДКИ видно. Права на стовпчики кажуть, ЯКІ ПОЛЯ.
--  Без другого власний токен можна було б прочитати зі сторінки —
--  а отже, і будь-хто, хто дістався до чужої відкритої вкладки.
--
--  Спершу забираємо select цілком, потім повертаємо поіменно, без
--  token. Insert і update лишаються повними — вписувати треба.
-- ────────────────────────────────────────────────────────────

revoke select on public.fb_tokens from authenticated, anon;

grant select (id, created_by, team_name, label, bm_id, bm_name,
              scopes, expires_at, accounts, app_id,
              status, status_note, checked_at, note, created_at)
  on public.fb_tokens to authenticated;

grant insert, update, delete on public.fb_tokens to authenticated;
grant usage, select on sequence public.fb_tokens_id_seq to authenticated;


-- ────────────────────────────────────────────────────────────
--  ПЕРЕВІРКА, ЩО ЗАХИСТ СТОЇТЬ
-- ────────────────────────────────────────────────────────────
--  Після виконання спробуйте зі сторінки (консоль браузера):
--
--      await sb.from('fb_tokens').select('token')
--
--  Має прийти помилка про права на стовпчик. Якщо раптом прийдуть
--  дані — щось пішло не так, напишіть, розберемось.
--
--  А це має працювати:
--
--      await sb.from('fb_tokens').select('label,bm_id,status,expires_at')
--
--
--  Подивитись свої токени з бази (ви власник, вам можна):
--      select id, label, bm_id, status, expires_at, checked_at
--        from public.fb_tokens order by created_at desc;
--
--  Прибрати токен, який скомпрометовано:
--      delete from public.fb_tokens where id = 1;
--  І ОБОВ'ЯЗКОВО відкликати його на боці Facebook:
--  business.facebook.com → Business Settings → System Users →
--  ваш юзер → токен → Revoke. Видалення рядка тут його не глушить.
-- ════════════════════════════════════════════════════════════
