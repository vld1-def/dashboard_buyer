/* ═══════════ AI В ДАШБОРДІ ═══════════

   ЧОМУ ЦЕ ФУНКЦІЯ, А НЕ КОД У СТОРІНЦІ. Ключ Anthropic не можна
   покласти в дашборд: сторінку читає будь-хто, хто її відкрив, і ключ
   із неї витягується першим же поглядом у вкладку Network. Тому модель
   кличе сервер, а браузер — сервер.

   ХТО МОЖЕ. Лише залогінений: токен людини перевіряється до будь-якої
   роботи. Спільного секрету тут немає зовсім і не буде — розкладу ця
   функція не потрібна, а дія, яку не просила людина, не має сенсу:
   генерація без того, хто її прочитає, це просто витрата.

   ЩО ВОНА НЕ РОБИТЬ. Нічого не зберігає, крім лічильника. Згенеровані
   тексти не йдуть у базу: їх показують як кандидатів, і в банк
   потрапляє тільько те, що людина вибрала руками. Текст, який поїде в
   кабінет, мусить пройти через людину — модель помиляється мовчки.

   МЕЖІ, І ВСІ ТРИ ПРО ГРОШІ:
     • ліміт викликів на людину за день (AI_DAY_LIMIT, типово 100);
     • стеля max_tokens на відповідь;
     • стеля на розмір прикладів у запиті (EX_MAX, EX_LEN).
   Модель коштує копійки — саме тому легко не помітити цикл, який
   кличе її тисячу разів. Межа тут не економія, а запобіжник.

   Розгортання:
     supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
     supabase functions deploy ai
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const API = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/* Найлегша модель Claude. Вона ж і найдешевша, а задача тут проста:
   написати ще кілька текстів у тому ж тоні, що вже є. Міняється
   секретом AI_MODEL — без правки коду. */
const MODEL_DEF = 'claude-haiku-5-5';
const DAY_LIMIT_DEF = 100;

// Скільки прикладів беремо в запит і скільки лишаємо від кожного.
// Більше прикладів майже не додає схожості, зате додає токенів.
const EX_MAX = 12;
const EX_LEN = 600;
// Скільки варіантів можна попросити за раз.
const N_MIN = 1, N_MAX = 10;
// Стеля відповіді. 10 варіантів × ~250 токенів + розмітка JSON.
const MAX_TOKENS = 3000;

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

const today = () => new Date().toISOString().slice(0, 10);

/* Скільки людина вже витратила СЬОГОДНІ. Читаємо ключем сервісної
   ролі: рядок належить їй, але писати в нього з браузера не можна —
   інакше лічильник не лічильник. */
async function usedToday(base: string, hdr: Json, me: string, action: string): Promise<number> {
  try {
    const res = await fetch(base + '/rest/v1/ai_usage?select=calls'
      + '&created_by=eq.' + encodeURIComponent(me)
      + '&day=eq.' + today() + '&action=eq.' + encodeURIComponent(action), { headers: hdr });
    if (!res.ok) return 0;
    const rows = await res.json().catch(() => []);
    return Number((rows[0] || {}).calls) || 0;
  } catch (_e) {
    /* Таблиці ще немає (AI.sql не виконаний) — працюємо без лічильника,
       але не замість нього: про це сказано у відповіді. */
    return 0;
  }
}

async function addUsage(base: string, hdr: Json, me: string, action: string,
                        inTok: number, outTok: number): Promise<string> {
  /* on_conflict + merge-duplicates — щоб два одночасні виклики не
     створили два рядки на той самий день. Інкремент робимо читанням і
     записом: окремої RPC заради одного числа не заводимо, а розбіжність
     на один виклик при точному збігу в часі лічильнику не шкодить. */
  try {
    const was = await usedToday(base, hdr, me, action);
    const res = await fetch(base + '/rest/v1/ai_usage?on_conflict=created_by,day,action', {
      method: 'POST',
      headers: { ...hdr, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ created_by: me, day: today(), action,
                             calls: was + 1, in_tok: inTok, out_tok: outTok,
                             updated_at: new Date().toISOString() })
    });
    if (!res.ok) return await res.text().catch(() => 'HTTP ' + res.status);
    return '';
  } catch (e) { return (e as Error).message; }
}

/* ── САМ ЗАПИТ ДО МОДЕЛІ ── */
async function callModel(key: string, model: string, system: string, user: string):
    Promise<{ text: string; inTok: number; outTok: number }> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': API_VERSION,
               'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(j?.error?.message || 'HTTP ' + res.status);
    /* Найчастіші дві причини називаємо прямо: інакше «400» відправляє
       шукати ваду в запиті, тоді як справа в ключі або в балансі. */
    throw new Error(res.status === 401 ? 'the ANTHROPIC_API_KEY is not accepted: ' + msg
                  : res.status === 429 ? 'rate limit or no credit on the Anthropic account: ' + msg
                  : msg);
  }
  const text = (Array.isArray(j.content) ? j.content : [])
    .filter((b: Json) => b && b.type === 'text').map((b: Json) => String(b.text || '')).join('\n');
  return { text, inTok: Number(j?.usage?.input_tokens) || 0,
           outTok: Number(j?.usage?.output_tokens) || 0 };
}

