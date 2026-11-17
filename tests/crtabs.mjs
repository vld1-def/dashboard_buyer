/* ═══════════ CREATIVE ANALYZER: ВКЛАДКИ, DETECT У СПИСКУ, ПРИБИРАННЯ ═══════════

   Чотири згорнуті панелі стали вкладками; Detect переїхав зі шапки в
   список форматів; підпис «Creatives:» і мертва кнопка Reset Filter
   прибрані; залишки української в панелях перекладені. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 500) : '')); } };

const SRC = fs.readFileSync('index-legacy.html', 'utf8').replace(/\r\n/g, '\n');
const OUT = fs.readFileSync('index.html', 'utf8');

/* ═══ ВКЛАДКИ ═══ */
const a = SRC.indexOf("const CR_TABS = ['placements', 'trend', 'funnels', 'accounts', 'cabs'];");
const b = SRC.indexOf('// Стара назва — щоб нічого, що її ще кличе, не впало.');
const code = SRC.slice(a, b);

function tabs(saved) {
  const store = saved === undefined ? {} : { cr_tab: saved };
  const mk = k => ({ k, hidden: true, on: false,
    classList: { toggle(c, v) { if (c === 'hidden') this.o.hidden = v; else this.o.on = v; }, o: null } });
  const panels = {}, btns = [];
  const body = mk('body'); body.classList.o = body;
  ['placements', 'trend', 'funnels', 'accounts', 'cabs'].forEach(k => {
    const p = mk(k); p.classList.o = p; panels['cr-panel-' + k] = p;
    const bt = mk(k); bt.classList.o = bt; bt.dataset = { k }; btns.push(bt);
  });
  const env = {
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    document: { getElementById: id => id === 'cr-tabbody' ? body : (panels[id] || null), querySelectorAll: () => btns },
    crRenderPanels: null
  };
  const rendered = [];
  const api = new Function(...Object.keys(env), code
    + '\ncrRenderPanels = () => { crTabPaint(); rendered.push([...crOpenPanels].join()); };'
    + '\nreturn { crTab, crTabPaint, now: () => crTabNow, open: () => [...crOpenPanels] };')
    .bind(null, ...Object.values(env));
  // rendered must be visible inside: pass it through a closure
  const f = new Function('rendered', ...Object.keys(env), code
    + '\ncrRenderPanels = () => { crTabPaint(); rendered.push([...crOpenPanels].join()); };'
    + '\nreturn { crTab, crTabPaint, now: () => crTabNow, open: () => [...crOpenPanels] };');
  void api;
  return Object.assign(f(rendered, ...Object.values(env)), { panels, btns, store, rendered, body });
}

const t0 = tabs();
/* «по дефолту щоб якраз графік був відкритий, коли відкриваю креатив». */
ok('за замовчуванням відкритий Daily trend', t0.now() === 'trend' && t0.open().join() === 'trend');
t0.crTabPaint();
ok('видно лише графік, підсвічена його вкладка', !t0.panels['cr-panel-trend'].hidden
  && Object.entries(t0.panels).every(([k, p]) => k === 'cr-panel-trend' || p.hidden)
  && t0.btns.filter(x => x.on).map(x => x.k).join() === 'trend' && t0.body.hidden === false);
t0.crTab('funnels');
ok('клік відкриває вкладку: видно її одну, малюється лише вона', !t0.panels['cr-panel-funnels'].hidden
  && t0.panels['cr-panel-placements'].hidden && t0.rendered.join('|') === 'funnels'
  && t0.btns.filter(x => x.on).map(x => x.k).join() === 'funnels' && t0.body.hidden === false, t0.rendered);
t0.crTab('trend');
ok('інша вкладка замінює відкриту', t0.now() === 'trend' && !t0.panels['cr-panel-trend'].hidden
  && t0.panels['cr-panel-funnels'].hidden);
t0.crTab('trend');
ok('клік по відкритій згортає її назад', t0.now() === '' && Object.values(t0.panels).every(p => p.hidden)
  && t0.body.hidden === true && t0.btns.every(x => !x.on));
ok('вибір не памʼятається: наступний захід знову з графіком', tabs('accounts').now() === 'trend' && !('cr_tab' in t0.store));

/* ═══ DAILY TREND: ГРАФІК І ТАБЛИЦЯ ЗВʼЯЗАНІ ═══ */
ok('графік — Chart.js із пунктиром дашборду', /plugins: window\.cfCrosshair \? \[window\.cfCrosshair\] : \[\]/.test(SRC)
  && /cfWait\(cv, \(\) => crTrendDraw\(days\)\)/.test(SRC));
