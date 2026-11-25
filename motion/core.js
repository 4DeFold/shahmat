// Shared, framework-free motion engine used by every document of the site.
// Effects are interpretations of React Bits (Click Spark, Magnet, Tilted Card,
// Split/Blur Text, Count Up), Aceternity UI (Card Spotlight, 3D Card), Magic UI
// (Ripple, Confetti, Ping, Shimmer), Animata and Uiverse micro-interactions.
// Everything is delegated (one listener per event type), uses compositor
// properties (scale/translate/rotate/opacity) through the Web Animations API
// so existing CSS transitions are never overwritten, and is disabled under
// prefers-reduced-motion. Nothing here talks to the network or storage.
import './core.css';

const win = window, doc = document;
const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
const fine = win.matchMedia('(hover: hover) and (pointer: fine)');
const EASE = 'cubic-bezier(.22,1,.36,1)';
const SPRING = win.CSS?.supports?.('animation-timing-function', 'linear(0, 1)')
  ? 'linear(0, .009, .035 2.1%, .141 4.4%, .281 6.7%, .723 12.9%, .938 16.7%, 1.017 19.4%, 1.077, 1.121 24%, 1.149 26.3%, 1.159, 1.163 29.6%, 1.154 31.8%, 1.129 34.4%, 1.051 41.2%, 1.017 45.2%, .991 49.2%, .977 53.5%, .975 58.1%, .984 66.3%, .999 79.1%, 1.002 87.4%, 1)'
  : 'cubic-bezier(.34,1.56,.64,1)';
export const motionOK = () => !reduced.matches && typeof doc.documentElement.animate === 'function';
const hoverOK = () => motionOK() && fine.matches;
const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
const themeColor = name => css(doc.documentElement, name) || css(doc.body, name);
const rand = (a, b) => a + Math.random() * (b - a);

