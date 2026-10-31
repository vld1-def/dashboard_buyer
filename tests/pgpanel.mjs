/* ═══════════ ПАНЕЛЬ СТОРІНОК ═══════════

   У картці кабінета давно є «Comments…» — що пишуть під оголошеннями
   ЦЬОГО кабінета. Але пост Сторінки живе довше за оголошення, і коли
   оголошення зупинили, кабінетний шлях до коментаря не веде ніяк: у
   списку оголошень того посту вже немає.

   Тому тут список самих Сторінок. Стенд тримає те, через що це
   найчастіше й не працює, і те, на чому легко збрехати:
     • видно, де прибирати коментарі МОЖНА, а де Сторінку лише видали
       покрутити — і в «read only» кнопок дії немає зовсім;
     • стан коментаря показуємо трьома різними позначками, і
       «видалено» лишається на екрані: Facebook про видалене не
       пам'ятає нічого;
     • delete питає підтвердження, відмова не надсилає нічого;
     • праве місце одне: Сторінки, правила й картка кабінета взаємно
       закриваються. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8132;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* Замість функції fb-comments — свій відповідач: стенд перевіряє
   екран, а не Facebook. Запити записуємо, щоб було видно, ЩО саме
   пішло б у функцію. */
await page.evaluate(() => {
  window.__calls = [];
  window.__comments = [
    { id: 'c1', story: 'p1', page: 'Alpha', ad: 'Post about a bonus', live: true,
      message: 'спам спам', from: 'Spammer', created_time: '2026-10-20T06:00:00Z',
      is_hidden: false, likes: 0 },
    { id: 'c2', story: 'p1', page: 'Alpha', ad: 'Post about a bonus', live: true,
      message: 'а коли виплата?', from: 'Human', created_time: '2026-10-20T05:00:00Z',
      is_hidden: true, likes: 2 }
  ];
  pgCall = async body => {
    window.__calls.push(body);
    if (body.action === 'pages') return { pages: [
      { page_id: '111', name: 'Alpha', tasks: ['MODERATE'], can_moderate: true,
        pic: 'https://scontent.example/alpha.jpg', token: 'AgentX_12_BM' },
      /* Друга без аватарки навмисне: Facebook віддає picture не завжди,
         і рядок без неї має лишатись рівним, а не з'їжджати вліво. */
      { page_id: '222', name: 'Beta', tasks: ['ADVERTISE'], can_moderate: false, token: 'AgentX_12_BM' }
    ], problems: [] };
    if (body.action === 'page_list') return {
      comments: body.page_id === '111' ? window.__comments : [],
      page: body.page_id === '111' ? 'Alpha' : 'Beta',
      can_moderate: body.page_id === '111', posts: 3, looked: 3, problems: [] };
    if (body.action === 'page_act') return { action: body.what, done: body.comment_ids.length,
      failed: 0, problems: [] };
    return {};
  };
});

/* ─────────── відкриття панелі ─────────── */
await page.evaluate(() => { pgPanel(true); });
await page.waitForTimeout(120);
const opened = await page.evaluate(() => ({
  shown: !document.getElementById('pages-panel').classList.contains('hidden'),
  btn: document.getElementById('cab-pages-btn')?.classList.contains('is-on'),
  note: document.getElementById('pg-note').textContent,
  names: [...document.querySelectorAll('#pg-list .pg-name')].map(e => e.textContent),
  readonly: document.querySelectorAll('#pg-list .fcm-tag').length
}));
ok('панель відкривається з кнопки в шапці кабінетів', opened.shown && opened.btn, opened);
ok('у списку всі Сторінки токенів',
  JSON.stringify(opened.names) === JSON.stringify(['Alpha', 'Beta']), opened.names);
/* Підпис «N Page(s) · N where comments can be moderated» прибраний
   на прохання: коли Сторінки на екрані, він повторює те, що й так
   видно — порахувати два рядки можна очима, а право модерації стоїть
   міткою на самій Сторінці. Перевіряємо саме це: над списком порожньо
   й місця він не займає. */
