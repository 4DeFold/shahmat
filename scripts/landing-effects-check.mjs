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
    await page.locator('#email').fill('user@example.com'); await page.locator('#password').fill('password123'); await page.locator('#tab-signup').click();
    assert.equal(await page.locator('#email').inputValue(), 'user@example.com'); assert.equal(await page.locator('#password').inputValue(), 'password123');
    assert.deepEqual(errors, []); await page.close();
  }
  const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await page.goto(base); await page.locator('#play').waitFor({state:'visible'});
  assert.equal(await page.locator('.hero-reveal').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('.entrance-piece').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.locator('#login').click(); await page.locator('#auth-screen').waitFor({state:'visible'});
  assert.equal(await page.locator('#email').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.close(); console.log('✓ Landing/auth effects, narrow layouts, preserved form values and reduced motion');
} finally { await browser.close(); }
