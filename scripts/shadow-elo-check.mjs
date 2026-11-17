import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),...(process.env.CHROMIUM_EXTRA_ARGS?{args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')}:{})});
const id='12345678-1234-1234-1234-123456789012';
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
  const page=await context.newPage(); let metadata={palette:'monochrome'};
  const user=()=>({id,aud:'authenticated',role:'authenticated',user_metadata:metadata});
  const token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
  await page.addInitScript(s=>{ if (!localStorage.getItem('sb-eswyxbyddkajysogtglp-auth-token')) localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(s)); },{access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user:user()});
  const game={id:'12345678-1234-1234-1234-123456789099',white_id:id,black_id:'other',mode:'rapid',moves:[],turn:'w',version:0,status:'active',white_ms:600000,black_ms:600000,game_age_ms:10000};
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
   const req=route.request(), p=new URL(req.url()).pathname;
   if(p==='/auth/v1/user') { if(req.method()==='PUT') metadata={...metadata,...JSON.parse(req.postData()).data}; return route.fulfill({json:user()}); }
   if(p==='/rest/v1/profiles') return route.fulfill({json:{username:'Alice',bio:'',palette:'monochrome'}});
   if(p==='/rest/v1/rpc/rank_leaderboard') return route.fulfill({json:[{username:'Alice',yar:1200,elo:990,ranked:true},{username:'Bob',yar:1100,elo:1300,ranked:true}]});
   if(p==='/rest/v1/rpc/rank_my_position') return route.fulfill({json:[{username:'Alice',yar:1200,elo:990,ranked:true,place:1}]});
   if(p==='/rest/v1/rpc/rank_game_players') return route.fulfill({json:[{player:'self',username:'Alice',yar:1200,elo:990},{player:'opponent',username:'Bob',yar:1100,elo:1300}]});
   if(p==='/functions/v1/matchplay') {const b=JSON.parse(req.postData());return route.fulfill({json:b.action==='opponent'?{username:'Bob',bio:''}:{game}});}
   return route.fulfill({json:{}});
  });
  await page.goto(`${base}/settings`); await page.locator('#rank-setting').waitFor({state:'visible'});
  if (!mobile) {
   await page.locator('#rank-setting-title').hover(); await page.waitForTimeout(700); assert.equal(await page.locator('#rank-info').isHidden(),true);
   await page.locator('#rank-info').waitFor({state:'visible',timeout:1500});
   await page.mouse.move(0,0); await page.locator('#rank-info').waitFor({state:'hidden'});
  } else { await page.locator('#rank-setting-title').tap(); assert.equal(await page.locator('#rank-info').isVisible(),true); }
  await page.locator('label:has(input[name=rank-unit][value=elo])').click();
  await page.waitForFunction(()=>localStorage.getItem('shahmat.appearance.12345678-1234-1234-1234-123456789012')?.includes('"rankUnit":"elo"'));
  await page.waitForTimeout(300); await page.goto(`${base}/rating`); await page.locator('.rating-row').first().waitFor();
  assert.match(await page.locator('.rating-unit').innerText(),/ЭЛО/);
  assert.deepEqual(await page.locator('.rating-player').allInnerTexts(),['Alice','Bob']);
  assert.deepEqual((await page.locator('.rating-score').allInnerTexts()).map(x=>x.replace(/\s/g,'')),['990','1300']);
  await page.goto(`${base}/game`);
  const frame=page.frameLocator('#member-game-frame'); await frame.locator('#player-rating').filter({hasText:'990'}).waitFor();
  assert.equal(await frame.locator('#player-name').innerText(),'Alice'); assert.match((await frame.locator('#opponent-rating').innerText()).replace(/\s/g,''),/1300/);
  assert.match(await frame.locator('#player-rating').innerText(),/Эло/);
  const nameBox=await frame.locator('#player-name').boundingBox(), ratingBox=await frame.locator('#player-rating').boundingBox();
  assert.ok(Math.abs(nameBox.y-ratingBox.y)<5 && ratingBox.x>=nameBox.x+nameBox.width-1, 'rating sits next to the username');
  await page.evaluate(()=>document.querySelector('[data-page=settings]').click()); await page.locator('#rank-setting').waitFor({state:'visible'});
  await page.locator('label:has(input[name=rank-unit][value=yar])').click();
  await page.evaluate(()=>document.querySelector('#nav-play').click());
  await frame.locator('#player-rating').filter({hasText:'ЯР'}).waitFor();
  assert.match((await frame.locator('#player-rating').innerText()).replace(/\s/g,''),/1200ЯР/);
  await context.close();
 }
 console.log('✓ Unit setting persists, hover/touch help works, ranking order stays by ЯР and game names show the selected score');
} finally { await browser.close(); }
