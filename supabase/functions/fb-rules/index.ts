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

const FN_VERSION = 'rules-1';
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
function snapTooOld(ageMs: number): boolean { return !(ageMs <= SNAP_MAX_AGE_MS); }
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
type Agg = { spend: number; imps: number; clicks: number; linkClicks: number; leads: number };

const METRICS: Record<string, (a: Agg) => number | null> = {
  spend:       a => a.spend,
  imps:        a => a.imps,
  leads:       a => a.leads,
  link_clicks: a => a.linkClicks,
  cpc_link:    a => a.linkClicks > 0 ? a.spend / a.linkClicks : (a.spend > 0 ? Infinity : null),
  cpl:         a => a.leads > 0 ? a.spend / a.leads : (a.spend > 0 ? Infinity : null),
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
  cpl: 'cost per lead', cpm: 'CPM', ctr_link: 'link CTR'
};
const METRIC_MONEY = ['spend', 'cpc_link', 'cpl', 'cpm'];

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
const LEAD_ACTIONS_DEFAULT = ['offsite_conversion.fb_pixel_lead'];

function ruleNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
}

/* Читаємо правила з team_settings. Окремої таблиці навмисно немає:
   правил одиниці, вони цілком налаштування, і зайвий SQL-крок при
   встановленні коштував би дорожче за користь. */
async function loadRules(base: string, hdr: Json, owner: string):
    Promise<{ rules: Rule[]; leads: string[]; teams: string[] }> {
  let rows: Json[] = [];
  try { rows = await pgGet(base, hdr, 'team_settings?select=team_name,value&key=eq.fb_rules'); }
  catch (_e) { /* немає налаштувань — немає правил */ }

  const rules: Rule[] = [];
  // Список подій більше не налаштовується — див. LEAD_ACTIONS_DEFAULT.
  const leads = LEAD_ACTIONS_DEFAULT;
  const teams: string[] = [];

  rows.forEach(r => {
    let v: Json = {};
    try { v = typeof r.value === 'string' ? JSON.parse(String(r.value)) : (r.value || {}); }
    catch (_e) { return; }
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
  return { rules: rules.filter(r => r.on), leads, teams };
}

function condOk(c: Cond, a: Agg): boolean | null {
  const val = METRICS[c.m](a);
  if (val == null) return null;              // нічого не знаємо — не вирішуємо
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

function aggZero(): Agg { return { spend: 0, imps: 0, clicks: 0, linkClicks: 0, leads: 0 }; }

function addAgg(to: Agg, from: Agg): void {
  to.spend += from.spend; to.imps += from.imps; to.clicks += from.clicks;
  to.linkClicks += from.linkClicks; to.leads += from.leads;
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

function aggOf(row: Json, leadActions: string[]): Agg {
  const acts: Json[] = Array.isArray(row.actions) ? row.actions : [];
  const leads = leadCount(acts, leadActions);
  return {
    spend: Number(row.spend) || 0,
    imps: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    linkClicks: Number(row.link_clicks) || 0,
    leads
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

function money(v: number): string {
  return '$' + (Math.round(v * 100) / 100).toLocaleString('en-US');
}
function metricLine(h: Hit): string {
  const a = h.agg;
  const cpc = METRICS.cpc_link(a), cpl = METRICS.cpl(a);
  const part = (label: string, v: number | null) =>
    v == null ? '' : ' · ' + label + ' ' + (v === Infinity ? '∞' : money(v));
  return money(a.spend) + part('click', cpc) + part('lead', cpl)
    + ' · ' + a.leads + ' lead(s)';
}

/* АДРЕСА ВЛУЧАННЯ. Без неї повідомлення каже «вимкнули KG_1» — а KG_1
   у людини з сорока кабінетами лежить невідомо де. Кабінет і кампанія
   і є тим найкоротшим шляхом від сповіщення до того самого рядка в Ads
   Manager: id кабінета вставляють у пошук, назву кампанії видно очима.

   Назву кампанії не повторюємо там, де сама сутність і є кампанією. */
function whereLine(h: Hit): string {
  const camp = h.level === 'campaign' ? '' : String(h.campaignName || '').trim();
  return 'cab ' + (h.account || '?') + (camp ? ' · camp «' + camp + '»' : '');
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
    return '\n\n\u{1F441} Preview — this was a “Check now”, not a scheduled run.'
      + '\n   Nothing was switched off. The rules themselves were not asked to act.';
  }
  const which = names.map(n => '«' + n + '»').join(', ');
  return '\n\n\u{1F441} Report only — nothing was switched off.'
    + '\n   ' + which + ' ' + (names.length > 1 ? 'are' : 'is')
    + ' not allowed to act yet.'
    + '\n   To let ' + (names.length > 1 ? 'them' : 'it') + ' switch things off:'
    + ' Rules → open the rule → tick “Allowed to switch things off”.';
}

function tgText(hits: Hit[]): string {
  const real = hits.filter(h => !h.dry && h.ok).length;
  const dry = hits.filter(h => h.dry).length;
  const failed = hits.filter(h => !h.dry && !h.ok).length;
  const head = (real ? '⛔ Paused ' + real : '\u{1F441} Would pause ' + dry)
    + (real && dry ? ', ' + dry + ' more only reported' : '')
    + (failed ? ', ' + failed + ' could not be paused' : '') + '\n\n';
  const one = (h: Hit) => (h.dry ? '\u{1F441} ' : h.ok ? '⛔ ' : '⚠ ')
    + h.level + ' «' + h.name + '»\n   ' + whereLine(h) + '\n   ' + metricLine(h)
    + '\n   rule: ' + h.ruleName
    + (h.why ? '\n   matched: ' + h.why : '')
    + (h.error ? '\n   ' + h.error : '');
  const lines = hits.slice(0, TG_MAX).map(one);
  const tail = () => {
    const rest = hits.length - lines.length;
    return rest > 0 ? '\n\n…and ' + rest + ' more.' : '';
  };
  /* Підпис рахуємо В стелю, а не поверх неї. Раніше його дописували
     після обрізання — і повідомлення, що тільки-но влізло, разом із
     підписом уже не влазило. Telegram на таке відповідає помилкою, і
     зникає все повідомлення, а не зайвий рядок. */
  const note = dryNote(hits);
  while (lines.length > 1
         && (head + lines.join('\n') + tail() + note).length > TG_LIMIT) lines.pop();
  return head + lines.join('\n') + tail() + note;
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

  const { rules, leads } = await loadRules(base, hdr, owner);
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

  for (const t of tokens) {
    if (Date.now() > deadline) { problems.push('ran out of time'); break; }
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
      const mine = use.filter(r => !r.cabs.length || r.cabs.includes(account));
      if (!mine.length) continue;
      cabinets++;

      let ads: Ent[];
      try {
        const snap = await snapOf(base, hdr, account, leads);
        if (snapTooOld(snap.age)) {
          /* Не діємо й кажемо чому. Мовчання тут було б найгіршим:
             виглядало б як «правила не працюють», а шукали б причину
             в правилах, а не в синхронізації. */
          stale++;
          problems.push(account + ': the snapshot is '
            + (snap.age === Infinity ? 'missing' : Math.round(snap.age / 60000) + ' min old')
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
        const ents = atLevel(ads, r.level).filter(e =>
          !r.nameHas || e.name.toLowerCase().includes(r.nameHas));
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
  const telegram = await tgSend(base, hdr, hits);

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
