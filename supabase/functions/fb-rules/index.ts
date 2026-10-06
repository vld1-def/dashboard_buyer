/* ═══════════ ПРАВИЛА: ВИМИКАЄМО ТЕ, ЩО НЕ ОКУПАЄТЬСЯ ═══════════

   Друга функція в проєкті, яка щось МІНЯЄ у Facebook. Перша — fb-pause,
   і вона навмисне недосяжна з розкладу. Ця — досяжна, бо в цьому вся
   суть: правила мусять стріляти без людини. Через це тут окремі межі, і
   вони не формальність:

     1. ВЛАСНИЙ СЕКРЕТ РОЗКЛАДУ. RULES_CRON_SECRET, а не той, яким
        ходить fb-sync. Ключ, що вміє лише читати, не повинен уміти
        вимикати рекламу — навіть якщо колись витече.
     2. ТІЛЬКИ ВИМИКАЄМО. Увімкнути назад автоматика не може й не
        зможе: вмикати треба вибірково й свідомо, інакше одне правило
        одного ранку підніме те, що глушили спеціально.
     3. ПОРІГ СПЕНДУ ОБОВʼЯЗКОВИЙ. Без нього оголошення з двома
        доларами витрат і одним кліком вимикається як «дорогий клік».
        Правило без порога не зберігається.
     4. НОВЕ ПРАВИЛО ПОЧИНАЄ З ЗВІТУ. dry:true означає «порахуй і
        напиши, але не чіпай». Дивишся тиждень у Telegram, що воно
        хотіло зробити, і лише тоді даєш право діяти.

   ЧОМУ МЕТРИКИ САМЕ З FACEBOOK. Ліди тут — події Facebook, а не наш
   імпорт. Це принципово: імпорт приїжджає раз на день руками, і
   правило «спенд є, лідів нуль» на вчорашніх даних вимикало б те, що
   насправді ллє. Усе, що ми рахуємо, приходить у тій самій відповіді,
   що й спенд, тобто одного віку з ним.

   ЗВІДКИ ЦІ ЦИФРИ БЕРУТЬСЯ. Не звідси. Їх складає fb-sync у fb_ad_today
   тим самим пакетом, яким обходить кабінети: список оголошень він тягнув
   і до правил — заради статусів і Сторінок, — тож цифри доїхали одним
   підзапитом, а не окремим обходом парку. Ця функція читає готове.

   Отже до Facebook вона іде РІВНО один раз і рівно щоб вимкнути. Свіжість
   знімка перевіряє сама: застарів — не діє й каже про це, бо вимикати за
   годинними числами означало б гасити те, що вже виправили.

   Розгортання:
     supabase functions deploy fb-rules
     (секрети: RULES_CRON_SECRET, TG_BOT_TOKEN — див. FB_RULES.sql)
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const FN_VERSION = 'rules-5';
const GRAPH = 'https://graph.facebook.com/v21.0';
const DEADLINE_MS = 110_000;
const ADS_LIMIT = 500;      // стеля списку оголошень на кабінет
/* Наскільки старим може бути знімок, щоб на нього ще можна було
   спиратись. fb-sync освіжає його щопівгодини вдень і раз на годину
   вночі, тож 90 хвилин — це «синхронізація пропустила один прогін»,
   а не «дані вчорашні». Старіше — не діємо: вимкнути оголошення за
   годинними числами означає гасити те, що людина вже виправила. */
const SNAP_MAX_AGE_MS = 90 * 60_000;
// Окремою функцією, щоб це рішення можна було перевірити тестом, а не
// вірити йому на слово: воно вирішує, діяти чи не діяти взагалі.
function snapTooOld(ageMs: number, limitMs = SNAP_MAX_AGE_MS): boolean {
  return !(ageMs <= limitMs);
}

/* НАСКІЛЬКИ СТАРИМ ЗНІМОК МАЄ ПРАВО БУТИ — питання не до нас, а до
   налаштованого темпу синхронізації.

   Дев'яносто хвилин були зашиті під припущення «вдень щопівгодини,
   вночі раз на годину». Але темп налаштовується, і в списку є «раз на
   2 години» та «раз на 4». Вибравши будь-який із них, людина мовчки
   вимикала собі нічні правила: знімок ставав старшим за межу, і
   правила відмовлялись діяти — саме вночі, коли на них і
   покладаються.

   Тепер межа йде за темпом: інтервал плюс запас на те, що прогін
   почався не рівно в хвилину. Нижче дев'яноста хвилин не опускаємось —
   на швидкому темпі ширша межа нікому не заважає, а запас на
   пропущений прогін лишається.

   Це друга лінія. Перша — ланцюг: fb-sync запускає правила одразу за
   собою, і там знімку секунди. Межа потрібна на випадок, коли ланцюг
   не налаштований або синхронізація стала зовсім. */
const SNAP_PACE_GRACE_MS = 30 * 60_000;

async function snapLimit(base: string, hdr: Json): Promise<number> {
  let rows: Json[] = [];
  try { rows = await pgGet(base, hdr, 'team_settings?select=value&key=eq.fb_sync_pace'); }
  catch (_e) { return SNAP_MAX_AGE_MS; }
  let slowest = 0;
  rows.forEach(r => {
    let v: Json = {};
    try { v = typeof r.value === 'string' ? JSON.parse(String(r.value)) : (r.value || {}); }
    catch (_e) { return; }
    /* Беремо ПОВІЛЬНІШИЙ із двох: межа мусить покривати найгірший
       випадок доби, інакше вночі вона знову виявиться замалою. Котра
       зараз година, тут не питаємо — знімок міг приїхати ще вночі. */
    [v.day, v.night].forEach(x => {
      const n = Number(x);
      if (Number.isFinite(n) && n >= 5 && n <= 1440) slowest = Math.max(slowest, n);
    });
  });
  if (!slowest) return SNAP_MAX_AGE_MS;
  return Math.max(SNAP_MAX_AGE_MS, slowest * 60_000 + SNAP_PACE_GRACE_MS);
}
const BATCH_MAX = 50;       // стеля пакета Graph

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

async function whoAmI(base: string, anon: string, auth: string): Promise<string> {
  const res = await fetch(base + '/auth/v1/user', { headers: { apikey: anon, Authorization: auth } });
  if (!res.ok) return '';
  const u = await res.json().catch(() => ({}));
  return String(u?.id || '');
}

async function pgGet(base: string, hdr: Json, path: string): Promise<Json[]> {
  const res = await fetch(base + '/rest/v1/' + path, { headers: hdr });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
  return await res.json();
}

/* ═══════════ ПРАВИЛА ═══════════ */

