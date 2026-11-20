import {createGameSound} from './game-sound.js';
const sound=createGameSound(window);
import {pieceSrc as themedPieceSrc} from './piece-theme.js';
import '../smooth-scroll.js';
import { Chess } from 'chess.js';
import { premoveTargets, validPremove, normalizePremove, projectPremoves } from './premove.js';
import { createBoardAnnotations } from './board-annotations.js';
import { chooseBotMove } from './bot.js';
import './game-theme.js';

const game = new Chess();
const randomColor = () => Math.random() < .5 ? 'w' : 'b';
let playerColor = randomColor();
const board = document.getElementById('board');
const status = document.getElementById('status');
const promotion = document.getElementById('promotion');
const options = document.getElementById('promotion-options');
const pieceSrc = (color, type) => themedPieceSrc(color,type);
const names = { k:'король', q:'ферзь', r:'ладья', b:'слон', n:'конь', p:'пешка' };
const files = 'abcdefgh';
let selected = null, pending = null, botTimer = null, botThinking = false, lastMove = null, premove = [], drag = null, suppressClick = false;
const annotations = createBoardAnnotations({ document, board });
let newGameAt = null, countdownTimer = null;
const guestWaitMs = 60 * 60 * 1000;
const memberId = document.body.dataset.gameUser;
const storageKey = memberId ? `shahmat.member-game.v1.${memberId}` : 'shahmat.guest-game.v1';
const storageMessage = document.getElementById('storage-message');
const countdown = document.getElementById('new-game-countdown');
function storageFailure(message = 'Не удалось сохранить партию на устройстве.') {
  storageMessage.textContent = message;
}
function saveGame() {
  try {
    const moves = game.history();
    if (moves.length > 2000) throw new Error('Game too long');
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, moves, playerColor, ...(newGameAt !== null ? { newGameAt } : {}) }));
  } catch { storageFailure(); }
}
function restoreGame() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) { saveGame(); return; }
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.moves) || saved.moves.length > 2000 || (saved.playerColor !== undefined && !['w', 'b'].includes(saved.playerColor))) throw new Error('Invalid save');
    // Older saves predate random sides and were always played as white.
    playerColor = saved.playerColor || 'w';
    for (const move of saved.moves) {
      if (typeof move !== 'string' || move.length > 20 || game.isGameOver()) throw new Error('Invalid move');
      lastMove = game.move(move);
    }
    if (!memberId && game.isGameOver() && Number.isSafeInteger(saved.newGameAt) && saved.newGameAt > 0) {
      newGameAt = saved.newGameAt;
    }
  } catch {
    game.reset(); lastMove = null; newGameAt = null;
    storageFailure('Не удалось восстановить сохранённую партию.');
  }
}
function scheduleBot() {
  if (botTimer !== null || game.isGameOver() || game.turn() === playerColor) return;
  botThinking = true;
  botTimer = setTimeout(() => {
    if (game.isGameOver() || game.turn() === playerColor) { botThinking = false; botTimer = null; render(); return; }
    const botMove = chooseBotMove(game);
    if (botMove) { lastMove = game.move(botMove); sound.play(lastMove); saveGame(); }
    botThinking = false; botTimer = null; selected = null; if(pending?.premove) { pending=null; promotion.hidden=true; } cancelDrag(); render(lastMove);
    const queued = premove.shift();
    if (!game.isGameOver() && queued && validPremove(game, queued, playerColor)) { playMove(normalizePremove(game,queued)); return; }
    if (queued) { premove=[]; render(); if (!game.isGameOver()) status.textContent = 'Предварительный ход отменён: он больше невозможен.'; }
  }, 380);
}

