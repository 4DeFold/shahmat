import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBotStorage} from '../pages/bot-storage.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
const row=(id,moves=[],status='active')=>({id,level:1,moves,status,started_at:new Date().toISOString(),updated_at:new Date().toISOString()});
function clientWith(upsert,rows=[]) {
 const query={eq:()=>query,order:()=>query,limit:async()=>({data:rows,error:null})};
 return {from:()=>({upsert,select:()=>query})};
}
test('serializes writes, preserves pending updates and restores by account',async()=>{
 const storage=memory(), sent=[]; let release;
 const client=clientWith(value=>{sent.push(value); return sent.length===1?new Promise(r=>release=r):Promise.resolve({error:null});});
 const store=createBotStorage({client,userId:'alice',storage}); store.put(row('game')); await tick();
 store.put(row('game',['e4'])); store.put(row('game',['e4','e5']));
 assert.equal(sent.length,1); release({error:null}); await tick();
 assert.equal(sent.length,2); assert.deepEqual(sent[1].moves,['e4','e5']);
 assert.deepEqual((await store.restore()).moves,['e4','e5']);
 const other=createBotStorage({client,userId:'bob',storage}); assert.equal(await other.restore(),null);
 store.destroy(); other.destroy();
});
test('failed writes survive reload and completed local game is not resurrected',async()=>{
 const storage=memory(), failed=clientWith(async()=>({error:'offline'}),[row('game')]);
 const s=createBotStorage({client:failed,userId:'alice',storage}); s.put(row('game',[],'draw')); await tick(); s.destroy();
 let attempts=0; const healthy=clientWith(async()=>{attempts++;return {error:null};},[row('game')]);
 const restored=createBotStorage({client:healthy,userId:'alice',storage}); assert.equal(await restored.restore(),null); await tick(); assert.equal(attempts,1); restored.destroy();
});
