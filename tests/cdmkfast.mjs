/* ГАЛОЧКА В ДЕРЕВІ — МИТТЄВО. «коли вибираю кампанію (чи оголошення),
   воно секунду думає, і тоді вже зверху 1 picked». Галочка більше не
   перемальовує всю таблицю: міняє свій рядок і плаваючу смугу дії
   внизу екрана. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8751;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

await page.evaluate(() => {
  const host = document.getElementById('cab-list') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'cab-list' }));
  host.innerHTML = '<table><tbody>'
    + ['c1', 'c2'].map(id => `<tr class="cab-node cd-r"><td><input type="checkbox" class="cd-mk"
        onclick="event.stopPropagation()" onchange="cdMark('${id}', this.checked)"></td></tr>`).join('')
    + '</tbody></table>';
  cdAcc = 'act_1'; cdFlat = false; cdMarked = new Set();
  window.__renders = 0;
  const real = cabRender;
  cabRender = function () { window.__renders++; return real.apply(this, arguments); };
});

await page.evaluate(() => document.querySelectorAll('#cab-list input.cd-mk')[0].click());
await page.waitForTimeout(300);
const s1 = await page.evaluate(() => ({
  renders: window.__renders,
  mk: document.querySelectorAll('#cab-list tr.is-mk').length,
  bar: (document.querySelector('#cd-mkfloat.is-on') || {}).innerText || '',
  set: [...cdMarked]
}));
ok('галочка не перемальовує всю таблицю', s1.renders === 0, s1);
ok('рядок позначений одразу', s1.mk === 1, s1);
ok('плаваюча смуга виїхала з лічильником', /1 picked/i.test(s1.bar), s1.bar);
ok('вибір записаний', s1.set.join() === 'c1', s1.set);

await page.evaluate(() => document.querySelectorAll('#cab-list input.cd-mk')[1].click());
await page.waitForTimeout(100);
ok('друга галочка — лічильник 2', /2 picked/i.test(await page.evaluate(() => document.querySelector('#cd-mkfloat').innerText)));

await page.evaluate(() => [...document.querySelectorAll('#cd-mkfloat button')].find(b => /clear/i.test(b.textContent)).click());
await page.waitForTimeout(250);
const s2 = await page.evaluate(() => ({
  renders: window.__renders, mk: document.querySelectorAll('#cab-list tr.is-mk').length,
  checked: document.querySelectorAll('#cab-list input.cd-mk:checked').length,
  on: !!document.querySelector('#cd-mkfloat.is-on'), n: cdMarked.size
}));
ok('Clear знімає все без перемальовки', s2.renders === 0 && s2.mk === 0 && s2.checked === 0 && s2.n === 0, s2);
ok('і смуга ховається', !s2.on, s2);

await page.evaluate(() => { cdMarked = new Set(['c1']); cdMarkFloat(); cdHide(); });
await page.waitForTimeout(100);
ok('закрили дерево — смуги немає', await page.evaluate(() => !document.querySelector('#cd-mkfloat.is-on')));

/* «☆ Template» — на смузі вибору, а не в рядку (там закривав назву). */
const tp = await page.evaluate(async () => {
  cdAcc = 'act_1'; cdRows = [{ campaign_id: 'c1', campaign_name: 'MPlay KG 001', adset_id: 's1', ad_id: 'a1' }];
  const saved = []; window.ltSave = async (id, n) => { saved.push([id, decodeURIComponent(n)]); };
  cdMarked = new Set(['c1']); cdMarkFloat();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const btn = [...document.querySelectorAll('#cd-mkfloat button')].find(b => /Save as template/.test(b.textContent));
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 50));
  cdMarked = new Set(['a1']); cdMarkFloat();
  const noBtn = ![...document.querySelectorAll('#cd-mkfloat button')].some(b => /Save as template/.test(b.textContent));
  const row = typeof cdNameCell === 'function' ? cdNameCell({ kind: 'campaign', id: 'c1', name: 'X', kids: [], ads: 1 }, 0) : '';
  return { has: !!btn, saved, noBtn, rowHasTpl: /Template/.test(row) };
});
ok('вибрана кампанія — на смузі «Save as template»', tp.has && tp.saved.length === 1 && tp.saved[0][0] === 'c1' && tp.saved[0][1] === 'MPlay KG 001', tp);
ok('вибране оголошення — кнопки шаблону немає', tp.noBtn, tp);
ok('у рядку кампанії кнопки Template більше немає', !tp.rowHasTpl, tp);

await done(browser, srv, errs);
