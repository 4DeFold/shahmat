import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Chess} from 'chess.js';
import {winExpectation,moveAccuracy,classifyMove,summarizeReview,createReviewEngine} from '../pages/review-engine.js';
import {createGameReview} from '../pages/game-review.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
test('accuracy uses loss of win expectation from the mover perspective',()=>{
 assert.equal(winExpectation(0),50);assert.ok(winExpectation(100)>50);assert.ok(winExpectation(-100)<50);assert.ok(moveAccuracy(0)>99.99);assert.ok(moveAccuracy(20)<moveAccuracy(2));
 const c=new Chess(),a=c.move('e4'),b=c.move('e5');const positions=[{win:50,best:'e2e4'},{win:49,best:'d7d5'},{win:60,best:null}];
 assert.equal(classifyMove(positions[0],positions[1],a),'best');assert.equal(classifyMove(positions[1],positions[2],b),'mistake');
 const summary=summarizeReview([a,b],positions);assert.ok(summary.w.accuracy>summary.b.accuracy);assert.equal(summary.b.counts.mistake,1);
});
test('UCI worker is bounded, handles side to move and cancellation',async()=>{
 class Worker {constructor(){Worker.last=this;this.messages=[]}postMessage(m){this.messages.push(m)}terminate(){this.terminated=true}emit(data){this.onmessage({data})}}
 const engine=createReviewEngine({WorkerClass:Worker,timeout:1000}),worker=Worker.last;worker.emit('uciok');worker.emit('readyok');
 const position=engine.evaluate(new Chess().fen());await Promise.resolve();assert.ok(worker.messages.includes('go depth 12 nodes 18000 movetime 200'));
 worker.emit('info depth 4 score cp 50 pv e2e4\nbestmove e2e4');const result=await position;assert.equal(result.best,'e2e4');assert.ok(result.win>50);
 const c=new Chess();c.move('e4');const black=engine.evaluate(c.fen());await Promise.resolve();worker.emit('info depth 4 score cp 50\nbestmove e7e5');assert.ok((await black).win<50);
 const pending=engine.evaluate(c.fen());await Promise.resolve();engine.destroy();await assert.rejects(pending,/остановлен/);assert.equal(worker.terminated,true);
});
test('review only starts on demand, cancels and resumes; completed counts exclude unverified brilliants',async()=>{
 const dom=new JSDOM('<div id="frame"></div><div id="rail"><div class="moves"></div></div>'),d=dom.window.document;
 let created=0,terminated=0;const createEngine=()=>{created++;return {evaluate:async()=>({win:50,best:'e2e4'}),destroy(){terminated++}}};
 const review=createGameReview({document:d,frame:d.querySelector('#frame'),host:d.querySelector('#rail'),createEngine});
 assert.equal(created,0);assert.equal(d.querySelector('.review-panel').hidden,true);
 review.setVisible(false);review.start({moves:['e4','e5'],flip:true,names:{w:'Alice',b:'Bob'}});assert.equal(created,0);
 review.setVisible(true);await tick();await tick();assert.equal(d.querySelector('.review-title').textContent,'Анализ партии');assert.equal(d.querySelector('.review-person strong').textContent,'Alice');assert.equal(d.querySelector('.review-brilliant b').textContent,'—');
 review.setIndex(0);assert.match(d.querySelector('.review-bar').getAttribute('aria-label'),/белые 50/);assert.equal(d.querySelector('.review-bar').classList.contains('is-flipped'),true);
 review.clear();assert.equal(d.querySelector('.review-bar').getAttribute('aria-hidden'),'true');review.destroy();assert.ok(terminated>=1);dom.window.close();
});
test('invalid scores and zero move games do not invent percentages',async()=>{
 const dom=new JSDOM('<div id="frame"></div><div id="rail"><div class="moves"></div></div>'),d=dom.window.document;
 const review=createGameReview({document:d,frame:d.querySelector('#frame'),host:d.querySelector('#rail'),createEngine:()=>({evaluate:async()=>({win:50}),destroy(){}})});
 review.start({moves:['invalid']});assert.equal(d.querySelector('.review-panel').hidden,true);
 review.start({moves:[]});await tick();assert.equal(d.querySelector('.review-accuracy').textContent,'—');review.destroy();dom.window.close();
});

