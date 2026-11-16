import { Chess } from 'chess.js';

const times = { blitz: 180000, rapid: 600000, classical: 3600000, daily: 86400000 };
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
  let userId = null, ready = false, chess = new Chess(), mode = null, phase = 'idle', selected = null, pending = null;
  let snapshot = null, receivedAt = 0, polling = null, generation = 0, moving = false, pendingSearch = null, viewVisible = true, browserVisible = true;
  let premove = null, historyIndex = null, nameForGame = null, nameTimer = null, drag = null, suppressClick = false, audio = null;
  const isVisible = () => viewVisible && browserVisible;
  const setStatus = (text, urgent = false) => { $('status').textContent = text; $('status').parentElement.classList.toggle('urgent', urgent); };
  const cancelTimer = () => { if (polling !== null) clearTimeout(polling); polling = null; };
  const reducedMotion = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function sound(capture = false) {
    try {
      const Context = win.AudioContext || win.webkitAudioContext;
      if (!Context) return;
      audio ||= new Context();
      if (audio.state === 'suspended') void audio.resume();
      const oscillator = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(capture ? 260 : 520, t);
      oscillator.frequency.exponentialRampToValueAtTime(capture ? 120 : 330, t + .08);
      gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(.12, t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + .12);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(t); oscillator.stop(t + .13);
    } catch { /* Audio is optional and subject to browser autoplay rules. */ }
  }
  function modeControls() {
    const locked = phase !== 'idle';
    $('mode-list').querySelectorAll('input').forEach(input => { input.disabled = locked; });
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
      card.dataset.color = snapshot ? color : 'neutral';
      card.style.setProperty('--second-progress', `${remaining == null ? 0 : (Math.ceil(remaining / 1000) % 60) / 60 * 100}%`);
      card.classList.toggle('running', snapshot?.status === 'active' && snapshot.turn === color);
      card.classList.toggle('low', remaining != null && remaining <= 30000 && snapshot?.status === 'active' && snapshot.turn === color);
      const clock = $(`${id}-clock`), text = formatClock(remaining);
      if (clock.textContent !== text) {
        clock.replaceChildren(document.createTextNode(text.slice(0, -2)));
        const seconds = document.createElement('span'); seconds.className = 'clock-seconds'; seconds.textContent = text.slice(-2); clock.append(seconds);
      }
    }
    $('player-clock-label').hidden = !snapshot;
    $('opponent-clock-label').hidden = !snapshot;
    $('player-clock-label').textContent = snapshot ? `Вы · ${own === 'w' ? 'Белые' : 'Чёрные'}` : '';
    $('opponent-clock-label').textContent = snapshot ? `Соперник · ${other === 'w' ? 'Белые' : 'Чёрные'}` : '';
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
  function renderHistory() {
    const moves = chess.history(), list = $('move-list'); list.replaceChildren();
    for (let i = 0; i < moves.length; i += 2) {
      const li = document.createElement('li'), num = document.createElement('span'); num.textContent = `${i / 2 + 1}.`; li.append(num);
      for (let j = i; j < Math.min(i + 2, moves.length); j++) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = moves[j];
        button.classList.toggle('current', (historyIndex ?? moves.length) === j + 1);
        button.addEventListener('click', () => showHistory(j + 1)); li.append(button);
      }
      list.append(li);
    }
    $('move-count').textContent = String(Math.ceil(moves.length / 2)).padStart(2, '0');
  }
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
    const last = shown.history({ verbose:true }).at(-1);
    const fragment = document.createDocumentFragment();
    [8,7,6,5,4,3,2,1].forEach((rank, row) => [...files].forEach((file, column) => {
      const square = `${file}${rank}`, piece = shown.get(square), cell = document.createElement('button');
      cell.type = 'button'; cell.className = `square ${(rank + files.indexOf(file)) % 2 ? 'dark' : 'light'}`; cell.dataset.square = square;
      cell.classList.toggle('selected', selected === square); cell.classList.toggle('possible', legal.includes(square));
      cell.classList.toggle('last-move', !!last && (last.from === square || last.to === square));
      cell.classList.toggle('premove', !!premove && (premove.from === square || premove.to === square));
      cell.classList.toggle('check', !!piece && piece.type === 'k' && piece.color === shown.turn() && shown.isCheck());
      cell.setAttribute('aria-label', `${square}, ${piece ? (piece.color === 'w' ? 'белые, ' : 'чёрные, ') + names[piece.type] : 'пусто'}`);
      cell.setAttribute('aria-pressed', String(selected === square));
      if (piece) { const img = document.createElement('img'); img.className = 'piece'; img.src = pieceSrc(piece.color, piece.type); img.alt = ''; img.draggable = false; cell.append(img); }
      if (row === 7) { const coord = document.createElement('span'); coord.className = 'coord file'; coord.textContent = file; cell.append(coord); }
      if (column === 0) { const coord = document.createElement('span'); coord.className = 'coord rank'; coord.textContent = rank; cell.append(coord); }
      fragment.append(cell);
    }));
    board.replaceChildren(fragment);
    // Establish the initial counter-rotation before transitioning both layers.
    if (board.classList.contains('waiting') && snapshot) void board.offsetWidth;
    board.classList.toggle('waiting', !snapshot); board.classList.toggle('black', !!snapshot && color === 'b');
    $('player-color').textContent = snapshot ? (color === 'w' ? 'Белые' : 'Чёрные') : 'Цвет определится после поиска';
    $('opponent-color').textContent = snapshot ? (color === 'w' ? 'Чёрные' : 'Белые') : '';
    if (animatedMove && historyIndex === null && !reducedMotion()) {
      const from = board.querySelector(`[data-square="${animatedMove.from}"]`), to = board.querySelector(`[data-square="${animatedMove.to}"]`), img = to?.querySelector('img');
      if (from && to && img?.animate) {
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        // Transforms on the rotated board use its local coordinates.
        const sign = color === 'b' ? -1 : 1;
        img.animate([{ translate:`${(a.left-b.left)*sign}px ${(a.top-b.top)*sign}px` }, { translate:'0 0' }], { duration:180, easing:'ease-out' });
      }
    }
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
  function applyGame(game) {
    if (!game || (snapshot && snapshot.id === game.id && game.version < snapshot.version)) return;
    if (snapshot && snapshot.id === game.id && game.version === snapshot.version && game.status === snapshot.status && !moving) {
      snapshot = game; receivedAt = now(); drawClocks(); return;
    }
    const previous = snapshot, next = new Chess();
    try { for (const move of game.moves) next.move(move); } catch { setStatus('Не удалось восстановить партию.', true); return; }
    const newMove = previous?.id === game.id && game.moves.length > previous.moves.length ? next.history({ verbose:true }).at(-1) : null;
    snapshot = game; receivedAt = now(); chess = next; selected = null; pending = null; promotion.hidden = true;
    phase = game.status === 'active' ? 'active' : 'finished'; mode = game.mode;
    const input = $('mode-list').querySelector(`input[value="${mode}"]`); if (input) input.checked = true;
    loadName(game); modeControls(); renderBoard(newMove); renderHistory(); drawClocks(); statusGame();
    if (newMove && !moving) sound(!!newMove.captured);
    if (premove && phase === 'active' && chess.turn() === currentColor() && !moving) {
      const move = premove; premove = null;
      const valid = chess.moves({ square:move.from, verbose:true }).some(m => m.to === move.to && (!m.promotion || m.promotion === move.promotion));
      if (valid) void submitMove(move.from, move.to, move.promotion);
      else { renderBoard(); setStatus('Предварительный ход отменён: он больше невозможен.'); }
    }
    if (phase === 'finished') premove = null;
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
      if (response.game && !moving) applyGame(response.game);
      else if (phase === 'searching' && response.state === 'searching') setStatus('Ищем соперника с таким же режимом…');
    } catch { if (expected === generation) setStatus('Нет связи. Повторяем попытку…', true); }
    if (expected === generation && isVisible() && ['searching','active'].includes(phase)) polling = setTimeout(() => poll(expected), phase === 'active' && mode === 'daily' ? 15000 : 900);
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
  async function submitMove(from, to, piece = null) {
    if (moving || phase !== 'active' || !snapshot || chess.turn() !== currentColor()) return;
    const saved = snapshot, priorMoves = chess.history(); let move;
    try { move = chess.move({ from, to, ...(piece ? { promotion:piece } : {}) }); } catch { return; }
    moving = true; selected = null; pending = null; promotion.hidden = true; historyIndex = null;
    renderBoard(move); renderHistory(); sound(!!move.captured); setStatus('Отправляем ход…');
    try {
      const result = await api({ action:'move', gameId:saved.id, version:saved.version, from, to, ...(piece ? { promotion:piece } : {}) });
      if (!result.game) throw Error('missing snapshot');
      applyGame(result.game);
      if (result.game.version === saved.version) setStatus('Ход не принят сервером. Позиция обновлена.', true);
    } catch {
      chess = new Chess(); priorMoves.forEach(m => chess.move(m)); renderBoard(); renderHistory();
      setStatus('Ход не подтверждён. Проверяем партию…', true);
      // The request may have committed even if the response was lost.
      try { const result = await api({ action:'snapshot', gameId:saved.id }); if (result.game) applyGame(result.game); } catch { setStatus('Нет связи. Позиция восстановится после подключения.', true); }
    } finally { moving = false; }
  }
  function attempt(from, to) {
    if (historyIndex !== null || phase !== 'active' || moving || pending || !from || !to) return false;
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
    void submitMove(from, to); return true;
  }
  function choose(square) {
    if (!square || phase !== 'active' || moving || pending || historyIndex !== null) return;
    if (premove && (premove.from === square || premove.to === square)) { premove = null; selected = null; renderBoard(); statusGame(); return; }
    if (selected && attempt(selected, square)) return;
    const piece = chess.get(square); selected = piece?.color === currentColor() && selected !== square ? square : null; renderBoard();
    board.querySelector(`[data-square="${square}"]`)?.focus();
  }
  board.addEventListener('click', event => { if (suppressClick) { suppressClick = false; return; } choose(event.target.closest('[data-square]')?.dataset.square); });
  board.addEventListener('pointerdown', event => {
    if (event.button !== 0 || phase !== 'active' || moving || pending || historyIndex !== null) return;
    const cell = event.target.closest('[data-square]'), square = cell?.dataset.square, piece = square && chess.get(square);
    if (!piece || piece.color !== currentColor()) return;
    drag = { from:square, x:event.clientX, y:event.clientY, pointer:event.pointerId, cell, ghost:null };
  });
  board.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!drag.ghost && Math.hypot(event.clientX-drag.x, event.clientY-drag.y) > 5) {
      board.setPointerCapture?.(event.pointerId);
      const size = drag.cell.getBoundingClientRect().width; selected = drag.from; renderBoard(); drag.ghost = document.createElement('img'); drag.ghost.className = 'drag-ghost'; drag.ghost.src = pieceSrc(currentColor(), chess.get(drag.from).type); drag.ghost.style.setProperty('--drag-size', `${size}px`); document.body.append(drag.ghost);
    }
    if (drag.ghost) { drag.ghost.style.left = `${event.clientX}px`; drag.ghost.style.top = `${event.clientY}px`; }
  });
  function endDrag(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const d = drag; drag = null; if (!d.ghost) return;
    d.ghost.remove(); suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest('[data-square]')?.dataset.square;
    if (!target || !attempt(d.from, target)) { selected = null; renderBoard(); }
  }
  board.addEventListener('pointerup', endDrag); board.addEventListener('pointercancel', event => { if (drag?.ghost) drag.ghost.remove(); drag = null; selected = null; renderBoard(); });
  $('toggle-moves').addEventListener('click', () => { const content = $('history-content'); content.hidden = !content.hidden; $('toggle-moves').setAttribute('aria-expanded', String(!content.hidden)); });
  $('history-first').addEventListener('click', () => showHistory(0)); $('history-prev').addEventListener('click', () => showHistory((historyIndex ?? chess.history().length) - 1));
  $('history-next').addEventListener('click', () => showHistory((historyIndex ?? chess.history().length) + 1)); $('history-last').addEventListener('click', () => showHistory(chess.history().length));
  $('mode-list').addEventListener('change', event => { if (phase === 'idle' && times[event.target.value]) { mode = event.target.value; modeControls(); drawClocks(); setStatus('Всё готово к поиску.'); } });
  start.addEventListener('click', () => void search()); cancel.addEventListener('click', () => void cancelSearch());
  reset.addEventListener('click', () => { cancelTimer(); generation++; snapshot = null; chess = new Chess(); phase = 'idle'; premove = null; historyIndex = null; nameForGame = null; clearInterval(nameTimer); $('opponent-name').textContent = 'Соперник'; modeControls(); renderBoard(); renderHistory(); drawClocks(); setStatus('Выбери режим.'); });
  function pause() { if (phase === 'searching') void cancelSearch(); else { generation++; cancelTimer(); } }
  function resume() { if (phase === 'active' || phase === 'searching') void poll(++generation); }
  const clockInterval = setInterval(drawClocks, 100);
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
    show() { const wasVisible = isVisible(); viewVisible = true; if (!wasVisible && isVisible()) { board.classList.remove('ready'); setTimeout(() => board.classList.add('ready'), 500); resume(); } },
    browserVisibility(value) { const wasVisible = isVisible(); browserVisible = value; if (wasVisible && !isVisible()) pause(); else if (!wasVisible && isVisible()) resume(); },
    destroy() { generation++; cancelTimer(); clearInterval(clockInterval); clearInterval(nameTimer); void audio?.close(); },
  };
}
