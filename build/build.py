# Збирає index-new.html із index.html: міняє head, додає шар дизайну,
# підмінює каркас сторінки і точково патчить JS. Межі шукаються за вмістом,
# а не за номерами рядків — щоб правки в index.html нічого не ламали.
import os
import re
import sys

# Редизайн тепер живе на корінні сайту (index.html), а вихідник старого
# дашборда лежить поруч як index-legacy.html.
# Шляхи — від самого файлу, а не від того, звідки його запустили.
# Абсолютні працювали рівно в одній копії репозиторію; у будь-якому
# свіжому клоні збірка падала б на першому ж open().
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index-legacy.html')
OUT = os.path.join(ROOT, 'index.html')

S = open(SRC, encoding='utf-8').read()

def sub(hay, old, new, what):
    n = hay.count(old)
    if n != 1:
        sys.exit(f'{what}: знайдено {n} збігів замість 1')
    return hay.replace(old, new)

def read(f):
    return open(f, encoding='utf-8').read().rstrip('\n')

head, css, shell, widgets, trend, settings, closehtml, closejs, sliphtml, slipjs, toastjs, geocostjs, freshjs, geomodaljs, cabhtml, cabjs, tgjs, evjs, dmhtml, dmjs, fbjs, repjs, comjs, pagejs, uqhtml, uqjs, rlhtml, rljs, cdjs, tmhtml, tmjs, flhtml, fljs = (read(f) for f in
    ('head.html', 'design.css', 'shell.html', 'widgets.js', 'trend.js', 'settings.html',
     'close.html', 'close.js', 'payslip.html', 'payslip.js', 'toast.js', 'geocost.js',
     'fresh.js', 'geomodal.js', 'cabinets.html', 'cabinets.js', 'tg.js', 'events.js',
     'domains.html', 'domains.js', 'fbtok.js', 'fbrep.js', 'fbcom.js', 'fbpages.js',
     'uniq.html', 'uniq.js', 'rules.html', 'rules.js', 'cabdrill.js',
     'files.html', 'files.js',
     'team.html', 'team.js'))

# Версію Edge Function беремо просто з її коду: дублювати це число в
# двох місцях означало б, що одного дня вони розійдуться, і перевірка
# почне брехати саме тоді, коли вона потрібна.
FN_SRC = os.path.join(ROOT, 'supabase', 'functions', 'fb-sync', 'index.ts')
m = re.search(r"const FN_VERSION = '([^']+)'", open(FN_SRC, encoding='utf-8').read())
if not m:
    sys.exit('у fb-sync/index.ts немає FN_VERSION')
fbjs = sub(fbjs, "const FB_FN_WANT = '';",
           "const FB_FN_WANT = '%s';" % m.group(1), 'версія fb-sync')


def cut(marker, after=False, start=0, what=''):
    i = S.find(marker, start)
    if i < 0:
        sys.exit(f'не знайдено якір: {what or marker!r}')
    if S.find(marker, i + 1) >= 0 and what.endswith('!unique'):
        sys.exit(f'якір не унікальний: {marker!r}')
    return i + len(marker) if after else i

STYLE_OPEN   = '\n <style>\n'
STYLE_CLOSE  = '\n  </style>\n</head>\n'
BODY_TAG     = '<body class="py-6 px-4 md:px-6 font-sans antialiased text-dynamic">'
SHELL_START  = '  <div class="max-w-[1850px] mx-auto">'
TOOLBAR_OPEN = '      <div class="flex items-center gap-2 flex-wrap">'
TOOLBAR_SHUT = '</div>\n    </header>'
WEEKLY       = '<!-- Weekly Heatmap Analysis -->'
CONTENT_SHUT = '<!-- ═══════════ END REPORT BUILDER ═══════════ -->\n    </div>\n  </div>'

i_style      = cut(STYLE_OPEN)                                   # кінець старого <head>
i_css_a      = cut(STYLE_OPEN, after=True)
i_css_b      = cut(STYLE_CLOSE, start=i_css_a)
i_body_a     = cut(BODY_TAG, start=i_css_b)
i_body_b     = i_body_a + len(BODY_TAG)
i_shell_a    = cut(SHELL_START, start=i_body_b)                  # початок старого каркаса
i_tool_a     = cut(TOOLBAR_OPEN, start=i_shell_a)
i_tool_b     = cut(TOOLBAR_SHUT, start=i_tool_a)                 # </div> перед </header>
i_weekly     = cut(WEEKLY, start=i_tool_b)
i_shut       = cut(CONTENT_SHUT, start=i_weekly)

toolbar = S[i_tool_a:i_tool_b + len('</div>')]
# «+ Add Data» більше не веде на окрему сторінку Form.html — відкриває вкладку
# Campaigns у вбудованому Data Hub, не покидаючи дашборд.
# Кнопка Files. Саме в цей ряд, бо док збирається з нього (buildDock),
# і потрапити в док можна лише звідси. У сайдбар вона не годиться: по
# файл заходять між справами, як по команду, тексти чи бонуси.
toolbar = sub(toolbar,
  """    <!-- Тексти — банк заголовків/описів по гео і слотах -->""",
  """    <!-- Файли. Саме вікно й завантаження — у files.js. -->
    <button onclick="openFilesModal()" class="p-2 card rounded-xl shadow-md text-amber-300 hover:bg-gray-500/10 transition admin-only" title="Files">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
    </button>

    <!-- Тексти — банк заголовків/описів по гео і слотах -->""",
  'файли: кнопка в доці')

toolbar = sub(toolbar,
  '<a href="Form.html" class="admin-only',
  '<a href="#/hub/dataset" data-add-data class="admin-only',
  '+ Add Data -> вкладка Campaigns')

# Вхід — у меню місяця, там йому й місце за змістом
toolbar = sub(toolbar,
  """      <div id="month-list" class="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
        <!-- Сюди JS вставить місяці -->
      </div>""",
  """      <div id="month-list" class="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
        <!-- Сюди JS вставить місяці -->
      </div>
      <button onclick="event.stopPropagation(); openMonthClose()"
              class="w-full mt-2 pt-2 text-[10px] font-black uppercase tracking-widest text-left px-2 pb-1"
              style="border-top:1px solid var(--border);color:var(--text-muted)"
              title="Freeze this month's totals">&#10003; Month close</button>""",
  'зліпок місяця: кнопка в меню місяця')

shell = shell.replace('<!--TOOLBAR-->', toolbar)

mid = S[i_weekly:i_shut + len('<!-- ═══════════ END REPORT BUILDER ═══════════ -->')]

# ── Geo Breakdown: третя вкладка ──────────────────────────────────────
mid = sub(mid,
  """<button id="dg-tab-placement" onclick="dgSetMode('placement')" class="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition text-slate-400 hover:text-white">Placements</button>""",
  """<button id="dg-tab-placement" onclick="dgSetMode('placement')" class="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition text-slate-400 hover:text-white">Placements</button>
            <button id="dg-tab-cost" onclick="dgSetMode('cost')" class="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition text-slate-400 hover:text-white">Costs</button>""",
  'ціни по гео: кнопка вкладки')

# ── Календарі без кнопок: дата вибрана — дані вже перерахувались ───────
# Три латки на фільтри «Live Data Feed» стояли тут і зникли разом із самим
# блоком: власник прибрав його як непотрібний. Нижче те саме лікування
# лишається для Weekly Heatmap, де фільтри є й далі.

# Weekly Heatmap — та сама історія: гео вже застосовувалось саме, дати ні.
mid = sub(mid,
  """        <input type="date" id="heat-from" class="bg-transparent outline-none text-[10px] font-bold text-white uppercase">
        <span class="opacity-20 text-[9px]">/</span>
        <input type="date" id="heat-to" class="bg-transparent outline-none text-[10px] font-bold text-white uppercase">""",
  """        <input type="date" id="heat-from" onchange="applyWeeklyFilter()" class="bg-transparent outline-none text-[10px] font-bold text-white uppercase">
        <span class="opacity-20 text-[9px]">/</span>
        <input type="date" id="heat-to" onchange="applyWeeklyFilter()" class="bg-transparent outline-none text-[10px] font-bold text-white uppercase">""",
  'Heatmap: дати застосовуються самі')

mid = sub(mid,
  """
      <button onclick="applyWeeklyFilter()" class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-xl text-[10px] font-black transition-all uppercase">Apply</button>""",
  '',
  'Heatmap: прибрали кнопку Apply')

# ── Кабінети: нова сторінка ────────────────────────────────────────────
CAB_END = '<!-- ═══════════ END REPORT BUILDER ═══════════ -->'
if mid.count(CAB_END) != 1:
    sys.exit(f'кабінети: маркер кінця знайдено {mid.count(CAB_END)} разів замість 1')
# Правила живуть у слоті праворуч на сторінці кабінетів — вставляємо
# їхню розмітку туди, а не поруч зі сторінками.
cabhtml = sub(cabhtml,
  '<div id="rules-panel" class="hidden shrink-0" style="width:452px"></div>',
  '<div id="rules-panel" class="hidden shrink-0" style="width:452px">\n'
  + rlhtml.rstrip() + '\n    </div>',
  'правила: панель на сторінці кабінетів')

mid = mid.replace(CAB_END, cabhtml.rstrip() + '\n\n' + dmhtml.rstrip() + '\n\n'
                  + tmhtml.rstrip() + '\n\n' + CAB_END)

out = []
out.append(head)                                   # новий <head>
out.append(' <style>')                             # якір STYLE_OPEN з'їдає сам тег — повертаємо
out.append(S[i_css_a:i_css_b])                     # старий CSS (компонентні стилі)
out.append(css)                                    # шар нового дизайну
out.append('  </style>\n</head>')
out.append('<body class="font-sans antialiased text-dynamic">')
out.append(S[i_body_b:i_shell_a].strip('\n'))      # helper-скрипт + #top-loader
out.append(shell)                                  # новий каркас + KPI + графіки
out.append(mid)
out.append('      </div><!-- /#dashboard-content -->')
out.append('    </div><!-- /.app-content -->')
out.append('  </div><!-- /.app-main -->')
out.append('</div><!-- /.app-shell -->')

rest = S[i_shut + len(CONTENT_SHUT):]               # модалки + увесь JS

# ─────────── точкові патчі JS ───────────
# Гео-колонка тепер займає два рядки сітки (графік + інсайти), тож підганяти
# її висоту під висоту графіка більше не можна — інакше вона щоразу
# «складається» назад до розміру верхнього рядка.
rest = sub(rest,
  """  function syncGeoHeight() {
    const chart = document.getElementById('chart-main-col');
    const side = document.getElementById('geo-sidebar-col');
    if (!chart || !side) return;""",
  """  function syncGeoHeight() {
    const chart = document.getElementById('chart-main-col');
    const side = document.getElementById('geo-sidebar-col');
    if (!chart || !side) return;
    // Новий дашборд: висоту задає сітка (гео на два рядки), інлайновий height
    // тільки заважав би — знімаємо його і виходимо.
    if (document.body.classList.contains('route-dash')) { side.style.height = ''; return; }""",
  'syncGeoHeight: no-op на дашборді')

# Док шукав цю кнопку за href="Form.html" — тепер за атрибутом.
rest = sub(rest,
  "if (el.tagName === 'A' && /Form\\.html/.test(el.getAttribute('href') || '')) {",
  "if (el.tagName === 'A' && (el.hasAttribute('data-add-data') || /Form\\.html/.test(el.getAttribute('href') || ''))) {",
  'док: пошук Add Data за data-add-data')

