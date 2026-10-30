/* ═══════════ СТЕЛЯ ВИТРАТ — ПРОБА ОДИНИЦЬ ═══════════

   У fb-limit немає UI, і це навмисне: доки не відомо, в яких одиницях
   Facebook приймає spend_cap на запис, поле «стеля» в панелі було б
   полем, яке з рівною ймовірністю ставить $100 і $10 000.

   Тому стенд перевіряє не сторінку, а дві речі у самій функції:

     1. РІШЕННЯ ПРО ОДИНИЦІ — не текстом, а виконанням. unitVerdict
        дістається з файлу й запускається тут по-справжньому: це той
        код, через помилку в якому проба збрехала б саме там, де вона
        і потрібна;

     2. ЗАПОБІЖНИКИ — що відмова стоїть ДО запису, а не після: роль,
        ads_management, кабінет без стелі, стеля нижче витраченого.
        Кожен із них рятує від своєї біди, і жоден не перевіряється
        натисканням кнопки, бо кнопки немає. */
import fs from 'node:fs';
import { checks } from './_harness.mjs';

const { ok, done } = checks();
const FN = fs.readFileSync('supabase/functions/fb-limit/index.ts', 'utf8');

/* ── 1. саме рішення, виконане ── */

/* Беремо функцію з файлу, а не копію: копія розійшлася б із
   функцією рівно тоді, коли її правлять. */
const m = FN.match(/function unitVerdict\([\s\S]*?\n\}/);
ok('unitVerdict знайдена у файлі функції', !!m);
const verdict = m
  ? new Function('MINOR', m[0].replace(/(\w+): number(?: \| null)?/g, '$1')
      + '; return unitVerdict;')(100)
  : () => ({ units: 'missing' });

/* Надіслали 700 (хотіли 7). Прийшло 700 — нас зрозуміли так само. */
ok('назад те саме число → мінорні одиниці', verdict(700, 700).units === 'minor');
/* Прийшло 70000 — наші 700 узяли за 700 цілих, тобто у сто разів більше. */
ok('назад у сто разів більше → ціла валюта', verdict(700, 70000).units === 'major');
/* Facebook міг і не віддати поле: це «не знаємо», а не «немає ліміту». */
ok('поля немає → одиниці не вгадуються', verdict(700, null).units === 'unknown');
/* Будь-яке третє число — теж «не знаємо». Вгадати тут означало б
   показати людині впевнену відповідь, якої ніхто не перевіряв. */
ok('чуже число → не вгадуємо', verdict(700, 12345).units === 'unknown');
/* Округлення Facebook на одиницю не повинне перетворювати вердикт у
   «не знаємо»: це той самий результат. */
ok('похибка в одиницю не ламає вердикт', verdict(700, 701).units === 'minor');
ok('кожен вердикт має текст для людини',
  ['minor', 'major', 'unknown'].every(u => {
    const r = [verdict(700, 700), verdict(700, 70000), verdict(700, 12345)]
      .find(x => x.units === u);
    return r && typeof r.note === 'string' && r.note.length > 10;
  }));

/* ── 2. запобіжники ── */

const iScope  = FN.indexOf("includes('ads_management')");
const iNoCap  = FN.indexOf('!capNow && !allowNew');
const iSpent  = FN.indexOf('sent <= spentNow');
const iWrite  = FN.indexOf("{ spend_cap: String(sent) }, 'POST'");

ok('запис у Graph у функції один', iWrite > 0
  && (FN.match(/graph\([^;]*'POST'\)/g) || []).length === 1);
ok('ads_management перевіряється до запису', iScope > 0 && iScope < iWrite);
ok('кабінет без стелі відсікається до запису', iNoCap > 0 && iNoCap < iWrite);
ok('стеля нижче витраченого відсікається до запису', iSpent > 0 && iSpent < iWrite);

ok('без set_major функція лише читає',
  /mode: 'read'/.test(FN) && FN.indexOf("mode: 'read'") < iWrite);
/* Гейт по my_role() тут стояв і прибраний: my_role() віддає 'buyer'
   усім, у кого немає рядка у team_members, тобто першим він відмовляв
   власнику кабінетів. Межі ставлять RLS і сам Facebook — ті, хто
   справді їх знає.

   Дивимось на КОД без коментарів: сам текст про прибраний гейт слово
   my_role згадує, і перевірка по всьому файлу падала б саме через
   пояснення, чому перевірки немає. */
const CODE = FN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok('роль у коді не питається зовсім',
  !/my_role/.test(CODE) && !/'lead'/.test(CODE) && !/403/.test(CODE));

ok('один виклик — один кабінет, списку немає',
  !/for \(const .* of .*(accounts|accs|ids)\)/.test(FN) && /account_id is required/.test(FN));
ok('номер кабінета читається рядком, не Number()',
  /String\(body\?\.account_id \?\? ''\)/.test(FN));
ok('act_ дописується, якщо його не передали', /startsWith\('act_'\)/.test(FN));

ok('після запису стеля читається назад', FN.indexOf('capBack') > iWrite);
ok('у відповіді є чим повернути як було', /restore:/.test(FN));
ok('перевищення в рази виноситься в warning',
  /capBack > sent \* 10/.test(FN) && /warning:/.test(FN));
ok('добовий ліміт Facebook названий своїми словами',
  /1885172/.test(FN) && /10 змін/.test(FN));
ok('advertiser проти admin сказано там, де це болить',
  /АДМІНОМ кабінета/.test(FN));

/* Прибирати стелю проба не вміє — і каже це, а не робить вид, що
   вміє: нуль у spend_cap ми не перевіряли жодним викликом. */
ok('нуль не приймається за «прибери стелю»',
  /set_major має бути більше нуля/.test(FN));
ok('видалення стелі функція не обіцяє', !/spend_cap_action/.test(FN));

/* Токен у відповідь не потрапляє — та сама межа, що у fb-post. */
ok('токен не виходить у відповідь', !/token[^_]*:\s*token/.test(FN)
  && !/reply\(\{[^}]*token\b/.test(FN));

await done(null, null, []);
