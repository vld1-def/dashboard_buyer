/* ═══════════ «ДОДАТИ АПКУ»: ГЕО З ДЕРЕВА І KTID З НАЗВИ ═══════════

   «коли додаю прілку через вікно, щоб підтягувалось гео (якщо воно
   відкрите), і в Назва апки / KTID самі прописувались букви й цифри:
   цифри — з інших апок на цьому гео, букви — з назви воронки (Lucky App
   Best → LAB…); якщо така вже є — Lu Ap Be». */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const SRC = fs.readFileSync('index-legacy.html', 'utf8');
const TOAST = fs.readFileSync('build/toast.js', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

const a = SRC.indexOf('const AP_LOOK = '), b = SRC.indexOf('/* Підключається до вікна «Додати апку»');
const F = [
  { ktid: 'LTR11003', funnel_name: 'Lucky Tower Rush [satorapps]', geo: 'TJ', is_app: true },
  { ktid: 'RT11003', funnel_name: 'Rush Tower [satorapps]', geo: 'TJ', is_app: true },
  { ktid: 'CC11012', funnel_name: 'Chicken Curry [trident]', geo: 'TJ', is_app: true },
  { ktid: 'MS11012', funnel_name: 'Money Strike [trident]', geo: 'TJ', is_app: true },
  { ktid: 'LAB11003', funnel_name: 'Lucky App Best [satorapps]', geo: 'TJ', is_app: true },
  { ktid: 'GJ10775', funnel_name: 'Grand Jackpot [satorapps]', geo: 'KG', is_app: true },
  { ktid: '10708-y3wz', funnel_name: 'MPlay KG', geo: 'KG', is_app: false }
];
const K = new Function('apFunnels', SRC.slice(a, b) + '\nreturn { apKtidSuggest, apKtidNum };')(F);
const k = (n, g) => K.apKtidSuggest(n, g).ktid;

ok('перші літери слів + число гео й постачальника', k('Rocket Win [satorapps]', 'TJ') === 'RW11003', k('Rocket Win [satorapps]', 'TJ'));
ok('інший постачальник — його число', k('Lucky App Best [trident]', 'TJ') === 'LAB11012', k('Lucky App Best [trident]', 'TJ'));
ok('зайнято — по дві літери на слово', k('Lucky App Best [satorapps]', 'TJ') === 'LuApBe11003', k('Lucky App Best [satorapps]', 'TJ'));
ok('цифри в назві лишаються цифрою', k('Joker 777 [satorapps]', 'TJ') === 'J711003', k('Joker 777 [satorapps]', 'TJ'));
ok('кириличні «схожі» літери — латиницею', k('Fіsh Gоldеn Аdvеnturе [satorapps]', 'TJ') === 'FGA11003', k('Fіsh Gоldеn Аdvеnturе [satorapps]', 'TJ'));
ok('діакритика знімається', k('Chiĉken Rōad [satorapps]', 'KG') === 'CR10775', k('Chiĉken Rōad [satorapps]', 'KG'));
ok('інше гео — його число', k('Joker 777 [satorapps]', 'KG') === 'J710775');
ok('гео без апок — лише літери, без вигаданих цифр', k('Joker 777', 'BR') === 'J7');
ok('без постачальника — найчастіше число на гео', K.apKtidNum('TJ', '').num === '11003');
ok('PWA-воронки в число не йдуть', K.apKtidNum('KG', '').num === '10775');
ok('порожня назва — порожньо', k('', 'TJ') === '');

ok('гео — з відкритого дерева, «—» не підставляється', /const openGeo = String\(\(apMode === 'pwa' \? pwGeo : apGeo\) \|\| ''\)\.trim\(\);/.test(SRC)
  && /\/\^\[A-Za-z\]\{2\}\$\/\.test\(openGeo\)/.test(SRC) && /value: geoNow,/.test(SRC));
ok('KTID оновлюється живцем, доки його не поправили руками', /onOpen: apKtidLive/.test(SRC)
  && /auto = !String\(ktEl\.value \|\| ''\)\.trim\(\);/.test(SRC));
ok('лише для апки (галочка «Це APP»)', /if \(appEl && !appEl\.checked\)/.test(SRC));
ok('ask вміє onOpen, а клік тегу будить залежні поля', /if \(typeof o\.onOpen === 'function'\)/.test(TOAST)
  && /el\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\);/.test(TOAST));
ok('і це доїхало в зібраний index.html', /function apKtidSuggest\(name, geo\)/.test(OUT) && /o\.onOpen\(/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