type Cond = { m: string; op: string; v: number };
type Rule = {
  id: string; name: string; on: boolean; dry: boolean;
  /* ЧИЄ ЦЕ ПРАВИЛО. Не для звіту — для того, чиї кабінети воно має
     право чіпати. Див. loadRules нижче. */
  owner: string;
  level: 'ad' | 'adset' | 'campaign';
  match: 'all' | 'any';
  minSpend: number;
  when: Cond[];
  cabs: string[];      // порожньо — усі кабінети
  nameHas: string;     // порожньо — будь-яка назва
};

/* Метрики. Кожна — з того, що прийшло в одній відповіді зі спендом:
   нічого не домішуємо з інших джерел, щоб у правилі не зустрілись
   числа різного віку.

   Ділення на нуль тут не помилка, а відповідь: $15 витрачено, кліків
   нуль — ціна кліка нескінченна, і правило «клік дорожче 1.5» мусить
   спрацювати. А от коли витрат немає взагалі, метрики немає: це не
   нуль, це «нічого не відбувалось», і такі сутності правила не
   торкаються (плюс поріг спенду однаково їх відсіює). */
type Agg = { spend: number; imps: number; clicks: number; linkClicks: number;
             leads: number; regs: number; purchases: number };

const METRICS: Record<string, (a: Agg) => number | null> = {
  spend:       a => a.spend,
  imps:        a => a.imps,
  leads:       a => a.leads,
  link_clicks: a => a.linkClicks,
  cpc_link:    a => a.linkClicks > 0 ? a.spend / a.linkClicks : (a.spend > 0 ? Infinity : null),
  cpl:         a => a.leads > 0 ? a.spend / a.leads : (a.spend > 0 ? Infinity : null),
  regs:        a => a.regs,
  cpr:         a => a.regs > 0 ? a.spend / a.regs : (a.spend > 0 ? Infinity : null),
  purchases:   a => a.purchases,
  cpp:         a => a.purchases > 0 ? a.spend / a.purchases : (a.spend > 0 ? Infinity : null),
  cpm:         a => a.imps > 0 ? a.spend / a.imps * 1000 : (a.spend > 0 ? Infinity : null),
  ctr_link:    a => a.imps > 0 ? a.linkClicks / a.imps * 100 : null
};

/* Підписи для повідомлення. Ті самі метрики в дашборді підписані
   довше («Cost per link click»), бо там є місце. Тут рядок читають у
   телефоні, тож коротко — але так, щоб не сплутати CTR із CTR: у нас
   це ЗАВЖДИ link CTR, тобто переходи за посиланням ÷ покази, а не
   «CTR (all)» з Ads Manager, куди входять і лайки, і кліки по сторінці.
   Саме ця плутанина й змушує питати, чому правило спрацювало. */
const METRIC_LABEL: Record<string, string> = {
  spend: 'spend', imps: 'impressions', leads: 'leads',
  link_clicks: 'link clicks', cpc_link: 'cost per link click',
  cpl: 'cost per lead', cpm: 'CPM', ctr_link: 'link CTR',
  regs: 'registrations', cpr: 'cost per registration',
  purchases: 'purchases', cpp: 'cost per purchase'
};
const METRIC_MONEY = ['spend', 'cpc_link', 'cpl', 'cpm', 'cpr', 'cpp'];

function fmtMetric(m: string, v: number | null): string {
  if (v == null) return 'n/a';
  if (v === Infinity) return '∞';
  if (METRIC_MONEY.includes(m)) return money(v);
  if (m === 'ctr_link') return (Math.round(v * 100) / 100) + '%';
  return String(Math.round(v * 100) / 100);
}

/* ЧОМУ САМЕ ЦЕЙ РЯДОК. Повідомлення показувало один і той самий набір
   чисел — спенд, клік, лід — хоч би за чим ганялось правило. Правило
   на CTR вимикало оголошення, а CTR у повідомленні не було взагалі:
   перевірити його рішення було ніяк, і питання «чому воно зупинило, в
   мене там інші числа» виникало щоразу — причому виправдано.

   Показуємо і виміряне, і поріг: «link CTR 1.09% < 30%» пояснює
   рішення цілком, і видно навіть те, що поріг виставлено не тією
   міркою. */
function whyHit(r: Rule, a: Agg): string {
  return r.when.map(c => METRIC_LABEL[c.m] || c.m)
    .map((label, i) => {
      const c = r.when[i];
      const f = METRICS[c.m];
      return label + ' ' + fmtMetric(c.m, f ? f(a) : null)
        + ' ' + c.op + ' ' + fmtMetric(c.m, c.v);
    })
    .join(r.match === 'any' ? ' OR ' : ' AND ');
}

/* ЛІД — ЦЕ ПОДІЯ ПІКСЕЛЯ, і більше нічого.

   Довго це був список із галочками в дашборді, і кожна галочка
   додавала свою подію. Виходило число, яке не сходилось ні з чим, а
   знайти, яка саме галочка його роздула, можна було лише перебором.
   Для правил це гірше, ніж для екрана: завищені ліди — це занижена
   ціна ліда, тобто правило не вимикає те, що давно мало вимкнути.

   Константа, а не налаштування, і рівно така сама в дашборді
   (CD_LEAD_DEFAULT у розборі кабінета). Розійтись їм не можна: ціна
   ліда на екрані й ціна ліда, за якою діє правило, мусять бути одним
   числом. */
const LEAD_ACTIONS_DEFAULT = ['lead', 'onsite_conversion.lead_grouped',
                              'offsite_conversion.fb_pixel_lead'];

/* ЧОМУ ТУТ ЗНОВУ ТРИ ІМЕНІ, А НЕ ОДНЕ.

   Було звужено до одного пікселя — зі страху перед потрійним
   рахунком. Страх був марний: leadCount нижче зводить усі три імені
   до базової події й бере ОДНЕ значення. А от шкода була справжня —
   у кого Facebook віддає лід під іншим іменем, ліди ставали нулем.

   Для правил нуль лідів гірший, ніж для екрана: ціна ліда стає
   нескінченною, і правило вимикає те, що працює. */

function ruleNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
}

