/* ═══════════ ПОСТИ НА СТОРІНКИ ═══════════

   Сторінка пише в базу, а публікує функція: токен Сторінки у вкладку
   не потрапляє ніколи — браузер шле у fb-post лише номер рядка.

   Що доводиться:
     1. рядок створюється ДО звернення у Facebook, тому відмові є куди
        лягти і її видно в черзі повним текстом;
     2. одна Сторінка, видна з кількох кабінетів, — одна позиція в
        списку, а не три;
     3. Сторінка без модерації названа такою ДО того, як людина
        написала текст;
     4. невиконана міграція і незадеплоєна функція кажуть саме це, а не
        «не вдалося»;
     5. саме правило вибору ендпоїнта (картинка → /photos, інакше
        /feed) читається з файлу функції: браузер її не запускає. */
import { serve, open, checks } from './_harness.mjs';
import fs from 'node:fs';

const PORT = 8165;
const { ok, done } = checks();
const srv = await serve(PORT);

const INIT = () => {
  window.__ps = { tables: {}, calls: [], fnStatus: 200, fnBody: { ok: true, status: 'published', page: 'Lucky KG' } };
  const mk = t => {
    const o = {}; const st = { ins: null };
    ['select', 'order', 'limit', 'eq', 'in'].forEach(m => o[m] = () => o);
    o.insert = v => { st.ins = v; window.__ps.calls.push({ t, insert: v });
      const r = { select: () => r, limit: () => r,
        then: (f, j) => Promise.resolve({ data: [{ id: 77 }], error: null }).then(f, j) };
      return r; };
    o.delete = () => { const r = { eq: (c, v) => { window.__ps.calls.push({ t, del: v });
        return { then: (f, j) => Promise.resolve({ error: null }).then(f, j) }; } }; return r; };
    o.then = (f, j) => Promise.resolve(
      window.__ps.tables[t] || { data: [], error: null }).then(f, j);
    return o;
  };
  window.__ps.store = { uploads: [], upErr: null };
  const real = window.supabase.createClient;
  window.supabase.createClient = (...a) => {
    const c = real(...a);
    c.from = t => mk(t);
    c.auth.getSession = async () => ({ data: { session: { access_token: 'jwt', user: { id: 'u1' } } } });
    c.storage = { from: b => ({
      upload: async (path, body, opt) => {
        if (window.__ps.store.upErr) return { error: { message: window.__ps.store.upErr } };
        window.__ps.store.uploads.push({ path, type: opt && opt.contentType });
        return { data: { path }, error: null };
      },
      createSignedUrl: async (path, sec) => ({
        data: { signedUrl: 'https://sb.example/sign/' + path + '?t=' + sec }, error: null })
    }) };
    return c;
  };
  window.fetch = async (url, opt) => {
    window.__ps.calls.push({ fn: String(url), body: JSON.parse(opt.body) });
    return { ok: window.__ps.fnStatus < 400, status: window.__ps.fnStatus,
             json: async () => window.__ps.fnBody };
  };
};

const { browser, page, errs } = await open(PORT, { init: INIT });

const boot = s => page.evaluate(async st => {
  Object.assign(window.__ps, st);
  window.__ps.calls = [];
  currentTeam = 'Makeberry';
  await psLoad(false);
}, s);

/* ─────────── 1. навігація ─────────── */
/* Клік лише міняє location.hash, а маршрут застосовує слухач
   hashchange — тобто вже наступним тактом. Читати DOM одразу після
   кліку означає дивитись на сторінку ДО переходу. */
const nav = await page.evaluate(async () => {
  const btn = document.querySelector('.sb-item[data-nav="posts"]');
  btn.click();
  await new Promise(r => setTimeout(r, 120));
  const sec = document.getElementById('posts-section');
  return { btn: !!btn, label: btn.textContent.trim(),
    shown: !sec.classList.contains('route-off'), hash: location.hash };
});
ok('пункт Posts є в сайдбарі', nav.btn === true);
ok('і підписаний Posts', nav.label === 'Posts', nav.label);
ok('він відкриває свою сторінку', nav.shown === true && nav.hash === '#/posts', nav);

