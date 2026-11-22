/* ═══════════ ЗАПУСК ІЗ CRM: КОПІЯ КАМПАНІЇ ═══════════

   «щоб воно просто робило копію, і я міг міняти назву. Але щоб не
   публікувало».

   Справжній кабінет для перевірки чіпати не можна, тож і функцію, і
   сторінку дістаємо з джерела й проганяємо з підробним Facebook. */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 700) : '')); } };

const FN = fs.readFileSync('supabase/functions/fb-launch/index.ts', 'utf8').replace(/\r\n/g, '\n');
const CD = fs.readFileSync('build/cabdrill.js', 'utf8').replace(/\r\n/g, '\n');
const OUT = fs.readFileSync('index.html', 'utf8');

/* ═══ СЕРВЕРНА ФУНКЦІЯ, ЦІЛКОМ ═══ */
const js = stripTypeScriptTypes(FN);

const CAMP = { id: '900', name: 'MPlay_KG_1', account_id: '111', objective: 'OUTCOME_LEADS', buying_type: 'AUCTION',
  special_ad_categories: [], bid_strategy: 'LOWEST_COST_WITHOUT_CAP', daily_budget: '2000' };
const SETS = [
  { id: 's1', name: 'set 1', optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS',
    targeting: { geo_locations: { countries: ['KG'] } }, promoted_object: { pixel_id: '5', custom_event_type: 'LEAD' },
    end_time: '2020-01-01T00:00:00+0000' },
  { id: 's2', name: 'set 2', optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS',
    targeting: { geo_locations: { countries: ['KG'] } }, promoted_object: { pixel_id: '5', custom_event_type: 'LEAD' } }
];
const ADS = [
  { id: 'a1', name: 'KG_1', adset_id: 's1', creative: { id: 'c1', name: 'cr1', effective_object_story_id: '77_88', url_tags: 'sub1=x' } },
  { id: 'a2', name: 'KG_2', adset_id: 's2', creative: { id: 'c2', object_story_spec: { page_id: '77', video_data: { video_id: '9' } } } },
  { id: 'a3', name: 'KG_3', adset_id: 's2', creative: { id: 'c3' } }
];

async function run({ body, auth = 'Bearer jwt', accounts, failOn = () => '', camp = CAMP, sets = SETS, ads = ADS, method = 'POST', lists = null }) {
  const posts = [];
  let n = 0;
  const accs = accounts || { '111': { token_id: 1, team_name: 'T', currency: 'USD' }, '222': { token_id: 2, team_name: 'T', currency: 'USD' } };
  const fetch = async (url, opt = {}) => {
    const u = new URL(url);
    const J = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
    if (u.pathname.startsWith('/rest/v1/fb_accounts')) {
      const id = (u.searchParams.get('account_id') || '').replace('eq.', '');
      return J(accs[id] ? [Object.assign({ account_id: id }, accs[id])] : []);
    }
    if (u.pathname.startsWith('/rest/v1/fb_tokens')) {
      const id = (u.searchParams.get('id') || '').replace('eq.', '');
      return J([{ token: 'tok' + id, scopes: id === '3' ? ['ads_read'] : ['ads_management'] }]);
    }
    const path = u.pathname.replace('/v21.0', '');
    if (!opt.method) {
      if (path === '/900') return J(camp);
      if (path === '/900/adsets') return J({ data: sets });
      if (path === '/900/ads') return J({ data: ads });
      if (lists && lists[path]) return J({ data: lists[path] });
      return J({ error: { message: 'unknown ' + path } }, 400);
    }
    const p = Object.fromEntries(opt.body.entries());
    const tok = String(opt.headers.Authorization || '');
    posts.push({ path, p, tok });
    const why = failOn(path, p);
    if (why) return J({ error: { message: why, error_user_msg: 'user text' } }, 400);
    return J({ id: 'new' + (++n) });
  };
  let handler;
  const Deno = { env: { get: k => ({ SUPABASE_URL: 'https://x', SUPABASE_ANON_KEY: 'anon', SERVICE_ROLE_KEY: 'svc' }[k] || '') },
                 serve: h => { handler = h; } };
  new Function('Deno', 'fetch', js)(Deno, fetch);
  const req = { method, headers: { get: k => k === 'Authorization' ? auth : '' }, json: async () => body };
  const res = await handler(req);
  return { status: res.status, body: await res.json(), posts };
}

