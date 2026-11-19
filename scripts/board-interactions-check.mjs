// Browser regression: local-only mocks, no live match or database writes.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4192';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox']});
const uid='12345678-1234-1234-1234-123456789012', user={id:uid,aud:'authenticated',role:'authenticated',user_metadata:{}};
const token=['e30',Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
async function arrow(page,from,to) {
 const a=await page.locator(`[data-square=${from}]`).boundingBox(),b=await page.locator(`[data-square=${to}]`).boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down({button:'right'});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});await page.mouse.up({button:'right'});
}
async function mark(page,square) { const r=await page.locator(`[data-square=${square}]`).boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2,{button:'right'}); }
async function annotations(page) {
 await arrow(page,'e2','e4'); assert.equal(await page.locator('[data-annotation="e2-e4"]').count(),1);
 await mark(page,'d5');assert.equal(await page.locator('[data-annotation="d5-d5"] circle').count(),1);
 const board=page.locator('#board'),r=await board.boundingBox();
 const hit=await page.locator('[data-annotation="e2-e4"] line').evaluate(el=>{const r=el.getBoundingClientRect(),a=document.querySelector('[data-square=e2]').getBoundingClientRect();return Math.hypot(r.x+r.width/2-(a.x+a.width/2),r.y+r.height/2-(a.y+a.height/2));});
 assert.ok(hit<r.width*.2,'arrow starts at the selected cell, including flipped boards');
 await arrow(page,'e2','e4');assert.equal(await page.locator('[data-annotation="e2-e4"]').count(),0);
 await page.locator('[data-square=e2]').click();assert.equal(await board.locator('.annotation-item').count(),0);
}
try {
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  const page=await browser.newPage({viewport,reducedMotion:'reduce'});await page.addInitScript(()=>{Math.random=()=>0.1;});
  await page.goto(`${base}/pages/play.html`);await page.locator('[data-square=e2]').waitFor();await annotations(page);await page.close();
 }
 const guestBlack=await browser.newPage({viewport:{width:1200,height:850},reducedMotion:'reduce'});
 await guestBlack.addInitScript(()=>{Math.random=()=>0.9;});
 await guestBlack.goto(`${base}/pages/play.html`);await guestBlack.locator('[data-square=e2]').waitFor();await annotations(guestBlack);await guestBlack.close();
 // Stockfish is replaced with a deterministic delayed worker, preserving the UI's real protocol.
 const page=await browser.newPage({viewport:{width:1200,height:850},reducedMotion:'reduce'});
 await page.addInitScript(value=>{
   localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(value));
   window.Worker=class { postMessage(msg){ if(msg==='uci')setTimeout(()=>this.onmessage?.({data:'uciok'}),0);if(msg==='isready')setTimeout(()=>this.onmessage?.({data:'readyok'}),0);if(msg.startsWith('go '))setTimeout(()=>this.onmessage?.({data:'bestmove d7d5'}),1800); } terminate(){} };
 },session);
 await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/auth/v1/user')return route.fulfill({json:user});
  if(path==='/rest/v1/bot_games')return route.fulfill({json:route.request().method()==='GET'?[]:{}});
  if(path==='/rest/v1/profile_rewards')return route.fulfill({json:{avatar_unlocked:false}});
  return route.fulfill({json:{}});
 });
 await page.goto(`${base}/pages/bot-game.html`);await page.locator('#bot-play:not([disabled])').waitFor();await page.locator('#bot-play').click();await page.locator('#bot-app[data-phase=playing]').waitFor();
 await annotations(page);await page.locator('[data-square=e2]').click();await page.locator('[data-square=e2]').click();await page.locator('[data-square=e4]').click();
 await page.locator('[data-square=e4]').click();await page.locator('[data-square=d5]').click();assert.equal(await page.locator('[data-square=d5].premove').count(),1);
 await page.waitForFunction(()=>document.querySelector('[data-square=d5] img')?.getAttribute('src')?.includes('wP'),null,{timeout:6000});
 assert.equal(await page.locator('#board .premove').count(),0);await page.close();
 // Black online board is rotated via CSS, unlike the guest board's reordered cells.
 const online=await browser.newPage({viewport:{width:1200,height:850},reducedMotion:'reduce'});await online.addInitScript(value=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(value)),session);
 const game={id:'fixture',white_id:'other',black_id:uid,mode:'blitz',moves:['e4'],turn:'b',version:1,status:'active',white_ms:180000,black_ms:180000,game_age_ms:60000};
 await online.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/auth/v1/user')return route.fulfill({json:user});if(path==='/functions/v1/matchplay'){const body=route.request().postDataJSON();return route.fulfill({json:body.action==='opponent'?{username:'Friend'}:{game}});}if(path.includes('rank_game_players'))return route.fulfill({json:[]});return route.fulfill({json:{}});});
 await online.goto(`${base}/pages/game.html`);await online.locator('#board.black').waitFor({timeout:10000});await annotations(online);await online.close();
 console.log('✓ Guest, Stockfish bot and flipped online board: arrows, marks, clearing and capture premove');
} finally {await browser.close();}
