import { Chess } from 'chess.js';
import { createMemberBoard } from './member-board.js';
import { createGameSound } from './game-sound.js';

const times = { blitz: 180000, rapid: 600000, classical: 3600000, daily: 86400000 };
const modeLabels = { blitz:'Блиц · 3 мин', rapid:'Рапид · 10 мин', classical:'Классика · 1 час', daily:'Дневная · 24 часа' };
const names = { k:'король', q:'ферзь', r:'ладья', b:'слон', n:'конь', p:'пешка' };
const files = 'abcdefgh';
const pieceSrc = (color, type) => `/pieces/cburnett/${color}${type.toUpperCase()}.svg`;
export function formatClock(ms) {
  if (ms == null) return '—:—';
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function createMemberGame({ document, api, opponentName = async () => null, now = () => performance.now() }) {
  const $ = id => document.getElementById(id), win = document.defaultView;
  const board = $('board'), start = $('start-search'), cancel = $('cancel-search'), reset = $('new-game');
  const promotion = $('promotion'), options = $('promotion-options');
  let userId = null, ready = false, chess = new Chess(), latestMove = null, mode = null, phase = 'idle', selected = null, pending = null;
  let snapshot = null, receivedAt = 0, polling = null, generation = 0, moving = false, pendingSearch = null, viewVisible = true, browserVisible = true, pollFailures = 0;
  let premove = null, historyIndex = null, nameForGame = null, nameTimer = null, drag = null, suppressClick = false;
  const sound = createGameSound(win);
  const isVisible = () => viewVisible && browserVisible;
  const setStatus = (text, urgent = false) => { const el = $('status'); if (el.textContent !== text) el.textContent = text; el.parentElement.classList.toggle('urgent', urgent); };
  const cancelTimer = () => { if (polling !== null) clearTimeout(polling); polling = null; };
  const reducedMotion = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const boardView = createMemberBoard({ document, board, reducedMotion });
  const soundButton = $('sound-toggle');
  function updateSoundButton() {
    soundButton.setAttribute('aria-pressed', String(!sound.isMuted()));
    soundButton.textContent = sound.isMuted() ? 'Звук выключен' : 'Звук включён';
  }
  soundButton.addEventListener('click', () => { sound.setMuted(!sound.isMuted()); updateSoundButton(); });
  updateSoundButton();
  const playSound = move => sound.play(chess.isCheck() ? 'check' : move?.captured ? 'capture' : 'move');
  function modeControls() {
    const locked = phase !== 'idle';
    $('mode-list').querySelectorAll('input').forEach(input => { input.disabled = locked; });
    $('mode-label').hidden = locked;
    $('mode-list').hidden = locked;
    $('mode-summary').hidden = !locked || !mode;
    $('mode-summary').textContent = modeLabels[mode] || '';
    $('leave-game-control').hidden = phase !== 'active' && phase !== 'finished';
    $('leave-game-control').querySelector('.leave-note').hidden = phase !== 'active';
    start.hidden = phase !== 'idle'; start.disabled = !userId || !ready || !mode;
    cancel.hidden = phase !== 'searching'; reset.hidden = phase !== 'finished';
    $('moves').hidden = phase !== 'active' && phase !== 'finished';
  }
  function currentColor() { return snapshot?.black_id === userId ? 'b' : 'w'; }
  function drawClocks() {
    const own = currentColor(), elapsed = snapshot?.status === 'active' ? Math.max(0, now() - receivedAt) : 0;
    const time = color => snapshot ? Math.max(0, snapshot[color === 'w' ? 'white_ms' : 'black_ms'] - (snapshot.status === 'active' && snapshot.turn === color ? elapsed : 0)) : mode ? times[mode] : null;
    const other = own === 'w' ? 'b' : 'w';
    for (const [id, color] of [['player', own], ['opponent', other]]) {
      const card = $(`${id}-clock-card`), remaining = time(color);
      const background = snapshot ? color : 'neutral';
      if (card.dataset.color !== background) card.dataset.color = background;
      const progress = `${remaining == null ? 0 : (Math.ceil(remaining / 1000) % 60) / 60 * 100}%`;
      if (card.style.getPropertyValue('--second-progress') !== progress) card.style.setProperty('--second-progress', progress);
      card.classList.toggle('running', snapshot?.status === 'active' && snapshot.turn === color);
      card.classList.toggle('low', remaining != null && remaining <= 30000 && snapshot?.status === 'active' && snapshot.turn === color);
      const clock = $(`${id}-clock`), text = formatClock(remaining);
      if (clock.textContent !== text) {
        clock.replaceChildren(document.createTextNode(text.slice(0, -2)));
        const seconds = document.createElement('span'); seconds.className = 'clock-seconds'; seconds.textContent = text.slice(-2); clock.append(seconds);
      }
    }
    for (const [id, text] of [['player', `Вы · ${own === 'w' ? 'Белые' : 'Чёрные'}`], ['opponent', `Соперник · ${other === 'w' ? 'Белые' : 'Чёрные'}`]]) {
      const label = $(`${id}-clock-label`), value = snapshot ? text : '';
      if (label.hidden !== !snapshot) label.hidden = !snapshot;
      if (label.textContent !== value) label.textContent = value;
    }
  }
  function resultText() {
    if (!snapshot || snapshot.status !== 'finished') return snapshot?.turn === currentColor() ? (chess.isCheck() ? 'Шах! Защитите короля — ваш ход.' : 'Ваш ход.') : (chess.isCheck() ? 'Шах сопернику. Ожидаем ход.' : 'Ход соперника. Можно подготовить свой ход.');
    if (snapshot.result === 'draw') return snapshot.reason === 'stalemate' ? 'Пат. Ничья.' : 'Ничья.';
    const won = snapshot.result === (currentColor() === 'w' ? 'white_win' : 'black_win');
    return `${won ? 'Вы победили' : 'Вы проиграли'}${snapshot.reason === 'timeout' ? ' по времени' : snapshot.reason === 'checkmate' ? ': мат' : ''}.`;
  }
  function statusGame() { setStatus(resultText(), chess.isCheck() || snapshot?.status === 'finished'); }
  function displayChess() {
    if (historyIndex === null) return chess;
    const position = new Chess(); chess.history().slice(0, historyIndex).forEach(move => position.move(move)); return position;
  }
  const historyButtons = [], historyMoves = [];
  let activeHistoryButton = null;
  function renderHistory() {
    const moves = chess.history(), list = $('move-list');
    let common = 0;
    while (common < historyMoves.length && common < moves.length && historyMoves[common] === moves[common]) common++;
    while (historyButtons.length > common) {
      const button = historyButtons.pop(), row = button.parentElement;
      button.remove(); if (!row.querySelector('button')) row.remove();
      historyMoves.pop();
    }
    for (let i = common; i < moves.length; i++) {
      let row = list.lastElementChild;
      if (i % 2 === 0) {
        row = document.createElement('li'); const number = document.createElement('span');
        number.textContent = `${i / 2 + 1}.`; row.append(number); list.append(row);
      }
      const button = document.createElement('button'); button.type = 'button'; button.textContent = moves[i];
      button.dataset.historyIndex = String(i + 1); row.append(button); historyButtons.push(button); historyMoves.push(moves[i]);
    }
    activeHistoryButton?.classList.remove('current');
    const index = historyIndex ?? moves.length;
    activeHistoryButton = historyButtons[index - 1] || null;
    activeHistoryButton?.classList.add('current');
    $('move-count').textContent = String(Math.ceil(moves.length / 2)).padStart(2, '0');
  }
  $('move-list').addEventListener('click', event => {
    const button = event.target.closest('[data-history-index]');
    if (button) showHistory(Number(button.dataset.historyIndex));
  });
  function showHistory(index) {
    const count = chess.history().length; historyIndex = index >= count ? null : Math.max(0, index);
    selected = null; renderBoard(); renderHistory();
    if (historyIndex !== null) setStatus(`Просмотр позиции: ход ${historyIndex} из ${count}.`); else statusGame();
  }
  function legalFor(square) {
    if (chess.turn() === currentColor()) return chess.moves({ square, verbose:true });
    // A premove is only a tentative hint; its legality is checked again after the reply.
    try { const fen = chess.fen().split(' '); fen[1] = currentColor(); fen[3] = '-'; return new Chess(fen.join(' ')).moves({ square, verbose:true }); } catch { return []; }
  }
  function renderBoard(animatedMove = null) {
    const color = currentColor(), shown = displayChess();
    const legal = selected && historyIndex === null ? legalFor(selected).map(move => move.to) : [];
    const last = historyIndex === null ? latestMove : shown.history({ verbose:true }).at(-1);
    boardView.render({ shown, selected, legal, last, premove, animatedMove: historyIndex === null ? animatedMove : null });
    // Establish initial rotation before the board changes sides.
    if (board.classList.contains('waiting') && snapshot) void board.offsetWidth;
    board.classList.toggle('waiting', !snapshot); board.classList.toggle('black', !!snapshot && color === 'b');
    const playerColor = snapshot ? (color === 'w' ? 'Белые' : 'Чёрные') : 'Цвет определится после поиска';
    const opponentColor = snapshot ? (color === 'w' ? 'Чёрные' : 'Белые') : '';
    if ($('player-color').textContent !== playerColor) $('player-color').textContent = playerColor;
    if ($('opponent-color').textContent !== opponentColor) $('opponent-color').textContent = opponentColor;
  }
  function revealName(text) {
    clearInterval(nameTimer); const el = $('opponent-name'); el.setAttribute('aria-label', text);
    if (reducedMotion()) { el.textContent = text; return; }
    let step = 0; const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    nameTimer = setInterval(() => { step++; el.textContent = [...text].map((c, i) => c === ' ' || step > 5 + i ? c : letters[Math.floor(Math.random() * letters.length)]).join(''); if (step > text.length + 5) { clearInterval(nameTimer); el.textContent = text; } }, 24);
  }
  function loadName(game) {
    if (nameForGame === game.id) return;
    nameForGame = game.id;
    Promise.resolve(opponentName(game.id)).then(name => { if (nameForGame === game.id && name) revealName(name); }).catch(() => {});
  }
  function playQueuedPremove() {
    if (!premove || phase !== 'active' || moving || chess.turn() !== currentColor()) return false;
    const move = premove; premove = null;
    const valid = chess.moves({ square:move.from, verbose:true }).some(m => m.to === move.to && (!m.promotion || m.promotion === move.promotion));
    if (valid) { void submitMove(move.from, move.to, move.promotion); return true; }
    renderBoard(); setStatus('Предварительный ход отменён: он больше невозможен.'); return false;
  }
  function applyGame(game) {
    if (!game || !Array.isArray(game.moves) || (snapshot && snapshot.id === game.id && game.version < snapshot.version)) return;
    if (snapshot && snapshot.id === game.id && game.version === snapshot.version && game.status === snapshot.status && !moving) {
      snapshot = game; receivedAt = now(); drawClocks(); playQueuedPremove(); return;
    }
    const previous = snapshot, localMoves = chess.history();
    const sameGame = previous?.id === game.id;
    const alreadyDisplayed = sameGame && localMoves.length === game.moves.length && localMoves.every((move, i) => move === game.moves[i]);
    let next = chess, nextLast = latestMove;
    if (!alreadyDisplayed) {
      const appendOnly = sameGame && localMoves.length <= game.moves.length && localMoves.every((move, i) => move === game.moves[i]);
      next = appendOnly ? chess : new Chess();
      let applied = 0;
      try {
        for (const move of game.moves.slice(appendOnly ? localMoves.length : 0)) { nextLast = next.move(move); applied++; }
        if (!game.moves.length) nextLast = null;
      } catch {
        if (appendOnly) while (applied-- > 0) next.undo();
        setStatus('Не удалось восстановить партию.', true); return;
      }
    }
    const newMove = sameGame && game.moves.length === previous.moves.length + 1 && !alreadyDisplayed ? nextLast : null;
    snapshot = game; receivedAt = now(); chess = next; latestMove = nextLast;
    if (!alreadyDisplayed) { cancelDrag(); selected = null; pending = null; promotion.hidden = true; }
    phase = game.status === 'active' ? 'active' : 'finished'; mode = game.mode;
    if (phase === 'finished') premove = null;
    const input = $('mode-list').querySelector(`input[value="${mode}"]`); if (input) input.checked = true;
    loadName(game); modeControls();
    // Confirming our optimistic move must not restart its animation or replace pieces.
    if (!alreadyDisplayed) renderBoard(newMove);
    renderHistory(); drawClocks();
    if (historyIndex !== null) setStatus(`Просмотр позиции: ход ${historyIndex} из ${game.moves.length}.`); else statusGame();
    if (newMove && !moving) playSound(newMove);
    if (!moving) playQueuedPremove();
  }
  async function poll(expected) {
    if (expected !== generation || !userId || !isVisible() || !['searching','active'].includes(phase)) return;
    try {
      const searching = phase === 'searching';
      const request = api(searching ? { action:'search', mode } : { action:'snapshot', gameId:snapshot.id });
      if (searching) pendingSearch = request;
      let response;
      try { response = await request; } finally { if (pendingSearch === request) pendingSearch = null; }
      if (expected !== generation) return;
      pollFailures = 0;
      if (response.game && !moving) applyGame(response.game);
      else if (phase === 'searching' && response.state === 'searching') setStatus('Ищем соперника с таким же режимом…');
    } catch { if (expected === generation) { pollFailures = Math.min(pollFailures + 1, 5); setStatus('Нет связи. Повторяем попытку…', true); } }
    // Faster updates while waiting for the opponent, but back off on outages.
    const delay = pollFailures ? Math.min(10000, 800 * 2 ** (pollFailures - 1)) : phase === 'active' && mode === 'daily' ? 15000 : phase === 'active' && snapshot?.turn !== currentColor() ? 450 : 900;
    if (expected === generation && isVisible() && ['searching','active'].includes(phase)) polling = setTimeout(() => poll(expected), delay);
  }
  async function search() {
    if (!userId || !mode || phase !== 'idle') return;
    phase = 'searching'; modeControls(); setStatus('Подключаемся к поиску…');
    cancelTimer(); const expected = ++generation; await poll(expected);
  }
  async function cancelSearch() {
    if (phase !== 'searching') return;
    cancel.disabled = true; ++generation; cancelTimer();
    try {
      if (pendingSearch) await pendingSearch.catch(() => {});
      const response = await api({ action:'cancel' });
      if (response.game) { applyGame(response.game); if (phase === 'active') void poll(generation); }
      else { phase = 'idle'; modeControls(); setStatus('Поиск отменён.'); }
    } catch { setStatus('Не удалось отменить поиск. Проверь соединение.', true); if (phase === 'searching') polling = setTimeout(() => poll(generation), 2500); }
    finally { cancel.disabled = false; }
  }
  async function submitMove(from, to, piece = null, animate = true) {
    if (moving || phase !== 'active' || !snapshot || chess.turn() !== currentColor()) return;
    const saved = snapshot, priorMoves = chess.history(), savedLast = latestMove; let move;
    try { move = chess.move({ from, to, ...(piece ? { promotion:piece } : {}) }); } catch { return; }
    // Invalidate any old snapshot request before it can overwrite the optimistic move.
    cancelTimer(); const moveGeneration = ++generation;
    moving = true; selected = null; pending = null; promotion.hidden = true; historyIndex = null; latestMove = move;
    renderBoard(animate ? move : null); renderHistory(); playSound(move); setStatus('Отправляем ход…');
    try {
      const result = await api({ action:'move', gameId:saved.id, version:saved.version, from, to, ...(piece ? { promotion:piece } : {}) });
      if (!result.game) throw Error('missing snapshot');
      if (moveGeneration !== generation) return;
      applyGame(result.game);
      if (result.game.version === saved.version) setStatus('Ход не принят сервером. Позиция обновлена.', true);
    } catch {
      if (moveGeneration !== generation) return;
      setStatus('Ход не подтверждён. Проверяем партию…', true);
      // A lost response may still have committed: reconcile before rolling back.
      try {
        const result = await api({ action:'snapshot', gameId:saved.id });
        if (moveGeneration !== generation) return;
        if (!result.game) throw Error('missing snapshot');
        applyGame(result.game);
      } catch {
        if (moveGeneration !== generation) return;
        chess = new Chess(); priorMoves.forEach(m => chess.move(m)); latestMove = savedLast;
        premove = null; selected = null; renderBoard(); renderHistory();
        setStatus('Нет связи. Позиция восстановится после подключения.', true);
      }
    } finally {
      moving = false;
      if (moveGeneration === generation && isVisible() && phase === 'active') {
        if (!playQueuedPremove()) { cancelTimer(); void poll(++generation); }
      }
    }
  }
  function attempt(from, to, animate = true) {
    if (historyIndex !== null || phase !== 'active' || (moving && chess.turn() === currentColor()) || pending || !from || !to) return false;
    const choices = legalFor(from).filter(move => move.to === to);
    if (!choices.length) return false;
    if (chess.turn() !== currentColor()) {
      premove = { from, to, ...(choices.some(m => m.promotion) ? { promotion:'q' } : {}) }; selected = null; renderBoard(); setStatus('Предварительный ход готов. Нажмите на него, чтобы отменить.'); return true;
    }
    if (choices.some(move => move.promotion)) {
      pending = { from, to }; promotion.hidden = false; options.replaceChildren(); setStatus('Пешка дошла до края. Выберите фигуру.', true);
      for (const type of ['q','r','b','n']) {
        const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', names[type]);
        const img = document.createElement('img'); img.src = pieceSrc(currentColor(), type); img.alt = ''; button.append(img);
        button.addEventListener('click', () => { if (pending) void submitMove(pending.from, pending.to, type); }); options.append(button);
      }
      options.firstChild.focus(); return true;
    }
    void submitMove(from, to, null, animate); return true;
  }
  function choose(square) {
    if (!square || phase !== 'active' || (moving && chess.turn() === currentColor()) || pending || historyIndex !== null) return;
    if (premove && (premove.from === square || premove.to === square)) { premove = null; selected = null; renderBoard(); statusGame(); return; }
    if (selected && attempt(selected, square)) return;
    const piece = chess.get(square); selected = piece?.color === currentColor() && selected !== square ? square : null; renderBoard();
    board.querySelector(`[data-square="${square}"]`)?.focus();
  }
  board.addEventListener('click', event => { sound.prime(); if (suppressClick) { suppressClick = false; return; } choose(event.target.closest('[data-square]')?.dataset.square); });
  board.addEventListener('keydown', () => sound.prime());
  start.addEventListener('pointerdown', () => sound.prime());
  start.addEventListener('keydown', () => sound.prime());
  function moveGhost(d) {
    if (!d.ghost) return;
    d.ghost.style.transform = `translate3d(${d.xNow}px, ${d.yNow}px, 0) translate(-50%, -50%)`;
    d.raf = null;
  }
  function cancelDrag() {
    if (!drag) return;
    if (drag.raf != null) win.cancelAnimationFrame?.(drag.raf);
    drag.cell.classList.remove('dragging'); drag.ghost?.remove(); drag = null;
  }
  board.addEventListener('pointerdown', event => {
    sound.prime();
    if (event.button !== 0 || phase !== 'active' || (moving && chess.turn() === currentColor()) || pending || historyIndex !== null) return;
    const cell = event.target.closest('[data-square]'), square = cell?.dataset.square, piece = square && chess.get(square);
    if (!piece || piece.color !== currentColor()) return;
    drag = { from:square, x:event.clientX, y:event.clientY, xNow:event.clientX, yNow:event.clientY, pointer:event.pointerId, cell, ghost:null, raf:null };
  });
  board.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.xNow = event.clientX; drag.yNow = event.clientY;
    if (!drag.ghost && Math.hypot(event.clientX-drag.x, event.clientY-drag.y) > 5) {
      board.setPointerCapture?.(event.pointerId);
      const size = drag.cell.getBoundingClientRect().width; selected = drag.from; renderBoard();
      drag.ghost = document.createElement('img'); drag.ghost.className = 'drag-ghost'; drag.ghost.alt = '';
      drag.ghost.src = pieceSrc(currentColor(), chess.get(drag.from).type); drag.ghost.style.setProperty('--drag-size', `${size}px`);
      drag.cell.classList.add('dragging'); document.body.append(drag.ghost); moveGhost(drag);
    }
    if (drag.ghost && drag.raf == null) {
      if (win.requestAnimationFrame) drag.raf = win.requestAnimationFrame(() => { if (drag) moveGhost(drag); });
      else moveGhost(drag);
    }
  });
  function endDrag(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const d = drag;
    if (!d.ghost) { drag = null; return; }
    const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest('[data-square]')?.dataset.square;
    cancelDrag(); suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    // The dragged piece is already under the pointer; do not animate it from its old square.
    if (!target || !attempt(d.from, target, false)) { selected = null; renderBoard(); }
  }
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', event => { if (drag?.pointer !== event.pointerId) return; cancelDrag(); selected = null; renderBoard(); });
  $('toggle-moves').addEventListener('click', () => { const content = $('history-content'); content.hidden = !content.hidden; $('toggle-moves').setAttribute('aria-expanded', String(!content.hidden)); });
  $('history-first').addEventListener('click', () => showHistory(0)); $('history-prev').addEventListener('click', () => showHistory((historyIndex ?? chess.history().length) - 1));
  $('history-next').addEventListener('click', () => showHistory((historyIndex ?? chess.history().length) + 1)); $('history-last').addEventListener('click', () => showHistory(chess.history().length));
  $('mode-list').addEventListener('change', event => { if (phase === 'idle' && times[event.target.value]) { mode = event.target.value; modeControls(); drawClocks(); setStatus('Всё готово к поиску.'); } });
  start.addEventListener('click', () => void search()); cancel.addEventListener('click', () => void cancelSearch());
  reset.addEventListener('click', () => { cancelTimer(); generation++; snapshot = null; chess = new Chess(); latestMove = null; phase = 'idle'; premove = null; historyIndex = null; nameForGame = null; clearInterval(nameTimer); $('opponent-name').textContent = 'Соперник'; modeControls(); renderBoard(); renderHistory(); drawClocks(); setStatus('Выбери режим.'); });
  function pause() { cancelDrag(); if (phase === 'searching') void cancelSearch(); else { generation++; cancelTimer(); } }
  function resume() { if (phase === 'active' || phase === 'searching') void poll(++generation); }
  const clockInterval = setInterval(() => { if (isVisible()) drawClocks(); }, 250);
  modeControls(); renderBoard(); drawClocks(); setTimeout(() => board.classList.add('ready'), 500);
  return {
    async open(id) {
      if (userId === id) return;
      userId = id; modeControls();
      try { const result = await api({ action:'current' }); if (result.game && phase === 'idle') { applyGame(result.game); if (phase === 'active') void poll(++generation); } }
      catch { if (phase === 'idle') setStatus('Не удалось проверить текущую партию. Проверь соединение.', true); }
      finally { ready = true; modeControls(); }
    },
    hide() { const wasVisible = isVisible(); viewVisible = false; if (wasVisible) pause(); },
    show() { const wasVisible = isVisible(); viewVisible = true; if (!wasVisible && isVisible()) { board.classList.add('ready'); resume(); } },
    browserVisibility(value) { const wasVisible = isVisible(); browserVisible = value; if (wasVisible && !isVisible()) pause(); else if (!wasVisible && isVisible()) resume(); },
    destroy() { generation++; cancelDrag(); cancelTimer(); clearInterval(clockInterval); clearInterval(nameTimer); sound.destroy(); },
  };
}
