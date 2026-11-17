import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startOnlinePresence } from '../pages/online-presence.js';

test('presence counts unique keys, emits only changes, and clears on disconnect', async () => {
  let status, removed = false, state = { alice:[{}, {}], bob:[{}] }, tracked;
  const channel = { subscribe(fn) { status = fn; fn('SUBSCRIBED'); return this; }, async track(value) { tracked = value; return 'ok'; }, presenceState() { return state; } };
  const client = { channel(name, config) { assert.equal(name, 'site-online-v1'); assert.equal(config.config.presence.key.length, 64); return channel; }, removeChannel(value) { assert.equal(value, channel); removed = true; } };
  const changes = [], stop = startOnlinePresence(client, 'user-1', value => changes.push(value));
  await new Promise(resolve => setTimeout(resolve, 600)); assert.deepEqual(changes, [2]); assert.deepEqual(tracked, {});
  await new Promise(resolve => setTimeout(resolve, 500)); assert.deepEqual(changes, [2]);
  state = { alice:[{}] }; await new Promise(resolve => setTimeout(resolve, 500)); assert.deepEqual(changes, [2, 1]);
  status('CHANNEL_ERROR'); assert.deepEqual(changes, [2, 1, null]); stop(); assert.equal(removed, true);
});
