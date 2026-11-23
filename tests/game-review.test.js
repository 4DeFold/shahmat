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
 const position=engine.evaluate(new Chess().fen());await Promise.resolve();assert.ok(worker.messages.includes('go depth 9 nodes 6000 movetime 100'));
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
