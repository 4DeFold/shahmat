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
  return { id:'game', white_id:A, black_id:B, mode:'blitz', moves, turn, version, status, result, reason, white_ms:180000, black_ms:180000 };
}

test('clock formatting covers all requested controls', () => {
  assert.equal(formatClock(180000), '03:00'); assert.equal(formatClock(600000), '10:00');
  assert.equal(formatClock(3600000), '1:00:00'); assert.equal(formatClock(86400000), '24:00:00');
  assert.equal(formatClock(0), '00:00');
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
  assert.equal(app.$('board').querySelector('[data-square=e2] img').getAttribute('src'), '/pieces/cburnett/wP.svg');
  assert.deepEqual([...app.$('mode-list').querySelectorAll('input')].map(input => input.value), ['blitz','rapid','classical','daily']);
  assert.equal(app.$('start-search').disabled, true);
  await app.ui.open(A);
  const rapid = app.$('mode-list').querySelector('[value=rapid]'); rapid.checked = true; rapid.dispatchEvent(new app.dom.window.Event('change', { bubbles:true }));
  assert.equal(app.$('player-clock').textContent, '10:00'); assert.equal(app.$('start-search').disabled, false);
  app.$('start-search').click(); await flush();
  assert.deepEqual(calls.at(-1), { action:'search', mode:'rapid' });
  assert.match(app.$('status').textContent, /Ищем/);
  app.$('cancel-search').click(); await flush();
  assert.equal(calls.at(-1).action, 'cancel'); assert.match(app.$('status').textContent, /отменён/);
  app.close();
});

test('matched players can only submit legal moves on their turn; black sees flipped board', async () => {
  const calls = [], chess = new Chess();
  const app = setup(async body => {
    calls.push(body);
    if (body.action === 'current') return { game: game({ moves:['e4'], turn:'b' }) };
    if (body.action === 'move') { chess.move('e4'); chess.move({ from:body.from,to:body.to }); return { game: game({ moves:chess.history(), turn:'w' }) }; }
    return { game: game({ moves:['e4'], turn:'b' }) };
  });
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
  app.close();
});

test('a failed cancel remains searching rather than pretending to cancel', async () => {
  const app = setup(async body => { if (body.action === 'cancel') throw Error('offline'); return body.action === 'search' ? { state:'searching' } : { game:null }; });
  await app.ui.open(A);
  const blitz = app.$('mode-list').querySelector('[value=blitz]'); blitz.checked = true; blitz.dispatchEvent(new app.dom.window.Event('change', { bubbles:true }));
  app.$('start-search').click(); await flush(); app.$('cancel-search').click(); await flush();
  assert.match(app.$('status').textContent, /Не удалось отменить/); assert.equal(app.$('cancel-search').hidden, false);
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
  assert.equal(app.$('player-clock').textContent, '02:35');
  assert.equal(app.$('opponent-clock').textContent, '02:50');
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

test('active games show the mode and leave link; clocks always put player below opponent', async t => {
  for (const user of [A, B]) {
    const app = setup(async () => ({game:game()})); t.after(() => app.close());
    await app.ui.open(user); await flush();
    assert.equal(app.$('mode-picker').classList.contains('is-collapsed'), true); assert.equal(app.$('mode-summary').textContent, 'Блиц · 3 мин');
    assert.equal(app.$('leave-game-control').hidden, false);
    assert.equal(app.$('leave-game-control').querySelector('a').getAttribute('href'), '/home');
    assert.equal(app.$('leave-game-control').querySelector('a').target, '_top');
    assert.equal(app.$('leave-game-control').querySelector('.leave-note').hidden, false);
    assert.equal(app.$('opponent-clock-card').nextElementSibling, app.$('player-clock-card'));
    assert.equal(app.$('player-clock-card').dataset.color, user === A ? 'w' : 'b');
    assert.equal(app.$('opponent-clock-card').dataset.color, user === A ? 'b' : 'w');
  }
});


test('finished games retain the mode and provide both new game and exit', async t => {
  const app = setup(async () => ({ game:game({ status:'finished', result:'draw', reason:'stalemate' }) }));
  t.after(() => app.close()); await app.ui.open(A); await flush();
  assert.equal(app.$('mode-summary').textContent, 'Блиц · 3 мин');
  assert.equal(app.$('leave-game-control').hidden, false);
  assert.equal(app.$('leave-game-control').querySelector('.leave-note').hidden, true);
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
