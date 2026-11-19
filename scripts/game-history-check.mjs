// End-to-end regression using mock match snapshots; no live writes.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4193';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
const id='12345678-1234-1234-1234-123456789012',user={id,aud:'authenticated',role:'authenticated',user_metadata:{}};
const token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
let game=null;
try {
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await page.addInitScript(session=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(session)),{access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user});
 await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/auth/v1/user') return route.fulfill({json:user});
  if(path==='/rest/v1/profiles') return route.fulfill({json:{username:'Alice',bio:'',palette:'monochrome'}});
  if(path==='/rest/v1/rpc/rank_my_position') return route.fulfill({json:[{username:'Alice',yar:1234,elo:1100}]});
  if(path==='/rest/v1/rpc/rank_game_players') return route.fulfill({json:[{player:'self',username:'Alice',yar:1234,elo:1100},{player:'opponent',username:'Bob',yar:1010,elo:1000}]});
  if(path==='/rest/v1/rpc/profile_public') return route.fulfill({json:{username:route.request().postDataJSON().p_name,bio:'',palette:'monochrome',theme:'light'}});
  if(path==='/rest/v1/rpc/rank_leaderboard') return route.fulfill({json:[{username:'Alice',yar:1234},{username:'Bob',yar:1010}]});
  if(path==='/functions/v1/matchplay') { const action=route.request().postDataJSON().action; if(action==='opponent')return route.fulfill({json:{username:'Bob'}}); if(action==='search')game={id:'game',white_id:id,black_id:'other',mode:'blitz',moves:['e4','e5','Nf3'],turn:'b',version:3,status:'active',white_ms:180000,black_ms:180000,game_age_ms:60000}; return route.fulfill({json:{game}}); }
  return route.fulfill({json:[]});
 });
 await page.goto(`${base}/game`); const frame=page.frameLocator('#member-game-frame'); await frame.locator('[data-square=e2]').waitFor();
 await frame.locator('#player-rating').filter({hasText:'1 234'}).waitFor();
 const e2=await frame.locator('[data-square=e2]').boundingBox(),e4=await frame.locator('[data-square=e4]').boundingBox();
 await page.mouse.move(e2.x+e2.width/2,e2.y+e2.height/2);await page.mouse.down({button:'right'});await page.mouse.move(e4.x+e4.width/2,e4.y+e4.height/2);await page.mouse.up({button:'right'});
 assert.equal(await frame.locator('.annotation-item').count(),0,'drawing is disabled before match');
 await frame.locator('label:has(input[value=blitz])').click();await frame.locator('#start-search').click();await frame.locator('[data-history-index="3"]').waitFor();
 await page.locator('#nav-play').focus();await page.keyboard.press('a'); await frame.locator('[data-history-index="2"].current').waitFor();
 game={...game,moves:['e4','e5','Nf3','Nc6'],turn:'w',version:4}; await frame.locator('[data-history-index="4"]').waitFor({timeout:4000});
 assert.equal(await frame.locator('[data-history-index="2"].current').count(),1);assert.equal(await frame.locator('[data-square=b8] .piece').count(),1);
 await page.keyboard.press('ArrowRight');await frame.locator('[data-history-index="3"].current').waitFor();
 await frame.locator('#opponent-profile-trigger').hover(); await frame.locator('#opponent-profile-card').waitFor({state:'visible'}); await frame.locator('#opponent-profile-card').click();
 await page.waitForURL('**/profile');
 console.log('✓ Idle rating and drawing restriction, embedded history keys and incoming move preservation, opponent card navigation');
} finally {await browser.close();}
