# Методичка CRM для баєра

- `Metodychka_CRM.pdf` — готовий PDF.
- `manual.html` — текст і верстка (редагувати тут).
- `demo.mjs` — стенд: справжня сторінка CRM з демо-даними (роль баєра).
- `shoot.mjs` — знімає скріншоти в `shots/` і координати позначок у `shots/*.json`.
- `annotate.py` — малює номери й стрілки → `shots/a/`.
- `build.mjs` — збирає PDF з `manual.html`.

Оновити після змін у CRM:

```bash
cd build && python3 build.py && cd ../docs/manual
node shoot.mjs && python3 annotate.py  # скріншоти й позначки
node build.mjs                        # PDF
```

Для графіків і Form.html стенду потрібні Chart.js / chartjs-plugin-datalabels (`NM=<шлях до node_modules>`)
і скомпільований під Form.html CSS (`FORM_CSS=<файл>`).
Прапори гео — з пакета flag-icons у тому ж node_modules.
