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
