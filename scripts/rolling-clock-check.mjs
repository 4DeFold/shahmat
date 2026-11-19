// Browser checks for the animated clocks, mode controls and delayed resignation.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}), ...(process.env.CHROMIUM_EXTRA_ARGS ? {args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')} : {})});
const user = {id:'12345678-1234-1234-1234-123456789012',aud:'authenticated',role:'authenticated',user_metadata:{}};
const token = ['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session = {access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
  for (const reducedMotion of ['no-preference','reduce']) {
    const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion});
    await page.addInitScript(session => localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(session)),session);
    let state = null, age = 59900;
    await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/auth/v1/user') return route.fulfill({json:user});
      if (path === '/functions/v1/matchplay') {
        const body = JSON.parse(route.request().postData());
        if (body.action === 'opponent') return route.fulfill({json:{username:'Friend'}});
        if (body.action === 'search') state = {id:'fixture',white_id:user.id,black_id:'other',mode:body.mode,moves:[],turn:'w',version:0,status:'active',white_ms:180000,black_ms:180000,game_age_ms:age};
        if (state) state.game_age_ms = age;
        return route.fulfill({json:{game:state}});
      }
      return route.fulfill({json:{}});
    });
    await page.goto(`${base}/pages/game.html`);
    await page.locator('#board [data-square=e2]').waitFor();
    assert.equal(await page.locator('#start-search').isHidden(),true);
    assert.equal(await page.locator('#player-clock').getAttribute('aria-label'),'00:00');
    assert.equal(await page.locator('#opponent-clock').getAttribute('aria-label'),'00:00');
    assert.equal(await page.locator('#player-clock .clock-digit').count(),4);
    const tileStyle = await page.locator('#player-clock .clock-digit').first().evaluate(el => ({ background:getComputedStyle(el).backgroundImage, radius:parseFloat(getComputedStyle(el).borderRadius) }));
    assert.match(tileStyle.background, /gradient/); assert.ok(tileStyle.radius > 0, 'digits have separate rounded tiles');
    await page.locator('label:has(input[value=blitz])').click();
    assert.equal(await page.locator('#start-search').isVisible(),true);
    assert.equal(await page.locator('#start-search').evaluate(el => el.getAnimations().some(animation => animation.animationName === 'rail-appear')), reducedMotion === 'no-preference');
    assert.ok(await page.locator('#start-search').evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 18);
    await page.locator('#player-clock .clock-digit').first().evaluate(el => window.clockSlot = el);
    await page.locator('label:has(input[value=rapid])').click();
    assert.equal(await page.locator('#player-clock').getAttribute('aria-label'),'10:00');
    assert.equal(await page.locator('#player-clock .clock-digit').first().evaluate(el => el === window.clockSlot),true, 'existing digit stays in place during a mode change');
    const animated = await page.locator('#player-clock .clock-reel').evaluateAll(els => els.some(el => el.getAnimations().length));
    assert.equal(animated,reducedMotion === 'no-preference');
    await page.waitForTimeout(700);
    const before = await page.locator('#player-clock-card').boundingBox();
    await page.locator('label:has(input[value=classical])').click();
    await page.waitForTimeout(60);
    const middle = await page.locator('#player-clock-card').boundingBox();
    const sizing = await page.locator('#player-clock-card').evaluate(el => el.getAnimations().some(a => a.effect.getTiming().duration === 350));
    assert.equal(sizing, reducedMotion === 'no-preference', 'card resize is animated unless reduced motion is requested');
    await page.waitForTimeout(400);
    const after = await page.locator('#player-clock-card').boundingBox();
    assert.ok(before.height > after.height + 3, 'longer clock has a smaller card');
    if (reducedMotion === 'no-preference') assert.ok(middle.height < before.height && middle.height > after.height, `card height changes gradually: ${before.height} ${middle.height} ${after.height}`);
    for (const viewport of [{width:280,height:653},{width:390,height:844},{width:768,height:1024},{width:1440,height:900},{width:2560,height:1080}]) {
      await page.setViewportSize(viewport);
      for (const [mode, time] of [['classical','1:00:00'],['blitz','03:00']]) {
        await page.locator(`label:has(input[value=${mode}])`).click();
        assert.equal(await page.locator('#player-clock').getAttribute('aria-label'),time);
        const fit = await page.locator('#player-clock').evaluate(async el => {
          await document.fonts.load('600 16px Geist');
          const context = document.createElement('canvas').getContext('2d'); context.font = getComputedStyle(el).font;
          const slots = [...el.querySelectorAll('.clock-digit')];
          return {slot:Math.min(...slots.map(slot => slot.clientWidth)), glyph:Math.max(...'0123456789'.split('').map(c => context.measureText(c).width)),
            width:el.clientWidth, strip:el.querySelector('.clock-digits').getBoundingClientRect().width};
        });
        assert.ok(fit.strip <= fit.width + 1 && fit.glyph <= fit.slot + 1, `${viewport.width} ${time}: ${JSON.stringify(fit)}`);
      }
    }
    await page.waitForTimeout(500);
    const wide = await page.locator('#player-clock-card').boundingBox();
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(60);
    const narrowing = await page.locator('#player-clock-card').boundingBox();
    const widthAnimated = await page.locator('#player-clock-card').evaluate(el => el.getAnimations().some(a => a.effect.getTiming().duration === 350));
    assert.equal(widthAnimated, reducedMotion === 'no-preference', 'responsive width changes animate');
    await page.waitForTimeout(400);
    const narrow = await page.locator('#player-clock-card').boundingBox();
    assert.ok(wide.width > narrow.width + 10);
    if (reducedMotion === 'no-preference') assert.ok(narrowing.width < wide.width && narrowing.width > narrow.width);
    await page.locator('#start-search').click();
    assert.equal(await page.locator('#resign-control').isHidden(),true);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#resign-control').isVisible(),true);
    state.white_ms = 178000; age = 60000;
    await page.waitForFunction(() => document.querySelector('#player-clock').getAttribute('aria-label') === '02:58', null, {timeout:3000});
    assert.equal(await page.locator('#player-clock .clock-reel').evaluateAll(els => els.some(el => el.getAnimations().length)), reducedMotion === 'no-preference', 'clock ticks roll without replacing the timer');
    await page.evaluate(() => { const root=document.documentElement; root.style.setProperty('--clock-white','#cceedd'); root.style.setProperty('--clock-black','#345678'); });
    await page.waitForTimeout(250);
    const palette = await page.evaluate(() => ({white:getComputedStyle(document.querySelector('.clock[data-color=w]')).backgroundColor, black:getComputedStyle(document.querySelector('.clock[data-color=b]')).backgroundColor, digits:getComputedStyle(document.querySelector('.clock[data-color=b] .clock-reel')).color}));
    assert.deepEqual(palette,{white:'rgb(204, 238, 221)',black:'rgb(52, 86, 120)',digits:'rgb(204, 238, 221)'});
    await page.close();
  }
  // Atmosphere must disappear immediately when auth/landing is replaced by dashboard,
  // even during the entrance fade on a reload.
  const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  await page.goto(`${base}/`);
  assert.equal(await page.locator('.entrance-atmosphere').evaluate(el => getComputedStyle(el).visibility),'visible');
  await page.evaluate(() => { document.querySelector('#landing-screen').hidden = true; const section=document.createElement('section'); section.id='dashboard-screen'; document.querySelector('.landing').append(section); });
  assert.equal(await page.locator('.entrance-atmosphere').evaluate(el => getComputedStyle(el).visibility),'hidden');
  await page.close();
  console.log('✓ Rolling clocks, palette, mode animation, delayed resign and startup atmosphere');
} finally { await browser.close(); }
