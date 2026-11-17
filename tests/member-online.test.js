import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { Chess } from 'chess.js';
import { createMemberGame, formatClock } from '../pages/member-game.js';

const html = await readFile('pages/game.html', 'utf8');
const A = 'a', B = 'b';
const flush = () => new Promise(resolve => setTimeout(resolve, 10));
function setup(api, now = () => 0) {
  const dom = new JSDOM(html, { url: 'https://example.com/pages/game.html' });
  const ui = createMemberGame({ document: dom.window.document, api, now });
  return { dom, ui, $: id => dom.window.document.getElementById(id), close() { ui.destroy(); dom.window.close(); } };
}
function game({ moves = [], turn = 'w', version = moves.length, status = 'active', result = null, reason = null } = {}) {
  return { id:'game', white_id:A, black_id:B, mode:'blitz', moves, turn, version, status, result, reason, white_ms:180000, black_ms:180000, game_age_ms:60000 };
}

test('clock formatting covers all requested controls', () => {
  assert.equal(formatClock(180000), '03:00'); assert.equal(formatClock(600000), '10:00');
  assert.equal(formatClock(3600000), '1:00:00'); assert.equal(formatClock(86400000), '24:00:00');
  assert.equal(formatClock(0), '00:00'); assert.equal(formatClock(null), '00:00');
});

test('board opens at starting position, modes are explicit and a real request starts search', async () => {
  const calls = [];
  const app = setup(async body => { calls.push(body); return body.action === 'search' ? { state:'searching' } : { game:null }; });
  assert.equal(app.$('board').querySelectorAll('[data-square]').length, 64);
  assert.equal(app.$('player-clock-card').dataset.color, 'neutral');
  assert.equal(app.$('opponent-clock-card').dataset.color, 'neutral');
  assert.equal(app.$('opponent-clock-card').nextElementSibling, app.$('player-clock-card'));
  assert.equal(app.$('player-clock-label').hidden, true);
  assert.equal(app.$('opponent-clock-label').hidden, true);
  assert.equal(app.$('player-clock').getAttribute('aria-label'), '00:00');
  assert.equal(app.$('opponent-clock').getAttribute('aria-label'), '00:00');
  assert.equal(app.$('board').querySelector('[data-square=e2] img').getAttribute('src'), '/pieces/cburnett/wP.svg');
  assert.deepEqual([...app.$('mode-list').querySelectorAll('input')].map(input => input.value), ['blitz','rapid','classical','daily']);
  assert.equal(app.$('start-search').disabled, true); assert.equal(app.$('start-search').hidden, true);
  await app.ui.open(A);
  assert.equal(app.$('player-color').textContent, '');
  const rapid = app.$('mode-list').querySelector('[value=rapid]'); rapid.checked = true; rapid.dispatchEvent(new app.dom.window.Event('change', { bubbles:true }));
  assert.equal(app.$('player-clock').getAttribute('aria-label'), '10:00'); assert.equal(app.$('start-search').disabled, false); assert.equal(app.$('start-search').hidden, false);
  app.$('start-search').click(); await flush();
  assert.deepEqual(calls.at(-1), { action:'search', mode:'rapid' });
  assert.match(app.$('status').textContent, /Ищем/);
  app.$('cancel-search').click(); await flush();
  assert.equal(calls.at(-1).action, 'cancel'); assert.match(app.$('status').textContent, /отменён/);
  app.close();
});

test('matched players can only submit legal moves on their turn; black sees flipped board', async t => {
  const calls = [], chess = new Chess();
  const app = setup(async body => {
    calls.push(body);
    if (body.action === 'current') return { game: game({ moves:['e4'], turn:'b' }) };
    if (body.action === 'move') { chess.move('e4'); chess.move({ from:body.from,to:body.to }); return { game: game({ moves:chess.history(), turn:'w' }) }; }
    return { game: chess.history().length ? game({ moves:chess.history(), turn:chess.turn() }) : game({ moves:['e4'], turn:'b' }) };
  }); t.after(() => app.close());
  await app.ui.open(B); await flush();
  assert.equal(app.$('board').firstElementChild.dataset.square, 'a8');
  assert.equal(app.$('board').classList.contains('black'), true);
  assert.equal(app.$('player-color').textContent, 'Чёрные');
  assert.equal(app.$('player-clock-card').dataset.color, 'b');
  assert.equal(app.$('opponent-clock-card').dataset.color, 'w');
  assert.equal(app.$('player-clock-label').textContent, 'Вы · Чёрные');
  assert.equal(app.$('opponent-clock-label').textContent, 'Соперник · Белые');
  const click = square => app.$('board').querySelector(`[data-square="${square}"]`).click();
  click('e7'); click('e5'); await flush();
  assert.equal(calls.find(call => call.action === 'move').from, 'e7');
  assert.equal(calls.find(call => call.action === 'move').to, 'e5');
  assert.equal(app.$('move-count').textContent, '01');
  assert.match(app.$('status').textContent, /Ход соперника/);
});

