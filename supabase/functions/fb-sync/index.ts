/* ═══════════ ЩО FACEBOOK КАЖЕ ПРО КАБІНЕТИ ═══════════

   Досі токен системного користувача використовувався рівно один раз —
   у мить додавання, щоб подивитись, що він бачить. Далі просто лежав.
   Ця функція нарешті ним користується: щогодини обходить кабінети й
   складає у fb_accounts те, що каже Marketing API.

   Що забирає, у порядку важливості:
     1. стан кабінета (active / banned / unsettled / …) — заради цього
        все й затівалось: забанений кабінет має бути видно одразу, а
        не за три дні;
     2. скільки відкручено сьогодні;
     3. скільки живих кампаній, адсетів, оголошень — і, головне, у
        якому стані решта: відхилені, на перевірці, без платіжки. Без
        цього «3 зі 180» не відповідає на питання, заради якого туди
        взагалі дивляться;
     4. чим платить — тип картки й останні чотири цифри.

   ПРО БІН КАРТКИ, щоб не шукати даремно. Marketing API не віддає
   перших шести цифр — ніде, жодним полем. Максимум, що є, це
   funding_source_details.display_string виду «Visa *1234». Тому в базі
   лежить саме воно, і поле чесно зветься card, а не card_bin.

   ЖОДНИХ ІМПОРТІВ — з тієї ж причини, що й у check-domains: якщо
   імпорт не розвʼяжеться, функція падає ще до запуску, шлюз віддає
   помилку без CORS-заголовків, і в браузері це виглядає як «Failed to
   fetch» навіть коли з кодом усе гаразд.

   ДВА ВХОДИ, і вони різні:

     зі сторінки — заголовок Authorization з токеном людини. Ми його
       перевіряємо в Supabase Auth, дістаємо її user id і синхронізуємо
       ТІЛЬКИ її токени. Ключ сервісної ролі тут потрібен (інакше не
       прочитати fb_tokens.token), але межі ставить перевірений uid, а
       не те, що попросили в тілі запиту;

     з розкладу — заголовок x-cron-key зі спільним секретом. Тоді
       обходимо всіх.

   Розгортання:
     supabase functions deploy fb-sync
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';

// Скільки запитів в одному пакеті Graph. Їхня стеля — 50. По 5 запитів
// на кабінет виходить 10 кабінетів за виклик.
const PER_ACC = 5;
const BATCH_MAX = 50;   // 10 кабінетів за виклик

/* Скільки днів витрат забираємо щоразу. Вікно ковзне, записуємо
   впритул (upsert по дню), тож історія в базі накопичується глибше за
   нього — а от перезаписуються тільки останні 30 днів.

   Перезапис тут не марнотратство, а сенс: Facebook уточнює витрати
   заднім числом (повернення, перерахунок). Цифра за позавчора цілком
   може змінитись, і тоді в базі має лежати уточнена, а не та, яку ми
   один раз побачили й законсервували. */
const HISTORY_DAYS = 30;

// Edge Function не працює вічно. Упершись у дедлайн, чесно віддаємо
// «є ще» замість того, щоб обірватись, нічого не записавши.
const DEADLINE_MS = 110_000;

type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

/* Спільний секрет звіряємо по всій довжині, а не до першої розбіжності. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ── хто нас кличе ──
   Дашборд надсилає свій JWT. Ми могли б просто повірити тілу запиту,
   але тоді будь-хто попросив би синхронізувати чужі токени. Тому uid
   беремо ТІЛЬКИ з відповіді Auth. */
async function whoAmI(base: string, anon: string, auth: string): Promise<string> {
  const res = await fetch(base + '/auth/v1/user', {
    headers: { apikey: anon, Authorization: auth }
  });
  if (!res.ok) return '';
  const u = await res.json().catch(() => ({}));
  return String(u?.id || '');
}

/* ── Graph API ──
   Токен кладемо в тіло POST, а не в рядок запиту: адреси з токеном
   осідають у логах проксі та в заголовку Referer. Graph приймає
   GET-запити методом POST, якщо попросити явно (method=GET). */
async function graph(path: string, token: string, params: Json): Promise<Json> {
  const body = new URLSearchParams({ access_token: token, method: 'GET' });
  for (const [k, v] of Object.entries(params)) if (v != null) body.set(k, String(v));
  const res = await fetch(GRAPH + path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const j = await res.json().catch(() => ({}));
  if (j && j.error) throw graphError(j.error);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return j;
}

/* Коди, за якими зупинятись, а не довбати далі: ліміт застосунку,
   ліміт кабінета, «спробуйте пізніше». Далі по списку буде те саме, а
   Facebook рахує навіть відмовлені запити. */
const THROTTLE = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80014]);

/* ВЕРСІЯ ФУНКЦІЇ.

   Сторінка оновлюється сама, щойно змерджено; Edge Function — ні, її
   треба задеплоїти руками. Через це двічі виходило одне й те саме:
   правку зроблено, сторінка нова, функція стара, і ми разом шукаємо
   ваду, якої вже немає в коді.

   Тепер функція називає свою версію в кожній відповіді, а сторінка
   знає, якої чекає (build.py дістає це число просто звідси), і каже
   вголос, коли вони розійшлись. Число міняється разом із будь-якою
   правкою, що має бути видно зовні. */
const FN_VERSION = '2026-09-24.9';

class GraphError extends Error {
  code: number; sub: number; throttled: boolean;
  constructor(msg: string, code: number, sub: number) {
    super(msg);
    this.code = code; this.sub = sub;
    this.throttled = THROTTLE.has(code);
  }
}

/* Номер помилки додаємо до тексту, якщо його там ще немає.

   error_user_msg написаний для людини й номера не містить: Facebook
   віддає «API access blocked.» і на цьому все. Таке повідомлення
   неможливо ні знайти в документації, ні відрізнити від сусіднього —
   а різниця між «заблокували застосунок», «заблокували БМ» і
   «перевищено ліміт» саме в номері й живе. message натомість номер
   зазвичай має, але написаний гірше. Тож беремо краще з двох і
   дописуємо номер. */
function graphError(e: Json): GraphError {
  const code = Number(e?.code || 0);
  const sub = Number(e?.error_subcode || 0);
  let msg = String(e?.error_user_msg || e?.message || 'Graph API error');
  if (code && !msg.includes('#' + code))
    msg += ' (#' + code + (sub ? '/' + sub : '') + ')';
  return new GraphError(msg, code, sub);
}

/* Пакетний запит. Відповідь — масив у тому самому порядку, що й
   запити; кожен елемент має власний код, і одна невдача не валить
   решти. null трапляється, коли Graph не встиг цей підзапит. */
