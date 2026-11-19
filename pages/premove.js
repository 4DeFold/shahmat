import { Chess } from 'chess.js';
const files = 'abcdefgh';
// A sliding piece can cross at most one opposing blocker: only one enemy move
// can occur before a queued move. Friendly pieces cannot disappear in that turn.
export function premoveTargets(chess, from, color) {
  const piece=chess.get(from); if(!piece || piece.color!==color) return [];
  const x=files.indexOf(from[0]), y=Number(from[1])-1, result=[];
  const add=(a,b)=>{ if(a<0||a>7||b<0||b>7||(a===x&&b===y))return; const to=files[a]+(b+1), p=chess.get(to); if(p?.color===color)return; result.push({from,to,...(piece.type==='p'&&(b===0||b===7)?{promotion:'q'}:{})}); };
  if(piece.type==='p') {
    const dy=color==='w'?1:-1, ahead=chess.get(files[x]+(y+dy+1));
    if(ahead?.color!==color) add(x,y+dy);
    for(const dx of [-1,1]) add(x+dx,y+dy);
    if(y===(color==='w'?1:6) && ahead?.color!==color) add(x,y+2*dy);
  } else if(piece.type==='n'||piece.type==='k') {
    const dirs=piece.type==='n'?[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for(const [dx,dy] of dirs)add(x+dx,y+dy);
    if(piece.type==='k' && from===(color==='w'?'e1':'e8')) {
      const rights=chess.fen().split(' ')[2];
      for(const [rook,dest,path,flag] of [['a','c','bcd',color==='w'?'Q':'q'],['h','g','fg',color==='w'?'K':'k']]) {
        const r=chess.get(rook+from[1]), pieces=[...path].map(f=>chess.get(f+from[1])).filter(Boolean);
        if(rights.includes(flag)&&r?.color===color&&r.type==='r'&&!pieces.some(p=>p.color===color)&&pieces.length<=1) {result.push({from,to:rook+from[1]});add(files.indexOf(dest),y);}
      }
    }
  } else {
    const dirs=[]; if(piece.type==='r'||piece.type==='q')dirs.push([1,0],[-1,0],[0,1],[0,-1]); if(piece.type==='b'||piece.type==='q')dirs.push([1,1],[-1,1],[1,-1],[-1,-1]);
    for(const [dx,dy] of dirs){let blockers=0;for(let step=1;step<8;step++){const a=x+dx*step,b=y+dy*step;if(a<0||a>7||b<0||b>7)break;const p=chess.get(files[a]+(b+1)); if(p?.color===color)break; add(a,b); if(p && ++blockers>=2)break;}}
  }
  return result;
}
export function normalizePremove(chess, move) {
  const king=chess.get(move.from), rook=chess.get(move.to);
  if(king?.type==='k' && move.from[0]==='e' && move.from[1]===move.to[1] && rook?.type==='r' && rook.color===king.color && ['a','h'].includes(move.to[0])) return {...move,to:`${move.to[0]==='a'?'c':'g'}${move.to[1]}`};
  return move;
}
export function validPremove(chess, move, color) {
  if(!move || chess.turn()!==color || chess.get(move.from)?.color!==color)return false;
  const actual=normalizePremove(chess,move);
  return chess.moves({square:actual.from,verbose:true}).some(m=>m.to===actual.to&&(!m.promotion||m.promotion===actual.promotion));
}
// Build a private hypothetical board; never mutate or submit this position.
export function projectPremoves(chess, queue, color) {
  const view=new Chess(chess.fen());
  for(const intention of queue) {
    const piece=view.get(intention.from); if(!piece||piece.color!==color) break;
    const move=normalizePremove(view,intention), target=view.get(move.to);
    if(target?.color===color) break;
    view.remove(intention.from); if(target) view.remove(move.to);
    if(piece.type==='p'&&intention.from[0]!==move.to[0]&&!target) { const captured=move.to[0]+intention.from[1], p=view.get(captured); if(p?.type==='p'&&p.color!==color)view.remove(captured); }
    if(piece.type==='k'&&Math.abs(files.indexOf(move.to[0])-files.indexOf(intention.from[0]))===2) {
      const rank=move.to[1], rookFrom=(move.to[0]==='g'?'h':'a')+rank, rookTo=(move.to[0]==='g'?'f':'d')+rank, rook=view.remove(rookFrom); if(rook){view.remove(rookTo);view.put(rook,rookTo);}
    }
    view.put({type:piece.type==='p'&&intention.promotion?intention.promotion:piece.type,color},move.to);
  }
  return view;
}
