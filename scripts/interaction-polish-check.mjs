// Chromium interaction checks with mocked auth/matchplay; no real DB writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}), ...(process.env.CHROMIUM_EXTRA_ARGS ? {args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')} : {}) });
const user = { id:'12345678-1234-1234-1234-123456789012', aud:'authenticated', role:'authenticated', user_metadata:{} };
const token = ['e30', Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'), 'x'].join('.');
const session = { access_token:token, token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, refresh_token:'mock-refresh', user };
try {
  const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  await page.addInitScript(value => localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token', JSON.stringify(value)), session);
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/user') return route.fulfill({json:user});
    if (path === '/functions/v1/match-opponent') return route.fulfill({json:{username:'Friend'}});
    if (path === '/functions/v1/matchplay') {
      const body = JSON.parse(route.request().postData());
      if (body.action === 'current') return route.fulfill({json:{game:null}});
      const game={id:'fixture',white_id:'opponent',black_id:user.id,mode:'blitz',moves:[],turn:'w',version:0,status:'active',white_ms:180000,black_ms:180000};
      return route.fulfill({json:{game}});
    }
    return route.fulfill({json:{}});
  });
  await page.goto(`${base}/pages/game.html`);
  await page.locator('#board [data-square=e2] img').waitFor();
  const angle = () => page.evaluate(() => {
    const board = document.querySelector('#board'), piece = board.querySelector('.piece');
    const b = new DOMMatrix(getComputedStyle(board).transform), p = new DOMMatrix(getComputedStyle(piece).transform);
    const combined = b.multiply(p);
    return Math.atan2(combined.b, combined.a)*180/Math.PI;
  });
  assert.ok(Math.abs(await angle()) < 1, 'pieces upright while board is sideways');
  assert.equal(await page.locator('#player-clock-label').isHidden(),true);
  const gap = await page.locator('.clock-pair').evaluate(el => {const [a,b] = el.children; return b.getBoundingClientRect().top-a.getBoundingClientRect().bottom;});
  assert.ok(gap > 12, 'clocks are separated towards opposite sides');
  const pickerHeight = await page.locator('#mode-picker').evaluate(el => el.getBoundingClientRect().height);
  await page.locator('label:has(input[value=blitz])').click(); await page.locator('#start-search').click();
  await page.locator('#board.black').waitFor();
  await page.waitForTimeout(80);
  const collapsingPicker = await page.locator('#mode-picker').evaluate(el => el.getBoundingClientRect().height);
  assert.ok(collapsingPicker > 0 && collapsingPicker < pickerHeight, `mode picker collapses smoothly: ${pickerHeight} -> ${collapsingPicker}`);
  assert.equal(await page.locator('#mode-picker').getAttribute('aria-hidden'), 'true');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#mode-picker').evaluate(el => el.getBoundingClientRect().height), 0);
  assert.equal(await page.locator('#mode-summary').innerText(), 'Блиц · 3 мин');
  const blackClocks = await page.locator('.clock-pair').evaluate(pair => {
    const player = pair.querySelector('#player-clock-card').getBoundingClientRect();
    const opponent = pair.querySelector('#opponent-clock-card').getBoundingClientRect();
    const board = document.querySelector('.board-frame').getBoundingClientRect();
    return {playerCenter:(player.top + player.bottom) / 2, opponentCenter:(opponent.top + opponent.bottom) / 2, middle:(board.top + board.bottom) / 2};
  });
  assert.ok(blackClocks.playerCenter >= blackClocks.middle && blackClocks.opponentCenter <= blackClocks.middle, 'black player clock remains in lower half');
  for (const [index, delay] of [50, 200, 300, 600].entries()) {
    await page.waitForTimeout(delay);
    if (index === 1) await page.locator('[data-square=e7]').evaluate(el => el.click()); // redraw mid-animation
    assert.ok(Math.abs(await angle()) < 3, 'pieces stay upright during rotation and redraw');
  }
  assert.equal(await page.locator('#player-clock-label').isVisible(),true);
  // Exercise wheel smoothing of a nested scroll area with motion enabled.
  await page.evaluate(() => { const box = document.createElement('div'); box.id='scroll-test'; Object.assign(box.style,{position:'fixed',top:'0',left:'0',width:'200px',height:'100px',overflowY:'auto',zIndex:'9999'}); const content=document.createElement('div'); content.style.height='2000px'; box.append(content); document.body.append(box); });
  await page.mouse.move(50,50); await page.mouse.wheel(0,200); await page.waitForTimeout(60);
  const first = await page.locator('#scroll-test').evaluate(el => el.scrollTop);
  await page.waitForTimeout(900); const last = await page.locator('#scroll-test').evaluate(el => el.scrollTop);
  assert.ok(first>0 && last>first && last>=210, `Lenis should smoothly reach destination: ${first}, ${last}`);
  // Fixed sidebar must never acquire the centered dashboard as a containing block.
  const login = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  await login.route('https://eswyxbyddkajysogtglp.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/token') return route.fulfill({json:session});
    if (path === '/auth/v1/user') return route.fulfill({json:user});
    if (path === '/rest/v1/profiles') return route.fulfill({json:{username:'Player',bio:'',palette:'monochrome'}});
    return route.fulfill({json:{}});
  });
  await login.goto(`${base}/login`); await login.locator('#auth-screen').waitFor({state:'visible'});
  await login.locator('#email').fill('player@example.com'); await login.locator('#password').fill('password123');
  await login.locator('#auth-submit').click(); await login.locator('#dashboard-screen').waitFor({state:'visible'});
  for (const delay of [0, 50, 200, 300]) {
    await login.waitForTimeout(delay);
    const value = await login.evaluate(() => ({ transform:getComputedStyle(document.querySelector('#dashboard-screen')).transform, left:document.querySelector('#app-sidebar').getBoundingClientRect().left }));
    assert.equal(value.transform, 'none'); assert.ok(Math.abs(value.left) < 1, `sidebar stays on left: ${value.left}`);
  }
  console.log('✓ Upright pieces throughout rotation, separated clocks, smooth panels, nested Lenis scrolling and stable sidebar');
} finally { await browser.close(); }
