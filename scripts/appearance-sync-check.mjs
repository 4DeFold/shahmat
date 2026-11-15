// Two isolated browser sessions share a mocked Supabase account; no real data is changed.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:5173';
const options = {
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  ...(process.env.CHROMIUM_EXTRA_ARGS ? { args: process.env.CHROMIUM_EXTRA_ARGS.split(' ') } : {}),
};
const id = '12345678-1234-1234-1234-123456789012';
const remote = { palette: 'forest', palette_theme: 'light' };
let writes = 0, reads = 0;
const user = () => ({ id, email: 'sync@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: { ...remote } });
const browsers = [];
try {
  for (const viewport of [{ width: 1440, height: 810 }, { width: 390, height: 844 }]) {
    const browser = await chromium.launch(options); browsers.push(browser);
    const page = await browser.newPage({ viewport, reducedMotion: viewport.width > 700 ? 'no-preference' : 'reduce' });
    await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path === '/auth/v1/token') {
        const token = ['e30', Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url'), 'x'].join('.');
        return route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'sync-test-token', user: user() } });
      }
      if (path === '/auth/v1/user') {
        if (request.method() === 'PUT') { writes++; Object.assign(remote, JSON.parse(request.postData()).data); }
        else reads++;
        return route.fulfill({ json: user() });
      }
      if (path === '/rest/v1/profiles') return route.fulfill({ json: { username: 'Player', bio: '', palette: 'forest' } });
      if (path === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ json: {} });
    });
    await page.goto(baseURL);
    await page.locator('#play').click();
    await page.locator('#email').fill('sync@example.com');
    await page.locator('#password').fill('password123');
    await page.locator('#auth-submit').click();
    await page.locator('#dashboard-screen').waitFor({ state: 'visible' });
  }
  const [desktop, phone] = browsers.map(browser => browser.contexts()[0].pages()[0]);
  await phone.locator('#dashboard-palettes label[data-choice=wood]').click();
  await desktop.waitForFunction(() => document.querySelector('.landing').dataset.palette === 'wood', null, { timeout: 5000 });
  assert.equal(remote.palette, 'wood');
  await phone.locator('#dashboard-palettes label[data-choice=wood]').click();
  await desktop.waitForFunction(() => document.querySelector('.landing').dataset.paletteTheme === 'dark', null, { timeout: 5000 });
  assert.equal(remote.palette_theme, 'dark');
  assert.equal(writes, 2, 'polling should not write back');
  assert.ok(reads > 0, 'clients should fetch remote metadata');
  await desktop.locator('#account-toggle').click();
  await desktop.waitForFunction(() => document.querySelector('#account-menu').classList.contains('is-open'));
  assert.equal(await desktop.locator('#account-toggle').getAttribute('aria-expanded'), 'true');
  await desktop.waitForTimeout(250);
  assert.equal(await desktop.locator('#account-menu').evaluate(el => getComputedStyle(el).opacity), '1');
  await desktop.keyboard.press('Escape');
  assert.equal(await desktop.locator('#account-menu').evaluate(el => el.inert), true);
  await desktop.waitForTimeout(250);
  assert.equal(await desktop.locator('#account-menu').isHidden(), true);
  await desktop.locator('#nav-play').click();
  assert.equal(await desktop.locator('#page-play').evaluate(el => getComputedStyle(el).animationName), 'view-entrance');
  await phone.locator('#mobile-menu-toggle').click();
  await phone.locator('#nav-play').click();
  assert.equal(await phone.locator('#page-play').evaluate(el => getComputedStyle(el).animationName), 'none');
  await phone.emulateMedia({ reducedMotion: 'no-preference' });
  await phone.locator('#mobile-menu-toggle').click();
  const drawerTransition = await phone.locator('#app-sidebar').evaluate(el => getComputedStyle(el).transitionDuration);
  assert.ok(drawerTransition.includes('0.25s'), 'mobile drawer should slide smoothly');
  await phone.waitForTimeout(300);
  assert.equal(await phone.locator('#app-sidebar').evaluate(el => getComputedStyle(el).visibility), 'visible');
  await phone.locator('#sidebar-backdrop').click({ position: { x: 385, y: 100 } });
  await phone.waitForTimeout(300);
  assert.equal(await phone.locator('#app-sidebar').isHidden(), true);
  console.log('✓ Two isolated sessions synchronize palette and theme without reload (mock Supabase)');
  console.log('✓ Menu, page and mobile drawer animations work; reduced motion disables them');
} finally {
  for (const browser of browsers) await browser.close();
}