rest = sub(rest,
  '      try { await ff.writeFile(\'in.mp4\', new Uint8Array(await file.arrayBuffer())); }\n      catch (e) {\n        const bad = document.createElement(\'p\');\n        bad.className = \'text-[11px] font-bold text-rose-400 mt-3\';\n        bad.textContent = `${file.name}: не вдалось прочитати — ${e.message || e}`;\n        res.appendChild(bad);\n        uqDone.add(fkey); uqRenderFileList();\n        continue;\n      }\n\n      const block = document.createElement(\'div\');\n      block.className = \'mt-4\';\n      block.innerHTML = `<p class="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">${file.name}\n        <span class="text-slate-600 normal-case tracking-normal font-bold">· ${meta.w}×${meta.h} · ${meta.dur.toFixed(1)}с</span>\n        <span class="text-slate-600 normal-case tracking-normal font-bold" id="uq-t-${fi}"></span></p>`;\n      res.appendChild(block);\n\n      for (let v = 1; v <= count && !uqStop; v++) {\n        const left = uqFiles.filter(f => !uqDone.has(f.name + \'|\' + f.size)).length;\n        const restVariants = (left - 1) * count + (count - v + 1);\n        const eta = avg() ? ` · ще ~${uqFmt(avg() * restVariants)}` : \'\';\n        setStatus(`${file.name} · варіант ${v}/${count} · у черзі ще ${Math.max(0, left - 1)} · ${uqFmt(performance.now() - runStart)} минуло${eta}`);\n        const p = uqPickParams();\n        const vStart = performance.now();\n        try {\n          await ff.exec(uqBuildArgs(p, meta, quality, stripMeta));\n          const data = await ff.readFile(\'out.mp4\');\n          const took = performance.now() - vStart;\n          times.push(took);\n          const url = URL.createObjectURL(new Blob([data.buffer], { type: \'video/mp4\' }));\n          const name = `${base}__v${v}.mp4`;\n          const row = document.createElement(\'div\');\n          row.className = \'flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 mb-1.5\';\n          row.innerHTML = `<span class="text-[12px] font-black text-white shrink-0">v${v}</span>\n            <span class="text-[11px] font-bold text-slate-400 flex-1 min-w-0 truncate" title="${uqDescribe(p)}">${uqDescribe(p)}</span>\n            <span class="text-[11px] font-mono text-slate-600 shrink-0">${uqFmt(took)}</span>\n            <span class="text-[11px] font-mono text-slate-500 shrink-0">${(data.length / 1048576).toFixed(1)} МБ</span>\n            <a href="${url}" download="${name}" class="shrink-0 bg-violet-600/80 hover:bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition">Завантажити</a>`;\n          block.appendChild(row);\n          try { await ff.deleteFile(\'out.mp4\'); } catch (e) {}\n        } catch (e) {\n          const row = document.createElement(\'div\');\n          row.className = \'text-[11px] font-bold text-rose-400 px-3 py-2\';\n          row.textContent = `v${v}: не вдалось — ${e.message || e}`;\n          block.appendChild(row);\n        }\n        done++;\n        bar.style.width = ((done / totalNow()) * 100).toFixed(1) + \'%\';\n      }',
  '      let srcBuf;\n      try {\n        // Байти читаємо один раз: writeFile ПЕРЕДАЄ буфер у воркер і тим\n        // самим відчіплює його, тож кожній копії ffmpeg потрібен свій зріз.\n        srcBuf = await file.arrayBuffer();\n        await ff.writeFile(\'in.mp4\', new Uint8Array(srcBuf.slice(0)));\n      }\n      catch (e) {\n        const bad = document.createElement(\'p\');\n        bad.className = \'text-[11px] font-bold text-rose-400 mt-3\';\n        bad.textContent = `${file.name}: не вдалось прочитати — ${e.message || e}`;\n        res.appendChild(bad);\n        uqDone.add(fkey); uqRenderFileList();\n        continue;\n      }\n\n      const jobs = Math.min(count, uqJobCount(file.size));\n      uqFine = jobs === 1;   // дробовий прогрес має сенс лише коли кодує одна копія\n\n      const block = document.createElement(\'div\');\n      block.className = \'mt-4\';\n      block.innerHTML = `<p class="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">${file.name}\n        <span class="text-slate-600 normal-case tracking-normal font-bold">· ${meta.w}×${meta.h} · ${meta.dur.toFixed(1)}с${jobs > 1 ? ` · ${jobs} потоки` : \'\'}</span>\n        <span class="text-slate-600 normal-case tracking-normal font-bold" id="uq-t-${fi}"></span></p>`;\n      res.appendChild(block);\n\n      // Порожні рядки під кожен варіант наперед: копії фінішують не по\n      // порядку, а список має лишитись v1…vN.\n      const slots = [];\n      for (let v = 1; v <= count; v++) {\n        const row = document.createElement(\'div\');\n        row.className = \'flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2 mb-1.5\';\n        row.innerHTML = `<span class="text-[12px] font-black text-slate-600 shrink-0">v${v}</span>\n          <span class="text-[11px] font-bold text-slate-600 flex-1">у черзі…</span>`;\n        block.appendChild(row);\n        slots.push(row);\n      }\n\n      let nextV = 1;\n      const takeV = () => (uqStop || nextV > count) ? 0 : nextV++;\n\n      const fillRow = (v, p, took, data) => {\n        const url = URL.createObjectURL(new Blob([data.buffer], { type: \'video/mp4\' }));\n        const row = slots[v - 1];\n        row.className = \'flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 mb-1.5\';\n        row.innerHTML = `<span class="text-[12px] font-black text-white shrink-0">v${v}</span>\n          <span class="text-[11px] font-bold text-slate-400 flex-1 min-w-0 truncate" title="${uqDescribe(p)}">${uqDescribe(p)}</span>\n          <span class="text-[11px] font-mono text-slate-600 shrink-0">${uqFmt(took)}</span>\n          <span class="text-[11px] font-mono text-slate-500 shrink-0">${(data.length / 1048576).toFixed(1)} МБ</span>\n          <a href="${url}" download="${base}__v${v}.mp4" class="shrink-0 bg-violet-600/80 hover:bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition">Завантажити</a>`;\n      };\n      const failRow = (v, msg, tail) => {\n        const row = slots[v - 1];\n        row.className = \'text-[11px] font-bold text-rose-400 px-3 py-2\';\n        row.textContent = `v${v}: не вдалось — ${msg}`;\n        // Повний хвіст журналу — під наведенням і в консолі: коротке\n        // пояснення влучає не завжди, а скопіювати текст має бути звідки.\n        if (tail) row.title = tail;\n      };\n\n      // Одна копія ffmpeg тягне варіанти з черги, поки та не спорожніє.\n      const pump = async ffw => {\n        for (;;) {\n          const v = takeV();\n          if (!v) return;\n          const tag = slots[v - 1].querySelector(\'span:last-child\');\n          if (tag) tag.textContent = \'кодую…\';\n          const vStart = performance.now();\n          try {\n            // uqPickParams теж усередині try: раніше він стояв зовні, і будь-який\n            // його виняток валив увесь прогін, а в пулі ще й обривав сусідні копії\n            // посеред кодування.\n            const p = uqPickParams();\n            await ffw.exec(uqBuildArgs(p, meta, quality, stripMeta, preset));\n            const data = await ffw.readFile(\'out.mp4\');\n            const took = performance.now() - vStart;\n            times.push(took);\n            fillRow(v, p, took, data);\n            try { await ffw.deleteFile(\'out.mp4\'); } catch (e) {}\n          } catch (e) {\n            failRow(v, e.message || e, e.tail);\n            if (e.tail) console.error(\'uq: ffmpeg\\n\' + e.tail);\n          }\n          done++;\n          bar.style.width = ((done / totalNow()) * 100).toFixed(1) + \'%\';\n          const left = uqFiles.filter(f => !uqDone.has(f.name + \'|\' + f.size)).length;\n          const restVariants = (left - 1) * count + (count - done % count || 0);\n          // Копії йдуть паралельно, тож лишок часу ділимо на їх кількість.\n          const eta = avg() ? ` · ще ~${uqFmt(avg() * Math.max(0, restVariants) / jobs)}` : \'\';\n          setStatus(`${file.name} · ${Math.min(count, nextV - 1)}/${count} · у черзі ще ${Math.max(0, left - 1)} · ${uqFmt(performance.now() - runStart)} минуло${eta}`);\n        }\n      };\n\n      // Додаткові копії піднімаємо тільки якщо є що їм дати.\n      const extra = [];\n      for (let j = 1; j < jobs && !uqStop; j++) {\n        try {\n          const ffw = await uqNewFFmpeg();\n          await ffw.writeFile(\'in.mp4\', new Uint8Array(srcBuf.slice(0)));\n          extra.push(ffw);\n        } catch (e) {\n          // Не вистачило памʼяті на ще одну копію — працюємо тим, що вже є.\n          console.warn(\'uq: додаткова копія ffmpeg не піднялась\', e);\n          break;\n        }\n      }\n\n      try {\n        // pump сам ніколи не відхиляється — інакше перша ж помилка забрала б\n        // із собою копії, які саме щось кодують.\n        await Promise.all([ff, ...extra].map(w => pump(w).catch(e => {\n          console.warn(\'uq: копія ffmpeg зупинилась\', e);\n        })));\n      } finally {\n        extra.forEach(w => { try { w.terminate(); } catch (e) {} });\n      }',
  'унікалізатор: пул копій ffmpeg')

rest = sub(rest,
  "let uqDone = new Set(), uqCurrent = -1, uqQueueDirty = false;",
  "let uqDone = new Set(), uqCurrent = -1, uqQueueDirty = false;\n"
  "let uqFine = true;   // чи має сенс дробовий прогрес (одна копія ffmpeg)",
  'унікалізатор: uqFine')

# ── Унікалізатор: змінні під пул ───────────────────────────────────────
rest = sub(rest,
  """  const quality = document.getElementById('uq-quality').value;
  const stripMeta = document.getElementById('uq-meta').checked;""",
  """  const quality = document.getElementById('uq-quality').value;
  const preset = (document.getElementById('uq-preset') || {}).value || 'veryfast';
  const stripMeta = document.getElementById('uq-meta').checked;""",
  'унікалізатор: читаємо preset')

rest = sub(rest,
  """  const onProgress = ({ progress }) => {
    const p = Math.min(1, Math.max(0, progress || 0));
    bar.style.width = (((done + p) / totalNow()) * 100).toFixed(1) + '%';
  };""",
  """  // Коли копій ffmpeg кілька, їхні progress-події перемішуються і смуга
  // стрибає назад. Тоді рахуємо тільки завершені варіанти.
  const onProgress = ({ progress }) => {
    if (!uqFine) return;
    const p = Math.min(1, Math.max(0, progress || 0));
    bar.style.width = (((done + p) / totalNow()) * 100).toFixed(1) + '%';
  };""",
  'унікалізатор: прогрес під пул')

# ── Унікалізатор: варіанти одного файлу кодуються паралельно ───────────
# ffmpeg.wasm тут однопотоковий (для core-mt потрібна крос-ізоляція, а
# GitHub Pages заголовків не ставить). Зате нічого не заважає тримати
# кілька окремих копій ffmpeg — кожна у своєму воркері, кожна на своєму
# ядрі. Варіанти незалежні між собою, тож це чистий виграш у стільки
# разів, скільки копій витягне памʼять.
rest = sub(rest,
  """async function uqLoadFFmpeg(onStatus) {
  if (uqFF) return uqFF;
  onStatus('Завантажую ядро ffmpeg (~32 МБ, лише перший раз)…');
  const { FFmpeg } = await import('./vendor/ffmpeg/index.js');
  const ff = new FFmpeg();
  const cdn = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
  await ff.load({ coreURL: cdn + '/ffmpeg-core.js', wasmURL: cdn + '/ffmpeg-core.wasm' });
  uqFF = ff;
  return ff;
}""",
  """async function uqLoadFFmpeg(onStatus) {
  if (uqFF) return uqFF;
  onStatus('Завантажую ядро ffmpeg (~32 МБ, лише перший раз)…');
  uqFF = await uqNewFFmpeg();
  return uqFF;
}

// Окрема копія ffmpeg. Модуль і wasm беруться з кешу браузера, тож друга
// й наступні копії піднімаються помітно швидше за першу.
// ЧОМУ МИ ВЗАГАЛІ СЛУХАЄМО ЖУРНАЛ.
//
// exec() у @ffmpeg/ffmpeg 0.12 НЕ кидає виняток, коли ffmpeg завершився
// помилкою: він спокійно віддає код виходу, а ми його відкидали. Далі
// readFile('out.mp4') забирав те, що лишилось — найчастіше нуль байтів, —
// і сторінка видавала порожній файл із кнопкою «Завантажити», без жодного
// натяку, що щось пішло не так. Саме так виглядає «не унікалізує»:
// варіанти ніби є, а всередині порожньо.
//
// Код виходу каже, ЩО зламалось, але не каже ЧОМУ. Чому — лише в журналі
// самого ffmpeg, тож тримаємо його хвіст.
const UQ_LOG_KEEP = 40;

async function uqNewFFmpeg() {
  const { FFmpeg } = await import('./vendor/ffmpeg/index.js');
  const ff = new FFmpeg();
  const cdn = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
  await ff.load({ coreURL: cdn + '/ffmpeg-core.js', wasmURL: cdn + '/ffmpeg-core.wasm' });
  ff.__log = [];
  ff.on('log', ({ message }) => {
    ff.__log.push(String(message || ''));
    if (ff.__log.length > UQ_LOG_KEEP) ff.__log.shift();
  });
  return ff;
}

// ЧОМУ НЕ ПРОСТО «ОСТАННІЙ РЯДОК ІЗ СЛОВОМ error».
//
// Перша версія брала саме його — і щоразу витягала «Conversion failed!».
// Це ПІДСУМОК ffmpeg, останнє, що він пише перед виходом, і він не каже
// нічого: провалилось і провалилось. Справжня причина завжди вище,
// окремим рядком, і підсумок її затуляв. На живому прикладі це коштувало
// цілого кола: на екрані стояло «Conversion failed!» на кожному з пʼяти
// файлів, а в журналі поруч лежало, що ядро не прочитало обкладинку.
//
// Тому спершу шукаємо рядок, який називає ЩОСЬ конкретне, і лише коли
// такого немає — беремо останній незагальний. Хвіст журналу їде в title
// рядка й у консоль: коротке пояснення влучає не завжди, а скопіювати
// повний текст має бути звідки.
// Вважаємо беззмістовними лише ті рядки, що справді нічого не додають.
// «Error while filtering: Invalid argument» сюди НЕ входить: після
// двокрапки там стоїть причина, і викинути такий рядок означало б
// повторити ту саму ваду, тільки з іншого боку.
const UQ_VAGUE = /^(conversion failed|error opening output file|at least one output file)/i;
const UQ_REAL = /invalid|no such|not found|unknown|unsupported|decoder|matches no streams|does not contain|could not|cannot|unable|divisible|out of memory|no space/i;

function uqWhy(ffw, code, data) {
  const log = ((ffw && ffw.__log) || []).map(l => String(l).trim()).filter(Boolean);
  const real = [...log].reverse().find(l => UQ_REAL.test(l) && !UQ_VAGUE.test(l));
  const last = [...log].reverse().find(l => !UQ_VAGUE.test(l));
  const size = data ? data.length : 0;
  const head = (real || last || 'ffmpeg завершився кодом ' + code).slice(0, 200);
  const err = new Error(head + (size ? '' : ' \u00b7 файл на виході порожній'));
  err.tail = log.slice(-8).join('\\n');
  return err;
}

// Скільки копій тримати одночасно. Кожна тримає в памʼяті вхідне відео
// плюс робочі буфери, тож для важких файлів звужуємо коридор — інакше
// вкладка впаде на середині черги, і це гірше за повільну чергу.
function uqJobCount(fileSize) {
  const sel = parseInt((document.getElementById('uq-jobs') || {}).value, 10) || 0;
  const cores = navigator.hardwareConcurrency || 4;
  let n = sel > 0 ? sel : Math.max(1, Math.min(3, Math.floor(cores / 2)));
  const mb = (fileSize || 0) / 1048576;
  if (mb > 150) n = 1;
  else if (mb > 60) n = Math.min(n, 2);
  return Math.max(1, Math.min(4, n));
}""",
  'унікалізатор: uqNewFFmpeg + uqJobCount')