/* Читаємо правила з team_settings. Окремої таблиці навмисно немає:
   правил одиниці, вони цілком налаштування, і зайвий SQL-крок при
   встановленні коштував би дорожче за користь.

   ЧИТАЄМО РАЗОМ З АВТОРОМ, і це не дрібниця.

   Функція ходить ключем сервісної ролі, тобто бачить налаштування ВСІХ
   баєрів. Поки автора не брали, правила складались у одну купу й
   застосовувались до кабінетів кожного, кого обходив прогін: новий
   баєр заводив собі «CPL > 3, можна вимикати» — і за пів години воно
   гасило чужі оголошення. Власник кабінета бачив це як «щось саме
   повимикалось», і шукати причину в чужих налаштуваннях йому б і на
   думку не спало.

   Коли питає людина з дашборда, звужуємо ще й запитом: інакше
   «Check now» рахував би в «rules: N» чужі правила, яких ця людина не
   бачить і змінити не може. */
async function loadRules(base: string, hdr: Json, owner: string):
    Promise<{ rules: Rule[]; leads: string[]; teams: string[]; orphan: number }> {
  let rows: Json[] = [];
  const q = 'team_settings?select=team_name,value,created_by&key=eq.fb_rules'
    + (owner ? '&created_by=eq.' + encodeURIComponent(owner) : '');
  try { rows = await pgGet(base, hdr, q); }
  catch (_e) { /* немає налаштувань — немає правил */ }
  let orphan = 0;

  const rules: Rule[] = [];
  // Список подій більше не налаштовується — див. LEAD_ACTIONS_DEFAULT.
  const leads = LEAD_ACTIONS_DEFAULT;
  const teams: string[] = [];

  rows.forEach(r => {
    let v: Json = {};
    try { v = typeof r.value === 'string' ? JSON.parse(String(r.value)) : (r.value || {}); }
    catch (_e) { return; }
    /* Рядок без автора нікому не належить, а отже нічиїх кабінетів і не
       чіпає. Вимикати рекламу «від імені нікого» — рівно та вада, яку
       цей фільтр і закриває, тож такі правила пропускаємо й кажемо про
       це вголос: мовчки зниклі правила читались би як поламана
       функція. Лікується кроком 3 SECURITY_BUYERS.sql. */
    const ruleOwner = String(r.created_by || '');
    if (!ruleOwner) {
      orphan += (Array.isArray(v.rules) ? v.rules : []).length;
      return;
    }
    teams.push(String(r.team_name || ''));
    (Array.isArray(v.rules) ? v.rules : []).forEach((x: Json, i: number) => {
      const when: Cond[] = (Array.isArray(x.when) ? x.when : [])
        .filter((c: Json) => METRICS[String(c?.m)] && ['>', '>=', '<', '<=', '='].includes(String(c?.op)))
        .map((c: Json) => ({ m: String(c.m), op: String(c.op), v: Number(c.v) }))
        .filter((c: Cond) => Number.isFinite(c.v));
      if (!when.length) return;                       // нічого перевіряти
      rules.push({
        id: String(x.id || (r.team_name + '-' + i)),
        name: String(x.name || 'rule ' + (i + 1)),
        owner: ruleOwner,
        on: x.on !== false,
        // Відсутнє dry читаємо як true: правило, у якому не сказано
        // прямо «можна діяти», діяти не має.
        dry: x.dry !== false,
        level: ['ad', 'adset', 'campaign'].includes(String(x.level)) ? x.level : 'ad',
        match: String(x.match) === 'any' ? 'any' : 'all',
        minSpend: ruleNum(x.minSpend, 0.01, 100000, 10),
        when,
        cabs: (Array.isArray(x.cabs) ? x.cabs : []).map((c: unknown) => String(c).replace(/^act_/, '')),
        nameHas: String(x.nameHas || '').trim().toLowerCase()
      });
    });
  });
  return { rules: rules.filter(r => r.on), leads, teams, orphan };
}

/* ЧИЇ ПРАВИЛА МОЖНА ЗАСТОСУВАТИ ДО ЦИХ КАБІНЕТІВ. Окремою функцією, а
   не рядком усередині циклу, саме тому, що це та обіцянка, яку треба
   мати чим перевірити: правило вимикає рекламу, і «чуже до чужого не
   приклеїться» має бути твердженням із тестом, а не припущенням. */
function rulesFor(list: Rule[], tokenOwner: string): Rule[] {
  if (!tokenOwner) return [];
  return list.filter(r => r.owner === tokenOwner);
}

/* ЦІНА ЗА ОДНУ ПОДІЮ — і що стоїть у знаменнику. */
const PER_ONE: Record<string, (a: Agg) => number> = {
  cpl: a => a.leads, cpr: a => a.regs,
  cpp: a => a.purchases, cpc_link: a => a.linkClicks
};

/* НЕСКІНЧЕННІСТЬ — ЦЕ «ЩЕ НЕ ЗНАЄМО», А НЕ «БІЛЬШЕ ЗА БУДЬ-ЩО».

   Витрачено $2.58, лідів нуль. Ціна ліда — нескінченність, і правило
   «лід дорожчий за $3» бачило тут збіг. Але це неправда, і неправда
   арифметична: якби лід прийшов прямо зараз, перший і єдиний, він
   коштував би рівно $2.58 — тобто ДЕШЕВШЕ за поріг. Щоб ціна ліда
   справді перевищила $3, треба спершу витратити більше за $3.

   Тому для ціни за одну подію при нулі подій відповідь визначена лише
   тоді, коли спенд уже перевищив поріг. Доти це не «ні» і не «так», а
   null — «не знаю»: у правилі з AND воно ламає весь збіг, у правилі з
   OR просто не голосує, і жодне з двох не бреше.

   Межа саме spend, бо найдешевша можлива перша подія коштує весь
   витрачений спенд: дешевшою вона бути не може, дорожчою — скільки
   завгодно.

   CPM сюди не входить: там у знаменнику тисяча показів, і та сама
   прикидка дала б spend × 1000 — число, яке нічого не обмежує. Для
   порожніх показів межу ставить поріг спенду правила, а не це. */
function condOk(c: Cond, a: Agg): boolean | null {
  const val = METRICS[c.m](a);
  if (val == null) return null;              // нічого не знаємо — не вирішуємо
  const count = PER_ONE[c.m];
  if (val === Infinity && count && count(a) === 0 && (c.op === '>' || c.op === '>=')) {
    return c.op === '>' ? (a.spend > c.v ? true : null)
                        : (a.spend >= c.v ? true : null);
  }
  switch (c.op) {
    case '>':  return val > c.v;
    case '>=': return val >= c.v;
    case '<':  return val < c.v;
    case '<=': return val <= c.v;
    case '=':  return val === c.v;
  }
  return null;
}

/* Чи спрацювало правило на цій сутності.
   all — усі умови разом (те, чого й просили: «клік дорогий, АЛЕ лід
   нормальний» нічого не вимикає). any — досить однієї.
   Невизначена умова (метрики немає) в «all» ламає все правило: вимикати
   на підставі незнання не будемо. В «any» вона просто не голосує. */
