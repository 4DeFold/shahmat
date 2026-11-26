import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {Chess} from 'chess.js';import {chromium,firefox,webkit} from 'playwright';
const browser=await ({chromium,firefox,webkit})[process.env.BROWSER||'chromium'].launch({headless:true,...(process.env.CHROMIUM_PATH&&(!process.env.BROWSER||process.env.BROWSER==='chromium')?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4271',id='12345678-1234-1234-1234-123456789012',user={id,aud:'authenticated',role:'authenticated',user_metadata:{}},token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
const puzzles=JSON.parse(readFileSync('public/puzzles/tactics.json')).puzzles.map(row=>{const [id,fen,moves]=row.split('|');return {id,fen,moves:moves.split(' ')}});
let remote=null,offline=false,fullReads=0,revisionReads=0;
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'};
async function makePage(reducedMotion='no-preference'){
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(session=>{localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(session));window.puzzleAnimations=[];window.ratingFrames=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches?.('#board .piece'))window.puzzleAnimations.push({frames,options});return animate.call(this,frames,options)};document.addEventListener('DOMContentLoaded',()=>{const el=document.getElementById('puzzle-rating');new MutationObserver(()=>window.ratingFrames.push(Number(el.textContent))).observe(el,{childList:true,characterData:true,subtree:true})});},session);
 await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
  const request=route.request(),u=new URL(request.url()),method=request.method();if(method==='OPTIONS')return route.fulfill({status:204,headers});if(u.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});
  if(u.pathname==='/rest/v1/puzzle_progress'){
   if(offline)return route.abort();const full=u.searchParams.get('select')?.includes('progress');if(full)fullReads++;else revisionReads++;
   return route.fulfill({json:remote?(full?remote:{revision:remote.revision}):null,headers});
  }
  if(u.pathname==='/rest/v1/rpc/save_puzzle_progress'){
   if(offline)return route.abort();const body=request.postDataJSON(),current=remote||{revision:0,progress:null};
   if(body.p_expected_revision!==current.revision)return route.fulfill({json:{accepted:false,...current},headers});
   remote={revision:current.revision+1,progress:body.p_progress};return route.fulfill({json:{accepted:true,...remote},headers});
  }
  return route.fulfill({json:[],headers});
 });
 await page.route('https://lichess.org/**',route=>route.abort());await page.goto(base+'/pages/puzzles.html');await page.locator('#puzzle-turn').getByText(/Ход/).waitFor();return {page,context,errors};
}
try{
 const a=await makePage();await a.page.waitForFunction(()=>window.puzzleAnimations.length>0);assert.equal((await a.page.evaluate(()=>window.puzzleAnimations)).length,1,'the previous move animates as one piece');
 await a.page.waitForFunction(()=>{const tab=sessionStorage.getItem('shahmat.puzzle.tab');return JSON.parse(localStorage.getItem('shahmat.puzzles.12345678-1234-1234-1234-123456789012.sync.'+tab)||'{}').pending===false});
 const p=puzzles.find(x=>x.id===remote.progress.current.id);assert.ok(p);const b=await makePage('reduce');assert.equal(await b.page.locator('#board').getAttribute('data-puzzle-id'),p.id);
 assert.equal(await b.page.evaluate(()=>window.puzzleAnimations.length),0,'reduced motion');
 const noFull=fullReads;await b.page.waitForTimeout(2200);assert.ok(revisionReads>=2);assert.equal(fullReads,noFull,'unchanged state polls revisions, not history');
 const game=new Chess(p.fen);game.move({from:p.moves[0].slice(0,2),to:p.moves[0].slice(2,4),promotion:p.moves[0][4]});const wrong=game.moves({verbose:true}).find(m=>!m.promotion&&m.from+m.to!==p.moves[1]);assert.ok(wrong);
 await a.page.locator(`[data-square=${wrong.from}]`).click();await a.page.locator(`[data-square=${wrong.to}]`).click();await a.page.locator('#puzzle-status').getByText('Ошибка').waitFor();
 await b.page.waitForFunction(()=>document.querySelector('#puzzle-status').textContent==='Ошибка',{timeout:6000});assert.equal(await b.page.locator('#puzzle-rating').textContent(),String(remote.progress.rating));
 await a.page.waitForTimeout(1200);const frames=await a.page.evaluate(()=>window.ratingFrames);assert.ok(new Set(frames).size>2,JSON.stringify(frames));assert.equal(frames.at(-1),remote.progress.rating);
 const rows=await a.page.locator('.puzzle-move-row').count();assert.ok(rows>=1);assert.ok(await a.page.locator('.puzzle-move-number').first().textContent());
 offline=true;await a.page.locator('[data-view=themes]').click();await a.page.locator('.puzzle-theme-card').nth(1).click();const offlineId=await a.page.locator('#board').getAttribute('data-puzzle-id');await a.page.locator('#puzzle-sync-status').getByText(/Не удалось/).waitFor();offline=false;
 await b.page.waitForFunction(id=>document.querySelector('#board').dataset.puzzleId===id,offlineId,{timeout:8000});assert.equal(remote.progress.current.id,offlineId);
 assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);await a.context.close();await b.context.close();console.log('✓ two devices: current puzzle, results, offline recovery, animation, revision polling and reduced motion');
}finally{await browser.close()}
