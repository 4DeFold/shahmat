import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startOnlinePresence } from '../pages/online-presence.js';

test('presence counts unique keys, emits only changes, and clears on disconnect', async () => {
  let status, removed = false, state = { alice:[{}, {}], bob:[{}] }, tracked;
  const channel = { on(type, filter, fn) { assert.equal(type, 'presence'); assert.equal(filter.event, 'sync'); fn(); return this; }, subscribe(fn) { status = fn; fn('SUBSCRIBED'); return this; }, async track(value) { tracked = value; return 'ok'; }, presenceState() { return state; } };
  const client = { channel(name, config) { assert.equal(name, 'site-online-v1'); assert.equal(config.config.presence.key.length, 64); assert.equal(config.config.presence.enabled, true); return channel; }, removeChannel(value) { assert.equal(value, channel); removed = true; } };
  const changes = [], stop = startOnlinePresence(client, 'user-1', value => changes.push(value));
  await new Promise(resolve => setTimeout(resolve, 600)); assert.deepEqual(changes, [2]); assert.deepEqual(tracked, {});
  await new Promise(resolve => setTimeout(resolve, 500)); assert.deepEqual(changes, [2]);
  state = { alice:[{}] }; await new Promise(resolve => setTimeout(resolve, 500)); assert.deepEqual(changes, [2, 1]);
  status('CHANNEL_ERROR'); assert.deepEqual(changes, [2, 1, null]); stop(); assert.equal(removed, true);
});

test('presence publishes a public username and clears live names on disconnect', async () => {
  let status, tracked, state = { a:[{username:'Alice'},{username:'Alice'}], b:[{username:'Bob'}], guest:[{}] };
  const channel = { on(_type,_filter,fn){fn();return this;}, subscribe(fn){status=fn;fn('SUBSCRIBED');return this;}, async track(v){tracked=v;return 'ok';}, presenceState(){return state;} };
  const names=[], counts=[];
  const stop=startOnlinePresence({channel:()=>channel,removeChannel:()=>{}},'id',n=>counts.push(n),{username:'Alice',onNames:n=>names.push(n && [...n])});
  await new Promise(r=>setTimeout(r,550));
  assert.deepEqual(tracked,{username:'Alice'}); assert.deepEqual(counts,[3]); assert.deepEqual(names,[['Alice','Bob']]);
  state={a:[{username:'Alice'}]}; await new Promise(r=>setTimeout(r,550)); assert.deepEqual(names.at(-1),['Alice']);
  status('CLOSED'); assert.equal(names.at(-1),null); assert.equal(counts.at(-1),null); stop();
});
