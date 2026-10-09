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

   ЩЕ ОДНА ЗМІНА — БЮДЖЕТ. {budget:<число>, ids:[один id]} міняє денний
   або довічний бюджет кампанії чи адсета. Вона живе тут, а не в новій
   функції, бо вся обережність уже побудована саме тут: токен людини,
   кабінет мусить бути її, id мусить бути у знімку цього кабінета.
   Заводити це вдруге поруч означало б мати два місця, де можна
   помилитись.

   Три правила, які не з Facebook, а наші:
     • міняємо тільки ТОЙ бюджет, який уже є (денний лишається денним);
     • де бюджету немає — відмовляємо: поставити його означало б
       перевести кабінет між CBO та ABO, а це не «зміна бюджету»;
     • не більше ніж у 10 разів за раз. Друкарська помилка в цьому полі
       витрачає справжні гроші, і зробити її легше за все.

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
/* ═══ ЩО САМЕ МІНЯЄМО І ЧИ МОЖНА — ОДНІЄЮ ФУНКЦІЄЮ ═══

   Винесено з обробника навмисно: тут арифметика про справжні гроші, і
   її треба мати змогу перевірити окремо — без Deno, без Facebook і без
   бази. Нічого не читає й нічого не шле: на вході рядки знімка, на
   виході або відмова, або точний план запису.

   Усі три правила — наші, не Facebook:
     • міняємо той бюджет, який уже є (денний лишається денним);
     • де бюджету немає — відмова (це CBO↔ABO, а не зміна числа);
     • не більше ніж удесятеро за крок (зайвий нуль коштує грошей). */
type BudgetPlan =
  | { error: string }
  | { id: string; name: string; kind: string; field: string;
      curMinor: number; newMinor: number; same: boolean };