const read = await run({ body: { source_account: 'act_111', campaign_id: '900' } });
ok('без цільового кабінета — лише читання, жодного запису', read.status === 200 && read.body.mode === 'read' && read.posts.length === 0, read);
ok('зразок описує кампанію, адсети й те, як піде кожен креатив', read.body.sample.campaign.name === 'MPlay_KG_1'
  && read.body.sample.adsets.length === 2
  && read.body.sample.ads.map(a => a.how).join(',') === 'post,spec,none', read.body.sample);

const c = await run({ body: { source_account: '111', campaign_id: '900', target_account: '222', name: 'New_KG_2' } });
const P = c.posts;
ok('копія створена', c.status === 200 && c.body.ok && c.body.mode === 'copy' && c.body.campaign_id === 'new1', c.body);
ok('кампанія — з новою назвою, на паузі, у цільовому кабінеті', P[0].path === '/act_222/campaigns'
  && P[0].p.name === 'New_KG_2' && P[0].p.status === 'PAUSED' && P[0].p.objective === 'OUTCOME_LEADS'
  && P[0].p.daily_budget === '2000' && P[0].p.special_ad_categories === '[]', P[0]);
ok('пишемо токеном ЦІЛЬОВОГО кабінета', P.every(x => x.tok === 'Bearer tok2'));
const sets = P.filter(x => x.path === '/act_222/adsets');
ok('обидва адсети — на паузі, під новою кампанією, з таргетингом і пікселем', sets.length === 2
  && sets.every(x => x.p.status === 'PAUSED' && x.p.campaign_id === 'new1')
  && JSON.parse(sets[0].p.targeting).geo_locations.countries[0] === 'KG'
  && JSON.parse(sets[0].p.promoted_object).pixel_id === '5', sets);
ok('кінець у минулому не переноситься', !('end_time' in sets[0].p));
const crs = P.filter(x => x.path === '/act_222/adcreatives');
ok('креатив із постом іде посиланням на пост, з url_tags', crs[0].p.object_story_id === '77_88'
  && crs[0].p.url_tags === 'sub1=x' && !crs[0].p.object_story_spec, crs[0]);
ok('креатив без поста переноситься описом', JSON.parse(crs[1].p.object_story_spec).page_id === '77');
const newAds = P.filter(x => x.path === '/act_222/ads');
ok('оголошення — на паузі, у своїх нових адсетах', newAds.length === 2
  && newAds.every(x => x.p.status === 'PAUSED')
  && newAds[0].p.adset_id === 'new2' && newAds[1].p.adset_id === 'new3' && newAds[0].p.name === 'KG_1', newAds);
ok('оголошення без креатива пропущене з поясненням, решта створена', c.body.ads.made === 2 && c.body.ads.of === 3
  && c.body.complete === false && c.body.problems.some(x => /KG_3.*neither a post nor/.test(x)), c.body);
ok('копія: НІДЕ немає статусу, відмінного від PAUSED', P.filter(x => 'status' in x.p).every(x => x.p.status === 'PAUSED'));
const CP = FN.slice(FN.indexOf('function campaignParams'), FN.indexOf('function adsetParams'));
ok('кампанія — завжди PAUSED, у самому коді', /status: 'PAUSED'/.test(CP) && !/ACTIVE/.test(CP));

