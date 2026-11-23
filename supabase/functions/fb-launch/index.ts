/* ═══════════ ЗАПУСК ІЗ CRM: КОПІЯ КАМПАНІЇ В ІНШИЙ КАБІНЕТ ═══════════

   «щоб воно просто робило копію, і я міг міняти назву. Але щоб не
   публікувало».

   Facebook уміє копіювати кампанію лише в межах одного кабінета. Тому
   тут вона ВІДТВОРЮЄТЬСЯ: читаємо зразок (кампанія → адсети →
   оголошення з креативами) і створюємо те саме в цільовому кабінеті.

   УСЕ СТВОРЮЄТЬСЯ НА ПАУЗІ — кампанія, кожен адсет і кожне оголошення.
   Увімкнути може лише людина. Це не налаштування, а межа функції:
   параметра «створити активним» тут немає.

   КРЕАТИВ. Найнадійніший шлях між кабінетами — готовий пост Сторінки:
   у кожного оголошення є effective_object_story_id, і новий креатив
   посилається на нього. Відео й картинки при цьому не перезаливаються,
   лайки й коментарі лишаються спільними. Якщо поста немає (динамічний
   креатив), пробуємо перенести опис креатива як є — Facebook може
   відмовити, і тоді це оголошення пропускається з його ж поясненням.
   У тому самому кабінеті креатив просто береться за його ID.

   ЩО МОЖЕ НЕ ПЕРЕНЕСТИСЬ, і функція тут ні до чого: піксель або апка
   не видані цільовому кабінету, Сторінка недоступна його токену,
   валюти різні (бюджет — це число у валюті кабінета, тож між різними
   валютами відмовляємо одразу).

   НІЧОГО НЕ ВИДАЛЯЄМО. Якщо частина не створилась, уже створене
   лишається на паузі, а відповідь каже, чого бракує.

   ЯК КЛИКАТИ:
     {"source_account":"1","campaign_id":"2"}                      — лише прочитати зразок
     {"source_account":"1","campaign_id":"2","target_account":"3",
      "name":"New name"}                                            — створити копію на паузі
     {"source_account":"1","campaign_id":"2","snapshot":true}      — знімок для ШАБЛОНУ
     {"spec":{…},"target_account":"3","name":"…",
      "overrides":{"daily_budget":20,"countries":["KG"]},
      "check":true}                                                 — перевірка перед запуском
     те саме без check                                              — запуск шаблону на паузі

   ШАБЛОНИ. «ми пробували, але щось нічого не вийшло». Копія між
   кабінетами ламається не в нашому коді, а на доступах: Сторінка поста
   не видана новому кабінету, піксель чи апка не розшарені, аудиторії
   належать старому кабінету. Facebook каже про це лише ПІСЛЯ спроби —
   і кампанія вже наполовину створена. Тому перед запуском іде
   ПЕРЕВІРКА: що з потрібного новий кабінет справді бачить (Сторінки,
   пікселі, апки), і людина бачить це списком до першого запису.
   Піксель, якого новий кабінет не бачить, підміняється його власним;
   власні аудиторії старого кабінета прибираються з таргетингу.

   Один виклик — один цільовий кабінет: сторінка сама йде по списку й
   показує, що вийшло в кожному.

   Розгортання:
     supabase functions deploy fb-launch
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';
const FN_VERSION = '2026-11-23.5';
const DEADLINE_MS = 120_000;
const MAX_ADSETS = 20;
const MAX_ADS = 60;

type Json = Record<string, any>;

/* Картинка для оголошення-заготовки: темний квадрат 1080×1080 (PNG,
   ~5 КБ). Посилання-оголошенню Facebook потрібна картинка, а взяти її з
   лендингу він часто не може (сторінка закрита від його сканера), і
   картинку за чужою адресою (picture) теж відкидає. Тому заливаємо свою
   в цільовий кабінет (adimages) і ставимо її image_hash. */
const PH_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAABDgAAAQ4CAIAAABjcvvYAAATOklEQVR42u3XMQ0AAAgEsRfBgAL8S8QFYWhSBbddugYAAOCVSAAAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAo6ICAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAABgVFQAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqEgAAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAKOiAgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAjAoAAGBUAAAAjAoAAGBUAAAAjAoAAGBUAAAAjAoAAIBRAQAAjAoAAIBRAQAAjAoAAIBRAQAAjAoAAIBRAQAAjAoAAIBRAQAAMCoAAIBRAQAAMCoAAIBRAQAAMCoAAIBRAQAAMCoAAABGBQAAMCoAAABGBQAAMCoAAABGBQAAMCoAAABGBQAAMCoAAABGBQAAwKgAAABGBQAAwKgAAABGBQAAwKgAAABGBQAAwKgAAAAYFQAAwKgAAAAYFQAAwKgAAAAYFQAAwKgAAAAYFQAAwKgAAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAAAYFRUAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAjAoAAGBUAAAAjAoAAGBUAAAAjAoAAGBUAAAAjAoAAGBUAAAAjAoAAIBRAQAAjAoAAIBRAQAAjAoAAIBRAQAAjAoAAIBRAQAAMCoAAIBRAQAAMCoAAIBRAQAAMCoAAIBRAQAAMCoAAIBRAQAAMCoAAABGBQAAMCoAAABGBQAAMCoAAABGBQAAMCoAAABGBQAAwKgAAABGBQAAwKgAAABGBQAAwKgAAABGBQAAwKgAAABGBQAAwKgAAAAYFQAAwKgAAAAYFQAAwKgAAAAYFQAAwKgAAAAYFQAAwKhIAAAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACjogIAAGBUAAAAjAoAAGBUAAAAjAoAAGBUAAAAjAoAAGBUAAAAjAoAAIBRAQAAjAoAAIBRAQAAjAoAAIBRAQAAjAoAAIBRAQAAjAoAAIBRAQAAMCoAAIBRAQAAMCoAAIBRAQAAMCoAAIBRAQAAMCoAAABGBQAAMCoAAABGBQAAMCoAAABGBQAAMCoAAABGBQAAMCoAAABGBQAAwKgAAABGBQAAwKgAAABGBQAAwKgAAABGBQAAwKgAAAAYFQAAwKgAAAAYFQAAwKgAAAAYFQAAwKgAAAAYFQAAwKgAAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAGBUVAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAjAoAAGBUAAAAjAoAAGBUAAAAjAoAAGBUAAAAjAoAAGBUAAAAjAoAAIBRAQAAjAoAAIBRAQAAjAoAAIBRAQAAjAoAAIBRAQAAMCoAAIBRAQAAMCoAAIBRAQAAMCoAAIBRAQAAMCoAAIBRAQAAMCoAAABGBQAAMCoAAABGBQAAMCoAAABGBQAAMCoAAABGBQAAwKgAAABGBQAAwKgAAABGBQAAwKgAAABGBQAAwKgAAABGBQAAwKgAAAAYFQAAwKgAAAAYFQAAwKgAAAAYFQAAwKgAAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoSAAAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAowIAAGBUAAAAo6ICAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAABgVAAAAowIAABgVFQAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAABgVAAAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAAIwKAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAACAUQEAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAADAqAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAARgUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAMCoAAAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAGBUAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACjAgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAAEYFAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqAAAABgVAADAqEgAAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAAAYFQAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAKMCAABgVAAAAKOiAgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAYFQAAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAACMCgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAgFEBAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAEYFAAAwKgAAAHcWqTPB/kBrZH4AAAAASUVORK5CYII=';

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify({ fn: FN_VERSION, ...body }),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

