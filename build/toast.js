
/* ═══════════ ТОСТИ ═══════════
   У файлі було 28 alert(). Кожен зупиняє сторінку модальним вікном
   браузера, виглядає як системна помилка і не вміє показати два
   повідомлення поспіль.

   Перехоплюємо window.alert цілком, замість того щоб правити 28 місць:
   так жоден виклик не загубиться, і майбутні теж підуть у тост. Там,
   де потрібна відповідь користувача, стоїть confirm() — його не чіпаємо,
   він має лишитись блокуючим. */

/* raw = «це вже готова розмітка, не чіпай». Потрібне, бо частина
   повідомлень збирається з розміткою свідомо: перелік проблем окремими
   рядками, шрифт mono на назві таблиці. Коли тости замінили абзац під
   кнопкою Sync, ця розмітка почала виводитись як текст — на екрані
   стояло буквальне «<br><span class="opacity-70">».

   Типово все-таки екрануємо: через window.alert і стрічку подій сюди
   потрапляють дані з бази, і довіряти їм не можна. Перемикач явний,
   щоб ця різниця була видна в місці виклику, а не вгадувалась. */
window.toast = function (msg, kind, ms, raw) {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' is-' + kind : '');
  const title = kind === 'error' ? 'Error' : kind === 'ok' ? 'Done' : kind === 'warn' ? 'Check' : '';
  const text = String(msg == null ? '' : msg);
  el.innerHTML = (title ? `<span class="tt">${title}</span>` : '')
    + (raw ? text
           // Переноси рядків у звичайному тексті теж мають бути видні:
           // у HTML вони інакше злипаються в одну стрічку.
           : text.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))
                 .replace(/\n/g, '<br>'));

  /* КЛІК — ВІДКРИТИ, ХРЕСТИК — ПРИБРАТИ.

     «клікаючи на нього щоб відкривалось типу як міні вікно, щоб можна
     було прочитати». Доти короткий дотик прибирав тост, а прочитати
     довгий підсумок синку можна було лише затиснувши його. Тепер тост
     короткий (кілька рядків), а клік відкриває міні-вікно з повним
     текстом, який можна виділити й скопіювати, і зі списком попередніх
     сповіщень цього сеансу — щоб згаслий тост можна було дочитати.
     Прибрати тост, не відкриваючи, — хрестик. Поки на тост наведено,
     він не гасне. */
  const entry = { at: new Date(), kind: kind || '', title, html: el.innerHTML };
  TOAST_LOG.unshift(entry);
  if (TOAST_LOG.length > 40) TOAST_LOG.length = 40;
  el._log = entry;

  const body = document.createElement('div');
  body.className = 'toast-body';
  while (el.firstChild) body.appendChild(el.firstChild);
  el.appendChild(body);
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'toast-x'; x.title = 'Dismiss'; x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '×';
  el.appendChild(x);

  let lifeTimer = 0;
  const kill = () => {
    if (el.dataset.gone) return;
    el.dataset.gone = '1';
    if (lifeTimer) { clearTimeout(lifeTimer); lifeTimer = 0; }
    el.classList.add('out');
    setTimeout(() => el.remove(), 180);
  };
  el._kill = kill;

  x.addEventListener('click', e => { e.stopPropagation(); kill(); });
  el.addEventListener('click', () => {
    /* Виділення тексту — не клік: інакше спроба скопіювати рядок
       відкривала б вікно. */
    const sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length && el.contains(sel.anchorNode)) return;
    toastBox(entry);
    kill();
  });

  wrap.appendChild(el);
  // Більш ніж чотири тости на екрані — це вже стіна тексту
  while (wrap.children.length > 4) wrap.firstElementChild.remove();
  // Обрізаний текст позначаємо: видно, що відкрити варто.
  requestAnimationFrame(() => { if (body.scrollHeight > body.clientHeight + 2) el.classList.add('is-cut'); });

  // Помилку лишаємо довше: її треба встигнути прочитати
  const life = ms != null ? ms : (kind === 'error' ? 7000 : 3500);
  const arm = () => { if (life > 0 && !el.dataset.gone) lifeTimer = setTimeout(kill, life); };
  el.addEventListener('mouseenter', () => { if (lifeTimer) { clearTimeout(lifeTimer); lifeTimer = 0; } });
  el.addEventListener('mouseleave', () => { if (!lifeTimer) arm(); });
  arm();
  return el;
};

/* Сповіщення цього сеансу, найновіше першим. */
const TOAST_LOG = [];