const same = await run({ body: { source_account: '111', campaign_id: '900', target_account: '111', name: 'Dup' } });
ok('у тому самому кабінеті креатив береться за ID, без нового', same.posts.filter(x => /adcreatives/.test(x.path)).length === 0
  && JSON.parse(same.posts.filter(x => x.path === '/act_111/ads')[0].p.creative).creative_id === 'c1'
  && same.body.ads.made === 3, same.body);

const noname = await run({ body: { source_account: '111', campaign_id: '900', target_account: '222' } });
ok('без назви береться назва зразка', noname.posts[0].p.name === 'MPlay_KG_1');

const cur = await run({ body: { source_account: '111', campaign_id: '900', target_account: '222' },
  accounts: { '111': { token_id: 1, team_name: 'T', currency: 'USD' }, '222': { token_id: 2, team_name: 'T', currency: 'EUR' } } });
ok('різні валюти — відмова до першого запису', cur.status === 409 && cur.posts.length === 0 && /different currencies/.test(cur.body.error), cur.body);

const alien = await run({ body: { source_account: '111', campaign_id: '900', target_account: '333' } });
ok('чужий цільовий кабінет — відмова, нічого не створено', alien.status === 400 && alien.posts.length === 0
  && /not among yours/.test(alien.body.error), alien.body);
const alienSrc = await run({ body: { source_account: '999', campaign_id: '900', target_account: '222' } });
ok('чужий кабінет-зразок — відмова', alienSrc.status === 400 && alienSrc.posts.length === 0);

const ro = await run({ body: { source_account: '111', campaign_id: '900', target_account: '222' },
  accounts: { '111': { token_id: 1, team_name: 'T', currency: 'USD' }, '222': { token_id: 3, team_name: 'T', currency: 'USD' } } });
ok('читальний токен цільового кабінета — відмова до запису', ro.status === 400 && ro.posts.length === 0 && /ads_management/.test(ro.body.error));

const wrong = await run({ body: { source_account: '111', campaign_id: '900', target_account: '222' },
  camp: Object.assign({}, CAMP, { account_id: '555' }) });
ok('кампанія не з цього кабінета — відмова', wrong.status === 400 && wrong.posts.length === 0 && /belongs to cabinet 555/.test(wrong.body.error));

const campFail = await run({ body: { source_account: '111', campaign_id: '900', target_account: '222' },
  failOn: p => p.endsWith('/campaigns') ? 'no permission' : '' });
ok('кампанія не створилась — помилка Facebook дослівно, далі не йдемо', campFail.status === 400
  && campFail.posts.length === 1 && /no permission — user text/.test(campFail.body.error), campFail.body);

const setFail = await run({ body: { source_account: '111', campaign_id: '900', target_account: '222' },
  failOn: (p, q) => p.endsWith('/adsets') && q.name === 'set 2' ? 'pixel is not shared' : '' });
ok('один адсет не створився — його оголошення пропущені, решта є', setFail.body.ok && setFail.body.adsets.made === 1
  && setFail.body.ads.made === 1 && setFail.body.complete === false
  && setFail.body.problems.some(x => /set 2.*pixel is not shared/.test(x)), setFail.body);

const noAuth = await run({ body: { source_account: '111', campaign_id: '900' }, auth: '' });
ok('без входу — 401', noAuth.status === 401);
const bad = await run({ body: { source_account: '111', campaign_id: 'abc' } });
ok('без ID кампанії — 400', bad.status === 400);
const empty = await run({ body: { source_account: '111', campaign_id: '900', target_account: '222' }, sets: [], ads: [] });
ok('кампанія без адсетів — нічого не створюємо', empty.status === 400 && empty.posts.length === 0);

/* ═══ ШАБЛОНИ: знімок → перевірка → запуск ═══
   «ми пробували, але щось нічого не вийшло» — копія ламалась на
   доступах. Тепер шаблон — збережений знімок, а перед запуском іде
   перевірка того, що цільовий кабінет бачить. */
