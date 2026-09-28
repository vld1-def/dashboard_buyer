/* ═══════════ ЗУПИНИТИ ВСІ КАМПАНІЇ КАБІНЕТА ═══════════

   Єдине місце в проєкті, яке щось МІНЯЄ у Facebook. Усе інше читає.
   Через це тут інші правила, ніж у fb-sync, і окрема функція — не
   заради охайності, а щоб їх не переплутати.

   ЧОМУ НЕ ЧАСТИНА fb-sync. У тієї є вхід за спільним секретом, яким
   щогодини ходить розклад. Дія, яка зупиняє рекламу, не повинна бути
   досяжною з того входу навіть теоретично. Тут його немає взагалі:
   єдиний спосіб покликати — прийти з токеном людини, і функція сама
   питає Supabase Auth, хто це.

   ЩО САМЕ ЗУПИНЯЄМО. Кампанії, і тільки їх. Пауза на кампанії глушить
   усе, що під нею, — адсети й оголошення чіпати не треба. На кабінеті
   з десятьма кампаніями це десять записів замість двохсот.

   ЗВОРОТНА ДІЯ Є — АЛЕ ТІЛЬКИ ТОЧКОВА. Спершу її тут не було зовсім,
   і причина була правильна: одна кнопка «увімкнути все» підняла б те,
   що глушили спеціально. Ця причина нікуди не зникла, тому ввімкнути
   можна рівно те, що назвали поіменно — {on:true, ids:[…]}. Без ids
   увімкнення не буває взагалі: запит без них — це помилка, а не
   «увімкни все».

   Вимкнення без ids, навпаки, лишається: «зупинити кабінет» — дія
   осмислена й потрібна саме тоді, коли розбиратись нема коли.

   Розгортання:
     supabase functions deploy fb-pause
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';
// Скільки кампаній беремо за раз. Стеля пакета Graph — 50.
const BATCH_MAX = 50;
const LIST_LIMIT = 500;
const DEADLINE_MS = 110_000;

type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

/* ── хто нас кличе ──
   Тут це не формальність, а вся авторизація: далі ми ходимо ключем
   сервісної ролі, і межі ставить рівно цей uid. Повірити тілу запиту
   означало б дати будь-кому зупиняти чужі кабінети. */
async function whoAmI(base: string, anon: string, auth: string):
    Promise<{ id: string; email: string }> {
  const res = await fetch(base + '/auth/v1/user', {
    headers: { apikey: anon, Authorization: auth }
  });
  if (!res.ok) return { id: '', email: '' };
  const u = await res.json().catch(() => ({}));
  return { id: String(u?.id || ''), email: String(u?.email || '') };
}

async function pgGet(base: string, hdr: Json, path: string): Promise<Json[]> {
  const res = await fetch(base + '/rest/v1/' + path, { headers: hdr });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
  return await res.json();
}

/* Список того, що ЗАРАЗ крутиться. effective_status, а не status:
   кампанія може бути ACTIVE сама по собі, але вже нічого не показувати
   через архів чи проблему — таку зупиняти немає сенсу. */
async function activeCampaigns(token: string, actId: string): Promise<Json[]> {
  const body = new URLSearchParams({
    access_token: token, method: 'GET',
    fields: 'id,name',
    effective_status: '["ACTIVE"]',
    limit: String(LIST_LIMIT)
  });
  const res = await fetch(GRAPH + '/act_' + actId + '/campaigns', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const j = await res.json().catch(() => ({}));
  if (j && j.error) throw new Error(j.error.message || 'Graph API error');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return Array.isArray(j.data) ? j.data : [];
}

/* Пакетне перемикання. Кожен підзапит незалежний, і одна невдача не
   валить решти — саме тому часткові невдачі тут не виняток, а
   очікуваний результат, який треба чесно порахувати.

   ACTIVE, а не RESUMED чи щось подібне: у Facebook вмикання — це той
   самий запис status, просто з іншим значенням. Батьків він не чіпає,
   тож увімкнене оголошення у вимкненій кампанії так і лишиться
   невидимим — і це правильно: ми ввімкнули рівно те, що просили. */
async function pauseBatch(token: string, ids: string[], on = false):
    Promise<{ ok: string[]; bad: { id: string; why: string }[] }> {
  const want = on ? 'status=ACTIVE' : 'status=PAUSED';
  const batch = ids.map(id => ({ method: 'POST', relative_url: id, body: want }));
  const res = await fetch(GRAPH + '/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: token, include_headers: 'false', batch: JSON.stringify(batch)
    }).toString()
  });
  const j = await res.json().catch(() => null);
  // Помилка на рівні всього пакета (протух токен, ліміт) приходить не
  // масивом, а звичайним {error:…}. Тоді не зупинилось НІЧОГО.
  if (j && !Array.isArray(j) && j.error) throw new Error(j.error.message || 'Graph API error');
  if (!Array.isArray(j)) throw new Error('batch: unexpected response');

  const ok: string[] = [];
  const bad: { id: string; why: string }[] = [];
  j.forEach((part: Json | null, i: number) => {
    const id = ids[i];
    if (!part) { bad.push({ id, why: 'Facebook did not answer in time' }); return; }
    let body: Json = {};
    try { body = JSON.parse(part.body || '{}'); } catch (_e) { /* байдуже */ }
    if (Number(part.code) === 200 && body?.success !== false) ok.push(id);
    else bad.push({ id, why: String(body?.error?.message || 'HTTP ' + part.code) });
  });
  return { ok, bad };
}

