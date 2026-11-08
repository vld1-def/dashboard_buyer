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

   ЗВІДКИ ЦІ ЦИФРИ БЕРУТЬСЯ. Тепер — із самого Facebook, по одному
   запиту на кабінет, і тільки по тих кабінетах, де є ввімкнене правило.

   Довго ця функція читала знімок fb_ad_today, який пише fb-sync. Поки
   синк ходив за розкладом, це було чесно. Коли кабінети стали
   оновлюватись лише руками, вийшло ось що: правило судило по числах
   від останнього Sync now, вимикало оголошення — і НІДЕ ЦЬОГО НЕ
   ЗАПИСУВАЛО. Через чверть години воно читало той самий рядок, бачило
   ті самі цифри до цента, вимикало вже вимкнене і писало в Telegram
   ще раз. І ще. Поки знімок не старішав на дев'яносто хвилин.

   Повторні повідомлення були лише симптомом. Справжня вада глибша:
   рішення вимкнути рекламу ухвалювалось по даних, вік яких ніхто не
   обирав. «Свіжість знімка» ми перевіряли, але перевірка на 90 хвилин
   означає, що діяти по годинних числах — нормально. Для рішення, яке
   не можна відкотити автоматично, це не нормально.

   Тому правило бере числа САМЕ, у момент рішення. Це НЕ повернення
   розкладу fb-sync: синк — великий обхід (Сторінки, креативи, бани,
   стани, картинки), і він лишається ручним. Тут — один вузький запит
   за активними оголошеннями й витратами за сьогодні, рівно по тих
   кабінетах, які правило й так збиралось судити.

   ЗНІМОК ЛИШАЄТЬСЯ ЗАПАСНИМ АЕРОДРОМОМ. Facebook відмовив — краще
   судити по знімку з його перевіркою на вік, ніж осліпнути. Але тоді
   це видно: і в журналі прогону, і в підписі повідомлення.

   А ще після кожного вдалого вимкнення правило позначає рядок у
   знімку як PAUSED. Живі дані й так не покажуть вимкнене вдруге, але
   на запасному аеродромі ця позначка — єдине, що відрізняє «вимкнули
   зараз» від «вимкнули п'ятнадцять хвилин тому».

   Розгортання:
     supabase functions deploy fb-rules
     (секрети: RULES_CRON_SECRET, TG_BOT_TOKEN — див. FB_RULES.sql)
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const FN_VERSION = 'rules-19';
const GRAPH = 'https://graph.facebook.com/v21.0';
const DEADLINE_MS = 110_000;
const ADS_LIMIT = 500;      // стеля списку оголошень на кабінет
/* Наскільки старим може бути знімок, щоб на нього ще можна було
   спиратись.

   Це межа ЗАПАСНОГО аеродрому, і тільки його: у звичайному прогоні
   числа беруться просто з Facebook, і вік їм ніхто не рахує, бо він
   нульовий. Сюди потрапляють лише ті кабінети, по яких Facebook
   відмовив.

   Знімок пише fb-sync, а він ходить ЛИШЕ РУКАМИ — отже «свіжий
   знімок» тут означає «нещодавно натискали Sync now», і нічого
   більше. Старіше за дев'яносто хвилин — не діємо зовсім: вимкнути
   оголошення за годинними числами означає гасити те, що людина вже
   виправила. */
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
  nameHas: string;     // спадок: порожньо — будь-яка назва
  geo: string[];       // порожньо — будь-яке гео
};

/* ГЕО — З НАЗВИ, І ЦЕ ЄДИНЕ МІСЦЕ, ДЕ ВОНО Є.

   Facebook не віддає країну в рядку оголошення: гео живе в таргетингу
   адсета, окремим запитом, і тягнути його на кожне оголошення коштувало
   б більше, ніж уся решта прогону. Зате воно вже є в назвах — саме так
   їх і іменують: Mostbet_KG, KG_15323, 334_KG_DV.

   Шукаємо НЕ «яке тут гео», а «чи є тут КГ» — тобто перевіряємо лише ті
   коди, які спитали в правилі. Різниця не косметична: вгадувати гео з
   назви означає ловити BM (Бермуди) у «_BM_», AD (Андорра) у «_AD_» і
   вимикати людині робочі оголошення. Коли ми шукаємо конкретний код,
   такої помилки просто немає звідки взятись.

   Код мусить стояти ОКРЕМИМ шматком: «KG» у Mostbet_KG — так, «KG»
   всередині MostbetKG — ні. Інакше будь-яке слово з цими літерами
   підходило б, а передбачуваність тут важливіша за поблажливість.

   Дивимось і на батьків: оголошення зветься KG_15323, а кампанія —
   MPlayC_KG_10708. Поки дивились лише на власну назву, «тільки KG» на
   рівні оголошення не спрацьовувало там, де гео стоїть у кампанії —
   тобто майже скрізь. */
const geoRe = (code: string) =>
  new RegExp('(?:^|[^A-Za-z0-9])' + code + '(?:[^A-Za-z0-9]|$)', 'i');

/* НЕ «так/ні», а «де саме». Питання «чому правило на BR вимкнуло TJ»
   інакше не має відповіді: у листі видно оголошення й кампанію, а код
   міг стояти в назві АДСЕТА — його там не було. Повертаємо, у чиїй
   назві знайшлось, і підписуємо це в листі. */
function geoWhy(want: string[], parts: { what: string; name: string }[]):
    { code: string; what: string; name: string } | null {
  for (const code of want) {
    const re = geoRe(code);
    const hit = parts.find(p => p.name && re.test(p.name));
    if (hit) return { code, what: hit.what, name: hit.name };
  }
  return null;
}

function geoHit(want: string[], names: unknown[]): boolean {
  const hay = names.map(n => String(n || '')).join(' \u00b7 ');
  return want.some(code => geoRe(code).test(hay));
}

/* Метрики. Кожна — з того, що прийшло в одній відповіді зі спендом:
   нічого не домішуємо з інших джерел, щоб у правилі не зустрілись
   числа різного віку.

   Ділення на нуль тут не помилка, а відповідь: $15 витрачено, кліків
   нуль — ціна кліка нескінченна, і правило «клік дорожче 1.5» мусить
   спрацювати. А от коли витрат немає взагалі, метрики немає: це не
   нуль, це «нічого не відбувалось», і такі сутності правила не
   торкаються (плюс поріг спенду однаково їх відсіює). */
type Agg = { spend: number; imps: number; clicks: number; linkClicks: number;
             leads: number; regs: number; purchases: number; installs: number };

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
  /* ІНСТАЛИ ОКРЕМОЮ МЕТРИКОЮ, А НЕ СЕРЕД ЛІДІВ.

     Дашборд рахував їх давно (CD_INST у розборі кабінета), правила —
     ні. Тобто на екрані інстали й ціна інстала були, а написати по
     них правило було ніяк: лишалось міряти апку ціною ліда, якої в
     неї не буває.

     Складати їх із лідами не можна: 'lead' і 'mobile_app_install' —
     різні події, і сума дала б число, яке не сходиться ні з екраном,
     ні з Ads Manager. */
  installs:    a => a.installs,
  cpi:         a => a.installs > 0 ? a.spend / a.installs : (a.spend > 0 ? Infinity : null),
  cpm:         a => a.imps > 0 ? a.spend / a.imps * 1000 : (a.spend > 0 ? Infinity : null),
  ctr_link:    a => a.imps > 0 ? a.linkClicks / a.imps * 100 : null
};

