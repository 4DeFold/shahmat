import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const browser=await ({chromium,firefox,webkit})[process.env.BROWSER||'chromium'].launch({headless:true,...(process.env.CHROMIUM_PATH&&(!process.env.BROWSER||process.env.BROWSER==='chromium')?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4271';
try{
 for(const reducedMotion of ['no-preference','reduce']){
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.motionDiagnostics={boardAnimations:0,unnecessaryScans:0};
   const original=Element.prototype.animate;Element.prototype.animate=function(...args){if(this.matches?.('#board .square, #board .piece'))window.motionDiagnostics.boardAnimations++;return original.apply(this,args)};
   const query=Element.prototype.querySelectorAll;Element.prototype.querySelectorAll=function(selector){if((this.matches?.('.m-shard,.m-burst,.m-spark,.m-ripple-host')||this.closest?.('#board'))&&(selector==='.board'||selector.startsWith('#status, ')))window.motionDiagnostics.unnecessaryScans++;return query.call(this,selector)};
  });
  await page.route('https://lichess.org/**',route=>route.abort());await page.goto(base+'/pages/puzzles.html');
  const piece=page.locator('#board .piece[data-board-color=w]').first();await piece.waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('#board .piece')].every(i=>i.complete&&i.naturalWidth>0));
  assert.ok(await page.evaluate(()=>window.motionDiagnostics.boardAnimations)<=2,'board entrance must not animate dozens of pieces or squares separately');
  if(reducedMotion==='no-preference'){
   await piece.hover();await page.waitForTimeout(450);assert.ok(Number(await piece.evaluate(el=>getComputedStyle(el).scale))>1,'hover feedback works with bundled figure data');
  }
  await page.evaluate(()=>{for(let i=0;i<12;i++){const overlay=document.createElement('span');overlay.className='m-shard';document.body.append(overlay)}const img=document.createElement('img');img.className='piece';document.querySelector('#board .square').append(img)});
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.motionDiagnostics.unnecessaryScans),0,'piece and effect nodes must not trigger descendant discovery scans');
  assert.deepEqual(errors,[]);await page.close();
  console.log(`✓ motion ${reducedMotion}: complete board, efficient observers and hover`);
 }
}finally{await browser.close()}
