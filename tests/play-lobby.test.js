import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {Chess} from 'chess.js';
import {createPlayLobby,lastThree,controls} from '../pages/play-lobby.js';
const html=await readFile('pages/game.html','utf8');
test('demo validates real mates and exposes exactly the final three plies',()=>{
 const moves=['f3','e5','g4','Qh4#'], last=lastThree(moves);
 assert.deepEqual(last.moves,['e5','g4','Qh4#']);const chess=new Chess(last.fen);for(const move of last.moves)chess.move(move);assert.equal(chess.isCheckmate(),true);
 assert.equal(lastThree(['e4','e5','Nf3']),null);assert.equal(lastThree(['invalid','e5','Qh4#']),null);
});
test('lobby steps preserve kind and exact time; custom is disabled and back works',async()=>{
 const dom=new JSDOM(html,{url:'https://example.com',pretendToBeVisual:true});let selected;
 const lobby=createPlayLobby({document:dom.window.document,client:{rpc:async()=>({data:[{moves:['f3','e5','g4','Qh4#']}]})},onChoose:value=>{selected=value;return true;}});
 try{
  await lobby.activate();const d=dom.window.document;
  assert.equal(d.querySelectorAll('.kind-card').length,2);
  d.querySelector('[data-kind=friendly]').click();assert.equal(d.querySelectorAll('.choice-card').length,5);assert.equal(d.querySelector('.choice-card:disabled').textContent.includes('Кастом'),true);
  d.querySelectorAll('.choice-card')[1].click();assert.equal(d.querySelectorAll('.time-card').length,4);assert.deepEqual(controls.blitz,['3+0','3+2','5+0','5+3']);
  d.getElementById('lobby-back').click();assert.equal(d.querySelectorAll('.choice-card').length,5);
  d.querySelectorAll('.choice-card')[1].click();d.querySelectorAll('.time-card')[1].click();
  assert.deepEqual(selected,{kind:'friendly',mode:'blitz',timeControl:'3+2'});assert.equal(d.getElementById('play-lobby').hidden,true);
 } finally {lobby.destroy();dom.window.close();}
});

test('live pool counts aggregate by kind, mode and control and poll every two seconds',async()=>{
 const dom=new JSDOM(html,{url:'https://example.com',pretendToBeVisual:true}),w=dom.window,d=w.document;
 let tick, interval,requests=0,rows=[{game_kind:'rated',mode:'blitz',time_control:'3',online:2},{game_kind:'rated',mode:'blitz',time_control:'3+2',online:3},{game_kind:'friendly',mode:'rapid',time_control:'10',online:4}];
 w.matchMedia=()=>({matches:true});w.setInterval=(fn,ms)=>{tick=fn;interval=ms;return 1};w.clearInterval=()=>{tick=null};
 const lobby=createPlayLobby({document:d,client:{rpc:async name=>name==='play_demo_games'?{data:[]}:(requests++,{data:rows})},onChoose:()=>true});
 const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
 try {
  await lobby.activate();await flush();assert.equal(interval,2000);assert.equal(requests,1);
  assert.deepEqual([...d.querySelectorAll('.lobby-online-value')].map(x=>x.textContent),['4','5']);
  d.querySelector('[data-kind=rated]').click();assert.deepEqual([...d.querySelectorAll('.lobby-online-value')].map(x=>x.textContent),['0','5','0','0','0']);
  d.querySelectorAll('.choice-card')[1].click();assert.deepEqual([...d.querySelectorAll('.lobby-online-value')].map(x=>x.textContent),['2','3','0','0']);
  rows=[{game_kind:'rated',mode:'blitz',time_control:'3',online:7}];tick();await flush();assert.deepEqual([...d.querySelectorAll('.lobby-online-value')].map(x=>x.textContent),['7','0','0','0']);
  lobby.setVisible(false);assert.equal(tick,null);lobby.setVisible(true);await flush();assert.equal(requests,3);
  lobby.openBoard();assert.equal(tick,null);
 }finally{lobby.destroy();w.close();}
});

test('mate highlights the losing king in the real replay',async()=>{
 const dom=new JSDOM(html,{url:'https://example.com',pretendToBeVisual:true}),w=dom.window,d=w.document;let jobs=[];
 w.setTimeout=(fn,delay)=>{jobs.push(fn);return jobs.length};w.clearTimeout=()=>{};
 const lobby=createPlayLobby({document:d,client:{rpc:async name=>({data:name==='play_demo_games'?[{moves:['f3','e5','g4','Qh4#']}]:[]})},onChoose:()=>true});
 try {await lobby.activate();for(let i=0;i<3;i++){const fn=jobs.shift();fn();} // jobs alternate between cards; advance all until mate
  for(let i=0;i<4;i++){const fn=jobs.shift();fn();}
  assert.ok(d.querySelector('.demo-square.check img[src$="/wK.svg"]'));
 }finally{lobby.destroy();w.close()}
});

test('online count animates from its visible value, supports interruptions and reduced motion',async()=>{
 const {createOnlineCount}=await import('../pages/play-lobby.js');const d=new JSDOM('<span></span>').window.document,el=d.querySelector('span');let callbacks=[],reduce=false;
 const win={matchMedia:()=>({matches:reduce}),requestAnimationFrame:cb=>(callbacks.push(cb),callbacks.length),cancelAnimationFrame:()=>{callbacks=[]}};
 const c=createOnlineCount(el,win);c.set(5);assert.equal(el.textContent,'5');c.set(15);callbacks.shift()(0);callbacks.shift()(450);assert.equal(el.textContent,'14');
 c.set(20);callbacks.shift()(500);assert.equal(el.textContent,'14');callbacks.shift()(1400);assert.equal(el.textContent,'20');
 reduce=true;c.set(2);assert.equal(el.textContent,'2');c.set(null);assert.equal(el.textContent,'—');c.destroy();d.defaultView.close();
});

