// Real Chromium rendering and input against an isolated mocked online match; no DB writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}), ...(process.env.CHROMIUM_EXTRA_ARGS ? {args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')} : {})});
const user = {id:'12345678-1234-1234-1234-123456789012',aud:'authenticated',role:'authenticated',user_metadata:{}};
const token = ['e30', Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'), 'x'].join('.');
const session = {access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
  const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  await page.addInitScript(value => {
    localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token', JSON.stringify(value));
    localStorage.setItem('shahmat.game.sound-muted', 'true');
    const param = () => ({value:0, setValueAtTime(){}, exponentialRampToValueAtTime(){}});
    class FakeAudioContext {
      state = 'running'; currentTime = 0; sampleRate = 44100; destination = {};
      createBuffer() { return { getChannelData:() => new Float32Array(2426) }; }
      createOscillator() { return {frequency:param(), connect(){}, start(){ window.soundTaps = (window.soundTaps || 0) + 1; }, stop(){}}; }
      createGain() { return {gain:param(), connect(){}}; }
      createBufferSource() { return {connect(){}, start(){}, stop(){}}; }
      createBiquadFilter() { return {frequency:param(), connect(){}}; }
      close() { return Promise.resolve(); }
    }
    window.AudioContext = FakeAudioContext;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(...args) { if (this.classList.contains('piece') && args[1]?.duration === 165) window.pieceAnimations = (window.pieceAnimations || 0) + 1; return animate.apply(this,args); };
  }, session);
  let state = {id:'fixture',white_id:user.id,black_id:'opponent',mode:'blitz',moves:[],turn:'w',version:0,status:'active',white_ms:180000,black_ms:180000};
  let release; const delayed = new Promise(resolve => { release = resolve; });
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/user') return route.fulfill({json:user});
    if (path === '/functions/v1/matchplay-preview') {
      const body = JSON.parse(route.request().postData());
      if (body.action === 'heartbeat') return route.fulfill({json:{ok:true}});
      if (body.action === 'opponent') return route.fulfill({json:{username:'Friend'}});
      if (body.action === 'move') { await delayed; state = {...state,moves:['e4'],turn:'b',version:1}; }
      return route.fulfill({json:{game:state}});
    }
    return route.fulfill({json:{}});
  });
  await page.goto(`${process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174'}/pages/game.html`);
  await page.locator('#status').filter({hasText:'Ваш ход'}).waitFor();
  await page.evaluate(() => { window.pawn = document.querySelector('[data-square=e2] img'); window.square = document.querySelector('[data-square=e4]'); });
  await page.locator('[data-square=e2]').click(); await page.locator('[data-square=e4]').click();
  assert.equal(await page.evaluate(() => document.querySelector('[data-square=e4] img') === window.pawn),true, 'move is immediate and reuses the piece');
  assert.equal(await page.evaluate(() => window.pieceAnimations),1);
  assert.equal(await page.evaluate(() => window.soundTaps), 1, 'old muted preference must not suppress move sound');
  await page.locator('[data-square=g1]').click(); await page.locator('[data-square=f3]').click();
  assert.equal(await page.locator('[data-square=f3]').evaluate(el => el.classList.contains('premove')),true);
  release(); await page.locator('#status').filter({hasText:'Ход соперника'}).waitFor();
  assert.equal(await page.evaluate(() => document.querySelector('[data-square=e4]') === window.square && document.querySelector('[data-square=e4] img') === window.pawn),true);
  assert.equal(await page.evaluate(() => window.pieceAnimations),1, 'acknowledgement must not animate again');
  const history = page.locator('#history-content');
  const initialHeight = await history.evaluate(el => el.getBoundingClientRect().height);
  assert.ok(initialHeight > 40);
  await page.locator('#toggle-moves').click();
  assert.equal(await page.locator('#toggle-moves').getAttribute('aria-expanded'), 'false');
  await page.waitForTimeout(90);
  const collapsingHeight = await history.evaluate(el => el.getBoundingClientRect().height);
  assert.ok(collapsingHeight > 0 && collapsingHeight < initialHeight, `history should collapse gradually: ${initialHeight} -> ${collapsingHeight}`);
  await page.waitForTimeout(400);
  assert.equal(await history.evaluate(el => el.getBoundingClientRect().height), 0);
  await page.locator('#toggle-moves').click(); await page.waitForTimeout(90);
  const expandingHeight = await history.evaluate(el => el.getBoundingClientRect().height);
  assert.ok(expandingHeight > 0 && expandingHeight < initialHeight, `history should expand gradually: ${expandingHeight}`);
  await page.waitForTimeout(400);
  const fonts = await page.evaluate(async () => {
    await Promise.all([document.fonts.load("16px 'Charis SIL'", 'Жывы'), document.fonts.load('16px Playfair', 'Играть')]);
    return { body:getComputedStyle(document.body).fontFamily, clock:getComputedStyle(document.querySelector('#player-clock')).fontFamily,
      loaded:document.fonts.check("16px 'Charis SIL'", 'Жывы') && document.fonts.check('16px Playfair', 'Играть') };
  });
  assert.match(fonts.body, /Charis SIL/); assert.match(fonts.clock, /Instrument Serif/); assert.equal(fonts.loaded, true);
  assert.equal(await page.locator('#sound-toggle, .sound-toggle, .game-rail h1, .leave-note').count(), 0);
  await page.evaluate(() => document.documentElement.style.setProperty('--accent', '#3d5a40'));
  await page.waitForTimeout(300);
  const palette = await page.evaluate(() => {
    const dot = document.querySelector('.game-notice .status-dot');
    const running = document.querySelector('.clock.running');
    const premove = document.querySelector('.square.premove');
    return {dot:getComputedStyle(dot).backgroundColor, outline:getComputedStyle(running).outlineColor, premove:getComputedStyle(premove).boxShadow};
  });
  assert.equal(palette.dot, 'rgb(61, 90, 64)'); assert.equal(palette.outline, 'rgb(61, 90, 64)');
  assert.match(palette.premove, /61, 90, 64/);
  assert.equal(await page.locator('#player-clock-card').evaluate(el => getComputedStyle(el, '::after').content), 'none');
  assert.equal(await page.locator('#player-clock').evaluate(el => getComputedStyle(el).textDecorationLine), 'none');
  console.log('✓ Chromium: move sound ignores old mute, smooth history and clean game controls');
} finally { await browser.close(); }
