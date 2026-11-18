import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),...(process.env.CHROMIUM_EXTRA_ARGS ? {args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')} : {})});
const user={id:'12345678-1234-1234-1234-123456789012',aud:'authenticated',role:'authenticated',user_metadata:{}};
const token=['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const avatar='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS/8AAAAASUVORK5CYII=';
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
  for (const viewport of [{width:280,height:800},{width:390,height:844},{width:800,height:900},{width:1440,height:900}]) {
    for (const reducedMotion of ['reduce','no-preference']) {
      const page=await browser.newPage({viewport,reducedMotion});
      await page.addInitScript(v=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(v)),session);
      const modes=[];
      await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
        const path=new URL(route.request().url()).pathname;
        if (path==='/auth/v1/user') return route.fulfill({json:user});
        if (path==='/rest/v1/profiles') return route.fulfill({json:{username:'Player',bio:'',palette:'monochrome'}});
        if (path==='/rest/v1/rpc/profile_public') return route.fulfill({json:{username:'Player_One',bio:'Привет',palette:'forest',theme:'dark',avatar,banner:avatar,ratings:{overall:1100,blitz:1100,rapid:1000,classical:1000,daily:1000},games:{blitz:2,rapid:0,classical:0,daily:0,bot:1}}});
        if (path==='/rest/v1/rpc/profile_avatars') return route.fulfill({json:[{username:'Player_One',avatar}]});
        if (path==='/rest/v1/rpc/rank_leaderboard') {
          const mode=route.request().postDataJSON().p_mode; modes.push(mode);
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
      await page.locator('.rating-row .rating-avatar.has-custom-avatar').first().waitFor();
      assert.equal(await page.locator('.rating-row .rating-avatar').first().getAttribute('src'),avatar);
      assert.equal(new URL(page.url()).pathname,'/rating');
      assert.equal(await page.locator('.rating-score').first().innerText(),'1 100');
      await page.waitForFunction(() => { const el=document.querySelector('.rating-indicator.is-ready'); return el && Number(getComputedStyle(el).opacity)>0; });
      const opacity = await page.locator('.rating-indicator').evaluate(el => getComputedStyle(el).opacity);
      assert.ok(Number(opacity)>0, 'selected mode indicator is visible');
      const motion = await page.locator('.rating-indicator').evaluate(el => getComputedStyle(el).transitionDuration);
      assert.equal(parseFloat(motion)>0,reducedMotion !== 'reduce','indicator respects reduced motion');
      const entered=await page.locator('.rating-heading').evaluate(el=>getComputedStyle(el).animationName);
      assert.equal(entered!=='none',reducedMotion!=='reduce','entry respects reduced motion');
      await page.locator('[data-rating-mode=rapid]').click();
      await page.waitForFunction(()=>document.querySelector('.rating-score')?.textContent.includes('250'));
      assert.equal(await page.locator('[data-rating-mode=rapid]').getAttribute('aria-pressed'),'true');
      await page.waitForFunction(() => { const i=document.querySelector('.rating-indicator').getBoundingClientRect(), b=document.querySelector('[data-rating-mode=rapid]').getBoundingClientRect(); return Math.abs(i.left-b.left)<1 && Math.abs(i.top-b.top)<1 && Math.abs(i.width-b.width)<1; });
      await page.locator('[data-rating-mode=overall]').focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.querySelector('.rating-score')?.textContent.includes('100'));
      assert.deepEqual(modes,['overall','rapid'],'switching back to a fresh mode uses the cache');
      await page.locator('[data-rating-mode=daily]').click();
      await page.waitForFunction(() => { const i=document.querySelector('.rating-indicator').getBoundingClientRect(), b=document.querySelector('[data-rating-mode=daily]').getBoundingClientRect(); return Math.abs(i.left-b.left)<1 && Math.abs(i.top-b.top)<1 && Math.abs(i.width-b.width)<1; });
      assert.equal(await page.locator('.rating-place').nth(1).innerText(),'2');
      const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
      assert.ok(widths.scroll<=widths.client,`no page overflow ${viewport.width}: ${JSON.stringify(widths)}`);
      if(viewport.width===1440&&reducedMotion==='reduce'){
        await page.locator('.rating-profile-trigger').first().focus(); await page.locator('.player-mini-card').waitFor({state:'visible'}); await page.getByText('Привет').waitFor();
        assert.equal(await page.locator('.player-mini-card').getAttribute('data-profile-palette'),'forest'); assert.equal(await page.locator('.player-mini-card').getAttribute('data-profile-theme'),'dark'); assert.equal(await page.locator('.player-mini-banner img').getAttribute('src'),avatar);
        await page.locator('.player-mini-card button').click(); await page.locator('#page-profile').waitFor({state:'visible'}); await page.locator('#profile-display-name').getByText('Player_One').waitFor();
        assert.equal(await page.locator('#page-profile').getAttribute('data-profile-theme'),'dark'); assert.equal(await page.locator('#profile-palette-name').textContent(),'Лес'); assert.equal(await page.locator('.landing').getAttribute('data-palette'),'monochrome'); await page.locator('#profile-back').click();
      }
      await page.goto(`${base}/rating`); await page.locator('#page-rating').waitFor({state:'visible'}); await page.locator('.rating-row').first().waitFor();
      await page.close();
    }
  }
  console.log('✓ Rating route, filters, calibration, adaptive layout and reduced motion');
} finally { await browser.close(); }