ok('над списком Сторінок нічого не написано', opened.note.trim() === '', opened.note);
ok('порожній підпис не лишає по собі відступу',
  await page.evaluate(() => getComputedStyle(
    document.getElementById('pg-note')).display === 'none'));
ok('Сторінка без прав позначена read only', opened.readonly === 1, opened.readonly);

/* ЛОГО. Сторінки впізнають по ньому швидше, ніж по назві — надто коли
   половина зветься схоже. Але картинка з CDN Facebook протухає, тому
   рядок не має на неї спиратись: без аватарки лишається заглушка тієї
   ж ширини, інакше назви їхали б на різну відстань від краю. */
const pics = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#pg-list .pg-pick')];
  const slot = r => r.querySelector('.pg-pic');
  return rows.map(r => ({
    src: (slot(r) && slot(r).getAttribute('src')) || '',
    wide: slot(r) ? Math.round(slot(r).getBoundingClientRect().width) : 0,
    /* Адреса нашої сторінки не має їхати у Facebook із кожною
       аватаркою — це саме те, що віддає referrer. */
    quiet: slot(r) ? slot(r).getAttribute('referrerpolicy') : ''
  }));
});
ok('у Сторінки з аватаркою вона й стоїть',
  /alpha\.jpg/.test(pics[0].src), pics);
ok('без аватарки лишається заглушка тієї ж ширини',
  pics[1].src === '' && pics[1].wide === pics[0].wide, pics);
ok('адреса дашборда не їде у Facebook із кожною аватаркою',
  pics[0].quiet === 'no-referrer', pics);
/* Жодного лого в усіх Сторінках одразу — це не «Facebook не дав», а
   старіша збірка функції: поле приходить тим самим запитом. Без цього
   рядка на екрані просто літери, і причину видно нізвідки. */
/* ДВІ ПРИЧИНИ З ОДНИМ ВИГЛЯДОМ, і вгадувати не можна: лого немає або
   тому, що функція про поле ще не знає, або тому, що Facebook його не
   дав. Версія у відповіді їх і розрізняє — питання деплою чи питання
   Business Manager, а це різні місця, куди йти. */
const noPics = fn => page.evaluate(async v => {
  const keep = pgCall;
  pgCall = async b => b.action === 'pages'
    ? Object.assign(v ? { fn: v } : {}, { problems: [],
        pages: [{ page_id: '111', name: 'Alpha', tasks: ['MODERATE'],
                  can_moderate: true, token: 'T' }] })
    : keep(b);
  pgRows = null; await pgLoad(true);
  const el = document.getElementById('pg-note');
  const out = { shown: getComputedStyle(el).display !== 'none', text: el.textContent };
  pgCall = keep; pgRows = null; await pgLoad(true);
  return out;
}, fn);

const old = await noPics('');
ok('стара збірка без лого — названа деплоєм',
  old.shown && /deploy fb-comments/.test(old.text), old);
const cur = await noPics('2026-10-31.1');
ok('свіжа збірка без лого — це вже не деплой',
  cur.shown && !/deploy fb-comments/.test(cur.text), cur);
ok('і сказано, де насправді дивитись', /Business\s+Manager/.test(cur.text), cur);
ok('версію функції названо, щоб було видно, чому так вирішили',
  /2026-10-31\.1/.test(cur.text), cur);
ok('а коли лого є — рядка немає', await page.evaluate(() =>
  getComputedStyle(document.getElementById('pg-note')).display === 'none'));

ok('протухла картинка прибирає себе, а не ламає рядок',
  await page.evaluate(() => {
    const img = document.querySelector('#pg-list .pg-pic');
    return /this\.remove\(\)/.test(img.getAttribute('onerror') || '');
  }));

