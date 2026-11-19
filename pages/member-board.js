// Keep the 64 interactive squares (and unchanged pieces) alive between updates.
// Move feedback uses board-local coordinates, so it also works on a rotated board.
const files = 'abcdefgh';
const names = { k:'король', q:'ферзь', r:'ладья', b:'слон', n:'конь', p:'пешка' };
const pieceSrc = (color, type) => `/pieces/cburnett/${color}${type.toUpperCase()}.svg`;

export function createMemberBoard({ document, board, reducedMotion }) {
  const cells = new Map(), animations = new WeakMap();
  const fragment = document.createDocumentFragment();
  for (let rank = 8; rank >= 1; rank--) for (let column = 0; column < 8; column++) {
    const file = files[column], square = `${file}${rank}`;
    const cell = document.createElement('button');
    cell.type = 'button'; cell.className = `square ${(rank + column) % 2 ? 'dark' : 'light'}`;
    cell.dataset.square = square;
    if (rank === 1) { const coord = document.createElement('span'); coord.className = 'coord file'; coord.textContent = file; cell.append(coord); }
    if (column === 0) { const coord = document.createElement('span'); coord.className = 'coord rank'; coord.textContent = rank; cell.append(coord); }
    cells.set(square, cell); fragment.append(cell);
  }
  board.replaceChildren(fragment);
  function transfer(from, to) {
    const source = cells.get(from), target = cells.get(to), image = source?.querySelector('.piece');
    if (!image || !target) return null;
    animations.get(image)?.cancel();
    source.classList.remove('is-moving');
    target.querySelector('.piece')?.remove();
    target.prepend(image);
    return image;
  }
  function animate(image, from, to) {
    if (!image?.animate || reducedMotion()) return;
    const step = board.clientWidth / 8;
    if (!step) return;
    const dx = (files.indexOf(from[0]) - files.indexOf(to[0])) * step;
    const dy = (Number(to[1]) - Number(from[1])) * step;
    const animation = image.animate([
      { translate:`${dx}px ${dy}px`, filter:'drop-shadow(0 1px 1px #0008) blur(0px)' },
      { offset:.28, filter:'drop-shadow(0 1px 1px #0008) blur(.75px)' },
      { translate:'0px 0px', filter:'drop-shadow(0 1px 1px #0008) blur(0px)' },
    ], { duration: 165, easing:'cubic-bezier(.2,.7,.25,1)' });
    const cell = image.parentElement;
    cell.classList.add('is-moving');
    animations.set(image, animation);
    animation.finished?.catch(() => {}).finally(() => {
      if (animations.get(image) === animation) { animations.delete(image); cell.classList.remove('is-moving'); }
    });
  }
  function render({ shown, selected, legal = [], premove, last, animatedMove }) {
    const moves = new Set(legal), checked = shown.isCheck(), turn = shown.turn();
    let movingImage = null, rookImage = null, rookFrom, rookTo;
    if (animatedMove) {
      movingImage = transfer(animatedMove.from, animatedMove.to);
      if (animatedMove.flags.includes('k')) { rookFrom = `h${animatedMove.to[1]}`; rookTo = `f${animatedMove.to[1]}`; }
      if (animatedMove.flags.includes('q')) { rookFrom = `a${animatedMove.to[1]}`; rookTo = `d${animatedMove.to[1]}`; }
      if (rookFrom) rookImage = transfer(rookFrom, rookTo);
    }
    for (const [square, cell] of cells) {
      const piece = shown.get(square);
      cell.classList.toggle('selected', selected === square);
      cell.classList.toggle('possible', moves.has(square));
      cell.classList.toggle('last-move', !!last && (last.from === square || last.to === square));
      cell.classList.toggle('premove', !!premove && (premove.from === square || premove.to === square));
      cell.classList.toggle('check', !!piece && piece.type === 'k' && piece.color === turn && checked);
      const label = `${square}, ${piece ? (piece.color === 'w' ? 'белые, ' : 'чёрные, ') + names[piece.type] : 'пусто'}${premove && (premove.from === square || premove.to === square) ? ', предварительный ход' : ''}`;
      if (cell.getAttribute('aria-label') !== label) cell.setAttribute('aria-label', label);
      const pressed = String(selected === square);
      if (cell.getAttribute('aria-pressed') !== pressed) cell.setAttribute('aria-pressed', pressed);
      let img = cell.querySelector('.piece');
      if (!piece) { if (img) { animations.get(img)?.cancel(); cell.classList.remove('is-moving'); img.remove(); } continue; }
      const src = pieceSrc(piece.color, piece.type);
      if (!img) { img = document.createElement('img'); img.className = 'piece'; img.alt = ''; img.draggable = false; cell.prepend(img); }
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    }
    if (animatedMove) { animate(movingImage, animatedMove.from, animatedMove.to); if (rookImage) animate(rookImage, rookFrom, rookTo); }
  }
  return { render, cell: square => cells.get(square) };
}
