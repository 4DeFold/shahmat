import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createBoardAnnotations} from '../pages/board-annotations.js';
function setup(){
 const dom=new JSDOM('<div id="board"></div>',{pretendToBeVisual:true});const doc=dom.window.document,board=doc.querySelector('#board');
 for(let r=8;r>=1;r--)for(const f of 'abcdefgh'){const el=doc.createElement('button');el.dataset.square=f+r;board.append(el);}
 const tool=createBoardAnnotations({document:doc,board});
 const event=(square,type,opts={})=>{const ev=new dom.window.MouseEvent(type,{bubbles:true,button:2,...opts});Object.defineProperty(ev,'pointerId',{value:1});board.querySelector(`[data-square=${square}]`).dispatchEvent(ev);};
 return {dom,doc,board,tool,event};
}
test('right-drag toggles arrows, clicks mark squares, colors, clearing and disposal',()=>{
 const {dom,doc,board,tool,event}=setup();
 event('e2','pointerdown');event('e4','pointermove');assert.equal(board.querySelectorAll('.annotation-preview').length,1);event('e4','pointerup');
 const line=board.querySelector('[data-annotation="e2-e4"] line');assert.equal(line.getAttribute('x1'),'450');assert.equal(line.getAttribute('y1'),'650');assert.equal(line.getAttribute('stroke'),'#15781B');assert.equal(line.getAttribute('stroke-opacity'),'.55');assert.equal(board.querySelector('[data-annotation="e2-e4"] polygon').getAttribute('fill-opacity'),'.55');
 event('e2','pointerdown');event('e4','pointerup');assert.equal(board.querySelectorAll('.annotation-item').length,0);
 event('d5','pointerdown',{shiftKey:true});event('d5','pointerup');assert.equal(board.querySelector('circle').getAttribute('stroke'),'#882020');
 tool.refresh();assert.equal(board.querySelectorAll('circle').length,1);
 event('e2','pointerdown',{button:0});assert.equal(board.querySelectorAll('.annotation-item').length,0);
 event('a1','pointerdown');event('a1','pointerup');doc.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(board.querySelectorAll('.annotation-item').length,0);
 const menu=new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true});board.dispatchEvent(menu);assert.ok(menu.defaultPrevented);
 tool.destroy();assert.equal(board.querySelector('svg'),null);dom.window.close();
});

test('colors replace the same shape, and disabled boards cannot draw',()=>{
 const {board,tool,event}=setup();
 event('e2','pointerdown');event('e4','pointerup');
 event('e2','pointerdown',{shiftKey:true,altKey:true});event('e4','pointerup');
 assert.equal(board.querySelectorAll('.annotation-item').length,1);
 assert.equal(board.querySelector('line').getAttribute('stroke'),'#e68f00');
 event('e2','pointerdown',{shiftKey:true,altKey:true});event('e4','pointerup');assert.equal(board.querySelectorAll('.annotation-item').length,0);
 tool.destroy(); const disabled=createBoardAnnotations({document:board.ownerDocument,board,enabled:()=>false});
 event('a1','pointerdown');event('a1','pointerup');assert.equal(board.querySelectorAll('.annotation-item').length,0);disabled.destroy();
});
