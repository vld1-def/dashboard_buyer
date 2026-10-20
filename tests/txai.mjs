/* ═══════════ ДОПИСАТИ ТЕКСТИ МОДЕЛЛЮ ═══════════

   Головне, що мусить вижити: модель НІЧОГО не зберігає сама. Вона
   віддає кандидатів, вони лежать окремо від банку, і в банк іде лише
   те, що людина позначила галочкою. Текст, який поїде в кабінет,
   мусить пройти через людину — модель помиляється мовчки.

   Решта перевірок про те, щоб витрата була видимою й обмеженою, а
   чужий текст у відповіді не став розміткою. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8138;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const BANK = [
  { id: 't1', geo: 'KG', cat: 'push', lang: 'ru', title: 'Перший', text: 'Забери бонус сьогодні' },
  { id: 't2', geo: 'KG', cat: 'push', lang: 'ru', title: '', text: 'Виплата за 10 хвилин' },
  { id: 't3', geo: 'PL', cat: 'push', lang: 'pl', title: '', text: 'Odbierz bonus' }
];

const setup = () => page.evaluate(bank => {
  txItems = bank.map(x => ({ ...x }));
  txGeo = 'KG'; txCat = 'push'; txEditId = null;
  txAiItems = []; txAiPicked = []; txAiNote = ''; txAiBusy = false;
  window.__sent = [];
  window.__saved = null;
  setTeamSetting = async (k, v) => { window.__saved = [k, v]; };
  getTeamSetting = async () => JSON.stringify(bank);
  txAiCall = async body => {
    window.__sent.push(body);
    return { items: [{ title: 'A', text: 'Новий текст один' },
                     { title: '', text: 'Новий текст два' }],
             model: 'claude-haiku-5-5', usage: { in: 900, out: 300 },
             cost_usd: 0.00024, left_today: 97, problems: [] };
  };
  document.getElementById('texts-modal').classList.remove('hidden');
  txRenderTree(); txRender();
}, BANK);

await setup();

ok('кнопка + AI стоїть у шапці вікна', await page.evaluate(() =>
  !!document.getElementById('tx-ai')
  && document.getElementById('tx-ai').closest('#texts-modal') !== null));

/* ─────────── запит: приклади з поточного фільтра ─────────── */
await page.evaluate(() => { window.__p = txAi(); });
await page.waitForTimeout(100);
const dlg = await page.evaluate(() => ({
  keys: [...document.querySelectorAll('.askwrap [data-k]')].map(e => e.dataset.k),
  body: document.querySelector('.askwrap .ask-body').textContent
}));
ok('питаємо лише те, чого не знаємо: скільки, мова, побажання',
  JSON.stringify(dlg.keys) === JSON.stringify(['n', 'lang', 'hint']), dlg.keys);
ok('і кажемо, що беремо за зразок', /2 текст\(ів\)/.test(dlg.body) && /KG/.test(dlg.body), dlg.body);

await page.evaluate(() => {
  const w = document.querySelector('.askwrap');
  w.querySelector('[data-k="n"]').value = '2';
  w.querySelector('[data-k="hint"]').value = 'коротше';
  w.querySelector('.ask-yes').click();
});
await page.evaluate(() => window.__p);
const sent = await page.evaluate(() => window.__sent[0]);
ok('у функцію пішли приклади САМЕ цього гео й слота',
  sent.examples.length === 2 && sent.examples.every(e => /бонус|Виплата/.test(e.text)), sent.examples);
ok('гео, слот і побажання теж', sent.geo === 'KG' && sent.cat === 'push' && sent.hint === 'коротше', sent);
ok('дія названа', sent.action === 'text' && sent.n === 2, sent);

/* Промпт — не рядок: сюди вписують акцію, умови й тон. Поле
   багаторядкове й тягнеться за ріжок, а Enter у ньому переводить
   рядок, а не закриває вікно недописаним. */
