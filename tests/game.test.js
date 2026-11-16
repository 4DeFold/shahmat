import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { Chess } from 'chess.js';
import { chooseBotMove } from '../pages/bot.js';

const html = await readFile('pages/play.html', 'utf8');
const source = (await readFile('pages/play.js', 'utf8')).replace(/^import .*;\n/gm, '') + '\nwindow.testGame = game; window.testRender = render;';
function setup() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/play' });
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

test('guest board allows only legal moves, bot replies and restart cancels pending move', async () => {
  const { document, game, click } = setup();
  assert.equal(document.querySelectorAll('[data-square]').length, 64);
  click('e2'); assert.ok(document.querySelector('[data-square=e4]').classList.contains('possible'));
  click('e5'); assert.equal(game.history().length, 0);
  click('e2'); click('e4');
  assert.equal(document.querySelector('#status').textContent, 'Бот думает…');
  click('d2'); assert.equal(game.history().length, 1);
  await delay(1200);
  assert.equal(game.history().length, 2); assert.equal(game.turn(), 'w');
  assert.equal(document.querySelectorAll('#move-list li').length, 1);
  document.querySelector('#new-game').click(); click('e2'); click('e4'); document.querySelector('#new-game').click();
  await delay(350); assert.equal(game.history().length, 0); assert.equal(game.turn(), 'w');
});

test('promotion provides all four choices and honors the selected piece', () => {
  const { document, game, render, click } = setup();
  game.load('7k/P7/8/8/8/8/8/7K w - - 0 1'); render();
  click('a7'); click('a8');
  assert.equal(document.querySelector('#promotion').hidden, false);
  assert.equal(document.querySelectorAll('#promotion-options button').length, 4);
  document.querySelector('[aria-label="конь"]').click();
  assert.equal(game.get('a8').type, 'n');
  assert.match(document.querySelector('#status').textContent, /Ничья/);
});

test('castling and en passant follow chess rules', () => {
  const { game, render, click, document } = setup();
  game.load('4k3/8/8/8/8/8/8/4K2R w K - 0 1'); render();
  click('e1'); click('g1'); assert.equal(game.get('f1').type, 'r');
  document.querySelector('#new-game').click();
  game.load('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'); render();
  click('e5'); click('d6'); assert.equal(game.get('d5'), undefined); assert.equal(game.get('d6').type, 'p');
  document.querySelector('#new-game').click();
});
