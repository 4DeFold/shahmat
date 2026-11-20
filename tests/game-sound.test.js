import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGameSound } from '../pages/game-sound.js';

test('recorded piece sounds vary by piece and captures play two hits', async () => {
  const plays=[], scheduled=[];
  class Audio {
    constructor(src){this.src=src;}
    load(){} pause(){} addEventListener(){}
    cloneNode(){return new Audio(this.src);}
    play(){plays.push({src:this.src,rate:this.playbackRate,volume:this.volume});return Promise.resolve();}
  }
  const sound=createGameSound({Audio,setTimeout:fn=>(scheduled.push(fn),scheduled.length),clearTimeout(){}});
  sound.prime();sound.play({piece:'p'});sound.play({piece:'q'});sound.play({piece:'r'});
  assert.match(plays[0].src,/elboss/);assert.match(plays[1].src,/alabaster/);
  assert.notEqual(plays[1].rate,plays[2].rate);
  sound.play({piece:'q',captured:'p'});assert.equal(plays.length,4);scheduled.pop()();assert.equal(plays.length,5);assert.match(plays[4].src,/alabaster/);
  assert.equal('setMuted' in sound,false);sound.destroy();
  for(const file of ['elboss-piece-placement.mp3','mh2o-alabaster.wav','NOTICE.txt'])assert.ok((await readFile(`public/sounds/chess/${file}`)).length>100);
});
