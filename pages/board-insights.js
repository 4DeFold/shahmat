import {pieceSrc as themedPieceSrc} from './piece-theme.js';
const files='abcdefgh', values={p:1,n:3,b:3,r:5,q:9}, names={p:'пешка',n:'конь',b:'слон',r:'ладья',q:'ферзь'};
// Captures fly from the actual board square into the capturer's strip. The
// model is updated immediately; only a pointer-inert visual copy is animated.
const activeFlights=new WeakMap(), previousTypes=new WeakMap();
function cancelFlight(el) { const stop=activeFlights.get(el); if(stop)stop(); }
function flyCapture(el,board,move,target) {
  const doc=el.ownerDocument,win=doc.defaultView;
  if(!board || !move?.captured || !target || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const square=move.flags?.includes('e') ? move.to[0]+move.from[1] : move.to;
  const cell=board.querySelector(`[data-square="${square}"]`), from=cell?.getBoundingClientRect(), to=target.getBoundingClientRect();
  if(!from?.width || !from.height || !to.width || !to.height || !target.animate) return;
  const ghost=doc.createElement('img');ghost.src=target.src;ghost.alt='';ghost.setAttribute('aria-hidden','true');ghost.className='capture-flight';
  Object.assign(ghost.style,{position:'fixed',left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,zIndex:'9999',pointerEvents:'none',transformOrigin:'top left'});
  doc.body.append(ghost);target.style.opacity='0';
  const x=to.left-from.left,y=to.top-from.top,sx=to.width/from.width,sy=to.height/from.height;
  const animation=ghost.animate([{transform:'translate3d(0,0,0) scale(1,1)'},{transform:`translate3d(${x}px,${y}px,0) scale(${sx},${sy})`}],{duration:360,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
  let done=false;const cleanup=()=>{if(done)return;done=true;target.style.removeProperty('opacity');ghost.remove();if(activeFlights.get(el)===cancel)activeFlights.delete(el);};
  const cancel=()=>{animation.cancel();cleanup();};activeFlights.set(el,cancel);animation.finished.then(cleanup,cleanup);
}
export function renderCaptures(position, playerColor, player, opponent, {moves=null,board=null,move=null} = {}) {
  const captured={w:[],b:[]}, totals={w:0,b:0};
  for(const ply of moves || position.history({verbose:true}))if(ply.captured)captured[ply.color].push(ply.captured);
  for(const rank of position.board())for(const p of rank)if(p&&p.type!=='k')totals[p.color]+=values[p.type];
  for(const [el,color] of [[player,playerColor],[opponent,playerColor==='w'?'b':'w']]){
    if(!el)continue;const types=[...captured[color]].sort((a,b)=>values[a]-values[b]),diff=totals[color]-totals[color==='w'?'b':'w'],key=types.join('')+':'+diff,previous=previousTypes.get(el);
    if(el.dataset.captureKey===key)continue;
    cancelFlight(el);el.dataset.captureKey=key;el.replaceChildren();previousTypes.set(el,types);
    let destination=null;const before=previous?.filter(t=>t===move?.captured).length || 0;
    for(const type of types){const img=el.ownerDocument.createElement('img');img.src=themedPieceSrc(color==='w'?'b':'w',type);img.alt=names[type];el.append(img);if(type===move?.captured)destination=img;}
    if(diff>0){const span=el.ownerDocument.createElement('span');span.textContent='+'+diff;el.append(span);}
    if(previous && move?.color===color && types.length===previous.length+1 && types.filter(t=>t===move.captured).length===before+1)flyCapture(el,board,move,destination);
  }
}
export function renderThreats(position,color,view,keys){
 for(const file of files)for(let rank=1;rank<=8;rank++){const sq=file+rank,cell=view.cell(sq);cell.classList.toggle('threat-enemy',keys.has('KeyQ')&&position.isAttacked(sq,color==='w'?'b':'w'));cell.classList.toggle('threat-own',keys.has('KeyE')&&position.isAttacked(sq,color));}
}
