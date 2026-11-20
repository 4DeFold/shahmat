import {installLoadingIndicators} from './pages/loading-indicators.js';
installLoadingIndicators(document);
import {installPieceTheme,setPieceSet,selectedPieceSet,validPieceSet,renderLargePiecePreview} from './pages/piece-theme.js';
installPieceTheme();
import './pages/profile-card.css';
import { createRatingView } from './pages/rating.js';
import { startOnlinePresence } from './pages/online-presence.js';
import { startMatchHeartbeat } from './pages/match-heartbeat.js';
import { createClient } from '@supabase/supabase-js';
import './theme.js';
import './pages/profile.css';
import { createProfileView } from './pages/profile-view.js';
import {applyProfileTheme,clearProfileTheme} from './pages/profile-theme.js';

// Preserve the callback type before Supabase consumes and clears the URL fragment.
const callbackParams = new URLSearchParams(window.location.hash.slice(1));
const recoveryLinkToken = callbackParams.get('type') === 'recovery' ? callbackParams.get('access_token') : null;
// Publishable key is intended for browser use; database access is restricted by RLS.
const supabase = createClient('https://eswyxbyddkajysogtglp.supabase.co', 'sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
const $ = id => document.getElementById(id);
let screen = $('landing-screen');
let mode = 'login';
// This deployment flag is an operational gate, not a replacement for server-side confirmation.
const emailOtpReady = import.meta.env.VITE_EMAIL_OTP_READY === 'true';
let verification = null;
const recoveryKey = 'shahmat.recovery-pending';
const setRecoveryPending = value => { try { if (value) sessionStorage.setItem(recoveryKey, '1'); else sessionStorage.removeItem(recoveryKey); } catch { /* Recovery still works without reload persistence. */ } };
const recoveryPending = () => { try { return sessionStorage.getItem(recoveryKey) === '1'; } catch { return false; } };
let profile = null;
let selectedPalette = 'monochrome';
let selectedTheme = null;
let rankUnit = 'yar';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const palettes = new Set(['monochrome', 'gray', 'forest', 'atelier', 'wood', 'earth', 'ocean', 'amber', 'lavender', 'sand']);
const landing = document.querySelector('.landing');

function applyRankUnit(value) {
  rankUnit = value === 'elo' ? 'elo' : 'yar';
  document.querySelectorAll('#rank-unit-options input').forEach(input => { input.checked = input.value === rankUnit; });
  const swap=$('rank-unit-swap');
  if (swap) swap.setAttribute('aria-label', rankUnit === 'yar' ? 'Показаны Яры. Переключить на Эло' : 'Показано Эло. Переключить на Яры');
  ratingView?.setUnit(rankUnit);
  $('member-game-frame')?.contentWindow?.postMessage({ type:'shahmat-rank-unit', value:rankUnit }, window.location.origin);
}
const paletteNames = { monochrome:'Монохром', gray:'Графит', forest:'Лес', atelier:'Шахматный кабинет', wood:'Тёплое дерево', earth:'Сосновый бор', ocean:'Морская глубина', amber:'Янтарь', lavender:'Лаванда', sand:'Песчаный' };
function updateProfileAppearance() {
  if ($('page-profile')?.dataset.profileOther === 'true') return;
  if ($('profile-palette-name')) $('profile-palette-name').textContent = paletteNames[selectedPalette];
  if ($('profile-palette-swatch')) $('profile-palette-swatch').className = `palette-swatch ${selectedPalette}`;
}
function applyTheme(value) {
  selectedTheme = value === 'dark' || value === 'light' ? value : null;
  landing.dataset.paletteTheme = selectedTheme || (systemTheme.matches ? 'dark' : 'light');
  updateProfileAppearance();
}
systemTheme.addEventListener('change', () => { if (!selectedTheme) { applyTheme(null); recordAppearance(); } });
function applyPalette(value) {
  selectedPalette = palettes.has(value) ? value : 'monochrome';
  landing.dataset.palette = selectedPalette;
  updateProfileAppearance();
  document.querySelectorAll('.palette-list input').forEach(input => {
    input.checked = input.value === selectedPalette;
  });
}
// Appearance is local-first and scoped to the signed-in account. Pending changes
// survive reloads and are sent in order, without blocking the interface.
let appearanceUserId = null;
let syncingAppearance = false;
let retryTimer = null;
let retryDelay = 3000;
let appearancePollTimer = null;
let appearanceEpoch = 0;
let appearancePollInFlight = null;
const appearanceMemory = new Map();
let storageUnavailable = false;
const appearanceKey = id => `shahmat.appearance.${id}`;
function readAppearance(id) {
  if (storageUnavailable) return appearanceMemory.get(id) || null;
  try {
    const value = JSON.parse(localStorage.getItem(appearanceKey(id)) || 'null');
    if (value && palettes.has(value.palette) && (value.theme === null || value.theme === 'dark' || value.theme === 'light') && Number.isSafeInteger(value.version) && typeof value.dirty === 'boolean') {
      appearanceMemory.set(id, value);
      return value;
    }
  } catch { storageUnavailable = true; /* Keep the current session usable. */ }
  return appearanceMemory.get(id) || null;
}
function writeAppearance(id, value) {
  appearanceMemory.set(id, value);
  try { if (!storageUnavailable) localStorage.setItem(appearanceKey(id), JSON.stringify(value)); } catch { storageUnavailable = true; }
}
function recordAppearance() {
  if (!appearanceUserId) return;
  const previous = readAppearance(appearanceUserId);
  writeAppearance(appearanceUserId, { palette: selectedPalette, theme: selectedTheme, rankUnit, pieceSet:selectedPieceSet(), dirty: true, version: (previous?.version || 0) + 1 });
  if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
  void syncAppearance();
}
function scheduleAppearanceRetry() {
  if (!appearanceUserId || retryTimer !== null) return;
  retryTimer = setTimeout(() => { retryTimer = null; void syncAppearance(); }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 60000);
}
async function syncAppearance() {
  if (syncingAppearance || !appearanceUserId) return;
  const id = appearanceUserId;
  const pending = readAppearance(id);
  if (!pending?.dirty) return;
  syncingAppearance = true;
  let failed = false;
  try {
    // Never send one account's local settings using another account's session.
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (appearanceUserId !== id) return;
    if (!data.session || data.session.user.id !== id) throw new Error('Session unavailable');
    const { error } = await supabase.auth.updateUser({ data: { palette: pending.palette, palette_theme: pending.theme, palette_effective_theme: pending.theme || (systemTheme.matches ? 'dark' : 'light'), rank_unit: pending.rankUnit || rankUnit, piece_set:validPieceSet(pending.pieceSet) } });
    if (error) throw error;
    const latest = readAppearance(id);
    if (latest?.version === pending.version) writeAppearance(id, { ...latest, dirty: false });
    retryDelay = 3000;
  } catch { failed = true; }
  finally {
    syncingAppearance = false;
    if (appearanceUserId === id && readAppearance(id)?.dirty) {
      if (failed) scheduleAppearanceRetry();
      else void syncAppearance();
    } else if (appearanceUserId && appearanceUserId !== id) {
      void syncAppearance();
    }
  }
}
// getUser fetches the authoritative Auth user, unlike the locally cached session.
// Serialize reads and disregard responses that raced with a local edit or account change.
async function pollAppearance() {
  const id = appearanceUserId;
  const epoch = appearanceEpoch;
  const before = id && readAppearance(id);
  if (!id || before?.dirty || syncingAppearance || appearancePollInFlight === epoch) return;
  appearancePollInFlight = epoch;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user || data.user.id !== id || appearanceUserId !== id || appearanceEpoch !== epoch) return;
    const latest = readAppearance(id);
    if (syncingAppearance || latest?.dirty || latest?.version !== before?.version) return;
    const remote = data.user.user_metadata || {};
    if (!palettes.has(remote.palette)) return;
    const remoteRankUnit = remote.rank_unit === 'elo' ? 'elo' : 'yar';
    const theme = remote.palette_theme === 'dark' || remote.palette_theme === 'light' ? remote.palette_theme : null;
    const remotePieceSet=validPieceSet(remote.piece_set);
    if (selectedPalette !== remote.palette || selectedTheme !== theme || rankUnit !== remoteRankUnit || selectedPieceSet()!==remotePieceSet) {
      applyPalette(remote.palette);
      applyTheme(theme); applyRankUnit(remoteRankUnit); setPieceSet(remotePieceSet);
      writeAppearance(id, { palette: selectedPalette, theme: selectedTheme, rankUnit, pieceSet:selectedPieceSet(), dirty: false, version: latest?.version || 0 });
    }
  } catch { /* Keep the current appearance while offline. */ }
  finally { if (appearancePollInFlight === epoch) appearancePollInFlight = null; }
}
function stopAppearancePolling() {
  appearanceEpoch++;
  if (appearancePollTimer !== null) { clearInterval(appearancePollTimer); appearancePollTimer = null; }
}
function startAppearancePolling() {
  stopAppearancePolling();
  appearancePollTimer = setInterval(() => void pollAppearance(), 1000);
}
function restoreAppearance(user) {
  appearanceUserId = user.id;
  const local = readAppearance(user.id);
  const remote = user.user_metadata || {};
  if (local?.dirty || (!palettes.has(remote.palette) && local)) {
    applyPalette(local.palette); applyTheme(local.theme); applyRankUnit(local.rankUnit || remote.rank_unit); setPieceSet(local.pieceSet || remote.piece_set);
  } else {
    applyPalette(remote.palette); applyTheme(remote.palette_theme); applyRankUnit(remote.rank_unit); setPieceSet(remote.piece_set || local?.pieceSet);
    writeAppearance(user.id, { palette: selectedPalette, theme: selectedTheme, rankUnit, pieceSet:selectedPieceSet(), dirty: false, version: local?.version || 0 });
  }
  if (!local?.dirty && remote.palette_effective_theme !== (selectedTheme || (systemTheme.matches ? 'dark' : 'light'))) recordAppearance();
  else void syncAppearance();
  startAppearancePolling();
}
window.addEventListener('online', () => {
  if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
  void syncAppearance();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
    void syncAppearance();
  }
});

