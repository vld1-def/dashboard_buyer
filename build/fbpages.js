/* ═══════════ СТОРІНКИ, З ЯКИХ КРУТЯТЬ ═══════════

   Номер Сторінки зашитий у кожному оголошенні (effective_object_story_id
   має вигляд {page_id}_{post_id}), тож імпорт бере його безкоштовно — з
   тієї самої відповіді, що й статуси.

   Окремим списком це не жило: питання «які в мене взагалі Сторінки»
   ніхто не ставить, а місце під нього йшло чимале. Питання, яке
   ставлять насправді, звучить інакше — «а ЦЕЙ кабінет з якої Сторінки
   крутить і чи можу я там прибрати коментар». Воно прив'язане до
   кабінета, тож і відповідь живе в його картці.

   Друга половина відповіді — доступ. Крутити з чужої Сторінки Facebook
   дозволяє, модерувати — ні, і дізнаватись про це в мить, коли під
   оголошенням уже висить спам, пізно. */

let fpRows = [], fpErr = '';

const fpEsc = v => String(v == null ? '' : v)
  .replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const FP_NO_TABLE = /relation .* does not exist|42P01/i;

async function fpLoad() {
  fpErr = '';
  try {
    const res = await sb.from('fb_cabinet_pages')
      .select('account_id,page_id,page_name,can_moderate,ads,posts,team_name');
    if (res.error) throw res.error;
    /* Команду відсіюємо тут, а не запитом: RLS і так віддає лише свої
       рядки, а team_name у токена буває порожнім — фільтр у запиті
       сховав би тоді геть усе. Те саме правило, що й у кабінетах. */
    fpRows = (res.data || []).filter(r => !r.team_name || r.team_name === currentTeam);
  } catch (e) {
    fpRows = [];
    fpErr = FP_NO_TABLE.test(e.message || '') ? 'not-set-up' : (e.message || 'error');
  }
}

/* Сторінки ОДНОГО кабінета — рядком у його картці. Малюється з
   cabDetail. Зазвичай їх одна-дві, тому список, а не сітка. */
function fpForCab(c) {
  if (!c || !c.fb) return '';

  if (fpErr === 'not-set-up')
    return `<p class="cab-pg-note">Pages: run the <span class="font-mono">fb_cabinet_pages</span>
      block from <span class="font-mono">FB_SYNC.sql</span> and redeploy
      <span class="font-mono">fb-sync</span> to see them here.</p>`;
  if (fpErr) return '';

  const id = String(c.fb.account_id);
  const mine = fpRows.filter(r => String(r.account_id) === id);
  if (!mine.length) return '';

  /* Спершу ті, де прибирати коментарі МОЖНА: з ними працюєш, а решта —
     до відома. За рівних прав попереду та, з якої крутять більше. */
  mine.sort((a, b) => (b.can_moderate ? 1 : 0) - (a.can_moderate ? 1 : 0)
                   || (Number(b.ads) || 0) - (Number(a.ads) || 0));

  const row = r => `<a class="cab-pg ${r.can_moderate ? '' : 'is-closed'}"
      href="https://facebook.com/${fpEsc(r.page_id)}" target="_blank" rel="noopener"
      title="${r.can_moderate
        ? 'You can hide and delete comments under this Page'
        : 'The token does not have this Page, so comments under it cannot be touched from here'} · ${
        fpEsc(r.page_id)}">
      <span class="cab-pg-name">${fpEsc(r.page_name || '#' + r.page_id)}</span>
      <span class="cab-pg-tag">${r.can_moderate ? '' : 'no access'}</span>
      <span class="cab-pg-go">&#8599;</span></a>`;

  return `<div class="cab-pg-wrap">
    <p class="cab-fb-head">Page${mine.length > 1 ? 's' : ''}<span>${
      mine.reduce((a, r) => a + (Number(r.ads) || 0), 0)} ad(s)</span></p>
    ${mine.map(row).join('')}</div>`;
}
