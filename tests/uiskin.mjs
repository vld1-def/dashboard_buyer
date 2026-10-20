/* ═══════════ ВИГЛЯД І ДРІБНИЦІ ДАШБОРДА ═══════════

   Один стенд на кілька дрібних правок однієї сторінки — кожна з них
   ламається тихо й по-своєму:
     2  дерево кабінетів починалось за трьома порожніми стовпцями;
     4  ручний режим синку (щоб «5 годин тому» не читалось як збій);
     11 вікно питання — скло, а не півпрозора плівка;
     19 підказка графіка на багато гео;
     21 забанена апка не йде в список шаблонів;
     22 шапки вікон на токенах дизайну, а не на кольорах Tailwind;
     24 інша іконка Report Builder у сайдбарі. */
import { readFileSync } from 'node:fs';
import { serve, open, checks, ROOT } from './_harness.mjs';

const PORT = 8134;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* ─────────── 2. дерево починається від краю ─────────── */
const tree = await page.evaluate(() => {
  cabRows = [{ id: 1, account_id: '111', provider_name: 'A' }];
  cabFb = [{ account_id: '111', name: 'A', status: 'active', currency: 'USD',
             spend_today: 10, ads: 1, ads_active: 1 }];
  cabLoaded = true;
  /* Самі числа рядка тут не перевіряються — перевіряється РОЗКЛАДКА,
     тож cdFields підміняємо: інакше стенд тягнув би за собою цілий
     вузол дерева з метриками. */
  window.cdFields = () => ({ key: 'k1', name: 'Camp', status: '', spend: '$1',
                             kids: 0, sw: '', marked: false });
  const html = cabNodeRow({}, 0, false, []);
  const box = document.createElement('table');
  box.innerHTML = '<tbody>' + html + '</tbody>';
  const tds = [...box.querySelectorAll('td')];
  return { empty: tds.filter(t => t.className === 'cab-x').length,
           span: box.querySelector('.cab-nd')?.getAttribute('colspan'),
           total: tds.length };
});
ok('порожніх стовпців перед назвою більше немає', tree.empty === 0, tree);
ok('клітинка назви накриває їх собою', tree.span === '4', tree);

const ind = await page.evaluate(() => {
  const d = document.createElement('div');
  d.innerHTML = '<table><tbody><tr class="cab-node cd-d1"><td class="cab-nd">'
              + '<span class="cab-nd-in" id="t-in">x</span></td></tr></tbody></table>';
  document.body.appendChild(d);
  const v = getComputedStyle(document.getElementById('t-in')).paddingLeft;
  d.remove();
  return v;
});
ok('відступ першого рівня зменшено', ind === '12px', ind);

/* ─────────── 11. скло ─────────── */
const glass = await page.evaluate(async () => {
  const p = ask({ title: 'T', body: 'b' });
  const w = document.querySelector('.askwrap');
  const box = w.querySelector('.askbox');
  const g = el => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter;
  const out = { wrap: g(w), box: g(box), bg: getComputedStyle(box).backgroundImage };
  w.querySelector('.ask-no').click();
  await p;
  return out;
});
ok('тло вікна розмиває сторінку, а не просто темнить', /blur/.test(glass.wrap), glass.wrap);
ok('саме вікно теж скло', /blur/.test(glass.box) && /saturate/.test(glass.box), glass.box);
ok('поверхня скла з перепадом світла, а не рівна', /gradient/.test(glass.bg), glass.bg);

/* ─────────── 19. підказка графіка ───────────

   Графік малює build/trend.js, і його помічники лежать у тому ж
   блоці, що й робота з Chart.js. Chart сюди не доїжджає (CDN закритий
   політикою проксі), тож блок падає й const того блока лишаються в
   TDZ. Тому беремо ДІЙСНИЙ код помічників із файлу модуля й
   виконуємо його окремо: перевіряється та сама логіка, що поїде в
   продакшн, а не її переказ. */
const trend = readFileSync(ROOT + '/build/trend.js', 'utf8');
const tipSrc = trend.slice(trend.indexOf('const CF_TIP_WIDE'),
                           trend.indexOf('\nfunction', trend.indexOf('function cfTipRow') + 5));
ok('помічники підказки є в модулі графіка',
  /function cfTipRow/.test(tipSrc) && /cfTipWide/.test(tipSrc), tipSrc.slice(0, 60));
