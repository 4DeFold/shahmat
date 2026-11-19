import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBotStorage} from '../pages/bot-storage.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
const storage=()=>{const values=new Map();return{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};
test('returning to selection serializes deletion behind an in-flight game write and keeps wins',async()=>{
 const local=storage(), calls=[];let resolve;
 const client={from(table){return {upsert(value){calls.push([table,'upsert',value]);return table==='bot_games'?new Promise(r=>resolve=r):Promise.resolve({error:null});},delete(){return {eq(){return {eq:async(_k,id)=>{calls.push([table,'delete',id]);return {error:null}}}}}},select(){return{eq:async()=>({data:[{level:4}],error:null})}}}}};
 const store=createBotStorage({client,userId:'alice',storage:local});store.put({id:'g',level:2,moves:[],status:'active'});await tick();store.put({id:'g',level:2,moves:['e4'],status:'white_win'});store.markWin(2);store.remove('g');resolve({error:null});await tick();await tick();
 assert.deepEqual(calls.map(x=>x.slice(0,2)),[['bot_games','upsert'],['bot_progress','upsert'],['bot_games','delete']]);assert.deepEqual((await store.completed()).sort(),[2,4]);store.destroy();
});