/* Причину Graph кладе в тіло. error_user_msg — те, що людина бачить в
   Ads Manager, і воно зазвичай зрозуміліше за message. */
async function graph(path: string, token: string, params: Json = {}, method = 'GET'): Promise<Json> {
  const u = new URL(GRAPH + path);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (method === 'GET') u.searchParams.set(k, s); else form.set(k, s);
  }
  const res = await fetch(u.toString(), method === 'GET'
    ? { headers: { Authorization: 'Bearer ' + token } }
    : { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.error) {
    const e = j?.error || {};
    const more = [e.error_user_title, e.error_user_msg].filter(Boolean).join(': ');
    throw new Error(String(e.message || 'HTTP ' + res.status) + (more ? ' — ' + more : ''));
  }
  return j;
}

async function rest(base: string, hdr: Json, q: string): Promise<Json[]> {
  const res = await fetch(base + '/rest/v1/' + q, { headers: hdr });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
  return await res.json();
}

const bare = (v: unknown) => String(v ?? '').trim().replace(/^act_/, '');

const CAMP_FIELDS = 'id,name,account_id,objective,buying_type,special_ad_categories,'
  + 'special_ad_category_country,bid_strategy,daily_budget,lifetime_budget,'
  + 'smart_promotion_type,is_skadnetwork_attribution';
const ADSET_FIELDS = 'id,name,optimization_goal,billing_event,bid_amount,bid_strategy,'
  + 'daily_budget,lifetime_budget,targeting,promoted_object,attribution_spec,'
  + 'destination_type,end_time,is_dynamic_creative,dsa_beneficiary,dsa_payor';
const AD_FIELDS = 'id,name,adset_id,conversion_domain,tracking_specs,'
  + 'creative{id,name,object_story_id,effective_object_story_id,object_story_spec,'
  + 'asset_feed_spec,url_tags}';

/* Як перенесеться креатив цього оголошення. Окремою функцією: від неї
   залежить, що піде у Facebook, і її перевіряє тест без Facebook. */
function creativePlan(cr: Json, same: boolean): { how: 'same' | 'post' | 'spec' | 'none'; params: Json } {
  const id = String(cr?.id || '');
  if (same && id) return { how: 'same', params: {} };
  const story = String(cr?.effective_object_story_id || cr?.object_story_id || '');
  const tags = cr?.url_tags ? { url_tags: String(cr.url_tags) } : {};
  const name = cr?.name ? { name: String(cr.name).slice(0, 200) } : {};
  if (story) return { how: 'post', params: { ...name, object_story_id: story, ...tags } };
  if (cr?.object_story_spec || cr?.asset_feed_spec) {
    return { how: 'spec', params: { ...name, ...tags,
      ...(cr.object_story_spec ? { object_story_spec: cr.object_story_spec } : {}),
      ...(cr.asset_feed_spec ? { asset_feed_spec: cr.asset_feed_spec } : {}) } };
  }
  return { how: 'none', params: {} };
}

/* Поля нової кампанії. Бюджет і стратегія ставок переносяться лише
   коли бюджет справді на кампанії. Статус — завжди PAUSED. */
function campaignParams(c: Json, name: string): Json {
  const p: Json = {
    name, status: 'PAUSED',
    objective: c.objective,
    buying_type: c.buying_type || undefined,
    special_ad_categories: Array.isArray(c.special_ad_categories) ? c.special_ad_categories : [],
    special_ad_category_country: Array.isArray(c.special_ad_category_country)
      && c.special_ad_category_country.length ? c.special_ad_category_country : undefined,
    smart_promotion_type: c.smart_promotion_type && c.smart_promotion_type !== 'GUIDED_CREATION'
      ? c.smart_promotion_type : undefined,
    is_skadnetwork_attribution: c.is_skadnetwork_attribution === true ? true : undefined
  };
  if (Number(c.daily_budget) > 0) p.daily_budget = c.daily_budget;
  if (Number(c.lifetime_budget) > 0) p.lifetime_budget = c.lifetime_budget;
  if (p.daily_budget || p.lifetime_budget) p.bid_strategy = c.bid_strategy || undefined;
  return p;
}

/* Статус адсета й оголошення. Копія (Copy) — усе на паузі. Шаблон —
   «адсет не вимикай, тільки кампанію»: на паузі лише КАМПАНІЯ, адсети й
   оголошення увімкнені, тож увімкнув кампанію — і все пішло. Нічого не
   крутиться, поки кампанія на паузі. */
