// Browser check for retrying cancellation without silently rejoining the queue.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({headless:true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),
  ...(process.env.CHROMIUM_EXTRA_ARGS ? {args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')} : {})});
const user = {id:'12345678-1234-1234-1234-123456789012',email:'test@example.com',aud:'authenticated',role:'authenticated',user_metadata:{}};
let searches = 0, cancels = 0, outage = true;
try {
  const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/auth/v1/token') {
      const token = ['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
      return route.fulfill({json:{access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'mock-refresh',user}});
    }
    if (path === '/auth/v1/user') return route.fulfill({json:user});
    if (path === '/rest/v1/profiles') return route.fulfill({json:{username:'Player',bio:'',palette:'monochrome'}});
    if (path === '/functions/v1/matchplay') {
      const body = JSON.parse(request.postData());
      if (body.action === 'heartbeat') return route.fulfill({json:{ok:true}});
      if (body.action === 'current') return route.fulfill({json:{game:null}});
      if (body.action === 'search') { searches++; return route.fulfill({json:{state:'searching'}}); }
      if (body.action === 'cancel') { cancels++; if (outage) return route.abort('failed'); return route.fulfill({json:{game:null}}); }
    }
    return route.fulfill({json:{}});
  });
  await page.goto(`${base}/login`);
  await page.locator('#email').fill('test@example.com'); await page.locator('#password').fill('password123'); await page.locator('#auth-submit').click();
  await page.locator('#dashboard-home').waitFor({state:'visible'});
  await page.locator('#mobile-menu-toggle').click(); await page.locator('#nav-play').click();
  const frame = page.frameLocator('#member-game-frame');
  await frame.locator('label:has(input[value=blitz])').click();
  await frame.locator('#start-search').click();
  await frame.locator('#status').filter({hasText:'Ищем'}).waitFor();
  await frame.locator('#cancel-search').click();
  await frame.locator('#status').filter({hasText:'Не удалось подтвердить отмену'}).waitFor();
  const searchCount = searches;
  assert.equal(await frame.locator('#cancel-search').isDisabled(),true);
  outage = false;
  await frame.locator('#status').filter({hasText:'Поиск отменён'}).waitFor({timeout:10000});
  assert.ok(cancels >= 2); assert.equal(searches, searchCount, 'cancellation retries must never start another search');
  console.log('✓ Failed cancellation automatically retries without rejoining the queue');
} finally { await browser.close(); }