/* ── РОЗБІР ВІДПОВІДІ ──

   Просимо JSON, але не вірим, що він прийде: модель може додати рядок
   до або після. Тому беремо перший об'єкт у відповіді, а якщо його
   немає — розбираємо як текст, поділений порожніми рядками. Порожній
   екран замість варіантів через зайву кому — найдурніша з можливих
   поломок. */
function parseItems(raw: string): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = [];
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const j = JSON.parse(raw.slice(a, b + 1));
      (Array.isArray(j.items) ? j.items : []).forEach((it: Json) => {
        const text = String(it?.text || '').trim();
        if (text) out.push({ title: String(it?.title || '').trim(), text });
      });
    } catch (_e) { /* далі спробуємо як текст */ }
  }
  if (out.length) return out;
  raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
    .forEach(s => out.push({ title: '', text: s.replace(/^[-*\d.)\s]+/, '').trim() }));
  return out;
}

const SYSTEM = [
  'You write short ad copy for mobile app and PWA campaigns.',
  'You are given real examples written by this team. Match their tone, length,',
  'punctuation habits and language exactly — the new lines must look like the same',
  'person wrote them, not like a polished brochure.',
  'Never invent numbers, bonuses, guarantees or payouts that are not present in the',
  'examples: a promise nobody can keep is the one thing that gets an account banned.',
  'Answer with JSON only: {"items":[{"title":"short label","text":"the copy"}]}'
].join(' ');

function buildUser(body: Json): string {
  const ex: { title: string; text: string }[] = (Array.isArray(body?.examples) ? body.examples : [])
    .slice(0, EX_MAX)
    .map((e: Json) => ({ title: String(e?.title || '').slice(0, 120),
                         text: String(e?.text || '').slice(0, EX_LEN) }))
    .filter((e: { text: string }) => e.text.trim());

  const n = Math.min(N_MAX, Math.max(N_MIN, Number(body?.n) || 5));
  const geo = String(body?.geo || '').slice(0, 40);
  const cat = String(body?.cat || '').slice(0, 60);
  const lang = String(body?.lang || '').slice(0, 40);
  const hint = String(body?.hint || '').slice(0, 500);

  const lines = [
    ex.length
      ? 'Examples from our bank' + (geo ? ' (geo ' + geo + ')' : '') + ':'
      : 'We have no examples saved yet, so write in a plain, direct style.',
    ...ex.map((e, i) => (i + 1) + '. ' + (e.title ? '[' + e.title + '] ' : '') + e.text),
    '',
    'Write ' + n + ' NEW variants.',
    cat ? 'Slot: ' + cat + '.' : '',
    lang ? 'Language: ' + lang + ' (same as the examples).' : 'Keep the language of the examples.',
    hint ? 'What to aim for: ' + hint : '',
    'Keep each variant about as long as the examples. No numbering in the text itself.'
  ];
  return lines.filter(Boolean).join('\n');
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
  const key = Deno.env.get('ANTHROPIC_API_KEY') || '';
  if (!key) return reply({ error: 'the AI is not set up yet: no ANTHROPIC_API_KEY in the '
    + 'function secrets. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...' }, 400);

  const hdr: Json = { apikey: svc, Authorization: 'Bearer ' + svc,
                      'content-type': 'application/json' };

  // Тільки людина, і тільки своя. Спільного секрету тут немає.
  const auth = req.headers.get('Authorization') || '';
  if (!auth) return reply({ error: 'no authorization header' }, 401);
  const me = await whoAmI(base, anon, auth);
  if (!me) return reply({ error: 'could not verify who is calling' }, 401);

  let body: Json = {};
  try { body = await req.json(); } catch (_e) { /* тіла може не бути */ }
  const action = String(body?.action || 'text');
  if (action !== 'text') return reply({ error: 'unknown action: ' + action }, 400);

  const model = Deno.env.get('AI_MODEL') || MODEL_DEF;
  const limit = Number(Deno.env.get('AI_DAY_LIMIT')) || DAY_LIMIT_DEF;

  /* Межу перевіряємо ДО звернення до моделі: дізнатись про ліміт після
     того, як за запит уже заплатили, — те саме, що не мати межі. */
  const used = svc ? await usedToday(base, hdr, me, action) : 0;
  if (svc && used >= limit) return reply({
    error: 'daily limit reached: ' + used + ' of ' + limit + ' generations today. '
         + 'It resets at UTC midnight; raise it with the AI_DAY_LIMIT secret.' }, 429);

  let got: { text: string; inTok: number; outTok: number };
  try {
    got = await callModel(key, model, SYSTEM, buildUser(body));
  } catch (e) {
    return reply({ error: (e as Error).message }, 502);
  }

  const items = parseItems(got.text);
  const noteUsage = svc ? await addUsage(base, hdr, me, action, got.inTok, got.outTok)
                        : 'SERVICE_ROLE_KEY is not set, so nothing is counted';

  return reply({
    items,
    model,
    usage: { in: got.inTok, out: got.outTok },
    /* Ціна одного виклику — в самій відповіді. Інакше «скільки це
       коштує» лишається питанням до прайса, а не до дашборда. */
    cost_usd: +((got.inTok * 0.10 + got.outTok * 0.50) / 1e6).toFixed(5),
    left_today: svc ? Math.max(0, limit - used - 1) : null,
    /* Не змогли записати лічильник — кажемо вголос. Мовчки незаписана
       витрата означає, що межа існує лише на папері. */
    problems: [noteUsage,
      items.length ? '' : 'the model answered, but nothing could be parsed out of it'
    ].filter(Boolean)
  });
}
