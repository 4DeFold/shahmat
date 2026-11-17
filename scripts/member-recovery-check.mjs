// Browser recovery check using mocked Supabase responses; never writes production data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({headless:true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),
  ...(process.env.CHROMIUM_EXTRA_ARGS ? {args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')} : {})});
const user = {id:'12345678-1234-1234-1234-123456789012', email:'test@example.com', aud:'authenticated', role:'authenticated', user_metadata:{}};
let currentCalls = 0, moveCalls = 0, offline = false;
let snapshot = {id:'fixture',white_id:user.id,black_id:'opponent',mode:'blitz',moves:[],turn:'w',version:0,status:'active',white_ms:180000,black_ms:180000,game_age_ms:60000};
try {
  const page = await browser.newPage({viewport:{width:390,height:844}, reducedMotion:'reduce'});
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/auth/v1/token') {
      const token = ['e30', Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'), 'x'].join('.');
      return route.fulfill({json:{access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'mock-refresh',user}});
    }
    if (path === '/auth/v1/user') return route.fulfill({json:user});
    if (path === '/rest/v1/profiles') return route.fulfill({json:{username:'Player',bio:'',palette:'monochrome'}});
    if (path === '/functions/v1/matchplay') {
      const body = JSON.parse(request.postData());
      if (body.action === 'heartbeat') return route.fulfill({json:{ok:true}});
      if (body.action === 'opponent') return route.fulfill({json:{username:'Friend',bio:''}});
      if (body.action === 'current') {
        currentCalls++;
        if (currentCalls === 1) return route.fulfill({status:503,json:{error:'temporary failure'}});
        return route.fulfill({json:{game:snapshot}});
      }
      if (body.action === 'move') {
        moveCalls++; snapshot = {...snapshot,moves:['e4'],turn:'b',version:1}; offline = true;
        return route.abort('failed'); // the server committed, but the response was lost
      }
      if (body.action === 'snapshot' && offline) return route.abort('failed');
      return route.fulfill({json:{game:snapshot}});
    }
    return route.fulfill({json:{}});
  });
  await page.goto(`${base}/login`);
  await page.locator('#email').fill('test@example.com'); await page.locator('#password').fill('password123'); await page.locator('#auth-submit').click();
  await page.locator('#dashboard-home').waitFor({state:'visible'});
  await page.locator('#mobile-menu-toggle').click(); await page.locator('#nav-play').click();
  const frame = page.frameLocator('#member-game-frame');
  await frame.locator('#status').filter({hasText:'Ваш ход'}).waitFor({timeout:10000});
  assert.ok(currentCalls >= 2, 'initial 503 must be retried automatically');
  await frame.locator('[data-square=e2]').click(); await frame.locator('[data-square=e4]').click();
  await frame.locator('#status').filter({hasText:'игровым сервисом'}).waitFor({timeout:10000});
  await frame.locator('[data-square=d2]').click(); await frame.locator('[data-square=d4]').click();
  assert.equal(moveCalls,1, 'uncertain move must not be sent again');
  offline = false;
  const gameFrame = page.frames().find(f => f.url().includes('/pages/game.html'));
  assert.ok(gameFrame);
  await gameFrame.evaluate(() => window.dispatchEvent(new Event('online')));
  await frame.locator('#status').filter({hasText:'Ход соперника'}).waitFor({timeout:10000});
  assert.equal(await frame.locator('[data-square=e4] img').count(),1);
  assert.equal(moveCalls,1);
  console.log('✓ Automatic recovery from initial 503 and lost committed move response');
} finally { await browser.close(); }
