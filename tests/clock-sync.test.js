import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClockSync } from '../pages/clock-sync.js';
const game = {id:'a',version:0,status:'active',turn:'w',white_ms:180000,black_ms:180000};
test('network jitter slews a running clock without reversals or double-speed ticks', () => {
  const clock=createClockSync(); clock.update(game,0);
  assert.equal(clock.value('w',1000),179000);
  clock.update({...game, white_ms:179800},1000);
  assert.equal(clock.value('w',1000),179000);
  assert.equal(clock.value('w',2000),178100);
  clock.update({...game,white_ms:176000},2000);
  assert.equal(clock.value('w',3000),177000);
  clock.update({...game,version:1,turn:'b',white_ms:179000,black_ms:180000},3000);
  assert.equal(clock.value('w',3000),177000);
  assert.equal(clock.value('b',4000),179000);
});
