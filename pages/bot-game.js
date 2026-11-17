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
let pageVisible=window.parent===window, orbitFrame=null, orbitAngle=0, orbitSpeed=0, lastFrame=0, demoClock=0, drag=null, suppressClick=false, destroyed=false;
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
  return {wrapper,cells,label,spec,chess:new Chess(spec.fen),step:0,nextTick:500+Math.random()*2200};
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
function stepDemo(demo) {
  if(demo.step>=demo.spec.moves.length) { demo.chess=new Chess(demo.spec.fen); demo.step=0; renderDemo(demo); }
  else { try { const move=demo.chess.move(demo.spec.moves[demo.step++]); renderDemo(demo,move); } catch { demo.chess=new Chess(demo.spec.fen); demo.step=0; renderDemo(demo); } }
}
// Departing stages remain live: their boards keep orbiting and turning while
// the whole constellation and figure slide away together.
const departures=new Set();
function positionStage(stage, boards) {
  const rx=stage.clientWidth*.39, ry=stage.clientHeight*.39;
  boards.forEach((wrapper,i)=>{
    const angle=orbitAngle+i*Math.PI/4, x=Math.cos(angle)*rx, y=Math.sin(angle)*ry;
    const rotation=angle*180/Math.PI+90;
    wrapper.style.transform=`translate(-50%,-50%) translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${rotation.toFixed(2)}deg)`;
    wrapper.style.zIndex=String(y>0?4:1);
    if(stage.id==='orbit-stage') demos[i].rotation=rotation;
  });
}
function positionOrbit() {
  positionStage($('orbit-stage'),demos.map(d=>d.wrapper));
  for(const departure of departures) positionStage(departure.stage,departure.boards);
}
function animateOrbit(t) {
  orbitFrame=null; if(!pageVisible || document.hidden || destroyed || phase==='playing' || phase==='finished' || motion.matches) return;
  const dt=lastFrame ? Math.min((t-lastFrame)/1000,.05):0; lastFrame=t;
  const target=phase==='launching'?5.8:.25; orbitSpeed+=(target-orbitSpeed)*Math.min(1,dt*(phase==='launching'?3:1.4)); orbitAngle+=orbitSpeed*dt; positionOrbit();
  if(phase==='choose') { demoClock+=dt*1000; for(const demo of demos) if(demoClock>=demo.nextTick) { stepDemo(demo); demo.nextTick=demoClock+1200+Math.random()*2000; } }
  orbitFrame=requestAnimationFrame(animateOrbit);
}
function startOrbit() { positionOrbit(); lastFrame=0; if(pageVisible && !document.hidden && !motion.matches && orbitFrame===null && (phase==='choose'||phase==='launching')) orbitFrame=requestAnimationFrame(animateOrbit); }
function stopOrbit() { if(orbitFrame!==null) cancelAnimationFrame(orbitFrame); orbitFrame=null; lastFrame=0; }
window.addEventListener('resize',positionOrbit);
motion.addEventListener('change',()=>{ stopOrbit(); startOrbit(); });
document.addEventListener('visibilitychange',()=>{ if(document.hidden) stopOrbit(); else startOrbit(); });