let editing = false;
let navigating = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const accountMenu = $('account-menu');
const accountToggle = $('account-toggle');
const pages = new Set(['home', 'game', 'bot', 'rating', 'watch', 'archive', 'profile', 'settings', 'help']);
const sidebar = $('app-sidebar');
const mobileMenuToggle = $('mobile-menu-toggle');
let sidebarOpen = false;
const isMobileSidebar = () => window.innerWidth <= 700 || (window.innerHeight <= 500 && window.matchMedia('(pointer: coarse)').matches);
function setSidebarOpen(open, { restoreFocus = false } = {}) {
  const mobile = isMobileSidebar();
  sidebarOpen = mobile && open;
  $('dashboard-screen').classList.toggle('sidebar-open', sidebarOpen);
  sidebar.inert = mobile && !sidebarOpen;
  document.querySelectorAll('#dashboard-screen [data-view]').forEach(view => { view.inert = sidebarOpen; });
  mobileMenuToggle.setAttribute('aria-expanded', String(sidebarOpen));
  mobileMenuToggle.setAttribute('aria-label', sidebarOpen ? 'Закрыть меню' : 'Открыть меню');
  if (!sidebarOpen) closeAccountMenu(true);
  if (restoreFocus && mobile) mobileMenuToggle.focus({ preventScroll: true });
}
mobileMenuToggle.addEventListener('click', () => setSidebarOpen(!sidebarOpen));
$('sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false, { restoreFocus: true }));
// Close only a deliberate horizontal left swipe; vertical scrolling and taps stay native.
let swipeStart = null;
for (const element of [sidebar, $('sidebar-backdrop')]) {
  element.addEventListener('touchstart', event => {
    if (!sidebarOpen || event.touches.length !== 1) { swipeStart = null; return; }
    const touch = event.touches[0];
    swipeStart = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  element.addEventListener('touchend', event => {
    if (!swipeStart || !sidebarOpen) return;
    const touch = [...event.changedTouches].find(item => item.identifier === swipeStart.id);
    const start = swipeStart; swipeStart = null;
    if (!touch) return;
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (dx <= -50 && Math.abs(dx) > Math.abs(dy) * 1.3) setSidebarOpen(false, { restoreFocus: true });
  }, { passive: true });
  element.addEventListener('touchcancel', () => { swipeStart = null; }, { passive: true });
}

let sidebarMobile = isMobileSidebar();
window.addEventListener('resize', () => {
  const mobile = isMobileSidebar();
  if (mobile !== sidebarMobile) { sidebarMobile = mobile; setSidebarOpen(false); }
});


let menuCloseTimer = null;
function closeAccountMenu(immediate = false) {
  if (menuCloseTimer !== null) { clearTimeout(menuCloseTimer); menuCloseTimer = null; }
  accountToggle.setAttribute('aria-expanded', 'false');
  accountMenu.classList.remove('is-open');
  accountMenu.inert = true;
  $('sidebar-message').textContent = '';
  if (immediate || reducedMotion.matches || accountMenu.hidden) accountMenu.hidden = true;
  else menuCloseTimer = setTimeout(() => { accountMenu.hidden = true; menuCloseTimer = null; }, 320);
}
function openAccountMenu() {
  if (menuCloseTimer !== null) { clearTimeout(menuCloseTimer); menuCloseTimer = null; }
  accountMenu.hidden = false;
  accountMenu.inert = false;
  accountToggle.setAttribute('aria-expanded', 'true');
  void accountMenu.offsetHeight; // Commit the collapsed state before starting the expansion.
  requestAnimationFrame(() => {
    if (accountToggle.getAttribute('aria-expanded') === 'true') accountMenu.classList.add('is-open');
  });
}
// Independent pages stay out of the guest landing; preload them after entering the dashboard.
const pageLoaders = {
  home: () => import('./pages/home.html?raw'),
  game: () => import('./pages/game-view.html?raw'),
  bot: () => import('./pages/bot-view.html?raw'),
  rating: () => import('./pages/rating.html?raw'),
  watch: () => import('./pages/watch-view.html?raw'),
  archive: () => import('./pages/archive-view.html?raw'),
  profile: () => import('./pages/profile.html?raw'),
  settings: () => import('./pages/settings.html?raw'),
  help: () => import('./pages/help.html?raw'),
};
let pageRequest = 0;
const viewId = name => name === 'home' ? 'dashboard-home' : `page-${name}`;
const viewLoads = new Map();
let frameReady = null, botFrameReady = null, watchFrameReady = null, archiveFrameReady = null, ratingView = null, profileView = null, profileReturnPage = 'rating';
let onlineStop = null, heartbeatStop = null, onlineUser = null, onlineCount = null;
function sendOnline() { $('member-game-frame')?.contentWindow?.postMessage({ type: 'shahmat-online', count: onlineCount }, window.location.origin); }
function startOnline(id) {
  if (onlineUser === id) return;
  onlineStop?.(); heartbeatStop?.(); onlineUser = id; onlineCount = null; sendOnline();
  heartbeatStop = startMatchHeartbeat(supabase, window);
  onlineStop = startOnlinePresence(supabase, id, count => { onlineCount = count; sendOnline(); });
}
let dashboardPreloadEnabled = false;
async function loadView(name) {
  if ($(viewId(name))) return;
  if (viewLoads.has(name)) return viewLoads.get(name);
  const pending = (async () => {
    const { default: html } = await pageLoaders[name]();
    if (!dashboardPreloadEnabled || $('dashboard-screen').hidden || $(viewId(name))) return;
    $('page-content').insertAdjacentHTML('beforeend', html);
    if (name === 'home') void import('./pages/home-particles.js').then(({createHomeParticles}) => { const home=$('dashboard-home'); if(home&&!home.dataset.particlesReady) { home.dataset.particlesReady='true'; createHomeParticles(home); } }).catch(()=>{});
    if (name === 'rating') { ratingView = createRatingView($('page-rating'), supabase, { showSelf:true, onOpenProfile:openOtherProfile }); ratingView.setUnit(rankUnit); }
    if (name === 'settings') { applyPalette(selectedPalette); applyRankUnit(rankUnit); window.dispatchEvent(new Event('shahmat-piece-set')); }
    if (name === 'profile') {
      updateProfileAppearance();
      profileView = createProfileView($('page-profile'), supabase, { onBack() { void showPage(profileReturnPage,{updateHistory:true,focus:true}); }, onTheme(palette,theme) { const sidebar=$('app-sidebar');if(!sidebar)return;if(palette){applyProfileTheme(sidebar,palette,theme);sidebar.style.backgroundColor='var(--surface-raised)';}else clearProfileTheme(sidebar); }, onLoaded(updated) { profile = updated; }, onSaved(updated, media) {
        profile = updated; ratingView?.invalidate?.();
        for (const id of ['member-game-frame','bot-game-frame']) $(id)?.contentWindow?.postMessage({type:'shahmat-profile-updated',username:updated.username,avatar:media.avatar}, window.location.origin);
      } });
    }
    if (name === 'game' || name === 'bot' || name === 'watch' || name === 'archive') {
      const frame = $(({game:'member-game-frame',bot:'bot-game-frame',watch:'watch-frame',archive:'archive-frame'})[name]);
      const ready = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Game load timed out')), 15000);
        frame.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
        frame.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Game load failed')); }, { once: true });
      });
      // Prevent an unhandled rejection if a background load fails before navigation.
      ready.catch(() => {});
      if (name === 'game') frameReady = ready; else if(name === 'bot') botFrameReady = ready; else if(name === 'watch') watchFrameReady = ready; else archiveFrameReady = ready;
    }
  })();
  viewLoads.set(name, pending);
  try { await pending; } finally { viewLoads.delete(name); }
}
let profileLoadSequence=0;
function showProfileData(run) {
  const request=++profileLoadSequence, indicator=$('profile-loading');
  if(indicator)indicator.hidden=false;
  Promise.resolve().then(()=>{if(request===profileLoadSequence)return run();}).catch(()=>{}).finally(()=>{if(request===profileLoadSequence && indicator)indicator.hidden=true;});
}
function hideProfileData() { profileLoadSequence++; const indicator=$('profile-loading'); if(indicator)indicator.hidden=true; profileView?.hide(); }
async function openOtherProfile(name) {
  if (!name || !profile) return;
  if(currentPage()!=='profile') profileReturnPage=currentPage();
  await showPage('profile', {updateHistory:true});
  if (currentPage() === 'profile') showProfileData(()=>profileView?.showOther(name));
}
window.addEventListener('message', event => {
  if (event.origin !== window.location.origin || ![ $('member-game-frame')?.contentWindow, $('watch-frame')?.contentWindow ].includes(event.source)) return;
  if (event.data?.type === 'shahmat-open-profile' && typeof event.data.username === 'string') void openOtherProfile(event.data.username);
});
function preloadDashboard() {
  for (const name of ['game', 'profile', 'settings', 'help']) void loadView(name).catch(() => {});
}
function currentPage() {
  const name = window.location.pathname.replace(/^\/+|\/+$/g, '');
  return pages.has(name) ? name : 'home';
}
async function showPage(name, { updateHistory = false, focus = false } = {}) {
  if (!pages.has(name)) name = 'home';
  const request = ++pageRequest;
  if (updateHistory && currentPage() !== name) window.history.pushState(null, '', `/${name}`);
  // Switch the shell immediately, even if the view chunk or iframe is still loading.
  // Each request owns its placeholder; stale completions cannot replace a newer tab.
  const targetAlreadyVisible = $(viewId(name)) && !$(viewId(name)).hidden;
  $('page-load-error')?.remove();
  if (!targetAlreadyVisible) {
    document.querySelectorAll('#dashboard-screen [data-view]').forEach(view => { view.hidden = true; });
    hideProfileData(); ratingView?.hide();
    for (const [id,type] of [['member-game-frame','game'],['bot-game-frame','bot'],['watch-frame','watch'],['archive-frame','archive']])
      $(id)?.contentWindow?.postMessage({type:`shahmat-${type}-hidden`},window.location.origin);
    if (!$('page-loading')) $('page-content').insertAdjacentHTML('beforeend', '<section class="empty-page page-loading" id="page-loading" role="status" aria-live="polite" aria-label="Загрузка"><span class="particle-loading" data-loading="page" hidden aria-hidden="true"><canvas></canvas></span></section>');
  }
  document.querySelectorAll('#dashboard-screen [data-page]').forEach(link => {
    if (link.dataset.page === name) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  });
  closeAccountMenu();
  document.title = ({ home: 'Главная', game: 'Играть', bot: 'Бот', rating: 'Рейтинг', watch: 'Наблюдать', archive: 'Архив', profile: 'Профиль', settings: 'Настройки', help: 'Помощь' })[name] + ' — shahmat.xyz';
  try {
    await loadView(name);
    if (name === 'game' && frameReady) await frameReady;
    if (name === 'bot' && botFrameReady) await botFrameReady;
    if (name === 'watch' && watchFrameReady) await watchFrameReady;
    if (name === 'archive' && archiveFrameReady) await archiveFrameReady;
    if (request !== pageRequest) return;
    $('page-load-error')?.remove();
    $('page-loading')?.remove();
    $('member-game-frame')?.contentWindow?.postMessage({ type: name === 'game' ? 'shahmat-game-shown' : 'shahmat-game-hidden' }, window.location.origin);
    $('bot-game-frame')?.contentWindow?.postMessage({ type: name === 'bot' ? 'shahmat-bot-shown' : 'shahmat-bot-hidden' }, window.location.origin);
    $('watch-frame')?.contentWindow?.postMessage({type:name === 'watch'?'shahmat-watch-shown':'shahmat-watch-hidden'},window.location.origin);
    $('archive-frame')?.contentWindow?.postMessage({type:name === 'archive'?'shahmat-archive-shown':'shahmat-archive-hidden'},window.location.origin);
    const profileWasHidden = $('page-profile')?.hidden;
    document.querySelectorAll('#dashboard-screen [data-view]').forEach(view => {
      const active = view.dataset.view === name;
      const changed = active && view.hidden;
      view.hidden = !active;
      view.inert = sidebarOpen;
      if (changed && view.dataset.view === 'profile') {
        view.classList.remove('profile-enter'); void view.offsetWidth;
        if (!reducedMotion.matches) view.classList.add('profile-enter');
      }
      if (changed && (view.dataset.view === 'settings' || view.dataset.view === 'help')) {
        view.classList.remove('support-enter'); void view.offsetWidth;
        if (!reducedMotion.matches) view.classList.add('support-enter');
      }
      if (changed && focus && !reducedMotion.matches) {
        view.classList.remove('page-enter'); void view.offsetWidth; view.classList.add('page-enter');
      }
    });
    if (name === 'profile' && profileWasHidden) { delete $('page-profile').dataset.profileOther; const requested=new URLSearchParams(window.location.search).get('player'); if(requested) {history.replaceState(null,'',window.location.pathname); showProfileData(()=>profileView?.showOther(requested));} else { updateProfileAppearance(); showProfileData(()=>profileView?.show(profile, appearanceUserId)); } }
    else if (name !== 'profile') hideProfileData();
    if (name === 'rating') ratingView?.show(); else ratingView?.hide();
    if (name !== 'settings') { clearTimeout(rankInfoTimer); rankInfoPinned = false; showRankInfo(false); }
    document.querySelectorAll('#dashboard-screen [data-page]').forEach(link => {
      if (link.dataset.page === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    closeAccountMenu();
    if (focus) {
      window.scrollTo(0, 0);
      const heading = $('page-' + name + '-title');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    }
    document.title = ({ home: 'Главная', game: 'Играть', bot: 'Бот', rating: 'Рейтинг', watch: 'Наблюдать', archive: 'Архив', profile: 'Профиль', settings: 'Настройки', help: 'Помощь' })[name] + ' — shahmat.xyz';
  } catch {
    if (request !== pageRequest) return;
    document.querySelectorAll('#dashboard-screen [data-view]').forEach(view => { view.hidden = true; });
    $('page-load-error')?.remove(); $('page-loading')?.remove();
    if (name === 'game') { $('page-game')?.remove(); frameReady = null; }
    if (name === 'bot') { $('page-bot')?.remove(); botFrameReady = null; }
    if (name === 'watch') { $('page-watch')?.remove(); watchFrameReady = null; }
    if (name === 'archive') { $('page-archive')?.remove(); archiveFrameReady = null; }
    $('page-content').insertAdjacentHTML('beforeend', '<section class="empty-page" id="page-load-error" role="alert"><h2>Страница не загрузилась.</h2><p>Проверь соединение и обнови страницу.</p></section>');
  }
}
// The game remains a separate page; send appearance only to our own frame.
function syncGameAppearance() {
  const frames = [$('member-game-frame'), $('bot-game-frame'), $('watch-frame'), $('archive-frame')].filter(frame => frame?.contentWindow);
  if (!frames.length) return;
  const style = getComputedStyle(landing);
  const names = ['--page-background', '--foreground', '--surface', '--surface-raised', '--line', '--button-background', '--button-text', '--accent', '--board-light', '--board-dark', '--clock-white', '--clock-black'];
  const colors = Object.fromEntries(names.map(name => [name, style.getPropertyValue(name).trim()]));
  // Apply synchronously before revealing the frame; postMessage keeps its own
  // appearance listener in sync as the palette changes later.
  const targets = { '--page-background': '--bg', '--foreground': '--ink', '--surface': '--surface', '--surface-raised': '--surface-alt', '--line': '--line', '--button-background': '--control', '--button-text': '--control-ink', '--accent': '--accent', '--board-light': '--board-light', '--board-dark': '--board-dark', '--clock-white':'--clock-white', '--clock-black':'--clock-black' };
  for (const frame of frames) {
    try { for (const [name, target] of Object.entries(targets)) if (colors[name]) frame.contentDocument?.documentElement.style.setProperty(target, colors[name]); } catch { /* Frame may still be navigating. */ }
    frame.contentWindow.postMessage({ type: 'shahmat-appearance', colors }, window.location.origin);
  }
}
new MutationObserver(syncGameAppearance).observe(landing, { attributes: true, attributeFilter: ['data-palette', 'data-palette-theme', 'class'] });
$('page-content').addEventListener('load', event => { if (event.target.id === 'member-game-frame' || event.target.id === 'bot-game-frame' || event.target.id === 'watch-frame' || event.target.id === 'archive-frame') { syncGameAppearance(); sendOnline(); applyRankUnit(rankUnit); } }, true);
$('dashboard-screen').querySelectorAll('[data-page]').forEach(link => link.addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  setSidebarOpen(false);
  if(link.dataset.page === 'profile' && $('page-profile')?.dataset.profileOther === 'true' && currentPage()==='profile') { delete $('page-profile').dataset.profileOther; updateProfileAppearance(); showProfileData(()=>profileView?.show(profile,appearanceUserId)); }
  void showPage(link.dataset.page, { updateHistory: true, focus: true });
}));
accountToggle.addEventListener('click', () => {
  if (accountToggle.getAttribute('aria-expanded') === 'true') closeAccountMenu();
  else openAccountMenu();
});
document.addEventListener('click', event => {
  if (accountToggle.getAttribute('aria-expanded') === 'true' && !$('sidebar-account').contains(event.target)) closeAccountMenu();
});
document.addEventListener('keydown', event => {
  if (!['game','bot','watch','archive'].includes(currentPage()) || $('dashboard-screen').hidden || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=textbox]') || document.querySelector('dialog[open]')) return;
  const key=({KeyA:'a',KeyD:'d',KeyW:'w',KeyS:'s'})[event.code]||event.key;
  if (['ArrowLeft','ArrowRight','a','d'].includes(key) || (currentPage()!=='watch' && ['ArrowUp','ArrowDown','w','s'].includes(key)) || (key==='Enter' && currentPage()==='bot' && !event.target.closest?.('button,a'))) { event.preventDefault(); $(({game:'member-game-frame',bot:'bot-game-frame',watch:'watch-frame',archive:'archive-frame'})[currentPage()])?.contentWindow?.postMessage({type:'shahmat-history-key',key,code:event.code},window.location.origin); }
});
// Forward held physical Q/E keys when the shell, rather than the frame, has focus.
for (const type of ['keydown','keyup']) document.addEventListener(type,event=>{
  if(!['game','bot','archive'].includes(currentPage())||$('dashboard-screen').hidden||!['KeyQ','KeyE'].includes(event.code))return;
  if(type==='keydown'&&(event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')||document.querySelector('dialog[open]')))return;
   $(({game:'member-game-frame',bot:'bot-game-frame',archive:'archive-frame'})[currentPage()])?.contentWindow?.postMessage({type:'shahmat-threat-key',code:event.code,down:type==='keydown'},window.location.origin);
});
window.addEventListener('blur',()=>{for(const id of ['member-game-frame','bot-game-frame','archive-frame'])for(const code of ['KeyQ','KeyE'])$(id)?.contentWindow?.postMessage({type:'shahmat-threat-key',code,down:false},window.location.origin);});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (accountToggle.getAttribute('aria-expanded') === 'true') { closeAccountMenu(); accountToggle.focus(); }
  else if (sidebarOpen) setSidebarOpen(false, { restoreFocus: true });
});
window.addEventListener('popstate', () => {
  if (screen.id === 'dashboard-screen' && !screen.hidden) showPage(currentPage(), { focus: true });
});

async function show(id, immediate = false) {
  if (navigating || (screen.id === id && !screen.hidden)) return;
  navigating = true;
  const next = $(id);
  screen.classList.add('leaving');
  if (!immediate && !reducedMotion.matches) await new Promise(resolve => setTimeout(resolve, 300));
  if (screen.id === 'dashboard-screen') { $('member-game-frame')?.contentWindow?.postMessage({ type: 'shahmat-game-hidden' }, window.location.origin); $('bot-game-frame')?.contentWindow?.postMessage({ type: 'shahmat-bot-hidden' }, window.location.origin); $('watch-frame')?.contentWindow?.postMessage({type:'shahmat-watch-hidden'},window.location.origin); $('archive-frame')?.contentWindow?.postMessage({type:'shahmat-archive-hidden'},window.location.origin); }
  screen.hidden = true;
  screen.classList.remove('leaving');
  landing.classList.toggle('palette-active', ['profile-screen', 'palette-screen', 'dashboard-screen'].includes(id));
  if (!immediate) next.classList.add('entering');
  next.hidden = false;
  screen = next;
  if (id === 'dashboard-screen') { dashboardPreloadEnabled = true; setSidebarOpen(false); await showPage(currentPage()); preloadDashboard(); }
  else closeAccountMenu(true);
  window.scrollTo(0, 0);
  requestAnimationFrame(() => requestAnimationFrame(() => next.classList.remove('entering')));
  const focusTarget = id === 'auth-screen' ? next : next.querySelector('[data-view]:not([hidden]) h2') || next.querySelector('h2');
  if (focusTarget) {
    if (focusTarget.tagName === 'H2' || focusTarget === next) focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });
  }
  navigating = false;
}
function message(id, text = '') { $(id).textContent = text; }
function busy(button, value) { button.disabled = value; button.setAttribute('aria-busy', String(value)); }
function describe(error) {
  const text = error?.message?.toLowerCase() || '';
  if (error?.code === '23505') return 'Это имя уже занято. Попробуй другое.';
  if (error?.code === 'email_address_invalid' || text.includes('email address') && text.includes('invalid')) return 'Проверь адрес электронной почты.';
  if (error?.code === 'email_address_not_authorized') return 'Отправка писем на этот адрес не разрешена. Обратись к администратору сайта.';
  if (error?.code === 'email_provider_disabled' || error?.code === 'signup_disabled') return 'Регистрация по почте сейчас отключена. Обратись к администратору сайта.';
  if (error?.code === 'email_send_failed' || text.includes('error sending confirmation email') || text.includes('error sending recovery email')) return 'Не удалось отправить письмо. Попробуй позже или сообщи администратору сайта.';
  if (error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit' || error?.status === 429 || text.includes('rate limit') || text.includes('security purposes')) return 'Слишком много попыток. Подожди немного и попробуй ещё раз.';
  if (error?.name === 'AuthRetryableFetchError' || text.includes('failed to fetch') || text.includes('network request failed')) return 'Не удалось связаться с сервером. Проверь интернет и попробуй ещё раз.';
  if (text.includes('invalid login credentials')) return 'Неверная почта или пароль.';
  if (text.includes('already registered')) return 'Аккаунт с этой почтой уже существует. Попробуй войти.';
  return 'Не получилось выполнить действие. Проверь данные и попробуй ещё раз.';
}
let authHeightAnimation;
let authSubmitAnimation;
let forgotAnimation;
reducedMotion.addEventListener?.('change', () => {
  if (reducedMotion.matches) {
    authHeightAnimation?.cancel();
    authSubmitAnimation?.cancel();
    forgotAnimation?.cancel();
  }
});
function setMode(value) {
  const changed = mode !== value;
  const panel = $('auth-screen');
  const submit = $('auth-submit');
  const animateLayout = changed && !panel.hidden && !reducedMotion.matches && typeof panel.animate === 'function';
  const oldPanel = animateLayout ? panel.getBoundingClientRect() : null;
  const oldSubmitOffset = animateLayout ? submit.getBoundingClientRect().top - oldPanel.top : 0;
  authHeightAnimation?.cancel();
  authSubmitAnimation?.cancel();
  forgotAnimation?.cancel();
  mode = value;
  for (const name of ['login', 'signup']) {
    const tab = $('tab-' + name);
    tab.classList.toggle('active', mode === name);
    tab.setAttribute('aria-pressed', String(mode === name));
  }
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  // Signup tries existing accounts first, including older six-character passwords.
  $('password').minLength = mode === 'login' ? 8 : 6;
  $('password').placeholder = 'Не менее 8 символов';
  $('forgot-password').hidden = mode !== 'login';
  const label = submit.querySelector('.auth-submit-label');
  label.textContent = mode === 'login' ? 'Войти' : 'Создать аккаунт';
  if (animateLayout && typeof label.animate === 'function') {
    label.getAnimations().forEach(animation => animation.cancel());
    label.animate([{ opacity: 0, filter: 'blur(4px)', transform: 'translateY(6px)' },
      { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' }],
      { duration: 400, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  }
  message('auth-message');
  $('auth-register-suggestion').hidden = true;
  if (animateLayout) {
    const newPanel = panel.getBoundingClientRect();
    const newSubmitOffset = submit.getBoundingClientRect().top - newPanel.top;
    const timing = { duration: 450, easing: 'cubic-bezier(.22, 1, .36, 1)' };
    // Animate the actual height so the centered panel and its spotlight move together.
    authHeightAnimation = panel.animate([{ height: `${oldPanel.height}px` }, { height: `${newPanel.height}px` }], timing);
    authSubmitAnimation = submit.animate([{ transform: `translateY(${oldSubmitOffset - newSubmitOffset}px)` }, { transform: 'translateY(0)' }], timing);
    if (mode === 'login') forgotAnimation = $('forgot-password').animate([{ opacity: 0 }, { opacity: 1 }], timing);
  }
}
async function loadProfile(user, immediate = false) {
  if (window.location.pathname === '/' || window.location.pathname === '/login') window.history.replaceState(null, '', '/home');
  const { data, error } = await supabase.from('profiles').select('username,bio,palette').eq('id', user.id).maybeSingle();
  if (error) throw error;
  profile = data;
  startOnline(user.id);
  restoreAppearance(user);
  if (!data) { editing = false; prepareProfile(); await show('profile-screen', immediate); }
  else { displayProfile(); await show('dashboard-screen', immediate); }
}
function prepareProfile() {
  $('profile-title').textContent = editing ? 'О тебе.' : 'Это ты.';
  $('profile-cancel').hidden = !editing;
  $('username').value = profile?.username || '';
  $('bio').value = profile?.bio || '';
  $('profile-submit').innerHTML = editing ? 'Сохранить <span>↗</span>' : 'Продолжить <span>→</span>';
  message('profile-message');
}
function displayProfile() { /* The profile view is intentionally empty. */ }
$('login').addEventListener('click', async event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState(null, '', '/login');
  const button = $('login');
  if (button.disabled) return;
  busy(button, true);
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) await loadProfile(data.session.user);
    else await show('auth-screen');
  } catch (error) { await show('auth-screen'); message('auth-message', 'Не удалось загрузить профиль. Попробуй войти ещё раз.'); }
  finally { busy(button, false); }
});
$('tab-login').addEventListener('click', () => setMode('login'));
$('tab-signup').addEventListener('click', () => setMode('signup'));
$('auth-register-suggestion').addEventListener('click', () => setMode('signup'));
document.querySelector('[data-action="home"]').addEventListener('click', () => { window.history.replaceState(null, '', '/'); show('landing-screen'); });
const unavailableMessage = 'Подтверждение по почте временно недоступно. Попробуй позже.';
async function openVerification(email, kind, alreadySent = true) {
  verification = { email, kind };
  $('verify-code').value = '';
  $('verify-description').textContent = kind === 'signup'
    ? (alreadySent ? `Мы отправили код на ${email}. Введи его, чтобы подтвердить почту.` : `Введи код для ${email} или запроси новый.`)
    : 'Если аккаунт существует, код отправлен на указанную почту.';
  message('verify-message');
  await show('verify-screen');
}
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('auth-submit');
  if (button.disabled) return;
  busy(button, true); message('auth-message'); $('auth-register-suggestion').hidden = true;
  try {
    const credentials = { email: $('email').value.trim(), password: $('password').value };
    // Trying sign-in first also permits an existing account to use the signup tab.
    // Supabase deliberately returns the same error for an unknown email and a
    // wrong password, so never infer account existence from this response.
    const login = await supabase.auth.signInWithPassword(credentials);
    if (!login.error && login.data?.session) {
      $('password').value = '';
      await loadProfile(login.data.session.user);
      return;
    }
    const error = login.error || new Error('Session missing');
    if (emailOtpReady && (error.code === 'email_not_confirmed' || error.message?.toLowerCase().includes('email not confirmed'))) {
      $('password').value = '';
      await openVerification(credentials.email, 'signup', false);
      return;
    }
    const invalid = error.code === 'invalid_credentials' || error.message?.toLowerCase().includes('invalid login credentials');
    if (!invalid) throw error;
    if (mode === 'login') {
      message('auth-message', 'Неверная почта или пароль. Проверь данные или перейди к регистрации.');
      $('auth-register-suggestion').hidden = false;
      return;
    }
    if (!emailOtpReady) { message('auth-message', unavailableMessage); return; }
    if (credentials.password.length < 8) { message('auth-message', 'Пароль должен содержать не менее 8 символов.'); return; }
    const { data, error: signupError } = await supabase.auth.signUp(credentials);
    if (signupError) throw signupError;
    $('password').value = '';
    if (data.session) {
      // Fail closed if the server was accidentally left in auto-confirm mode.
      await supabase.auth.signOut({ scope: 'local' });
      message('auth-message', unavailableMessage);
      return;
    }
    await openVerification(credentials.email, 'signup');
  } catch (error) { message('auth-message', describe(error)); }
  finally { busy(button, false); }
});
$('forgot-password').addEventListener('click', async () => {
  $('recovery-email').value = $('email').value.trim();
  message('recovery-message');
  await show('recovery-screen');
});
async function returnToLogin() {
  verification = null;
  $('verify-code').value = '';
  setMode('login');
  await show('auth-screen');
}
$('verify-back').addEventListener('click', returnToLogin);
$('recovery-back').addEventListener('click', returnToLogin);
$('recovery-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('recovery-submit');
  if (button.disabled) return;
  if (!emailOtpReady) { message('recovery-message', unavailableMessage); return; }
  busy(button, true); message('recovery-message');
  try {
    const email = $('recovery-email').value.trim();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
    await openVerification(email, 'recovery');
  } catch (error) { message('recovery-message', describe(error)); }
  finally { busy(button, false); }
});
$('resend-code').addEventListener('click', async () => {
  if (!verification) return;
  const button = $('resend-code');
  if (button.disabled) return;
  busy(button, true); message('verify-message');
  try {
    const { error } = verification.kind === 'signup'
      ? await supabase.auth.resend({ type: 'signup', email: verification.email })
      : await supabase.auth.resetPasswordForEmail(verification.email);
    if (error) throw error;
    message('verify-message', verification.kind === 'signup' ? 'Код отправлен повторно.' : 'Если аккаунт существует, код отправлен повторно.');
  } catch (error) { message('verify-message', describe(error)); }
  finally { busy(button, false); }
});
$('verify-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('verify-submit');
  if (button.disabled || !verification) return;
  const token = $('verify-code').value.trim();
  if (!/^[0-9]{6}$/.test(token)) { message('verify-message', 'Введи шестизначный код.'); return; }
  busy(button, true); message('verify-message');
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email: verification.email, token, type: verification.kind === 'signup' ? 'email' : 'recovery' });
    if (error || !data.session) throw error || new Error('Session missing');
    $('verify-code').value = '';
    if (verification.kind === 'recovery') {
      setRecoveryPending(true);
      $('reset-password-form').reset();
      message('reset-password-message');
      await show('reset-password-screen');
    } else {
      try { await loadProfile(data.session.user); }
      catch {
        await returnToLogin();
        message('auth-message', 'Почта подтверждена, но профиль не загрузился. Войди ещё раз.');
      }
    }
    verification = null;
  } catch { message('verify-message', 'Неверный или просроченный код. Проверь его или запроси новый.'); }
  finally { busy(button, false); }
});
$('reset-password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('reset-password-submit');
  if (button.disabled) return;
  const password = $('new-password').value;
  if (password.length < 8) { message('reset-password-message', 'Пароль должен содержать не менее 8 символов.'); return; }
  if (password !== $('confirm-password').value) { message('reset-password-message', 'Пароли не совпадают.'); return; }
  busy(button, true); message('reset-password-message');
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    $('reset-password-form').reset();
    setRecoveryPending(false);
    await supabase.auth.signOut({ scope: 'local' });
    await returnToLogin();
    message('auth-message', 'Пароль изменён. Теперь можно войти.');
  } catch (error) { message('reset-password-message', describe(error)); }
  finally { busy(button, false); }
});
$('reset-cancel').addEventListener('click', async () => {
  setRecoveryPending(false);
  $('reset-password-form').reset();
  await supabase.auth.signOut({ scope: 'local' });
  await returnToLogin();
});
$('profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('profile-submit');
  if (button.disabled) return;
  busy(button, true); message('profile-message');
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw authError || new Error('No user');
    const values = { id: auth.user.id, username: $('username').value.trim(), bio: $('bio').value.trim(), palette: profile?.palette || 'monochrome' };
    if (!/^[A-Za-z0-9_]{3,24}$/.test(values.username)) throw new Error('Invalid username');
    const { error } = await supabase.from('profiles').upsert(values);
    if (error) throw error;
    profile = values;
    if (editing) { displayProfile(); await show('dashboard-screen'); }
    else await show('palette-screen');
  } catch (error) { message('profile-message', describe(error)); }
  finally { busy(button, false); }
});
function toggleSelectedTheme() {
  applyTheme(landing.dataset.paletteTheme === 'dark' ? 'light' : 'dark');
}
$('onboarding-palettes').addEventListener('click', event => {
  if (event.target.matches('input[name="onboarding-palette"]') && event.target.value === selectedPalette) {
    toggleSelectedTheme(); recordAppearance();
  }
});
$('onboarding-palettes').addEventListener('change', event => {
  if (event.target.matches('input[name="onboarding-palette"]')) {
    applyPalette(event.target.value); recordAppearance();
  }
});
$('palette-form').addEventListener('submit', async event => {
  event.preventDefault();
  recordAppearance();
  displayProfile();
  await show('dashboard-screen');
});
// Reports are sent once. On a lost response we do not silently resubmit,
// because the server may already have stored it.
$('page-content').addEventListener('submit', async event => {
  if (event.target.id !== 'feedback-form') return;
  event.preventDefault();
  const form = event.target, button = form.querySelector('button[type=submit]');
  const status = $('feedback-status'), text = $('feedback-message');
  const value = text.value.trim();
  if (value.length < 5 || value.length > 2000) { status.textContent = 'Напиши от 5 до 2000 символов.'; return; }
  button.disabled = true; status.textContent = 'Отправляем…';
  try {
    const { error } = await supabase.rpc('submit_feedback', { p_category:$('feedback-category').value, p_message:value });
    if (error) throw error;
    text.value = ''; status.textContent = 'Спасибо! Сообщение отправлено.';
  } catch { status.textContent = 'Не удалось подтвердить отправку. Проверь соединение и попробуй позже.'; }
  finally { button.disabled = false; }
});