/* МІНІ-ВІКНО. Одне на сторінку, у тому ж куті, що й тости. Зверху —
   відкрите сповіщення повністю, нижче — попередні; клік по
   попередньому відкриває його. Esc або клік поза вікном — закрити. */
window.toastBox = function (entry) {
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.setAttribute('role', 'dialog');
    document.body.appendChild(box);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') toastBoxClose(); });
    document.addEventListener('pointerdown', e => {
      const b = document.getElementById('toast-box');
      if (b && !b.classList.contains('hidden') && !b.contains(e.target)
          && !(e.target.closest && e.target.closest('#toast-wrap'))) toastBoxClose();
    }, true);
  }
  const cur = entry || TOAST_LOG[0];
  if (!cur) return;
  const hm = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const plain = h => { const d = document.createElement('div'); d.innerHTML = h; return d.innerText || d.textContent || ''; };
  const rest = TOAST_LOG.filter(e => e !== cur);
  box.innerHTML = `
    <div class="tb-head">
      <span class="tb-kind is-${cur.kind || 'info'}">${cur.title || 'Notice'}</span>
      <span class="tb-time">${hm(cur.at)}</span>
      <button type="button" class="tb-btn" data-act="copy" title="Copy the text">Copy</button>
      <button type="button" class="tb-btn tb-close" data-act="close" title="Close (Esc)">×</button>
    </div>
    <div class="tb-text">${cur.html.replace(/^<span class="tt">[^<]*<\/span>/, '')}</div>
    ${rest.length ? `<p class="tb-h">Earlier</p><div class="tb-list">${rest.map((e, i) =>
      `<button type="button" class="tb-item is-${e.kind || 'info'}" data-i="${TOAST_LOG.indexOf(e)}">
        <span class="tb-item-t">${hm(e.at)}</span>
        <span class="tb-item-x">${plain(e.html.replace(/^<span class="tt">[^<]*<\/span>/, '')).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).slice(0, 140)}</span>
      </button>`).join('')}</div>` : ''}`;
  box.querySelector('[data-act="close"]').onclick = toastBoxClose;
  box.querySelector('[data-act="copy"]').onclick = ev => {
    const t = plain(cur.html.replace(/^<span class="tt">[^<]*<\/span>/, '')).trim();
    try { navigator.clipboard.writeText(t); ev.target.textContent = 'Copied'; } catch (e) {}
  };
  box.querySelectorAll('.tb-item').forEach(b => { b.onclick = () => toastBox(TOAST_LOG[Number(b.dataset.i)]); });
  box.classList.remove('hidden');
};
window.toastBoxClose = function () {
  const b = document.getElementById('toast-box');
  if (b) b.classList.add('hidden');
};

// Кваліфікуємо повідомлення за текстом: у коді alert() викликається і для
// помилок, і для підказок на кшталт «вкажи дату» — розрізняти їх руками в
// 28 місцях сенсу немає.
(function () {
  const RE_ERR  = /(error|failed|could not|не вдал|помилка|db error)/i;
  const RE_WARN = /(must be|cannot be|pick |enter |paste |empty|does not look|no data|no reports)/i;
  window.alert = function (msg) {
    const s = String(msg == null ? '' : msg);
    window.toast(s, RE_ERR.test(s) ? 'error' : RE_WARN.test(s) ? 'warn' : '');
  };
})();

/* ═══════════ «FAILED TO FETCH» — НАЙГІРША З МОЖЛИВИХ ВІДПОВІДЕЙ ═══════════

   Коли Edge-функція не задеплоєна, браузер не показує ні коду, ні
   причини: CORS-préflight отримує голий 404 без заголовків, і fetch
   падає з TypeError «Failed to fetch». Те саме слово в слово — якщо
   функція не змогла стартувати або зникла мережа.

   У коді дашборда п'ятнадцять місць, які кличуть функції, і в кожному
   стояла своя обробка 404 — яка в цьому випадку НЕ спрацьовує, бо
   відповіді немає взагалі. Писати ту саму латку п'ятнадцять разів
   означало б забути її в шістнадцятому.

   Тому перехоплюємо один раз тут, на рівні fetch: успішні виклики
   проходять незмінними, а ось TypeError на адресу /functions/v1/…
   перетворюється на помилку, яка називає функцію і найімовірнішу
   причину. Вгадувати не можемо — тому названі обидві, у порядку
   ймовірності.

   Назву беремо з самої адреси: так це працює і для функцій, яких ще
   немає в коді на момент написання цього рядка. */