test('a failed cancel stays pending instead of restarting search or pretending to cancel', async () => {
  const app = setup(async body => { if (body.action === 'cancel') throw Error('offline'); return body.action === 'search' ? { state:'searching' } : { game:null }; });
  await app.ui.open(A);
  const blitz = app.$('mode-list').querySelector('[value=blitz]'); blitz.checked = true; blitz.dispatchEvent(new app.dom.window.Event('change', { bubbles:true }));
  app.$('start-search').click(); await flush(); app.$('cancel-search').click(); await flush();
  assert.match(app.$('status').textContent, /Не удалось подтвердить отмену/); assert.equal(app.$('cancel-search').hidden, false); assert.equal(app.$('cancel-search').disabled, true);
  app.close();
});

test('leaving waits for an in-flight search before cancelling the server queue', async () => {
  let release;
  const search = new Promise(resolve => { release = resolve; });
  const calls = [];
  const app = setup(async body => { calls.push(body.action); if (body.action === 'search') return search; return { game:null }; });
  await app.ui.open(A);
  const blitz = app.$('mode-list').querySelector('[value=blitz]'); blitz.checked = true; blitz.dispatchEvent(new app.dom.window.Event('change', { bubbles:true }));
  app.$('start-search').click(); await flush(); app.ui.hide(); await flush();
  assert.deepEqual(calls, ['current','search']);
  release({ state:'searching' }); await flush();
  assert.deepEqual(calls, ['current','search','cancel']); assert.match(app.$('status').textContent, /отменён/);
  app.close();
});


test('clock times remain assigned to the player and opponent when playing black', async () => {
  const clock = { ...game({ moves:['e4'], turn:'b' }), white_ms:170000, black_ms:155000 };
  const app = setup(async body => body.action === 'current' ? { game:clock } : { game:clock });
  await app.ui.open(B);
  assert.equal(app.$('player-clock').getAttribute('aria-label'), '02:35');
  assert.equal(app.$('opponent-clock').getAttribute('aria-label'), '02:50');
  assert.equal(app.$('player-clock-card').dataset.color, 'b');
  assert.equal(app.$('opponent-clock-card').dataset.color, 'w');
  app.close();
});

test('optimistic move appears immediately and rolls back when rejected', async t => {
  let rejectMove;
  const app = setup(async body => {
    if (body.action === 'move') return new Promise((resolve, reject) => { rejectMove = reject; });
    return { game:game() };
  }); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const click = square => app.$('board').querySelector(`[data-square="${square}"]`).click();
  click('e2'); assert.equal(app.$('board').querySelector('[data-square=e4]').classList.contains('possible'), true);
  click('e4');
  assert.ok(app.$('board').querySelector('[data-square=e4] img'), 'piece moves without waiting for network');
  rejectMove(Error('offline')); await flush();
  assert.ok(app.$('board').querySelector('[data-square=e2] img'), 'failed move rolls back');
});

test('premove is sent only after the other move and can be cancelled', async t => {
  let current = game({ moves:['e4'], turn:'b' }); const moves = [];
  const app = setup(async body => {
    if (body.action === 'move') { moves.push(body); current = game({ moves:['e4','e5','Nf3'], turn:'b' }); }
    return { game:current };
  }); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const click = square => app.$('board').querySelector(`[data-square="${square}"]`).click();
  click('g1'); click('f3'); assert.equal(app.$('board').querySelector('[data-square=f3]').classList.contains('premove'), true);
  click('f3'); assert.equal(app.$('board').querySelector('[data-square=f3]').classList.contains('premove'), false);
  click('g1'); click('f3'); assert.equal(moves.length, 0);
  current = game({ moves:['e4','e5'], turn:'w' }); app.ui.hide(); app.ui.show(); await flush();
  assert.equal(moves.length, 1); assert.equal(moves[0].from, 'g1'); assert.equal(moves[0].to, 'f3');
});

