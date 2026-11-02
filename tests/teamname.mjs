/* ═══════════ НАЗВУ КОМАНДИ НОСИТЬ ТОКЕН ═══════════

   «Чому якщо я перейменував команду, коли підвязую акаунти вони
   летять до команди під іншою назвою?»

   Бо fb_tokens.team_name ставиться ОДИН раз — коли токен зберігали, з
   тієї команди, яка була вибрана тоді. Далі fb-sync штампує цією
   назвою все, що пише: fb_accounts, fb_spend_daily, fb_ad_today,
   fb_cabinet_pages. Перейменування токена не чіпає, тож рядок,
   заведений рукою, лягає під НОВОЮ назвою (сторінка пише currentTeam),
   а все, що приносить синк по тому ж кабінету — під СТАРОЮ. А кабінети
   сторінка ріже саме по команді.

   Стенд тримає три речі:

     1. розбіжність ВИДНО — і в списку токенів, і в кабінетах, причому
        в кабінетах навіть тоді, коли решта кабінетів видна: саме так
        це й виглядає після перейменування;
     2. «своє під чужим підписом» відрізняється від «чужий кабінет
        чужого баєра» — по token_id, бо токени нам віддає лише RLS;
     3. кнопка не лише міняє підпис, а й переганяє синк ЦЬОГО токена:
        без другої частини кабінети лишались би під старою назвою, і
        це виглядало б як «кнопка нічого не зробила». */
import fs from 'node:fs';
import { serve, open, checks } from './_harness.mjs';

const PORT = 8181;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

await page.evaluate(() => {
  window.__t = { updates: [], synced: [], asked: null, answer: true, toasts: [], loaded: 0 };
  window.toast = (t, k) => window.__t.toasts.push({ t: String(t), k });
  window.toastStep = () => ({ say: () => {}, done: () => {} });
  window.ask = async o => { window.__t.asked = o; return window.__t.answer; };
  currentTeam = 'Improve';
  fbLoad = async () => { window.__t.loaded++; };
  fbSync = async (say, body) => { window.__t.synced.push(body || {}); };
  cabRefresh = () => {};
  sb.from = () => ({
    update: v => ({ eq: async (_c, id) => {
      window.__t.updates.push({ id, v });
      return { error: null };
    } })
  });
});

/* ── 1. рядок у списку токенів ── */
const line = await page.evaluate(() => {
  const mk = team => {
    fbRows = [{ id: 7, label: 'AgentX_p1_BM', team_name: team, status: 'ok',
                accounts: [{ id: '1' }], expires_at: null }];
    fbPaint();
    const box = document.getElementById('fb-list');
    return {
      warn: !!box.querySelector('.fb-teamwarn'),
      text: (box.querySelector('.fb-teamwarn') || {}).textContent || '',
      btn: [...box.querySelectorAll('.fb-teamwarn button')].map(b => b.textContent.trim()),
      call: [...box.querySelectorAll('.fb-teamwarn button')]
        .map(b => b.getAttribute('onclick')).join()
    };
  };
  return { same: mk('Improve'), other: mk('Makeberry'), none: mk('') };
});
ok('у своїй команді рядка немає', line.same.warn === false, line.same);
/* Показувати команду завжди означало б додати в кожен рядок слово,
   яке ні про що не питає. */
ok('і без назви теж немає', line.none.warn === false, line.none);
ok('при розбіжності рядок зʼявляється', line.other.warn === true, line.other);
ok('названі обидві команди',
  /Makeberry/.test(line.other.text) && /Improve/.test(line.other.text), line.other.text);
/* Головне, що мусить бути сказано: це не косметика — кабінети через
   це не видно. */
ok('сказано, що через це кабінети сховані',
  /hides them/.test(line.other.text), line.other.text);
ok('і є кнопка переносу',
  line.other.btn.some(b => /Move to Improve/.test(b)), line.other.btn);
ok('кнопка кличе саме цей токен', /fbTeamMove\(7\)/.test(line.other.call), line.other.call);

/* ── 2. перенос ── */
const moved = await page.evaluate(async () => {
  fbRows = [{ id: 7, label: 'AgentX_p1_BM', team_name: 'Makeberry', status: 'ok',
              accounts: [], expires_at: null }];
  Object.assign(window.__t, { updates: [], synced: [], asked: null, loaded: 0 });
  await fbTeamMove(7);
  return { ...window.__t };
});
ok('у питанні названо, куди переносимо',
  /Move this token to Improve/.test((moved.asked || {}).title || ''), moved.asked);
ok('і де воно лежить зараз', /Makeberry/.test((moved.asked || {}).body || ''), moved.asked);
/* Межа дії мусить бути сказана ДО неї: синк перекриває 30 днів, а
   глибша історія лишається під старою назвою. */