test('move marks track analyzed plies, current board square and clear between games',async()=>{
 const dom=new JSDOM('<div id="frame"><div class="board"><button data-square="e4" aria-label="e4"></button><button data-square="e5" aria-label="e5"></button><button data-square="d6" aria-label="d6"></button></div></div><div id="rail"><div class="moves"><ol id="move-list"></ol></div></div>'),d=dom.window.document;
 const list=d.querySelector('#move-list');for(let i=1;i<=5;i++){const b=d.createElement('button');b.dataset.historyIndex=i;b.setAttribute('aria-label',`Ход ${i}`);list.append(b)}
 const replay=new Chess(),wins=[50,50,50,50,65,45],evaluation=new Map([[replay.fen(),wins[0]]]);const moves=['e4','a6','e5','d5','exd6'];moves.forEach((m,i)=>{replay.move(m);evaluation.set(replay.fen(),wins[i+1])});
 const createEngine=()=>({evaluate:async fen=>({win:evaluation.get(fen),best:'e2e4'}),destroy(){}});
 const review=createGameReview({document:d,frame:d.querySelector('#frame'),host:d.querySelector('#rail'),createEngine});
 review.start({moves,names:{w:{name:'Alice',rating:'(1234 ЯР)'},b:{name:'Bob',rating:'(987 ЯР)'}}});
 await new Promise(resolve=>setTimeout(resolve,180));
 assert.equal(list.querySelectorAll('.review-move-mark').length,2);assert.equal(list.querySelector('[data-history-index="1"] .review-move-mark'),null);
 assert.equal(list.querySelector('[data-history-index="4"] .review-move-mark').dataset.type,'mistake');assert.match(list.querySelector('[data-history-index="4"]').getAttribute('aria-label'),/Ошибка/);
 assert.equal(d.querySelector('[data-square=d6] .review-board-mark').dataset.type,'blunder');
 assert.equal(d.querySelector('.review-blunder .review-legend-mark').textContent,d.querySelector('[data-square=d6] .review-board-mark').textContent);
 assert.equal(d.querySelector('.review-person strong').textContent,'Alice');assert.equal(d.querySelector('.review-person .review-rating').textContent,'(1234 ЯР)');
 review.setIndex(1);assert.equal(d.querySelectorAll('.review-board-mark').length,0);
 review.setIndex(5);assert.equal(d.querySelectorAll('.review-board-mark').length,1);
 review.setIndex(0);assert.equal(d.querySelectorAll('.review-board-mark').length,0);
 review.setIndex(5);review.clear();assert.equal(list.querySelectorAll('.review-move-mark').length,0);assert.equal(list.querySelector('[data-history-index="4"]').getAttribute('aria-label'),'Ход 4');assert.equal(d.querySelectorAll('.review-board-mark').length,0);
 review.destroy();dom.window.close();
});

test('graph shows position assessment only; keyboard and pointer select plies',async()=>{
 const dom=new JSDOM('<div id="frame"></div><div id="rail"><div class="moves"></div></div>'),d=dom.window.document,selected=[];
 const createEngine=()=>({evaluate:async()=>({win:50,best:'e2e4'}),destroy(){}});
 let review;review=createGameReview({document:d,frame:d.querySelector('#frame'),host:d.querySelector('#rail'),createEngine,onSelect:i=>{selected.push(i);review.setIndex(i)}});
 review.start({moves:['e4','e5']});await new Promise(resolve=>setTimeout(resolve,100));
 const graph=d.querySelector('.review-graph'),area=graph.querySelector('[role=slider]');assert.equal(graph.hidden,false);assert.equal(graph.querySelectorAll('polyline.eval').length,1);assert.equal(graph.querySelectorAll('.review-graph-fill').length,1);
 assert.equal(area.getAttribute('aria-valuenow'),'2');assert.match(area.getAttribute('aria-valuetext'),/· 50%/);
 area.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));assert.deepEqual(selected,[1]);assert.equal(area.getAttribute('aria-valuenow'),'1');
 area.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert.equal(area.getAttribute('aria-valuenow'),'0');area.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(area.getAttribute('aria-valuenow'),'2');
 area.getBoundingClientRect=()=>({left:10,width:200});area.dispatchEvent(new dom.window.MouseEvent('click',{clientX:10,bubbles:true}));assert.deepEqual(selected,[1,0,2,0]);assert.match(area.getAttribute('aria-valuetext'),/Начало/);
 assert.equal(graph.querySelectorAll('button').length,0);assert.doesNotMatch(graph.textContent,/Оценка белых|Точность/);review.setIndex(1);assert.match(area.getAttribute('aria-valuetext'),/· 50%/);assert.equal(graph.querySelectorAll('.review-graph-line').length,1);
 review.clear();assert.equal(graph.hidden,true);review.destroy();dom.window.close();
});

