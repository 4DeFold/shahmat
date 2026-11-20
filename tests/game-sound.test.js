import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGameSound } from '../pages/game-sound.js';

test('only moves and captures play CC0 chess recordings, once per move', async () => {
  const plays=[];
  class Audio {
    constructor(src){this.src=src;} load(){} pause(){} addEventListener(){}
    cloneNode(){return new Audio(this.src);}
    play(){plays.push({src:this.src,volume:this.volume});return Promise.resolve();}
  }
  const sound=createGameSound({Audio});sound.prime();assert.equal(plays.length,0);
  assert.equal('effect' in sound,false);
  sound.play({piece:'p'});sound.play({piece:'q'});sound.play({piece:'r',captured:'p'});
  assert.equal(plays.length,3);assert.match(plays[0].src,/move\.mp3$/);assert.equal(plays[0].src,plays[1].src);
  assert.match(plays[2].src,/capture\.wav$/);sound.destroy();sound.play({});assert.equal(plays.length,3);
  const wav=await readFile('public/sounds/chess/capture.wav');assert.equal(wav.toString('ascii',0,4),'RIFF');
  assert.ok((await readFile('public/sounds/chess/move.mp3')).length>1000);
});