function adsetParams(a: Json, campaignId: string, now: number, status = 'PAUSED'): Json {
  const p: Json = {
    name: a.name, campaign_id: campaignId, status,
    optimization_goal: a.optimization_goal, billing_event: a.billing_event,
    targeting: a.targeting, promoted_object: a.promoted_object,
    attribution_spec: a.attribution_spec, destination_type: a.destination_type,
    is_dynamic_creative: a.is_dynamic_creative === true ? true : undefined,
    dsa_beneficiary: a.dsa_beneficiary, dsa_payor: a.dsa_payor
  };
  if (Number(a.bid_amount) > 0) p.bid_amount = a.bid_amount;
  if (Number(a.daily_budget) > 0) p.daily_budget = a.daily_budget;
  if (Number(a.lifetime_budget) > 0) p.lifetime_budget = a.lifetime_budget;
  if (p.daily_budget || p.lifetime_budget) p.bid_strategy = a.bid_strategy || undefined;
  // Старт — лише майбутній (з шаблону його не беремо: там він давно минув).
  const start = Date.parse(String(a.start_time || ''));
  if (Number.isFinite(start) && start > now) p.start_time = new Date(start).toISOString();
  // Кінець у минулому Facebook не прийме; майбутній переносимо як є.
  const end = Date.parse(String(a.end_time || ''));
  if (Number.isFinite(end) && end > now && (!p.start_time || end > start)) p.end_time = a.end_time;
  return p;
}

/* ── ПЕРЕВІРКА ПЕРЕД ЗАПУСКОМ ──
   Що з потрібного шаблону цільовий кабінет справді бачить. Кожен пункт:
   ok / warn (запустимо, але з підміною чи без чогось) / fail (саме це
   й зламає запуск). Якщо Facebook не віддав список (немає прав на
   читання) — пункт «unknown»: не блокуємо, але й не обіцяємо. */
type Check = { level: 'ok' | 'warn' | 'fail' | 'unknown'; text: string };
/* page: випадкова Сторінка цільового кабінета для оголошень, чия Сторінка
   йому недоступна; lost: Сторінки, яких він не бачить; noAds: оголошень
   не створюємо зовсім — «сам зайду й запущусь». */
type Fix = { pixel?: string; page?: string; pageName?: string; lost?: string[]; noAds?: boolean };

const pageOf = (cr: Json): string => {
  const story = String(cr?.effective_object_story_id || cr?.object_story_id || '');
  if (story.includes('_')) return story.split('_')[0];
  return String(cr?.object_story_spec?.page_id || '');
};

async function listIds(path: string, token: string): Promise<Map<string, string> | null> {
  try {
    const j = await graph(path, token, { fields: 'id,name', limit: 200 });
    return new Map((j.data || []).map((x: Json) => [String(x.id), String(x.name || x.id)]));
  } catch (_e) { return null; }
}

async function preflight(spec: Json, T: { token: string; currency: string; status: string },
                         tgt: string, same: boolean): Promise<{ checks: Check[]; fix: Fix }> {
  const checks: Check[] = [];
  const fix: Fix = {};
  const adsets: Json[] = spec.adsets || [], ads: Json[] = spec.ads || [];
  if (!adsets.length) checks.push({ level: 'fail', text: 'the template has no ad sets — nothing to launch' });
  if (spec.currency && T.currency && spec.currency !== T.currency)
    checks.push({ level: 'fail', text: 'currency ' + T.currency + ' ≠ ' + spec.currency
      + ' of the template: budgets are numbers in the cabinet’s currency' });
  else checks.push({ level: 'ok', text: 'currency ' + (T.currency || spec.currency || '—') });
  if (same) return { checks, fix };

  /* Сторінки. «завжди треба створювати оголошення, всерівно що там».
     Оголошенню потрібна Сторінка — без неї Facebook не створить навіть
     заготовку. Беремо Сторінку шаблону, якщо кабінет її бачить; інакше
     випадкову Сторінку цього кабінета. */
  const pages = [...new Set(ads.map(a => pageOf(a.creative || {})).filter(Boolean))];
  if (!same && ads.length) {
    const can = await listIds('/act_' + tgt + '/promote_pages', T.token);
    if (!can) {
      checks.push({ level: 'unknown', text: 'could not read which pages this cabinet can use — ads will try the template’s page' });
    } else if (!can.size) {
      fix.noAds = true;
      checks.push({ level: 'warn', text: 'this cabinet has no page — Facebook cannot create an ad without one, so campaign and ad sets only' });
    } else {
      const own = pages.find(pg => can.has(pg));
      const ids = [...can.keys()];
      fix.page = own || ids[Math.floor(Math.random() * ids.length)];
      fix.pageName = can.get(fix.page) || fix.page;
      fix.lost = pages.filter(pg => !can.has(pg));
      pages.filter(pg => can.has(pg)).forEach(pg => checks.push({ level: 'ok', text: 'page ' + can.get(pg) }));
      if (fix.lost.length) checks.push({ level: 'warn', text: 'page ' + fix.lost.join(', ') + ' is not in this cabinet — ads go to its page “'
        + fix.pageName + '”; where the post cannot be reused, the ad is a placeholder' });
    }
  }
  // Пікселі
  const pixels = [...new Set(adsets.map(a => String(a.promoted_object?.pixel_id || '')).filter(Boolean))];
  if (pixels.length) {
    const own = await listIds('/act_' + tgt + '/adspixels', T.token);
    for (const px of pixels) {
      if (!own) checks.push({ level: 'unknown', text: 'pixel ' + px + ': could not read this cabinet’s pixels' });
      else if (own.has(px)) checks.push({ level: 'ok', text: 'pixel ' + own.get(px) });
      else if (own.size) {
        const [id, name] = [...own.entries()][0];
        fix.pixel = id;
        checks.push({ level: 'warn', text: 'pixel ' + px + ' is not shared with this cabinet — its own pixel “' + name + '” will be used' });
      } else checks.push({ level: 'warn', text: 'this cabinet has no pixel — conversion ad sets may be refused by Facebook; pick one in the cabinet' });
    }
  }
  // Апки
  const apps = [...new Set(adsets.map(a => String(a.promoted_object?.application_id || '')).filter(Boolean))];
  if (apps.length) {
    const can = await listIds('/act_' + tgt + '/advertisable_applications', T.token);
    for (const ap of apps) {
      if (!can) checks.push({ level: 'unknown', text: 'app ' + ap + ': could not read which apps this cabinet can advertise' });
      else if (can.has(ap)) checks.push({ level: 'ok', text: 'app ' + can.get(ap) });
      else checks.push({ level: 'warn', text: 'app ' + ap + ' is not connected to this cabinet — its ad sets may be refused; link the app to the cabinet' });
    }
  }
  // Власні аудиторії старого кабінета
  const aud = adsets.some(a => (a.targeting?.custom_audiences || []).length || (a.targeting?.excluded_custom_audiences || []).length);
  if (aud) checks.push({ level: 'warn', text: 'custom audiences belong to the old cabinet — they are left out of targeting' });
  return { checks, fix };
}

