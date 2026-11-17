// Browser checks use mocks: feedback and rating do not touch live data.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),...(process.env.CHROMIUM_EXTRA_ARGS?{args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')}:{})});
const base=process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const user={id:'12345678-1234-1234-1234-123456789012',aud:'authenticated',role:'authenticated',user_metadata:{palette:'forest'}};
const token=['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
  for (const viewport of [{width:390,height:844},{width:1440,height:900}]) {
    const page=await browser.newPage({viewport,reducedMotion:'reduce'}); let submitted=0;
    await page.addInitScript(v=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(v)),session);
    await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/auth/v1/user') return route.fulfill({json:user});
      if(path==='/rest/v1/profiles') return route.fulfill({json:{username:'Player',bio:'',palette:'forest'}});
      if(path==='/rest/v1/rpc/yar_leaderboard') return route.fulfill({json:Array.from({length:100},(_,i)=>({username:`Player_${i}`,yar:2000-i,ranked:true}))});
      if(path==='/rest/v1/rpc/yar_my_position') return route.fulfill({json:[{username:'Player',yar:999,ranked:true,place:125}]});
      if(path==='/rest/v1/rpc/submit_feedback') { submitted++; return route.fulfill({json:null}); }
      return route.fulfill({json:{game:null}});
    });
    await page.goto(`${base}/rating`); await page.locator('.rating-self').waitFor({state:'visible'});
    assert.equal(await page.locator('.rating-self-place').innerText(),'125');
    await page.evaluate(()=>window.scrollTo(0, 2000));
    const rect=await page.locator('.rating-self').boundingBox();
    assert.ok(rect.y>=0 && rect.y+rect.height<=viewport.height+1,`own row remains in viewport while scrolling: ${JSON.stringify({rect,viewport,scroll:await page.evaluate(()=>scrollY)})}`);
    await page.goto(`${base}/help`); await page.locator('#feedback-form').waitFor({state:'visible'});
    await page.locator('#feedback-message').fill('There is a bug'); await page.locator('#feedback-form button').click();
    await page.locator('#feedback-status').filter({hasText:'отправлено'}).waitFor(); assert.equal(submitted,1);
    await page.goto(`${base}/profile`); await page.locator('#page-profile').waitFor({state:'visible'});
    assert.equal(await page.locator('#page-profile').evaluate(el=>el.children.length),0);
    await page.goto(`${base}/settings`); await page.locator('#dashboard-palettes').waitFor({state:'visible'});
    assert.equal(await page.locator('#dashboard-palettes input').count(),10);
    await page.close();
  }
  console.log('✓ Personal sticky rating, feedback, empty profile and 10 palettes at mobile and desktop');
} finally { await browser.close(); }
