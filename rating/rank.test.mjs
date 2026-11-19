import { test } from 'node:test';
import assert from 'node:assert/strict';
import {transfer,updateRatings,overall} from './rank.js';
test('fixed K, draws, underdogs and no rating clamp', () => {
 assert.equal(transfer(1000,1000,1),10);
 assert.ok(transfer(1400,1000,0.5)<0);
 assert.ok(transfer(1000,1400,1)>transfer(1400,1000,1));
 assert.equal(transfer(2000,1000,1),0);
 assert.deepEqual(updateRatings(-100, -100, 0), {white:-110,black:-90,delta:-10});
 assert.throws(()=>transfer(1000,1000,0.7));
});
test('zero sum and integers across 20000 games; no decay after 1000 games',()=>{
 let white=1000,black=1000;
 for(let i=0;i<20000;i++) {({white,black}=updateRatings(white,black,[1,0,0.5][i%3]));assert.equal(white+black,2000);assert.ok(Number.isInteger(white)&&Number.isInteger(black));}
 assert.equal(transfer(1000,1000,1),10);
});
test('weighted overall and missing modes',()=>{
 for(const [b,r,c,score] of [[1100,1000,1000,1017],[1000,1000,1100,1050],[1000,1100,1200,1133],[1200,1100,1000,1067],[1100,1100,1100,1100]]) assert.equal(overall(b,r,c),score);
 assert.equal(overall(),1000);
});