# Шум кладемо ПІСЛЯ масштабу: якби він ішов до, swscale усереднив би сусідні
# пікселі й зерно наполовину згладилось би. allf=t+u — шум свій на кожен кадр,
# рівномірний; статичний згорнувся б у сталу текстуру і читався б як водяний знак.
rest = sub(rest,
  """  vf.push('setsar=1');
  if (p.fps) vf.push(`fps=${Math.max(15, Math.round(30 + p.fps))}`);""",
  """  if (p.noise) vf.push(`noise=alls=${p.noise}:allf=t+u`);
  vf.push('setsar=1');
  if (p.fps) vf.push(`fps=${Math.max(15, Math.round(30 + p.fps))}`);""",
  'унікалізатор: фільтр noise')

rest = sub(rest,
  "  if (p.size)   bits.push(`розмір ${p.size > 0 ? '+' : ''}${p.size}%`);",
  "  if (p.size)   bits.push(`розмір ${p.size > 0 ? '+' : ''}${p.size}%`);\n"
  "  if (p.noise)  bits.push(`зерно ${p.noise}`);",
  'унікалізатор: noise в описі')

# ── Унікалізатор: пресет кодування і паралельні потоки в UI ────────────
# Розмітка ще українська — переклад накладається в самому кінці збірки,
# тому якорі тут по вихідному тексту, а нові підписи одразу англійські.
rest = sub(rest,
  """        <div class="flex items-end">
          <label class="flex items-center gap-2 cursor-pointer pb-1.5">
            <input type="checkbox" id="uq-meta" checked class="uq-chk">""",
  """        <div>
          <label class="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5"
                 title="x264 preset: faster encoding costs a slightly larger file">Encoding speed</label>
          <select id="uq-preset" class="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-violet-500">
            <option value="ultrafast">Fastest</option>
            <option value="superfast" selected>Fast</option>
            <option value="veryfast">Balanced</option>
            <option value="faster">Smaller file</option>
          </select>
        </div>
        <div>
          <label class="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5"
                 title="How many variants to encode at once. Each job is its own ffmpeg copy with its own memory.">Parallel</label>
          <select id="uq-jobs" class="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-violet-500">
            <option value="0" selected>Auto</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </div>
        <div class="flex items-end">
          <label class="flex items-center gap-2 cursor-pointer pb-1.5">
            <input type="checkbox" id="uq-meta" checked class="uq-chk">""",
  'унікалізатор: селекти preset і parallel')

rest = sub(rest,
  '      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">\n        <div>\n          <label class="block text-[9px] font-black uppercase tracking-widest text-violet-400 mb-1.5">Варіантів на файл</label>',
  '      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">\n        <div>\n          <label class="block text-[9px] font-black uppercase tracking-widest text-violet-400 mb-1.5">Варіантів на файл</label>',
  'унікалізатор: сітка налаштувань на 6')

# ── Унікалізатор: прибираємо зайву роботу з кожного прогону ────────────
# 1. -ss стояв ПІСЛЯ -i: це вихідний seek, ffmpeg декодує й викидає все до
#    точки обрізу. Перед -i це вхідний seek — перемотка по ключових кадрах.
# 2. scale додавався завжди, навіть коли розмір не змінюється (k = 1). Це
#    зайвий прохід swscale по кожному кадру заради того самого розміру.
# 3. звук перекодовувався в AAC щоразу, навіть коли гучність не чіпаємо.
#    Без -af його можна просто скопіювати.
rest = sub(rest,
  """function uqBuildArgs(p, meta, quality, stripMeta) {
  const vf = [], args = ['-i', 'in.mp4'];
  if (p.trim) {
    if (p.trim.head > 0) args.push('-ss', String(p.trim.head));
    const left = meta.dur - p.trim.head - p.trim.tail;
    if (left > 1) args.push('-t', String(+left.toFixed(2)));
  }""",
  """function uqBuildArgs(p, meta, quality, stripMeta, preset) {
  const vf = [], args = [];
  // -ss перед -i: перемотка по контейнеру замість декодування у смітник
  if (p.trim && p.trim.head > 0) args.push('-ss', String(p.trim.head));
  args.push('-i', 'in.mp4');
  if (p.trim) {
    const left = meta.dur - p.trim.head - p.trim.tail;
    if (left > 1) args.push('-t', String(+left.toFixed(2)));
  }""",
  'унікалізатор: -ss перед -i')

rest = sub(rest,
  """  if (meta.w && meta.h) {
    const k = 1 + (p.size || 0) / 100;
    const even = n => Math.max(2, Math.round(n * k / 2) * 2);
    vf.push(`scale=${even(meta.w)}:${even(meta.h)}`);
  }""",
  """  if (meta.w && meta.h) {
    const k = 1 + (p.size || 0) / 100;
    const even = n => Math.max(2, Math.round(n * k / 2) * 2);
    const ow = even(meta.w), oh = even(meta.h);
    // Масштаб додаємо лише коли він справді щось міняє. scale=w:h у той самий
    // розмір — це повний прохід swscale по кожному кадру задарма.
    // Після кропу чи повороту кадр уже інший, там масштаб потрібен завжди.
    if (ow !== meta.w || oh !== meta.h || p.crop || p.rotate) vf.push(`scale=${ow}:${oh}`);
  }""",
  'унікалізатор: без зайвого scale')

rest = sub(rest,
  """  args.push('-vf', vf.join(','));
  if (p.volume) args.push('-af', `volume=${p.volume}dB`);""",
  """  if (vf.length) args.push('-vf', vf.join(','));
  if (p.volume) args.push('-af', `volume=${p.volume}dB`);""",
  'унікалізатор: -vf лише коли є фільтри')

rest = sub(rest,
  """  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(quality), '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'out.mp4');""",
  """  args.push('-c:v', 'libx264', '-preset', preset || 'veryfast',
            '-crf', String(quality), '-pix_fmt', 'yuv420p');
  // Гучність не чіпали — доріжку можна не перекодовувати. AAC на кожному
  // варіанті коштував часу рівно ні за що.
  if (p.volume) args.push('-c:a', 'aac', '-b:a', '128k');
  else args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', 'out.mp4');""",
  'унікалізатор: -c:a copy і вибір пресета')

# Чекбокс «зачистка метаданих» стає вибором із трьох станів: порожня зачистка
# сама по собі є сигнатурою «файл прогнали через конвертер», тож поруч має
# бути варіант із правдоподібними тегами різних пристроїв.
rest = sub(rest,
  """        <div class="flex items-end">
          <label class="flex items-center gap-2 cursor-pointer pb-1.5">
            <input type="checkbox" id="uq-meta" checked class="uq-chk">
            <span class="text-[10px] font-bold text-slate-300">Зачистка метаданих</span>
          </label>
        </div>""",
  """        <div>
          <label class="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5"
                 title="Empty metadata is itself a signature. Randomise writes plausible tags from real devices.">Metadata</label>
          <select id="uq-meta" class="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-violet-500">
            <option value="fake" selected>Randomise</option>
            <option value="strip">Strip</option>
            <option value="keep">Keep as is</option>
          </select>
        </div>""",
  'унікалізатор: селект метаданих')

rest = sub(rest,
  "  const stripMeta = document.getElementById('uq-meta').checked;",
  "  const metaMode = (document.getElementById('uq-meta') || {}).value || 'fake';",
  'унікалізатор: читаємо metaMode')

rest = sub(rest,
  """function uqBuildArgs(p, meta, quality, stripMeta, preset) {""",
  """// Правдоподібні теги: кожен варіант виглядає як знятий іншим пристроєм
// в інший час. Дати беремо за останні два місяці — свіжий файл із
// creation_time дворічної давності виглядав би дивніше за порожній.
const UQ_DEVICES = [
  { make: 'Apple',   model: 'iPhone 15 Pro',  enc: 'H.264' },
  { make: 'Apple',   model: 'iPhone 14',      enc: 'H.264' },
  { make: 'Apple',   model: 'iPhone 13 mini', enc: 'H.264' },
  { make: 'samsung', model: 'SM-S918B',       enc: 'Lavf60.3.100', android: '14' },
  { make: 'samsung', model: 'SM-A546E',       enc: 'Lavf59.27.100', android: '13' },
  { make: 'Xiaomi',  model: '23127PN0CG',     enc: 'Lavf60.16.100', android: '14' },
  { make: 'Google',  model: 'Pixel 8',        enc: 'Lavf60.3.100',  android: '14' }
];

function uqFakeMeta() {
  const d = UQ_DEVICES[Math.floor(Math.random() * UQ_DEVICES.length)];
  const ago = Math.random() * 60 * 24 * 3600 * 1000;      // до 60 днів назад
  const when = new Date(Date.now() - ago).toISOString().replace(/\.\d+Z$/, 'Z');
  const tags = [
    '-metadata', `creation_time=${when}`,
    '-metadata', `make=${d.make}`,
    '-metadata', `model=${d.model}`,
    '-metadata', `encoder=${d.enc}`,
    '-metadata:s:v:0', 'handler_name=VideoHandle',
    '-metadata:s:a:0', 'handler_name=SoundHandle'
  ];
  if (d.android) tags.push('-metadata', `com.android.version=${d.android}`);
  return tags;
}

function uqBuildArgs(p, meta, quality, metaMode, preset) {""",
  'унікалізатор: uqFakeMeta')

rest = sub(rest,
  """  if (stripMeta) args.push('-map_metadata', '-1', '-map_chapters', '-1',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
    '-metadata:s:v:0', 'handler_name=', '-metadata:s:a:0', 'handler_name=');""",
  """  if (metaMode === 'strip') {
    args.push('-map_metadata', '-1', '-map_chapters', '-1',
      '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
      '-metadata:s:v:0', 'handler_name=', '-metadata:s:a:0', 'handler_name=');
  } else if (metaMode === 'fake') {
    // Спершу прибираємо чуже, потім вписуємо своє — інакше теги джерела
    // лишились би впереміш із новими. bitexact тут не ставимо: він якраз
    // і глушить рядок encoder, який ми хочемо підмінити.
    args.push('-map_metadata', '-1', '-map_chapters', '-1', ...uqFakeMeta());
  }""",
  'унікалізатор: три режими метаданих')

# ── Унікалізатор: зерно і правдоподібні метадані ───────────────────────
rest = sub(rest,
  "  { key:'size',   label:'Розмір кадру', unit:'%', hint:'трохи інша роздільність на виході', min:1, max:10, step:0.5 },\n];",
  "  { key:'size',   label:'Розмір кадру', unit:'%', hint:'трохи інша роздільність на виході', min:1, max:10, step:0.5 },\n"
  "  { key:'noise',  label:'Зерно',     unit:'',   hint:'ледь помітний шум, свій на кожен кадр', min:2, max:24, step:1 },\n];",
  'унікалізатор: параметр noise')

rest = sub(rest,
  """  low:  { crop:3, rotate:0.6, color:3,  fps:1, volume:1,   trim:0.3, size:1.5 },
  mid:  { crop:5, rotate:1.2, color:5,  fps:2, volume:2,   trim:0.6, size:3 },
  high: { crop:8, rotate:2.2, color:9,  fps:4, volume:3.5, trim:1.2, size:6 },""",
  """  low:  { crop:3, rotate:0.6, color:3,  fps:1, volume:1,   trim:0.3, size:1.5, noise:4 },
  mid:  { crop:5, rotate:1.2, color:5,  fps:2, volume:2,   trim:0.6, size:3,   noise:8 },
  high: { crop:8, rotate:2.2, color:9,  fps:4, volume:3.5, trim:1.2, size:6,   noise:15 },""",
  'унікалізатор: noise у пресетах')