async function graphBatch(token: string, urls: string[]): Promise<(Json | null)[]> {
  const batch = urls.map(u => ({ method: 'GET', relative_url: u }));
  const res = await fetch(GRAPH + '/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: token, include_headers: 'false', batch: JSON.stringify(batch)
    }).toString()
  });
  const j = await res.json().catch(() => null);
  // Помилка на рівні всього пакета (протух токен, ліміт) приходить не
  // масивом, а звичайним {error:…}.
  if (j && !Array.isArray(j) && j.error) throw graphError(j.error);
  if (!Array.isArray(j)) throw new Error('batch: unexpected response');
  return j.map((part: Json | null) => {
    if (!part) return null;
    let body: Json = {};
    try { body = JSON.parse(part.body || '{}'); } catch (_e) { body = {}; }
    return { code: Number(part.code || 0), body };
  });
}

/* ── словник Facebook → наш ──
   Їхній перелік поповнюється, тож незнайоме число не ховаємо за
   «unknown», а лишаємо в status_code як є. */
function statusWord(code: number): string {
  switch (code) {
    case 1:   return 'active';
    case 2:   return 'banned';       // DISABLED
    case 3:   return 'unsettled';    // UNSETTLED — не оплачено
    case 7:   return 'review';       // PENDING_RISK_REVIEW
    case 8:   return 'unsettled';    // PENDING_SETTLEMENT
    case 9:   return 'grace';        // IN_GRACE_PERIOD
    case 100: return 'closing';      // PENDING_CLOSURE
    case 101: return 'closed';
    default:  return 'unknown';
  }
}

const REASONS: Record<number, string> = {
  0: '', 1: 'Ads integrity policy', 2: 'IP review', 3: 'Risk payment',
  4: 'Gray account shut down', 5: 'AFC review', 6: 'Business integrity review',
  7: 'Permanently closed', 8: 'Unused reseller account', 9: 'Unused account',
  10: 'Umbrella ad account', 11: 'Business Manager integrity policy',
  12: 'Misrepresentation', 13: 'Custom audience TOS', 14: 'Unfulfilled ads policy',
  15: 'Unused reseller account', 16: 'Unused account', 17: 'Business integrity RAR'
};

function disableReason(v: unknown): string {
  if (v == null || v === '') return '';
  // Залежно від версії Graph це або число, або вже слово.
  const n = Number(v);
  if (Number.isFinite(n)) return REASONS[n] ?? ('Reason ' + n);
  return String(v).replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
}

/* Гроші Facebook віддає в мінімальних одиницях валюти — центах. Ділимо
   тут, щоб у базі лежали нормальні гроші, а не число, яке всі забудуть
   поділити. Порожнє лишаємо порожнім: 0 і «невідомо» — різні речі. */
function cents(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n / 100 : null;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* Сьогодні — у часовому поясі САМОГО кабінета. Це не педантизм: доба
   кабінета в Лос-Анджелесі зсунута від вашої на десять годин, і взяти
   свою дату означало б попросити в Facebook звіт за період, якого в
   нього немає. Формат en-CA — це рівно YYYY-MM-DD. */
function todayIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(new Date());
  } catch (_e) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date());
  }
}

/* Зсув дати на n днів. Через UTC-опівніч, щоб переведення годинника
   не з'їло й не подвоїло день. */
function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = Date.UTC(y, (m || 1) - 1, d || 1) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/* ── крок 1: які взагалі є кабінети ──
   Сторінкуємо курсором, а не адресою з paging.next: та несе в собі
   токен, і ганяти його по рядках запиту — рівно те, чого ми уникаємо. */
const ACC_FIELDS = [
  'account_id', 'name', 'account_status', 'disable_reason', 'currency',
  'timezone_name', 'amount_spent', 'spend_cap', 'balance',
  'funding_source_details', 'business{id,name}'
].join(',');

async function listAccounts(token: string): Promise<Json[]> {
  const out: Json[] = [];
  let after = '';
  for (let page = 0; page < 20; page++) {
    const params: Json = { fields: ACC_FIELDS, limit: 100 };
    if (after) params.after = after;
    const j = await graph('/me/adaccounts', token, params);
    const rows = Array.isArray(j.data) ? j.data : [];
    out.push(...rows);
    after = j?.paging?.cursors?.after || '';
    if (!after || rows.length < 100) break;
  }
  return out;
}

/* ── крок 2: що всередині кожного кабінета ──

   Чотири підзапити на кабінет:
     1. сьогоднішні витрати + скільки всього кампаній/адсетів/оголошень
        (розгортання полів дає все це одним запитом);
     2-4. скільки з них ЗАРАЗ крутиться.

   ЧОМУ ОБИДВА ЧИСЛА БЕРУТЬСЯ З ОДНІЄЇ ВІДПОВІДІ

   Спершу було не так: знаменник рахувався розгортанням поля на самому
   кабінеті (act_X?fields=ads.limit(0).summary(total_count)), а
   чисельник — окремим запитом до ребра act_X/ads. Це два різні виклики,
   і множини в них НЕ зобовʼязані збігатись: розгорнуте поле й пряме
   ребро по-різному поводяться з архівованим. У парі «10 з 60» це
   означало порівняння одного з іншим, і пояснити таке число неможливо,
   бо воно ні про що.

   Тепер обидва числа рахуються з однієї відповіді, по рядках, які
   реально приїхали. Розбивка в підказці тому й сходиться з підсумком
   точно, а не приблизно.

   Заодно зникла залежність від summary(total_count) на відфільтрованому
   ребрі — рахунок, якому давно не варто довіряти: він то враховує
   фільтр, то ні, і перевірити це ззовні ніяк.

   date_preset=today рахується в часовому поясі САМОГО КАБІНЕТА, а не
   вашому. Зводити це до локального часу означало б показувати число,
   якого немає в жодному звіті Facebook. */
const INNER = 'insights.date_preset(today){spend,impressions,clicks}';

/* Скільки обʼєктів тягнемо заради розбивки. Це не «скільки їх у
   кабінеті» — це стеля однієї сторінки. Те, що не влізло, чесно
   позначаємо як непораховане, а не вдаємо повноту. */
const LIST_LIMIT = 500;