const snap = await run({ body: { source_account: '111', campaign_id: '900', snapshot: true } });
ok('знімок віддає повний spec і нічого не пише', snap.status === 200 && snap.body.mode === 'snapshot'
  && snap.posts.length === 0 && snap.body.spec.campaign.id === '900' && snap.body.spec.adsets.length === 2
  && snap.body.spec.ads.length === 3 && snap.body.spec.source_account === '111' && snap.body.spec.currency === 'USD', snap.body);
const SPEC = snap.body.spec;
SPEC.adsets[0].targeting.custom_audiences = [{ id: 'aud1' }];

const LISTS_OK = { '/act_222/promote_pages': [{ id: '77', name: 'My Page' }],
  '/act_222/adspixels': [{ id: '5', name: 'Main pixel' }] };
const chk = await run({ body: { spec: SPEC, target_account: '222', check: true }, lists: LISTS_OK });
const lv = t => (chk.body.checks || []).find(c => c.text.includes(t)) || {};
ok('перевірка нічого не створює', chk.status === 200 && chk.body.mode === 'check' && chk.posts.length === 0, chk.body);
ok('Сторінка й піксель — ok, з назвами', lv('My Page').level === 'ok' && lv('Main pixel').level === 'ok', chk.body.checks);
ok('чужі аудиторії — попередження', lv('custom audiences').level === 'warn', chk.body.checks);

const noPage = await run({ body: { spec: SPEC, target_account: '222', check: true },
  lists: { '/act_222/promote_pages': [{ id: '99', name: 'Other' }], '/act_222/adspixels': [{ id: '6', name: 'Own px' }] } });
const lv2 = t => (noPage.body.checks || []).find(c => c.text.includes(t)) || {};
ok('Сторінка недоступна — не блокує: Сторінка кабінета, решта заготовки', lv2('page 77').level === 'warn' && /Other/.test(lv2('page 77').text) && /placeholder/.test(lv2('page 77').text), noPage.body.checks);
ok('піксель не розшарений — підміна власним, warn', lv2('Own px').level === 'warn', noPage.body.checks);

/* «завжди треба створювати оголошення, всерівно що там». */
const DSPEC = JSON.parse(JSON.stringify(SPEC)); DSPEC.adsets.forEach(a => { a.is_dynamic_creative = true; });
const rnd = await run({ body: { spec: DSPEC, target_account: '222' },
  lists: { '/act_222/promote_pages': [{ id: '99', name: 'Their page' }], '/act_222/adspixels': [{ id: '6', name: 'Own px' }] } });
const rcr = rnd.posts.filter(x => x.path === '/act_222/adcreatives').map(x => x.p);
const rads = rnd.posts.filter(x => x.path === '/act_222/ads');
ok('Сторінки шаблону немає — оголошення однаково створені, всі три', rnd.status === 200 && rnd.body.ads.made === 3 && rads.length === 3, rnd.body);
ok('опис креатива — на Сторінці кабінета; решта — заготовки з посиланням', rcr.every(x => JSON.parse(x.object_story_spec).page_id === '99')
  && rcr.filter(x => /^Placeholder/.test(x.name)).length === 2 && rcr.every(x => !x.object_story_id), rcr);
ok('заготовка з картинкою Сторінки', rcr.some(x => /99\/picture/.test(JSON.parse(x.object_story_spec).link_data?.picture || '')), rcr);
ok('динамічний креатив у копії вимкнено, і про це сказано', rnd.posts.filter(x => x.path === '/act_222/adsets').every(x => !('is_dynamic_creative' in x.p))
  && (rnd.body.warnings || []).some(w => /dynamic creative is off/.test(w)), rnd.body.warnings);
ok('про заготовки сказано', (rnd.body.warnings || []).filter(w => /placeholder/.test(w)).length >= 2, rnd.body.warnings);

// Пост відхилено — наступна в черзі заготовка; картинку відхилено — без картинки.
const fb1 = await run({ body: { spec: SPEC, target_account: '222' }, lists: LISTS_OK,
  failOn: (p, q) => p.endsWith('/adcreatives') && (q.object_story_id || /picture/.test(q.object_story_spec || '')) ? 'nope' : '' });