test('history can be inspected without submitting moves and checkmate highlights the king', async t => {
  const finished = game({ moves:['f3','e5','g4','Qh4#'], turn:'w', status:'finished', result:'black_win', reason:'checkmate' });
  const app = setup(async () => ({ game:finished })); t.after(() => app.close());
  await app.ui.open(A); await flush();
  assert.ok(app.$('board').querySelector('[data-square=e1]').classList.contains('check'));
  assert.match(app.$('status').textContent, /мат/);
  app.$('history-first').click(); assert.ok(app.$('board').querySelector('[data-square=e2] img'));
  assert.match(app.$('status').textContent, /Просмотр/);
  app.$('history-last').click(); assert.ok(app.$('board').querySelector('[data-square=e1]').classList.contains('check'));
  app.$('toggle-moves').click(); assert.equal(app.$('history-content').getAttribute('aria-hidden'), 'true'); assert.equal(app.$('history-content').inert, true);
});

test('drag submits a legal move and illegal premove is cancelled on the next position', async t => {
  let current = game(), calls = [];
  const app = setup(async body => {
    if (body.action === 'move') { calls.push(body); current = game({ moves:['e4'], turn:'b' }); }
    return { game:current };
  }); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const board = app.$('board'), win = app.dom.window;
  const pointer = (node, type, x, y) => { const ev = new win.MouseEvent(type, { bubbles:true, button:0, clientX:x, clientY:y }); Object.defineProperty(ev, 'pointerId', {value:1}); node.dispatchEvent(ev); };
  app.dom.window.document.elementFromPoint = () => board.querySelector('[data-square=e4]');
  pointer(board.querySelector('[data-square=e2]'), 'pointerdown', 10, 10); pointer(board, 'pointermove', 30, 30); pointer(board, 'pointerup', 30, 30); await flush();
  assert.equal(calls.length, 1); assert.equal(calls[0].to, 'e4');
  const click = square => board.querySelector(`[data-square="${square}"]`).click();
  click('e4'); click('e5'); // The opponent may occupy the target square.
  assert.ok(board.querySelector('[data-square=e5]').classList.contains('premove'));
  current = game({ moves:['e4','e5'], turn:'w' });
  app.ui.hide(); app.ui.show(); await flush();
  assert.equal(calls.length, 1); assert.match(app.$('status').textContent, /отменён/);
});

test('optimistic move and its confirmation keep squares and pieces stable', async t => {
  let finishMove;
  const app = setup(async body => {
    if (body.action === 'move') return new Promise(resolve => { finishMove = resolve; });
    return { game:game() };
  }); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const board = app.$('board'), from = board.querySelector('[data-square=e2]'), to = board.querySelector('[data-square=e4]');
  const pawn = from.querySelector('img'), neighbor = board.querySelector('[data-square=d2] img');
  from.click(); to.click();
  assert.equal(to.querySelector('img'), pawn);
  finishMove({ game:game({ moves:['e4'], turn:'b' }) }); await flush();
  assert.equal(board.querySelector('[data-square=e2]'), from);
  assert.equal(board.querySelector('[data-square=e4]'), to);
  assert.equal(to.querySelector('img'), pawn);
  assert.equal(board.querySelector('[data-square=d2] img'), neighbor);
});

test('premove may be entered during a slow move acknowledgement and executes on reply', async t => {
  let finishFirst, position = game(), sent = [];
  const app = setup(async body => {
    if (body.action === 'move') {
      sent.push(body);
      if (sent.length === 1) return new Promise(resolve => { finishFirst = resolve; });
      position = game({ moves:['e4','e5','Nf3'], turn:'b' }); return { game:position };
    }
    return { game:position };
  }); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const click = square => app.$('board').querySelector(`[data-square="${square}"]`).click();
  click('e2'); click('e4'); click('g1'); click('f3');
  assert.equal(app.$('board').querySelector('[data-square=f3]').classList.contains('premove'), true);
  position = game({ moves:['e4','e5'], turn:'w' });
  finishFirst({ game:game({ moves:['e4'], turn:'b' }) });
  await flush(); await flush();
  assert.equal(sent.length, 2); assert.equal(sent[1].from, 'g1'); assert.equal(sent[1].to, 'f3');
});