Deno.serve(async (req) => {
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
  if (!svc) return reply({ error: 'SERVICE_ROLE_KEY is not set in the function secrets' }, 400);

  const auth = req.headers.get('Authorization') || '';
  if (!auth) return reply({ error: 'no authorization header' }, 401);
  const me = await whoAmI(base, anon, auth);
  if (!me.id) return reply({ error: 'could not verify who is calling' }, 401);

  let accountId = '';
  /* ids — точкова зупинка: одна кампанія, адсет чи оголошення, вибрані
     руками в розборі кабінета. Без них функція працює як раніше й
     глушить кабінет цілком.

     Стеля на 200 — щоб «вимкни це» не перетворилось на «вимкни все»
     через випадково зібраний масив. */
  let wantIds: string[] = [];
  let turnOn = false;
  try {
    const body = await req.json();
    accountId = String(body?.account_id || '').replace(/\D/g, '');
    turnOn = body?.on === true;
    wantIds = (Array.isArray(body?.ids) ? body.ids : [])
      .map((x: unknown) => String(x).trim())
      .filter((x: string) => /^\d+$/.test(x))
      .slice(0, 200);
  } catch (_e) { /* тіла може не бути */ }
  if (!accountId) return reply({ error: 'account_id is required' }, 400);
  /* Увімкнення без списку — не «увімкни все», а помилка. Перевіряємо
     тут, до будь-якого походу в Facebook і до будь-якої перевірки прав:
     запит, якого не існує, не повинен навіть починати роботу. */
  if (turnOn && !wantIds.length) return reply({
    error: 'switching on needs an explicit list: there is no "turn everything back on"' }, 400);

  const hdr: Json = { apikey: svc, Authorization: 'Bearer ' + svc,
                      'content-type': 'application/json' };

  /* Кабінет мусить бути ТВІЙ. Це і є перевірка прав: ключ сервісної ролі
     бачить усе, тож межу ставить цей фільтр по перевіреному uid, а не
     те, що попросили в тілі запиту. */
  const accs = await pgGet(base, hdr,
    'fb_accounts?select=account_id,name,team_name,token_id'
    + '&created_by=eq.' + encodeURIComponent(me.id)
    + '&account_id=eq.' + encodeURIComponent(accountId));
  const acc = accs[0];
  if (!acc) return reply({ error: 'no such ad account among yours — run Sync now first' }, 404);
  /* Токен видалили в налаштуваннях — і зв'язок обірвався сам: у базі
     token_id стоїть «при видаленні обнулити». Дані кабінета лишились,
     на екрані він виглядає живим, а піти з ним у Facebook нема з чим.

     Найчастіше це лікує Sync now: він переписує зв'язок для всіх
     кабінетів, які бачить нинішній токен. Тому кажемо це прямо, а не
     лишаємо людину з констатацією. */
  if (!acc.token_id) return reply({
    error: 'no token is linked to this cabinet any more — press Sync now on the Cabinets tab. '
         + 'If the token was deleted, add it again in Settings first.' }, 400);

  const toks = await pgGet(base, hdr,
    'fb_tokens?select=id,label,token,scopes'
    + '&id=eq.' + Number(acc.token_id)
    + '&created_by=eq.' + encodeURIComponent(me.id));
  const tok = toks[0];
  if (!tok) return reply({ error: 'the token this cabinet came from is gone' }, 400);

  /* Права перевіряємо ДО першого запиту, а не по факту відмови. Інакше
     половина кампаній зупинилась би, а половина ні, і розбиратись у
     цьому довелось би вручну. */
  const scopes: string[] = Array.isArray(tok.scopes) ? tok.scopes : [];
  if (!scopes.includes('ads_management')) return reply({
    error: 'the token "' + tok.label + '" can only read: it has no ads_management. '
         + 'Add that permission to the system user and re-add the token.' }, 400);

  let live: Json[];
  if (wantIds.length) {
    /* ЧУЖОГО НЕ ЧІПАЄМО. Номер кампанії — публічне число, і повірити
       тілу запиту означало б дати будь-кому глушити будь-що. Тому
       звіряємо зі знімком ЦЬОГО кабінета під ЦИМ uid: вимкнути можна
       рівно те, що ми самі бачили всередині твого кабінета.

       Побічно це ще й страхує від помилки в назві: id, якого в знімку
       немає, до Facebook навіть не поїде. */
    let snap: Json[] = [];
    try {
      snap = await pgGet(base, hdr, 'fb_ad_today'
        + '?select=ad_id,name,adset_id,adset_name,campaign_id,campaign_name'
        + '&created_by=eq.' + encodeURIComponent(me.id)
        + '&account_id=eq.' + encodeURIComponent(accountId));
    } catch (e) {
      const msg = (e as Error).message;
      return reply({ error: /fb_ad_today|does not exist|42P01/i.test(msg)
        ? 'the snapshot table does not exist yet — run block 1 of FB_RULES.sql'
        : msg }, 400);
    }
    const names = new Map<string, string>();
    snap.forEach(r => {
      const put = (id: unknown, nm: unknown) => {
        const k = String(id || '');
        if (k && !names.has(k)) names.set(k, String(nm || k));
      };
      put(r.ad_id, r.name);
      put(r.adset_id, r.adset_name);
      put(r.campaign_id, r.campaign_name);
    });
    const allowed = wantIds.filter(id => names.has(id));
    const refused = wantIds.filter(id => !names.has(id));
    if (!allowed.length) return reply({ paused: 0, failed: 0, total: 0,
      problems: refused.slice(0, 5).map(id => id + ': not in the snapshot of this cabinet'),
      note: 'nothing to switch ' + (turnOn ? 'on' : 'off')
          + ': press Sync now, then try again' }, 400);
    live = allowed.map(id => ({ id, name: names.get(id) }));
  } else {
  try {
    live = await activeCampaigns(tok.token, accountId);
  } catch (e) {
    return reply({ error: 'could not list campaigns: ' + (e as Error).message }, 502);
  }
  if (!live.length) return reply({ paused: 0, failed: 0, total: 0,
    note: 'nothing was running in this cabinet' });
  }

  const deadline = Date.now() + DEADLINE_MS;
  const done: string[] = [];
  const bad: { id: string; why: string }[] = [];
  let stopped = '';

  for (let i = 0; i < live.length; i += BATCH_MAX) {
    if (Date.now() > deadline) { stopped = 'ran out of time'; break; }
    const ids = live.slice(i, i + BATCH_MAX).map(c => String(c.id));
    try {
      const r = await pauseBatch(tok.token, ids, turnOn);
      done.push(...r.ok);
      bad.push(...r.bad);
    } catch (e) {
      // Пакет не пройшов цілком — ці кампанії НЕ зупинені, і мовчати
      // про це не можна: людина щойно натиснула кнопку й вважає, що
      // кабінет стоїть.
      stopped = (e as Error).message;
      ids.forEach(id => bad.push({ id, why: stopped }));
      break;
    }
  }

  const byId: Record<string, string> = {};
  live.forEach(c => byId[String(c.id)] = String(c.name || c.id));

  /* Журнал. Зупинка парку — не те, про що через тиждень мають гадати
     «а хто це зробив». Пишемо окремим kind: стрічка станів рахує лише
     kind='state', тож ця подія її не збиває. Таблиці може не бути —
     тоді просто не пишемо, це не привід завалити саму зупинку. */
  if (done.length && acc.team_name) {
    try {
      await fetch(base + '/rest/v1/account_events', {
        method: 'POST',
        headers: { ...hdr, Prefer: 'return=minimal' },
        body: JSON.stringify([{
          team_name: acc.team_name, account_id: accountId,
          kind: 'pause', to_state: turnOn ? 'resumed' : 'paused',
          note: done.length + (turnOn ? ' item(s) switched on by hand'
                : wantIds.length ? ' item(s) switched off by hand'
                                 : ' campaign(s) paused')
              + (me.email ? ' by ' + me.email : '')
              + (bad.length ? ', ' + bad.length + ' failed' : ''),
          source: 'fb'
        }])
      });
    } catch (_e) { /* журнал — надбудова */ }
  }

  return reply({
    // Ім'я поля лишаємо paused — це «скільки перемкнули», і міняти його
    // означало б зламати те, що вже вміє читати відповідь. Що саме
    // зроблено, каже on.
    on: turnOn,
    paused: done.length,
    failed: bad.length,
    total: live.length,
    stopped,
    // Показуємо назви, а не номери: «Aurora Bet MX не зупинилась» —
    // це повідомлення, з яким можна щось зробити, на відміну від
    // «23847612093 не зупинилась».
    problems: bad.slice(0, 10).map(b => (byId[b.id] || b.id) + ': ' + b.why)
  });
}
