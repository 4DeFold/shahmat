// Layout regression checks with local auth fixtures; no writes to Supabase.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}), ...(process.env.CHROMIUM_EXTRA_ARGS ? {args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')} : {}) });
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const user = { id:'12345678-1234-1234-1234-123456789012', aud:'authenticated', role:'authenticated', user_metadata:{} };
const token = ['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session = { access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user };
// Board layout from the main version: retain its dimensions and position.
const baseline = `.board-wrap { width: min(100%, 816px, calc(100dvh - 124px + 136px)); }
.board-with-clocks { grid-template-columns: minmax(0, 1fr) 124px; gap: 12px; }
@media (max-width: 700px) {
 .board-wrap { width: min(100%, max(210px, calc(100dvh - 345px + 86px)), 586px); }
 .board-with-clocks { grid-template-columns: minmax(0, 1fr) 86px; gap: 8px; }
}`;
try {
  for (const {viewport, touch} of [{viewport:{width:1440,height:900}}, {viewport:{width:800,height:900}}, {viewport:{width:390,height:844},touch:true}, {viewport:{width:844,height:390},touch:true}]) {
    const page = await browser.newPage({ viewport, hasTouch:!!touch, isMobile:!!touch, reducedMotion:'reduce' });
    await page.addInitScript(v => localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(v)),session);
    await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/auth/v1/user') return route.fulfill({json:user});
      if (path === '/rest/v1/profiles') return route.fulfill({json:{username:'Player',bio:'',palette:'monochrome'}});
      if (path === '/functions/v1/matchplay') return route.fulfill({json:{game:null}});
      return route.fulfill({json:{}});
    });
    await page.goto(`${base}/home`); await page.locator('#dashboard-home').waitFor({state:'visible'});
    if (viewport.width > 700 && !(touch && viewport.height <= 500)) {
      const logo = await page.locator('.sidebar-brand').evaluate(async el => {
        await document.fonts.ready;
        const range = document.createRange(); range.selectNodeContents(el);
        const text = range.getBoundingClientRect(), sidebar = el.closest('.app-sidebar').getBoundingClientRect();
        return {ratio:text.width / sidebar.width, center:Math.abs((text.left + text.right - sidebar.left - sidebar.right) / 2), left:text.left - sidebar.left, right:sidebar.right - text.right};
      });
      assert.ok(logo.ratio >= .75 && logo.ratio <= .95 && logo.center < 1.5 && logo.left >= 0 && logo.right >= 0, `logo fills and centers in rail: ${JSON.stringify(logo)}`);
    }
    if (viewport.width <= 700 || (touch && viewport.height <= 500)) await page.locator('#mobile-menu-toggle').click();
    const spansRail = async selector => {
      const rects = await page.evaluate(selector => {
        const side = document.querySelector('#app-sidebar').getBoundingClientRect(), item = document.querySelector(selector).getBoundingClientRect();
        return {left:item.left-side.left, right:side.right-item.right};
      }, selector);
      assert.ok(Math.abs(rects.left) < 1.1 && Math.abs(rects.right) < 1.1, `${selector} spans sidebar: ${JSON.stringify(rects)} at ${viewport.width}`);
    };
    await spansRail('#nav-play'); await spansRail('#account-toggle');
    if (!(touch && viewport.height <= 500)) {
      const bottomGap = await page.evaluate(() => document.querySelector('#app-sidebar').getBoundingClientRect().bottom - document.querySelector('#account-toggle').getBoundingClientRect().bottom);
      assert.ok(Math.abs(bottomGap) < 1, `profile touches bottom of sidebar: ${bottomGap}px`);
    }
    await page.locator('#nav-play').hover(); await spansRail('#nav-play');
    await page.locator('#account-toggle').click();
    const gap = await page.evaluate(() => document.querySelector('#account-toggle').getBoundingClientRect().top - document.querySelector('#account-menu').getBoundingClientRect().bottom);
    assert.ok(Math.abs(gap) <= 1, `menu meets profile button at ${viewport.width}x${viewport.height}: ${gap}px`);
    const separation = await page.evaluate(() => document.querySelector('#account-menu').getBoundingClientRect().top - document.querySelector('#nav-play').getBoundingClientRect().bottom);
    assert.ok(separation >= -1, `menu must not cover play at ${viewport.width}x${viewport.height}: ${separation}px`);
    for (const selector of ['#account-menu [data-page=profile]','#account-menu [data-page=settings]','#account-menu [data-page=help]','#account-menu .signout']) await spansRail(selector);
    await page.locator('#account-menu [data-page=profile]').click();
    if (viewport.width <= 700 || (touch && viewport.height <= 500)) await page.locator('#mobile-menu-toggle').click();
    const toggleActive = await page.locator('#account-toggle').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(toggleActive, 'rgba(0, 0, 0, 0)', 'profile route highlights the account tab');
    await page.locator('#account-toggle').click();
    assert.equal(await page.locator('#account-menu [data-page=profile]').getAttribute('aria-current'),'page');
    await spansRail('#account-menu [data-page=profile]');
    await page.close();
    const game = await browser.newPage({viewport,reducedMotion:'reduce'});
    await game.addInitScript(v => localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(v)),session);
    await game.route('https://eswyxbyddkajysogtglp.supabase.co/**', route => route.fulfill({json: new URL(route.request().url()).pathname === '/auth/v1/user' ? user : {game:null}}));
    await game.goto(`${base}/pages/game.html`); await game.locator('#board [data-square=e2]').waitFor();
    const getFrame = () => game.locator('.board-frame').evaluate(el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; });
    const current=await getFrame();
    assert.ok(Math.abs(current.width-current.height)<1 && current.width>0, 'board remains square');
    if (viewport.width > 700) { await game.addStyleTag({content:baseline}); const main=await getFrame();
      for (const key of ['x','y','width','height']) assert.ok(Math.abs(current[key]-main[key]) < 1, `board ${key} matches main: ${current[key]} vs ${main[key]} at ${viewport.width}`);
    }
    await game.close();
  }
  console.log('✓ Full-width sidebar and board geometry at desktop, tablet and mobile sizes');
} finally { await browser.close(); }
