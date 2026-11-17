// The database exposes only nicknames and scores; never interpolate player text as HTML.
export function createRatingView(root, client) {
  const list = root.querySelector('.rating-list');
  const board = root.querySelector('.rating-board');
  const status = root.querySelector('.rating-status');
  const retry = root.querySelector('.rating-retry');
  const buttons = [...root.querySelectorAll('[data-rating-mode]')];
  let mode = 'overall', sequence = 0;
  const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  async function refresh() {
    const request = ++sequence;
    board.setAttribute('aria-busy','true');
    status.hidden = false; status.textContent = 'Загрузка…'; retry.hidden = true;
    list.replaceChildren();
    try {
      const { data, error } = await client.rpc('yar_leaderboard', { p_mode:mode });
      if (error || !Array.isArray(data)) throw error || new Error('Invalid response');
      if (request !== sequence) return;
      const fragment = root.ownerDocument.createDocumentFragment();
      for (const [index, player] of data.slice(0,100).entries()) {
        const row = root.ownerDocument.createElement('li'); row.className = 'rating-row'; row.style.setProperty('--row', String(index));
        const place = root.ownerDocument.createElement('span'); place.className='rating-place'; place.textContent = player.ranked ? String(index + 1) : '—';
        const name = root.ownerDocument.createElement('span'); name.className='rating-player'; name.textContent = String(player.username ?? '');
        const score = root.ownerDocument.createElement('span'); score.className='rating-score'; score.textContent = number.format(Number(player.yar));
        row.append(place,name,score); fragment.append(row);
      }
      list.replaceChildren(fragment);
      status.hidden = data.length > 0; status.textContent = data.length ? '' : 'Пока нет игроков';
      list.classList.remove('rating-list-enter'); void list.offsetWidth; list.classList.add('rating-list-enter');
    } catch {
      if (request !== sequence) return;
      status.hidden = false; status.textContent = 'Не удалось загрузить рейтинг'; retry.hidden = false;
    } finally { if (request === sequence) board.setAttribute('aria-busy','false'); }
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-rating-mode]');
    if (button && root.contains(button)) {
      if (button.dataset.ratingMode === mode) return;
      mode = button.dataset.ratingMode;
      buttons.forEach(item => item.setAttribute('aria-pressed',String(item === button)));
      void refresh();
    } else if (event.target.closest('.rating-retry')) void refresh();
  });
  return { refresh };
}
