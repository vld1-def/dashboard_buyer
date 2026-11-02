/* ═══════════ ВІКНО ACCOUNTS: ТІЛЬКИ ТЕ, ЩО ВПИСАЛИ РУКОЮ ═══════════

   У стовпчику BROWSER, коли поле profile кабінета порожнє,
   підставлявся другий шматок назви токена (Агент_Браузер_БМ). І
   виглядала ця догадка точно так само, як записане значення.

   А бути вона могла чим завгодно: назву токена пишуть як зручно,
   кабінет могли перенести на інший браузер, а токен лишився старим.
   Тобто вікно показувало те, чого ніхто не казав, і відрізнити це від
   правди було ніяк.

   Стенд тримає:
     1. вписане рукою показується;
     2. невписане лишається прочерком, а не догадкою з назви токена;
     3. у підписі під списком сказано, що тут нічого не вгадується —
        інакше прочерк читався б як «дані десь загубились»;
     4. ID і назва від Facebook лишились: їх ніхто не вигадує. */
import { serve, open, checks } from './_harness.mjs';

const PORT = 8182;
const { ok, done } = checks();
const srv = await serve(PORT);
const { browser, page, errs } = await open(PORT);

const shown = await page.evaluate(() => {
  window.__a = {};
  window.tell = (title, body) => { window.__a = { title, body: String(body) }; };
  /* Рукою вписано лише для 1001. 1002 — той самий токен, те саме
     місце в назві: якби догадка лишилась, у нього стояв би «p9». */
  fbProfiles = { '1001': 'Chrome-7' };
  fbRows = [{ id: 3, label: 'AgentX_p9_BM', team_name: '', status: 'ok',
              scopes: ['ads_read'], checked_at: null, accounts: [
                { id: '1001', name: 'Main cab', status: 'active' },
                { id: '1002', name: 'Spare cab', status: 'disabled' }] }];
  fbShow(3);
  return window.__a;
});

const row = id => (shown.body || '').split('\n').find(l => l.startsWith(id)) || '';

ok('вікно відкрилось назвою токена', shown.title === 'AgentX_p9_BM', shown.title);
ok('вписане рукою показується', /Chrome-7/.test(row('1001')), row('1001'));
/* Головне: догадки з назви токена більше немає. */
ok('невписане лишається прочерком', /—/.test(row('1002')), row('1002'));
ok('і не бере шматок назви токена',
  !/p9/.test(shown.body || ''), shown.body);
/* Прочерк без пояснення читався б як «дані загубились» — а це
   відповідь: у цього кабінета браузер не вписаний. */
ok('сказано, що тут нічого не вгадується',
  /Nothing here is guessed from the token name/.test(shown.body || ''), shown.body);
ok('і що прочерк означає «не вписано»',
  /a dash means it is not filled in/.test(shown.body || ''), shown.body);
/* Те, що приїхало від Facebook, лишається: його ніхто не вигадує. */
ok('ID і назва кабінета на місці',
  /Main cab/.test(row('1001')) && /Spare cab/.test(row('1002')), shown.body);
ok('неактивний кабінет позначений', /\(inactive\)/.test(row('1002')), row('1002'));

/* Токен, який не бачить жодного кабінета, мусить казати причину, а не
   показувати порожній стовпчик. */
const none = await page.evaluate(() => {
  window.__a = {};
  fbRows = [{ id: 4, label: 'Empty', status: 'ok', scopes: [], accounts: [] }];
  fbShow(4);
  return window.__a.body || '';
});
ok('без кабінетів названо найчастішу причину',
  /No ad accounts visible/.test(none) && /Add Assets/.test(none), none);

await done(browser, srv, errs);