function ruleHits(r: Rule, a: Agg): boolean {
  if (a.spend < r.minSpend) return false;
  const res = r.when.map(c => condOk(c, a));
  if (r.match === 'all') return res.every(x => x === true);
  return res.some(x => x === true);
}

/* ═══════════ ЩО ЗАРАЗ КРУТИТЬСЯ ═══════════ */

type Ent = { id: string; name: string; level: string; account: string;
             adset: string; adsetName: string;
             campaign: string; campaignName: string; agg: Agg };

function aggZero(): Agg {
  return { spend: 0, imps: 0, clicks: 0, linkClicks: 0, leads: 0, regs: 0, purchases: 0 };
}

function addAgg(to: Agg, from: Agg): void {
  to.spend += from.spend; to.imps += from.imps; to.clicks += from.clicks;
  to.linkClicks += from.linkClicks; to.leads += from.leads;
  to.regs += from.regs; to.purchases += from.purchases;
}

/* Рядок знімка → числа, якими міряють правила.

   Ліди складаємо тут, а не при записі: що саме вважати лідом — це
   налаштування, і людина міняє його галочкою. Якби ми записували вже
   порахуване, кожна така галочка вимагала б нового походу в Facebook. */
/* ОДНУ Й ТУ САМУ ПОДІЮ FACEBOOK ВІДДАЄ КІЛЬКОМА ІМЕНАМИ ОДРАЗУ.

   Три ліди приїжджають так:
     lead                              3
     onsite_conversion.lead_grouped    3
     offsite_conversion.fb_pixel_lead  3
   — це не дев'ять лідів, а ті самі три, порахованих трьома способами.
   Поки ми просто складали все, що відмічене галочкою, правила бачили
   втричі більше лідів, а отже ВТРИЧІ ДЕШЕВШУ ціну ліда — і не вимикали
   те, що давно мало бути вимкнене. Це вада не показу, а рішень.

   Складати все одно треба: 'lead' і 'mobile_app_install' — різні
   події. Тому зводимо тип до базової події, беремо по одному значенню
   на подію й лише тоді складаємо різні події. Якщо в списку є сама
   базова назва ('lead'), беремо її — у Facebook це загальне число.
   Якщо відмічені лише окремі джерела, складаємо їх.

   ТЕ САМЕ ПРАВИЛО ЖИВЕ В ДАШБОРДІ (cdLeadCount у розборі кабінета).
   Спільного модуля між Deno-функцією та сторінкою немає, тож код
   продубльований — але розійтись їм не можна: ціна ліда на екрані й
   ціна ліда в правилі мусять бути одним числом. */
function leadBase(t: string): string {
  return String(t || '')
    .replace(/^offsite_conversion\.fb_pixel_/, '')
    .replace(/^onsite_conversion\./, '')
    .replace(/^offsite_conversion\./, '')
    .replace(/_grouped$/, '');
}

function leadCount(acts: Json[], want: string[]): number {
  const by = new Map<string, { t: string; v: number }[]>();
  acts.forEach(a => {
    const t = String(a.action_type || '');
    if (!want.includes(t)) return;
    const b = leadBase(t);
    if (!by.has(b)) by.set(b, []);
    by.get(b)!.push({ t, v: Number(a.value) || 0 });
  });
  let n = 0;
  by.forEach((list, b) => {
    const total = list.find(x => x.t === b);
    n += total ? total.v : list.reduce((a, x) => a + x.v, 0);
  });
  return n;
}

/* РЕЄСТРАЦІЯ Й ПОКУПКА — та сама біда з кількома іменами, але
   розвʼязана інакше, ніж у лідів, і навмисно.

   У лідів список подій колись налаштовувався, тож там треба скласти
   кілька РІЗНИХ подій і лише всередині кожної взяти одне значення.
   Тут подія одна, і питання лише в тому, яким із своїх імен Facebook
   її цього разу назвав: complete_registration,
   offsite_conversion.fb_pixel_complete_registration,
   onsite_conversion.complete_registration — це та сама реєстрація.
   Склавши їх, ми показали б подвійне й потрійне число.

   Тому беремо НАЙТОЧНІШИЙ збіг і тільки його. Рівно так само рахує
   дашборд (cdPick у розборі кабінета), і розійтись їм не можна:
   кількість реєстрацій на екрані й та, за якою діє правило, мусять
   бути одним числом. */
function pickEvent(acts: Json[], suf: string): number {
  let best = 0, rank = 99;
  acts.forEach(a => {
    const t = String(a.action_type || '');
    const r = t === suf ? 0
      : t === 'offsite_conversion.fb_pixel_' + suf ? 1
      : t === 'onsite_conversion.' + suf ? 2
      : (t.endsWith('.' + suf) || t.endsWith('_' + suf)) ? 3 : 99;
    if (r < rank) { rank = r; best = Number(a.value) || 0; }
  });
  return rank === 99 ? 0 : best;
}

const REG_EVENT = 'complete_registration';
const BUY_EVENT = 'purchase';

function aggOf(row: Json, leadActions: string[]): Agg {
  const acts: Json[] = Array.isArray(row.actions) ? row.actions : [];
  const leads = leadCount(acts, leadActions);
  return {
    spend: Number(row.spend) || 0,
    imps: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    linkClicks: Number(row.link_clicks) || 0,
    leads,
    /* Немає події — це нуль, а не «невідомо»: саме «витратив і жодної
       реєстрації» правило й мусить ловити. Ціна ж при нулі стає
       нескінченною, як і в лідів, — і теж ловиться. */
    regs: pickEvent(acts, REG_EVENT),
    purchases: pickEvent(acts, BUY_EVENT)
  };
}

/* Знімок кабінета — з бази, не з Facebook. Порожньо означає «кабінет
   нічого не крутить»: fb-sync прибирає з знімка все, що вимкнули.

   ТІЛЬКИ ACTIVE. У знімку лежить і реджект, і те, що чекає перевірки, —
   вони потрібні екрану кабінета. Але правилу там робити нічого:
   вимикати те, що й так не крутиться, — зайвий похід у Facebook і зайве
   повідомлення в Telegram про «вимкнули» те, що вимкнув сам Facebook.

   Фільтр саме в запиті, а не після нього: з ліміту в тисячу рядків
   неактивні інакше витіснили б справжні. */
const SNAP_ACTIVE = '&or=(effective_status.eq.ACTIVE,effective_status.is.null)';
const SNAP_SELECT = '?select=ad_id,name,adset_id,adset_name,campaign_id,campaign_name,'
                  + 'spend,impressions,clicks,link_clicks,actions,seen_at';