/* Підписи для повідомлення. Ті самі метрики в дашборді підписані
   довше («Cost per link click»), бо там є місце. Тут рядок читають у
   телефоні, тож коротко — але так, щоб не сплутати CTR із CTR: у нас
   це ЗАВЖДИ link CTR, тобто переходи за посиланням ÷ покази, а не
   «CTR (all)» з Ads Manager, куди входять і лайки, і кліки по сторінці.
   Саме ця плутанина й змушує питати, чому правило спрацювало. */
/* КОРОТКО, бо рядок тепер один на оголошення: «⚡CPC $2.17 > $1.10».
   Довгі «cost per link click» переносились і розривали рядок навпіл.
   CTR тут — однаково link CTR (див. вище), просто без слова link. */
const METRIC_LABEL: Record<string, string> = {
  spend: 'spend', imps: 'imps', leads: 'leads',
  link_clicks: 'clicks', cpc_link: 'CPC',
  cpl: 'CPL', cpm: 'CPM', ctr_link: 'CTR',
  regs: 'regs', cpr: 'CPR',
  purchases: 'deps', cpp: 'CPP',
  installs: 'installs', cpi: 'CPI'
};
const METRIC_MONEY = ['spend', 'cpc_link', 'cpl', 'cpm', 'cpr', 'cpp', 'cpi'];

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
/* ЛИШЕ ТЕ, ЩО СПРАЦЮВАЛО. У правилі з OR умова, яка не спрацювала,
   нічого не пояснює — вона лише подовжує рядок і змушує шукати, котра
   з двох вирішила. В AND вирішили всі, тож там показуємо всі. */
function whyHit(r: Rule, a: Agg): string {
  const conds = r.match === 'any' ? r.when.filter(c => condOk(c, a) === true) : r.when;
  return conds.map(c => {
    const f = METRICS[c.m];
    return (METRIC_LABEL[c.m] || c.m) + ' ' + fmtMetric(c.m, f ? f(a) : null)
      + ' ' + c.op + ' ' + fmtMetric(c.m, c.v);
  }).join(' · ');
}

/* ОДИН ЗНАЧОК 📲 НА ЛІДИ Й ІНСТАЛИ — тож показуємо одне число з двох.
   Апка — інстали, веб — ліди. Коли є обидва, береться те, за чим
   ганялось правило: правило на CPI про інстали, решта — про ліди. */
const CONV_INSTALL = ['cpi', 'installs'];
function convPick(r: Rule, a: Agg): 'leads' | 'installs' {
  if (a.installs > 0 && a.leads === 0) return 'installs';
  if (a.leads > 0 && a.installs === 0) return 'leads';
  const inst = r.when.filter(c => CONV_INSTALL.includes(c.m));
  // Обидва є — вирішує умова, що спрацювала; обидва нулі — сама умова.
  if (a.leads > 0) return inst.some(c => condOk(c, a) === true) ? 'installs' : 'leads';
  return inst.length ? 'installs' : 'leads';
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
        nameHas: String(x.nameHas || '').trim().toLowerCase(),
        geo: (Array.isArray(x.geo) ? x.geo : [])
          .map((g: unknown) => String(g).trim().toUpperCase())
          .filter((g: string) => /^[A-Z]{2}$/.test(g))
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

/* ═══ ЗВІТНЕ ПРАВИЛО НЕ МАЄ ПРАВА ЗАТУЛЯТИ БОЙОВЕ ═══

   «мої оголошення перекручували бюджет, і правила ходять кожні 15хв,
   вони мали давно вже зупинити оголошення».

   Одна сутність — одне влучання за прогін: друге правило на тому
   самому оголошенні пропускається (див. перевірку hits.some нижче).
   Але хто «перший», вирішував порядок у списку, а не те, чи має
   правило право діяти. Звітне «CTR<30%» стояло першим — і щочверть
   години ловило оголошення раніше за бойове «Click OR Install TJ».
   Бойове бачило «вже є влучання» і мовчало. На живих числах:
   TJ_0iHVkg мав вимкнутись о 06:12 на $3.74, а вимкнувся о 09:12 на
   $19.53 — щойно звітне правило вимкнули руками.

   Тому бойові йдуть ПЕРШИМИ. Звітне пише рядок лише про те, чого
   жодне бойове не взяло, — і нічого не блокує. Сортування стабільне:
   усередині кожної групи порядок лишається тим, що в списку. */
function ruleOrder(list: Rule[]): Rule[] {
  return list.slice().sort((x, y) => Number(x.dry) - Number(y.dry));
}

/* ЦІНА ЗА ОДНУ ПОДІЮ — і що стоїть у знаменнику. */
const PER_ONE: Record<string, (a: Agg) => number> = {
  cpl: a => a.leads, cpr: a => a.regs,
  cpp: a => a.purchases, cpc_link: a => a.linkClicks,
  cpi: a => a.installs
};

/* ═══ ЦІНА ЛІДА НА АПЦІ, ДЕ ЛІДІВ НЕ БУВАЄ ═══

   «а правила розрізняють lead і інстал? бо мені здається воно шукає
   lead тільки».

   Шукало. І для апкової кампанії це не просто сліпота, а хибне
   вимкнення: Facebook віддає їй mobile_app_install, а 'lead' не
   віддає ніколи. Отже лідів нуль, ціна ліда — нескінченність, і
   правило «лід дорожчий за $4» спрацьовує, щойно спенд перевищить ці
   $4.

   На живих числах це виглядало так: оголошення TJ_AB_676, $24.44,
   дев'ять інсталів по $2.72 — і нуль лідів, бо лідів там і не
   планувалось. Правило вимикало його як дороге.

   Тому: нуль подій ПРИ НАЯВНИХ ІНСТАЛАХ — це не «дорого», це «міряли
   не тим». Відповідь null — «не знаю»: в AND воно ламає весь збіг, в
   OR просто не голосує, і жодне з двох не бреше.

   Лише для подій, яких апкова кампанія не має за побудовою. Ціна
   кліка сюди не входить: кліки є і в апок, і нуль кліків при витратах
   — це справді дорого, а не інша подія. */
const APP_BLIND = ['cpl', 'cpr', 'cpp'];

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
  /* Подій цього виду нуль, а інстали є — міряємо апку не тим. Мовчимо
     замість вироку. */
  if (val === Infinity && count && count(a) === 0
      && a.installs > 0 && APP_BLIND.indexOf(c.m) >= 0) return null;
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
  return { spend: 0, imps: 0, clicks: 0, linkClicks: 0,
           leads: 0, regs: 0, purchases: 0, installs: 0 };
}

