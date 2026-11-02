/* ═══════════ ВИБРАНА КАМПАНІЯ ЗВУЖУЄ «ADS ONLY» ═══════════

   «Ads only» — це погляд «покажи самі оголошення, найдорожчі зверху».
   Поки він показував ВСІ оголошення кабінета, питання «а що саме
   крутиться в цій кампанії» відповіді тут не мало: у дереві треба було
   розкрити кампанію, потім кожен адсет, і читати по чотири рядки крізь
   відступи.

   Тепер межу ставить галочка. Що тут важить:

     1. відмічена кампанія (і адсет — це така сама коробка) лишає в
        «Ads only» тільки свої оголошення;
     2. відмічене ОГОЛОШЕННЯ межі не ставить: галочки на оголошеннях
        тиснуть, щоб вимкнути їх пачкою, і якби вибір заодно ховав
        решту, список згортався б під рукою просто від того, що його
        позначають;
     3. у дереві вибір не ховає нічого — там він лишається тим, чим
        був;
     4. межа написана поруч із вкладкою: межа, яка ховає рядки й
        мовчить, читається як порожній кабінет;
     5. якщо межа звузила до нуля, сказано саме це — і смуга з Clear
        лишається на екрані, інакше вибір знімати було б нічим. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8179;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

/* Два оголошення в кампанії C1 (різні адсети), одне в C2. Витрати
   різні: порядок у «Ads only» — за ними. */
const ROWS = [
  { ad_id: 'a1', campaign_id: 'C1', campaign_name: 'Camp one', adset_id: 'S1',
    adset_name: 'Set one', name: 'Ad A', effective_status: 'ACTIVE',
    own_status: 'ACTIVE', spend: 10, impressions: 100, clicks: 5, link_clicks: 5 },
  { ad_id: 'a2', campaign_id: 'C1', campaign_name: 'Camp one', adset_id: 'S2',
    adset_name: 'Set two', name: 'Ad B', effective_status: 'ACTIVE',
    own_status: 'ACTIVE', spend: 30, impressions: 300, clicks: 9, link_clicks: 9 },
  { ad_id: 'b1', campaign_id: 'C2', campaign_name: 'Camp two', adset_id: 'S9',
    adset_name: 'Set nine', name: 'Ad C', effective_status: 'ACTIVE',
    own_status: 'ACTIVE', spend: 20, impressions: 200, clicks: 7, link_clicks: 7 },
  /* Відхилене — його ховає фільтр Live. Потрібне, щоб перевірити
     порожню межу: кампанію відмітили, а її оголошення не живі. */
  { ad_id: 'd1', campaign_id: 'C3', campaign_name: 'Camp three', adset_id: 'S7',
    adset_name: 'Set seven', name: 'Ad D', effective_status: 'DISAPPROVED',
    own_status: 'ACTIVE', spend: 0, impressions: 0, clicks: 0, link_clicks: 0 }
];

const view = (mark, opts) => page.evaluate(([rows, picked, o]) => {
  cdRows = rows; cdErr = ''; cdSeen = Date.now();
  cdFlat = !!o.flat; cdFilt = o.filt || '';
  cdMarked = new Set(picked);
  const v = cdView();
  return {
    msg: v.msg || '',
    bar: String(v.bar || '').replace(/\s+/g, ' ').trim(),
    names: (v.list || []).map(x => x.n.name),
    head: cdHeadBits().replace(/\s+/g, ' ')
  };
}, [ROWS, mark, opts || {}]);

/* ── 1. без вибору «Ads only» показує все ── */
const plain = await view([], { flat: true });
/* Порядок один — за витратами, найдорожчі зверху. Відхилене Ad D
   лишається видимим: фільтр тут «All», а ховати те, що відхилили,
   це справа Live. */
ok('без вибору видно всі оголошення',
  plain.names.join() === 'Ad B,Ad C,Ad A,Ad D', plain.names);