(function () {
  const real = window.fetch;
  if (!real) return;
  window.fetch = function (url, opt) {
    const u = String((url && url.url) || url || '');
    const m = u.match(/\/functions\/v1\/([a-z0-9-]+)/i);
    const p = real.apply(this, arguments);
    if (!m) return p;
    return p.catch(err => {
      /* Саме TypeError означає «відповіді не було». Усе інше —
         скасування, таймаут нашого ж коду — лишаємо як є: підмінити
         чужу помилку своєю здогадкою гірше, ніж не чіпати. */
      if (!(err instanceof TypeError)) throw err;
      throw new Error('Функція ' + m[1] + ' не відповіла зовсім. '
        + 'Найчастіше це означає, що вона не задеплоєна: '
        + 'supabase functions deploy ' + m[1]
        + '. Рідше — вона не змогла стартувати (дивись логи функції) '
        + 'або зникла мережа.');
    });
  };
})();

/* ═══════════ ПИТАННЯ ═══════════

   alert() ми перехопили давно, а confirm() лишався системним вікном
   браузера — і саме воно й стрічалось у найважливіші моменти: додати
   токен, зупинити всі кампанії, видалити коментар. Вікно з написом
   «dashboard.github.io каже:» поруч із рештою сторінки виглядає так,
   ніби щось зламалось, а не так, ніби в тебе питають.

   confirm() підмінити наскрізно, як alert(), не вийде: він синхронний,
   а намалювати своє вікно й дочекатись відповіді можна лише через
   Promise. Тому виклики переписані на `await ask(...)` — їх дев'ять,
   і всі вже стояли в async-функціях.

   ask() лишається блокуючим у тому сенсі, що має значення: доки не
   відповіси, код далі не піде. Esc — те саме, що «ні».

   ВІДПОВІДЬ БУВАЄ ТРЬОХ ВИДІВ: true/false на питання, рядок — коли є
   input, і об'єкт — коли є fields. Третій з'явився, бо «додати
   кабінет» це чотири значення разом, і просити їх по одному вікну на
   поле означало б чотири вікна на одну дію. */