/* НОВЕ ПОЛЕ ДОДАЄТЬСЯ В ТРЬОХ МІСЦЯХ, І ДВА З НИХ МОВЧАЗНІ.

   aggOf його рахує, а от aggZero і addAgg — ні, поки про них не
   згадаєш. Наслідок виглядав би так: на оголошенні інстали є, на
   адсеті й кампанії нуль, і ціна інстала там — нескінченність. Тобто
   правило рівня кампанії вимикало б усе підряд, і числа при цьому
   були б «справжні». */
function addAgg(to: Agg, from: Agg): void {
  to.spend += from.spend; to.imps += from.imps; to.clicks += from.clicks;
  to.linkClicks += from.linkClicks; to.leads += from.leads;
  to.regs += from.regs; to.purchases += from.purchases;
  to.installs += from.installs;
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
/* Те саме ім'я, що в дашборді (CD_INST). Розійтись їм не можна: ціна
   інстала на екрані й та, за якою діє правило, мусять бути одним
   числом. */
const INST_EVENT = 'mobile_app_install';

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
    purchases: pickEvent(acts, BUY_EVENT),
    installs: pickEvent(acts, INST_EVENT)
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

/* ═══════════ ЧИСЛА З FACEBOOK, У МОМЕНТ РІШЕННЯ ═══════════

   Той самий запит, яким їх бере fb-sync, тільки вужчий: йому список
   оголошень потрібен ще й заради статусів, Сторінок і бюджетів, нам —
   рівно заради цифр.

   ТІЛЬКИ ACTIVE, і це ключове для повторів: щойно правило вимкнуло
   оголошення, Facebook більше не віддасть його в цьому списку. Тобто
   «не діяти двічі на одному й тому самому» тут не окрема перевірка з
   власними вадами, а наслідок того, звідки беруться дані.

   date_preset(today) рахується в часовому поясі САМОГО КАБІНЕТА — так
   само, як у синку. Свій зсув ми не рахуємо: «сьогодні» для кабінета
   визначає Facebook, і два різні «сьогодні» на одні цифри — найгірше,
   що тут можна зробити.

   actions лишаємо сирими: що саме вважати лідом — налаштування
   правила, і воно міняється без нового походу в Facebook. */
const LIVE_LIMIT = 500;
const LIVE_FIELDS = 'name,adset_id,campaign_id,adset{name},campaign{name},'
                  + 'insights.date_preset(today){spend,impressions,clicks,'
                  + 'inline_link_clicks,actions}';

/* ═══════════ ЧИ ЖИВИЙ ЦЕЙ КАБІНЕТ ═══════════

   ЩО ЗЛАМАЛОСЬ. За ніч кабінети забанились, а правила про це не знали
   й кожні чверть години далі ходили в них по числа. Список активних
   кабінетів вони беруть із НАШОЇ таблиці, а статус у ній пише
   fb-sync — і доки та не дійшла до цього токена (у неї дедлайн 110
   секунд і черга «найдавніше перевірений»), кабінет лишався в нас
   «active».

   Гірше за зайві запити було інше: будь-яка відмова Graph вважалась
   «цього разу не віддав числа», і правило йшло на знімок. Тобто на
   забаненому кабінеті воно судило за цифрами, знятими ДО бану, і
   намагалось вимикати там оголошення. Бан — це не збій зв'язку.

   ЧОМУ ПИТАЄМО, А НЕ ВГАДУЄМО ЗА КОДОМ ПОМИЛКИ. Код у відмові Graph
   не розрізняє «кабінет забанили» й «токен протух»: на другому ми
   позначили б забаненими геть усі кабінети цього токена. Тому на
   відмові робимо один вузький запит і питаємо стан прямо. Він коштує
   рівно стільки, скільки коштує — лише тоді, коли вже щось пішло не
   так, а не в кожному прогоні. */

/* Словник той самий, що в fb-sync (statusWord). Дві копії розійшлись
   би тихо, тому стенд rlban звіряє їх рядок у рядок. */
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

type CabState = { code: number; word: string; reason: string };

/* ═══ GRACE І UNSETTLED — ПІД НАГЛЯДОМ, А НЕ ЗА БОРТОМ ═══

   «grace перевіряти коли вийде з цього статусу».

   Grace — Facebook не зміг списати оплату, але дав час: реклама ДАЛІ
   крутиться й витрачає. Unsettled — не оплачено; реклама зазвичай
   стоїть, але кабінет оживає, щойно оплата пройде. Доти обидва стани
   читались як «мертвий»: правила пропускали кабінет, а повернути його
   в 'active' міг лише ручний Sync now. Тобто в найризикованіший момент
   кабінет лишався без нагляду — і так і лишався, поки хтось не
   згадає натиснути.

   Тепер правила судять і їх. Мертвими лишаються бан, закриття й
   розгляд — там нічого не крутиться й не закрутиться само. */
const CAB_WATCH = ['active', 'grace', 'unsettled'];
function cabWatched(word: string): boolean {
  return CAB_WATCH.includes(String(word || ''));
}

/* null означає «спитати не вийшло» — а це вже звичайна відмова
   зв'язку, і поводитись із нею треба як раніше. Мовчки вважати
   кабінет мертвим через те, що не змогли спитати, не можна. */
async function cabState(token: string, account: string): Promise<CabState | null> {
  try {
    const url = GRAPH + '/act_' + encodeURIComponent(account)
              + '?fields=account_status,disable_reason';
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error || j.account_status == null) return null;
    const code = Number(j.account_status || 0);
    return { code, word: statusWord(code), reason: String(j.disable_reason || '') };
  } catch (_e) { return null; }
}

/* Пишемо стан САМІ, не чекаючи синхронізації: доти правила щочверть
   години повторювали б той самий запит, а дашборд показував би
   зелений кружечок на кабінеті, якого вже немає.

   Ключ той самий, що в fb-sync: created_by + account_id. */
async function markDead(base: string, hdr: Json, owner: string,
                        account: string, st: CabState): Promise<void> {
  try {
    await fetch(base + '/rest/v1/fb_accounts?created_by=eq.'
      + encodeURIComponent(owner) + '&account_id=eq.' + encodeURIComponent(account), {
      method: 'PATCH',
      headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: st.word, status_code: st.code || null,
        /* Порожнє не затирає відоме: Facebook не завжди віддає
           причину, а та, що ми вже знали, лишається правдою. */
        ...(st.reason ? { disable_reason: st.reason } : {})
      })
    });
  } catch (_e) { /* не записали — прогін від цього не валиться */ }
}

