import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BOT_LEVELS,createStockfish} from '../pages/stockfish-engine.js';
class MockWorker {
  static last;
  constructor(url) { this.url=url; this.sent=[]; MockWorker.last=this; }
  postMessage(line) { this.sent.push(line); }
  terminate() { this.terminated=true; }
  emit(line) { this.onmessage({data:line}); }
}
test('six ordered skill levels and full Stockfish for the king',async()=>{
  assert.deepEqual(BOT_LEVELS.map(x=>x.piece),['P','N','B','R','Q','K']);
  assert.deepEqual(BOT_LEVELS.map(x=>x.skill),[0,4,8,12,16,20]);
  for(let level=0;level<6;level++) {
    const engine=createStockfish(level,{WorkerClass:MockWorker}); const w=MockWorker.last;
    assert.match(w.url, level===5 ? /single-a496a04/ : /lite-single/);
    assert.deepEqual(w.sent,['uci']); w.emit('uciok');
    assert.ok(w.sent.includes(`setoption name Skill Level value ${BOT_LEVELS[level].skill}`));
    assert.ok(w.sent.includes(`setoption name UCI_LimitStrength value ${level===5?'false':'true'}`));
    w.emit('readyok'); await engine.ready;
    const move=engine.move('start'); await Promise.resolve(); assert.ok(w.sent.includes(`go movetime ${BOT_LEVELS[level].ms}`));
    w.emit('info depth 12\nbestmove e7e8q ponder a2a3'); assert.deepEqual(await move,{from:'e7',to:'e8',promotion:'q'});
    engine.destroy(); assert.equal(w.terminated,true);
  }
});
test('worker error, illegal replies, concurrent work and cancellation are surfaced',async()=>{
  const engine=createStockfish(0,{WorkerClass:MockWorker}); const w=MockWorker.last;
  w.emit('uciok'); w.emit('readyok'); await engine.ready;
  const first=engine.move('valid fen'); await Promise.resolve();
  await assert.rejects(engine.move('valid fen'),/уже думает/);
  w.emit('bestmove (none)'); await assert.rejects(first,/не вернул ход/);
  await assert.rejects(engine.move('a\nquit'),/позиция/);
  const second=engine.move('valid fen'); await Promise.resolve(); engine.destroy(); await assert.rejects(second,/остановлен/);
  const bad=createStockfish(5,{WorkerClass:MockWorker}); MockWorker.last.onerror(); await assert.rejects(bad.ready,/запустить/);
});