window.ask = function (opts) {
  const o = typeof opts === 'string' ? { body: opts } : (opts || {});
  const esc = v => String(v == null ? '' : v)
    .replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  // Переноси рядків у тексті питання — це абзаци, а не випадковість:
  // у старих confirm() ними відділяли наслідок дії від самої дії.
  const para = t => String(t || '').split(/\n{2,}/)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

  /* КІЛЬКА ПОЛІВ. Те саме вікно, тільки відповідь — об'єкт {key: value}.
     Обов'язкове поле (need) не дає закрити вікно: кабінет без
     account_id зберігся б, і знайти його потім не було б чим. */
  const F = Array.isArray(o.fields) ? o.fields.filter(Boolean) : [];
  const field = f => {
    const k = esc(f.key);
    if (f.type === 'checkbox') return `<label class="ask-f is-chk${f.full ? ' is-full' : ''}">
        <input type="checkbox" data-k="${k}"${f.value ? ' checked' : ''}>
        <span>${esc(f.label || f.key)}</span></label>`;
    const lab = `<span class="ask-f-lab">${esc(f.label || f.key)}${f.need ? ' <b>*</b>' : ''}</span>`;
    const hint = f.hint ? `<span class="ask-f-hint">${esc(f.hint)}</span>` : '';
    if (f.type === 'select') return `<label class="ask-f${f.full ? ' is-full' : ''}">${lab}
        <select class="ask-in" data-k="${k}">${(f.opts || []).map(v => {
          const [val, txt] = Array.isArray(v) ? v : [v, v];
          return `<option value="${esc(val)}"${
            String(f.value == null ? '' : f.value) === String(val) ? ' selected' : ''}>${esc(txt)}</option>`;
        }).join('')}</select>${hint}</label>`;
    /* ПОЛЕ, ЯКЕ РОСТЕ. Промпт — не рядок: у нього вписують акцію,
       умови й те, чого хочеться, і в одну лінію це не читається.
       Ріжок лишається вертикальним: горизонтальний розтяг ламав би
       сітку вікна. Enter тут переводить рядок, а не зберігає — за це
       відповідає обробник клавіш нижче. */
    if (f.type === 'area') return `<label class="ask-f${f.full ? ' is-full' : ''}">${lab}
      <textarea class="ask-in is-area" data-k="${k}" rows="${Number(f.rows) || 3}"
        spellcheck="false" placeholder="${esc(f.placeholder || '')}">${
        esc(f.value == null ? '' : f.value)}</textarea>${hint}</label>`;
    /* ТЕГИ: КЛІК ЗАМІСТЬ ДРУКУ.

       Постачальника вписують у квадратних дужках назви — «Mostbet
       [satorapps]», — і саме за ним потім підбирається профіль
       розбору сабок. Набирати його руками означає рано чи пізно
       написати «satorapp» чи «Satorapps», і тоді профіль не
       знайдеться, а шаблон мовчки візьме не ті сабки.

       Тому вже відомі теги стоять кнопками. Клік кладе тег у ДУЖКАХ
       у кінець поля `into`; якщо там уже є дужки — замінює їх, а не
       дописує другі. Вписати руками й далі можна: кнопки це
       скорочення, а не обмеження. */
    if (f.type === 'tags') return `<div class="ask-f is-full ask-tags">${lab}
      <div class="ask-tagrow">${(f.opts || []).map(v =>
        `<button type="button" class="ask-tag" data-v="${esc(v)}"
           data-into="${esc(f.into || '')}">${esc(v)}</button>`).join('')}</div>${hint}</div>`;
    // Підказки з уже відомих значень: агента вписують той самий, що й
    // у решти кабінетів, і друкувати його щоразу наново — зайве.
    const dl = (f.list || []).length ? 'ask-dl-' + k : '';
    return `<label class="ask-f${f.full ? ' is-full' : ''}">${lab}
      <input class="ask-in${f.upper ? ' is-up' : ''}" data-k="${k}"
        type="${f.type === 'number' ? 'number' : 'text'}" spellcheck="false" autocomplete="off"
        ${dl ? `list="${dl}"` : ''} placeholder="${esc(f.placeholder || '')}"
        value="${esc(f.value == null ? '' : f.value)}">
      ${dl ? `<datalist id="${dl}">${f.list.map(v => `<option value="${esc(v)}">`).join('')}</datalist>` : ''}
      ${hint}</label>`;
  };

  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'askwrap';
    wrap.innerHTML = `<div class="askbox${F.length > 2 ? ' is-wide' : ''}" role="dialog" aria-modal="true">
        ${o.title ? `<p class="ask-title">${esc(o.title)}</p>` : ''}
        <div class="ask-body">${para(o.body)}</div>
        ${o.input ? `<input type="${o.input.secret ? 'password' : 'text'}"
            class="ask-in" spellcheck="false" autocomplete="off"
            placeholder="${esc(o.input.placeholder || '')}"
            value="${esc(o.input.value || '')}">` : ''}
        ${F.length ? `<div class="ask-fields">${F.map(field).join('')}</div>` : ''}
        <div class="ask-row">
          ${o.only ? '' : `<button type="button" class="ask-no">${esc(o.cancel || 'Cancel')}</button>`}
          <button type="button" class="ask-yes ${o.danger ? 'is-bad' : ''}">${
            esc(o.ok || (o.only ? 'Close' : 'Yes'))}</button>
        </div></div>`;

    let done = false;
    const close = v => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', key, true);
      wrap.remove();
      resolve(v);
    };
    /* Збір відповіді з полів. Повертає null, коли обов'язкове поле
       порожнє: тоді вікно лишається відкритим і підсвічує саме те
       поле — закрити його з порожнім id означало б зберегти запис,
       який ні до чого не прив'яжеться. */
    const collect = () => {
      const out = {};
      let bad = null;
      F.forEach(f => {
        const el = wrap.querySelector(`[data-k="${f.key}"]`);
        if (!el) return;
        let v = f.type === 'checkbox' ? el.checked : String(el.value || '').trim();
        if (f.upper && typeof v === 'string') v = v.toUpperCase();
        out[f.key] = v;
        if (f.need && !(f.type === 'checkbox' ? v : String(v).length) && !bad) bad = el;
      });
      if (!bad) return out;
      bad.classList.add('is-bad');
      bad.focus();
      setTimeout(() => bad.classList.remove('is-bad'), 1400);
      return null;
    };
    /* ПИТАННЯ З ПОЛЕМ. Перейменувати токен і вписати проксі — це те
       саме питання, тільки відповідь не «так», а рядок. Окреме вікно
       заради цього було б третім різновидом того самого, тож поле
       живе тут, а ask повертає текст замість true.

       Порожній рядок — це НЕ відмова: ним стирають проксі. Тому
       скасування й далі повертає false, і два випадки не зливаються. */
    const take = () => {
      if (!F.length) {
        const f = wrap.querySelector('.ask-in');
        return close(f ? f.value : true);
      }
      const v = collect();
      if (v) close(v);
    };

    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      /* У багаторядковому полі Enter мусить переводити рядок: інакше
         перший же абзац промпту закриває вікно й відправляє запит
         недописаним. Зберегти звідти — Ctrl/⌘+Enter. */
      else if (e.key === 'Enter' && e.target && e.target.tagName === 'TEXTAREA') {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); take(); }
      }
      else if (e.key === 'Enter') { e.preventDefault(); take(); }
    };

    /* Клік по тегу править ЧУЖЕ поле, тож ловимо його на вікні: кнопок
       може бути скільки завгодно, а слухач лишається один. */
    wrap.querySelectorAll('.ask-tag').forEach(btn => {
      btn.onclick = () => {
        const el = wrap.querySelector(`[data-k="${btn.dataset.into}"]`);
        if (!el) return;
        const tag = '[' + btn.dataset.v + ']';
        // Дужки в кінці — те саме місце, куди тег і ставлять.
        const base = String(el.value || '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
        el.value = base ? base + ' ' + tag : tag;
        // Програмна зміна подій не шле — а від назви можуть залежати
        // інші поля (KTID апки рахується з назви й постачальника).
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
        /* Курсор ставимо ПЕРЕД дужками: далі найчастіше дописують
           назву, а не тег. Кінець рядка змусив би щоразу клікати. */
        const pos = base.length;
        try { el.setSelectionRange(pos, pos); } catch (e) {}
      };
    });

    wrap.querySelector('.ask-yes').onclick = take;
    const no = wrap.querySelector('.ask-no');
    if (no) no.onclick = () => close(false);
    /* КЛІК ПОВЗ ВІКНО. Для питання це безпечний бік: нічого не
       введено, нічого й не втрачається.

       Але там, де є ПОЛЯ, втрачається все набране — а набирають у них
       account ID, проксі, промпт. Один промах мишею повз вікно, і
       вписане зникає без слова. Тому форму закривають тільки кнопкою
       (і Escape — це вже свідоме натискання, а не промах). */
    const formish = F.length || o.input;
    if (!formish) wrap.onclick = e => { if (e.target === wrap) close(false); };
    document.addEventListener('keydown', key, true);

    document.body.appendChild(wrap);
    /* Вікну, яке має «живі» поля (одне заповнюється з іншого, як KTID
       апки з її назви), даємо доступ до них після появи. get(key) —
       поле за ключем. Помилка в цьому гачку вікна не ламає. */
    if (typeof o.onOpen === 'function') {
      try { o.onOpen({ wrap, get: k => wrap.querySelector(`[data-k="${k}"]`) }); }
      catch (e) { console.warn('ask onOpen:', e); }
    }
    // Є поле — курсор туди: інакше перше, що робить людина, це клік у нього.
    (wrap.querySelector('.ask-in') || wrap.querySelector('.ask-yes')).focus();
  });
};

/* Довге повідомлення, на яке не треба відповідати: одна кнопка. Тост
   для такого затісний — там, де три абзаци, вони мусять стояти, поки
   їх не дочитають. */
window.tell = (title, body) => window.ask({ title, body, only: true });

/* ═══════════ ХІД РОБОТИ ═══════════
   Синхронізація каже про себе кілька разів поспіль: «йду», «взяв
   стільки-то», «готово». Чотири окремі тости на це — стіна, тому
   один тост переписується на місці й гасне разом із результатом. */
window.toastStep = function () {
  let el = null;
  const put = (html, kind, ms, raw) => {
    if (el && !el.dataset.gone) {
      // Проміжний крок у списку сповіщень не лишаємо — лише підсумок.
      const i = TOAST_LOG.indexOf(el._log);
      if (i >= 0) TOAST_LOG.splice(i, 1);
      el.remove();
    }
    el = html ? window.toast(html, kind, ms, raw) : null;
  };
  return {
    // Проміжний крок живе, поки не скажуть інше: ms = 0.
    say: (html, kind, raw) => put(html, kind, 0, raw),
    // Останній — звичайний тост, який сам згасне.
    done: (html, kind, raw) => put(html, kind, undefined, raw)
  };
};