ok('поле «Чого хочемо» багаторядкове й розтяжне', await page.evaluate(async () => {
  const p = txAi();
  await new Promise(r => setTimeout(r, 60));
  const el = document.querySelector('.askwrap [data-k="hint"]');
  const ok = el.tagName === 'TEXTAREA' && getComputedStyle(el).resize === 'vertical';
  document.querySelector('.askwrap .ask-no').click();
  await p;
  return ok;
}));
ok('Enter у промпті не закриває вікно', await page.evaluate(async () => {
  const p = txAi();
  await new Promise(r => setTimeout(r, 60));
  const el = document.querySelector('.askwrap [data-k="hint"]');
  el.focus();
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 40));
  const still = !!document.querySelector('.askwrap');
  if (still) document.querySelector('.askwrap .ask-no').click();
  await p;
  return still;
}));

/* ─────────── кандидати лежать ОКРЕМО від банку ─────────── */
const cand = await page.evaluate(() => ({
  shown: !document.getElementById('tx-ai-box').classList.contains('hidden'),
  rows: document.querySelectorAll('#tx-ai-box .tx-ai-row').length,
  note: document.querySelector('#tx-ai-box .tx-ai-h span').textContent,
  bank: txItems.length,
  saved: window.__saved,
  inList: document.getElementById('tx-list').textContent.includes('Новий текст один')
}));
ok('кандидати показані', cand.shown && cand.rows === 2, cand);
ok('у банк нічого не пішло саме', cand.bank === 3 && cand.saved === null, cand);
ok('і в списку банку їх немає', !cand.inList, cand);
ok('видно модель, ціну й залишок на день',
  /haiku/.test(cand.note) && /\$0\.00024/.test(cand.note) && /97/.test(cand.note), cand.note);

/* Зберігається тільки позначене. */
const savedOne = await page.evaluate(async () => {
  txAiPick(0);
  await txAiSave();
  return { bank: txItems.length, first: txItems[0], left: txAiItems.length,
           key: (window.__saved || [])[0] };
});
ok('у банк пішов рівно один — позначений', savedOne.bank === 4 && savedOne.left === 1, savedOne);
ok('із гео й слотом того місця, де працювали',
  savedOne.first.geo === 'KG' && savedOne.first.cat === 'push' && savedOne.first.lang === 'ru',
  savedOne.first);
ok('із позначкою, що це AI — через місяць «хто це писав» мусить мати відповідь',
  savedOne.first.ai === true, savedOne.first);
ok('записали в той самий банк текстів', savedOne.key === 'texts_bank', savedOne.key);

/* ─────────── мова та, яку просили, а не та, що у фільтрі ───────────
   Зберігали її з ФІЛЬТРА, і хто генерував під «pl», маючи на екрані
   «усі мови», отримував у банку мову першого зразка. Мова — це те, що
   вписали у вікні генерації, і більше ніщо. */
await setup();
const langCase = await page.evaluate(async () => {
  const f = document.getElementById('tx-lang-filter');
  if (f) f.value = '';            // у фільтрі «усі мови»
  txAiCall = async () => ({ items: [{ title: 'P', text: 'Odbierz bonus dzisiaj', ua: 'про бонус' }],
                            model: 'grok-4.7', engine: 'xai', cost_usd: 0.001,
                            left_today: 9, problems: [] });
  const p = txAi();
  await new Promise(r => setTimeout(r, 60));
  const w = document.querySelector('.askwrap');
  w.querySelector('[data-k="lang"]').value = 'pl';
  w.querySelector('.ask-yes').click();
  await p;
  // Рядок під кандидатами читаємо ДО збереження: після нього там уже
  // звіт про збереження, а не про те, хто відповів.
  const note = txAiNote;
  txAiPick(0);
  await txAiSave();
  const fresh = txItems.find(t => t.text === 'Odbierz bonus dzisiaj');
  return { lang: fresh && fresh.lang, ua: fresh && fresh.ua, note };
});
ok('у банк пішла мова з вікна генерації, а не з фільтра', langCase.lang === 'pl', langCase);
ok('і український підпис зберігся разом із текстом', langCase.ua === 'про бонус', langCase);
ok('видно, яка саме модель відповіла', /grok/.test(langCase.note), langCase.note);

