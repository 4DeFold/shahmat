// Motion for the landing page and the authenticated shell. Loaded once from
// bootstrap.js; it only observes the DOM that app.js already renders.
import { motionOK, splitText } from './core.js';
import './shell.css';

const doc = document;
const EASE = 'cubic-bezier(.22,1,.36,1)';

// ── View entrances ─────────────────────────────────────────────────────────
const FRAME_VIEWS = new Set(['game', 'bot', 'watch', 'archive', 'puzzles']);
function viewShown(view) {
  if (!motionOK()) return;
  const name = view.dataset.view;
  if (name === 'home') {
    const title = view.querySelector('h2');
    if (title) splitText(title, { delay: 60, step: 45 });
  } else if (FRAME_VIEWS.has(name)) {
    const frame = view.querySelector('iframe');
    if (frame) frame.animate([{ opacity: 0, translate: '0 10px', filter: 'blur(5px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0)' }], { duration: 520, easing: EASE });
  } else if (name === 'rating') {
    const title = view.querySelector('h2');
    if (title) splitText(title, { delay: 40, step: 30 });
  }
}
const visible = new WeakSet();
function scanViews() {
  for (const view of doc.querySelectorAll('#page-content [data-view]')) {
    if (view.hidden) { visible.delete(view); continue; }
    if (!visible.has(view)) { visible.add(view); viewShown(view); }
  }
}

// ── Sliding active pill in the sidebar ─────────────────────────────────────
let lastActive = null;
function activeItem() { return doc.querySelector('#app-sidebar .sidebar-item[aria-current="page"]'); }
function slidePill(from, to) {
  const sidebar = doc.getElementById('app-sidebar');
  if (!sidebar || !from || !to || from === to || !from.isConnected || !motionOK()) return;
  const host = sidebar.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  if (!a.width || !b.width || Math.abs(a.left - b.left) > 4) return; // only within the same column
  sidebar.querySelector('.m-nav-ghost')?.remove();
  const ghost = doc.createElement('span'); ghost.className = 'm-nav-ghost'; ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, { left: `${b.left - host.left + sidebar.scrollLeft}px`, top: `${b.top - host.top + sidebar.scrollTop}px`, width: `${b.width}px`, height: `${b.height}px`, borderRadius: getComputedStyle(to).borderRadius });
  sidebar.classList.add('m-nav-anim'); to.classList.add('m-nav-target');
  sidebar.append(ghost);
  const dy = a.top - b.top, stretch = 1 + Math.min(.35, Math.abs(dy) / 600);
  const flight = ghost.animate([
    { translate: `0 ${dy}px`, scale: '1 1' },
    { translate: `0 ${dy * .45}px`, scale: `1 ${stretch}`, offset: .45 },
    { translate: '0 0', scale: '1 1' },
  ], { duration: 460, easing: EASE });
  const done = () => { ghost.remove(); to.classList.remove('m-nav-target'); if (!sidebar.querySelector('.m-nav-ghost')) sidebar.classList.remove('m-nav-anim'); };
  flight.onfinish = done; flight.oncancel = done;
}
// Only user clicks slide the pill; programmatic/back-button changes switch instantly.
let navClickAt = 0;
doc.addEventListener('click', event => { if (event.target.closest?.('#app-sidebar [data-page]')) navClickAt = performance.now(); }, { capture: true, passive: true });
function navChanged() {
  const next = activeItem();
  if (next !== lastActive) { if (performance.now() - navClickAt < 1500) slidePill(lastActive, next); lastActive = next; }
}

// ── First appearance of the dashboard: the sidebar cascades in ─────────────
let sidebarShown = false;
function dashboardShown() {
  const dashboard = doc.getElementById('dashboard-screen');
  const visibleNow = dashboard && !dashboard.hidden;
  if (!visibleNow) { sidebarShown = false; return; }
  if (sidebarShown) return;
  sidebarShown = true;
  if (!motionOK() || matchMedia('(max-width: 700px), (max-height: 500px) and (pointer: coarse)').matches) return;
  const items = doc.querySelectorAll('#app-sidebar :is(.sidebar-brand, .sidebar-nav > .sidebar-item, .sidebar-account > .sidebar-item)');
  items.forEach((item, i) => item.animate([{ opacity: 0, translate: '-14px 0', filter: 'blur(4px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0)' }], { duration: 560, delay: 60 + i * 45, easing: EASE, fill: 'backwards' }));
}

function start() {
  const observer = new MutationObserver(records => {
    let views = false, nav = false, screens = false;
    for (const record of records) {
      const target = record.target;
      if (record.type === 'childList') { views = true; continue; }
      if (record.attributeName === 'aria-current') nav = true;
      if (record.attributeName === 'hidden') {
        if (target.matches?.('[data-view]')) views = true;
        if (target.id === 'dashboard-screen') screens = true;
      }
    }
    if (screens) dashboardShown();
    if (views) scanViews();
    if (nav) navChanged();
  });
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-current'] });
  scanViews(); dashboardShown(); lastActive = activeItem();
}
if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start, { once: true });
