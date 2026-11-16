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
    await page.addInitScript(() => { Math.random = () => .1; });
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
    if (width === 390) {
      await page.evaluate(() => localStorage.setItem('shahmat.guest-game.v1', JSON.stringify({ version: 1, moves: ['f3', 'e5', 'g4', 'Qh4#'] })));
      await page.reload();
      await page.locator('#board').waitFor({ state: 'visible' });
      assert.match(await page.locator('#status').innerText(), /Мат/);
      assert.equal(await page.locator('#new-game-countdown').isHidden(), true);
      await page.locator('#new-game').click();
      await page.locator('#auth-screen').waitFor({ state: 'visible' });
      await page.goBack();
      await page.locator('#board').waitFor({ state: 'visible' });
      assert.match(await page.locator('#new-game-countdown').innerText(), /^(60:00|59:\d{2}) до новой партии$/);
      assert.match(await page.locator('#status').innerText(), /Мат/);
      await page.evaluate(() => {
        const save = JSON.parse(localStorage.getItem('shahmat.guest-game.v1'));
        save.newGameAt = Date.now() - 1;
        localStorage.setItem('shahmat.guest-game.v1', JSON.stringify(save));
      });
      await page.reload();
      await page.locator('#board').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#status').innerText(), 'Ваш ход.');
      assert.equal(await page.locator('#new-game-countdown').isHidden(), true);
      assert.equal(await page.locator('#move-list li').count(), 0);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
// Exercise the other random side in a real browser, including reload persistence.
{
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 850 }, reducedMotion: 'reduce' });
    await page.addInitScript(() => { Math.random = () => .9; });
    await page.goto(`${base}/play`);
    await page.locator('#board .square').first().waitFor();
    assert.equal(await page.locator('#player-color').textContent(), 'Чёрные');
    assert.equal(await page.locator('#board .square').first().getAttribute('data-square'), 'h1');
    assert.equal(await page.locator('.description').count(), 0);
    await page.locator('#status').filter({ hasText: 'Ваш ход' }).waitFor();
    await page.locator('[data-square=e7]').click();
    assert.equal(await page.locator('[data-square=e5]').evaluate(el => el.classList.contains('possible')), true);
    await page.locator('[data-square=e5]').click();
    await page.reload();
    await page.locator('#board .square').first().waitFor();
    assert.equal(await page.locator('#player-color').textContent(), 'Чёрные');
    assert.equal(await page.locator('[data-square=e5] .piece').count(), 1);
  } finally { await browser.close(); }
}
console.log('✓ Guest landing → game, legal move, bot reply, persistence and registration at 280/390/1440px');
