// Run against the production build via npm run preview. Supabase is mocked.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  ...(process.env.CHROMIUM_EXTRA_ARGS ? { args: process.env.CHROMIUM_EXTRA_ARGS.split(' ') } : {}),
});
const id = '12345678-1234-1234-1234-123456789012';
const user = { id, email: 'test@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: {} };
async function mock(page) {
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/token') {
      const token = ['e30', Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url'), 'x'].join('.');
      return route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'mock-refresh', user } });
    }
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    if (path === '/rest/v1/profiles') return route.fulfill({ json: { username: 'Player', bio: '', palette: 'monochrome' } });
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: {} });
  });
}
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const requests = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await mock(page);
  await page.goto(base);
  await page.locator('#play').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#auth-screen').count(), 0, 'auth shell must not be in the initial landing HTML');
  assert.ok(!requests.some(path => /\/assets\/(?:app|app-shell|profile)-/.test(path)), 'landing must not download the app or profile chunks');
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'), '/favicon.svg');
  await page.locator('#login').click();
  await page.locator('#auth-screen').waitFor({ state: 'visible' });
  await page.locator('#email').fill('test@example.com');
  await page.locator('#password').fill('password123');
  await page.locator('#auth-submit').click();
  await page.locator('#dashboard-home').waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).pathname, '/home');
  // Independent page chunks and the game iframe warm in the background after auth.
  await page.locator('#page-profile').waitFor({ state: 'attached' });
  await page.locator('#page-settings').waitFor({ state: 'attached' });
  await page.locator('#page-help').waitFor({ state: 'attached' });
  await page.locator('#member-game-frame').waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.querySelector('#member-game-frame')?.contentDocument?.querySelectorAll('#board .square').length === 64);
  assert.equal(await page.locator('#page-game').isHidden(), true);
  await page.locator('[data-page=game]').first().click();
  await page.locator('#page-game').waitFor({ state: 'visible' });
  assert.equal(await page.frameLocator('#member-game-frame').locator('#board .square').count(), 64);
  for (const name of ['settings', 'help', 'profile']) {
    await page.goto(`${base}/${name}`);
    await page.locator(`#page-${name}`).waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).pathname, `/${name}`);
    if (name === 'settings') {
      assert.equal(await page.locator('#dashboard-palettes input:checked').inputValue(), 'monochrome');
      assert.equal(await page.locator('#dashboard-palettes label').count(), 10);
    }
    await page.reload();
    await page.locator(`#page-${name}`).waitFor({ state: 'visible' });
  }
  assert.ok(requests.some(path => /\/assets\/profile-/.test(path)));
  await page.goto(`${base}/#play`);
  await page.locator('#board').waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).pathname, '/play', 'legacy hash bookmarks must be upgraded');
  await page.goto(`${base}/settings`);
  await page.locator('#page-settings').waitFor({ state: 'visible' });
  await page.locator('#account-toggle').click();
  await page.locator('#account-menu [data-page=help]').click();
  await page.locator('#page-help').waitFor({ state: 'visible' });
  await page.goBack();
  await page.locator('#page-settings').waitFor({ state: 'visible' });
  await page.goForward();
  await page.locator('#page-help').waitFor({ state: 'visible' });
  // A slow game document must not reveal an empty iframe during a quick click.
  const slowContext = await browser.newContext({ reducedMotion: 'reduce' });
  const slow = await slowContext.newPage();
  await mock(slow);
  let releaseGame, gameRequested;
  const gameRequest = new Promise(resolve => { gameRequested = resolve; });
  const release = new Promise(resolve => { releaseGame = resolve; });
  await slow.route('**/pages/game.html', async route => { gameRequested(); await release; await route.continue(); });
  await slow.goto(base); await slow.locator('#login').click();
  await slow.locator('#email').fill('test@example.com'); await slow.locator('#password').fill('password123');
  await slow.locator('#auth-submit').click(); await slow.locator('#dashboard-home').waitFor({ state: 'visible' });
  await gameRequest;
  await slow.locator('[data-page=game]').first().click();
  assert.equal(await slow.locator('#dashboard-home').isHidden(), true);
  assert.equal(await slow.locator('#page-loading').isVisible(), true);
  await slow.locator('#page-loading .particle-loading.is-visible canvas').waitFor({state:'visible'});
  const still=await slow.locator('#page-loading canvas').evaluate(c=>c.toDataURL());await slow.waitForTimeout(100);
  assert.equal(await slow.locator('#page-loading canvas').evaluate(c=>c.toDataURL()),still,'reduced motion renders a static particle');
  assert.equal(await slow.locator('[data-page=game]').first().getAttribute('aria-current'), 'page');
  assert.equal(await slow.locator('#page-game').isHidden(), true);
  await slow.locator('#nav-rating').click();
  await slow.locator('#page-rating:not([hidden])').waitFor();
  releaseGame();
  await slow.waitForTimeout(500);
  assert.equal(await slow.locator('#page-rating').isVisible(),true,'a stale load must not replace the new tab');
  await slow.locator('[data-page=game]').first().click();
  await slow.locator('#page-game').waitFor({ state: 'visible' });
  assert.equal(await slow.frameLocator('#member-game-frame').locator('#board .square').count(), 64);
  assert.equal(await slow.frameLocator('#member-game-frame').locator('#board img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), true);
  for (const [name, documentPath] of [['bot','bot-game.html'],['watch','watch.html'],['archive','archive.html']]) {
    await slow.locator('#nav-rating').click();
    let release, requested; const waiting=new Promise(resolve=>requested=resolve), gate=new Promise(resolve=>release=resolve);
    await slow.route(`**/pages/${documentPath}`, async route=>{requested();await gate;await route.continue();});
    await slow.locator(`[data-page=${name}]`).first().click(); await waiting;
    assert.equal(await slow.locator('#page-rating').isHidden(),true);
    assert.equal(await slow.locator('#page-loading').isVisible(),true,`${name} immediately shows loading`);
    assert.equal(await slow.locator(`[data-page=${name}]`).first().getAttribute('aria-current'),'page');
    release(); await slow.locator(`#page-${name}:not([hidden])`).waitFor();
  }
  await slowContext.close();
  const guest = await browser.newPage({ reducedMotion: 'reduce' });
  await mock(guest);
  // Some single-process Chromium builds share storage between contexts.
  await guest.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
  await guest.goto(`${base}/profile`);
  await guest.locator('#auth-screen').waitFor({ state: 'visible' });
  assert.equal(await guest.locator('#dashboard-screen').isVisible(), false);
  await guest.locator('#email').fill('test@example.com');
  await guest.locator('#password').fill('password123');
  await guest.locator('#auth-submit').click();
  await guest.locator('#page-profile').waitFor({ state: 'visible' });
  assert.equal(new URL(guest.url()).pathname, '/profile', 'sign-in should preserve the requested destination');
  console.log('✓ Guest landing stays lightweight; dashboard pages preload after authentication');
  console.log('✓ Direct routes, refresh, browser history, legacy links and guest guard work (mock Supabase)');
} finally { await browser.close(); }
