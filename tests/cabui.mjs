/* ═══════════ КАБІНЕТИ, РЕПОРТ-БІЛДЕР, ЧЕРГА КОМЕНТАРІВ ═══════════

   Набір прохань від 2026-11-09:
   • ✎ і ⏰ одним рядком під лімітом;
   • за замовчуванням No grouping;
   • замість In review — Live (не бан, не архів, з токеном); Idle прибрати;
   • Campaign / Ads only і список не ховати, а гасити; Camp → Campaign;
   • репорт-білдер: розкрита група з ОДНИМ дочірнім рядком цифр не пише;
   • коментарі: черга не застрягає на мертвих кабінетах, Pages — усе. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const CJ = fs.readFileSync('build/cabinets.js', 'utf8');
const CH = fs.readFileSync('build/cabinets.html', 'utf8');
const CD = fs.readFileSync('build/cabdrill.js', 'utf8');
const CSS = fs.readFileSync('build/design.css', 'utf8');
const LEG = fs.readFileSync('index-legacy.html', 'utf8');
const CM = fs.readFileSync('supabase/functions/fb-comments/index.ts', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

/* ── ліміт ── */
ok('✎ і ⏰ в одному блоці під сумою', /<div class="cab-lim-acts"><button[^]*?cabLimitEdit[^]*?<button[^]*?cabLimitPlan[^]*?<\/div>/.test(CJ));
ok('блок не переноситься', /\.cab-lim-acts \{ display: flex; flex-wrap: nowrap;/.test(CSS));

/* ── групування ── */
ok('за замовчуванням без групування', /cabGroup = '', cabSel = null;/.test(CJ));
ok('і селект показує No grouping', /<option value="" selected>No grouping<\/option>/.test(CH)
  && !/value="profile" selected/.test(CH));

/* ── плитки ── */
const liveSrc = (CJ.match(/const CAB_LIVE = [^\n]*/) || [''])[0];
const CAB_LIVE = new Function(liveSrc + '\nreturn CAB_LIVE;')();
ok('Live — не бан, не архів, з токеном',
  CAB_LIVE({ state: 'running' }) && CAB_LIVE({ state: 'review' }) && CAB_LIVE({ state: 'idle' })
  && !CAB_LIVE({ state: 'banned' }) && !CAB_LIVE({ state: 'archived' }) && !CAB_LIVE({ state: 'notoken' }));
ok('плитки: без In review і Idle, з Live',
  /const CAB_TILES = \['banned', 'notoken', 'live', 'running', 'archived'\];/.test(CJ));
ok('фільтр Live працює', /cabFilter === 'live' \? CAB_LIVE\(c\)/.test(CJ));
ok('збережений у браузері review/idle не дає порожнього екрана',
  /\(cabFilter === 'review' \|\| cabFilter === 'idle'\) \? CAB_LIVE\(c\)/.test(CJ));
ok('сортування за станом не зачеплене', /const CAB_ORDER = \['banned', 'notoken', 'review', 'running', 'idle', 'archived'\];/.test(CJ));

/* ── кнопки дерева ── */
ok('кнопки дерева стоять завжди', /const tools = typeof cdHeadBits === 'function'/.test(CJ));
ok('без відкритого кабінета — сірі й неактивні', /flt-tools\$\{cabTreeId \? '' : ' is-off'\}/.test(CJ)
  && /\.flt-tools\.is-off \{ opacity: \.35;[^}]*pointer-events: none;/.test(CSS));
ok('Camp → Campaign', />Campaign<\/button>/.test(CD) && !/>Camp<\/button>/.test(CD));

/* ── репорт-білдер ── */
ok('розкрита група з одним дочірнім — без цифр',
  /if\(open && n\.kids\.length===1\) return `<td class="p-3 py-2\.5 text-xs text-right border-b border-white\/5"><\/td>`;/.test(LEG));
ok('і це доїхало в зібраний index.html', /if\(open && n\.kids\.length===1\)/.test(OUT));

/* ── коментарі ── */
ok('сканер бере лише живі кабінети', /'&status=in\.\(' \+ SCAN_STATUS \+ '\)'/.test(CM)
  && /const SCAN_STATUS = 'active,grace,unsettled';/.test(CM));
ok('позначка «перевірено» — і на відмові Graph',
  /problems\.push\(cabTag\(acc, tok\) \+ ': ' \+ \(e as Error\)\.message\);\n\s*await stampScanned\(acc\);\n\s*continue;/.test(CM));
ok('і коли нема токена чи прав', /if \(!tok\) \{ await stampScanned\(acc\); continue; \}/.test(CM)
  && /pages_read_engagement'\)\) \{ await stampScanned\(acc\); continue; \}/.test(CM));
ok('позначка на відмові не зсуває comments_seen_at', /body: JSON\.stringify\(\{ comments_scanned_at: new Date\(\)\.toISOString\(\) \}\)/.test(CM));
ok('за прогін — 25 кабінетів', /const SCAN_ACCOUNTS = 25;/.test(CM));
ok('Pages: рекламні пости з усіх привʼязаних кабінетів', /const DARK_ACCOUNTS = 200;/.test(CM));
ok('Pages: межа постів — дедлайн, а не 100', /const PAGE_POSTS = 1000;/.test(CM));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