test('lost move response reconciles before rollback and keeps a committed piece in place', async t => {
  let committed = false;
  const app = setup(async body => {
    if (body.action === 'move') { committed = true; throw Error('response lost'); }
    if (body.action === 'snapshot' && committed) return { game:game({ moves:['e4'], turn:'b' }) };
    return { game:game() };
  }); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const board = app.$('board'), pawn = board.querySelector('[data-square=e2] img');
  board.querySelector('[data-square=e2]').click(); board.querySelector('[data-square=e4]').click(); await flush();
  assert.equal(board.querySelector('[data-square=e4] img'), pawn);
  assert.equal(board.querySelector('[data-square=e2] img'), null);
});

test('hiding during a move ignores stale replies and reconciles on return', async t => {
  let finish, position = game();
  const app = setup(async body => {
    if (body.action === 'move') return new Promise(resolve => { finish = resolve; });
    return { game:position };
  }); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const board = app.$('board'); board.querySelector('[data-square=e2]').click(); board.querySelector('[data-square=e4]').click();
  app.ui.hide(); position = game({ moves:['e4','e5'], turn:'w' });
  finish({ game:game({ moves:['e4'], turn:'b' }) }); await flush(); app.ui.show(); await flush();
  assert.equal(board.querySelector('[data-square=e4] img').getAttribute('src'), '/pieces/cburnett/wP.svg');
  assert.equal(board.querySelector('[data-square=e5] img').getAttribute('src'), '/pieces/cburnett/bP.svg');
  assert.match(app.$('status').textContent, /Ваш ход/);
});


test('mode selector is replaced during search and restored on cancellation', async t => {
  const app = setup(async body => body.action === 'search' ? {state:'searching'} : {game:null}); t.after(() => app.close());
  await app.ui.open(A);
  assert.equal(app.$('mode-picker').classList.contains('is-collapsed'), false); assert.equal(app.$('mode-summary').hidden, true);
  const input = app.$('mode-list').querySelector('[value=blitz]');
  input.checked = true; input.dispatchEvent(new app.dom.window.Event('change', {bubbles:true}));
  app.$('start-search').click(); await flush();
  assert.equal(app.$('mode-picker').getAttribute('aria-hidden'), 'true'); assert.equal(app.$('mode-picker').inert, true);
  assert.equal(app.$('mode-summary').hidden, false); assert.equal(app.$('mode-summary').textContent, 'Блиц · 3 мин');
  app.$('cancel-search').click(); await flush();
  assert.equal(app.$('mode-picker').classList.contains('is-collapsed'), false); assert.equal(app.$('mode-picker').getAttribute('aria-hidden'), 'false'); assert.equal(app.$('mode-summary').hidden, true);
});

test('active games show the mode and resign button; clocks always put player below opponent', async t => {
  for (const user of [A, B]) {
    const app = setup(async () => ({game:game()})); t.after(() => app.close());
    await app.ui.open(user); await flush();
    assert.equal(app.$('mode-picker').classList.contains('is-collapsed'), true); assert.equal(app.$('mode-summary').textContent, 'Блиц · 3 мин');
    assert.equal(app.$('resign-control').hidden, false);
    assert.equal(app.$('resign-button').textContent, 'Сдаться');
    assert.equal(app.$('opponent-clock-card').nextElementSibling, app.$('player-clock-card'));
    assert.equal(app.$('player-clock-card').dataset.color, user === A ? 'w' : 'b');
    assert.equal(app.$('opponent-clock-card').dataset.color, user === A ? 'b' : 'w');
  }
});


test('finished games retain the mode and offer a new game without resignation', async t => {
  const app = setup(async () => ({ game:game({ status:'finished', result:'draw', reason:'stalemate' }) }));
  t.after(() => app.close()); await app.ui.open(A); await flush();
  assert.equal(app.$('mode-summary').textContent, 'Блиц · 3 мин');
  assert.equal(app.$('resign-control').hidden, true);
  assert.equal(app.$('new-game').hidden, false);
  app.$('new-game').click();
  assert.equal(app.$('mode-picker').classList.contains('is-collapsed'), false); assert.equal(app.$('mode-summary').hidden, true);
});


