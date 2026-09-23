/* ═══════════ КОМЕНТАРІ ПІД ОГОЛОШЕННЯМИ ═══════════

   Друге місце в проєкті, яке щось МІНЯЄ поза дашбордом, і, як і
   fb-pause, воно живе окремо саме тому.

   ЧОМУ НЕМАЄ ВХОДУ ЗА РОЗКЛАДОМ І НЕ БУДЕ. Просили «автоматично
   чистити». Автоматично видаляти чужі повідомлення не можна: під
   оголошенням лежить не лише спам, а й питання від людей, які збирались
   купити, і відповіді самої команди. Автоматика, яка видаляє все
   підряд, одного ранку зітре саме те, заради чого коментарі й читають,
   і дізнаєшся ти про це ніколи — видалене не лишає сліду.

   Тому тут рівно те, про що просили в другій половині фрази: доступ,
   щоб видаляти самому, з дашборда, бачачи текст. Коли захочеш саме
   автоматику — вона має бути за ПРАВИЛАМИ (слова, посилання, згадки),
   і правила ці мусиш написати ти, а не я вгадати.

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
  if (!me) return reply({ error: 'could not verify who is calling' }, 401);

  let body: Json = {};
  try { body = await req.json(); } catch (_e) { /* тіла може не бути */ }

  const action = String(body?.action || 'list');
  const accountId = String(body?.account_id || '').replace(/\D/g, '');
  if (!accountId) return reply({ error: 'account_id is required' }, 400);

  const hdr: Json = { apikey: svc, Authorization: 'Bearer ' + svc,
                      'content-type': 'application/json' };

  const accs = await pgGet(base, hdr,
    'fb_accounts?select=account_id,name,team_name,token_id'
    + '&created_by=eq.' + encodeURIComponent(me)
    + '&account_id=eq.' + encodeURIComponent(accountId));
  const acc = accs[0];
  if (!acc) return reply({ error: 'no such ad account among yours — run Sync now first' }, 404);
  if (!acc.token_id) return reply({ error: 'this cabinet has no token attached any more' }, 400);

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
  const problems: string[] = [];
  let seen = 0;

  for (const [story, post] of posts) {
    if (seen >= POSTS_MAX || Date.now() > deadline) break;
    seen++;
    try {
      const pg = await pageToken(token, pageOf(story), cache);
      const j = await graph('/' + story + '/comments', pg.token, {
        // filter=stream — разом із відповідями: спам часто саме там.
        fields: 'id,message,created_time,is_hidden,like_count,permalink_url,from{name,id}',
        filter: 'stream', order: 'reverse_chronological', limit: PER_POST
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
      problems.push((e as Error).message);
    }
  }

  out.sort((a, b) => String(b.created_time || '').localeCompare(String(a.created_time || '')));
  return reply({
    comments: out,
    posts: posts.size,
    looked: seen,
    more: seen < posts.size,
    problems: problems.slice(0, 5)
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
