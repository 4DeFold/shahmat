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
  await kind.hover();
  if(motion==='no-preference'){
   await page.waitForTimeout(350);
   const state=await kind.evaluate(el=>({spotlight:parseFloat(getComputedStyle(el,'::before').opacity),mouse:el.style.getPropertyValue('--mx')}));
   assert.ok(state.spotlight>.5&&state.mouse.endsWith('px'),JSON.stringify(state));
  }
  assert.equal(await page.locator('#lobby-nav, .lobby-pixels, .lobby-ripple').count(),0);
  await kind.click();await page.locator('#lobby-stage .choice-card').first().waitFor();
  assert.equal(await page.locator('#lobby-stage .choice-card').count(),5);
  if(motion==='no-preference'){
   const morph=await page.evaluate(()=>{
    const ghost=document.querySelector('.lobby-ghost'),incoming=document.querySelector('#lobby-stage .choice-card'),back=document.querySelector('#lobby-back');
    const chosen=ghost?.querySelector('[data-kind=rated]'),sibling=ghost?.querySelector('[data-kind=friendly]');
    const frames=el=>el?.getAnimations()[0]?.effect.getKeyframes()||[];
    return {ghost:!!ghost,ghostZ:getComputedStyle(ghost).zIndex,rootZ:getComputedStyle(document.querySelector('#play-lobby')).zIndex,
      incoming:frames(incoming),chosen:frames(chosen),sibling:frames(sibling),back:frames(back)};
   });
   assert.ok(morph.ghost&&Number(morph.ghostZ)<Number(morph.rootZ),JSON.stringify(morph));
   assert.match(morph.incoming[0].transform,/translate/);assert.match(morph.chosen.at(-1).transform,/scale\(1.13/);
   assert.match(morph.sibling.at(-1).filter,/blur/);assert.ok(morph.back.length>=2);
  }else assert.equal(await page.locator('.lobby-ghost').count(),0);
  assert.equal(await page.locator('#lobby-stage .choice-card').nth(2).locator('svg g').getAttribute('stroke-width'),'1.05');
  await page.locator('#lobby-stage .choice-card').nth(1).click();await page.locator('#lobby-stage .time-card').first().waitFor();
  await page.locator('#lobby-back').click();await page.locator('#lobby-stage .choice-card').nth(1).waitFor();
  if(motion==='no-preference'){
   const reverse=await page.evaluate(()=>{const ghost=document.querySelector('.lobby-ghost'),target=document.querySelector('#lobby-stage [data-mode=blitz]');return {count:ghost?.children.length,z:getComputedStyle(ghost).zIndex,root:getComputedStyle(document.querySelector('#play-lobby')).zIndex,frames:ghost?.children[0].getAnimations()[0]?.effect.getKeyframes(),target:target?.getAnimations()[0]?.effect.getKeyframes()};});
   assert.equal(reverse.count,4);assert.ok(Number(reverse.z)<Number(reverse.root));assert.match(reverse.frames.at(-1).transform,/translate/);assert.ok(reverse.target.length>=3);
  }else assert.equal(await page.locator('.lobby-ghost').count(),0);
  await page.locator('#lobby-back').click();await page.locator('#lobby-stage .kind-card').first().waitFor();
  assert.equal(await page.locator('#lobby-back').isHidden(),true);
  if(motion==='no-preference')assert.equal(await page.locator('.lobby-back[aria-hidden=true]').count(),1);
  assert.equal(await page.locator('#lobby-nav, .lobby-pixels, .lobby-ripple').count(),0);
  await page.close();
 }
 console.log(`✓ ${name}: spotlight, shared-element transitions, back button and reduced motion`);
}finally{await browser.close()}
