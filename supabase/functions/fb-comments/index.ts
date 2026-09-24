/* ═══════════ КОМЕНТАРІ ПІД ОГОЛОШЕННЯМИ ═══════════

   Друге місце в проєкті, яке щось МІНЯЄ поза дашбордом, і, як і
   fb-pause, воно живе окремо саме тому.

   РОЗКЛАД Є, АЛЕ НЕ ДЛЯ ВСЬОГО. Вхід за спільним секретом веде рівно
   до однієї дії — scan: обійти кабінети, знайти нові коментарі,
   СХОВАТИ їх і написати в Telegram. Видалення з розкладу недосяжне
   взагалі, і це не обережність заради обережності:

     hide   оборотне. Помилились — зняли, і коментар повернувся на
            місце. Автор навіть не знає, що його ховали, тож і писати
            зі злості вдруге не піде.
     delete не оборотне ніяк. Під оголошенням лежить не лише спам: там
            питання людей, які збирались купити, і відповіді самої
            команди. Автоматика, яка видаляє, одного ранку зітре саме
            те, заради чого коментарі й читають, а дізнатись про це
            буде нізвідки.

   Тому ховає машина, а видаляє людина. Коли знадобиться автоматичне
   видалення — воно має ходити за ПРАВИЛАМИ (слова, посилання), і
   правила ці пишеш ти, а не я вгадую.

   ДВА РІВНІ ЖОРСТКОСТІ, і плутати їх не варто:
     hide   — коментар бачить лише його автор. Оборотно.
     delete — назавжди. Не оборотно ніяк.
   Через це за замовчуванням у дашборді пропонується сховати.

   ЧИЙ ТОКЕН. Оголошення живуть у кабінеті, а коментарі — під постом
   СТОРІНКИ, і це різні сутності з різними правами. Токен системного
   користувача сам по собі коментаря не видалить: потрібен токен самої
   Сторінки. Його дає Graph — /{page_id}?fields=access_token — але лише
   якщо системному користувачеві цю Сторінку ВИДАЛИ в Business Manager
   із задачею модерації, а в токені є pages_read_engagement і
   pages_manage_engagement.

   Якщо чогось із цього немає, функція каже саме це, а не «не вдалося».

   Розгортання:
     supabase functions deploy fb-comments
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';

// Скільки оголошень переглядаємо й скільки коментарів беремо з посту.
const ADS_LIMIT = 250;
const PER_POST = 50;

/* Скільки постів обходимо за один виклик. Одне оголошення — один пост,
   але різні оголошення часто крутять ОДИН пост, тож постів зазвичай
   помітно менше, ніж оголошень. */
const POSTS_MAX = 25;

const DEADLINE_MS = 100_000;

/* Скільки роботи беремо за один прогін розкладу. Обхід коментарів
   коштує дорожче за все інше в проєкті: запит на кабінет заради списку
   оголошень, запит на Сторінку заради токена, запит на кожен пост — і
   все це помножене на парк.

   Тому беремо не «всіх», а тих, кого найдовше не дивились: порядок за
   comments_scanned_at. Кожен прогін просувається по колу, і за кілька
   годин обходить парк цілком, не впираючись у дедлайн і не ганяючи по
   тих самих кабінетах. */
const SCAN_ACCOUNTS = 12;
const SCAN_POSTS = 8;
const SCAN_PER_POST = 25;

/* Спільний секрет звіряємо по всій довжині, а не до першої розбіжності. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
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

/* Токен у тілі, не в адресі: рядки запиту осідають у логах проксі та в
   Referer. method підказує Graph, що ми насправді хочемо: він приймає
   GET і DELETE, загорнуті в POST. */
