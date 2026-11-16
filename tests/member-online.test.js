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
  assert.equal(app.$('player-clock-card').dataset.color, 'w');
  assert.equal(app.$('opponent-clock-card').dataset.color, 'b');
  assert.equal(app.$('player-clock-card').nextElementSibling, app.$('opponent-clock-card'));
  assert.equal(app.$('player-clock-label').textContent, 'Вы · Белые');
  assert.equal(app.$('opponent-clock-label').textContent, 'Соперник · Чёрные');
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
  assert.equal(app.$('board').firstElementChild.dataset.square, 'h1');
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
