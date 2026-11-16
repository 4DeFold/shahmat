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
