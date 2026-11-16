import '../smooth-scroll.js';
import { createClient } from '@supabase/supabase-js';
import { cachedUserId, startSessionMonitor } from './member-session.js';
import { createMemberGame } from './member-game.js';
import './game-theme.js';

const supabase = createClient('https://eswyxbyddkajysogtglp.supabase.co', 'sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
const ui = createMemberGame({ document, opponentName: async gameId => {
  const { data, error } = await supabase.functions.invoke('match-opponent', { body: { gameId } });
  return error ? null : data?.username;
}, api: async body => {
  const { data, error } = await supabase.functions.invoke('matchplay', { body });
  if (error || data?.error) throw new Error(data?.error || 'Сервис недоступен');
  return data;
} });
let cachedId = null;
try { cachedId = cachedUserId(window.localStorage); } catch { /* Storage may be blocked. */ }
startSessionMonitor({
  auth: supabase.auth, cachedId,
  open: id => ui.open(id),
  logout: () => { ui.destroy(); document.getElementById('member-game').hidden = true; window.top.location.replace('/'); },
  accountChanged: () => { ui.destroy(); document.getElementById('member-game').hidden = true; window.location.reload(); },
});
document.addEventListener('visibilitychange', () => ui.browserVisibility(!document.hidden));
ui.browserVisibility(!document.hidden);
if (window.parent !== window) {
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'shahmat-game-hidden') { ui.hide(); return; }
    if (event.data?.type === 'shahmat-game-shown') { ui.show(); return; }
    if (event.data?.type !== 'shahmat-appearance') return;
    const names = { '--page-background': '--bg', '--foreground': '--ink', '--surface': '--surface', '--surface-raised': '--surface-alt', '--line': '--line', '--button-background': '--control', '--button-text': '--control-ink', '--board-light': '--board-light', '--board-dark': '--board-dark' };
    for (const [name, target] of Object.entries(names)) {
      const value = event.data.colors?.[name];
      if (typeof value === 'string' && value) document.documentElement.style.setProperty(target, value);
    }
  });
}
