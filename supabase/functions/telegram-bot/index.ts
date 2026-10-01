/* ═══════════ БОТ TELEGRAM ═══════════
   Приймає те, що Telegram шле на webhook. Вміє прив'язати чат до
   баєра, відв'язати назад — і відповісти на запит про стан парку:
   скільки кабінетів крутить, скільки витрачено сьогодні, що зламалось.

   ПРО ВІДПОВІДІ НА ЗАПИТ
   Бот ходить у базу ключем сервісної ролі, тобто бачить УСЕ. Тому
   кожен запит жорстко звужується до created_by того, хто прив'язав
   цей чат. Забути цей фільтр означало б показати одному баєру
   кабінети іншого — і він би навіть не зрозумів, що бачить чуже.

   ЧОМУ КОДОМ, А НЕ ПОШТОЮ
   Напрошується простіше: бот питає пошту, людина відповідає, готово.
   Але пошта — не таємниця, це ім'я. Хто завгодно вписав би чужу і
   почав отримувати чужі сповіщення: домени, мітки, що впало. Перевірити
   бот нічого не може — у нього немає способу спитати пароль.

   Код видає сам дашборд і лише тому, хто в ньому залогінений, тобто
   вже довів, що він це він. Код живе чверть години і згоряє після
   першого використання. Пошту бот показує у відповідь — але як
   підтвердження «так, це твій акаунт», а не як спосіб увійти.

   ЧОМУ БЕЗ ПЕРЕВІРКИ JWT
   Telegram нічого не знає про токени Supabase і шле звичайний POST.
   Тому функція розгортається з --no-verify-jwt, а замість JWT її
   захищає спільний секрет: Telegram додає його заголовком до кожного
   запиту, і все без нього ми відкидаємо ще до читання тіла.

   ЖОДНИХ ІМПОРТІВ — з тієї ж причини, що й у check-domains: якщо
   імпорт не розв'яжеться, функція падає ще до запуску, і ззовні це
   не відрізнити від несправного бота.

   Розгортання:
     supabase functions deploy telegram-bot --no-verify-jwt

   ЩОБ КОМАНДИ ЗʼЯВИЛИСЬ У МЕНЮ TELEGRAM
   Кнопки під повідомленням працюють одразу, а от список команд за
   слешем Telegram показує лише той, який йому назвали. Один раз,
   своїм токеном бота:

     curl -s -X POST "https://api.telegram.org/bot<ТОКЕН>/setMyCommands" \
       -H 'content-type: application/json' -d '{"commands":[
         {"command":"status","description":"Зведення по парку"},
         {"command":"spend","description":"Спенд за сьогодні"},
         {"command":"cabs","description":"Кабінети докладніше"},
         {"command":"domains","description":"Стан доменів"},
         {"command":"menu","description":"Кнопки"},
         {"command":"stop","description":"Відвʼязати цей чат"}]}'

   Не зробити — команди все одно працюють, просто їх не підказують.
*/

const CODE_LIFE_HINT = 'Код живе 15 хвилин.';

type Link = {
  user_id: string; email: string | null; team_name: string | null;
  code: string | null; code_expires: string | null;
};

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function reply(token: string, chat: number | string, text: string,
                    keys?: unknown): Promise<void> {
  try {
    const body: Record<string, unknown> = {
      chat_id: chat, text, disable_web_page_preview: true
    };
    // Без parse_mode: у пошті й іменах трапляються символи, на яких
    // розмітка Telegram спотикається і відповідає 400.
    if (keys) body.reply_markup = keys;
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (_e) { /* не відповіли — не привід падати */ }
}

/* Кнопки. Inline, а не клавіатура знизу: вони лишаються під тим
   повідомленням, до якого належать, і не займають місце назавжди. */
const KEYS = {
  inline_keyboard: [
    [{ text: '\u{1F4CA} Зведення', callback_data: 'sum' },
     { text: '\u{1F4B0} Спенд',    callback_data: 'spend' }],
    [{ text: '\u{1F5C2} Кабінети', callback_data: 'cabs' },
     { text: '\u{1F310} Домени',   callback_data: 'dom' }]
  ]
};

/* Telegram лишає кнопку «в натисканні», поки не відповіси на callback.
   Не відповісти — і вона крутиться, аж поки людина не вирішить, що
   бот помер. */
async function ackButton(token: string, id: string): Promise<void> {
  try {
    await fetch('https://api.telegram.org/bot' + token + '/answerCallbackQuery', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id })
    });
  } catch (_e) { /* кнопка покрутиться — не привід падати */ }
}

