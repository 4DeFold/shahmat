// Browser coverage for hover, click and stage animations, including reduced motion.
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const name=process.env.BROWSER||'chromium', browser=await ({chromium,firefox,webkit})[name].launch({headless:true});
const user={id:'12345678-1234-1234-1234-123456789012',aud:'authenticated',role:'authenticated',user_metadata:{}};
const token=['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4271';
try {
 for(const motion of ['no-preference','reduce']){
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:motion});
  await page.addInitScript(s=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(s)),session);
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
   const p=new URL(route.request().url()).pathname;
   const fulfill=opts=>route.fulfill({...opts,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',...opts.headers}});
   if(route.request().method()==='OPTIONS')return fulfill({status:204,body:''});
   if(p==='/auth/v1/user')return fulfill({json:user});
   if(p.endsWith('/play_demo_games'))return fulfill({json:[{moves:['f3','e5','g4','Qh4#']}]});
   if(p.endsWith('/play_lobby_online_counts'))return fulfill({json:[]});
   if(p==='/functions/v1/matchplay')return fulfill({json:{game:null}});
   return fulfill({json:[]});
  });
  await page.goto(`${base}/pages/game.html`);
  const kind=page.locator('#lobby-stage [data-kind=rated]');await kind.waitFor({state:'visible'});
  assert.equal(await kind.locator('.lobby-pixels i').count(),32);
  await kind.hover();
  if(motion==='no-preference'){
   await page.waitForTimeout(400);
   const state=await kind.evaluate(el=>({spotlight:parseFloat(getComputedStyle(el,'::before').opacity),pixels:parseFloat(getComputedStyle(el.querySelector('.lobby-pixels')).opacity),paused:getComputedStyle(el.querySelector('.lobby-pixels i')).animationPlayState,mouse:el.style.getPropertyValue('--mx')}));
   assert.ok(state.spotlight>.5&&state.pixels>.5&&state.paused==='running'&&state.mouse.endsWith('px'),JSON.stringify(state));
  }
  await kind.click();await page.locator('#lobby-stage .choice-card').first().waitFor();
  assert.equal(await page.locator('#lobby-stage .choice-card').count(),5);
  if(motion==='no-preference'){
   assert.equal(await page.locator('.lobby-ghost[aria-hidden=true]').count(),1);
   assert.ok(await page.locator('.lobby-ghost .lobby-ripple').count()>0);
  }else assert.equal(await page.locator('.lobby-ghost').count(),0);
  assert.equal(await page.locator('#lobby-stage .choice-card').nth(2).locator('svg g').getAttribute('stroke-width'),'1.05');
  await page.locator('#lobby-stage .choice-card').nth(1).click();await page.locator('#lobby-stage .time-card').first().waitFor();
  assert.equal(await page.locator('#lobby-stage .time-card .lobby-pixels i').count(),128);
  await page.locator('#lobby-back').click();await page.locator('#lobby-stage .choice-card').nth(1).waitFor();
  await page.close();
 }
 console.log(`✓ ${name}: pixel hover, press ripple, stage transitions and reduced motion`);
}finally{await browser.close()}
