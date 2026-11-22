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
const FN_VERSION = '2026-11-22.1';
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

/* ── ПЕРЕВІРКА ПЕРЕД ЗАПУСКОМ ──
   Що з потрібного шаблону цільовий кабінет справді бачить. Кожен пункт:
   ok / warn (запустимо, але з підміною чи без чогось) / fail (саме це
   й зламає запуск). Якщо Facebook не віддав список (немає прав на
   читання) — пункт «unknown»: не блокуємо, але й не обіцяємо. */
type Check = { level: 'ok' | 'warn' | 'fail' | 'unknown'; text: string };
type Fix = { pixel?: string };

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

  // Сторінки постів
  const pages = [...new Set(ads.map(a => pageOf(a.creative || {})).filter(Boolean))];
  if (pages.length) {
    const can = await listIds('/act_' + tgt + '/promote_pages', T.token);
    for (const pg of pages) {
      if (!can) checks.push({ level: 'unknown', text: 'page ' + pg + ': could not read which pages this cabinet can use' });
      else if (can.has(pg)) checks.push({ level: 'ok', text: 'page ' + can.get(pg) });
      else checks.push({ level: 'fail', text: 'page ' + pg + ' is not available to this cabinet — add it to the cabinet’s business, '
        + 'or its ads will not be created' });
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
      } else checks.push({ level: 'fail', text: 'pixel ' + px + ' is not shared with this cabinet, and it has no pixel of its own' });
    }
  }
  // Апки
  const apps = [...new Set(adsets.map(a => String(a.promoted_object?.application_id || '')).filter(Boolean))];
  if (apps.length) {
    const can = await listIds('/act_' + tgt + '/advertisable_applications', T.token);
    for (const ap of apps) {
      if (!can) checks.push({ level: 'unknown', text: 'app ' + ap + ': could not read which apps this cabinet can advertise' });
      else if (can.has(ap)) checks.push({ level: 'ok', text: 'app ' + can.get(ap) });
      else checks.push({ level: 'fail', text: 'app ' + ap + ' is not connected to this cabinet — link it in the app’s settings (advertising accounts)' });
    }
  }
  // Власні аудиторії старого кабінета
  const aud = adsets.some(a => (a.targeting?.custom_audiences || []).length || (a.targeting?.excluded_custom_audiences || []).length);
  if (aud) checks.push({ level: 'warn', text: 'custom audiences belong to the old cabinet — they are left out of targeting' });
  return { checks, fix };
}

/* Підготувати знімок під цільовий кабінет: назва, бюджет, гео, підміна
   пікселя, без чужих аудиторій. Сам знімок не міняємо — копія. */
function shape(spec: Json, ov: Json, fix: Fix, same: boolean): { camp: Json; adsets: Json[]; ads: Json[] } {
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
    if (countries.length && a.targeting) a.targeting.geo_locations = { countries };
    if (!same && a.targeting) { delete a.targeting.custom_audiences; delete a.targeting.excluded_custom_audiences; }
    if (fix.pixel && a.promoted_object?.pixel_id) a.promoted_object.pixel_id = fix.pixel;
    return a;
  });
  const ads = (spec.ads || []).map((d: Json) => same ? d : { ...d, tracking_specs: undefined });
  return { camp, adsets, ads };
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

  let shaped: { camp: Json; adsets: Json[]; ads: Json[] };
  let warns: string[] = [];
  if (fromSpec) {
    const pf = await preflight(spec, T, tgt, same);
    if (body.check) return reply({ ok: true, mode: 'check', target_account: tgt, sample, checks: pf.checks });
    const bad = pf.checks.filter(c => c.level === 'fail');
    if (bad.length) return reply({ error: 'not launched: ' + bad.map(c => c.text).join('; '), checks: pf.checks }, 409);
    shaped = shape(spec, body.overrides || {}, pf.fix, same);
    warns = pf.checks.filter(c => c.level === 'warn').map(c => c.text);
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