ok('і межі в шапці немає', !/cd-scope/.test(plain.head), plain.head);

/* ── 2. відмічена кампанія ── */
const camp = await view(['C1'], { flat: true });
ok('відмічена кампанія лишає тільки свої оголошення',
  camp.names.join() === 'Ad B,Ad A', camp.names);
/* Порядок у цьому погляді один — за витратами, найдорожчі зверху, —
   і межа його не міняє. */
ok('порядок за витратами лишається', camp.names[0] === 'Ad B', camp.names);
ok('межа написана поруч із вкладкою', /cd-scope/.test(camp.head), camp.head);
ok('і названа числом коробок', /1 campaign\(s\)/.test(camp.head), camp.head);

/* ── 3. у дереві вибір нічого не ховає ── */
const tree = await view(['C1'], { flat: false });
ok('у дереві видно всі кампанії',
  tree.names.filter(n => /^Camp/.test(n)).length === 3, tree.names);
/* Підпис про звуження в дереві брехав би: там нічого не звужено. */
ok('і межі в шапці дерева немає', !/cd-scope/.test(tree.head), tree.head);

/* ── 4. адсет — така сама коробка ── */
const set = await view(['S2'], { flat: true });
ok('відмічений адсет лишає тільки свої оголошення',
  set.names.join() === 'Ad B', set.names);
ok('і названий своїм словом', /1 ad set\(s\)/.test(set.head), set.head);

/* ── 5. відмічене оголошення межі не ставить ── */
const leaf = await view(['a1'], { flat: true });
ok('галочка на оголошенні нічого не ховає',
  leaf.names.join() === 'Ad B,Ad C,Ad A,Ad D', leaf.names);
ok('і межі в шапці не зʼявляється', !/cd-scope/.test(leaf.head), leaf.head);
/* Кампанія тримає межу, а відмічене оголошення чужої кампанії її не
   розширює: інакше «вибрав кампанію» перестало б щось означати, щойно
   поставив галочку деінде. */
const mix = await view(['C1', 'b1'], { flat: true });
ok('оголошення чужої кампанії межу не розширює',
  mix.names.join() === 'Ad B,Ad A', mix.names);

/* ── 6. застарілий вибір ── */
const stale = await view(['C-gone'], { flat: true });
ok('вибір, якого немає в знімку, нічого не звужує',
  stale.names.join() === 'Ad B,Ad C,Ad A,Ad D', stale.names);

/* ── 7. межа звузила до нуля ── */
const empty = await view(['C3'], { flat: true, filt: 'live' });
ok('порожнеча через вибір називає свою причину',
  /What you picked has no ads in this view/.test(empty.msg), empty.msg);
ok('і каже, що саме ховає рядки', /\(live\) is hiding them/.test(empty.msg), empty.msg);
/* Смуга з Clear мусить лишитись: порожнім екран став саме через
   вибір, і прибрати разом із рядками єдину кнопку, якою його
   знімають, означало б зачинити двері зсередини. */
ok('смуга вибору лишається на порожньому екрані',
  /picked/.test(empty.bar) && /Clear/.test(empty.bar), empty.bar);

/* ── 8. те саме для порожнього фільтра без вибору ── */
const dead = await view(['a1'], { flat: true, filt: 'spend' });
ok('фільтр Spend ховає те, що нічого не витратило',
  !dead.names.includes('Ad D'), dead.names);
const none = await page.evaluate(rows => {
  cdRows = rows.filter(r => r.ad_id === 'd1');
  cdErr = ''; cdFlat = true; cdFilt = 'live'; cdMarked = new Set(['d1']);
  const v = cdView();
  return { msg: v.msg || '', bar: String(v.bar || '').replace(/\s+/g, ' ').trim() };
}, ROWS);
ok('і на його порожнечі смуга вибору теж лишається',
  /picked/.test(none.bar) && /Nothing is live here/.test(none.msg), none);

await done(browser, srv, errs);
