// Run against the built preview; all Supabase requests are mocked.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  ...(process.env.CHROMIUM_EXTRA_ARGS ? { args: process.env.CHROMIUM_EXTRA_ARGS.split(' ') } : {}),
});
const user = { id: '12345678-1234-1234-1234-123456789012', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: {} };
const sessionKey = 'sb-eswyxbyddkajysogtglp-auth-token';
let offline = false;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/user' && offline) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    if (path === '/auth/v1/token') {
      const token = ['e30', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' })).toString('base64url'), 'x'].join('.');
      return route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'mock-refresh', user } });
    }
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    if (path === '/rest/v1/profiles') return route.fulfill({ json: { username: 'Player', bio: '', palette: 'monochrome' } });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${base}/game`);
  await page.locator('#gate-login').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#member-game').isVisible(), false);
  await page.goto(`${base}/play`);
  await page.locator('[data-square=e2]').click(); await page.locator('[data-square=e4]').click();
  const guestSave = await page.evaluate(() => localStorage.getItem('shahmat.guest-game.v1'));
  assert.deepEqual(JSON.parse(guestSave).moves, ['e4']);
  await page.goto(`${base}/login`);
  await page.locator('#email').fill('test@example.com'); await page.locator('#password').fill('password123'); await page.locator('#auth-submit').click();
  await page.locator('#dashboard-home').waitFor({ state: 'visible' });
  await page.locator('#nav-play').click();
  await page.locator('#board [data-square=e2]').waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).pathname, '/game');
  assert.equal(await page.locator('#board [data-square]').count(), 64);
  assert.equal(await page.locator('#board [data-square=e2] .piece').count(), 1, 'member starts independently of demo');
  assert.equal(await page.evaluate(() => localStorage.getItem('shahmat.guest-game.v1')), guestSave);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow on mobile');
  await page.locator('[data-square=d2]').click(); await page.locator('[data-square=d4]').click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').moves?.length === 2, `shahmat.member-game.v1.${user.id}`);
  await page.reload(); await page.locator('#board [data-square=d4] .piece').waitFor({ state: 'visible' });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#new-game').click();
  assert.equal(await page.locator('#board [data-square=d2] .piece').count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('shahmat.guest-game.v1')), guestSave);
  offline = true;
  await page.reload();
  await page.locator('#gate-retry').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await page.locator('#member-game').isVisible(), false, 'network error fails closed');
  offline = false;
  await page.locator('#gate-retry').click();
  await page.locator('#board').waitFor({ state: 'visible' });
  // Simulate signout in another tab via the storage event Supabase listens to.
  await page.evaluate(key => { localStorage.removeItem(key); window.dispatchEvent(new StorageEvent('storage', { key, oldValue: '{}', newValue: null, storageArea: localStorage })); }, sessionKey);
  // Direct reload must never expose a stored member game without a session.
  await page.reload(); await page.locator('#gate-login').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#member-game').isVisible(), false);
  console.log('✓ Guest and member pages are separate; auth, account-scoped storage, reload, reset and offline gate work');
} finally { await browser.close(); }