async function liveOf(token: string, account: string, leadActions: string[],
                      note: (s: string) => void): Promise<Ent[]> {
  /* ТОКЕН ЗАГОЛОВКОМ, А НЕ В АДРЕСІ. Graph приймає обидва способи, але
     адреса — це те, що осідає в логах проксі, у повідомленнях про
     помилки й у трасуванні. Токен, який уміє вимикати рекламу, не має
     лежати в рядку, який хтось колись надрукує цілком. */
  const url = GRAPH + '/act_' + encodeURIComponent(account) + '/ads'
    + '?effective_status=' + encodeURIComponent(JSON.stringify(['ACTIVE']))
    + '&limit=' + LIVE_LIMIT
    + '&fields=' + encodeURIComponent(LIVE_FIELDS);
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error)
    throw new Error(String(j?.error?.message || 'HTTP ' + res.status));
  const data: Json[] = Array.isArray(j.data) ? j.data : [];
  /* СТЕЛЯ, ПРО ЯКУ ЧУТНО. Сторінок більше однієї ми не беремо — за
     п'ятьмастами активними оголошеннями в одному кабінеті стоїть або
     дуже великий кабінет, або безлад, і в обох випадках мовчки судити
     перші п'ятсот означає, що решта просто не існує для правил. */
  if (j.paging?.next)
    note(account + ': more than ' + LIVE_LIMIT + ' active ads — judged the first '
       + LIVE_LIMIT + ', the rest were not looked at');
  return data.map(r => {
    const row: Json = ((r.insights as Json)?.data || [])[0] || {};
    /* aggOf читає link_clicks, а Facebook віддає inline_link_clicks.
       Перейменовуємо тут, щоб розбір чисел лишався ОДИН на обидва
       джерела: дві копії цієї арифметики розійшлись би на першій же
       новій метриці, і розійшлись би тихо. */
    return { id: String(r.id || ''), name: String(r.name || ''), level: 'ad', account,
             adset: String(r.adset_id || ''),
             adsetName: String((r.adset as Json)?.name || ''),
             campaign: String(r.campaign_id || ''),
             campaignName: String((r.campaign as Json)?.name || ''),
             agg: aggOf({ ...row, link_clicks: row.inline_link_clicks }, leadActions) };
  });
}

/* ═══ ЦИФРИ КАМПАНІЇ Й АДСЕТА — ВІД САМОГО FACEBOOK ═══

   Доти правило рівня кампанії складало її з АКТИВНИХ оголошень
   (atLevel над liveOf). Оголошення, вимкнене сьогодні раніше, зникало
   з суми разом зі своїм спендом і лідами. Приклад: A — $20 і 4 ліди,
   вимкнене опівдні; B — $10 і 0 лідів, активне. Справжній CPL
   кампанії $30/4 = $7.50, а правило «CPL > $8» бачило лише B — CPL ∞ —
   і вимикало робочу кампанію. Бувало й навпаки: дорога кампанія
   виглядала дешевою.

   Тепер для таких правил — insights на рівні level=campaign|adset за
   сьогодні, по всіх оголошеннях, які крутились. Судимо лише ті
   кампанії/адсети, що зараз ACTIVE: вимкнене вимикати нема чого.
   Один запит на кабінет і рівень — і лише там, де таке правило є. */
async function levelOf(token: string, account: string, level: 'adset' | 'campaign',
                       leadActions: string[], note: (s: string) => void): Promise<Ent[]> {
  const url = GRAPH + '/act_' + encodeURIComponent(account) + '/insights'
    + '?level=' + level
    + '&date_preset=today'
    + '&filtering=' + encodeURIComponent(JSON.stringify([
        { field: level + '.effective_status', operator: 'IN', value: ['ACTIVE'] }]))
    + '&limit=' + LIVE_LIMIT
    + '&fields=' + encodeURIComponent('campaign_id,campaign_name,adset_id,adset_name,'
        + 'spend,impressions,clicks,inline_link_clicks,actions');
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error)
    throw new Error(String(j?.error?.message || 'HTTP ' + res.status));
  const data: Json[] = Array.isArray(j.data) ? j.data : [];
  if (j.paging?.next)
    note(account + ': more than ' + LIVE_LIMIT + ' active ' + level + 's — judged the first '
       + LIVE_LIMIT);
  return data.map(r => {
    const isCamp = level === 'campaign';
    const id = String(isCamp ? r.campaign_id : r.adset_id || '');
    return { id, level, account,
             name: String((isCamp ? r.campaign_name : r.adset_name) || id),
             /* У кампанії адсета немає: порожнє, щоб перевірка «вже
                вимкнули батька» не зачепила чужий адсет. */
             adset: isCamp ? '' : String(r.adset_id || ''),
             adsetName: isCamp ? '' : String(r.adset_name || ''),
             campaign: String(r.campaign_id || ''),
             campaignName: String(r.campaign_name || ''),
             agg: aggOf({ ...r, link_clicks: r.inline_link_clicks }, leadActions) };
  });
}

/* ПОЗНАЧКА ПРО ВИМКНЕНЕ У ЗНІМКУ.

   Живий список вимкненого вже не віддасть, тож для звичайного прогону
   ця позначка нічого не змінює. Вона потрібна рівно тоді, коли
   Facebook відмовив і правило судить по знімку: без неї запасний
   аеродром повторює стару ваду — ті самі цифри, те саме вимкнення, те
   саме повідомлення кожні чверть години.

   Колонки може не бути (SQL-блок не виконали) — тоді позначити нічим,
   і це не привід валити прогін. Але й не привід мовчати: про це
   скаже рядок у problems. */
async function markPaused(base: string, hdr: Json, hits: Hit[]): Promise<string> {
  const done = hits.filter(h => h.ok && !h.dry && h.acted);
  if (!done.length) return '';
  const col = (lv: string) => lv === 'adset' ? 'adset_id'
                            : lv === 'campaign' ? 'campaign_id' : 'ad_id';
  let err = '';
  for (const h of done) {
    try {
      const res = await fetch(base + '/rest/v1/fb_ad_today'
        + '?' + col(h.level) + '=eq.' + encodeURIComponent(h.id)
        + '&account_id=eq.' + encodeURIComponent(h.account), {
        method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
        body: JSON.stringify({ effective_status: 'PAUSED' })
      });
      if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
    } catch (e) {
      const m = String((e as Error).message || '');
      err = /effective_status/i.test(m)
        ? 'the snapshot has no effective_status column — run block 1 of FB_RULES.sql'
        : m;
    }
  }
  return err;
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
             /* Поріг спенду правила — щоб лист міг пояснити, чому
                вимкнуло саме на цій сумі, а не раніше. */
             minSpend: number;
             /* Виміряне проти порога, словами. Рахуємо тут, а не в
                повідомленні: там уже немає ні правила, ні чисел. */
             why: string;
             agg: Agg; dry: boolean; ok: boolean; error: string; acted: boolean;
             /* Правило не діяло, бо його про це не просили (Check now),
                а не тому, що йому заборонено. Різні речі, і підпис у
                Telegram мусить їх розрізняти. */
             preview: boolean;
             /* НА ЧОМУ УХВАЛЕНО. false — числа взяті просто з Facebook;
                true — Facebook відмовив, і судили по знімку. Вимкнення
                по годинних числах і по хвилинних — різні за вагою
                новини, і людина мусить бачити, яка з них перед нею. */
             fromSnap: boolean;
             /* Фільтр гео правила і те, ЧИЯ назва під нього підійшла.
                Порожній список означає «будь-яке гео» — і саме це
                найчастіше й дивує: правило з назвою «BR CLICK» без
                фільтра торкається всього парку. */
             geos: string[]; geoIn: string;
             /* Підписи для листа. Кабінети звуться «1», «3», тож без
                номера браузера (профіля антидетекту) знайти, де саме
                це сталось, можна було лише за довгим ID. */
             cabName: string; browser: string;
             // Яке з двох чисел стоїть під 📲. Див. convPick.
             conv: 'leads' | 'installs' };

