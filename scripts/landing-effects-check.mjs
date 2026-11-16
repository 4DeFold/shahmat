// Browser checks use mocked auth; no database writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}), ...(process.env.CHROMIUM_EXTRA_ARGS ? {args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')} : {}) });
try {
  for (const [size, scheme] of [[{width:1440,height:900},'light'],[{width:390,height:844},'dark'],[{width:280,height:653},'light']]) {
    const page = await browser.newPage({viewport:size, colorScheme:scheme, reducedMotion:'no-preference'});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', route => route.fulfill({json:{}}));
    await page.goto(base); await page.locator('#play').waitFor({state:'visible'}); await page.waitForTimeout(2200);
    const metrics = await page.evaluate(() => { const r=document.querySelector('h1').getBoundingClientRect(); return {left:r.left,right:r.right,width:document.documentElement.scrollWidth,viewport:innerWidth,opacity:getComputedStyle(document.querySelector('.entrance-atmosphere')).opacity}; });
    assert.ok(metrics.left >= -1 && metrics.right <= size.width + 1, `wordmark fits ${size.width}: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.width <= metrics.viewport + 1); assert.equal(metrics.opacity, '1');
    assert.equal(await page.locator('#landing-screen h1').innerText(), 'shahmat.xyz');
    if (size.width === 1440) {
      const box = await page.locator('#play').boundingBox(); await page.mouse.move(box.x + box.width*.8, box.y + box.height*.65); await page.waitForTimeout(150);
      assert.notEqual(await page.locator('#play').evaluate(el => el.style.getPropertyValue('--magnet-x')), '');
    }
    await page.locator('#login').click(); await page.locator('#auth-screen').waitFor({state:'visible'}); await page.waitForTimeout(800);
    assert.equal(await page.locator('#email').isVisible(), true); assert.equal(await page.locator('#password').isVisible(), true);
    assert.equal(await page.locator('#password').getAttribute('placeholder'), 'Не менее 8 символов');
    assert.equal(await page.locator('#password').getAttribute('minlength'), '8');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'auth-screen');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#tab-login').evaluate(el => el.matches(':focus-visible')), true);
    assert.equal(await page.locator('#tab-login').evaluate(el => getComputedStyle(el).textDecorationStyle), 'dotted');
    await page.locator('#email').fill('user@example.com'); await page.locator('#password').fill('1234567');
    assert.equal(await page.locator('#password').evaluate(el => el.validity.tooShort), true);
    await page.locator('#password').fill('password123');
    const initial = await page.locator('#auth-screen').evaluate(el => el.getBoundingClientRect().height);
    await page.locator('#tab-signup').click();
    assert.equal(await page.locator('#tab-signup').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    assert.equal(await page.locator('#auth-screen').evaluate(el => el.getAnimations().some(a => a.effect.getKeyframes().some(k => k.height))), true);
    await page.waitForTimeout(130);
    const middle = await page.locator('#auth-screen').evaluate(el => el.getBoundingClientRect().height);
    await page.waitForTimeout(450);
    const final = await page.locator('#auth-screen').evaluate(el => el.getBoundingClientRect().height);
    assert.ok(final < middle && middle < initial, `smooth height ${initial} → ${middle} → ${final}`);
    assert.equal(await page.locator('#password').getAttribute('placeholder'), 'Не менее 8 символов');
    assert.equal(await page.locator('#email').inputValue(), 'user@example.com'); assert.equal(await page.locator('#password').inputValue(), 'password123');
    // Older accounts remain sign-in eligible on the signup tab.
    await page.locator('#password').fill('secret');
    assert.equal(await page.locator('#password').evaluate(el => el.validity.tooShort), false);
    await page.locator('#tab-login').click(); await page.waitForTimeout(100); await page.locator('#tab-signup').click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#auth-screen').evaluate(el => el.getAnimations().length), 0);
    assert.deepEqual(errors, []); await page.close();
  }
  const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await page.goto(base); await page.locator('#play').waitFor({state:'visible'});
  assert.equal(await page.locator('.hero-reveal').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('.entrance-piece').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.locator('#login').click(); await page.locator('#auth-screen').waitFor({state:'visible'});
  assert.equal(await page.locator('#email').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.locator('#tab-signup').click();
  assert.equal(await page.locator('#auth-screen').evaluate(el => el.getAnimations().length), 0);
  await page.close(); console.log('✓ Landing/auth effects, narrow layouts, preserved form values and reduced motion');
} finally { await browser.close(); }
