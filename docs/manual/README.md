# Методичка CRM для баєра

- `Metodychka_CRM.pdf` — готовий PDF.
- `manual.html` — текст і верстка (редагувати тут).
- `demo.mjs` — стенд: справжня сторінка CRM з демо-даними; `shots.mjs`, `shots2.mjs` — знімають скріншоти в `shots/`.
- `build.mjs` — збирає PDF з `manual.html`.

Оновити після змін у CRM:

```bash
cd build && python3 build.py && cd ../docs/manual
node shots.mjs && node shots2.mjs     # скріншоти
node build.mjs                        # PDF
```

Для графіків і Form.html стенду потрібні Chart.js / chartjs-plugin-datalabels (`NM=<шлях до node_modules>`)
і скомпільований під Form.html CSS (`FORM_CSS=<файл>`).
Обрізані версії скріншотів (`shots/c/`) робить python-фрагмент в історії комітів; простіше — перезняти й обрізати так само: без бокового меню (300px) і нижньої панелі (128px).
