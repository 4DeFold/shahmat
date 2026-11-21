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
 const path=knightTour.slice(0,-1).map((_,i)=>tourPoint(i));assert.equal(Math.min(...path.map(p=>p.x)),.5);assert.equal(Math.max(...path.map(p=>p.x)),7.5);assert.equal(Math.min(...path.map(p=>p.y)),.5);assert.equal(Math.max(...path.map(p=>p.y)),7.5);
 assert.deepEqual(tourPoint(0),{x:.5,y:.5});assert.deepEqual(tourPoint(64),tourPoint(0));assert.deepEqual(tourPoint(-1),tourPoint(63));
});

test('loader exit is cancellable and reduced motion hides immediately',()=>{
 const dom=new JSDOM('<div hidden><canvas></canvas></div>'),el=dom.window.document.querySelector('div');
 let reduced=false, timer;
 const win={matchMedia:()=>({get matches(){return reduced;}}),setTimeout:fn=>(timer=fn,1),clearTimeout:()=>{timer=null;},requestAnimationFrame:()=>2,cancelAnimationFrame:()=>{},getComputedStyle:()=>({getPropertyValue:()=>''})};
 el.querySelector('canvas').getContext=()=>null;
 const loader=createSearchLoader(el,win);loader.setVisible(true);assert.equal(el.hidden,false);assert.ok(el.classList.contains('is-visible'));
 loader.setVisible(false);assert.equal(el.hidden,false);assert.ok(timer);loader.setVisible(true);assert.equal(timer,null);assert.equal(el.hidden,false);assert.ok(el.classList.contains('is-visible'));
 reduced=true;loader.setVisible(false);assert.equal(el.hidden,true);loader.destroy();
});
test('trails use smooth gradients along the tour and particles move faster',()=>{
 const dom=new JSDOM('<div hidden><canvas></canvas></div>'), el=dom.window.document.querySelector('div'), original=el.querySelector('canvas');
 const dots=[],gradients=[];
 const canvasContext=(isMask)=>({
  setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},fillRect(){},drawImage(){},
  arc(x,y,r){if(!isMask&&r===.095)dots.push({x,y});},
  createLinearGradient(){const stops=[];gradients.push(stops);return {addColorStop(position,color){stops.push([position,color]);}};}
 });
 const main=canvasContext(false),mask=canvasContext(true),create=dom.window.document.createElement.bind(dom.window.document);
 original.getContext=()=>main;Object.defineProperty(original,'clientWidth',{value:320});
 dom.window.document.createElement=(name)=>{const node=create(name);if(name==='canvas')node.getContext=()=>mask;return node;};
 let next;const win={matchMedia:()=>({matches:false}),devicePixelRatio:1,getComputedStyle:()=>({getPropertyValue:()=>''}),requestAnimationFrame:fn=>(next=fn,1),cancelAnimationFrame(){},setTimeout(){},clearTimeout(){}};
 const loader=createSearchLoader(el,win);loader.setVisible(true);next(0);next(1000);
 assert.deepEqual(dots[0],tourPoint(0));assert.equal(dots.length,2);assert.deepEqual(dots[1],tourPoint(15));
 assert.equal(gradients.length,28);assert.ok(gradients.every(stops=>stops.length===9));
 loader.destroy();
});
test('changing reduced motion while visible stops and resumes animation',()=>{
 const dom=new JSDOM('<div hidden><canvas></canvas></div>'),el=dom.window.document.querySelector('div'),canvas=el.querySelector('canvas');
 const ctx={setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},fillRect(){},drawImage(){},arc(){},createLinearGradient(){return {addColorStop(){}};}};
 canvas.getContext=()=>ctx;Object.defineProperty(canvas,'clientWidth',{value:100});
 const create=dom.window.document.createElement.bind(dom.window.document);dom.window.document.createElement=name=>{const node=create(name);if(name==='canvas')node.getContext=()=>ctx;return node;};
 let change,next,id=0,cancelled=0;const motion={matches:false,addEventListener(_,fn){change=fn},removeEventListener(){change=null}};
 const win={matchMedia:()=>motion,devicePixelRatio:1,getComputedStyle:()=>({getPropertyValue:()=>''}),requestAnimationFrame:fn=>(next=fn,++id),cancelAnimationFrame(){cancelled++},setTimeout(){},clearTimeout(){}};
 const loader=createSearchLoader(el,win);loader.setVisible(true);next(0);assert.equal(id,2);
 motion.matches=true;change();assert.equal(cancelled,1);next(10);assert.equal(id,3,'static frame is not rescheduled');
 motion.matches=false;change();next(20);assert.equal(id,5,'animation resumes');loader.destroy();assert.equal(change,null);
});
