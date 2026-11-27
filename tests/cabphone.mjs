/* ═══════════ КАБІНЕТИ НА ТЕЛЕФОНІ: КАРТКИ ═══════════

   «про мобільний вигляд найбільше хочу cabinets». Заморожені клітинки
   (~500px) ширші за екран телефона, тож чисел і кнопки «⋯» не було
   видно взагалі. На ширині до 640px рядок стає карткою; підписи чисел
   беруться з data-l. Заодно: «all rules are switched off» замість
   «the schedule may have stopped», коли правила вимкнені руками. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const CB = fs.readFileSync('build/cabinets.js', 'utf8');
const CSS = fs.readFileSync('build/design.css', 'utf8');
const RL = fs.readFileSync('build/rules.js', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

ok('числа кабінета несуть підпис колонки', /data-l="\$\{cabEsc\(col\.label\)\}"\$\{tip \? ` title="\$\{cabEsc\(tip\)\}"` : ''\}\$\{style\}>/.test(CB));
ok('спенд кабінета і вузла підписаний', (CB.match(/class="ta-r cab-num cab-today" data-l="Spend"/g) || []).length === 2);
ok('числа дерева теж', /data-l="\$\{cabEsc\(col\.label\)\}"\$\{tip \? ` title="\$\{cabEsc\(tip\)\}"` : ''\}>\$\{\s*cabNodeCell/.test(CB));

const blk = (CSS.match(/КАБІНЕТИ НА ТЕЛЕФОНІ[\s\S]*$/) || [''])[0];
ok('блок стоїть у кінці стилів і лише до 640px', /@media \(max-width: 640px\) \{/.test(blk));
ok('заморожування на телефоні знято', /position: static !important;/.test(blk));
ok('рядок — картка, а не рядок таблиці', /> tbody > tr \{ display: flex; flex-wrap: wrap;/.test(blk));
ok('підпис береться з data-l', /content: attr\(data-l\);/.test(blk));
ok('порожні числа сховані, спенд лишається', /td\[data-l\]:not\(\.cab-today\):has\(> \.cab-na:only-child\)/.test(blk));
ok('кнопки під палець', /min-width: 42px; min-height: 38px;/.test(blk));
ok('назва в дереві переноситься, а не ріжеться', /\.cab-node \.cd-lbl \{ white-space: normal;/.test(blk));
ok('дужки в блоці зведені', (blk.match(/\{/g) || []).length === (blk.match(/\}/g) || []).length);

ok('вимкнені правила названі своїм іменем', /all rules are switched off, so nothing is/.test(RL)
  && /const anyOn = \(rlRules \|\| \[\]\)\.some\(r => r && r\.on !== false\);/.test(RL));
ok('попередження про розклад лишилось для решти випадків', /the schedule may have/.test(RL));
ok('і це доїхало в зібраний index.html', /content: attr\(data-l\)/.test(OUT) && /all rules are switched off/.test(OUT));

ok('назва вузла дерева — окремим рядком', /order: 1; flex: 0 0 100%; min-width: 0; padding: 4px;/.test(CSS));
ok('картка кабінета на телефоні — поверх списку',
  /#cab-detail \{\s*position: fixed; left: 8px; right: 8px; top: 8px; bottom: 64px;/.test(CSS));

/* ── згорнута шапка ── */
const HT = fs.readFileSync('build/cabinets.html', 'utf8');
ok('у шапці є лупа і Filters лише для телефона', /id="cab-q-btn" onclick="cabQToggle\(\)" class="cab-rules cab-ico cab-m-only"/.test(HT)
  && /id="cab-flt-btn" onclick="cabFltToggle\(\)" class="cab-rules cab-m-only"/.test(HT));
ok('на компʼютері їх не видно', /\.cab-m-only \{ display: none; \}/.test(CSS));
/* Перемикача періоду більше немає ніде: сторінка — FB LIVE (сьогодні),
   інший день — календарем у Stat. Day. */
ok('періоду в шапці немає — ні кнопками, ні списком', !/cab-range/.test(HT) && !/cabSetRange|cab-range-m/.test(CB)
  && !/cab-range-m|#cab-range/.test(CSS));
ok('збережений колись період не читається', /localStorage\.removeItem\('cab_range'\)/.test(CB)
  && !/localStorage\.getItem\('cab_range'\)/.test(CB));
ok('назва сторінки — FB LIVE (значок + Live, для читалок — FB Live)', /aria-label="FB Live"/.test(HT) && />Live<\/span><\/h2>/.test(HT)
  && /<span class="sb-lbl">FB LIVE<\/span>/.test(fs.readFileSync('build/shell.html', 'utf8')));
ok('назва кабінета на телефоні — за класом, а не за номером комірки', /\.cab-tr > td\.cab-name-td \{ order: 1;/.test(CSS) && !/\.cab-tr > td:nth-child\((4|5|6)\)/.test(CSS) && /<td class="cab-name-td">/.test(fs.readFileSync('build/cabinets.js', 'utf8')));
ok('фіксація ширин не працює в режимі карток', /getComputedStyle\(row\)\.display !== 'table-row'/.test(fs.readFileSync('build/cabinets.js', 'utf8')));
ok('обгортки шапки на телефоні прозорі', /\.cab-hl, \.cab-hr, \.cab-tools \{ display: contents; \}/.test(CSS));
ok('пошук по центру — сіткою з рівними боками',
  /grid-template-columns: minmax\(max-content, 1fr\) minmax\(150px, 340px\) minmax\(max-content, 1fr\);/.test(CSS));
ok('галочка — своя, а не системна', /\.cd-mk \{[^}]*appearance: none;/.test(CSS)
  && /\.cd-mk:checked, \.cd-mk:indeterminate \{ background-color: var\(--accent\) !important;/.test(CSS));
ok('згорнуто: кнопки й плитки сховані, попередження про архів лишається',
  /#cabinets-section:not\(\.cab-flt-open\) #cab-tiles > :not\(\.cab-archlost\) \{ display: none; \}/.test(CSS)
  && /#cabinets-section:not\(\.cab-flt-open\) #cab-rules-btn,/.test(CSS));
ok('пошук із текстом не ховається', /#cabinets-section:not\(\.cab-q-open\) #cab-search:placeholder-shown \{ display: none; \}/.test(CSS));
ok('Filters показує вибраний статус', /fl\.textContent = cabFilter && cabFilter !== 'all'/.test(CB));
ok('стан Filters памʼятається на пристрої', /localStorage\.setItem\('cab-flt-open', open \? '1' : '0'\)/.test(CB));
ok('шапка доїхала в index.html', /id="cab-flt-btn"/.test(OUT) && /cabFltToggle = function/.test(OUT) && /class="cab-head"/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
