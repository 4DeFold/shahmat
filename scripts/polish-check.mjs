import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4270';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const id='12345678-1234-1234-1234-123456789012',user={id,aud:'authenticated',role:'authenticated',user_metadata:{}},token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
 for(const size of [{width:390,height:844},{width:1440,height:900}]) {
  const page=await browser.newPage({viewport:size,reducedMotion:'no-preference'});
  await page.addInitScript(({s,id})=>{localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(s));const now=new Date().toISOString();localStorage.setItem(`shahmat.bot-games.v1.${id}`,JSON.stringify({current:{id:'fixture',user_id:id,level:1,moves:['e4','e5'],status:'active',started_at:now,updated_at:now},pending:[]}));window.Worker=class{postMessage(m){if(m==='uci')setTimeout(()=>this.onmessage?.({data:'uciok'}),0);if(m==='isready')setTimeout(()=>this.onmessage?.({data:'readyok'}),0);}terminate(){}};},{s:session,id});
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
   const p=new URL(route.request().url()).pathname, req=route.request();
   if(p==='/auth/v1/user')return route.fulfill({json:user});
   if(p==='/rest/v1/profiles')return route.fulfill({json:{username:'Alice'}});
   if(p.endsWith('/rank_leaderboard')||p.endsWith('/rank_my_position')){const mode=req.postDataJSON().p_mode, score=mode==='overall'?1000:mode==='blitz'?1200:900;return route.fulfill({json:[{username:'Alice',yar:score,elo:score,place:1,ranked:true}]});}
   if(p.endsWith('/my_archive_all'))return route.fulfill({json:Array.from({length:30},(_,i)=>({id:`game${i}`,mode:'bot',level:1,my_color:'w',moves:['e4','e5'],result:'draw'}))});
   if(p.endsWith('/my_archive_ratings')||p.includes('/profile_'))return route.fulfill({json:[]});
   if(p==='/functions/v1/matchplay')return route.fulfill({json:{game:null}});
   return route.fulfill({json:[]});
  });
  await page.goto(base+'/rating'); await page.locator('.rating-row').first().waitFor();await page.locator('.rating-self:not([hidden])').waitFor();
  assert.equal(await page.locator('.rating-score').first().getAttribute('data-animated'),null);
  await page.locator('[data-rating-mode=blitz]').click();await page.locator('.rating-score.rating-animating').first().waitFor();await page.locator('.rating-self-score.rating-animating').waitFor();
  let samples=await page.evaluate(async()=>{const a=document.querySelector('.rating-score'),b=document.querySelector('.rating-self-score'),out=[];for(let i=0;i<24;i++){await new Promise(requestAnimationFrame);out.push([a.dataset.animated,b.dataset.animated]);}return out;});
  const parse=s=>Number((s||'').replace(/\D/g,''));assert.ok(samples.every(([a,b])=>parse(a)>=1000&&parse(a)<=1200&&parse(b)>=1000&&parse(b)<=1200),JSON.stringify(samples));assert.ok(new Set(samples.map(a=>a[0])).size>5,'row ticker has intermediate values');
  await page.locator('[data-rating-mode=rapid]').click();await page.waitForFunction(()=>document.querySelector('.rating-score')?.textContent==='900');
  samples=await page.evaluate(async()=>{const a=document.querySelector('.rating-score');const out=[];for(let i=0;i<15;i++){await new Promise(requestAnimationFrame);out.push(a.dataset.animated);}return out;});assert.ok(samples.filter(Boolean).every(x=>parse(x)>=900&&parse(x)<=1200),JSON.stringify(samples));
  await page.goto(base+'/bot'); const bot=page.frameLocator('#bot-game-frame');await bot.locator('#bot-app[data-phase=playing]').waitFor();const board=await bot.locator('#board').boundingBox();if(size.width===390)assert.ok(board.width>size.width*.9,`board should be wide: ${board.width}`);
  await page.goto(base+'/archive');const frame=page.frameLocator('#archive-frame');await frame.locator('.archive-card.is-ready').first().waitFor();const before=await frame.locator('.archive-card.is-ready').count();assert.equal(before,30,'archive cards render without relying on intersection observers');
  const last=frame.locator('.archive-card').last();await last.scrollIntoViewIfNeeded();await last.waitFor({state:'visible',timeout:12000});assert.equal(await frame.locator('.archive-card.is-ready').count(),before);
  await page.close();
 }
 console.log('✓ Current-to-target tickers, wide mobile bot board, archive rendering and scroll');
}finally{await browser.close();}
