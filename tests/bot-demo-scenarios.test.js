import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {BOT_DEMO_SCENARIOS} from '../pages/bot-demo-scenarios.js';
test('orbit scenarios are unique, legal and include distinct mate and stalemate positions',()=>{
  assert.ok(BOT_DEMO_SCENARIOS.length>8);
  assert.equal(new Set(BOT_DEMO_SCENARIOS.map(s=>JSON.stringify(s))).size,BOT_DEMO_SCENARIOS.length);
  let mates=0, stalemates=0;
  for(const scenario of BOT_DEMO_SCENARIOS) {
    const game=new Chess(scenario.fen);
    for(const move of scenario.moves) assert.ok(game.move(move));
    if(game.isCheckmate()) mates++;
    if(game.isStalemate()) stalemates++;
  }
  assert.ok(mates>=2); assert.ok(stalemates>=1);
});
