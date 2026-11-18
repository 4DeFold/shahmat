// Browser acceptance for the static profile concept; Supabase is mocked.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),...(process.env.CHROMIUM_EXTRA_ARGS?{args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')}:{})});
const uid='12345678-1234-1234-1234-123456789012', user={id:uid,aud:'authenticated',role:'authenticated',user_metadata:{palette:'forest',palette_theme:'dark'}};
const token=['e30',Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
 for(const [viewport,reducedMotion] of [[{width:1440,height:900},'no-preference'],[{width:390,height:844},'no-preference'],[{width:280,height:800},'no-preference'],[{width:844,height:390},'reduce']]) {
  const page=await browser.newPage({viewport,reducedMotion}); const errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(value=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(value)),session);
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if (route.request().method()!=='GET' && path==='/rest/v1/profiles') writes.push(path);
   if(path==='/auth/v1/user') return route.fulfill({json:user});
   if(path==='/rest/v1/profiles') return route.fulfill({json:{username:'Alice',bio:'Private',palette:'forest'}});
   return route.fulfill({json:{game:null}});
  });
  await page.goto(`${base}/profile`); await page.locator('#page-profile').waitFor({state:'visible'});
  assert.equal(await page.locator('#profile-palette-name').textContent(),'Лес');
  assert.equal(await page.locator('#profile-theme-name').textContent(),'Тёмная тема');
  assert.match(await page.locator('#page-profile').innerText(),/ДЕМО/);
  assert.match(await page.locator('#page-profile').innerText(),/1 284/);
  assert.match(await page.locator('#page-profile').innerText(),/86/);
  assert.equal(await page.locator('#page-profile button, #page-profile a, #page-profile input').count(),0);
  assert.equal(await page.locator('.profile-reveal').first().evaluate(el=>getComputedStyle(el).animationName),reducedMotion==='reduce'?'none':'profile-reveal');
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no horizontal overflow at ${viewport.width}`);
  assert.equal(await page.locator('.profile-portrait img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  if(process.env.PROFILE_SCREENSHOTS) await page.screenshot({path:`/tmp/profile-${viewport.width}.png`,fullPage:true});
  if(viewport.width===1440) {
   await page.locator('.sidebar-brand').click(); await page.locator('#dashboard-home').waitFor({state:'visible'});
   await page.locator('#account-toggle').click(); await page.locator('#account-menu [data-page=profile]').click();
   await page.locator('#page-profile').waitFor({state:'visible'});
   assert.equal(await page.locator('.profile-reveal').first().evaluate(el=>getComputedStyle(el).animationName),'profile-reveal','entry animation replays on return');
  }
  assert.deepEqual(writes,[]); assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('✓ Profile demo, palette, motion, layout and no profile writes');
} finally { await browser.close(); }