ok('відмова на пості й картинці — оголошення однаково є (заготовка без картинки)', fb1.body.ads.made === 3, fb1.body);
// Відмова на всьому — креатив, що вже є в кабінеті.
const fb2 = await run({ body: { spec: SPEC, target_account: '222' },
  lists: { ...LISTS_OK, '/act_222/adcreatives': [{ id: 'cr9', name: 'old' }] },
  failOn: p => p.endsWith('/adcreatives') ? 'refused' : '' });
const f2ads = fb2.posts.filter(x => x.path === '/act_222/ads');
ok('Facebook відмовив у всіх креативах — береться наявний креатив кабінета', fb2.body.ads.made === 3
  && f2ads.every(x => JSON.parse(x.p.creative).creative_id === 'cr9') && (fb2.body.warnings || []).some(w => /already in this cabinet/.test(w)), fb2.body);
const none0 = await run({ body: { spec: SPEC, target_account: '222' },
  lists: { '/act_222/promote_pages': [], '/act_222/adspixels': [{ id: '6', name: 'Own px' }] } });
ok('без жодної Сторінки — лише кампанія й адсети, з поясненням', none0.body.ok
  && !none0.posts.some(x => /\/ads$/.test(x.path)) && (none0.body.warnings || []).some(w => /no page/.test(w)), none0.body);
const nopx = await run({ body: { spec: SPEC, target_account: '222', check: true },
  lists: { '/act_222/promote_pages': [{ id: '77' }], '/act_222/adspixels': [] } });
ok('кабінет без пікселя — попередження, не блок', !(nopx.body.checks || []).some(c => c.level === 'fail')
  && (nopx.body.checks || []).some(c => c.level === 'warn' && /no pixel/.test(c.text)), nopx.body.checks);
const eurGo = await run({ body: { spec: SPEC, target_account: '222' }, lists: LISTS_OK,
  accounts: { '222': { token_id: 2, team_name: 'T', currency: 'EUR' } } });
ok('інша валюта — єдине, що блокує запуск, до першого запису', eurGo.status === 409 && eurGo.posts.length === 0 && /currency/.test(eurGo.body.error), eurGo.body);

const go = await run({ body: { spec: SPEC, target_account: '222', name: 'TPL_KG', overrides: { daily_budget: 35, countries: ['tj', 'xx1'] } },
  lists: { '/act_222/promote_pages': [{ id: '77' }], '/act_222/adspixels': [{ id: '6', name: 'Own px' }] } });
const GP = go.posts;
ok('шаблон запущено — режим launch, на паузі', go.status === 200 && go.body.mode === 'launch' && GP[0].p.name === 'TPL_KG'
  && GP[0].p.status === 'PAUSED'
  && GP.filter(x => x.path !== '/act_222/campaigns' && 'status' in x.p).every(x => x.p.status === 'ACTIVE'), go.body);
ok('шаблон: на паузі лише кампанія, адсети й оголошення увімкнені', GP.filter(x => /adsets$/.test(x.path)).every(x => x.p.status === 'ACTIVE')
  && GP.filter(x => /\/ads$/.test(x.path)).every(x => x.p.status === 'ACTIVE') && GP.filter(x => /\/ads$/.test(x.path)).length > 0, GP.map(x => [x.path, x.p.status]));
