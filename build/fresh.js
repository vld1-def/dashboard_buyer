// ===== Детектор застарілої сторінки ==================================
// GitHub Pages не дає керувати заголовками кешу, а браузер уміє місяцями
// тримати стару копію 650-кілобайтного index.html і не питати сервер.
// Через це «нових змін немає» повторювалось при повністю правильному
// деплої, і відрізнити стару сторінку від свіжої не було чим.
//
// Тому сторінка перевіряє себе сама: у неї вшито штамп збірки, а поруч
// на сервері лежить build.txt із тим самим штампом. Читаємо його повз
// кеш — якщо значення розійшлись, у тебе стара копія.
//
// Перезавантажувати самі НЕ маємо права: можна стояти посеред імпорту.
// Тому просто показуємо смужку з кнопкою.
(function () {
  const meta = document.querySelector('meta[name="build"]');
  const mine = meta && meta.content;
  if (!mine) return;

  window.BUILD = mine;

  function banner(live) {
    if (document.getElementById('stale-bar')) return;
    const el = document.createElement('div');
    el.id = 'stale-bar';
    el.innerHTML =
      '<span>This page is stale — you have <b>' + mine +
      '</b>, the server has <b>' + live + '</b></span>' +
      '<button type="button">Reload</button>';
    // Повз кеш надійніше через адресу, якої браузер іще не бачив:
    // location.reload() у частині браузерів усе одно віддає копію.
    el.querySelector('button').onclick = () => {
      const u = new URL(location.href);
      u.searchParams.set('v', String(Date.now()));
      location.replace(u.toString());
    };
    document.body.appendChild(el);
  }

  let done = false, last = 0;

  async function check() {
    if (done) return;
    // Вкладку можна перемикати десятки разів на хвилину — не смикаємо
    // сервер частіше, ніж раз на хвилину.
    const now = Date.now();
    if (now - last < 60000) return;
    last = now;
    try {
      const r = await fetch('build.txt?t=' + now, { cache: 'no-store' });
      if (!r.ok) return;
      const live = (await r.text()).trim();
      if (live && live !== mine) { done = true; banner(live); }
    } catch (e) {
      // Немає мережі або файлу — мовчимо: це діагностика, а не функція.
    }
  }

  // Одноразової перевірки при завантаженні мало: дашборд тримають
  // відкритим днями, і така вкладка більше нічого в сервера не питає —
  // саме через це деплої й лишались непоміченими. Тому переперевіряємо
  // і за таймером, і коли до вкладки повертаються.
  function start() {
    setTimeout(() => { last = 0; check(); }, 1500);
    setInterval(check, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    window.addEventListener('focus', check);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start);
  else start();
})();
