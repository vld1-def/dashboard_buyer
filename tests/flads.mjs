/* ═══════════ АКАУНТИ З ФАЙЛА — В ADSPOWER ═══════════

   «файли які я загружаю в срм, розбирати на частини (визначати що є що
   можна в ручному режимі) і загружати в адспавер … декілька … всі або
   вибирати … папку куди відправляти і у файлі позначати які вже
   відправлені».

   Усі дані тут вигадані: справжніх логінів і куків у тестах нема. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 400) : '')); } };

const FL = fs.readFileSync('build/files.js', 'utf8');
const CSS = fs.readFileSync('build/design.css', 'utf8');
const PY = fs.readFileSync('tools/adspower-bridge.py', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

/* Чисті функції розбору — виконуємо їх по-справжньому. */
const a = FL.indexOf('const FL_AP_URL');
const b = FL.indexOf('let flAp = null;');
const api = new Function(FL.slice(a, b)
  + '\nreturn { flApStrip, flApDelim, flApParse, flApProxy, flApKind, flApBody, flApMarkText, FL_AP_URL };')();

const COOKIE = '[{"domain":".facebook.com","name":"c_user","value":"100000000000001"},{"domain":".facebook.com","name":"xs","value":"a:b;c"}]';
const TXT = [
  'buyer accounts, batch 7',
  'anna@example.com|Passw0rd!|JBSW Y3DP EHPK 3PXP|' + COOKIE + '|Mozilla/5.0 (Windows NT 10.0) Chrome/120|proxy.example.net:8080:pu:pp',
  'bob@example.com|hunter2|JBSWY3DPEHPK3PXP|' + COOKIE + '|Mozilla/5.0 (X11) Chrome/119|10.0.0.5.example:3128 @123456789 #warm',
  '',
  'carl@example.com|qwerty|JBSWY3DPEHPK3PXP|' + COOKIE + '|Mozilla/5.0 (Mac) Chrome/118| [ads:77]'
].join('\r\n');

const p = api.flApParse(TXT);
ok('заголовок і порожній рядок — не акаунти', p.rows.length === 3 && p.rows[0].line === 1, p.rows.map(r => r.line));
ok('роздільник знайдено, куки не порізані', p.delim === '|' && p.rows[0].cells[3] === COOKIE, p.rows[0].cells.length);
ok('ролі стовпчиків вгадано', JSON.stringify(p.map) === JSON.stringify(['login', 'pass', 'fakey', 'cookie', 'ua', 'proxy']), p.map);
ok('відправлений рядок упізнано і не вибрано', p.rows[2].sent === '77' && p.rows[2].sel === false && p.rows[0].sel === true);
ok('дописані @кабінет і #тег не стали полями', p.rows[1].tail === '@123456789 #warm' && p.rows[1].cells.length === 6, p.rows[1]);

const body = api.flApBody(p.rows[0], p.map, '555', 'batch.txt');
ok('тіло профілю: папка, логін, пароль, 2FA без пробілів', body.group_id === '555' && body.username === 'anna@example.com'
  && body.password === 'Passw0rd!' && body.fakey === 'JBSWY3DPEHPK3PXP' && body.name === 'anna@example.com', body);
ok('куки йдуть цілими, з дозволом на помилку перевірки', body.cookie === COOKIE && body.ignore_cookie_error === '1');
ok('проксі host:port:user:pass розібрано', body.user_proxy_config.proxy_host === 'proxy.example.net'
  && body.user_proxy_config.proxy_port === '8080' && body.user_proxy_config.proxy_user === 'pu'
  && body.user_proxy_config.proxy_password === 'pp' && body.user_proxy_config.proxy_soft === 'other', body.user_proxy_config);
ok('юзер-агент і примітка з назвою файла', body.fingerprint_config.ua.startsWith('Mozilla/5.0') && /CRM: batch\.txt line 2/.test(body.remark));
ok('без проксі — no_proxy', api.flApBody({ line: 0, cells: ['x@example.com', 'pw'], tail: '' }, ['login', 'pass'], '0', 'f')
  .user_proxy_config.proxy_soft === 'no_proxy');
