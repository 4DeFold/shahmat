import {test} from 'node:test';import assert from 'node:assert/strict';import {Chess} from 'chess.js';import {historyTransition} from '../pages/move-history.js';
test('history movement maps piece identities through jumps, captures and castling in both directions',()=>{
 const c=new Chess();['e4','e5','Nf3','Nc6','Bc4','Nf6','O-O'].forEach(m=>c.move(m));
 assert.deepEqual(historyTransition(c,6,7).sort((a,b)=>a.from.localeCompare(b.from)),[{from:'e1',to:'g1'},{from:'h1',to:'f1'}]);
 assert.deepEqual(historyTransition(c,7,6).sort((a,b)=>a.from.localeCompare(b.from)),[{from:'f1',to:'h1'},{from:'g1',to:'e1'}]);
 const jump=historyTransition(c,0,7); assert.ok(jump.some(x=>x.from==='g1'&&x.to==='f3')); assert.ok(jump.some(x=>x.from==='e1'&&x.to==='g1'));
 const e=new Chess();['e4','a6','e5','d5','exd6'].forEach(m=>e.move(m));assert.ok(historyTransition(e,3,5).some(x=>x.from==='e5'&&x.to==='d6'));
});
