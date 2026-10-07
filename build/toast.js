
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

  const kill = () => {
    if (el.dataset.gone) return;
    el.dataset.gone = '1';
    el.classList.add('out');
    setTimeout(() => el.remove(), 180);
  };
  el.addEventListener('click', kill);
  wrap.appendChild(el);

  // Більш ніж чотири тости на екрані — це вже стіна тексту
  while (wrap.children.length > 4) wrap.firstElementChild.remove();

  // Помилку лишаємо довше: її треба встигнути прочитати
  const life = ms != null ? ms : (kind === 'error' ? 7000 : 3500);
  if (life > 0) setTimeout(kill, life);
  return el;
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
   відповіси, код далі не піде. Esc — те саме, що «ні». */

window.ask = function (opts) {
  const o = typeof opts === 'string' ? { body: opts } : (opts || {});
  const esc = v => String(v == null ? '' : v)
    .replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  // Переноси рядків у тексті питання — це абзаци, а не випадковість:
  // у старих confirm() ними відділяли наслідок дії від самої дії.
  const para = t => String(t || '').split(/\n{2,}/)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'askwrap';
    wrap.innerHTML = `<div class="askbox" role="dialog" aria-modal="true">
        ${o.title ? `<p class="ask-title">${esc(o.title)}</p>` : ''}
        <div class="ask-body">${para(o.body)}</div>
        ${o.input ? `<input type="${o.input.secret ? 'password' : 'text'}"
            class="ask-in" spellcheck="false" autocomplete="off"
            placeholder="${esc(o.input.placeholder || '')}"
            value="${esc(o.input.value || '')}">` : ''}
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
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const f = wrap.querySelector('.ask-in');
        close(f ? f.value : true);
      }
    };

    /* ПИТАННЯ З ПОЛЕМ. Перейменувати токен і вписати проксі — це те
       саме питання, тільки відповідь не «так», а рядок. Окреме вікно
       заради цього було б третім різновидом того самого, тож поле
       живе тут, а ask повертає текст замість true.

       Порожній рядок — це НЕ відмова: ним стирають проксі. Тому
       скасування й далі повертає false, і два випадки не зливаються. */
    const inp = wrap.querySelector('.ask-in');
    wrap.querySelector('.ask-yes').onclick = () => close(inp ? inp.value : true);
    const no = wrap.querySelector('.ask-no');
    if (no) no.onclick = () => close(false);
    // Клік повз вікно = відмова. Для питання це безпечний бік.
    wrap.onclick = e => { if (e.target === wrap) close(false); };
    document.addEventListener('keydown', key, true);

    document.body.appendChild(wrap);
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
    if (el && !el.dataset.gone) el.remove();
    el = html ? window.toast(html, kind, ms, raw) : null;
  };
  return {
    // Проміжний крок живе, поки не скажуть інше: ms = 0.
    say: (html, kind, raw) => put(html, kind, 0, raw),
    // Останній — звичайний тост, який сам згасне.
    done: (html, kind, raw) => put(html, kind, undefined, raw)
  };
};
