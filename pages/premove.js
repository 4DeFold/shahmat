// A premove is a geometric intention. The actual position is checked on execution.
const files = 'abcdefgh';
export function premoveTargets(chess, from, color) {
  const piece = chess.get(from);
  if (!piece || piece.color !== color) return [];
  const x = files.indexOf(from[0]), y = Number(from[1]) - 1, targets = [];
  const add = (a, b) => {
    if (a < 0 || a > 7 || b < 0 || b > 7 || (a === x && b === y)) return;
    targets.push({ from, to: `${files[a]}${b+1}`, ...(piece.type === 'p' && (b === 0 || b === 7) ? { promotion:'q' } : {}) });
  };
  if (piece.type === 'p') {
    const dy = color === 'w' ? 1 : -1;
    for (const dx of [-1,0,1]) add(x+dx,y+dy);
    if (color === 'w' ? y <= 1 : y >= 6) add(x,y+2*dy);
  } else if (piece.type === 'n' || piece.type === 'k') {
    const dirs = piece.type === 'n' ? [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for (const [dx,dy] of dirs) add(x+dx,y+dy);
    if (piece.type === 'k' && from === (color === 'w' ? 'e1' : 'e8')) {
      for (const [rook,dest] of [['a','c'],['h','g']]) {
        const r=chess.get(rook+from[1]);
        if(r?.color === color && r.type === 'r') { add(files.indexOf(rook),y); add(files.indexOf(dest),y); }
      }
    }
  } else {
    const dirs = [];
    if (piece.type === 'r' || piece.type === 'q') dirs.push([1,0],[-1,0],[0,1],[0,-1]);
    if (piece.type === 'b' || piece.type === 'q') dirs.push([1,1],[-1,1],[1,-1],[-1,-1]);
    for (const [dx,dy] of dirs) for (let step=1;step<8;step++) add(x+dx*step,y+dy*step);
  }
  return targets;
}
export function normalizePremove(chess, move) {
  const king = chess.get(move.from), rook = chess.get(move.to);
  if (king?.type === 'k' && move.from[0] === 'e' && move.from[1] === move.to[1] && rook?.type === 'r' && rook.color === king.color && ['a','h'].includes(move.to[0]))
    return { ...move, to: `${move.to[0] === 'a' ? 'c' : 'g'}${move.to[1]}` };
  return move;
}
export function validPremove(chess, move, color) {
  if (!move || chess.turn() !== color || chess.get(move.from)?.color !== color) return false;
  const actual=normalizePremove(chess,move);
  return chess.moves({square:actual.from,verbose:true}).some(m => m.to === actual.to && (!m.promotion || m.promotion === actual.promotion));
}