/* ═══ НОМЕР БРАУЗЕРА ═══

   Окремого поля в кабінеті немає. Номер профілю лежить у
   accounts_mapping.profile, а ще — у назві токена: Farm_4175_<BM>.
   Мапінг першим (його ведуть руками, він точніший), токен — запасом.
   Таблиці може не бути — тоді просто без 🌐, прогін від цього не
   падає. */
async function browserMap(base: string, hdr: Json): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let rows: Json[] = [];
  try {
    rows = await pgGet(base, hdr,
      'accounts_mapping?select=account_id,profile,created_by&profile=not.is.null');
  } catch (_e) { return out; }
  rows.forEach(r => {
    const acc = String(r.account_id || '').replace(/^act_/, '').trim();
    const p = String(r.profile || '').trim();
    if (!acc || !p) return;
    out.set(String(r.created_by || '') + '|' + acc, p);
    if (!out.has('|' + acc)) out.set('|' + acc, p);
  });
  return out;
}

function browserOf(map: Map<string, string>, owner: string, account: string,
                   tokenLabel: string): string {
  return map.get(owner + '|' + account) || map.get('|' + account)
    || (String(tokenLabel || '').match(/^[A-Za-z]+_(\d+)_\d+$/) || [])[1] || '';
}

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

/* ═══════════ СЛІД ПРО САМ ПРОГІН ═══════════

   У журнал лягали лише ВЛУЧАННЯ. Тому сторінка Rules чесно писала
   «Nothing yet. Either no rule matched, or none of them ran» — тобто
   сама зізнавалась, що не вміє відрізнити «правила ходять, просто
   нічого не підпадає» від «правила не ходять узагалі».

   А це дві протилежні новини: у першому випадку робити нічого не
   треба, у другому — задеплоїти функцію, поставити секрет або
   полагодити розклад. Різницю видно лише зсередини прогону, тож
   прогін лишає по собі рядок навіть тоді, коли не зробив нічого.

   Окремої таблиці під це немає навмисно: рядок про прогін — така сама
   подія, як і влучання, і місце їй у тому самому журналі. Рівень
   'run' відрізняє її від дій, і сторінка показує її окремо. */
async function logRun(base: string, hdr: Json, seen: Map<string, RunSeen>,
                      cron: boolean): Promise<void> {
  if (!seen.size) return;
  const rows = [...seen.entries()].map(([owner, v]) => ({
    created_by: owner, team_name: v.team || null,
    rule_id: null, rule_name: null, level: 'run',
    entity_id: null, entity_name: null, account_id: null,
    metrics: { cabinets: v.cabs, ads: v.ads, stale: v.stale,
               live: v.live, fell_back: v.fell, dead: v.dead,
               paused: v.paused, would: v.would, rules: v.rules, cron },
    dry: true, ok: true, error: null
  }));
  try {
    await fetch(base + '/rest/v1/fb_rule_log', {
      method: 'POST', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify(rows)
    });
  } catch (_e) { /* слід про прогін не привід валити прогін */ }
}

type RunSeen = { team: string; cabs: number; ads: number; stale: number;
                 /* live — кабінети з числами просто з Facebook,
                    fell — ті, де Facebook відмовив і судили по знімку,
                    dead — ті, що виявились забаненими просто в прогоні. */
                 live: number; fell: number; dead: number;
                 paused: number; would: number; rules: number };

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
/* ═══════════ ФОРМАТ ЛИСТА: ОДНЕ ОГОЛОШЕННЯ — ОДИН РЯДОК ═══════════

   Узгоджено з людиною по кроках, на її ж числах за 2026-11-07:

     ⛔ 3 paused
     ━━━━━━━━━━━━━━━
     📋 "Click OR Lead KG" · from $4.00 · 🌍 KG
     🌐 4175 › 🏦 3 › 📣 MPlay_KG_10708-y3wz_07/11 001
     ⛔ KG_JS_633 — 💸$5.65 🖱0 📲0 ⚡CPC ∞ > $2.00

     🌐 4327 › 🏦 1 › 📣 …TR211003_1058595677211850_TJ
     ⛔ TJ_0iHVkg — 💸$19.53 🖱9 📲3 💰1 ⚡CPC $2.17 > $1.10

   Чому саме так:
     — лінія НАД кожним правилом, а одразу під назвою правила порожнього
       рядка немає: лінія ділить правила, порожній рядок — кабінети;
     — браузер ПЕРЕД кабінетом: кабінети звуться «1», «3», і шукають їх
       у профілі антидетекту, а не за назвою;
     — ліди й інстали під одним 📲 (див. convPick);
     — довгу кампанію ріжемо З ПОЧАТКУ: гео й ID стоять у кінці назви;
     — англійською: мета проєкту — увесь інтерфейс англійською.

   Без parse_mode, як і раніше: назви рясніють «_» і дужками, і
   розмітка Telegram на них відповідає 400. */

const TG_LINE = '━'.repeat(15);
const TG_CAMP_MAX = 30;

/* Значок на початку рядка — єдиний якір для ока. */
const tgMark = (h: Hit): string => h.dry ? '\u{1F441}' : h.ok ? '⛔' : '⚠';

/* Не-оголошення підписуємо: «⛔ Mostbet_KG_new» читається як одне
   оголошення, хоч це могла бути кампанія на сорок. */
const TG_WHAT: Record<string, string> = {
  ad: '', adset: 'adset: ', campaign: 'campaign: ' };

function tgCamp(name: string): string {
  const s = String(name || '').trim();
  return s.length > TG_CAMP_MAX ? '…' + s.slice(-(TG_CAMP_MAX - 1)) : s;
}

/* Числа рядка. 📲 — завжди, навіть нулем: саме «0» тут і є причиною
   більшості вимкнень. Реєстрації й депозити — лише коли не нуль. */
function tgCounts(h: Hit): string {
  const a = h.agg;
  const conv = h.conv === 'installs' ? a.installs : a.leads;
  return '\u{1F4B8}' + money(a.spend)
    + ' \u{1F5B1}' + a.linkClicks
    + ' \u{1F4F2}' + conv
    + (a.regs ? ' \u{1F4DD}' + a.regs : '')
    + (a.purchases ? ' \u{1F4B0}' + a.purchases : '');
}

/* «Після назви крео також ентер і внизу вже показники»: назва,
   під нею числа, під ними причина. В один рядок усе разом
   переносилось посередині чисел, і назву доводилось вишукувати. */