ok('рядок без логіна й куків не відправляється', api.flApBody({ line: 0, cells: ['a', 'b'], tail: '' }, ['skip', 'note'], '0', 'f') === null);

ok('проксі user:pass@host:port і socks5', api.flApProxy('socks5://u:p@px.example.org:1080').proxy_type === 'socks5'
  && api.flApProxy('u:p@px.example.org:1080').proxy_user === 'u');
ok('логін:пароль — не проксі', api.flApProxy('john:12345') === null && api.flApKind('john:12345') === '');

/* Формат «логін:пароль» без інших роздільників. */
const p2 = api.flApParse('dave@example.com:pw1\neve@example.com:pw2\n');
ok('двокрапка як роздільник, пароль — за логіном', p2.delim === ':' && p2.rows.length === 2
  && p2.map[0] === 'login' && p2.map[1] === 'pass', p2);

/* Позначки у файлі. */
const marked = api.flApMarkText(TXT, { 1: '101', 2: '102', 4: '999' });
const ml = marked.split('\r\n');
ok('позначка дописана в кінець потрібних рядків', ml[1].endsWith(' [ads:101]') && ml[2].endsWith('#warm [ads:102]'), ml[2].slice(-30));
ok('уже позначений рядок удруге не позначається', ml[4].endsWith(' [ads:77]') && !/ads:999/.test(ml[4]));
ok('кінці рядків і решта файла не змінились', marked.includes('\r\n') && ml.length === 5 && ml[0] === 'buyer accounts, batch 7' && ml[3] === '');
ok('після позначки рядок читається як відправлений', api.flApParse(marked).rows.every(r => r.sent));

/* Сторінка. */
ok('кнопка AdsPower у перегляді файла', /onclick="flApOpen\(\)"/.test(FL));
ok('позначки пишуться кожні десять профілів і в кінці', /if \(made % 10 === 0\) await flush\(\);/.test(FL) && /\n  await flush\(\);/.test(FL));
ok('запис файла — спільний для Save і відправки', /async function flTxtPut\(text\)/.test(FL) && /try \{ await flTxtPut\(text\); \}/.test(FL));
ok('пароль у таблиці не показується', /if \(type === 'pass'\) return '(\\u2022|•)/.test(FL));
ok('вибір: усі невідправлені або по одному', /window\.flApAll = function/.test(FL) && /window\.flApSel = function/.test(FL));
ok('папка: список, нова, запамʼятовується', /\/api\/v1\/group\/list\?page=/.test(FL) && /\/api\/v1\/group\/create/.test(FL)
  && /localStorage\.setItem\('fl-ap-group'/.test(FL));
ok('сторінка ходить лише на місток цього компʼютера', api.FL_AP_URL === 'http://127.0.0.1:50326');
ok('стилі панелі є', /\.fl-ap-tbl th \{/.test(CSS) && /\.fl-ads \{/.test(CSS));

/* Місток. */
ok('місток слухає лише 127.0.0.1', /ThreadingHTTPServer\(\('127\.0\.0\.1', PORT\), Bridge\)/.test(PY));
ok('місток пускає лише сайт CRM і localhost', /ORIGINS = \{'https:\/\/vld1-def\.github\.io'\}/.test(PY));
const routes = (PY.match(/ROUTES = \{([\s\S]*?)\n\}/) || ['', ''])[1];
ok('місток пропускає рівно три виклики AdsPower', (routes.match(/\('/g) || []).length === 3
  && /group\/list/.test(routes) && /group\/create/.test(routes) && /user\/create/.test(routes)
  && !/delete|start|stop|cookies/.test(routes), routes);
ok('місток не пише в журнал того, що через нього йде', /def log_request\(self/.test(PY) && /protocol_version = 'HTTP\/1\.0'/.test(PY));
ok('і це доїхало в зібраний index.html', /flApSend = async function/.test(OUT) && /\.fl-ap-tbl/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
