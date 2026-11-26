/* Та сама конфігурація, що стояла в <head> для cdn.tailwindcss.com:
   нейтральна шкала дизайну замість slate/gray/zinc/neutral і шрифти.
   Сканує готовий index.html — у ньому і розмітка, і весь JS із класами. */
const path = require('path');
const n = { 50:'#F7F7F8', 100:'#ECECEF', 200:'#D7D7DD', 300:'#B2B2BC', 400:'#8A8A95', 500:'#6C6C76',
  600:'#53535C', 700:'#38383F', 800:'#222226', 900:'#131316', 950:'#0A0A0C' };
module.exports = {
  darkMode: 'class',
  content: [path.join(__dirname, '..', '..', 'index.html')],
  theme: { extend: {
    fontFamily: {
      sans: ['Inter','ui-sans-serif','system-ui','-apple-system','Segoe UI','sans-serif'],
      mono: ['JetBrains Mono','ui-monospace','SFMono-Regular','monospace']
    },
    colors: { slate: n, gray: n, zinc: n, neutral: n }
  } }
};