async function snapOf(base: string, hdr: Json, account: string, leadActions: string[]):
    Promise<{ ents: Ent[]; age: number }> {
  const where = '&account_id=eq.' + encodeURIComponent(account) + '&limit=' + ADS_LIMIT;
  /* Колонки ще немає — значить SQL-блок не виконали, а функцію вже
     задеплоїли. Тоді в знімку й не може бути нічого, крім активного:
     його писала стара fb-sync. Тож питаємо ще раз без фільтра, а не
     лишаємо правила мовчки непрацюючими. */
  let rows: Json[];
  try {
    rows = await pgGet(base, hdr, 'fb_ad_today' + SNAP_SELECT + where + SNAP_ACTIVE);
  } catch (e) {
    if (!/effective_status/i.test((e as Error).message)) throw e;
    rows = await pgGet(base, hdr, 'fb_ad_today' + SNAP_SELECT + where);
  }
  let newest = 0;
  const ents = rows.map(r => {
    const at = Date.parse(String(r.seen_at || ''));
    if (Number.isFinite(at) && at > newest) newest = at;
    return { id: String(r.ad_id), name: String(r.name || ''), level: 'ad', account,
             adset: String(r.adset_id || ''), adsetName: String(r.adset_name || ''),
             campaign: String(r.campaign_id || ''), campaignName: String(r.campaign_name || ''),
             agg: aggOf(r, leadActions) };
  });
  return { ents, age: newest ? Date.now() - newest : Infinity };
}

/* Сутності того рівня, на якому працює правило.

   НАЗВУ БЕРЕМО СПРАВЖНЮ. Раніше тут стояла назва ПЕРШОГО оголошення
   групи, з поясненням, що окремий запит за назвами коштував би ще один
   похід у Graph. Пояснення застаріло: adset_name і campaign_name лежать
   у тому самому знімку, їх лише не було в select. Тобто правило на
   рівні кампанії писало в Telegram «campaign «Mostbet_KG_1»», де
   Mostbet_KG_1 — оголошення, а не кампанія. Знайти за таким підписом
   можна було хіба навмання. */
function atLevel(ads: Ent[], level: string): Ent[] {
  if (level === 'ad') return ads;
  const key = (e: Ent) => level === 'adset' ? e.adset : e.campaign;
  // Порожня назва буває в рядках зі старого знімка — тоді хай краще
  // буде id, ніж чуже імʼя.
  const nameOf = (e: Ent, k: string) =>
    (level === 'adset' ? e.adsetName : e.campaignName) || k;
  const by = new Map<string, Ent>();
  ads.forEach(a => {
    const k = key(a);
    if (!k) return;
    let e = by.get(k);
    if (!e) {
      e = { id: k, name: nameOf(a, k), level, account: a.account,
            adset: a.adset, adsetName: a.adsetName,
            campaign: a.campaign, campaignName: a.campaignName, agg: aggZero() };
      by.set(k, e);
    }
    addAgg(e.agg, a.agg);
  });
  return [...by.values()];
}

/* ═══════════ ДІЯ ═══════════ */

/* owner і team тут не для звіту, а тому що парк не спільний: кабінети
   належать конкретним баєрам, сповіщення ходять їм же, і рядок журналу
   мусить лягти під тим самим uid — інакше його власник його й не
   побачить. Брати їх «із першого токена» означало б написати одному про
   чужі вимкнення. */
type Hit = { rule: string; ruleName: string; level: string; id: string; name: string;
             account: string; campaignName: string; owner: string; team: string;
             /* Виміряне проти порога, словами. Рахуємо тут, а не в
                повідомленні: там уже немає ні правила, ні чисел. */
             why: string;
             agg: Agg; dry: boolean; ok: boolean; error: string; acted: boolean;
             /* Правило не діяло, бо його про це не просили (Check now),
                а не тому, що йому заборонено. Різні речі, і підпис у
                Telegram мусить їх розрізняти. */
             preview: boolean };

/* Пакетом, бо вимкнень за прогін може бути багато, а окремий запит на
   кожне — це і ліміти, і дедлайн. Пакет Graph тримає до 50. */
async function pauseAll(token: string, hits: Hit[]): Promise<void> {
  const real = hits.filter(h => !h.dry && !h.acted);
  real.forEach(h => { h.acted = true; });
  for (let i = 0; i < real.length; i += BATCH_MAX) {
    const slice = real.slice(i, i + BATCH_MAX);
    const batch = slice.map(h => ({
      method: 'POST', relative_url: h.id, body: 'status=PAUSED'
    }));
    let parts: Json[] = [];
    try {
      const res = await fetch(GRAPH + '/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          access_token: token, include_headers: 'false', batch: JSON.stringify(batch)
        }).toString()
      });
      const j = await res.json().catch(() => null);
      if (j && !Array.isArray(j) && j.error) throw new Error(String(j.error.message || 'batch failed'));
      parts = Array.isArray(j) ? j : [];
    } catch (e) {
      slice.forEach(h => { h.ok = false; h.error = (e as Error).message; });
      continue;
    }
    slice.forEach((h, k) => {
      const p = parts[k];
      if (!p) { h.ok = false; h.error = 'no answer from Facebook'; return; }
      const code = Number(p.code || 0);
      if (code >= 200 && code < 300) { h.ok = true; return; }
      let why = 'HTTP ' + code;
      try { why = JSON.parse(p.body || '{}')?.error?.message || why; } catch (_e) { /* хай буде код */ }
      h.ok = false; h.error = why;
    });
  }
}

/* Журнал. Таблиці може ще не бути — це не привід нічого не робити:
   причина їде у відповідь, і сторінка її показує. */
async function logHits(base: string, hdr: Json, hits: Hit[]): Promise<string> {
  if (!hits.length) return '';
  const rows = hits.map(h => ({
    created_by: h.owner, team_name: h.team || null, rule_id: h.rule, rule_name: h.ruleName,
    level: h.level, entity_id: h.id, entity_name: h.name, account_id: h.account,
    metrics: h.agg, dry: h.dry, ok: h.ok, error: h.error || null
  }));
  try {
    const res = await fetch(base + '/rest/v1/fb_rule_log', {
      method: 'POST', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify(rows)
    });
    if (!res.ok) return await res.text().catch(() => 'HTTP ' + res.status);
    return '';
  } catch (e) { return (e as Error).message; }
}

/* ═══════════ TELEGRAM ═══════════ */

const TG_MAX = 20;
const TG_LIMIT = 3500;