ok('бюджет перекрито (на кампанії, бо бюджет там) — у центах', GP[0].p.daily_budget === '3500', GP[0].p);
const gs = GP.filter(x => x.path === '/act_222/adsets').map(x => ({ t: JSON.parse(x.p.targeting), po: JSON.parse(x.p.promoted_object) }));
ok('гео перекрито для всіх адсетів, сміття відкинуто', gs.every(x => JSON.stringify(x.t.geo_locations) === '{"countries":["TJ"]}'), gs);
ok('чужі аудиторії прибрано з таргетингу', gs.every(x => !x.t.custom_audiences), gs);
ok('піксель підмінено власним пікселем кабінета', gs.every(x => x.po.pixel_id === '6'), gs);
ok('попередження повернуто людині', (go.body.warnings || []).some(w => /Own px/.test(w)), go.body);
ok('сам знімок не зіпсовано підміною', SPEC.adsets[0].promoted_object.pixel_id === '5' && SPEC.adsets[0].targeting.custom_audiences.length === 1);

const fut = new Date(Date.now() + 3 * 864e5).toISOString();
const st = await run({ body: { spec: SPEC, target_account: '222', overrides: { start_time: fut } }, lists: LISTS_OK });
ok('Start date: старт іде в кожен адсет', st.posts.filter(x => x.path === '/act_222/adsets').every(x => x.p.start_time === fut), st.posts.map(x => x.p.start_time));
const st0 = await run({ body: { spec: SPEC, target_account: '222' }, lists: LISTS_OK });
ok('без Start — старту немає', st0.posts.filter(x => x.path === '/act_222/adsets').every(x => !('start_time' in x.p)));
const stPast = await run({ body: { spec: SPEC, target_account: '222', overrides: { start_time: '2020-01-01T00:00:00Z' } }, lists: LISTS_OK });
ok('старт у минулому не відправляється', stPast.posts.filter(x => x.path === '/act_222/adsets').every(x => !('start_time' in x.p)));
const nocbo = JSON.parse(JSON.stringify(SPEC)); delete nocbo.campaign.daily_budget;
const go2 = await run({ body: { spec: nocbo, target_account: '222', overrides: { daily_budget: 12.5 } }, lists: LISTS_OK });
ok('без бюджету на кампанії — бюджет іде в кожен адсет', !('daily_budget' in go2.posts[0].p)
  && go2.posts.filter(x => x.path === '/act_222/adsets').every(x => x.p.daily_budget === '1250'), go2.posts.map(x => x.p.daily_budget));
const eur = await run({ body: { spec: SPEC, target_account: '222', check: true }, lists: LISTS_OK,
  accounts: { '222': { token_id: 2, team_name: 'T', currency: 'EUR' } } });
ok('інша валюта — fail у перевірці', (eur.body.checks || []).some(c => c.level === 'fail' && /currency/.test(c.text)), eur.body);
const unk = await run({ body: { spec: SPEC, target_account: '222', check: true } });
ok('не вдалось прочитати доступи — unknown, не блокує', (unk.body.checks || []).filter(c => c.level === 'unknown').length >= 2
  && !(unk.body.checks || []).some(c => c.level === 'fail'), unk.body.checks);
const noTgt = await run({ body: { spec: SPEC } });
ok('шаблон без цільового кабінета — 400', noTgt.status === 400);

/* ═══ СТОРІНКА ═══ */
const a = CD.indexOf('function cdCopyTargets(srcAcc) {');
const end = CD.lastIndexOf('</script>');
const src = CD.slice(a, end).replace('window.cdCopy =', 'const cdCopy =');
/* Перша версія дописала цей код ПІСЛЯ </script>: сторінка показувала
   його текстом, а кнопка нічого не робила. */
ok('код копіювання лежить усередині <script>', a > 0 && a < end && CD.trimEnd().endsWith('</script>')
  && (CD.match(/<\/script>/g) || []).length === 1);

