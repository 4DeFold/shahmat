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
const usePieces=process.env.GAME_PIECE_TEST==='1';
const avatar='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS/8AAAAASUVORK5CYII=';
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
    if (path === '/rest/v1/rpc/rank_game_players') return route.fulfill({json:[{player:'self',username:'Player',yar:1000},{player:'opponent',username:'Friend',yar:1000}]});
    if (path === '/rest/v1/rpc/profile_public') return route.fulfill({json:{username:'Friend',bio:'Bio',palette:'forest',theme:'dark',piece_set:'regent',avatar:usePieces?null:avatar,banner:avatar,ratings:{overall:1000},games:{}}});
    if (path === '/rest/v1/rpc/profile_piece_sets') return route.fulfill({json:[{username:'Player',piece_set:'turnier'},{username:'Friend',piece_set:'regent'}]});
    if (path === '/rest/v1/rpc/profile_avatar_themes') return route.fulfill({json:[{username:'Player',palette:'amber'},{username:'Friend',palette:'forest'}]});
    if (path === '/rest/v1/rpc/rank_leaderboard') return route.fulfill({json:[{username:'Friend',yar:1200},{username:'Player',yar:1100}]});
    if (path === '/rest/v1/rpc/profile_avatars') return route.fulfill({json:[{username:'Player',avatar},{username:'Friend',avatar:usePieces?null:avatar}]});
    if (path === '/functions/v1/matchplay') {
      const body = JSON.parse(request.postData());
      if (body.action === 'heartbeat') return route.fulfill({json:{ok:true}});
      if (body.action === 'opponent') return route.fulfill({json:{username:'Friend',bio:'Bio'}});
      if (body.action === 'resign') { snapshot = {...snapshot, status:'finished', result:'black_win',reason:'resignation',version:snapshot.version+1}; return route.fulfill({json:{game:snapshot}}); }
      if (body.action === 'current' || body.action === 'cancel') return route.fulfill({ json:{ game:snapshot } });
      if (body.action === 'search') {
        snapshot = { id:'fixture', white_id:user.id, black_id:'opponent', mode:body.mode, moves:[], turn:'w', version:0, status:'active', white_ms:180000, black_ms:180000, game_age_ms:60000 };
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
  assert.equal(await game.locator('#start-search').isHidden(), true);
  await game.locator('label:has(input[value=blitz])').click();
  assert.equal(await game.locator('#player-clock').getAttribute('aria-label'), '03:00');
  await game.locator('#start-search').click();
  await game.locator('#status').filter({ hasText:'Ваш ход' }).waitFor();
  await game.locator('#player-avatar-image.custom-profile-avatar').waitFor(); if(usePieces)await game.locator('#opponent-avatar-image[src="/pieces/regent/bN.svg"]').waitFor();else await game.locator('#opponent-avatar-image.custom-profile-avatar').waitFor();
  assert.equal(await game.locator('#opponent-top-status').textContent(),'Топ 1');assert.equal(await game.locator('#player-top-status').textContent(),'Топ 2');assert.equal(await game.locator('#mode-list input').count(),3);
  assert.equal(await game.locator('#player-avatar-image').getAttribute('src'),avatar); assert.equal(await game.locator('#opponent-avatar-image').getAttribute('src'),usePieces?'/pieces/regent/bN.svg':avatar);
  if(process.env.GAME_SCREENSHOT) await page.screenshot({path:'/tmp/member-game-three-modes.png'});
  assert.equal(await game.locator('#mode-picker').getAttribute('aria-hidden'), 'true');
  assert.equal(await game.locator('#mode-picker').evaluate(el => el.getBoundingClientRect().height), 0);
  assert.equal(await game.locator('#mode-summary').innerText(), 'Блиц · 3 мин');
  assert.equal(await game.locator('#resign-control').isVisible(), true);
  await game.locator('[data-square=e2]').click(); await game.locator('[data-square=e4]').click();
  await game.locator('#status').filter({ hasText:'Ход соперника' }).waitFor();
  assert.equal(await game.locator('[data-square=e4] img').count(), 1);
  // Drag a premove while the opponent is thinking, then deliver their reply.
  const from = await game.locator('[data-square=g1]').boundingBox(), to = await game.locator('[data-square=f3]').boundingBox();
  await page.mouse.move(from.x + from.width/2, from.y + from.height/2); await page.mouse.down();
  await page.mouse.move(to.x + to.width/2, to.y + to.height/2, { steps:8 }); await page.mouse.up();
  assert.equal(await game.locator('[data-square=f3]').evaluate(el => el.classList.contains('premove')), true);
  snapshot = { ...snapshot, moves:['e4','e5'], turn:'w', version:2 };
  await game.locator('[data-square=f3] img:not(.premove-ghost)').waitFor();
  assert.equal(snapshot.moves.at(-1), 'Nf3');
  await game.locator('#history-first').click();
  assert.equal(await game.locator('[data-square=e2] img').count(), 1);
  await game.locator('#history-last').click();
  if(await game.locator('#toggle-moves').isVisible()){await game.locator('#toggle-moves').click(); assert.equal(await game.locator('#history-content').getAttribute('aria-hidden'), 'true'); assert.equal(await game.locator('#history-content').evaluate(el => el.getBoundingClientRect().height), 0);}else {assert.equal(await game.locator('#move-list').isVisible(),false);assert.equal(await game.locator('#history-prev').isVisible(),true);}

  for (const size of [{ width:280,height:653 }, { width:390,height:844 }, { width:768,height:1024 }, { width:1440,height:900 }, { width:2560,height:1080 }]) {
    await page.setViewportSize(size);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1), true, 'game page must fit viewport');
    assert.equal(await game.locator('#board').isVisible(), true);
    assert.equal(await game.locator('.game-rail').isVisible(), true);
    const clocks = await game.locator('.clock-pair').evaluate(pair => {
      const own = pair.querySelector('#player-clock-card'), opponent = pair.querySelector('#opponent-clock-card');
      const rect = document.getElementById('board').getBoundingClientRect();
      return { narrow:matchMedia('(max-width:700px)').matches, clockLeft: own.getBoundingClientRect().left, boardRight:rect.right, boardTop:rect.top, boardBottom:rect.bottom, ownRight:own.getBoundingClientRect().right, opponentRight:opponent.getBoundingClientRect().right,
        ownBackground: getComputedStyle(own).backgroundColor, opponentBackground: getComputedStyle(opponent).backgroundColor,
        numberSize: parseFloat(getComputedStyle(own.querySelector('strong')).fontSize), ownTop:own.getBoundingClientRect().top, ownBottom:own.getBoundingClientRect().bottom, opponentTop:opponent.getBoundingClientRect().top, opponentBottom:opponent.getBoundingClientRect().bottom, railTop:document.querySelector('.game-rail').getBoundingClientRect().top,playerRowBottom:document.querySelector('.board-wrap > .player-row:not(.opponent-row)').getBoundingClientRect().bottom,opponentRowCenter:(document.querySelector('.opponent-row').getBoundingClientRect().top+document.querySelector('.opponent-row').getBoundingClientRect().bottom)/2,playerRowCenter:(document.querySelector('.board-wrap > .player-row:not(.opponent-row)').getBoundingClientRect().top+document.querySelector('.board-wrap > .player-row:not(.opponent-row)').getBoundingClientRect().bottom)/2,ownCenter:(own.getBoundingClientRect().top + own.getBoundingClientRect().bottom) / 2, opponentCenter:(opponent.getBoundingClientRect().top + opponent.getBoundingClientRect().bottom) / 2, boardMiddle: (document.getElementById('board').getBoundingClientRect().top + document.getElementById('board').getBoundingClientRect().bottom) / 2 };
    });
    if (clocks.narrow) {
      assert.ok(clocks.playerRowBottom<=clocks.railTop+1, `player row never overlaps the controls at ${size.width}: ${JSON.stringify(clocks)}`);
      assert.ok(Math.abs(clocks.opponentCenter-clocks.opponentRowCenter)<2 && Math.abs(clocks.ownCenter-clocks.playerRowCenter)<2, 'clock aligns with nickname');
      assert.ok(clocks.opponentBottom <= clocks.boardTop && clocks.ownTop >= clocks.boardBottom, 'clocks are above and below the board');
      assert.ok(Math.abs(clocks.ownRight-clocks.opponentRight) <= 1, 'clocks align with each other');
    } else assert.ok(clocks.clockLeft >= clocks.boardRight, 'clocks are next to the board');
    assert.ok(clocks.ownTop >= clocks.opponentBottom, 'player clock is below opponent');
    assert.ok(clocks.ownCenter >= clocks.boardMiddle && clocks.opponentCenter <= clocks.boardMiddle, 'clocks are in the correct halves');
    if (!clocks.narrow) {
      assert.ok(clocks.ownTop - clocks.opponentBottom <= 13, 'clocks form a compact pair');
      assert.ok(Math.abs((clocks.ownBottom + clocks.opponentTop) / 2 - clocks.boardMiddle) <= 1, 'clock pair is centered on the board');
    }
    assert.notEqual(clocks.ownBackground, clocks.opponentBackground, 'clock backgrounds must differ');
    assert.ok(clocks.numberSize >= 12, 'clock numbers are legible');
    const clock = await game.locator('#player-clock').evaluate(async el => {
      await document.fonts.load('600 16px Geist');
      const slots = [...el.querySelectorAll('.clock-digit')];
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
      context.font = getComputedStyle(el).font;
      return { available:el.clientWidth, display:el.querySelector('.clock-digits').getBoundingClientRect().width,
        slot:slots[0].getBoundingClientRect().width, digit:context.measureText('0').width };
    });
    assert.ok(clock.display <= clock.available + 1 && clock.digit <= clock.slot + 1, `${size.width}: digits fit ${JSON.stringify(clock)}`);
    const online = await game.locator('#online-counter').evaluate(el => {
      const number = el.querySelector('#online-value'), label = el.querySelector('.online-label');
      return { numberLeft: number.getBoundingClientRect().left, numberRight: number.getBoundingClientRect().right, labelLeft: label.getBoundingClientRect().left,
        numberSize: parseFloat(getComputedStyle(number).fontSize), labelSize: parseFloat(getComputedStyle(label).fontSize) };
    });
    assert.ok(online.numberLeft < online.labelLeft && online.labelLeft - online.numberRight <= 9 && online.labelSize < online.numberSize, 'online number precedes a smaller label');
  }
  assert.equal(await page.locator('#app-sidebar').isVisible(), true);
  await page.locator('.sidebar-brand').click();
  await page.waitForURL('**/home');
  await page.locator('#nav-play').click();
  await page.frameLocator('#member-game-frame').locator('#status').filter({hasText:'Ход соперника'}).waitFor();
  assert.deepEqual(snapshot.moves, ['e4','e5','Nf3'], 'leaving must not end the game');
  if(usePieces){await game.locator('#opponent-profile-trigger').hover();await game.locator('#opponent-profile-avatar[src="/pieces/regent/bN.svg"]').waitFor();}await game.locator('#opponent-profile-trigger').click();await page.locator('#page-profile').waitFor({state:'visible'});await page.locator('#profile-display-name').filter({hasText:'Friend'}).waitFor();await page.locator('#profile-back').click();await page.locator('#page-game').waitFor({state:'visible'});assert.equal(new URL(page.url()).pathname,'/game');
  await game.locator('#resign-button').click(); assert.equal(await game.locator('#resign-dialog').evaluate(el => el.open),true);
  await game.locator('#resign-cancel').click(); assert.equal(snapshot.status,'active');
  await game.locator('#resign-button').click(); await game.locator('#resign-confirm').click();
  await game.locator('#status').filter({hasText:'вы сдались'}).waitFor(); assert.equal(snapshot.status,'finished');
  assert.equal(new URL(page.url()).pathname,'/game');
  assert.match(await game.locator('#player-clock').evaluate(el => getComputedStyle(el).fontFamily), /Geist/);

  console.log('✓ Responsive game, three controls, profiles, top badges and mocked legal move');
} finally { await browser.close(); }
