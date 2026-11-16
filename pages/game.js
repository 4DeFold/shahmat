import { createClient } from '@supabase/supabase-js';
import { verifyMember } from './member-auth.js';
import './game-theme.js';

const supabase = createClient('https://eswyxbyddkajysogtglp.supabase.co', 'sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
const gate = document.getElementById('game-gate');
const message = document.getElementById('gate-message');
const login = document.getElementById('gate-login');
const retry = document.getElementById('gate-retry');
const memberGame = document.getElementById('member-game');
let checking = false, activeId = null, invalidated = false;

// Account changes in another tab must not leave the prior account's game open.
supabase.auth.onAuthStateChange((_event, session) => {
  if (activeId && session?.user?.id !== activeId) {
    invalidated = true;
    activeId = null;
    memberGame.hidden = true;
    gate.hidden = false;
    message.textContent = 'Аккаунт изменился. Обновите страницу и войдите снова.';
    login.hidden = false;
    retry.hidden = false;
  }
});

async function start() {
  if (checking) return;
  checking = true; retry.hidden = true; login.hidden = true;
  message.textContent = 'Проверяем авторизацию…';
  try {
    const user = await verifyMember(supabase.auth);
    if (!user) {
      message.textContent = 'Для игры в личном кабинете войдите в аккаунт.';
      login.hidden = false;
      return;
    }
    activeId = user.id;
    invalidated = false;
    // Recheck after the async import so an account switch cannot unlock stale state.
    const { startMemberGame } = await import('./member-game.js');
    const verified = await verifyMember(supabase.auth);
    if (invalidated || verified?.id !== user.id) throw new Error('Account changed');
    await startMemberGame(user.id);
    if (invalidated) return;
    gate.hidden = true;
    memberGame.hidden = false;
  } catch {
    activeId = null;
    message.textContent = 'Не удалось проверить аккаунт. Проверьте соединение и попробуйте ещё раз.';
    retry.hidden = false;
    login.hidden = false;
  } finally { checking = false; }
}
retry.addEventListener('click', () => location.reload());
void start();

// In the dashboard, keep the outer page responsible for scrolling and apply
// its selected palette. The frame is same-origin and can also run standalone.
if (window.parent !== window) {
  const reportHeight = () => window.parent.postMessage({ type: 'shahmat-game-height', height: document.querySelector('.member-shell').scrollHeight }, window.location.origin);
  new ResizeObserver(reportHeight).observe(document.querySelector('.member-shell'));
  window.addEventListener('load', reportHeight);
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== 'shahmat-appearance') return;
    const names = { '--page-background': '--bg', '--foreground': '--ink', '--surface': '--surface', '--surface-raised': '--surface-alt', '--line': '--line', '--button-background': '--control', '--button-text': '--control-ink' };
    for (const [name, target] of Object.entries(names)) {
      const value = event.data.colors?.[name];
      if (typeof value === 'string' && value) document.documentElement.style.setProperty(target, value);
    }
  });
}
