<script>
/* ══════════════════════════════════════════════════════════════════
   UI-шар нового дизайну: навігація, тема, ⌘K, повноекранні панелі
   (Data Hub, Таблиці) та інсайт-картки. Дані бере з тих самих
   глобалів, що й решта дашборда.
   ══════════════════════════════════════════════════════════════════ */
(function () {

  /* ═══════════ РОУТЕР ═══════════
     Кожен пункт меню — окрема сторінка з власною адресою (#/creatives).
     Працюють «назад/вперед» і посилання, але Supabase ініціалізується
     один раз, а не на кожен перехід. Сервер для цього не потрібен —
     GitHub Pages віддає статику, весь роутинг на клієнті. */
  const ROUTES = {
    '':           { dash: true },
    'heatmap':    { section: 'weekly-analysis-section' },
    'creatives':  { section: 'creative-analyzer-section' },
    'geo':        { section: 'device-geo-section' },
    'cabinets':   { section: 'cabinets-section' },
    'domains':    { section: 'domains-section' },
    'team':       { section: 'team-section' },
    'reports':    { section: 'report-builder-section' },
    'expenses':   { section: 'expenses-section' },
    /* ПРИПУЩЕННЯ, ЯКЕ ПРОТЕРМІНУВАЛОСЬ.

       Тут стояв ownDock: «у Form.html є власний плаваючий док, і два
       таких меню накладались би». Доки це було правдою, правило
       працювало. Потім Data Hub переїхав у цю сторінку рамкою, а верхні
       вкладки замінили той док — і HUB_SKIN усередині рамки почав
       ховати його рядком #app-dock{display:none}.

       Відтоді ховались ОБИДВА: наш — цим прапорцем, їхній — скіном. На
       вкладках Campaigns / Records / Sources меню знизу не було зовсім,
       і причина складалась із двох половинок у різних файлах, кожна з
       яких поодинці виглядала розумно.

       Тепер прапорця немає: док у рамці й так прибраний, лишається
       наш. */
    'hub':        { panel: 'datahub-panel' },
    'sheets':     { panel: 'sheets-panel' }
  };
  const SECTIONS = Object.values(ROUTES).map(r => r.section).filter(Boolean);
  const PANELS = ['datahub-panel', 'sheets-panel'];
  // Блоки, які разом складають сторінку «Дашборд»
  const DASH_BLOCKS = ['milestone-container', 'kpi-row', 'charts-row', 'insights-row'];

  window.toggleSidebar = () => document.body.classList.toggle('sb-open');

  /* ═══════════ РОЛЬ ЦІЄЇ ЛЮДИНИ ═══════════

     Роль питаємо в БАЗИ (my_role()), не в localStorage: інакше
     «адміном» став би будь-хто, хто вміє відкрити консоль.

     ⚠️ ЩО ЦЕ ХОВАЄ І ЧОГО НЕ ЗАХИЩАЄ. Нижче ми знімаємо вкладки, яких
     ролі не показують. Це ЗРУЧНІСТЬ, а не доступ: схована вкладка —
     схований div, і хто захоче, покаже його з консолі за секунду.
     Справжня межа — політики в базі (SECURITY_BUYERS.sql, TEAM_ROLES.sql,
     ADMIN_ROLES.sql): навіть відкривши вкладку, людина побачить у ній
     рівно ті рядки, які їй віддає Postgres. Якби тут був єдиний бар'єр,
     це була б дірка, а не налаштування.

     TEAM_ROLES.sql не виконано — my_role() у базі немає, і ми не
     робимо нічого. Поведінка тоді така сама, як до ролей: мовчки
     ховати півдашборда через відсутню функцію було б найгіршим
     із можливих варіантів. */
  window.myRole = 'buyer';

  window.roleBoot = async function () {
    try {
      const { data, error } = await sb.rpc('my_role');
      if (error) throw error;
      window.myRole = String(data || 'buyer');
    } catch (e) {
      console.warn('ролі не налаштовані (my_role):', e.message || e);
      return;
    }
    // Позначка ролі на body. Пункту меню за нею більше немає — сторінка
    // ролей відкривається тільно прямою адресою Admin.html, і в меню її
    // не видно нікому, навіть адміну.
    document.body.classList.toggle('is-role-admin', window.myRole === 'admin');

    /* Свій рядок у team_members. Без нього адмін не має звідки взяти
       user_id: auth.users із браузера не читається, і кожного нового
       довелось би заводити руками в SQL. Політика insert_self дозволяє
       рівно це й рівно собі — роль там прибита до 'buyer'.

       ⚠️ ЦЕЙ БЛОК УЖЕ РАЗ МОВЧАВ, І ЦЕ БУЛА МОЯ ПОМИЛКА. Тут стояв
       try/catch без перевірки error — а PostgREST відмову НЕ кидає
       винятком, він повертає її в полі error. Тож коли політики
       insert_self у базі немає (не виконано БЛОК 5 з ADMIN_ROLES.sql),
       рядок не заводився, людина не з'являлась у списку на Admin.html,
       і про це не було сказано ніде: ні на екрані, ні в консолі.

       Тепер мовчимо РІВНО в одному випадку — рядок уже є (23505,
       дублікат первинного ключа). Це справді нормальний хід подій.
       Будь-яка інша відмова називається вголос разом із причиною. */
    try {
      const { data: u } = await sb.auth.getUser();
      const uid = u && u.user && u.user.id;
      if (uid) {
        const { error } = await sb.from('team_members')
          .insert({ user_id: uid, team_name: currentTeam, role: 'buyer' });
        if (error && error.code !== '23505') console.warn(
          'team_members: свій рядок не завівся, тож у Admin.html вас не буде видно. '
          + 'Найімовірніше не виконано БЛОК 5 з ADMIN_ROLES.sql. '
          + (error.message || error.code || ''));
      }
    } catch (e) {
      console.warn('team_members: свій рядок не завівся —', e.message || e);
    }

    if (window.myRole === 'admin') return;   // адміну не ховаємо нічого

    let acc = {};
    try { acc = JSON.parse((await getTeamSetting('role_access')) || '{}') || {}; } catch (e) {}
    const mine = acc[window.myRole];
    if (!mine) return;                       // для цієї ролі нічого не задано

    // false — явно знято галочку. Відсутній ключ означає «показувати»:
    // нова вкладка не має зникати в усіх, бо її ще не бачила ця таблиця.
    const off = k => mine[k] === false;

    Object.entries(ROUTES).forEach(([key, r]) => {
      if (!off(key)) return;
      if (r.section) document.getElementById(r.section)?.classList.add('hidden');
      // Панелі (Data Hub, Sheets) syncNavVisibility не бачить — у них
      // немає section, тож прибираємо їхні кнопки самі.
      if (r.panel) {
        document.querySelectorAll(`.sb-item[data-nav="${key}"]`)
          .forEach(b => { b.style.display = 'none'; });
        if (key === 'hub') document.querySelectorAll('.sb-item[data-hub]')
          .forEach(b => { b.style.display = 'none'; });
      }
    });
    if (typeof syncNavVisibility === 'function') syncNavVisibility();

    /* Сам Дашборд теж можна зняти — асистенту, якому потрібен лише
       Data Hub. Тоді треба й перевести його на першу дозволену
       сторінку: syncNavVisibility у такому разі відправляє на '',
       тобто рівно на той екран, якого немає. */
    if (off('')) {
      DASH_BLOCKS.forEach(id => document.getElementById(id)?.classList.add('hidden'));
      const firstOk = Object.keys(ROUTES).find(k => k && !off(k));
      if (firstOk) go(firstOk); 
    }
  };

  /* ═══════════ ЧИЙ ЦЕ БРАУЗЕР ═══════════

     Вихід з акаунта (siteLogout) робив signOut і перезавантажував
     сторінку — і не чистив localStorage. Тож наступний користувач у
     тому самому браузері діставав чужу назву команди (selected_team),
     чужі перемикачі видимості блоків (tl_access, dashboard_visibility),
     чужий режим трафіку й чужі налаштування таблиць.

     Виглядало це як «не всі дані підтягуються»: запити йшли з чужим
     team_name і не повертали нічого, а половина блоків була схована
     прапорцями попереднього власника браузера. В інкогніто все було на
     місці рівно тому, що там цього кешу немає.

     Тому запам'ятовуємо, КОМУ належить кеш. Зійшлось — нічого не
     чіпаємо. Не зійшлось — знімаємо все, що привʼязане до акаунта чи
     команди, і перезавантажуємось: частину цих значень уже прочитали
     при старті, тож просто перемалювати недосить.

     Косметику браузера (chart_style, sb_compact) не чіпаємо — вона про
     пристрій, а не про людину. */
  const CACHE_OWN = [
    'selected_team', 'selected_dashboard_month', 'tl_access',
    'dashboard_visibility', 'traffic_mode', 'kpi_lens', 'kpi_net',
    'rb_cols', 'rb_tree', 'cab_range', 'cab_sum_raw', 'cd_only_live',
    'settings_tab', 'set_isub', 'drive_api_key', 'fx_rates'
  ];

  window.cacheGuard = async function () {
    let uid = '';
    try {
      const { data } = await sb.auth.getUser();
      uid = (data && data.user && data.user.id) || '';
    } catch (e) { return; }      // не знаємо, хто це — краще не чіпати нічого
    if (!uid) return;

    let was = '';
    try {
      was = localStorage.getItem('cache_uid') || '';
      localStorage.setItem('cache_uid', uid);
    } catch (e) { return; }      // немає сховища — немає й проблеми
    if (was === uid) return;

    CACHE_OWN.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    // Порожнє was — просто перший вхід у цьому браузері, чистити було
    // нічого й перезавантажуватись ні до чого.
    if (!was) return;
    // uid уже записаний, тож це рівно одне перезавантаження, не цикл.
    location.reload();
    await new Promise(() => {});  // далі завантаження не пускаємо
  };

  /* ═══════════ ПЕРШИЙ ЗАПУСК ═══════════
     Раніше дашборд мовчки підставляв «Makeberry» усім, у кого в браузері
     ще нічого не вибрано. Поки баєр був один — не заважало. Тепер кожен
     новий користувач потрапляв би в чужу назву команди: даних він не
     побачить (їх фільтрує RLS по автору), але писав би свої рядки під
     чужим ярликом.

     Тому: якщо вибору немає — дивимось, чи є в людини власні дані, і
     лише коли їх зовсім немає, питаємо назву. Наявних користувачів це
     не чіпає: у них selected_team уже лежить у localStorage. */
  window.teamFirstRun = function () {
    return new Promise(async resolve => {
      let saved = '';
      try { saved = localStorage.getItem('selected_team') || ''; } catch (e) {}
      if (saved) return resolve(saved);

      // Після RLS цей запит бачить лише власні рядки — тобто якщо щось
      // повернулось, назва команди в людини вже є, питати нема про що.
      try {
        const { data } = await sb.from('daily_stats').select('team_name').limit(1);
        const found = data && data[0] && String(data[0].team_name || '').trim();
        if (found) {
          try { localStorage.setItem('selected_team', found); } catch (e) {}
          return resolve(found);
        }
      } catch (e) { /* немає звʼязку — краще спитати, ніж підставити чуже */ }

      const box = document.getElementById('team-first-run');
      if (!box) return resolve('');
      box.classList.remove('hidden');
      setTimeout(() => document.getElementById('team-first-input')?.focus(), 80);
      document.getElementById('team-first-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') teamFirstSave();
      });
      window._teamFirstResolve = resolve;
    });
  };

  window.teamFirstSave = function () {
    const el = document.getElementById('team-first-input');
    const err = document.getElementById('team-first-err');
    const v = (el?.value || '').trim();
    if (v.length < 3) { err?.classList.remove('hidden'); el?.focus(); return; }
    try { localStorage.setItem('selected_team', v); } catch (e) {}
    document.getElementById('team-first-run')?.classList.add('hidden');
    if (window._teamFirstResolve) window._teamFirstResolve(v);
  };

  /* ─────────── Компактний сайдбар ───────────
     Підписи в компактному режимі ховає CSS (font-size: 0), тож саму назву
     пункту треба кудись подіти — переносимо в title, щоб залишилась
     підказка при наведенні. Робимо це один раз, при першому згортанні,
     і не чіпаємо тих, у кого title уже свій. */
  function sbFillTitles() {
    document.querySelectorAll('#app-sidebar .sb-item').forEach(el => {
      if (el.dataset.tip) return;
      const label = [...el.childNodes]
        .filter(n => n.nodeType === 3).map(n => n.textContent.trim())
        .join(' ').trim();
      if (!label) return;
      el.dataset.tip = '1';
      if (!el.getAttribute('title')) el.setAttribute('title', label);
    });
  }

  function applyCompact(on) {
    document.body.classList.toggle('sb-compact', on);
    if (on) sbFillTitles();
    const btn = document.querySelector('.sb-toggle');
    if (btn) btn.setAttribute('title', on ? 'Expand the sidebar' : 'Collapse the sidebar');

    /* Графіки міряють ширину контейнера при створенні, а вона щойно
       змінилась — тож їх треба перемалювати. Але НЕ посеред анімації.

       Раніше тут стояв setTimeout на 220 мс, підігнаний під тодішню
       тривалість переходу. Перемальовування десятка полотен блокує
       головний потік на сотні мілісекунд, і якщо воно припадає на рух,
       панель просто завмирає посеред шляху. З новою кривою 340 мс так
       і виходило: анімація встигала зробити один кадр.

       Тепер чекаємо на кінець самого переходу ширини — воно саме
       підлаштується, якщо тривалість колись зміниться. Таймер лишається
       запасним: коли рух вимкнений (prefers-reduced-motion) чи ширина
       не змінилась, transitionend не настане ніколи. */
    const el = document.getElementById('app-sidebar');
    let done = false;
    const redraw = () => {
      if (done) return;
      done = true;
      el && el.removeEventListener('transitionend', onEnd);
      window.dispatchEvent(new Event('resize'));
    };
    const onEnd = e => { if (e.target === el && e.propertyName === 'width') redraw(); };

    // Скільки триває сам перехід — питаємо стилі, а не пам'ять. При
    // prefers-reduced-motion переходу немає взагалі, і тоді чекати нема
    // чого: малюємо наступним кадром.
    let ms = 0;
    try {
      ms = Math.max(...String(getComputedStyle(el).transitionDuration || '0s')
        .split(',').map(v => parseFloat(v) * (v.includes('ms') ? 1 : 1000) || 0));
    } catch (e) {}

    if (!ms) return requestAnimationFrame(redraw);
    el.addEventListener('transitionend', onEnd);
    /* Запас великий навмисно. Пізнє перемальовування ніхто не помітить,
       а раннє з'їдає анімацію: на завантаженій сторінці перший кадр
       приходить із затримкою, і тугий таймер випереджає transitionend. */
    setTimeout(redraw, ms + 600);
  }

  window.toggleCompact = () => {
    const on = !document.body.classList.contains('sb-compact');
    try { localStorage.setItem('sb_compact', on ? '1' : '0'); } catch (e) {}
    applyCompact(on);
  };

  try { if (localStorage.getItem('sb_compact') === '1') applyCompact(true); } catch (e) {}

  function currentRoute() {
    const raw = String(location.hash || '').replace(/^#\/?/, '');
    const [name, arg] = raw.split('/');
    return { name: ROUTES[name] ? name : '', arg: arg || '' };
  }

  const off = (id, v) => document.getElementById(id)?.classList.toggle('route-off', v);

  let lastRoute = null;

  function applyRoute(scroll) {
    const { name, arg } = currentRoute();
    const r = ROUTES[name];
    const key = name + '/' + arg;
    const changed = key !== lastRoute;

    DASH_BLOCKS.forEach(id => off(id, !r.dash));
    SECTIONS.forEach(id => off(id, r.section !== id));
    PANELS.forEach(id => document.getElementById(id)?.classList.toggle('hidden', r.panel !== id));
    document.body.classList.toggle('hub-open', !!r.panel);
    document.body.classList.toggle('dock-off', !!r.ownDock);
    // Тільки на дашборді блоки розтягуються на висоту екрана
    document.body.classList.toggle('route-dash', !!r.dash);
    document.body.dataset.route = name || 'dash';
    setActiveNav(name, arg);

    if (!changed) return;
    lastRoute = key;

    if (name === 'hub') {
      const frame = document.getElementById('datahub-frame');
      const mode = arg || 'dataset';
      // Той самий origin — вкладку перемикаємо прямим викликом усередині iframe
      const apply = () => { hubSkin(frame); try { frame.contentWindow.switchMode(mode); } catch (e) {} };
      if (frame && !frame.getAttribute('src')) {
        frame.addEventListener('load', apply, { once: true });
        // Штамп у адресі: без нього Form.html приїжджає з кешу браузера,
        // і правки в Data Hub просто не долітають до екрана.
        const bv = window.BUILD
          || (document.querySelector('meta[name="build"]') || {}).content || '';
        frame.setAttribute('src', 'Form.html?v=' + encodeURIComponent(bv));
      } else apply();
      document.querySelectorAll('#datahub-panel .hub-tabs button')
        .forEach(b => b.classList.toggle('is-active', b.dataset.hub === mode));
    }
    if (name === 'sheets') sheetsLoad();
    if (name === 'expenses') expInit();
    // Кабінети вантажать accounts_mapping при першому заході й далі
    // тільки перемальовуються — список парку міняється рідко.
    if (name === 'cabinets' && typeof cabInit === 'function') cabInit();
    // Домени, як і кабінети, вантажаться один раз при першому заході.
    if (name === 'domains' && typeof dmInit === 'function') dmInit();
    // Сторінка тімліда. Так само вантажиться при заході, а не на старті:
    // баєрові вона взагалі не відкриється, тож витрачати на неї запити
    // при кожному завантаженні дашборда сенсу немає.
    if (name === 'team' && typeof tmOpen === 'function') tmOpen();

    document.body.classList.remove('sb-open');
    /* Гортається тепер колонка контенту, а не вікно: window.scrollTo
       після переходу не робив би нічого, і кожна сторінка відкривалась
       би там, де ти кинув попередню. */
    if (scroll) {
      const box = document.querySelector('.app-content');
      if (box) box.scrollTop = 0; else window.scrollTo({ top: 0 });
    }
  }

  function setActiveNav(name, arg) {
    document.querySelectorAll('.sb-item[data-nav]').forEach(b =>
      b.classList.toggle('is-active', b.dataset.nav === name));
    document.querySelectorAll('.sb-item[data-hub]').forEach(b =>
      b.classList.toggle('is-active', name === 'hub' && b.dataset.hub === (arg || 'dataset')));
    document.querySelectorAll('.sb-item[data-sheet]').forEach(b =>
      b.classList.toggle('is-active', name === 'sheets'));
  }

  const go = h => {
    const next = '#/' + h;
    if (location.hash === next) applyRoute(true);
    else location.hash = next;
  };

  window.navGo      = name => go(name);
  window.hubOpen    = mode => go('hub/' + (mode || 'dataset'));
  window.hubClose   = () => go('');
  window.sheetsOpen = () => go('sheets');
  window.sheetsClose = () => go('');

  window.addEventListener('hashchange', () => applyRoute(true));

  /* ─────────── Нижня половина сайдбара ───────────
     Data Hub, Таблиці й Джерела — не сторінки, а панелі: секції в DOM
     під ними немає, тож видимістю секції їх не вимкнеш. Тримаємо для
     них окремий список прихованих і ховаємо самі пункти меню.
     Живе в localStorage, бо це вибір конкретної людини, а не команди:
     сховав у себе — не сховав усім. */
  const SB_TOOLS = {
    'tool-hub-dataset':   '.sb-item[data-hub="dataset"]',
    'tool-hub-records':   '.sb-item[data-hub="records"]',
    'tool-sheets':        '.sb-item[data-sheet]',
    'tool-hub-providers': '.sb-item[data-hub="providers"]'
  };
  const SB_TOOLS_KEY = 'sidebar_tools';

  function sbToolsRead() {
    try { return JSON.parse(localStorage.getItem(SB_TOOLS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }

  // Типово все увімкнено: у списку лежать лише свідомо вимкнені.
  window.sbToolsApply = function () {
    const off = sbToolsRead();
    Object.entries(SB_TOOLS).forEach(([id, sel]) => {
      const on = off[id] !== false;
      const cb = document.getElementById(id);
      if (cb) cb.checked = on;
      document.querySelectorAll(sel).forEach(el => el.style.display = on ? '' : 'none');
    });
  };

  window.sbToolSet = function (cb) {
    const off = sbToolsRead();
    off[cb.id] = !!cb.checked;
    try { localStorage.setItem(SB_TOOLS_KEY, JSON.stringify(off)); } catch (e) {}
    sbToolsApply();
    if (typeof setSaved === 'function') setSaved();
  };

  // Вимкнений у налаштуваннях (або закритий для тімліда) розділ не має
  // висіти в меню: клікати нема куди.
  window.syncNavVisibility = function () {
    let hidHere = '';
    document.querySelectorAll('.sb-item[data-nav]').forEach(b => {
      const r = ROUTES[b.dataset.nav];
      if (!r || !r.section) return;
      const sec = document.getElementById(r.section);
      const off = !sec || sec.classList.contains('hidden');
      b.style.display = off ? 'none' : '';
      if (off && b.dataset.nav === (document.body.dataset.route || '')) hidHere = b.dataset.nav;
    });
    sbToolsApply();
    // Вимкнули сторінку, на якій стоїмо, — лишитись на ній означало б
    // порожній екран без жодного пункту меню, щоб піти геть.
    if (hidHere) go('');
  };

  /* ─────────── Скін для вбудованого Form.html ───────────
     Джерела лишаються однією реалізацією у Form.html — дублювати
     ~700 рядків логіки кабінетів, воронок, Keitaro й APP у другий файл
     означало б два місця, що пишуть в одні таблиці. Замість цього
     той самий прийом, яким зроблено весь новий дизайн: шар стилів
     поверх наявної розмітки, лише вставлений усередину iframe. */
  const HUB_SKIN = `
    :root{--bg:#0A0A0C;--surface:#121216;--surface-2:#17171C;--surface-3:#1E1E24;
          --border:rgba(255,255,255,.07);--border-2:rgba(255,255,255,.13);
          --text-main:#E9E9EC;--text-muted:#8A8A95;}
    body{background:var(--bg) !important;background-image:none !important;
         color:var(--text-main);font-family:Inter,ui-sans-serif,system-ui,sans-serif;}
    .card{background:var(--surface) !important;border:1px solid var(--border) !important;
          border-radius:14px !important;backdrop-filter:none !important;box-shadow:none !important;}
    .card::before{display:none !important;}
    .card[class*="border-t-"]{border-top-width:1px !important;border-top-color:var(--border) !important;}
    h1,h2,h3{font-style:normal !important;text-transform:none !important;letter-spacing:-.01em !important;}
    h3{font-size:15px !important;}
    input,select,textarea{background:var(--surface-2) !important;border:1px solid var(--border) !important;
      border-radius:9px !important;color:var(--text-main) !important;font-size:12px !important;}
    input:focus,select:focus,textarea:focus{border-color:rgba(139,92,246,.55) !important;
      box-shadow:0 0 0 3px rgba(139,92,246,.12) !important;outline:none !important;}
    table thead tr,table thead{background:var(--surface-2) !important;backdrop-filter:none !important;}
    table th{color:var(--text-muted) !important;font-size:10px !important;}
    table td{font-size:12px !important;}
    #app-dock{background:rgba(18,18,21,.92) !important;border:1px solid var(--border) !important;
      border-radius:16px !important;}
    ::-webkit-scrollbar-thumb{background:var(--surface-3) !important;}
    #app-dock{display:none !important;}
  `;

  function hubSkin(frame) {
    try {
      const doc = frame && frame.contentDocument;
      if (!doc || !doc.head || doc.getElementById('hub-skin')) return;
      const st = doc.createElement('style');
      st.id = 'hub-skin';
      st.textContent = HUB_SKIN;
      doc.head.appendChild(st);
    } catch (e) { /* інший origin — тоді просто без скіна */ }
  }

  /* ─────────── Витрати ─────────── */
  /* Іконки, а не емодзі. Емодзі малює операційна система: на кожній воно
     своє, під тему не фарбується, і в темному інтерфейсі світиться
     яскравіше за власні дані. SVG успадковує currentColor, тож категорія
     і її колір — це одне й те саме.

     Гліфи навмисно прості, по одному штриху: у рядку таблиці вони
     розміром 13px, і будь-яка деталь там перетворюється на пляму. */
  const EXP_ICONS = {
    // картка
    accounts: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
    // будівля
    fp: '<path d="M3 21h18M4 21V10l8-5 8 5v11M9 21v-5h6v5"/>',
    // двоє
    team: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/>'
          + '<path d="M16 5.5a3.2 3.2 0 0 1 0 5M18 20a6.5 6.5 0 0 0-2.2-4.9"/>',
    // ключ
    tools: '<path d="M15.5 3a5.5 5.5 0 0 0-5.1 7.6L3 18v3h3l7.4-7.4A5.5 5.5 0 1 0 15.5 3z"/>',
    // коробка
    other: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>'
  };
  const EXP_LABELS = { accounts:'Accounts', fp:'Entities', team:'Team', tools:'Tools', other:'Other' };
  const EXP_COLORS = { accounts:'#60A5FA', fp:'#FACC15', team:'#C4B5FD', tools:'#94A3B8', other:'#FB7185' };
  const EXP_ORDER = ['accounts', 'fp', 'team', 'tools', 'other'];

  const expIcon = k => '<svg class="exp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (EXP_ICONS[k] || EXP_ICONS.other) + '</svg>';

  /* Вибір категорії. Значення лежить у прихованому полі з тим самим id,
     що був у випадайки, — решта коду про заміну навіть не знає. */
  window.expPickCat = function (k) {
    const hid = document.getElementById('exp-category');
    if (hid) hid.value = k;
    document.querySelectorAll('#exp-cats .exp-chip').forEach(b =>
      b.classList.toggle('is-on', b.dataset.cat === k));
  };

  function expCatsRender() {
    const box = document.getElementById('exp-cats');
    if (!box) return;
    const cur = (document.getElementById('exp-category') || {}).value || EXP_ORDER[0];
    box.innerHTML = EXP_ORDER.map(k => `
      <button type="button" class="exp-chip${k === cur ? ' is-on' : ''}" data-cat="${k}"
        style="--cat:${EXP_COLORS[k]}" onclick="expPickCat('${k}')">
        ${expIcon(k)}<span>${EXP_LABELS[k]}</span></button>`).join('');
  }

  const money2 = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ОДИН ФІЛЬТР МІСЯЦЯ НА ДАШБОРД, А НЕ ДВА.

     Тут стояв власний список місяців. Він дублював фільтр дашборда, і
     два незалежні перемикачі на одному екрані — це спосіб подивитись
     на витрати одного місяця поруч із профітом іншого й нічого не
     запідозрити.

     Тепер місяць один: той, що вибраний у дашборді. Порожній фільтр
     («усі місяці») означає тут поточний — підсумок витрат за всю
     історію не має сенсу в рядку «Counted in Net Profit». */
  const expMonth = () => {
    let m = '';
    try { m = String(currentMonthFilter || '').slice(0, 7); } catch (e) {}
    return /^\d{4}-\d{2}$/.test(m) ? m : new Date().toISOString().slice(0, 7);
  };

  window.expInit = async function () {
    const dateEl = document.getElementById('exp-date');
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
    expCatsRender();
    expLoad();
  };

  window.expLoad = async function () {
    const body = document.getElementById('exp-body');
    const totalEl = document.getElementById('exp-total');
    if (!body) return;
    const month = expMonth();
    const label = document.getElementById('exp-month-label');
    if (label) label.textContent = month;

    let rows = null;
    try {
      const { data, error } = await sb.from('expenses')
        .select('*').eq('team_name', currentTeam)
        .gte('date', month + '-01').lte('date', month + '-31')
        .order('date', { ascending: false });
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5" class="exp-empty">Failed to load: ${e.message || e}</td></tr>`;
      return;
    }

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="exp-empty">No expenses in ${month}</td></tr>`;
      if (totalEl) totalEl.textContent = '$0.00';
      return;
    }
    if (totalEl) totalEl.textContent = money2(rows.reduce((a, r) => a + (Number(r.amount) || 0), 0));

    body.innerHTML = rows.map(r => `
      <tr>
        <td class="exp-date">${r.date || ''}</td>
        <td><span class="exp-cat" style="color:${EXP_COLORS[r.category] || 'var(--text-main)'}">${
          expIcon(r.category)}${EXP_LABELS[r.category] || r.category || '—'}</span></td>
        <td class="exp-desc">${String(r.description || '—').replace(/</g, '&lt;')}</td>
        <td class="exp-amount">${money2(r.amount)}</td>
        <td class="text-right"><button class="exp-del" onclick="expDelete('${r.id}')" title="Delete">✕</button></td>
      </tr>`).join('');
  };

  window.expAdd = async function () {
    const date = document.getElementById('exp-date')?.value;
    const category = document.getElementById('exp-category')?.value;
    const amount = parseFloat(document.getElementById('exp-amount')?.value) || 0;
    const description = (document.getElementById('exp-desc')?.value || '').trim();
    if (!date || !amount) return alert('Enter a date and an amount');
    try {
      const { error } = await sb.from('expenses')
        .insert([{ team_name: currentTeam, date, category, amount, description }]);
      if (error) throw error;
    } catch (e) { return alert('Could not save: ' + (e.message || e)); }
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-desc').value = '';
    expLoad();
    // Витрати входять у Net Profit — оновлюємо дашборд
    if (typeof loadExpenses === 'function') loadExpenses();
  };

  window.expDelete = async function (id) {
    if (!await ask({ title: 'Delete the expense?', danger: true, ok: 'Delete',
      body: 'This row will be gone from the list.' })) return;
    try { await sb.from('expenses').delete().eq('id', id); }
    catch (e) { return alert('Could not delete: ' + (e.message || e)); }
    expLoad();
    if (typeof loadExpenses === 'function') loadExpenses();
  };

  /* ─────────── Google Таблиці ─────────── */
  let sheets = [], sheetsIdx = 0, sheetsLoaded = false;

/* ТУТ ЖИВУТЬ НЕ ЛИШЕ ТАБЛИЦІ GOOGLE.

   Notion попросили «так само, як таблиці» — і це правильно: окремий
   розділ під другий список посилань нічого не додав би, крім ще однієї
   кнопки в меню. Тому список один, і в ньому обидва види.

   АЛЕ NOTION НЕ ВБУДОВУЄТЬСЯ ВЗАГАЛІ. ЖОДЕН.

   Спершу тут було написано, що робоча сторінка (notion.so, notion.com,
   app.notion.com) не вбудовується, а опублікована (*.notion.site) —
   вбудовується. Друга половина виявилась неправдою: notion.site віддає
   той самий X-Frame-Options: SAMEORIGIN, і браузер відмовляє так само.
   Налаштування, яке це вмикає, у Notion немає — ні на сторінці, ні на
   сайті, ні в тарифі.

   Ціна помилки була не в коді: людині сказали «опублікуй, і запрацює»,
   вона опублікувала сторінку — і отримала ту саму відмову. Тому тут
   тепер один вид notion і жодної обіцянки: посилання зберігається,
   відкривається в новій вкладці, і сказано чому. Обходу немає, і
   вигадувати його не можна. */
  function sheetKind(u) {
    const v = String(u || '').trim();
    if (/\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(v)) return 'gs';
    /* Доменів у Notion чотири: старий notion.so, новий notion.com,
       app.notion.com у застосунку і notion.site в опублікованих.
       Поводимось з усіма однаково, бо так само поводиться й Notion. */
    if (/^https?:\/\/([a-z0-9-]+\.)*notion\.(so|com|site)(\/|$)/i.test(v)) return 'notion';
    return '';
  }

  // /edit не дозволяє вбудовування (X-Frame-Options), /preview — так.
  function sheetPreview(u) {
    // Notion у рамку не йде ніколи — див. довгий коментар вище.
    if (sheetKind(u) === 'notion') return '';
    const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(u || '');
    if (!m) return '';
    const gid = /[#&?]gid=(\d+)/.exec(u || '');
    return `https://docs.google.com/spreadsheets/d/${m[1]}/preview` + (gid ? `#gid=${gid[1]}` : '');
  }

  async function sheetsSave() {
    if (typeof setTeamSetting === 'function') {
      try { await setTeamSetting('google_sheets', JSON.stringify(sheets)); }
      catch (e) { console.warn('sheets save failed:', e.message); }
    }
  }

  async function sheetsLoad() {
    if (!sheetsLoaded) {
      sheetsLoaded = true;
      try {
        const raw = typeof getTeamSetting === 'function' ? await getTeamSetting('google_sheets') : null;
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) sheets = parsed;
      } catch (e) { sheets = []; }
    }
    sheetsRender();
  }

  window.sheetsPick = function (i) {
    sheetsIdx = Number(i) || 0;
    /* Вибрали таблицю Google — відкритий файл закриваємо: два джерела
       в одній рамці означали б, що видно не те, що вибрали. */
    if (typeof shCloseFile === 'function' && shFile) return shCloseFile();
    sheetsRender();
  };

  window.sheetsToggleAdd = function () {
    document.getElementById('sh-add')?.classList.toggle('hidden');
    document.getElementById('sh-name')?.focus();
  };

  window.sheetsAdd = async function () {
    const name = (document.getElementById('sh-name')?.value || '').trim();
    const url = (document.getElementById('sh-url')?.value || '').trim();
    if (!url) return alert('Paste a link to a Google Sheet or a Notion page');
    const kind = sheetKind(url);
    if (!kind) return alert('That does not look like a Google Sheets or Notion link');
    sheets.push({ name: name || (kind === 'gs' ? `Sheet ${sheets.length + 1}`
                                              : `Notion ${sheets.length + 1}`), url });
    sheetsIdx = sheets.length - 1;
    document.getElementById('sh-name').value = '';
    document.getElementById('sh-url').value = '';
    document.getElementById('sh-add')?.classList.add('hidden');
    await sheetsSave();
    sheetsRender();
  };

  window.sheetsRemove = async function () {
    const cur = sheets[sheetsIdx];
    if (!cur) return;
    /* «stays in Google» було правдою, поки тут жили лише таблиці. Тепер
       у списку й Notion, і обіцяти не те місце не можна. */
    const where = sheetKind(cur.url) === 'gs' ? 'Google'
                : sheetKind(cur.url) === 'notion' ? 'Notion' : 'its own place';
    if (!await ask({ title: 'Remove it from the list?', danger: true, ok: 'Remove',
      body: `Remove “${cur.name}” from the list?\n\nOnly the link goes — the page itself stays in ${where}.` })) return;
    sheets.splice(sheetsIdx, 1);
    sheetsIdx = Math.max(0, sheetsIdx - 1);
    await sheetsSave();
    sheetsRender();
  };

  function sheetsRender() {
    const sel = document.getElementById('sh-select');
    const frame = document.getElementById('sh-frame');
    const empty = document.getElementById('sh-empty');
    const open = document.getElementById('sh-open');
    if (!sel || !frame || !empty) return;
    /* Відкритий файл головніший: він тут просто зараз, а список Google
       нікуди не дінеться. Інакше будь-яке перемальовування списку
       згортало б таблицю, яку щойно відкрили. */
    if (shFile) return;

    sel.innerHTML = sheets.map((s, i) =>
      `<option value="${i}" ${i === sheetsIdx ? 'selected' : ''}>${String(s.name).replace(/</g, '&lt;')}</option>`).join('');

    const cur = sheets[sheetsIdx];
    if (!cur) {
      frame.classList.add('hidden');
      frame.removeAttribute('src');
      empty.classList.remove('hidden');
      empty.innerHTML = `<p>Your Google Sheets and Notion pages live here.</p>
        <p class="sh-hint">Hit “+ Add” and paste a link — it is saved for the whole team.
        A Google Sheet opens right here, read-only; use “Edit” to make changes.
        A Notion page opens in a new tab: Notion forbids being embedded in other sites, and
        publishing it does not change that.</p>`;
      if (open) open.style.display = 'none';
      return;
    }
    empty.classList.remove('hidden');
    if (open) { open.style.display = ''; open.href = cur.url; }

    /* NOTION: НЕ ВДАЄМО, ЩО ПОКАЗАЛИ.

       Рамку не показуємо взагалі — браузер однаково відмовить, і в ній
       буде «notion.site refused to connect» на півекрана. Виглядає як
       поломка дашборда, хоч нічого не поламано. */
    if (sheetKind(cur.url) === 'notion') {
      frame.classList.add('hidden');
      frame.removeAttribute('src');
      empty.innerHTML = `<p>Notion pages cannot be shown inside the dashboard.</p>
        <p class="sh-hint">Notion sends a header that forbids being embedded in any other site,
        and there is no setting that changes it — not on the page, not on the published site, not
        in any plan. Publishing does not help: a <b>notion.site</b> link is refused the same way.
        <br><br>The link stays in this list, and “Edit” above opens it in a new tab. Nothing is
        broken here, and there is no way around it from this side.</p>
        <p class="sh-hint" style="margin-top:.75rem">
          <a href="${String(cur.url).replace(/"/g, '&quot;')}" target="_blank" rel="noopener"
             class="sh-btn">Open in Notion</a></p>`;
      return;
    }

    const src = sheetPreview(cur.url);
    if (!src) {
      /* Посилання, яке ми не вміємо вбудувати, могло потрапити в список
         із давніших часів, коли перевірки не було. Порожня рамка
         сказала б про це лише білим кольором. */
      frame.classList.add('hidden');
      frame.removeAttribute('src');
      empty.innerHTML = `<p>This link cannot be shown here.</p>
        <p class="sh-hint">It is neither a Google Sheets link nor a Notion page. It stays in the
        list and “Edit” above opens it in a new tab.</p>`;
      return;
    }
    empty.classList.add('hidden');
    frame.classList.remove('hidden');
    if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
  }

  /* ─────────── CSV і XLSX просто тут ───────────

     Таблиця, яку прислали файлом, — це та сама таблиця. Досі, щоб її
     подивитись, треба було або залити в Google, або відкрити Excel:
     обидва шляхи ведуть із дашборда геть, а повертаються з них не
     завжди.

     Файл читається В БРАУЗЕРІ й НІКУДИ не йде — ні в Supabase, ні в
     Google. Це не дрібниця: у вивантаженнях із партнерки їдуть sub-id,
     а часом і дані людей, і заливати їх кудись заради перегляду —
     непропорційна ціна за погляд. */

  let shFile = null;        // { name, tabs: [{ name, rows }], idx }

  const shEsc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  /* Скільки рядків малюємо. Тридцять тисяч рядків у DOM кладуть
     вкладку намертво, а прочитати їх очима все одно неможливо. */
  const SH_MAX_ROWS = 2000;

  window.shPick = function () { document.getElementById('sh-file')?.click(); };

  /* Роздільник вгадуємо по ПЕРШОМУ рядку: у заголовку немає чисел із
     комами й лапок із крапкою з комою всередині, тож саме там підрахунок
     чесний. Рахувати по всьому файлу — значить дати одному полю з
     крапкою з комою переважити сотню звичайних ком. */
  function shDelim(head) {
    const n = (ch) => head.split(ch).length;
    const by = [[',', n(',')], [';', n(';')], ['\t', n('\t')], ['|', n('|')]];
    by.sort((a, b) => b[1] - a[1]);
    return by[0][1] > 1 ? by[0][0] : ',';
  }

  /* Свій розбір, а не split(','): у полі цілком законно лежить кома,
     лапка й навіть перенос рядка — саме так Excel зберігає адреси й
     нотатки. Розбір по split перетворив би один такий рядок на три
     покалічені. */
  function shCsv(text) {
    const first = text.slice(0, text.indexOf('\n') + 1 || text.length);
    const d = shDelim(first);
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
        continue;
      }
      if (ch === '"') { q = true; continue; }
      if (ch === d) { row.push(cur); cur = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; continue; }
      cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    // Хвостовий порожній рядок — це перенос у кінці файла, а не дані.
    while (rows.length && rows[rows.length - 1].every(c => c === '')) rows.pop();
    return rows;
  }

  /* SheetJS вантажимо НА ВИМОГУ. Майже мегабайт заради кнопки, якою
     користуються раз на тиждень, платили б усі й щоразу — зокрема ті,
     хто відкриває дашборд подивитись спенд. */
  let shLibAt = null;
  function shLib() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (shLibAt) return shLibAt;
    shLibAt = new Promise((ok, no) => {
      const el = document.createElement('script');
      el.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      el.onload = () => window.XLSX ? ok(window.XLSX) : no(new Error('loaded but empty'));
      el.onerror = () => { shLibAt = null; no(new Error('could not load the XLSX reader')); };
      document.head.appendChild(el);
    });
    return shLibAt;
  }

  window.shChose = async function (file) {
    const inp = document.getElementById('sh-file');
    if (inp) inp.value = '';          // той самий файл мусить відкриватись двічі
    if (!file) return;
    const box = document.getElementById('sh-table');
    const bar = document.getElementById('sh-filebar');
    document.getElementById('sh-frame')?.classList.add('hidden');
    document.getElementById('sh-empty')?.classList.add('hidden');
    bar?.classList.remove('hidden');
    box?.classList.remove('hidden');
    if (bar) bar.innerHTML = '<span class="sh-fname">' + shEsc(file.name) + '</span>';
    if (box) box.innerHTML = '<p class="sh-note">Reading…</p>';
    shSel = new Set(); shAnchor = -1;
    document.getElementById('sh-sum')?.classList.add('hidden');
    try {
      const buf = await file.arrayBuffer();
      shFile = /\.(xlsx|xls)$/i.test(file.name)
        ? await shReadBook(buf, file.name)
        : shReadCsv(buf, file.name);
    } catch (e) {
      shFile = null;
      if (bar) bar.classList.add('hidden');
      if (box) box.innerHTML = '<p class="sh-note">Could not open: ' + shEsc(e.message) + '</p>';
      return;
    }
    shPaint();
  };

  function shReadCsv(buf, name) {
    /* Тим самим розбирачем, що й перегляд файлів: .csv з партнерки
       часто зберігають у windows-1251, і суворий UTF-8 на ньому падає.
       Без цього кирилиця в заголовках перетворюється на сміття. */
    const text = typeof flDecode === 'function'
      ? flDecode(buf) : new TextDecoder('utf-8').decode(buf);
    return { name, idx: 0, tabs: [{ name: 'Sheet', rows: shCsv(text) }] };
  }

  async function shReadBook(buf, name) {
    const X = await shLib();
    const wb = X.read(buf, { type: 'array' });
    const tabs = (wb.SheetNames || []).map(n => ({
      name: n,
      /* header:1 — рядками, а не обʼєктами: у вивантаженнях бувають
         однакові заголовки, і обʼєкт тихо лишив би з них один.
         defval — щоб порожня комірка лишалась коміркою, інакше рядок
         поїде вліво й числа стануть не під своїми стовпчиками. */
      rows: X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' })
    }));
    if (!tabs.length) throw new Error('the workbook has no sheets');
    return { name, idx: 0, tabs };
  }

  /* ── ВИДІЛЕННЯ РЯДКІВ І СУМА СТОВПЦЯ ──

     Найчастіше питання до вивантаження — «скільки разом». Досі на це
     треба було лізти в Excel, тобто йти з дашборда геть по число,
     яке рахується за секунду.

     Виділяємо РЯДКАМИ, а не комірками: у вивантаженні рядок — це подія
     (день, кампанія, виплата), і «підсумуй ось ці» майже завжди
     означає саме рядки. Комірковий вибір мишею на телефоні ще й
     неможливо зробити пальцем. */

  let shSel = new Set();     // індекси показаних рядків
  let shAnchor = -1;         // від чого рахувати діапазон для shift-кліку

  /* ЧИСЛО ЧИ НЕ ЧИСЛО — вирішуємо ПО СТОВПЧИКУ, а не по комірці.
     Причина в комі: «1,234» — це і тисяча двісті тридцять чотири, і
     одна ціла двісті тридцять чотири, і з однієї комірки цього не
     видно. А от по всьому стовпчику видно: якщо хоч десь після коми
     НЕ три цифри («12,5»), то кома в цьому стовпчику десяткова, і
     тоді вона десяткова скрізь. Помилитись тут дорого: неправильна
     сума гірша за відсутню, бо виглядає так само переконливо. */
  /* Дата — не показник. «01.09» і «02.09» — це перше й друге вересня,
     а не 1.09 і 2.09, і підсумок 6.27 по них виглядає так само
     переконливо, як справжня сума. Саме тому дати треба впізнати й
     пропустити: мовчазне безглузде число гірше за його відсутність.

     Але й навпаки помилитись не можна, і це небезпечніше: перша версія
     цієї перевірки вважала датою «62.10» і «9.35» — і стовпчик грошей
     мовчки зникав із підсумку. Тому впізнаємо лише те, що датою бути
     МУСИТЬ:
       · рік у складі — «01.09.2026», «2026-09-01»;
       · роздільник / або - — у грошах їх не буває;
       · дві частини через крапку І провідний нуль І місяць ≤ 12 —
         «01.09» пишуть саме так, а «62.10» і «9.35» під це не
         підпадають, бо нуля попереду не мають.
     Сумнівне лишається числом: втратити сумнівний стовпчик гірше, ніж
     показати суму по тому, що виявилось датою. */
  function shIsDate(t) {
    const v = String(t).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) return true;         // ISO
    if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(v)) return true; // з роком
    if (/^\d{1,2}[/-]\d{1,2}$/.test(v)) return true;             // / або -
    const m = /^(\d{2})\.(\d{1,2})$/.exec(v);                    // «01.09»
    return !!m && m[1][0] === '0' && Number(m[2]) >= 1 && Number(m[2]) <= 12;
  }

  function shNumCol(vals) {
    let seen = 0, dotAndComma = 0, decimalComma = 0, dates = 0, ids = 0, pcts = 0;
    vals.forEach(v => {
      const t = String(v == null ? '' : v).trim();
      if (!t) return;
      const c = t.replace(/[^0-9.,-]/g, '');
      if (!c) return;
      seen++;
      if (shIsDate(t)) dates++;
      /* Айді — не показник. Номер кабінета у Facebook має 15-16 цифр, і
         складені докупи вони дають 3,349,896,616,961,529: число, яке
         виглядає як відповідь, а не означає нічого. Жоден показник —
         ні гроші, ні кліки — не буває цілим на дванадцять цифр, тож
         межа безпечна з обох боків. */
      if (/^\d{12,}$/.test(c)) ids++;
      if (/%\s*$/.test(t)) pcts++;
      const hasC = c.includes(','), hasD = c.includes('.');
      if (hasC && hasD) dotAndComma++;
      // Кома, після якої не рівно три цифри, буває тільки десятковою.
      if (hasC && !/,\d{3}(\D|$)/.test(c + ' ')) decimalComma++;
      if (hasC && /,\d{1,2}$/.test(c)) decimalComma++;
    });
    if (!seen) return null;
    /* ВСІ значення, а не половина: один рядок «01.09» серед грошей —
       це випадковість, а не привід викинути стовпчик цілком. */
    if (dates === seen) return { skip: 'dates' };
    if (ids === seen) return { skip: 'ids' };
    /* Є і крапка, і кома — роздільник дробу той, що ПРАВІШЕ: так
       записують і «1.234,56», і «1,234.56», і сплутати їх не можна. */
    /* Відсотки СУМУВАТИ не можна: 1.24% + 0.98% — це не 2.22% нічого.
       Показуємо середнє й підписуємо його, щоб ніхто не прочитав його
       як суму. */
    return { decComma: dotAndComma ? false : decimalComma > 0,
             mixed: dotAndComma > 0, pct: pcts === seen };
  }

  function shNum(raw, how) {
    let t = String(raw == null ? '' : raw).trim();
    if (!t) return null;
    // Дужки — від'ємне: так пишуть мінус у бухгалтерських вивантаженнях.
    const paren = /^\(.*\)$/.test(t);
    // Валюта, пробіли, нерозривні пробіли, знак відсотка — не цифри.
    t = t.replace(/[\s  ]/g, '').replace(/[^0-9.,-]/g, '');
    if (!t || !/\d/.test(t)) return null;
    if (how && how.mixed) {
      // Роздільник дробу — той, що правіше; другий знак групує.
      const lastC = t.lastIndexOf(','), lastD = t.lastIndexOf('.');
      if (lastC > lastD) t = t.replace(/\./g, '').replace(',', '.');
      else t = t.replace(/,/g, '');
    } else if (how && how.decComma) {
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return paren ? -n : n;
  }

  /* Показуємо стільки знаків, скільки їх у даних, але не більше двох:
     сума копійок із трьома знаками — це вже не те число, яке лежить у
     файлі, а результат нашого округлення. */
  const shFmt = (n) => (Math.round(n * 100) / 100)
    .toLocaleString('en-US', { maximumFractionDigits: 2 });

  window.shRowPick = function (i, shift) {
    const n = Number(i);
    if (shift && shAnchor >= 0) {
      const [a, b] = shAnchor < n ? [shAnchor, n] : [n, shAnchor];
      for (let k = a; k <= b; k++) shSel.add(k);
    } else {
      if (shSel.has(n)) shSel.delete(n); else shSel.add(n);
      shAnchor = n;
    }
    shMark();
  };

  window.shPickAll = function () {
    const tab = shFile && (shFile.tabs[shFile.idx] || shFile.tabs[0]);
    const rows = tab ? Math.max(0, (tab.rows || []).length - 1) : 0;
    const shown = Math.min(rows, SH_MAX_ROWS);
    if (shSel.size >= shown) shSel = new Set();
    else { shSel = new Set(); for (let k = 0; k < shown; k++) shSel.add(k); }
    shAnchor = -1;
    shMark();
  };

  /* Перемальовуємо ТІЛЬКИ підсвітку й підсумок, а не всю таблицю: на
     двох тисячах рядків повний перемальов помітний пальцем. */
  function shMark() {
    document.querySelectorAll('#sh-table tbody tr').forEach(tr => {
      tr.classList.toggle('is-sel', shSel.has(Number(tr.dataset.i)));
    });
    shSum();
  }

  function shSum() {
    const box = document.getElementById('sh-sum');
    if (!box) return;
    if (!shFile || !shSel.size) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const tab = shFile.tabs[shFile.idx] || shFile.tabs[0];
    const rows = tab.rows || [];
    const head = rows[0] || [];
    const body = rows.slice(1);
    const picked = [...shSel].sort((a, b) => a - b).map(i => body[i]).filter(Boolean);
    const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);

    const bits = [];
    const skipped = [];
    for (let c = 0; c < cols; c++) {
      const vals = picked.map(r => r[c]);
      const how = shNumCol(vals);
      const label = String(head[c] || 'col ' + (c + 1));
      if (!how) continue;                       // узагалі не числа — це текст
      /* Пропущений стовпчик мусить бути НАЗВАНИЙ. Мовчки прибраний
         показник виглядає точно як вада: «а чому тут немає суми». */
      if (how.skip) { skipped.push(label + ' (' + how.skip + ')'); continue; }
      let sum = 0, n = 0;
      vals.forEach(v => { const x = shNum(v, how); if (x != null) { sum += x; n++; } });
      /* Стовпчик, де число трапилось раз на двадцять рядків, — це
         текст із випадковою цифрою, а не показник. Сума по ньому
         виглядала б як відповідь на питання, якого ніхто не ставив. */
      if (!n || n * 2 < picked.length) continue;
      const pct = how.pct;
      bits.push('<span class="sh-sum-i"><b>' + shEsc(label) + '</b> '
        + (pct ? 'avg ' : '') + shFmt(pct ? sum / n : sum) + (pct ? '%' : '')
        + (n < picked.length ? ' <i>(' + n + ')</i>' : '') + '</span>');
    }

    box.classList.remove('hidden');
    box.innerHTML = '<span class="sh-sum-n">' + picked.length + ' row(s)</span>'
      + (bits.length ? bits.join('') : '<span class="sh-sum-i">no numeric column here</span>')
      + (skipped.length
          ? '<span class="sh-sum-i sh-skip" title="Summing these would give a number that looks like an answer but means nothing">'
            + 'skipped: ' + shEsc(skipped.join(', ')) + '</span>' : '')
      + '<button class="sh-btn" onclick="shClearPick()">Clear</button>';
  }

  window.shClearPick = function () { shSel = new Set(); shAnchor = -1; shMark(); };

  window.shTab = function (i) {
    /* Вибір не переживає зміну аркуша: рядок номер 5 на іншому аркуші —
       зовсім інший рядок, і підсумок по ньому був би вигадкою. */
    if (shFile) { shFile.idx = Number(i) || 0; shSel = new Set(); shAnchor = -1; shPaint(); }
  };

  window.shCloseFile = function () {
    shFile = null;
    shSel = new Set(); shAnchor = -1;
    const sum = document.getElementById('sh-sum');
    if (sum) { sum.classList.add('hidden'); sum.innerHTML = ''; }
    document.getElementById('sh-filebar')?.classList.add('hidden');
    document.getElementById('sh-table')?.classList.add('hidden');
    const box = document.getElementById('sh-table');
    if (box) box.innerHTML = '';      // великий файл не має лишатись у памʼяті
    sheetsRender();
  };

  function shPaint() {
    const bar = document.getElementById('sh-filebar');
    const box = document.getElementById('sh-table');
    if (!shFile || !bar || !box) return;
    const tab = shFile.tabs[shFile.idx] || shFile.tabs[0];
    const rows = tab.rows || [];
    const head = rows[0] || [];
    const body = rows.slice(1);
    const cut = body.length > SH_MAX_ROWS;
    const show = cut ? body.slice(0, SH_MAX_ROWS) : body;
    /* Найдовший рядок задає кількість стовпчиків: у вивантаженнях
       хвостові порожні комірки часто просто обрізані, і рівнятись на
       заголовок означало б загубити останні стовпчики. */
    const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);

    bar.innerHTML = '<span class="sh-fname">' + shEsc(shFile.name) + '</span>'
      + (shFile.tabs.length > 1
          ? '<select class="sh-tabs" onchange="shTab(this.value)">'
            + shFile.tabs.map((t, i) => '<option value="' + i + '"'
                + (i === shFile.idx ? ' selected' : '') + '>' + shEsc(t.name) + '</option>').join('')
            + '</select>'
          : '')
      + '<span class="sh-rows">' + body.length + ' row(s) · ' + cols + ' column(s)'
      + (cut ? ' · showing first ' + SH_MAX_ROWS : '') + '</span>'
      /* Без цього рядка виділення просто не знаходять: номер рядка не
         схожий на кнопку, і «сума не працює» означає «я не здогадався,
         куди тиснути». */
      + '<span class="sh-hint">Click row numbers to sum · shift for a range</span>'
      + '<button class="sh-btn sh-del" onclick="shCloseFile()">Close file</button>';

    const cell = (v, tag) => '<' + tag + '>' + shEsc(v) + '</' + tag + '>';
    const pad = (r) => { const a = r.slice(); while (a.length < cols) a.push(''); return a; };
    box.innerHTML = '<table class="sh-grid"><thead><tr>'
      /* Клік по кутку — виділити все або зняти все: інакше «підсумуй
         увесь файл» довелось би набирати двома тисячами кліків. */
      + '<th class="sh-n is-pick" onclick="shPickAll()" title="Select all rows">\u2713</th>'
      + pad(head).map(v => cell(v, 'th')).join('') + '</tr></thead><tbody>'
      /* Номер рядка як у таблиці: без нього на довгому файлі неможливо
         сказати вголос, про який саме рядок ідеться. Він же й кнопка
         вибору — окрема галочка коштувала б стовпчика, а на телефоні
         кожен стовпчик на вагу. */
      + show.map((r, i) => '<tr data-i="' + i + '"' + (shSel.has(i) ? ' class="is-sel"' : '') + '>'
          + '<td class="sh-n is-pick" onclick="shRowPick(' + i + ', event.shiftKey)"'
          + ' title="Click to pick, shift-click for a range">' + (i + 2) + '</td>'
          + pad(r).map(v => cell(v, 'td')).join('') + '</tr>').join('')
      + '</tbody></table>';
    shSum();
  }

  /* ─────────── Зріз KPI за моделлю виплат ───────────
     У payouts кожне гео+офер має свою модель: CPA (ставка за депозит)
     або спендова (% від спенда). Клік по картці Total Spend показує
     лише ті рядки, що йдуть за обраною моделлю — і вся стрічка KPI,
     графік, гео й таблиця перераховуються під цей зріз. */
  const LENS = ['all', 'cpa', 'spend'];
  const LENS_LABEL = { all: 'All', cpa: 'CPA', spend: 'Spend %' };

  function lensGet() {
    const v = localStorage.getItem('kpi_lens');
    return LENS.includes(v) ? v : 'all';
  }

  window.kpiLensApply = function (rows) {
    const lens = lensGet();
    if (lens === 'all' || !Array.isArray(rows)) return rows;
    if (typeof payoutInfo !== 'function') return rows;
    return rows.filter(r => payoutInfo(r.geo, r.offer).model === lens);
  };

  function lensPaint() {
    const tag = document.getElementById('kpi-lens-tag');
    if (!tag) return;
    const lens = lensGet();
    tag.textContent = LENS_LABEL[lens];
    tag.classList.toggle('is-on', lens !== 'all');
  }

  window.kpiLensCycle = function () {
    const next = LENS[(LENS.indexOf(lensGet()) + 1) % LENS.length];
    localStorage.setItem('kpi_lens', next);
    lensPaint();
    if (typeof applyGlobalFilter === 'function') applyGlobalFilter();
  };

  lensPaint();

  /* ─────────── Gross / Net на картці профіту ───────────
     Витрати (кабінети, юрособи, команда, інструменти) досі рахувались і
     нікуди не йшли: Net Profit = виручка − спенд, а _kpiExpenses ніде не
     читалось. Тепер клік по картці перемикає між грязним і чистим.
     Типово лишається Gross, щоб число не змінилось само по собі. */
  const NET_MODES = ['gross', 'net'];
  const NET_LABEL = { gross: 'Gross', net: 'Net' };

  function netGet() {
    const v = localStorage.getItem('kpi_net');
    return NET_MODES.includes(v) ? v : 'gross';
  }

  /* Скільки коштує відкрутити ці гроші, крім самого спенду.

     Комісія агента раніше лише малювалась рядком «+ $X (Fees)» біля
     спенду і в жодну суму не входила — тобто сиділа в прибутку. Тепер
     вона така сама витрата, як акаунти чи інструменти. */
  const EXP_NAMES = { accounts: 'Accounts', fp: 'Payments', team: 'Team',
                      tools: 'Tools', other: 'Other' };
  const netMoney = v => (typeof formatCurrency === 'function'
                        ? formatCurrency(v) : '$' + Number(v).toFixed(2));

  function netCosts() {
    return (Number(window._kpiFeesVal) || 0) + (Number(window._kpiExpensesVal) || 0);
  }

  /* Підказка. Число, яке зменшилось саме по собі, викликає підозру —
     і правильно робить. Тому картка має пояснювати себе без питань. */
  function netTip(mode, val) {
    const fees = Number(window._kpiFeesVal) || 0;
    const exp = Number(window._kpiExpensesVal) || 0;
    if (mode !== 'net') {
      const tail = (fees + exp) > 0
        ? `\n\nНе враховано: ${netMoney(fees + exp)} (комісія агента і витрати).`
          + '\nКлік — перемкнути на Net.'
        : '\n\nКлік — перемкнути на Net.';
      return 'Gross: виручка − спенд.' + tail;
    }
    const lines = ['Net: виручка − спенд − комісія агента − витрати', '',
                   'Gross' + '\u2003' + netMoney(window._kpiGross)];
    const agents = window._kpiAgents || [];
    if (fees > 0) {
      lines.push('− комісія агента\u2003' + netMoney(fees));
      agents.slice(0, 4).forEach(a => lines.push(
        '\u2003\u2003' + a.name + (a.pct !== null ? ` (${a.pct}%)` : '') + '\u2003' + netMoney(a.fee)));
    }
    if (exp > 0) {
      lines.push('− витрати\u2003' + netMoney(exp));
      Object.entries(window._kpiExpenseCats || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .forEach(([k, v]) => lines.push('\u2003\u2003' + (EXP_NAMES[k] || k) + '\u2003' + netMoney(v)));
    }
    if (!fees && !exp) lines.push('(комісій і витрат за цей період немає)');
    lines.push('', 'Net\u2003' + netMoney(val), '', 'Клік — перемкнути на Gross.');
    return lines.join('\n');
  }

  window.kpiNetPaint = function () {
    const tag = document.getElementById('kpi-net-tag');
    const mode = netGet();
    if (tag) {
      tag.textContent = NET_LABEL[mode];
      tag.classList.toggle('is-on', mode === 'net');
    }
    const el = document.getElementById('kpi-profit');
    if (!el || typeof window._kpiGross !== 'number') return;
    const val = mode === 'net' ? window._kpiGross - netCosts() : window._kpiGross;
    el.innerText = (typeof formatCurrency === 'function')
      ? formatCurrency(val) : '$' + val.toFixed(2);
    el.className = `kpi-value ${val >= 0 ? 'text-emerald-400' : 'text-red-500'}`;
    el.title = netTip(mode, val);
    if (tag) tag.title = el.title;

    // ROI рахуємо від того ж числа, що показане, інакше вони б розходились
    const roiEl = document.getElementById('kpi-roi');
    const spend = Number(window._kpiSpendVal) || 0;
    if (roiEl) roiEl.innerText = `ROI: ${spend > 0 ? Math.round(val / spend * 100) : 0}%`;

    // Стрілка поруч живе з того самого тотала — перемалювати її треба
    // разом із числом, інакше підказка лишиться від іншого режиму.
    if (typeof kpiDeltaPaint === 'function') kpiDeltaPaint();
  };

  window.kpiNetCycle = function () {
    const next = NET_MODES[(NET_MODES.indexOf(netGet()) + 1) % NET_MODES.length];
    localStorage.setItem('kpi_net', next);
    kpiNetPaint();
  };

  kpiNetPaint();

  /* ─────────── Вигляд графіка ─────────── */
  window.setChartStyle = function (v) {
    localStorage.setItem('chart_style', v);
    // applyChartFilter перемальовує з поточними фільтрами дат і режимом
    if (typeof applyChartFilter === 'function') applyChartFilter();
  };

  (function initChartStyle() {
    const sel = document.getElementById('chart-style');
    if (sel) sel.value = localStorage.getItem('chart_style') || 'bars';
  })();

  /* ─────────── Командна панель ⌘K ─────────── */
  const CMDS = [
    ['Dashboard',      'nav:',                      'Page'],
    ['Heatmap',        'nav:heatmap',    'Page'],
    ['Creatives',      'nav:creatives',  'Page'],
    ['Geo Breakdown',  'nav:geo',         'Page'],
    ['Cabinets',       'nav:cabinets',   'Page'],
    ['Domains',        'nav:domains',    'Page'],
    ['Report Builder', 'nav:reports',     'Page'],
    ['Tasks',          'fn:toggleTaskModal',             'Tool'],
    ['Daily reports',  'fn:toggleReportModal',           'Tool'],
    ['Bonuses',        'fn:openBonusModal',              'Tool'],
    ['Accounts',       'fn:openAccountsModal',           'Tool'],
    ['Texts',          'fn:openTextsModal',              'Tool'],
    ['Uniqueizer',     'fn:openUniqModal',               'Tool'],
    ['Geo Compare',    'fn:openGeoCompareModal',         'Tool'],
    ['Data Check',     'fn:openDataCheckModal',          'Tool'],
    ['DB Logs',        'fn:openDbLogsModal',             'Tool'],
    ['Gallery',        'fn:toggleGalleryModal',          'Tool'],
    ['Summary image',  'fn:openScreenshotModal',         'Tool'],
    ['Month close',    'fn:openMonthClose',              'Tool'],
    ['Settings',       'fn:openSettingsModal',           'Tool'],
    ['Campaigns',      'hub:dataset',                    'Data Hub'],
    ['Records',        'hub:records',                    'Data Hub'],
    ['Expenses',       'hub:expenses',                   'Data Hub'],
    ['Sources',        'hub:providers',                  'Data Hub'],
    ['Google Sheets',  'fn:sheetsOpen',                  'Sheets'],
    ['Team',           'nav:team',                       'Page']
  ];

  /* ПАЛІТРА — ЦЕ ТЕЖ МЕНЮ, і про це легко забути.

     Сторінки тімліда ми сховали в сайдбарі, а палітра лишилась із
     повним списком: звідти він спокійно відкривав кабінети, бонуси,
     унікалізатор і навіть імпорт кампаній. Ховати вхід, лишаючи двері
     поруч, сенсу немає.

     Тому в тімліда тут рівно те саме, що в меню, — його сторінка. А
     динамічні записи (гео, акаунти, офери, креативи) прибрані цілком:
     кожен із них веде на сторінку, якої в нього немає.

     Пункт Team, навпаки, з'явився: у палітрі його не було взагалі. */
  const cmdLead = () => document.body.classList.contains('is-lead-only');
  const cmdBase = () => cmdLead()
    ? CMDS.filter(c => c[1] === 'nav:team')
    : CMDS.filter(c => c[1] !== 'nav:team' || document.body.classList.contains('is-lead'));

  let cmdSel = 0, cmdShown = cmdBase();

  function cmdBuild() {
    if (document.getElementById('cmd-overlay')) return;
    const o = document.createElement('div');
    o.id = 'cmd-overlay';
    o.innerHTML = `<div id="cmd-box">
        <input id="cmd-input" placeholder="Page, geo, account, offer, creative…" autocomplete="off">
        <div id="cmd-list"></div>
      </div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => { if (e.target === o) cmdClose(); });
    o.querySelector('#cmd-input').addEventListener('input', e => cmdRender(e.target.value));
    o.querySelector('#cmd-input').addEventListener('keydown', cmdKey);
  }

  // Динамічні записи з уже завантажених даних. Збираються щоразу заново:
  // між двома відкриттями палітри могла змінитись команда або місяць.
  // rawData — це top-level let, тобто у window його немає; беремо по імені.
  function cmdData() {
    // Кожен такий запис веде на Report Builder або в Creatives — сторінки,
    // яких у тімліда немає. Отже й записів бути не має.
    if (cmdLead()) return [];
    const daily = (typeof rawData !== 'undefined' && rawData) ? rawData : [];
    const out = [], seen = new Set();
    const push = (label, kind, arg, group) => {
      label = String(label || '').trim();
      if (!label || label === '—') return;
      const key = group + '|' + label;
      if (seen.has(key)) return;
      seen.add(key);
      out.push([label, kind + ':' + arg, group]);
    };
    daily.forEach(r => {
      push(String(r.geo || '').toUpperCase(), 'geo', String(r.geo || '').toUpperCase(), 'Geo');
      push(r.account, 'rbq', r.account, 'Account');
      push(r.offer,   'rbq', r.offer,   'Offer');
      push(r.funnel,  'rbq', r.funnel,  'Funnel');
      push(r.agent,   'rbq', r.agent,   'Agent');
    });
    (window.creativesRawData || []).forEach(c => push(c.cid, 'cid', c.cid, 'Creative'));
    return out;
  }

  function cmdRender(q) {
    const s = (q || '').trim().toLowerCase();
    if (!s) {
      cmdShown = cmdBase();
    } else {
      const hit = c => c[0].toLowerCase().includes(s) || c[2].toLowerCase().includes(s);
      // Точний збіг завжди перший: на «BR» потрібне гео BR, а не сторінка
      // «Geo Breakdown», у назві якої той самий «br» сидить усередині слова.
      // Далі — початок слова, далі — решта. Усередині однакового рангу
      // порядок лишається вихідним, тобто сторінки перед даними.
      const rank = c => {
        const l = c[0].toLowerCase();
        return l === s ? 0 : l.startsWith(s) ? 1 : 2;
      };
      const all = cmdBase().filter(hit).concat(cmdData().filter(hit));
      // 40 — щоб на широкому запиті не малювати тисячі рядків.
      cmdShown = all
        .map((c, i) => [c, rank(c), i])
        .sort((a, b) => a[1] - b[1] || a[2] - b[2])
        .map(x => x[0])
        .slice(0, 40);
    }
    cmdSel = 0;
    document.getElementById('cmd-list').innerHTML = cmdShown.length
      ? cmdShown.map((c, i) => `<button class="cmd-row ${i === 0 ? 'is-sel' : ''}" data-i="${i}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            ${c[0]}<small>${c[2]}</small></button>`).join('')
      : `<div class="cmd-row" style="cursor:default">Nothing found</div>`;
    document.querySelectorAll('#cmd-list .cmd-row[data-i]').forEach(b =>
      b.addEventListener('click', () => cmdRun(Number(b.dataset.i))));
  }

  function cmdKey(e) {
    if (e.key === 'Escape') return cmdClose();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cmdSel = Math.max(0, Math.min(cmdShown.length - 1, cmdSel + (e.key === 'ArrowDown' ? 1 : -1)));
      document.querySelectorAll('#cmd-list .cmd-row').forEach((b, i) => b.classList.toggle('is-sel', i === cmdSel));
      document.querySelectorAll('#cmd-list .cmd-row')[cmdSel]?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') { e.preventDefault(); cmdRun(cmdSel); }
  }

  // Перехід на сторінку перемальовує її вміст, тож чіпати поля можна
  // тільки після цього — звідси відкладений виклик.
  function cmdAfterNav(route, fn) {
    navGo(route);
    setTimeout(fn, 60);
  }

  function cmdRun(i) {
    const c = cmdShown[i];
    if (!c) return;
    cmdClose();
    // split(':') не годиться: у назві оферу чи кабінета двокрапка цілком
    // можлива, і аргумент обрізало б по ній.
    const at = c[1].indexOf(':');
    const kind = c[1].slice(0, at), arg = c[1].slice(at + 1);

    if (kind === 'nav') navGo(arg);
    else if (kind === 'hub') hubOpen(arg);
    else if (kind === 'geo') cmdAfterNav('', () => {
      if (typeof showGeoDetails === 'function') showGeoDetails(arg);
    });
    else if (kind === 'cid') cmdAfterNav('creatives', () => {
      const box = document.getElementById('creative-search');
      if (box) box.value = arg;
      if (typeof selectCreative === 'function') selectCreative(arg);
    });
    else if (kind === 'rbq') cmdAfterNav('reports', () => {
      const box = document.getElementById('rb-q');
      if (!box) return;
      box.value = arg;
      if (typeof rbRender === 'function') rbRender();
    });
    else if (typeof window[arg] === 'function') window[arg]();
  }

  window.cmdOpen = function () {
    cmdBuild();
    cmdRender('');
    document.getElementById('cmd-overlay').classList.add('open');
    const inp = document.getElementById('cmd-input');
    inp.value = ''; setTimeout(() => inp.focus(), 10);
  };
  window.cmdClose = () => document.getElementById('cmd-overlay')?.classList.remove('open');

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmdOpen(); }
  });

  /* ─────────── Нижні інсайт-картки ─────────── */
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const revOf = r => (typeof revenueOf === 'function' ? revenueOf(r) : 0);

  window.renderInsightCards = function (data) {
    const rows = Array.isArray(data) ? data : [];

    // 1. Топ гео за профітом
    const byGeo = {};
    rows.forEach(r => {
      const g = (r.geo || '??').toUpperCase().trim();
      const o = byGeo[g] || (byGeo[g] = { s: 0, rev: 0, d: 0 });
      o.s += Number(r.spend) || 0;
      o.d += Number(r.deposits) || 0;
      o.rev += revOf(r);
    });
    const top = Object.entries(byGeo)
      .map(([g, v]) => ({ g, ...v, profit: v.rev - v.s, roi: v.s > 0 ? (v.rev - v.s) / v.s * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit).slice(0, 5);

    const elTop = document.getElementById('ins-top');
    if (elTop) elTop.innerHTML = top.length ? top.map(t => `
      <div class="ins-row">
        <span class="ins-chip">${t.g.slice(0, 3)}</span>
        <div class="ins-main">
          <div class="ins-t">${t.g}</div>
          <div class="ins-s">${money(t.s)} spend · ${t.d} dep</div>
        </div>
        <div class="text-right">
          <div class="ins-v" style="color:${t.profit >= 0 ? '#4ADE80' : '#F87171'}">${t.profit >= 0 ? '+' : '−'}${money(Math.abs(t.profit))}</div>
          <div class="ins-s">ROI ${Math.round(t.roi)}%</div>
        </div>
      </div>`).join('') : emptyRow('No data for this period');

    renderInsightTasks();
  };

  function emptyRow(t) {
    return `<div class="ins-row" style="justify-content:center"><span class="ins-s">${t}</span></div>`;
  }

  // taskData оголошено через `let` — воно в глобальній лексичній області,
  // а не у window, тож звертаємось голим ідентифікатором через try-щит.
  const tasks = () => { try { return Array.isArray(taskData) ? taskData : []; } catch (e) { return []; } };

  function renderInsightTasks() {
    const el = document.getElementById('ins-tasks');
    if (!el) return;
    const list = tasks().filter(t => t.status !== 'Completed').slice(0, 5);
    el.innerHTML = list.length ? list.map(t => {
      const pill = t.status === 'In progress' ? 'pill-warn' : 'pill-mute';
      const prio = t.priority === 'High' ? 'pill-bad' : t.priority === 'Medium' ? 'pill-warn' : 'pill-mute';
      return `<div class="ins-row" onclick="openTaskDetails('${t.id}')" style="cursor:pointer">
          <span class="ins-pill ${prio}">${t.priority || '—'}</span>
          <div class="ins-main"><div class="ins-t">${String(t.text || '').split('\n')[0]}</div>
            <div class="ins-s">${(t.created_at || '').slice(0, 10)}</div></div>
          <span class="ins-pill ${pill}">${t.status === 'In progress' ? 'In progress' : 'New'}</span>
        </div>`;
    }).join('') : emptyRow('No open tasks');
  }

  /* ─────────── Синхронізація підписів ─────────── */
  const MONTH_UA = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

  setInterval(() => {
    // Назва команди — у бренді сайдбара і на мобільній кнопці меню
    const team = document.getElementById('active-team-label');
    const name = team ? team.innerText.replace(/^TEAM:\s*/i, '').trim() : '';
    if (name) {
      const b = document.getElementById('sb-team-name');
      const m = document.getElementById('mob-team-name');
      if (b && b.textContent !== name) b.textContent = name;
      if (m && m.textContent !== name) m.textContent = name;
    }

    // Місяць — підписом у картці таргету
    const src = document.getElementById('current-month-label');
    const dst = document.getElementById('header-month-display');
    if (src && dst) {
      const mm = /^(\d{4})-(\d{2})$/.exec(src.innerText.trim());
      const txt = mm ? `· ${MONTH_UA[Number(mm[2]) - 1]} ${mm[1]}` : '';
      if (dst.textContent !== txt) dst.textContent = txt;
    }

    const badge = document.getElementById('sb-task-badge');
    if (badge) badge.textContent = tasks().filter(t => t.status !== 'Completed').length;
    renderInsightTasks();
    syncNavVisibility();
    applyRoute(false);
  }, 1500);

  applyRoute(false);

})();
</script>
