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
async function savePalette(value, theme = selectedTheme) {
  if (!palettes.has(value)) throw new Error('Invalid palette');
  const { error } = await supabase.auth.updateUser({ data: { palette: value, palette_theme: theme } });
  if (error) throw error;
}

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
  applyPalette(user.user_metadata?.palette);
  applyTheme(user.user_metadata?.palette_theme);
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
  if (event.target.matches('input[name="onboarding-palette"]') && event.target.value === selectedPalette) toggleSelectedTheme();
});
$('onboarding-palettes').addEventListener('change', event => {
  if (event.target.matches('input[name="onboarding-palette"]')) applyPalette(event.target.value);
});
$('palette-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('palette-submit');
  if (button.disabled) return;
  busy(button, true); message('palette-message');
  const controls = $('onboarding-palettes').querySelectorAll('input');
  controls.forEach(input => { input.disabled = true; });
  try { await savePalette(selectedPalette); displayProfile(); await show('dashboard-screen'); }
  catch (error) { message('palette-message', 'Не удалось сохранить палитру. Попробуй ещё раз.'); }
  finally { controls.forEach(input => { input.disabled = false; }); busy(button, false); }
});
async function updateDashboardPalette(nextPalette, toggleTheme = false) {
  const oldPalette = selectedPalette;
  const oldTheme = selectedTheme;
  const controls = $('dashboard-palettes').querySelectorAll('input');
  controls.forEach(input => { input.disabled = true; });
  if (toggleTheme) toggleSelectedTheme();
  else applyPalette(nextPalette);
  message('dashboard-message');
  try { await savePalette(selectedPalette); message('dashboard-message', toggleTheme ? 'Тема сохранена.' : 'Палитра сохранена.'); }
  catch (error) { applyPalette(oldPalette); applyTheme(oldTheme); message('dashboard-message', 'Не удалось сохранить оформление. Попробуй ещё раз.'); }
  finally { controls.forEach(input => { input.disabled = false; }); }
}
$('dashboard-palettes').addEventListener('click', event => {
  if (event.target.matches('input[name="dashboard-palette"]') && event.target.value === selectedPalette) updateDashboardPalette(selectedPalette, true);
});
$('dashboard-palettes').addEventListener('change', event => {
  if (event.target.matches('input[name="dashboard-palette"]') && event.target.value !== selectedPalette) updateDashboardPalette(event.target.value);
});
$('edit-profile').addEventListener('click', () => { editing = true; prepareProfile(); show('profile-screen'); });
document.querySelectorAll('.signout').forEach(button => button.addEventListener('click', async () => {
  busy(button, true);
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    profile = null; applyPalette('monochrome'); applyTheme(null); $('auth-form').reset(); setMode('login'); await show('auth-screen');
  } catch (error) { message('dashboard-message', 'Не удалось выйти. Попробуй ещё раз.'); }
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
