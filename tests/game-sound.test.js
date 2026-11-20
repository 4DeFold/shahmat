import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGameSound } from '../pages/game-sound.js';

test('short ceramic recordings vary by piece; capture is one dry impact', async () => {
  const plays=[];
  class Audio {
    constructor(src){this.src=src;}
    load(){} pause(){} addEventListener(){}
    cloneNode(){return new Audio(this.src);}
    play(){plays.push({src:this.src,rate:this.playbackRate,volume:this.volume,preservesPitch:this.preservesPitch});return Promise.resolve();}
  }
  const sound=createGameSound({Audio});
  sound.prime();sound.play({piece:'p'});sound.play({piece:'q'});sound.play({piece:'r'});
  assert.match(plays[0].src,/ceramic-light/);assert.match(plays[1].src,/ceramic-heavy/);
  assert.notEqual(plays[1].rate,plays[2].rate);assert.equal(plays[1].preservesPitch,false);
  sound.play({piece:'q',captured:'p'});assert.equal(plays.length,4);assert.ok(plays[3].volume>plays[1].volume);
  assert.equal('setMuted' in sound,false);sound.destroy();sound.play({piece:'p'});assert.equal(plays.length,4);
  for(const file of ['ceramic-light.wav','ceramic-medium.wav','ceramic-heavy.wav']){
    const wav=await readFile(`public/sounds/chess/${file}`);
    assert.equal(wav.toString('ascii',0,4),'RIFF');assert.ok(wav.readUInt32LE(40)/wav.readUInt32LE(28)<.12,'short recording with no lingering echo');
  }
});
