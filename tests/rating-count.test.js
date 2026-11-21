import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRatingCount} from '../pages/rating-count.js';

test('count animates from the current visible number and can be interrupted',()=>{
 let next=0, pending=new Map();
 const win={requestAnimationFrame(fn){pending.set(++next,fn);return next;},cancelAnimationFrame(id){pending.delete(id);},matchMedia(){return {matches:false}}};
 const el={textContent:'',setAttribute(){},removeAttribute(){}};
 const tick=t=>{const [id,fn]=pending.entries().next().value;pending.delete(id);fn(t);};
 const count=createRatingCount(el,win);
 count.set(972,'yar');assert.match(el.textContent,/972/);
 count.set(988,'yar');tick(0);assert.match(el.textContent,/972/);
 tick(450);const visible=Number(el.textContent.match(/\d+/)[0]);assert.ok(visible>972&&visible<988);
 count.set(950,'yar');tick(500);assert.equal(Number(el.textContent.match(/\d+/)[0]),visible);
 tick(1400);assert.match(el.textContent,/950/);assert.equal(pending.size,0);
 count.set(null,'yar',true);assert.equal(el.textContent,'(калибровка)');
 count.destroy();
});
