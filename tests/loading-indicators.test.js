import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installLoadingIndicators} from '../pages/loading-indicators.js';
const slot=kind=>`<span class="particle-loading" data-loading="${kind}" hidden><canvas></canvas></span>`;
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
test('loading states reuse the search canvas and stop when hidden or removed',async()=>{
  const dom=new JSDOM(`<main><section id="page">${slot('page')}</section><div id="profile" hidden>${slot('profile')}</div><div class="rating-board" aria-busy="false"><div>${slot('rating')}<p class="rating-status" hidden></p></div></div><div>${slot('status')}<p id="status"></p></div></main>`,{pretendToBeVisual:true,url:'https://example.com'});
  const {window:win}=dom,doc=win.document;
  win.matchMedia=()=>({matches:true});win.HTMLCanvasElement.prototype.getContext=()=>null;
  const manager=installLoadingIndicators(doc),query=k=>doc.querySelector(`[data-loading=${k}]`);
  assert.equal(query('page').hidden,false);assert.equal(query('profile').hidden,true);assert.equal(query('rating').hidden,true);assert.equal(query('status').hidden,true);
  doc.querySelector('#profile').hidden=false;doc.querySelector('.rating-status').hidden=false;doc.querySelector('.rating-board').setAttribute('aria-busy','true');doc.querySelector('#status').classList.add('is-loading');await tick();
  assert.equal(query('profile').hidden,false);assert.equal(query('rating').hidden,false);assert.equal(query('status').hidden,false);
  doc.querySelector('#status').textContent='Loading…';await tick();assert.equal(query('status').hidden,false,'status text replacement keeps canvas');
  doc.querySelector('.rating-board').setAttribute('aria-busy','false');doc.querySelector('#profile').hidden=true;doc.querySelector('#status').classList.remove('is-loading');await tick();
  assert.equal(query('profile').hidden,true);assert.equal(query('rating').hidden,true);assert.equal(query('status').hidden,true);
  doc.querySelector('#page').remove();await tick();manager.destroy();dom.window.close();
});

test('embedded views suspend loaders until shown and stop when hidden',async()=>{
  const dom=new JSDOM(`<div>${slot('status')}<p class="is-loading"></p></div>`,{pretendToBeVisual:true,url:'https://example.com'}),win=dom.window;
  const parent={};Object.defineProperty(win,'parent',{value:parent});win.matchMedia=()=>({matches:true});win.HTMLCanvasElement.prototype.getContext=()=>null;
  const manager=installLoadingIndicators(win.document,{embeddedFrame:true}),el=win.document.querySelector('.particle-loading');
  assert.equal(el.hidden,true);
  win.dispatchEvent(new win.MessageEvent('message',{origin:win.location.origin,source:parent,data:{type:'shahmat-watch-shown'}}));assert.equal(el.hidden,false);
  win.dispatchEvent(new win.MessageEvent('message',{origin:win.location.origin,source:parent,data:{type:'shahmat-watch-hidden'}}));assert.equal(el.hidden,true);
  manager.destroy();dom.window.close();
});
