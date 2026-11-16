import { createClient } from '@supabase/supabase-js';
import { cachedUserId, startSessionMonitor } from './member-session.js';
import './game-theme.js';

const supabase = createClient('https://eswyxbyddkajysogtglp.supabase.co', 'sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
let cachedId = null;
try { cachedId = cachedUserId(window.localStorage); } catch { /* Storage may be blocked. */ }
startSessionMonitor({
  auth: supabase.auth,
  cachedId,
  open: async id => {
    try {
      const { startMemberGame } = await import('./member-game.js');
      await startMemberGame(id);
    } catch {
      document.getElementById('storage-message').textContent = 'Не удалось загрузить партию. Обновите страницу.';
    }
  },
  logout: () => { document.getElementById('member-game').hidden = true; window.top.location.replace('/'); },
  accountChanged: () => { document.getElementById('member-game').hidden = true; window.location.reload(); },
});

// The dashboard owns scrolling and supplies its palette to this game document.
if (window.parent !== window) {
  const reportHeight = () => window.parent.postMessage({ type: 'shahmat-game-height', height: document.querySelector('.member-shell').scrollHeight }, window.location.origin);
  new ResizeObserver(reportHeight).observe(document.querySelector('.member-shell'));
  window.addEventListener('load', reportHeight);
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== 'shahmat-appearance') return;
    const names = { '--page-background': '--bg', '--foreground': '--ink', '--surface': '--surface', '--surface-raised': '--surface-alt', '--line': '--line', '--button-background': '--control', '--button-text': '--control-ink', '--board-light': '--board-light', '--board-dark': '--board-dark' };
    for (const [name, target] of Object.entries(names)) {
      const value = event.data.colors?.[name];
      if (typeof value === 'string' && value) document.documentElement.style.setProperty(target, value);
    }
  });
}