function urlsFor(actId: string, tz: string): string[] {
  const act = 'act_' + actId;
  /* Раніше тут просто рахувалось, скільки ACTIVE. Число було чесне, але
     мовчазне: «3 зі 180» не каже, чому решта 177 не крутиться, і рівно
     це питання виникало першим. Тому тепер тягнемо статуси списком і
     рахуємо самі — запитів стільки ж, а відповідь повна.

     effective_status — саме ефективний: оголошення в зупиненому адсеті
     має ADSET_PAUSED, а не ACTIVE. Тобто ACTIVE тут означає «нічим
     зверху не заглушене й не на паузі саме». */
  const bulk = (edge: string, extra: string) => act + '/' + edge
    + '?fields=' + encodeURIComponent('effective_status' + (extra ? ',' + extra : ''))
    + '&limit=' + LIST_LIMIT + '&summary=total_count';
  return [
    act + '?fields=' + encodeURIComponent(INNER),
    // Бюджети беремо там само, де статуси: окремий запит заради одного
    // числа коштував би стільки ж, скільки весь список.
    bulk('campaigns', 'daily_budget,lifetime_budget'),
    bulk('adsets', 'daily_budget,lifetime_budget'),
    /* campaign_id й adset_id — заради підрахунку ЖИВОГО (див. нижче).

       effective_object_story_id — заради Сторінок. Він має вигляд
       {page_id}_{post_id}, тобто номер Сторінки в ньому вже є, і
       окремого запиту не треба: ми й так перелічуємо всі оголошення
       кабінета щогодини. Одне поле в тій самій відповіді проти
       окремого обходу парку — різниця в вартості на порядок. */
    bulk('ads', 'campaign_id,adset_id,creative{effective_object_story_id}'),
    /* Витрати по днях — щоб на сторінці працював вибір періоду, а не
       саме лише «сьогодні». Одне число за добу й нічого більше:
       розріз по кампаніях — це вже експорт, інша вага й інша вкладка.

       time_range явними датами, а не date_preset: пресети Facebook
       по-різному вирішують, чи входить у них сьогодні, і перевірити
       це ззовні ніяк. Дати ж означають рівно те, що написано.

       Днів без витрат у відповіді просто немає — і не треба: у базі
       відсутній день і нуль читаються однаково. */
    act + '/insights?fields=' + encodeURIComponent('spend,impressions,clicks')
      + '&time_increment=1&limit=' + (HISTORY_DAYS + 10)
      + '&time_range=' + encodeURIComponent(JSON.stringify({
          since: shiftDay(todayIn(tz), -(HISTORY_DAYS - 1)), until: todayIn(tz) })),
  ];
}

const total = (o: Json | null | undefined): number | null =>
  o && o.summary && o.summary.total_count != null ? Number(o.summary.total_count) : null;

/* Одна відповідь пакета → одне поле. Помилку саме по цьому кабінету
   повертаємо окремо: решта полів має лишитись з минулого разу, а не
   обнулитись через те, що Facebook не віддав інсайти. */
type Day = { day: string; spend: number | null;
             impressions: number | null; clicks: number | null };

/* Скільки оголошень і скільки різних постів кабінета ведуть на цю
   Сторінку. Пости рахуємо окремо від оголошень навмисно: один пост
   часто крутять кілька оголошень, і «12 оголошень на 2 пости» — зовсім
   інша картина, ніж «12 оголошень на 12 постів». */
type PageUse = { ads: number; posts: Set<string> };

function readParts(parts: (Json | null)[]):
    { patch: Json; err: string; days: Day[] | null; pages: Map<string, PageUse> | null } {
  const patch: Json = {};
  let err = '';

  const p0 = parts[0];
  if (p0 && p0.code === 200) {
    const b = p0.body || {};
    const ins = (b.insights?.data || [])[0] || {};
    patch.spend_today = num(ins.spend);
    patch.impressions_today = num(ins.impressions);
    patch.clicks_today = num(ins.clicks);
  } else if (p0) {
    err = String(p0.body?.error?.message || 'HTTP ' + p0.code);
  } else {
    err = 'Facebook did not answer in time';
  }

  /* ЩО ТАКЕ «ЖИВА» КАМПАНІЯ

     Кампанія може мати effective_status ACTIVE і не показувати нічого:
     усі її оголошення відхилені або чекають перевірки. Формально ввімкнена,
     фактично мертва. Рахувати такі активними — саме та брехня, через яку
     «10 активних із 60» не сходилось із тим, що видно в Ads Manager.

     Тому спершу збираємо кампанії й адсети, у яких є хоч ОДНЕ активне
     оголошення, і далі вважаємо живими лише їх. Для цього в оголошень і
     просимо campaign_id з adset_id — більше ні для чого вони тут не
     потрібні. */
  const adsPart = parts[3];
  const liveCampaigns = new Set<string>();
  const liveAdsets = new Set<string>();
  /* null означає «список оголошень не приїхав», порожня Map — «приїхав,
     і Сторінок у ньому немає». Різниця не косметична: у першому випадку
     чіпати збережене не можна, у другому старе треба прибрати. */
  let pages: Map<string, PageUse> | null = null;
  if (adsPart && adsPart.code === 200) {
    pages = new Map<string, PageUse>();
    (Array.isArray(adsPart.body?.data) ? adsPart.body.data : []).forEach((r: Json) => {
      /* Сторінку рахуємо з УСІХ оголошень, не лише з активних: питання
         «звідки взагалі крутить цей кабінет» не про те, що працює
         просто зараз. Зупинене оголошення так само залишило коментарі
         під своїм постом. */
      const story = String(r?.creative?.effective_object_story_id || '');
      if (story.includes('_')) {
        const pid = story.split('_')[0];
        const use = pages!.get(pid);
        if (use) { use.ads++; use.posts.add(story); }
        else pages!.set(pid, { ads: 1, posts: new Set([story]) });
      }
      if (String(r.effective_status) !== 'ACTIVE') return;
      if (r.campaign_id) liveCampaigns.add(String(r.campaign_id));
      if (r.adset_id) liveAdsets.add(String(r.adset_id));
    });
  }
  const liveIds: Record<string, Set<string> | null> =
    { campaigns: liveCampaigns, adsets: liveAdsets, ads: null };

  // Скільки грошей на день дозволено тому, що справді крутиться.
  let dailyBudget = 0;
  let sawBudget = false;

  ['campaigns', 'adsets', 'ads'].forEach((edge, i) => {
    const p = parts[i + 1];
    if (!p) { if (!err) err = 'Facebook did not answer in time'; return; }
    if (p.code !== 200) {
      if (!err) err = String(p.body?.error?.message || 'HTTP ' + p.code);
      return;
    }
    const rows: Json[] = Array.isArray(p.body?.data) ? p.body.data : [];
    const by: Record<string, number> = {};
    const live = liveIds[edge];
    let liveHere = 0;
    rows.forEach(r => {
      const k = String(r.effective_status || 'UNKNOWN');
      by[k] = (by[k] || 0) + 1;
      if (k !== 'ACTIVE') return;
      // Для оголошень ACTIVE і є «живе»: нижче за них нікого немає.
      if (live && !live.has(String(r.id))) return;
      liveHere++;
      /* Денний бюджет беремо лише з кампаній: у Facebook він стоїть або
         на кампанії (CBO), або на адсетах — сумувати обидва рівні
         означало б порахувати ті самі гроші двічі. */
      if (edge === 'campaigns' && r.daily_budget != null) {
        dailyBudget += Number(r.daily_budget) || 0;
        sawBudget = true;
      }
    });
    /* Кампанії без свого бюджету — бюджет на адсетах. Додаємо їх, тільки
       якщо на кампаніях не було нічого: інакше подвоїли б. */
    if (edge === 'adsets' && !sawBudget) {
      rows.forEach(r => {
        if (String(r.effective_status) !== 'ACTIVE') return;
        if (!liveAdsets.has(String(r.id))) return;
        if (r.daily_budget != null) dailyBudget += Number(r.daily_budget) || 0;
      });
    }
    /* Кабінет із тисячами оголошень в одну сторінку не влазить. Тоді
       розбивка стосується лише того, що приїхало, і мовчати про це
       не можна: інакше сума в підказці не зійдеться з підсумком, і
       довіри не буде ні до того, ні до того. */
    const all = total(p.body);
    const over = all != null && rows.length < all;
    if (over) by._more = all - rows.length;

    /* Два різні числа, і плутати їх не можна:
         _on   — скільки ввімкнено (effective_status ACTIVE)
         _active — скільки з них СПРАВДІ крутить, тобто має живе оголошення
       На екрані показуємо друге, перше лишається в підказці. */
    patch[edge + '_on'] = by.ACTIVE || 0;
    patch[edge + '_active'] = live ? liveHere : (by.ACTIVE || 0);

    /* Знаменник — із ЦІЄЇ Ж відповіді, а не з іншого запиту. Архівоване
       й видалене з нього прибираємо: це історія, а не те, що могло б
       крутитись. У розбивці воно лишається, тож нічого не ховається —
       просто не роздуває число, поруч з яким стоїть кількість активних.

       Коли сторінка переповнилась, частки архівованого в невидимому
       хвості ми не знаємо, тож беремо підсумок як є. Це верхня межа, і
       ключ _more поруч каже, що вона саме така. */
    patch[edge] = over ? all
      : rows.length - (by.ARCHIVED || 0) - (by.DELETED || 0);
    patch[edge + '_by_status'] = by;
  });

  // Бюджети Facebook віддає в мінімальних одиницях валюти, як і решту грошей.
  if (adsPart && adsPart.code === 200) patch.daily_budget = dailyBudget ? dailyBudget / 100 : 0;

  /* Витрати по днях. null означає «не знаємо» — і це не те саме, що
     порожній масив: порожній ми б записали як «за місяць не витрачено
     нічого», а це вже твердження, якого ми робити не можемо.

     Помилку сюди НЕ пишемо: історія — надбудова над станом кабінета, і
     класти через неї sync_error на цілий рядок було б непропорційно.
     Скільки кабінетів її не віддали, видно у відповіді функції. */
  const insPart = parts[4];
  let days: Day[] | null = null;
  if (insPart && insPart.code === 200) {
    days = (Array.isArray(insPart.body?.data) ? insPart.body.data : [])
      .map((r: Json) => ({
        day: String(r.date_start || ''),
        spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks)
      }))
      .filter((d: Day) => /^\d{4}-\d{2}-\d{2}$/.test(d.day));
  }

  return { patch, err, days, pages };
}