// Profile and settings controls are bound on the shared container because pages are lazy-loaded.
$('page-content').addEventListener('click', event => {
  if (event.target.closest('#edit-profile')) { editing = true; prepareProfile(); void show('profile-screen'); }
  if (event.target.matches('#dashboard-palettes input[name="dashboard-palette"]') && event.target.value === selectedPalette) {
    toggleSelectedTheme(); recordAppearance();
  }
});
// The description opens after a deliberate hover, or on tap/keyboard.
let rankInfoTimer = null, rankInfoPinned = false;
function showRankInfo(show) {
  const info = $('rank-info'), button = $('rank-info-button');
  if (!info || !button) return;
  info.classList.toggle('is-open', show); info.setAttribute('aria-hidden', String(!show)); button.setAttribute('aria-expanded', String(show));
}
$('page-content').addEventListener('pointerover', event => {
  const row = event.target.closest('#rank-setting');
  if (!row || row.contains(event.relatedTarget) || event.pointerType === 'touch') return;
  clearTimeout(rankInfoTimer); rankInfoTimer = setTimeout(() => showRankInfo(true), 1000);
});
$('page-content').addEventListener('pointerout', event => {
  const row = event.target.closest('#rank-setting');
  if (!row || row.contains(event.relatedTarget)) return;
  clearTimeout(rankInfoTimer); if (!rankInfoPinned) showRankInfo(false);
});
$('page-content').addEventListener('pointerup', event => {
  if (event.pointerType === 'touch' && event.target.closest('#rank-setting') && !event.target.closest('#rank-info-button')) { rankInfoPinned = true; showRankInfo(true); }
});
$('page-content').addEventListener('click', event => {
  const row = event.target.closest('#rank-setting');
  if (!row) { rankInfoPinned = false; showRankInfo(false); return; }
  if (event.target.closest('#rank-info-button')) {
    rankInfoPinned = !rankInfoPinned; showRankInfo(rankInfoPinned);
  }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { clearTimeout(rankInfoTimer); rankInfoPinned = false; showRankInfo(false); } });
