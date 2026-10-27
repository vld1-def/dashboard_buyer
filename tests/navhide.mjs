/* ═══════════ ПРИБРАНИЙ ПУНКТ МЕНЮ ТА СМУГА ТАРГЕТУ ═══════════

   1. Адмін прибрав людині пункт у Admin.html — а він усе одно
      відкривався. Кнопку з дока ми справді видаляли, але палітра ⌘K
      лишалась із повним списком: «DB Logs» звідти працювали так само.
      Ховати вхід, лишаючи двері поруч, сенсу немає.

      Зіставляємо не за підписом, а за функцією з onclick: у доці
      «Bonus Calculator», у палітрі «Bonuses» — за підписами два
      списки розійшлись би на першому перейменуванні.

   2. Кнопка, яку людина сама засунула під «Ще», лежить у спливайці.
      Її «одиниця в доці» — уся обгортка «Ще», і прибирання одного
      пункту знесло б разом із ним решту схованих.

   3. Смуга таргету: підпис став в один рядок із числами й стоїть по
      центру блока, а не між сусідами. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8143;
const { ok, done } = checks();
const srv = await serve(PORT);

const asBuyer = hidden => ({
  init: new Function('H', `return () => {
    const mk = window.supabase.createClient;
    window.supabase.createClient = (...a) => {
      const c = mk(...a);
      const user = { id: 'u1' };
      c.auth.getUser = async () => ({ data: { user } });
      c.auth.getSession = async () => ({ data: { session: { user } } });
      const real = c.from;
      c.from = t => {
        if (t !== 'team_members') return real(t);
        const res = { data: [{ role: 'buyer', dock_hidden: ${JSON.stringify(hidden)} }], error: null };
        const o = new Proxy(function () {}, {
          get: (x, k) => k === 'then' ? (f => Promise.resolve(res).then(f)) : (() => o),
          apply: () => o });
        return o;
      };
      return c;
    };
  }`)()
});

/* ─────────── 1. прибране не відкривається нізвідки ─────────── */
{
  const { browser, page, errs } = await open(PORT, asBuyer(['DB Logs', 'Bonus Calculator']));
  await page.waitForTimeout(400);
  const dock = await page.evaluate(() => ({
    db: !!document.querySelector('#app-dock [onclick*="openDbLogsModal"]'),
    bonus: !!document.querySelector('#app-dock [title="Bonus Calculator"]'),
    keep: !!document.querySelector('#app-dock [onclick*="openAccountsModal"]'),
    fns: [...(window.navHiddenFns || [])].sort()
  }));
  ok('кнопки прибраних пунктів у доці немає', !dock.db && !dock.bonus, dock);
  ok('решта кнопок на місці', dock.keep, dock);
  ok('прибране оголошено функціями, а не підписами',
    JSON.stringify(dock.fns) === JSON.stringify(['openBonusModal', 'openDbLogsModal']), dock.fns);

  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(200);
  const cmd = await page.evaluate(() => [...document.querySelectorAll('#cmd-list .cmd-row')]
    .map(r => r.textContent.trim()));
  ok('палітра ⌘K прибраного не пропонує',
    !cmd.some(r => /DB Logs/.test(r)) && !cmd.some(r => /^Bonuses/.test(r)), cmd);
  ok('а решту пропонує як і раніше',
    cmd.some(r => /^Accounts/.test(r)) && cmd.some(r => /^Settings/.test(r)), cmd);
  ok('пошук у палітрі теж його не знаходить', await page.evaluate(async () => {
    const inp = document.getElementById('cmd-input');
    inp.value = 'db';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return ![...document.querySelectorAll('#cmd-list .cmd-row')]
      .some(r => /DB Logs/.test(r.textContent));
  }));
  await browser.close();
  if (errs.length) ok('сторінка без помилок (прибрані пункти)', false, errs);
}