/* Підготувати знімок під цільовий кабінет: назва, бюджет, гео, підміна
   пікселя, без чужих аудиторій. Сам знімок не міняємо — копія. */
function shape(spec: Json, ov: Json, fix: Fix, same: boolean): { camp: Json; adsets: Json[]; ads: Json[]; notes: string[] } {
  const notes: string[] = [];
  let dyn = false;
  const camp: Json = { ...(spec.campaign || {}) };
  const budget = Number(ov?.daily_budget);
  const cents = Number.isFinite(budget) && budget > 0 ? String(Math.round(budget * 100)) : '';
  const cbo = Number(camp.daily_budget) > 0 || Number(camp.lifetime_budget) > 0;
  if (cents && cbo) { camp.daily_budget = cents; delete camp.lifetime_budget; }
  const countries = Array.isArray(ov?.countries)
    ? ov.countries.map((c: unknown) => String(c).toUpperCase().trim()).filter((c: string) => /^[A-Z]{2}$/.test(c)) : [];
  const adsets = (spec.adsets || []).map((a0: Json) => {
    const a: Json = { ...a0, targeting: a0.targeting ? JSON.parse(JSON.stringify(a0.targeting)) : a0.targeting,
                      promoted_object: a0.promoted_object ? { ...a0.promoted_object } : a0.promoted_object };
    if (cents && !cbo) { a.daily_budget = cents; delete a.lifetime_budget; }
    /* Старт адсетів — «Schedule, Start date»: після публікації Facebook не
       дає його змінити, тож ставимо одразу. Без перекриття — без старту. */
    delete a.start_time;
    if (ov?.start_time && Number.isFinite(Date.parse(String(ov.start_time)))) a.start_time = String(ov.start_time);
    if (countries.length && a.targeting) a.targeting.geo_locations = { countries };
    if (!same && a.targeting) { delete a.targeting.custom_audiences; delete a.targeting.excluded_custom_audiences; }
    if (fix.pixel && a.promoted_object?.pixel_id) a.promoted_object.pixel_id = fix.pixel;
    if (!same && a.is_dynamic_creative) { delete a.is_dynamic_creative; dyn = true; }
    return a;
  });
  if (dyn) notes.push('dynamic creative is off in the copy, so ordinary ads fit in the ad set — switch it back on when you set the creatives');
  /* ОГОЛОШЕННЯ — ЗАВЖДИ. Для кожного — черга креативів, від найкращого
     до заготовки: пост шаблону (якщо Сторінка є в кабінеті) → опис
     креатива на Сторінці кабінета → посилання-заготовка з картинкою
     Сторінки → те саме без картинки. Створення бере перший, який
     Facebook прийняв; не прийняв жоден — бере будь-який креатив, що вже є
     в кабінеті (див. цикл нижче). Динамічний креатив у копії вимкнено:
     у такому адсеті лише одне оголошення і лише з набором чужих відео. */
  const linkOf = (cr: Json, d: Json): string => {
    const o = cr.object_story_spec || {};
    const l = o.link_data?.link || o.video_data?.call_to_action?.value?.link || o.template_data?.link
      || cr.asset_feed_spec?.link_urls?.[0]?.website_url || '';
    if (l) return String(l);
    const dom = String(d.conversion_domain || '').trim();
    return dom ? 'https://' + dom.replace(/^https?:\/\//, '') : 'https://www.facebook.com';
  };
  let ads: Json[] = [];
  if (!fix.noAds) {
    ads = (spec.ads || []).map((d: Json) => {
      if (same) return d;
      const cr: Json = d.creative || {};
      const pg = pageOf(cr);
      const P = fix.page || pg;
      const lost = !!(fix.lost && fix.lost.includes(pg));
      const tags = cr.url_tags ? { url_tags: String(cr.url_tags) } : {};
      const nm = { name: String(cr.name || d.name || 'Creative').slice(0, 200) };
      const cands: Json[] = [];
      const story = String(cr.effective_object_story_id || cr.object_story_id || '');
      /* Post ID, вписаний людиною в редакторі шаблону (post_id), — перший
         у черзі: готовий допис не блокує режим розробки додатка. */
      const own = String(d.post_id || '').trim();
      if (own) cands.push({ ...nm, object_story_id: own, ...tags });
      /* СВІЙ КРЕАТИВ ІЗ ШАБЛОНУ (d.media): відео чи картинка, залиті один
         раз у редакторі, з текстом, заголовком, посиланням і кнопкою.
         Файл заливається в цей кабінет при запуску (див. buildMedia). */
      const md = d.media;
      if (md && md.path && P) cands.unshift({ __media: { ...md, page: P }, ...nm, ...tags });
      /* МОВНЕ ОГОЛОШЕННЯ (Languages у Ads Manager): asset_feed_spec з
         optimization_type LANGUAGE — свій текст, заголовок, посилання й
         відео на кожну мову та правила «яка мова кому». Відтворюємо його
         цілком, а не одномовною копією. Найперше в черзі. */
      const af = cr.asset_feed_spec;
      if (af && String(af.optimization_type || '') === 'LANGUAGE' && P)
        cands.unshift({ __lang: { afs: af, media: md && md.path ? md : null, page: P }, ...nm, ...tags });
      if (story && !lost && story !== own) cands.push({ ...nm, object_story_id: story, ...tags });
      const oss = cr.object_story_spec;
      if (oss && (oss.link_data || oss.video_data || oss.photo_data || oss.template_data) && !cr.asset_feed_spec) {
        const o: Json = JSON.parse(JSON.stringify(oss));
        if (P) o.page_id = P;
        delete o.instagram_actor_id; delete o.instagram_user_id;
        cands.push({ ...nm, object_story_spec: o, ...tags });
      }
      if (P) {
        const link = linkOf(cr, d);
        const ph = (img: boolean): Json => ({ __ph: img ? 'img' : 'plain',
          name: ('Placeholder · ' + String(d.name || '')).slice(0, 200), ...tags,
          object_story_spec: { page_id: P, link_data: { link, message: 'Placeholder — replace the creative',
            name: String(d.name || 'Placeholder').slice(0, 100) } } });
        cands.push(ph(true), ph(false));
      }
      return { ...d, tracking_specs: undefined, cands, page: P };
    });
  }
  return { camp, adsets, ads, notes };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const base = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const svc = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!base || !svc) return reply({ error: 'function is not configured' }, 500);
  const auth = req.headers.get('Authorization') || '';
  if (!auth) return reply({ error: 'no authorization header' }, 401);

  let body: Json = {};
  try { body = await req.json(); } catch (_e) { /* порожнє тіло — відмова нижче */ }
  const src = bare(body.source_account), tgt = bare(body.target_account);
  const campaignId = String(body.campaign_id ?? '').trim();
  const newName = String(body.name ?? '').trim().slice(0, 250);
  const fromSpec = body.spec && typeof body.spec === 'object' ? body.spec as Json : null;
  if (!fromSpec && (!src || !/^\d+$/.test(campaignId)))
    return reply({ error: 'source_account and campaign_id are required' }, 400);
  if (fromSpec && !tgt) return reply({ error: 'target_account is required to launch a template' }, 400);

  const hdr = { apikey: anon, Authorization: auth, 'content-type': 'application/json' };
  const svcHdr = { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json' };

  /* Кабінет читається заголовками того, хто покликав (чужий не прийде),
     токен — сервісним ключем і лише той, що належить команді вже
     підтвердженого кабінета. Той самий порядок, що у fb-limit. */
  const tokenOf = async (account: string) => {
    const accs = await rest(base, hdr, 'fb_accounts?account_id=eq.' + encodeURIComponent(account)
      + '&select=account_id,token_id,team_name,currency,status&limit=1');
    if (!accs.length) throw new Error('cabinet ' + account + ' is not among yours — press Sync now on Cabinets');
    if (!accs[0].token_id) throw new Error('cabinet ' + account + ' has no token attached');
    const toks = await rest(base, svcHdr, 'fb_tokens?id=eq.' + Number(accs[0].token_id)
      + '&team_name=eq.' + encodeURIComponent(String(accs[0].team_name || ''))
      + '&select=token,scopes&limit=1');
    const token = String(toks[0]?.token || '');
    if (!token) throw new Error('the token of cabinet ' + account + ' is gone');
    return { token, scopes: Array.isArray(toks[0]?.scopes) ? toks[0].scopes as string[] : [],
             currency: String(accs[0].currency || ''), status: String(accs[0].status || '') };
  };

  // ── зразок: живий (Copy / знімок) або збережений (шаблон) ──
  let spec: Json;
  let S: Awaited<ReturnType<typeof tokenOf>> | null = null;
  if (fromSpec) {
    spec = fromSpec;
  } else {
    try { S = await tokenOf(src); } catch (e) { return reply({ error: String((e as Error).message) }, 400); }
    try {
      const camp = await graph('/' + campaignId, S.token, { fields: CAMP_FIELDS });
      if (bare(camp.account_id) !== src)
        return reply({ error: 'this campaign belongs to cabinet ' + bare(camp.account_id) + ', not ' + src }, 400);
      const adsets = (await graph('/' + campaignId + '/adsets', S.token, { fields: ADSET_FIELDS, limit: 100 })).data || [];
      const ads = (await graph('/' + campaignId + '/ads', S.token, { fields: AD_FIELDS, limit: 200 })).data || [];
      spec = { v: 1, source_account: src, currency: S.currency, campaign: camp, adsets, ads };
    } catch (e) {
      return reply({ error: 'Facebook did not return the campaign: ' + String((e as Error).message) }, 400);
    }
  }
  const specSrc = bare(spec.source_account);
  const same = !!tgt && tgt === specSrc;
  const camp0: Json = spec.campaign || {}, adsets0: Json[] = spec.adsets || [], ads0: Json[] = spec.ads || [];

  const sample = {
    campaign: { id: String(camp0.id || ''), name: String(camp0.name || ''), objective: String(camp0.objective || ''),
                daily_budget: camp0.daily_budget || null, lifetime_budget: camp0.lifetime_budget || null },
    currency: String(spec.currency || ''),
    adsets: adsets0.map(a => ({ id: String(a.id), name: String(a.name || ''),
      daily_budget: a.daily_budget || null, optimization_goal: a.optimization_goal || null,
      promoted_object: a.promoted_object || null,
      countries: a.targeting?.geo_locations?.countries || null })),
    ads: ads0.map(a => ({ id: String(a.id), name: String(a.name || ''), adset: String(a.adset_id || ''),
                          how: creativePlan(a.creative || {}, same).how })),
    too_many: adsets0.length > MAX_ADSETS || ads0.length > MAX_ADS
      ? 'only the first ' + MAX_ADSETS + ' ad sets and ' + MAX_ADS + ' ads are copied' : undefined
  };

  if (!fromSpec && body.snapshot) return reply({ ok: true, mode: 'snapshot', sample, spec });
  if (!tgt) return reply({ ok: true, mode: 'read', sample });

  // ── запис ──
  let T: Awaited<ReturnType<typeof tokenOf>>;
  try { T = same && S ? S : await tokenOf(tgt); } catch (e) { return reply({ error: String((e as Error).message) }, 400); }
  if (T.scopes.length && !T.scopes.includes('ads_management'))
    return reply({ error: 'the token of cabinet ' + tgt + ' has no ads_management — it can only read' }, 400);

  let shaped: { camp: Json; adsets: Json[]; ads: Json[]; notes?: string[] };
  let warns: string[] = [];
  if (fromSpec) {
    const pf = await preflight(spec, T, tgt, same);
    if (body.check) return reply({ ok: true, mode: 'check', target_account: tgt, sample, checks: pf.checks });
    const bad = pf.checks.filter(c => c.level === 'fail');
    if (bad.length) return reply({ error: 'not launched: ' + bad.map(c => c.text).join('; '), checks: pf.checks }, 409);
    shaped = shape(spec, body.overrides || {}, pf.fix, same);
    warns = pf.checks.filter(c => c.level === 'warn').map(c => c.text).concat(shaped.notes || []);
  } else {
    if (S && S.currency && T.currency && S.currency !== T.currency)
      return reply({ error: 'different currencies (' + S.currency + ' → ' + T.currency
        + '): a budget is a number in the cabinet’s currency, so the copy would get the wrong budget' }, 409);
    shaped = { camp: camp0, adsets: adsets0, ads: ads0 };
  }
  const { camp, adsets, ads } = shaped;
  if (!adsets.length) return reply({ error: 'the campaign has no ad sets — nothing to copy' }, 400);

  const deadline = Date.now() + DEADLINE_MS;
  const act = '/act_' + tgt;
  // Кампанія — завжди PAUSED (campaignParams). Усередині: шаблон — увімкнено.
  const inner = fromSpec ? 'ACTIVE' : 'PAUSED';
  const problems: string[] = [];
  let newCamp = '';
  try {
    newCamp = String((await graph(act + '/campaigns', T.token,
      campaignParams(camp, newName || String(camp.name || 'Copy')), 'POST')).id || '');
    if (!newCamp) throw new Error('Facebook returned no campaign id');
  } catch (e) {
    return reply({ error: 'Campaign not created: ' + String((e as Error).message), sample }, 400);
  }

  const setMap = new Map<string, string>();
  let setsMade = 0, adsMade = 0, timedOut = false;
  /* ── СВІЙ КРЕАТИВ: файл зі сховища launch-media → у кабінет ──
     Картинка — байтами в adimages (image_hash). Відео — посиланням у
     advideos (Facebook качає сам), потім чекаємо, поки обробить, і
     беремо мініатюру. Один файл заливається в кабінет один раз за
     запуск, навіть якщо він на всіх оголошеннях. */
  const mediaCache = new Map<string, Json>();
  const stHdr = { apikey: svc, Authorization: 'Bearer ' + svc };
  const stUrl = (path: string) => base + '/storage/v1/object/launch-media/' + path.split('/').map(encodeURIComponent).join('/');
  const toB64 = (buf: ArrayBuffer) => {
    const b = new Uint8Array(buf); let out = '';
    for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(out);
  };
  const uploadMedia = async (md: Json): Promise<Json> => {
    const key = String(md.path);
    if (mediaCache.has(key)) return mediaCache.get(key)!;
    let got: Json;
    if (md.kind === 'video') {
      const sr = await fetch(base + '/storage/v1/object/sign/launch-media/' + key.split('/').map(encodeURIComponent).join('/'),
        { method: 'POST', headers: { ...stHdr, 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }) });
      const sj = await sr.json().catch(() => ({}));
      if (!sr.ok || !sj.signedURL) throw new Error('could not read the video from storage');
      // Чекаємо обробку всередині: без готового відео креатив Facebook не прийме.
      got = await uploadVideoUrl(base + '/storage/v1' + String(sj.signedURL), String(md.name || 'video'));
    } else {
      const r = await fetch(stUrl(key), { headers: stHdr });
      if (!r.ok) throw new Error('could not read the image from storage');
      const up = await graph(act + '/adimages', T.token, { bytes: toB64(await r.arrayBuffer()), name: String(md.name || 'image') }, 'POST');
      const first = Object.values(up.images || {})[0] as Json | undefined;
      if (!first?.hash) throw new Error('Facebook returned no image hash');
      got = { image_hash: String(first.hash) };
    }
    mediaCache.set(key, got);
    return got;
  };
  /* Відео кабінета-зразка → у цей кабінет. Потрібен живий токен зразка:
     беремо в Facebook адресу файлу (source) і віддаємо її advideos. */
  let srcTok: string | null | undefined;
  const videoCache = new Map<string, Json>();
  const copySourceVideo = async (vid: string): Promise<Json> => {
    if (videoCache.has(vid)) return videoCache.get(vid)!;
    if (srcTok === undefined) { try { srcTok = (await tokenOf(specSrc)).token; } catch (_e) { srcTok = null; } }
    if (!srcTok) throw new Error('the template’s cabinet is gone, so its videos cannot be copied — upload a video in the template editor');
    const v = await graph('/' + vid, srcTok, { fields: 'source' });
    if (!v.source) throw new Error('Facebook did not give the video file of the template');
    const got = await uploadVideoUrl(String(v.source), 'video ' + vid);
    videoCache.set(vid, got);
    return got;
  };
  const uploadVideoUrl = async (fileUrl: string, name: string): Promise<Json> => {
    const id = String((await graph(act + '/advideos', T.token, { file_url: fileUrl, name }, 'POST')).id || '');
    if (!id) throw new Error('Facebook returned no video id');
    let thumb = '';
    for (let i = 0; i < 20 && Date.now() < deadline - 15_000; i++) {
      const v = await graph('/' + id, T.token, { fields: 'status,picture' }).catch(() => ({} as Json));
      thumb = String(v.picture || thumb);
      const st = String(v.status?.video_status || '');
      if (st === 'ready') break;
      if (st === 'error') throw new Error('Facebook could not process the video');
      await new Promise(r => setTimeout(r, 3000));
    }
    try {
      const th = await graph('/' + id + '/thumbnails', T.token, { fields: 'uri,is_preferred' });
      const list: Json[] = th.data || [];
      thumb = String((list.find(x => x.is_preferred) || list[0] || {}).uri || thumb);
    } catch (_e) { /* мініатюра з picture */ }
    return { video_id: id, thumb };
  };
  /* Мовний креатив: мітки мов — за назвами (id міток належать старому
     кабінету), відео — своє з редактора на всі мови або скопійовані з
     кабінета-зразка, Сторінка — цього кабінета. */
  const langCreative = async (c0: Json): Promise<Json> => {
    const L: Json = c0.__lang;
    const afs: Json = JSON.parse(JSON.stringify(L.afs));
    const lab = (x: Json) => x ? { name: String(x.name || '') } : x;
    const fixLabels = (arr: Json[] | undefined) => (arr || []).map(e => ({ ...e, adlabels: (e.adlabels || []).map(lab) }));
    ['bodies', 'titles', 'descriptions', 'link_urls', 'images'].forEach(k => { if (afs[k]) afs[k] = fixLabels(afs[k]); });
    (afs.asset_customization_rules || []).forEach((r: Json) => {
      Object.keys(r).forEach(k => { if (/_label$/.test(k)) r[k] = lab(r[k]); });
    });
    const own = L.media && L.media.kind === 'video' ? await uploadMedia(L.media) : null;
    if (L.media && L.media.link) (afs.link_urls || []).forEach((u: Json) => { u.website_url = L.media.link; });
    const vids: Json[] = [];
    for (const v of (afs.videos || [])) {
      const got = own || await copySourceVideo(String(v.video_id));
      vids.push({ video_id: got.video_id, thumbnail_url: got.thumb || undefined, adlabels: (v.adlabels || []).map(lab) });
    }
    afs.videos = vids;
    ['shops_bundle', 'reasons_to_shop', 'additional_data'].forEach(k => delete afs[k]);
    const out: Json = { name: c0.name, object_story_spec: { page_id: L.page }, asset_feed_spec: afs };
    if (c0.url_tags) out.url_tags = c0.url_tags;
    return out;
  };
  const mediaCreative = async (c0: Json): Promise<Json> => {
    const md: Json = c0.__media;
    const got = await uploadMedia(md);
    const link = String(md.link || '').trim() || 'https://www.facebook.com';
    const cta = String(md.cta || '').trim();
    const ctaObj = cta ? { type: cta, value: { link } } : undefined;
    const oss: Json = { page_id: md.page };
    if (got.video_id) oss.video_data = { video_id: got.video_id, image_url: got.thumb || undefined,
      message: md.text || undefined, title: md.title || undefined, call_to_action: ctaObj || { type: 'LEARN_MORE', value: { link } } };
    else oss.link_data = { link, image_hash: got.image_hash, message: md.text || undefined, name: md.title || undefined, call_to_action: ctaObj };
    const out: Json = { name: c0.name, object_story_spec: oss };
    if (c0.url_tags) out.url_tags = c0.url_tags;
    return out;
  };

  /* Пул готових дописів і креативів кабінета — збираємо раз на запуск. */
  let reuse: { kind: 'post' | 'creative'; id: string }[] | null = null;
  let reuseGood: { kind: 'post' | 'creative'; id: string } | null = null;
  const reuseBad = new Set<string>();
  const reusePool = async (page: string) => {
    const out: { kind: 'post' | 'creative'; id: string }[] = [];
    // Лише id: у дописів немає поля name, і запит із ним Facebook відкинув би.
    const ids = async (path: string) => {
      try { return ((await graph(path, T.token, { fields: 'id', limit: 25 })).data || []).map((x: Json) => String(x.id)); }
      catch (_e) { return []; }
    };
    if (page) {
      for (const path of ['/' + page + '/ads_posts', '/' + page + '/published_posts', '/' + page + '/posts']) {
        for (const id of (await ids(path)).slice(0, 10)) if (!out.some(x => x.id === id)) out.push({ kind: 'post', id });
      }
    }
    for (const id of (await ids(act + '/adcreatives')).slice(0, 15)) out.push({ kind: 'creative', id });
    return out;
  };
  let phHash: string | null = null;
  for (const a of adsets.slice(0, MAX_ADSETS)) {
    if (Date.now() > deadline) { timedOut = true; break; }
    try {
      const id = String((await graph(act + '/adsets', T.token, adsetParams(a, newCamp, Date.now(), inner), 'POST')).id || '');
      if (!id) throw new Error('no id returned');
      setMap.set(String(a.id), id);
      setsMade++;
    } catch (e) {
      problems.push('ad set “' + String(a.name || a.id) + '”: ' + String((e as Error).message));
    }
  }

  for (const ad of ads.slice(0, MAX_ADS)) {
    if (Date.now() > deadline) { timedOut = true; break; }
    const setId = setMap.get(String(ad.adset_id || ''));
    if (!setId) continue;                       // адсет не створився — про це вже сказано
    const label = 'ad “' + String(ad.name || ad.id) + '”';
    if (Array.isArray(ad.cands)) {
      // Черга креативів: перший, з яким Facebook створив оголошення.
      const tried: string[] = [];
      const mk = async (cr0: Json) => {
        let cr: Json = cr0;
        if (cr0.__lang) cr = await langCreative(cr0);
        else if (cr0.__media) cr = await mediaCreative(cr0);
        else if (cr0.__ph) {
          cr = JSON.parse(JSON.stringify(cr0)); delete cr.__ph;
          if (cr0.__ph === 'img') {
            if (phHash === null) {
              try {
                const up = await graph(act + '/adimages', T.token, { bytes: PH_PNG_B64, name: 'placeholder.png' }, 'POST');
                const first = Object.values(up.images || {})[0] as Json | undefined;
                phHash = String(first?.hash || '');
              } catch (e) { phHash = ''; tried.push('image upload: ' + String((e as Error).message)); }
            }
            if (!phHash) throw new Error('no placeholder image');
            cr.object_story_spec.link_data.image_hash = phHash;
          }
        }
        const creativeId = cr.creative_id ? String(cr.creative_id)
          : String((await graph(act + '/adcreatives', T.token, cr, 'POST')).id || '');
        if (!creativeId) throw new Error('no creative id returned');
        const adP: Json = { name: ad.name, adset_id: setId, status: inner, creative: { creative_id: creativeId } };
        try {
          await graph(act + '/ads', T.token, { ...adP, conversion_domain: ad.conversion_domain }, 'POST');
        } catch (e) {
          // Домен конверсії має збігатись із посиланням креатива — заготовка
          // веде деінде, тож пробуємо ще раз без нього.
          if (!ad.conversion_domain) throw e;
          tried.push('with conversion domain: ' + String((e as Error).message));
          await graph(act + '/ads', T.token, adP, 'POST');
        }
      };
      let done = -1, last = '';
      const kind = (c: Json) => c.creative_id ? 'existing creative' : c.__lang ? 'languages creative' : c.__media ? 'your ' + (c.__media.kind || 'file') : c.__ph ? 'placeholder (' + c.__ph + ')'
        : c.object_story_id ? 'post' : 'creative description';
      for (let k = 0; k < ad.cands.length && done < 0; k++) {
        try { await mk(ad.cands[k]); done = k; }
        catch (e) { last = String((e as Error).message); tried.push(kind(ad.cands[k]) + ': ' + last); }
      }
      if (done < 0) {
        /* ГОТОВИЙ ДОПИС ЗАМІСТЬ НОВОГО. Додаток токена в режимі розробки
           не може створити новий рекламний допис — ні з картинкою, ні з
           відео: Facebook відмовляє на самому дописі. А вже наявний допис,
           зроблений не цим додатком (опублікований пост Сторінки,
           рекламний допис з Ads Manager), рекламувати можна. Тож
           перебираємо: дописи Сторінки кабінета → наявні креативи
           кабінета, і беремо перший, який Facebook прийняв. Знайдене
           працююче — одразу для наступних оголошень. */
        if (reuse === null) reuse = await reusePool(String(ad.page || ''));
        const order = reuseGood ? [reuseGood, ...reuse.filter(x => x !== reuseGood)] : reuse;
        let n = 0;
        for (const it of order) {
          if (done >= 0 || n >= 8 || Date.now() > deadline) break;
          if (reuseBad.has(it.id)) continue;
          n++;
          try {
            await mk(it.kind === 'post' ? { name: 'Reused post · ' + String(ad.name || '').slice(0, 150), object_story_id: it.id }
                                        : { creative_id: it.id });
            done = 99; reuseGood = it;
          } catch (e) {
            last = String((e as Error).message);
            tried.push((it.kind === 'post' ? 'existing post ' : 'existing creative ') + it.id + ': ' + last);
            if (!/ad set|adset|budget|campaign/i.test(last)) reuseBad.add(it.id);
          }
        }
      }
      // У лог функції — щоб причину відмови Facebook було видно й потім.
      if (tried.length) console.log('fb-launch ad', JSON.stringify({ act: tgt, ad: ad.name, made: done >= 0, tried }));
      if (done < 0) problems.push(label + ': Facebook refused every creative — ' + tried.join(' | ').slice(0, 900));
      else {
        adsMade++;
        if (done === 99) warns.push(label + ': made with an existing ' + (reuseGood && reuseGood.kind === 'post' ? 'post ' : 'creative ')
          + (reuseGood ? reuseGood.id : '') + ' — replace the creative');
        else if (ad.cands[done].__ph) warns.push(label + ': created as a placeholder — replace the creative');
      }
      continue;
    }
    try {
      const cp = creativePlan(ad.creative || {}, same);
      let creativeId = '';
      if (cp.how === 'same') creativeId = String(ad.creative.id);
      else if (cp.how === 'none') throw new Error('its creative has neither a post nor a description to copy');
      else creativeId = String((await graph(act + '/adcreatives', T.token, cp.params, 'POST')).id || '');
      if (!creativeId) throw new Error('no creative id returned');
      await graph(act + '/ads', T.token, {
        name: ad.name, adset_id: setId, status: inner,
        creative: { creative_id: creativeId },
        tracking_specs: ad.tracking_specs, conversion_domain: ad.conversion_domain
      }, 'POST');
      adsMade++;
    } catch (e) {
      problems.push(label + ': ' + String((e as Error).message));
    }
  }
  if (timedOut) problems.push('ran out of time — the rest was not copied');
  if (sample.too_many) problems.push(sample.too_many);

  return reply({
    ok: true, mode: fromSpec ? 'launch' : 'copy', target_account: tgt, campaign_id: newCamp,
    name: newName || String(camp.name || ''), status: 'PAUSED',
    adsets: { made: setsMade, of: Math.min(adsets.length, MAX_ADSETS) },
    ads: { made: adsMade, of: Math.min(ads.length, MAX_ADS) },
    complete: setsMade === Math.min(adsets.length, MAX_ADSETS)
      && adsMade === Math.min(ads.length, MAX_ADS) && !timedOut,
    warnings: warns,
    problems: problems.slice(0, 20)
  });
});
