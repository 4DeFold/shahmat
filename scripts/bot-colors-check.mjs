import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4270';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
const id='12345678-1234-1234-1234-123456789012',user={id,aud:'authenticated',role:'authenticated',user_metadata:{}},token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.'),session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
 for(const side of ['w','b']) {
  const page=await browser.newPage({reducedMotion:'reduce'}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({session,side})=>{localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(session));Math.random=()=>side==='w'?.1:.9;
   window.Worker=class{constructor(){this.whiteMoves=0}postMessage(m){if(m==='uci')setTimeout(()=>this.onmessage?.({data:'uciok'}),0);if(m==='isready')setTimeout(()=>this.onmessage?.({data:'readyok'}),0);if(m.startsWith('position fen '))this.fen=m;if(m.startsWith('go '))setTimeout(()=>this.onmessage?.({data:'bestmove '+(this.fen.includes(' b ')?'e7e5':(this.whiteMoves++?'g1f3':'e2e4'))}),0)}terminate(){}};
  },{session,side});
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',async route=>{const p=new URL(route.request().url()).pathname;
   if(p==='/auth/v1/user')return route.fulfill({json:user});if(p==='/rest/v1/profiles')return route.fulfill({json:{username:'Alice'}});
   if(p==='/rest/v1/bot_games'&&route.request().method()==='POST'){writes.push(route.request().postDataJSON());return route.fulfill({status:201,json:null});}
   if(p==='/rest/v1/profile_media'||p==='/rest/v1/profile_rewards')return route.fulfill({json:null});return route.fulfill({json:[]});
  });
  await page.goto(base+'/pages/bot-game.html');await page.locator('#bot-play:not([disabled])').waitFor();await page.locator('#bot-play').click();await page.locator('#bot-app[data-phase=playing]').waitFor();
  assert.equal(await page.locator('#board').evaluate(el=>el.classList.contains('black')),side==='b');
  if(side==='b'){await page.locator('[data-square=e7]').click();await page.locator('[data-square=e5]').click();assert.ok(await page.locator('[data-square=e5].premove').count());await page.locator('[data-history-index="2"]').waitFor({state:'attached',timeout:8000});}
  assert.equal((await page.evaluate(id=>JSON.parse(localStorage.getItem('shahmat.bot-games.v1.'+id)).current,id)).player_color,side);
  if(side==='w'){await page.locator('[data-square=e2]').click();await page.locator('[data-square=e4]').click();}
  await page.waitForFunction(({id,n})=>JSON.parse(localStorage.getItem('shahmat.bot-games.v1.'+id)).current.moves.length>=n,{id,n:side==='w'?1:2});
  await page.reload();await page.locator('#bot-app[data-phase=playing]').waitFor();assert.equal(await page.locator('#board').evaluate(el=>el.classList.contains('black')),side==='b');assert.ok(writes.some(w=>w.player_color===side));assert.deepEqual(errors,[]);await page.close();
 }
 // A black player's checkmate is a win and unlocks the next level.
 const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({id,session})=>{const now=new Date().toISOString();localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(session));localStorage.setItem('shahmat.bot-games.v1.'+id,JSON.stringify({current:{id:'12345678-aaaa-aaaa-aaaa-123456789012',user_id:id,player_color:'b',level:1,moves:['f3','e5','g4'],status:'active',started_at:now,updated_at:now},pending:[]}));},{id,session});
 await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{const p=new URL(route.request().url()).pathname;if(p==='/auth/v1/user')return route.fulfill({json:user});if(p==='/rest/v1/profiles')return route.fulfill({json:{username:'Alice'}});if(p==='/rest/v1/profile_media'||p==='/rest/v1/profile_rewards')return route.fulfill({json:null});return route.fulfill({json:[]});});
 await page.goto(base+'/pages/bot-game.html');await page.locator('#bot-app[data-phase=playing]').waitFor();await page.locator('[data-square=d8]').click();await page.locator('[data-square=h4]').click();await page.locator('#bot-app[data-phase=finished]').waitFor();assert.match(await page.locator('#status').textContent(),/Вы победили/);const stored=await page.evaluate(id=>JSON.parse(localStorage.getItem('shahmat.bot-games.v1.'+id)),id);assert.equal(stored.current.status,'black_win');assert.ok(stored.wins.includes(1));assert.deepEqual(errors,[]);await page.close();
 console.log('✓ White/black selection, bot opening, black premove, persistence, restore and black win');
}finally{await browser.close();}
