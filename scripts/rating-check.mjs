import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),...(process.env.CHROMIUM_EXTRA_ARGS ? {args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')} : {})});
const user={id:'12345678-1234-1234-1234-123456789012',aud:'authenticated',role:'authenticated',user_metadata:{}};
const token=['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
  for (const viewport of [{width:280,height:800},{width:390,height:844},{width:800,height:900},{width:1440,height:900}]) {
    for (const reducedMotion of ['reduce','no-preference']) {
      const page=await browser.newPage({viewport,reducedMotion});
      await page.addInitScript(v=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(v)),session);
      await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
        const path=new URL(route.request().url()).pathname;
        if (path==='/auth/v1/user') return route.fulfill({json:user});
        if (path==='/rest/v1/profiles') return route.fulfill({json:{username:'Player',bio:'',palette:'monochrome'}});
        if (path==='/rest/v1/rpc/yar_leaderboard') {
          const mode=route.request().postDataJSON().p_mode;
          return route.fulfill({json:[{username:'Player_One',yar:mode==='rapid'?1250:1100,ranked:true},{username:'New_Player',yar:1000,ranked:false}]});
        }
        return route.fulfill({json:{game:null}});
      });
      await page.goto(`${base}/home`); await page.locator('#dashboard-home').waitFor({state:'visible'});
      if (viewport.width<=700) await page.locator('#mobile-menu-toggle').click();
      const play=await page.locator('#nav-play').boundingBox(), rating=await page.locator('#nav-rating').boundingBox();
      assert.ok(rating.y>=play.y+play.height-1,'rating follows play');
      await page.locator('#nav-rating').click(); await page.locator('#page-rating').waitFor({state:'visible'});
      await page.locator('.rating-row').first().waitFor();
      assert.equal(new URL(page.url()).pathname,'/rating');
      assert.equal(await page.locator('.rating-score').first().innerText(),'1 100');
      await page.locator('[data-rating-mode=rapid]').click();
      await page.waitForFunction(()=>document.querySelector('.rating-score')?.textContent.includes('250'));
      assert.equal(await page.locator('[data-rating-mode=rapid]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('.rating-place').nth(1).innerText(),'—');
      const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
      assert.ok(widths.scroll<=widths.client,`no page overflow ${viewport.width}: ${JSON.stringify(widths)}`);
      await page.reload(); await page.locator('#page-rating').waitFor({state:'visible'}); await page.locator('.rating-row').first().waitFor();
      await page.close();
    }
  }
  console.log('✓ Rating route, filters, calibration, adaptive layout and reduced motion');
} finally { await browser.close(); }
