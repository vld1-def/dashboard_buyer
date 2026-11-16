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
const a = SRC.indexOf("const CR_TABS = ['placements', 'trend', 'funnels', 'accounts'];");
const b = SRC.indexOf('// Стара назва — щоб нічого, що її ще кличе, не впало.');
const code = SRC.slice(a, b);

function tabs(saved) {
  const store = saved === undefined ? {} : { cr_tab: saved };
  const mk = k => ({ k, hidden: true, on: false,
    classList: { toggle(c, v) { if (c === 'hidden') this.o.hidden = v; else this.o.on = v; }, o: null } });
  const panels = {}, btns = [];
  ['placements', 'trend', 'funnels', 'accounts'].forEach(k => {
    const p = mk(k); p.classList.o = p; panels['cr-panel-' + k] = p;
    const bt = mk(k); bt.classList.o = bt; bt.dataset = { k }; btns.push(bt);
  });
  const env = {
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    document: { getElementById: id => panels[id] || null, querySelectorAll: () => btns },
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
  return Object.assign(f(rendered, ...Object.values(env)), { panels, btns, store, rendered });
}

const t0 = tabs();
ok('перший раз відкрита Placement', t0.now() === 'placements' && t0.open().join() === 'placements');
t0.crTabPaint();
ok('видно рівно одну панель, і її кнопка підсвічена', Object.values(t0.panels).filter(p => !p.hidden).length === 1
  && !t0.panels['cr-panel-placements'].hidden && t0.btns.filter(x => x.on).map(x => x.k).join() === 'placements');
t0.crTab('funnels');
ok('клік перемикає вкладку: інші ховаються, малюється лише відкрита', !t0.panels['cr-panel-funnels'].hidden
  && t0.panels['cr-panel-placements'].hidden && t0.rendered.join('|') === 'funnels'
  && t0.btns.filter(x => x.on).map(x => x.k).join() === 'funnels', t0.rendered);
ok('вибір памʼятається', t0.store.cr_tab === 'funnels');
ok('наступний захід відкриває ту саму вкладку', tabs('accounts').now() === 'accounts');
ok('сміття в памʼяті не ламає: знову Placement', tabs('zzz').now() === 'placements');
t0.crTab('nope');
ok('невідома вкладка нічого не міняє', t0.now() === 'funnels');

ok('у розмітці чотири вкладки з англійськими назвами', /<div class="cr-tabs" id="cr-tabs"/.test(SRC)
  && ['Placement', 'Daily trend', 'Funnels', 'Cabinets'].every(n => new RegExp('onclick="crTab\\(\'[a-z]+\'\\)">' + n + '</button>').test(SRC)));
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