/* ─────────── коментарі Сторінки ─────────── */
await page.evaluate(() => pgPick('111'));
await page.waitForTimeout(120);
const cm = await page.evaluate(() => {
  const box = document.querySelector('#pg-list .pg-item.is-open .pg-cm');
  return { txt: box.textContent,
           tags: [...box.querySelectorAll('.fcm-tag')].map(e => e.textContent.trim()),
           acts: [...box.querySelectorAll('.fcm-acts button')].map(b => b.textContent.trim()),
           call: window.__calls[window.__calls.length - 1] };
});
ok('у функцію йде саме page_list із цією Сторінкою',
  cm.call.action === 'page_list' && cm.call.page_id === '111', cm.call);
ok('стан кожного коментаря видно окремою позначкою',
  cm.tags.includes('visible') && cm.tags.includes('hidden'), cm.tags);
ok('дії — сховати, показати, видалити',
  JSON.stringify(cm.acts) === JSON.stringify(['Hide', 'Show', 'Delete']), cm.acts);
ok('текст коментаря на екрані', /а коли виплата\?/.test(cm.txt), cm.txt.slice(0, 160));

/* Read only — без кнопок дії: показати їх означало б дізнатись про
   брак прав у мить, коли вже натиснув. */
await page.evaluate(() => pgPick('222'));
await page.waitForTimeout(120);
ok('у read-only Сторінці кнопок дії немає', await page.evaluate(() => {
  const box = document.querySelector('#pg-list .pg-item.is-open .pg-cm');
  return box.querySelectorAll('.fcm-acts button').length === 0
      && /Moderate content task/.test(box.textContent);
}));

/* ─────────── сховати ─────────── */
await page.evaluate(() => pgPick('111'));
await page.waitForTimeout(120);
const hid = await page.evaluate(async () => {
  pgToggle('c1');
  window.__calls = [];
  await pgAct('hide');
  return { call: window.__calls.find(c => c.action === 'page_act'),
           again: window.__calls.some(c => c.action === 'page_list') };
});
ok('сховати надсилає what=hide з вибраними id',
  hid.call && hid.call.what === 'hide'
  && JSON.stringify(hid.call.comment_ids) === JSON.stringify(['c1']), hid.call);
ok('після приховування список перечитується — стан знає Facebook, не ми', hid.again);

/* ─────────── видалити ─────────── */
const delNo = await page.evaluate(async () => {
  pgToggle('c1');
  window.__calls = [];
  const p = pgAct('delete');
  await new Promise(r => setTimeout(r, 60));
  const asked = !!document.querySelector('.askwrap');
  document.querySelector('.askwrap .ask-no').click();
  await p;
  return { asked, sent: window.__calls.length };
});
ok('видалення питає підтвердження', delNo.asked);
ok('відмова не надсилає нічого', delNo.sent === 0, delNo.sent);

const delYes = await page.evaluate(async () => {
  window.__calls = [];
  const p = pgAct('delete');
  await new Promise(r => setTimeout(r, 60));
  document.querySelector('.askwrap .ask-yes').click();
  await p;
  const box = document.querySelector('#pg-list .pg-item.is-open .pg-cm');
  const row = [...box.querySelectorAll('.fcm-row')][0];
  return { call: window.__calls.find(c => c.action === 'page_act'),
           tag: row.textContent.includes('deleted'),
           locked: row.querySelector('input').disabled,
           reread: window.__calls.some(c => c.action === 'page_list'),
           msg: box.textContent };
});
ok('підтвердили — пішло what=delete', delYes.call && delYes.call.what === 'delete', delYes.call);
/* Facebook про видалене не пам'ятає нічого: якби ми просто перечитали
   список, не лишилось би жодного слiду, що саме прибрали. */
ok('видалене лишається на екрані з позначкою deleted', delYes.tag, delYes.msg.slice(0, 200));
ok('і вибрати його вдруге вже не можна', delYes.locked);
ok('перечитування після видалення не затирає цей слід', !delYes.reread);
ok('скільки видалили — сказано', /1 comment\(s\) deleted/.test(delYes.msg), delYes.msg.slice(0, 200));

