import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { Chess } from 'chess.js';
import { createMemberGame, formatClock } from '../pages/member-game.js';

const html = await readFile('pages/game.html', 'utf8');
const A = 'a', B = 'b';
const flush = () => new Promise(resolve => setTimeout(resolve, 10));
function setup(api, now = () => 0, options = {}) {
  const dom = new JSDOM(html, { url: 'https://example.com/pages/game.html' });
  const ui = createMemberGame({ document: dom.window.document, api, now, ...options });
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
  assert.deepEqual([...app.$('mode-list').querySelectorAll('input')].map(input => input.value), ['bullet','blitz','rapid','classical']);
  assert.equal(app.$('start-search').disabled, true); assert.equal(app.$('start-search').hidden, true);
  assert.equal(app.$('search-loader').hidden, true);
  await app.ui.open(A);
  assert.equal(app.$('player-color'), null);
  const bullet = app.$('mode-list').querySelector('[value=bullet]'); bullet.checked = true; bullet.dispatchEvent(new app.dom.window.Event('change', { bubbles:true }));
  assert.equal(app.$('player-clock').getAttribute('aria-label'), '01:00');
  const rapid = app.$('mode-list').querySelector('[value=rapid]'); rapid.checked = true; rapid.dispatchEvent(new app.dom.window.Event('change', { bubbles:true }));
  assert.equal(app.$('player-clock').getAttribute('aria-label'), '10:00'); assert.equal(app.$('start-search').disabled, false); assert.equal(app.$('start-search').hidden, false);
  app.$('start-search').click(); await flush();
  assert.deepEqual(calls.at(-1), { action:'search', mode:'rapid' });
  assert.match(app.$('status').textContent, /Ищем/);
  assert.equal(app.$('search-loader').hidden, false);
  app.$('cancel-search').click(); await flush();
  assert.equal(calls.at(-1).action, 'cancel'); assert.match(app.$('status').textContent, /отменен|отменён|отменена/);
  await new Promise(resolve=>setTimeout(resolve,350));assert.equal(app.$('search-loader').hidden, true);
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
  assert.match(app.$('player-avatar-image').getAttribute('src'), /\/bN\.svg$/);
  assert.match(app.$('opponent-avatar-image').getAttribute('src'), /\/wN\.svg$/);
  assert.equal(app.$('player-color'), null);
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
  assert.deepEqual(calls, ['current','search','cancel']); assert.match(app.$('status').textContent, /отменен|отменён|отменена/);
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
  click('a3'); assert.equal(app.$('board').querySelector('[data-square=f3]').classList.contains('premove'), false);
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
  assert.equal(calls.length, 1); assert.match(app.$('status').textContent, /отменен|отменён|отменена/);
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
  assert.equal(app.$('other-mode').hidden, false);
  app.$('other-mode').click();
  assert.equal(app.$('mode-picker').classList.contains('is-collapsed'), false); assert.equal(app.$('mode-summary').hidden, false);
});


test('history panel can be rapidly toggled with accessible state and focus', async t => {
  const app = setup(async () => ({game:game()})); t.after(() => app.close());
  await app.ui.open(A); await flush();
  const button = app.$('toggle-moves'), content = app.$('history-content');
  app.$('history-last').disabled = false; app.$('history-last').focus(); button.click();
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
  assert.equal(doc.getElementById('opponent-profile-bio').querySelector('img'), null);
  assert.ok(doc.getElementById('opponent-profile-avatar'));
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Escape' })); assert.equal(card.hidden, true);
  assert.equal(doc.getElementById('opponent-profile-open'),null);
  ui.destroy(); dom.window.close();
});

