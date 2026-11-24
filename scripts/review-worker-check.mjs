// Exercise the actual single-threaded browser Worker across a full sequence.
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const browser=await ({chromium,firefox,webkit})[process.env.BROWSER||'chromium'].launch({headless:true,...(process.env.CHROMIUM_PATH&&(!process.env.BROWSER||process.env.BROWSER==='chromium')?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4270';
try{
 const page=await browser.newPage();await page.goto(base+'/pages/puzzles.html');
 const result=await page.evaluate(async()=>{
  const [{createReviewEngine},{Chess}]=await Promise.all([import('/pages/review-engine.js'),import('/node_modules/.vite/deps/chess__js.js')]);
  const chess=new Chess(),fens=[chess.fen()];for(const san of ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7','Re1','b5','Bb3','d6','c3','O-O','h3','Nb8','d4','Nbd7','c4','c6','Nc3']){chess.move(san);fens.push(chess.fen())}
  const e=createReviewEngine(),results=[];try{for(const fen of fens)results.push(await e.evaluate(fen));}finally{e.destroy()};return results;
 });
 assert.equal(result.length,24);assert.ok(result.every(x=>Number.isFinite(x.cp)&&Number.isFinite(x.win)&&x.win>=0&&x.win<=100));
 console.log('✓ real Stockfish Worker evaluated 24 consecutive positions');await page.close();
}finally{await browser.close()}