// Match the site's Lenis lerp for wheel scrolling while preserving native touch.
// Accumulate the target rather than restarting a browser smooth scroll on every tick.
let paletteScroll = null;
function stopPaletteScroll() {
  if (paletteScroll?.frame != null) window.cancelAnimationFrame(paletteScroll.frame);
  paletteScroll = null;
}
$('page-content').addEventListener('wheel', event => {
  const strip = event.target.closest('#palette-scroll');
  if (!strip || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) return;
  const delta = event.deltaX;
  const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
  const currentTarget = paletteScroll?.strip === strip ? paletteScroll.target : strip.scrollLeft;
  if (!max || !delta || (delta < 0 && currentTarget <= 0) || (delta > 0 && currentTarget >= max)) return;
  // Preserve native horizontal scrolling when motion is reduced.
  if (reducedMotion.matches || !window.requestAnimationFrame) return;
  event.preventDefault();
  if (paletteScroll?.strip !== strip) { stopPaletteScroll(); paletteScroll = {strip, target:strip.scrollLeft, frame:null, last:null}; }
  const state = paletteScroll, multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
  state.target = Math.max(0, Math.min(max, state.target + delta * multiplier * 1.1));
  if (state.frame != null) return;
  const tick = time => {
    if (paletteScroll !== state || !strip.isConnected) { stopPaletteScroll(); return; }
    const dt = state.last == null ? 16.67 : Math.min(50, Math.max(0, time - state.last)); state.last = time;
    const distance = state.target - strip.scrollLeft;
    if (Math.abs(distance) < .5) { strip.scrollLeft = state.target; state.frame = null; paletteScroll = null; return; }
    const before = strip.scrollLeft;
    strip.scrollLeft = before + distance * (1 - Math.pow(1 - .14, dt / (1000/60)));
    // scrollLeft may be integer-rounded; do not leave an immortal RAF on the last pixel.
    if (strip.scrollLeft === before) { strip.scrollLeft = state.target; state.frame = null; paletteScroll = null; return; }
    state.frame = window.requestAnimationFrame(tick);
  };
  state.frame = window.requestAnimationFrame(tick);
}, { passive:false });
$('page-content').addEventListener('pointerdown', event => { if (event.target.closest('#palette-scroll')) stopPaletteScroll(); });
$('page-content').addEventListener('click', event => {
  if (event.target.closest('#rank-unit-swap')) { applyRankUnit(rankUnit === 'yar' ? 'elo' : 'yar'); recordAppearance(); }
});
$('page-content').addEventListener('change', event => {
  if (event.target.matches('#rank-unit-options input[name="rank-unit"]')) { applyRankUnit(event.target.value); recordAppearance(); }
  if (event.target.matches('#dashboard-palettes input[name="dashboard-palette"]') && event.target.value !== selectedPalette) {
    applyPalette(event.target.value); recordAppearance();
  }
});
$('profile-cancel').addEventListener('click', () => { editing = false; show('dashboard-screen'); });
document.querySelectorAll('.signout').forEach(button => button.addEventListener('click', async () => {
  busy(button, true);
  const signedOutUser = appearanceUserId;
  appearanceUserId = null;
  stopAppearancePolling();
  if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    onlineStop?.(); heartbeatStop?.(); onlineStop = null; heartbeatStop = null; onlineUser = null; onlineCount = null;
    dashboardPreloadEnabled = false; pageRequest++;
    // Discard account-specific views on logout.
    $('page-game')?.remove(); frameReady = null; $('page-bot')?.remove(); botFrameReady = null; $('page-watch')?.remove(); watchFrameReady = null; $('page-archive')?.remove(); archiveFrameReady = null;
    ratingView?.destroy(); $('page-rating')?.remove(); ratingView = null;
    profileView?.destroy(); $('page-profile')?.remove(); profileView = null;
    profile = null; applyPalette('monochrome'); applyTheme(null); applyRankUnit('yar'); $('auth-form').reset(); setMode('login');
    window.history.replaceState(null, '', '/');
    await show('auth-screen');
  } catch (error) { appearanceUserId = signedOutUser; startAppearancePolling(); void syncAppearance(); message('sidebar-message', 'Не удалось выйти. Попробуй ещё раз.'); }
  finally { busy(button, false); }
}));

