// Browser checks against a running Vite preview. No account or backend is required.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const options = {
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  ...(process.env.CHROMIUM_EXTRA_ARGS ? { args: process.env.CHROMIUM_EXTRA_ARGS.split(' ') } : {}),
};
for (const width of [280, 390, 1440]) {
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto(base);
    await page.locator('#play').click();
    await page.locator('#board').waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).pathname, '/play');
    assert.equal(await page.locator('.square').count(), 64);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: horizontal overflow`);
    assert.equal(await page.locator('#status').textContent(), 'Ваш ход.');
    await page.locator('[data-square=e2]').click();
    assert.equal(await page.locator('[data-square=e4]').evaluate(el => el.classList.contains('possible')), true);
    await page.locator('[data-square=e4]').click();
    // Refresh immediately, potentially before the bot has replied.
    await page.reload();
    await page.locator('#board').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-square=e4] .piece').count(), 1);
    await page.waitForFunction(() => document.querySelector('#move-list li strong:last-child')?.textContent !== '—');
    assert.match(await page.locator('#move-list').innerText(), /e4/);
    assert.match(await page.locator('#status').innerText(), /Ваш ход/);
    const history = await page.locator('#move-list').innerText();
    await page.reload();
    await page.locator('#board').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#move-list').innerText(), history);
    if (width === 390) await page.screenshot({ path: 'responsive-evidence/game-phone.png', fullPage: true });
    if (width === 1440) await page.screenshot({ path: 'responsive-evidence/game-desktop.png', fullPage: true });
    assert.equal(requests.some(url => url.includes('supabase.co')), false, 'guest game must not contact Supabase');
    await page.locator('#new-game').click();
    await page.locator('#auth-screen').waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'signup');
    assert.equal(await page.locator('#tab-signup').getAttribute('aria-pressed'), 'true');
    await page.goBack();
    await page.locator('#board').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#move-list').innerText(), history, 'registration must not erase the game');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
console.log('✓ Guest landing → game, legal move, bot reply, persistence and registration at 280/390/1440px');
