// Actual browser animation and layout checks against mocked Supabase, no writes.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),...(process.env.CHROMIUM_EXTRA_ARGS?{args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')}:{})});
const user={id:'12345678-1234-1234-1234-123456789012',aud:'authenticated',role:'authenticated',user_metadata:{palette:'monochrome'}};
const token=['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
 for (const size of [{width:390,height:844},{width:1440,height:900}]) for(const reducedMotion of ['no-preference','reduce']) {
  const page=await browser.newPage({viewport:size,reducedMotion});
  await page.addInitScript(v=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(v)),session);
  let metadata={...user.user_metadata};
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/auth/v1/user') { if(route.request().method()==='PUT') metadata={...metadata,...route.request().postDataJSON().data}; return route.fulfill({json:{...user,user_metadata:metadata}}); }
   if(path==='/rest/v1/profiles') return route.fulfill({json:{username:'Alice',bio:'',palette:'monochrome'}});
   if(path==='/rest/v1/rpc/rank_my_position') return route.fulfill({json:[{username:'Alice',yar:1200,elo:1000,ranked:true,place:1}]});
   if(path==='/rest/v1/rpc/rank_leaderboard') { const mode=route.request().postDataJSON().p_mode; return route.fulfill({json:[{username:'Alice',yar:mode==='rapid'?1450:1200,elo:1000,ranked:true},{username:'Bob',yar:1100,elo:990,ranked:true}]}); }
   return route.fulfill({json:{game:null}});
  });
  await page.goto(`${base}/settings`); await page.locator('#rank-setting').waitFor({state:'visible'});
  const control=page.locator('#rank-unit-options'); assert.ok((await control.boundingBox()).height<=33,'compact toggle');
  const samples=await page.evaluate(async ()=>{
    const panel=document.querySelector('#rank-info'), button=document.querySelector('#rank-info-button');
    const heights=[]; const sample=()=>heights.push(panel.getBoundingClientRect().height);
    sample(); button.click(); sample();
    for(let i=0;i<40;i++){ await new Promise(requestAnimationFrame); sample(); }
    return heights;
  });
  assert.ok(samples.at(-1)>70,`help fully opens: ${samples}`);
  if(reducedMotion==='no-preference') {
    assert.ok(samples[1]<1,`no instant height jump: ${samples.slice(0,4)}`);
    assert.ok(samples.slice(2,-1).some(h=>h>3 && h<samples.at(-1)-3),'help expands continuously');
    assert.ok(samples.slice(1).every((h,i)=>h-samples[i]<samples.at(-1)*.35),`no multi-pixel snap: ${samples}`);
   const closing=await page.evaluate(async ()=>{const panel=document.querySelector('#rank-info'); const heights=[panel.getBoundingClientRect().height]; document.querySelector('#rank-info-button').click(); heights.push(panel.getBoundingClientRect().height); for(let i=0;i<40;i++){await new Promise(requestAnimationFrame); heights.push(panel.getBoundingClientRect().height);} return heights;});
   assert.ok(Math.abs(closing[1]-closing[0])<1,'no snap on closing');
   assert.ok(closing.some(h=>h>3 && h<closing[0]-3) && closing.at(-1)<1,'help collapses continuously');
  }
  const movement=await page.evaluate(async ()=>{
    const before=getComputedStyle(document.querySelector('#rank-unit-options'),'::before').transform;
    document.querySelector('#rank-unit-options input[value=elo]').click();
    const values=[]; for(let i=0;i<30;i++){await new Promise(requestAnimationFrame); values.push(getComputedStyle(document.querySelector('#rank-unit-options'),'::before').transform);} return {before,values};
  });
  if(reducedMotion==='no-preference') assert.ok(new Set(movement.values).size>4,'pill slides across, not jumps');
  else assert.equal(new Set(movement.values).size,1,'pill respects reduced motion');
  assert.equal(await control.locator('input[value=elo]').isChecked(),true);
  // Test accumulated wheel input and an in-between animation position.
  await page.locator('#palette-scroll').scrollIntoViewIfNeeded();
  const strip=page.locator('#palette-scroll');
  const scrolling=await strip.evaluate(async el=>{
    el.scrollLeft=0; el.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}));
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return {reduced:true};
    const values=[];for(let i=0;i<50;i++){await new Promise(requestAnimationFrame);values.push(el.scrollLeft);} return {values};
  });
  if(scrolling.values) { assert.ok(scrolling.values.at(-1)>100); assert.ok(scrolling.values[0]<scrolling.values.at(-1)-10,`wheel scroll eases: ${scrolling.values}`); }
  await page.evaluate(()=>document.querySelector('#nav-rating').click()); await page.locator('#page-rating').waitFor({state:'visible'});
  await page.locator('.rating-row').first().waitFor();
  assert.equal(await page.locator('.rating-unit').innerText(),'ЭЛО');
  // Text is always readable to assistive tech even while pseudo-elements animate.
  assert.equal(await page.locator('.rating-player').first().textContent(),'Alice');
  if(reducedMotion==='no-preference') {
    await page.locator('.rating-player.rating-animating').first().waitFor();
    const count=await page.locator('.rating-score').first().getAttribute('data-animated'); assert.notEqual(count,null);
    await page.locator('.rating-player.rating-animating').first().waitFor({state:'hidden',timeout:1200});
  } else assert.equal(await page.locator('.rating-animating').count(),0);
  await page.locator('[data-rating-mode=rapid]').click();
  await page.waitForFunction(()=>document.querySelector('.rating-score')?.textContent.includes('1 000'));
  if(reducedMotion==='no-preference') { await page.locator('.rating-player.rating-animating').first().waitFor({timeout:1000}); await page.locator('.rating-animating').first().waitFor({state:'hidden',timeout:1200}); }
  // Cached modes and returning to the rating both replay, without changing accessible text.
  await page.locator('[data-rating-mode=overall]').click();
  if(reducedMotion==='no-preference') { await page.locator('.rating-player.rating-animating').first().waitFor(); await page.locator('.rating-player.rating-animating').first().waitFor({state:'hidden',timeout:1200}); }
  await page.evaluate(()=>document.querySelector('[data-page=settings]').click()); await page.locator('#rank-setting').waitFor({state:'visible'});
  await page.evaluate(()=>document.querySelector('#nav-rating').click()); await page.locator('#page-rating').waitFor({state:'visible'});
  if(reducedMotion==='no-preference') {
    await page.locator('.rating-player.rating-animating').first().waitFor({timeout:1000});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>!document.querySelector('.rating-animating'));
  }
  await page.close();
 }
 console.log('✓ Compact Fluid Tabs, smooth help expansion, wheel easing, ticker and hyper-text; mobile and reduced motion');
} finally {await browser.close();}
