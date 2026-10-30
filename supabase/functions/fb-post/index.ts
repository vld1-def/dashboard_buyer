/* ═══════════ ПУБЛІКАЦІЯ ПОСТА НА СТОРІНКУ ═══════════

   Третє місце в проєкті, яке щось МІНЯЄ поза дашбордом — після
   fb-pause і fb-comments. Як і вони, живе окремою функцією саме тому.

   ТОКЕН НЕ ПОТРАПЛЯЄ В БРАУЗЕР, І ЦЕ НЕ ДРІБНИЦЯ. Сторінка шле сюди
   лише номер рядка у fb_posts. Що саме публікувати, функція читає з
   бази сама, токен бере сама, у вкладку не віддає нічого. Так само
   влаштовані fb-proxy і fb-comments.

   ЧИЙ ТОКЕН. Пост іде від імені СТОРІНКИ, а не кабінета. Токен
   системного користувача сам по собі нічого не опублікує: ним
   питається токен самої Сторінки — /{page_id}?fields=access_token — і
   лише тоді, коли Сторінку видали системному користувачеві в Business
   Manager, а в токені є pages_manage_posts.

   Права перевіряємо ДО першого запиту в Graph: дізнатись про брак
   дозволу після того, як пост уже пішов, неможливо — але дізнатись
   після того, як людина натиснула і чекає, цілком реально, і це
   найгірший момент для такої новини.

   ЩО ПУБЛІКУЄМО ЧИМ:
     є картинка — /{page_id}/photos, текст іде підписом (caption);
     немає      — /{page_id}/feed з message і link.
   Це різні ендпоїнти, і спроба відправити картинку у feed дає пост без
   картинки — тобто тихо не те, що просили.

   ЧОМУ НЕМАЄ МАСОВОЇ ВІДПРАВКИ. Один виклик — один пост на одну
   Сторінку. Кнопка «на всі Сторінки» — найшвидший спосіб втратити
   парк: Facebook бачить однаковий пост на зв'язаних Сторінках як
   мережу. Якщо це колись знадобиться, воно має робитись із паузами і
   різними текстами, тобто бути іншою задачею, а не прапорцем тут.

   ВИДАЛЕННЯ ТУТ НЕМАЄ СВІДОМО. Опублікований пост міг зібрати
   коментарі й охоплення; стерти його автоматом означає одного ранку
   втратити те, заради чого все й робилось. Та сама межа, що у
   fb-comments: ховає машина, видаляє людина.

   Розгортання:
     supabase functions deploy fb-post
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GRAPH = 'https://graph.facebook.com/v21.0';
const FN_VERSION = '2026-10-30.1';

type Json = Record<string, any>;

function reply(body: Json, status = 200): Response {
  return new Response(JSON.stringify({ fn: FN_VERSION, ...body }),
    { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

/* Graph відповідає помилкою в тілі, а не лише кодом. Беремо саме
   message: «Bad Request» не каже нічого, а «(#200) Requires
   pages_manage_posts» каже все. */
async function graph(path: string, token: string, params: Json = {}, method = 'GET') {
  const u = new URL(GRAPH + path);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (method === 'GET') u.searchParams.set(k, String(v)); else form.set(k, String(v));
  }
  if (method === 'GET') u.searchParams.set('access_token', token);
  else form.set('access_token', token);
  const res = await fetch(u.toString(), method === 'GET' ? {} : { method: 'POST', body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.error) {
    throw new Error(String(j?.error?.message || ('HTTP ' + res.status)));
  }
  return j;
}

