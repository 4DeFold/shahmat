import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankProgress,recordResult} from '../pages/puzzle-model.js';
import {createPuzzleSync,mergeProgress} from '../pages/puzzle-sync.js';
const puzzle=(id,rating=1500)=>({id,rating,themes:['fork']});
const clone=x=>JSON.parse(JSON.stringify(x));
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}}
function backend(){const rows=new Map();let offline=false,conflict=null,reads=0,fullReads=0;
 const client=id=>({from:()=>({select:fields=>({eq:()=>({maybeSingle:()=>({abortSignal:async()=>{reads++;if(fields.includes('progress'))fullReads++;if(offline)throw Error('offline');const r=rows.get(id);return {data:r?(fields.includes('progress')?clone(r):{revision:r.revision}):null,error:null}}})})})}),rpc:(_name,{p_expected_revision,p_progress})=>({abortSignal:async()=>{if(offline)throw Error('offline');if(conflict){conflict();conflict=null}const r=rows.get(id)||{revision:0,progress:null};if(r.revision!==p_expected_revision)return {data:{...clone(r),accepted:false}};const next={revision:r.revision+1,progress:clone(p_progress)};rows.set(id,next);return {data:{...clone(next),accepted:true}}}})});
 return {client,rows,offline:value=>offline=value,conflict:fn=>conflict=fn,get reads(){return reads},get fullReads(){return fullReads}};
}
const wait=()=>new Promise(resolve=>setTimeout(resolve,10));
function device(server,id,store=storage(),initial=blankProgress()){
 let state=initial,status='';const key='p.'+id;const sync=createPuzzleSync({client:server.client(id),userId:id,storage:store,key,getProgress:()=>state,applyProgress:p=>{state=p},onStatus:s=>{status=s},interval:999999});
 return {sync,store,get state(){return state},get status(){return status},edit(fn){fn(state);store.setItem(key,JSON.stringify(state));sync.changed()}};
}
test('polls revisions, imports initial data and synchronizes devices without cross-account data',async()=>{
 const server=backend(),a=device(server,'a'),b=device(server,'a'),c=device(server,'b');await a.sync.start();a.edit(p=>{recordResult(p,puzzle('p1'),true,1);p.current={id:'p2',theme:'mix',cursor:1,failed:false}});await wait();await b.sync.start();await c.sync.start();assert.equal(b.state.history[0].id,'p1');assert.equal(b.state.current.id,'p2');assert.equal(c.state.history.length,0);
 const count=server.fullReads;await b.sync.refresh();assert.equal(server.fullReads,count);
 a.edit(p=>{p.current={id:'p3',theme:'mix',cursor:1,failed:false}});await wait();await b.sync.refresh();assert.equal(b.state.current.id,'p3');assert.equal(c.state.current,undefined);
 a.sync.stop();b.sync.stop();c.sync.stop();
});
test('offline pending survives restart, and concurrent attempts merge without losing either result',async()=>{
 const server=backend(),a=device(server,'a'),b=device(server,'a');await a.sync.start();await b.sync.start();server.offline(true);
 a.edit(p=>{recordResult(p,puzzle('p1'),true,10);p.current={id:'p1',theme:'mix',cursor:2,failed:false}});await wait();assert.match(a.status,/Не удалось/);
 b.edit(p=>{recordResult(p,puzzle('p2'),false,20);p.current={id:'p2',theme:'mix',cursor:2,failed:true}});await wait();server.offline(false);
 await b.sync.refresh();a.sync.stop();const resumed=device(server,'a',a.store,JSON.parse(a.store.getItem('p.a')));await resumed.sync.start();await resumed.sync.refresh();
 assert.deepEqual(new Set(resumed.state.history.map(x=>x.id)),new Set(['p1','p2']));assert.equal(resumed.state.current.id,'p1');await b.sync.refresh();assert.deepEqual(b.state,resumed.state);
 b.sync.stop();resumed.sync.stop();
});
test('CAS conflict rebases later edits rather than replacing remote results',async()=>{
 const server=backend(),a=device(server,'a');await a.sync.start();server.conflict(()=>{let p=blankProgress();recordResult(p,puzzle('remote'),true,5);server.rows.set('a',{revision:1,progress:p})});
 a.edit(p=>recordResult(p,puzzle('local'),false,6));await wait();await a.sync.refresh();assert.deepEqual(new Set(a.state.history.map(x=>x.id)),new Set(['remote','local']));assert.equal(server.rows.get('a').progress.history.length,2);a.sync.stop();
});
test('merging duplicated results counts once and preserves remote current when migrating',()=>{const a=blankProgress(),b=blankProgress();recordResult(a,puzzle('same'),true,1);recordResult(b,puzzle('same'),false,2);a.current={id:'server',theme:'mix',cursor:1,failed:false};b.current={id:'local',theme:'mix',cursor:1,failed:false};const result=mergeProgress(a,b,false);assert.equal(result.history.length,1);assert.equal(result.history[0].success,true);assert.equal(result.current.id,'server');});
test('another tab refreshing the shared cache cannot erase a pending snapshot on reload',async()=>{
 const server=backend(),store=storage();let a=blankProgress(),b=blankProgress();const key='shared';
 const create=(id,get,set)=>createPuzzleSync({client:server.client('u'),userId:'u',storage:store,key,instanceId:id,getProgress:get,applyProgress:set,interval:999999});
 const sa=create('tab-a',()=>a,p=>{a=p}),sb=create('tab-b',()=>b,p=>{b=p});await sa.start();await sb.start();server.offline(true);recordResult(a,puzzle('offline'),true,10);store.setItem(key,JSON.stringify(a));sa.changed();await wait();
 // The second tab and any external cache writes cannot alter tab A's journal.
 store.setItem(key,JSON.stringify(blankProgress()));sa.stop();a=JSON.parse(store.getItem(key));server.offline(false);
 const restored=create('tab-a',()=>a,p=>{a=p});await restored.start();await restored.refresh();await sb.refresh();assert.equal(a.history[0].id,'offline');assert.equal(b.history[0].id,'offline');restored.stop();sb.stop();
});
