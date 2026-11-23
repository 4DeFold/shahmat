import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Chess} from 'chess.js';
import {renderCaptures} from '../pages/board-insights.js';

test('captured piece flies from board to strip and is cancelled on history rewind', async()=>{
 const dom=new JSDOM('<div id="board"><div data-square="d5"></div></div><div id="white"></div><div id="black"></div>',{pretendToBeVisual:true}),w=dom.window,d=w.document;
 w.matchMedia=()=>({matches:false}); w.Element.prototype.getBoundingClientRect=function(){return this.matches('[data-square]')?{left:100,top:100,width:50,height:50}:{left:200,top:200,width:15,height:15};};
 let cancelled=false;w.Element.prototype.animate=()=>({finished:new Promise(()=>{}),cancel(){cancelled=true;}});
 const board=d.querySelector('#board'),white=d.querySelector('#white'),black=d.querySelector('#black'),game=new Chess();
 game.move('e4');game.move('d5');renderCaptures(game,'w',white,black,{board});
 const move=game.move('exd5');renderCaptures(game,'w',white,black,{board,move});
 assert.equal(d.querySelectorAll('.capture-flight').length,1);assert.equal(white.querySelector('img').style.opacity,'0');
 game.undo();renderCaptures(game,'w',white,black,{board});
 assert.equal(cancelled,true);assert.equal(d.querySelector('.capture-flight'),null);assert.equal(white.querySelectorAll('img').length,0);
 dom.window.close();
});

test('reduced motion shows captured piece without flight',()=>{
 const dom=new JSDOM('<div id="board"></div><div id="white"></div><div id="black"></div>'),w=dom.window,d=w.document;
 w.matchMedia=()=>({matches:true});const game=new Chess(),board=d.querySelector('#board'),white=d.querySelector('#white'),black=d.querySelector('#black');
 game.move('e4');game.move('d5');renderCaptures(game,'w',white,black,{board});const move=game.move('exd5');renderCaptures(game,'w',white,black,{board,move});
 assert.equal(d.querySelector('.capture-flight'),null);assert.equal(white.querySelectorAll('img').length,1);dom.window.close();
});

test('reverse capture flies to the restored square and cancels cleanly, including en passant',()=>{
 for(const enPassant of [false,true]){
  const dom=new JSDOM('<div id="board"><div data-square="d5"><img class="piece"></div><div data-square="d6"><img class="piece"></div></div><div id="white"></div><div id="black"></div>',{pretendToBeVisual:true}),w=dom.window,d=w.document;
  w.matchMedia=()=>({matches:false});let stopped=0,frames=[];
  w.Element.prototype.getBoundingClientRect=function(){return this.closest('[data-square=d5]')?{left:100,top:100,width:50,height:50}:this.closest('[data-square=d6]')?{left:300,top:300,width:50,height:50}:{left:200,top:200,width:15,height:15};};
  w.Element.prototype.animate=function(k){frames.push(k);return {finished:new Promise(()=>{}),cancel(){stopped++}}};
  const board=d.querySelector('#board'),white=d.querySelector('#white'),black=d.querySelector('#black'),game=new Chess();
  for(const move of (enPassant?['e4','a6','e5','d5']:['e4','d5']))game.move(move);
  renderCaptures(game,'w',white,black,{board});const move=game.move(enPassant?'exd6':'exd5');renderCaptures(game,'w',white,black,{board,move});
  game.undo();renderCaptures(game,'w',white,black,{board,move,direction:'backward'});
  const restored=board.querySelector('[data-square=d5] .piece');assert.equal(restored.style.opacity,'0');assert.equal(white.querySelectorAll('img').length,0);
  assert.match(frames.at(-1)[1].transform,/translate3d\(-100px,-100px,0\)/);
  game.move(enPassant?'exd6':'exd5');renderCaptures(game,'w',white,black,{board,move});
  assert.equal(restored.style.opacity,'');assert.equal(d.querySelectorAll('.capture-flight').length,1);assert.equal(stopped,2);
  dom.window.close();
 }
});

test('reduced motion skips reverse capture flight',()=>{
 const dom=new JSDOM('<div id="board"><div data-square="d5"><img class="piece"></div></div><div id="white"></div><div id="black"></div>'),w=dom.window,d=w.document;
 w.matchMedia=()=>({matches:true});const game=new Chess(),board=d.querySelector('#board'),white=d.querySelector('#white'),black=d.querySelector('#black');
 game.move('e4');game.move('d5');renderCaptures(game,'w',white,black,{board});const move=game.move('exd5');renderCaptures(game,'w',white,black,{board,move});game.undo();renderCaptures(game,'w',white,black,{board,move,direction:'backward'});
 assert.equal(d.querySelector('.capture-flight'),null);assert.equal(board.querySelector('.piece').style.opacity,'');dom.window.close();
});
