import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameSound } from '../pages/game-sound.js';

test('move, capture and check sounds ignore old muted preferences', () => {
  let taps = 0;
  const param = () => ({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
  class AudioContext {
    state = 'running'; currentTime = 0; sampleRate = 44100; destination = {};
    createBuffer() { return {getChannelData:() => new Float32Array(2426)}; }
    createOscillator() { return {frequency:param(),connect(){},start(){taps++;},stop(){}}; }
    createGain() { return {gain:param(),connect(){}}; }
    createBufferSource() { return {connect(){},start(){},stop(){}}; }
    createBiquadFilter() { return {frequency:param(),connect(){}}; }
    close() { return Promise.resolve(); }
  }
  const sound = createGameSound({AudioContext,localStorage:{getItem:() => 'true'}});
  assert.equal('setMuted' in sound, false);
  sound.play('move'); sound.play('capture'); sound.play('check');
  assert.equal(taps, 5); sound.destroy();
});
