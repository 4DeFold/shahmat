import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {premoveTargets,validPremove} from '../pages/premove.js';
const targets=(c,s,color)=>premoveTargets(c,s,color).map(m=>m.to);
test('pawn diagonals, en passant, captures, promotions and both colors are tentative',()=>{
 const c=new Chess(); ['e4','a6','e5'].forEach(m=>c.move(m));
 assert.ok(targets(c,'e5','w').includes('d6')); // empty until ...d5
 assert.equal(validPremove(c,{from:'e5',to:'d6'},'w'),false);
 c.move('d5'); assert.equal(validPremove(c,{from:'e5',to:'d6'},'w'),true);
 c.move({from:'e5',to:'d6'}); assert.equal(c.get('d5'),undefined);
 const black=new Chess('4k3/8/8/8/8/8/1p6/4K3 w - - 0 1');
 assert.ok(premoveTargets(black,'b2','b').some(m=>m.to==='a1'&&m.promotion==='q'));
 const promoted=new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
 assert.equal(validPremove(promoted,{from:'a7',to:'a8',promotion:'n'},'w'),true);
});
test('pins, checks, castling and sliding pieces use future rather than current legality',()=>{
 const pinned=new Chess('k3r3/8/8/8/8/8/4R3/4K3 b - - 0 1');
 assert.ok(targets(pinned,'e2','w').includes('d2'));
 assert.equal(validPremove(new Chess('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1'),{from:'e2',to:'d2'},'w'),false);
 const castle=new Chess('4kr2/8/8/8/8/8/8/R3K2R b KQ - 0 1');
 assert.ok(targets(castle,'e1','w').includes('g1'));assert.ok(targets(castle,'e1','w').includes('c1'));
 const sliding=new Chess('4k3/8/8/8/3p4/8/3R4/4K3 b - - 0 1');
 assert.ok(targets(sliding,'d2','w').includes('d4'));assert.ok(targets(sliding,'d2','w').includes('d5'));
 assert.deepEqual(targets(sliding,'d4','w'),[]);
});