async function graph(path: string, token: string, params: Json,
                     method: 'GET' | 'POST' | 'DELETE' = 'GET'): Promise<Json> {
  const body = new URLSearchParams({ access_token: token });
  if (method !== 'POST') body.set('method', method.toLowerCase());
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') body.set(k, String(v));
  const res = await fetch(GRAPH + path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const j = await res.json().catch(() => ({}));
  if (j && j.error) throw new Error(String(j.error.error_user_msg || j.error.message || 'Graph API error'));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return j;
}

/* ── які пости взагалі наші ──

   Це не допоміжний крок, а вся авторизація на рівні Facebook. Токен
   системного користувача бачить усі Сторінки бізнесу; якби ми просто
   брали page_id з тіла запиту, будь-хто зі входом у дашборд видаляв би
   коментарі під чим завгодно. Тому список постів будується З ОГОЛОШЕНЬ
   ЦЬОГО кабінета, і все, чого в ньому немає, ми не чіпаємо.

   effective_object_story_id має вигляд {page_id}_{post_id}. Оголошення
   без нього — це ті, що ведуть не на пост Сторінки (наприклад, чистий
   лідформ), і коментарів у них немає за визначенням. */
type Post = { names: string[]; live: boolean };

async function ourPosts(token: string, actId: string): Promise<Map<string, Post>> {
  const j = await graph('/act_' + actId + '/ads', token, {
    fields: 'name,effective_status,creative{effective_object_story_id}',
    limit: ADS_LIMIT
  });
  const posts = new Map<string, Post>();
  (Array.isArray(j.data) ? j.data : []).forEach((ad: Json) => {
    const story = String(ad?.creative?.effective_object_story_id || '');
    if (!story.includes('_')) return;
    const live = String(ad.effective_status) === 'ACTIVE';
    const name = String(ad.name || ad.id || '');
    const have = posts.get(story);
    if (!have) { posts.set(story, { names: [name], live }); return; }
    if (!have.names.includes(name)) have.names.push(name);
    have.live = have.live || live;
  });

  /* Пости, під якими зараз крутиться оголошення — наперед.

     Без цього порядок задавав Graph, тобто він був випадковий, а ми
     встигаємо обійти не всі. У кабінеті з сотнею постів це означало б,
     що живі — саме ті, під якими спам і збирається — могли не потрапити
     в перегляд ЖОДНОГО разу, скільки не натискай. */
  return new Map([...posts.entries()].sort(
    (a, b) => Number(b[1].live) - Number(a[1].live)));
}

/* Токен Сторінки. Системний користувач має бачити цю Сторінку як актив
   бізнесу — інакше Graph просто не покладе access_token у відповідь, і
   це не помилка, а відповідь «не твоє».

   Кеш передається ЗВЕРХУ й живе рівно один запит. Спокуса зробити його
   модульним велика — той самий ізолят обслуговує всі виклики, і токен
   Сторінки не міняється щохвилини. Але тоді токен, виданий системному
   користувачеві однієї людини, лежав би там, де до нього дотягнеться
   запит іншої: ізолят спільний, а права — ні. */
async function pageToken(userToken: string, pageId: string,
                         cache: Map<string, { token: string; name: string }>):
    Promise<{ token: string; name: string }> {
  const have = cache.get(pageId);
  if (have) return have;
  const j = await graph('/' + pageId, userToken, { fields: 'access_token,name' });
  const got = { token: String(j?.access_token || ''), name: String(j?.name || pageId) };
  if (!got.token) throw new Error(
    'no page token for "' + got.name + '" (' + pageId + '). In Business Manager, add this '
    + 'Page to the system user with a moderation task, and make sure the token has '
    + 'pages_read_engagement and pages_manage_engagement.');
  cache.set(pageId, got);
  return got;
}

const pageOf = (storyId: string) => storyId.split('_')[0] || '';

/* Завдання на Сторінці, яких достатньо, щоб чіпати коментарі. Facebook
   віддає їх списком у /me/accounts; MODERATE — саме те, що дає ховати
   й видаляти, MANAGE включає його в себе. */
const MOD_TASKS = ['MODERATE', 'MANAGE'];

/* ── чому Facebook відмовив ──

   Помилка #10 приходить стіною з трьох посилань на App Review і
   виглядає як вирок застосунку. Насправді в дев'яти випадках із десяти
   це інше: Сторінку просто не видали системному користувачеві, і для
   Facebook він тоді сторонній — звідси й пропозиція оформити «Page
   Public Content Access», тобто доступ до ЧУЖИХ сторінок.

   Ми знаємо більше за нього: у нас є список Сторінок, які системний
   користувач справді має. Тому відповідаємо по суті, а не переказуємо
   посилання. */
function whyDenied(pageId: string, name: string,
                   mine: Map<string, { name: string; tasks: string[] }>,
                   listFailed: string): string {
  const has = mine.get(pageId);
  if (listFailed) return 'Facebook will not even list the Pages of this system user ('
    + listFailed + '). That is an app-level permission: pages_show_list and '
    + 'pages_read_engagement have to be granted to the app the token belongs to.';
  if (!has) return 'Page ' + (name || pageId) + ' is not assigned to this system user. '
    + 'Business Manager \u2192 System users \u2192 your user \u2192 Add assets \u2192 Pages, '
    + 'and give it the Moderate content task.';
  if (!has.tasks.some(t => MOD_TASKS.includes(t))) return 'Page "' + has.name
    + '" is assigned to this system user, but only with: ' + (has.tasks.join(', ') || 'no task')
    + '. Moderating comments needs the Moderate content task — change it in Business Manager.';
  return '';
}

/* Сторінки, які системний користувач має, і з якими завданнями. Один
   запит на весь виклик: це й діагноз, і відповідь на питання «а чому
   не працює». */
async function myPages(token: string):
    Promise<{ mine: Map<string, { name: string; tasks: string[] }>; failed: string }> {
  const mine = new Map<string, { name: string; tasks: string[] }>();
  try {
    const j = await graph('/me/accounts', token, { fields: 'id,name,tasks', limit: 200 });
    (Array.isArray(j.data) ? j.data : []).forEach((x: Json) => mine.set(String(x.id), {
      name: String(x.name || x.id),
      tasks: Array.isArray(x.tasks) ? x.tasks.map(String) : []
    }));
    return { mine, failed: '' };
  } catch (e) {
    return { mine, failed: (e as Error).message };
  }
}

/* ═════ ХТО ПРО ЦЕ ДІЗНАЄТЬСЯ ═════

   Новий коментар під оголошенням — новина того ж рівня, що й зміна
   стану кабінета, і ходить вона тим самим маршрутом: секрет у
   функції, адресат у tg_links, повідомлення тільки власнику кабінета.

   Текст коментаря кладемо в повідомлення цілком (у межах розумного):
   рішення «лишити чи видалити» приймається саме по тексту, і змушувати
   заради нього відкривати дашборд означало б, що сповіщення не
   працює. */

const TG_LIMIT = 3900;
const TG_MAX = 12;

async function tgPost(token: string, chat: string, text: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // Без parse_mode навмисно: у коментарях трапляється будь-що, а
      // розмітка Telegram спотикається й відповідає 400.
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
    });
    return res.ok;
  } catch (_e) { return false; }
}

