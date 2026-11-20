import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {installInteractionSounds} from '../pages/interaction-sounds.js';
test('delegated quiet effects cover dynamic controls once without doubling board and history sounds',()=>{
 const dom=new JSDOM('<button id="b">Button</button><label id="l">Choice<input type="radio"></label><button id="off" disabled>disabled</button><div class="board"><button id="sq">board</button></div><div class="history-controls"><button id="history">prev</button></div>',{pretendToBeVisual:true});const {window:w}=dom,plays=[];
 w.Audio=class{constructor(src){this.src=src;}load(){}pause(){}addEventListener(){}cloneNode(){return new w.Audio(this.src);}play(){plays.push({src:this.src,volume:this.volume});return Promise.resolve();}};
 const cleanup=installInteractionSounds(w.document,w),click=id=>w.document.getElementById(id).click();
 click('b');click('l');click('off');click('sq');click('history');assert.equal(plays.length,2);assert.ok(plays.every(x=>x.volume<=.15));
 const dynamic=w.document.createElement('button');w.document.body.append(dynamic);dynamic.click();assert.equal(plays.length,3);
 cleanup();dynamic.click();assert.equal(plays.length,3);dom.window.close();
});
