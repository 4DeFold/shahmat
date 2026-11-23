import {Chess} from 'chess.js';
import {pieceSrc} from './piece-theme.js';

export const controls = {
  bullet:['1+0','1+1','2+0','2+1'], blitz:['3+0','3+2','5+0','5+3'],
  rapid:['10+0','10+5','15+0','15+10'], classical:['30+0','30+20','60+0','60+40'],
};
const icon = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const info = {
 bullet:{name:'Пуля',icon:icon('<path d="M7 19 5 17l9-9c2-2 4-3 6-3 0 2-1 4-3 6l-9 9Z"/><path d="m8 14 3 3M5 19l-2 2"/>')},
 blitz:{name:'Блиц',icon:icon('<path d="M12 22c-4 0-7-3-7-7 0-3 2-6 4-8 0 3 2 3 2 3 1-3 2-5 4-7 0 4 4 6 4 12 0 4-3 7-7 7Z"/><path d="M9 18c0-2 1-3 3-5 0 3 3 3 3 5a3 3 0 0 1-6 0Z"/>')},
 // Rabbit and turtle: Lucide Icons, ISC license; see licenses/lucide-icons.txt.
 rapid:{name:'Рапид',icon:icon('<g stroke-width="1.05"><path d="M13 16a3 3 0 0 1 2.24 5"/><path d="M18 12h.01"/><path d="M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3"/><path d="M20 8.54V4a2 2 0 1 0-4 0v3"/><path d="M7.612 12.524a3 3 0 1 0-1.6 4.3"/></g>')},
 classical:{name:'Классика',icon:icon('<g stroke-width="1.05"><path d="m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z"/><path d="M4.82 7.9 8 10M15.18 7.9 12 10M16.93 10H20a2 2 0 0 1 0 4H2"/></g>')},
};
export function lastThree(moves) {
  if (!Array.isArray(moves) || moves.length < 3) return null;
  try {
    const chess=new Chess(); for(const move of moves)chess.move(move);
    if(!chess.isCheckmate())return null;
    const before=new Chess(); for(const move of moves.slice(0,-3))before.move(move);
    return {fen:before.fen(), moves:moves.slice(-3)};
  } catch {return null;}
}

export const demoMoveDelay = (random = Math.random) => 500 + Math.floor(random() * 2501);

// Count Up-style cubic ease-out, including interrupted changes and reduced motion.
export function createOnlineCount(element, win) {
 let value=null, target=null, frame=null;
 const cancel=()=>{if(frame!==null)win.cancelAnimationFrame(frame);frame=null;};
 return {
  set(next){
   if(next===target)return; target=next;cancel();
   if(!Number.isSafeInteger(next)||next<0){value=null;element.textContent='—';return;}
   if(value===null||value===next||!win.requestAnimationFrame||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches){value=next;element.textContent=String(next);return;}
   const from=value;let start=null;
   const tick=t=>{if(start===null)start=t;const progress=Math.min(1,Math.max(0,(t-start)/900));value=from+(next-from)*(1-Math.pow(1-progress,3));element.textContent=String(Math.round(value));if(progress<1)frame=win.requestAnimationFrame(tick);else {value=next;frame=null;}};
   frame=win.requestAnimationFrame(tick);
  },destroy:cancel,
 };
}

