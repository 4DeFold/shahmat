// Animata's Fluid Tabs, adapted to native buttons without React or animation dependencies.
// Only nicknames and scores are returned; player text is never interpolated as HTML.
export function createRatingView(root, client, { showSelf = false } = {}) {
  const list = root.querySelector('.rating-list');
  const board = root.querySelector('.rating-board');
  const status = root.querySelector('.rating-status');
  const retry = root.querySelector('.rating-retry');
  const filters = root.querySelector('.rating-filters');
  const indicator = root.querySelector('.rating-indicator');
  const buttons = [...root.querySelectorAll('[data-rating-mode]')];
  const self = root.querySelector('.rating-self');
  let ownName = null, ownPlayer = null, unit = 'yar', displayed = null;
  const win = root.ownerDocument.defaultView;
  const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const cache = new Map(), pending = new Map();
  const freshness = 15000;
  let mode = 'overall', sequence = 0, destroyed = false, indicatorFrame = null;

  function positionIndicator() {
    if (!indicator) return;
    const active = buttons.find(button => button.dataset.ratingMode === mode);
    if (!active || !active.offsetWidth || !active.offsetHeight) return;
    const firstPosition = !indicator.classList.contains('is-ready');
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.height = `${active.offsetHeight}px`;
    indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    if (firstPosition) void indicator.offsetWidth;
    indicator.classList.add('is-ready');
  }
  function scheduleIndicator() {
    if (!win.requestAnimationFrame) { positionIndicator(); return; }
    if (indicatorFrame !== null) win.cancelAnimationFrame(indicatorFrame);
    indicatorFrame = win.requestAnimationFrame(() => { indicatorFrame = null; if (!destroyed) positionIndicator(); });
  }
  win.addEventListener('resize', scheduleIndicator);
  // Fonts can change button sizes after the first paint.
  root.ownerDocument.fonts?.ready.then(() => { if (!destroyed) scheduleIndicator(); });

  function render(data) {
    displayed = data;
    const fragment = root.ownerDocument.createDocumentFragment();
    for (const [index, player] of data.slice(0,100).entries()) {
      const row = root.ownerDocument.createElement('li'); row.className = 'rating-row';
      if (ownName && player.username === ownName) row.classList.add('rating-row-self');
      if (index < 12) { row.classList.add('rating-row-reveal'); row.style.setProperty('--row', String(index)); }
      const place = root.ownerDocument.createElement('span'); place.className='rating-place'; place.textContent = player.ranked ? String(index + 1) : '—';
      const name = root.ownerDocument.createElement('span'); name.className='rating-player'; name.textContent = String(player.username ?? '');
      const score = root.ownerDocument.createElement('span'); score.className='rating-score'; score.textContent = formatScore(player);
      row.append(place,name,score); fragment.append(row);
    }
    list.replaceChildren(fragment);
    status.hidden = data.length > 0;
    status.textContent = data.length ? '' : 'Пока нет игроков';
  }

  function formatScore(player) { return player?.[unit] == null ? '—' : number.format(Number(player[unit])); }
  function fetchMode(requestedMode) {
    if (pending.has(requestedMode)) return pending.get(requestedMode).promise;
    const controller = new AbortController();
    let timer;
    const promise = (async () => {
      try {
        // Install the in-flight entry before a client can synchronously throw.
        await Promise.resolve();
        const call = client.rpc('rank_leaderboard', { p_mode:requestedMode });
        const query = typeof call?.abortSignal === 'function' ? call.abortSignal(controller.signal) : call;
        const timeout = new Promise((_, reject) => {
          timer = win.setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 10000);
        });
        const { data, error } = await Promise.race([query, timeout]);
        if (error || !Array.isArray(data)) throw error || new Error('Invalid response');
        if (!destroyed) cache.set(requestedMode, { data, at:Date.now() });
        return data;
      } finally {
        win.clearTimeout(timer);
        pending.delete(requestedMode);
      }
    })();
    pending.set(requestedMode, { promise, controller });
    return promise;
  }

  async function refreshSelf(requestedMode, request) {
    if (!showSelf || !self) return;
    self.hidden = true; ownName = null; ownPlayer = null;
    try {
      const { data, error } = await client.rpc('rank_my_position', { p_mode:requestedMode });
      if (error || destroyed || request !== sequence || !Array.isArray(data) || !data[0]) return;
      const player = data[0]; ownName = player.username; ownPlayer = player;
      self.querySelector('.rating-self-place').textContent = player.ranked && player.place != null ? String(player.place) : '—';
      self.querySelector('.rating-self-name').textContent = String(player.username ?? '');
      self.querySelector('.rating-self-score').textContent = formatScore(player);
      self.hidden = false;
      for (const row of list.children) row.classList.toggle('rating-row-self', row.querySelector('.rating-player')?.textContent === ownName);
    } catch { /* The leaderboard remains usable if the personal row is unavailable. */ }
  }
  async function refresh({ force = false } = {}) {
    const request = ++sequence, requestedMode = mode;
    const cached = cache.get(requestedMode);
    void refreshSelf(requestedMode, request);
    retry.hidden = true;
    if (cached) render(cached.data);
    if (!force && cached && Date.now() - cached.at < freshness) {
      board.setAttribute('aria-busy','false');
      return;
    }
    board.setAttribute('aria-busy','true');
    if (!cached) { list.replaceChildren(); displayed = null; }
    status.hidden = false; status.textContent = 'Загрузка…';
    try {
      const data = await fetchMode(requestedMode);
      if (destroyed || request !== sequence) return;
      render(data);
    } catch {
      if (destroyed || request !== sequence) return;
      status.hidden = false; status.textContent = 'Не удалось загрузить рейтинг'; retry.hidden = false;
    } finally { if (!destroyed && request === sequence) board.setAttribute('aria-busy','false'); }
  }
  function onClick(event) {
    const button = event.target.closest('[data-rating-mode]');
    if (button && root.contains(button)) {
      if (button.dataset.ratingMode === mode) return;
      mode = button.dataset.ratingMode;
      buttons.forEach(item => item.setAttribute('aria-pressed',String(item === button)));
      scheduleIndicator();
      void refresh();
    } else if (event.target.closest('.rating-retry')) void refresh({ force:true });
  }
  root.addEventListener('click', onClick);
  return {
    refresh,
    setUnit(value) {
      unit = value === 'elo' ? 'elo' : 'yar';
      const label = root.querySelector('.rating-unit'); if (label) label.textContent = unit === 'elo' ? 'ЭЛО · справочно' : 'ЯР';
      if (displayed) render(displayed);
      if (ownPlayer && self && !self.hidden) self.querySelector('.rating-self-score').textContent = formatScore(ownPlayer);
    },
    show() {
      root.classList.remove('rating-enter'); void root.offsetWidth; root.classList.add('rating-enter');
      scheduleIndicator();
      void refresh();
    },
    destroy() {
      destroyed = true; sequence++;
      root.removeEventListener('click', onClick);
      win.removeEventListener('resize', scheduleIndicator);
      if (indicatorFrame !== null) win.cancelAnimationFrame(indicatorFrame);
      for (const { controller } of pending.values()) controller.abort();
      cache.clear();
    },
  };
}
