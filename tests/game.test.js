import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { Chess } from 'chess.js';
import { chooseBotMove } from '../pages/bot.js';

const html = await readFile('pages/play.html', 'utf8');
const source = (await readFile('pages/play.js', 'utf8')).replace(/^import .*;\n/gm, '') + '\nwindow.testGame = game; window.testRender = render;';
function setup({ saved = null, storageError = false, memberId = null } = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/play' });
  if (memberId) {
    dom.window.document.body.dataset.gameUser = memberId; dom.window.confirm = () => true;
    const anchor = dom.window.document.getElementById('new-game');
    const button = dom.window.document.createElement('button'); button.id = 'new-game'; button.type = 'button'; anchor.replaceWith(button);
  }
  if (saved !== null) dom.window.localStorage.setItem(memberId ? `shahmat.member-game.v1.${memberId}` : 'shahmat.guest-game.v1', saved);
  if (storageError) Object.defineProperty(dom.window, 'localStorage', { get() { throw new Error('storage blocked'); } });
  dom.window.Chess = Chess;
  dom.window.chooseBotMove = chooseBotMove;
  dom.window.eval(source);
  const { document } = dom.window;
  const click = square => document.querySelector(`[data-square="${square}"]`).click();
  return { window: dom.window, document, game: dom.window.testGame, render: dom.window.testRender, click };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('bot chooses a legal move without changing position or history', () => {
  const game = new Chess(); game.move('e4');
  const before = game.fen(), history = game.history();
  const move = chooseBotMove(game, () => 0);
  assert.ok(game.moves().includes(move.san));
  assert.equal(game.fen(), before); assert.deepEqual(game.history(), history);
  game.move(move); assert.equal(game.turn(), 'w');
});

test('guest board allows only legal moves and saves the bot reply', async () => {
  const { document, game, click } = setup();
  assert.equal(document.querySelectorAll('[data-square]').length, 64);
  assert.equal(document.querySelector('[data-square=e1] .piece').getAttribute('src'), '/pieces/cburnett/wK.svg');
  assert.equal(document.querySelector('[data-square=e8] .piece').getAttribute('src'), '/pieces/cburnett/bK.svg');
  assert.ok(document.querySelector('[data-square=a1]').classList.contains('dark'));
  assert.ok(document.querySelector('[data-square=a8]').classList.contains('light'));
  click('e2'); assert.ok(document.querySelector('[data-square=e4]').classList.contains('possible'));
  click('e5'); assert.equal(game.history().length, 0);
  click('e2'); click('e4');
  assert.equal(document.querySelector('#status').textContent, 'Бот думает…');
  click('d2'); assert.equal(game.history().length, 1);
  await delay(1200);
  assert.equal(game.history().length, 2); assert.equal(game.turn(), 'w');
  assert.equal(document.querySelectorAll('#move-list li').length, 1);
  assert.deepEqual(JSON.parse(document.defaultView.localStorage.getItem('shahmat.guest-game.v1')).moves, game.history());
  assert.equal(document.querySelector('#new-game').getAttribute('href'), '/login?mode=signup');
});

test('promotion provides all four choices and honors the selected piece', () => {
  const { document, game, render, click } = setup();
  game.load('7k/P7/8/8/8/8/8/7K w - - 0 1'); render();
  click('a7'); click('a8');
  assert.equal(document.querySelector('#promotion').hidden, false);
  assert.equal(document.querySelectorAll('#promotion-options button').length, 4);
  assert.deepEqual([...document.querySelectorAll('#promotion-options img')].map(img => img.getAttribute('src')), ['/pieces/cburnett/wQ.svg', '/pieces/cburnett/wR.svg', '/pieces/cburnett/wB.svg', '/pieces/cburnett/wN.svg']);
  document.querySelector('[aria-label="конь"]').click();
  assert.equal(game.get('a8').type, 'n');
  assert.match(document.querySelector('#status').textContent, /Ничья/);
});

test('castling and en passant follow chess rules', () => {
  const { game, render, click, document } = setup();
  game.load('4k3/8/8/8/8/8/8/4K2R w K - 0 1'); render();
  click('e1'); click('g1'); assert.equal(game.get('f1').type, 'r');
  const other = setup();
  other.game.load('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'); other.render();
  other.click('e5'); other.click('d6'); assert.equal(other.game.get('d5'), undefined); assert.equal(other.game.get('d6').type, 'p');
  document.defaultView.close(); other.window.close();
});


test('reload restores history and schedules the bot if it was its turn', async () => {
  const first = setup(); first.click('e2'); first.click('e4');
  const saved = first.window.localStorage.getItem('shahmat.guest-game.v1');
  assert.deepEqual(JSON.parse(saved).moves, ['e4']);
  first.window.close();
  const restored = setup({ saved });
  assert.equal(restored.game.get('e4').type, 'p');
  assert.equal(restored.document.querySelector('#status').textContent, 'Бот думает…');
  await delay(1200);
  assert.equal(restored.game.history().length, 2);
  const afterReply = restored.window.localStorage.getItem('shahmat.guest-game.v1');
  const next = setup({ saved: afterReply });
  assert.deepEqual(next.game.history(), restored.game.history());
  assert.equal(next.game.fen(), restored.game.fen());
  restored.window.close(); next.window.close();
});

test('invalid or inaccessible storage is handled safely', () => {
  const invalid = setup({ saved: JSON.stringify({ version: 1, moves: ['e4', 'not-a-move'] }) });
  assert.deepEqual(invalid.game.history(), []);
  assert.match(invalid.document.querySelector('#storage-message').textContent, /Не удалось восстановить/);
  invalid.window.close();
  const unavailable = setup({ storageError: true });
  unavailable.click('e2'); unavailable.click('e4');
  assert.equal(unavailable.game.history().length, 1);
  assert.match(unavailable.document.querySelector('#storage-message').textContent, /Не удалось сохранить/);
  unavailable.window.close();
});

test('full saved history preserves repetition draw and result on reload', () => {
  const moves = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'];
  const app = setup({ saved: JSON.stringify({ version: 1, moves }) });
  assert.equal(app.game.isThreefoldRepetition(), true);
  assert.match(app.document.querySelector('#status').textContent, /повторение/);
  app.window.close();
});


test('member bot games are account-scoped and a new game cancels a pending bot move', async () => {
  const app = setup({ memberId: 'user-1' });
  app.click('e2'); app.click('e4');
  assert.deepEqual(JSON.parse(app.window.localStorage.getItem('shahmat.member-game.v1.user-1')).moves, ['e4']);
  assert.equal(app.window.localStorage.getItem('shahmat.guest-game.v1'), null);
  app.document.querySelector('#new-game').click();
  await delay(600);
  assert.deepEqual(app.game.history(), []);
  assert.deepEqual(JSON.parse(app.window.localStorage.getItem('shahmat.member-game.v1.user-1')).moves, []);
  assert.equal(app.document.querySelector('#status').textContent, 'Ваш ход.');
  app.window.close();
});

test('declining to start over preserves the member game', () => {
  const app = setup({ memberId: 'user-1', saved: JSON.stringify({ version: 1, moves: ['e4', 'e5'] }) });
  app.window.confirm = () => false;
  app.document.querySelector('#new-game').click();
  assert.deepEqual(app.game.history(), ['e4', 'e5']);
  app.window.close();
});
