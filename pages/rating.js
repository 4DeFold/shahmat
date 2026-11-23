import {setPublicPiece} from './piece-theme.js';
import {createProfileCard} from './profile-card.js';
import {profileAvatarColor} from './profile-theme.js';
// Animata's Fluid Tabs, adapted to native buttons without React or animation dependencies.
// Only nicknames and scores are returned; player text is never interpolated as HTML.
export function createRatingView(root, client, { showSelf = false, onOpenProfile = () => {} } = {}) {
  const profileCard = createProfileCard(root,client,onOpenProfile);
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
  const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const motionPreference = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const cache = new Map(), pending = new Map();
  const freshness = 15000;
  let mode = 'overall', sequence = 0, destroyed = false, indicatorFrame = null, onlineNames = null;
  function updateOnlineIndicators() {
    for (const person of root.querySelectorAll('.rating-person')) {
      const name = person.dataset.profileName;
      let dot = person.querySelector('.rating-online');
      const online = !!name && !!onlineNames?.has(name);
      if (online && !dot) { dot = root.ownerDocument.createElement('span'); dot.className = 'rating-online'; dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', 'В сети'); person.append(dot); }
      else if (!online) dot?.remove();
    }
  }
  let motionFrame = null, motionItems = [];
  const visualScores = new WeakMap();

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
    for (const item of motionItems) { if (item.type === 'score') visualScores.set(item.el, Number(item.value)); item.el.classList.remove('rating-animating'); delete item.el.dataset.animated; }
    motionItems = [];
  }
  function stopElement(el) {
    motionItems = motionItems.filter(item => item.el !== el);
    el.classList.remove('rating-animating'); delete el.dataset.animated;
  }
  function animateItems(items) {
    if (!win.requestAnimationFrame || motionPreference?.matches) {
      for (const item of items) if (item.type === 'score') visualScores.set(item.el, Number(item.value));
      return;
    }
    const start = clock(), duration = 800;
    // Read all geometry before writes; animate only the rows on screen, so a
    // large leaderboard doesn't update hundreds of hidden nodes each frame.
    const visible = items.filter(item => {
      if (!item.el || item.value == null) return false;
      const rect = item.el.getBoundingClientRect();
      const onScreen = rect.bottom > 0 && rect.top < win.innerHeight && rect.right > 0 && rect.left < win.innerWidth;
      if (!onScreen && item.type === 'score') visualScores.set(item.el, Number(item.value));
      return onScreen;
    });
    for (const item of visible) {
      if (!item.el || item.value == null) continue;
      item.el.classList.add('rating-animating');
      // Interrupt only this element, continuing from the last displayed value.
      motionItems = motionItems.filter(active => active.el !== item.el);
      const from = item.type === 'score' ? (visualScores.get(item.el) ?? item.from) : null;
      if (item.type === 'score' && (!Number.isFinite(from) || from === Number(item.value))) {
        item.el.classList.remove('rating-animating'); delete item.el.dataset.animated; continue;
      }
      motionItems.push({ ...item, from, start, duration });
      item.el.dataset.animated = item.type === 'score' ? number.format(from) : String(item.value).replace(/[^\s]/gu, 'X');
    }
    if (!motionItems.length || motionFrame !== null) return;
    const tick = timestamp => {
      motionFrame = null;
      if (destroyed) { clearMotion(); return; }
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      motionItems = motionItems.filter(item => {
        if (!item.el.isConnected || timestamp >= item.start + item.duration) {
          if (item.type === 'score') visualScores.set(item.el, Number(item.value));
          item.el.classList.remove('rating-animating'); delete item.el.dataset.animated; return false;
        }
        const progress = Math.max(0, Math.min(1, (timestamp - item.start) / item.duration));
        if (item.type === 'score') {
          // A critically damped spring, matching the Number Ticker's gentle settling.
          const ease = (1 - (1 + 7 * progress) * Math.exp(-7 * progress)) / (1 - 8 * Math.exp(-7));
          const value = item.from + (Number(item.value) - item.from) * ease;
          visualScores.set(item.el, value); item.el.dataset.animated = number.format(value);
        }
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
  function beginMotion() { /* Keep the current visual value until new data arrives. */ }
  const onMotionPreferenceChange = () => { if (motionPreference?.matches) { clearMotion(); } };
  motionPreference?.addEventListener?.('change', onMotionPreferenceChange);

  function render(data, animate = false) {
    const previous = new Map([...list.children].map(row => [row.dataset.profileName, row]));
    // Capture the current visual position, including an interrupted animation.
    const positions = new Map([...previous].map(([name,row]) => [name,row.getBoundingClientRect()]));
    for (const row of previous.values()) row.getAnimations?.().forEach(animation => animation.cancel());
    displayed = data;
    const animated = [], ordered = [], fresh = [];
    for (const [index, player] of data.slice(0,100).entries()) {
      const nameText=String(player.username ?? '');
      let row=previous.get(nameText);
      if (!row) {
        row=root.ownerDocument.createElement('li'); row.className='rating-row'; row.dataset.profileNoHover=''; row.dataset.profileName=nameText;
        const place=root.ownerDocument.createElement('span'); place.className='rating-place';
        const person=root.ownerDocument.createElement('button'); person.type='button'; person.className='rating-person rating-profile-trigger'; person.dataset.profileName=nameText;
        const avatar=root.ownerDocument.createElement('img'); avatar.className='rating-avatar'; avatar.alt=''; avatar.src='/pieces/cburnett/wN.svg';
        const name=root.ownerDocument.createElement('span'); name.className='rating-player'; name.textContent=nameText; person.append(avatar,name);
        const score=root.ownerDocument.createElement('span'); score.className='rating-score'; row.append(place,person,score); fresh.push(row);
        if (animate && !previous.size) animated.push({el:name,type:'name',value:nameText});
      }
      row.classList.toggle('rating-row-self',!!ownName && nameText===ownName);
      row.querySelector('.rating-place').textContent=String(index+1);
      const score = row.querySelector('.rating-score'), value = player[unit] == null ? null : Number(player[unit]);
      const from = visualScores.get(score);
      stopElement(score);
      score.textContent=formatScore(player);
      if (Number.isFinite(value)) {
        if (animate && Number.isFinite(from) && from !== value) animated.push({el:score,type:'score',value,from});
        else { visualScores.set(score,value); }
      } else visualScores.delete(score);
      ordered.push(row);
    }
    // Reordering keeps player elements and avatars; restore focus if a moved row held it.
    const focused=list.contains(root.ownerDocument.activeElement)?root.ownerDocument.activeElement:null;
    for (const row of ordered) list.append(row);
    for (const row of previous.values()) if (!ordered.includes(row)) row.remove();
    if (focused?.isConnected && root.ownerDocument.activeElement!==focused) focused.focus({preventScroll:true});
    if (!motionPreference?.matches) for (const row of ordered) {
      const before=positions.get(row.dataset.profileName), after=row.getBoundingClientRect();
      if (before && row.animate) {
        const dx=before.left-after.left,dy=before.top-after.top;
        if (Math.abs(dx)>.5 || Math.abs(dy)>.5) row.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:600,easing:'cubic-bezier(.22,1,.36,1)'});
      } else if (previous.size && row.animate) row.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:350,easing:'ease-out'});
    }
    updateOnlineIndicators();
    if (animated.length) animateItems(animated);
    void loadAvatars(data);
    status.hidden = data.length > 0;
    status.textContent = data.length ? '' : 'Пока нет игроков';
  }

  let avatarRequest = 0;
  async function loadAvatars(data) {
    const request=++avatarRequest, names=[...new Set(data.map(p=>p.username).filter(name=>typeof name==='string'))].slice(0,100);
    if (!names.length) return;
    try {
      const [{data:avatars,error},{data:themes},{data:sets}]=await Promise.all([client.rpc('profile_avatars',{p_names:names}),Promise.resolve(client.rpc('profile_avatar_themes',{p_names:names})).catch(()=>({data:[]})),Promise.resolve(client.rpc('profile_piece_sets',{p_names:names})).catch(()=>({data:[]}))]);
      if(error||!Array.isArray(avatars)||destroyed||request!==avatarRequest) return;
      const pieceSets=new Map((Array.isArray(sets)?sets:[]).map(p=>[p.username,p.piece_set]));
      const colors=new Map((Array.isArray(themes)?themes:[]).map(p=>[p.username,profileAvatarColor(p.palette)]));
      const images=new Map(avatars.filter(a=>typeof a.avatar==='string'&&/^data:image\/(?:png|jpeg);base64,/.test(a.avatar)).map(a=>[a.username,a.avatar]));
      for(const row of list.children) { const name=row.querySelector('.rating-player')?.textContent, img=row.querySelector('.rating-avatar'); if(img){img.style.backgroundColor=colors.get(name)||profileAvatarColor('monochrome');if(images.has(name)){img.src=images.get(name);img.classList.add('has-custom-avatar');}else{setPublicPiece(img,pieceSets.get(name));img.classList.remove('has-custom-avatar');}} }
      const own=self?.querySelector('.rating-avatar'); if(own)own.style.backgroundColor=colors.get(ownName)||profileAvatarColor('monochrome'); if(own&&images.has(ownName)) {own.src=images.get(ownName);own.classList.add('has-custom-avatar');}else if(own){setPublicPiece(own,pieceSets.get(ownName));own.classList.remove('has-custom-avatar');}
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
      const player = data[0], selfScore = self.querySelector('.rating-self-score'), previousName = ownName; ownName = player.username; self.dataset.profileName=String(player.username ?? ''); self.querySelector('.rating-person').dataset.profileName=String(player.username ?? ''); ownPlayer = player; selfMode = requestedMode;
      self.querySelector('.rating-self-place').textContent = player.place != null ? String(player.place) : '—';
      self.querySelector('.rating-self-name').textContent = String(player.username ?? '');
      const from = previousName === player.username ? visualScores.get(selfScore) : undefined;
      const target = player[unit] == null ? null : Number(player[unit]);
      stopElement(selfScore);
      selfScore.textContent = formatScore(player);
      if (Number.isFinite(target)) { if (!Number.isFinite(from)) visualScores.set(selfScore,target); } else visualScores.delete(selfScore);
      self.hidden = false; updateOnlineIndicators();
      {
        void Promise.all([client.rpc('profile_avatars',{p_names:[ownName]}),client.rpc('profile_avatar_themes',{p_names:[ownName]}),client.rpc('profile_piece_sets',{p_names:[ownName]})]).then(([images,themes,sets])=>{if(destroyed||request!==sequence)return;const image=self.querySelector('.rating-avatar');if(!image)return;image.style.backgroundColor=profileAvatarColor(themes.data?.[0]?.palette);const avatar=images.data?.[0]?.avatar;if(/^data:image\/(?:png|jpeg);base64,/.test(avatar||'')){image.src=avatar;image.classList.add('has-custom-avatar');}else {setPublicPiece(image,sets.data?.[0]?.piece_set);image.classList.remove('has-custom-avatar');}}).catch(()=>{});
      }
      const effects = [];
      if (previousName !== player.username) effects.push({el:self.querySelector('.rating-self-name'),type:'name',value:player.username ?? ''});
      if (Number.isFinite(from) && Number.isFinite(target) && from !== target) effects.push({el:selfScore,type:'score',value:target,from});
      animateItems(effects);
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
    if (!cached && !displayed) { status.hidden = false; status.textContent = ''; status.setAttribute('aria-label','Загрузка'); }
    try {
      const data = await fetchMode(requestedMode);
      if (destroyed || request !== sequence) return;
      // A stale cache refresh must not replace identical rows after their
      // entrance animation has started (which causes an obvious flash).
      if (!cached || JSON.stringify(data) !== JSON.stringify(cached.data)) {
        render(data, true); displayedMode = requestedMode;
      } else {
        displayed = data; displayedMode = requestedMode;
        status.hidden = data.length > 0;
        status.textContent = data.length ? '' : 'Пока нет игроков';
      }
    } catch {
      if (destroyed || request !== sequence) return;
      status.hidden = false; status.textContent = 'Не удалось загрузить рейтинг'; retry.hidden = false;
    } finally { if (!destroyed && request === sequence) { board.setAttribute('aria-busy','false'); status.removeAttribute('aria-label'); } }
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
  function onKey(event) {
    if (root.hidden || root.inert || root.closest('[hidden],[inert]') || !root.isConnected || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || root.ownerDocument.querySelector('dialog[open]') || event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')) return;
    const delta = event.code === 'KeyA' || event.key === 'ArrowLeft' ? -1 : event.code === 'KeyD' || event.key === 'ArrowRight' ? 1 : 0;
    if (!delta) return;
    event.preventDefault(); const index=buttons.findIndex(button=>button.dataset.ratingMode===mode); buttons[(index+delta+buttons.length)%buttons.length].click();
  }
  root.ownerDocument.addEventListener('keydown', onKey);
  root.addEventListener('click', onClick);
  return {
    refresh,
    setOnlineNames(names) { onlineNames = names; updateOnlineIndicators(); },
    invalidate() { cache.clear(); avatarRequest++; },
    setUnit(value) {
      const next = value === 'elo' ? 'elo' : 'yar';
      if (unit === next) return;
      clearMotion(); unit = next;
      for (const el of root.querySelectorAll('.rating-score,.rating-self-score')) visualScores.delete(el);
      const label = root.querySelector('.rating-unit'); if (label) label.textContent = unit === 'elo' ? 'ЭЛО' : 'ЯР';
      if (displayed) render(displayed);
      if (ownPlayer && self && !self.hidden) {
        const score=self.querySelector('.rating-self-score'); score.textContent=formatScore(ownPlayer);
        if (ownPlayer[unit] != null && Number.isFinite(Number(ownPlayer[unit]))) visualScores.set(score,Number(ownPlayer[unit]));
      }
    },
    show() {
      root.classList.remove('rating-enter'); void root.offsetWidth; root.classList.add('rating-enter');
      scheduleIndicator();
      void refresh();
    },
    hide() { clearMotion(); profileCard.hide(); },
    destroy() {
      destroyed = true; clearMotion(); sequence++; profileCard.destroy();
      root.removeEventListener('click', onClick); root.ownerDocument.removeEventListener('keydown', onKey);
      win.removeEventListener('resize', scheduleIndicator);
      motionPreference?.removeEventListener?.('change', onMotionPreferenceChange);
      if (indicatorFrame !== null) win.cancelAnimationFrame(indicatorFrame);
      for (const { controller } of pending.values()) controller.abort();
      cache.clear();
    },
  };
}