ok('підказка просить моноширинний шрифт — інакше стовпці розсиплються',
  /bodyFont: \{ family: 'ui-monospace/.test(trend));
ok('таблиця вмикається лише в режимі гео',
  /cfTipN = isGeo \? \(items \|\| \[\]\)\.length : 0;/.test(trend));
ok('рахуємо вже відфільтровані точки — без нульових і вимкнених',
  trend.indexOf('filter(item)') < trend.indexOf('beforeBody(items)'));

const tip = await page.evaluate(src => {
  const mk = new Function(src + '; return { cfTipWide, cfTipRow, set: n => { cfTipN = n; } };');
  const m = mk();
  m.set(4); const few = m.cfTipWide();
  m.set(5); const many = m.cfTipWide();
  m.set(0); const none = m.cfTipWide();
  m.set(9);
  return { few, many, none,
           head: m.cfTipRow(['GEO', 'SPEND', 'PROFIT', 'INS', 'REG', 'DEP', 'CPA']),
           row: m.cfTipRow(['KG', '$1,200', '+$300', '12', '8', '3', '$400']) };
}, tipSrc);
ok('до чотирьох гео лишається докладний вигляд', tip.few === false, tip);
ok('від пʼяти — таблиця', tip.many === true, tip);
ok('жодного гео — жодної таблиці', tip.none === false, tip);
ok('рядок і шапка однакової ширини', tip.head.length === tip.row.length, [tip.head, tip.row]);
ok('назва ліворуч, числа по правому краю стовпця',
  tip.head.startsWith('GEO ')
  && tip.row.indexOf('$1,200') + '$1,200'.length === tip.head.indexOf('SPEND') + 'SPEND'.length,
  [tip.head, tip.row]);

/* ─────────── 21. забанена апка ─────────── */
const ban = await page.evaluate(() => {
  apFunnels = [
    { ktid: 'a1', funnel_name: 'Live [sator]', geo: 'KG', is_app: true, status: 'active' },
    { ktid: 'a2', funnel_name: 'Banned [sator]', geo: 'KG', is_app: true, status: 'ban' },
    { ktid: 'a3', funnel_name: 'Old [sator]', geo: 'KG', is_app: true }   // до міграції
  ];
  const list = apFunnelsFor({ provider: 'sator', geo: 'KG' }).list.map(f => f.ktid);
  return { list, isBan: [apIsBan(apFunnels[0]), apIsBan(apFunnels[1]), apIsBan(apFunnels[2])] };
});
ok('забанена апка зі списку шаблонів зникає',
  !ban.list.includes('a2') && ban.list.includes('a1'), ban.list);
ok('рядок без стану (до міграції) лишається живим',
  ban.list.includes('a3') && ban.isBan[2] === false, ban);
ok('стан читається саме як ban', JSON.stringify(ban.isBan) === JSON.stringify([false, true, false]), ban.isBan);

/* ─────────── 22. шапки вікон ─────────── */
const skin = await page.evaluate(() => {
  const win = id => {
    const m = document.getElementById(id);
    return { title: !!m.querySelector('.mw-title'), sub: !!m.querySelector('.mw-sub'),
             x: !!m.querySelector('.mw-x'),
             tw: m.querySelector('h2')?.className.includes('text-xl') || false };
  };
  return { files: win('files-modal'), texts: win('texts-modal'),
           apps: win('apps-modal'), acc: win('accounts-modal') };
});
['files', 'texts', 'apps', 'acc'].forEach(k => {
  ok('вікно ' + k + ': заголовок і хрестик на токенах дизайну',
    skin[k].title && skin[k].x && !skin[k].tw, skin[k]);
});
ok('у вікнах більше немає кольорових кнопок Tailwind', await page.evaluate(() =>
  ['files-modal', 'texts-modal', 'apps-modal', 'accounts-modal'].every(id =>
    !/bg-(teal|emerald|sky|amber)-600/.test(document.getElementById(id).innerHTML))));
ok('перемикач Прілки/PWA не фарбується режимом', await page.evaluate(() => {
  apMode = 'pwa'; apModePaint();
  const a = document.getElementById('ap-tab-pwa').className;
  apMode = 'app'; apModePaint();
  const b = document.getElementById('ap-tab-app').className;
  return a === 'ap-tab is-on' && b === 'ap-tab is-on'
      && !document.getElementById('ap-title').className.includes('italic');
}));

/* ─────────── 4. ручний режим — для всіх і без налаштування ───────────

   Розділу «Sync schedule» більше немає: темп і перемикач описували
   розклад, якого для кабінетів не існує. Поля, які ні на що не
   впливають, гірші за відсутні — їх крутять і чекають наслідків. */
const gone = await page.evaluate(() => ({
  group: document.documentElement.innerHTML.includes('Sync schedule'),
  fields: ['fb-pace-auto', 'fb-pace-day', 'fb-pace-night', 'fb-pace-from', 'fb-pace-to']
    .filter(id => document.getElementById(id)),
  fns: ['fbPaceLoad', 'fbPaceSave', 'fbPacePaint'].filter(f => typeof window[f] === 'function')
}));
ok('розділу Sync schedule немає', !gone.group, gone);
ok('жодного поля темпу не лишилось', gone.fields.length === 0, gone.fields);
ok('ні функцій, які їх зберігали', gone.fns.length === 0, gone.fns);

/* «5 годин тому» мусить читатись як «так і просили», а не як збій —
   і тепер безумовно, бо іншого режиму немає. */
const man2 = await page.evaluate(() => {
  cabRender();
  const el = document.getElementById('cab-sync-ago');
  return { t: el.title, cls: el.classList.contains('is-manual') };
});
ok('підказка на кнопці синку каже, що оновлення лише на запит',
  /only when you ask/.test(man2.t) && man2.cls, man2);
ok('і більше не посилає в налаштування, яких немає', !/Settings/.test(man2.t), man2.t);

/* ─────────── 24. іконка Report Builder ─────────── */
const icon = await page.evaluate(() => {
  const b = document.querySelector('.sb-item[data-nav="reports"] svg');
  const files = document.querySelector('.sb-item[data-hub="records"] svg');
  return { d: b.innerHTML, same: b.innerHTML === (files ? files.innerHTML : '') };
});
ok('іконка звіту більше не аркуш із загнутим кутом', !/M14 2v6h6/.test(icon.d), icon.d.slice(0, 80));
ok('і не збігається з сусідніми', !icon.same);

await done(browser, srv, errs);