/* ── PostgREST ──
   Звичайний HTTP, як і в check-domains: supabase-js під капотом робить
   рівно те саме, а бібліотека заради трьох запитів — зайва вага й
   зайвий ризик на старті. */
async function pgGet(base: string, hdr: Json, path: string): Promise<Json[]> {
  const res = await fetch(base + '/rest/v1/' + path, { headers: hdr });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
  return await res.json();
}

async function pgUpsert(base: string, hdr: Json, table: string,
                        onConflict: string, rows: Json[]): Promise<void> {
  if (!rows.length) return;
  const res = await fetch(base + '/rest/v1/' + table + '?on_conflict=' + onConflict, {
    method: 'POST',
    headers: { ...hdr, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
}

/* ── журнал змін ──
   У дашборді вже є стрічка «що сталося з кабінетами» (account_events).
   Вона писалась зі сторінки й лише про те, що видно з daily_stats —
   тобто із запізненням на день і тільки про гроші. Стан із Facebook
   лягає в ту саму стрічку, щоб не заводити другу.

   Словник стрічки скромніший за перелік Facebook, тому зводимо:
   active → running, banned → banned, решта негаразду → issue.
   Подробиця не губиться — вона йде в note.

   Таблиці може не бути, RLS може не пустити. Це не причина завалити
   імпорт: журнал — надбудова, а не його суть. */
const EV_WORD: Record<string, string> = {
  active: 'running', banned: 'banned', closed: 'banned', closing: 'banned',
  unsettled: 'issue', review: 'issue', grace: 'issue', unknown: 'issue'
};

async function noteChanges(base: string, hdr: Json, team: string,
                           changes: { account_id: string; from: string; to: string; note: string }[]) {
  if (!changes.length || !team) return;
  try {
    await fetch(base + '/rest/v1/account_events', {
      method: 'POST',
      headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify(changes.map(c => ({
        team_name: team, account_id: c.account_id, kind: 'state',
        from_state: c.from ? (EV_WORD[c.from] || 'issue') : null,
        to_state: EV_WORD[c.to] || 'issue',
        note: c.note, source: 'fb'
      })))
    });
  } catch (_e) { /* стрічка — надбудова */ }
}

/* ── один токен ── */
type TokenRow = { id: number; label: string; token: string;
                  created_by: string; team_name: string | null;
                  // Яким ми його бачили минулого разу.
                  status?: string | null };

type Outcome = { accounts: number; failed: number; changed: number;
                 error: string; throttled: boolean;
                 days: number; noHistory: number; historyError: string;
                 // Чому не вдалось прочитати попередній стан кабінетів.
                 // Порожньо — порівняння працює, сповіщення живі.
                 knownError: string };

/* Привід написати людині. owner — хто саме має це прочитати: кабінети
   належать конкретним баєрам, і сповіщення ходять так само. */
type Alert = { owner: string; name: string; kind: 'bad' | 'good'; text: string };

async function syncToken(base: string, hdr: Json, t: TokenRow,
                         deadline: number, alerts: Alert[]): Promise<Outcome> {
  const out: Outcome = { accounts: 0, failed: 0, changed: 0, error: '', throttled: false,
                        days: 0, noHistory: 0, historyError: '', knownError: '' };

  let accs: Json[];
  try {
    accs = await listAccounts(t.token);
  } catch (e) {
    const g = e as GraphError;
    out.error = g.message;
    out.throttled = !!g.throttled;
    // Токен протух або його відкликали — це стан самого токена, і його
    // місце у fb_tokens, поруч із рештою діагностики. Інакше людина
    // бачила б порожній список кабінетів і гадала чому.
    await markToken(base, hdr, t, g.code === 190 ? 'expired' : 'error', g.message, alerts);
    return out;
  }

  out.accounts = accs.length;
  if (!accs.length) {
    // Токен більше не бачить нічого. Рядки не видаляємо — позначаємо.
    await markMissing(base, hdr, t, [], alerts);
    await markToken(base, hdr, t, 'no-accounts',
      'No ad account is visible — check Add Assets on the system user', alerts);
    return out;
  }

  /* Що ми знали про ці кабінети до цього прогону — щоб помітити зміну
     стану. Одним запитом на токен, а не по рядку.

     ТУТ БУВ БАГ, і він коштував усіх сповіщень. У фільтрі стояло
     `created_by=<uuid>` без оператора, а PostgREST чекає
     `created_by=eq.<uuid>` — і на кожному прогоні відповідав 400.
     Помилку ловив порожній catch, known лишався порожнім, кожен
     кабінет виглядав побаченим уперше (`if (!was) return`), і жодна
     зміна стану нікуди не йшла: ні бани, ні відхилення, ні події в
     account_events. Тест зв'язку при цьому працював, бо йде іншим
     шляхом — звідси й «начебто все налаштовано, а не приходить».

     Тому далі мовчазного catch тут немає: причину віддаємо назовні. */
  const known = new Map<string, { status: string; rejected: number }>();
  try {
    const prev = await pgGet(base, hdr,
      'fb_accounts?select=account_id,status,ads_by_status&created_by=eq.'
      + encodeURIComponent(t.created_by));
    prev.forEach((r: Json) => known.set(String(r.account_id), {
      status: String(r.status || ''),
      rejected: Number(r.ads_by_status?.DISAPPROVED) || 0
    }));
  } catch (e) {
    /* Перший прогін — це порожня відповідь, а не помилка. Усе інше
       означає, що порівнювати ми більше не вміємо, і сказати про це
       треба вголос: мовчазна втрата порівняння і є те, як зникають
       сповіщення. */
    out.knownError = (e as Error).message;
  }

  const now = new Date().toISOString();
  const rows: Json[] = [];
  const dayRows: Json[] = [];
  // кабінет -> Сторінка -> скільки оголошень і постів
  const pageUse = new Map<string, Map<string, PageUse>>();
  const changes: { account_id: string; from: string; to: string; note: string }[] = [];

  // Основа рядка — з того, що вже приїхало списком: стан, картка,
  // валюта. Навіть якщо пакетні запити нижче впадуть, це вже збережеться.
  const base_ = accs.map(a => {
    const id = String(a.account_id || String(a.id || '').replace(/^act_/, ''));
    const code = Number(a.account_status || 0);
    const fsd = a.funding_source_details || {};
    return {
      id,
      row: {
        created_by: t.created_by, team_name: t.team_name, token_id: t.id,
        account_id: id, name: a.name || null,
        status: statusWord(code), status_code: code || null,
        disable_reason: disableReason(a.disable_reason) || null,
        currency: a.currency || null, timezone_name: a.timezone_name || null,
        business_id: a.business?.id || null, business_name: a.business?.name || null,
        card: fsd.display_string || null, card_type: fsd.type || null,
        amount_spent: cents(a.amount_spent), spend_cap: cents(a.spend_cap),
        balance: cents(a.balance),
        // Побачили — значить не зник. Знімаємо позначку, якщо вона була.
        missing_since: null,
        sync_error: null, synced_at: now
      } as Json
    };
  });

  for (let i = 0; i < base_.length; i += BATCH_MAX / PER_ACC) {
    if (Date.now() > deadline) { out.error = out.error || 'ran out of time'; break; }
    const slice = base_.slice(i, i + BATCH_MAX / PER_ACC);
    let parts: (Json | null)[];
    try {
      parts = await graphBatch(t.token,
        slice.flatMap(x => urlsFor(x.id, String(x.row.timezone_name || ''))));
    } catch (e) {
      const g = e as GraphError;
      out.error = g.message;
      out.throttled = !!g.throttled;
      // Пакет не пройшов цілком — але те, що вже є списком, зберегти
      // варто: стан кабінета важливіший за кількість адсетів.
      slice.forEach(x => { x.row.sync_error = g.message; rows.push(x.row); });
      break;
    }
    slice.forEach((x, k) => {
      const { patch, err, days, pages } = readParts(parts.slice(k * PER_ACC, (k + 1) * PER_ACC));
      if (pages) pageUse.set(x.id, pages);
      Object.assign(x.row, patch);
      if (err) { x.row.sync_error = err; out.failed++; }
      rows.push(x.row);
      if (!days) { out.noHistory++; return; }
      days.forEach(d => dayRows.push({
        created_by: t.created_by, team_name: t.team_name,
        account_id: x.id, day: d.day,
        spend: d.spend, impressions: d.impressions, clicks: d.clicks,
        currency: x.row.currency, synced_at: now
      }));
    });
  }

  // Кабінети, до яких не дійшли черги (дедлайн або зірваний пакет), усе
  // одно записуємо: стан і картка в них уже є.
  base_.forEach(x => { if (!rows.includes(x.row)) rows.push(x.row); });

  rows.forEach(r => {
    const was = known.get(String(r.account_id));
    if (!was) return;   // перший раз бачимо — порівнювати нема з чим
    const name = String(r.name || r.account_id);

    if (was.status !== r.status) {
      out.changed++;
      changes.push({ account_id: String(r.account_id), from: was.status, to: String(r.status),
                     note: [r.name, r.disable_reason].filter(Boolean).join(' · ') });
      /* Повернення до active — теж новина, і хороша. Мовчати про неї
         означало б, що з бота приходять лише погані звістки, а такого
         бота вимикають. */
      const worse = r.status !== 'active';
      alerts.push({ owner: t.created_by, name,
        kind: worse ? 'bad' : 'good',
        text: worse
          ? name + ' — ' + String(r.status)
            + (r.disable_reason ? ' (' + r.disable_reason + ')' : '')
          : name + ' — back to active' });
    }

    /* Нові відхилення. Саме НОВІ: писати щогодини «у тебе 120
       відхилених» — найкоротший шлях до того, щоб сповіщення перестали
       читати. Цікаво, коли число зросло. */
    const nowRej = Number((r.ads_by_status as Json)?.DISAPPROVED) || 0;
    /* У вимкненому кабінеті не крутиться нічого, і відхилення там —
       не новина, а наслідок. Писати про них поверх «кабінет забанено»
       означало б два повідомлення про одну біду. */
    if (r.status === 'active' && nowRej > was.rejected) {
      alerts.push({ owner: t.created_by, name, kind: 'bad',
        text: name + ' — +' + (nowRej - was.rejected)
            + ' rejected ad(s), ' + nowRej + ' in total' });
    }
  });

  await pgUpsert(base, hdr, 'fb_accounts', 'created_by,account_id', rows);
  /* Історія — окремою таблицею й окремим ризиком. Її може ще не бути
     (ALTER з FB_SYNC.sql не виконано), і це не привід втратити все
     інше, що ми щойно дізнались про кабінети. Але й мовчати не
     будемо: причина їде у відповідь функції, а сторінка її показує. */
  try {
    await pgUpsert(base, hdr, 'fb_spend_daily', 'created_by,account_id,day', dayRows);
    out.days = dayRows.length;
  } catch (e) {
    out.historyError = (e as Error).message;
  }
  await savePages(base, hdr, t, pageUse, now);
  await markMissing(base, hdr, t, accs.map(a => String(a.account_id || '')), alerts);
  await noteChanges(base, hdr, t.team_name || '', changes);
  await markToken(base, hdr, t, 'ok', `Sees ${accs.length} ad account(s)`, alerts);
  return out;
}

/* ═════ СТОРІНКИ, З ЯКИХ КРУТЯТЬ ═════

   Питання «а з яких Сторінок узагалі йде реклама» досі не мало де
   з'явитись: номер Сторінки зашитий у кожному оголошенні, але щоб його
   побачити, треба було відкрити оголошення в Ads Manager.

   Тепер він приїжджає разом зі статусами, тим самим запитом, і
   складається в окрему таблицю: Сторінка, кабінет, скільки оголошень і
   постів. Одна Сторінка на десять кабінетів — це видно згори й лише
   згори; бан такої Сторінки забирає всі десять одразу.

   Назву й права беремо з /me/accounts — один запит на токен. Сторінки,
   якої там немає, ми не бачимо: лишається номер і чесне «доступу
   немає». Саме цим і корисне: список показує не тільки те, чим ви
   керуєте, а й те, чим крутите НЕ керуючи. */
async function savePages(base: string, hdr: Json, t: TokenRow,
                         use: Map<string, Map<string, PageUse>>, now: string): Promise<void> {
  if (!use.size) return;

  /* Що з цих Сторінок системний користувач справді має. Відмова тут —
     не привід нічого не записати: номери Сторінок ми знаємо й без
     нього, а «доступу немає» — теж відповідь, і саме та, заради якої
     на цей список дивляться. */
  const mine = new Map<string, { name: string; tasks: string[] }>();
  if ([...use.values()].some(m => m.size)) {
    try {
      const j = await graph('/me/accounts', t.token, { fields: 'id,name,tasks', limit: 200 });
      (Array.isArray(j.data) ? j.data : []).forEach((x: Json) => mine.set(String(x.id), {
        name: String(x.name || ''),
        tasks: Array.isArray(x.tasks) ? x.tasks.map(String) : []
      }));
    } catch (_e) { /* без назв, але з номерами */ }
  }

  const rows: Json[] = [];
  for (const [account, pages] of use) {
    for (const [pageId, u] of pages) {
      const has = mine.get(pageId);
      rows.push({
        created_by: t.created_by, team_name: t.team_name,
        account_id: account, page_id: pageId,
        page_name: has ? (has.name || null) : null,
        can_moderate: has ? has.tasks.some(x => x === 'MODERATE' || x === 'MANAGE') : false,
        ads: u.ads, posts: u.posts.size, seen_at: now
      });
    }
  }
  try {
    if (rows.length)
      await pgUpsert(base, hdr, 'fb_cabinet_pages', 'created_by,account_id,page_id', rows);
    /* Прибираємо те, чого цього разу не було: оголошення перевели на
       іншу Сторінку, і стара має зникнути зі списку, а не висіти в
       ньому вічно. Видаляємо ТІЛЬКИ по кабінетах, які щойно обійшли —
       ті, до яких не дійшли черги, не чіпаємо. */
    const ids = [...use.keys()].filter(x => /^\d+$/.test(x));
    if (ids.length) {
      await fetch(base + '/rest/v1/fb_cabinet_pages'
        + '?created_by=eq.' + encodeURIComponent(t.created_by)
        + '&account_id=in.(' + ids.join(',') + ')'
        + '&seen_at=lt.' + encodeURIComponent(now), {
        method: 'DELETE', headers: { ...hdr, Prefer: 'return=minimal' }
      });
    }
  } catch (_e) { /* список Сторінок — надбудова, не привід валити імпорт */ }
}

/* ── кабінет, який зник ──

   Токен перестав бачити кабінет: його забрали в БМ, відкликали доступ,
   закрили. Рядок при цьому НЕ видаляємо, і це свідомо.

   Видалити означало б втратити все, що ти до нього дописав — агента,
   профіль, логін, нотатку, — і зробити це мовчки. А ще список просто
   зменшився б, і зрозуміти, котрого кабінета не стало, було б нізвідки:
   зникле не лишає сліду.

   Тому ставимо дату, коли перестали бачити. Дані лишаються останніми
   відомими, на сторінці такий рядок підписаний, і рішення видаляти —
   твоє, а не автоматики.

   Позначаємо ТІЛЬКИ після успішного перелічення. Якщо Facebook відмовив
   або ми вперлись у ліміт, ми не знаємо, що зникло, а що просто не
   приїхало, — і мовчазно позначити весь парк було б найгіршим, що ця
   функція може зробити. */
async function markMissing(base: string, hdr: Json, t: TokenRow,
                           seen: string[], alerts: Alert[]): Promise<void> {
  try {
    let q = 'fb_accounts?token_id=eq.' + t.id + '&missing_since=is.null';
    // Номери кабінетів — цифри, тож лапки й екранування тут ні до чого.
    const ids = seen.filter(x => /^\d+$/.test(x));
    if (ids.length) q += '&account_id=not.in.(' + ids.join(',') + ')';

    /* Спершу дивимось, КОГО саме зараз позначимо, і лише потім
       позначаємо. Після PATCH цього вже не дізнатись: фільтр
       missing_since=is.null більше їх не знайде, і сказати, що саме
       зникло, буде нізвідки.

       Саме тут була діра. Позначка ставилась мовчки: у базі все
       правильно, а людина дізнавалась про зниклий кабінет тільки якщо
       сама його шукала — і то не завжди, бо зріз «Live» такі рядки не
       показує. Зникнення кабінета — новина того ж рівня, що й бан, і
       має приходити так само. */
    let rows: Json[] = [];
    try { rows = await pgGet(base, hdr, q + '&select=account_id,name,status'); }
    catch (_e) { /* не перелічили — позначку все одно ставимо */ }

    const res = await fetch(base + '/rest/v1/' + q, {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ missing_since: new Date().toISOString() })
    });
    if (!res.ok || !rows.length) return;

    rows.forEach((r: Json) => {
      const name = String(r.name || r.account_id);
      alerts.push({ owner: t.created_by, name, kind: 'bad',
        text: name + ' — the token no longer sees this cabinet' });
    });

    /* Окремий kind. Стрічка станів рахує тільки kind='state', тож
       зникнення її не збиває, але в історії кабінета й у тостах воно
       зʼявляється — саме там, де його шукатимуть. */
    if (t.team_name) {
      try {
        await fetch(base + '/rest/v1/account_events', {
          method: 'POST', headers: { ...hdr, Prefer: 'return=minimal' },
          body: JSON.stringify(rows.map((r: Json) => ({
            team_name: t.team_name, account_id: String(r.account_id),
            kind: 'gone', to_state: 'issue',
            from_state: r.status ? (EV_WORD[String(r.status)] || 'issue') : null,
            note: 'The token stopped seeing this cabinet. The numbers stay as last seen.',
            source: 'fb'
          })))
        });
      } catch (_e) { /* стрічка — надбудова */ }
    }
  } catch (_e) { /* позначка — не привід завалити імпорт */ }
}

/* Стан самого токена тримаємо свіжим: саме сюди дивляться, коли імпорт
   раптом привіз порожнечу. */
/* Токен, який перестав працювати, — це тиша всіх тиш: поки він
   мертвий, жодне інше сповіщення вже не прийде, бо приходити нема з
   чого. Кабінети при цьому виглядають так само, як учора, і саме тому
   про сам токен треба сказати окремо й одразу.

   Говоримо лише про ЗМІНУ: щогодинне «токен усе ще протух» читають
   двічі, а потім вимикають бота. Перша поява токена теж не подія —
   він щойно доданий, і його стан людина бачить на екрані. */
async function markToken(base: string, hdr: Json, t: TokenRow,
                         status: string, note: string,
                         alerts?: Alert[]): Promise<void> {
  const was = String(t.status || '');
  if (alerts && was && was !== status) {
    const bad = status !== 'ok';
    alerts.push({ owner: t.created_by, name: t.label, kind: bad ? 'bad' : 'good',
      text: bad
        ? 'Token \u00ab' + t.label + '\u00bb — ' + status + (note ? ' (' + note + ')' : '')
        : 'Token \u00ab' + t.label + '\u00bb works again' });
  }
  try {
    await fetch(base + '/rest/v1/fb_tokens?id=eq.' + t.id, {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ status, status_note: note, checked_at: new Date().toISOString() })
    });
  } catch (_e) { /* не привід валити імпорт */ }
}