test('history panel can be rapidly toggled with accessible state and focus', async t => {
  const app = setup(async () => ({game:game()})); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const button = app.$('toggle-moves'), content = app.$('history-content');
  app.$('history-first').focus(); button.click();
  assert.equal(app.dom.window.document.activeElement, button);
  assert.equal(button.getAttribute('aria-expanded'), 'false'); assert.equal(content.inert, true);
  assert.equal(content.getAttribute('aria-hidden'), 'true');
  button.click(); assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(content.inert, false); assert.equal(content.classList.contains('is-collapsed'), false);
});

test('opponent card is accessible, treats bio as text, and clears between games', async () => {
  const dom = new JSDOM(html, { url: 'https://example.com/pages/game.html' });
  const doc = dom.window.document;
  const ui = createMemberGame({ document:doc, api:async () => ({ game:game() }), opponentName:async () => ({ username:'Friend', bio:'<img src=x onerror=alert(1)>' }) });
  await ui.open(A); await flush();
  const trigger = doc.getElementById('opponent-profile-trigger'), card = doc.getElementById('opponent-profile-card');
  trigger.focus(); assert.equal(card.hidden, false); assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(doc.getElementById('opponent-profile-name').textContent, 'Friend');
  assert.equal(doc.getElementById('opponent-profile-bio').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(card.querySelector('img'), null);
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Escape' })); assert.equal(card.hidden, true);
  trigger.click(); assert.equal(card.hidden, false); trigger.click(); assert.equal(card.hidden, true);
  ui.destroy(); dom.window.close();
});

test('piece reveal is restarted on show but not on a move or visibility change', async () => {
  const dom = new JSDOM(html, { url:'https://example.com/pages/game.html' });
  let calls = 0;
  dom.window.Element.prototype.animate = function (frames, options) { if (options.duration === 1000) calls++; return { cancel() {} }; };
  const ui = createMemberGame({ document:dom.window.document, api:async () => ({ game:null }) });
  assert.equal(calls, 32); ui.hide(); ui.show(); assert.equal(calls, 64);
  ui.browserVisibility(false); ui.browserVisibility(true); assert.equal(calls, 64);
  ui.destroy(); dom.window.close();
});


test('resign requires confirmation and remains on the game screen', async t => {
  const calls = []; let state = game();
  const app = setup(async body => { calls.push(body); if (body.action === 'resign') state = {...state,status:'finished',result:'black_win',reason:'resignation',version:1}; return {game:state}; });
  t.after(() => app.close()); await app.ui.open(A); await flush();
  app.$('resign-button').click(); assert.equal(app.$('resign-dialog').hasAttribute('open'),true);
  app.$('resign-cancel').click(); assert.equal(app.$('resign-dialog').hasAttribute('open'),false);
  assert.equal(calls.some(body => body.action === 'resign'),false);
  app.$('resign-button').click(); app.$('resign-confirm').click(); await flush();
  assert.equal(calls.filter(body => body.action === 'resign').length,1);
  assert.match(app.$('status').textContent,/Вы проиграли.*вы сдались/);
  assert.equal(app.$('resign-control').hidden,true); assert.equal(app.$('new-game').hidden,false);
  assert.equal(app.dom.window.location.pathname,'/pages/game.html');
});

test('offline decisions appear only when confirmed by the server and handle reconnect', async t => {
  const calls = []; let state = {...game(),opponent_offline:true};
  const app = setup(async body => { calls.push(body); if (body.action === 'offline_win') state = {...state,opponent_offline:false}; return {game:state}; });
  t.after(() => app.close()); await app.ui.open(A); await flush();
  assert.equal(app.$('offline-choice').hidden,false); app.$('offline-win').click(); await flush();
  assert.equal(calls.some(body => body.action === 'offline_win'),true);
  assert.equal(app.$('offline-choice').hidden,true);
  assert.equal(app.$('resign-control').hidden,false);
});

test('offline draw is final only after server response', async t => {
  let state = {...game(),opponent_offline:true};
  const app = setup(async body => { if (body.action === 'offline_draw') state = {...state,status:'finished',result:'draw',reason:'opponent_offline',version:1}; return {game:state}; });
  t.after(() => app.close()); await app.ui.open(A); await flush(); app.$('offline-draw').click(); await flush();
  assert.match(app.$('status').textContent,/Ничья/); assert.equal(app.$('offline-choice').hidden,true);
});

test('failed resignation does not fabricate a loss', async t => {
  const app = setup(async body => { if (body.action === 'resign') throw new Error('offline'); return {game:game()}; });
  t.after(() => app.close()); await app.ui.open(A); await flush();
  app.$('resign-button').click(); app.$('resign-confirm').click(); await flush();
  assert.equal(app.$('resign-control').hidden,false); assert.equal(app.$('new-game').hidden,true);
  assert.doesNotMatch(app.$('status').textContent,/Вы проиграли/);
});


test('resignation appears one minute after match creation, including after reopening', async t => {
  let time = 0, age = 59000;
  const app = setup(async () => ({game:{...game(),game_age_ms:age}}), () => time);
  t.after(() => app.close()); await app.ui.open(A);
  assert.equal(app.$('resign-control').hidden, true);
  app.$('resign-button').click(); assert.equal(app.$('resign-dialog').hasAttribute('open'), false);
  time = 999; await new Promise(resolve => setTimeout(resolve, 270));
  assert.equal(app.$('resign-control').hidden, true);
  time = 1000; await new Promise(resolve => setTimeout(resolve, 270));
  assert.equal(app.$('resign-control').hidden, false);
  const reopened = setup(async () => ({game:{...game(),game_age_ms:60000}}));
  t.after(() => reopened.close()); await reopened.ui.open(A);
  assert.equal(reopened.$('resign-control').hidden, false);
});

test('initial failure retries without a refresh and cannot start a search before recovery', async t => {
  let calls = 0;
  const app = setup(async body => {
    if (body.action === 'current') { if (++calls === 1) throw Error('offline'); return {game:game({moves:['e4'],turn:'b'})}; }
    return {game:game({moves:['e4'],turn:'b'})};
  }); t.after(() => app.close());
  await app.ui.open(A);
  const blitz = app.$('mode-list').querySelector('[value=blitz]'); blitz.checked = true; blitz.dispatchEvent(new app.dom.window.Event('change', {bubbles:true}));
  assert.equal(app.$('start-search').disabled, true);
  assert.match(app.$('status').textContent, /Повторяем/);
  await new Promise(resolve => setTimeout(resolve, 950));
  assert.equal(calls, 2); assert.equal(app.$('player-color').textContent, 'Белые');
  assert.ok(app.$('board').querySelector('[data-square=e4] img'));
});

test('current check is single-flight across hidden and online events', async t => {
  let resolveCurrent, calls = 0;
  const app = setup(async body => {
    if (body.action === 'current') { calls++; return new Promise(resolve => { resolveCurrent = resolve; }); }
    return {game:null};
  }); t.after(() => app.close());
  const opening = app.ui.open(A);
  app.ui.hide(); app.ui.show(); app.ui.online();
  assert.equal(calls, 1);
  resolveCurrent({game:null}); await opening;
  assert.equal(calls, 1);
});

test('uncertain move blocks new moves until server snapshot recovers, without resending it', async t => {
  let online = true, moves = 0, committed = false;
  const app = setup(async body => {
    if (body.action === 'current') return {game:game()};
    if (body.action === 'move') { moves++; committed = true; online = false; throw Error('lost response'); }
    if (!online) throw Error('offline');
    return {game:game({moves:committed ? ['e4'] : [],turn:committed ? 'b':'w'})};
  }); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const click = sq => app.$('board').querySelector(`[data-square=${sq}]`).click();
  click('e2'); click('e4'); await flush();
  click('d2'); click('d4'); await flush(); assert.equal(moves, 1);
  online = true; app.ui.online(); await flush();
  assert.equal(moves, 1); assert.ok(app.$('board').querySelector('[data-square=e4] img'));
  assert.match(app.$('status').textContent, /Ход соперника/);
});

test('same version snapshot clears a transient polling error after reconnect', async t => {
  let online = true;
  const app = setup(async body => { if (!online) throw Error('offline'); return {game:game()}; }); t.after(() => app.close());
  await app.ui.open(A); await flush(); online = false; app.ui.online(); await flush();
  assert.match(app.$('status').textContent, /Повторяем/);
  online = true; app.ui.online(); await flush();
  assert.match(app.$('status').textContent, /Ваш ход/);
});

test('cancel retries after a temporary outage without rejoining the matchmaking queue', async t => {
  const calls = []; let available = false;
  const app = setup(async body => {
    calls.push(body.action);
    if (body.action === 'cancel' && !available) throw Error('network failure');
    if (body.action === 'search') return {state:'searching'};
    return {game:null};
  }); t.after(() => app.close());
  await app.ui.open(A);
  const blitz = app.$('mode-list').querySelector('[value=blitz]'); blitz.checked = true; blitz.dispatchEvent(new app.dom.window.Event('change', {bubbles:true}));
  app.$('start-search').click(); await flush(); app.$('cancel-search').click(); await flush();
  assert.match(app.$('status').textContent, /Повторяем/);
  assert.deepEqual(calls, ['current','search','cancel']);
  app.ui.hide(); available = true;
  await new Promise(resolve => setTimeout(resolve, 950));
  assert.deepEqual(calls, ['current','search','cancel','cancel']);
  assert.match(app.$('status').textContent, /Поиск отменён/);
  app.ui.show(); await flush(); assert.deepEqual(calls, ['current','search','cancel','cancel']);
});

test('a match created before cancellation is restored instead of discarded', async t => {
  let release, cancelCalls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const app = setup(async body => {
    if (body.action === 'search') return pending;
    if (body.action === 'cancel') { cancelCalls++; return {game:game()}; }
    if (body.action === 'snapshot') return {game:game()};
    return {game:null};
  }); t.after(() => app.close());
  await app.ui.open(A);
  const blitz = app.$('mode-list').querySelector('[value=blitz]'); blitz.checked = true; blitz.dispatchEvent(new app.dom.window.Event('change', {bubbles:true}));
  app.$('start-search').click(); await flush(); app.$('cancel-search').click(); await flush();
  assert.equal(cancelCalls,0);
  release({state:'matched',game:game()}); await flush();
  assert.equal(cancelCalls,1); assert.match(app.$('status').textContent,/Ваш ход/);
});

test('selection survives an opponent move but clears when the selected piece is captured', async t => {
  let position = game({moves:['e4'],turn:'b'});
  const app = setup(async () => ({game:position})); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const square = sq => app.$('board').querySelector(`[data-square=${sq}]`);
  square('g1').click(); assert.equal(square('g1').classList.contains('selected'),true);
  position = game({moves:['e4','e5'],turn:'w'}); app.ui.hide(); app.ui.show(); await flush();
  assert.equal(square('g1').classList.contains('selected'),true);
  position = game({moves:['e4','d5','exd5'],turn:'b',version:3}); app.ui.hide(); app.ui.show(); await flush();
  square('d5').click(); assert.equal(square('d5').classList.contains('selected'),true);
  position = game({moves:['e4','d5','exd5','Qxd5'],turn:'w',version:4}); app.ui.hide(); app.ui.show(); await flush();
  assert.equal(square('d5').classList.contains('selected'),false);
});

test('player names and game-mode ratings switch between yar and shadow elo', async () => {
  const dom = new JSDOM(html, { url:'https://example.com/pages/game.html', pretendToBeVisual:true });
  dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  const ui=createMemberGame({document:dom.window.document, api:async body=>({game:body.action==='current'?game():null}), playerRatings:async()=>[{player:'self',username:'Alice',yar:1200,elo:1050},{player:'opponent',username:'Bob',yar:1100,elo:1150}],opponentName:async()=>({username:'Bob'})});
  await ui.open(A); await flush();
  assert.equal(dom.window.document.getElementById('player-name').textContent,'Alice');
  assert.equal(dom.window.document.getElementById('opponent-rating').textContent.replace(/\s/g,''),'(1100ЯР)');
  ui.setRatingUnit('elo');
  assert.equal(dom.window.document.getElementById('player-rating').textContent.replace(/\s/g,''),'(1050Эло)');
  assert.equal(dom.window.document.getElementById('opponent-rating').textContent.replace(/\s/g,''),'(1150Эло)');
  ui.destroy(); dom.window.close();
});
