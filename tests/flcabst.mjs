/* ═══════════ ФАЙЛИ: СТАТУС КАБІНЕТА ПРИ НАВЕДЕННІ, І ДОВГА ПАМ'ЯТЬ ═══════════

   «при наведенні на @кабінет підтягувати ще й статус: бан, актив» і
   «записувати спенд і статус у довгу пам'ять — видалене з архіву не має
   зникати з файлів».
     1. живий кабінет — стан зі сторінки FB LIVE або з fb_accounts;
     2. видалений із CRM — останній стан із журналу account_events, з
        датою й позначкою «removed from CRM»;
     3. зовсім невідомий — «Not in your cabinets». */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8197;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const r = await page.evaluate(async () => {
  const mk = id => { const b = document.createElement('button'); b.dataset.cab = id; document.body.appendChild(b); return b; };
  const txt = () => document.getElementById('fl-tip').textContent.replace(/\s+/g, ' ').trim();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  cabAll = [{ id: 'r1', fb: { account_id: '111' }, state: 'banned', x: { all: 120.5, first: '2026-11-01', last: '2026-11-18' } }];
  flCabTip(mk('111')); out.page = txt();
  cabAll = [];
  const q = rows => { const o = { select: () => o, ilike: () => o, in: () => o, order: () => o,
    limit: async () => ({ data: rows }), then: f => Promise.resolve({ data: rows }).then(f) }; return o; };
  sb.from = t => t === 'fb_accounts' ? q([{ account_id: '333', status: 'active' }, { account_id: '444', status: 'closed' }])
    : t === 'account_events' ? q([{ to_state: 'banned', at: '2026-11-12T10:00:00Z', account_id: 'act_555' }]) : q([]);
  flCabTip(mk('333')); await wait(80); out.active = txt();
  flCabTip(mk('444')); await wait(30); out.closed = txt();
  flCabTip(mk('555')); await wait(120); out.removed = txt();
  sb.from = () => q([]);
  flCabTip(mk('777')); await wait(120); out.never = txt();
  return out;
});
ok('стан зі сторінки FB LIVE і спенд', /^Banned/.test(r.page) && /\$120\.5/.test(r.page), r.page);
ok('без FB LIVE — стан із бази: активний', /^Active/.test(r.active), r.active);
ok('закритий кабінет — бан', /^Banned/.test(r.closed), r.closed);
ok('видалений із CRM — останній стан із журналу з датою', /^Banned · 12\.11 · removed from CRM/.test(r.removed), r.removed);
ok('невідомий — так і сказано', /^Not in your cabinets/.test(r.never), r.never);

await done(browser, srv, errs);
