// End-of-game UI and replay, using mocked Supabase; no real ratings are changed.
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const name=process.env.BROWSER||'chromium',browser=await ({chromium,firefox,webkit})[name].launch({headless:true});
const user={id:'12345678-1234-1234-1234-123456789012',aud:'authenticated',role:'authenticated',user_metadata:{}};
const token=['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
const game={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',white_id:user.id,black_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',mode:'rapid',game_kind:'rated',time_control:'10+5',status:'finished',result:'white_win',reason:'resignation',turn:'w',version:2,moves:['e4','e5'],white_ms:590000,black_ms:585000,game_age_ms:80000};
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4271';
try{
 for(const [width,height,action] of [[1440,900,'new-game'],[390,844,'other-mode']]){
  const page=await browser.newPage({viewport:{width,height}}),requests=[];
  await page.addInitScript(s=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(s)),session);
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
   const request=route.request(),p=new URL(request.url()).pathname;
   const fulfill=opts=>route.fulfill({...opts,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',...opts.headers}});
   if(request.method()==='OPTIONS')return fulfill({status:204,body:''});
   if(p==='/auth/v1/user')return fulfill({json:user});
   if(p==='/functions/v1/matchplay'){const body=request.postDataJSON();requests.push(body);return fulfill({json:body.action==='search'?{state:'searching'}:{game}});}
   if(p.endsWith('/rank_game_players'))return fulfill({json:[{player:'self',username:'Player',yar:1000,elo:1200},{player:'opponent',username:'Opponent',yar:1000,elo:1200}]});
   if(p.endsWith('/rank_game_result'))return fulfill({json:[{player:'self',before_yar:1000,after_yar:1020,before_elo:1200,after_elo:1210},{player:'opponent',before_yar:1000,after_yar:980,before_elo:1200,after_elo:1190}]});
   if(p.endsWith('/play_demo_games')||p.endsWith('/play_lobby_online_counts'))return fulfill({json:[]});
   return fulfill({json:[]});
  });
  await page.goto(`${base}/pages/game.html`);await page.locator('#new-game').waitFor({state:'visible'});
  await page.locator('#player-rating-delta').waitFor({state:'visible'});assert.equal(await page.locator('#player-rating-delta').innerText(),'+20 ЯР');
  assert.equal(await page.locator('#opponent-rating-delta').innerText(),'−20 ЯР');assert.ok(await page.locator('#player-rating-delta').evaluate(el=>el.classList.contains('positive')));
  await page.waitForFunction(()=>document.querySelector('#player-rating').textContent.includes('1 020'),null,{timeout:5000});
  assert.ok((await page.locator('#opponent-rating').innerText()).includes('980'));
  if(width===390){const delta=await page.locator('#player-rating-delta').boundingBox(),clock=await page.locator('#player-clock-card').boundingBox();assert.ok(delta&&clock&&delta.x+delta.width<=clock.x+1,JSON.stringify({delta,clock}));}
  await page.locator('#'+action).click();
  if(action==='new-game')await page.waitForFunction(()=>document.querySelector('#cancel-search')&&!document.querySelector('#cancel-search').hidden);
  else {await page.locator('#lobby-stage [data-control="10+5"]').waitFor({state:'visible'});assert.equal(await page.locator('#lobby-stage .time-card').count(),4);}
  if(action==='new-game')assert.ok(requests.some(body=>body.action==='search'&&body.mode==='rapid'&&body.timeControl==='10+5'&&body.gameKind==='rated'));
  await page.close();
 }
 console.log(`✓ ${name}: rating changes, replay and mode selection`);
}finally{await browser.close()}
