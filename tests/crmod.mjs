/* ═══════════ МОДЕРАЦІЯ КРЕАТИВА: ЖУРНАЛ REJECT / ACTIVE ═══════════

   «розділ, де буде список reject, active і дата, і лічильник; з FB
   LIVE тягнути статуси; інший статус не потрібен; дублікатів не
   робити; на якому кабінеті реджект».
     1. fb-sync пише лише ACTIVE і DISAPPROVED, з кабінетом і причиною;
     2. без дублікатів: ключ (created_by, ad_id, status), повтор —
        ignore-duplicates, перша дата не переписується;
     3. запит причин — окремий, і кількість запитів на кабінет (PER_ACC)
        збігається з urlsFor, а пакет не перевищує 50;
     4. відсутня таблиця не валить синк;
     5. на сторінці — вкладка Moderation, лічильник, фільтр, позначка в
        списку; креатив звіряється цілим шматком. */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (w, c, x) => { if (c) { pass++; console.log('ok   ' + w); }
  else { fail++; console.log('FAIL ' + w + (x !== undefined ? '\n       ' + JSON.stringify(x).slice(0, 300) : '')); } };

const TS = fs.readFileSync('supabase/functions/fb-sync/index.ts', 'utf8');
const SQL = fs.readFileSync('CREATIVE_MODERATION.sql', 'utf8');
const LEG = fs.readFileSync('index-legacy.html', 'utf8');
const OUT = fs.readFileSync('index.html', 'utf8');

/* ── таблиця ── */
ok('ключ без дублікатів: оголошення + статус', /primary key \(created_by, ad_id, status\)/.test(SQL));
ok('лише два статуси', /check \(status in \('ACTIVE', 'DISAPPROVED'\)\)/.test(SQL));
ok('кабінет і причина зберігаються', /account_id  text not null/.test(SQL) && /reason      text/.test(SQL));
ok('читає власник, асистент, тімлід своєї команди', /auth\.uid\(\) = created_by\s*or public\.can_read_mine\(created_by\)\s*or public\.can_read_team\(team_name\)/.test(SQL));

/* ── fb-sync ── */
ok('пишуться лише ACTIVE і DISAPPROVED', /if \(a\.status === 'ACTIVE' \|\| a\.status === 'DISAPPROVED'\) modRows\.push/.test(TS));
ok('повтор не переписує перший запис', /Prefer: 'resolution=ignore-duplicates,return=minimal'/.test(TS)
  && /fb_ad_moderation\?on_conflict=created_by,ad_id,status/.test(TS));
ok('причина — лише в реджекту', /reason: a\.status === 'DISAPPROVED' \? \(a\.reason \|\| null\) : null/.test(TS));
ok('немає таблиці — синк не падає, а каже що виконати', /run CREATIVE_MODERATION\.sql/.test(TS) && /out\.moderationError = /.test(TS));
ok('причини — окремим запитом лише по відхилених', /'\["DISAPPROVED"\]'\)\s*\+ '&limit=' \+ LIST_LIMIT\s*\+ '&fields=' \+ encodeURIComponent\('id,ad_review_feedback'\)/.test(TS));

/* Кількість запитів на кабінет: urlsFor мусить повертати рівно PER_ACC,
   інакше відповіді пакета роз'їдуться між кабінетами. */
{
  const per = Number((TS.match(/const PER_ACC = (\d+);/) || [])[1]);
  const a = TS.indexOf('function urlsFor('), b = TS.indexOf('\n}\n', a) + 3;
  const pick = n => { const i = TS.indexOf('const ' + n + ' '); return TS.slice(i, TS.indexOf('\n', i)); };
  const status = TS.slice(TS.indexOf('const SNAP_STATUS'), TS.indexOf('];', TS.indexOf('const SNAP_STATUS')) + 2);
  const fn = TS.slice(a, b).replace(/\(actId: string, tz: string\): string\[\]/, '(actId, tz)')
    .replace(/(\w+): (string|number|boolean)(\[\])?(?=[,)])/g, '$1');
  let n = -1;
  try {
    n = new Function('const shiftDay = d => d; const todayIn = () => "2026-11-17";\n'
      + ['INNER', 'HISTORY_DAYS', 'LIST_LIMIT'].map(pick).join('\n') + '\n' + status + '\n' + fn
      + '\nreturn urlsFor("1", "UTC").length;')();
  } catch (e) { n = String(e); }
  ok('запитів на кабінет стільки, скільки PER_ACC', n === per && per === 8, { n, per });
  ok('пакет — ціле число кабінетів і не більше 50', /const CHUNK = Math\.floor\(BATCH_MAX \/ PER_ACC\);/.test(TS)
    && Math.floor(50 / per) * per <= 50);
  ok('причини читаються з восьмої відповіді', /const revPart = parts\[7\];/.test(TS));
}

/* ── сторінка: звіряння креатива ── */
const a = LEG.indexOf('const crModKey'), b = LEG.indexOf('function crModLoad');
const M = new Function(LEG.slice(a, b) + '\nreturn { crModKey, crModHit };')();
ok('та сама назва', M.crModHit(M.crModKey('KG_JS_600'), M.crModKey('KG_JS_600')));
ok('регістр і дефіс не важать, хвіст після пробілу — той самий', M.crModHit(M.crModKey('KG_JS_600'), M.crModKey('kg-js-600 copy')));
ok('цілим шматком: _600 не ловить _6001', !M.crModHit(M.crModKey('KG_JS_600'), M.crModKey('KG_JS_6001')));

/* ── сторінка: вкладка ── */
ok('вкладка Moderation серед решти', /data-k="mod" onclick="crTab\('mod'\)">Moderation/.test(LEG)
  && /const CR_TABS = \['placements', 'trend', 'funnels', 'accounts', 'cabs', 'mod'\];/.test(LEG));
ok('лічильник passed / rejected і відсоток', /passed<\/span>/.test(LEG) && /rejected<\/span>/.test(LEG) && /% pass rate/.test(LEG));
ok('фільтр All / Rejected / Active', /seg\('', 'All'\)\}\$\{seg\('DISAPPROVED', 'Rejected'\)\}\$\{seg\('ACTIVE', 'Active'\)\}/.test(LEG));
ok('у рядку — дата, статус, кабінет, оголошення, причина', /<th>Date<\/th><th>Status<\/th><th>Cabinet<\/th><th>Ad<\/th><th>Reason<\/th>/.test(LEG));
ok('у списку креативів — позначка реджектів', /\$\{crModBadge\(c\.cid\)\}/.test(LEG));
ok('немає таблиці — сторінка каже, що виконати', /CREATIVE_MODERATION\.sql<\/b> in Supabase/.test(LEG));
ok('і це доїхало в зібраний index.html', /async function crRenderModerationPanel\(\)/.test(OUT) && /\.cr-mod-st\.is-bad/.test(OUT));

console.log('\n' + pass + ' ok, ' + fail + ' fail');
if (fail) process.exit(1);