rest = sub(rest,
  "  if (on('size'))   p.size   = +(uqSign() * uqRand(amt('size') * 0.4, amt('size'))).toFixed(2);\n  return p;",
  "  if (on('size'))   p.size   = +(uqSign() * uqRand(amt('size') * 0.4, amt('size'))).toFixed(2);\n"
  "  if (on('noise'))  p.noise  = Math.max(1, Math.round(uqRand(amt('noise') * 0.45, amt('noise'))));\n"
  "  return p;",
  'унікалізатор: noise у pickParams')

rest = sub(rest,
  "            await ffw.exec(uqBuildArgs(p, meta, quality, stripMeta, preset));",
  "            await ffw.exec(uqBuildArgs(p, meta, quality, metaMode, preset));",
  'унікалізатор: виклик із metaMode')

# ── Дельти KPI: останній день проти попереднього ───────────────────────
rest = sub(rest,
  '  function calculateDeltas(data) {\n    const dates = [...new Set(data.map(i => i.date))].sort();\n    if (dates.length < 2) return;\n    const maxDate = dates[dates.length - 1];\n    const curS = data.reduce((a, b) => a + b.spend, 0), curR = data.reduce((a, b) => a + b.regs, 0), curD = data.reduce((a, b) => a + b.deposits, 0);\n    const prevD = data.filter(i => i.date < maxDate);\n    const pS = prevD.reduce((a, b) => a + b.spend, 0), pR = prevD.reduce((a, b) => a + b.regs, 0), pDep = prevD.reduce((a, b) => a + b.deposits, 0);\n\n    const cCPL = curR > 0 ? curS / curR : 0, pCPL = pR > 0 ? pS / pR : 0;\n    const cCPA = curD > 0 ? curS / curD : 0, pCPA = pDep > 0 ? pS / pDep : 0;\n    const cR2D = curR > 0 ? (curD / curR * 100) : 0, pR2D = pR > 0 ? (pDep / pR * 100) : 0;\n\n    const up = (id, c, p, isP) => {\n      const el = document.getElementById(\'delta-\' + id);\n      if (!el || p === 0) return;\n      const diff = c - p;\n      if (Math.abs(diff) < 0.01) { el.innerText = ""; return; }\n      const isB = isP ? diff < 0 : diff > 0;\n      el.innerText = `(${(diff > 0 ? \'▲\' : \'▼\')} ${diff > 0 ? \'+\' : \'-\'}${isP ? \'$\' : \'\'}${Math.abs(diff).toFixed(1)}${isP ? \'\' : \'%\'})`;\n      el.className = `text-[12px] font-black ml-1.5 ${isB ? \'text-green-500\' : \'text-red-500\'}`;\n    };\n    up(\'cpl\', cCPL, pCPL, true); up(\'cpa\', cCPA, pCPA, true); up(\'r2d\', cR2D, pR2D, false);\n  }',
  "  // Стрілка біля Net Profit показує рух САМОГО ТОТАЛА на картці: яким він\n  // був станом на попередній день зрізу і яким став із останнім. Раніше тут\n  // стояв профіт одного дня проти профіту іншого — число на картці за весь\n  // період, а стрілка описувала добу, і разом вони не читались.\n  function calculateDeltas(data) {\n    const setEmpty = () => {\n      window._kpiTotPrev = null;\n      if (typeof kpiDeltaPaint === 'function') kpiDeltaPaint();\n    };\n    if (!Array.isArray(data) || !data.length) return setEmpty();\n\n    const dates = [...new Set(data.map(i => i.date))].filter(Boolean).sort();\n    if (dates.length < 2) return setEmpty();          // немає з чим порівнювати\n    const dLast = dates[dates.length - 1], dPrev = dates[dates.length - 2];\n\n    // Тотал «станом на попередній день» — той самий зріз без останнього дня.\n    // Витрати сюди не входять: вони однакові для обох тоталів і на різницю\n    // не впливають, а перемикач Gross/Net віднімає їх уже при малюванні.\n    let prev = 0;\n    data.forEach(row => {\n      if (row.date === dLast) return;\n      prev += (typeof revenueOf === 'function' ? revenueOf(row) : 0) - (Number(row.spend) || 0);\n    });\n    window._kpiTotPrev = prev;\n    window._kpiTotWhen = { prev: dPrev, cur: dLast };\n    if (typeof kpiDeltaPaint === 'function') kpiDeltaPaint();\n  }\n\n  // Малювання окремо від підрахунку: перемикач Gross/Net міняє число на\n  // картці, і підказка має називати ті самі гроші, що там показані.\n  window.kpiDeltaPaint = function () {\n    const el = document.getElementById('delta-profit');\n    if (!el) return;\n    const clear = () => { el.innerText = ''; el.className = 'kpi-delta'; el.removeAttribute('title'); };\n    const prev = window._kpiTotPrev, cur = window._kpiGross;\n    if (typeof prev !== 'number' || typeof cur !== 'number') return clear();\n\n    // У режимі Net тотали теж мають бути чистими — інакше підказка\n    // називала б інші гроші, ніж число на картці.\n    const off = (localStorage.getItem('kpi_net') === 'net')\n      ? (Number(window._kpiFeesVal) || 0) + (Number(window._kpiExpensesVal) || 0) : 0;\n    const w = window._kpiTotWhen || {};\n    const money = v => (typeof formatCurrency === 'function' ? formatCurrency(v) : '$' + Number(v).toFixed(2));\n    const tip = `Total: ${money(prev - off)} (${w.prev}) → ${money(cur - off)} (${w.cur})`;\n    const diff = cur - prev;\n\n    if (Math.abs(diff) < 0.5) {\n      el.innerText = '=';\n      el.className = 'kpi-delta is-flat';\n      el.setAttribute('title', 'No change · ' + tip);\n      return;\n    }\n    const arrow = diff > 0 ? '▲' : '▼';\n    const abs = money(Math.abs(diff)).replace(/^-/, '');\n    // Відсоток — від учорашнього тотала і лише коли той додатний: від нуля\n    // чи від мінуса він нічого не означає.\n    const base = prev - off;\n    const rel = base > 0 ? ` · ${Math.round(Math.abs(diff) / base * 100)}%` : '';\n    el.innerText = `${arrow} ${abs}${rel}`;\n    el.className = `kpi-delta ${diff > 0 ? 'is-up' : 'is-down'}`;\n    el.setAttribute('title', tip);\n  };",
  'calculateDeltas: тотал учора проти тотала сьогодні')

# Функція існувала, але її ніхто не викликав — чіпляємо до рендера KPI.
rest = sub(rest,
  "  _kpiRevenue = totalRev;\n  updateTotalProfit();",
  "  _kpiRevenue = totalRev;\n  updateTotalProfit();\n  calculateDeltas(data);",
  'calculateDeltas: виклик із renderDashboard')

# Стару розмітку модалки міняємо цілком — вона від `<div id="settings-modal"`
# до коментаря перед наступною модалкою.
_s_a = rest.index('<div id="settings-modal"')
_s_b = rest.index('<!-- ===== GEO COMPARE (cross-team) MODAL ===== -->')
rest = rest[:_s_a] + settings.rstrip() + '\n\n' + rest[_s_b:]
print('налаштування: розмітку замінено')

# Esc закриває модалку, а перемикачі показують «Saved»
rest = sub(rest,
  """function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}""",
  """function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
  if (typeof setFilter === 'function') setFilter('', true);
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('settings-modal');
  if (m && !m.classList.contains('hidden')) closeSettingsModal();
});

// Будь-яка зміна всередині модалки підсвічує «Saved». Збереження вже висить
// на onchange кожного поля — тут лише видимий відгук, якого не було.
document.addEventListener('change', e => {
  if (!e.target.closest || !e.target.closest('#settings-modal')) return;
  if (typeof setSaved === 'function') setSaved();
});""",
  'налаштування: Esc і відгук про збереження')

# openSettingsModal відкривався на неіснуючій тепер вкладці
rest = sub(rest,
  "  switchSettingsTab('widgets');",
  "  switchSettingsTab('general');",
  'налаштування: стартовий розділ')

# Рядки док-меню малюються кодом, тож під новий стиль їх треба привести окремо.
# Рядок із onchange не чіпаємо: там екранована лапка, і точний збіг по ній
# ламався б від найменшої різниці в екрануванні.
rest = sub(rest,
  '      <label class="flex items-center justify-between cursor-pointer group px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">\n'
  "        <span class=\"text-xs font-bold ${hidden.has(t) ? 'text-slate-500' : 'text-slate-300'} group-hover:text-white transition\">",
  '      <label class="set-row set-toggle">\n'
  "        <span class=\"set-label\" style=\"opacity:${hidden.has(t) ? '.45' : '1'}\">",
  'док-меню: рядок у новому стилі')

rest = sub(rest,
  '<p class="text-[10px] text-slate-600 italic px-3">Меню ще не зібрано</p>',
  '<p class="set-hint">Меню ще не зібрано</p>',
  'док-меню: порожній стан')

# ── Налаштування: розділи ліворуч, пошук, гуртові перемикачі ──────────
rest = sub(rest,
  "function switchSettingsTab(tab) {\n  ['widgets','offers','access'].forEach(t => {\n    document.getElementById(`spanel-${t}`).classList.toggle('hidden', t !== tab);\n    const btn = document.getElementById(`stab-${t}`);\n    if (t === tab) { btn.classList.add('active-stab'); }\n    else { btn.classList.remove('active-stab'); }\n  });\n  if (tab === 'widgets' && typeof renderDockSettings === 'function') renderDockSettings();\n}",
  'const SET_TABS = [\'general\', \'layout\', \'payouts\', \'access\', \'integrations\'];\n// Старі назви вкладок лишились у викликах ззовні — не ламаємо їх.\nconst SET_ALIAS = { widgets: \'layout\', offers: \'payouts\' };\n\nfunction switchSettingsTab(tab) {\n  tab = SET_ALIAS[tab] || tab;\n  if (!SET_TABS.includes(tab)) tab = SET_TABS[0];\n  // Ручний вибір розділу скидає пошук: інакше видимі рядки лишились би\n  // відфільтрованими й розділ виглядав би напівпорожнім.\n  const q = document.getElementById(\'set-search\');\n  if (q && q.value) setFilter(\'\', true);\n  SET_TABS.forEach(t => {\n    document.getElementById(`spanel-${t}`)?.classList.toggle(\'hidden\', t !== tab);\n    document.getElementById(`stab-${t}`)?.classList.toggle(\'active-stab\', t === tab);\n  });\n  if (tab === \'layout\') {\n    if (typeof renderDockSettings === \'function\') renderDockSettings();\n    // Списки Report Builder малюються кодом; перемальовуємо на вході,\n    // щоб розділ показував поточний стан, а не той, що був при завантаженні.\n    if (typeof rbRenderHideSettings === \'function\') rbRenderHideSettings();\n  }\n}\n\n// Пошук по всіх розділах одразу: у режимі запиту показуємо всі панелі,\n// ховаємо рядки без збігу, а потім і групи з розділами, де не лишилось нічого.\nfunction setFilter(q, clear) {\n  const input = document.getElementById(\'set-search\');\n  if (clear && input) input.value = \'\';\n  q = String(q || \'\').trim().toLowerCase();\n  // Вікно «Month close» користується тими самими стилями .set-*, і в DOM\n  // стоїть РАНІШЕ за налаштування, тож querySelector(\'.set-panes\') брав\n  // його контейнер — порожній щодо рядків. Тримаємось за id.\n  const panes = document.getElementById(\'set-panes\');\n  if (!panes) return;\n  document.querySelector(\'.set-search\')?.classList.toggle(\'has-q\', !!q);\n\n  if (!q) {\n    panes.classList.remove(\'searching\');\n    panes.querySelectorAll(\'.no-hit\').forEach(el => el.classList.remove(\'no-hit\'));\n    document.getElementById(\'set-empty\')?.classList.add(\'hidden\');\n    const active = SET_TABS.find(t => document.getElementById(`stab-${t}`)?.classList.contains(\'active-stab\'));\n    SET_TABS.forEach(t => document.getElementById(`spanel-${t}`)\n      ?.classList.toggle(\'hidden\', t !== (active || SET_TABS[0])));\n    return;\n  }\n\n  panes.classList.add(\'searching\');\n  SET_TABS.forEach(t => document.getElementById(`spanel-${t}`)?.classList.remove(\'hidden\'));\n\n  // Рядок вважається збігом і за підписом, і за ключовими словами в\n  // data-setting — там лежать українські синоніми, бо шукати їх у\n  // англійському інтерфейсі інакше неможливо.\n  let hits = 0;\n  panes.querySelectorAll(\'.set-row, .set-addrow[data-setting]\').forEach(row => {\n    const hay = ((row.dataset.setting || \'\') + \' \' + row.textContent).toLowerCase();\n    const hit = hay.includes(q);\n    row.classList.toggle(\'no-hit\', !hit);\n    if (hit) hits++;\n  });\n  panes.querySelectorAll(\'.set-group\').forEach(g => {\n    const rows = g.querySelectorAll(\'.set-row, .set-addrow[data-setting]\');\n    const any = [...rows].some(r => !r.classList.contains(\'no-hit\'));\n    // Групу без жодного рядка (як-от док-меню) лишаємо, якщо збігся заголовок.\n    const byTitle = (g.querySelector(\'.set-gtitle\')?.textContent || \'\').toLowerCase().includes(q);\n    g.classList.toggle(\'no-hit\', !(any || (rows.length === 0 && byTitle)));\n    if (!rows.length && byTitle) hits++;\n  });\n  panes.querySelectorAll(\'.set-pane\').forEach(p => {\n    const any = [...p.querySelectorAll(\'.set-group\')].some(g => !g.classList.contains(\'no-hit\'));\n    p.classList.toggle(\'no-hit\', !any);\n  });\n  document.getElementById(\'set-empty\')?.classList.toggle(\'hidden\', hits > 0);\n}\n\n// Гуртом увімкнути чи вимкнути всі перемикачі групи. Подію шлемо вручну:\n// присвоєння .checked саме по собі onchange не викликає, а саме в ньому\n// живе збереження.\nfunction setBulk(sel, on) {\n  document.querySelectorAll(`${sel} input[type="checkbox"]`).forEach(cb => {\n    if (cb.checked === on) return;\n    cb.checked = on;\n    cb.dispatchEvent(new Event(\'change\', { bubbles: true }));\n  });\n  setSaved();\n}\n\nlet _setSavedT = null;\nfunction setSaved() {\n  const el = document.getElementById(\'set-saved\');\n  if (!el) return;\n  el.classList.add(\'show\');\n  clearTimeout(_setSavedT);\n  _setSavedT = setTimeout(() => el.classList.remove(\'show\'), 1400);\n}',
  'switchSettingsTab -> нові розділи')