/* hidden  — чи коментар ЗАРАЗ не на людях (байдуже, хто його сховав);
   byUs    — чи це зробили ми саме цього разу.
   Перше вирішує, яку позначку ставити рядку, друге — що писати в
   заголовку. Звести їх в одне поле означало б збрехати в одному з двох
   місць: або назвати своїм те, що сховали раніше, або показати як
   відкрите те, що вже приховане. */
type Found = { owner: string; cab: string; ad: string; from: string;
               text: string; hidden: boolean; byUs: boolean };

function tgText(list: Found[]): string {
  const hid = list.filter(f => f.byUs).length;
  const head = list.length + ' new comment(s)'
    + (hid ? ', ' + hid + ' hidden automatically' : '') + '\n\n';
  const one = (f: Found) => (f.hidden ? '\u{1F648} ' : '\u{1F4AC} ')
    + f.cab + (f.ad ? ' \u00b7 ' + f.ad : '') + '\n'
    + (f.from ? f.from + ': ' : '')
    + (f.text.length > 300 ? f.text.slice(0, 300) + '\u2026' : f.text || '(no text)');
  const lines = list.slice(0, TG_MAX).map(one);
  const tail = () => {
    const rest = list.length - lines.length;
    return rest > 0 ? '\n\n\u2026and ' + rest + ' more. The rest is in the dashboard.' : '';
  };
  while (lines.length > 1 && (head + lines.join('\n\n') + tail()).length > TG_LIMIT) lines.pop();
  return head + lines.join('\n\n') + tail();
}