/* ЗАВЖДИ ДВА ЗНАКИ. Без них ціна клацання виглядала як «$2.1», а
   спенд — як «$45»: око читає це не як гроші, а як щось недописане, і
   поруч із «$0.42» у сусідньому рядку числа перестають вишиковуватись
   одне під одним. */
function money(v: number): string {
  return '$' + (Math.round(v * 100) / 100).toLocaleString('en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/* Українська множина, а не «лід(ів)». Дужки в живому тексті читаються
   як недороблений шаблон — а це повідомлення людина читає між справами
   й швидко. */
function plural(n: number, one: string, few: string, many: string): string {
  const t = Math.abs(n) % 100, d = t % 10;
  if (t > 10 && t < 20) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
}

/* ЧИСЛА — ТІЛЬКИ ТІ, ЩО ЩОСЬ КАЖУТЬ.

   Було «$45 · click $0.42 · lead ∞ · 0 lead(s)»: «lead ∞» і «0
   lead(s)» — це двічі одне й те саме, бо нуль лідів і Є причина, чому
   ціна нескінченна. Нескінченність при цьому виглядає як поломка, а не
   як відповідь.

   Тому ціну показуємо лише там, де є з чого її рахувати, а решту —
   лише коли воно не нуль. Реєстрації й депозити теж: правило могло
   ганятись саме за ними, і нуль, якого не видно, нічого не псує, а
   видимий нуль — псує рядок. */
function metricLine(h: Hit): string {
  const a = h.agg;
  const out = [money(a.spend),
               a.leads + ' ' + plural(a.leads, 'лід', 'ліди', 'лідів')];
  if (a.regs) out.push(a.regs + ' реєстр.');
  if (a.purchases) out.push(a.purchases + ' деп.');
  /* CPC і CPL, а не «клац» і «лід»: інакше «1 лід · лід $21.00» каже
     словом «лід» дві різні речі підряд — кількість і ціну. А скорочення
     тут рідніші за переклад: ними ж людина назвала свої правила. */
  const cpc = METRICS.cpc_link(a);
  if (cpc != null && cpc !== Infinity) out.push('CPC ' + money(cpc));
  if (a.leads > 0) {
    const cpl = METRICS.cpl(a);
    if (cpl != null && cpl !== Infinity) out.push('CPL ' + money(cpl));
  }
  return out.join(' · ');
}

/* АДРЕСА ВЛУЧАННЯ. Без неї повідомлення каже «вимкнули KG_1» — а KG_1
   у людини з сорока кабінетами лежить невідомо де. Кабінет і кампанія
   і є тим найкоротшим шляхом від сповіщення до того самого рядка в Ads
   Manager: id кабінета вставляють у пошук, назву кампанії видно очима.

   Назву кампанії не повторюємо там, де сама сутність і є кампанією. */
function whereLine(h: Hit): string {
  const camp = h.level === 'campaign' ? '' : String(h.campaignName || '').trim();
  return 'каб. ' + (h.account || '?') + (camp ? ' · ' + camp : '');
}

/* ЧОМУ НІЧОГО НЕ ВИМКНУЛОСЬ.

   Старий підпис казав «This rule is still in report-only mode» і на
   цьому замовкав. Двох речей він не казав: ЯКЕ саме правило і ДЕ його
   ввімкнути, — тож питання «то чому воно не зупинило?» виникало щоразу
   наново.

   Гірше: той самий підпис зʼявлявся й після «Check now» у панелі.
   Правило при цьому могло бути цілком бойовим — його просто не просили
   діяти. Називати це «report-only mode» було прямою неправдою, і саме
   вона й збивала з пантелику. */
function dryNote(hits: Hit[]): string {
  const dry = hits.filter(h => h.dry);
  if (!dry.length) return '';
  const names = [...new Set(dry.filter(h => !h.preview).map(h => h.ruleName))];
  if (!names.length) {
    return '\n\n\u{1F441} Це була перевірка «Check now», не розклад.'
      + '\n    Нічого не вимкнулось: правил діяти й не просили.';
  }
  const which = names.map(n => '«' + n + '»').join(', ');
  /* Шлях лишаємо АНГЛІЙСЬКОЮ, бо саме так підписано на екрані. Переклад
     тут був би найгіршим із варіантів: людина пішла б шукати «Дозволено
     вимикати» й не знайшла б нічого. */
  return '\n\n\u{1F441} Тільки звіт — нічого не вимкнулось.'
    + '\n    ' + which + ' поки що не ' + (names.length > 1 ? 'мають' : 'має')
    + ' права вимикати.'
    + '\n    Дозволити: Rules → відкрий правило → познач'
    + ' “Allowed to switch things off”.';
}

/* ГРУПУЄМО, А НЕ ПЕРЕЛІЧУЄМО.

   Кожне влучання йшло пʼятьма рядками, і всі пʼять починались
   однаково. Коли правило чіпляє пʼять оголошень однієї кампанії — це
   двадцять пʼять рядків, із яких десять — та сама адреса й та сама
   назва правила, виписані пʼять разів поспіль. У телефоні, між
   справами, однакові блоки просто зливаються, і щоб знайти, ЩО саме
   вимкнулось, доводиться вчитуватись у кожен.

   Тому спільне — правило, кабінет і кампанія — пишемо ОДИН раз
   заголовком групи. Під ним лишається тільки те, що в кожного своє.

   Ключ групи бере кампанію лише там, де сутність не є самою кампанією:
   інакше дві кампанії під одним правилом злились би в одну групу з
   чужим підписом. */
const tgKey = (h: Hit): string => [h.ruleName, h.account,
  h.level === 'campaign' ? '' : String(h.campaignName || '')].join('\u0000');

/* Позначка на початку рядка — єдиний якір, за який чіпляється око.
   Саме тому вона стоїть у НУЛЬОВІЙ колонці, а все інше з відступом:
   довга назва оголошення переноситься, і без якоря не видно, де
   закінчилось одне й почалось наступне. */
const tgMark = (h: Hit): string => h.dry ? '\u{1F441}' : h.ok ? '⛔' : '⚠';

const tgOne = (h: Hit): string => tgMark(h) + ' ' + h.name
  + '\n    ' + metricLine(h)
  /* «Чому» — найцінніший рядок: саме він відповідає на «та в мене там
     інші числа». Стрілка, а не крапка: це не ще один показник, це
     пояснення рішення. */
  + (h.why ? '\n    \u21B3 ' + h.why : '')
  /* Помилка — окремим рядком і зі своїм знаком. Останньою з пʼяти
     однакових вона губилась, хоч це єдиний рядок, який означає, що
     вимкнути НЕ вдалось і гроші далі йдуть. */
  + (h.error ? '\n    ⚠ ' + h.error : '');

/* ЩО САМЕ ВИМКНУЛОСЬ — оголошення, адсет чи ціла кампанія. Без цього
   слова «⛔ Mostbet_KG_new» читається як одне оголошення, хоч це могла
   бути кампанія на сорок. Стоїть у заголовку групи, а не в кожному
   рядку: рівень задає правило, тож у межах однієї групи він один. На
   випадок, якщо колись стане не один, — перелічимо через скісну. */
const TG_LEVEL: Record<string, string> = {
  ad: 'оголошення', adset: 'адсет', campaign: 'кампанія' };

function tgBody(hits: Hit[]): string {
  const order: string[] = [];
  const by = new Map<string, Hit[]>();
  hits.forEach(h => {
    const k = tgKey(h);
    if (!by.has(k)) { by.set(k, []); order.push(k); }
    (by.get(k) as Hit[]).push(h);
  });
  return order.map(k => {
    const list = by.get(k) as Hit[];
    const lv = [...new Set(list.map(h => h.level))]
      .map(l => TG_LEVEL[l] || l).join(' / ');
    return '«' + list[0].ruleName + '» · ' + lv + '\n' + whereLine(list[0]) + '\n'
      + list.map(tgOne).join('\n');
  }).join('\n\n');
}

function tgText(hits: Hit[]): string {
  const real = hits.filter(h => !h.dry && h.ok).length;
  const dry = hits.filter(h => h.dry).length;
  const failed = hits.filter(h => !h.dry && !h.ok).length;
  /* Підсумок окремими шматками через крапку, а не одним реченням із
     комами: «Paused 3, 1 more only reported, 1 could not be paused»
     читається до кінця, перш ніж стає зрозуміло, скільки всього сталось
     поганого. */
  const head = [real ? '⛔ Вимкнено ' + real : '',
                dry ? '\u{1F441} ' + dry + ' лише показано' : '',
                failed ? '⚠ ' + failed + ' не вдалось' : '']
    .filter(Boolean).join(' · ') + '\n\n';

  const note = dryNote(hits);
  /* Підпис рахуємо В стелю, а не поверх неї. Раніше його дописували
     після обрізання — і повідомлення, що тільки-но влізло, разом із
     підписом уже не влазило. Telegram на таке відповідає помилкою, і
     зникає все повідомлення, а не зайвий рядок.

     Відрізаємо тепер ВЛУЧАННЯ, а не готові рядки: рядок із середини
     групи, викинутий сам по собі, лишив би заголовок без того, що під
     ним, або число без пояснення. */
  let keep = hits.slice(0, TG_MAX);
  const build = (list: Hit[]) => head + tgBody(list)
    + (hits.length > list.length ? '\n\n…і ще ' + (hits.length - list.length) : '')
    + note;
  while (keep.length > 1 && build(keep).length > TG_LIMIT) keep = keep.slice(0, -1);
  return build(keep);
}

async function tgPost(token: string, chat: string, text: string): Promise<string> {
  try {
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // Без parse_mode: назви оголошень рясніють дужками й
      // підкресленнями, і розмітка Telegram на них відповідає 400.
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
    });
    if (res.ok) return 'sent';
    let why = 'HTTP ' + res.status;
    try { why = (await res.json()).description || why; } catch (_e) { /* хай буде код */ }
    return 'failed: ' + why;
  } catch (e) { return 'failed: ' + (e as Error).message; }
}

