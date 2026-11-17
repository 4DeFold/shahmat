import { Chess } from 'chess.js';
import { createClient } from '@supabase/supabase-js';
import { createMemberBoard } from './member-board.js';
import { createGameSound } from './game-sound.js';
import { createStockfish, BOT_LEVELS } from './stockfish-engine.js';
import { createBotStorage } from './bot-storage.js';
import { cachedUserId, startSessionMonitor } from './member-session.js';
import './game-theme.js';

const $ = id => document.getElementById(id);
const shell=$('bot-app'), showcase=$('bot-showcase'), board=$('board');
const supabase=createClient('https://eswyxbyddkajysogtglp.supabase.co','sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
const sound=createGameSound(window), boardView=createMemberBoard({document,board,reducedMotion:()=>motion.matches});
const names={q:'ферзь',r:'ладья',b:'слон',n:'конь'};
const piece=(color,type)=>`/pieces/cburnett/${color}${type.toUpperCase()}.svg`;
let level=0, phase='choose', userId=null, store=null, game=null, chess=new Chess(), selected=null, promotion=null, last=null, engine=null, thinking=false, generation=0;
let pageVisible=window.parent===window, orbitFrame=null, orbitAngle=0, orbitSpeed=0, lastFrame=0, demoAt=0, drag=null, suppressClick=false, switching=false, destroyed=false;
const status=text=>{ if ($('status').textContent!==text) $('status').textContent=text; };
function reveal(id, open) { const el=$(id); if (el.classList.contains('is-open')===open) return; el.classList.toggle('is-open',open); el.inert=!open; el.setAttribute('aria-hidden',String(!open)); }
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const runAnimation=(el, frames, options)=>{
  if(motion.matches || !el.animate) return Promise.resolve();
  const animation=el.animate(frames,options);
  return animation.finished.catch(()=>{}).finally(()=>animation.cancel());
};

// Real, legal demonstration positions: opening play, check, mate and stalemate.
const scenarios=[
 {moves:['e4','e5','Nf3','Nc6','Bc4','Nf6','d3','Bc5']},
 {moves:['d4','d5','c4','e6','Nc3','Nf6','Bg5','Be7']},
 {fen:'7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',moves:['Qg7#']},
 {moves:['e4','e5','Bc4','Nc6','Qh5','Nf6','Qxf7#']},
 {fen:'7k/8/5KQ1/8/8/8/8/8 w - - 0 1',moves:['Qf7']},
 {moves:['e4','f5','Qh5+','g6','Qxf5','Nf6']},
 {moves:['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6']},
 {moves:['e4','e5','Qh5','Nc6','Bc4','Nf6','Qxf7#']},
];
function createDemo(spec,index) {
  const wrapper=document.createElement('div'); wrapper.className='orbit-board'; wrapper.dataset.index=String(index);
  const grid=document.createElement('div'); grid.className='mini-grid'; wrapper.append(grid);
  const cells=new Map();
  for(let rank=8;rank>=1;rank--) for(let f=0;f<8;f++) { const square='abcdefgh'[f]+rank; const cell=document.createElement('div'); cell.className=`mini-square ${(rank+f)%2?'dark':'light'}`; cells.set(square,cell); grid.append(cell); }
  const label=document.createElement('span'); label.className='mini-label'; label.hidden=true; wrapper.append(label); $('orbit-boards').append(wrapper);
  return {wrapper,cells,label,spec,chess:new Chess(spec.fen),step:0};
}
const demos=scenarios.map(createDemo);
function renderDemo(demo,move=null) {
  for(const [square,cell] of demo.cells) {
    const p=demo.chess.get(square); cell.classList.toggle('last',!!move && (move.from===square || move.to===square));
    cell.classList.toggle('check',!!p && p.type==='k' && p.color===demo.chess.turn() && demo.chess.isCheck());
    let img=cell.firstElementChild;
    if(!p) { img?.remove(); continue; }
    if(!img) { img=document.createElement('img'); img.alt=''; cell.append(img); }
    const src=piece(p.color,p.type); if(img.getAttribute('src')!==src) img.src=src;
  }
  const label=demo.chess.isCheckmate()?'МАТ':demo.chess.isStalemate()?'ПАТ':demo.chess.isCheck()?'ШАХ':'';
  demo.label.hidden=!label; demo.label.textContent=label;
  if(move && !motion.matches) {
    const image=demo.cells.get(move.to)?.querySelector('img');
    const dx=('abcdefgh'.indexOf(move.from[0])-'abcdefgh'.indexOf(move.to[0]))*100;
    const dy=(+move.to[1]- +move.from[1])*100;
    image?.animate?.([{transform:`translate(${dx}%,${dy}%)`},{transform:'translate(0,0)'}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
  }
}
for(const demo of demos) renderDemo(demo);
function stepDemos() {
  for(const demo of demos) {
    if(demo.step>=demo.spec.moves.length) { demo.chess=new Chess(demo.spec.fen); demo.step=0; renderDemo(demo); }
    else { try { const move=demo.chess.move(demo.spec.moves[demo.step++]); renderDemo(demo,move); } catch { demo.chess=new Chess(); demo.step=0; renderDemo(demo); } }
  }
}
function positionOrbit() {
  const stage=$('orbit-stage'), rx=stage.clientWidth*.39, ry=stage.clientHeight*.335;
  demos.forEach((demo,i)=>{const angle=orbitAngle+i*Math.PI/4; const x=Math.cos(angle)*rx,y=Math.sin(angle)*ry; demo.wrapper.style.transform=`translate(-50%,-50%) translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`; demo.wrapper.style.zIndex=String(y>0?4:1);});
}
function animateOrbit(t) {
  orbitFrame=null; if(!pageVisible || document.hidden || destroyed || phase==='playing' || phase==='finished' || motion.matches) return;
  const dt=lastFrame ? Math.min((t-lastFrame)/1000,.05):0; lastFrame=t;
  const target=phase==='launching'?5.8:.25; orbitSpeed+=(target-orbitSpeed)*Math.min(1,dt*(phase==='launching'?3:2)); orbitAngle+=orbitSpeed*dt; positionOrbit();
  if(!demoAt) demoAt=t;
  if(phase==='choose' && t-demoAt>1700) { demoAt=t; stepDemos(); }
  orbitFrame=requestAnimationFrame(animateOrbit);
}
function startOrbit() { positionOrbit(); lastFrame=0; demoAt=0; if(pageVisible && !document.hidden && !motion.matches && orbitFrame===null && (phase==='choose'||phase==='launching')) orbitFrame=requestAnimationFrame(animateOrbit); }
function stopOrbit() { if(orbitFrame!==null) cancelAnimationFrame(orbitFrame); orbitFrame=null; lastFrame=0; }
window.addEventListener('resize',positionOrbit);
motion.addEventListener('change',()=>{ stopOrbit(); startOrbit(); });
document.addEventListener('visibilitychange',()=>{ if(document.hidden) stopOrbit(); else startOrbit(); });

for(let i=0;i<6;i++) { const dot=document.createElement('button'); dot.type='button'; dot.setAttribute('aria-label',`Выбрать: ${BOT_LEVELS[i].name}`); dot.addEventListener('click',()=>void switchLevel(i)); $('bot-dots').append(dot); }
function showLevel() {
  const bot=BOT_LEVELS[level], num=String(level+1).padStart(2,'0');
  $('hero-piece').src=piece('w',bot.piece); $('bot-name').textContent=bot.name; $('bot-subtitle').textContent=`Уровень ${level+1} из 6`;
  $('level-index').textContent=num; $('rail-name').replaceChildren(document.createTextNode(bot.name),Object.assign(document.createElement('span'),{textContent:'.'}));
  $('rail-description').textContent=bot.description; $('rail-level').textContent=`${num} / 06`; $('strength-fill').style.width=`${(level+1)*100/6}%`;
  $('strength-copy').textContent=`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format((level+1)*100/6)}% · условная шкала сложности`;
  [...$('bot-dots').children].forEach((dot,i)=>dot.setAttribute('aria-current',String(i===level)));
  $('game-bot-piece').src=piece('b',bot.piece); $('game-bot-name').textContent=bot.name;
}
async function switchLevel(next, direction=next>level?1:-1) {
  if(phase!=='choose' || switching || next===level) return;
  switching=true;
  // Orbit velocity follows the piece's displacement and eases back to rest.
  orbitSpeed=Math.max(orbitSpeed,2.8); const hero=$('hero-piece'), title=$('bot-name');
  await Promise.all([runAnimation(hero,[{transform:'translate(-50%,-50%)',opacity:1},{transform:`translate(${direction*-110-50}%,-50%)`,opacity:0}],{duration:260,easing:'ease-in',fill:'forwards'}),runAnimation(title,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*18}px)`}],{duration:220,fill:'forwards'})]);
  if(phase!=='choose' || destroyed) { switching=false; return; }
  level=next; showLevel();
  await Promise.all([runAnimation(hero,[{transform:`translate(${direction*110-50}%,-50%)`,opacity:0},{transform:'translate(-50%,-50%)',opacity:1}],{duration:450,easing:'cubic-bezier(.22,1,.36,1)'}),runAnimation(title,[{opacity:0,transform:`translateX(${direction*18}px)`},{opacity:1,transform:'translateX(0)'}],{duration:400,easing:'ease-out'})]);
  switching=false;
}
$('bot-prev').addEventListener('click',()=>void switchLevel((level+5)%6,-1)); $('bot-next').addEventListener('click',()=>void switchLevel((level+1)%6,1));
function setPhase(value) {
  phase=value; shell.dataset.phase=value; const inGame=value==='playing'||value==='finished';
  showcase.inert=inGame||value==='launching'; showcase.setAttribute('aria-hidden',String(inGame||value==='launching'));
  $('bot-board-wrap').inert=!inGame; $('bot-board-wrap').setAttribute('aria-hidden',String(!inGame));
  for(const id of ['bot-actions','moves']) { $(id).inert=!inGame; $(id).setAttribute('aria-hidden',String(!inGame)); }
  if(inGame) stopOrbit(); else startOrbit();
}
function draw(move=null) {
  const legal=selected?chess.moves({square:selected,verbose:true}).map(m=>m.to):[];
  boardView.render({shown:chess,selected,legal,last,animatedMove:move});
}
function history() {
  const moves=chess.history(), list=$('move-list'); list.replaceChildren();
  for(let i=0;i<moves.length;i+=2) { const row=document.createElement('li'); for(const text of [`${i/2+1}.`,moves[i],moves[i+1]||'—']) { const el=document.createElement('span'); el.textContent=text; row.append(el); } list.append(row); }
  $('move-count').textContent=String(Math.ceil(moves.length/2)).padStart(2,'0');
}
function snapshot() { game.moves=chess.history(); game.updated_at=new Date().toISOString(); store?.put(game); }
function finishIfNeeded() {
  if(!game || phase!=='playing') return false;
  let result='';
  if(chess.isCheckmate()) { game.status=chess.turn()==='w'?'black_win':'white_win'; result=chess.turn()==='w'?'Мат. Бот победил.':'Мат. Вы победили!'; }
  else if(chess.isStalemate()) { game.status='draw'; result='Ничья: пат.'; }
  else if(chess.isDraw() || chess.history().length>=1000) { game.status='draw'; result='Ничья.'; }
  if(!result) return false;
  thinking=false; setPhase('finished'); reveal('resign-wrap',false); status(result); snapshot(); return true;
}
function resignAvailable() { return phase==='playing' && game && Date.now()-Date.parse(game.started_at)>=60000; }
function updateResign() { reveal('resign-wrap',!!resignAvailable()); }
const timer=setInterval(updateResign,1000);
async function botMove() {
  if(!game || phase!=='playing' || chess.turn()!=='b' || chess.isGameOver() || thinking) return;
  const current=++generation; thinking=true; status(!engine && level===5 ? 'Загружаем полную сеть Stockfish (около 75 МБ)…' : 'Stockfish думает…');
  try {
    if(!engine) engine=createStockfish(level);
    const move=await engine.move(chess.fen());
    if(current!==generation || phase!=='playing') return;
    last=chess.move(move); thinking=false; draw(last); history(); sound.play(chess.isCheck()?'check':last.captured?'capture':'move');
    if(!finishIfNeeded()) { snapshot(); status(chess.isCheck()?'Шах! Ваш ход.':'Ваш ход.'); }
  } catch (error) {
    if(current!==generation || phase!=='playing') return;
    thinking=false; engine?.destroy(); engine=null; status(`${error.message || 'Не удалось загрузить Stockfish.'} Нажми «Повторить ход».`); reveal('retry-wrap',true);
  }
}
function play(move) {
  if(!game || phase!=='playing' || thinking || chess.turn()!=='w') return;
  try { last=chess.move(move); } catch { return; }
  selected=null; promotion=null; reveal('promotion',false); draw(last); history(); sound.play(chess.isCheck()?'check':last.captured?'capture':'move');
  if(!finishIfNeeded()) { snapshot(); void botMove(); }
}
function attempt(from,to) {
  const moves=chess.moves({square:from,verbose:true}).filter(m=>m.to===to);
  if(!moves.length) return false;
  if(moves.some(m=>m.promotion)) {
    promotion={from,to}; reveal('promotion',true); const options=$('promotion-options'); options.replaceChildren();
    for(const type of ['q','r','b','n']) { const button=document.createElement('button'); button.type='button'; button.setAttribute('aria-label',names[type]); const img=document.createElement('img'); img.src=piece('w',type); img.alt=''; button.append(img); button.addEventListener('click',()=>play({...promotion,promotion:type})); options.append(button); } options.firstElementChild.focus();
  } else play({from,to});
  return true;
}
board.addEventListener('click',event=>{
  if(suppressClick || thinking || promotion || phase!=='playing' || chess.turn()!=='w') return;
  const square=event.target.closest('[data-square]')?.dataset.square; if(!square) return;
  sound.prime(); if(selected && attempt(selected,square)) return;
  selected=chess.get(square)?.color==='w' && selected!==square?square:null; draw(); boardView.cell(square)?.focus();
});
board.addEventListener('pointerdown',event=>{ if(event.button!==0||phase!=='playing'||thinking||promotion||chess.turn()!=='w') return; const cell=event.target.closest('[data-square]'); if(cell && chess.get(cell.dataset.square)?.color==='w') drag={from:cell.dataset.square,x:event.clientX,y:event.clientY,pointer:event.pointerId,ghost:null,cell}; });
board.addEventListener('pointermove',event=>{
  if(!drag||drag.pointer!==event.pointerId) return;
  if(!drag.ghost && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5) { board.setPointerCapture?.(event.pointerId); selected=drag.from; draw(); drag.ghost=document.createElement('img'); drag.ghost.className='drag-ghost'; drag.ghost.src=piece('w',chess.get(drag.from).type); drag.ghost.alt=''; drag.ghost.style.setProperty('--drag-size',`${drag.cell.getBoundingClientRect().width}px`); drag.cell.classList.add('dragging'); document.body.append(drag.ghost); }
  if(drag.ghost) drag.ghost.style.transform=`translate3d(${event.clientX}px,${event.clientY}px,0) translate(-50%,-50%)`;
});
function endDrag(event,cancel=false) {
  if(!drag || drag.pointer!==event.pointerId) return; const d=drag; drag=null; if(!d.ghost) return;
  d.ghost.remove(); d.cell.classList.remove('dragging'); const target=!cancel && document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-square]')?.dataset.square;
  suppressClick=true; setTimeout(()=>{suppressClick=false;},0); if(!target || !attempt(d.from,target)) { selected=null; draw(); }
}
board.addEventListener('pointerup',event=>endDrag(event)); board.addEventListener('pointercancel',event=>endDrag(event,true));
$('toggle-moves').addEventListener('click',()=>{ const toggle=$('toggle-moves'), expanded=toggle.getAttribute('aria-expanded')!=='true'; toggle.setAttribute('aria-expanded',String(expanded)); $('history-content').classList.toggle('is-collapsed',!expanded); $('history-content').inert=!expanded; });
$('resign-button').addEventListener('click',()=>{ if(resignAvailable()) $('resign-dialog').showModal(); });
$('resign-cancel').addEventListener('click',()=>$('resign-dialog').close());
$('resign-confirm').addEventListener('click',()=>{ $('resign-dialog').close(); if(!resignAvailable()) return; ++generation; engine?.destroy(); engine=null; thinking=false; game.status='black_win'; snapshot(); setPhase('finished'); status('Вы сдались. ЯР не изменился.'); updateResign(); });
$('return-button').addEventListener('click',()=>{
  if(phase==='playing' && !confirm('Вернуться к выбору? Текущая партия будет завершена.')) return;
  ++generation; engine?.destroy(); engine=null; thinking=false;
  if(game?.status==='active') { game.status='abandoned'; snapshot(); }
  game=null; chess=new Chess(); selected=null; last=null; promotion=null; reveal('promotion',false); reveal('retry-wrap',false); setPhase('choose'); status('Выбери соперника.');
});
$('retry-bot').addEventListener('click',()=>{ reveal('retry-wrap',false); void botMove(); });
async function launch() {
  if(phase!=='choose'||switching||!userId||!store) return;
  sound.prime(); const current=++generation;
  game={id:crypto.randomUUID(),level:level+1,moves:[],status:'active',started_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  chess=new Chess(); selected=null; last=null; draw(); history(); snapshot(); setPhase('launching'); status('Готовим доску…');
  if(!motion.matches) {
    await wait(1050); if(current!==generation || destroyed) return;
    const demo=demos[0]; demo.chess=new Chess(); demo.step=0; renderDemo(demo); positionOrbit();
    const from=demo.wrapper.getBoundingClientRect(), to=$('target-board').getBoundingClientRect();
    const flyer=demo.wrapper.cloneNode(true); flyer.className='fly-board'; flyer.querySelector('.mini-label')?.remove();
    Object.assign(flyer.style,{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,transform:'none'}); document.body.append(flyer); demo.wrapper.style.opacity='0';
    await runAnimation(flyer,[{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,transform:'rotate(0deg)'},{left:`${to.left}px`,top:`${to.top}px`,width:`${to.width}px`,height:`${to.height}px`,transform:'rotate(360deg)'}],{duration:1100,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
    if(current!==generation || destroyed) { flyer.remove(); demo.wrapper.style.opacity=''; return; }
    Object.assign(flyer.style,{left:`${to.left}px`,top:`${to.top}px`,width:`${to.width}px`,height:`${to.height}px`,transform:'rotate(360deg)'});
    // Crossfade the arriving board into the live board rather than flashing
    // empty space between the two surfaces.
    setPhase('playing'); updateResign(); status('Ваш ход. Вы играете белыми.');
    await runAnimation(flyer,[{opacity:1},{opacity:0}],{duration:550,easing:'ease-out'});
    flyer.remove(); demo.wrapper.style.opacity='';
  } else {
    if(current!==generation || destroyed) return;
    setPhase('playing'); updateResign(); status('Ваш ход. Вы играете белыми.');
  }
}
$('bot-play').addEventListener('click',()=>void launch());
async function restore(id) {
  userId=id; store=createBotStorage({client:supabase,userId:id,storage:window.localStorage,onStatus:text=>{$('save-status').textContent=text;}});
  const row=await store.restore(); if(destroyed || userId!==id || phase!=='choose' || !row) return;
  try {
    if(!Number.isInteger(row.level) || row.level<1 || row.level>6 || !Array.isArray(row.moves) || row.moves.length>1000 || !Number.isFinite(Date.parse(row.started_at))) throw Error('invalid save');
    const restored=new Chess(); for(const move of row.moves) { if(restored.isGameOver()) throw Error('invalid save'); restored.move(move); }
    game=row; chess=restored; level=row.level-1; showLevel(); draw(); history(); setPhase('playing'); updateResign();
    if(!finishIfNeeded()) { status(chess.turn()==='w'?'Партия восстановлена. Ваш ход.':'Партия восстановлена. Ход бота.'); if(chess.turn()==='b') void botMove(); }
  } catch { game=null; status('Не удалось восстановить партию. Можно начать новую.'); }
}
showLevel(); draw(); startOrbit(); $('bot-play').disabled=true;
startSessionMonitor({auth:supabase.auth,cachedId:cachedUserId(localStorage),open:async id=>{ await restore(id); if(!destroyed) $('bot-play').disabled=false; },logout:()=>{ destroyed=true; ++generation; stopOrbit(); engine?.destroy(); store?.destroy(); clearInterval(timer); sound.destroy(); if(window.parent===window) location.replace('/'); },accountChanged:()=>location.reload()});
window.addEventListener('online',()=>store?.flush());
window.addEventListener('message',event=>{
  if(event.origin!==location.origin || event.source!==window.parent) return;
  if(event.data?.type==='shahmat-bot-hidden') { pageVisible=false; stopOrbit(); return; }
  if(event.data?.type==='shahmat-bot-shown') { pageVisible=true; startOrbit(); return; }
  if(event.data?.type!=='shahmat-appearance') return;
  const targets={'--page-background':'--bg','--foreground':'--ink','--surface':'--surface','--surface-raised':'--surface-alt','--line':'--line','--button-background':'--control','--button-text':'--control-ink','--accent':'--accent','--board-light':'--board-light','--board-dark':'--board-dark'};
  for(const [name,target] of Object.entries(targets)) { const value=event.data.colors?.[name]; if(typeof value==='string' && value) document.documentElement.style.setProperty(target,value); }
});