/* Підпис українською — щоб не читати десять варіантів чужою мовою
   заради того, щоб зрозуміти, чим вони різняться. */
await setup();
ok('підпис українською видно під кандидатом', await page.evaluate(async () => {
  txAiCall = async () => ({ items: [{ title: 'A', text: 'Odbierz bonus', ua: 'коротко про бонус' }],
                            model: 'grok-4.7', cost_usd: 0, left_today: 1, problems: [] });
  const p = txAi();
  await new Promise(r => setTimeout(r, 60));
  document.querySelector('.askwrap .ask-yes').click();
  await p;
  const box = document.getElementById('tx-ai-box');
  return !!box.querySelector('.tx-ai-ua')
      && box.querySelector('.tx-ai-ua').textContent.includes('коротко про бонус');
}));

/* Модель відмовилась або зробила зауваження — показуємо ЇЇ СЛОВА.
   «Розібрати нічого не вдалось» на місці сказаного відправляє шукати
   ваду в функції, якої там немає. */
await setup();
ok('сказане моделею видно замість «нічого не вдалось»', await page.evaluate(async () => {
  txAiCall = async () => ({ items: [], model: 'grok-4.7', cost_usd: 0.0007, left_today: 5,
                            problems: [], said: 'Не можу вигадувати подробиці призів.' });
  const p = txAi();
  await new Promise(r => setTimeout(r, 60));
  document.querySelector('.askwrap .ask-yes').click();
  await p;
  const t = document.querySelector('#tx-ai-box .tx-ai-h span').textContent;
  return /Не можу вигадувати подробиці призів/.test(t) && /grok/.test(t);
}));

/* ─────────── відмова моделі не виглядає як порожнеча ─────────── */
ok('нерозгорнута функція називає команду розгортання', await page.evaluate(async () => {
  txAiCall = async () => { throw Object.assign(new Error('not deployed'), { code: 'missing' }); };
  txAiItems = []; txAiNote = '';
  window.__p = txAi();
  await new Promise(r => setTimeout(r, 60));
  document.querySelector('.askwrap .ask-yes').click();
  await window.__p;
  return /functions deploy ai/.test(document.querySelector('#tx-ai-box .tx-ai-h span').textContent);
}));
ok('ліміт на день показується як є, а не як збій', await page.evaluate(async () => {
  txAiCall = async () => { throw new Error('daily limit reached: 100 of 100 generations today.'); };
  window.__p = txAi();
  await new Promise(r => setTimeout(r, 60));
  document.querySelector('.askwrap .ask-yes').click();
  await window.__p;
  return /daily limit reached/.test(document.querySelector('#tx-ai-box .tx-ai-h span').textContent);
}));

/* Текст від моделі — чужий текст. Він іде в розмітку лише через txEsc. */
ok('кутова дужка з відповіді не стає розміткою', await page.evaluate(async () => {
  txAiCall = async () => ({ items: [{ title: '<b>t</b>', text: '<img src=x onerror="window.__xss=1">' }],
                            model: 'm', cost_usd: 0, left_today: 1, problems: [] });
  txAiItems = []; txAiPicked = [];
  window.__p = txAi();
  await new Promise(r => setTimeout(r, 60));
  document.querySelector('.askwrap .ask-yes').click();
  await window.__p;
  const box = document.getElementById('tx-ai-box');
  return !window.__xss && !box.querySelector('img')
      && box.textContent.includes('<img src=x');
}));

/* Закрити кандидатів — не те саме, що зберегти. */
ok('закриття кандидатів нічого не зберігає', await page.evaluate(() => {
  const was = txItems.length;
  txAiClose();
  return txItems.length === was
      && document.getElementById('tx-ai-box').classList.contains('hidden');
}));

await done(browser, srv, errs);
