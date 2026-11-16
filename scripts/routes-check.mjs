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
  assert.equal(await page.locator('#page-profile').count(), 0, 'profile is not loaded on home');
  assert.ok(!requests.some(path => /\/assets\/profile-/.test(path)), 'profile chunk is requested only on visit');
  assert.equal(await page.locator('#page-settings').count(), 0, 'settings is not loaded on home');
  assert.ok(!requests.some(path => /\/assets\/settings-/.test(path)), 'settings chunk is requested only on visit');
  for (const name of ['settings', 'help', 'profile']) {
    await page.goto(`${base}/${name}`);
    await page.locator(`#page-${name}`).waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).pathname, `/${name}`);
    if (name === 'settings') {
      assert.equal(await page.locator('#dashboard-palettes input:checked').inputValue(), 'monochrome');
      assert.equal(await page.locator('#dashboard-palettes label').count(), 5);
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
  console.log('✓ Production landing lazy-loads authentication and individual page chunks');
  console.log('✓ Direct routes, refresh, browser history, legacy links and guest guard work (mock Supabase)');
} finally { await browser.close(); }
