import { Chess } from 'chess.js';
import {renderCaptures,renderThreats,bindThreatButtons} from './board-insights.js';
import { premoveTargets, validPremove, normalizePremove, projectPremoves } from './premove.js';
import { createBoardAnnotations } from './board-annotations.js';
import { createClient } from '@supabase/supabase-js';
import { createMemberBoard } from './member-board.js';
import { createMoveHistory, historyTransition } from './move-history.js';
import { createGameSound } from './game-sound.js';
import { createStockfish, BOT_LEVELS } from './stockfish-engine.js';
import { createBotStorage } from './bot-storage.js';
import { BOT_DEMO_SCENARIOS as scenarios } from './bot-demo-scenarios.js';
import { cachedUserId, startSessionMonitor } from './member-session.js';
import './game-theme.js';

const $ = id => document.getElementById(id);
const shell=$('bot-app'), showcase=$('bot-showcase'), board=$('board');
const supabase=createClient('https://eswyxbyddkajysogtglp.supabase.co','sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
const sound=createGameSound(window), boardView=createMemberBoard({document,board,reducedMotion:()=>motion.matches});
const annotations=createBoardAnnotations({document,board});
const names={q:'ферзь',r:'ладья',b:'слон',n:'конь'};
const piece=(color,type)=>`/pieces/cburnett/${color}${type.toUpperCase()}.svg`;
let level=0, phase='choose', userId=null, store=null, game=null, chess=new Chess(), selected=null, promotion=null, last=null, engine=null, thinking=false, generation=0;
let launchDrain=null, premove=[], historyIndex=null, completedLevels=new Set(), threatKeys=new Set();
let pageVisible=window.parent===window, orbitFrame=null, orbitAngle=0, orbitSpeed=0, lastFrame=0, demoClock=0, carouselPosition=0, carouselVelocity=0, drag=null, suppressClick=false, destroyed=false;
const status=text=>{ if ($('status').textContent!==text) $('status').textContent=text; };
function reveal(id, open) { const el=$(id); if (el.classList.contains('is-open')===open) return; el.classList.toggle('is-open',open); el.inert=!open; el.setAttribute('aria-hidden',String(!open)); }
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Keep the final frame on screen until the identical real board takes over.
async function holdAnimation(el,frames,options) {
  if(motion.matches || !el.animate) return null;
  const animation=el.animate(frames,{...options,fill:'forwards'});
  await animation.finished.catch(()=>{}); return animation;
}
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function cleanBoardClone(source) {
  const clone=source.cloneNode(true); clone.removeAttribute('id'); clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  clone.inert=true; clone.setAttribute('aria-hidden','true'); return clone;
}
function putBoardInOrbit(demo, source) {
  const original=[...demo.wrapper.childNodes], previousPadding=demo.wrapper.style.padding, previousShadow=demo.wrapper.style.boxShadow;
  const rect=source.getBoundingClientRect(), miniature=cleanBoardClone(source);
  Object.assign(miniature.style,{position:'absolute',left:'0',top:'0',width:`${rect.width}px`,height:`${rect.height}px`,transformOrigin:'top left',transform:`scale(${demo.wrapper.offsetWidth/rect.width})`});
  demo.wrapper.style.padding='0'; demo.wrapper.style.boxShadow='none'; demo.wrapper.replaceChildren(miniature);
  return ()=>{ demo.wrapper.replaceChildren(...original); demo.wrapper.style.padding=previousPadding; demo.wrapper.style.boxShadow=previousShadow; };
}

// Real, legal demonstration positions: openings, check, mate and stalemate.
function createDemo(spec,index) {
  const wrapper=document.createElement('div'); wrapper.className='orbit-board'; wrapper.dataset.index=String(index);
  const grid=document.createElement('div'); grid.className='mini-grid'; wrapper.append(grid);
  const cells=new Map();
  for(let rank=8;rank>=1;rank--) for(let f=0;f<8;f++) { const square='abcdefgh'[f]+rank; const cell=document.createElement('div'); cell.className=`mini-square ${(rank+f)%2?'dark':'light'}`; cells.set(square,cell); grid.append(cell); }
  const label=document.createElement('span'); label.className='mini-label'; label.hidden=true; wrapper.append(label); $('orbit-boards').append(wrapper);
  wrapper.dataset.scenario=String(index);
  return {wrapper,cells,label,spec,scenarioIndex:index,chess:new Chess(spec.fen),step:0,resetting:false,nextTick:500+Math.random()*2200};
}
const demos=scenarios.slice(0,8).map(createDemo);
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
async function nextDemo(demo) {
  if(demo.resetting) return;
  demo.resetting=true;
  // Keep the board itself in place: only the pieces and result fade away.
  if(!motion.matches) { demo.wrapper.classList.add('demo-clearing'); await wait(500); }
  demo.scenarioIndex=(demo.scenarioIndex+8)%scenarios.length;
  demo.spec=scenarios[demo.scenarioIndex]; demo.chess=new Chess(demo.spec.fen); demo.step=0; demo.wrapper.dataset.scenario=String(demo.scenarioIndex);
  renderDemo(demo);
  if(!motion.matches) { await new Promise(resolve=>requestAnimationFrame(resolve)); demo.wrapper.classList.remove('demo-clearing'); }
  demo.resetting=false;
}
function stepDemo(demo) {
  if(demo.resetting) return;
  if(demo.step>=demo.spec.moves.length) { void nextDemo(demo); return; }
  try { const move=demo.chess.move(demo.spec.moves[demo.step++]); renderDemo(demo,move); }
  catch { void nextDemo(demo); }
}
// Every level occupies a fixed slot on one shared moving track. A spring moves
// the entire track; even rapid reversals can never collapse the distance between
// two figures or make their orbits overlap.
const stages=[{node:$('orbit-stage'),demos}];
for(let i=1;i<BOT_LEVELS.length;i++) {
  const node=$('orbit-stage').cloneNode(true);
  node.removeAttribute('id'); node.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  node.querySelector('.hero-piece').src=piece('w',BOT_LEVELS[i].piece);
  $('orbit-stage').parentNode.append(node);
  const items=[...node.querySelectorAll('.orbit-board')].map((wrapper,index)=>{
    const cells=new Map(), squares=wrapper.querySelectorAll('.mini-square'); let k=0;
    for(let rank=8;rank>=1;rank--) for(let f=0;f<8;f++) cells.set('abcdefgh'[f]+rank,squares[k++]);
    const demo={wrapper,cells,label:wrapper.querySelector('.mini-label'),spec:scenarios[index],scenarioIndex:index,chess:new Chess(scenarios[index].fen),step:0,resetting:false,nextTick:500+Math.random()*2200};
    renderDemo(demo); return demo;
  });
  stages.push({node,demos:items});
}
function positionStage(scene) {
  const {node,demos:items}=scene, width=node.clientWidth;
  if(scene.layoutWidth!==width) {
    scene.layoutWidth=width;
    // Exact worst-case rotated square bounds at every orbit angle. This brings
    // the path close to both rails without letting any corner cross them.
    const half=items[0].wrapper.offsetWidth/2, limit=Math.max(0,width/2-6);
    scene.radius=Math.max(0,Math.sqrt(Math.max(0,limit*limit-half*half))-half);
    node.style.setProperty('--orbit-radius',`${scene.radius}px`);
  }
  const rx=scene.radius, ry=scene.radius;
  items.forEach((demo,i)=>{
    const angle=orbitAngle+i*Math.PI/4, x=Math.cos(angle)*rx, y=Math.sin(angle)*ry;
    // The bottom (white/player side) points radially away from the figure.
    const rotation=angle*180/Math.PI-90;
    demo.wrapper.style.transform=`translate(-50%,-50%) translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${rotation.toFixed(2)}deg)`;
    demo.wrapper.style.zIndex=String(y>0?4:1); demo.rotation=rotation;
  });
}
function positionOrbit() {
  const width=$('orbit-stage').clientWidth, pitch=width*1.12;
  stages.forEach((scene,index)=>{
    const distance=index-carouselPosition;
    scene.node.style.transform=`translate3d(${(distance*pitch).toFixed(2)}px,0,0)`;
    scene.node.style.visibility=Math.abs(distance)>1.9?'hidden':'visible';
    if(Math.abs(distance)<=1.9) positionStage(scene);
  });
}
function animateOrbit(t) {
  orbitFrame=null; if(!pageVisible || document.hidden || destroyed || phase==='playing' || phase==='finished' || motion.matches) return;
  const dt=lastFrame ? Math.min((t-lastFrame)/1000,.05):0; lastFrame=t;
  const target=(phase==='launching'||phase==='returning')?5.8:.25; orbitSpeed+=(target-orbitSpeed)*Math.min(1,dt*((phase==='launching'||phase==='returning')?3:1.4)); orbitAngle+=orbitSpeed*dt;
  // Critically damped spring, shared by all scenes (no per-item easing).
  carouselVelocity+=(level-carouselPosition)*55*dt; carouselVelocity*=Math.exp(-15*dt); carouselPosition+=carouselVelocity*dt;
  if(Math.abs(level-carouselPosition)<.0005 && Math.abs(carouselVelocity)<.002) { carouselPosition=level; carouselVelocity=0; }
  positionOrbit();
  if(launchDrain) { const top=showcase.getBoundingClientRect().top; for(const demo of launchDrain) if(demo.wrapper.getBoundingClientRect().bottom<=top) demo.wrapper.style.visibility='hidden'; }
  if(phase==='choose') {
    demoClock+=dt*1000;
    stages.forEach((scene,index)=>{ if(Math.abs(index-carouselPosition)>1.9) return; for(const demo of scene.demos) if(demoClock>=demo.nextTick) { stepDemo(demo); demo.nextTick=demoClock+1200+Math.random()*2000; } });
  }
  orbitFrame=requestAnimationFrame(animateOrbit);
}
function startOrbit() { positionOrbit(); lastFrame=0; if(pageVisible && !document.hidden && !motion.matches && orbitFrame===null && (phase==='choose'||phase==='launching'||phase==='returning')) orbitFrame=requestAnimationFrame(animateOrbit); }
function stopOrbit() { if(orbitFrame!==null) cancelAnimationFrame(orbitFrame); orbitFrame=null; lastFrame=0; }
window.addEventListener('resize',positionOrbit);
motion.addEventListener('change',()=>{ stopOrbit(); if(motion.matches) { carouselPosition=level; carouselVelocity=0; } startOrbit(); });
document.addEventListener('visibilitychange',()=>{ if(document.hidden) stopOrbit(); else startOrbit(); });

function showLevel() {
  const bot=BOT_LEVELS[level];
  $('bot-name').textContent=bot.name; $('bot-completed').hidden=!completedLevels.has(level+1);
  $('game-bot-piece').src=piece('b',bot.piece); $('game-bot-name').textContent=bot.name;
  $('bot-prev').disabled=level===0; $('bot-next').disabled=level===BOT_LEVELS.length-1;
}
function switchLevel(next) {
  if(phase!=='choose' || next<0 || next>=BOT_LEVELS.length || next===level) return;
  level=next; showLevel();
  if(motion.matches) { carouselPosition=level; carouselVelocity=0; positionOrbit(); return; }
  const title=$('bot-name'); title.getAnimations().forEach(animation=>animation.cancel());
  title.animate([{opacity:.4},{opacity:1}],{duration:280,easing:'ease-out'});
  orbitSpeed=Math.min(7,Math.max(orbitSpeed,2.8)+.35); startOrbit();
}
$('bot-prev').addEventListener('click',()=>switchLevel(level-1)); $('bot-next').addEventListener('click',()=>switchLevel(level+1));
function setPhase(value) {
  phase=value; shell.dataset.phase=value; const inGame=value==='playing'||value==='finished';
  showcase.inert=inGame||value==='launching'||value==='returning'; showcase.setAttribute('aria-hidden',String(inGame||value==='launching'||value==='returning'));
  $('bot-board-wrap').inert=!inGame; $('bot-board-wrap').setAttribute('aria-hidden',String(!inGame));
  for(const id of ['bot-actions','moves']) { $(id).inert=!inGame; $(id).setAttribute('aria-hidden',String(!inGame)); }
  if(inGame || value==='returning') stopOrbit(); else startOrbit();
}
function projected() { return premove.length ? projectPremoves(chess,premove,'w') : chess; }
function shownChess() { if(historyIndex===null)return projected();const p=new Chess();chess.history().slice(0,historyIndex).forEach(m=>p.move(m));return p; }
function draw(move=null,transitions=[]) {
  const shown=shownChess(), isLive=historyIndex===null;
  const legal=selected&&isLive?(chess.turn()==='w'&&!premove.length?chess.moves({square:selected,verbose:true}):premoveTargets(shown,selected,'w')).map(m=>m.to):[];
  const displayedLast=isLive?last:shown.history({verbose:true}).at(-1);
  boardView.render({shown,selected,legal,last:displayedLast,premoves:isLive?premove:[],actual:isLive&&premove.length?chess:null,premoveMode:chess.turn()!=='w'||premove.length>0,animatedMove:isLive?move:null,transitions});
  const actualShown=isLive?chess:shown;renderCaptures(actualShown,'w',$('bot-player-captured'),$('bot-opponent-captured'));renderThreats(actualShown,'w',boardView,threatKeys);
}
function setThreat(code,down){if(!['KeyQ','KeyE'].includes(code))return;if(down&&(!pageVisible||!['playing','finished'].includes(phase)))return;if(down)threatKeys.add(code);else threatKeys.delete(code);draw();}
bindThreatButtons(document,setThreat);for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{if(!['KeyQ','KeyE'].includes(e.code))return;if(type==='keydown'&&(e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')||document.querySelector('dialog[open]')))return;setThreat(e.code,type==='keydown');});window.addEventListener('blur',()=>{setThreat('KeyQ',false);setThreat('KeyE',false);});
const renderMoves=createMoveHistory({document,list:$('move-list'),count:$('move-count'),onSelect:showHistory});
function history() { const length=chess.history().length,index=historyIndex??length;renderMoves(chess,historyIndex);$('history-first').disabled=$('history-prev').disabled=index===0;$('history-next').disabled=$('history-last').disabled=index===length; }
function showHistory(index) {
 const length=chess.history().length,old=historyIndex??length; historyIndex=index>=length?null:Math.max(0,index); selected=null; annotations.clear();draw(null,historyTransition(chess,old,historyIndex??length));history();
 status(historyIndex!==null?`Просмотр позиции: ход ${historyIndex} из ${length}.`:phase==='finished'?'Партия завершена.':chess.turn()==='w'?'Ваш ход.':'Ход бота.');
}
function navigateHistory(key) { if(!pageVisible || !['playing','finished'].includes(phase) || promotion || document.querySelector('dialog[open]'))return false;const delta=key==='ArrowLeft'||key.toLowerCase()==='a'?-1:key==='ArrowRight'||key.toLowerCase()==='d'?1:0;if(!delta)return false;showHistory((historyIndex??chess.history().length)+delta);return true; }
function handleNavigation(key,code='') {
 const physical=code==='KeyA'?'a':code==='KeyD'?'d':key;
 if(pageVisible && phase==='choose' && !document.querySelector('dialog[open]')) {
  if(physical==='ArrowLeft'||physical.toLowerCase()==='a') { switchLevel(level-1); return true; }
  if(physical==='ArrowRight'||physical.toLowerCase()==='d') { switchLevel(level+1); return true; }
  if(physical==='Enter' && !$('bot-play').disabled) { $('bot-play').click(); return true; }
 }
 return navigateHistory(physical);
}
for(const [id,fn] of [['history-first',()=>0],['history-prev',()=>(historyIndex??chess.history().length)-1],['history-next',()=>(historyIndex??chess.history().length)+1],['history-last',()=>chess.history().length]]) $(id).addEventListener('click',()=>showHistory(fn()));
document.addEventListener('keydown',event=>{if(event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])'))return;if(event.key==='Enter' && event.target.closest?.('button,a'))return;if(handleNavigation(event.key,event.code))event.preventDefault();});
function snapshot() { game.moves=chess.history(); game.updated_at=new Date().toISOString(); store?.put(game); }
function finishIfNeeded() {
  if(!game || phase!=='playing') return false;
  let result='';
  if(chess.isCheckmate()) { game.status=chess.turn()==='w'?'black_win':'white_win'; result=chess.turn()==='w'?'Мат. Бот победил.':'Мат. Вы победили!'; }
  else if(chess.isStalemate()) { game.status='draw'; result='Ничья: пат.'; }
  else if(chess.isDraw() || chess.history().length>=1000) { game.status='draw'; result='Ничья.'; }
  if(!result) return false;
  if(game.status==='white_win'){completedLevels.add(level+1);store?.markWin(level+1);}
  thinking=false; premove=[]; draw(); setPhase('finished'); reveal('resign-wrap',false); status(result); snapshot(); return true;
}
function resignAvailable() { return phase==='playing' && game && Date.now()-Date.parse(game.started_at)>=60000; }
function updateResign() { reveal('resign-wrap',!!resignAvailable()); }
const timer=setInterval(updateResign,1000);
async function botMove() {
  if(!game || phase!=='playing' || chess.turn()!=='b' || chess.isGameOver() || thinking) return;
  const current=++generation; thinking=true; status(!engine && level===5 ? 'Загружаем полную сеть Stockfish (около 75 МБ)…' : 'Stockfish думает…');
  try {
    if(!engine) engine=createStockfish(level);
    const [move]=await Promise.all([engine.move(chess.fen()),wait(500)]);
    if(current!==generation || phase!=='playing') return;
    cancelDrag(); selected=null; if(promotion?.premove) { promotion=null; reveal('promotion',false); } last=chess.move(move); thinking=false; draw(last); history(); sound.play(chess.isCheck()?'check':last.captured?'capture':'move');
    if(!finishIfNeeded()) {
      snapshot();
      const queued=premove.shift();
      if(queued && validPremove(chess,queued,'w')) { play(normalizePremove(chess,queued)); return; }
      if(queued) { premove=[]; draw(); }
      status(historyIndex!==null ? `Просмотр позиции: ход ${historyIndex} из ${chess.history().length}.` : queued ? 'Предварительный ход отменён: он больше невозможен.' : chess.isCheck()?'Шах! Ваш ход.':'Ваш ход.');
    }
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
  const moves=(chess.turn()==='w'&&!premove.length?chess.moves({square:from,verbose:true}):premoveTargets(projected(),from,'w')).filter(m=>m.to===to);
  if(!moves.length) return false;
  if(chess.turn()!=='w' && premove.length>=20){status('Можно добавить не более 20 предварительных ходов.');return true;}
  if(moves.some(m=>m.promotion)) {
    promotion={from,to,premove:chess.turn()!=='w'}; reveal('promotion',true); const options=$('promotion-options'); options.replaceChildren();
    for(const type of ['q','r','b','n']) { const button=document.createElement('button'); button.type='button'; button.setAttribute('aria-label',names[type]); const img=document.createElement('img'); img.src=piece('w',type); img.alt=''; button.append(img); button.addEventListener('click',()=>{ if(!promotion)return; const choice=promotion; promotion=null; reveal('promotion',false); if(choice.premove && chess.turn()!=='w') { if(premove.length>=20)return; premove.push({from:choice.from,to:choice.to,promotion:type}); selected=null; draw(); status('Предварительный ход готов. До 20 ходов; пустая клетка отменяет очередь.'); } else play({from:choice.from,to:choice.to,promotion:type}); }); options.append(button); } options.firstElementChild.focus();
  } else if(chess.turn()!=='w') { if(premove.length>=20){status('Можно добавить не более 20 предварительных ходов.');return true;} premove.push({from,to}); selected=null; draw(); status('Предварительный ход готов. До 20 ходов; пустая клетка отменяет очередь.'); } else play({from,to});
  return true;
}
board.addEventListener('click',event=>{
  if(suppressClick || promotion || phase!=='playing' || historyIndex!==null) return;
  const square=event.target.closest('[data-square]')?.dataset.square; if(!square) return;
  sound.prime();
  if(selected && attempt(selected,square)) return;
  if(premove.length && !projected().get(square)) { premove=[]; selected=null; draw(); status(chess.turn()==='w'?'Ваш ход.':'Ход бота.'); return; }
  selected=projected().get(square)?.color==='w' && selected!==square?square:null; draw(); boardView.cell(square)?.focus();
});
board.addEventListener('pointerdown',event=>{ if(event.button===2 && premove.length) { premove=[]; selected=null; draw(); status('Ход бота.'); } if(event.button!==0||phase!=='playing'||promotion||historyIndex!==null) return; const cell=event.target.closest('[data-square]'); if(cell && projected().get(cell.dataset.square)?.color==='w') drag={from:cell.dataset.square,x:event.clientX,y:event.clientY,pointer:event.pointerId,ghost:null,cell}; });
board.addEventListener('pointermove',event=>{
  if(!drag||drag.pointer!==event.pointerId) return;
  if(!drag.ghost && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5) { board.setPointerCapture?.(event.pointerId); selected=drag.from; draw(); drag.ghost=document.createElement('img'); drag.ghost.className='drag-ghost'; drag.ghost.src=piece('w',projected().get(drag.from).type); drag.ghost.alt=''; drag.ghost.style.setProperty('--drag-size',`${drag.cell.getBoundingClientRect().width}px`); drag.cell.classList.add('dragging'); document.body.append(drag.ghost); }
  if(drag.ghost) drag.ghost.style.transform=`translate3d(${event.clientX}px,${event.clientY}px,0) translate(-50%,-50%)`;
});
function cancelDrag() { if(!drag)return; drag.ghost?.remove(); drag.cell.classList.remove('dragging'); drag=null; }
function endDrag(event,cancel=false) {
  if(!drag || drag.pointer!==event.pointerId) return; const d=drag; drag=null; if(!d.ghost) return;
  d.ghost.remove(); d.cell.classList.remove('dragging'); const target=!cancel && document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-square]')?.dataset.square;
  suppressClick=true; setTimeout(()=>{suppressClick=false;},0); if(!target || !attempt(d.from,target)) { selected=null; draw(); }
}
board.addEventListener('pointerup',event=>endDrag(event)); board.addEventListener('pointercancel',event=>endDrag(event,true));
document.addEventListener('keydown',event=>{ if(event.key==='Escape' && premove.length) { premove=[]; selected=null; draw(); status(chess.turn()==='w'?'Ваш ход.':'Ход бота.'); } });
$('toggle-moves').addEventListener('click',()=>{ const toggle=$('toggle-moves'), expanded=toggle.getAttribute('aria-expanded')!=='true'; toggle.setAttribute('aria-expanded',String(expanded)); $('history-content').classList.toggle('is-collapsed',!expanded); $('history-content').inert=!expanded; });
$('resign-button').addEventListener('click',()=>{ if(resignAvailable()) $('resign-dialog').showModal(); });
$('resign-cancel').addEventListener('click',()=>$('resign-dialog').close());
$('resign-confirm').addEventListener('click',()=>{ $('resign-dialog').close(); if(!resignAvailable()) return; ++generation; engine?.destroy(); engine=null; thinking=false; premove=[]; cancelDrag(); draw(); game.status='black_win'; snapshot(); setPhase('finished'); status('Вы сдались. ЯР не изменился.'); updateResign(); });
$('return-button').addEventListener('click',()=>void returnToSelection());
async function returnToSelection() {
  if(phase!=='playing' && phase!=='finished') return;
  if(phase==='playing' && !confirm('Вернуться к выбору? Текущая партия будет удалена.')) return;
  const current=++generation; engine?.destroy(); engine=null; thinking=false; premove=[]; cancelDrag(); annotations.clear();
  const passed=game?.status==='white_win'; if(game) store?.remove(game.id);
  reveal('promotion',false); reveal('retry-wrap',false); promotion=null;
  const target=$('target-board');
  if(!motion.matches && pageVisible && !document.hidden && target.animate) {
    setPhase('returning');
    const from=target.getBoundingClientRect(), flyer=cleanBoardClone(target);
    flyer.classList.add('fly-board');
    Object.assign(flyer.style,{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`});
    document.body.append(flyer); target.style.visibility='hidden';
    // One continuous flight: the existing game board shrinks, turns and leaves
    // above the page. No miniature or orbit is shown until the flight ends.
    const upward=from.top+from.height/2+from.width*.12+32;
    const animation=await holdAnimation(flyer,[
      {offset:0,transform:'translateY(0) rotate(0deg) scale(1)',opacity:1},
      {offset:.45,transform:`translateY(${-from.height*.18}px) rotate(-105deg) scale(.56)`,opacity:1},
      {offset:1,transform:`translateY(${-upward}px) rotate(-300deg) scale(.10)`,opacity:0},
    ],{duration:1450,easing:'cubic-bezier(.45,0,.55,1)'});
    animation?.cancel(); flyer.remove(); target.style.visibility='';
    if(current!==generation || destroyed) return;
  }
  game=null; chess=new Chess(); selected=null; last=null; setPhase('choose'); status(''); showLevel(); if(passed){await wait(motion.matches?0:650);if(current===generation&&!destroyed)switchLevel(Math.min(BOT_LEVELS.length-1,Math.max(...completedLevels)));}
  if(pageVisible && !document.hidden) animateEntry();
}
$('retry-bot').addEventListener('click',()=>{ reveal('retry-wrap',false); void botMove(); });
async function launch() {
  if(phase!=='choose'||!userId||!store) return;
  sound.prime(); const current=++generation;
  game={id:crypto.randomUUID(),level:level+1,moves:[],status:'active',started_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  chess=new Chess(); selected=null; premove=[]; historyIndex=null; annotations.clear(); last=null; draw(); history(); snapshot();
  fadeEntryIntoLaunch(); setPhase('launching'); status('Готовим доску…');
  if(!motion.matches) {
    const scene=stages[level]; let chosen=null, restoreBoard=null;
    const restoreMiniature=()=>{
      restoreBoard?.();
      for(const item of scene.demos) item.wrapper.style.visibility='';
      launchDrain=null;
    };
    // First accelerate and let an interrupted carousel settle. Only replace a
    // board when it is completely above the clipped viewport, never on screen.
    const started=performance.now();
    while(current===generation && !destroyed && pageVisible && !document.hidden && !motion.matches && performance.now()-started<8000) {
      const top=showcase.getBoundingClientRect().top;
      if(!chosen && performance.now()-started>600 && Math.abs(carouselPosition-level)<.025 && Math.abs(carouselVelocity)<.15) {
        chosen=scene.demos.find(demo=>demo.wrapper.getBoundingClientRect().bottom<=top-2) || null;
        if(chosen) {
          restoreBoard=putBoardInOrbit(chosen,$('target-board'));
          launchDrain=scene.demos.filter(item=>item!==chosen);
        }
      } else if(chosen) {
        const rect=chosen.wrapper.getBoundingClientRect(), bounds=showcase.getBoundingClientRect(), slot=$('orbit-slot').getBoundingClientRect();
        if(rect.top>=bounds.top+2 && rect.left>=Math.max(bounds.left,slot.left) && rect.right<=Math.min(bounds.right,slot.right)) break;
      }
      await wait(16);
    }
    if(current!==generation || destroyed) { restoreMiniature(); return; }
    if(chosen && pageVisible && !document.hidden && !motion.matches && performance.now()-started<8000) {
      const from=chosen.wrapper.getBoundingClientRect(), to=$('target-board').getBoundingClientRect();
      const flyer=cleanBoardClone($('target-board')); flyer.classList.add('fly-board');
      const size=chosen.wrapper.offsetWidth, dx=from.left+from.width/2-(to.left+to.width/2), dy=from.top+from.height/2-(to.top+to.height/2);
      const rotation=chosen.rotation||0, finalRotation=Math.round(rotation/360)*360;
      Object.assign(flyer.style,{left:`${to.left}px`,top:`${to.top}px`,width:`${to.width}px`,height:`${to.height}px`}); document.body.append(flyer); chosen.wrapper.style.visibility='hidden';
      const animation=await holdAnimation(flyer,[{transform:`translate(${dx}px,${dy}px) rotate(${rotation}deg) scale(${size/to.width})`},{transform:`translate(0,0) rotate(${finalRotation}deg) scale(1)`}],{duration:1350,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
      if(current!==generation || destroyed) { animation?.cancel(); flyer.remove(); restoreMiniature(); return; }
      // Keep the completed flyer opaque while the live board is laid out.
      // Replace them together in the next paint, without an opacity crossfade.
      $('target-board').style.visibility='hidden';
      shell.classList.add('board-arrival'); setPhase('playing'); updateResign(); status('Ваш ход. Вы играете белыми.');
      await nextFrame(); $('target-board').style.visibility=''; flyer.remove(); animation?.cancel(); restoreMiniature();
      requestAnimationFrame(()=>shell.classList.remove('board-arrival'));
    } else {
      restoreMiniature(); setPhase('playing'); updateResign(); status('Ваш ход. Вы играете белыми.');
    }
  } else {
    if(current!==generation || destroyed) return;
    setPhase('playing'); updateResign(); status('Ваш ход. Вы играете белыми.');
  }
}
$('bot-play').addEventListener('click',()=>void launch());
async function restore(id) {
  userId=id; store=createBotStorage({client:supabase,userId:id,storage:window.localStorage,onStatus:text=>{$('save-status').textContent=/^(Партия сохранена|Сохраняем партию)/.test(text)?'':text;}});
  const wins=await store.completed();if(destroyed||userId!==id)return;completedLevels=new Set(wins);if(phase==='choose'&&wins.length){level=Math.min(BOT_LEVELS.length-1,Math.max(...wins));carouselPosition=level;carouselVelocity=0;showLevel();positionOrbit();}
  const row=await store.restore(); if(destroyed || userId!==id || phase!=='choose' || !row) return;
  try {
    if(!Number.isInteger(row.level) || row.level<1 || row.level>6 || !Array.isArray(row.moves) || row.moves.length>1000 || !Number.isFinite(Date.parse(row.started_at))) throw Error('invalid save');
    const restored=new Chess(); for(const move of row.moves) { if(restored.isGameOver()) throw Error('invalid save'); restored.move(move); }
    game=row; chess=restored; level=row.level-1; carouselPosition=level; carouselVelocity=0; showLevel(); draw(); history(); setPhase('playing'); updateResign();
    if(!finishIfNeeded()) { status(chess.turn()==='w'?'Партия восстановлена. Ваш ход.':'Партия восстановлена. Ход бота.'); if(chess.turn()==='b') void botMove(); }
  } catch { game=null; status('Не удалось восстановить партию. Можно начать новую.'); }
}
showLevel(); draw(); startOrbit(); if(pageVisible) animateEntry(); $('bot-play').disabled=true;
function setPlayerAvatar(value) { const img=$('bot-player-avatar-image'), custom=typeof value==='string'&&/^data:image\/(?:png|jpeg);base64,/.test(value); img.src=custom?value:'/pieces/cburnett/wN.svg'; img.classList.toggle('custom-profile-avatar',custom); }
startSessionMonitor({auth:supabase.auth,cachedId:cachedUserId(localStorage),open:async id=>{ void Promise.all([supabase.from('profile_media').select('avatar').eq('user_id',id).maybeSingle(),supabase.from('profile_rewards').select('avatar_unlocked').eq('user_id',id).maybeSingle()]).then(([media,reward])=>{if(!destroyed&&userId===id)setPlayerAvatar(!reward.error&&reward.data?.avatar_unlocked?media.data?.avatar:null);}).catch(()=>{}); await restore(id); if(!destroyed) $('bot-play').disabled=false; },logout:()=>{ destroyed=true; ++generation; stopOrbit(); engine?.destroy(); store?.destroy(); clearInterval(timer); sound.destroy(); if(window.parent===window) location.replace('/'); },accountChanged:()=>location.reload()});
window.addEventListener('online',()=>store?.flush());
// If Play is pressed during the entrance, continue from the current opacity
// rather than letting a still-running entrance override the launch fade.
function fadeEntryIntoLaunch() {
  if(motion.matches) return;
  const scene=stages[level].node;
  for(const el of [scene.querySelector('.hero-piece'),...scene.querySelectorAll('.orbit-ring')]) {
    const opacity=Number(getComputedStyle(el).opacity);
    el.getAnimations().forEach(animation=>animation.cancel());
    el.animate([{opacity},{opacity:0}],{duration:950,easing:'cubic-bezier(.22,1,.36,1)'});
  }
}
// React Bits / Magic UI-inspired soft focus and stagger: the orbit is already
// moving underneath; only the individual elements fade into place.
function animateEntry() {
  if(motion.matches || destroyed) return;
  const easing='cubic-bezier(.22,1,.36,1)';
  const animate=(el,frames,duration,delay=0)=>{ el.getAnimations().forEach(animation=>animation.cancel()); el.animate(frames,{duration,delay,easing,fill:'backwards'}); };
  if(phase==='choose') {
    const scene=stages[level].node;
    const hero=scene.querySelector('.hero-piece'); hero.getAnimations().forEach(animation=>animation.cancel());
    const finalFilter=getComputedStyle(hero).filter;
    animate(hero,[{opacity:0,filter:`${finalFilter} blur(8px)`,translate:'0 -18px'},{opacity:1,filter:finalFilter,translate:'0 0'}],1100);
    for(const ring of scene.querySelectorAll('.orbit-ring')) { const opacity=ring.classList.contains('orbit-ring-inner')?.5:1; animate(ring,[{opacity:0},{opacity}],1300,100); }
    scene.querySelectorAll('.orbit-board').forEach((el,index)=>animate(el,[{opacity:0,filter:'blur(3px)'},{opacity:1,filter:'blur(0px)'}],850,80+index*65));
    [document.querySelector('.bot-selector'),$('bot-play')].forEach((el,index)=>animate(el,[{opacity:0,translate:'0 12px'},{opacity:1,translate:'0 0'}],800,200+index*100));
  } else if(phase==='playing'||phase==='finished') {
    for(const el of $('bot-board-wrap').querySelectorAll('.player-row')) animate(el,[{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}],700,100);
  }
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin || event.source!==window.parent) return;
  if(event.data?.type==='shahmat-threat-key'){setThreat(event.data.code,!!event.data.down);return;}
  if(event.data?.type==='shahmat-history-key' && typeof event.data.key==='string') { handleNavigation(event.data.key,event.data.code); return; }
  if(event.data?.type==='shahmat-profile-updated') { setPlayerAvatar(event.data.avatar); return; }
  if(event.data?.type==='shahmat-bot-hidden') { pageVisible=false;setThreat('KeyQ',false);setThreat('KeyE',false); stopOrbit(); return; }
  if(event.data?.type==='shahmat-bot-shown') { const wasHidden=!pageVisible; pageVisible=true; startOrbit(); if(wasHidden) animateEntry(); return; }
  if(event.data?.type!=='shahmat-appearance') return;
  const targets={'--page-background':'--bg','--foreground':'--ink','--surface':'--surface','--surface-raised':'--surface-alt','--line':'--line','--button-background':'--control','--button-text':'--control-ink','--accent':'--accent','--board-light':'--board-light','--board-dark':'--board-dark'};
  for(const [name,target] of Object.entries(targets)) { const value=event.data.colors?.[name]; if(typeof value==='string' && value) document.documentElement.style.setProperty(target,value); }
});
