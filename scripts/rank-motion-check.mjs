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
   if(path==='/rest/v1/rpc/rank_leaderboard') { const mode=route.request().postDataJSON().p_mode; return route.fulfill({json:[{username:'Alice',yar:mode==='rapid'?1450:1200,elo:1000,ranked:true},{username:'Игрок',yar:1100,elo:990,ranked:false}]}); }
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
   const closing=await page.evaluate(async ()=>{const panel=document.querySelector('#rank-info'); const heights=[panel.getBoundingClientRect().height]; document.querySelector('#rank-info-button').click(); heights.push(panel.getBoundingClientRect().height); for(let i=0;i<40;i++){await new Promise(requestAnimationFrame); heights.push(panel.getBoundingClientRect().height);} return heights;});
   assert.ok(Math.abs(closing[1]-closing[0])<1,'no snap on closing');
   assert.ok(closing.some(h=>h>3 && h<closing[0]-3) && closing.at(-1)<1,'help collapses continuously');
  }
  const movement=await page.evaluate(async ()=>{
    const button=document.querySelector('#rank-unit-swap'), track=document.querySelector('.rank-swap-track');
    const before=getComputedStyle(track).transform; button.click();
    const values=[]; for(let i=0;i<75;i++){await new Promise(requestAnimationFrame); values.push(getComputedStyle(track).transform);} return {before,values};
  });
  if(reducedMotion==='no-preference') assert.ok(new Set(movement.values).size>4,'text slides vertically rather than jumping');
  else assert.equal(new Set(movement.values).size,1,'swap respects reduced motion');
  assert.equal(await control.locator('input[value=elo]').isChecked(),true);
  assert.match(await page.locator('#rank-unit-swap').getAttribute('aria-label'),/Эло.*Яры/);
  await page.locator('#rank-unit-swap').focus(); await page.keyboard.press('Space');
  assert.equal(await control.locator('input[value=yar]').isChecked(),true);
  await page.keyboard.press('Enter');
  assert.equal(await control.locator('input[value=elo]').isChecked(),true);
  // Test accumulated wheel input and an in-between animation position.
  await page.locator('#palette-scroll').scrollIntoViewIfNeeded();
  const strip=page.locator('#palette-scroll');
  const scrolling=await strip.evaluate(async el=>{
    if(el.scrollWidth <= el.clientWidth) return {noOverflow:true};
    el.scrollLeft=0; el.dispatchEvent(new WheelEvent('wheel',{deltaX:120,bubbles:true,cancelable:true}));
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return {reduced:true};
    const values=[];for(let i=0;i<50;i++){await new Promise(requestAnimationFrame);values.push(el.scrollLeft);} return {values, max:el.scrollWidth-el.clientWidth};
  });
  if(scrolling.values) { assert.ok(scrolling.values.at(-1)>Math.min(100,scrolling.max*.8), `wheel scroll target: ${JSON.stringify(scrolling)}`); assert.ok(scrolling.values[0]<scrolling.values.at(-1)-10,`wheel scroll eases: ${scrolling.values}`); }
  await page.evaluate(()=>document.querySelector('#nav-rating').click()); await page.locator('#page-rating').waitFor({state:'visible'});
  await page.locator('.rating-row').first().waitFor();
  assert.equal(await page.locator('.rating-unit').innerText(),'ЭЛО');
  // Text is always readable to assistive tech even while pseudo-elements animate.
  assert.equal(await page.locator('.rating-player').first().textContent(),'Alice');
  assert.equal(await page.locator('.rating-place').nth(1).textContent(),'2');
  assert.equal(await page.locator('.rating-top').count(),0);
  if(reducedMotion==='no-preference') {
    await page.locator('.rating-player.rating-animating').first().waitFor();
    const count=await page.locator('.rating-score').first().getAttribute('data-animated'); assert.notEqual(count,null);
    const frames=await page.evaluate(async ()=>{
      const score=document.querySelector('.rating-score'), name=document.querySelectorAll('.rating-player')[1];
      const scores=[],names=[],colors=[],heights=[];
      const start=performance.now(); while(performance.now()-start<1000) {
        await new Promise(requestAnimationFrame);
        scores.push(score.dataset.animated); names.push(name.dataset.animated);
        colors.push({active:score.classList.contains('rating-animating'), color:getComputedStyle(score).color});
        heights.push(score.closest('.rating-row').getBoundingClientRect().height);
      } return {scores,names,colors,heights};
    });
    assert.ok(new Set(frames.scores.filter(Boolean)).size>15, 'ticker updates at frame rate');
    assert.ok(new Set(frames.names.filter(Boolean)).size>10, 'Cyrillic name scrambles at frame rate');
    assert.ok(frames.colors.some(x=>!x.active), 'animation completes');
    assert.ok(frames.colors.filter(x=>!x.active).every(x=>!x.color.includes('rgba') || !x.color.endsWith(', 0)')), 'no invisible/fading final score');
    assert.ok(Math.max(...frames.heights)-Math.min(...frames.heights)<1, 'row height stays stable throughout animation');
  } else assert.equal(await page.locator('.rating-animating').count(),0);
  await page.locator('[data-rating-mode=rapid]').click();
  await page.waitForFunction(()=>document.querySelector('.rating-score')?.textContent.includes('1 000'));
  // The leaderboard deliberately reuses existing rows when modes change.
  await page.waitForFunction(()=>document.querySelector('[data-rating-mode=rapid]').getAttribute('aria-pressed')==='true');
  await page.locator('[data-rating-mode=overall]').click();
  await page.waitForFunction(()=>document.querySelector('[data-rating-mode=overall]').getAttribute('aria-pressed')==='true');
  assert.equal(await page.locator('.rating-player').first().textContent(),'Alice');
  await page.close();
 }
 console.log('✓ Swap Text, smooth help expansion, wheel easing, ticker and hyper-text; mobile and reduced motion');
} finally {await browser.close();}