/* Стара версія функції про Сторінки не знає й падає на відсутньому
   account_id. Сире повідомлення відправило б шукати ваду в екрані. */
ok('стару версію функції називаємо прямо', await page.evaluate(async () => {
  const keep = pgCall;
  pgCall = async () => { throw new Error('account_id is required'); };
  pgRows = null;
  await pgLoad(true);
  const txt = document.getElementById('pg-note').textContent;
  pgCall = keep;
  pgRows = null;
  await pgLoad(true);
  return /older than this page/.test(txt) && /functions deploy fb-comments/.test(txt);
}));

/* Підпис ховається, коли Сторінки є. Якщо після цього не повертати
   його, перша ж помилка лягла б у схований елемент — текст у DOM є,
   а на екрані нічого. Саме так непомітно й зникають повідомлення
   про помилки. */
ok('помилка після успішного списку таки видима', await page.evaluate(async () => {
  pgRows = null; await pgLoad(true);                    // список є → підпис схований
  const keep = pgCall;
  pgCall = async () => { throw new Error('account_id is required'); };
  pgRows = null; await pgLoad(true);
  const seen = getComputedStyle(document.getElementById('pg-note')).display !== 'none';
  pgCall = keep; pgRows = null; await pgLoad(true);
  return seen;
}));

/* ─────────── праве місце одне ─────────── */
ok('правила закривають Сторінки', await page.evaluate(() => {
  pgPanel(true); rlPanel(true);
  return document.getElementById('pages-panel').classList.contains('hidden')
      && !document.getElementById('rules-panel').classList.contains('hidden');
}));
ok('Сторінки закривають правила', await page.evaluate(() => {
  rlPanel(true); pgPanel(true);
  return document.getElementById('rules-panel').classList.contains('hidden')
      && !document.getElementById('pages-panel').classList.contains('hidden');
}));
ok('картка кабінета теж забирає праве місце', await page.evaluate(() => {
  pgPanel(true);
  cabRows = [{ account_id: '1', provider_name: 'A' }];
  cabFb = [{ account_id: '1', name: 'A', status: 'active', currency: 'USD' }];
  cabPick('1');
  return document.getElementById('pages-panel').classList.contains('hidden');
}));

/* Фільтр по назві — у списку з двох десятків Сторінок потрібен відразу. */
ok('фільтр звужує список', await page.evaluate(() => {
  pgPanel(true);
  document.getElementById('pg-q').value = 'bet';
  pgPaint();
  const names = [...document.querySelectorAll('#pg-list .pg-name')].map(e => e.textContent);
  document.getElementById('pg-q').value = '';
  pgPaint();
  return names.length === 1 && names[0] === 'Beta';
}));

/* Текст коментаря чужий і сирий — у розмітку йде тільки через pgEsc. */
ok('чуже ім\'я з кутовою дужкою не стає розміткою', await page.evaluate(async () => {
  window.__comments = [{ id: 'x1', story: 'p1', page: 'Alpha', ad: 'p', live: true,
    message: '<img src=x onerror="window.__xss=1">', from: '<b>bad</b>',
    created_time: '2026-10-20T06:00:00Z', is_hidden: false, likes: 0 }];
  pgSel = '';
  await pgPick('111');
  const box = document.querySelector('#pg-list .pg-item.is-open .pg-cm');
  // <b> тут наш власний — у нього загорнуте ім'я автора. Важливо, що
  // ВСЕРЕДИНІ нього лежить текст, а не ще одна розмітка.
  const who = box.querySelector('.fcm-top b');
  return !window.__xss && !box.querySelector('img')
      && who.textContent === '<b>bad</b>' && who.children.length === 0
      && box.textContent.includes('<img src=x');
}));

await done(browser, srv, errs);