test('replay uses 0.5–3 second moves, one second at mate, then fades pieces to the next game',async()=>{
 const {demoMoveDelay}=await import('../pages/play-lobby.js');assert.equal(demoMoveDelay(()=>0),500);assert.equal(demoMoveDelay(()=>0.999999),3000);
 const dom=new JSDOM(html,{url:'https://example.com',pretendToBeVisual:true}),w=dom.window,d=w.document;
 let jobs=[],id=0;w.setTimeout=(fn,ms)=>{jobs.push({id:++id,fn,ms});return id};w.clearTimeout=n=>{jobs=jobs.filter(j=>j.id!==n)};
 const lobby=createPlayLobby({document:d,client:{rpc:async name=>({data:name==='play_demo_games'?[{moves:['f3','e5','g4','Qh4#']}]:[]})},onChoose:()=>true});
 try {
  await lobby.activate();assert.ok(jobs.every(job=>job.ms>=500&&job.ms<=3000));
  while(!d.querySelector('.demo-square.check')){const job=jobs.shift();assert.ok(job);job.fn();}
  const mate=jobs.findIndex(j=>j.ms===1000);assert.notEqual(mate,-1);
  const job=jobs.splice(mate,1)[0];job.fn();assert.ok(d.querySelector('.demo-board.demo-fading'));
  const fade=jobs.findIndex(j=>j.ms===360);assert.notEqual(fade,-1);jobs.splice(fade,1)[0].fn();
  assert.equal(d.querySelector('.demo-board.demo-fading'),null);
 }finally{lobby.destroy();w.close()}
});

test('selected card fans out, back gathers to the selected parent and back button fades away',async()=>{
 const dom=new JSDOM(html,{url:'https://example.com',pretendToBeVisual:true}),w=dom.window,d=w.document,records=[];
 w.matchMedia=()=>({matches:false});
 w.HTMLElement.prototype.animate=function(frames,options){const animation={cancel(){},onfinish:null};records.push({element:this,frames,options});return animation;};
 w.HTMLElement.prototype.getBoundingClientRect=function(){
  const parent=this.parentElement, index=parent?[...parent.children].indexOf(this):0;
  const left=this.dataset.kind==='rated'?500:this.classList.contains('choice-card')?100+index*120:100;
  const width=this.classList.contains('kind-card')?300:100, height=this.classList.contains('kind-card')?300:180,top=100;
  return {left,top,width,height,right:left+width,bottom:top+height};
 };
 const lobby=createPlayLobby({document:d,client:{rpc:async()=>({data:[]})},onChoose:()=>true});
 try{
  d.querySelector('#lobby-stage [data-kind=rated]').click();
  const ghost=d.querySelector('.lobby-ghost'),chosen=records.find(r=>r.element===ghost.querySelector('[data-kind=rated]'));
  const sibling=records.find(r=>r.element===ghost.querySelector('[data-kind=friendly]'));
  assert.match(chosen.frames.at(-1).transform,/scale\(1.13/);assert.match(sibling.frames.at(-1).filter,/blur/);
  const entering=records.find(r=>r.element===d.querySelector('#lobby-stage .choice-card'));
  assert.match(entering.frames[0].transform,/translate/);assert.ok(records.some(r=>r.element.id==='lobby-back'&&r.frames[0].opacity===0));
  d.querySelector('#lobby-stage [data-mode=blitz]').click();d.getElementById('lobby-back').click();
  const reverse=d.querySelector('.lobby-ghost'),reverseRecord=records.find(r=>r.element===reverse.firstElementChild);
  assert.equal(reverse.children.length,4);assert.match(reverseRecord.frames.at(-1).transform,/translate/);
  const target=d.querySelector('#lobby-stage [data-mode=blitz]');assert.ok(records.some(r=>r.element===target&&r.frames.length===3));
  d.getElementById('lobby-back').click();assert.equal(d.getElementById('lobby-back').hidden,true);
  assert.ok(d.querySelector('.lobby-back[aria-hidden=true]'));assert.equal(d.getElementById('lobby-nav'),null);
 }finally{lobby.destroy();w.close()}
});

test('specular edge and 3D tilt follow the pointer on every lobby stage',()=>{
 const dom=new JSDOM(html,{url:'https://example.com',pretendToBeVisual:true}),w=dom.window,d=w.document;
 w.matchMedia=()=>({matches:false});
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:100,top:100,right:300,bottom:300,width:200,height:200}};
 const lobby=createPlayLobby({document:d,client:{rpc:async()=>({data:[]})},onChoose:()=>true});
 try{
  for(const next of [null,()=>d.querySelector('[data-kind=rated]').click(),()=>d.querySelector('[data-mode=blitz]').click()]){
   next?.();const root=d.getElementById('play-lobby'),cards=[...d.querySelectorAll('#lobby-stage .lobby-card')];
   root.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:150,clientY:100}));
   for(const card of cards){assert.notEqual(card.style.getPropertyValue('--shine-angle'),'');assert.equal(card.style.getPropertyValue('--shine-opacity'),'1');assert.notEqual(card.style.getPropertyValue('--tilt-x'),'0deg');}
   root.dispatchEvent(new w.MouseEvent('pointerleave'));for(const card of cards)assert.equal(card.style.getPropertyValue('--shine-opacity'),'');
  }
 }finally{lobby.destroy();w.close()}
});
