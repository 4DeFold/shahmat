import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {Chess} from 'chess.js';
import {THEMES,parsePuzzles,blankProgress,loadProgress,recordResult,puzzleStats,choosePuzzle,createPuzzleAttempt} from '../pages/puzzle-model.js';
const data=JSON.parse(readFileSync('public/puzzles/tactics.json')),puzzles=parsePuzzles(data);
test('1000 distinct licensed puzzles, eight well-stocked themes and legal full lines',()=>{
 assert.equal(data.license.includes('CC0'),true);assert.equal(puzzles.length,1000);assert.equal(new Set(puzzles.map(x=>x.id)).size,1000);assert.equal(THEMES.length,8);
 for(const [theme] of THEMES)assert.ok(puzzles.filter(p=>p.themes.includes(theme)).length>=125,theme);
 for(const p of puzzles){const chess=new Chess(p.fen);for(const uci of p.moves)assert.ok(chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]}),p.id);}
});
test('correct solver moves alternate with opponent replies and illegal moves do not damage position',()=>{
 const p=puzzles.find(x=>x.moves.length>=4),a=createPuzzleAttempt(p),initial=a.chess.fen();assert.equal(a.play('a1a8').status,'illegal');assert.equal(a.chess.fen(),initial);
 while(!a.finished){const result=a.play(a.expected);assert.ok(['solved','correct'].includes(result.status));if(result.status==='correct')assert.ok(a.reply());}assert.equal(a.failed,false);
});
test('wrong legal move rolls back and remains a failed attempt',()=>{
 const p=puzzles.find(x=>{const a=createPuzzleAttempt(x);return a.chess.moves({verbose:true}).length>1}),a=createPuzzleAttempt(p);const legal=a.chess.moves({verbose:true}).find(m=>m.from+m.to+(m.promotion||'')!==a.expected),fen=a.chess.fen();
 assert.equal(a.play(legal.from+legal.to+(legal.promotion||'')).status,'wrong');assert.equal(a.failed,true);assert.equal(a.chess.fen(),fen);
});
test('rating records once, stays isolated, filters and chooses unseen themed puzzles',()=>{
 const p=puzzles[0],progress=blankProgress();assert.equal(recordResult(progress,p,false,1000).success,false);const rating=progress.rating;assert.equal(recordResult(progress,p,true,1001),null);assert.equal(progress.rating,rating);assert.equal(puzzleStats(progress,0).total,1);assert.equal(puzzleStats(progress,30,1000+31*86400000).total,0);
 const store={getItem:k=>k==='alice'?JSON.stringify(progress):null};assert.equal(loadProgress(store,'alice').rating,rating);assert.equal(loadProgress(store,'bob').rating,1500);
 const theme=THEMES[0][0],choice=choosePuzzle(puzzles,theme,progress,()=>0);assert.ok(choice.themes.includes(theme));assert.notEqual(choice.id,p.id);
});