// Keep the page covered until both the session and, when needed, the profile are known.
async function initialize() {
  // Registration is a real deep link; recovery callbacks still take precedence.
  if (window.location.pathname === '/login' && new URLSearchParams(window.location.search).get('mode') === 'signup') setMode('signup');
  // Preserve old bookmarked hash routes, but never touch Supabase callback fragments.
  const legacyPage = window.location.hash.slice(1);
  if (pages.has(legacyPage)) window.history.replaceState(null, '', `/${legacyPage}`);
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const verifiedRecoveryLink = recoveryLinkToken && data.session?.access_token === recoveryLinkToken;
    if (data.session && (recoveryPending() || verifiedRecoveryLink)) {
      setRecoveryPending(true);
      await show('reset-password-screen', true);
    } else if (data.session) {
      if (window.location.pathname === '/' || window.location.pathname === '/login') window.history.replaceState(null, '', '/home');
      await loadProfile(data.session.user, true);
    } else {
      setRecoveryPending(false);
      if (window.location.pathname === '/game') window.history.replaceState(null, '', '/');
      await show(window.location.pathname === '/' ? 'landing-screen' : 'auth-screen', true);
    }
  } catch (error) {
    await show('auth-screen', true);
    message('auth-message', 'Не удалось проверить сессию. Проверь соединение и попробуй войти.');
  }
  document.body.classList.add('startup-ready');
}
export const appReady = initialize();

document.addEventListener('change',event=>{
  if(!event.target.matches?.('input[name=piece-set]'))return;
  setPieceSet(event.target.value);recordAppearance();
  const section=$('piece-full-section'), board=$('piece-full-preview');
  if(section&&board){const opening=section.hidden;section.hidden=false;renderLargePiecePreview(board,event.target.value);if(opening)section.scrollIntoView?.({behavior:reducedMotion.matches?'auto':'smooth',block:'nearest'});}
});
