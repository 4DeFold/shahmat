// Browser check against built preview with mocked auth and matchplay; no DB writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { Chess } from 'chess.js';
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  ...(process.env.CHROMIUM_EXTRA_ARGS ? { args: process.env.CHROMIUM_EXTRA_ARGS.split(' ') } : {}),
});
const user = { id:'12345678-1234-1234-1234-123456789012', email:'test@example.com', aud:'authenticated', role:'authenticated', user_metadata:{} };
let snapshot = null;
try {
  const page = await browser.newPage({ viewport:{ width:390, height:844 }, reducedMotion:'reduce' });
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/auth/v1/token') {
      const token = ['e30', Buffer.from(JSON.stringify({ sub:user.id, exp:Math.floor(Date.now()/1000)+3600, role:'authenticated' })).toString('base64url'), 'x'].join('.');
      return route.fulfill({ json:{ access_token:token, token_type:'bearer', expires_in:3600, refresh_token:'mock-refresh', user } });
    }
    if (path === '/auth/v1/user') return route.fulfill({ json:user });
    if (path === '/rest/v1/profiles') return route.fulfill({ json:{ username:'Player', bio:'', palette:'monochrome' } });
    if (path === '/functions/v1/match-opponent') return route.fulfill({ json:{ username:'Friend' } });
    if (path === '/functions/v1/matchplay') {
      const body = JSON.parse(request.postData());
      if (body.action === 'current' || body.action === 'cancel') return route.fulfill({ json:{ game:snapshot } });
      if (body.action === 'search') {
        snapshot = { id:'fixture', white_id:user.id, black_id:'opponent', mode:body.mode, moves:[], turn:'w', version:0, status:'active', white_ms:180000, black_ms:180000 };
        return route.fulfill({ json:{ state:'matched', game:snapshot } });
      }
      if (body.action === 'move') {
        const chess = new Chess(); snapshot.moves.forEach(move => chess.move(move)); chess.move({ from:body.from, to:body.to });
        snapshot = { ...snapshot, moves:chess.history(), turn:chess.turn(), version:chess.history().length };
      }
      return route.fulfill({ json:{ game:snapshot } });
    }
    return route.fulfill({ json:{} });
  });
  await page.goto(`${base}/login`);
  await page.locator('#email').fill('test@example.com'); await page.locator('#password').fill('password123'); await page.locator('#auth-submit').click();
  await page.locator('#dashboard-home').waitFor({ state:'visible' });
  await page.locator('#mobile-menu-toggle').click(); await page.locator('#nav-play').click();
  const game = page.frameLocator('#member-game-frame');
  await game.locator('#board [data-square=e2]').waitFor({ state:'visible' });
  assert.equal(new URL(page.url()).pathname, '/game');
  assert.equal(await game.locator('#board [data-square]').count(), 64);
  assert.equal(await game.locator('#board').evaluate(el => el.classList.contains('waiting')), true);
  assert.equal(await game.locator('#player-clock-card').getAttribute('data-color'), 'neutral');
  assert.equal(await game.locator('#opponent-clock-card').getAttribute('data-color'), 'neutral');
  assert.equal(await game.locator('#player-clock-label').isHidden(), true);
  assert.equal(await game.locator('#start-search').isDisabled(), true);
  await game.locator('label:has(input[value=blitz])').click();
  assert.equal(await game.locator('#player-clock').innerText(), '03:00');
  await game.locator('#start-search').click();
  await game.locator('#status').filter({ hasText:'Ваш ход' }).waitFor();
  assert.equal(await game.locator('#mode-picker').getAttribute('aria-hidden'), 'true');
  assert.equal(await game.locator('#mode-picker').evaluate(el => el.getBoundingClientRect().height), 0);
  assert.equal(await game.locator('#mode-summary').innerText(), 'Блиц · 3 мин');
  assert.equal(await game.locator('#leave-game-control').isVisible(), true);
  await game.locator('[data-square=e2]').click(); await game.locator('[data-square=e4]').click();
  await game.locator('#status').filter({ hasText:'Ход соперника' }).waitFor();
  assert.equal(await game.locator('[data-square=e4] img').count(), 1);
  // Drag a premove while the opponent is thinking, then deliver their reply.
  const from = await game.locator('[data-square=g1]').boundingBox(), to = await game.locator('[data-square=f3]').boundingBox();
  await page.mouse.move(from.x + from.width/2, from.y + from.height/2); await page.mouse.down();
  await page.mouse.move(to.x + to.width/2, to.y + to.height/2, { steps:8 }); await page.mouse.up();
  assert.equal(await game.locator('[data-square=f3]').evaluate(el => el.classList.contains('premove')), true);
  snapshot = { ...snapshot, moves:['e4','e5'], turn:'w', version:2 };
  await game.locator('[data-square=f3] img').waitFor();
  assert.equal(snapshot.moves.at(-1), 'Nf3');
  await game.locator('#history-first').click();
  assert.equal(await game.locator('[data-square=e2] img').count(), 1);
  await game.locator('#history-last').click();
  await game.locator('#toggle-moves').click(); assert.equal(await game.locator('#history-content').getAttribute('aria-hidden'), 'true');
  assert.equal(await game.locator('#history-content').evaluate(el => el.getBoundingClientRect().height), 0);

  for (const size of [{ width:390,height:844 },{ width:1440,height:900 }]) {
    await page.setViewportSize(size);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1), true, 'game page must fit viewport');
    assert.equal(await game.locator('#board').isVisible(), true);
    assert.equal(await game.locator('.game-rail').isVisible(), true);
    const clocks = await game.locator('.clock-pair').evaluate(pair => {
      const own = pair.querySelector('#player-clock-card'), opponent = pair.querySelector('#opponent-clock-card');
      return { clockLeft: pair.getBoundingClientRect().left, boardRight: document.getElementById('board').getBoundingClientRect().right,
        ownBackground: getComputedStyle(own).backgroundColor, opponentBackground: getComputedStyle(opponent).backgroundColor,
        numberSize: parseFloat(getComputedStyle(own.querySelector('strong')).fontSize), ownTop:own.getBoundingClientRect().top, opponentBottom:opponent.getBoundingClientRect().bottom, ownCenter:(own.getBoundingClientRect().top + own.getBoundingClientRect().bottom) / 2, opponentCenter:(opponent.getBoundingClientRect().top + opponent.getBoundingClientRect().bottom) / 2, boardMiddle: (document.getElementById('board').getBoundingClientRect().top + document.getElementById('board').getBoundingClientRect().bottom) / 2 };
    });
    assert.ok(clocks.clockLeft >= clocks.boardRight, 'clocks are next to the board');
    assert.ok(clocks.ownTop >= clocks.opponentBottom, 'player clock is below opponent');
    assert.ok(clocks.ownCenter >= clocks.boardMiddle && clocks.opponentCenter <= clocks.boardMiddle, 'clocks are in the correct halves');
    assert.notEqual(clocks.ownBackground, clocks.opponentBackground, 'clock backgrounds must differ');
    assert.ok(clocks.numberSize >= 12, 'clock numbers are legible');
    // The longest time control must fit without clipping at every viewport.
    await game.locator('#player-clock').evaluate(el => { el.textContent = '24:00:00'; });
    assert.equal(await game.locator('#player-clock').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'clock value fits');
  }
  assert.equal(await page.locator('#app-sidebar').isVisible(), true);
  await game.locator('.leave-game').click();
  await page.waitForURL('**/home');
  await page.locator('#nav-play').click();
  await page.frameLocator('#member-game-frame').locator('#status').filter({hasText:'Ход соперника'}).waitFor();
  assert.deepEqual(snapshot.moves, ['e4','e5','Nf3'], 'leaving must not end the game');
  console.log('✓ Viewport game, four controls, mocked search and legal move');
} finally { await browser.close(); }
