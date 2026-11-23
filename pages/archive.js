import {installLoadingIndicators} from './loading-indicators.js';
installLoadingIndicators(document, {embeddedFrame:true});
import {createGameSound} from './game-sound.js';
import {pieceSrc as themedPieceSrc} from './piece-theme.js';
import {Chess} from 'chess.js';
import {BOT_LEVELS} from './stockfish-engine.js';
import {renderCaptures,renderThreats,cancelCaptureFlights} from './board-insights.js';
import {createClient} from '@supabase/supabase-js';
import {createBoardAnnotations} from './board-annotations.js';
import Lenis from 'lenis';
import {createMemberBoard} from './member-board.js';
import {createMoveHistory,createHistoryTimeline,historyKeyTarget} from './move-history.js';
import './game-theme.js';
const sound=createGameSound(window);
const $=id=>document.getElementById(id), client=createClient('https://eswyxbyddkajysogtglp.supabase.co','sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const view=createMemberBoard({document,board:$('board'),reducedMotion:reduced});
const annotations=createBoardAnnotations({document,board:$('board'),enabled:()=>!!current});
let archiveScroll=null;function updateScroll(){archiveScroll?.destroy();archiveScroll=null;if(!reduced())archiveScroll=new Lenis({wrapper:$('archive-main'),content:$('archive-content'),lerp:.14,wheelMultiplier:1.1,autoRaf:true,allowNestedScroll:true});}updateScroll();window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',updateScroll);
let mode='all', rows=[], current=null, chess=new Chess(), timeline=null, index=0, offset=0, seq=0, visible=window.parent===window, user=null, username='Вы', hasMore=false, threatKeys=new Set();
async function loadStats(request){
  $('archive-stats-status').textContent='Загрузка…';
  try {
    const {data,error}=await client.rpc('my_archive_stats');
    if(error || !data || typeof data!=='object') throw error || Error('stats unavailable');
    if(request!==seq||!visible)return;
    const modes=['bullet','blitz','rapid','classical','bot'];
    if(modes.some(key=>!Number.isSafeInteger(Number(data[key])) || Number(data[key])<0)) throw Error('invalid stats');
    const total=modes.reduce((sum,key)=>sum+Number(data[key]),0), number=new Intl.NumberFormat('ru-RU');
    for(const el of $('archive-stats').querySelectorAll('[data-count]')) el.textContent=number.format(el.dataset.count==='total'?total:Number(data[el.dataset.count]));
    $('archive-stats-status').textContent='';
  } catch {if(request===seq&&visible){for(const el of $('archive-stats').querySelectorAll('[data-count]'))el.textContent='—';$('archive-stats-status').textContent='Не удалось загрузить статистику.';}}
}
const renderHistory=createMoveHistory({document,list:$('move-list'),count:$('move-count'),onSelect:showHistory});
function replay(moves){const c=new Chess();for(const move of moves||[])c.move(move);return c;}
function miniature(c,flip=false){const grid=document.createElement('span');grid.className='archive-mini';const last=c.history({verbose:true}).at(-1);for(let i=0;i<8;i++)for(let j=0;j<8;j++){const r=flip?i+1:8-i,f=flip?7-j:j,square='abcdefgh'[f]+r,p=c.get(square),el=document.createElement('span');el.className=`archive-mini-square ${(r+f)%2?'dark':'light'}`;if(last&&(last.from===square||last.to===square))el.classList.add('last');if(p?.type==='k'&&p.color===c.turn()&&c.isCheck())el.classList.add('check');if(p){const img=document.createElement('img');img.alt='';img.src=themedPieceSrc(p.color,p.type);el.append(img);}grid.append(el);}return grid;}
function resultOf(row,c){const status=row.mode==='bot'||mode==='bot'?row.status||row.result:row.result;const us=row.my_color||row.player_color||'w';if(c.isStalemate()||row.reason==='stalemate')return ['Пат','draw'];if(c.isCheckmate()||row.reason==='checkmate'){const winner=status==='white_win'?'w':status==='black_win'?'b':c.turn()==='w'?'b':'w';return ['Мат',winner===us?'win':'loss'];}if(status==='draw')return ['Ничья','draw'];if(status==='white_win'||status==='black_win')return [status===(us==='w'?'white_win':'black_win')?'Победа':'Поражение',status===(us==='w'?'white_win':'black_win')?'win':'loss'];return ['','draw'];}
const scoreText=x=>x==null?'':` (${Math.round(Number(x))} ЯР)`;
const botLevel=row=>BOT_LEVELS[Number(row.level)-1];
const botName=row=>`Бот ${botLevel(row)?.name || `${row.level} уровень`}`;
// Build cards immediately: intersection callbacks and image decoding can stall in
// hidden or transitioning iframes and must never keep the archive invisible.
function renderCards(){
 const grid=$('archive-grid');grid.replaceChildren();
 for(const row of rows){
  let c;try{c=replay(row.moves);}catch{c=new Chess();} // Keep damaged records visible.
  const button=document.createElement('button');button.type='button';button.className='archive-card is-ready';
  const bot=row.mode==='bot'||mode==='bot', flip=(row.my_color||row.player_color)==='b';
  const name=bot?botName(row):row.my_color==='w'?row.black_name:row.white_name;
  button.setAttribute('aria-label',name||'Партия');
  const mini=miniature(c,flip),footer=document.createElement('span');footer.className='archive-card-footer';
  const label=document.createElement('strong');label.textContent=(name||'Партия')+(bot?'':scoreText(row.my_color==='w'?row.black_yar:row.white_yar));
  const [text,kind]=resultOf(row,c),result=document.createElement('span');result.className='archive-result '+kind;result.textContent=text;footer.append(label,result);button.append(mini,footer);button.addEventListener('click',()=>open(row,button));grid.append(button);
 }
}
async function load(reset=true){const request=++seq;if(reset){offset=0;rows=[];renderCards();void loadStats(request);}$('archive-status').textContent='';$('archive-status').setAttribute('aria-label','Загрузка');$('archive-status').classList.add('is-loading');$('archive-more').hidden=true;try{if(!user){const result=await client.auth.getUser();if(result.error||!result.data.user)throw Error('auth');user=result.data.user;try{const profile=await client.from('profiles').select('username').eq('id',user.id).maybeSingle();username=profile.data?.username||'Вы';}catch{/* Profile is optional for rendering. */}}let data,error;if(mode==='bot'){({data,error}=await client.from('bot_games').select('id,level,moves,status,updated_at,player_color').eq('user_id',user.id).neq('status','active').order('updated_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+39));}else if(mode==='all')({data,error}=await client.rpc('my_archive_all',{p_offset:offset}));else ({data,error}=await client.rpc('my_archive_games',{p_mode:mode,p_offset:offset}));if(request!==seq||!visible)return;if(error||!Array.isArray(data))throw error||Error('data');if(mode!=='bot'&&data.some(row=>row.mode!=='bot')){try{const ratings=await client.rpc('my_archive_ratings',{p_games:data.filter(row=>row.mode!=='bot').map(row=>row.id)});if(!ratings.error&&Array.isArray(ratings.data)){const map=new Map(ratings.data.map(r=>[r.game_id,r]));data=data.map(row=>({...row,...map.get(row.id)}));}}catch{/* Historical scores can be unavailable. */}}if(request!==seq||!visible)return;offset+=data.length;hasMore=data.length===40;rows.push(...data);if((mode==='bot'||mode==='all')&&user){try{const local=JSON.parse(localStorage.getItem(`shahmat.bot-games.v1.${user.id}`)||'null');const pending=[...(local?.pending||[]),local?.current].filter(x=>x&&x.user_id===user.id&&x.status!=='active'&&Array.isArray(x.moves));const deleted=new Set((local?.pending||[]).filter(item=>item._op==='delete').map(item=>item.id));const byId=new Map(rows.filter(row=>!deleted.has(row.id)).map(row=>[row.id,row]));for(const row of pending){if(deleted.has(row.id))continue;const old=byId.get(row.id);if(!old||Date.parse(row.updated_at)>=Date.parse(old.updated_at))byId.set(row.id,{...row,mode:'bot',finished_at:row.updated_at});}rows=[...byId.values()].sort((a,b)=>Date.parse(b.finished_at||b.updated_at)-Date.parse(a.finished_at||a.updated_at));}catch{/* Local storage can be unavailable. */}}renderCards();$('archive-more').hidden=!hasMore;$('archive-status').textContent=rows.length?'':'Пока нет партий.';}catch{if(request===seq)$('archive-status').textContent='Не удалось загрузить партии.';}finally{if(request===seq){$('archive-status').classList.remove('is-loading');$('archive-status').removeAttribute('aria-label');}}}
function open(row,button){try{chess=replay(row.moves);}catch{return;}current=row;timeline=createHistoryTimeline(chess);annotations.clear();index=timeline.moves.length;const bot=row.mode==='bot'||mode==='bot',flip=(row.my_color||row.player_color)==='b';$('board').classList.toggle('black',flip);$('archive-top-avatar').src=bot?themedPieceSrc(flip?'w':'b',botLevel(row)?.piece||'N'):`/pieces/cburnett/${flip?'w':'b'}N.svg`;$('archive-bottom-avatar').src=`/pieces/cburnett/${flip?'b':'w'}N.svg`;$('white-name').textContent=bot?username:flip?row.black_name+scoreText(row.black_yar):row.white_name+scoreText(row.white_yar);$('black-name').textContent=bot?botName(row):flip?row.white_name+scoreText(row.white_yar):row.black_name+scoreText(row.black_yar);const from=button.querySelector('.archive-mini').getBoundingClientRect();$('archive-grid').hidden=true;$('archive-stats').hidden=true;$('archive-more').hidden=true;$('archive-detail').hidden=false;$('archive-modes').hidden=true;$('archive-history').hidden=false;draw();const target=$('board').parentElement.getBoundingClientRect();if(!reduced()&&target.width&&from.width){$('board').parentElement.animate([{transform:`translate(${from.left-target.left}px,${from.top-target.top}px) scale(${from.width/target.width})`,opacity:.5},{transform:'none',opacity:1}],{duration:480,easing:'cubic-bezier(.22,1,.36,1)'});}}
function close(){threatKeys.clear();annotations.clear();current=null;$('archive-detail').hidden=true;$('archive-history').hidden=true;$('archive-grid').hidden=false;$('archive-stats').hidden=false;$('archive-modes').hidden=false;$('archive-more').hidden=!hasMore;}
function draw(transitions=[],captureMove=null,direction='forward'){if(!timeline)return;cancelCaptureFlights($('archive-player-captured'),$('archive-opponent-captured'));const shown=new Chess(timeline.fens[index]);view.render({shown,last:timeline.moves[index-1],transitions});const color=(current?.my_color||current?.player_color)==='b'?'b':'w';renderCaptures(shown,color,$('archive-player-captured'),$('archive-opponent-captured'),{moves:timeline.moves.slice(0,index),board:$('board'),move:captureMove,direction});renderThreats(shown,color,view,threatKeys);renderHistory(chess,index,timeline.moves);$('history-first').disabled=$('history-prev').disabled=index===0;$('history-next').disabled=$('history-last').disabled=index===timeline.moves.length;}
function showHistory(next){if(!current)return;const old=index;index=Math.max(0,Math.min(timeline.moves.length,next));if(old===index)return;annotations.clear();const move=timeline.moves[Math.max(old,index)-1];draw(timeline.transitions(old,index),Math.abs(index-old)===1?move:null,index===old-1?'backward':'forward');if(move)sound.play(move);}
function setThreat(code,down){if(!['KeyQ','KeyE'].includes(code))return;if(down&&(!visible||!current))return;if(down)threatKeys.add(code);else threatKeys.delete(code);if(current)draw();}
for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{if(!['KeyQ','KeyE'].includes(e.code))return;if(type==='keydown'&&(e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')))return;setThreat(e.code,type==='keydown');});window.addEventListener('blur',()=>{setThreat('KeyQ',false);setThreat('KeyE',false);});
function key(key,code){if(!visible||!current)return false;const target=historyKeyTarget(key,code,index,timeline.moves.length);if(target===null)return false;showHistory(target);return true;}
for(const [id,fn] of [['history-first',()=>0],['history-prev',()=>index-1],['history-next',()=>index+1],['history-last',()=>timeline.moves.length]])$(id).addEventListener('click',()=>showHistory(fn()));
$('archive-back').addEventListener('click',close);$('archive-more').addEventListener('click',()=>load(false));$('archive-modes').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(!b||b.dataset.mode===mode)return;mode=b.dataset.mode;for(const button of $('archive-modes').children)button.setAttribute('aria-pressed',String(button===b));void load();});
document.addEventListener('keydown',e=>{if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!e.target.closest('input,textarea,select,[contenteditable]')&&key(e.key,e.code))e.preventDefault();});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent)return;if(e.data?.type==='shahmat-archive-shown'){visible=true;mode='all';for(const button of $('archive-modes').children)button.setAttribute('aria-pressed',String(button.dataset.mode==='all'));void load();}else if(e.data?.type==='shahmat-archive-hidden'){visible=false;seq++;close();}else if(e.data?.type==='shahmat-threat-key')setThreat(e.data.code,!!e.data.down);else if(e.data?.type==='shahmat-history-key')key(e.data.key,e.data.code);else if(e.data?.type==='shahmat-appearance'){const targets={'--page-background':'--bg','--foreground':'--ink','--surface':'--surface','--surface-raised':'--surface-alt','--line':'--line','--button-background':'--control','--button-text':'--control-ink','--accent':'--accent','--board-light':'--board-light','--board-dark':'--board-dark'};for(const [name,target] of Object.entries(targets))if(typeof e.data.colors?.[name]==='string')document.documentElement.style.setProperty(target,e.data.colors[name]);}});
if(visible)void load();

window.addEventListener('pagehide',event=>{if(!event.persisted)sound.destroy();});