# Спливайки всередині доку — це власний інтерфейс, а не кнопки доку.
# Без цього «+ Add Link» у Quick Links втрачав py-2 і rounded-xl, отримував
# клас .dk і перетворювався на квадратну іконку 43×43.
rest = sub(rest,
  """    dock.querySelectorAll('button, a').forEach(el => {
      const t = el.getAttribute('title') || '';""",
  """    dock.querySelectorAll('button, a').forEach(el => {
      if (el.closest('#links-menu, #month-menu, #team-menu')) return;
      const t = el.getAttribute('title') || '';""",
  'док: не чіпати кнопки у спливайках')

# ── Net Profit: віддаємо цифри перемикачу Gross/Net ────────────────────
# Грязний профіт і спенд виносимо у window, щоб kpiNetPaint могла
# перерахувати показане число без повторного рендера всього дашборда.
rest = sub(rest,
  """  // Net Profit = виручка − спенд. Підсумковий профіт ще й без комісій та витрат.
  _kpiRevenue = totalRev;
  updateTotalProfit();""",
  """  /* Gross = виручка − спенд. Комісію агента й витрати віднімає
     перемикач Gross/Net — обидві цифри віддаємо йому сюди.

     Комісія рахувалась і раніше, але лише малювалась рядком «+ $X
     (Fees)» біля спенду й у жодну суму не входила. На 5% від шестизначного
     спенду це сотні доларів, які тихо сиділи в прибутку. */
  _kpiRevenue = totalRev;
  window._kpiGross = profit;
  window._kpiSpendVal = totalS;
  window._kpiFeesVal = tc;
  window._kpiAgents = Object.entries(agentMap)
    .filter(([, v]) => v.fee > 0)
    .map(([n, v]) => ({ name: n, fee: v.fee, pct: v.pcts.size === 1 ? [...v.pcts][0] : null }))
    .sort((a, b) => b.fee - a.fee);
  updateTotalProfit();
  if (typeof kpiNetPaint === 'function') kpiNetPaint();""",
  'Net Profit: підживлення перемикача')

# Сума витрат теж має долітати до перемикача — вона рахується окремо
# і пізніше за renderDashboard.
rest = sub(rest,
  "  _kpiExpenses = total; updateTotalProfit();",
  "  _kpiExpenses = total;\n  window._kpiExpensesVal = total;\n"
  "  // Розбивка по категоріях рахується нижче, але потрібна перемикачу\n"
  "  // вже тут: підказка Net має назвати, з чого склалась сума.\n"
  "  window._kpiExpenseCats = data.reduce((a, r) => {\n"
  "    a[r.category || 'other'] = (a[r.category || 'other'] || 0) + (Number(r.amount) || 0);\n"
  "    return a; }, {});\n  updateTotalProfit();\n"
  "  if (typeof kpiNetPaint === 'function') kpiNetPaint();",
  'Net Profit: сума витрат у перемикач')

rest = sub(rest,
  "    _kpiExpenses = 0; updateTotalProfit();",
  "    _kpiExpenses = 0;\n    window._kpiExpensesVal = 0;\n"
  "    window._kpiExpenseCats = null;\n    updateTotalProfit();\n"
  "    if (typeof kpiNetPaint === 'function') kpiNetPaint();",
  'Net Profit: нульові витрати у перемикач')

# ── Зарплатна чернетка: третя вкладка в Bonus Calculator ───────────────
rest = sub(rest,
  """      <button onclick="switchBonusTab('grid')" id="btab-grid" class="bonus-stab flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition">⚙️ Bonus Grid</button>""",
  """      <button onclick="switchBonusTab('grid')" id="btab-grid" class="bonus-stab flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition">⚙️ Bonus Grid</button>
      <button onclick="switchBonusTab('slip')" id="btab-slip" class="bonus-stab flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition">🧾 Payout</button>""",
  'чернетка: вкладка')

# Панель кладемо перед панеллю сітки тірів
rest = sub(rest,
  """      <!-- GRID PANEL -->""",
  sliphtml.rstrip() + """

      <!-- GRID PANEL -->""",
  'чернетка: панель')

rest = sub(rest,
  "  ['calc','grid'].forEach(t => {",
  "  ['calc','grid','slip'].forEach(t => {",
  'чернетка: у перемикачі вкладок')

# Дані вкладки підтягуємо при першому відкритті — раніше, ніж тіри,
# сенсу немає: бонус рахується саме з них.
rest = sub(rest,
  """function switchBonusTab(tab) {""",
  """function switchBonusTab(tab) {
  if (tab === 'slip' && typeof psInit === 'function') setTimeout(psInit, 0);""",
  'чернетка: ініціалізація вкладки')

rest = sub(rest,
  "function fmtBonus(n) { return '$' + Math.round(n).toLocaleString(); }",
  "function fmtBonus(n) { return '$' + Math.round(n).toLocaleString(); }\n" + slipjs.rstrip(),
  'чернетка: скрипт')

# ── Тости замість alert() ─────────────────────────────────────────────
# Вантажимо якнайраніше: перехоплення window.alert має стояти до того,
# як хоч щось устигне його викликати.
_t_a = rest.index('<!-- Bonus Calculator Modal -->')
rest = rest[:_t_a] + '<script>\n' + toastjs.strip() + '\n</script>\n\n' + rest[_t_a:]

# Детектор застарілої сторінки — поруч із тостами, теж якомога раніше.
_f_a = rest.index('<!-- Bonus Calculator Modal -->')
rest = rest[:_f_a] + '<script>\n' + freshjs.strip() + '\n</script>\n\n' + rest[_f_a:]

# Три повідомлення лишались українськими ще з попередніх правок
for _ua, _en in [
  ("'Спершу виконай у Supabase:", "'Run this in Supabase first:"),
  ("'Не вдалось змінити оффер: '", "'Could not change the offer: '"),
  ("'Помилка завантаження фото: '", "'Could not upload the photo: '"),
  ('"Помилка: запис не має ID в базі. Перезавантажте сторінку."',
   '"Error: this row has no ID in the database. Reload the page."'),
  ('"Помилка бази: "', '"Database error: "'),
]:
    if rest.count(_ua) == 1:
        rest = rest.replace(_ua, _en)
    else:
        sys.exit(f'переклад alert: {_ua} знайдено {rest.count(_ua)} разів')

# ── Зліпок місяця ──────────────────────────────────────────────────────
# Розмітку кладемо перед модалкою налаштувань, скрипт — у той самий блок,
# що й решта віджетів.
_c_a = rest.index('<div id="settings-modal"')
rest = rest[:_c_a] + closehtml.rstrip() + '\n\n' + rest[_c_a:]
_c_a = rest.index('<div id="settings-modal"')

# Скрипт кладемо власним <script> поруч із розміткою: widgets.js — IIFE,
# а обробники onclick шукають ці функції в глобальній області.
rest = rest[:_c_a] + '<script>\n' + closejs.strip() + '\n</script>\n\n' + rest[_c_a:]


# Пункт палітри додано прямо у widgets.js

rest = sub(rest,
  "pEl.className = `text-[26px] font-black mt-1 ${profit >= 0 ? 'text-emerald-400' : 'text-red-500'}`;",
  "pEl.className = `kpi-value ${profit >= 0 ? 'text-emerald-400' : 'text-red-500'}`;",
  'клас Net Profit')

# Патч «клас дельт» прибрано: calculateDeltas переписана і ставить
# kpi-delta is-up/is-down сама.

# renderTable зник разом із «Live Data Feed», тож чіпляємось до сусіда.
rest = sub(rest,
  "  renderWeeklyHeatmap(data);\n}",
  "  renderWeeklyHeatmap(data);\n  renderInsightCards(data);\n}",
  'виклик інсайт-карток')

# У бейджі залишку показуємо ще й відсоток від таргету
rest = sub(rest,
  """    info.innerText = left > 0 
      ? `Left: $${Math.round(left).toLocaleString()}` 
      : "GOAL REACHED! 🚀";""",
  """    const pctLeft = target > 0 ? (left / target * 100) : 0;
    info.innerText = left > 0 
      ? `Left: $${Math.round(left).toLocaleString()} (${pctLeft.toFixed(1)}%)` 
      : "GOAL REACHED! 🚀";""",
  'відсоток у бейджі залишку')

# Карток CPL і CPA у новому дизайні немає — пишемо лише якщо елемент існує
rest = sub(rest,
  """  document.getElementById('kpi-cpl').innerText = formatCurrency(totalR > 0 ? totalS / totalR : 0);
  document.getElementById('kpi-cpa').innerText = formatCurrency(totalD > 0 ? totalS / totalD : 0);""",
  """  const elCpl = document.getElementById('kpi-cpl');
  if (elCpl) elCpl.innerText = formatCurrency(totalR > 0 ? totalS / totalR : 0);
  const elCpa = document.getElementById('kpi-cpa');
  if (elCpa) elCpa.innerText = formatCurrency(totalD > 0 ? totalS / totalD : 0);""",
  'KPI без CPL/CPA')

# Кабінети: колонка з датою додавання
rest = sub(rest,
  "  const COLS = 'grid-template-columns: minmax(140px,1.3fr) minmax(90px,1fr) 52px 210px minmax(120px,1.4fr);';",
  "  const COLS = 'grid-template-columns: minmax(140px,1.3fr) minmax(90px,1fr) 52px 84px 210px minmax(120px,1.4fr);';",
  'ширини колонок кабінетів')

rest = sub(rest,
  """      ${[`Account <span class="opacity-50">(${rows.length})</span>`,'Agent','TZ','Статус','Нотатка'].map((h, i) =>
        `<span class="text-[9px] text-slate-500 uppercase font-black tracking-widest ${i === 2 ? 'text-center' : ''}">${h}</span>`).join('')}""",
  """      ${[`Account <span class="opacity-50">(${rows.length})</span>`,'Agent','TZ','Додано','Статус','Нотатка'].map((h, i) =>
        `<span class="text-[9px] text-slate-500 uppercase font-black tracking-widest ${i === 2 || i === 3 ? 'text-center' : ''}">${h}</span>`).join('')}""",
  'заголовки кабінетів')

rest = sub(rest,
  """          <span class="text-[12px] font-black text-amber-300 text-center">${r.timezone === null || r.timezone === undefined ? '—' : (r.timezone > 0 ? '+' : '') + r.timezone}</span>""",
  """          <span class="text-[12px] font-black text-amber-300 text-center">${r.timezone === null || r.timezone === undefined ? '—' : (r.timezone > 0 ? '+' : '') + r.timezone}</span>
          <span class="text-[11px] font-bold text-slate-400 text-center font-mono" title="Дата додавання кабінета">${String(r.created_at || r.added_at || '').slice(0, 10) || '—'}</span>""",
  'дата додавання кабінета')

# Зріз KPI за моделлю виплат: фільтруємо на вході в renderDashboard,
# тож за ним ідуть і графік, і гео, і таблиця, і інсайти
rest = sub(rest,
  """  function renderDashboard(data) {
  if (!data || data.length === 0) {
    console.warn("⚠️ Немає даних для відображення в KPI");
    return;
  }""",
  """  function renderDashboard(data) {
  // Порожній зріз — теж результат: показуємо нулі, а не старі числа.
  // Ранній вихід лишається тільки коли даних немає взагалі.
  const _allRows = data;
  if (typeof kpiLensApply === 'function') data = kpiLensApply(data) || [];
  if (!_allRows || _allRows.length === 0) {
    console.warn("⚠️ Немає даних для відображення в KPI");
    return;
  }""",
  'зріз KPI')

# Таска відкривається по кліку: id приходить із розмітки завжди рядком,
# а в taskData він може бути числом — строге порівняння мовчки не знаходило нічого
rest = sub(rest,
  "  const task = taskData.find(t => t.id === id);",
  "  const task = taskData.find(t => String(t.id) === String(id));",
  'пошук таски за id')