/* ─────────── 2. список Сторінок ─────────── */
await boot({ tables: {
  fb_cabinet_pages: { data: [
    { page_id: '1', page_name: 'Lucky KG', can_moderate: true },
    { page_id: '1', page_name: 'Lucky KG', can_moderate: true },   // та сама з іншого кабінета
    { page_id: '2', page_name: 'Spin UZ',  can_moderate: false }
  ], error: null },
  fb_posts: { data: [], error: null } } });
const pg = await page.evaluate(() => ({
  opts: [...document.getElementById('ps-page').options].map(o => o.text),
  hint: document.getElementById('ps-page-hint').textContent,
  cls: document.getElementById('ps-page-hint').className
}));
/* У списку лише те, куди справді можна постити. Spin UZ не видано
   системному користувачеві — її в списку немає зовсім, а не стоїть
   позицією, яка не працює. */
ok('одна Сторінка — одна позиція, хоч її видно з кількох кабінетів',
  pg.opts.length === 1, pg.opts);
ok('недоступної Сторінки в списку немає', !pg.opts.some(t => /Spin/.test(t)), pg.opts);
/* Але зникати мовчки вона теж не має права: інакше Сторінка
   «пропала» без причини, і шукати її підуть не там. */
/* Формулювання не випадкове: рядок, що починався зі «Ще », словник
   build/i18n.py робив «More 1 Сторінок приховано» — англійське слово
   в українському реченні. Тому й перевіряємо текст ЗІБРАНОЇ сторінки,
   а не те, що написано в джерелі. */
ok('приховану рахують і кажуть про неї',
  /Сторінок приховано: 1/.test(pg.hint) && !/More/.test(pg.hint), pg.hint);

/* Жодної доступної — найгірший випадок: список порожній, і сам по
   собі він не відрізняє «Сторінок немає» від «є, але не видані». */
const none = await page.evaluate(async () => {
  window.__ps.tables.fb_cabinet_pages = { data: [
    { page_id: '2', page_name: 'Spin UZ', can_moderate: false }], error: null };
  await psLoad(false);
  return { opts: [...document.getElementById('ps-page').options].map(o => o.text),
           hint: document.getElementById('ps-page-hint').textContent,
           cls: document.getElementById('ps-page-hint').className };
});
ok('порожній список називає саме свою причину',
  /не видано системному користувачеві/i.test(none.hint), none.hint);
ok('і кличе саме туди, де це лагодять', /Business Manager/.test(none.hint), none.hint);
ok('і це помітно, а не дрібним сірим', /is-bad/.test(none.cls), none.cls);

/* ─────────── 3. невиконана міграція ─────────── */
await boot({ tables: {
  fb_cabinet_pages: { data: [], error: null },
  fb_posts: { data: null, error: { message: 'relation "public.fb_posts" does not exist' } } } });
const mig = await page.evaluate(() => document.getElementById('ps-note').textContent);
ok('немає таблиці — сказано, що виконати', /FB_POSTS\.sql/.test(mig), mig);
ok('а не «не вдалося»', !/не вдалося/i.test(mig), mig);

const noPg = await page.evaluate(() => document.getElementById('ps-page-hint').textContent);
ok('немає Сторінок — сказано, звідки вони беруться', /Sync now/i.test(noPg), noPg);

/* ─────────── 4. чернетка ─────────── */
await boot({ tables: {
  fb_cabinet_pages: { data: [{ page_id: '1', page_name: 'Lucky KG', can_moderate: true }], error: null },
  fb_posts: { data: [], error: null } } });