ok('рядок таблиці ставить день на графіку', /onmouseenter="crTrendHover\(\$\{i\}, 'row'\)"/.test(SRC)
  && /ch\.tooltip\.setActiveElements\(act,/.test(SRC));
ok('графік підсвічує рядок', /onHover: \(evt, els\) => crTrendHover\(els && els\.length \? els\[0\]\.index : -1, 'chart'\)/.test(SRC)
  && /row\.classList\.add\('is-hot'\)/.test(SRC));
ok('день без депозитів — розрив CPA, а не нуль', /m\.d \? Math\.round\(m\.s \/ m\.d\) : null/.test(SRC));
t0.crTab('nope');
ok('невідома вкладка нічого не міняє', t0.now() === '');

ok('у розмітці вкладки з англійськими назвами', /<div class="cr-tabs" id="cr-tabs"/.test(SRC)
  && ['Placement', 'Daily trend', 'Funnels', 'Cabinet or random'].every(n => new RegExp('onclick="crTab\\(\'[a-z]+\'\\)">' + n + '</button>').test(SRC)));

/* ═══ АКТИВНІ КАБІНЕТИ — ВКЛАДКОЮ З ПЛИТКАМИ ═══ */
ok('активні кабінети — п\'ята вкладка', /data-k="cabs" onclick="crTab\('cabs'\)">Active cabinets <span id="cr-cabs-note"/.test(SRC)
  && /<div id="cr-panel-cabs" class="hidden"><div id="cr-account-list" class="cr-cab-tiles"><\/div><\/div>/.test(SRC));
ok('стіни кнопок під карткою більше немає', !/Active Cabinets:<\/p>/.test(SRC));
ok('плитка: назва, спенд, частка; клік — фільтр', /class="cr-cab-tile\$\{activeCrAcc===name \? ' is-on' : ''\}"/.test(SRC)
  && /<span class="cr-cab-bar"><i style="width:\$\{pct\}%"><\/i><\/span>/.test(SRC));

/* ═══ ШАПКА: ФІЛЬТРИ ОДНИМ БЛОКОМ, NOT LAUNCHED ═══ */
{
  const box = (SRC.match(/<div class="seg-box cr-filters">[\s\S]*?\n              <\/div>/) || [''])[0];
  ok('гео, формат, теги, папки й зірки — в одному блоці', ['creative-geo-filter', 'creative-format-filter', 'creative-tag-filter', 'cr-group-tags', 'cr-star-only']
    .every(id => box.includes('id="' + id + '"')), box.slice(0, 200));
  ok('кнопки блока вмикаються класом is-on', /getElementById\('cr-group-tags'\)\?\.classList\.toggle\('is-on', crGroupTags\)/.test(SRC)
    && /getElementById\('cr-star-only'\)\?\.classList\.toggle\('is-on', crStarOnly\)/.test(SRC));
  ok('Not launched — кнопка без порогу', /class="seg-btn">Not launched<\/button>/.test(SRC) && !/cr-cold-max|crColdMax/.test(SRC));
  ok('у режимі Not launched лише файли, що не лились', /if \(crCold\) \{\n    list = \[\];/.test(SRC));
  ok('порожній список каже чому', /Every file in Drive has been launched/.test(SRC) && /Drive folder is not set/.test(SRC));
}
const CSS = fs.readFileSync('build/design.css', 'utf8');
ok('спенд не вилазить: перша колонка ширша, шрифт підганяється', /function crFitNums\(\)/.test(SRC)
  && /#cr-metrics \{ grid-template-columns: minmax\(0, 1\.5fr\) repeat\(4, minmax\(0, 1fr\)\) !important; \}/.test(CSS));
ok('Group у FB LIVE без власної плашки в блоці', /\.cab-tools > \.cab-grp \{\n    background-color: transparent !important; border: 0 !important;/.test(CSS));
ok('стрілок розгортайок більше немає', !/cr-arrow-/.test(SRC));
ok('панелі малюються разом із фарбуванням вкладок', /function crRenderPanels\(\) \{\n  crTabPaint\(\);/.test(SRC));

/* ═══ DETECT У СПИСКУ ФОРМАТІВ ═══ */
const fa = SRC.indexOf("const CR_DETECT_LABEL = ");
const fb = SRC.indexOf('async function crDetectFormats() {');
function pick(start, choose) {
  const log = { detect: 0, search: 0 };
  const f = new Function('crDetectFormats', 'searchCreative', SRC.slice(fa, fb) + '\nreturn crFmtPick;')(
    () => { log.detect++; }, () => { log.search++; });
  const sel = { value: start };
  f(sel);                       // запамʼятати поточний фільтр
  sel.value = choose;
  f(sel);
  return Object.assign(log, { value: sel.value });
}
const d1 = pick('video', '__detect');
ok('«Detect from Drive…» запускає розпізнавання, а фільтр лишається яким був', d1.detect === 1 && d1.value === 'video', d1);
const d2 = pick('', 'static');
ok('звичайний вибір формату просто фільтрує', d2.detect === 0 && d2.search === 2 && d2.value === 'static', d2);
ok('окремої кнопки Detect у шапці немає', !/<button id="cr-fmt-detect"/.test(SRC)
  && /<option value="__detect" id="cr-fmt-detect"/.test(SRC));
ok('хід розпізнавання видно в сповіщенні', /step\.say\(`Detecting formats/.test(SRC) && /step\.done\('Formats detected: '/.test(SRC));

/* ═══ ПРИБРАНЕ Й ПЕРЕКЛАДЕНЕ ═══ */
ok('підпису «Creatives:» над списком немає', !/>Creatives:<\/p>/.test(SRC));
ok('мертвої кнопки Reset Filter немає', !/onclick="resetCreativeScope\(\)"/.test(SRC) && !/Reset Filter<\/button>/.test(SRC));
ok('залишки української в панелях перекладені', ['Найдешевший депозит', 'На яких воронках', 'надійних ${', '>Днів<', 'Кліків у даних немає', 'У межах шуму» —']
  .every(x => !SRC.includes(x)) && /Cheapest deposit/.test(SRC) && /Within noise/.test(SRC));
ok('і це доїхало в зібраний index.html', /function crTab\(kind\)/.test(OUT) && /\.cr-tabs \{/.test(OUT)
  && /crFmtPick\(this\)/.test(OUT) && !/На яких funnel/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