async function tgSend(base: string, hdr: Json, found: Found[]): Promise<string> {
  if (!found.length) return 'nothing new';
  const token = Deno.env.get('TG_BOT_TOKEN') || '';
  if (!token) return 'not configured';

  const byOwner = new Map<string, Found[]>();
  found.forEach(f => {
    if (!f.owner) return;
    const l = byOwner.get(f.owner);
    if (l) l.push(f); else byOwner.set(f.owner, [f]);
  });
  if (!byOwner.size) return 'nobody to notify';

  let links: Json[] = [];
  try { links = await pgGet(base, hdr, 'tg_links?select=user_id,chat_id&chat_id=not.is.null'); }
  catch (_e) { return 'no tg_links table'; }
  const chats = new Map(links.map(l => [String(l.user_id), String(l.chat_id)]));

  let sent = 0, unlinked = 0, failed = 0;
  for (const [owner, list] of byOwner) {
    const chat = chats.get(owner);
    if (!chat) { unlinked++; continue; }
    if (await tgPost(token, chat, tgText(list))) sent++; else failed++;
  }
  return sent + ' sent' + (unlinked ? ', ' + unlinked + ' not linked' : '')
       + (failed ? ', ' + failed + ' failed' : '');
}

/* Чи ховати автоматично. Вимикач командний і лежить у team_settings:
   рішення «ховати все підряд» стосується всієї команди, а не того, хто
   першим відкрив налаштування.

   Немає запису — ховаємо. Це свідомий вибір за замовчуванням: під
   оголошенням, яке щойно запустили, першим зазвичай зʼявляється не
   питання покупця. Зняти приховування завжди можна однією кнопкою,
   а от непоміченого спаму під оголошенням не повернеш. */
async function autoHideBy(base: string, hdr: Json): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  try {
    const rows = await pgGet(base, hdr,
      'team_settings?select=team_name,value&key=eq.fb_comments_autohide');
    rows.forEach((r: Json) => out.set(String(r.team_name), String(r.value) !== '0'));
  } catch (_e) { /* таблиці може не бути — тоді всюди за замовчуванням */ }
  return out;
}