const empty = await page.evaluate(async () => {
  document.getElementById('ps-msg').value = '';
  document.getElementById('ps-img').value = '';
  await psSave();
  return { say: document.getElementById('ps-say').textContent,
           ins: window.__ps.calls.filter(c => c.insert).length };
});
ok('порожній пост не зберігається', empty.ins === 0, empty);
ok('і сказано, чого бракує', /текст або картинка/i.test(empty.say), empty.say);

const saved = await page.evaluate(async () => {
  document.getElementById('ps-msg').value = 'Привіт зі Сторінки';
  document.getElementById('ps-link').value = 'https://pwa.example/kg';
  await psSave();
  const c = window.__ps.calls.find(x => x.insert);
  return { say: document.getElementById('ps-say').textContent, row: c && c.insert };
});
ok('чернетка пішла в базу', !!saved.row, saved);
ok('разом із командою, Сторінкою і текстом',
  saved.row.team_name === 'Makeberry' && saved.row.page_id === '1'
  && /Привіт/.test(saved.row.message) && /pwa.example/.test(saved.row.link), saved.row);
ok('без часу — тобто «зараз»', saved.row.publish_at === null, saved.row);

const sched = await page.evaluate(async () => {
  document.querySelector('input[name="ps-when"][value="at"]').click();
  document.getElementById('ps-at').value = '2026-12-01T10:30';
  window.__ps.calls = [];
  await psSave();
  const c = window.__ps.calls.find(x => x.insert);
  return { at: c && c.insert.publish_at,
           shown: document.getElementById('ps-at').style.display };
});
ok('вибір часу показує поле', sched.shown !== 'none', sched);
ok('і час іде в рядок', /^2026-12-01T/.test(String(sched.at || '')), sched.at);

/* ─────────── 5. відправка ─────────── */
const sent = await page.evaluate(async () => {
  document.querySelector('input[name="ps-when"][value="now"]').click();
  window.__ps.calls = [];
  await psSend();
  const fn = window.__ps.calls.find(c => c.fn);
  return { fn: fn && fn.fn, body: fn && fn.body,
           say: document.getElementById('ps-say').textContent,
           insBefore: window.__ps.calls.findIndex(c => c.insert) };
});
ok('відправка йде у fb-post', /\/functions\/v1\/fb-post$/.test(sent.fn || ''), sent.fn);
/* У функцію летить ЛИШЕ номер рядка: ні тексту, ні тим паче токена. */
ok('у функцію летить тільки номер рядка',
  JSON.stringify(Object.keys(sent.body || {})) === '["row_id"]', sent.body);
ok('рядок створюється ДО звернення у Facebook', sent.insBefore === 0, sent);
ok('успіх названо', /опубліковано/i.test(sent.say), sent.say);

const notDeployed = await page.evaluate(async () => {
  document.getElementById('ps-msg').value = 'ще раз';
  window.__ps.fnStatus = 404; window.__ps.fnBody = {};
  await psSend();
  return document.getElementById('ps-say').textContent;
});
ok('незадеплоєна функція каже саме це, а не HTTP 404',
  /deploy fb-post/.test(notDeployed), notDeployed);

const refused = await page.evaluate(async () => {
  document.getElementById('ps-msg').value = 'ще раз';
  window.__ps.fnStatus = 400;
  window.__ps.fnBody = { error: '(#200) Requires pages_manage_posts permission' };
  await psSend();
  return document.getElementById('ps-say').textContent;
});
ok('відмову Facebook переказано дослівно',
  /pages_manage_posts/.test(refused), refused);

/* ─────────── 6. черга ─────────── */
await boot({ fnStatus: 200, tables: {
  fb_cabinet_pages: { data: [{ page_id: '1', page_name: 'Lucky KG', can_moderate: true }], error: null },
  fb_posts: { data: [
    { id: 1, page_name: 'Lucky KG', message: 'чернетка', status: 'draft' },
    { id: 2, page_name: 'Lucky KG', message: 'на завтра', status: 'scheduled', publish_at: '2026-12-01T10:30:00Z' },
    { id: 3, page_name: 'Spin UZ',  message: 'вийшов',   status: 'published', post_id: '1_2' },
    { id: 4, page_name: 'Spin UZ',  message: 'не пішов', status: 'failed',
      error: '(#200) Requires pages_manage_posts permission' }
  ], error: null } } });
