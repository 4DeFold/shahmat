// A premove describes an intention, not a legal move in the current position.
// The opponent may move/capture a piece, give check or create en passant first.
// Always validate against the real position immediately before playing it.
const files = 'abcdefgh';
export function premoveTargets(chess, from, color) {
  const piece = chess.get(from);
  if (!piece || piece.color !== color) return [];
  const x = files.indexOf(from[0]), y = Number(from[1]) - 1, targets = [];
  const add = (a,b, promotion = false) => {
    if (a < 0 || a > 7 || b < 0 || b > 7) return false;
    const to = `${files[a]}${b+1}`, occupant = chess.get(to);
    if (occupant?.color === color) return false;
    targets.push({ from, to, ...(promotion ? { promotion:'q' } : {}) });
    return true;
  };
  if (piece.type === 'p') {
    const dy = color === 'w' ? 1 : -1, promotion = y + dy === (color === 'w' ? 7 : 0);
    add(x,y+dy,promotion); // an opposing blocker may move away
    add(x-1,y+dy,promotion); add(x+1,y+dy,promotion); // capture or en passant
    if (y === (color === 'w' ? 1 : 6) && chess.get(`${files[x]}${y+dy+1}`)?.color !== color) add(x,y+2*dy);
  } else if (piece.type === 'n' || piece.type === 'k') {
    const dirs = piece.type === 'n' ? [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for (const [dx,dy] of dirs) add(x+dx,y+dy);
    if (piece.type === 'k' && from === (color === 'w' ? 'e1' : 'e8')) {
      const rights = chess.fen().split(' ')[2], rank = color === 'w' ? '1' : '8';
      for (const [flag,rook,path,dest] of [[color==='w'?'K':'k','h',['f','g'],'g'],[color==='w'?'Q':'q','a',['b','c','d'],'c']]) {
        const r = chess.get(rook+rank);
        if (rights.includes(flag) && r?.color === color && r.type === 'r' && path.every(f => chess.get(f+rank)?.color !== color)) add(files.indexOf(dest), y);
      }
    }
  } else {
    const dirs = [];
    if (piece.type === 'r' || piece.type === 'q') dirs.push([1,0],[-1,0],[0,1],[0,-1]);
    if (piece.type === 'b' || piece.type === 'q') dirs.push([1,1],[-1,1],[1,-1],[-1,-1]);
    for (const [dx,dy] of dirs) for (let step=1;step<8;step++) {
      const a=x+dx*step,b=y+dy*step;
      if (!add(a,b)) break; // own pieces cannot move during the opponent's turn
      // An enemy piece may move; the final legality check decides whether it did.
    }
  }
  return targets;
}
export function validPremove(chess, move, color) {
  if (!move || chess.turn() !== color || chess.get(move.from)?.color !== color) return false;
  return chess.moves({square:move.from,verbose:true}).some(m => m.to === move.to && (!m.promotion || m.promotion === move.promotion));
}
