import {pieceSrc as themedPieceSrc,setPublicPiece} from './piece-theme.js';
import {applyProfileTheme,isProfileImage,profileAvatarColor} from './profile-theme.js';
import { Chess } from 'chess.js';
import {renderCaptures,renderThreats} from './board-insights.js';
import { premoveTargets, validPremove, normalizePremove, projectPremoves } from './premove.js';
import { createBoardAnnotations } from './board-annotations.js';
import { createMemberBoard } from './member-board.js';
import { createMoveHistory, historyTransition, historyKeyTarget, historySoundMove } from './move-history.js';
import { createGameSound } from './game-sound.js';
import { createSearchLoader } from './search-loader.js';
import { createRollingClock } from './rolling-clock.js';
import { retryMessage } from './match-api.js';
import { createClockSync } from './clock-sync.js';
import { createRatingCount } from './rating-count.js';

const times = { bullet: 60000, blitz: 180000, rapid: 600000, classical: 3600000 };
const modeLabels = { bullet:'Пуля · 1 мин', blitz:'Блиц · 3 мин', rapid:'Рапид · 10 мин', classical:'Классика · 1 час' };
const names = { k:'король', q:'ферзь', r:'ладья', b:'слон', n:'конь', p:'пешка' };
const files = 'abcdefgh';
const pieceSrc = (color, type) => themedPieceSrc(color,type);
export function formatClock(ms) {
  if (ms == null) return '00:00';
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function createMemberGame({ document, api, opponentName = async () => null, playerRatings = async () => null, ownRatingForMode = async () => null, onGameChanged = () => {}, now = () => performance.now() }) {
  const $ = id => document.getElementById(id), win = document.defaultView;
  const board = $('board'), start = $('start-search'), cancel = $('cancel-search'), reset = $('new-game');
  const promotion = $('promotion'), options = $('promotion-options');
  let userId = null, ready = false, chess = new Chess(), latestMove = null, mode = null, phase = 'idle', selected = null, pending = null;
  let snapshot = null, receivedAt = 0, polling = null, generation = 0, moving = false, pendingSearch = null, viewVisible = true, browserVisible = true, pollFailures = 0;
  let currentRequest = null, destroyed = false, reconciling = false, cancelPending = false;
  let threatKeys = new Set();
  let premove = [], historyIndex = null, nameForGame = null, nameTimer = null, drag = null, suppressClick = false, actionPending = false;
  let rankUnit = 'yar', ownScore = null, scores = null, ratingsKey = null, ratingsRequest = 0, ratingsRetryAt = 0;
  let ownRatingRequest = 0;
  const ratingCounts = Object.fromEntries(['player','opponent'].map(who => [who, createRatingCount($(who+'-rating'), win)]));
  async function refreshOwnRating() {
    if (!userId) return;
    const request = ++ownRatingRequest, requestedMode = mode, id = userId;
    try {
      const value = await ownRatingForMode(requestedMode);
      if (destroyed || request !== ownRatingRequest || userId !== id || mode !== requestedMode || snapshot) return;
      if (value) { ownScore = value; renderRatings(); }
    } catch { /* Keep the last known value on a temporary failure. */ }
  }
  function setAvatar(who, value, set) { const img = $(`${who}-avatar-image`); if(!img)return; const custom=typeof value==='string' && /^data:image\/(?:png|jpeg);base64,/.test(value); if(who==='opponent')setPublicPiece(img,set,'b');else {delete img.dataset.pieceFixed;img.src=themedPieceSrc('w','n');}if(custom)img.src=value; img.classList.toggle('custom-profile-avatar',custom); }
  function renderRatings() {
    for (const who of ['player','opponent']) {
      const data=who === 'player' ? (scores?.self || ownScore) : scores?.opponent; ratingCounts[who].set(data?.[rankUnit], rankUnit, !!data); const badge=$(who+'-top-status'); if(badge){const place=Number(data?.topPlace);badge.hidden=!(place>=1&&place<=5);badge.textContent=badge.hidden?'':`Топ ${place}`;} const img=$(who+'-avatar-image');if(img)img.parentElement.style.backgroundColor=profileAvatarColor(data?.palette);
    }
  }
  function loadRatings(game) {
    const key = `${game.id}:${game.status}`;
    if (ratingsKey === key || (ratingsRetryAt && snapshot?.id === game.id && now() < ratingsRetryAt)) return;
    if (ratingsKey && !ratingsKey.startsWith(game.id + ':')) { scores = null; renderRatings(); }
    ratingsKey = key; const request = ++ratingsRequest;
    Promise.resolve().then(() => playerRatings(game.id)).then(rows => {
      if (destroyed || request !== ratingsRequest || snapshot?.id !== game.id) return;
      if (!Array.isArray(rows)) throw new Error('missing ratings');
      scores = Object.fromEntries(rows.filter(row => row.player === 'self' || row.player === 'opponent').map(row => [row.player,row]));
      const name = scores.self?.username; if (typeof name === 'string' && name && $('player-name')) { $('player-name').textContent = name; $('player-profile-trigger').dataset.profileName = name; }
      setAvatar('player',scores.self?.avatar); setAvatar('opponent',scores.opponent?.avatar,scores.opponent?.piece_set);
      renderRatings();
    }).catch(() => { if (request === ratingsRequest) { ratingsKey = null; ratingsRetryAt = now() + 8000; } });
  }
  const sound = createGameSound(win);
  const searchLoader = createSearchLoader($('search-loader'), win);
  const clockSync = createClockSync();
  const isVisible = () => viewVisible && browserVisible;
  const setStatus = (text, urgent = false) => { const el = $('status'); if (el.textContent !== text) el.textContent = text; el.parentElement.classList.toggle('urgent', urgent); };
  const cancelTimer = () => { if (polling !== null) clearTimeout(polling); polling = null; };
  const reducedMotion = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clocks = { player: createRollingClock($('player-clock'), reducedMotion), opponent: createRollingClock($('opponent-clock'), reducedMotion) };
  const boardView = createMemberBoard({ document, board, reducedMotion });
  const annotations = createBoardAnnotations({ document, board, enabled: () => !!snapshot });
  // Age is provided by the server, then advanced monotonically between snapshots.
  const canResign = () => phase === 'active' && Number.isFinite(snapshot?.game_age_ms) && snapshot.game_age_ms + Math.max(0, now() - receivedAt) >= 60000;
  const playSound = move => sound.play(move);
  function modeControls() {
    const locked = phase !== 'idle';
    $('mode-list').querySelectorAll('input').forEach(input => { input.disabled = locked; });
    const picker = $('mode-picker');
    picker.classList.toggle('is-collapsed', locked);
    picker.inert = locked; picker.setAttribute('aria-hidden', String(locked));
    $('mode-summary').hidden = !locked || !mode;
    $('mode-summary').textContent = modeLabels[mode] || '';
    $('resign-control').hidden = !canResign();
    $('offline-choice').hidden = phase !== 'active' || snapshot?.opponent_offline !== true;
    for (const id of ['resign-button','resign-confirm','offline-win','offline-draw']) $(id).disabled = actionPending || moving;
    if (phase !== 'active') closeResign();
    start.hidden = phase !== 'idle' || !mode; start.disabled = !userId || !ready || !mode;
    searchLoader.setVisible(phase === 'searching');
    cancel.hidden = phase !== 'searching' && phase !== 'cancelling'; cancel.disabled = phase === 'cancelling'; reset.hidden = phase !== 'finished';
    $('moves').hidden = phase !== 'active' && phase !== 'finished';
  }
  function currentColor() { return snapshot?.black_id === userId ? 'b' : 'w'; }
  function drawClocks() {
    const own = currentColor();
    const time = color => snapshot ? clockSync.value(color, now()) : mode ? times[mode] : null;
    const other = own === 'w' ? 'b' : 'w';
    for (const [id, color] of [['player', own], ['opponent', other]]) {
      const card = $(`${id}-clock-card`), remaining = time(color);
      const background = snapshot ? color : 'neutral';
      if (card.dataset.color !== background) card.dataset.color = background;
      card.classList.toggle('running', snapshot?.status === 'active' && snapshot.turn === color);
      card.classList.toggle('low', remaining != null && remaining <= 30000 && snapshot?.status === 'active' && snapshot.turn === color);
      clocks[id].update(formatClock(remaining));
    }
    for (const [id, text] of [['player', `Вы · ${own === 'w' ? 'Белые' : 'Чёрные'}`], ['opponent', `Соперник · ${other === 'w' ? 'Белые' : 'Чёрные'}`]]) {
      const label = $(`${id}-clock-label`), value = snapshot ? text : '';
      if (label.hidden !== !snapshot) label.hidden = !snapshot;
      if (label.textContent !== value) label.textContent = value;
    }
  }
  function resultText() {
    if (!snapshot || snapshot.status !== 'finished') return snapshot?.turn === currentColor() ? (chess.isCheck() ? 'Шах! Защитите короля — ваш ход.' : 'Ваш ход.') : (chess.isCheck() ? 'Шах сопернику. Ожидаем ход.' : 'Ход соперника. Можно подготовить свой ход.');
    if (snapshot.result === 'draw') return snapshot.reason === 'stalemate' ? 'Пат. Ничья.' : snapshot.reason === 'opponent_offline' ? 'Ничья: игрок отключился.' : 'Ничья.';
    const won = snapshot.result === (currentColor() === 'w' ? 'white_win' : 'black_win');
    return `${won ? 'Вы победили' : 'Вы проиграли'}${snapshot.reason === 'timeout' ? ' по времени' : snapshot.reason === 'checkmate' ? ': мат' : snapshot.reason === 'resignation' ? (won ? ': соперник сдался' : ': вы сдались') : snapshot.reason === 'opponent_offline' ? (won ? ': соперник не в сети' : ': соединение прервалось') : ''}.`;
  }
  function statusGame() { setStatus(resultText(), chess.isCheck() || snapshot?.status === 'finished'); }
  function displayChess() {
    if (historyIndex === null) return chess;
    const position = new Chess(); chess.history().slice(0, historyIndex).forEach(move => position.move(move)); return position;
  }
  const renderMoves = createMoveHistory({document,list:$('move-list'),count:$('move-count'),onSelect:showHistory});
  function renderHistory() {
    const count=chess.history().length, index=historyIndex??count;
    renderMoves(chess,historyIndex);
    $('history-first').disabled=$('history-prev').disabled=index===0;
    $('history-next').disabled=$('history-last').disabled=index===count;
  }
  function showHistory(index) {
    const count=chess.history().length, old=historyIndex??count;
    historyIndex=index>=count?null:Math.max(0,index);
    const target=historyIndex??count, transitions=historyTransition(chess,old,target);
    annotations.clear(); selected=null; renderBoard(null,transitions); renderHistory();
    const move=historySoundMove(chess,old,target); if(move) sound.play(move);
    if(historyIndex!==null)setStatus(`Просмотр позиции: ход ${historyIndex} из ${count}.`);else statusGame();
  }
  function projected() { return premove.length ? projectPremoves(chess,premove,currentColor()) : chess; }
  function legalFor(square) {
    if (chess.turn() === currentColor() && !premove.length) return chess.moves({ square, verbose:true });
    return premoveTargets(projected(), square, currentColor());
  }
  function renderBoard(animatedMove = null, transitions = []) {
    const color = currentColor(), shown = historyIndex === null ? projected() : displayChess();
    const legal = selected && historyIndex === null ? legalFor(selected).map(move => move.to) : [];
    const last = historyIndex === null ? latestMove : shown.history({ verbose:true }).at(-1);
    boardView.render({ shown, selected, legal, last, premoves: historyIndex === null ? premove : [], actual: historyIndex === null && premove.length ? chess : null, premoveMode: (chess.turn() !== color || premove.length > 0) && historyIndex === null, transitions, animatedMove: historyIndex === null ? animatedMove : null });
    const actualShown=historyIndex===null?chess:shown;
    renderThreats(actualShown,color,boardView,threatKeys);renderCaptures(actualShown,color,$('player-captured'),$('opponent-captured'));
    // Establish initial rotation before the board changes sides.
    if (board.classList.contains('waiting') && snapshot) void board.offsetWidth;
    board.classList.toggle('waiting', !snapshot); board.classList.toggle('black', !!snapshot && color === 'b');
  }
  function revealName(text) {
    clearInterval(nameTimer); const el = $('opponent-name'); el.setAttribute('aria-label', text);
    if (reducedMotion()) { el.textContent = text; return; }
    let step = 0; const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    nameTimer = setInterval(() => { step++; el.textContent = [...text].map((c, i) => c === ' ' || step > 5 + i ? c : letters[Math.floor(Math.random() * letters.length)]).join(''); if (step > text.length + 5) { clearInterval(nameTimer); el.textContent = text; } }, 24);
  }
  const profileTrigger = $('opponent-profile-trigger'), profileCard = $('opponent-profile-card');
  let profilePinned = false, opponentProfileName = null, profileLoading = false;
  const profileLoader=createSearchLoader($('opponent-profile-loading').querySelector('.particle-loading'),win);
  function syncProfileLoader() { $('opponent-profile-loading').hidden=!profileLoading;profileLoader.setVisible(profileLoading && !profileCard.hidden); }
  function openOpponent(){if(!opponentProfileName)return;if(win.parent!==win)win.parent.postMessage({type:'shahmat-open-profile',username:opponentProfileName},win.location.origin);else win.location.href=`/profile?player=${encodeURIComponent(opponentProfileName)}`;}
  function showProfile(show) { profileCard.hidden = !show; profileTrigger.setAttribute('aria-expanded', String(show)); syncProfileLoader(); }
  profileTrigger.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch' && !profileTrigger.disabled) showProfile(true); });
  $('opponent-profile-trigger').parentElement.addEventListener('pointerleave', () => { if (!profilePinned && document.activeElement !== profileTrigger && !profileCard.contains(document.activeElement)) showProfile(false); });
  profileTrigger.addEventListener('focus', () => { if (!profileTrigger.disabled) showProfile(true); });
  profileTrigger.addEventListener('blur', event => { if (!profilePinned && !profileCard.contains(event.relatedTarget)) showProfile(false); });
  profileCard.addEventListener('focusout', event => { if(!profilePinned && !profileCard.contains(event.relatedTarget) && event.relatedTarget!==profileTrigger) showProfile(false); });
  profileTrigger.addEventListener('click', openOpponent);
  profileCard.setAttribute('role','button'); profileCard.tabIndex=0; profileCard.setAttribute('aria-label','Открыть профиль соперника');
  profileCard.addEventListener('click', openOpponent);
  profileCard.addEventListener('keydown', event => { if(event.key==='Enter'||event.key===' ') { event.preventDefault(); openOpponent(); } });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { profilePinned = false; showProfile(false); } });
  document.addEventListener('pointerdown', event => { if (!profileTrigger.parentElement.contains(event.target)) { profilePinned = false; showProfile(false); } });
  function loadName(game) {
    if (nameForGame === game.id) return;
    nameForGame = game.id; opponentProfileName=null; profilePinned = false; profileLoading=true; showProfile(false); profileTrigger.disabled = false;
    $('opponent-profile-name').textContent = 'Соперник'; $('opponent-profile-bio').textContent = ''; $('opponent-profile-bio').hidden=true; if($('opponent-profile-bio-label')) $('opponent-profile-bio-label').hidden=true; applyProfileTheme(profileCard,'monochrome','light'); if($('opponent-profile-banner')) $('opponent-profile-banner').hidden=true; if($('opponent-profile-avatar')) { $('opponent-profile-avatar').src='/pieces/cburnett/bN.svg'; $('opponent-profile-avatar').classList.remove('custom'); }
    Promise.resolve(opponentName(game.id)).then(profile => {
      if (nameForGame !== game.id || !profile) return;
      const name = typeof profile === 'string' ? profile : profile.username;
      if (typeof name === 'string' && name) { opponentProfileName=name; revealName(name); $('opponent-profile-name').textContent = name; }
      if (typeof profile === 'object' && 'bio' in profile) { const bio=profile.bio?.trim()||''; $('opponent-profile-bio').textContent=bio; $('opponent-profile-bio').hidden=!bio; if($('opponent-profile-bio-label')) $('opponent-profile-bio-label').hidden=!bio; }
      if(typeof profile === 'object') { applyProfileTheme(profileCard,profile.palette,profile.theme); const avatar=$('opponent-profile-avatar'),banner=$('opponent-profile-banner'); if(avatar){if(isProfileImage(profile.avatar))avatar.src=profile.avatar;else setPublicPiece(avatar,profile.piece_set,'b');avatar.classList.toggle('custom',isProfileImage(profile.avatar));} if(banner){banner.hidden=!isProfileImage(profile.banner);if(!banner.hidden)banner.src=profile.banner;} }

    }).catch(() => {}).finally(() => {if(nameForGame===game.id && !destroyed){profileLoading=false;syncProfileLoader();}});
  }
  function playQueuedPremove() {
    if (!premove.length || phase !== 'active' || moving || reconciling || chess.turn() !== currentColor()) return false;
    const move = premove.shift();
    const valid = validPremove(chess, move, currentColor());
    if (valid) { const actual=normalizePremove(chess,move); void submitMove(actual.from, actual.to, actual.promotion); return true; }
    premove = []; renderBoard(); setStatus('Очередь предварительных ходов отменена: ход больше невозможен.'); return false;
  }
  function applyGame(game) {
    if (!game || !Array.isArray(game.moves) || (snapshot && snapshot.id === game.id && game.version < snapshot.version)) return;
    onGameChanged(game.status==='active'&&isVisible()?game.id:null);
    if (snapshot && snapshot.id === game.id && game.version === snapshot.version && game.status === snapshot.status && !moving) {
      snapshot = game; receivedAt = now(); clockSync.update(game, receivedAt); loadRatings(game); modeControls(); drawClocks(); playQueuedPremove(); return;
    }
    const previous = snapshot, localMoves = chess.history(), selectedPiece = selected ? chess.get(selected) : null;
    const sameGame = previous?.id === game.id;
    if (!sameGame) { historyIndex = null; premove = []; annotations.clear(); setAvatar('opponent',null); ratingsKey = null; ratingsRetryAt = 0; ratingsRequest++; scores = null; renderRatings(); }
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
    snapshot = game; receivedAt = now(); clockSync.update(game, receivedAt); chess = next; latestMove = nextLast;
    if (historyIndex !== null && historyIndex >= game.moves.length) historyIndex = game.moves.length ? null : 0;
    if (!alreadyDisplayed) { cancelDrag(); const piece = selected && next.get(selected); if (!sameGame || !selectedPiece || !piece || piece.color !== currentColor() || piece.type !== selectedPiece.type || piece.color !== selectedPiece.color) selected = null; pending = null; promotion.hidden = true; }
    phase = game.status === 'active' ? 'active' : 'finished'; mode = game.mode;
    const clearedPremove = phase === 'finished' && premove.length > 0;
    if (phase === 'finished') premove = [];
    const input = $('mode-list').querySelector(`input[value="${mode}"]`); if (input) input.checked = true;
    loadName(game); loadRatings(game); modeControls();
    // Confirming our optimistic move must not restart its animation or replace pieces.
    if (!alreadyDisplayed || clearedPremove) renderBoard(newMove);
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
      if (searching ? !response?.game && response?.state !== 'searching' : !response?.game) throw Error('missing game state');
      if (response.game && (!Array.isArray(response.game.moves) || (!searching && (response.game.id !== snapshot.id || response.game.version < snapshot.version)))) throw Error('invalid game state');
      const recovering = pollFailures > 0 || reconciling;
      pollFailures = 0;
      if (response.game && !moving) {
        reconciling = false; applyGame(response.game);
        if (recovering && historyIndex === null && !premove.length && !moving) statusGame();
      }
      else if (phase === 'searching' && response.state === 'searching') setStatus('Ищем соперника с таким же режимом…');
    } catch (error) { if (expected === generation) { pollFailures = Math.min(pollFailures + 1, 5); setStatus(retryMessage(error, 'Не удалось связаться с игровым сервисом. Повторяем попытку…'), true); } }
    // Faster updates while waiting for the opponent, but back off on outages.
    const delay = pollFailures ? Math.min(10000, 800 * 2 ** (pollFailures - 1)) : phase === 'active' && snapshot?.turn !== currentColor() ? 450 : 900;
    if (expected === generation && isVisible() && ['searching','active'].includes(phase)) polling = setTimeout(() => poll(expected), delay);
  }
  async function search() {
    if (!userId || !mode || phase !== 'idle') return;
    phase = 'searching'; modeControls(); setStatus('Подключаемся к поиску…');
    cancelTimer(); const expected = ++generation; await poll(expected);
  }
  async function cancelSearch() {
    if (destroyed || !['searching', 'cancelling'].includes(phase) || cancelPending) return;
    if (phase === 'searching') {
      phase = 'cancelling'; ++generation; cancelTimer(); modeControls();
      setStatus('Отменяем поиск…');
    }
    cancelPending = true; cancelTimer();
    try {
      // Do not send a fresh search after the user has asked to cancel, even
      // if the preceding request failed or its response was lost.
      if (pendingSearch) await pendingSearch.catch(() => {});
      if (destroyed) return;
      const response = await api({ action:'cancel' });
      if (destroyed) return;
      if (!response || !Object.hasOwn(response, 'game') || (response.game && !Array.isArray(response.game.moves))) throw Error('invalid cancellation state');
      pollFailures = 0;
      if (response.game) { applyGame(response.game); if (phase === 'active' && isVisible()) void poll(generation); }
      else { phase = 'idle'; modeControls(); setStatus('Поиск отменён.'); }
    } catch (error) {
      if (destroyed || phase !== 'cancelling') return;
      pollFailures = Math.min(pollFailures + 1, 5);
      setStatus(retryMessage(error, 'Не удалось подтвердить отмену. Повторяем попытку…'), true);
      // Cancellation must keep retrying even while the game view is hidden.
      polling = setTimeout(() => { polling = null; void cancelSearch(); }, Math.min(10000, 800 * 2 ** (pollFailures - 1)));
    } finally { cancelPending = false; }
  }
  async function submitMove(from, to, piece = null, animate = true) {
    if (moving || reconciling || phase !== 'active' || !snapshot || chess.turn() !== currentColor()) return;
    const saved = snapshot, priorMoves = chess.history(), savedLast = latestMove; let move;
    try { move = chess.move({ from, to, ...(piece ? { promotion:piece } : {}) }); } catch { return; }
    // Invalidate any old snapshot request before it can overwrite the optimistic move.
    cancelTimer(); const moveGeneration = ++generation;
    moving = true; modeControls(); selected = null; pending = null; promotion.hidden = true; latestMove = move;
    renderBoard(animate ? move : null); renderHistory(); playSound(move); setStatus('Отправляем ход…');
    try {
      const result = await api({ action:'move', gameId:saved.id, version:saved.version, from, to, ...(piece ? { promotion:piece } : {}) });
      if (!result.game) throw Error('missing snapshot');
      if (moveGeneration !== generation) return;
      applyGame(result.game);
      if (result.game.moves?.[priorMoves.length] !== move.san) { premove=[]; renderBoard(); setStatus('Ход не принят сервером. Позиция обновлена.', true); }
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
        reconciling = true; chess = new Chess(); priorMoves.forEach(m => chess.move(m)); latestMove = savedLast;
        premove = []; selected = null; renderBoard(); renderHistory();
        setStatus('Позиция не подтверждена. Проверяем игровой сервис…', true);
      }
    } finally {
      moving = false; modeControls();
      if (isVisible() && phase === 'active' && (moveGeneration === generation || reconciling)) {
        if (!playQueuedPremove()) { cancelTimer(); void poll(++generation); }
      }
    }
  }
  function attempt(from, to, animate = true) {
    if (historyIndex !== null || phase !== 'active' || reconciling || (moving && chess.turn() === currentColor()) || pending || !from || !to) return false;
    const choices = legalFor(from).filter(move => move.to === to);
    if (!choices.length) return false;
    if (chess.turn() !== currentColor() && premove.length >= 20) { setStatus('Можно добавить не более 20 предварительных ходов.'); return true; }
    if (choices.some(move => move.promotion)) {
      pending = { from, to, premove: chess.turn() !== currentColor() }; promotion.hidden = false; options.replaceChildren(); setStatus('Пешка дошла до края. Выберите фигуру.', true);
      for (const type of ['q','r','b','n']) {
        const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', names[type]);
        const img = document.createElement('img'); img.src = pieceSrc(currentColor(), type); img.alt = ''; button.append(img);
        button.addEventListener('click', () => {
          if (!pending) return;
          const choice = pending; pending = null; promotion.hidden = true;
          if (choice.premove && chess.turn() !== currentColor()) {
            if(premove.length>=20) return; premove.push({from:choice.from,to:choice.to,promotion:type}); selected=null; renderBoard(); setStatus('Предварительный ход готов. До 20 ходов; пустая клетка отменяет очередь.');
          } else void submitMove(choice.from, choice.to, type);
        }); options.append(button);
      }
      options.firstChild.focus(); return true;
    }
    if (chess.turn() !== currentColor()) {
      if(premove.length>=20) { setStatus('Можно добавить не более 20 предварительных ходов.'); return true; } premove.push({ from, to }); selected = null; renderBoard(); setStatus('Предварительный ход готов. До 20 ходов; пустая клетка отменяет очередь.'); return true;
    }
    void submitMove(from, to, null, animate); return true;
  }
  function choose(square) {
    if (!square || phase !== 'active' || reconciling || (moving && chess.turn() === currentColor()) || pending || historyIndex !== null) return;
    if (selected && attempt(selected, square)) return;
    const piece = projected().get(square);
    if (premove.length && !piece) { premove=[]; selected=null; renderBoard(); statusGame(); return; } selected = piece?.color === currentColor() && selected !== square ? square : null; renderBoard();
    board.querySelector(`[data-square="${square}"]`)?.focus();
  }
  board.addEventListener('click', event => { sound.prime(); if (suppressClick) { suppressClick = false; return; } choose(event.target.closest('[data-square]')?.dataset.square); });
  board.addEventListener('keydown', () => sound.prime());
  board.addEventListener('pointerdown', event => { if(event.button === 2 && premove.length) { premove=[]; selected=null; renderBoard(); statusGame(); } });
  const onPremoveKey = event => { if(event.key === 'Escape' && premove.length) { premove=[]; selected=null; renderBoard(); statusGame(); } };
  document.addEventListener('keydown', onPremoveKey);
  function navigateHistory(key, code = '') {
    if (!isVisible() || !snapshot || !['active','finished'].includes(phase) || pending || document.querySelector('dialog[open]')) return false;
    const length = chess.history().length, target = historyKeyTarget(key, code, historyIndex ?? length, length);
    if (target === null) return false; showHistory(target); return true;
  }
  function setThreat(code,down) { if(!['KeyQ','KeyE'].includes(code))return; if(down && (!isVisible()||!snapshot||!['active','finished'].includes(phase)))return; if(down)threatKeys.add(code);else threatKeys.delete(code);renderBoard(); }

  const onThreatDown = event => { if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')||document.querySelector('dialog[open]'))return;setThreat(event.code,true); };
  const onThreatUp = event => setThreat(event.code,false);
  const clearThreats = () => { if(threatKeys.size){threatKeys.clear();renderBoard();} };
  document.addEventListener('keydown',onThreatDown); document.addEventListener('keyup',onThreatUp); win.addEventListener('blur',clearThreats);
  const onHistoryKey = event => {
    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=textbox]') || document.querySelector('dialog[open]') || pending) return;
    if (navigateHistory(event.key, event.code)) event.preventDefault();
  };
  document.addEventListener('keydown', onHistoryKey);
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
    if (event.button !== 0 || phase !== 'active' || reconciling || (moving && chess.turn() === currentColor()) || pending || historyIndex !== null) return;
    const cell = event.target.closest('[data-square]'), square = cell?.dataset.square, piece = square && projected().get(square);
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
      drag.ghost.src = pieceSrc(currentColor(), projected().get(drag.from).type); drag.ghost.style.setProperty('--drag-size', `${size}px`);
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
  $('toggle-moves').addEventListener('click', () => {
    const toggle = $('toggle-moves'), content = $('history-content');
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    if (!expanded && content.contains(document.activeElement)) toggle.focus();
    toggle.setAttribute('aria-expanded', String(expanded));
    content.classList.toggle('is-collapsed', !expanded);
    content.inert = !expanded; content.setAttribute('aria-hidden', String(!expanded));
  });
  $('history-first').addEventListener('click', () => showHistory(0)); $('history-prev').addEventListener('click', () => showHistory((historyIndex ?? chess.history().length) - 1));
  $('history-next').addEventListener('click', () => showHistory((historyIndex ?? chess.history().length) + 1)); $('history-last').addEventListener('click', () => showHistory(chess.history().length));
  const resignDialog = $('resign-dialog');
  function closeResign() {
    if (!resignDialog?.open) return;
    if (typeof resignDialog.close === 'function') resignDialog.close(); else resignDialog.removeAttribute('open');
  }
  $('resign-button').addEventListener('click', () => {
    if (!canResign() || actionPending || moving) return;
    if (typeof resignDialog.showModal === 'function') resignDialog.showModal(); else resignDialog.setAttribute('open','');
    $('resign-cancel').focus();
  });
  $('resign-cancel').addEventListener('click', closeResign);
  async function finishAction(action) {
    if (phase !== 'active' || !snapshot || actionPending || moving || (action === 'resign' ? !canResign() : !snapshot.opponent_offline)) return;
    const gameId = snapshot.id;
    actionPending = true; closeResign(); modeControls(); cancelTimer(); ++generation;
    setStatus('Подтверждаем результат…');
    try {
      const response = await api({ action, gameId });
      if (!response.game) throw new Error('missing snapshot');
      if (snapshot?.id !== gameId) return;
      applyGame(response.game);
      if (response.game.status === 'active') setStatus(action === 'resign' ? 'Не удалось подтвердить сдачу.' : 'Соперник вернулся или отключение ещё не подтверждено.', true);
    } catch {
      if (snapshot?.id === gameId) setStatus('Результат не подтверждён. Проверяем соединение…', true);
    } finally {
      actionPending = false; modeControls();
      if (isVisible() && phase === 'active' && snapshot?.id === gameId) void poll(++generation);
    }
  }
  $('resign-confirm').addEventListener('click', () => void finishAction('resign'));
  $('offline-win').addEventListener('click', () => void finishAction('offline_win'));
  $('offline-draw').addEventListener('click', () => void finishAction('offline_draw'));
  $('mode-list').addEventListener('change', event => { if (phase === 'idle' && times[event.target.value]) { mode = event.target.value; void refreshOwnRating(); modeControls(); drawClocks(); if (ready) setStatus('Всё готово к поиску.'); } });
  start.addEventListener('click', () => void search()); cancel.addEventListener('click', () => void cancelSearch());
  reset.addEventListener('click', () => { annotations.clear(); onGameChanged(null); cancelTimer(); generation++; snapshot = null; scores = null; ratingsKey = null; ratingsRetryAt = 0; ratingsRequest++; renderRatings(); clockSync.clear(); chess = new Chess(); latestMove = null; phase = 'idle'; mode = null; void refreshOwnRating(); $('mode-list').querySelectorAll('input').forEach(input => { input.checked = false; }); premove = []; historyIndex = null; nameForGame = null; profileTrigger.disabled = true; profilePinned = false; showProfile(false); clearInterval(nameTimer); $('opponent-name').textContent = 'Соперник'; setAvatar('opponent',null); modeControls(); renderBoard(); renderHistory(); drawClocks(); setStatus(''); });
  function pause() { cancelDrag(); if (moving) reconciling = true; if (phase === 'searching') void cancelSearch(); else if (phase !== 'cancelling') { generation++; cancelTimer(); } }
  function resume() {
    if (!userId || destroyed) return;
    if (!ready) { cancelTimer(); void checkCurrent(); return; }
    if (phase === 'cancelling') { if (!cancelPending) void cancelSearch(); return; }
    if ((phase === 'active' && !moving && !actionPending) || (phase === 'searching' && !pendingSearch && !cancel.disabled)) {
      cancelTimer(); void poll(++generation);
    }
  }
  async function checkCurrent() {
    if (currentRequest || ready || destroyed || !userId) return currentRequest;
    const id = userId;
    currentRequest = (async () => {
      try {
        const result = await api({ action:'current' });
        if (destroyed || userId !== id) return;
        if (!result || !Object.hasOwn(result, 'game') || (result.game && !Array.isArray(result.game.moves))) throw Error('invalid current state');
        ready = true; pollFailures = 0;
        if (result.game && phase === 'idle') applyGame(result.game);
        else if (phase === 'idle') setStatus(mode ? 'Всё готово к поиску.' : '');
        modeControls();
        if (isVisible() && phase === 'active') void poll(++generation);
      } catch (error) {
        if (destroyed || userId !== id) return;
        pollFailures = Math.min(pollFailures + 1, 5);
        setStatus(retryMessage(error, 'Не удалось проверить партию. Повторяем попытку…'), true);
        if (isVisible()) polling = setTimeout(() => { polling = null; void checkCurrent(); }, Math.min(10000, 800 * 2 ** (pollFailures - 1)));
      } finally { currentRequest = null; }
    })();
    return currentRequest;
  }
  const clockInterval = setInterval(() => { if (isVisible()) { drawClocks(); if (phase === 'active' && $('resign-control').hidden && canResign()) modeControls(); } }, 250);
  let revealAnimations = [];
  function revealPieces() {
    revealAnimations.forEach(animation => animation.cancel()); revealAnimations = [];
    if (reducedMotion()) return;
    board.querySelectorAll('.piece').forEach(piece => {
      if (piece.animate) revealAnimations.push(piece.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000, easing: 'ease-out' }));
    });
  }
  modeControls(); renderBoard(); drawClocks(); board.classList.add('ready');
  if (win.parent === win) revealPieces();
  return {
    navigateHistory, setThreat, clearThreats,
    setOwnRating(value) { ownScore = value; renderRatings(); },
    setRatingUnit(value) { rankUnit = value === 'elo' ? 'elo' : 'yar'; renderRatings(); },
    setPlayerAvatar(value) { setAvatar('player',value); },
    setPlayerName(value) { if (typeof value === 'string' && value && $('player-name')) $('player-name').textContent = value; },
    async open(id) {
      if (userId === id || destroyed) return;
      userId = id; modeControls();
      void refreshOwnRating();
      await checkCurrent();
    },
    online() { if (isVisible()) resume(); },
    hide() { clearThreats(); onGameChanged(null); const wasVisible = isVisible(); viewVisible = false; if (wasVisible) pause(); },
    show() { if(snapshot?.status==='active'&&browserVisible)onGameChanged(snapshot.id); const wasVisible = isVisible(); const wasShown = viewVisible; viewVisible = true; if (!wasShown) revealPieces(); if (!wasVisible && isVisible()) resume(); },
    browserVisibility(value) { if(!value)onGameChanged(null);else if(viewVisible&&snapshot?.status==='active')onGameChanged(snapshot.id); const wasVisible = isVisible(); browserVisible = value; if (wasVisible && !isVisible()) pause(); else if (!wasVisible && isVisible()) resume(); },
    destroy() { destroyed = true; ownRatingRequest++; Object.values(ratingCounts).forEach(count => count.destroy()); onGameChanged(null); document.removeEventListener('keydown',onThreatDown); document.removeEventListener('keyup',onThreatUp); win.removeEventListener('blur',clearThreats); document.removeEventListener('keydown', onPremoveKey); document.removeEventListener('keydown', onHistoryKey); annotations.destroy(); generation++; cancelDrag(); cancelTimer(); clearInterval(clockInterval); clearInterval(nameTimer); revealAnimations.forEach(animation => animation.cancel()); Object.values(clocks).forEach(clock => clock.destroy()); searchLoader.destroy(); profileLoader.destroy(); sound.destroy(); },
  };
}
