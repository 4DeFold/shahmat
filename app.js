import { createClient } from '@supabase/supabase-js';
import './theme.js';

// Publishable key is intended for browser use; database access is restricted by RLS.
const supabase = createClient('https://eswyxbyddkajysogtglp.supabase.co', 'sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
const $ = id => document.getElementById(id);
let screen = $('landing-screen');
let mode = 'login';
let profile = null;
let selectedPalette = 'monochrome';
let selectedTheme = null;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const palettes = new Set(['monochrome', 'gray', 'forest', 'atelier', 'wood']);
const landing = document.querySelector('.landing');

function applyTheme(value) {
  selectedTheme = value === 'dark' || value === 'light' ? value : null;
  landing.dataset.paletteTheme = selectedTheme || (systemTheme.matches ? 'dark' : 'light');
}
systemTheme.addEventListener('change', () => { if (!selectedTheme) applyTheme(null); });
function applyPalette(value) {
  selectedPalette = palettes.has(value) ? value : 'monochrome';
  landing.dataset.palette = selectedPalette;
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
  writeAppearance(appearanceUserId, { palette: selectedPalette, theme: selectedTheme, dirty: true, version: (previous?.version || 0) + 1 });
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
    const { error } = await supabase.auth.updateUser({ data: { palette: pending.palette, palette_theme: pending.theme } });
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
    const theme = remote.palette_theme === 'dark' || remote.palette_theme === 'light' ? remote.palette_theme : null;
    if (selectedPalette !== remote.palette || selectedTheme !== theme) {
      applyPalette(remote.palette);
      applyTheme(theme);
      writeAppearance(id, { palette: selectedPalette, theme: selectedTheme, dirty: false, version: latest?.version || 0 });
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
    applyPalette(local.palette); applyTheme(local.theme);
  } else {
    applyPalette(remote.palette); applyTheme(remote.palette_theme);
    writeAppearance(user.id, { palette: selectedPalette, theme: selectedTheme, dirty: false, version: local?.version || 0 });
  }
  void syncAppearance();
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
const pages = new Set(['home', 'play', 'profile', 'settings', 'help']);
const sidebar = $('app-sidebar');
const mobileMenuToggle = $('mobile-menu-toggle');
let sidebarOpen = false;
const isMobileSidebar = () => window.innerWidth <= 700 || (window.innerHeight <= 500 && window.matchMedia('(pointer: coarse)').matches);
function setSidebarOpen(open, { restoreFocus = false } = {}) {
  const mobile = isMobileSidebar();
  sidebarOpen = mobile && open;
  $('dashboard-screen').classList.toggle('sidebar-open', sidebarOpen);
  sidebar.inert = mobile && !sidebarOpen;
  $('mobile-brand').inert = sidebarOpen;
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
function currentPage() {
  const name = window.location.hash.slice(1);
  return pages.has(name) ? name : 'home';
}
function showPage(name, { updateHistory = false, focus = false } = {}) {
  if (!pages.has(name)) name = 'home';
  if (updateHistory && currentPage() !== name) {
    const url = new URL(window.location.href);
    url.hash = name === 'home' ? '' : name;
    window.history.pushState(null, '', url);
  }
  document.querySelectorAll('#dashboard-screen [data-view]').forEach(view => {
    const active = view.dataset.view === name;
    const changed = active && view.hidden;
    view.hidden = !active;
    if (changed && focus && !reducedMotion.matches) {
      view.classList.remove('page-enter');
      void view.offsetWidth;
      view.classList.add('page-enter');
    }
  });
  document.querySelectorAll('#dashboard-screen [data-page]').forEach(button => {
    if (button.dataset.page === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  closeAccountMenu();
  if (focus) {
    window.scrollTo(0, 0);
    const heading = name === 'home' ? $('dashboard-title') : $('page-' + name + '-title');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}
$('dashboard-screen').querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
  setSidebarOpen(false);
  showPage(button.dataset.page, { updateHistory: true, focus: true });
}));
accountToggle.addEventListener('click', () => {
  if (accountToggle.getAttribute('aria-expanded') === 'true') closeAccountMenu();
  else openAccountMenu();
});
document.addEventListener('click', event => {
  if (accountToggle.getAttribute('aria-expanded') === 'true' && !$('sidebar-account').contains(event.target)) closeAccountMenu();
});
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
  screen.hidden = true;
  screen.classList.remove('leaving');
  landing.classList.toggle('palette-active', ['profile-screen', 'palette-screen', 'dashboard-screen'].includes(id));
  if (!immediate) next.classList.add('entering');
  next.hidden = false;
  screen = next;
  if (id === 'dashboard-screen') { setSidebarOpen(false); showPage(currentPage()); }
  else closeAccountMenu(true);
  window.scrollTo(0, 0);
  requestAnimationFrame(() => requestAnimationFrame(() => next.classList.remove('entering')));
  const focusTarget = next.querySelector('[data-view]:not([hidden]) h2') || next.querySelector('h2') || next.querySelector('.tab.active');
  if (focusTarget) {
    if (focusTarget.tagName === 'H2') focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });
  }
  navigating = false;
}
function message(id, text = '') { $(id).textContent = text; }
function busy(button, value) { button.disabled = value; button.setAttribute('aria-busy', String(value)); }
function describe(error) {
  if (error?.code === '23505') return 'Это имя уже занято. Попробуй другое.';
  if (error?.message?.toLowerCase().includes('invalid login credentials')) return 'Неверная почта или пароль.';
  if (error?.message?.toLowerCase().includes('already registered')) return 'Аккаунт с этой почтой уже существует. Попробуй войти.';
  if (error?.message?.toLowerCase().includes('rate limit')) return 'Слишком много попыток. Попробуй позже.';
  return 'Не получилось выполнить действие. Проверь данные и попробуй ещё раз.';
}
function setMode(value) {
  const changed = mode !== value;
  mode = value;
  for (const name of ['login', 'signup']) {
    const tab = $('tab-' + name);
    tab.classList.toggle('active', mode === name);
    tab.setAttribute('aria-pressed', String(mode === name));
  }
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('auth-submit').innerHTML = mode === 'login' ? 'Войти <span>↗</span>' : 'Создать аккаунт <span>↗</span>';
  message('auth-message');
  if (changed && !reducedMotion.matches) {
    const form = $('auth-form');
    form.classList.remove('mode-changing');
    void form.offsetWidth;
    form.classList.add('mode-changing');
  }
}
async function loadProfile(user, immediate = false) {
  const { data, error } = await supabase.from('profiles').select('username,bio,palette').eq('id', user.id).maybeSingle();
  if (error) throw error;
  profile = data;
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
function displayProfile() {
  $('dashboard-title').textContent = 'Привет, ' + profile.username + '.';
  $('dashboard-profile-heading').textContent = profile.username;
  $('dashboard-bio').textContent = profile.bio || 'Здесь можно рассказать немного о себе.';
}
$('play').addEventListener('click', async () => {
  const button = $('play');
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
document.querySelector('[data-action="home"]').addEventListener('click', () => show('landing-screen'));
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('auth-submit');
  if (button.disabled) return;
  busy(button, true); message('auth-message');
  try {
    const credentials = { email: $('email').value.trim(), password: $('password').value };
    const { data, error } = mode === 'signup' ? await supabase.auth.signUp(credentials) : await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;
    if (!data.session) throw new Error('Session missing');
    $('password').value = '';
    await loadProfile(data.session.user);
  } catch (error) { message('auth-message', describe(error)); }
  finally { busy(button, false); }
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
$('dashboard-palettes').addEventListener('click', event => {
  if (event.target.matches('input[name="dashboard-palette"]') && event.target.value === selectedPalette) {
    toggleSelectedTheme(); recordAppearance();
  }
});
$('dashboard-palettes').addEventListener('change', event => {
  if (event.target.matches('input[name="dashboard-palette"]') && event.target.value !== selectedPalette) {
    applyPalette(event.target.value); recordAppearance();
  }
});
$('edit-profile').addEventListener('click', () => { editing = true; prepareProfile(); show('profile-screen'); });
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
    profile = null; applyPalette('monochrome'); applyTheme(null); $('auth-form').reset(); setMode('login');
    const url = new URL(window.location.href); url.hash = ''; window.history.replaceState(null, '', url);
    await show('auth-screen');
  } catch (error) { appearanceUserId = signedOutUser; startAppearancePolling(); void syncAppearance(); message('sidebar-message', 'Не удалось выйти. Попробуй ещё раз.'); }
  finally { busy(button, false); }
}));

// Keep the page covered until both the session and, when needed, the profile are known.
async function initialize() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) await loadProfile(data.session.user, true);
    else await show('landing-screen', true);
  } catch (error) {
    await show('auth-screen', true);
    message('auth-message', 'Не удалось проверить сессию. Проверь соединение и попробуй войти.');
  }
  document.body.classList.add('startup-ready');
}
initialize();
