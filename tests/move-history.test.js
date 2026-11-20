import {test} from 'node:test';import assert from 'node:assert/strict';import {Chess} from 'chess.js';import {historyTransition} from '../pages/move-history.js';
test('history movement maps piece identities through jumps, captures and castling in both directions',()=>{
 const c=new Chess();['e4','e5','Nf3','Nc6','Bc4','Nf6','O-O'].forEach(m=>c.move(m));
 assert.deepEqual(historyTransition(c,6,7).sort((a,b)=>a.from.localeCompare(b.from)),[{from:'e1',to:'g1'},{from:'h1',to:'f1'}]);
 assert.deepEqual(historyTransition(c,7,6).sort((a,b)=>a.from.localeCompare(b.from)),[{from:'f1',to:'h1'},{from:'g1',to:'e1'}]);
 const jump=historyTransition(c,0,7); assert.ok(jump.some(x=>x.from==='g1'&&x.to==='f3')); assert.ok(jump.some(x=>x.from==='e1'&&x.to==='g1'));
 const e=new Chess();['e4','a6','e5','d5','exd6'].forEach(m=>e.move(m));assert.ok(historyTransition(e,3,5).some(x=>x.from==='e5'&&x.to==='d6'));
});

test('history shortcuts jump to start/end and preserve single-step navigation', async () => {
  const {historyKeyTarget} = await import('../pages/move-history.js');
  for (const [key,code,target] of [
    ['ArrowDown','ArrowDown',0], ['ы','KeyS',0], ['s','KeyS',0],
    ['ArrowUp','ArrowUp',9], ['ц','KeyW',9], ['w','KeyW',9],
    ['ArrowLeft','ArrowLeft',3], ['ф','KeyA',3], ['ArrowRight','ArrowRight',5], ['в','KeyD',5],
  ]) assert.equal(historyKeyTarget(key,code,4,9), target);
  assert.equal(historyKeyTarget('ArrowLeft','ArrowLeft',0,9),0);
  assert.equal(historyKeyTarget('ArrowRight','ArrowRight',9,9),9);
  assert.equal(historyKeyTarget('x','KeyX',4,9),null);
  assert.equal(historyKeyTarget('w','KeyW',0,0),0);
});

test('history sounds track the crossed move in either direction and ignore unchanged positions',async()=>{
 const {historySoundMove}=await import('../pages/move-history.js');const c=new Chess();['e4','d5','exd5','Qxd5'].forEach(m=>c.move(m));
 assert.equal(historySoundMove(c,0,0),null);assert.equal(historySoundMove(c,3,4).piece,'q');assert.equal(historySoundMove(c,4,3).piece,'q');assert.equal(historySoundMove(c,0,3).captured,'p');assert.equal(historySoundMove(c,3,0).captured,'p');
});