/* ─────────── 2. пункт із-під «Ще» не забирає сусідів ─────────── */
{
  const { browser, page, errs } = await open(PORT, {
    init: () => {
      // Людина сама засунула DB Logs і Texts під «Ще» — це localStorage
      localStorage.setItem('dock_hidden_v1', JSON.stringify(['DB Logs', 'Texts']));
      const mk = window.supabase.createClient;
      window.supabase.createClient = (...a) => {
        const c = mk(...a);
        const user = { id: 'u1' };
        c.auth.getUser = async () => ({ data: { user } });
        c.auth.getSession = async () => ({ data: { session: { user } } });
        const real = c.from;
        c.from = t => {
          if (t !== 'team_members') return real(t);
          const res = { data: [{ role: 'buyer', dock_hidden: ['DB Logs'] }], error: null };
          const o = new Proxy(function () {}, {
            get: (x, k) => k === 'then' ? (f => Promise.resolve(res).then(f)) : (() => o),
            apply: () => o });
          return o;
        };
        return c;
      };
    }
  });
  await page.waitForTimeout(500);
  const pop = await page.evaluate(() => ({
    wrap: !!document.querySelector('#app-dock .dk-more-wrap'),
    db: !!document.querySelector('#app-dock [onclick*="openDbLogsModal"]'),
    texts: !!document.querySelector('#app-dock .dk-more-pop [onclick*="openTextsModal"]')
  }));
  ok('обгортка «Ще» лишилась на місці', pop.wrap, pop);
  ok('прибраний пункт зник і зі спливайки', !pop.db, pop);
  ok('сусід, схований самою людиною, нікуди не подівся', pop.texts, pop);
  await browser.close();
  if (errs.length) ok('сторінка без помилок (спливайка)', false, errs);
}

/* ─────────── 3. смуга таргету ─────────── */
{
  const { browser, page, errs } = await open(PORT, { viewport: { width: 1440, height: 900 } });
  const ms = await page.evaluate(() => {
    const box = document.getElementById('milestone-container');
    const cap = box.querySelector('.ms-cap');
    const num = document.getElementById('monthly-spend-label');
    const left = document.getElementById('next-rank-info');
    const r = e => e.getBoundingClientRect();
    return { h: Math.round(r(box).height),
             capTop: Math.round(r(cap).top), numTop: Math.round(r(num).top),
             capMid: Math.round(r(cap).left + r(cap).width / 2),
             boxMid: Math.round(r(box).left + r(box).width / 2),
             numLeft: Math.round(r(num).left - r(box).left),
             leftEnd: Math.round(r(box).right - r(left).right),
             padTop: getComputedStyle(box).paddingTop };
  });
  ok('підпис в одному рядку з числами',
    Math.abs(ms.capTop - ms.numTop) < 12, ms);
  ok('підпис стоїть по центру блока, а не між сусідами',
    Math.abs(ms.capMid - ms.boxMid) <= 2, ms);
  ok('число лишилось ліворуч, залишок праворуч',
    ms.numLeft < 24 && ms.leftEnd < 24, ms);
  ok('відступ блока 9px замість 12', ms.padTop === '9px', ms.padTop);
  /* Висоту міряємо РІЗНИЦЕЮ, а не абсолютом: Tailwind сюда не доїжджає
     (CDN закритий політикою проксі), тож h3 лишається з браузерними
     відступами й абсолютне число тут не про справжній екран. А ось
     «наскільки нижче за колишню розмітку» зміряється чесно — обидва
     заміри в тих самих умовах. */
  const delta = await page.evaluate(() => {
    const box = document.getElementById('milestone-container');
    const now = box.getBoundingClientRect().height;
    const st = document.createElement('style');
    st.textContent = `#milestone-container { padding: 12px 16px !important; }
      .ms-row { display: block !important; }
      #milestone-container .ms-cap { margin-bottom: 7px !important; }`;
    document.head.appendChild(st);
    const was = box.getBoundingClientRect().height;
    st.remove();
    return Math.round(was - now);
  });
  ok('блок став нижчим — і більше ніж на попрошені 5px', delta >= 5, delta);

  // Телефон: три колонки не вміщаються, підпис повертається своїм рядком
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(120);
  const nar = await page.evaluate(() => {
    const cap = document.querySelector('#milestone-container .ms-cap');
    const num = document.getElementById('monthly-spend-label');
    return { capTop: Math.round(cap.getBoundingClientRect().top),
             numTop: Math.round(num.getBoundingClientRect().top) };
  });
  ok('на телефоні підпис стоїть над числами, а не тисне їх',
    nar.capTop < nar.numTop, nar);
  await done(browser, srv, errs);
}
