import {pieceSrc as themedPieceSrc} from './piece-theme.js';
const files='abcdefgh', values={p:1,n:3,b:3,r:5,q:9}, names={p:'пешка',n:'конь',b:'слон',r:'ладья',q:'ферзь'};
export function renderCaptures(position, playerColor, player, opponent) {
  const captured={w:[],b:[]}, totals={w:0,b:0};
  for(const move of position.history({verbose:true}))if(move.captured)captured[move.color].push(move.captured);
  for(const rank of position.board())for(const p of rank)if(p&&p.type!=='k')totals[p.color]+=values[p.type];
  for(const [el,color] of [[player,playerColor],[opponent,playerColor==='w'?'b':'w']]){
    if(!el)continue;const types=[...captured[color]].sort((a,b)=>values[a]-values[b]),diff=totals[color]-totals[color==='w'?'b':'w'],key=types.join('')+':'+diff;if(el.dataset.captureKey===key)continue;el.dataset.captureKey=key;el.replaceChildren();
    for(const type of types){const img=el.ownerDocument.createElement('img');img.src=themedPieceSrc(color==='w'?'b':'w',type);img.alt=names[type];el.append(img);}if(diff>0){const span=el.ownerDocument.createElement('span');span.textContent='+'+diff;el.append(span);}
  }
}
export function renderThreats(position,color,view,keys){
 for(const file of files)for(let rank=1;rank<=8;rank++){const sq=file+rank,cell=view.cell(sq);cell.classList.toggle('threat-enemy',keys.has('KeyQ')&&position.isAttacked(sq,color==='w'?'b':'w'));cell.classList.toggle('threat-own',keys.has('KeyE')&&position.isAttacked(sq,color));}
}