# Spend by Agency: агенції без спенда не показуємо, порожній блок ховаємо цілком
rest = sub(rest,
  "    const rows = Object.entries(agentMap).sort((a, b) => b[1].s - a[1].s);",
  "    const rows = Object.entries(agentMap).filter(([, v]) => v.s > 0).sort((a, b) => b[1].s - a[1].s);\n    document.getElementById('spend-agency-wrap')?.classList.toggle('hidden', rows.length === 0);",
  'фільтр нульових агенцій')

# Патч «перемикач вигляду графіка» прибрано: select тепер живе
# у settings.html, у розділі General.

# Доступи тімліда: сторінки Cabinets і Expenses зʼявились пізніше за це
# вікно, а список тут «заборонено за замовчуванням» — тож вони були
# приховані від тімліда назавжди, без жодного способу відкрити.
rest = sub(rest,
  """  const keys = ['kpi','chart','geo','creatives','heatmap','device-geo','report','placements'];""",
  """  const keys = ['kpi','chart','geo','creatives','heatmap','device-geo','report','cabinets','domains','expenses'];""",
  'доступи тімліда: ключі')

rest = sub(rest,
  """    'report':     'report-builder-section'
  };""",
  """    'report':     'report-builder-section',
    'cabinets':   'cabinets-section',
    'domains':    'domains-section',
    'expenses':   'expenses-section'
  };""",
  'доступи тімліда: мапа секцій')

# Кабінети й витрати — такі самі сторінки сайдбара, як решта, тож і
# вмикатись мусять там само. У вихідній мапі їх не було, бо обидві
# сторінки зʼявились пізніше за саме вікно налаштувань.
rest = sub(rest,
  """    'toggle-report': 'report-builder-section',
  };""",
  """    'toggle-report': 'report-builder-section',
    'toggle-cabinets': 'cabinets-section',
    'toggle-domains': 'domains-section',
    'toggle-expenses': 'expenses-section',
    'toggle-team': 'team-section'
  };""",
  'видимість: кабінети, витрати й Team')

# Тімліду сторінку Team не вимикаємо НІКОЛИ: вона в нього одна, і разом
# із нею зникло б усе меню. Налаштування — це вибір адміна для себе, а
# не вимикач чужого доступу. Стоїть ПІСЛЯ циклу, який розвішує hidden.
rest = sub(rest,
  """  const settings = {};""",
  """  if (document.body.classList.contains('is-lead-only'))
    document.getElementById('team-section')?.classList.remove('hidden');

  const settings = {};""",
  'видимість: Team тімліду не вимикається')

# Перемикачі віджетів одразу оновлюють і меню сайдбара
# Перший запуск: питаємо назву команди до того, як підуть запити за
# даними. Інакше перший десяток запитів пішов би з порожньою назвою.
rest = sub(rest,
  """  const authed = await checkSiteAuth();
  if (!authed) return;""",
  """  const authed = await checkSiteAuth();
  if (!authed) return;

  // Кеш у браузері міг лишитись від іншого акаунта — зняти його треба
  // ДО того, як питати назву команди, інакше питати буде нічого:
  // selected_team уже лежить, тільки чужий.
  if (typeof cacheGuard === 'function') await cacheGuard();

  // У нового користувача ще немає жодного рядка, а отже й назви команди.
  // Питаємо один раз, до першого запиту за даними.
  if (typeof teamFirstRun === 'function') {
    const picked = await teamFirstRun();
    if (picked) currentTeam = picked;
  }

  // Роль і вкладки за роллю — після того, як відома команда: звідти
  // читається role_access.
  if (typeof roleBoot === 'function') await roleBoot();""",
  'перший запуск: гачок')

# ── РОЗРІЗ ЗВІТУ ПО ЛЮДЯХ ──
# Баєр після ADMIN_ROLES.sql читає рядки свого асистента, і вони вже
# лягають в один звіт разом із його власними — бо відбір іде лише по
# team_name. Це й треба за замовчуванням: звіт подають один, і скільки
# в тебе асистентів — нікого не обходить.
#
# Чого бракувало — можливості РОЗДІЛИТИ, коли треба подивитись, хто
# скільки зробив. Додаємо вимір і фільтр «Buyer» по created_by.
rest = sub(rest,
  "  { key:'creative',  label:'Creative' },\n];",
  """  { key:'creative',  label:'Creative' },
  /* Хто залив рядок. Зʼявляється у списку лише тоді, коли ділити є на
     кого (див. rbVisDims): поки асистента немає, це вимір з одним
     значенням, тобто зайвий рядок у шапці й нічого більше. */
  { key:'buyer',     label:'Buyer' },
];""",
  'Report Builder: вимір Buyer')

rest = sub(rest,
  "  if(dim==='creative') return String(r.cid||'').trim() || '—';",
  """  if(dim==='creative') return String(r.cid||'').trim() || '—';
  // Імена беремо з whoName (заповнює roleBoot). Немає імені — показуємо
  // початок uuid, а не порожнє: рядок усе одно чийсь.
  if(dim==='buyer'){
    const u=String(r.created_by||'');
    if(!u) return '—';
    return (window.whoName && window.whoName[u]) || u.slice(0,8);
  }""",
  'Report Builder: значення виміру Buyer')

rest = sub(rest,
  "  { k:'crea',  label:'All creatives' },\n];",
  """  { k:'crea',  label:'All creatives' },
  { k:'buyer', label:'All buyers' },
];""",
  'Report Builder: фільтр Buyer')

rest = sub(rest,
  "  crea:  r => String(r.cid||'').trim(),\n};",
  """  crea:  r => String(r.cid||'').trim(),
  buyer: r => String(r.created_by||''),
};""",
  'Report Builder: відбір по Buyer')

# Вимір і фільтр ховаються, поки ділити нема на кого: один автор — це
# не розріз, а зайвий пункт у двох меню.
rest = sub(rest,
  "const rbVisDims = () => RB_DIMS.filter(d=>!rbDimsOff.has(d.key));\n"
  "const rbVisFilters = () => RB_FILTERS.filter(f=>!rbFiltOff.has(f.k));",
  """/* «Buyer» має сенс лише в того, у кого є асистент. whoName тримає
   себе плюс своїх асистентів (політика team_members_read_mine), тож
   один запис означає «ділити нема на кого». Ховаємо вимір і фільтр
   разом: інакше можна було б відфільтрувати по людині, не маючи змоги
   побачити розріз. */
const rbSolo = () => Object.keys(window.whoName || {}).length < 2;
const rbVisDims = () => RB_DIMS.filter(d=>!rbDimsOff.has(d.key) && !(d.key==='buyer' && rbSolo()));
const rbVisFilters = () => RB_FILTERS.filter(f=>!rbFiltOff.has(f.k) && !(f.k==='buyer' && rbSolo()));""",
  'Report Builder: Buyer лише коли є асистент')

# Витрати йдуть за місяцем дашборда, а власного перемикача більше не
# мають — отже, при зміні місяця панель треба перемалювати звідси.
# Інакше в ній лишаються числа попереднього місяця під новим підписом.
rest = sub(rest,
  "  if (typeof rbRender === 'function') rbRender();\n  if (typeof renderCreativeSidebar === 'function') {",
  """  if (typeof rbRender === 'function') rbRender();
  // Витрати фільтруються тим самим місяцем, свого перемикача в них немає.
  // Смикаємо лише коли панель відкрита: інакше це запит у базу на кожне
  // перемикання місяця.
  if (typeof expLoad === 'function'
      && !document.getElementById('expenses-section')?.classList.contains('route-off')) {
    expLoad();
  }
  if (typeof renderCreativeSidebar === 'function') {""",
  'витрати за місяцем дашборда')

rest = sub(rest,
  "  localStorage.setItem('dashboard_visibility', JSON.stringify(settings));\n  applyTeamLeadSections();\n}",
  "  localStorage.setItem('dashboard_visibility', JSON.stringify(settings));\n  applyTeamLeadSections();\n  if (typeof syncNavVisibility === 'function') syncNavVisibility();\n}",
  'меню за налаштуваннями віджетів')

# Жорсткий дефолт «Makeberry» був безпечний, поки баєр був один. Тепер
# кожен новий користувач потрапляв би в чужу назву команди.
rest = sub(rest,
  'let currentTeam = localStorage.getItem(\'selected_team\') || "Makeberry";',
  "let currentTeam = localStorage.getItem('selected_team') || '';",
  'дефолт команди: без Makeberry')

rest = sub(rest,
  """    // Завжди маємо дефолтну команду, якщо база порожня
    let teams = ["Makeberry"]; """,
  """    // Список будується з власних даних. Якщо їх ще немає, показуємо
    // рівно те, що людина щойно назвала, — і нічого чужого.
    let teams = currentTeam ? [currentTeam] : [];""",
  'список команд: без Makeberry')

# Підсвітка перемикача Daily/Geo — під нову акцентну барву
rest = rest.replace("'bg-blue-600', 'text-white'", "'bg-violet-600', 'text-white'")

# Ряд графіків знову двочастинний (cashflow | geo) — col-span 3↔4 як в оригіналі

# Лінійний renderTrend замінюємо на стовпчиковий Cashflow Overview
a = rest.index('function renderTrend(data) {')
b = rest.index('  function calculateDeltas(data) {')
rest = rest[:a] + trend + '\n\n' + rest[b:]

# ── Модалка гео: вкладка Costs ────────────────────────────────────────
# «Geo Breakdown», яким користуються насправді, — це модалка з кліку по
# гео в Geo Performance, а не однойменна сторінка. Вкладку з цінами
# треба саме тут, поруч із Funnels / Offers / Devices / ...
# Вікно ширше: два графіки по 30 днів у 1024 px тісні, точки злипаються.
rest = sub(rest,
  """  <div class="card w-full max-w-5xl rounded-[2rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-white/10 bg-[#0f172a]/95 backdrop-blur-xl">""",
  """  <div class="card w-full max-w-[1500px] rounded-[2rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-white/10 bg-[#0f172a]/95 backdrop-blur-xl">""",
  'модалка гео: ширше вікно')

# Costs стоїть ПЕРШОЮ вкладкою: вікно відкривається одразу на графіках.
# Активний клас теж переїжджає з Funnels на неї.
rest = sub(rest,
  """<button onclick="switchGeoTab('funnels')" id="geo-tab-funnels" class="geo-tab-btn active-geo-tab px-4 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all">Funnels</button>""",
  """<button onclick="switchGeoTab('costs')" id="geo-tab-costs" class="geo-tab-btn active-geo-tab px-4 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all">Costs</button>
      <button onclick="switchGeoTab('funnels')" id="geo-tab-funnels" class="geo-tab-btn px-4 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all">Funnels</button>""",
  'модалка гео: кнопка вкладки')

rest = sub(rest,
  """      <!-- Creatives tab -->
      <div id="geo-panel-creatives" class="hidden">
        <div id="geo-creative-list" class="space-y-2"></div>
      </div>""",
  """      <!-- Creatives tab -->
      <div id="geo-panel-creatives" class="hidden">
        <div id="geo-creative-list" class="space-y-2"></div>
      </div>
      <!-- Costs tab -->
      <div id="geo-panel-costs">
        <div id="geo-cost-list" class="grid grid-cols-1 lg:grid-cols-2 gap-4"></div>
      </div>""",
  'модалка гео: панель вкладки')

# Малюємо при переході на вкладку, а не при відкритті модалки: чотири
# полотна в прихованій панелі мають нульову ширину і лишились би порожні.
rest = sub(rest,
  """function switchGeoTab(tab) {
  ['funnels','offers','devices','placements','creatives'].forEach(t => {""",
  """function switchGeoTab(tab) {
  if (tab === 'costs' && typeof renderGeoCostTab === 'function')
    setTimeout(() => renderGeoCostTab(window.__geoModalGeo || ''), 0);
  ['funnels','offers','devices','placements','creatives','costs'].forEach(t => {""",
  'модалка гео: перемикач')

# Яке саме гео відкрито, доти ніде не зберігалось
rest = sub(rest,
  """  title.innerText = `${geo.toUpperCase()} Details`;""",
  """  title.innerText = `${geo.toUpperCase()} Details`;
  window.__geoModalGeo = geo;""",
  'модалка гео: запам\'ятати гео')

# Панель Funnels була видимою в розмітці, бо саме вона відкривалась першою.
rest = sub(rest,
  """      <!-- Funnels tab -->
      <div id="geo-panel-funnels">""",
  """      <!-- Funnels tab -->
      <div id="geo-panel-funnels" class="hidden">""",
  'модалка гео: Funnels ховаємо за замовчуванням')

# Порядок навмисне: спершу показати модалку, потім перемкнути вкладку.
# Полотна в display:none мають нульову ширину, і графіки вийшли б порожні.
rest = sub(rest,
  """  // Show modal on funnels tab
  switchGeoTab('funnels');
  modal.classList.remove('hidden');""",
  """  // Show modal on the costs tab
  modal.classList.remove('hidden');
  switchGeoTab('costs');""",
  'модалка гео: відкривається на Costs')

rest = sub(rest,
  '// ===== Geo × Placement (вкладка в Geo Breakdown) =====',
  geomodaljs.strip() + '\n\n// ===== Geo × Placement (вкладка в Geo Breakdown) =====',
  'модалка гео: скрипт')

