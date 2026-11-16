// A small two-ply material bot. All positions and legal moves come from chess.js.
const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
function evaluate(game) {
  if (game.isCheckmate()) return game.turn() === 'w' ? 100000 : -100000;
  if (game.isDraw()) return 0;
  return game.board().flat().reduce((sum, piece) => piece ? sum + (piece.color === 'b' ? 1 : -1) * values[piece.type] : sum, 0);
}
export function chooseBotMove(game, random = Math.random) {
  let best = -Infinity;
  let choices = [];
  for (const move of game.moves({ verbose: true })) {
    game.move(move);
    let score = evaluate(game);
    if (!game.isGameOver()) {
      score = Infinity;
      for (const reply of game.moves({ verbose: true })) {
        game.move(reply);
        score = Math.min(score, evaluate(game));
        game.undo();
      }
    }
    game.undo();
    if (score > best) { best = score; choices = [move]; }
    else if (score === best) choices.push(move);
  }
  return choices.length ? choices[Math.floor(random() * choices.length)] : null;
}
