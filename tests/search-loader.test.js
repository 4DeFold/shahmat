import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createSearchLoader,knightTour,tourPoint} from '../pages/search-loader.js';
test('matchmaking loader reproduces a closed 64-square knight tour without a grid', async()=>{
 const doc=new JSDOM(await readFile('pages/game.html','utf8')).window.document;
 const loader=doc.querySelector('#search-loader');assert.ok(loader.hidden);assert.ok(loader.querySelector('canvas'));assert.equal(loader.querySelector('svg'),null);
 assert.equal(knightTour.length,65);assert.equal(knightTour[0],knightTour.at(-1));assert.equal(new Set(knightTour.slice(0,-1)).size,64);
 for(let i=1;i<knightTour.length;i++){const a=knightTour[i-1],b=knightTour[i];assert.deepEqual([Math.abs(a%8-b%8),Math.abs(Math.floor(a/8)-Math.floor(b/8))].sort(),[1,2]);}
 assert.deepEqual(tourPoint(0),{x:.5,y:.5});assert.deepEqual(tourPoint(64),tourPoint(0));assert.deepEqual(tourPoint(-1),tourPoint(63));
});

test('loader exit is cancellable and reduced motion hides immediately',()=>{
 const dom=new JSDOM('<div hidden><canvas></canvas></div>'),el=dom.window.document.querySelector('div');
 let reduced=false, timer;
 const win={matchMedia:()=>({matches:reduced}),setTimeout:fn=>(timer=fn,1),clearTimeout:()=>{timer=null;},requestAnimationFrame:()=>2,cancelAnimationFrame:()=>{},getComputedStyle:()=>({getPropertyValue:()=>''})};
 el.querySelector('canvas').getContext=()=>null;
 const loader=createSearchLoader(el,win);loader.setVisible(true);assert.equal(el.hidden,false);assert.ok(el.classList.contains('is-visible'));
 loader.setVisible(false);assert.equal(el.hidden,false);assert.ok(timer);loader.setVisible(true);assert.equal(timer,null);assert.equal(el.hidden,false);assert.ok(el.classList.contains('is-visible'));
 reduced=true;loader.setVisible(false);assert.equal(el.hidden,true);loader.destroy();
});
