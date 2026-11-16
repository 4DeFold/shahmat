import { Chess } from 'chess.js';
import { chooseBotMove } from './bot.js';

const game = new Chess();
const board = document.getElementById('board');
const status = document.getElementById('status');
const promotion = document.getElementById('promotion');
const options = document.getElementById('promotion-options');
const icons = { w: { k:'♔', q:'♕', r:'♖', b:'♗', n:'♘', p:'♙' }, b: { k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟' } };
const names = { k:'король', q:'ферзь', r:'ладья', b:'слон', n:'конь', p:'пешка' };
const files = 'abcdefgh';
let selected = null, pending = null, botTimer = null, botThinking = false, lastMove = null;

function resultText() {
  if (game.isCheckmate()) return game.turn() === 'w' ? 'Мат. Бот победил.' : 'Мат. Вы победили!';
  if (game.isStalemate()) return 'Ничья: пат.';
  if (game.isThreefoldRepetition()) return 'Ничья: троекратное повторение.';
  if (game.isInsufficientMaterial()) return 'Ничья: недостаточно фигур.';
  if (game.isDraw()) return 'Ничья.';
  if (botThinking) return 'Бот думает…';
  return game.isCheck() ? 'Шах! Ваш ход.' : 'Ваш ход.';
}
function render() {
  const legal = selected ? game.moves({ square: selected, verbose: true }).map(move => move.to) : [];
  const fragment = document.createDocumentFragment();
  for (let rank = 8; rank >= 1; rank--) for (let file = 0; file < 8; file++) {
    const square = files[file] + rank, piece = game.get(square);
    const cell = document.createElement('button');
    cell.type = 'button'; cell.className = `square ${(rank + file) % 2 ? 'light' : 'dark'}`;
    cell.dataset.square = square;
    cell.classList.toggle('selected', selected === square);
    cell.classList.toggle('possible', legal.includes(square));
    cell.classList.toggle('last-move', !!lastMove && (lastMove.from === square || lastMove.to === square));
    cell.setAttribute('aria-label', `${square}, ${piece ? (piece.color === 'w' ? 'белые, ' : 'чёрные, ') + names[piece.type] : 'пусто'}${legal.includes(square) ? ', возможный ход' : ''}`);
    cell.setAttribute('aria-pressed', String(selected === square));
    if (piece) { const icon = document.createElement('span'); icon.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`; icon.textContent = icons[piece.color][piece.type]; icon.setAttribute('aria-hidden', 'true'); cell.append(icon); }
    if (rank === 1) { const coord = document.createElement('span'); coord.className = 'coord file'; coord.textContent = files[file]; cell.append(coord); }
    if (file === 0) { const coord = document.createElement('span'); coord.className = 'coord rank'; coord.textContent = rank; cell.append(coord); }
    fragment.append(cell);
  }
  board.replaceChildren(fragment);
  status.textContent = resultText();
  const history = game.history();
  const list = document.getElementById('move-list'); list.replaceChildren();
  for (let i = 0; i < history.length; i += 2) {
    const item = document.createElement('li'); item.innerHTML = `<span>${i / 2 + 1}.</span><strong>${history[i]}</strong><strong>${history[i + 1] || '—'}</strong>`; list.append(item);
  }
  document.getElementById('move-count').textContent = String(Math.ceil(history.length / 2)).padStart(2, '0');
  document.getElementById('empty-moves').hidden = !!history.length;
}
function playMove(move) {
  lastMove = game.move(move); selected = null; pending = null; promotion.hidden = true;
  if (!game.isGameOver() && game.turn() === 'b') {
    botThinking = true;
    botTimer = setTimeout(() => {
      const botMove = chooseBotMove(game);
      if (botMove) lastMove = game.move(botMove);
      botThinking = false; botTimer = null; render();
    }, 250);
  }
  render();
}
board.addEventListener('click', event => {
  const cell = event.target.closest('[data-square]');
  if (!cell || botThinking || pending || game.isGameOver() || game.turn() !== 'w') return;
  const square = cell.dataset.square, piece = game.get(square);
  if (selected) {
    const moves = game.moves({ square: selected, verbose: true }).filter(move => move.to === square);
    if (moves.length) {
      if (moves.some(move => move.promotion)) {
        pending = { from: selected, to: square }; promotion.hidden = false; options.replaceChildren();
        for (const type of ['q', 'r', 'b', 'n']) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = icons.w[type]; button.setAttribute('aria-label', names[type]);
          button.addEventListener('click', () => playMove({ ...pending, promotion: type })); options.append(button);
        }
        options.firstChild.focus(); return;
      }
      playMove({ from: selected, to: square }); return;
    }
  }
  selected = piece?.color === 'w' && selected !== square ? square : null;
  render();
  board.querySelector(`[data-square="${square}"]`)?.focus();
});
document.getElementById('new-game').addEventListener('click', () => {
  if (botTimer !== null) clearTimeout(botTimer);
  game.reset(); selected = null; pending = null; lastMove = null; botTimer = null; botThinking = false; promotion.hidden = true; render();
});
render();
