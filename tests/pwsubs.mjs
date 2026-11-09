/* ═══════════ PWA: ПАРАМЕТРИ З САБКАМИ ПІД СИЛКАМИ ═══════════

   «в шаблонах до пва, давай додамо інпут під силками, це буде під наші
   параметри з сабками» — один рядок на кампанію, на картці окремим
   рядком, клік копіює; самі силки не змінюються. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const LEG = fs.readFileSync('index-legacy.html', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

const src = (LEG.match(/const pwSubsClean = [^\n]*/) || [''])[0];
ok('є pwSubsClean', !!src);
const pwSubsClean = new Function(src + '\nreturn pwSubsClean;')();
ok('рядок лишається як є', pwSubsClean('sub1=fb&sub2={{ad.id}}') === 'sub1=fb&sub2={{ad.id}}');
ok('«?» і «&» на початку зрізаються', pwSubsClean('  ?sub1=a&sub2=b ') === 'sub1=a&sub2=b'
  && pwSubsClean('&sub1=a') === 'sub1=a');
ok('порожнє — порожнє', pwSubsClean('') === '' && pwSubsClean(undefined) === '');

ok('поле в редакторі стоїть під силками',
  /id="pw-f-links"[\s\S]{0,600}id="pw-pool"[\s\S]{0,300}id="pw-f-subs"[\s\S]{0,400}id="pw-f-note"/.test(LEG));
ok('зберігається в записі кампанії', /subs: pwSubsClean\(val\('pw-f-subs'\)\),/.test(LEG));
ok('на картці — окремий рядок, клік копіює',
  /\$\{it\.subs \? `<div[\s\S]{0,300}Сабки<\/span>[\s\S]{0,80}onclick="pwCopy\(event, this\)" data-v="\$\{apEsc\(it\.subs\)\}"/.test(LEG));
ok('силки при копіюванні не змінюються', /data-v="\$\{apEsc\(u\)\}"/.test(LEG));
ok('пошук бачить сабки', /pwName\(it\), it\.note, it\.subs\]/.test(LEG));
ok('і це доїхало в зібраний index.html', /id="pw-f-subs"/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
