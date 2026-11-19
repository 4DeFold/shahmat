import './profile-card.css';
import '../smooth-scroll.js';
import {createProfileCard} from './profile-card.js';
import { createClient } from '@supabase/supabase-js';
import { cachedUserId, startSessionMonitor } from './member-session.js';
import { createMemberGame } from './member-game.js';
import './game-theme.js';
import { startOnlinePresence, createOnlineCounter } from './online-presence.js';
import { startMatchHeartbeat } from './match-heartbeat.js';
import { startSpectatorPresence } from './spectator-presence.js';
import { createMatchApi } from './match-api.js';

const supabase = createClient('https://eswyxbyddkajysogtglp.supabase.co', 'sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
let watchingGame=null,stopSpectators=null;
function updateSpectators(id){if(id===watchingGame)return;stopSpectators?.();stopSpectators=null;watchingGame=id;if(!id)return;stopSpectators=startSpectatorPresence(supabase,id,{onCount:count=>{const el=document.getElementById('spectator-count');const show=Number.isInteger(count)&&count>0;el.classList.toggle('is-visible',show);el.setAttribute('aria-hidden',String(!show));if(show){document.getElementById('spectator-value').textContent=String(count);el.setAttribute('aria-label',`Зрителей: ${count}`);}}});}
const ui = createMemberGame({ document, onGameChanged:updateSpectators, opponentName: async gameId => {
  const { data, error } = await supabase.functions.invoke('matchplay', { body: { action:'opponent', gameId }, timeout: 8000 });
  if(error||!data?.username) return error ? null : data;
  try { const result=await supabase.rpc('profile_public',{p_name:data.username}); return result.data||data; } catch { return data; }
}, playerRatings: async gameId => {
  const { data, error } = await supabase.rpc('rank_game_players', { p_game:gameId });
  if(error||!Array.isArray(data)) return null;
  try { const names=data.map(row=>row.username).filter(Boolean); const [images,themes,ranking,sets]=await Promise.all([supabase.rpc('profile_avatars',{p_names:names}),supabase.rpc('profile_avatar_themes',{p_names:names}),supabase.rpc('rank_leaderboard',{p_mode:'overall'}),supabase.rpc('profile_piece_sets',{p_names:names})]); const byName=new Map((Array.isArray(images.data)?images.data:[]).map(row=>[row.username,row.avatar]));const palettes=new Map((Array.isArray(themes.data)?themes.data:[]).map(row=>[row.username,row.palette]));const pieceSets=new Map((Array.isArray(sets.data)?sets.data:[]).map(row=>[row.username,row.piece_set]));const places=new Map((Array.isArray(ranking.data)?ranking.data:[]).slice(0,5).map((row,i)=>[row.username,i+1])); return data.map(row=>({...row,avatar:byName.get(row.username)||null,piece_set:pieceSets.get(row.username),palette:palettes.get(row.username),topPlace:places.get(row.username)})); }
  catch { return data; }
}, api: createMatchApi(supabase) });
const ownProfileCard=createProfileCard(document.getElementById('member-game'),supabase,name=>{if(window.parent!==window)window.parent.postMessage({type:'shahmat-open-profile',username:name},window.location.origin);else location.href=`/profile?player=${encodeURIComponent(name)}`;});
const updateOnline = createOnlineCounter(document);
let stopOnline = null, stopHeartbeat = null;
// A preloaded embedded game stays paused until its parent shows the view.
if (window.parent !== window) ui.hide();
let cachedId = null;
try { cachedId = cachedUserId(window.localStorage); if (cachedId) { const local = JSON.parse(localStorage.getItem(`shahmat.appearance.${cachedId}`) || 'null'); const session = JSON.parse(localStorage.getItem('sb-eswyxbyddkajysogtglp-auth-token') || 'null'); ui.setRatingUnit(local?.rankUnit || session?.user?.user_metadata?.rank_unit); } } catch { /* Storage may be blocked. */ }
startSessionMonitor({
  auth: supabase.auth, cachedId,
  open: id => { void supabase.rpc('rank_my_position',{p_mode:'overall'}).then(({data,error}) => { if(!error && data?.[0]) ui.setOwnRating(data[0]); }).catch(()=>{}); void supabase.from('profiles').select('username').eq('id', id).maybeSingle().then(async ({data}) => { ui.setPlayerName(data?.username); if(data?.username) document.getElementById('player-profile-trigger').dataset.profileName=data.username; if(data?.username) { const result=await supabase.rpc('profile_avatars',{p_names:[data.username]}); ui.setPlayerAvatar(result.data?.[0]?.avatar); } }).catch(() => {}); if (window.parent === window && !stopOnline) { stopOnline = startOnlinePresence(supabase, id, updateOnline); stopHeartbeat = startMatchHeartbeat(supabase, window); } return ui.open(id); },
  logout: () => { stopOnline?.(); stopHeartbeat?.(); ownProfileCard.destroy(); ui.destroy(); document.getElementById('member-game').hidden = true; window.top.location.replace('/'); },
  accountChanged: () => { stopOnline?.(); stopHeartbeat?.(); ownProfileCard.destroy(); ui.destroy(); document.getElementById('member-game').hidden = true; window.location.reload(); },
});
document.addEventListener('visibilitychange', () => ui.browserVisibility(!document.hidden));
window.addEventListener('online', () => ui.online());
ui.browserVisibility(!document.hidden);
if (window.parent !== window) {
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'shahmat-threat-key') { ui.setThreat(event.data.code,!!event.data.down); return; }
    if (event.data?.type === 'shahmat-history-key' && typeof event.data.key === 'string') { ui.navigateHistory(event.data.key); return; }
    if (event.data?.type === 'shahmat-profile-updated') { ui.setPlayerName(event.data.username); document.getElementById('player-profile-trigger').dataset.profileName=event.data.username; ui.setPlayerAvatar(event.data.avatar); return; }
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
