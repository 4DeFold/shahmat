import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Chess } from 'chess.js';
import { createMemberBoard } from '../pages/member-board.js';

function setup(reduced = false) {
  const dom = new JSDOM('<div id="board"></div>', { pretendToBeVisual: true });
  const board = dom.window.document.querySelector('#board'), animations = [];
  Object.defineProperty(board, 'clientWidth', { value: 400 });
  dom.window.Element.prototype.animate = function(keyframes, timing) {
    const anim = { keyframes, timing, finished: Promise.resolve(), cancel() {} };
    animations.push(anim); return anim;
  };
  const view = createMemberBoard({ document:dom.window.document, board, reducedMotion:() => reduced });
  return { dom, board, view, animations };
}
const update = (view, shown, animatedMove = null, selected = null, legal = []) => view.render({ shown, selected, legal, premove:null, last:animatedMove, animatedMove });

test('board retains cells and moving image; only the move is animated', () => {
  const { dom, board, view, animations } = setup(), chess = new Chess();
  update(view, chess); const cell = view.cell('e2'), target = view.cell('e4'), piece = cell.querySelector('img'), neighbor = view.cell('d2').querySelector('img');
  update(view, chess, null, 'e2', ['e4']);
  assert.equal(view.cell('e2'), cell); assert.equal(view.cell('e4'), target); assert.equal(cell.querySelector('img'), piece);
  const move = chess.move('e4'); update(view, chess, move);
  assert.equal(target.querySelector('img'), piece); assert.equal(view.cell('d2').querySelector('img'), neighbor);
  assert.equal(board.querySelectorAll('.square').length, 64); assert.equal(animations.length, 1);
  assert.equal(animations[0].keyframes[0].translate, '0px 100px');
  assert.equal(animations[0].keyframes[1].translate, '0px 0px'); assert.ok(animations[0].timing.duration < 250);
  update(view, chess, null, 'd2', ['d4']); assert.equal(animations.length, 1, 'selection does not restart the motion');
  dom.window.close();
});

test('capture, en passant, castling and promotion keep the position correct', () => {
  const { dom, board, view } = setup(), chess = new Chess();
  for (const san of ['e4','d5','exd5']) { update(view, chess); const move = chess.move(san); update(view, chess, move); }
  assert.equal(view.cell('d5').querySelector('img').getAttribute('src'), '/pieces/cburnett/wP.svg');
  assert.equal(board.querySelectorAll('.piece').length, 31);
  const ep = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'); update(view, ep);
  update(view, ep, ep.move('exd6')); assert.equal(view.cell('d5').querySelector('.piece'), null);
  const castle = new Chess('4k3/8/8/8/8/8/8/4K2R w K - 0 1'); update(view, castle);
  const king = view.cell('e1').querySelector('img'), rook = view.cell('h1').querySelector('img');
  update(view, castle, castle.move('O-O')); assert.equal(view.cell('g1').querySelector('img'), king); assert.equal(view.cell('f1').querySelector('img'), rook);
  const promotion = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1'); update(view, promotion);
  update(view, promotion, promotion.move('a8=Q+')); assert.equal(view.cell('a8').querySelector('img').getAttribute('src'), '/pieces/cburnett/wQ.svg');
  dom.window.close();
});

test('reduced motion disables movement and blur', () => {
  const { dom, view, animations } = setup(true), chess = new Chess(); update(view, chess);
  update(view, chess, chess.move('e4')); assert.equal(animations.length, 0); dom.window.close();
});

test('history jumps move original surviving piece nodes atomically, even to occupied squares', async () => {
  const {historyTransition}=await import('../pages/move-history.js');
  const {dom,view,animations}=setup(),chess=new Chess();
  update(view,chess);const king=view.cell('e1').querySelector('.piece'),knight=view.cell('g1').querySelector('.piece'),rook=view.cell('h1').querySelector('.piece'),bishop=view.cell('f1').querySelector('.piece');
  ['e4','e5','Nf3','Nc6','Bc4','Nf6','O-O'].forEach(m=>chess.move(m));
  view.render({shown:chess,transitions:historyTransition(chess,0,7)});
  assert.equal(view.cell('g1').querySelector('.piece'),king);assert.equal(view.cell('f3').querySelector('.piece'),knight);
  assert.equal(view.cell('f1').querySelector('.piece'),rook);assert.equal(view.cell('c4').querySelector('.piece'),bishop);
  assert.equal(animations.length,historyTransition(chess,0,7).length);
  view.render({shown:new Chess(),transitions:historyTransition(chess,7,0)});
  assert.equal(view.cell('e1').querySelector('.piece'),king);assert.equal(view.cell('g1').querySelector('.piece'),knight);
  assert.equal(view.cell('h1').querySelector('.piece'),rook);assert.equal(view.cell('f1').querySelector('.piece'),bishop);
  dom.window.close();
});
