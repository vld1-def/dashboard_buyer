/* FB LIVE: ФІЛЬТР — МІТКИ ГЕО Й «СПЕНД СЬОГОДНІ».
   «біля group можеш додати вкладку filter (але тільки з іконкою) …
   по міткам або ще spend today». */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8762;
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);
const { ok, done } = checks();

const r = await page.evaluate(() => {
  try { localStorage.removeItem('cabFilt'); } catch (e) {}
  cabFilt = { geo: [], spend: false };
  const day = cabTzDay(undefined);
  cabTodayErr = '';
  cabTodayBy = { '1': { [day]: 50 }, '2': { [day]: 0 }, '3': { [day]: 12 } };
  cabGeo = { '1': { KG: { ads: 2, spend: 40 } }, '2': { TJ: { ads: 1, spend: 0 } },
             '3': { KG: { ads: 1, spend: 5 }, UZ: { ads: 1, spend: 7 } } };
  const mk = id => ({ id, state: 'running', fb: { account_id: id }, row: {}, tok: {} });
  cabAll = [mk('1'), mk('2'), mk('3')];
  const ids = () => cabAll.filter(cabFiltOk).map(c => c.id).join();
  const out = { none: ids() };
  cabFilt.spend = true; out.spend = ids();
  cabFilt.spend = false; cabFilt.geo = ['KG']; out.kg = ids();
  cabFilt.geo = ['TJ', 'UZ']; out.tjuz = ids();
  cabFilt.spend = true; out.both = ids();
  out.geos = cabFiltGeos().map(x => x.g + x.n).join();
  // меню
  const pop = document.getElementById('cab-pop') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'cab-pop', className: 'cab-pop hidden' }));
  cabFilt = { geo: [], spend: false };
  cabFiltMenu();
  out.menu = pop.innerText.replace(/\s+/g, ' ');
  out.chips = pop.querySelectorAll('.cab-filt-g').length;
  window.cabRender = () => {};
  pop.querySelector('.cab-filt-g').click();
  out.after = JSON.stringify(cabFilt);
  out.saved = localStorage.getItem('cabFilt');
  out.clear = !!pop.querySelector('.cab-filt-clear');
  cabFiltPaintBtn();
  out.btnOn = document.getElementById('cab-filt-btn')?.classList.contains('is-filt');
  out.btnIcon = !!document.querySelector('#cab-filt-btn svg') && !/filter/i.test(document.getElementById('cab-filt-btn')?.innerText || '');
  return out;
});
ok('без фільтра — усі', r.none === '1,2,3', r);
ok('spend today — лише зі спендом', r.spend === '1,3', r);
ok('гео KG — де крутиться KG', r.kg === '1,3', r);
ok('кілька гео — будь-яке з вибраних', r.tjuz === '2,3', r);
ok('гео + спенд разом', r.both === '3', r);
ok('список гео від найчастішого', r.geos.startsWith('KG2'), r.geos);
ok('у меню є Spend today і гео', /Spend today/.test(r.menu) && r.chips === 3, r.menu);
ok('клік по гео вмикає його', /"geo":\["KG"\]/.test(r.after), r.after);
ok('вибір зберігається в браузері', /KG/.test(r.saved || ''), r.saved);
ok('зʼявляється Clear', r.clear, r);
ok('кнопка позначена, коли фільтр діє', r.btnOn === true, r);
ok('кнопка — лише іконка', r.btnIcon === true, r);

/* Мітка гео лишається, поки сьогодні є спенд, навіть без активних оголошень. */
const g = await page.evaluate(() => {
  window.tdRow = r => ({ geo: r.g });
  cabSnapRows = [
    { account_id: '9', effective_status: 'PAUSED', spend: 14, g: 'KG' },
    { account_id: '9', effective_status: 'ACTIVE', spend: 0, g: 'TJ' },
    { account_id: '9', effective_status: 'PAUSED', spend: 0, g: 'UZ' }];
  cabGeoBuild();
  const c = { id: '9', fb: { currency: 'USD' } };
  return { list: cabGeoList(c).join(), tip: cabGeoHtml(c) };
});
ok('гео зі спендом сьогодні лишається без активних оголошень', g.list.split(',').includes('KG'), g);
ok('активне гео без спенду теж є', g.list.split(',').includes('TJ'), g);
ok('зупинене й без спенду — мітки немає', !g.list.split(',').includes('UZ'), g);
ok('у підказці сказано, що активних немає', /KG · no active ads/.test(g.tip), g.tip);

await done(browser, srv, errs);
