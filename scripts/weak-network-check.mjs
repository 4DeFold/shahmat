import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const browser=await ({chromium,firefox,webkit})[process.env.BROWSER||'chromium'].launch({headless:true,...(process.env.CHROMIUM_PATH&&(!process.env.BROWSER||process.env.BROWSER==='chromium')?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4271';
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('shahmat.piece-set','fantasy'));
 let release;const gate=new Promise(r=>release=r);let count=0,failed=false;
 await page.route('**/piece-packs/**',async route=>{count++;const url=route.request().url();if(url.includes('fantasy-')){await gate;return route.continue()}if(url.includes('firi-')&&!failed){failed=true;return route.abort()}return route.continue()});
 await page.route('https://lichess.org/**',r=>r.abort());
 await page.goto(base+'/pages/puzzles.html');await page.locator('#board .piece').first().waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('#board .piece')].every(i=>i.complete&&i.naturalWidth>0));
 assert.equal(await page.locator('#board .piece:not([data-piece-pack=cburnett])').count(),0,'a slow theme never makes half the pieces disappear');
 assert.equal(count,1,'one request for the entire selected set');
 release();await page.locator('#board .piece[data-piece-pack=fantasy]').first().waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('#board .piece')].every(i=>i.dataset.piecePack==='fantasy'&&i.complete&&i.naturalWidth>0));
 assert.equal(count,1);
 await page.evaluate(()=>{localStorage.setItem('shahmat.piece-set','firi');window.dispatchEvent(new Event('shahmat-piece-set'))});
 await page.waitForFunction(()=>[...document.querySelectorAll('#board .piece')].every(i=>i.dataset.piecePack==='cburnett'&&i.complete&&i.naturalWidth>0));
 await page.waitForTimeout(200);assert.ok(failed);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.waitForFunction(()=>[...document.querySelectorAll('#board .piece')].every(i=>i.dataset.piecePack==='firi'&&i.complete&&i.naturalWidth>0));
 assert.equal(count,3);assert.deepEqual(errors,[]);await page.close();console.log('✓ complete board on delayed and failed networks; one pack per theme and recovery');
}finally{await browser.close()}
