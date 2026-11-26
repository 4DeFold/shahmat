import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { Chess } from 'chess.js';
import { chooseBotMove } from '../pages/bot.js';
import { premoveTargets, validPremove, normalizePremove, projectPremoves } from '../pages/premove.js';
import { createBoardAnnotations } from '../pages/board-annotations.js';
import { createGameSound } from '../pages/game-sound.js';
import { renderCaptures } from '../pages/board-insights.js';

const html = await readFile('pages/play.html', 'utf8');
const source = (await readFile('pages/play.js', 'utf8')).replace(/^import .*;\n/gm, '') + '\nwindow.testGame = game; window.testRender = render;';
function setup({ saved = null, storageError = false, memberId = null, now = null, random = 0.1, botMove = chooseBotMove } = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/play', pretendToBeVisual: true });
  if (memberId) {
    dom.window.document.body.dataset.gameUser = memberId; dom.window.confirm = () => true;
    const anchor = dom.window.document.getElementById('new-game');
    const button = dom.window.document.createElement('button'); button.id = 'new-game'; button.type = 'button'; anchor.replaceWith(button);
  }
  if (saved !== null) dom.window.localStorage.setItem(memberId ? `shahmat.member-game.v1.${memberId}` : 'shahmat.guest-game.v1', saved);
  if (storageError) Object.defineProperty(dom.window, 'localStorage', { get() { throw new Error('storage blocked'); } });
  if (now !== null) dom.window.Date.now = () => now.value;
  dom.window.Math.random = () => random;
  dom.window.Audio = class { load() {} pause() {} addEventListener() {} cloneNode() { return new this.constructor(); } play() { return Promise.resolve(); } };
  dom.window.themedPieceSrc = (color,type) => `/pieces/cburnett/${color}${type.toUpperCase()}.svg`;
  dom.window.setBoardPiece = (img,color,type)=>{img.src=dom.window.themedPieceSrc(color,type)};
  dom.window.Chess = Chess;
  dom.window.chooseBotMove = botMove;
  Object.assign(dom.window,{premoveTargets,validPremove,normalizePremove,projectPremoves,createBoardAnnotations,createGameSound,renderCaptures});
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


const finishedMoves = ['f3', 'e5', 'g4', 'Qh4#'];
const savedGame = (moves, newGameAt) => JSON.stringify({ version: 1, moves, ...(newGameAt === undefined ? {} : { newGameAt }) });
function clickRegistration(app) {
  // Keep the anchor's navigation contract while avoiding jsdom navigation.
  app.document.querySelector('#new-game').addEventListener('click', event => event.preventDefault(), { once: true });
  app.document.querySelector('#new-game').click();
}

test('guest starts a single hour countdown only after the game ends and keeps registration link', () => {
  const now = { value: 1_000_000 };
  const active = setup({ saved: savedGame(['e4', 'e5']), now });
  clickRegistration(active);
  assert.equal(active.document.querySelector('#new-game-countdown').hidden, true);
  assert.equal(JSON.parse(active.window.localStorage.getItem('shahmat.guest-game.v1')).newGameAt, undefined);
  active.window.close();

  const app = setup({ saved: savedGame(finishedMoves), now });
  assert.equal(app.game.isCheckmate(), true);
  assert.equal(app.document.querySelector('#new-game-countdown').hidden, true);
  assert.equal(app.document.querySelector('#new-game').getAttribute('href'), '/login?mode=signup');
  clickRegistration(app);
  let saved = JSON.parse(app.window.localStorage.getItem('shahmat.guest-game.v1'));
  assert.equal(saved.newGameAt, now.value + 3_600_000);
  assert.deepEqual(saved.moves, finishedMoves);
  assert.equal(app.document.querySelector('#new-game-countdown').textContent, '60:00 до новой партии');
  now.value += 10_000;
  app.window.document.dispatchEvent(new app.window.Event('visibilitychange'));
  assert.equal(app.document.querySelector('#new-game-countdown').textContent, '59:50 до новой партии');
  clickRegistration(app);
  saved = JSON.parse(app.window.localStorage.getItem('shahmat.guest-game.v1'));
  assert.equal(saved.newGameAt, 4_600_000);
  app.window.close();
});

test('countdown survives reload and resets board at deadline, including after page was closed', () => {
  const now = { value: 2_000_000 };
  const app = setup({ saved: savedGame(finishedMoves, now.value + 10_000), now });
  assert.equal(app.document.querySelector('#new-game-countdown').textContent, '00:10 до новой партии');
  assert.deepEqual(app.game.history(), finishedMoves);
  now.value += 10_000;
  app.window.document.dispatchEvent(new app.window.Event('visibilitychange'));
  assert.deepEqual(app.game.history(), []);
  assert.equal(app.document.querySelector('#new-game-countdown').hidden, true);
  assert.deepEqual(JSON.parse(app.window.localStorage.getItem('shahmat.guest-game.v1')).moves, []);
  app.window.close();

  const expired = setup({ saved: savedGame(finishedMoves, now.value - 1), now });
  assert.deepEqual(expired.game.history(), []);
  assert.equal(expired.document.querySelector('#status').textContent, 'Ваш ход.');
  expired.window.close();
});

test('draw countdown and back-forward cache reconcile with stored state', () => {
  const now = { value: 3_000_000 };
  const moves = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'];
  const app = setup({ saved: savedGame(moves), now });
  clickRegistration(app);
  assert.equal(app.document.querySelector('#new-game-countdown').textContent, '60:00 до новой партии');
  app.window.localStorage.setItem('shahmat.guest-game.v1', savedGame(finishedMoves, now.value + 50_000));
  app.window.dispatchEvent(new app.window.PageTransitionEvent('pageshow', { persisted: true }));
  assert.deepEqual(app.game.history(), finishedMoves);
  assert.equal(app.document.querySelector('#new-game-countdown').textContent, '00:50 до новой партии');
  app.window.localStorage.setItem('shahmat.guest-game.v1', savedGame(['e4', 'e5']));
  app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: 'shahmat.guest-game.v1' }));
  assert.deepEqual(app.game.history(), ['e4', 'e5']);
  assert.equal(app.document.querySelector('#new-game-countdown').hidden, true);
  app.window.close();
});