/* ═════ ОБХІД ЗА РОЗКЛАДОМ ═════ */
async function scanAll(base: string, hdr: Json, onlyOwner: string): Promise<Response> {
  let q = 'fb_accounts?select=account_id,name,team_name,token_id,created_by,comments_seen_at'
        + '&missing_since=is.null&token_id=not.is.null'
        + '&order=comments_scanned_at.asc.nullsfirst&limit=' + SCAN_ACCOUNTS;
  if (onlyOwner) q += '&created_by=eq.' + encodeURIComponent(onlyOwner);

  let accs: Json[];
  try {
    accs = await pgGet(base, hdr, q);
  } catch (e) {
    const msg = (e as Error).message;
    return reply({ error: /comments_scanned_at|does not exist|column/i.test(msg)
      ? 'the comment columns are missing — run the alter block from FB_SYNC.sql'
      : msg }, 500);
  }
  if (!accs.length) return reply({ scanned: 0, note: 'no cabinet to look at' });

  const ids = [...new Set(accs.map(a => Number(a.token_id)).filter(Boolean))];
  let toks: Json[] = [];
  try { toks = await pgGet(base, hdr, 'fb_tokens?select=id,token,scopes&id=in.(' + ids.join(',') + ')'); }
  catch (e) { return reply({ error: (e as Error).message }, 500); }
  const byToken = new Map(toks.map(t => [Number(t.id), t]));

  const autoHide = await autoHideBy(base, hdr);
  const deadline = Date.now() + DEADLINE_MS;
  const found: Found[] = [];
  const problems: string[] = [];
  let scanned = 0, hidden = 0;
  /* Скільки постів обійшли й скільки коментарів прочитали за прогін.

     Без цих двох чисел відповідь «scanned: 7, found: 0» означає
     водночас «подивились і нового немає» і «дивитись не було на що»
     — наприклад, коли жодне оголошення не веде на пост Сторінки. Це
     різні стани, і плутати їх не можна саме тут: розклад ходить
     мовчки, і єдине, з чого можна судити про його роботу, — оця
     відповідь. */
  let postsSeen = 0, commentsSeen = 0;

  /* Кеш на весь прогін, а не на кабінет: кабінети одного токена
     здебільшого вказують на ті самі Сторінки, і питати про них по
     колу означало б витратити дедлайн на те саме. */
  const cache = new Map<string, { token: string; name: string }>();
  const pagesOf = new Map<number, { mine: Map<string, { name: string; tasks: string[] }>;
                                    failed: string }>();

  for (const acc of accs) {
    if (Date.now() > deadline) break;
    const tok = byToken.get(Number(acc.token_id));
    if (!tok) continue;
    const scopes: string[] = Array.isArray(tok.scopes) ? tok.scopes : [];
    if (!scopes.includes('pages_read_engagement')) continue;
    const mayHide = scopes.includes('pages_manage_engagement')
                 && (autoHide.get(String(acc.team_name)) ?? true);

    if (!pagesOf.has(Number(tok.id))) pagesOf.set(Number(tok.id), await myPages(String(tok.token)));
    const { mine, failed: listFailed } = pagesOf.get(Number(tok.id))!;

    let posts: Map<string, Post>;
    try {
      posts = await ourPosts(String(tok.token), String(acc.account_id));
    } catch (e) {
      problems.push(String(acc.name || acc.account_id) + ': ' + (e as Error).message);
      continue;
    }
    scanned++;

    const since = acc.comments_seen_at ? Date.parse(String(acc.comments_seen_at)) : 0;
    let newest = since;
    let looked = 0;

    for (const [story, post] of posts) {
      if (looked >= SCAN_POSTS || Date.now() > deadline) break;
      const pageId = pageOf(story);
      /* Пропускаємо наперед лише те, про що ЗНАЄМО, що воно закрите.
         Якщо списку Сторінок дістати не вдалось, mine порожній — і
         висновок «жодна не наша» був би висновком із незнання: обхід
         тихо не робив би нічого. Та сама помилка, що вже була в
         listComments; тут вона коштувала б дорожче, бо мовчить
         розклад, а не екран. */
      if (!listFailed && whyDenied(pageId, '', mine, '')) continue;
      looked++;
      postsSeen++;
      try {
        const pg = await pageToken(String(tok.token), pageId, cache);
        const j = await graph('/' + story + '/comments', pg.token, {
          fields: 'id,message,created_time,is_hidden,from{name}',
          filter: 'stream', limit: SCAN_PER_POST
        });
        const rows: Json[] = Array.isArray(j.data) ? j.data : [];
        commentsSeen += rows.length;
        for (const c of rows) {
          const at = Date.parse(String(c.created_time || ''));
          if (!at || at > newest) newest = at || newest;
          /* Перший прогін по кабінету нічого не ховає й ні про що не
             пише. Інакше ввімкнення функції означало б сотню
             повідомлень про коментарі піврічної давнини і сховану
             піврічну переписку. Замість цього ставимо позначку часу
             й починаємо з наступного разу. */
          if (!since || !at || at <= since) continue;
          let didHide = false;
          if (mayHide && !c.is_hidden) {
            try {
              await graph('/' + String(c.id), pg.token, { is_hidden: true }, 'POST');
              didHide = true;
              hidden++;
            } catch (_e) { /* не сховали — скажемо про сам коментар */ }
          }
          /* «Сховано» означає «зараз не на людях», а не «сховали саме
             ми»: коментар міг бути схований минулого разу або руками.
             Читачу повідомлення важливо перше, а не друге. */
          found.push({ owner: String(acc.created_by), cab: String(acc.name || acc.account_id),
                       ad: post.names[0] || '', from: String(c.from?.name || ''),
                       text: String(c.message || ''),
                       hidden: didHide || !!c.is_hidden, byUs: didHide });
        }
      } catch (e) {
        problems.push(String(acc.name || acc.account_id) + ': ' + (e as Error).message);
      }
    }

    try {
      await fetch(base + '/rest/v1/fb_accounts?created_by=eq.'
        + encodeURIComponent(String(acc.created_by))
        + '&account_id=eq.' + encodeURIComponent(String(acc.account_id)), {
        method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
        body: JSON.stringify({
          comments_scanned_at: new Date().toISOString(),
          comments_seen_at: new Date(newest || Date.now()).toISOString()
        })
      });
    } catch (_e) { /* позначку не поставили — наступний прогін повторить */ }
  }

  const telegram = await tgSend(base, hdr, found);
  return reply({ scanned, posts: postsSeen, comments: commentsSeen,
                 found: found.length, hidden, telegram,
                 problems: problems.slice(0, 5) });
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

  const hdr: Json = { apikey: svc, Authorization: 'Bearer ' + svc,
                      'content-type': 'application/json' };

  let body: Json = {};
  try { body = await req.json(); } catch (_e) { /* тіла може не бути */ }
  const action = String(body?.action || 'list');

  /* ── ОБХІД ──

     Єдина дія, доступна з розкладу, і єдина, яка нічого не видаляє.
     Вхід тут інший, ніж нижче: о третій ночі нікого не залогінено, і
     токена людини взяти нізвідки — замість нього спільний секрет.

     З браузера цю ж дію можна покликати своїм токеном: тоді обходимо
     ТІЛЬКИ кабінети того, хто прийшов. Межу ставить перевірений uid, а
     не те, що попросили в тілі запиту. */
  if (action === 'scan') {
    const cronKey = req.headers.get('x-cron-key') || '';
    if (cronKey) {
      const want = Deno.env.get('CRON_SECRET') || '';
      if (!want) return reply({ error: 'scheduled run is not configured: set CRON_SECRET' }, 400);
      if (!sameSecret(cronKey, want)) return reply({ error: 'bad cron key' }, 401);
      return await scanAll(base, hdr, '');
    }
    const who = await whoAmI(base, anon, req.headers.get('Authorization') || '');
    if (!who) return reply({ error: 'could not verify who is calling' }, 401);
    return await scanAll(base, hdr, who);
  }

  /* ── ОДИН КАБІНЕТ ──
     Усе інше — тільки з токеном людини. Спільний секрет сюди не веде:
     серед цих дій є delete, а вона незворотна. */
  const auth = req.headers.get('Authorization') || '';
  if (!auth) return reply({ error: 'no authorization header' }, 401);
  const me = await whoAmI(base, anon, auth);
  if (!me) return reply({ error: 'could not verify who is calling' }, 401);

  const accountId = String(body?.account_id || '').replace(/\D/g, '');
  if (!accountId) return reply({ error: 'account_id is required' }, 400);

  const accs = await pgGet(base, hdr,
    'fb_accounts?select=account_id,name,team_name,token_id'
    + '&created_by=eq.' + encodeURIComponent(me)
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
    + '&created_by=eq.' + encodeURIComponent(me));
  const tok = toks[0];
  if (!tok) return reply({ error: 'the token this cabinet came from is gone' }, 400);

  /* Права перевіряємо до першого запиту, як і у fb-pause: дізнатись про
     брак прав посеред обходу означало б половину зробленої роботи й
     незрозумілий екран. */
  const scopes: string[] = Array.isArray(tok.scopes) ? tok.scopes : [];
  const needRead = 'pages_read_engagement';
  const needWrite = 'pages_manage_engagement';
  if (!scopes.includes(needRead)) return reply({
    error: 'the token "' + tok.label + '" cannot read Page comments: it has no '
         + needRead + '. Add it to the system user and re-add the token.' }, 400);
  if (action !== 'list' && !scopes.includes(needWrite)) return reply({
    error: 'the token "' + tok.label + '" can only read comments: it has no '
         + needWrite + '. Add it to the system user and re-add the token.' }, 400);

  let posts: Map<string, string[]>;
  try {
    posts = await ourPosts(tok.token, accountId);
  } catch (e) {
    return reply({ error: 'could not list the ads of this cabinet: ' + (e as Error).message }, 502);
  }

  const cache = new Map<string, { token: string; name: string }>();
  if (action === 'list') return await listComments(tok.token, posts, cache);
  if (action === 'hide' || action === 'unhide' || action === 'delete')
    return await moderate(tok.token, posts, action, body, cache);
  return reply({ error: 'unknown action: ' + action }, 400);
}