/* ═══════════ TELEGRAM ═══════════

   Пишемо, ТІЛЬКИ коли є що сказати. Щогодинне «все гаразд» перестають
   читати на третій день, а разом з ним перестають помічати те єдине
   повідомлення, заради якого все й робилось.

   Через це сповіщення йдуть лише про ЗМІНИ: кабінет змінив стан або
   відхилених оголошень стало більше, ніж було. «У тебе 120
   відхилених» щогодини — найкоротший шлях до вимкненого бота.

   Кожному своє: кабінети належать конкретним баєрам (created_by
   токена), і адресати беруться з tg_links. Хто себе не прив'язав —
   того просто немає в розсилці, це вибір людини, а не помилка.

   Токен бота живе в секретах функції. У дашборді йому не місце: це
   статичний сайт, який відкриває вся команда. */

const TG_MAX = 20;     // скільки кабінетів перелічуємо поіменно
const TG_LIMIT = 3900; // межа Telegram — 4096, лишаємо запас

function tgText(list: Alert[]): string {
  const bad = list.filter(a => a.kind === 'bad');
  const head = (bad.length ? 'Кабінети: ' + bad.length + ' потребують уваги'
                           : 'Кабінети: є зміни') + '\n\n';
  const mark = (a: Alert) => (a.kind === 'bad' ? '\u26a0 ' : '\u2705 ') + a.text;
  // Спершу погане: саме через нього відкривають повідомлення.
  const sorted = bad.concat(list.filter(a => a.kind !== 'bad'));
  const lines = sorted.slice(0, TG_MAX).map(mark);
  const tail = () => {
    const rest = sorted.length - lines.length;
    return rest > 0 ? '\n\n\u2026і ще ' + rest + '. Решта — у дашборді, вкладка Cabinets.' : '';
  };
  while (lines.length > 1 && (head + lines.join('\n') + tail()).length > TG_LIMIT) lines.pop();
  return head + lines.join('\n') + tail();
}

