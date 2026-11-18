/* ═══════════ RESULT У РЯДКУ КАБІНЕТА ═══════════

   «в кабінеті не показується result, тільки окремо по кампаніях».
   Тепер рядок кабінета теж показує Result зі знімка:
     • одна ціль — число з одиницею і ціна;
     • кілька — прочерк, а що там намішано — у підказці;
     • знімка немає — прочерк, а не нуль. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8193;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const r = await page.evaluate(() => {
  const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = [
    { account_id: '1', spend: '30', optimization_goal: 'OFFSITE_CONVERSIONS', custom_event_type: 'LEAD', actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '6' }] },
    { account_id: '1', spend: '20', optimization_goal: 'OFFSITE_CONVERSIONS', custom_event_type: 'LEAD', actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '4' }] },
    { account_id: '2', spend: '50', optimization_goal: 'APP_INSTALLS', actions: [{ action_type: 'mobile_app_install', value: '40' }] },
    { account_id: '2', spend: '20', optimization_goal: 'OFFSITE_CONVERSIONS', custom_event_type: 'LEAD', actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '5' }] }];
  cabSnap = cdSumRows(rows);
  const col = CAB_COLS.find(c => c.key === 'result'), cpr = CAB_COLS.find(c => c.key === 'cpr');
  const one = cdCabResult(cabSnap['1']), mix = cdCabResult(cabSnap['2']);
  return { one: [strip(one.text), strip(one.per)], mix: [strip(mix.text), strip(mix.per)], tip: mix.tip,
           col: strip(col.cell(col.get({ id: '1' }))), cpr: strip(cpr.cell(cpr.get({ id: '1' }))),
           none: col.get({ id: '9' }) };
});
ok('одна ціль — число з одиницею', /^10 leads?$/.test(r.one[0]), r.one);
ok('і ціна результату', r.one[1] === '$5.00', r.one);
ok('кілька цілей — прочерк', r.mix[0] === '—', r.mix);
ok('ціни однією на різне немає', r.mix[1] === '—', r.mix);
ok('ціна кожної цілі — у підказці', /\$1\.25/.test(r.tip) && /\$4\.00/.test(r.tip), r.tip);
ok('колонки Result і Cost / result у рядку кабінета', r.col && /10/.test(r.col) && r.cpr === '$5.00', r);
ok('знімка немає — прочерк, а не нуль', r.none === null);

await done(browser, srv, errs);