const tgOne = (h: Hit): string =>
  tgMark(h) + ' ' + (TG_WHAT[h.level] || '') + h.name + '\n' + tgCounts(h)
  + (h.why ? '\n⚡' + h.why : '')
  /* Помилка окремим рядком: це єдине, що означає «НЕ вимкнулось, гроші
     йдуть далі», і в кінці довгого рядка вона б загубилась. */
  + (h.error ? '\n⚠ ' + h.error : '');

/* 🌐 браузер › 🏦 кабінет › 📣 кампанія. Кампанію не пишемо, коли
   вимкнена сама кампанія: було б те саме ім'я двічі поспіль. */
function tgPath(h: Hit): string {
  const camp = h.level === 'campaign' ? '' : tgCamp(h.campaignName);
  return [h.browser ? '\u{1F310} ' + h.browser : '',
          /* ID, а не назва: назви тут «1», «3», а шукають кабінет за ID. */
          '\u{1F3E6} ' + (h.account || h.cabName || '?'),
          camp ? '\u{1F4E3} ' + camp : ''].filter(Boolean).join(' › ');
}

function tgScope(h: Hit): string {
  return ' · from ' + money(h.minSpend) + ' · \u{1F30D} '
    + (h.geos && h.geos.length ? h.geos.join('/') : 'any geo');
}

/* Групи в порядку появи, а не за алфавітом: як сталось, так і
   написано. */
function tgGroup<T>(list: T[], key: (x: T) => string): [string, T[]][] {
  const order: string[] = [];
  const by = new Map<string, T[]>();
  list.forEach(x => {
    const k = key(x);
    if (!by.has(k)) { by.set(k, []); order.push(k); }
    (by.get(k) as T[]).push(x);
  });
  return order.map(k => [k, by.get(k) as T[]]);
}

/* Правило → кабінет → кампанія. Шлях кампанії пишемо раз на свої
   оголошення; між кабінетами — порожній рядок. */
function tgBody(hits: Hit[]): string {
  return tgGroup(hits, h => h.ruleName).map(([rule, mine]) =>
    TG_LINE + '\n\u{1F4CB} "' + rule + '"' + tgScope(mine[0]) + '\n'
    + tgGroup(mine, h => h.account || '?').map(([_acc, rows]) =>
        tgGroup(rows, h => tgPath(h)).map(([path, list]) =>
          // Порожній рядок між креативами — кожен своїм блоком.
          path + '\n' + list.map(tgOne).join('\n\n')).join('\n\n')
      ).join('\n\n')
  ).join('\n');
}