async function tgPost(token: string, chat: string, text: string): Promise<string> {
  try {
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // Без parse_mode навмисно: назви кабінетів рясніють дужками й
      // підкресленнями, а розмітка Telegram на них спотикається і
      // відповідає 400. Текст і так читається.
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
    });
    if (res.ok) return 'sent';
    let why = 'HTTP ' + res.status;
    try { why = (await res.json()).description || why; } catch (_e) { /* хай буде код */ }
    return 'failed: ' + why;
  } catch (e) {
    return 'failed: ' + (e as Error).message;
  }
}

async function tgSend(base: string, hdr: Json, alerts: Alert[]): Promise<string> {
  if (!alerts.length) return 'nothing to report';
  const token = Deno.env.get('TG_BOT_TOKEN') || '';
  if (!token) return 'not configured';

  const out: string[] = [];
  // Спільний чат бачить усе — на те він і спільний. Немає — не біда.
  const shared = Deno.env.get('TG_CHAT_ID') || '';
  if (shared) out.push('shared:' + await tgPost(token, shared, tgText(alerts)));

  const byOwner = new Map<string, Alert[]>();
  alerts.forEach(a => {
    if (!a.owner) return;
    const list = byOwner.get(a.owner);
    if (list) list.push(a); else byOwner.set(a.owner, [a]);
  });
  if (!byOwner.size) return out.join(' | ') || 'nobody to notify';

  let links: { user_id: string; chat_id: string }[] = [];
  try {
    const res = await fetch(base + '/rest/v1/tg_links?select=user_id,chat_id&chat_id=not.is.null',
      { headers: hdr });
    if (res.ok) links = await res.json();
  } catch (_e) { /* таблиці може не бути — тоді нікому писати */ }

  const chats = new Map(links.map(l => [l.user_id, l.chat_id]));
  let sent = 0, unlinked = 0;
  const fails: string[] = [];
  for (const [owner, list] of byOwner) {
    const chat = chats.get(owner);
    if (!chat) { unlinked++; continue; }
    const r = await tgPost(token, chat, tgText(list));
    if (r === 'sent') sent++; else fails.push(r);
  }
  out.push('buyers: ' + sent + ' sent'
    + (unlinked ? ', ' + unlinked + ' not linked' : '')
    + (fails.length ? ', ' + fails.length + ' failed (' + fails[0] + ')' : ''));
  return out.join(' | ');
}