const q = await page.evaluate(() => {
  const read = () => [...document.querySelectorAll('#ps-list .ps-row')].map(r => ({
    tag: r.querySelector('.ps-tag').textContent,
    err: r.querySelector('.ps-err')?.textContent || '',
    send: !!r.querySelector('.ps-mini.is-main'),
    drop: [...r.querySelectorAll('.ps-mini')].some(b => b.textContent === '×') }));
  const all = read();
  document.querySelector('.ps-tab[data-f="failed"]').click();
  return { all, failed: read() };
});
ok('у черзі всі чотири стани', q.all.length === 4, q.all);
ok('кожен стан названий по-своєму',
  /* «вийшов» читалось як «пішов геть», а не «він у стрічці». */
  q.all.map(r => r.tag).join('|') === 'чернетка|заплановано|опубліковано|відмова', q.all);
ok('причина відмови видна повністю',
  /pages_manage_posts/.test(q.all[3].err), q.all[3]);
ok('опублікувати можна лише чернетку',
  q.all[0].send === true && q.all[1].send === false && q.all[2].send === false, q.all);
/* Опублікований пост живе у стрічці — прибрати рядок означало б
   втратити слід від того, що зараз там висить. */
ok('прибрати можна чернетку й відмову, але не те, що вже вийшло',
  q.all[0].drop && q.all[3].drop && !q.all[2].drop, q.all);
ok('фільтр звужує список', q.failed.length === 1 && q.failed[0].tag === 'відмова', q.failed);

/* ─────────── 6b. КАРТИНКА ФАЙЛОМ ───────────

   Бакет приватний, тож у рядок іде не адреса, а шлях із позначкою
   storage:. Підписує його fb-post у момент відправки — чернетка з
   картинкою не має бути доступною по голому посиланню, поки її не
   вирішили публікувати. */
await boot({ tables: {
  fb_cabinet_pages: { data: [{ page_id: '1', page_name: 'Lucky KG', can_moderate: true }], error: null },
  fb_posts: { data: [], error: null } } });

const up = await page.evaluate(async () => {
  const f = new File([new Uint8Array([1, 2, 3])], 'creative.PNG', { type: 'image/png' });
  const inp = document.getElementById('ps-file');
  Object.defineProperty(inp, 'files', { value: [f], configurable: true });
  await psPick(inp);
  window.__ps.calls = [];
  document.getElementById('ps-msg').value = 'з картинкою';
  await psSave();
  const row = (window.__ps.calls.find(c => c.insert) || {}).insert;
  return { uploads: window.__ps.store.uploads.map(u => u.path),
           row, prev: !!document.querySelector('#ps-prev img'),
           note: document.getElementById('ps-prev').textContent };
});
ok('файл залився в бакет команди',
  up.uploads.length === 1 && up.uploads[0].startsWith('Makeberry/'), up.uploads);
ok('імʼя файлу не перетирає чуже',
  /\/\d{10,}_[a-z0-9]{4,}\.png$/.test(up.uploads[0] || ''), up.uploads);
ok('у рядок іде шлях із позначкою, а не адреса',
  String(up.row.image_url || '').startsWith('storage:Makeberry/'), up.row);
ok('видно превʼю того, що вибрав', up.prev === true);
ok('і сказано, що це файл у сховищі', /сховищі команди/.test(up.note), up.note);

const both = await page.evaluate(async () => {
  document.getElementById('ps-img').value = 'https://chuzhe.example/pic.jpg';
  psImgHint();
  window.__ps.calls = [];
  await psSave();
  const row = (window.__ps.calls.find(c => c.insert) || {}).insert;
  return { img: row.image_url, note: document.getElementById('ps-prev').textContent };
});
ok('вписана адреса знімає залитий файл', both.img === 'https://chuzhe.example/pic.jpg', both);
ok('і підпис каже, що тепер це адреса', /за адресою/.test(both.note), both.note);

