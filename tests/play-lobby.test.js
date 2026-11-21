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

test('bottom step navigation shows progression and never skips a selection',async()=>{
 const dom=new JSDOM(html,{url:'https://example.com',pretendToBeVisual:true}),d=dom.window.document;
 const lobby=createPlayLobby({document:d,client:{rpc:async()=>({data:[]})},onChoose:()=>true});
 try{
  const nav=d.getElementById('lobby-nav'),k=nav.querySelector('[data-step=kinds]'),m=nav.querySelector('[data-step=modes]'),t=nav.querySelector('[data-step=controls]');
  assert.equal(k.getAttribute('aria-current'),'step');assert.equal(m.disabled,true);assert.equal(t.disabled,true);
  d.querySelector('[data-kind=rated]').click();assert.equal(m.getAttribute('aria-current'),'step');assert.equal(k.disabled,false);assert.equal(t.disabled,true);
  d.querySelectorAll('#lobby-stage .choice-card')[1].click();assert.equal(t.getAttribute('aria-current'),'step');
  m.click();assert.equal(m.getAttribute('aria-current'),'step');assert.equal(t.disabled,true);
  k.click();assert.equal(k.getAttribute('aria-current'),'step');assert.equal(m.disabled,true);
 }finally{lobby.destroy();dom.window.close();}
});

test('pixel reveal follows the cursor and fades the trail',async()=>{
 const {pixelIntensity}=await import('../pages/pixel-blast.js');
 const points=[{x:20,y:50,time:100},{x:180,y:50,time:900}];
 assert.ok(pixelIntensity(180,50,points,1000)>pixelIntensity(20,50,points,1000)*2);
 assert.equal(pixelIntensity(20,50,points,1800),0);
});
