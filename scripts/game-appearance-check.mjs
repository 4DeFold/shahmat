// Visual state and motion checks against a production Vite preview.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  ...(process.env.CHROMIUM_EXTRA_ARGS ? { args: process.env.CHROMIUM_EXTRA_ARGS.split(' ') } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.goto(base);
  const entrance = await page.evaluate(() => {
    const get = selector => { const style = getComputedStyle(document.querySelector(selector)); return [style.animationName, style.animationDuration, style.animationDelay]; };
    return { play: get('#play'), login: get('#login') };
  });
  assert.deepEqual(entrance.play, entrance.login, 'login and PLAY animate together');
  assert.equal(entrance.login[0], 'button-entrance');
  await page.addInitScript(() => {
    localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token', JSON.stringify({ user: { id: 'test-user', user_metadata: { palette: 'forest', palette_theme: 'dark' } } }));
  });
  await page.goto(`${base}/play`);
  await page.locator('#board .piece').first().waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(17, 17, 17)');
  await page.locator('.piece').first().evaluate(img => img.decode());
  assert.ok(await page.locator('.piece').first().evaluate(img => img.naturalWidth > 0));
  assert.equal(await page.locator('.back').evaluate(el => getComputedStyle(el).textDecorationLine), 'none');
  await page.screenshot({ path: 'responsive-evidence/game-dark.png', fullPage: true });
  const animations = await page.evaluate(() => {
    document.querySelector('[data-square=e2]').click();
    document.querySelector('[data-square=e4]').click();
    return { piece: document.querySelector('[data-square=e4] .piece').getAnimations().length,
      move: document.querySelector('#move-list strong').getAnimations().length };
  });
  assert.ok(animations.piece > 0, 'piece should animate after moving');
  assert.ok(animations.move > 0, 'new notation should animate');
  await page.waitForFunction(() => document.querySelector('#move-list strong:last-child')?.textContent !== '—');
  await page.waitForTimeout(450);
  await page.evaluate(() => document.querySelector('[data-square=d2]').click());
  assert.equal(await page.locator('#move-list strong').first().evaluate(el => el.getAnimations().filter(animation => animation.playState === 'running').length), 0, 'old moves should not animate on selection');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => localStorage.removeItem('shahmat.guest-game.v1'));
  await page.reload();
  await page.locator('#board .piece').first().waitFor();
  const reduced = await page.evaluate(() => {
    document.querySelector('[data-square=e2]').click(); document.querySelector('[data-square=e4]').click();
    return { piece: document.querySelector('[data-square=e4] .piece').getAnimations().length,
      move: document.querySelector('#move-list strong').getAnimations().length };
  });
  assert.deepEqual(reduced, { piece: 0, move: 0 });
  console.log('✓ Saved dark theme, Chess.com assets, move animations and reduced motion');
} finally { await browser.close(); }
