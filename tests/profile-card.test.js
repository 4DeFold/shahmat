import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createProfileCard} from '../pages/profile-card.js';
test('hover card opens the shown player on click and from the keyboard', async t=>{
 const dom=new JSDOM('<main><button data-profile-name="Alice">Alice</button><button data-profile-name="Bob">Bob</button></main>',{url:'https://example.com'});
 t.after(()=>dom.window.close()); const doc=dom.window.document, opened=[];
 const widget=createProfileCard(doc.querySelector('main'),{rpc:async(_n,{p_name})=>({data:{username:p_name,bio:''}})},name=>opened.push(name));
 const [alice,bob]=doc.querySelectorAll('button');
 alice.dispatchEvent(new dom.window.MouseEvent('pointerover',{bubbles:true})); await Promise.resolve();
 const card=doc.querySelector('.player-mini-card'); assert.equal(card.hidden,false); assert.equal(card.querySelector('.player-mini-bio').hidden,true);
 card.click(); assert.deepEqual(opened,['Alice']); assert.equal(card.hidden,true);
 bob.focus(); await Promise.resolve(); assert.equal(card.hidden,false); card.focus();
 card.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 assert.deepEqual(opened,['Alice','Bob']); assert.equal(card.hidden,true); widget.destroy();
});
test('card loads the right avatar, shows loader, and ignores stale responses',async t=>{
 const dom=new JSDOM('<main><button data-profile-name="Alice">Alice</button><button data-profile-name="Bob">Bob</button></main>',{url:'https://example.com',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const doc=dom.window.document;dom.window.matchMedia=()=>({matches:true});dom.window.HTMLCanvasElement.prototype.getContext=()=>null;
 const pending={};const widget=createProfileCard(doc.querySelector('main'),{rpc:(_,{p_name})=>new Promise(resolve=>pending[p_name]=resolve)});
 const [alice,bob]=doc.querySelectorAll('button');alice.dispatchEvent(new dom.window.MouseEvent('pointerover',{bubbles:true}));const card=doc.querySelector('.player-mini-card');assert.equal(card.getAttribute('aria-busy'),'true');assert.equal(card.querySelector('.player-mini-loading').hidden,false);
 bob.dispatchEvent(new dom.window.MouseEvent('pointerover',{bubbles:true}));pending.Alice({data:{username:'Alice',piece_set:'merida'}});await Promise.resolve();assert.equal(card.getAttribute('aria-busy'),'true');
 pending.Bob({data:{username:'Bob',piece_set:'chessnut'}});await Promise.resolve();assert.equal(card.querySelector('.player-mini-name').textContent,'Bob');assert.match(card.querySelector('.player-mini-avatar img').src,/\/pieces\/chessnut\/wN\.svg$/);assert.equal(card.querySelector('.player-mini-loading').hidden,true);assert.equal(card.getAttribute('aria-busy'),'false');
 card.querySelector('.player-mini-avatar img').dispatchEvent(new dom.window.Event('error'));assert.match(card.querySelector('.player-mini-avatar img').src,/\/pieces\/cburnett\/wN\.svg$/);widget.destroy();
});
