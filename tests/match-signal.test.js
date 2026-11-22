import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatchSignal } from '../pages/match-signal.js';

test('hints are best effort, scoped, validated and never contain a position',()=>{
 const channels=[],removed=[],hints=[];
 const client={channel(topic,options){const c={topic,options,on(type,filter,fn){this.receive=fn;return this},subscribe(fn){this.status=fn;return this},send(data){this.sent=data;return Promise.resolve('ok')}};channels.push(c);return c},removeChannel(c){removed.push(c)}};
 const signal=createMatchSignal(client,(id,version)=>hints.push([id,version]));
 signal.setGame('one');const first=channels[0];assert.equal(first.topic,'match-hint-v1:one');
 signal.publish('one',1);assert.equal(first.sent,undefined);
 first.status('SUBSCRIBED');signal.publish('other',1);assert.equal(first.sent,undefined);
 signal.publish('one',1);assert.deepEqual(first.sent,{type:'broadcast',event:'changed',payload:{version:1}});
 first.receive({payload:{version:1}});first.receive({payload:{version:-1}});first.receive({payload:{version:2002}});first.receive({payload:{version:'2'}});
 assert.deepEqual(hints,[['one',1]]);
 signal.setGame('two');assert.deepEqual(removed,[first]);first.receive({payload:{version:2}});assert.equal(hints.length,1);
 const second=channels[1];second.status('SUBSCRIBED');second.receive({payload:{version:2}});assert.deepEqual(hints.at(-1),['two',2]);
 second.status('CHANNEL_ERROR');signal.publish('two',2);assert.equal(second.sent,undefined);
 signal.destroy();assert.deepEqual(removed,[first,second]);
});