/* Перевірка звʼязку, яку просять саме тоді, коли все налаштовано, але
   ще жодного разу нічого не приходило — і незрозуміло, чи це тиша від
   того, що новин немає, чи від того, що щось не так.

   Пишемо ТІЛЬКИ в чат того, хто натиснув. Не в спільний: тест має
   перевіряти звʼязок, а не смикати команду. І маршрут навмисно той
   самий, що в справжніх сповіщень — секрет, tg_links, tgPost: інакше
   він перевіряв би не те, що треба. */
async function tgTest(base: string, hdr: Json, owner: string): Promise<Json> {
  const token = Deno.env.get('TG_BOT_TOKEN') || '';
  if (!token) return { test: 'not configured',
    note: 'TG_BOT_TOKEN is not set in the fb-sync secrets — the function has nothing to send with' };

  let chat = '';
  try {
    const res = await fetch(base + '/rest/v1/tg_links?select=chat_id&user_id=eq.'
      + encodeURIComponent(owner) + '&limit=1', { headers: hdr });
    if (!res.ok) return { test: 'no links table',
      note: 'tg_links is not there yet — run TELEGRAM.sql' };
    chat = String(((await res.json())[0] || {}).chat_id || '');
  } catch (e) {
    return { test: 'failed', note: (e as Error).message };
  }
  if (!chat) return { test: 'not linked',
    note: 'Your Telegram is not connected — press Connect Telegram above and start the bot' };

  const r = await tgPost(token, chat,
    '\u2705 Перевірка звʼязку з дашборда.\n\n'
    + 'Якщо ти це читаєш — сповіщення про кабінети прийдуть сюди ж: '
    + 'зміна стану кабінета й нові відхилення. Щогодинного «все гаразд» не буде.');
  return { test: r, shared: false };
}