test('unfinished game ignores stale countdown and member games never start one', () => {
  const now = { value: 1_000_000 };
  const guest = setup({ saved: savedGame(['e4', 'e5'], now.value - 1), now });
  assert.deepEqual(guest.game.history(), ['e4', 'e5']);
  assert.equal(guest.document.querySelector('#new-game-countdown').hidden, true);
  guest.window.close();
  const member = setup({ memberId: 'user-1', saved: savedGame(finishedMoves, now.value - 1), now });
  assert.equal(member.game.isCheckmate(), true);
  member.document.querySelector('#new-game').click();
  assert.deepEqual(member.game.history(), []);
  member.window.close();
});


test('black side starts with bot move, persists orientation, allows black moves and reports mate', async () => {
  const app = setup({ random: 0.9 });
  assert.equal(app.document.querySelector('#player-color').textContent, 'Чёрные');
  assert.match(app.document.querySelector('#player-avatar').getAttribute('src'), /\/bN\.svg$/);
  assert.match(app.document.querySelector('#bot-avatar').getAttribute('src'), /\/wN\.svg$/);
  assert.equal(app.document.querySelector('#bot-color').textContent, 'Белые');
  assert.equal(app.document.querySelector('#board').firstElementChild.dataset.square, 'h1');
  assert.equal(app.document.querySelector('#status').textContent, 'Бот думает…');
  assert.equal(JSON.parse(app.window.localStorage.getItem('shahmat.guest-game.v1')).playerColor, 'b');
  await delay(800);
  assert.equal(app.game.history().length, 1);
  assert.equal(app.game.turn(), 'b');
  app.click('e7'); assert.ok(app.document.querySelector('[data-square=e5]').classList.contains('possible'));
  app.click('e5'); assert.equal(app.game.history().length, 2);
  const saved = app.window.localStorage.getItem('shahmat.guest-game.v1'); app.window.close();
  const restored = setup({ saved, random: 0.1 });
  assert.equal(restored.document.querySelector('#player-color').textContent, 'Чёрные');
  assert.equal(restored.document.querySelector('#board').firstElementChild.dataset.square, 'h1');
  restored.window.close();
  const mate = setup({ saved: JSON.stringify({ version: 1, playerColor: 'b', moves: ['f3', 'e5', 'g4', 'Qh4#'] }) });
  assert.equal(mate.document.querySelector('#status').textContent, 'Мат. Вы победили!');
  mate.window.close();
});


test('expired game with black side schedules only one opening bot move', async () => {
  const now = { value: 1_000_000 };
  const app = setup({ saved: savedGame(finishedMoves, now.value - 1), now, random: 0.9 });
  assert.equal(app.document.querySelector('#player-color').textContent, 'Чёрные');
  await delay(900);
  assert.equal(app.game.history().length, 1);
  assert.equal(app.game.turn(), 'b');
  app.window.close();
});


test('guest premove anticipates a pawn capture and executes after the bot reply', async () => {
 const app=setup({botMove:()=>({from:'d7',to:'d5'})});
 app.click('e2');app.click('e4');app.click('e4');app.click('d5');
 assert.ok(app.document.querySelector('[data-square=d5]').classList.contains('premove'));
 await delay(650);
 assert.equal(app.game.get('d5').color,'w');assert.equal(app.game.get('d5').type,'p');
 assert.deepEqual(app.game.history().slice(0,3),['e4','d5','exd5']);
 app.window.close();
});

test('guest player strips show captures for the appropriate side', () => {
  const { document, game, render, window } = setup();
  for (const move of ['e4', 'd5', 'exd5', 'Qxd5']) game.move(move);
  render();
  assert.equal(document.querySelectorAll('#guest-player-captured img').length, 1);
  assert.equal(document.querySelectorAll('#guest-bot-captured img').length, 1);
  window.close();
});