/* Пишемо кожному про його ж кабінети. Розкладу байдуже, хто натиснув —
   у нього власника немає взагалі, тож єдиний правильний адресат той,
   кому належить токен, із якого прийшов кабінет. */
async function tgSend(base: string, hdr: Json, hits: Hit[]): Promise<string> {
  if (!hits.length) return 'nothing to report';
  const token = Deno.env.get('TG_BOT_TOKEN') || '';
  if (!token) return 'not configured';

  const byOwner = new Map<string, Hit[]>();
  hits.forEach(h => {
    if (!h.owner) return;
    const list = byOwner.get(h.owner);
    if (list) list.push(h); else byOwner.set(h.owner, [h]);
  });
  if (!byOwner.size) return 'nobody to notify';

  let links: Json[] = [];
  try { links = await pgGet(base, hdr, 'tg_links?select=user_id,chat_id&chat_id=not.is.null'); }
  catch (_e) { return 'no links table'; }
  const chats = new Map(links.map(l => [String(l.user_id), String(l.chat_id)]));

  let sent = 0, unlinked = 0;
  const fails: string[] = [];
  for (const [who, list] of byOwner) {
    const chat = chats.get(who);
    if (!chat) { unlinked++; continue; }
    const r = await tgPost(token, chat, tgText(list));
    if (r === 'sent') sent++; else fails.push(r);
  }
  return sent + ' sent'
    + (unlinked ? ', ' + unlinked + ' not linked' : '')
    + (fails.length ? ', ' + fails.length + ' failed (' + fails[0] + ')' : '');
}