async function page({ answers, replies }) {
  const log = { calls: [], asked: [], toasts: [] };
  const env = {
    cdAcc: '111',
    cabAll: [{ id: '222', state: 'running', fb: { name: 'Two' } }, { id: '111', state: 'running', fb: { name: 'One' } },
             { id: '333', state: 'banned', fb: { name: 'Dead' } }, { id: '444', state: 'idle' }],
    CAB_LIVE: c => !['banned', 'archived', 'notoken'].includes(c.state),
    SUPABASE_URL: 'https://x',
    sb: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } },
    ask: async o => { log.asked.push(o); return answers.shift(); },
    toast: (t, k) => log.toasts.push({ t: String(t), k }),
    toastStep: () => ({ say: () => {}, done: (t, k) => log.toasts.push({ t: String(t), k }) }),
    fetch: async (_u, o) => {
      const sent = JSON.parse(o.body);
      log.calls.push(sent);
      const r = replies[sent.target_account] || { status: 200, body: { ok: true, complete: true, adsets: { made: 2, of: 2 }, ads: { made: 3, of: 3 }, problems: [] } };
      return { ok: r.status < 400, status: r.status, json: async () => r.body };
    }
  };
  const f = new Function(...Object.keys(env), src + '\nreturn cdCopy;')(...Object.values(env));
  await f('900', encodeURIComponent('MPlay_KG_1'));
  return log;
}

const p1 = await page({ answers: [{ name: 'New name', t0: true, t1: true }, true], replies: {} });
ok('у вікні — назва зразка й лише живі кабінети з Facebook, свій першим', p1.asked[0].fields[0].value === 'MPlay_KG_1'
  && p1.asked[0].fields.length === 3 && /^111 .*this cabinet$/.test(p1.asked[0].fields[1].label)
  && /^222/.test(p1.asked[0].fields[2].label), p1.asked[0].fields);
ok('вікно каже, що все створюється на паузі', /created PAUSED/.test(p1.asked[0].body));
ok('по одному виклику на кабінет, із новою назвою', p1.calls.length === 2
  && p1.calls.map(x => x.target_account).join(',') === '111,222'
  && p1.calls.every(x => x.name === 'New name' && x.campaign_id === '900' && x.source_account === '111'), p1.calls);
ok('підсумок показує кожен кабінет', /✅ 111 — 2\/2 ad sets, 3\/3 ads, paused/.test(p1.asked[1].body)
  && /✅ 222/.test(p1.asked[1].body) && p1.asked[1].only === true, p1.asked[1]);

const p2 = await page({ answers: [{ name: 'X', t0: false, t1: true }, true],
  replies: { '222': { status: 400, body: { error: 'Campaign not created: no permission' } } } });
ok('відмова Facebook — у підсумку дослівно', p2.calls.length === 1 && /⛔ 222 — not copied: Campaign not created: no permission/.test(p2.asked[1].body), p2.asked[1]);
const p3 = await page({ answers: [{ name: 'X', t0: false, t1: false }], replies: {} });
ok('жодного кабінета не вибрано — жодного виклику', p3.calls.length === 0 && p3.toasts.some(t => /Tick at least one/.test(t.t)));
const p4 = await page({ answers: [false], replies: {} });
ok('закрите вікно — жодного виклику', p4.calls.length === 0);
const p5 = await page({ answers: [{ name: 'X', t0: true }, true],
  replies: { '111': { status: 200, body: { ok: true, complete: false, adsets: { made: 1, of: 2 }, ads: { made: 1, of: 3 }, problems: ['ad set “set 2”: pixel is not shared'] } } } });
ok('неповна копія позначена й каже, чого бракує', /⚠ 111 — 1\/2 ad sets, 1\/3 ads/.test(p5.asked[1].body)
  && /pixel is not shared/.test(p5.asked[1].body), p5.asked[1].body);

ok('кнопка стоїть лише на рядку кампанії', /CD_COPY_ON && n\.kind === 'campaign'\s*\? `<button type="button" class="cd-copy"/.test(CD));
/* «давай поки що її видалимо»: кнопки в рядку немає, а копіювання
   лишилось — вмикається одним прапорцем. */
ok('поки що кнопку вимкнено', /const CD_COPY_ON = false;/.test(CD));
ok('і це доїхало в зібраний index.html', /cdCopy = async function/.test(OUT) && /\.cd-copy \{/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