// ── Press: tactile scale on every control (Uiverse / Magic UI) ────────────
const PRESS = 'button, a[href], label.palette-option, label.mode-option, .piece-options label, [role=button], summary, .rating-row';
const NO_PRESS = '.square, .board, #play, input, textarea, select, [data-no-press], .bot-shell .orbit-board';
const pressing = new Map();
function pressTarget(node) {
  let el = node?.closest?.(PRESS);
  if (el?.matches('.rating-profile-trigger')) el = el.closest('.rating-row') || el;
  if (!el || el.matches(NO_PRESS) || el.closest('.board') || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}
function pressDown(el) {
  const box = el.getBoundingClientRect(), size = Math.max(box.width, box.height);
  if (!size) return;
  const depth = size > 420 ? .988 : size > 200 ? .975 : size > 90 ? .955 : .92;
  pressing.get(el)?.cancel();
  const animation = el.animate([{ scale: 1 }, { scale: depth }], { duration: 130, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
  pressing.set(el, animation);
}
function pressUp(el) {
  const held = pressing.get(el); if (!held) return;
  pressing.delete(el);
  if (!el.isConnected) { held.cancel(); return; }
  const from = parseFloat(getComputedStyle(el).scale) || 1;
  held.cancel();
  if (from === 1) return;
  el.animate([{ scale: from }, { scale: 1 }], { duration: 520, easing: SPRING });
}

// ── Ripple (Magic UI Ripple Button) drawn in a clipped overlay ────────────
const RIPPLE = 'button:not(.square):not(.text-button):not(.tab):not(.rating-profile-trigger):not(.history-controls button):not(#move-list button), .play-button, .home-actions a, .home-link, .sidebar-item, .account-menu a, a.new-game, label.palette-option, label.mode-option, .piece-option, .rating-row, .rating-self, .lobby-card';
function ripple(el, x, y) {
  const box = el.getBoundingClientRect();
  if (!box.width || !box.height || box.width * box.height > 900 * 700) return;
  const style = getComputedStyle(el), host = doc.createElement('span');
  host.className = 'm-ripple-host'; host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: style.borderRadius, color: style.color });
  const dot = doc.createElement('span'); dot.className = 'm-ripple';
  const radius = Math.hypot(Math.max(x - box.left, box.right - x), Math.max(y - box.top, box.bottom - y));
  Object.assign(dot.style, { left: `${x - box.left}px`, top: `${y - box.top}px`, width: `${radius * 2}px`, height: `${radius * 2}px` });
  host.append(dot); doc.body.append(host);
  const grow = dot.animate([{ transform: 'translate(-50%,-50%) scale(0)', opacity: .26 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: .16, offset: .55 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: 720, easing: 'cubic-bezier(.2,.6,.3,1)' });
  const done = () => host.remove();
  grow.onfinish = done; grow.oncancel = done;
}

// ── Click Spark (React Bits) for primary actions ─────────────────────────
const SPARK = '.primary:not(#auth-screen *), .new-game, .home-primary, .bot-play, .puzzle-primary, #puzzle-next, #resign-confirm, #profile-save, #profile-crop-apply';
export function spark(x, y, { count = 9, radius = 30, color } = {}) {
  if (!motionOK()) return;
  const tint = color || themeColor('--m-fg') || '#000';
  for (let i = 0; i < count; i++) {
    const line = doc.createElement('span'); line.className = 'm-spark'; line.setAttribute('aria-hidden', 'true');
    Object.assign(line.style, { left: `${x}px`, top: `${y}px`, background: tint });
    doc.body.append(line);
    const angle = (i / count) * Math.PI * 2 + rand(-.15, .15), dx = Math.cos(angle) * radius, dy = Math.sin(angle) * radius;
    const animation = line.animate([
      { transform: `translate(-50%,-50%) rotate(${angle}rad) translateX(4px) scaleX(.3)`, opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${angle}rad) scaleX(1)`, opacity: 0 },
    ], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
    animation.onfinish = () => line.remove(); animation.oncancel = () => line.remove();
  }
}

// ── Magnet (React Bits) and Tilt (Aceternity 3D card / React Bits Tilted) ─
const MAGNET = '.home-actions a, .bot-play, .bot-arrow, .profile-edit-button, .rank-info-button, #rank-unit-swap, .mobile-menu-toggle, .lobby-back, .play-lobby .lobby-change, #puzzle-next, .watch-back, .archive-back';
const TILT = '.home-poster, .profile-stat-card, .puzzle-theme-card, .archive-card, .puzzle-history-card, .piece-option';
const SPOT = '.home-link, .profile-stat-card, .board-guide, .archive-stats-grid > div, .watch-list button, .puzzle-theme-card, .puzzle-stat, .piece-option, .dashboard-card, .rating-row, .rating-self, .feedback-form, .profile-palette-card, .profile-piece-card, .rank-info-content, .puzzle-status-card, .mode-summary, .settings-palette-list .palette-option, .offline-choice, .clock';
const springs = new Map();
function follow(el, prop, target, format) {
  let state = springs.get(el);
  if (!state) { state = { x: 0, y: 0, tx: 0, ty: 0, prop, format, frame: 0 }; springs.set(el, state); }
  state.tx = target[0]; state.ty = target[1]; state.format = format; state.prop = prop;
  if (!state.frame) state.frame = requestAnimationFrame(function step() {
    if (!el.isConnected) { el.style.removeProperty(state.prop); springs.delete(el); state.frame = 0; return; }
    state.x += (state.tx - state.x) * .16; state.y += (state.ty - state.y) * .16;
    const near = Math.abs(state.tx - state.x) < .02 && Math.abs(state.ty - state.y) < .02;
    if (near) { state.x = state.tx; state.y = state.ty; }
    if (near && !state.tx && !state.ty) { el.style.removeProperty(state.prop); springs.delete(el); return; }
    el.style.setProperty(state.prop, state.format(state.x, state.y));
    state.frame = near ? 0 : requestAnimationFrame(step);
  });
}
const magnetFormat = (x, y) => `${x.toFixed(2)}px ${y.toFixed(2)}px`;
const tiltFormat = (x, y) => { const angle = Math.hypot(x, y); return angle < .01 ? '0deg' : `${(-y).toFixed(3)} ${x.toFixed(3)} 0 ${angle.toFixed(2)}deg`; };
let magnetEl = null, tiltEl = null, spotEl = null, moveFrame = 0, lastMove = null;
function release(kind) {
  if (kind === 'magnet' && magnetEl) { follow(magnetEl, 'translate', [0, 0], magnetFormat); magnetEl = null; }
  if (kind === 'tilt' && tiltEl) { follow(tiltEl, 'rotate', [0, 0], tiltFormat); tiltEl = null; }
  if (kind === 'spot' && spotEl) { spotEl.classList.remove('m-spot-on'); spotEl = null; }
}
function onMoveFrame() {
  moveFrame = 0;
  const event = lastMove; if (!event) return;
  const target = event.target instanceof Element ? event.target : null;
  const magnet = hoverOK() ? target?.closest(MAGNET) : null;
  if (magnet !== magnetEl) release('magnet');
  if (magnet && !magnet.disabled) {
    magnetEl = magnet;
    const box = magnet.getBoundingClientRect(), clamp = (v, l) => Math.max(-l, Math.min(l, v));
    follow(magnet, 'translate', [clamp((event.clientX - box.left - box.width / 2) * .24, 9), clamp((event.clientY - box.top - box.height / 2) * .3, 7)], magnetFormat);
  }
  const tilt = hoverOK() ? target?.closest(TILT) : null;
  if (tilt !== tiltEl) release('tilt');
  if (tilt) {
    tiltEl = tilt;
    const box = tilt.getBoundingClientRect(), max = tilt.matches('.home-poster') ? 9 : tilt.matches('.piece-option') ? 5 : 6;
    const px = (event.clientX - box.left) / box.width - .5, py = (event.clientY - box.top) / box.height - .5;
    follow(tilt, 'rotate', [px * max * 2, py * max * 2], tiltFormat);
  }
  const spot = hoverOK() ? target?.closest(SPOT) : null;
  if (spot !== spotEl) release('spot');
  if (spot) {
    if (!spot.hasAttribute('data-m-spot')) spot.setAttribute('data-m-spot', '');
    spotEl = spot; spot.classList.add('m-spot-on');
    const box = spot.getBoundingClientRect();
    spot.style.setProperty('--m-x', `${event.clientX - box.left}px`);
    spot.style.setProperty('--m-y', `${event.clientY - box.top}px`);
  }
}

// ── Text effects ─────────────────────────────────────────────────────────
// Split/Blur Text: wraps characters, animates, then restores the original
// markup so application code that later rewrites the text is unaffected.
export function splitText(el, { delay = 0, step = 32, by = 'char' } = {}) {
  if (!el || !motionOK() || el.dataset.mSplitting) return;
  const label = el.textContent;
  if (!label.trim() || label.length > 60) return;
  let index = 0;
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const parts = by === 'word' ? child.textContent.split(/(\s+)/) : [...child.textContent];
        const frag = doc.createDocumentFragment();
        for (const part of parts) {
          if (!part) continue;
          if (/^\s+$/.test(part) && by === 'word') { frag.append(part); continue; }
          const span = doc.createElement('span'); span.className = 'm-split'; span.setAttribute('aria-hidden', 'true');
          span.textContent = part; span.style.setProperty('--i', index++); frag.append(span);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && !child.matches('img, svg, canvas')) walk(child);
    }
  };
  walk(el);
  el.dataset.mSplitting = '1';
  el.style.setProperty('--m-delay', `${delay}ms`);
  if (step !== 32) el.querySelectorAll('.m-split').forEach(span => span.style.animationDelay = `calc(${span.style.getPropertyValue('--i')} * ${step}ms + ${delay}ms)`);
  if (!el.hasAttribute('aria-label')) { el.setAttribute('aria-label', label); el.dataset.mSplitLabel = '1'; }
  const generated = el.innerHTML;
  setTimeout(() => {
    // Unwrap in place so surrounding elements (and their animations) survive.
    if (el.innerHTML === generated) { el.querySelectorAll('.m-split').forEach(span => span.replaceWith(span.textContent)); el.normalize(); }
    if (el.dataset.mSplitLabel) { el.removeAttribute('aria-label'); delete el.dataset.mSplitLabel; }
    delete el.dataset.mSplitting; el.style.removeProperty('--m-delay');
  }, delay + index * step + 800);
}
const restartListeners = new WeakMap();
const animationNames = { 'm-new': 'm-captured-in' };
function restart(el, className) {
  // Most incoming list items are new; avoid forcing layout for each one.
  let listeners = restartListeners.get(el);
  if (!listeners) { listeners = new Map(); restartListeners.set(el, listeners); }
  const previous = listeners.get(className);
  if (previous) { el.removeEventListener('animationend', previous); }
  if (el.classList.contains(className)) { el.classList.remove(className); void el.offsetWidth; }
  el.classList.add(className);
  const done = event => { if (event.target !== el || event.animationName !== (animationNames[className] || className)) return; el.classList.remove(className); el.removeEventListener('animationend', done); listeners.delete(className); if (!listeners.size) restartListeners.delete(el); };
  listeners.set(className, done); el.addEventListener('animationend', done);
}
const ERROR = /не удалось|неверн|ошиб|слишком много|не менее|занято|недоступ|напиши от|введи шест|не совпад|нельзя/i;
const WIN = /вы победили|пазл решён|верно!/i;
const STATUS = '#status, .game-status, .message, #feedback-status, #archive-stats-status, #watch-status, .bot-save-status, #profile-edit-status, .puzzle-status-card h2, .puzzle-status-card p, #mode-label';
const lastText = new WeakMap(), lastSwap = new WeakMap();
let lastMoveAt = 0, lastConfetti = 0;
function textChanged(el) {
  const text = el.textContent.trim(), before = lastText.get(el);
  lastText.set(el, text);
  if (before === undefined || before === text) return;
  if (el.id === 'status') {
    const card = el.closest('.status-card');
    if (card) { card.dataset.mTurn = /ваш ход/i.test(text) ? 'mine' : ''; if (motionOK() && text) restart(card, 'm-card-pop'); }
  }
  if (WIN.test(text) && Date.now() - lastMoveAt < 8000 && Date.now() - lastConfetti > 4000) { lastConfetti = Date.now(); confetti(); }
  if (!text || !motionOK() || !el.getClientRects().length) return;
  if (el.matches('.new-game-countdown')) return;
  const now = performance.now();
  if (now - (lastSwap.get(el) || 0) < 320) return;
  lastSwap.set(el, now);
  if (ERROR.test(text) && (el.closest('form') || el.matches('.message, #feedback-status, #profile-edit-status'))) restart(el, 'm-shake');
  else restart(el, 'm-text-swap');
  if (el.id === 'puzzle-status' && /^ошибка/i.test(text)) restart(el.closest('.puzzle-status-card') || el, 'm-shake');
}
// React Bits Count Up for statistics.
const COUNT = '.archive-stats-grid dd, #puzzle-rating';
const counting = new WeakMap();
function countChanged(el) {
  const text = el.textContent, state = counting.get(el) || {};
  if (state.writing === text) return;
  const parse = value => /^[+−-]?\d[\d\s\u00a0\u202f]*$/.test(value.trim()) ? Number(value.replace(/[^\d+−-]/g, '').replace('−', '-')) : null;
  const target = parse(text), from = state.value ?? (parse(state.text || '') ?? 0);
  counting.set(el, { ...state, text, value: target });
  if (target === null || !motionOK() || from === target || !el.getClientRects().length || Math.abs(target - from) < 2) return;
  const grouped = /[\s\u00a0\u202f]/.test(text.trim()), sep = (text.match(/[\s\u00a0\u202f]/) || [' '])[0];
  const format = value => { const digits = String(Math.abs(value)); const body = grouped ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : digits; return (value < 0 ? '−' : '') + body; };
  const start = performance.now(), duration = Math.min(1400, 500 + Math.abs(target - from) * 4);
  cancelAnimationFrame(state.frame);
  const run = counting.get(el);
  const tick = time => {
    if (counting.get(el) !== run) return; // the app wrote a newer value
    const t = Math.min(1, (time - start) / duration), eased = 1 - Math.pow(2, -10 * t);
    run.writing = t >= 1 ? text : format(Math.round(from + (target - from) * eased));
    el.textContent = run.writing;
    if (t < 1) run.frame = requestAnimationFrame(tick);
  };
  run.frame = requestAnimationFrame(tick);
}

// ── Board feedback ───────────────────────────────────────────────────────
function boardOf() { return doc.querySelector('#board.board, .board'); }
function burst(x, y, size, color, { scale = 1.7, width = 2, duration = 520 } = {}) {
  const ring = doc.createElement('span'); ring.className = 'm-burst'; ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, { left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`, border: `${width}px solid ${color}` });
  doc.body.append(ring);
  const animation = ring.animate([{ transform: 'scale(.35)', opacity: .95 }, { transform: `scale(${scale})`, opacity: 0 }], { duration, easing: 'cubic-bezier(.16,1,.3,1)' });
  animation.onfinish = () => ring.remove(); animation.oncancel = () => ring.remove();
}
function shards(x, y, size, colors) {
  for (let i = 0; i < 12; i++) {
    const shard = doc.createElement('span'); shard.className = 'm-shard'; shard.setAttribute('aria-hidden', 'true');
    const s = rand(size * .06, size * .12);
    Object.assign(shard.style, { left: `${x - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px`, background: colors[i % colors.length], borderRadius: i % 3 ? '1px' : '50%' });
    doc.body.append(shard);
    const angle = rand(0, Math.PI * 2), distance = rand(size * .45, size * .95);
    const animation = shard.animate([
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance + size * .25}px) rotate(${rand(-220, 220)}deg) scale(.2)`, opacity: 0 },
    ], { duration: rand(520, 760), easing: 'cubic-bezier(.2,.75,.3,1)' });
    animation.onfinish = () => shard.remove(); animation.oncancel = () => shard.remove();
  }
}
function onMove(event) {
  lastMoveAt = Date.now();
  if (!motionOK() || doc.hidden) return;
  const detail = event.detail || {}, board = boardOf();
  const square = detail.to && board?.querySelector(`[data-square="${detail.to}"]`);
  if (!square) return;
  const box = square.getBoundingClientRect(); if (!box.width) return;
  const x = box.left + box.width / 2, y = box.top + box.height / 2;
  const accent = css(board, '--accent') || css(board, '--ink') || '#222';
  if (detail.captured) {
    burst(x, y, box.width, accent, { scale: 1.9, width: 3, duration: 600 });
    shards(x, y, box.width, [css(board, '--board-light') || '#eee', css(board, '--board-dark') || '#999', accent]);
  } else burst(x, y, box.width * .9, `color-mix(in srgb, ${accent} 70%, transparent)`, { scale: 1.45, width: 2, duration: 460 });
  if (/[+#]/.test(detail.san || '')) requestAnimationFrame(() => {
    const king = board.querySelector('.square.check'); if (!king) return;
    const k = king.getBoundingClientRect();
    burst(k.left + k.width / 2, k.top + k.height / 2, k.width, '#e32121', { scale: 2.1, width: 3, duration: 700 });
    setTimeout(() => burst(k.left + k.width / 2, k.top + k.height / 2, k.width, '#e32121', { scale: 1.8, width: 2, duration: 650 }), 160);
    if (detail.san.includes('#')) board.closest('.board-frame')?.animate([{ scale: 1 }, { scale: .985 }, { scale: 1 }], { duration: 520, easing: SPRING });
  });
}
// One short board-level entrance avoids dozens of simultaneous animations and
// never makes individual pieces disappear while a user starts interacting.
const wavedBoards = new WeakSet();
const boardObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    const board = entry.target;
    if (!entry.isIntersecting || wavedBoards.has(board)) continue;
    if (board.querySelectorAll(':scope > .square').length < 64) continue;
    wavedBoards.add(board); boardObserver.unobserve(board);
    if (!motionOK() || board.closest('.bot-shell, #member-game')) continue;
    board.animate([{ opacity: .8 }, { opacity: 1 }], { duration: 350, easing: EASE });
  }
}, { threshold: .25 }) : null;

// Magic UI Confetti, palette-aware, on a single short-lived canvas.
export function confetti({ count = 150, duration = 2600 } = {}) {
  if (!motionOK() || doc.hidden) return;
  const canvas = doc.createElement('canvas'); canvas.className = 'm-confetti'; canvas.setAttribute('aria-hidden', 'true');
  // Keep the effect but bound canvas memory and work on compact devices.
  const dpr = Math.min(1.5, win.devicePixelRatio || 1), w = win.innerWidth, h = win.innerHeight;
  count = Math.min(count, w < 700 ? 90 : 150);
  canvas.width = w * dpr; canvas.height = h * dpr; doc.body.append(canvas);
  const ctx = canvas.getContext('2d'); if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);
  const colors = [themeColor('--m-accent'), themeColor('--m-fg'), themeColor('--board-light'), themeColor('--board-dark'), '#e6bd31', '#31a85b'].filter(Boolean);
  const pieces = Array.from({ length: count }, (_, i) => {
    const left = i % 2 === 0, angle = (left ? -60 : -120) * Math.PI / 180 + rand(-.45, .45), speed = rand(9, 17);
    return { x: left ? w * .1 : w * .9, y: h * .75, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: rand(0, Math.PI), vr: rand(-.3, .3), s: rand(5, 10), c: colors[i % colors.length], shape: i % 3 };
  });
  const start = performance.now();
  const frame = time => {
    if (doc.hidden || !motionOK()) { canvas.remove(); return; }
    const t = time - start; ctx.clearRect(0, 0, w, h);
    for (const p of pieces) {
      p.vx *= .985; p.vy = p.vy * .985 + .32; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - duration * .6) / (duration * .4));
      ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      if (p.shape === 0) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.4, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / (p.shape === 1 ? 2 : 1.2));
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame); else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// ── Discovery: one observer wires statuses, counters, boards and lists ────
const ENTER = '.watch-list > button, .puzzle-replay, .rating-chip.current, .opponent-profile-card button, .profile-detail-row';
const watched = new WeakSet();
const textObserver = new MutationObserver(records => {
  const seen = new Set();
  for (const record of records) {
    const node = record.target.nodeType === 3 ? record.target.parentElement : record.target;
    const el = node?.closest?.(`${STATUS}, ${COUNT}`);
    if (el && !seen.has(el)) { seen.add(el); el.matches(COUNT) ? countChanged(el) : textChanged(el); }
  }
});
function wire(root) {
  if (!(root instanceof Element)) return;
  // Transient animation overlays and pieces never contain statuses or boards.
  // Avoid two descendant queries per piece / shard on every board update.
  if (root.matches('.m-ripple-host, .m-spark, .m-burst, .m-shard, .m-confetti') || (root.closest('.board') && !root.matches('.board'))) return;
  const selectors = `${STATUS}, ${COUNT}`;
  const track = el => {
    if (!el.matches?.(selectors) || watched.has(el)) return;
    watched.add(el);
    if (el.matches(COUNT)) counting.set(el, { text: el.textContent, value: null }); else lastText.set(el, el.textContent.trim());
    textObserver.observe(el, { childList: true, characterData: true, subtree: true });
  };
  track(root);
  if (root.childElementCount) root.querySelectorAll(selectors).forEach(track);
  if (boardObserver) {
    if (root.matches('.board') && !wavedBoards.has(root)) boardObserver.observe(root);
    if (root.childElementCount) root.querySelectorAll('.board').forEach(board => { if (!wavedBoards.has(board)) boardObserver.observe(board); });
  }
}
const captured = new WeakMap();
const domObserver = new MutationObserver(records => {
  const batches = new Map();
  for (const record of records) {
    const target = record.target;
    if (target.classList?.contains('captured-pieces')) {
      const count = target.querySelectorAll('img').length, before = captured.get(target) ?? count;
      captured.set(target, count);
      if (count > before && motionOK()) [...target.querySelectorAll('img')].slice(before - count).forEach(img => restart(img, 'm-new'));
    }
    if (target.classList?.contains('board') && !wavedBoards.has(target) && boardObserver) boardObserver.observe(target);
    for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      wire(node);
      if (motionOK() && node.matches(ENTER)) { const list = batches.get(node.parentElement) || []; list.push(node); batches.set(node.parentElement, list); }
    }
    if (record.removedNodes.length) {
      if (magnetEl && !magnetEl.isConnected) release('magnet');
      if (tiltEl && !tiltEl.isConnected) release('tilt');
      if (spotEl && !spotEl.isConnected) release('spot');
    }
  }
  for (const list of batches.values()) list.forEach((node, i) => { node.style.animationDelay = `${Math.min(i, 12) * 35}ms`; restart(node, 'm-enter'); node.addEventListener('animationend', () => node.style.removeProperty('animation-delay'), { once: true }); });
});

function install() {
  doc.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !motionOK()) return;
    const el = pressTarget(event.target);
    if (el) pressDown(el);
    const surface = event.target.closest?.(RIPPLE);
    if (surface && !surface.closest('.board') && !surface.disabled) ripple(surface, event.clientX, event.clientY);
  }, { passive: true, capture: true });
  const up = () => { for (const el of [...pressing.keys()]) pressUp(el); };
  doc.addEventListener('pointerup', up, { passive: true, capture: true });
  doc.addEventListener('pointercancel', up, { passive: true, capture: true });
  win.addEventListener('blur', up);
  doc.addEventListener('dragstart', up, { capture: true });
  doc.addEventListener('keydown', event => {
    if (event.repeat || !(event.key === 'Enter' || event.key === ' ') || !motionOK()) return;
    const el = event.target.closest?.('button, a[href], [role=button]');
    if (el && !el.matches(NO_PRESS) && !el.closest('.board')) el.animate([{ scale: 1 }, { scale: .95 }, { scale: 1 }], { duration: 300, easing: SPRING });
  }, { capture: true });
  doc.addEventListener('click', event => {
    if (!event.detail || !motionOK()) return;
    const el = event.target.closest?.(SPARK);
    if (el && !el.disabled && !el.closest('#landing-screen')) spark(event.clientX, event.clientY);
  }, { capture: true, passive: true });
  doc.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || doc.hidden || !hoverOK()) return;
    lastMove = event; if (!moveFrame) moveFrame = requestAnimationFrame(onMoveFrame);
  }, { passive: true });
  doc.documentElement.addEventListener('pointerleave', () => { release('magnet'); release('tilt'); release('spot'); }, { passive: true });
  doc.addEventListener('scroll', () => { release('tilt'); }, { passive: true, capture: true });
  doc.addEventListener('invalid', event => { if (motionOK() && event.target instanceof Element) restart(event.target, 'm-shake'); }, true);
  win.addEventListener('shahmat-move', onMove);
  const releaseHover = () => { release('magnet'); release('tilt'); release('spot'); };
  reduced.addEventListener?.('change', releaseHover);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) releaseHover(); });
  const start = () => { wire(doc.body); domObserver.observe(doc.body, { childList: true, subtree: true }); };
  if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start, { once: true });
}
if (!win.__shahmatMotion) { win.__shahmatMotion = true; install(); }