# ── Geo Breakdown: вкладка Costs ──────────────────────────────────────
# Картка тримає 420px зі скролом — графікам цього мало, тому в режимі
# Costs вішаємо на контейнер клас, який цю межу знімає (правило в design.css).
rest = sub(rest,
  """let dgMode = 'device';   // 'device' | 'placement'
function dgSetMode(m){
  dgMode = m;
  ['device','placement'].forEach(x=>{""",
  """let dgMode = 'device';   // 'device' | 'placement' | 'cost'
function dgSetMode(m){
  dgMode = m;
  const dgBox = document.getElementById('device-geo-content');
  if (dgBox) {
    dgBox.classList.toggle('dg-cost', m === 'cost');
    dgBox.classList.toggle('dg-plc', m === 'placement');
  }
  // Полотна зникнуть разом із innerHTML, а самі Chart-и лишаться живими
  // в Chart.instances і будуть смикатись на кожному resize — гасимо їх тут.
  if (m !== 'cost' && typeof gcDestroy === 'function') gcDestroy();
  ['device','placement','cost'].forEach(x=>{""",
  'ціни по гео: перемикач вкладки')

# Гілку ставимо до перевірки на порожні дані: у режимі Costs порожнечу
# розбирає власний рендер, і повідомлення в ньому точніше.
rest = sub(rest,
  """  if (!crData.length) {
    el.innerHTML = '<div class="col-span-3 text-center py-8 opacity-30 text-xs uppercase font-black">No data in creatives_stats for this month</div>';""",
  """  if (dgMode === 'cost') { renderGeoCostWidget(crData, el); return; }

  if (!crData.length) {
    // Сама назва таблиці нічого не пояснює тому, хто просто відкрив
    // сторінку і бачить порожнечу — кажемо ще й що з цим робити.
    el.innerHTML = '<div class="col-span-3 text-center py-16 text-xs font-black uppercase tracking-widest" style="color:var(--text-muted)">'
      + '<div class="opacity-45">No creative data for this month</div>'
      + '<div class="mt-2 opacity-30 normal-case tracking-normal font-bold">This page is built from creatives_stats. Upload a report in Data Hub &rarr; Campaigns.</div>'
      + '</div>';""",
  'ціни по гео: гілка рендера')

rest = sub(rest,
  '// ===== Geo × Placement (вкладка в Geo Breakdown) =====',
  geocostjs.strip() + '\n\n// ===== Geo × Placement (вкладка в Geo Breakdown) =====',
  'ціни по гео: скрипт')

# ── Report Builder: рядок Total у <tfoot>, щоб липнув до низу ──────────
# У <tbody> він просто їхав за останнім рядком і при довгому списку зникав
# за краєм. У <tfoot> його тримає position:sticky (CSS у design.css).
RB_TOTAL_OLD = """      `<tr class="bg-white/[0.03]">
        <td class="p-3 text-[10px] font-black uppercase text-cyan-400 border-t-2 border-cyan-500/30">Total</td>
        ${cols.map(c=>`<td class="p-3 text-xs font-black text-right text-white border-t-2 border-cyan-500/30">${c.fmt(rbValOf(total,c))}</td>`).join('')}
      </tr></tbody>`;"""
RB_TOTAL_NEW = """      `</tbody><tfoot><tr class="rb-total">
        <td class="p-3 text-[10px] font-black uppercase text-cyan-400 border-t-2 border-cyan-500/30">Total</td>
        ${cols.map(c=>`<td class="p-3 text-xs font-black text-right text-white border-t-2 border-cyan-500/30">${c.fmt(rbValOf(total,c))}</td>`).join('')}
      </tr></tfoot>`;"""

rest = sub(rest,
  "        </tr>`;\n      }).join('')+\n" + RB_TOTAL_OLD,
  "        </tr>`;\n      }).join('')+\n" + RB_TOTAL_NEW,
  'Report Builder: Total у tfoot (дерево)')

rest = sub(rest,
  "      </tr>`;}).join('')+\n" + RB_TOTAL_OLD,
  "      </tr>`;}).join('')+\n" + RB_TOTAL_NEW,
  'Report Builder: Total у tfoot (список)')

rest = sub(rest,
  """    `<tr class="bg-white/[0.03]">
      <td class="p-2.5 text-[10px] font-black uppercase text-cyan-400 border-t-2 border-cyan-500/30">Total</td>""",
  """    `</tbody><tfoot><tr class="rb-total">
      <td class="p-2.5 text-[10px] font-black uppercase text-cyan-400 border-t-2 border-cyan-500/30">Total</td>""",
  'Report Builder: Total у tfoot (півот, початок)')

rest = sub(rest,
  "    </tr></tbody>`;\n}",
  "    </tr></tfoot>`;\n}",
  'Report Builder: Total у tfoot (півот, кінець)')

# ── Унікалізатор: два шляхи до порожнього файлу ────────────────────────
#
# Обидва починаються з uqProbe. Вона читає розміри й тривалість через
# <video> і МОВЧКИ віддає нулі на всьому, чого браузер не декодує — HEVC
# з айфона найперше. Про це попереджає коментар у самому uqBuildArgs, але
# самі аргументи на цей випадок нічого не робили.
#
# 1. meta.w/h == 0 → масштаб не додається зовсім. А кроп і поворот уже
#    стоять, тож після crop=iw*0.9561 сторона виходить яка завгодно, і
#    libx264 із yuv420p відмовляється кодувати непарну. Вихід порожній,
#    за секунду, без жодного слова.
#
# 2. meta.dur == 0 → трим ставить -ss, а -t не ставить (left виходить
#    відʼємним). Перемотка в порожнечу дає той самий порожній файл.
#
# Лікуємо обидва в самих аргументах, бо там є iw/ih — справжні розміри
# з самого потоку, на які проба не впливає взагалі.

rest = sub(rest,
  "  if (p.trim && p.trim.head > 0) args.push('-ss', String(p.trim.head));",
  "  // Трим — лише коли тривалість справді відома. Інакше -ss б'є навмання\n"
  "  // і може перемотати за кінець: файл на виході порожній, і швидко.\n"
  "  const durOK = Number.isFinite(meta.dur) && meta.dur > 0;\n"
  "  if (durOK && p.trim && p.trim.head > 0) args.push('-ss', String(p.trim.head));",
  'унікалізатор: трим лише при відомій тривалості')

rest = sub(rest,
  "  if (p.trim) {\n    const left = meta.dur - p.trim.head - p.trim.tail;",
  "  if (durOK && p.trim) {\n    const left = meta.dur - p.trim.head - p.trim.tail;",
  'унікалізатор: -t теж лише при відомій тривалості')

rest = sub(rest,
  "  if (p.noise) vf.push(`noise=alls=${p.noise}:allf=t+u`);",
  "  // ОСТАННІЙ ЗАПОБІЖНИК ПРО ПАРНІСТЬ СТОРІН.\n"
  "  //\n"
  "  // Вище масштаб додається з чисел проби, а проба вміє мовчки віддати\n"
  "  // нулі. Тоді кроп і поворот лишають сторону якою завгодно, а\n"
  "  // libx264 з yuv420p непарну не кодує — і весь варіант гине порожнім\n"
  "  // файлом. iw/ih беруться з самого потоку, тож цей рядок працює й там,\n"
  "  // де проба не спрацювала.\n"
  "  if (!meta.w || !meta.h) vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');\n"
  "  if (p.noise) vf.push(`noise=alls=${p.noise}:allf=t+u`);",
  'унікалізатор: парні сторони навіть без проби')

# ── Унікалізатор: заміна першого кадру ─────────────────────────────────
import cover as _cov

rest = sub(rest,
  """      <!-- Параметри -->
      <div id="uq-params" class="grid grid-cols-1 md:grid-cols-2 gap-2"></div>""",
  _cov.COVER_HTML + """      <!-- Параметри -->
      <div id="uq-params" class="grid grid-cols-1 md:grid-cols-2 gap-2"></div>""",
  'обкладинка: розмітка')

rest = sub(rest,
  "const uqRand = (a, b) => a + Math.random() * (b - a);",
  _cov.COVER_JS + "const uqRand = (a, b) => a + Math.random() * (b - a);",
  'обкладинка: стан і хендлери')

# Другий вхід оголошуємо одразу після першого: якщо -i cover стане ПІСЛЯ
# -t, той -t прочитається як опція цього входу, а не вихідного файлу.
rest = sub(rest,
  """  args.push('-i', 'in.mp4');
  if (durOK && p.trim) {""",
  """  args.push('-i', 'in.mp4');
  if (cover) args.push('-i', 'cover.' + cover.ext);
  if (durOK && p.trim) {""",
  'обкладинка: другий вхід')

rest = sub(rest,
  "function uqBuildArgs(p, meta, quality, metaMode, preset) {",
  "function uqBuildArgs(p, meta, quality, metaMode, preset, cover) {",
  'обкладинка: аргумент')

rest = sub(rest,
  """  if (vf.length) args.push('-vf', vf.join(','));
  if (p.volume) args.push('-af', `volume=${p.volume}dB`);""",
  """  // Обкладинка лягає ПІСЛЯ всього ланцюжка — щоб на неї не потрапили зерно
  // й кольорові зсуви: перший кадр має бути рівно тією картинкою, яку дали.
  //
  // scale2ref бере розмір із самого відео, а не з проби. Проба (uqProbe)
  // читає розміри через <video>, і вона мовчки повертає нулі на всьому,
  // чого браузер не декодує — HEVC з айфона, наприклад. Прив'язка до неї
  // означала б, що обкладинка іноді просто зникає без жодного слова.
  //
  // force_original_aspect_ratio=increase + центрування: картинка гарантовано
  // не менша за кадр, а зайве overlay просто зрізає. Так у кадрі не буває
  // чорних полів, хоч би яких пропорцій була картинка.
  // eof_action=repeat: у картинки один кадр, без цього вона зникла б одразу.
  if (cover) {
    // -ss перед -i перемотує, але НЕ обнуляє часові мітки: у фільтр кадри
    // заходять із t, що починається з величини перемотки, а не з нуля.
    // Тому поріг рахуємо від неї, інакше умова хибна з першого ж кадру.
    const coverFrom = (p.trim && p.trim.head > 0) ? p.trim.head : 0;
    const coverTill = (coverFrom + cover.dur).toFixed(3);
    args.push('-filter_complex',
      `[0:v]${vf.join(',')}[vf];` +
      `[1:v][vf]scale2ref=w=iw:h=ih:force_original_aspect_ratio=increase[c][v];` +
      `[c]setsar=1[cc];` +
      `[v][cc]overlay=(W-w)/2:(H-h)/2:eof_action=repeat:enable='lt(t,${coverTill})'[vout]`,
      '-map', '[vout]', '-map', '0:a?');
  } else if (vf.length) {
    args.push('-vf', vf.join(','));
  }
  if (p.volume) args.push('-af', `volume=${p.volume}dB`);""",
  'обкладинка: накладання в тому ж проході')

# Запис картинки у файлову систему кожної копії ffmpeg
rest = sub(rest,
  """        srcBuf = await file.arrayBuffer();
        await ff.writeFile('in.mp4', new Uint8Array(srcBuf.slice(0)));""",
  """        srcBuf = await file.arrayBuffer();
        await ff.writeFile('in.mp4', new Uint8Array(srcBuf.slice(0)));
        await uqWriteCover(ff);""",
  'обкладинка: запис у першу копію')

rest = sub(rest,
  """          const ffw = await uqNewFFmpeg();
          await ffw.writeFile('in.mp4', new Uint8Array(srcBuf.slice(0)));""",
  """          const ffw = await uqNewFFmpeg();
          await ffw.writeFile('in.mp4', new Uint8Array(srcBuf.slice(0)));
          await uqWriteCover(ffw);""",
  'обкладинка: запис у додаткові копії')

rest = sub(rest,
  "  const metaMode = (document.getElementById('uq-meta') || {}).value || 'fake';",
  "  const metaMode = (document.getElementById('uq-meta') || {}).value || 'fake';\n"
  "  // Знімок налаштувань обкладинки на весь прогін: якщо її поміняти\n"
  "  // посеред черги, половина варіантів вийшла б з іншим кадром.\n"
  "  const coverArg = uqCover ? { ext: uqCover.ext, dur: uqCoverDur() } : null;",
  'обкладинка: знімок на прогін')

rest = sub(rest,
  "            await ffw.exec(uqBuildArgs(p, meta, quality, metaMode, preset));",
  "            if (ffw.__log) ffw.__log.length = 0;\n"
  "            const code = await ffw.exec(uqBuildArgs(p, meta, quality, metaMode, preset, coverArg));\n"
  "            // Порожній файл — це не результат. Нижня межа груба навмисно:\n"
  "            // валідний mp4 навіть на секунду важить кілограми цього.\n"
  "            let data = null;\n"
  "            try { data = await ffw.readFile('out.mp4'); } catch (e) {}\n"
  "            if (code !== 0 || !data || data.length < 1024)\n"
  "              throw uqWhy(ffw, code, data);",
  'обкладинка: передаємо у виклик + код виходу й розмір')

# Стара пара «exec; readFile» більше не потрібна: readFile тепер усередині
# перевірки вище, і другий виклик забрав би файл, якого вже немає.
rest = sub(rest,
  "            const data = await ffw.readFile('out.mp4');\n            const took",
  "            const took",
  'унікалізатор: readFile лише один раз')