export function budgetPlan(snap: Json[], id: string, want: number): BudgetPlan {
  const pick = (d: unknown, l: unknown) => {
    const dn = d === null || d === undefined || d === '' ? null : Number(d);
    const ln = l === null || l === undefined || l === '' ? null : Number(l);
    if (Number.isFinite(dn) && (dn as number) > 0) return { v: dn as number, f: 'daily_budget' };
    if (Number.isFinite(ln) && (ln as number) > 0) return { v: ln as number, f: 'lifetime_budget' };
    return null;
  };
  const asCamp = snap.find(r => String(r.campaign_id || '') === id);
  const asSet  = snap.find(r => String(r.adset_id || '') === id);

  let kind = '', name = '', b: { v: number; f: string } | null = null;
  if (asCamp) {
    kind = 'campaign'; name = String(asCamp.campaign_name || id);
    b = pick(asCamp.campaign_daily_budget, asCamp.campaign_lifetime_budget);
  } else if (asSet) {
    kind = 'ad set'; name = String(asSet.adset_name || id);
    b = pick(asSet.adset_daily_budget, asSet.adset_lifetime_budget);
  } else {
    return { error: id + ': not a campaign or ad set in the snapshot of this cabinet — '
      + 'press Sync now, then try again' };
  }
  if (!b) return { error: 'this ' + kind + ' has no budget of its own — '
    + 'the budget sits on the other level (CBO/ABO). Change it there, '
    + 'or set it up in Ads Manager.' };

  const curMinor = b.v;
  const newMinor = Math.round(want * 100);
  if (newMinor < 100) return { error:
    'the smallest budget this will set is 1.00 — Facebook has its own minimum per currency '
    + 'and will refuse anything below it anyway' };
  if (newMinor > curMinor * 10 || newMinor * 10 < curMinor) return { error:
    'that is more than a tenfold change in one step (now ' + (curMinor / 100).toFixed(2)
    + ', asked ' + (newMinor / 100).toFixed(2) + '). If you mean it, do it in two steps.' };

  return { id, name, kind, field: b.f, curMinor, newMinor, same: newMinor === curMinor };
}

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
  /* Бюджет у ТИХ САМИХ одиницях, що й на екрані (долари, не центи):
     сторінка показує budget/100, тож назад множимо на 100. Для валют
     без копійок (JPY, KRW) це було б не так — таких кабінетів тут
     немає, і коли зʼявляться, перерахунок доведеться брати з валюти
     кабінета, а не вважати сотню константою. */
  let wantBudget: number | null = null;
  try {
    const body = await req.json();
    accountId = String(body?.account_id || '').replace(/\D/g, '');
    turnOn = body?.on === true;
    if (body?.budget !== undefined && body?.budget !== null) {
      const b = Number(body.budget);
      wantBudget = Number.isFinite(b) ? b : NaN;
    }
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
  /* Бюджет — завжди про ОДИН обʼєкт. Пакетна зміна бюджету не існує як
     осмислена дія: кампанії різні, і одне число на всіх — це не те, що
     хтось справді хотів. Перевіряємо тут, до будь-якого походу кудись. */
  if (wantBudget !== null) {
    if (!Number.isFinite(wantBudget) || wantBudget <= 0) return reply({
      error: 'budget must be a positive number' }, 400);
    if (wantIds.length !== 1) return reply({
      error: 'changing a budget takes exactly one id' }, 400);
    if (turnOn) return reply({
      error: 'budget and switching on are separate actions — send them separately' }, 400);
  }

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

  /* ═══════════ ЗМІНА БЮДЖЕТУ ═══════════

     Окрема гілка, яка завершується сама: нижче починається зупинка, і
     змішувати їх не можна — там інша перевірка id і інший запис у
     журнал.

     Усе, що потрібно знати про обʼєкт, уже лежить у знімку цього
     кабінета: і те, що він наш, і на якому він рівні, і який у нього
     бюджет зараз. Тому в Facebook іде рівно один запис — і лише після
     того, як усі «а чи можна» відповіли «так». */
  if (wantBudget !== null) {
    const id = wantIds[0];
    let snap: Json[] = [];
    try {
      snap = await pgGet(base, hdr, 'fb_ad_today'
        + '?select=ad_id,name,adset_id,adset_name,campaign_id,campaign_name,'
        + 'campaign_daily_budget,campaign_lifetime_budget,'
        + 'adset_daily_budget,adset_lifetime_budget'
        + '&created_by=eq.' + encodeURIComponent(me.id)
        + '&account_id=eq.' + encodeURIComponent(accountId));
    } catch (e) {
      const msg = (e as Error).message;
      /* Колонок бюджету може не бути — база старіша за сторінку. Це не
         те саме, що «немає знімка», і лікується іншим, тож і кажемо
         інше. */
      return reply({ error: /budget/i.test(msg)
        ? 'this database has no budget columns in fb_ad_today yet — run block 1 of FB_RULES.sql'
        : /fb_ad_today|does not exist|42P01/i.test(msg)
        ? 'the snapshot table does not exist yet — run block 1 of FB_RULES.sql'
        : msg }, 400);
    }

    const plan = budgetPlan(snap, id, wantBudget);
    if ('error' in plan) return reply({ error: plan.error }, 400);
    const { name, kind, field, curMinor, newMinor } = plan;
    if (plan.same) return reply({ budget: true, changed: false, id, name, kind,
      field, was: curMinor / 100, now: curMinor / 100, note: 'already that much' });

    const res = await fetch(GRAPH + '/' + encodeURIComponent(id), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: tok.token, [field]: String(newMinor) }).toString()
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return reply({
      error: 'Facebook refused: ' + String(j?.error?.message || 'HTTP ' + res.status) }, 502);

    /* Журнал — тим самим шляхом, що й зупинка: через тиждень питання
       «хто це поміняв» виникає рівно так само. */
    if (acc.team_name) {
      try {
        await fetch(base + '/rest/v1/account_events', {
          method: 'POST',
          headers: { ...hdr, Prefer: 'return=minimal' },
          body: JSON.stringify([{
            team_name: acc.team_name, account_id: accountId,
            kind: 'pause', to_state: 'budget',
            note: kind + ' "' + name + '" ' + field.replace('_budget', '')
                + ' budget ' + (curMinor / 100).toFixed(2) + ' → ' + (newMinor / 100).toFixed(2)
                + (me.email ? ' by ' + me.email : ''),
            source: 'fb'
          }])
        });
      } catch (_e) { /* журнал — надбудова */ }
    }

    return reply({ budget: true, changed: true, id, name, kind, field,
                   was: curMinor / 100, now: newMinor / 100 });
  }

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