export function createPlayLobby({document,client,onChoose,onOpenBoard}) {
 const win=document.defaultView, root=document.getElementById('play-lobby'), shell=document.getElementById('member-game');
 const stage=document.getElementById('lobby-stage'), back=document.getElementById('lobby-back'), siteOnline=document.getElementById('lobby-site-online');
 const siteCounter=siteOnline ? createOnlineCount(siteOnline.querySelector('#lobby-site-online-value'),win) : null;
 let screen='kinds',kind='rated',mode=null, selectedTime=null, timers=[], demoGames=[], fetching=null, visible=true, disposed=false, active=false;
 let counts=null, counters=[], pollTimer=null, pollInFlight=false, pollGeneration=0;
 const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const clear=()=>{timers.forEach(id=>win.clearTimeout(id));timers=[];};
 const later=(fn,ms)=>{const id=win.setTimeout(()=>{timers=timers.filter(t=>t!==id);fn();},ms);timers.push(id);};
 const randomDelay=()=>demoMoveDelay();
 function renderBoard(element,chess,move) {
  const frag=document.createDocumentFragment(),mate=chess.isCheckmate();
  for(let r=8;r>=1;r--)for(let f=0;f<8;f++){
   const square='abcdefgh'[f]+r,p=chess.get(square),cell=document.createElement('span');cell.className=`demo-square ${(r+f)%2?'dark':'light'}`;
   if(move&&(square===move.from||square===move.to))cell.classList.add('last');
   if(mate&&p?.type==='k'&&p.color===chess.turn())cell.classList.add('check');
   if(p){const image=document.createElement('img');image.src=pieceSrc(p.color,p.type);image.alt='';cell.append(image);
    if(move&&square===move.to&&!reduced()&&image.animate){const dx=('abcdefgh'.indexOf(move.from[0])-f)*100,dy=(Number(square[1])-Number(move.from[1]))*100;image.animate([{transform:`translate(${dx}%,${dy}%)`},{transform:'translate(0,0)'}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});}}
   frag.append(cell);
  }
  element.replaceChildren(frag);
 }
 function runDemo(card, fading=false) {
  if(!visible||screen!=='kinds'||disposed||!demoGames.length)return;
  const board=card.querySelector('.demo-board'),white=card.querySelector('.demo-white'),black=card.querySelector('.demo-black');
  const game=demoGames[Math.floor(Math.random()*demoGames.length)],chess=new Chess(game.fen);let index=0;
  white.textContent='';black.textContent='';white.className='demo-delta demo-white';black.className='demo-delta demo-black';
  renderBoard(board,chess,null);
  if(fading && !reduced()){void board.offsetWidth;board.classList.remove('demo-fading');}else board.classList.remove('demo-fading');
  const next=()=>{
   if(!visible||screen!=='kinds'||disposed)return;
   let move;try{move=chess.move(game.moves[index++]);}catch{return;}
   renderBoard(board,chess,move);
   if(index<game.moves.length){later(next,randomDelay());return;}
   if(chess.isCheckmate()) {
    const winner=chess.turn()==='w'?'black':'white',n=2+Math.floor(Math.random()*49),rated=card.dataset.kind==='rated';
    for(const [el,color] of [[white,'white'],[black,'black']]){const won=color===winner;el.textContent=rated?`${won?'+':'−'}${n} ЯР`:'0 ЯР';el.className=`demo-delta demo-${color} is-visible ${rated?(won?'positive':'negative'):'neutral'}`;}
   }
   later(()=>{
    if(reduced()){runDemo(card);return;}
    board.classList.add('demo-fading');white.classList.remove('is-visible');black.classList.remove('is-visible');
    later(()=>runDemo(card,true),360);
   },1000);
  };
  later(next,randomDelay());
 }
 function startDemos(){clear();if(!visible||screen!=='kinds')return;for(const card of stage.querySelectorAll('.kind-card'))runDemo(card);}
 async function load(){
  if(!active || fetching || demoGames.length || disposed)return fetching;
  fetching=(async()=>{try{const {data,error}=await client.rpc('play_demo_games');if(error || !Array.isArray(data))throw error||Error('invalid demos');demoGames=data.map(x=>lastThree(x.moves)).filter(Boolean);if(screen==='kinds'&&visible&&!root.hidden)startDemos();}catch{/* No fake demo games. */}finally{fetching=null;}})();return fetching;
 }
 function updateCounts(){
  for(const {counter,filter} of counters){
   const value=counts===null?null:counts.filter(filter).reduce((sum,row)=>sum+row.online,0);
   counter.set(value);
  }
 }
 function countFor(button,filter){
  const label=document.createElement('span');label.className='lobby-online';label.innerHTML='<span class="lobby-online-value">—</span> онлайн';button.append(label);
  counters.push({counter:createOnlineCount(label.firstElementChild,win),filter});
 }
 async function poll(){
  if(!active||!visible||root.hidden||disposed||pollInFlight)return;
  pollInFlight=true;const generation=pollGeneration;
  try{
   const {data,error}=await client.rpc('play_lobby_online_counts');
   if(error||!Array.isArray(data))throw error||Error('invalid counts');
   const rows=data.map(row=>({kind:row.game_kind,mode:row.mode,control:String(row.time_control).replace(/\+0$/, ''),online:Number(row.online)}));
   if(rows.some(row=>!['friendly','rated'].includes(row.kind)||!controls[row.mode]||!Number.isSafeInteger(row.online)||row.online<0||!controls[row.mode].some(c=>c.replace(/\+0$/,'')===row.control)))throw Error('invalid counts');
   if(generation===pollGeneration&&!disposed){counts=rows;updateCounts();}
  } catch {if(generation===pollGeneration&&!disposed){counts=null;updateCounts();}}
  finally {pollInFlight=false;}
 }
 function stopPolling(){pollGeneration++;if(pollTimer!==null)win.clearInterval(pollTimer);pollTimer=null;counts=null;}
 function startPolling(){if(!active||!visible||root.hidden||disposed||pollTimer!==null)return;void poll();pollTimer=win.setInterval(poll,2000);}
 // Shared-element transitions: the old stage stays beneath the real controls.
 // Geometry is measured before/after the render, so both desktop and stacked
 // mobile cards animate from/to the selected card without blocking input.
 let ghost=null,ghostTimer=null,boardGhost=null,boardGhostTimer=null,backGhost=null,backGhostTimer=null,animations=[];
 function clearTransitions(){
  for(const animation of animations)animation.cancel();animations=[];
  if(ghostTimer!==null)win.clearTimeout(ghostTimer);ghostTimer=null;ghost?.remove();ghost=null;
  if(boardGhostTimer!==null)win.clearTimeout(boardGhostTimer);boardGhostTimer=null;boardGhost?.remove();boardGhost=null;
  if(backGhostTimer!==null)win.clearTimeout(backGhostTimer);backGhostTimer=null;backGhost?.remove();backGhost=null;
 }
 function animate(element,frames,options){
  if(!element?.animate)return;
  const animation=element.animate(frames,{fill:'both',...options});animations.push(animation);
  animation.onfinish=()=>{animations=animations.filter(item=>item!==animation);if(!element.closest('.lobby-ghost')&&element!==backGhost&&element!==boardGhost)animation.cancel();};
 }
 function snapshotStage(source){
  if(reduced()||root.hidden||!stage.children.length||!stage.animate)return null;
  const cards=[...stage.children],rects=cards.map(card=>card.getBoundingClientRect());
  const rect=stage.getBoundingClientRect(),outer=shell.getBoundingClientRect();
  ghost=stage.cloneNode(true);ghost.removeAttribute('id');ghost.classList.add('lobby-ghost');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
  Object.assign(ghost.style,{left:`${rect.left-outer.left}px`,top:`${rect.top-outer.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  shell.append(ghost);ghostTimer=win.setTimeout(()=>{ghost?.remove();ghost=null;ghostTimer=null;},900);
  return {cards:[...ghost.children],rects,index:cards.indexOf(source)};
 }
 function rectTransform(from,to){
  const dx=to.left+to.width/2-from.left-from.width/2,dy=to.top+to.height/2-from.top-from.height/2;
  return `translate(${dx}px, ${dy}px) scale(${to.width/Math.max(from.width,1)}, ${to.height/Math.max(from.height,1)})`;
 }
 function animateStage(snapshot,backwards,next){
  if(!snapshot)return;
  const cards=[...stage.children],ease='cubic-bezier(.22,1,.36,1)';
  if(backwards){
   const parent=next==='kinds'?stage.querySelector(`[data-kind="${kind}"]`):stage.querySelector(`[data-mode="${mode}"]`);
   if(!parent)return;
   const target=parent.getBoundingClientRect();
   snapshot.cards.forEach((card,i)=>animate(card,[
    {transform:'none',opacity:1,filter:'blur(0px)'},
    {transform:rectTransform(snapshot.rects[i],target),opacity:0,filter:'blur(9px)'}
   ],{duration:560,easing:ease}));
   cards.forEach(card=>animate(card,card===parent?[
    {opacity:0,transform:'scale(.9)',filter:'blur(10px)',offset:0},
    {opacity:0,transform:'scale(.94)',filter:'blur(8px)',offset:.38},
    {opacity:1,transform:'none',filter:'blur(0px)',offset:1}
   ]:[{opacity:0,transform:'scale(.97)',filter:'blur(8px)'},{opacity:1,transform:'none',filter:'blur(0px)'}],
   {duration:card===parent?650:400,delay:card===parent?0:260,easing:ease}));
  }else if(snapshot.index>=0){
   const origin=snapshot.rects[snapshot.index];
   snapshot.cards.forEach((card,i)=>animate(card,i===snapshot.index?[
    {opacity:1,transform:'none',filter:'blur(0px)'},
    {opacity:0,transform:'scale(1.13)',filter:'blur(12px)'}
   ]:[{opacity:1,transform:'none',filter:'blur(0px)'},{opacity:0,transform:'scale(.96)',filter:'blur(9px)'}],
   {duration:i===snapshot.index?390:300,easing:ease}));
   cards.forEach((card,i)=>{
    const end=card.getBoundingClientRect();
    animate(card,[{transform:rectTransform(end,origin),opacity:0,filter:'blur(12px)'},
     {transform:'none',opacity:1,filter:'blur(0px)'}],
    {duration:620,delay:75+i*18,easing:ease});
   });
  }
 }
 function snapshotBoard(){
  const board=shell.querySelector(':scope > .board-area');
  if(reduced()||!root.hidden||!board?.animate)return null;
  const rect=board.getBoundingClientRect(),outer=shell.getBoundingClientRect();
  boardGhost=board.cloneNode(true);boardGhost.classList.remove('board-area');boardGhost.classList.add('lobby-board-ghost');
  boardGhost.removeAttribute('id');boardGhost.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  boardGhost.setAttribute('aria-hidden','true');boardGhost.inert=true;
  const padding=win.getComputedStyle(board).padding;
  Object.assign(boardGhost.style,{left:`${rect.left-outer.left}px`,top:`${rect.top-outer.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,padding});
  shell.append(boardGhost);boardGhostTimer=win.setTimeout(()=>{boardGhost?.remove();boardGhost=null;boardGhostTimer=null;},900);
  return {element:boardGhost,rect};
 }
 function animateBoardBack(snapshot){
  if(!snapshot)return;
  const cards=[...stage.children],target=cards.find(card=>card.dataset.control===selectedTime) || cards[0];if(!target)return;
  const ease='cubic-bezier(.22,1,.36,1)';
  animate(snapshot.element,[{transform:'none',opacity:1,filter:'blur(0px)'},{transform:rectTransform(snapshot.rect,target.getBoundingClientRect()),opacity:0,filter:'blur(10px)'}],{duration:560,easing:ease});
  cards.forEach(card=>animate(card,card===target?[
   {opacity:0,transform:'scale(.9)',filter:'blur(10px)',offset:0},{opacity:0,transform:'scale(.94)',filter:'blur(8px)',offset:.38},{opacity:1,transform:'none',filter:'blur(0px)',offset:1}
  ]:[{opacity:0,transform:'scale(.97)',filter:'blur(8px)'},{opacity:1,transform:'none',filter:'blur(0px)'}],{duration:card===target?650:400,delay:card===target?0:260,easing:ease}));
 }
 function animateBoardForward(snapshot){
  if(!snapshot || snapshot.index<0)return;
  const ease='cubic-bezier(.22,1,.36,1)',origin=snapshot.rects[snapshot.index];
  snapshot.cards.forEach((card,i)=>animate(card,i===snapshot.index?[{opacity:1,transform:'none',filter:'blur(0px)'},{opacity:0,transform:'scale(1.13)',filter:'blur(12px)'}]:[{opacity:1,transform:'none',filter:'blur(0px)'},{opacity:0,transform:'scale(.96)',filter:'blur(9px)'}],{duration:i===snapshot.index?390:300,easing:ease}));
  const board=shell.querySelector(':scope > .board-area'),rail=shell.querySelector(':scope > .game-rail');
  if(board){const end=board.getBoundingClientRect();animate(board,[{transform:rectTransform(end,origin),opacity:0,filter:'blur(12px)'},{transform:'none',opacity:1,filter:'blur(0px)'}],{duration:620,delay:75,easing:ease});}
  if(rail)animate(rail,[{opacity:0,transform:'translateX(12px)',filter:'blur(6px)'},{opacity:1,transform:'none',filter:'blur(0px)'}],{duration:480,delay:180,easing:ease});
 }
 function animateBack(previousHidden,nextHidden){
  if(reduced()||!back.animate||previousHidden===nextHidden)return;
  const ease='cubic-bezier(.22,1,.36,1)';
  if(!nextHidden){animate(back,[{opacity:0,transform:'translateY(10px) scale(.96)',filter:'blur(4px)'},{opacity:1,transform:'none',filter:'blur(0px)'}],{duration:380,delay:120,easing:ease});return;}
  // The actual button is hidden immediately for layout; its inert copy fades out.
  const rect=back.getBoundingClientRect(),outer=shell.getBoundingClientRect();
  backGhost=back.cloneNode(true);backGhost.removeAttribute('id');backGhost.removeAttribute('hidden');backGhost.setAttribute('aria-hidden','true');backGhost.tabIndex=-1;
  Object.assign(backGhost.style,{position:'absolute',pointerEvents:'none',zIndex:'2',margin:'0',left:`${rect.left-outer.left}px`,top:`${rect.top-outer.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  shell.append(backGhost);
  animate(backGhost,[{opacity:1,transform:'none',filter:'blur(0px)'},{opacity:0,transform:'translateY(-8px) scale(.96)',filter:'blur(4px)'}],{duration:280,easing:ease});
  backGhostTimer=win.setTimeout(()=>{backGhost?.remove();backGhost=null;backGhostTimer=null;},300);
 }
 const spotlight=event=>{
  if(reduced()||event.pointerType==='touch')return;const card=event.currentTarget===back?back:event.target.closest('.lobby-card');if(!card||card.disabled)return;
  const r=card.getBoundingClientRect();if(!r.width||!r.height)return;
  const x=Math.max(0,Math.min(r.width,event.clientX-r.left)),y=Math.max(0,Math.min(r.height,event.clientY-r.top));
  card.style.setProperty('--mx',`${x}px`);card.style.setProperty('--my',`${y}px`);
  card.style.setProperty('--tilt-x',`${(0.5-y/r.height)*3}deg`);card.style.setProperty('--tilt-y',`${(x/r.width-0.5)*3}deg`);
 };
 // Track the edge light on every card in proximity, including disabled options.
 // Tilt stays on hover; the border highlight can follow the cursor between cards.
 const specular=event=>{
  if(reduced()||event.pointerType==='touch')return;
  for(const card of stage.children){
   const r=card.getBoundingClientRect();if(!r.width||!r.height)continue;
   const dx=event.clientX-(r.left+r.width/2),dy=event.clientY-(r.top+r.height/2);
   const distance=Math.hypot(Math.max(r.left-event.clientX,0,event.clientX-r.right),Math.max(r.top-event.clientY,0,event.clientY-r.bottom));
   card.style.setProperty('--shine-angle',`${Math.atan2(dx,-dy)*180/Math.PI}deg`);
   card.style.setProperty('--shine-opacity',String(.35+.65*Math.max(0,1-distance/250)));
   card.style.setProperty('--tilt-x',`${(0.5-Math.max(0,Math.min(r.height,event.clientY-r.top))/r.height)*3}deg`);
   card.style.setProperty('--tilt-y',`${(Math.max(0,Math.min(r.width,event.clientX-r.left))/r.width-0.5)*3}deg`);
  }
 };
 const resetSpecular=()=>{for(const card of stage.children)card.style.removeProperty('--shine-opacity');};
 root.addEventListener('pointermove',specular);root.addEventListener('pointerleave',resetSpecular);
 stage.addEventListener('pointermove',spotlight);back.addEventListener('pointermove',spotlight);
 function show(next, {backwards=false, source=null, fromBoard=false} = {}) {
  clearTransitions();const wasHidden=back.hidden, showBack=next!=='kinds';
  const previousBoard=fromBoard?snapshotBoard():null;
  const snapshot=previousBoard?null:snapshotStage(source);if(!showBack&&snapshot)animateBack(wasHidden,true);
  clear();counters.forEach(x=>x.counter.destroy());counters=[];screen=next;if(siteOnline)siteOnline.hidden=next!=='kinds';shell.classList.add('lobby-open');root.hidden=false;back.hidden=!showBack;
  const first=!stage.children.length;stage.className=`lobby-stage stage-${screen}${first?' stage-initial':''}`;stage.replaceChildren();
  if(showBack)animateBack(previousBoard?true:wasHidden,false);
  if(screen==='kinds'){
   for(const [key,label] of [['friendly','Товарищеские'],['rated','Ранговые']]){
    const button=document.createElement('button');button.type='button';button.className='kind-card lobby-card';button.dataset.kind=key;
    button.innerHTML=`<span class="demo-frame"><span class="demo-delta demo-black"></span><span class="demo-board" aria-hidden="true"></span><span class="demo-delta demo-white"></span></span><strong>${label}</strong>`;
    countFor(button,row=>row.kind===key);button.addEventListener('click',()=>{kind=key;show('modes',{source:button});});stage.append(button);
   }
   if(demoGames.length)startDemos();else void load();
  } else if(screen==='modes'){
   for(const [key,data] of Object.entries(info)){
    const button=document.createElement('button');button.type='button';button.className='choice-card lobby-card';button.dataset.mode=key;button.innerHTML=`<span class="choice-icon">${data.icon}</span><strong>${data.name}</strong>`;
    countFor(button,row=>row.kind===kind&&row.mode===key);button.addEventListener('click',()=>{mode=key;show('controls',{source:button});});stage.append(button);
   }
   const custom=document.createElement('button');custom.type='button';custom.disabled=true;custom.className='choice-card lobby-card';custom.innerHTML=`<span class="choice-icon">${icon('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>')}</span><strong>Кастом</strong>`;countFor(custom,()=>false);stage.append(custom);
  } else {
   for(const control of controls[mode]){
    const button=document.createElement('button');button.type='button';button.className='choice-card time-card lobby-card';button.dataset.control=control;button.innerHTML=`<strong>${control}</strong>`;
    countFor(button,row=>row.kind===kind&&row.mode===mode&&row.control===control.replace(/\+0$/,''));
    button.addEventListener('click',()=>{if(onChoose({mode,kind,timeControl:control})){selectedTime=control;openBoard(button);}});stage.append(button);
   }
  }
  updateCounts();startPolling();if(previousBoard)animateBoardBack(previousBoard);else animateStage(snapshot,backwards,next);
 }
 function openBoard(source=null){if(root.hidden)return;clearTransitions();const snapshot=source?snapshotStage(source):null;clear();stopPolling();root.hidden=true;shell.classList.remove('lobby-open');animateBoardForward(snapshot);onOpenBoard?.();}
 function showControls(selection){if(selection && controls[selection.mode] && ['friendly','rated'].includes(selection.kind)){kind=selection.kind;mode=selection.mode;selectedTime=selection.timeControl;}if(mode)show('controls',{fromBoard:true});else show('kinds',{fromBoard:true});}
 back.addEventListener('click',()=>show(screen==='controls'?'modes':'kinds',{backwards:true}));
 const onResize=()=>clearTransitions();win.addEventListener('resize',onResize);
 show('kinds');
 return {setSiteOnline(value){siteCounter?.set(value);siteOnline?.setAttribute('aria-label', Number.isSafeInteger(value) && value >= 0 ? `Онлайн на сайте: ${value}` : 'Онлайн на сайте: нет соединения');},activate(){active=true;startPolling();return load();},show,showControls,openBoard,setVisible(value){visible=value;if(visible&&!root.hidden){if(screen==='kinds'){void load();startDemos();}startPolling();}else{clearTransitions();clear();stopPolling();}},destroy(){siteCounter?.destroy();disposed=true;root.removeEventListener('pointermove',specular);root.removeEventListener('pointerleave',resetSpecular);win.removeEventListener('resize',onResize);clear();clearTransitions();stopPolling();counters.forEach(x=>x.counter.destroy());}};
}
