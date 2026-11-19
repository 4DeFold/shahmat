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
      await page.addInitScript(()=>{window.__scoreFrames=[];new MutationObserver(records=>{for(const r of records)if(r.target.matches?.('.rating-score,.rating-self-score')&&r.target.dataset.animated)window.__scoreFrames.push(r.target.dataset.animated)}).observe(document,{attributes:true,attributeFilter:['data-animated'],subtree:true});});
      const modes=[];
      await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
        const path=new URL(route.request().url()).pathname;
        if (path==='/auth/v1/user') return route.fulfill({json:user});
        if (path==='/rest/v1/profiles') return route.fulfill({json:{username:'Player',bio:'',palette:'monochrome'}});
        if (path==='/rest/v1/rpc/profile_public') { const who=route.request().postDataJSON().p_name; return route.fulfill({json:{username:who,bio:who==='Player_One'?'Привет':'',palette:'forest',theme:'dark',avatar,banner:avatar,ratings:{overall:1100,blitz:1100,rapid:1000,classical:1000},games:{blitz:2,rapid:0,classical:0,bot:1}}}); }
        if (path==='/rest/v1/rpc/profile_avatar_themes') return route.fulfill({json:[{username:'LongestName_123456789012',palette:'amber'}]});
        if (path==='/rest/v1/rpc/profile_avatars') return route.fulfill({json:[{username:'Player_One',avatar}]});
        if (path==='/rest/v1/rpc/rank_my_position') return route.fulfill({json:[{username:'Player',yar:1000,elo:1000,ranked:true,place:3}]});
        if (path==='/rest/v1/rpc/rank_leaderboard') {
          const mode=route.request().postDataJSON().p_mode; modes.push(mode);
          return route.fulfill({json:[{username:'Player_One',yar:mode==='rapid'?1250.4:1100.8,ranked:true},{username:'LongestName_123456789012',yar:1000,ranked:false}]});
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
      assert.equal(await page.locator('.rating-avatar').nth(1).getAttribute('src'),'/pieces/cburnett/wN.svg');await page.waitForFunction(()=>document.querySelectorAll('.rating-avatar')[1]?.style.backgroundColor==='rgb(153, 88, 42)');
      if(viewport.width===1440 && reducedMotion==='no-preference'){
        const card=page.locator('.player-mini-card');
        await page.locator('.rating-place').first().hover();await page.waitForTimeout(220);assert.equal(await card.isHidden(),true,'place must not trigger profile card');
        await page.locator('.rating-score').first().hover();await page.waitForTimeout(220);assert.equal(await card.isHidden(),true,'score must not trigger profile card');
        await page.locator('.rating-profile-trigger').first().hover();await card.waitFor({state:'visible'});assert.equal(await card.evaluate(el=>getComputedStyle(el).animationName),'player-card-enter');
        await page.locator('.rating-score').first().hover();await card.waitFor({state:'hidden'});
        await page.locator('.rating-self-score').hover();await page.waitForTimeout(220);assert.equal(await card.isHidden(),true,'own score must not trigger profile card');
        await page.locator('.rating-self .rating-person').hover();await card.waitFor({state:'visible'});await page.locator('.rating-self-score').hover();await card.waitFor({state:'hidden'});
        await page.mouse.move(0,0);
      }
      const nameBox=await page.locator('.rating-player').nth(1).evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return {rects:[...r.getClientRects()].map(r=>({top:r.top,bottom:r.bottom})),whiteSpace:getComputedStyle(el).whiteSpace,width:el.getBoundingClientRect().width,scrollWidth:el.scrollWidth,parentWidth:el.parentElement.getBoundingClientRect().width,avatarWidth:el.parentElement.querySelector('img').getBoundingClientRect().width,gap:parseFloat(getComputedStyle(el.parentElement).gap)};});assert.equal(nameBox.whiteSpace,'nowrap');assert.ok(nameBox.rects.every(r=>Math.abs(r.top-nameBox.rects[0].top)<1),'nickname stays on one line');assert.ok(nameBox.width>0);assert.ok(Math.abs(nameBox.width-(nameBox.parentWidth-nameBox.avatarWidth-nameBox.gap))<2,'nickname fills available width');if(viewport.width===1440)assert.ok(nameBox.scrollWidth<=nameBox.width+1,'long nickname fits available desktop width');
      assert.equal(new URL(page.url()).pathname,'/rating');
      assert.equal(await page.locator('.rating-score').first().innerText(),'1 101');
      const counterStyle=await page.locator('.rating-score').first().evaluate(el=>{el.classList.add('rating-animating');el.dataset.animated='1 002';const style=getComputedStyle(el,'::after');return {overflow:style.overflow,textOverflow:style.textOverflow,whiteSpace:style.whiteSpace};});assert.equal(counterStyle.overflow,'visible');assert.equal(counterStyle.textOverflow,'clip');assert.equal(counterStyle.whiteSpace,'nowrap');
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
      await page.waitForFunction(()=>document.querySelector('.rating-score')?.textContent.includes('101'));
      assert.deepEqual(modes,['overall','rapid'],'switching back to a fresh mode uses the cache');
      assert.equal(await page.locator('[data-rating-mode=daily]').count(),0);
      assert.equal(await page.locator('.rating-place').nth(1).innerText(),'2');
      const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
      assert.ok(widths.scroll<=widths.client,`no page overflow ${viewport.width}: ${JSON.stringify(widths)}`);
      if(viewport.width===1440&&reducedMotion==='reduce'){
        await page.locator('.rating-profile-trigger').nth(1).focus();await page.locator('.player-mini-card').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.player-mini-name')?.textContent==='LongestName_123456789012');assert.equal(await page.locator('.player-mini-bio').isHidden(),true);

        await page.locator('.rating-profile-trigger').first().focus(); await page.locator('.player-mini-card').waitFor({state:'visible'}); await page.getByText('Привет').waitFor();
        assert.equal(await page.locator('.player-mini-card').getAttribute('data-profile-palette'),'forest'); assert.equal(await page.locator('.player-mini-card').getAttribute('data-profile-theme'),'dark'); assert.equal(await page.locator('.player-mini-banner img').getAttribute('src'),avatar);
        assert.equal(await page.locator('.player-mini-card button').count(),0);await page.locator('.rating-row').first().locator('.rating-score').click(); await page.locator('#page-profile').waitFor({state:'visible'}); await page.locator('#profile-display-name').getByText('Player_One').waitFor();
        assert.equal(await page.locator('#page-profile').getAttribute('data-profile-theme'),'dark'); assert.equal(await page.locator('#profile-palette-name').textContent(),'Лес'); assert.equal(await page.locator('.landing').getAttribute('data-palette'),'monochrome');assert.equal(await page.locator('#app-sidebar').getAttribute('data-profile-palette'),'forest'); await page.locator('#profile-back').click();await page.locator('#page-rating').waitFor({state:'visible'});assert.equal(await page.locator('#app-sidebar').getAttribute('data-profile-palette'),null);
        await page.locator('.rating-row').nth(1).locator('.rating-avatar').click();await page.locator('#page-profile').waitFor({state:'visible'});await page.locator('#profile-display-name').getByText('LongestName_123456789012').waitFor();await page.locator('#profile-back').click();await page.locator('#page-rating').waitFor({state:'visible'});
      }
      const scoreFrames=await page.evaluate(()=>window.__scoreFrames); if(reducedMotion==='no-preference'){assert.ok(scoreFrames.length>0,'rating counter animates');assert.ok(scoreFrames.every(value=>!/[,.]\d/.test(value)),'rating ticker has no fractional frames');}
      await page.goto(`${base}/rating`); await page.locator('#page-rating').waitFor({state:'visible'}); await page.locator('.rating-row').first().waitFor();
      if(viewport.width===1440){
        await page.goto(`${base}/settings`); await page.locator('#page-settings').waitFor({state:'visible'}); const settingsAnimation=await page.locator('#page-settings-title').evaluate(el=>getComputedStyle(el).animationName);assert.equal(settingsAnimation,reducedMotion==='reduce'?'none':'support-reveal');
        await page.locator('#account-toggle').click();await page.locator('#account-menu [data-page=help]').click();await page.locator('#page-help').waitFor({state:'visible'});const helpAnimation=await page.locator('#feedback-form h3').evaluate(el=>getComputedStyle(el).animationName);assert.equal(helpAnimation,reducedMotion==='reduce'?'none':'support-reveal');
      }
      await page.close();
    }
  }
  console.log('✓ Rating route, filters, calibration, adaptive layout and reduced motion');
} finally { await browser.close(); }