test('ordinary moves are counted without being treated as significant errors',()=>{
 const game=new Chess(),moves=['e4','e5','Nf3','Nc6'].map(x=>game.move(x));const positions=moves.map(()=>({win:50}));positions.push({win:50});
 const summary=summarizeReview(moves,positions);assert.equal(summary.w.counts.excellent,2);assert.equal(summary.b.counts.excellent,2);assert.ok(summary.w.accuracy>99.9);
});

test('game accuracy penalizes blunders using volatility and harmonic mean',()=>{
 const c=new Chess(),moves=['e4','e5','Nf3','Nc6','Bc4','Nf6','d3','d6'].map(m=>c.move(m));
 const positions=[50,50,50,50,50,15,15,15,15].map(win=>({win}));
 const summary=summarizeReview(moves,positions);const naive=(3*100+moveAccuracy(35))/4;
 assert.ok(summary.w.accuracy<naive);assert.equal(summary.b.accuracy,100);assert.ok(moveAccuracy(100)===0);
 const partial=summarizeReview(moves,[null,...positions.slice(1)]);assert.ok(Number.isFinite(partial.w.accuracy));assert.equal(summarizeReview([],[]).w.accuracy,null);
});

test('review shows verified move counts while analysis is still running',async()=>{
 const dom=new JSDOM('<div id="frame"></div><div id="rail"><div class="moves"></div></div>'),d=dom.window.document;
 let release;const gate=new Promise(resolve=>release=resolve);let calls=0;
 const engine=()=>({evaluate:async()=>{calls++;if(calls===4)await gate;return {win:50,best:'e2e4'}},destroy(){}});
 const review=createGameReview({document:d,frame:d.querySelector('#frame'),host:d.querySelector('#rail'),createEngine:engine});review.start({moves:['e4','e5','Nf3']});
 await new Promise(resolve=>setTimeout(resolve,80));assert.match(d.querySelector('.review-title').textContent,/Анализ 3\/4/);assert.equal(d.querySelector('.review-best b').textContent,'1');assert.equal(d.querySelector('.review-accuracy').textContent,'—');release();await new Promise(resolve=>setTimeout(resolve,80));assert.equal(d.querySelector('.review-title').textContent,'Анализ партии');review.destroy();dom.window.close();
});

test('review restarts once after a transient engine failure and retains progress',async()=>{
 const dom=new JSDOM('<div id="frame"></div><div id="rail"><div class="moves"></div></div>'),d=dom.window.document;
 let created=0,destroyed=0,calls=0;
 const review=createGameReview({document:d,frame:d.querySelector('#frame'),host:d.querySelector('#rail'),createEngine:()=>{const n=++created;return {evaluate:async()=>{calls++;if(n===1&&calls===2)throw Error('temporary');return {win:50,cp:0}},destroy(){destroyed++}}}});
 review.start({moves:['e4','e5']});await new Promise(r=>setTimeout(r,80));assert.match(d.querySelector('.review-title').textContent,/Анализ 1\/3/);assert.match(d.querySelector('.review-note').textContent,/Перезапуск/);
 await new Promise(r=>setTimeout(r,1100));assert.equal(d.querySelector('.review-title').textContent,'Анализ партии');assert.equal(created,2);assert.ok(destroyed>=2);review.destroy();dom.window.close();
});

test('worker timeout, malformed scores and cancellation terminate pending work',async()=>{
 class Worker{constructor(){Worker.last=this}postMessage(){}terminate(){this.terminated=true}emit(data){this.onmessage({data})}}
 let e=createReviewEngine({WorkerClass:Worker,timeout:10});const waiting=e.evaluate(new Chess().fen());await assert.rejects(waiting,/не ответил/);assert.equal(Worker.last.terminated,true);
 e=createReviewEngine({WorkerClass:Worker,timeout:1000,searchTimeout:15});Worker.last.emit('uciok');Worker.last.emit('readyok');const search=e.evaluate(new Chess().fen());await assert.rejects(search,/не ответил/);assert.equal(Worker.last.terminated,true);
 e=createReviewEngine({WorkerClass:Worker,timeout:1000});Worker.last.emit('uciok');Worker.last.emit('readyok');const bad=e.evaluate(new Chess().fen());await Promise.resolve();Worker.last.emit('bestmove e2e4');await assert.rejects(bad,/Нет оценки/);e.destroy();
});
