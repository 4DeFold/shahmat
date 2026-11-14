// Run against a local Vite server: npm run dev, then npm run test:responsive.
// The auth and profile API is mocked; no real accounts or database writes are made.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:5173';
const output = 'responsive-evidence';
const devices = [
  { id: 'desktop', label: 'Десктоп 16:9', width: 1440, height: 810 },
  { id: 'ultrawide', label: 'Ультраширокий монитор', width: 2560, height: 1080 },
  { id: 'tablet', label: 'Планшет', width: 768, height: 1024, touch: true },
  { id: 'fold-open', label: 'Складной экран, раскрыт', width: 884, height: 1104, touch: true },
  { id: 'phone', label: 'Телефон', width: 390, height: 844, touch: true },
  { id: 'fold-cover', label: 'Складной экран, внешний', width: 344, height: 882, touch: true },
  { id: 'fold-narrow', label: 'Узкий складной экран', width: 280, height: 653, touch: true },
  { id: 'landscape', label: 'Телефон горизонтально', width: 844, height: 390, touch: true },
];
const results = [];
await mkdir(output, { recursive: true });
for (const device of devices) {
  // A separate browser also works with single-process Chromium builds.
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    ...(process.env.CHROMIUM_EXTRA_ARGS ? { args: process.env.CHROMIUM_EXTRA_ARGS.split(' ') } : {}),
  });
  const page = await browser.newPage({ viewport: { width: device.width, height: device.height }, hasTouch: !!device.touch, isMobile: !!device.touch, reducedMotion: 'reduce', colorScheme: 'light', deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const user = { id: '12345678-1234-1234-1234-123456789012', email: 'preview@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: {} };
  let profile = null;
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/auth/v1/signup' || path === '/auth/v1/token') {
      const token = ['e30', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url'), 'x'].join('.');
      return route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'fixture-refresh-token', user } });
    }
    if (path === '/auth/v1/user') {
      if (request.method() === 'PUT') Object.assign(user.user_metadata, JSON.parse(request.postData()).data);
      return route.fulfill({ json: user });
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    if (path === '/rest/v1/profiles') {
      if (request.method() === 'POST') { profile = JSON.parse(request.postData()); return route.fulfill({ status: 201, json: profile }); }
      return route.fulfill({ json: profile });
    }
    return route.fulfill({ json: {} });
  });
  async function checkLayout(screen) {
    const metrics = await page.evaluate(() => {
      const visible = [...document.querySelectorAll('.screen:not([hidden]) button, .screen:not([hidden]) input, .screen:not([hidden]) textarea, .screen:not([hidden]) .palette-option')].filter(el => el.getClientRects().length);
      return {
        viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
        screenTop: document.querySelector('.screen:not([hidden])').getBoundingClientRect().top,
        scrollY: window.scrollY,
        clippedText: [...document.querySelectorAll('.screen:not([hidden]) .dashboard-stats span, .screen:not([hidden]) .palette-name, .screen:not([hidden]) h2, .screen:not([hidden]) h3')].filter(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
        outside: visible.filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(el => el.id || el.className),
      };
    });
    assert.ok(metrics.pageWidth <= metrics.viewport + 1, `${device.id} ${screen}: horizontal document overflow: ${JSON.stringify(metrics)}`);
    assert.deepEqual(metrics.outside, [], `${device.id} ${screen}: clipped controls`);
    assert.deepEqual(metrics.clippedText, [], `${device.id} ${screen}: clipped text`);
    return metrics;
  }
  const screenshot = name => page.screenshot({ path: `${output}/${device.id}-${name}.png`, fullPage: true, animations: 'disabled' });
  async function atTop(screen) {
    await page.locator(`#${screen}`).waitFor({ state: 'visible' });
    await page.waitForTimeout(50);
    const layout = await checkLayout(screen);
    assert.equal(layout.scrollY, 0, `${device.id} ${screen}: navigation should reset scroll`);
    assert.ok(layout.screenTop >= 0, `${device.id} ${screen}: top is unreachable`);
  }
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.locator('#play').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await checkLayout('landing-screen');
  assert.equal(await page.locator('#play').evaluate(el => getComputedStyle(el).webkitTapHighlightColor), 'rgba(0, 0, 0, 0)');
  if (!device.touch) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'play');
    assert.notEqual(await page.locator('#play').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'keyboard focus must remain visible');
  }
  const hero = await page.evaluate(() => {
    const title = document.querySelector('h1'), play = document.querySelector('#play');
    const titleRect = title.getBoundingClientRect(), playRect = play.getBoundingClientRect();
    const touch = getComputedStyle(play, '::before');
    return { title: titleRect.width, button: playRect.width, titleFont: parseFloat(getComputedStyle(title).fontSize), buttonFont: parseFloat(getComputedStyle(play).fontSize), height: playRect.height, hitHeight: parseFloat(touch.height), ratio: playRect.width / titleRect.width };
  });
  assert.ok(Math.abs(hero.ratio - 240 / 718) < .008, `${device.id}: button/title proportions ${hero.ratio}`);
  assert.ok(hero.hitHeight >= 44, `${device.id}: PLAY hit area is too small`);
  await screenshot('landing');
  // On narrow screens activate the extended touch target, outside the painted button.
  if (device.touch && hero.height < 44) {
    const box = await page.locator('#play').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y - (44 - box.height) / 2 + 2);
  } else await page.locator('#play').click();
  await atTop('auth-screen');
  if (device.touch) {
    const targetHeight = await page.locator('[data-action=home]').evaluate(el => el.getBoundingClientRect().height);
    assert.ok(targetHeight >= 44, `${device.id}: back button is too small`);
  }
  await screenshot('auth');
  await page.locator('#tab-signup').click();
  assert.equal(await page.locator('#tab-signup').getAttribute('aria-pressed'), 'true');
  await page.locator('#tab-login').click();
  await page.locator('[data-action=home]').click(); await atTop('landing-screen');
  await page.locator('#play').click(); await atTop('auth-screen');
  await page.locator('#tab-signup').click();
  await page.locator('#email').fill('preview@example.com'); await page.locator('#password').fill('password123');
  await page.locator('#auth-submit').click(); await atTop('profile-screen');
  assert.equal(await page.locator('#profile-cancel').isVisible(), false);
  await screenshot('profile');
  await page.locator('#username').fill('LongPlayerName_123456789');
  await page.locator('#username').selectText();
  assert.equal(await page.locator('#username').evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd)), 'LongPlayerName_123456789', 'form text remains selectable');
  await page.locator('#bio').fill('Люблю шахматы.');
  await page.locator('#profile-submit').click(); await atTop('palette-screen'); await screenshot('palette');
  await page.locator('#onboarding-palettes label[data-choice=forest]').click();
  assert.equal(await page.locator('.landing').getAttribute('data-palette'), 'forest');
  await page.locator('#palette-submit').click(); await atTop('dashboard-screen');
  assert.match(await page.locator('#dashboard-title').innerText(), /LongPlayerName_123456789/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'dashboard-title', 'navigation should keep accessible focus');
  assert.equal(await page.locator('#dashboard-title').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'programmatic heading focus should not be outlined');
  assert.equal(await page.locator('#dashboard-title').evaluate(el => getComputedStyle(el).userSelect), 'none');
  const paletteName = page.locator('#dashboard-palettes label[data-choice=gray] .palette-name');
  assert.equal(await paletteName.evaluate(el => getComputedStyle(el).userSelect), 'none');
  await paletteName.dblclick();
  assert.equal(await page.evaluate(() => window.getSelection().toString()), '', 'palette text should not be selected by a double click');
  await screenshot('dashboard');
  // Exercise navigation from the bottom of a long screen, not only from the top.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator('#edit-profile').click(); await atTop('profile-screen');
  assert.equal(await page.locator('#profile-cancel').isVisible(), true);
  await page.locator('#bio').fill('Не сохранять');
  await page.locator('#profile-cancel').click(); await atTop('dashboard-screen');
  assert.equal(await page.locator('#dashboard-bio').innerText(), 'Люблю шахматы.');
  for (const palette of ['gray', 'wood', 'atelier', 'monochrome']) {
    await page.locator(`#dashboard-palettes label[data-choice=${palette}]`).click();
    assert.equal(await page.locator('.landing').getAttribute('data-palette'), palette);
    await checkLayout('dashboard-screen');
    await page.locator(`#dashboard-palettes label[data-choice=${palette}]`).click();
    assert.equal(await page.locator('.landing').getAttribute('data-palette-theme'), 'dark');
    await checkLayout('dashboard-screen');
    if (palette === 'monochrome') await screenshot('dashboard-dark');
    await page.locator(`#dashboard-palettes label[data-choice=${palette}]`).click();
    assert.equal(await page.locator('.landing').getAttribute('data-palette-theme'), 'light');
  }
  await page.locator('.signout').click(); await atTop('auth-screen');
  assert.deepEqual(errors, [], `${device.id}: browser errors`);
  results.push({ ...device, hero });
  console.log(`✓ ${device.label} ${device.width}×${device.height} · PLAY/заголовок ${(hero.ratio * 100).toFixed(1)}%`);
  await browser.close();
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
console.log(`Скриншоты: ${output}/ (auth/profile/dashboard содержат тестовые данные, Supabase не изменялся).`);