test('empty opponent bio is absent rather than a placeholder', async t => {
  const dom = new JSDOM(html, { url:'https://example.com/pages/game.html' });
  const ui=createMemberGame({document:dom.window.document,api:async()=>({game:game()}),opponentName:async()=>({username:'Friend',bio:'  '})});
  t.after(()=>{ui.destroy();dom.window.close();});
  await ui.open(A); await flush();
  assert.equal(dom.window.document.getElementById('opponent-profile-bio').hidden,true);
  assert.equal(dom.window.document.getElementById('opponent-profile-bio-label').hidden,true);
  assert.equal(dom.window.document.getElementById('opponent-profile-bio').textContent,'');
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
  assert.equal(calls, 2); assert.equal(app.$('player-color'), null);
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
  const ui=createMemberGame({document:dom.window.document, api:async body=>({game:body.action==='current'?game():null}), playerRatings:async()=>[{player:'self',username:'Alice',yar:1200.4,elo:1050.3},{player:'opponent',username:'Bob',yar:1100.4,elo:1150.4}],opponentName:async()=>({username:'Bob'})});
  await ui.open(A); await flush();
  assert.equal(dom.window.document.getElementById('player-name').textContent,'Alice');
  assert.equal(dom.window.document.getElementById('opponent-rating').textContent.replace(/\s/g,''),'(1100ЯР)');
  ui.setRatingUnit('elo');
  assert.equal(dom.window.document.getElementById('player-rating').textContent.replace(/\s/g,''),'(1050Эло)');
  assert.equal(dom.window.document.getElementById('opponent-rating').textContent.replace(/\s/g,''),'(1150Эло)');
  ui.destroy(); dom.window.close();
});

test('premove captures an existing opponent piece after their reply', async t => {
  let current=game({moves:['e4','d5','exd5','Qxd5','Nc3'],turn:'b'}), sent=[];
  const app=setup(async body=>{if(body.action==='move'){sent.push(body);current=game({moves:['e4','d5','exd5','Qxd5','Nc3','Nf6','Nxd5'],turn:'b'});}return {game:current};});
  t.after(()=>app.close()); await app.ui.open(A); await flush();
  const click=s=>app.$('board').querySelector(`[data-square="${s}"]`).click();
  click('c3');click('d5');assert.ok(app.$('board').querySelector('[data-square=d5]').classList.contains('premove'));
  current=game({moves:['e4','d5','exd5','Qxd5','Nc3','Nf6'],turn:'w'});app.ui.hide();app.ui.show();await flush();
  assert.equal(sent.length,1);assert.equal(sent[0].from,'c3');assert.equal(sent[0].to,'d5');
});

test('premove anticipates en passant and is cancelled if the target never becomes legal',async t=>{
 let current=game({moves:['e4','a6','e5'],turn:'b'}),sent=[];
 const app=setup(async body=>{if(body.action==='move'){sent.push(body);current=game({moves:['e4','a6','e5','d5','exd6'],turn:'b'});}return {game:current};});
 t.after(()=>app.close());await app.ui.open(A);await flush();
 const click=s=>app.$('board').querySelector(`[data-square="${s}"]`).click();click('e5');click('d6');
 assert.ok(app.$('board').querySelector('[data-square=d6]').classList.contains('premove'));
 current=game({moves:['e4','a6','e5','d5'],turn:'w'});app.ui.hide();app.ui.show();await flush();
 assert.equal(sent.length,1);assert.equal(sent[0].to,'d6');assert.equal(app.$('board').querySelector('[data-square=d5] img'),null);
});

test('capture premove lets the player select an underpromotion',async t=>{
 const opening=['a4','h5','a5','h4','a6','h3','axb7'];let current=game({moves:opening,turn:'b'}),sent=[];
 const app=setup(async body=>{if(body.action==='move'){sent.push(body);current=game({moves:[...opening,'hxg2','bxa8=N'],turn:'b'});}return {game:current};});
 t.after(()=>app.close());await app.ui.open(A);await flush();
 const click=s=>app.$('board').querySelector(`[data-square="${s}"]`).click();click('b7');click('a8');
 assert.equal(app.$('promotion').hidden,false);app.$('promotion-options').querySelector('[aria-label="конь"]').click();
 assert.equal(app.$('promotion').hidden,true);assert.ok(app.$('board').querySelector('[data-square=a8].premove'));
 current=game({moves:[...opening,'hxg2'],turn:'w'});app.ui.hide();app.ui.show();await flush();
 assert.equal(sent.length,1);assert.equal(sent[0].promotion,'n');assert.match(app.$('board').querySelector('[data-square=a8] img').src,/wN.svg/);
});

