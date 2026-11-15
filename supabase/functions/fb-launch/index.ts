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
const FN_VERSION = '2026-11-15.1';
const DEADLINE_MS = 120_000;
const MAX_ADSETS = 20;
const MAX_ADS = 60;

type Json = Record<string, any>;

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

function adsetParams(a: Json, campaignId: string, now: number): Json {
  const p: Json = {
    name: a.name, campaign_id: campaignId, status: 'PAUSED',
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
  // Кінець у минулому Facebook не прийме; майбутній переносимо як є.
  const end = Date.parse(String(a.end_time || ''));
  if (Number.isFinite(end) && end > now) p.end_time = a.end_time;
  return p;
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
  if (!src || !/^\d+$/.test(campaignId)) return reply({ error: 'source_account and campaign_id are required' }, 400);

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

  let S: Awaited<ReturnType<typeof tokenOf>>;
  try { S = await tokenOf(src); } catch (e) { return reply({ error: String((e as Error).message) }, 400); }

  // ── зразок ──
  let camp: Json, adsets: Json[], ads: Json[];
  try {
    camp = await graph('/' + campaignId, S.token, { fields: CAMP_FIELDS });
    if (bare(camp.account_id) !== src)
      return reply({ error: 'this campaign belongs to cabinet ' + bare(camp.account_id) + ', not ' + src }, 400);
    adsets = (await graph('/' + campaignId + '/adsets', S.token, { fields: ADSET_FIELDS, limit: 100 })).data || [];
    ads = (await graph('/' + campaignId + '/ads', S.token, { fields: AD_FIELDS, limit: 200 })).data || [];
  } catch (e) {
    return reply({ error: 'Facebook did not return the campaign: ' + String((e as Error).message) }, 400);
  }

  const same = !!tgt && tgt === src;
  const plan = ads.map(a => ({ id: String(a.id), name: String(a.name || ''), adset: String(a.adset_id || ''),
                               how: creativePlan(a.creative || {}, same).how }));
  const sample = {
    campaign: { id: String(camp.id), name: String(camp.name || ''), objective: String(camp.objective || ''),
                daily_budget: camp.daily_budget || null, lifetime_budget: camp.lifetime_budget || null },
    currency: S.currency,
    adsets: adsets.map(a => ({ id: String(a.id), name: String(a.name || ''),
      daily_budget: a.daily_budget || null, optimization_goal: a.optimization_goal || null,
      promoted_object: a.promoted_object || null })),
    ads: plan,
    too_many: adsets.length > MAX_ADSETS || ads.length > MAX_ADS
      ? 'only the first ' + MAX_ADSETS + ' ad sets and ' + MAX_ADS + ' ads are copied' : undefined
  };

  if (!tgt) return reply({ ok: true, mode: 'read', sample });

  // ── запис ──
  let T: Awaited<ReturnType<typeof tokenOf>>;
  try { T = same ? S : await tokenOf(tgt); } catch (e) { return reply({ error: String((e as Error).message) }, 400); }
  if (T.scopes.length && !T.scopes.includes('ads_management'))
    return reply({ error: 'the token of cabinet ' + tgt + ' has no ads_management — it can only read' }, 400);
  if (S.currency && T.currency && S.currency !== T.currency)
    return reply({ error: 'different currencies (' + S.currency + ' → ' + T.currency
      + '): a budget is a number in the cabinet’s currency, so the copy would get the wrong budget' }, 409);
  if (!adsets.length) return reply({ error: 'the campaign has no ad sets — nothing to copy' }, 400);

  const deadline = Date.now() + DEADLINE_MS;
  const act = '/act_' + tgt;
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
  for (const a of adsets.slice(0, MAX_ADSETS)) {
    if (Date.now() > deadline) { timedOut = true; break; }
    try {
      const id = String((await graph(act + '/adsets', T.token, adsetParams(a, newCamp, Date.now()), 'POST')).id || '');
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
    try {
      const cp = creativePlan(ad.creative || {}, same);
      let creativeId = '';
      if (cp.how === 'same') creativeId = String(ad.creative.id);
      else if (cp.how === 'none') throw new Error('its creative has neither a post nor a description to copy');
      else creativeId = String((await graph(act + '/adcreatives', T.token, cp.params, 'POST')).id || '');
      if (!creativeId) throw new Error('no creative id returned');
      await graph(act + '/ads', T.token, {
        name: ad.name, adset_id: setId, status: 'PAUSED',
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
    ok: true, mode: 'copy', target_account: tgt, campaign_id: newCamp,
    name: newName || String(camp.name || ''), status: 'PAUSED',
    adsets: { made: setsMade, of: Math.min(adsets.length, MAX_ADSETS) },
    ads: { made: adsMade, of: Math.min(ads.length, MAX_ADS) },
    complete: setsMade === Math.min(adsets.length, MAX_ADSETS)
      && adsMade === Math.min(ads.length, MAX_ADS) && !timedOut,
    problems: problems.slice(0, 20)
  });
});
