/* ═══════════ CREATIVE ANALYZER: ЧЕРГА НА ТЕСТ ═══════════

   «черга на тест сподобалось». Позначаєш креативи «залити наступними»,
   вони збираються в список, назви копіюються одним кліком.

   Код черги дістаємо з джерела й проганяємо з підробною сторінкою. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 500) : '')); } };

const SRC = fs.readFileSync('index-legacy.html', 'utf8').replace(/\r\n/g, '\n');
const OUT = fs.readFileSync('index.html', 'utf8');

const a = SRC.indexOf('let crQueue = [];');
const b = SRC.indexOf('let crStars = new Set();');
const code = SRC.slice(a, b);

function mount({ answers = [] } = {}) {
  const log = { saved: [], searched: 0, toasts: [], copied: [], asked: [] };
  const el = () => ({ cls: new Set(['hidden']), textContent: '',
    classList: { toggle(c, v) { v ? this.s.add(c) : this.s.delete(c); }, s: null } });
  const dom = {};
  ['cr-queue-only', 'cr-queue-n', 'cr-queue-copy', 'cr-queue-clear'].forEach(id => {
    const e = el(); e.classList.s = e.cls; dom[id] = e; });
  const env = {
    document: { getElementById: id => dom[id] || null },
    setTeamSetting: async (k, v) => { log.saved.push([k, v]); },
    searchCreative: () => { log.searched++; },
    toast: (t, k) => log.toasts.push(String(t)),
    ask: async o => { log.asked.push(o); return answers.shift(); },
    navigator: { clipboard: { writeText: async t => { log.copied.push(t); } } }
  };
  const api = new Function(...Object.keys(env), code
    + '\nreturn { crQKey, crQueued, crQueueBtn, crQueueList, crToggleQueue, crToggleQueueOnly, crQueuePaint, crQueueCopy, crQueueClear,'
    + ' q: () => crQueue.slice(), only: () => crQueueOnly, set: v => { crQueue = v; } };')(...Object.values(env));
  return Object.assign(api, { log, dom });
}
const ev = () => ({ n: 0, stopPropagation() { this.n++; }, preventDefault() { this.n++; } });

const m = mount();
ok('ключ — назва без розширення файла', m.crQKey('KG_JS_674.mp4') === 'KG_JS_674' && m.crQKey(' KG_JS_674.MOV ') === 'KG_JS_674'
  && m.crQKey('KG_JS_674') === 'KG_JS_674' && m.crQKey('a.b_674') === 'a.b_674' && m.crQKey(null) === '');

const e1 = ev();
m.crToggleQueue(e1, 'KG_JS_674.mp4');
m.crToggleQueue(ev(), 'TJ_6nI2a');
ok('клік кладе в чергу й зберігає її списком', m.q().join() === 'KG_JS_674,TJ_6nI2a'
  && m.log.saved.at(-1)[0] === 'creative_queue' && m.log.saved.at(-1)[1] === '["KG_JS_674","TJ_6nI2a"]', m.log.saved);
ok('клік у рядку не відкриває посилання й не вибирає креатив', e1.n === 2);
ok('файл із Drive і той самий креатив зі статистики — один запис', m.crQueued('KG_JS_674') && m.crQueued('KG_JS_674.mp4'));
ok('лічильник у шапці й кнопки копіювання/очищення зʼявились', m.dom['cr-queue-n'].textContent === '2'
  && !m.dom['cr-queue-copy'].cls.has('hidden') && !m.dom['cr-queue-clear'].cls.has('hidden'));
ok('список перемальовується після кожної зміни', m.log.searched === 2);

m.crToggleQueue(ev(), 'KG_JS_674');
ok('повторний клік прибирає з черги', m.q().join() === 'TJ_6nI2a' && m.dom['cr-queue-n'].textContent === '1');
m.crToggleQueue(ev(), 'KG_AB_570');

/* ── кнопка в рядку ── */
ok('кнопка рядка показує стан', /is-on/.test(m.crQueueBtn('TJ_6nI2a')) && /Remove from the test queue/.test(m.crQueueBtn('TJ_6nI2a'))
  && !/is-on/.test(m.crQueueBtn('GE_1')) && /Queue to test next/.test(m.crQueueBtn('GE_1')));
ok('апостроф у назві не ламає onclick', /crToggleQueue\(event,'KG_d\\'or'\)/.test(m.crQueueBtn("KG_d'or")));

/* ── режим «лише черга» ── */
const stats = [{ cid: 'KG_AB_570', s: 40 }, { cid: 'GE_1', s: 9 }, { cid: 'TJ_6nI2a.mp4', s: 0, _drive: {} }];
const ql = m.crQueueList(stats);
ok('лише черга, у порядку складання', ql.map(c => c.cid).join() === 'TJ_6nI2a.mp4,KG_AB_570', ql);
ok('рядки беруться ті самі, що й у списку (зі спендом і файлом)', ql[1].s === 40 && !!ql[0]._drive);
const ql2 = m.crQueueList([{ cid: 'GE_1', s: 9 }]);
ok('те, що відсіяв інший фільтр, із черги не зникає', ql2.map(c => c.cid).join() === 'TJ_6nI2a,KG_AB_570'
  && ql2.every(c => c._q === true && c.s === 0), ql2);
m.crToggleQueueOnly();
ok('кнопка шапки вмикає режим і підсвічується', m.only() === true && m.dom['cr-queue-only'].cls.has('is-on'));
m.crToggleQueueOnly();
ok('і вимикає', m.only() === false && !m.dom['cr-queue-only'].cls.has('is-on'));

/* ── копіювання ── */
await m.crQueueCopy();
ok('копіюються назви стовпчиком, у порядку черги', m.log.copied[0] === 'TJ_6nI2a\nKG_AB_570'
  && m.log.toasts.some(t => /Copied 2 creative name/.test(t)), m.log);

/* ── очищення ── */
const no = mount({ answers: [false] });
no.set(['A', 'B']);
await no.crQueueClear();
ok('очищення питає, і відмова нічого не чіпає', no.q().length === 2 && no.log.saved.length === 0 && no.log.asked.length === 1);
const yes = mount({ answers: [true] });
yes.set(['A', 'B']);
await yes.crQueueClear();
ok('згода спорожнює чергу й зберігає це', yes.q().length === 0 && yes.log.saved.at(-1)[1] === '[]'
  && yes.dom['cr-queue-copy'].cls.has('hidden') && yes.dom['cr-queue-n'].textContent === '');
const empty = mount();
await empty.crQueueCopy(); await empty.crQueueClear();
ok('порожня черга: копіювати й очищати нема чого', empty.log.copied.length === 0 && empty.log.asked.length === 0);

/* ── як це вшито ── */
ok('черга читається тим самим запитом, що й зірки', /'creative_format', 'report_tags', 'creative_queue'\]/.test(SRC)
  && /crQueue = Array\.isArray\(q\)/.test(SRC));
ok('фільтр «лише черга» стоїть у збиранні списку', /if \(crQueueOnly\) list = crQueueList\(list\);/.test(SRC));
ok('кнопка є в обох рядках: і в креатива зі статистикою, і у файла з Drive', (SRC.match(/\$\{crQueueBtn\(c\.cid\)\}/g) || []).length === 2);
ok('у шапці — Queue, копіювання й очищення', /id="cr-queue-only"/.test(SRC) && /id="cr-queue-copy"/.test(SRC) && /id="cr-queue-clear"/.test(SRC));
ok('і це доїхало в зібраний index.html', /function crQueueList\(list\)/.test(OUT) && /\.cr-q-top\.is-on/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
