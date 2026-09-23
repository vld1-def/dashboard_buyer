-- ════════════════════════════════════════════════════════════
--  ЩО FACEBOOK КАЖЕ ПРО КАБІНЕТИ — fb_accounts
-- ════════════════════════════════════════════════════════════
--
--  Досі токен використовувався рівно один раз: у мить додавання, щоб
--  подивитись, що він узагалі бачить. Далі він просто лежав. Ця
--  таблиця — місце, куди щогодини складають те, що Marketing API
--  розповідає про кожен кабінет: стан, скільки відкручено сьогодні,
--  скільки живих кампаній/адсетів/оголошень, яка картка платить.
--
--  ЧОМУ ОКРЕМА ТАБЛИЦЯ, А НЕ КОЛОНКИ В accounts_mapping
--
--  В accounts_mapping статус ставить людина — руками, і часто всупереч
--  тому, що думає Facebook («кабінет живий, але ми його відклали»).
--  Якби імпорт писав туди, він щогодини затирав би чужу позначку. Ми
--  це вже проходили з доменами: автоматика, яка знімає ручну мітку, —
--  не помічник, а джерело сюрпризів.
--
--  Тому тут лежить ТІЛЬКИ те, що сказав Facebook. Ручне й машинне
--  живуть поруч і не б'ються; дашборд показує обидва.
--
--  ПРО ТОКЕН. Його тут немає й не буде. Токени лишаються у fb_tokens,
--  звідки їх дістає лише Edge Function від ключа сервісної ролі.
--  Ця таблиця — вже результат, її читати безпечно.
--
--  Виконайте цей файл цілком, одним запуском.
-- ════════════════════════════════════════════════════════════

create table if not exists public.fb_accounts (
  id          bigserial primary key,

  -- Чий це кабінет: власник токена, яким його побачили.
  created_by  uuid not null references auth.users(id) on delete cascade,
  team_name   text,
  -- Яким саме токеном дістали. Токен прибрали — рядок лишається, але
  -- перестає оновлюватись, і по token_id видно чому.
  token_id    bigint references public.fb_tokens(id) on delete set null,

  -- Ідентифікатор кабінета БЕЗ префікса act_: '1234567890'.
  -- Префікс — деталь адреси Graph API, а не частина номера.
  account_id  text not null,
  name        text,

  -- ── стан ──
  -- Наші слова: active | banned | unsettled | review | grace |
  --             closing | closed | unknown
  status       text,
  -- Те саме числом, як його віддав Facebook (account_status). Лишаємо,
  -- бо перелік у них поповнюється, і краще мати сире число, ніж
  -- «unknown» без жодного сліду.
  status_code  int,
  -- Чому вимкнено, словами Facebook (disable_reason). Порожньо = 0/NONE.
  disable_reason text,

  currency      text,
  timezone_name text,
  business_id   text,
  business_name text,

  -- ── картка ──
  -- ЧЕСНО ПРО БІН: Marketing API не віддає перших шести цифр. Ніде,
  -- жодним полем — це дані платіжної системи, і Facebook їх не
  -- публікує. Максимум, що є, — рядок виду «Visa *1234»: тип і
  -- останні чотири. Цього вистачає, щоб відрізнити одну картку від
  -- іншої в парку, але це не бін.
  card        text,
  card_type   text,

  -- ── гроші ──
  -- amount_spent і spend_cap приходять у мінімальних одиницях валюти
  -- (копійки/центи). Ділимо на 100 ще у функції, щоб у базі лежали
  -- нормальні гроші, а не число, яке всі забудуть поділити.
  amount_spent numeric,          -- за весь час життя кабінета
  spend_cap    numeric,          -- 0 = ліміту немає
  balance      numeric,

  -- Сьогодні — у часовому поясі САМОГО КАБІНЕТА, не вашому. Так рахує
  -- Facebook, і зводити це до локального часу означало б показувати
  -- число, якого немає в жодному їхньому звіті.
  spend_today       numeric,
  impressions_today bigint,
  clicks_today      bigint,

  -- ── скільки чого всередині ──
  campaigns int, campaigns_active int,
  adsets    int, adsets_active    int,
  ads       int, ads_active       int,

  -- Якщо саме по цьому кабінету Graph відповів помилкою — вона тут, а
  -- решта полів лишаються з минулого разу. Один кабінет, який не
  -- відповів, не мусить стирати дані по всіх інших.
  sync_error text,
  synced_at  timestamptz,

  created_at timestamptz not null default now(),

  -- Один рядок на кабінет у межах власника. Два токени одного БМ
  -- бачать ті самі кабінети — і мають оновлювати той самий рядок,
  -- а не плодити дублі.
  unique (created_by, account_id)
);

create index if not exists fb_accounts_team_idx on public.fb_accounts (team_name);
create index if not exists fb_accounts_token_idx on public.fb_accounts (token_id);


-- ────────────────────────────────────────────────────────────
--  ДОСТУП
-- ────────────────────────────────────────────────────────────
--  Читати — власнику. Писати — лише сервісній ролі, тобто функції
--  імпорту. Політик на insert/update для authenticated тут навмисно
--  немає: у таблиці немає нічого, що людина мусила б правити руками,
--  а поле, яке можна підправити зі сторінки, рано чи пізно розійдеться
--  з тим, що насправді сказав Facebook.
-- ────────────────────────────────────────────────────────────

alter table public.fb_accounts enable row level security;

drop policy if exists "own_select" on public.fb_accounts;
create policy "own_select" on public.fb_accounts for select to authenticated
  using (created_by = auth.uid());

grant select on public.fb_accounts to authenticated;


-- ════════════════════════════════════════════════════════════
--  ПЕРЕВІРКА
-- ════════════════════════════════════════════════════════════
--  Після першого прогону:
--
--    select account_id, name, status, spend_today,
--           campaigns_active, adsets_active, ads_active, card, synced_at
--      from public.fb_accounts
--     order by spend_today desc nulls last;
--
--  Порожньо — значить імпорт ще не ходив. Запустіть його руками:
--  Налаштування → Інтеграції → Facebook → «Sync now».
--
--  Рядки є, але spend_today скрізь null — кабінети сьогодні не
--  крутили, або токену бракує ads_read. Друге видно у fb_tokens.status.
-- ════════════════════════════════════════════════════════════