/* ── показати, що там пишуть ── */
async function listComments(token: string, posts: Map<string, Post>,
                            cache: Map<string, { token: string; name: string }>): Promise<Response> {
  if (!posts.size) return reply({ comments: [], posts: 0,
    note: 'No ad in this cabinet points at a Page post, so there is nothing to moderate.' });

  const deadline = Date.now() + DEADLINE_MS;
  const out: Json[] = [];
  let seen = 0;

  /* Спершу питаємо, які Сторінки системний користувач узагалі має D
     один запит на весь виклик. Без цього кожна відмова виглядала б
     однаково, і п'ять постів однієї Сторінки давали б п'ять однакових
     стін тексту замість одного зрозумілого рядка. */
  const { mine, failed: listFailed } = await myPages(token);

  // Біди рахуємо по СТОРІНКАХ, а не по постах: причина в них одна.
  const bad = new Map<string, { page: string; why: string; posts: number }>();
  const note = (pageId: string, name: string, why: string) => {
    const had = bad.get(pageId);
    if (had) { had.posts++; return; }
    bad.set(pageId, { page: name || pageId, why, posts: 1 });
  };

  for (const [story, post] of posts) {
    if (seen >= POSTS_MAX || Date.now() > deadline) break;
    seen++;
    const pageId = pageOf(story);
    /* Відмову, яку ми вже вміємо пояснити, не повторюємо в Facebook:
       він відповість тим самим, а часу це коштує.

       Але тільки коли список Сторінок у нас справді є. Якщо /me/accounts
       не відповів, ми не знаємо нічого — і зробити з незнання висновок
       «доступу немає» означало б не спробувати там, де все працювало б.
       Це різні речі, і плутати їх не можна: у токена може бракувати
       pages_show_list і водночас вистачати прав на самі коментарі. */
    const known = listFailed ? '' : whyDenied(pageId, '', mine, '');
    if (known) { note(pageId, mine.get(pageId)?.name || '', known); continue; }
    try {
      const pg = await pageToken(token, pageId, cache);
      const j = await graph('/' + story + '/comments', pg.token, {
        // filter=stream — разом із відповідями: спам часто саме там.
        fields: 'id,message,created_time,is_hidden,like_count,permalink_url,from{name,id}',
        filter: 'stream', limit: PER_POST
        /* order тут НЕ просимо. Graph приймає reverse_chronological не
           з кожним filter, і сперечатись із ним заради порядку немає
           сенсу: нижче ми однаково сортуємо всі коментарі з усіх постів
           разом, а зробити це на його боці неможливо в принципі. */
      });
      (Array.isArray(j.data) ? j.data : []).forEach((c: Json) => out.push({
        id: String(c.id || ''),
        story,
        page: pg.name,
        ad: post.names[0] || '',
        ads: post.names.length,
        live: post.live,
        message: String(c.message || ''),
        from: String(c.from?.name || ''),
        created_time: c.created_time || null,
        is_hidden: !!c.is_hidden,
        likes: Number(c.like_count) || 0,
        permalink_url: c.permalink_url || null
      }));
    } catch (e) {
      // Один пост без прав не має ховати коментарі з усіх інших.
      const why = (e as Error).message;
      note(pageId, mine.get(pageId)?.name || '',
        /#10|pages_read_engagement|Page Public/i.test(why)
          ? whyDenied(pageId, mine.get(pageId)?.name || '', mine, listFailed)
            || 'Facebook refused this Page even though it is assigned with the right task. '
             + 'Usually that means the app behind the token has not been granted '
             + 'pages_read_engagement — check it in the app settings.'
          : why);
    }
  }

  out.sort((a, b) => String(b.created_time || '').localeCompare(String(a.created_time || '')));
  return reply({
    comments: out,
    posts: posts.size,
    looked: seen,
    more: seen < posts.size,
    /* Скільки Сторінок системний користувач має взагалі — число, яке
       відповідає на питання швидше за будь-який текст. */
    pages_seen: mine.size,
    blocked: [...bad.values()]
  });
}