function resultText() {
  if (game.isCheckmate()) return game.turn() === playerColor ? 'Мат. Бот победил.' : 'Мат. Вы победили!';
  if (game.isStalemate()) return 'Ничья: пат.';
  if (game.isThreefoldRepetition()) return 'Ничья: троекратное повторение.';
  if (game.isInsufficientMaterial()) return 'Ничья: недостаточно фигур.';
  if (game.isDraw()) return 'Ничья.';
  if (botThinking) return 'Бот думает…';
  return game.isCheck() ? 'Шах! Ваш ход.' : 'Ваш ход.';
}
function animateMove(move) {
  if (!move || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const animatePiece = (from, to) => {
    const origin = board.querySelector(`[data-square="${from}"]`);
    const target = board.querySelector(`[data-square="${to}"]`);
    const image = target?.querySelector('.piece');
    if (!origin || !target || !image?.animate) return;
    const start = origin.getBoundingClientRect(), end = target.getBoundingClientRect();
    target.classList.add('is-moving');
    const animation = image.animate([{ transform: `translate(${start.left - end.left}px, ${start.top - end.top}px)` }, { transform: 'translate(0, 0)' }],
      { duration: 280, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    animation.finished.catch(() => {}).then(() => target.classList.remove('is-moving'));
  };
  animatePiece(move.from, move.to);
  if (move.flags.includes('k')) animatePiece(`h${move.to[1]}`, `f${move.to[1]}`);
  if (move.flags.includes('q')) animatePiece(`a${move.to[1]}`, `d${move.to[1]}`);
}
function renderHistory() {
  const history = game.history();
  const list = document.getElementById('move-list');
  const needed = Math.ceil(history.length / 2);
  while (list.children.length > needed) list.lastElementChild.remove();
  for (let i = 0; i < needed; i++) {
    let item = list.children[i];
    if (!item) {
      item = document.createElement('li');
      const number = document.createElement('span'); number.textContent = `${i + 1}.`;
      item.append(number, document.createElement('strong'), document.createElement('strong'));
      list.append(item);
    }
    for (let side = 0; side < 2; side++) {
      const text = history[i * 2 + side] || '—';
      const element = item.children[side + 1];
      if (element.textContent !== text) {
        element.textContent = text;
        element.classList.remove('move-enter');
        // Reflow restarts the animation only for a newly added half-move.
        if (text !== '—') { void element.offsetWidth; element.classList.add('move-enter'); }
      }
    }
  }
  document.getElementById('move-count').textContent = String(needed).padStart(2, '0');
  document.getElementById('empty-moves').hidden = !!history.length;
  if (history.length && history.length !== renderHistory.count) list.scrollTop = list.scrollHeight;
  renderHistory.count = history.length;
}
function projected() { return premove.length ? projectPremoves(game,premove,playerColor) : game; }
function render(move = null) {
  const shown=projected();
  const legal = selected ? (game.turn() === playerColor && !premove.length ? game.moves({ square:selected, verbose:true }) : premoveTargets(shown, selected, playerColor)).map(move => move.to) : [];
  const fragment = document.createDocumentFragment();
  const ranks = playerColor === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  const columns = playerColor === 'w' ? [...files] : [...files].reverse();
  for (const rank of ranks) for (const column of columns) {
    const file = files.indexOf(column);
    const square = files[file] + rank, piece = shown.get(square);
    const cell = document.createElement('button');
    cell.type = 'button'; cell.className = `square ${(rank + file) % 2 ? 'dark' : 'light'}`;
    cell.dataset.square = square;
    cell.classList.toggle('selected', selected === square);
    cell.classList.toggle('premove', premove.some(m=>m.from===square || m.to===square));
    cell.classList.toggle('possible', legal.includes(square));
    cell.classList.toggle('premove-dest', (game.turn() !== playerColor || premove.length>0) && legal.includes(square));
    cell.classList.toggle('last-move', !!lastMove && (lastMove.from === square || lastMove.to === square));
    cell.setAttribute('aria-label', `${square}, ${piece ? (piece.color === 'w' ? 'белые, ' : 'чёрные, ') + names[piece.type] : 'пусто'}${legal.includes(square) ? ', возможный ход' : ''}${premove.some(m=>m.from===square || m.to===square) ? ', предварительный ход' : ''}`);
    cell.setAttribute('aria-pressed', String(selected === square));
    if (piece) { const icon = document.createElement('img'); icon.className = 'piece'; icon.src = pieceSrc(piece.color, piece.type); icon.alt = ''; icon.draggable = false; const real=game.get(square); if(premove.length&&(!real||real.color!==piece.color||real.type!==piece.type))icon.classList.add('premove-ghost'); cell.append(icon); }
    if (rank === ranks[7]) { const coord = document.createElement('span'); coord.className = 'coord file'; coord.textContent = files[file]; cell.append(coord); }
    if (column === columns[0]) { const coord = document.createElement('span'); coord.className = 'coord rank'; coord.textContent = rank; cell.append(coord); }
    fragment.append(cell);
  }
  board.replaceChildren(fragment); annotations.refresh();
  document.getElementById('player-color').textContent = playerColor === 'w' ? 'Белые' : 'Чёрные';
  document.getElementById('bot-color').textContent = playerColor === 'w' ? 'Чёрные' : 'Белые';
  document.getElementById('player-avatar').src = pieceSrc(playerColor, 'p');
  document.getElementById('bot-avatar').src = pieceSrc(playerColor === 'w' ? 'b' : 'w', 'n');
  status.textContent = resultText();
  animateMove(move);
  renderHistory();
}
function playMove(move) {
  lastMove = game.move(move); sound.play(lastMove); selected = null; pending = null; promotion.hidden = true;
  if (game.isGameOver()) premove = [];
  saveGame();
  scheduleBot();
  render(lastMove);
}
function attempt(from, to) {
  const moves = (game.turn() === playerColor && !premove.length ? game.moves({square:from,verbose:true}) : premoveTargets(projected(),from,playerColor)).filter(move => move.to === to);
  if (!moves.length) return false;
  if (game.turn() !== playerColor && premove.length >= 20) { status.textContent='Можно добавить не более 20 предварительных ходов.'; return true; }
  if (moves.some(move => move.promotion)) {
    pending = { from, to, premove:game.turn() !== playerColor }; promotion.hidden = false; options.replaceChildren();
    for (const type of ['q','r','b','n']) {
      const button = document.createElement('button'); button.type='button'; button.setAttribute('aria-label',names[type]);
      const icon=document.createElement('img'); icon.src=pieceSrc(playerColor,type); icon.alt=''; button.append(icon);
      button.addEventListener('click',()=>{ if(!pending)return; const choice=pending; pending=null; promotion.hidden=true; if(choice.premove && game.turn()!==playerColor) { if(premove.length>=20)return; premove.push({from:choice.from,to:choice.to,promotion:type}); selected=null; render(); status.textContent='Предварительный ход готов. До 20 ходов; пустая клетка отменяет очередь.'; } else playMove({from:choice.from,to:choice.to,promotion:type}); }); options.append(button);
    }
    options.firstChild.focus(); return true;
  }
  if(game.turn()!==playerColor) { if(premove.length>=20){status.textContent='Можно добавить не более 20 предварительных ходов.';return true;} premove.push({from,to}); selected=null; render(); status.textContent='Предварительный ход готов. До 20 ходов; пустая клетка отменяет очередь.'; } else playMove({from,to}); return true;
}
board.addEventListener('click', event => {
  if (suppressClick || pending || game.isGameOver()) return;
  const square=event.target.closest('[data-square]')?.dataset.square; if(!square) return;
  if(selected && attempt(selected,square)) return;
  if(premove.length && !projected().get(square)) { premove=[]; selected=null; render(); return; }
  selected=projected().get(square)?.color===playerColor && selected!==square ? square : null; render();
  board.querySelector(`[data-square="${square}"]`)?.focus();
});
function cancelDrag() { if (!drag) return; drag.ghost?.remove(); drag.cell?.classList.remove('dragging'); drag=null; }
board.addEventListener('pointerdown', event => {
  if(event.button===2 && premove.length) { premove=[]; selected=null; render(); }
  if(event.button!==0 || pending || game.isGameOver()) return;
  const cell=event.target.closest('[data-square]'); if(cell && projected().get(cell.dataset.square)?.color===playerColor) drag={from:cell.dataset.square,x:event.clientX,y:event.clientY,pointer:event.pointerId,cell,ghost:null};
});
board.addEventListener('pointermove', event => {
  if(!drag || drag.pointer!==event.pointerId) return;
  if(!drag.ghost && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5) {
    board.setPointerCapture?.(event.pointerId); selected=drag.from; render(); drag.cell=board.querySelector(`[data-square="${drag.from}"]`);
    drag.ghost=document.createElement('img'); drag.ghost.className='drag-ghost'; drag.ghost.src=pieceSrc(playerColor,projected().get(drag.from).type); drag.ghost.alt='';
    drag.ghost.style.setProperty('--drag-size',`${drag.cell.getBoundingClientRect().width}px`); drag.cell.classList.add('dragging'); document.body.append(drag.ghost);
  }
  if(drag.ghost) drag.ghost.style.transform=`translate3d(${event.clientX}px,${event.clientY}px,0) translate(-50%,-50%)`;
});
function endDrag(event,cancel=false) {
  if(!drag || drag.pointer!==event.pointerId) return; const d=drag;
  if(!d.ghost) { drag=null; return; }
  const target=!cancel && document.elementFromPoint?.(event.clientX,event.clientY)?.closest('[data-square]')?.dataset.square;
  cancelDrag(); suppressClick=true; setTimeout(()=>{suppressClick=false;},0);
  if(!target || !attempt(d.from,target)) { selected=null; render(); }
}
board.addEventListener('pointerup',event=>endDrag(event));
board.addEventListener('pointercancel',event=>endDrag(event,true));
document.addEventListener('keydown',event=>{ if(event.key==='Escape' && premove.length) { premove=[]; selected=null; render(); } });
// The guest deadline is an absolute time, so closing the page does not pause it.
function updateCountdown() {
  if (!countdown) return;
  if (newGameAt === null) {
    countdown.hidden = true;
    if (countdownTimer !== null) clearInterval(countdownTimer);
    countdownTimer = null;
    return;
  }
  const seconds = Math.max(0, Math.ceil((newGameAt - Date.now()) / 1000));
  if (seconds === 0) {
    newGameAt = null; lastMove = null; selected = null; pending = null; premove=[]; annotations.clear(); cancelDrag();
    promotion.hidden = true; game.reset(); playerColor = randomColor(); saveGame(); scheduleBot(); render();
    updateCountdown();
    return;
  }
  countdown.hidden = false;
  countdown.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} до новой партии`;
  if (countdownTimer === null) countdownTimer = setInterval(updateCountdown, 1000);
}

if (!memberId) {
  document.getElementById('new-game').addEventListener('click', () => {
    if (game.isGameOver() && newGameAt === null) {
      newGameAt = Date.now() + guestWaitMs;
      saveGame();
      updateCountdown();
    }
  });
  // Reconcile tabs and pages restored from the browser's back-forward cache.
  function syncGuestGame() {
    try { localStorage.getItem(storageKey); } catch { updateCountdown(); return; }
    if (botTimer !== null) clearTimeout(botTimer);
    botTimer = null; botThinking = false; selected = null; pending = null; lastMove = null; newGameAt = null; premove=[]; annotations.clear(); cancelDrag();
    promotion.hidden = true; game.reset(); restoreGame();
    updateCountdown(); scheduleBot(); render();
  }
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) syncGuestGame();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) syncGuestGame(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateCountdown(); });
}
if (memberId) document.getElementById('new-game').addEventListener('click', () => {
  if (game.history().length && !window.confirm('Начать новую партию? Текущая партия будет удалена с этого устройства.')) return;
  if (botTimer !== null) clearTimeout(botTimer);
  botTimer = null; botThinking = false; selected = null; pending = null; lastMove = null; premove=[]; annotations.clear(); cancelDrag();
  promotion.hidden = true; game.reset(); playerColor = randomColor(); saveGame(); scheduleBot(); render();
});
restoreGame();
updateCountdown();
scheduleBot();
render();

// Lightweight adaptations of React Bits Spotlight Card and Click Spark.
const motionReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const panel = document.querySelector('.game-panel');
panel.addEventListener('pointermove', event => {
  if (motionReduced() || event.pointerType === 'touch') return;
  const card = event.target.closest('.status-card');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
  card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
});
document.addEventListener('click', event => {
  if (motionReduced() || !event.detail || !document.body.animate || !event.target.closest('.square, #new-game')) return;
  for (let i = 0; i < 6; i++) {
    const spark = document.createElement('span'); spark.className = 'demo-spark'; spark.setAttribute('aria-hidden', 'true');
    spark.style.left = `${event.clientX}px`; spark.style.top = `${event.clientY}px`; document.body.append(spark);
    const angle = i * Math.PI / 3, x = Math.cos(angle) * 18, y = Math.sin(angle) * 18;
    const animation = spark.animate([
      { transform: `translate(-50%, -50%) rotate(${angle}rad)`, opacity: .75 },
      { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angle}rad)`, opacity: 0 },
    ], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' });
    animation.onfinish = animation.oncancel = () => spark.remove();
  }
});
