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
  let ownName = null, ownPlayer = null, selfMode = null, displayedMode = null, unit = 'yar', displayed = null;
  const win = root.ownerDocument.defaultView;
  const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const motionPreference = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const cache = new Map(), pending = new Map();
  const freshness = 15000;
  let mode = 'overall', sequence = 0, destroyed = false, indicatorFrame = null;
  let motionFrame = null, motionItems = [];

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

  // Magic UI Number Ticker / Hyper Text adapted to one shared frame loop. The
  // real text never changes: a visual-only pseudo-element preserves accessible
  // names, selection/highlighting and column widths while the effect runs.
  const clock = () => win.performance.now();
  function clearMotion() {
    if (motionFrame !== null) win.cancelAnimationFrame(motionFrame);
    motionFrame = null;
    for (const item of motionItems) { item.el.classList.remove('rating-animating'); delete item.el.dataset.animated; }
    motionItems = [];
  }
  function animateItems(items) {
    if (!win.requestAnimationFrame || motionPreference?.matches) return;
    const start = clock(), duration = 800;
    // Read all geometry before writes; animate only the rows on screen, so a
    // large leaderboard doesn't update hundreds of hidden nodes each frame.
    const visible = items.filter(item => {
      if (!item.el || item.value == null) return false;
      const rect = item.el.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < win.innerHeight && rect.right > 0 && rect.left < win.innerWidth;
    });
    for (const item of visible) {
      if (!item.el || item.value == null) continue;
      item.el.classList.add('rating-animating');
      motionItems.push({ ...item, start, duration });
      item.el.dataset.animated = item.type === 'score' ? number.format(0) : String(item.value).replace(/[^\s]/gu, 'X');
    }
    if (!motionItems.length || motionFrame !== null) return;
    const tick = timestamp => {
      motionFrame = null;
      if (destroyed) { clearMotion(); return; }
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      motionItems = motionItems.filter(item => {
        if (!item.el.isConnected || timestamp >= item.start + item.duration) {
          item.el.classList.remove('rating-animating'); delete item.el.dataset.animated; return false;
        }
        const progress = Math.max(0, Math.min(1, (timestamp - item.start) / item.duration));
        if (item.type === 'score') item.el.dataset.animated = number.format(Number(item.value) * (1 - Math.exp(-5 * progress)) / (1 - Math.exp(-5)));
        else {
          const chars = [...String(item.value)], unlocked = progress * chars.length;
          item.el.dataset.animated = chars.map((char, i) => i <= unlocked || /\s/u.test(char) ? char : alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
        }
        return true;
      });
      if (motionItems.length) motionFrame = win.requestAnimationFrame(tick);
    };
    motionFrame = win.requestAnimationFrame(tick);
  }
  function beginMotion() { clearMotion(); }
  const onMotionPreferenceChange = () => { if (motionPreference?.matches) { clearMotion(); } };
  motionPreference?.addEventListener?.('change', onMotionPreferenceChange);

  function render(data, animate = false) {
    displayed = data;
    const fragment = root.ownerDocument.createDocumentFragment(), animated = [];
    for (const [index, player] of data.slice(0,100).entries()) {
      const row = root.ownerDocument.createElement('li'); row.className = 'rating-row';
      if (ownName && player.username === ownName) row.classList.add('rating-row-self');
      const place = root.ownerDocument.createElement('span'); place.className='rating-place'; place.textContent = String(index + 1);
      const person = root.ownerDocument.createElement('span'); person.className='rating-person';
      const avatar = root.ownerDocument.createElement('img'); avatar.className='rating-avatar'; avatar.alt=''; avatar.src='/pieces/cburnett/wP.svg';
      const name = root.ownerDocument.createElement('span'); name.className='rating-player'; name.textContent = String(player.username ?? ''); person.append(avatar,name);
      const score = root.ownerDocument.createElement('span'); score.className='rating-score'; score.textContent = formatScore(player);
      row.append(place,person,score); fragment.append(row);
      if (animate) { animated.push({el:name,type:'name',value:player.username ?? ''}, {el:score,type:'score',value:player[unit]}); }
    }
    list.replaceChildren(fragment);
    if (animate) animateItems(animated);
    void loadAvatars(data);
    status.hidden = data.length > 0;
    status.textContent = data.length ? '' : 'Пока нет игроков';
  }

  let avatarRequest = 0;
  async function loadAvatars(data) {
    const request=++avatarRequest, names=[...new Set(data.map(p=>p.username).filter(name=>typeof name==='string'))].slice(0,100);
    if (!names.length) return;
    try {
      const {data:avatars,error}=await client.rpc('profile_avatars',{p_names:names});
      if(error||!Array.isArray(avatars)||destroyed||request!==avatarRequest) return;
      const images=new Map(avatars.filter(a=>typeof a.avatar==='string'&&a.avatar.startsWith('data:image/png;base64,')).map(a=>[a.username,a.avatar]));
      for(const row of list.children) { const name=row.querySelector('.rating-player')?.textContent, img=row.querySelector('.rating-avatar'); if(img&&images.has(name)) {img.src=images.get(name);img.classList.add('has-custom-avatar');} }
      const own=self?.querySelector('.rating-avatar'); if(own&&images.has(ownName)) {own.src=images.get(ownName);own.classList.add('has-custom-avatar');}
    } catch { /* Ranking remains available if images cannot load. */ }
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
    try {
      const { data, error } = await client.rpc('rank_my_position', { p_mode:requestedMode });
      if (destroyed || request !== sequence) return;
      if (error || !Array.isArray(data) || !data[0]) { if (selfMode !== requestedMode) self.hidden = true; return; }
      const player = data[0]; ownName = player.username; ownPlayer = player; selfMode = requestedMode;
      self.querySelector('.rating-self-place').textContent = player.place != null ? String(player.place) : '—';
      self.querySelector('.rating-self-name').textContent = String(player.username ?? '');
      self.querySelector('.rating-self-score').textContent = formatScore(player);
      self.hidden = false;
      {
        void client.rpc('profile_avatars',{p_names:[ownName]}).then(({data})=>{if(!destroyed&&request===sequence&&data?.[0]?.avatar?.startsWith('data:image/png;base64,')){const image=self.querySelector('.rating-avatar'); if(image){image.src=data[0].avatar;image.classList.add('has-custom-avatar');}}}).catch(()=>{});
      }
      animateItems([{el:self.querySelector('.rating-self-name'),type:'name',value:player.username ?? ''}, {el:self.querySelector('.rating-self-score'),type:'score',value:player[unit]}]);
      for (const row of list.children) row.classList.toggle('rating-row-self', row.querySelector('.rating-player')?.textContent === ownName);
    } catch { if (!destroyed && request === sequence && selfMode !== requestedMode) self.hidden = true; }
  }
  async function refresh({ force = false } = {}) {
    beginMotion();
    const request = ++sequence, requestedMode = mode;
    const cached = cache.get(requestedMode);
    void refreshSelf(requestedMode, request);
    retry.hidden = true;
    if (cached && !(force && displayedMode === requestedMode && displayed === cached.data)) { render(cached.data, true); displayedMode = requestedMode; }
    if (!force && cached && Date.now() - cached.at < freshness) {
      board.setAttribute('aria-busy','false');
      return;
    }
    board.setAttribute('aria-busy','true');
    // Keep the previous rows in place while another mode loads instead of
    // collapsing and expanding the board. They are replaced atomically.
    if (!cached && !displayed) { status.hidden = false; status.textContent = 'Загрузка…'; }
    try {
      const data = await fetchMode(requestedMode);
      if (destroyed || request !== sequence) return;
      // A stale cache refresh must not replace identical rows after their
      // entrance animation has started (which causes an obvious flash).
      if (!cached || JSON.stringify(data) !== JSON.stringify(cached.data)) {
        if (cached) clearMotion();
        render(data, !cached); displayedMode = requestedMode;
      } else {
        displayed = data; displayedMode = requestedMode;
        status.hidden = data.length > 0;
        status.textContent = data.length ? '' : 'Пока нет игроков';
      }
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
    invalidate() { cache.clear(); avatarRequest++; },
    setUnit(value) {
      const next = value === 'elo' ? 'elo' : 'yar';
      if (unit === next) return;
      clearMotion(); unit = next;
      const label = root.querySelector('.rating-unit'); if (label) label.textContent = unit === 'elo' ? 'ЭЛО' : 'ЯР';
      if (displayed) render(displayed);
      if (ownPlayer && self && !self.hidden) self.querySelector('.rating-self-score').textContent = formatScore(ownPlayer);
    },
    show() {
      root.classList.remove('rating-enter'); void root.offsetWidth; root.classList.add('rating-enter');
      scheduleIndicator();
      void refresh();
    },
    hide() { clearMotion(); },
    destroy() {
      destroyed = true; clearMotion(); sequence++;
      root.removeEventListener('click', onClick);
      win.removeEventListener('resize', scheduleIndicator);
      motionPreference?.removeEventListener?.('change', onMotionPreferenceChange);
      if (indicatorFrame !== null) win.cancelAnimationFrame(indicatorFrame);
      for (const { controller } of pending.values()) controller.abort();
      cache.clear();
    },
  };
}