const noBucket = await page.evaluate(async () => {
  window.__ps.store.upErr = 'Bucket not found';
  const f = new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' });
  const inp = document.getElementById('ps-file');
  Object.defineProperty(inp, 'files', { value: [f], configurable: true });
  await psPick(inp);
  window.__ps.store.upErr = null;
  return document.getElementById('ps-say').textContent;
});
ok('немає бакета — сказано, що виконати', /POST_IMAGES\.sql/.test(noBucket), noBucket);

/* ─────────── 7. правила живуть у функції ─────────── */
{
  const FN = fs.readFileSync('supabase/functions/fb-post/index.ts', 'utf8');
  ok('дозвіл перевіряється ДО звернення в Graph',
    FN.indexOf("'pages_manage_posts'") < FN.indexOf("await graph('/' + String(row.page_id)"), '');
  ok('картинка йде в /photos, решта у /feed',
    /hasImg \? '\/photos' : '\/feed'/.test(FN));
  ok('час публікації в секундах, а не мілісекундах',
    /getTime\(\) \/ 1000/.test(FN));
  ok('минулий час не вважається запланованим',
    /when > Math\.floor\(Date\.now\(\) \/ 1000\)/.test(FN));
  ok('двічі той самий пост не відправиться',
    /already gone to Facebook/.test(FN));
  ok('масової відправки немає: один виклик — один рядок',
    !/for \(const row of/.test(FN) && /row_id/.test(FN));
  ok('видалення поста функція не вміє зовсім',
    !/method: 'DELETE'/.test(FN));
  /* Підписуємо ЛИШЕ своє: чужий https і так відкритий, а спроба його
     «підписати» перетворила б робоче посилання на поломане. */
  ok('підписується лише картинка з нашого сховища',
    /imgUrl\.startsWith\(STORAGE_MARK\)/.test(FN));
  ok('підпис живе хвилини, а не вічність', /SIGN_SECONDS = 600/.test(FN));
  ok('у Graph іде підписана адреса, а не шлях', /\{ url: imgUrl, caption/.test(FN));

  /* ЧОМУ ТОКЕН — СЕРВІСНИМ КЛЮЧЕМ. FB_TOKENS.sql забирає select на
     таблиці й повертає поіменно, без token: зі сторінки токен
     прочитати не можна. Через це запит заголовками того, хто покликав,
     завжди падав на 42501 — і публікація мовчки не працювала.

     Але послабленням це стає рівно тоді, коли ключем почнуть читати
     ВСЕ. Тому перевіряємо обидва боки: токен — сервісним і звужений до
     команди вже підтвердженого кабінета, а рядок поста й Сторінка —
     як були, заголовками того, хто покликав, бо саме RLS вирішує, чиє
     це. */
  ok('токен читається сервісним ключем', /rest\(base, svcHdr, 'fb_tokens/.test(FN));
  ok('і звужений до команди підтвердженого кабінета',
    /fb_tokens[\s\S]{0,120}team_name=eq\./.test(FN));
  ok('рядок поста лишився за RLS того, хто покликав',
    /rest\(base, hdr, 'fb_posts/.test(FN));
  ok('Сторінка й кабінет теж лишились за RLS',
    /rest\(base, hdr, 'fb_cabinet_pages/.test(FN) && /rest\(base, hdr, 'fb_accounts/.test(FN));
  ok('сервісним ключем читається рівно один запит — за токеном',
    (FN.match(/rest\(base, svcHdr/g) || []).length === 1);
  ok('брак ключа названий кроком розгортання, а не «помилкою»',
    /SERVICE_ROLE_KEY is not set/.test(FN));
}

/* ─────────── список Сторінок із лого ───────────

   У select картинки не покладеш, а Сторінки впізнають по лого швидше,
   ніж по назві. Видимий список — кнопки; значення лишається у
   прихованому select, щоб решта коду читала його так само.

   Лого приходить другим запитом і може не прийти зовсім (функція не
   перезадеплоєна, Facebook не віддав). Список не має права від цього
   зникнути — лишаються літери. */
await boot({ tables: {
  fb_cabinet_pages: { data: [
    { page_id: '1', page_name: 'Lucky KG', can_moderate: true },
    { page_id: '2', page_name: 'Alpha UZ', can_moderate: true }
  ], error: null },
  fb_posts: { data: [], error: null } } });

/* Шукаємо по data-id, а не по місцю: список сортується за назвою, і
   прив'язка до порядку ламала б перевірку на кожному перейменуванні. */
const pickOf = id => `#ps-pages .ps-page-pick[data-id="${id}"]`;
const picks = await page.evaluate(sel => {
  const btns = [...document.querySelectorAll('#ps-pages .ps-page-pick')];
  const letter = id => {
    const e = document.querySelector(sel.replace('%', id) + ' .ps-page-pic.is-none');
    return e ? e.textContent : null;
  };
  return { n: btns.length,
           on: btns.filter(b => b.classList.contains('is-on')).length,
           lucky: letter('1'), alpha: letter('2'),
           hidden: document.getElementById('ps-page').hidden,
           value: document.getElementById('ps-page').value };
}, '#ps-pages .ps-page-pick[data-id="%"]');
ok('кожна Сторінка — своя кнопка в списку', picks.n === 2, picks);
ok('вибрана рівно одна', picks.on === 1, picks);
ok('select лишився, але схований — решта коду читає його як раніше',
  picks.hidden === true && !!picks.value, picks);
/* Лого ще не приїхало: замість темного квадрата — перша літера. */
ok('без лого стоїть літера, а не порожній квадрат',
  picks.lucky === 'L' && picks.alpha === 'A', picks);

const switched = await page.evaluate(sel => {
  psPickPage('1');
  return { value: document.getElementById('ps-page').value,
           onLucky: document.querySelector(sel.replace('%', '1')).classList.contains('is-on'),
           onAlpha: document.querySelector(sel.replace('%', '2')).classList.contains('is-on') };
}, '#ps-pages .ps-page-pick[data-id="%"]');
ok('клік по Сторінці міняє саме значення', switched.value === '1', switched);
ok('і підсвічує саме її', switched.onLucky && !switched.onAlpha, switched);

/* Коли лого таки приїхало — воно стає на місце літери. Йдемо справжнім
   шляхом: підміняємо саму функцію, яка його приносить, а не внутрішню
   змінну — інакше стенд перевіряв би не той код, що працює. */
const withPics = await page.evaluate(async () => {
  pgCall = async () => ({ pages: [
    { page_id: '1', pic: 'https://scontent.example/lucky.jpg' },
    { page_id: '2', pic: '' } ] });
  await psLoadPics();
  const at = id => document.querySelector('#ps-pages .ps-page-pick[data-id="' + id + '"]');
  const img = at('1').querySelector('img');
  return { src: img ? img.getAttribute('src') : '',
           quiet: img ? img.getAttribute('referrerpolicy') : '',
           second: !!at('2').querySelector('.ps-page-pic.is-none') };
});
ok('лого стає на місце літери', /lucky\.jpg/.test(withPics.src), withPics);
ok('адреса дашборда не їде у Facebook із кожним лого',
  withPics.quiet === 'no-referrer', withPics);
ok('у кого лого немає — лишається літера', withPics.second === true, withPics);

/* ─────────── живий список вирішує, що показувати ───────────

   Сторінки беруться з fb_cabinet_pages — знімка останньої
   синхронізації. Токен міг за цей час померти, а Сторінка в таблиці
   лишилась: людина вибирає її, пише текст і лише тоді дізнається, що
   постити нічим. Той самий виклик, яким приходять лого, повертає
   живий список — ним і відсікаємо. */
await boot({ tables: {
  fb_cabinet_pages: { data: [
    { page_id: '1', page_name: 'Lucky KG', can_moderate: true },
    { page_id: '9', page_name: 'Dead BM', can_moderate: true }
  ], error: null },
  fb_posts: { data: [], error: null } } });

const alive = await page.evaluate(async () => {
  pgCall = async () => ({ pages: [
    { page_id: '1', pic: '', can_moderate: true } ] });   // '9' живою не прийшла
  await psLoadPics();
  return { ids: [...document.querySelectorAll('#ps-pages .ps-page-pick')]
             .map(b => b.dataset.id),
           hint: document.getElementById('ps-page-hint').textContent };
});
ok('Сторінка, якої живий список не знає, зникає',
  JSON.stringify(alive.ids) === JSON.stringify(['1']), alive);
ok('і її рахують серед прихованих, а не гублять мовчки',
  /Сторінок приховано/.test(alive.hint), alive);

/* Відповідь не дійшла — не чіпаємо нічого: порожній список через
   мовчання гірший за трохи застарілий. */
const quiet = await page.evaluate(async () => {
  pgCall = async () => { throw new Error('offline'); };
  await psLoadPics();
  return [...document.querySelectorAll('#ps-pages .ps-page-pick')].map(b => b.dataset.id);
});
ok('коли живий список не дійшов — список лишається як був',
  quiet.length >= 1, quiet);

/* ─────────── хід відправки видно ───────────

   Facebook відповідає не миттєво, і доти натискання виглядало як
   «нічого не сталось»: людина тисне ще раз — і в стрічці два пости.
   Тому перевіряємо не вигляд, а те, що другий клік НЕ проходить, і
   що хід видно на тій кнопці, яку натиснули, — з черги теж, бо
   раніше там не мінялось нічого. */
const busy = await page.evaluate(async () => {
  /* Чергу ставимо прямо, а не через boot: стенд тут про поведінку
     кнопки, і зайвий шар читання лише додав би йому причин упасти. */
  psPosts = [{ id: 'p1', status: 'draft', page_id: '1', page_name: 'Lucky KG',
               message: 'текст' }];
  psF = '';
  psPaint();

  /* Тримаємо відповідь функції, щоб побачити кнопку В ПРОЦЕСІ:
     інакше вона встигає повернутись у вихідний стан. */
  let release;
  const held = new Promise(r => release = r);
  const keep = window.fetch;
  window.fetch = async (u, o) => { await held; return keep(u, o); };

  const btn = document.querySelector('#ps-list [data-send="p1"]');
  if (!btn) { window.fetch = keep; return { err: 'кнопки в рядку немає' }; }
  const label0 = btn.textContent.trim();
  psSend('p1');
  await new Promise(r => setTimeout(r, 30));
  const mid = { text: btn.textContent.trim(), off: btn.disabled,
                ring: btn.classList.contains('is-busy') };

  /* Другий клік під час відправки не має надіслати нічого. */
  window.__ps.calls = [];
  psSend('p1');
  await new Promise(r => setTimeout(r, 20));
  const second = window.__ps.calls.length;

  release();
  await new Promise(r => setTimeout(r, 120));
  window.fetch = keep;
  return { label0, mid, second };
});
ok('кнопка в рядку черги каже, що запит пішов',
  busy.mid && /Відправляю/.test(busy.mid.text), busy);
ok('і показує кільце, а не саму лише зміну слова',
  busy.mid && busy.mid.ring === true, busy);
ok('поки йде — натиснути вдруге не можна', busy.mid && busy.mid.off === true, busy);
ok('другий клік не надсилає другий пост', busy.second === 0, busy);

/* «вийшов» читалось як «пішов геть», а не «опублікований». */
ok('статус опублікованого названий своїм словом', await page.evaluate(() =>
  PS_ST.published.l === 'опубліковано'));

await done(browser, srv, errs);