/* ── вхід ── */
Deno.serve(async (req) => {
  // OPTIONS — найперше й без жодних умов: без CORS-заголовків на
  // preflight браузер не покаже навіть тексту помилки.
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });
  try {
    return await handle(req);
  } catch (e) {
    return reply({ error: 'unhandled: ' + (e as Error).message }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  const base = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const svc = Deno.env.get('SERVICE_ROLE_KEY')
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  /* Ключ сервісної ролі тут потрібен завжди — без нього не прочитати
     fb_tokens.token, а він навмисно закритий навіть від власника.
     Тому межі ставить не ключ, а перевірений uid того, хто покликав. */
  if (!svc) return reply({
    error: 'SERVICE_ROLE_KEY is not set in the function secrets' }, 400);
  const hdr: Json = { apikey: svc, Authorization: 'Bearer ' + svc,
                      'content-type': 'application/json' };

  let onlyOwner = '';
  let cron = false;
  let onlyToken = 0;

  const cronKey = req.headers.get('x-cron-key') || '';
  if (cronKey) {
    const want = Deno.env.get('CRON_SECRET') || '';
    if (!want) return reply({ error: 'scheduled run is not configured: set CRON_SECRET' }, 400);
    if (!sameSecret(cronKey, want)) return reply({ error: 'bad cron key' }, 401);
    cron = true;
  } else {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return reply({ error: 'no authorization header' }, 401);
    onlyOwner = await whoAmI(base, anon, auth);
    if (!onlyOwner) return reply({ error: 'could not verify who is calling' }, 401);
  }

  let wantTest = false;
  try {
    const body = await req.json();
    onlyToken = Number(body?.token_id || 0) || 0;
    wantTest = body?.test === true;
  } catch (_e) { /* тіла може не бути */ }

  /* Тестове повідомлення — дія людини й тільки людини. З розкладу воно
     не має сенсу: нікому буде його читати, а розсилати тест щогодини —
     найкоротший шлях до вимкненого бота. */
  if (wantTest) {
    if (cron) return reply({ error: 'the test message is for a person, not for the schedule' }, 400);
    return reply(await tgTest(base, hdr, onlyOwner));
  }

  let q = 'fb_tokens?select=id,label,token,created_by,team_name,status&order=id.asc';
  if (onlyOwner) q += '&created_by=eq.' + encodeURIComponent(onlyOwner);
  if (onlyToken) q += '&id=eq.' + onlyToken;

  let tokens: TokenRow[];
  try {
    tokens = await pgGet(base, hdr, q) as TokenRow[];
  } catch (e) {
    const msg = (e as Error).message;
    return reply({ error: /fb_tokens|does not exist/i.test(msg)
      ? 'token storage does not exist yet — run FB_TOKENS.sql' : msg }, 500);
  }

  if (!tokens.length) return reply({ cron, tokens: 0, accounts: 0, changed: 0,
    note: 'no tokens to sync' });

  const deadline = Date.now() + DEADLINE_MS;
  const alerts: Alert[] = [];
  let accounts = 0, failed = 0, changed = 0, done = 0;
  let days = 0, noHistory = 0, historyError = '';
  const problems: string[] = [];
  let throttled = false;

  for (const t of tokens) {
    if (Date.now() > deadline) break;
    let r: Outcome;
    try {
      r = await syncToken(base, hdr, t, deadline, alerts);
    } catch (e) {
      // Один поганий токен не мусить зупиняти решту: у людини їх
      // десяток, і зупинятись на першому — найгірше з можливого.
      problems.push(t.label + ': ' + (e as Error).message);
      continue;
    }
    done++;
    accounts += r.accounts; failed += r.failed; changed += r.changed;
    days += r.days; noHistory += r.noHistory;
    if (r.historyError && !historyError) historyError = r.historyError;
    if (r.error) problems.push(t.label + ': ' + r.error);
    /* Порівняння зі станом минулого прогону відвалилось. Це не «трохи
       гірше»: без нього сповіщення не мають із чого взятись, і саме
       так вони одного разу вже зникли мовчки. */
    if (r.knownError)
      problems.push(t.label + ': cannot compare with the previous run, so no alerts '
        + 'can be raised for it — ' + r.knownError);
    if (r.throttled) {
      // Ліміт Facebook рахує навіть відмовлені запити. Далі по списку
      // буде те саме — краще вийти й доробити наступною годиною.
      throttled = true;
      break;
    }
  }

  const telegram = await tgSend(base, hdr, alerts);

  /* Про історію витрат кажемо одним рядком. Мовчання тут коштувало б
     дорого: вибір періоду на сторінці спирається саме на неї, і «чому
     за минулий тиждень нулі» має мати відповідь у тому ж місці, де
     натискають Sync. */
  const history = historyError
    ? (/fb_spend_daily|does not exist|42P01/i.test(historyError)
        ? 'no table yet — run the fb_spend_daily block from FB_SYNC.sql'
        : historyError)
    : days + ' day(s)' + (noHistory ? ', ' + noHistory + ' cabinet(s) gave none' : '');

  return reply({
    fn: FN_VERSION,
    cron, tokens: done, accounts, failed, changed, throttled,
    more: done < tokens.length,
    history,
    telegram,
    problems: problems.slice(0, 10)
  });
}
