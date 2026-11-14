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
  requestAnimationFrame(() => requestAnimationFrame(() => next.classList.remove('entering')));
  const focusTarget = next.querySelector('h2') || next.querySelector('.tab.active');
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
document.querySelectorAll('.signout').forEach(button => button.addEventListener('click', async () => {
  busy(button, true);
  const signedOutUser = appearanceUserId;
  appearanceUserId = null;
  if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    profile = null; applyPalette('monochrome'); applyTheme(null); $('auth-form').reset(); setMode('login'); await show('auth-screen');
  } catch (error) { appearanceUserId = signedOutUser; void syncAppearance(); message('dashboard-message', 'Не удалось выйти. Попробуй ещё раз.'); }
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
