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
