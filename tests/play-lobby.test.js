import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {Chess} from 'chess.js';
import {createPlayLobby,lastThree,controls} from '../pages/play-lobby.js';
const html=await readFile('pages/game.html','utf8');
test('demo validates real mates and exposes exactly the final three plies',()=>{
 const moves=['f3','e5','g4','Qh4#'], last=lastThree(moves);
 assert.deepEqual(last.moves,['e5','g4','Qh4#']);const chess=new Chess(last.fen);for(const move of last.moves)chess.move(move);assert.equal(chess.isCheckmate(),true);
 assert.equal(lastThree(['e4','e5','Nf3']),null);assert.equal(lastThree(['invalid','e5','Qh4#']),null);
});
test('lobby steps preserve kind and exact time; custom is disabled and back works',async()=>{
 const dom=new JSDOM(html,{url:'https://example.com',pretendToBeVisual:true});let selected;
 const lobby=createPlayLobby({document:dom.window.document,client:{rpc:async()=>({data:[{moves:['f3','e5','g4','Qh4#']}]})},onChoose:value=>{selected=value;return true;}});
 try{
  await lobby.activate();const d=dom.window.document;
  assert.equal(d.querySelectorAll('.kind-card').length,2);
  d.querySelector('[data-kind=friendly]').click();assert.equal(d.querySelectorAll('.choice-card').length,5);assert.equal(d.querySelector('.choice-card:disabled').textContent.includes('Кастом'),true);
  d.querySelectorAll('.choice-card')[1].click();assert.equal(d.querySelectorAll('.time-card').length,4);assert.deepEqual(controls.blitz,['3+0','3+2','5+0','5+3']);
  d.getElementById('lobby-back').click();assert.equal(d.querySelectorAll('.choice-card').length,5);
  d.querySelectorAll('.choice-card')[1].click();d.querySelectorAll('.time-card')[1].click();
  assert.deepEqual(selected,{kind:'friendly',mode:'blitz',timeControl:'3+2'});assert.equal(d.getElementById('play-lobby').hidden,true);
 } finally {lobby.destroy();dom.window.close();}
});
