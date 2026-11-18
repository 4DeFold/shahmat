import '../smooth-scroll.js';
import { createClient } from '@supabase/supabase-js';
import { cachedUserId, startSessionMonitor } from './member-session.js';
import { createMemberGame } from './member-game.js';
import './game-theme.js';
import { startOnlinePresence, createOnlineCounter } from './online-presence.js';
import { startMatchHeartbeat } from './match-heartbeat.js';
import { createMatchApi } from './match-api.js';

const supabase = createClient('https://eswyxbyddkajysogtglp.supabase.co', 'sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
const ui = createMemberGame({ document, opponentName: async gameId => {
  const { data, error } = await supabase.functions.invoke('matchplay', { body: { action:'opponent', gameId }, timeout: 8000 });
  return error ? null : data;
}, playerRatings: async gameId => {
  const { data, error } = await supabase.rpc('rank_game_players', { p_game:gameId });
  if(error||!Array.isArray(data)) return null;
  try { const {data:avatars}=await supabase.rpc('profile_avatars',{p_names:data.map(row=>row.username).filter(Boolean)}); const byName=new Map((avatars||[]).map(row=>[row.username,row.avatar])); return data.map(row=>({...row,avatar:byName.get(row.username)||null})); }
  catch { return data; }
}, api: createMatchApi(supabase) });
const updateOnline = createOnlineCounter(document);
let stopOnline = null, stopHeartbeat = null;
// A preloaded embedded game stays paused until its parent shows the view.
if (window.parent !== window) ui.hide();
let cachedId = null;
try { cachedId = cachedUserId(window.localStorage); if (cachedId) { const local = JSON.parse(localStorage.getItem(`shahmat.appearance.${cachedId}`) || 'null'); const session = JSON.parse(localStorage.getItem('sb-eswyxbyddkajysogtglp-auth-token') || 'null'); ui.setRatingUnit(local?.rankUnit || session?.user?.user_metadata?.rank_unit); } } catch { /* Storage may be blocked. */ }
startSessionMonitor({
  auth: supabase.auth, cachedId,
  open: id => { void supabase.from('profiles').select('username').eq('id', id).maybeSingle().then(async ({data}) => { ui.setPlayerName(data?.username); if(data?.username) { const result=await supabase.rpc('profile_avatars',{p_names:[data.username]}); ui.setPlayerAvatar(result.data?.[0]?.avatar); } }).catch(() => {}); if (window.parent === window && !stopOnline) { stopOnline = startOnlinePresence(supabase, id, updateOnline); stopHeartbeat = startMatchHeartbeat(supabase, window); } return ui.open(id); },
  logout: () => { stopOnline?.(); stopHeartbeat?.(); ui.destroy(); document.getElementById('member-game').hidden = true; window.top.location.replace('/'); },
  accountChanged: () => { stopOnline?.(); stopHeartbeat?.(); ui.destroy(); document.getElementById('member-game').hidden = true; window.location.reload(); },
});
document.addEventListener('visibilitychange', () => ui.browserVisibility(!document.hidden));
window.addEventListener('online', () => ui.online());
ui.browserVisibility(!document.hidden);
if (window.parent !== window) {
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'shahmat-profile-updated') { ui.setPlayerName(event.data.username); ui.setPlayerAvatar(event.data.avatar); return; }
    if (event.data?.type === 'shahmat-rank-unit') { ui.setRatingUnit(event.data.value); return; }
    if (event.data?.type === 'shahmat-online') { updateOnline(event.data.count); return; }
    if (event.data?.type === 'shahmat-game-hidden') { ui.hide(); return; }
    if (event.data?.type === 'shahmat-game-shown') { ui.show(); return; }
    if (event.data?.type !== 'shahmat-appearance') return;
    const names = { '--page-background': '--bg', '--foreground': '--ink', '--surface': '--surface', '--surface-raised': '--surface-alt', '--line': '--line', '--button-background': '--control', '--button-text': '--control-ink', '--accent': '--accent', '--board-light': '--board-light', '--board-dark': '--board-dark', '--clock-white':'--clock-white', '--clock-black':'--clock-black' };
    for (const [name, target] of Object.entries(names)) {
      const value = event.data.colors?.[name];
      if (typeof value === 'string' && value) document.documentElement.style.setProperty(target, value);
    }
  });
}
