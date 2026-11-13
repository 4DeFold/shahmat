import { createClient } from '@supabase/supabase-js';
import './theme.js';

// Publishable key is intended for browser use; database access is restricted by RLS.
const supabase = createClient('https://eswyxbyddkajysogtglp.supabase.co', 'sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
const $ = id => document.getElementById(id);
let screen = $('landing-screen');
let mode = 'login';
let profile = null;
let editing = false;
let navigating = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

async function show(id) {
  if (navigating || screen.id === id) return;
  navigating = true;
  const next = $(id);
  screen.classList.add('leaving');
  if (!reducedMotion.matches) await new Promise(resolve => setTimeout(resolve, 300));
  screen.hidden = true;
  screen.classList.remove('leaving');
  next.classList.add('entering');
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
async function loadProfile(user) {
  const { data, error } = await supabase.from('profiles').select('username,bio,palette').eq('id', user.id).maybeSingle();
  if (error) throw error;
  profile = data;
  if (!data) { editing = false; prepareProfile(); await show('profile-screen'); }
  else { displayProfile(); await show('account-screen'); }
}
function prepareProfile() {
  $('profile-kicker').textContent = editing ? 'ТВОЙ ПРОФИЛЬ' : 'ШАГ 01 / 02';
  $('profile-title').textContent = editing ? 'О тебе.' : 'Это ты.';
  $('username').value = profile?.username || '';
  $('bio').value = profile?.bio || '';
  $('profile-submit').innerHTML = editing ? 'Сохранить <span>↗</span>' : 'Продолжить <span>→</span>';
  message('profile-message');
}
function displayProfile() {
  $('account-title').textContent = 'Привет, ' + profile.username + '.';
  $('account-bio').textContent = profile.bio || 'Твой профиль готов.';
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
    const values = { id: auth.user.id, username: $('username').value.trim(), bio: $('bio').value.trim(), palette: 'monochrome' };
    if (!/^[A-Za-z0-9_]{3,24}$/.test(values.username)) throw new Error('Invalid username');
    const { error } = await supabase.from('profiles').upsert(values);
    if (error) throw error;
    profile = values;
    if (editing) { displayProfile(); await show('account-screen'); }
    else await show('palette-screen');
  } catch (error) { message('profile-message', describe(error)); }
  finally { busy(button, false); }
});
$('palette-form').addEventListener('submit', async event => { event.preventDefault(); displayProfile(); await show('account-screen'); });
$('edit-profile').addEventListener('click', () => { editing = true; prepareProfile(); show('profile-screen'); });
document.querySelectorAll('.signout').forEach(button => button.addEventListener('click', async () => {
  busy(button, true);
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    profile = null; $('auth-form').reset(); setMode('login'); await show('auth-screen');
  } catch (error) { message(screen.id === 'account-screen' ? 'account-message' : 'profile-message', 'Не удалось выйти. Попробуй ещё раз.'); }
  finally { busy(button, false); }
}));