/* ── сховати, показати назад, видалити — D

   story_id приходить із браузера, і саме тому його треба звірити зі
   списком постів ЦЬОГО кабінета. Сам по собі він нічого не доводить:
   це просто рядок у тілі запиту.

   А ось перевіряти ФОРМУ номера коментаря — спокуса, від якої тут
   свідомо відмовились. Facebook за роки міняв її не раз ({post}_{id},
   {page}_{post}_{id}, просто число), і перевірка форми рано чи пізно
   почала б відмовляти в видаленні справжнього спаму — тобто ламала б
   саме те, заради чого написана.

   Справжня межа проходить не там. Токен Сторінки ми беремо НЕ з тіла
   запиту, а виводимо з посту, який щойно звірили зі списком кабінета.
   Тобто дотягнутись цим токеном можна лише до Сторінки, яку тобі й так
   видали в твоєму ж бізнесі. */
async function moderate(token: string, posts: Map<string, Post>,
                        action: string, body: Json,
                        cache: Map<string, { token: string; name: string }>): Promise<Response> {
  const ids: string[] = Array.isArray(body?.comment_ids)
    ? body.comment_ids.map((x: unknown) => String(x))
    : [String(body?.comment_id || '')].filter(Boolean);
  if (!ids.length) return reply({ error: 'comment_id is required' }, 400);

  const story = String(body?.story_id || '');
  if (!posts.has(story)) return reply({
    error: 'that post does not belong to this cabinet' }, 403);

  let pg: { token: string; name: string };
  try {
    pg = await pageToken(token, pageOf(story), cache);
  } catch (e) {
    return reply({ error: (e as Error).message }, 400);
  }

  const done: string[] = [];
  const failed: { id: string; why: string }[] = [];
  for (const id of ids) {
    try {
      if (action === 'delete') await graph('/' + id, pg.token, {}, 'DELETE');
      else await graph('/' + id, pg.token, { is_hidden: action === 'hide' }, 'POST');
      done.push(id);
    } catch (e) {
      failed.push({ id, why: (e as Error).message });
    }
  }
  return reply({ action, done: done.length, failed: failed.length,
                 problems: failed.slice(0, 5).map(f => f.why) });
}