async function rest(base: string, hdr: Json, q: string) {
  const res = await fetch(base + '/rest/v1/' + q, { headers: hdr });
  if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const base = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!base) return reply({ error: 'function is not configured' }, 500);

  const auth = req.headers.get('Authorization') || '';
  if (!auth) return reply({ error: 'no authorization header' }, 401);

  let body: Json = {};
  try { body = await req.json(); } catch (_e) {}
  const rowId = String(body?.row_id ?? '').trim();
  if (!rowId) return reply({ error: 'row_id is required' }, 400);

  /* Читаємо й пишемо ТОКЕНОМ ТОГО, ХТО ПОКЛИКАВ — як у check-domains і
     в людському вході check-apps. Межі ставить RLS: чужий рядок просто
     не прийде, і цей вхід не стає способом опублікувати від імені
     чужої Сторінки. */
  const hdr = { apikey: anon, Authorization: auth, 'content-type': 'application/json' };

  let row: Json | null = null;
  try {
    const got = await rest(base, hdr, 'fb_posts?id=eq.' + encodeURIComponent(rowId)
      + '&select=id,page_id,page_name,message,link,image_url,status,publish_at&limit=1');
    row = got[0] || null;
  } catch (e) {
    const m = String((e as Error).message);
    return reply({ error: /fb_posts|does not exist/i.test(m)
      ? 'таблиці fb_posts ще немає — виконайте FB_POSTS.sql'
      : m }, 500);
  }
  if (!row) return reply({ error: 'such a post is not among yours' }, 404);
  if (row.status === 'published' || row.status === 'scheduled') {
    return reply({ error: 'this post has already gone to Facebook (' + row.status + ')' }, 409);
  }
  if (!String(row.message || '').trim() && !row.image_url) {
    return reply({ error: 'a post needs text or a picture' }, 400);
  }

  /* ЯКИЙ ТОКЕН ДІСТАЄ ЦЮ СТОРІНКУ. Сторінку бачить кабінет, кабінет
     прив'язаний до токена. Йдемо тим самим ланцюжком, що й
     fb-comments: page_id → account_id → token_id → сам токен. */
  let token = '', scopes: string[] = [];
  try {
    const pgs = await rest(base, hdr, 'fb_cabinet_pages?page_id=eq.'
      + encodeURIComponent(String(row.page_id)) + '&select=account_id&limit=5');
    if (!pgs.length) return reply({ error:
      'this Page is not seen by any of your cabinets — press Sync now on the Cabinets tab' }, 400);
    const ids = pgs.map((p: Json) => String(p.account_id)).filter(Boolean);
    const accs = await rest(base, hdr, 'fb_accounts?account_id=in.('
      + ids.map((i: string) => '"' + i + '"').join(',') + ')&select=account_id,token_id');
    const withTok = (accs || []).find((a: Json) => a.token_id);
    if (!withTok) return reply({ error:
      'no token is linked to the cabinets that see this Page — press Sync now on the Cabinets tab' }, 400);
    const toks = await rest(base, hdr, 'fb_tokens?id=eq.' + Number(withTok.token_id)
      + '&select=id,token,scopes&limit=1');
    if (!toks.length) return reply({ error: 'the token this Page came from is gone' }, 400);
    token = String(toks[0].token || '');
    scopes = Array.isArray(toks[0].scopes) ? toks[0].scopes : [];
  } catch (e) {
    return reply({ error: String((e as Error).message) }, 500);
  }
  if (!token) return reply({ error: 'the token is empty' }, 400);

  /* Дозвіл перевіряємо до Graph: інакше людина дізнається про брак
     прав уже після натискання, стоячи над порожнім екраном. */
  const NEED = 'pages_manage_posts';
  if (scopes.length && !scopes.includes(NEED)) {
    return reply({ error: 'the token has no ' + NEED + '. In Business Manager give the system '
      + 'user this Page with a content task, then add the token again in Settings.' }, 400);
  }

  // Токен самої Сторінки — те, чим публікують
  let pageToken = '', pageName = String(row.page_name || row.page_id);
  try {
    const j = await graph('/' + String(row.page_id), token, { fields: 'access_token,name' });
    pageToken = String(j?.access_token || '');
    pageName = String(j?.name || pageName);
  } catch (e) {
    return reply({ error: 'could not get a Page token: ' + String((e as Error).message) }, 400);
  }
  if (!pageToken) return reply({ error: 'no Page token for "' + pageName + '". In Business '
    + 'Manager add this Page to the system user with a content task.' }, 400);

  /* Час публікації Graph приймає в СЕКУНДАХ. Міліcекунди він мовчки
     прийме теж — і поставить пост на кілька тисяч років уперед. */
  const when = row.publish_at ? Math.floor(new Date(row.publish_at).getTime() / 1000) : 0;
  const sched = when && when > Math.floor(Date.now() / 1000)
    ? { published: 'false', scheduled_publish_time: String(when) } : {};

  const hasImg = !!String(row.image_url || '').trim();
  const path = '/' + String(row.page_id) + (hasImg ? '/photos' : '/feed');
  const params: Json = hasImg
    ? { url: row.image_url, caption: row.message, ...sched }
    : { message: row.message, link: row.link, ...sched };

  let out: Json;
  try {
    out = await graph(path, pageToken, params, 'POST');
  } catch (e) {
    const msg = String((e as Error).message);
    await fetch(base + '/rest/v1/fb_posts?id=eq.' + encodeURIComponent(rowId),
      { method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed', error: msg }) }).catch(() => {});
    return reply({ error: msg, page: pageName }, 400);
  }

  const postId = String(out?.post_id || out?.id || '');
  const status = Object.keys(sched).length ? 'scheduled' : 'published';
  await fetch(base + '/rest/v1/fb_posts?id=eq.' + encodeURIComponent(rowId),
    { method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ status, post_id: postId, error: null,
                             page_name: pageName }) }).catch(() => {});

  return reply({ ok: true, status, post_id: postId, page: pageName });
});