ok('сказано про межу в 30 днів', /30 days/.test((moved.asked || {}).body || ''), moved.asked);
ok('і що для всієї історії є TEAM_RENAME.sql',
  /TEAM_RENAME\.sql/.test((moved.asked || {}).body || ''), moved.asked);
ok('підпис токена змінено на поточну команду',
  moved.updates.length === 1 && moved.updates[0].id === 7
  && moved.updates[0].v.team_name === 'Improve', moved.updates);
/* Без перегону кабінети лишились би під старою назвою до наступного
   прогону — тобто кнопка виглядала б як та, що нічого не зробила. */
ok('і одразу переганяється синк', moved.synced.length === 1, moved.synced);
ok('саме цього токена, а не всього парку',
  moved.synced[0] && moved.synced[0].token_id === 7, moved.synced);
ok('список токенів перечитано', moved.loaded === 1, moved);

const no = await page.evaluate(async () => {
  fbRows = [{ id: 7, label: 'x', team_name: 'Makeberry', status: 'ok', accounts: [] }];
  Object.assign(window.__t, { updates: [], synced: [], answer: false });
  await fbTeamMove(7);
  window.__t.answer = true;
  return { updates: window.__t.updates, synced: window.__t.synced };
});
ok('відмова нічого не міняє', no.updates.length === 0 && no.synced.length === 0, no);

/* ── 3. кабінети кажуть про розбіжність ── */
const note = await page.evaluate(() => {
  const run = (mine, fb) => {
    cabFbMine = mine; cabFbErr = ''; cabFbOld = ''; cabDaysErr = '';
    cabFb = fb; cabFbRaw = fb.length + mine.length; cabFbTeams = [];
    cabTokens = { t1: 'AgentX' };
    cabNoteSaid = '';
    window.__t.toasts = [];
    cabFbNote();
    return (window.__t.toasts[0] || {}).t || '';
  };
  return {
    /* Частина кабінетів видна, частина підписана старою назвою —
       саме так це й виглядає після перейменування. */
    partial: run([{ account_id: '1', team_name: 'Makeberry', token_id: 't1' }],
                 [{ account_id: '2', team_name: 'Improve', token_id: 't1' }]),
    clean: run([], [{ account_id: '2', team_name: 'Improve', token_id: 't1' }])
  };
});
ok('розбіжність видно навіть коли решта кабінетів є',
  /1 cabinet\(s\) of your own token/.test(note.partial), note.partial);
ok('названо, під якою саме назвою вони лежать',
  /Makeberry/.test(note.partial) && /Improve/.test(note.partial), note.partial);
ok('і де це виправити',
  /Facebook tokens/.test(note.partial) && /Move to Improve/.test(note.partial), note.partial);
ok('коли все на місці — нічого не кажемо', note.clean === '', { clean: note.clean });

/* Чужий кабінет чужого баєра під іншою назвою — не ця новина: токена
   від нього в нас немає, і кликати тут нічого. Відбір по token_id саме
   про це. */
const src = fs.readFileSync('build/cabinets.js', 'utf8');
ok('своє від чужого відрізняємо по token_id',
  /r\.team_name !== currentTeam && cabTokens\[r\.token_id\]/.test(src), '');
/* Рядок у списку токенів не зʼявиться, якщо team_name не питати. */
ok('team_name справді читається з бази',
  /select\('id,label,team_name,/.test(fs.readFileSync('build/fbtok.js', 'utf8')), '');

/* ── 4. SQL: назви в одному місці ── */
const sql = fs.readFileSync('TEAM_RENAME.sql', 'utf8');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
ok('у скрипті є крок із назвами', /_rename_names/.test(code), '');
/* Доти обидві назви стояли літералами в пʼяти місцях: виправити
   чотири з пʼяти — найлегша помилка в цьому файлі, і коштувала б
   половини таблиць під старою назвою без жодного повідомлення. */
ok('стара назва лишилась ЛИШЕ в одному місці',
  (code.match(/'Makeberry'/g) || []).length === 1, (code.match(/'Makeberry'/g) || []));
ok('і нова теж', (code.match(/'Improve'/g) || []).length === 1, (code.match(/'Improve'/g) || []));
ok('кроки читають назви звідти',
  (code.match(/from public\._rename_names/g) || []).length >= 3, '');
/* Саме обхід усіх таблиць із team_name і робить так, що fb_tokens теж
   перейменовується — через це синк і починає писати правильно. */
ok('обхід іде по всіх таблицях із team_name',
  /column_name = 'team_name'/.test(code), '');

await done(browser, srv, errs);
