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
  // Turn changes accept the server's committed time, rather than inventing lost time.
  assert.equal(clock.value('w',3000),179000);
  assert.equal(clock.value('b',4000),179000);
});
test('Fischer increment is visible after a move but not on a finished game',()=>{
 const clock=createClockSync();clock.update({...game,time_control:'3+2'},0);
 clock.update({...game,version:1,turn:'b',time_control:'3+2',white_ms:181000},1000);
 assert.equal(clock.value('w',1000),181000);
 clock.update({...game,version:2,turn:'b',status:'finished',time_control:'3+2',black_ms:180000},2000);
 assert.equal(clock.value('b',2000),180000);
});

test('pending move switches clocks immediately and rolls back without inventing a result',()=>{
 const clock=createClockSync(); clock.update({...game,time_control:'3+2'},0);
 clock.beginMove(1000,2000); assert.equal(clock.turn(),'b');
 assert.equal(clock.value('w',3000),181000); assert.equal(clock.value('b',3000),178000);
 clock.cancelMove(); assert.equal(clock.turn(),'w'); assert.equal(clock.value('w',3000),177000);
 clock.beginMove(3000,2000);
 clock.update({...game,version:1,turn:'b',white_ms:178700,black_ms:180000,_clock_age_ms:200},4000);
 assert.equal(clock.value('w',4000),178700);assert.equal(clock.value('b',4000),179800);assert.equal(clock.turn(),'b');
});
test('latency estimate is bounded, only affects the running clock and never the result',()=>{
 const clock=createClockSync();clock.update({...game,_clock_age_ms:5000},0);
 assert.equal(clock.value('w',0),178000);assert.equal(clock.value('b',0),180000);
 clock.update({...game,version:1,status:'finished',white_ms:0,black_ms:177000,_clock_age_ms:500},1000);
 assert.equal(clock.value('w',1000),0);assert.equal(clock.value('b',1000),177000);
});

test('resuming after suspension reanchors to the server instead of slowly drifting for minutes',()=>{
 const clock=createClockSync();clock.update(game,0);clock.resync();
 clock.update({...game,white_ms:120000},1000);
 assert.equal(clock.value('w',1000),120000);assert.equal(clock.value('w',2000),119000);
});