/* ═══════════ ВХІД ═══════════ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const base = Deno.env.get('SUPABASE_URL') || '';
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!base || !svc) return reply({ error: 'function is not configured' }, 500);
  const hdr: Json = { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json' };

  let cron = false, owner = '';
  const cronKey = req.headers.get('x-cron-key') || '';
  if (cronKey) {
    /* Власний секрет, не спільний із fb-sync. Немає — розкладу тут
       немає взагалі: функція, яка вимикає рекламу, не мусить бути
       досяжною «за замовчуванням». */
    const want = Deno.env.get('RULES_CRON_SECRET') || '';
    if (!want) return reply({ error: 'scheduled run is not configured: set RULES_CRON_SECRET' }, 400);
    if (!sameSecret(cronKey, want)) return reply({ error: 'bad cron key' }, 401);
    cron = true;
  } else {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return reply({ error: 'no authorization header' }, 401);
    owner = await whoAmI(base, anon, auth);
    if (!owner) return reply({ error: 'could not verify who is calling' }, 401);
  }

  // dry:true з дашборда — «покажи, що було б», незалежно від правил.
  let forceDry = false, onlyRule = '';
  try {
    const body = await req.json();
    forceDry = body?.dry === true;
    onlyRule = String(body?.rule_id || '');
  } catch (_e) { /* тіла може не бути */ }

  const { rules, leads, orphan } = await loadRules(base, hdr, owner);
  const maxAge = await snapLimit(base, hdr);
  const use = onlyRule ? rules.filter(r => r.id === onlyRule) : rules;
  if (!use.length) return reply({ fn: FN_VERSION, cron, rules: 0, note: 'no rules switched on' });

  let q = 'fb_tokens?select=id,label,token,created_by,team_name,status&order=id.asc';
  if (owner) q += '&created_by=eq.' + encodeURIComponent(owner);
  let tokens: Json[];
  try { tokens = await pgGet(base, hdr, q); }
  catch (e) { return reply({ error: (e as Error).message }, 500); }
  if (!tokens.length) return reply({ fn: FN_VERSION, cron, rules: use.length, note: 'no tokens' });

  const deadline = Date.now() + DEADLINE_MS;
  const problems: string[] = [];
  const hits: Hit[] = [];
  let scanned = 0, cabinets = 0, stale = 0;

  /* Правило чіпає ТІЛЬКИ кабінети свого автора. Токен — це і є
     власник: кабінети приходять під ним, і вимикати їх однаково можна
     лише ним. Токен без автора не збігається ні з чиїми правилами, і
     це теж треба сказати, а не тихо його обійти. */
  if (orphan) problems.push(orphan + ' rule(s) have no owner and were skipped'
    + ' — fill created_by in team_settings (step 3 of SECURITY_BUYERS.sql)');

  for (const t of tokens) {
    if (Date.now() > deadline) { problems.push('ran out of time'); break; }
    const tokenOwner = String(t.created_by || '');
    if (!tokenOwner) {
      problems.push(t.label + ': the token has no owner, so no rule applies to it');
      continue;
    }
    const ours = rulesFor(use, tokenOwner);
    if (!ours.length) continue;
    // Кабінети цього токена беремо з нашої ж таблиці: список парку там
    // уже є, і питати його в Facebook удруге немає потреби. Зниклі
    // (missing_since) пропускаємо — там нічого не крутиться.
    let accs: Json[] = [];
    try {
      accs = await pgGet(base, hdr, 'fb_accounts?select=account_id,status,team_name'
        + '&token_id=eq.' + Number(t.id) + '&missing_since=is.null');
    } catch (e) { problems.push(t.label + ': ' + (e as Error).message); continue; }

    for (const a of accs) {
      if (Date.now() > deadline) { problems.push('ran out of time'); break; }
      const account = String(a.account_id || '');
      if (!account || String(a.status || '') !== 'active') continue;
      const mine = ours.filter(r => !r.cabs.length || r.cabs.includes(account));
      if (!mine.length) continue;
      cabinets++;

      let ads: Ent[];
      try {
        const snap = await snapOf(base, hdr, account, leads);
        if (snapTooOld(snap.age, maxAge)) {
          /* Не діємо й кажемо чому. Мовчання тут було б найгіршим:
             виглядало б як «правила не працюють», а шукали б причину
             в правилах, а не в синхронізації. */
          stale++;
          problems.push(account + ': the snapshot is '
            + (snap.age === Infinity ? 'missing' : Math.round(snap.age / 60000) + ' min old')
            + ', older than the ' + Math.round(maxAge / 60000) + ' min this sync pace allows'
            + ' — press Sync now on Cabinets, or check the fb-sync schedule');
          continue;
        }
        ads = snap.ents;
      } catch (e) {
        const msg = (e as Error).message;
        problems.push(account + ': ' + (/fb_ad_today|does not exist|42P01/i.test(msg)
          ? 'no snapshot table yet — run FB_RULES.sql' : msg));
        continue;
      }
      scanned += ads.length;

      for (const r of mine) {
        /* Фільтр за назвою дивиться і на БАТЬКІВ. Гео в цих назвах і
           живе: оголошення зветься KG_3166698, а кампанія —
           MPlayC_KG_10708. Поки дивились лише на власну назву,
           «тільки KG» на рівні оголошення не спрацьовувало там, де гео
           стоїть у кампанії, — тобто майже скрізь. */
        const ents = atLevel(ads, r.level).filter(e => !r.nameHas
          || [e.name, e.adsetName, e.campaignName]
               .some(n => String(n || '').toLowerCase().includes(r.nameHas)));
        ents.forEach(e => {
          if (!ruleHits(r, e.agg)) return;
          /* Та сама сутність могла підпасти під два правила — вимикати
             її двічі немає сенсу, лишаємо перше влучання. Перевіряємо і
             батьків: вимкнена кампанія глушить усе під собою, тож окремо
             гасити її оголошення — марні запити й зайві рядки в журналі. */
          if (hits.some(h => h.id === e.id || h.id === e.adset || h.id === e.campaign)) return;
          hits.push({ rule: r.id, ruleName: r.name, level: r.level, id: e.id,
                      name: e.name, account, campaignName: e.campaignName,
                      owner: String(t.created_by || ''), team: String(a.team_name || t.team_name || ''),
                      agg: e.agg, dry: forceDry || r.dry, ok: false, error: '', acted: false,
                      preview: forceDry, why: whyHit(r, e.agg) });
        });
      }
    }

    // Вимикаємо токеном, який це бачить: чужим не вийде.
    await pauseAll(String(t.token), hits.filter(h =>
      accs.some(a => String(a.account_id) === h.account)));
  }

  const logged = await logHits(base, hdr, hits);
  /* ПРЕВʼЮ В TELEGRAM НЕ ЙДЕ.

     «Check now» — це погляд на екран: людина натиснула й дивиться
     результат просто тут. Повідомлення дублювало побачене, а головне —
     лягало в стрічку між плановими прогонами, і розклад починав
     виглядати як випадковий: то раз на пів години, то двічі за
     десять хвилин. Розклад при цьому ніколи не мінявся. */
  const telegram = forceDry ? 'preview — not sent' : await tgSend(base, hdr, hits);

  return reply({
    fn: FN_VERSION, cron, rules: use.length, cabinets, ads: scanned,
    // Кабінети, які пропустили через застарілий знімок — щоб «нічого не
    // вимкнулось» не читалось як «правила не спрацювали».
    stale,
    paused: hits.filter(h => !h.dry && h.ok).length,
    would_pause: hits.filter(h => h.dry).length,
    failed: hits.filter(h => !h.dry && !h.ok).length,
    hits: hits.slice(0, 50).map(h => ({ rule: h.ruleName, level: h.level, id: h.id,
      name: h.name, account: h.account, dry: h.dry, ok: h.ok,
      error: h.error || undefined, spend: h.agg.spend, leads: h.agg.leads,
      link_clicks: h.agg.linkClicks })),
    log: logged ? (/fb_rule_log|does not exist|42P01/i.test(logged)
      ? 'no table yet — run FB_RULES.sql' : logged) : 'ok',
    telegram,
    problems: problems.slice(0, 10)
  });
});