function showLevel() {
  const bot=BOT_LEVELS[level];
  $('hero-piece').src=piece('w',bot.piece); $('bot-name').textContent=bot.name;
  $('game-bot-piece').src=piece('b',bot.piece); $('game-bot-name').textContent=bot.name;
}
function switchLevel(next, direction=next>level?1:-1) {
  if(phase!=='choose' || next===level) return;
  const stage=$('orbit-stage'), title=$('bot-name');
  if(!motion.matches && stage.animate) {
    // Snapshot the currently visible stage, including an interrupted entry.
    const clone=stage.cloneNode(true), current=getComputedStyle(stage);
    clone.removeAttribute('id'); clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    clone.classList.add('orbit-departure'); clone.style.transform=current.transform; clone.style.opacity=current.opacity;
    stage.parentNode.append(clone);
    const departure={stage:clone,boards:[...clone.querySelectorAll('.orbit-board')]}; departures.add(departure);
    clone.animate([{transform:current.transform,opacity:Number(current.opacity)},{transform:`translateX(${-direction*115}%)`,opacity:0}],{duration:560,easing:'cubic-bezier(.4,0,.6,1)',fill:'forwards'}).finished.catch(()=>{}).finally(()=>{ departures.delete(departure); clone.remove(); });
    stage.getAnimations().forEach(animation=>animation.cancel());
    stage.animate([{transform:`translateX(${direction*115}%)`,opacity:0},{transform:'translateX(0)',opacity:1}],{duration:650,easing:'cubic-bezier(.22,1,.36,1)'});
    title.getAnimations().forEach(animation=>animation.cancel());
    title.animate([{opacity:.35,transform:`translateX(${direction*14}px)`},{opacity:1,transform:'translateX(0)'}],{duration:350,easing:'ease-out'});
    orbitSpeed=Math.min(7,Math.max(orbitSpeed,2.8)+.35); startOrbit();
  }
  level=next; showLevel();
}
$('bot-prev').addEventListener('click',()=>switchLevel((level+5)%6,-1)); $('bot-next').addEventListener('click',()=>switchLevel((level+1)%6,1));
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
  game=null; chess=new Chess(); selected=null; last=null; promotion=null; reveal('promotion',false); reveal('retry-wrap',false); setPhase('choose'); status('');
});
$('retry-bot').addEventListener('click',()=>{ reveal('retry-wrap',false); void botMove(); });
async function launch() {
  if(phase!=='choose'||!userId||!store) return;
  sound.prime(); const current=++generation;
  game={id:crypto.randomUUID(),level:level+1,moves:[],status:'active',started_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  chess=new Chess(); selected=null; last=null; draw(); history(); snapshot();
  demos[0].chess=new Chess(); demos[0].step=0; renderDemo(demos[0]);
  setPhase('launching'); status('Готовим доску…');
  if(!motion.matches) {
    // Replace one miniature with a scaled copy of the real initial board before
    // it leaves the orbit. The travelling board is therefore visually identical
    // at both ends, including its frame, pieces and coordinates.
    const demo=demos[0], initial=$('target-board').getBoundingClientRect();
    const original=[...demo.wrapper.childNodes], previousPadding=demo.wrapper.style.padding;
    const miniature=$('target-board').cloneNode(true);
    miniature.removeAttribute('id'); miniature.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    miniature.inert=true; miniature.setAttribute('aria-hidden','true');
    Object.assign(miniature.style,{position:'absolute',left:'0',top:'0',width:`${initial.width}px`,height:`${initial.height}px`,transformOrigin:'top left',transform:`scale(${demo.wrapper.offsetWidth/initial.width})`});
    demo.wrapper.style.padding='0'; demo.wrapper.replaceChildren(miniature);
    const restoreMiniature=()=>{ demo.wrapper.replaceChildren(...original); demo.wrapper.style.padding=previousPadding; demo.wrapper.style.visibility=''; };
    await wait(1050); if(current!==generation || destroyed) { restoreMiniature(); return; }
    positionOrbit();
    const from=demo.wrapper.getBoundingClientRect(), to=$('target-board').getBoundingClientRect();
    // Animate a clone of the actual board, not a visually different miniature.
    // Its final frame and the live board have identical geometry and contents.
    const flyer=$('target-board').cloneNode(true); flyer.removeAttribute('id'); flyer.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id')); flyer.classList.add('fly-board'); flyer.setAttribute('aria-hidden','true'); flyer.inert=true;
    const size=demo.wrapper.offsetWidth, dx=from.left+from.width/2-(to.left+to.width/2), dy=from.top+from.height/2-(to.top+to.height/2);
    const rotation=demo.rotation||0, finalRotation=Math.round(rotation/360)*360;
    Object.assign(flyer.style,{left:`${to.left}px`,top:`${to.top}px`,width:`${to.width}px`,height:`${to.height}px`}); document.body.append(flyer); demo.wrapper.style.visibility='hidden';
    await runAnimation(flyer,[{transform:`translate(${dx}px,${dy}px) rotate(${rotation}deg) scale(${size/to.width})`},{transform:`translate(0,0) rotate(${finalRotation}deg) scale(1)`}],{duration:1350,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
    if(current!==generation || destroyed) { flyer.remove(); restoreMiniature(); return; }
    shell.classList.add('board-arrival'); setPhase('playing'); updateResign(); status('Ваш ход. Вы играете белыми.');
    flyer.remove(); restoreMiniature();
    requestAnimationFrame(()=>shell.classList.remove('board-arrival'));
  } else {
    if(current!==generation || destroyed) return;
    setPhase('playing'); updateResign(); status('Ваш ход. Вы играете белыми.');
  }
}
$('bot-play').addEventListener('click',()=>void launch());
async function restore(id) {
  userId=id; store=createBotStorage({client:supabase,userId:id,storage:window.localStorage,onStatus:text=>{$('save-status').textContent=/^(Партия сохранена|Сохраняем партию)/.test(text)?'':text;}});
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