test('history keys navigate half-moves and incoming moves do not dislodge a past position', async t => {
  let state=game({moves:['e4','e5','Nf3'],turn:'b'});
  const app=setup(async()=>({game:state})); t.after(()=>app.close());
  await app.ui.open(A); await flush();
  const doc=app.dom.window.document, key=k=>doc.dispatchEvent(new app.dom.window.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
  key('a'); assert.equal(app.$('move-list').querySelector('.current').textContent,'e5');
  assert.ok(app.$('board').querySelector('[data-square=g1] img'));
  state=game({moves:['e4','e5','Nf3','Nc6'],turn:'w'}); app.ui.hide(); app.ui.show(); await flush();
  assert.equal(app.$('move-list').querySelector('.current').textContent,'e5');
  assert.ok(app.$('board').querySelector('[data-square=b8] img'));
  key('ArrowRight'); assert.equal(app.$('move-list').querySelector('.current').textContent,'f3');
  key('d'); assert.equal(app.$('move-list').querySelector('.current').textContent,'c6');
  key('ArrowLeft'); assert.equal(app.$('move-list').querySelector('.current').getAttribute('aria-current'),'step');
  app.$('move-list').querySelector('[data-history-index="1"]').click(); assert.equal(app.$('move-list').querySelector('.current').textContent,'e4');
  const input=app.$('mode-list').querySelector('input'); input.disabled=false; input.focus(); input.dispatchEvent(new app.dom.window.KeyboardEvent('keydown',{key:'d',bubbles:true}));
  assert.equal(app.$('move-list').querySelector('.current').textContent,'e4');
});

test('a chain of premoves uses ghost positions, executes one per reply and cancels on empty square',async t=>{
 let current=game({moves:['e4'],turn:'b'}), sent=[];
 const app=setup(async body=>{if(body.action==='move'){sent.push(body);current=game({moves:['e4','e5','Nf3'],turn:'b'});}return {game:current};});t.after(()=>app.close());
 await app.ui.open(A);await flush();const board=app.$('board'), click=s=>board.querySelector(`[data-square=${s}]`).click();
 click('g1');click('f3'); assert.ok(board.querySelector('[data-square=f3] .premove-ghost'));
 click('f3');click('g5'); assert.ok(board.querySelector('[data-square=g5] .premove-ghost'));
 current=game({moves:['e4','e5'],turn:'w'});app.ui.hide();app.ui.show();await flush();
 assert.equal(sent.length,1);assert.equal(sent[0].to,'f3');assert.ok(board.querySelector('[data-square=g5] .premove-ghost'));
 click('a3');assert.equal(board.querySelectorAll('.premove-ghost').length,0);assert.ok(board.querySelector('[data-square=f3] .piece'));
});

test('premove queue is capped at twenty without clearing it',async t=>{
 const app=setup(async()=>({game:game({moves:['e4'],turn:'b'})}));t.after(()=>app.close());await app.ui.open(A);await flush();
 const board=app.$('board'),click=s=>board.querySelector(`[data-square=${s}]`).click();
 for(let i=0;i<20;i++){click(i%2?'f3':'g1');click(i%2?'g1':'f3');}
 assert.ok(board.querySelector('[data-square=g1] .piece'));click('g1');click('f3');
 assert.match(app.$('status').textContent,/20/);assert.ok(board.querySelector('[data-square=g1].premove'));assert.equal(board.querySelector('[data-square=f3] .piece'),null);
 click('a3');assert.equal(board.querySelectorAll('.premove').length,0);
});

test('successive premoves are submitted only after successive opponent replies',async t=>{
 let current=game({moves:['e4'],turn:'b'}),sent=[];
 const app=setup(async body=>{if(body.action==='move'){sent.push(body);const c=new Chess();current.moves.forEach(m=>c.move(m));c.move({from:body.from,to:body.to});current=game({moves:c.history(),turn:c.turn()});}return {game:current};});t.after(()=>app.close());await app.ui.open(A);await flush();
 const board=app.$('board'),click=s=>board.querySelector(`[data-square=${s}]`).click();click('g1');click('f3');click('f3');click('g5');
 current=game({moves:['e4','e5'],turn:'w'});app.ui.hide();app.ui.show();await flush();assert.deepEqual(sent.map(x=>x.to),['f3']);
 current=game({moves:['e4','e5','Nf3','Nc6'],turn:'w'});app.ui.hide();app.ui.show();await flush();assert.deepEqual(sent.map(x=>x.to),['f3','g5']);
});

test('history navigation animates moved pieces forwards and backwards',async t=>{
 const dom=new JSDOM(html,{url:'https://example.com/pages/game.html',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const animations=[];dom.window.HTMLElement.prototype.animate=function(frames){animations.push({square:this.parentElement?.dataset.square,frames});return {finished:Promise.resolve(),cancel(){}};};
 const board=dom.window.document.querySelector('#board');Object.defineProperty(board,'clientWidth',{value:800});
 const ui=createMemberGame({document:dom.window.document,api:async()=>({game:game({moves:['e4','e5','Nf3'],turn:'b',status:'finished'})})});t.after(()=>ui.destroy());await ui.open(A);await flush();animations.length=0;
 dom.window.document.querySelector('#history-prev').click();assert.ok(animations.some(a=>a.square==='g1'&&a.frames[0].translate));animations.length=0;
 dom.window.document.querySelector('#history-next').click();assert.ok(animations.some(a=>a.square==='f3'&&a.frames[0].translate));
});

test('captures and held physical attack keys follow the displayed history, including blocked pieces', async t=>{
 const app=setup(async()=>({game:game({moves:['e4','d5','exd5','Qxd5'],turn:'w'})}));t.after(()=>app.close());await app.ui.open(A);await flush();
 assert.equal(app.$('player-captured').querySelectorAll('img').length,1);assert.equal(app.$('opponent-captured').querySelectorAll('img').length,1);
 const key=(type,code)=>app.dom.window.document.dispatchEvent(new app.dom.window.KeyboardEvent(type,{code,key:code==='KeyQ'?'q':'e',bubbles:true}));
 key('keydown','KeyQ');assert.equal(app.$('board').querySelector('[data-square=d4]').classList.contains('threat-enemy'),true);
 key('keydown','KeyE');assert.equal(app.$('board').querySelector('[data-square=e2]').classList.contains('threat-own'),true);
 key('keyup','KeyQ');assert.equal(app.$('board').querySelectorAll('.threat-enemy').length,0);
 app.$('history-first').click();assert.equal(app.$('player-captured').querySelectorAll('img').length,0);assert.equal(app.$('opponent-captured').querySelectorAll('img').length,0);
 assert.equal(app.$('board').querySelector('[data-square=a4]').classList.contains('threat-own'),false);key('keyup','KeyE');assert.equal(app.$('board').querySelectorAll('.threat-own').length,0);
});

test('newly matched and restored games start silently',async t=>{
 const app=setup(async body=>body.action==='current'?{game:null}: {game:game()});t.after(()=>app.close());const plays=[];
 app.dom.window.Audio=class {constructor(src){this.src=src;}load(){}pause(){}addEventListener(){}cloneNode(){return new this.constructor(this.src);}play(){plays.push({src:this.src,volume:this.volume});return Promise.resolve();}};
 await app.ui.open(A);const blitz=app.$('mode-list').querySelector('[value=blitz]');blitz.checked=true;blitz.dispatchEvent(new app.dom.window.Event('change',{bubbles:true}));app.$('start-search').click();await flush();
 assert.equal(plays.length,0,'matching is silent');
 const restored=setup(async()=>({game:game()}));t.after(()=>restored.close());restored.dom.window.Audio=app.dom.window.Audio;await restored.ui.open(A);await flush();assert.equal(plays.length,0,'restoring a game is silent');
});


test('own rating follows selected mode and ignores stale responses', async () => {
  let resolveBlitz;
  const app=setup(async () => ({game:null}), () => 0, {ownRatingForMode: mode => {
    if(mode==='blitz') return new Promise(resolve=>{resolveBlitz=resolve;});
    return Promise.resolve({yar:mode==='rapid'?988:972,elo:1000});
  }});
  try {
    await app.ui.open(A); await flush();
    assert.match(app.$('player-rating').textContent,/972/);
    for(const mode of ['blitz','rapid']) {
      const input=app.$('mode-list').querySelector(`[value=${mode}]`); input.checked=true;
      input.dispatchEvent(new app.dom.window.Event('change',{bubbles:true}));
    }
    await flush(); assert.match(app.$('player-rating').textContent,/988/);
    resolveBlitz({yar:1200,elo:1000}); await flush();
    assert.match(app.$('player-rating').textContent,/988/);
  } finally {app.close();}
});

test('configured friendly variation searches the correct separate pool and initial clock',async()=>{
 const calls=[],app=setup(async body=>{calls.push(body);return body.action==='search'?{state:'searching'}:{game:null};});
 try {
  await app.ui.open(A);
  assert.equal(app.ui.configureMatch({mode:'blitz',kind:'friendly',timeControl:'5+3'}),true);
  assert.equal(app.$('player-clock').getAttribute('aria-label'),'05:00');
  assert.match(app.$('mode-summary').textContent,/Товарищеская.*5\+3/);
  app.$('start-search').click();await flush();
  assert.deepEqual(calls.at(-1),{action:'search',mode:'blitz',gameKind:'friendly',timeControl:'5+3'});
 } finally{app.close();}
});

test('clock switches immediately on an optimistic move and reconciles to the server',async t=>{
 let now=0,resolveMove;
 const initial={...game(),time_control:'3+2'},app=setup(async body=>{
  if(body.action==='move')return new Promise(resolve=>{resolveMove=resolve});
  return {game:initial};
 },()=>now);t.after(()=>app.close());await app.ui.open(A);await flush();
 now=1000;const click=s=>app.$('board').querySelector(`[data-square="${s}"]`).click();click('e2');click('e4');
 assert.equal(app.$('opponent-clock-card').classList.contains('running'),true);
 assert.equal(app.$('player-clock').getAttribute('aria-label'),'03:01');
 now=3000;resolveMove({game:{...game({moves:['e4'],turn:'b'}),time_control:'3+2',white_ms:180700,black_ms:178000}});await flush();
 assert.equal(app.$('player-clock').getAttribute('aria-label'),'03:01');
 assert.equal(app.$('opponent-clock').getAttribute('aria-label'),'02:58');
});

test('untrusted realtime hints only trigger throttled authoritative snapshots',async t=>{
 let now=1000, current=game(), snapshots=0,hold=null;
 const app=setup(async body=>{if(body.action==='snapshot'){snapshots++;if(hold)return hold;return {game:current}}return {game:current}},()=>now);t.after(()=>app.close());
 await app.ui.open(B);await flush();const before=snapshots;
 current=game({moves:['e4'],turn:'b'});app.ui.notifyUpdate('other',1);app.ui.notifyUpdate('game','1');app.ui.notifyUpdate('game',0);
 assert.equal(snapshots,before);
 app.ui.notifyUpdate('game',1);await flush();assert.ok(app.$('board').querySelector('[data-square=e4] img'));assert.equal(snapshots,before+1);
 // A forged hint is just a read: it cannot install a fake position or result.
 app.ui.notifyUpdate('game',9);await flush();assert.equal(snapshots,before+1);
 now+=501;let release;hold=new Promise(r=>{release=r});app.ui.notifyUpdate('game',9);app.ui.notifyUpdate('game',10);assert.equal(snapshots,before+2);
 release({game:current});await flush();assert.ok(app.$('board').querySelector('[data-square=e4] img'));assert.match(app.$('status').textContent,/Ваш ход/);
});

test('two clients exchange a confirmed wake-up and fetch the authoritative move without waiting for polling',async t=>{
 const {createMatchSignal}=await import('../pages/match-signal.js');
 const channels=[];
 const client={channel(topic){const c={topic,on(_type,_filter,fn){this.receive=fn;return this},subscribe(fn){fn('SUBSCRIBED');return this},send(message){for(const other of channels)if(other!==this&&other.topic===topic)other.receive({payload:message.payload});return Promise.resolve('ok')}};channels.push(c);return c},removeChannel(c){const i=channels.indexOf(c);if(i>=0)channels.splice(i,1)}};
 let server=game(),blackReads=0;
 const api=side=>async body=>{
  if(body.action==='move'){server=game({moves:['e4'],turn:'b'});return {game:server};}
  if(body.action==='snapshot'&&side===B)blackReads++;
  return {game:server};
 };
 let white,black;
 const whiteSignal=createMatchSignal(client,(id,version)=>white.ui.notifyUpdate(id,version));
 const blackSignal=createMatchSignal(client,(id,version)=>black.ui.notifyUpdate(id,version));
 white=setup(api(A),()=>performance.now(),{onGameChanged:id=>whiteSignal.setGame(id),onMoveCommitted:(id,v)=>whiteSignal.publish(id,v)});
 black=setup(api(B),()=>performance.now(),{onGameChanged:id=>blackSignal.setGame(id),onMoveCommitted:(id,v)=>blackSignal.publish(id,v)});
 t.after(()=>{white.close();black.close();whiteSignal.destroy();blackSignal.destroy()});
 await white.ui.open(A);await black.ui.open(B);await flush();const before=blackReads;
 const click=s=>white.$('board').querySelector(`[data-square="${s}"]`).click();click('e2');click('e4');await flush();
 assert.equal(blackReads,before+1);assert.ok(black.$('board').querySelector('[data-square=e4] img'));
 assert.match(black.$('status').textContent,/Ваш ход/);
});

test('lost move reply reconciles and emits a hint only after a confirmed commit',async t=>{
 let committed=game(),published=[];
 const app=setup(async body=>{
  if(body.action==='move'){committed=game({moves:['e4'],turn:'b'});throw Error('lost reply')}
  return {game:committed};
 },()=>performance.now(),{onMoveCommitted:(id,version)=>published.push([id,version])});t.after(()=>app.close());
 await app.ui.open(A);await flush();const click=s=>app.$('board').querySelector(`[data-square="${s}"]`).click();click('e2');click('e4');await flush();
 assert.deepEqual(published,[['game',1]]);assert.ok(app.$('board').querySelector('[data-square=e4] img'));
});

test('finished rated game shows recorded signed ЯР changes for both players',async t=>{
 const finished={...game({moves:['e4','e5'],turn:'w',status:'finished',result:'white_win'}),game_kind:'rated',time_control:'3+2'};
 const app=setup(async()=>({game:finished}),()=>0,{playerRatings:async()=>[{player:'self',yar:900},{player:'opponent',yar:1200}],gameRatingChanges:async()=>[
  {player:'self',before_yar:1000,after_yar:1020,before_elo:1400,after_elo:1410},
  {player:'opponent',before_yar:1100,after_yar:1080,before_elo:1450,after_elo:1440}
 ]});t.after(()=>app.close());await app.ui.open(A);await flush();
 assert.equal(app.$('player-rating-delta').textContent,'+20 ЯР');assert.equal(app.$('opponent-rating-delta').textContent,'−20 ЯР');
 assert.ok(app.$('player-rating-delta').classList.contains('positive'));assert.ok(app.$('opponent-rating-delta').classList.contains('negative'));
 assert.match(app.$('player-rating').textContent,/1\s*020 ЯР/);assert.match(app.$('opponent-rating').textContent,/1\s*080 ЯР/);
 app.ui.setRatingUnit('elo');assert.match(app.$('player-rating').textContent,/1\s*410 Эло/);
});

test('friendly games and unrecorded rated results never invent a rating change',async t=>{
 let calls=0;const friendly={...game({status:'finished',result:'draw'}),game_kind:'friendly'};
 const app=setup(async()=>({game:friendly}),()=>0,{gameRatingChanges:async()=>{calls++;return []}});t.after(()=>app.close());await app.ui.open(A);await flush();
 assert.equal(calls,0);assert.equal(app.$('player-rating-delta').hidden,true);assert.equal(app.$('opponent-rating-delta').hidden,true);
});

test('new game searches immediately in the same pool and other mode returns the selection',async t=>{
 const finished={...game({status:'finished',result:'draw'}),game_kind:'friendly',time_control:'10+5',mode:'rapid'};
 const calls=[],app=setup(async body=>{calls.push(body);return body.action==='search'?{state:'searching'}:{game:finished}},()=>0);t.after(()=>app.close());
 await app.ui.open(A);await flush();assert.equal(app.$('new-game').hidden,false);assert.equal(app.$('other-mode').hidden,false);
 app.$('new-game').click();await flush();assert.deepEqual(calls.find(c=>c.action==='search'),{action:'search',mode:'rapid',timeControl:'10+5',gameKind:'friendly'});
 assert.equal(app.$('new-game').hidden,true);assert.equal(app.$('other-mode').hidden,true);
 let chosen=null;const other=setup(async()=>({game:finished}),()=>0,{onGameReset:value=>{chosen=value}});t.after(()=>other.close());
 await other.ui.open(A);await flush();other.$('other-mode').click();assert.deepEqual(chosen,{mode:'rapid',kind:'friendly',timeControl:'10+5'});
});