# Після завантаження даних перемальовуємо парк кабінетів — там половина
# колонок рахується з daily_stats, якого на момент першого рендера ще немає.
# Гачків два, і форма виклику в них різна, тож і якір окремий для кожного.
_cab_tail = ("\n  if (typeof cabRefresh === 'function') cabRefresh();"
             "\n  if (typeof evBoot === 'function') evBoot();")
_anchor_1 = "  if (typeof renderDeviceGeoWidget === 'function') renderDeviceGeoWidget();"
_anchor_2 = ("  if (typeof renderDeviceGeoWidget === 'function') {\n"
             "    renderDeviceGeoWidget();\n  }")
rest = sub(rest, _anchor_1, _anchor_1 + _cab_tail, 'кабінети: гачок перемальовки 1')
rest = sub(rest, _anchor_2, _anchor_2 + _cab_tail, 'кабінети: гачок перемальовки 2')

# ── Телеграм: налаштування ─────────────────────────────────────────────
rest = sub(rest,
  """  // Load TL access toggles — джерелом правди є Supabase, localStorage лише як миттєвий fallback
  loadTeamLeadToggles();
}""",
  """  // Load TL access toggles — джерелом правди є Supabase, localStorage лише як миттєвий fallback
  loadTeamLeadToggles();
  if (typeof loadTelegramSettings === 'function') loadTelegramSettings();
  if (typeof setSubTabInit === 'function') setSubTabInit();
  if (typeof fbLoad === 'function') fbLoad();
  if (typeof fbPaceLoad === 'function') fbPaceLoad();
  if (typeof fcLoadAutoHide === 'function') fcLoadAutoHide();
}""",
  'Телеграм і токени FB: підвантаження при відкритті налаштувань')

i = rest.rindex('</body>')
rest = rest[:i] + '<script>\n' + tgjs.strip() + '\n</script>\n\n' + rest[i:]

# Токени Facebook — окремим скриптом: він нічого не експортує в решту
# коду, лише свої window.fb* для розмітки налаштувань.
i = rest.rindex('</body>')
rest = rest[:i] + '<script>\n' + fbjs.strip() + '\n</script>\n\n' + rest[i:]

# Експорт звіту кабінета. Кличеться з панелі кабінета, але лише в момент
# малювання, тож порядок зі скриптом кабінетів ролі не грає.
i = rest.rindex('</body>')
rest = rest[:i] + '<script>\n' + repjs.strip() + '\n</script>\n\n' + rest[i:]

# Сторінки, з яких крутять. Малюється з cabRender, тож має бути
# оголошене до нього — але кличеться лише в момент малювання.
i = rest.rindex('</body>')
rest = rest[:i] + '<script>\n' + pagejs.strip() + '\n</script>\n\n' + rest[i:]

# Модерація коментарів — там само, де експорт, і з тих самих причин.
i = rest.rindex('</body>')
rest = rest[:i] + '<script>\n' + comjs.strip() + '\n</script>\n\n' + rest[i:]

# Скрипт кабінетів — до віджетів: роутер у widgets.js кличе cabInit.
i = rest.rindex('</body>')
rest = rest[:i] + '<script>\n' + cabjs.strip() + '\n</script>\n\n' + rest[i:]

# Журнал змін. Спирається на cabFacts/cabStateOf із кабінетів, але лише у
# момент виклику, тож порядок скриптів тут ролі не грає.
i = rest.rindex('</body>')
rest = rest[:i] + '<script>\n' + evjs.strip() + '\n</script>\n\n' + rest[i:]

# Домени — окрема сторінка, роутер кличе dmInit.
i = rest.rindex('</body>')
rest = rest[:i] + '<script>\n' + dmjs.strip() + '\n</script>\n\n' + rest[i:]

# ── унікалізатор статики: друга половина того самого Uniqueizer'а ──
#
# Окремою сторінкою в меню це було зайвим пунктом про ту саму задачу:
# відео вже жило у своєму вікні. Тепер там два режими, і заодно зникла
# колізія id: у моєї сторінки був свій uq-files, а старий відеорежим
# читав через getElementById саме його — тобто мовчки ламався.
rest = sub(rest,
  '<p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">'
  'Відео \u00b7 обробка в браузері, файли нікуди не йдуть</p>',
  '<p id="uq-sub" class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">'
  'Відео \u00b7 обробка в браузері, файли нікуди не йдуть</p>',
  'Uniqueizer: підзаголовок отримує id')

rest = sub(rest,
  '''      <div>
        <label class="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Відеофайли</label>''',
  '''      <div class="uq-tabs">
        <button type="button" id="uq-tab-video" class="uq-tab is-on" onclick="uqMode('video')">Відео</button>
        <button type="button" id="uq-tab-image" class="uq-tab" onclick="uqMode('image')">Зображення</button>
      </div>

''' + uqhtml.rstrip() + '''

      <div id="uq-pane" class="space-y-5">
      <div>
        <label class="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Відеофайли</label>''',
  'Uniqueizer: перемикач режимів і панель зображень')

rest = sub(rest,
  '''      <div id="uq-results"></div>
    </div>''',
  '''      <div id="uq-results"></div>
      </div>
    </div>''',
  'Uniqueizer: закриваємо панель відео')

i = rest.rindex('</body>')
rest = rest[:i] + uqjs.strip() + '\n\n' + rest[i:]

# ── правила автоматичного вимикання: редактор і журнал ──
i = rest.rindex('</body>')
rest = rest[:i] + rljs.strip() + '\n\n' + rest[i:]

# ── що всередині кабінета: кампанії й оголошення з числами ──
i = rest.rindex('</body>')
rest = rest[:i] + cdjs.strip() + '\n\n' + rest[i:]

# ── сторінка тімліда ──
i = rest.rindex('</body>')
rest = rest[:i] + tmjs.strip() + '\n\n' + rest[i:]

# ── Files у доці ──────────────────────────────────────────────────────
# Іконка для кнопки, яку ми додали в шапку вище: док збирає її разом із
# рештою (buildDock), а без свого рядка вона лишилась би з початковою
# розміткою й у ряду однакових іконок виглядала б чужою.
rest = sub(rest,
  """    users:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',""",
  """    users:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    folder:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',""",
  'файли: іконка дока')

rest = sub(rest,
  """    [/^accounts$/i,'users'], [/uniqueizer/i,'film'], [/^texts$/i,'text'], [/settings/i,'settings'], [/вийти|logout/i,'logout']""",
  """    [/^accounts$/i,'users'], [/uniqueizer/i,'film'], [/^texts$/i,'text'], [/^files$/i,'folder'],
    [/settings/i,'settings'], [/вийти|logout/i,'logout']""",
  'файли: іконка за назвою')

# ── CSV на імпорт: кирилиця ──
# readAsText без кодування читає файл як UTF-8. Keitaro так і віддає, але
# варто комусь перезберегти вивантаження в Excel — і заголовки «інстал» та
# «реєстр» перестають збігатись, тихо, без жодної помилки. Тому читаємо
# байти й розбираємо тим самим розбирачем, що й перегляд файлів.
rest = sub(rest,
  """  const reader = new FileReader();
  reader.onload = ev => { dcParse(ev.target.result); };
  reader.readAsText(file);""",
  """  const reader = new FileReader();
  reader.onload = ev => {
    const buf = ev.target.result;
    dcParse(typeof flDecode === 'function'
      ? flDecode(buf) : new TextDecoder('utf-8').decode(buf));
  };
  reader.readAsArrayBuffer(file);""",
  'CSV: читати байтами')

# ── файли: модалка з розміткою і її скрипт ──
# Вікно, як Accounts, а не маршрут: по файл заходять між справами, і
# сторінка під ногами мінятись не повинна.
i = rest.rindex('</body>')
rest = rest[:i] + flhtml.rstrip() + '\n\n' + fljs.strip() + '\n\n' + rest[i:]



# ── Accounts: типовий фільтр «активні» + кеш між відкриттями ───────────
rest = sub(rest,
  """let accRows = [];
let accHasStatusCol = true;""",
  """let accRows = [];
let accTeam = '';          // для якої команди лежить кеш
let accHasStatusCol = true;""",
  'Accounts: памʼять про команду кешу')

# Типово показуємо робочі кабінети. Їх десятки, і серед них губляться ті,
# з якими справді працюєш; бани й проблеми — на відстані одного кліку по
# плитці, яка й так є фільтром.
rest = sub(rest,
  """// Фільтр по статусу живе прямо на плитках з лічильниками: цифра і кнопка —
// це одне й те саме, тож не додаємо ще один селект у й без того щільну шапку.
let accFilter = '';""",
  """// Фільтр по статусу живе прямо на плитках з лічильниками: цифра і кнопка —
// це одне й те саме, тож не додаємо ще один селект у й без того щільну шапку.
// Типово стоїть «active»: кабінетів десятки, і серед мертвих губляться ті,
// з якими працюєш. Бани й проблеми — один клік по своїй плитці.
const ACC_FILTER_DEFAULT = 'active';
let accFilter = ACC_FILTER_DEFAULT;""",
  'Accounts: типовий фільтр active')

rest = sub(rest,
  """async function openAccountsModal() {
  document.getElementById('accounts-modal').classList.remove('hidden');
  accFilter = '';
  const body = document.getElementById('accounts-modal-body');
  body.innerHTML = '<p class="text-center opacity-40 py-16 text-xs font-black uppercase tracking-widest">Завантаження…</p>';
  try {
    accRows = await sbFetchAll('accounts_mapping',
      q => q.eq('team_name', currentTeam).order('account_id', { ascending: true }));
    accHasStatusCol = !accRows.length || 'status' in accRows[0];
  } catch (e) {
    body.innerHTML = `<p class="text-center text-rose-400 py-16 text-xs font-bold">Помилка: ${e.message}</p>`;
    return;
  }
  renderAccountsModal();
}""",
  """async function openAccountsModal() {
  document.getElementById('accounts-modal').classList.remove('hidden');
  accFilter = ACC_FILTER_DEFAULT;
  const body = document.getElementById('accounts-modal-body');

  // Уже завантажене показуємо одразу, а свіже тягнемо фоном. Раніше кожне
  // відкриття впиралось у повний запит до бази, і на сотні кабінетів вікно
  // просто висіло на «Завантаження…» щоразу.
  const cached = accRows.length && accTeam === currentTeam;
  if (cached) renderAccountsModal();
  else body.innerHTML = '<p class="text-center opacity-40 py-16 text-xs font-black uppercase tracking-widest">Завантаження…</p>';

  try {
    accRows = await sbFetchAll('accounts_mapping',
      q => q.eq('team_name', currentTeam).order('account_id', { ascending: true }));
    accTeam = currentTeam;
    accHasStatusCol = !accRows.length || 'status' in accRows[0];
  } catch (e) {
    // З кешем на екрані помилка фонового оновлення не має стирати список —
    // краще трохи застарілі дані, ніж порожнє вікно.
    if (!cached) body.innerHTML = `<p class="text-center text-rose-400 py-16 text-xs font-bold">Помилка: ${e.message}</p>`;
    return;
  }
  renderAccountsModal();
}""",
  'Accounts: кеш і фоновe оновлення')

# віджети — останнім скриптом перед закриттям body
i = rest.rindex('</body>')
rest = rest[:i] + widgets + '\n' + rest[i:]

out.append(rest)

# ─────────── інтерфейс англійською ───────────
# Найдовші фрази першими, щоб коротші не рвали вже перекладені.
import i18n, re as _re
doc = '\n'.join(out)
# Короткі ключі замінюємо ТІЛЬКИ як цілі слова. Без цього «час» перетворював
# «одночасно» на «одноtimeно», а «країн» робило з «українські» — «уcountriesські».
# Довгі фрази однозначні самі по собі, там достатньо звичайної заміни.
for ua, en in sorted(i18n.LONG.items(), key=lambda kv: -len(kv[0])):
    if len(ua) <= 6:
        doc = _re.sub(r'(?<!\w)' + _re.escape(ua) + r'(?!\w)', en.replace('\\', '\\\\'), doc)
    else:
        doc = doc.replace(ua, en)
for ua, en in i18n.SHORT.items():
    for a, b in ((f'>{ua}<', f'>{en}<'), (f'"{ua}"', f'"{en}"'), (f"'{ua}'", f"'{en}'")):
        doc = doc.replace(a, b)

# Штамп збірки. Підставляється в останню мить, щоб потрапив і в сайдбар,
# і в <meta> — друге видно прямо у view-source, без відкривання сторінки.
import datetime as _dt
_stamp = _dt.datetime.now().strftime('build %d.%m %H:%M')
if doc.count('BUILD__STAMP__') != 1:
    sys.exit(f'штамп збірки: знайдено {doc.count("BUILD__STAMP__")} місць замість 1')
doc = doc.replace('BUILD__STAMP__', _stamp)
doc = doc.replace('<head>', '<head>\n  <meta name="build" content="' + _stamp + '">', 1)

open(OUT, 'w', encoding='utf-8').write(doc)
# Поруч кладемо той самий штамп окремим файлом: сторінка читає його повз
# кеш і так дізнається, що сама застаріла.
open(os.path.join(ROOT, 'build.txt'), 'w', encoding='utf-8').write(_stamp + '\n')
print('OK →', OUT)
