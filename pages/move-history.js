import {pieceSrc as themedPieceSrc} from './piece-theme.js';
import { Chess } from 'chess.js';
// Return the target ply, or null for keys that do not navigate history.
export function historyKeyTarget(key, code, index, length) {
  const physical = {KeyA:'a', KeyD:'d', KeyW:'w', KeyS:'s'}[code] || key.toLowerCase();
  if (physical === 'arrowup' || physical === 'w') return 0;
  if (physical === 'arrowdown' || physical === 's') return length;
  if (physical === 'arrowleft' || physical === 'a') return Math.max(0, index - 1);
  if (physical === 'arrowright' || physical === 'd') return Math.min(length, index + 1);
  return null;
}
// One representative move for either direction (or a jump), never for a redraw.
export function historySoundMove(chess, fromPly, toPly) {
  if (fromPly===toPly) return null;
  return chess.history({verbose:true})[Math.max(fromPly,toPly)-1] || null;
}
// Follow stable piece identities through the score, including en passant,
// castling and promotion, so jumps of any distance can be animated in reverse.
export function historyTransition(chess, fromPly, toPly) {
  if(fromPly===toPly)return [];
  const moves=chess.history({verbose:true}), board=new Chess(), identities=new Map();
  for(const rank of board.board())for(const p of rank)if(p)identities.set(p.square,p.square);
  let before,after;
  const capture=ply=>{if(ply===fromPly)before=new Map(identities);if(ply===toPly)after=new Map(identities);}; capture(0);
  for(let i=0;i<Math.max(fromPly,toPly);i++) {
    const m=moves[i];if(!m)break;
    const id=identities.get(m.from); identities.delete(m.from);identities.delete(m.to);
    if(m.flags.includes('e')) identities.delete(m.to[0]+m.from[1]);
    if(m.flags.includes('k')||m.flags.includes('q')) {const r=(m.flags.includes('k')?'h':'a')+m.from[1], t=(m.flags.includes('k')?'f':'d')+m.from[1], rid=identities.get(r);identities.delete(r);if(rid)identities.set(t,rid);}
    if(id)identities.set(m.to,id); capture(i+1);
  }
  if(!before||!after)return [];
  const origins=new Map([...before].map(([square,id])=>[id,square]));
  return [...after].map(([to,id])=>({from:origins.get(id),to})).filter(m=>m.from&&m.from!==m.to);
}
// Cache identities and FENs once for archive navigation; jumps no longer replay the score.
export function createHistoryTimeline(chess) {
  const moves=chess.history({verbose:true}), board=new Chess(), identities=new Map(), states=[], fens=[board.fen()];
  for(const rank of board.board()) for(const p of rank) if(p) identities.set(p.square,p.square);
  states.push(new Map(identities));
  for(const m of moves) {
    const id=identities.get(m.from); identities.delete(m.from); identities.delete(m.to);
    if(m.flags.includes('e')) identities.delete(m.to[0]+m.from[1]);
    if(m.flags.includes('k')||m.flags.includes('q')) {const from=(m.flags.includes('k')?'h':'a')+m.from[1],to=(m.flags.includes('k')?'f':'d')+m.from[1],rook=identities.get(from);identities.delete(from);if(rook)identities.set(to,rook);}
    if(id) identities.set(m.to,id);
    states.push(new Map(identities)); fens.push(m.after);
  }
  return {moves,fens,transitions(from,to) {
    if(from===to||!states[from]||!states[to])return [];
    const origins=new Map([...states[from]].map(([square,id])=>[id,square]));
    return [...states[to]].map(([square,id])=>({from:origins.get(id),to:square})).filter(m=>m.from&&m.from!==m.to);
  }};
}
export function createMoveHistory({document,list,count,onSelect}) {
  const buttons=[], moves=[]; let lastIndex=-1,lastCount=-1,marker=null,markerAnimation=null,lastScore=null;
  function moveMarker(button) {
    if(!marker){marker=document.createElement('span');marker.className='history-marker';marker.setAttribute('aria-hidden','true');list.append(marker);list.classList.add('has-history-marker');}
    if(!button){marker.hidden=true;markerAnimation?.cancel();return;}
    const old=!marker.hidden?marker.getBoundingClientRect():null;markerAnimation?.cancel();markerAnimation=null;marker.hidden=false;const outer=list.getBoundingClientRect(),r=button.getBoundingClientRect();
    const x=r.left-outer.left+list.scrollLeft-list.clientLeft,y=r.top-outer.top+list.scrollTop-list.clientTop;Object.assign(marker.style,{width:`${r.width}px`,height:`${r.height}px`,transform:`translate(${x}px,${y}px)`});
    if(old?.width&&r.width&&marker.animate&&!document.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches){const dx=old.left-r.left,dy=old.top-r.top;markerAnimation=marker.animate([{transform:`translate(${x+dx}px,${y+dy}px)`},{transform:`translate(${x}px,${y}px)`}],{duration:360,easing:'cubic-bezier(.22,1,.36,1)'});}
  }
  list.addEventListener('click',event=>{const button=event.target.closest('[data-history-index]');if(button)onSelect(Number(button.dataset.historyIndex));});
  return function render(chess,index,cachedScore=null) {
    const score=cachedScore || chess.history({verbose:true}); let common=score===lastScore ? moves.length : 0;
    while(common<moves.length&&common<score.length&&moves[common]===score[common].san)common++;
    lastScore=cachedScore;
    while(buttons.length>common){const button=buttons.pop(), row=button.parentElement; button.remove();if(!row.querySelector('button'))row.remove();moves.pop();}
    for(let i=common;i<score.length;i++) {
      const move=score[i]; let row=buttons.at(-1)?.parentElement;
      if(i%2===0){row=document.createElement('li');const n=document.createElement('span');n.className='move-number';n.textContent=`${i/2+1}`;const times=document.createElement('span');times.className='history-times';times.setAttribute('aria-label','Время ходов не записано');times.innerHTML='<span>—</span><span>—</span>';row.append(n,times);list.append(row);}
      const button=document.createElement('button');button.type='button';button.dataset.historyIndex=String(i+1);button.setAttribute('aria-label',`${Math.floor(i/2)+1}${i%2?'...':'.'} ${move.san}`);
      if(move.piece!=='p'){const img=document.createElement('img');img.className='history-piece';img.dataset.side=move.color;img.alt='';img.src=themedPieceSrc(move.color,move.piece);button.append(img);}
      const text=document.createElement('span');text.textContent=move.piece==='p'?move.san:move.san.replace(/^[KQRBN]/,'');button.append(text);row.insertBefore(button,row.querySelector('.history-times'));buttons.push(button);moves.push(move.san);
    }
    const active=index??score.length;
    const oldButton=buttons[lastIndex-1], newButton=buttons[active-1];
    if(oldButton && oldButton!==newButton){oldButton.classList.remove('current');oldButton.removeAttribute('aria-current');}
    if(newButton){newButton.classList.add('current');newButton.setAttribute('aria-current','step');}
    const button=buttons[active-1];
    if(button&&(lastIndex!==active||(index===null&&lastCount!==score.length))){const top=button.getBoundingClientRect().top-list.getBoundingClientRect().top+list.scrollTop,bottom=top+button.offsetHeight;if(top<list.scrollTop)list.scrollTop=top;else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=bottom-list.clientHeight;}
    if(lastIndex!==active||lastCount!==score.length)moveMarker(button);lastIndex=active;lastCount=score.length; if(count)count.textContent=String(Math.ceil(score.length/2)).padStart(2,'0');
  };
}