function tgText(hits: Hit[]): string {
  const real = hits.filter(h => !h.dry && h.ok).length;
  const dry = hits.filter(h => h.dry).length;
  const failed = hits.filter(h => !h.dry && !h.ok).length;
  const head = [real ? '⛔ ' + real + ' paused' : '',
                dry ? '\u{1F441} ' + dry + ' report only' : '',
                failed ? '⚠ ' + failed + ' failed' : '']
    .filter(Boolean).join(' · ') + '\n';

  /* ЗВІДКИ ЧИСЛА — тільки коли вони НЕ свіжі. Дописувати «live data»
     щоразу означало б привчити не читати цей рядок. */
  const old = hits.filter(h => h.fromSnap).length;
  const note = old
    ? '⚠ ' + (old === hits.length
        ? 'Numbers from the last Sync now'
        : old + ' of them judged on the last Sync now')
      + ': Facebook did not return fresh ones.\n'
    : '';

  /* Підпис рахуємо В стелю, і відрізаємо ВЛУЧАННЯ, а не рядки: інакше
     лишився б заголовок без того, що під ним. */
  let keep = hits.slice(0, TG_MAX);
  const build = (list: Hit[]) => head + note + tgBody(list)
    + (hits.length > list.length ? '\n\n…and ' + (hits.length - list.length) + ' more' : '');
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

/* ПРО МЕРТВИЙ КАБІНЕТ — ОКРЕМИМ ПОВІДОМЛЕННЯМ, А НЕ РЯДКОМ У ЗВІТІ
   ПРО ВИМКНЕНЕ. Це не те, що зробили правила; це те, через що вони
   нічого не зроблять, і дія від людини потрібна інша.

   Шлемо це саме звідси, і це не дублює fb-sync. Вона порівнює те, що
   приїхало з Facebook, із тим, що лежить у базі, — а ми щойно
   переписали базу. Для неї зміни вже не буде, тож без цього
   повідомлення не прийшло б жодного. */
async function tgDead(base: string, hdr: Json,
                      deaths: { owner: string; account: string; name: string;
                                word: string; reason: string }[]): Promise<string> {
  if (!deaths.length) return 'nothing to report';
  const token = Deno.env.get('TG_BOT_TOKEN') || '';
  if (!token) return 'not configured';

  const byOwner = new Map<string, typeof deaths>();
  deaths.forEach(d => {
    if (!d.owner) return;
    const list = byOwner.get(d.owner);
    if (list) list.push(d); else byOwner.set(d.owner, [d]);
  });
  if (!byOwner.size) return 'nobody to notify';

  let links: Json[] = [];
  try { links = await pgGet(base, hdr, 'tg_links?select=user_id,chat_id&chat_id=not.is.null'); }
  catch (_e) { return 'no links table'; }
  const chats = new Map(links.map(l => [String(l.user_id), String(l.chat_id)]));

  let sent = 0;
  for (const [who, list] of byOwner) {
    const chat = chats.get(who);
    if (!chat) continue;
    const text = '⛔ ' + list.length + ' cabinet(s) stopped answering\n\n'
      + list.map(d => '• ' + d.name + ' — ' + d.word
          + (d.reason ? ' (' + d.reason + ')' : '')).join('\n')
      + '\n\nRules skipped them and will not ask again until they are back.';
    if (await tgPost(token, chat, text) === 'sent') sent++;
  }
  return sent + ' sent';
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
  // Номери браузерів для листа — один запит на прогін.
  const browsers = await browserMap(base, hdr);
  const problems: string[] = [];
  const hits: Hit[] = [];
  let scanned = 0, cabinets = 0, stale = 0;
  /* Скільки кабінетів судили по живих числах, і по яких довелось
     повернутись до знімка. Друге — не дрібниця у звіті: саме воно
     відповідає на «чому правило вимкнуло те, що я вже виправив». */
  let live = 0;
  const fellBack = new Set<string>();
  /* Кабінети, які виявились мертвими просто під час прогону. Окремо
     від fellBack: там «не змогли спитати», тут «спитали й дізнались». */
  let dead = 0;
  const deaths: { owner: string; account: string; name: string;
                  word: string; reason: string }[] = [];
  /* Слід про прогін — по власниках правил. Див. logRun. */
  const seen = new Map<string, RunSeen>();

  /* Правило чіпає ТІЛЬКИ кабінети свого автора. Токен — це і є
     власник: кабінети приходять під ним, і вимикати їх однаково можна
     лише ним. Токен без автора не збігається ні з чиїми правилами, і
     це теж треба сказати, а не тихо його обійти. */
  if (orphan) problems.push(orphan + ' rule(s) have no owner and were skipped'
    + ' — fill created_by in team_settings (step 3 of SECURITY_BUYERS.sql)');

  /* ЧЕРГА З ФІКСОВАНИМ ПОЧАТКОМ ГОЛОДУЄ З ХВОСТА.

     Токени йдуть id.asc, а прогін має дедлайн 110 секунд. Поки все
     встигає — байдуже. Щойно перестає (а один запит у Graph на
     кабінет × сотня кабінетів у дедлайн не влазить), обривається
     ЗАВЖДИ ОДИН І ТОЙ САМИЙ хвіст: наступний прогін починає з того
     самого початку й доходить рівно доти ж.

     Тобто частина кабінетів не перевірялась НІКОЛИ, і зовні це
     виглядало рівно як «правило спізнилось»: оголошення крутиться,
     спенд росте, повідомлення немає.

     Зсуваємо початок на один токен кожні чверть години. Коли все
     встигає, це нічого не міняє; коли ні — за кілька прогонів черга
     обходить усіх. Без нового стовпця й без пам'яті між прогонами:
     час тут і є лічильником. */
  const slot = Math.floor(Date.now() / (15 * 60_000));
  const from = tokens.length ? slot % tokens.length : 0;
  const queue = tokens.slice(from).concat(tokens.slice(0, from));
  /* Кого встигли. Різниця зі списком — це ті, кого цей прогін не
     бачив, і мовчати про неї не можна: саме вона й означає, що
     правила десь не спрацювали вчасно. */
  const walked = new Set<number>();

  for (const t of queue) {
    if (Date.now() > deadline) { problems.push('ran out of time'); break; }
    walked.add(Number(t.id));
    const tokenOwner = String(t.created_by || '');
    if (!tokenOwner) {
      problems.push(t.label + ': the token has no owner, so no rule applies to it');
      continue;
    }
    const ours = rulesFor(use, tokenOwner);
    if (!ours.length) continue;
    /* Рахуємо по ВЛАСНИКОВІ правил: журнал і сторінка дивляться саме
       на created_by, і чужий прогін у своєму журналі нікому не
       потрібен. */
    const seenOf = (team: string): RunSeen => {
      let v = seen.get(tokenOwner);
      if (!v) { v = { team, cabs: 0, ads: 0, stale: 0, live: 0, fell: 0, dead: 0,
                      paused: 0, would: 0,
                      rules: ours.length }; seen.set(tokenOwner, v); }
      if (!v.team && team) v.team = team;
      return v;
    };
    // Кабінети цього токена беремо з нашої ж таблиці: список парку там
    // уже є, і питати його в Facebook удруге немає потреби. Зниклі
    // (missing_since) пропускаємо — там нічого не крутиться.
    let accs: Json[] = [];
    try {
      accs = await pgGet(base, hdr, 'fb_accounts?select=account_id,name,status,team_name'
        + '&token_id=eq.' + Number(t.id) + '&missing_since=is.null');
    } catch (e) { problems.push(t.label + ': ' + (e as Error).message); continue; }

    for (const a of accs) {
      if (Date.now() > deadline) { problems.push('ran out of time'); break; }
      const account = String(a.account_id || '');
      // Не лише active: grace і unsettled теж під наглядом. Див. CAB_WATCH.
      if (!account || !cabWatched(String(a.status || ''))) continue;
      // Бойові першими — інакше звітне правило затуляє їх. Див. ruleOrder.
      const mine = ruleOrder(ours.filter(r => !r.cabs.length || r.cabs.includes(account)));
      if (!mine.length) continue;
      cabinets++;
      const mySeen = seenOf(String(a.team_name || t.team_name || ''));
      mySeen.cabs++;

      /* СПЕРШУ FACEBOOK. Запит вузький і рівно по цьому кабінету: ті,
         де немає ввімкненого правила, відсіялись вище й у Facebook не
         йдуть узагалі. */
      let ads: Ent[] | null = null;
      try {
        ads = await liveOf(String(t.token), account, leads, m => problems.push(m));
        mySeen.live++;
        live++;
        /* ВИХІД ІЗ GRACE/UNSETTLED — БЕЗ SYNC NOW. У базі кабінет не
           active, а Facebook щойно віддав числа: питаємо стан і, якщо
           він змінився, пишемо. Один зайвий запит — лише для таких
           кабінетів, а не для всього парку. */
        const was = String(a.status || '');
        if (was !== 'active') {
          const st = await cabState(String(t.token), account);
          if (st && st.word !== was) await markDead(base, hdr, tokenOwner, account, st);
        }
      } catch (e) {
        /* СПЕРШУ З'ЯСОВУЄМО, ЧИ КАБІНЕТ УЗАГАЛІ ЖИВИЙ.

           Забанений кабінет і хвилинний збій Graph відмовляють
           однаково, а робити з ними треба протилежне: у першому
           випадку знімок — це цифри з минулого життя, і судити по них
           означає вимикати в кабінеті, де вже нічого не крутиться. */
        const st = await cabState(String(t.token), account);
        /* Мертвий — лише той, за ким більше не стежимо. Grace/unsettled
           записуємо (щоб база знала правду) і йдемо далі, як на
           звичайному збої зв'язку — на знімок. */
        if (st && cabWatched(st.word) && st.word !== String(a.status || ''))
          await markDead(base, hdr, tokenOwner, account, st);
        if (st && !cabWatched(st.word)) {
          dead++;
          mySeen.dead++;
          /* Пишемо стан одразу — щоб наступний прогін цього кабінета
             вже не брав, і щоб дашборд не показував зелений кружечок
             на тому, чого немає. */
          await markDead(base, hdr, tokenOwner, account, st);
          /* Сповіщення шлемо САМІ, і це не дублювання. fb-sync
             порівнює те, що приїхало з Facebook, із тим, що лежить у
             базі; ми щойно переписали базу, тож для неї зміни вже не
             буде — і повідомлення, на яке людина розраховує, не
             прийшло б узагалі. */
          deaths.push({ owner: tokenOwner, account,
                        name: String(a.name || account),
                        word: st.word, reason: st.reason });
          problems.push(account + ': ' + st.word
            + (st.reason ? ' (' + st.reason + ')' : '')
            + ' — skipped, and the cabinet is marked so the next run does not ask again');
          continue;
        }
        /* Відмова Facebook — не привід осліпнути: знімок із його
           перевіркою на вік кращий за ніщо. Але судити по ньому
           МОВЧКИ не можна — інакше «правила вимкнули по свіжому» і
           «правила вимкнули по годинному» виглядають однаково. */
        fellBack.add(account);
        mySeen.fell++;
        problems.push(account + ': Facebook did not give the numbers ('
          + (e as Error).message + ') — judging by the last snapshot instead');
      }

      /* ЗАПАСНИЙ АЕРОДРОМ — знімок, який пише fb-sync. */
      if (!ads) {
        try {
          const snap = await snapOf(base, hdr, account, leads);
          if (snapTooOld(snap.age, maxAge)) {
            /* Не діємо й кажемо чому. Мовчання тут було б найгіршим:
               виглядало б як «правила не працюють», а шукали б причину
               в правилах, а не в даних. */
            stale++;
            mySeen.stale++;
            problems.push(account + ': the snapshot is '
              + (snap.age === Infinity ? 'missing' : Math.round(snap.age / 60000) + ' min old')
              + ', older than the ' + Math.round(maxAge / 60000) + ' min allowed'
              + ' — press Sync now on Cabinets');
            continue;
          }
          ads = snap.ents;
        } catch (e) {
          const msg = (e as Error).message;
          problems.push(account + ': ' + (/fb_ad_today|does not exist|42P01/i.test(msg)
            ? 'no snapshot table yet — run FB_RULES.sql' : msg));
          continue;
        }
      }
      scanned += ads.length;
      mySeen.ads += ads.length;

      /* Цифри кампаній/адсетів — по одному запиту на рівень, і лише коли
         числа живі. На знімку (Facebook уже відмовив) лишається стара
         сума з оголошень: гірше, ніж треба, але краще, ніж осліпнути. */
      const byLevel = new Map<string, Ent[]>();
      const entsAt = async (level: string): Promise<Ent[]> => {
        if (level === 'ad') return ads as Ent[];
        if (byLevel.has(level)) return byLevel.get(level) as Ent[];
        let got: Ent[];
        if (fellBack.has(account)) got = atLevel(ads as Ent[], level);
        else {
          try {
            got = await levelOf(String(t.token), account, level as 'adset' | 'campaign',
                                leads, m => problems.push(m));
          } catch (e) {
            problems.push(account + ': ' + level + ' numbers refused ('
              + (e as Error).message + ') — summed from active ads instead');
            got = atLevel(ads as Ent[], level);
          }
        }
        byLevel.set(level, got);
        return got;
      };

      for (const r of mine) {
        /* Фільтр за назвою дивиться і на БАТЬКІВ. Гео в цих назвах і
           живе: оголошення зветься KG_3166698, а кампанія —
           MPlayC_KG_10708. Поки дивились лише на власну назву,
           «тільки KG» на рівні оголошення не спрацьовувало там, де гео
           стоїть у кампанії, — тобто майже скрізь. */
        const ents = (await entsAt(r.level)).filter(e => {
          const names = [e.name, e.adsetName, e.campaignName];
          if (r.nameHas && !names.some(n => String(n || '').toLowerCase().includes(r.nameHas)))
            return false;
          return !r.geo.length || geoHit(r.geo, names);
        });
        ents.forEach(e => {
          if (!ruleHits(r, e.agg)) return;
          /* Та сама сутність могла підпасти під два правила — вимикати
             її двічі немає сенсу, лишаємо перше влучання. Перевіряємо і
             батьків: вимкнена кампанія глушить усе під собою, тож окремо
             гасити її оголошення — марні запити й зайві рядки в журналі. */
          if (hits.some(h => h.id === e.id || h.id === e.adset || h.id === e.campaign)) return;
          /* Де саме збіглось гео — рахуємо тут, поки під рукою всі три
             назви. У листі їх уже немає, а питання «чому TJ під
             правилом BR» виникає саме там. */
          const gw = r.geo.length ? geoWhy(r.geo, [
            { what: 'оголошення', name: String(e.name || '') },
            { what: 'адсет',      name: String(e.adsetName || '') },
            { what: 'кампанія',   name: String(e.campaignName || '') }]) : null;
          hits.push({ rule: r.id, ruleName: r.name, level: r.level, id: e.id,
                      name: e.name, account, campaignName: e.campaignName,
                      owner: String(t.created_by || ''), team: String(a.team_name || t.team_name || ''),
                      agg: e.agg, dry: forceDry || r.dry, ok: false, error: '', acted: false,
                      preview: forceDry, fromSnap: fellBack.has(account),
                      why: whyHit(r, e.agg),
                      /* Поріг, НИЖЧЕ ЯКОГО правило не дивиться взагалі.
                         Саме він відповідає на «чому аж $10.09»: до
                         десяти доларів правило не мало права діяти, а
                         перший прогін після перетину й вимкнув. Без
                         цього числа в листі питання виникає щоразу. */
                      minSpend: r.minSpend,
                      geos: r.geo.slice(),
                      geoIn: gw ? gw.code + ' \u2190 ' + gw.what + ' «' + gw.name + '»' : '',
                      cabName: String(a.name || ''),
                      browser: browserOf(browsers, tokenOwner, account, String(t.label || '')),
                      conv: convPick(r, e.agg) });
        });
      }
    }

    // Вимикаємо токеном, який це бачить: чужим не вийде.
    const mineNow = hits.filter(h => accs.some(a => String(a.account_id) === h.account));
    await pauseAll(String(t.token), mineNow);
    /* Позначаємо вимкнене у знімку. Живий список його й так більше не
       віддасть — це для прогонів, що впали на запасний аеродром. */
    const markErr = await markPaused(base, hdr, mineNow);
    if (markErr) problems.push(t.label + ': ' + markErr);
  }

  /* Що зробили — по власниках, щоб слід про прогін ніс саме його
     числа, а не загальні по всіх. */
  hits.forEach(h => {
    const v = seen.get(h.owner);
    if (!v) return;
    if (h.dry) v.would++; else if (h.ok) v.paused++;
  });
  await logRun(base, hdr, seen, cron);

  const logged = await logHits(base, hdr, hits);
  /* ПРЕВʼЮ В TELEGRAM НЕ ЙДЕ.

     «Check now» — це погляд на екран: людина натиснула й дивиться
     результат просто тут. Повідомлення дублювало побачене, а головне —
     лягало в стрічку між плановими прогонами, і розклад починав
     виглядати як випадковий: то раз на пів години, то двічі за
     десять хвилин. Розклад при цьому ніколи не мінявся. */
  const telegram = forceDry ? 'preview — not sent' : await tgSend(base, hdr, hits);
  /* Мертві кабінети — своїм повідомленням, і в попередньому перегляді
     теж мовчимо: preview не має слати нічого нікуди. */
  const telegramDead = forceDry ? 'preview — not sent' : await tgDead(base, hdr, deaths);

  return reply({
    fn: FN_VERSION, cron, rules: use.length, cabinets, ads: scanned,
    // Кабінети, які пропустили через застарілий знімок — щоб «нічого не
    // вимкнулось» не читалось як «правила не спрацювали».
    stale,
    /* По скількох кабінетах числа взяті просто з Facebook, і по
       скількох довелось судити по знімку. Без цих двох чисел відповідь
       «правила працюють» нічого не каже про те, на чому вони працюють. */
    live, fell_back: [...fellBack],
    /* До кого прогін не дійшов. Без цього «правило не спрацювало» і
       «до кабінета не дійшла черга» виглядають однаково. */
    skipped: tokens.filter(t => !walked.has(Number(t.id))).slice(0, 20).map(t => t.label),
    skipped_total: tokens.length - walked.size,
    /* Кабінети, які померли просто під час прогону. Окремим числом, бо
       «нічого не вимкнулось» через бан і через те, що нічого не
       підпало, — різні новини. */
    dead, telegram_dead: telegramDead,
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
