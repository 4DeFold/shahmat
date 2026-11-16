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

export function createMemberGame({ document, api, now = () => performance.now() }) {
  const $ = id => document.getElementById(id);
  const board = $('board'), start = $('start-search'), cancel = $('cancel-search'), reset = $('new-game');
  const promotion = $('promotion'), options = $('promotion-options');
  let userId = null, ready = false, chess = new Chess(), mode = null, phase = 'idle', selected = null, pending = null;
  let snapshot = null, receivedAt = 0, polling = null, generation = 0, moving = false, pendingSearch = null, viewVisible = true, browserVisible = true;
  const isVisible = () => viewVisible && browserVisible;
  const setStatus = text => { $('status').textContent = text; };
  const cancelTimer = () => { if (polling !== null) clearTimeout(polling); polling = null; };
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
    $('player-clock').textContent = formatClock(time(own));
    $('opponent-clock').textContent = formatClock(time(own === 'w' ? 'b' : 'w'));
  }
  function resultText() {
    if (!snapshot || snapshot.status !== 'finished') return snapshot?.turn === currentColor() ? (chess.isCheck() ? 'Шах! Ваш ход.' : 'Ваш ход.') : 'Ход соперника.';
    if (snapshot.result === 'draw') return 'Ничья.';
    const won = snapshot.result === (currentColor() === 'w' ? 'white_win' : 'black_win');
    return `${won ? 'Вы победили' : 'Вы проиграли'}${snapshot.reason === 'timeout' ? ' по времени' : snapshot.reason === 'checkmate' ? ': мат' : ''}.`;
  }
  function renderHistory() {
    const moves = chess.history(), list = $('move-list');
    list.replaceChildren();
    for (let i = 0; i < moves.length; i += 2) {
      const li = document.createElement('li');
      for (const text of [`${i / 2 + 1}.`, moves[i], moves[i + 1] || '—']) { const item = document.createElement('span'); item.textContent = text; li.append(item); }
      list.append(li);
    }
    $('move-count').textContent = String(Math.ceil(moves.length / 2)).padStart(2, '0');
  }
  function renderBoard() {
    const color = currentColor(), ranks = color === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
    const orderedFiles = color === 'w' ? [...files] : [...files].reverse();
    const legal = selected ? chess.moves({ square: selected, verbose: true }).map(move => move.to) : [];
    const fragment = document.createDocumentFragment();
    ranks.forEach((rank, row) => orderedFiles.forEach((file, column) => {
      const square = `${file}${rank}`, piece = chess.get(square), cell = document.createElement('button');
      cell.type = 'button'; cell.className = `square ${(rank + files.indexOf(file)) % 2 ? 'dark' : 'light'}`; cell.dataset.square = square;
      cell.classList.toggle('selected', selected === square); cell.classList.toggle('possible', legal.includes(square));
      cell.setAttribute('aria-label', `${square}, ${piece ? (piece.color === 'w' ? 'белые, ' : 'чёрные, ') + names[piece.type] : 'пусто'}`);
      cell.setAttribute('aria-pressed', String(selected === square));
      if (piece) { const img = document.createElement('img'); img.className = 'piece'; img.src = pieceSrc(piece.color, piece.type); img.alt = ''; img.draggable = false; cell.append(img); }
      if (row === 7) { const coord = document.createElement('span'); coord.className = 'coord file'; coord.textContent = file; cell.append(coord); }
      if (column === 0) { const coord = document.createElement('span'); coord.className = 'coord rank'; coord.textContent = rank; cell.append(coord); }
      fragment.append(cell);
    }));
    board.replaceChildren(fragment);
    $('player-color').textContent = color === 'w' ? 'Белые' : 'Чёрные';
    $('opponent-color').textContent = color === 'w' ? 'Чёрные' : 'Белые';
  }
  function applyGame(game) {
    if (!game || (snapshot && snapshot.id === game.id && game.version < snapshot.version)) return;
    if (snapshot && snapshot.id === game.id && game.version === snapshot.version && game.status === snapshot.status) {
      snapshot = game; receivedAt = now(); drawClocks(); return;
    }
    const next = new Chess();
    try { for (const move of game.moves) next.move(move); } catch { setStatus('Не удалось восстановить партию.'); return; }
    snapshot = game; receivedAt = now(); chess = next; selected = null; pending = null; promotion.hidden = true;
    phase = game.status === 'active' ? 'active' : 'finished';
    mode = game.mode;
    const input = $('mode-list').querySelector(`input[value="${mode}"]`); if (input) input.checked = true;
    modeControls(); renderBoard(); renderHistory(); drawClocks(); setStatus(resultText());
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
      if (response.game) applyGame(response.game);
      else if (phase === 'searching' && response.state === 'searching') setStatus('Ищем соперника с таким же режимом…');
    } catch { if (expected === generation) setStatus('Нет связи. Повторяем попытку…'); }
    if (expected === generation && isVisible() && ['searching','active'].includes(phase)) polling = setTimeout(() => poll(expected), phase === 'active' && mode === 'daily' ? 15000 : 2500);
  }
  async function search() {
    if (!userId || !mode || phase !== 'idle') return;
    phase = 'searching'; modeControls(); setStatus('Подключаемся к поиску…');
    cancelTimer(); const expected = ++generation; await poll(expected);
  }
  async function cancelSearch() {
    if (phase !== 'searching') return;
    cancel.disabled = true;
    ++generation; cancelTimer();
    try {
      // Wait for a search already in flight before removing its queue entry.
      if (pendingSearch) await pendingSearch.catch(() => {});
      const response = await api({ action:'cancel' });
      if (response.game) { applyGame(response.game); if (phase === 'active') void poll(generation); }
      else { phase = 'idle'; modeControls(); setStatus('Поиск отменён.'); }
    } catch { setStatus('Не удалось отменить поиск. Проверь соединение.'); if (phase === 'searching') polling = setTimeout(() => poll(generation), 2500); }
    finally { cancel.disabled = false; }
  }
  async function submitMove(from, to, piece = null) {
    if (moving || phase !== 'active' || !snapshot) return;
    moving = true; selected = null; pending = null; promotion.hidden = true; renderBoard();
    try {
      const result = await api({ action:'move', gameId:snapshot.id, version:snapshot.version, from, to, ...(piece ? { promotion:piece } : {}) });
      if (result.game) applyGame(result.game);
    } catch { setStatus('Ход не отправлен. Проверь соединение.'); }
    finally { moving = false; }
  }
  board.addEventListener('click', event => {
    const square = event.target.closest('[data-square]')?.dataset.square;
    if (!square || phase !== 'active' || moving || pending || chess.turn() !== currentColor()) return;
    const piece = chess.get(square);
    if (selected) {
      const moves = chess.moves({ square:selected, verbose:true }).filter(move => move.to === square);
      if (moves.length) {
        if (moves.some(move => move.promotion)) {
          pending = { from:selected, to:square }; promotion.hidden = false; options.replaceChildren();
          for (const type of ['q','r','b','n']) {
            const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', names[type]);
            const img = document.createElement('img'); img.src = pieceSrc(currentColor(), type); img.alt = ''; button.append(img);
            button.addEventListener('click', () => void submitMove(pending.from, pending.to, type)); options.append(button);
          }
          options.firstChild.focus(); return;
        }
        void submitMove(selected, square); return;
      }
    }
    selected = piece?.color === currentColor() && selected !== square ? square : null; renderBoard();
    board.querySelector(`[data-square="${square}"]`)?.focus();
  });
  $('mode-list').addEventListener('change', event => { if (phase === 'idle' && times[event.target.value]) { mode = event.target.value; modeControls(); drawClocks(); setStatus('Всё готово к поиску.'); } });
  start.addEventListener('click', () => void search()); cancel.addEventListener('click', () => void cancelSearch());
  reset.addEventListener('click', () => { cancelTimer(); generation++; snapshot = null; chess = new Chess(); phase = 'idle'; modeControls(); renderBoard(); renderHistory(); drawClocks(); setStatus('Выбери режим.'); });
  function pause() { if (phase === 'searching') void cancelSearch(); else { generation++; cancelTimer(); } }
  function resume() { if (phase === 'active' || phase === 'searching') void poll(++generation); }
  const clockInterval = setInterval(drawClocks, 250);
  modeControls(); renderBoard(); drawClocks();
  return {
    async open(id) {
      if (userId === id) return;
      userId = id; modeControls();
      try {
        const result = await api({ action:'current' });
        if (result.game && phase === 'idle') { applyGame(result.game); if (phase === 'active') void poll(++generation); }
      } catch { if (phase === 'idle') setStatus('Не удалось проверить текущую партию. Проверь соединение.'); }
      finally { ready = true; modeControls(); }
    },
    hide() { const wasVisible = isVisible(); viewVisible = false; if (wasVisible) pause(); },
    show() { const wasVisible = isVisible(); viewVisible = true; if (!wasVisible && isVisible()) resume(); },
    browserVisibility(value) { const wasVisible = isVisible(); browserVisible = value; if (wasVisible && !isVisible()) pause(); else if (!wasVisible && isVisible()) resume(); },
    destroy() { generation++; cancelTimer(); clearInterval(clockInterval); },
  };
}