async function pick(base: string, hdr: Record<string, string>,
                    path: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(base + '/rest/v1/' + path, { headers: hdr });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch (_e) { return []; }
}

/* Хто цей чат. Не знайшли — жодних даних: показати стан парку тому,
   хто просто знайшов бота в пошуку, було б найдешевшою витокою. */
async function whoIs(base: string, hdr: Record<string, string>,
                     chat: number | string): Promise<Link | null> {
  const rows = await pick(base, hdr, 'tg_links'
    + '?select=user_id,email,team_name,code,code_expires'
    + '&chat_id=eq.' + encodeURIComponent(String(chat)) + '&limit=1');
  return (rows[0] as Link) || null;
}

const num = (v: unknown): number => Number(v) || 0;

/* Скільки хвилин тому. Число без цієї підписки читається як «зараз»,
   а воно може бути годинної давності: бот показує те, що привіз
   останній прогін синхронізації, а не питає Facebook сам. */
function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!(ms >= 0)) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'щойно';
  if (m < 60) return m + ' хв тому';
  const h = Math.floor(m / 60);
  return h < 24 ? h + ' год тому' : Math.floor(h / 24) + ' дн тому';
}

const CUR: Record<string, string> = { USD: '$', EUR: '\u20AC', UAH: '\u20B4' };
const money = (n: number, cur: string): string => {
  const v = (Math.round(n * 100) / 100).toLocaleString('en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return CUR[cur] ? CUR[cur] + v : v + ' ' + cur;
};

/* Стан кабінета словами — той самий словник, що й у дашборді. */
const BAD = ['banned', 'closed', 'closing'];
const SICK = ['unsettled', 'review', 'grace'];

type Park = {
  live: number; total: number; ads: number;
  banned: string[]; lost: string[]; sick: string[];
  spend: Record<string, number>;
  seen: string;
};

/* Те, що бот показує, збирається ОДИН раз: усі відповіді — різні
   зрізи тієї самої картини, і збирати її двічі означало б колись
   показати в двох кнопках різні числа. */
async function park(base: string, hdr: Record<string, string>, uid: string): Promise<Park> {
  const rows = await pick(base, hdr, 'fb_accounts'
    + '?select=account_id,name,status,spend_today,currency,ads_active,'
    + 'missing_since,synced_at&created_by=eq.' + encodeURIComponent(uid) + '&limit=500');

  /* Архівовані не рахуємо — інакше бот сперечався б із дашбордом,
     де людина їх свідомо прибрала з очей. Ключ і як написано, і
     самими цифрами: підпис буває act_123…, номер — 123…. */
  const arch = new Set<string>();
  const keys = (v: unknown) => {
    const s2 = String(v == null ? '' : v).trim();
    if (!s2) return [] as string[];
    const d = s2.replace(/\D/g, '');
    return d && d !== s2 ? [s2, d] : [s2];
  };
  (await pick(base, hdr, 'accounts_mapping'
    + '?select=account_id,fb_account_id&status=eq.archive&created_by=eq.'
    + encodeURIComponent(uid) + '&limit=500'))
    .forEach(r => { keys(r.account_id).forEach(k => arch.add(k));
                    keys(r.fb_account_id).forEach(k => arch.add(k)); });

  const out: Park = { live: 0, total: 0, ads: 0, banned: [], lost: [], sick: [],
                      spend: {}, seen: '' };
  rows.forEach(r => {
    const id = String(r.account_id || '');
    if (keys(id).some(k => arch.has(k))) return;
    out.total++;
    const name = String(r.name || id);
    const st = String(r.status || '').toLowerCase();
    const cur = String(r.currency || 'USD');
    const sp = num(r.spend_today);
    if (sp) out.spend[cur] = (out.spend[cur] || 0) + sp;
    out.ads += num(r.ads_active);
    if (num(r.ads_active) > 0 || sp > 0) out.live++;
    if (r.missing_since) out.lost.push(name);
    else if (BAD.includes(st)) out.banned.push(name);
    else if (SICK.includes(st)) out.sick.push(name + ' \u00b7 ' + st);
    const at = String(r.synced_at || '');
    if (at && at > out.seen) out.seen = at;
  });
  return out;
}

const list = (a: string[], max: number): string =>
  a.slice(0, max).map(x => '   \u2022 ' + x).join('\n')
  + (a.length > max ? '\n   …і ще ' + (a.length - max) : '');

const spendLine = (p: Park): string => {
  const cur = Object.keys(p.spend);
  /* Валюти НЕ складаємо. Сто доларів і сто гривень — це не двісті
     чогось, а число, якому не можна вірити. */
  return cur.length ? cur.map(c => money(p.spend[c], c)).join(' + ') : '\u2014';
};

/* Підпис під будь-якою відповіддю: коли ці числа востаннє оновлювались.
   Без нього все читається як «просто зараз», а воно може бути
   годинної давності — бот не питає Facebook, він показує те, що привіз
   останній прогін синхронізації. */
const seenLine = (p: Park): string =>
  p.seen ? '\n\n\u{1F551} дані від синхронізації ' + ago(p.seen)
         : '\n\n\u{1F551} синхронізації ще не було';

function cardSum(p: Park): string {
  const bad = p.banned.length + p.lost.length + p.sick.length;
  return '\u{1F4CA} Зведення\n\n'
    + 'Крутять: ' + p.live + ' з ' + p.total + '\n'
    + 'Оголошень активних: ' + p.ads + '\n'
    + 'Спенд сьогодні: ' + spendLine(p) + '\n'
    + (bad ? '\n\u26A0 Потребує уваги: ' + bad + '\n'
           + (p.banned.length ? 'Забанені: ' + p.banned.length + '\n' : '')
           + (p.lost.length ? 'Токен не бачить: ' + p.lost.length + '\n' : '')
           + (p.sick.length ? 'Проблеми з оплатою: ' + p.sick.length + '\n' : '')
       : '\n\u2705 Проблемних кабінетів немає\n')
    + seenLine(p);
}

function cardSpend(p: Park): string {
  return '\u{1F4B0} Спенд сьогодні\n\n' + spendLine(p) + '\n\n'
    + 'Крутять: ' + p.live + ' кабінет(ів), ' + p.ads + ' оголошень\n'
    /* «Сьогодні» рахує Facebook, і рахує у поясі КАБІНЕТА. Не сказати
       цього — значить одного разу отримати питання, чому о першій ночі
       числа не обнулились. */
    + '\n\u2139 «Сьогодні» — за часовим поясом кабінета, не вашим.'
    + seenLine(p);
}

function cardCabs(p: Park): string {
  if (!p.total) return '\u{1F5C2} Кабінетів не знайшлось.\n\n'
    + 'Або синхронізація ще не проходила, або токен не додано.';
  return '\u{1F5C2} Кабінети: ' + p.total + '\n\n'
    + 'Крутять: ' + p.live + '\n'
    + 'Тихі: ' + (p.total - p.live - p.banned.length - p.lost.length) + '\n'
    + (p.banned.length ? '\n\u{1F534} Забанені (' + p.banned.length + '):\n'
        + list(p.banned, 8) + '\n' : '')
    + (p.lost.length ? '\n\u{1F7E3} Токен не бачить (' + p.lost.length + '):\n'
        + list(p.lost, 8) + '\n' : '')
    + (p.sick.length ? '\n\u{1F7E1} Оплата (' + p.sick.length + '):\n'
        + list(p.sick, 8) + '\n' : '')
    + seenLine(p);
}

async function cardDom(base: string, hdr: Record<string, string>,
                       uid: string): Promise<string> {
  const rows = await pick(base, hdr, 'domains'
    + '?select=domain,status,broken_since&created_by=eq.' + encodeURIComponent(uid)
    + '&limit=500');
  if (!rows.length) return '\u{1F310} Доменів у списку немає.';
  const bad = rows.filter(r => ['down', 'notfound', 'danger']
    .includes(String(r.status || '').toLowerCase()));
  if (!bad.length) return '\u{1F310} Домени: ' + rows.length
    + '\n\n\u2705 Усі відповідають.';
  const WORD: Record<string, string> = {
    down: 'не відповідає', notfound: '404', danger: 'мітка' };
  return '\u{1F310} Домени: ' + rows.length + '\n\n'
    + '\u26A0 Зламані: ' + bad.length + '\n'
    + bad.slice(0, 12).map(r => '   \u2022 ' + r.domain + ' \u2014 '
        + (WORD[String(r.status)] || r.status)).join('\n')
    + (bad.length > 12 ? '\n   …і ще ' + (bad.length - 12) : '');
}

const MENU = 'Що показати?';

Deno.serve(async (req) => {
  /* Telegram чекає 200 майже на все. Відповідь 500 він вважає збоєм і
     надсилає те саме повідомлення знову і знову — тож помилки ковтаємо
     тут, а не віддаємо назовні. */
  try {
    return await handle(req);
  } catch (_e) {
    return new Response('ok', { status: 200 });
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const want = Deno.env.get('TG_WEBHOOK_SECRET') || '';
  const got = req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  /* Секрет обов'язковий. Якщо його не налаштували, функція не
     «працює без захисту», а не працює взагалі: інакше адресу бота
     міг би смикати будь-хто, хто її вгадав. */
  if (!want || !sameSecret(got, want)) return new Response('forbidden', { status: 403 });

  const token = Deno.env.get('TG_BOT_TOKEN') || '';
  const base = Deno.env.get('SUPABASE_URL') || '';
  const svc = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!token || !base || !svc) return new Response('ok', { status: 200 });

  /* Від сервісної ролі, бо інакше нічого не вийде: шукати рядок за
     кодом треба ДО того, як стане відомо, чий він, а RLS саме цього й
     не дозволяє. */
  const hdr = { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json' };

  const upd = await req.json();

  /* ── натиснули кнопку ── */
  const cb = upd?.callback_query;
  if (cb) {
    const cbChat = cb?.message?.chat?.id;
    // Кнопку відпускаємо ПЕРШОЮ дією: поки цього не зробиш, вона
    // крутиться, і бот виглядає мертвим, хоч і працює.
    await ackButton(token, String(cb.id || ''));
    if (cbChat) await answer(token, base, hdr, cbChat, String(cb.data || 'sum'));
    return new Response('ok', { status: 200 });
  }

  const msg = upd?.message || upd?.edited_message;
  const chat = msg?.chat?.id;
  const text = String(msg?.text || '').trim();
  if (!chat || !text) return new Response('ok', { status: 200 });

  const who = msg?.from?.username ? '@' + msg.from.username
            : [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(' ') || null;

  /* ── /start із кодом ── */
  if (text.startsWith('/start')) {
    const code = text.slice('/start'.length).trim();
    if (!code) {
      await reply(token, chat,
        'Привіт. Я надсилаю сповіщення про домени: що за ніч отримало мітку, '
        + 'перестало відповідати або віддає 404.\n\n'
        + 'А ще показую стан парку на запит: /status, /spend, /cabs, /domains.\n\n'
        + 'Щоб я знав, чиї кабінети й домени вам показувати, відкрийте дашборд → '
        + 'Settings → Telegram alerts → Connect Telegram. Там буде посилання, '
        + 'яке все зробить само.');
      return new Response('ok', { status: 200 });
    }

    const res = await fetch(base + '/rest/v1/tg_links'
      + '?select=user_id,email,team_name,code,code_expires'
      + '&code=eq.' + encodeURIComponent(code) + '&limit=1', { headers: hdr });
    const rows: Link[] = res.ok ? await res.json() : [];
    const row = rows[0];

    if (!row) {
      await reply(token, chat,
        'Цей код не підходить. Найчастіше це означає, що ним уже скористались — '
        + 'код одноразовий.\n\nВізьміть новий: дашборд → Settings → Telegram alerts → '
        + 'Connect Telegram.');
      return new Response('ok', { status: 200 });
    }
    if (row.code_expires && Date.parse(row.code_expires) < Date.now()) {
      await reply(token, chat,
        'Термін коду вийшов. ' + CODE_LIFE_HINT + '\n\n'
        + 'Візьміть новий: дашборд → Settings → Telegram alerts → Connect Telegram.');
      return new Response('ok', { status: 200 });
    }

    /* Код згоряє тут-таки, разом із записом чату. Один запит, тож
       двічі скористатись ним не вийде навіть у перегонах. */
    const patch = await fetch(base + '/rest/v1/tg_links?user_id=eq.' + encodeURIComponent(row.user_id), {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ chat_id: String(chat), tg_name: who,
                             linked_at: new Date().toISOString(),
                             code: null, code_expires: null })
    });
    if (!patch.ok) {
      const why = await patch.text();
      /* Найімовірніше спрацював унікальний індекс на chat_id: цей
         Telegram уже прив'язаний до іншого акаунта. Мовчати тут не
         можна — ззовні це виглядало б як «бот не відповів». */
      await reply(token, chat, /23505|duplicate/i.test(why)
        ? 'Цей Telegram уже прив\'язаний до іншого акаунта дашборда.\n\n'
          + 'Спершу відв\'яжіть його: надішліть мені /stop, а потім спробуйте код ще раз.'
        : 'Не вдалось зберегти зв\'язок. Спробуйте ще раз за хвилину.');
      return new Response('ok', { status: 200 });
    }

    await reply(token, chat,
      'Готово. Сповіщення про домени приходитимуть сюди.\n\n'
      + 'Акаунт: ' + (row.email || 'без пошти')
      + (row.team_name ? '\nКоманда: ' + row.team_name : '')
      + '\n\nПисатиму вранці і тільки тоді, коли є про що: домен отримав мітку, '
      + 'перестав відповідати або віддає 404. Якщо за ніч нічого не змінилось — мовчу.\n\n'
      + 'Відв\'язати будь-коли: /stop');
    return new Response('ok', { status: 200 });
  }

  /* ── /stop ── */
  if (text.startsWith('/stop')) {
    const res = await fetch(base + '/rest/v1/tg_links?chat_id=eq.' + encodeURIComponent(String(chat)), {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=representation' },
      body: JSON.stringify({ chat_id: null, tg_name: null, linked_at: null })
    });
    const rows = res.ok ? await res.json() : [];
    await reply(token, chat, rows.length
      ? 'Відв\'язано. Більше сюди не пишу.\n\nПередумаєте — дашборд → Settings → '
        + 'Telegram alerts → Connect Telegram.'
      : 'Цей чат ні до чого не прив\'язаний, тож і відв\'язувати нема чого.');
    return new Response('ok', { status: 200 });
  }

  /* ── запит про стан ── */
  const ASK: Record<string, string> = {
    '/status': 'sum', '/sum': 'sum', '/spend': 'spend',
    '/cabs': 'cabs', '/cabinets': 'cabs', '/domains': 'dom', '/menu': 'menu'
  };
  const cmd = ASK[text.split(/[\s@]/)[0].toLowerCase()];
  if (cmd) {
    await answer(token, base, hdr, chat, cmd);
    return new Response('ok', { status: 200 });
  }

  /* ── усе інше ── */
  await reply(token, chat,
    'Що я вмію:\n\n'
    + '/status — зведення: скільки крутить, спенд, що зламалось\n'
    + '/spend — спенд за сьогодні\n'
    + '/cabs — кабінети докладніше\n'
    + '/domains — стан доменів\n'
    + '/menu — кнопки замість команд\n\n'
    + '/start <код> — прив\'язати цей чат до акаунта дашборда\n'
    + '/stop — відв\'язати\n\n'
    + 'Код береться в дашборді: Settings → Telegram alerts → Connect Telegram.',
    KEYS);
  return new Response('ok', { status: 200 });
}

/* Одна відповідь на всі входи — і команду, і кнопку. Інакше вони рано
   чи пізно розійшлись би, і /spend показував би не те, що кнопка
   «Спенд». */
async function answer(token: string, base: string, hdr: Record<string, string>,
                      chat: number | string, kind: string): Promise<void> {
  const link = await whoIs(base, hdr, chat);
  /* Чат не прив'язаний — жодних чисел. Бот ходить ключем сервісної
     ролі й бачить усе; показати стан парку тому, хто просто знайшов
     бота в пошуку, було б найдешевшою витокою з можливих. */
  if (!link || !link.user_id) {
    await reply(token, chat,
      'Цей чат ще не прив\'язаний до акаунта, тож показувати нема чого.\n\n'
      + 'Дашборд → Settings → Telegram alerts → Connect Telegram.');
    return;
  }
  if (kind === 'menu') { await reply(token, chat, MENU, KEYS); return; }
  if (kind === 'dom') {
    await reply(token, chat, await cardDom(base, hdr, link.user_id), KEYS);
    return;
  }
  const p = await park(base, hdr, link.user_id);
  const text = kind === 'spend' ? cardSpend(p)
             : kind === 'cabs'  ? cardCabs(p)
             : cardSum(p);
  await reply(token, chat, text, KEYS);
}
