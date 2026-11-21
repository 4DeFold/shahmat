// Run against a local dev or production preview server. No real Supabase writes.
// BROWSERS=chromium,firefox,webkit npm run test:cross-browser
// Optional: CHROMIUM_EXECUTABLE_PATH / FIREFOX_EXECUTABLE_PATH / WEBKIT_EXECUTABLE_PATH.
import assert from 'node:assert/strict';
import {chromium, firefox, webkit} from 'playwright';
import {Chess} from 'chess.js';

const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4270';
const requested=(process.env.BROWSERS||'chromium,firefox,webkit').split(',').map(x=>x.trim()).filter(Boolean);
const engines={chromium,firefox,webkit};
const id='12345678-1234-1234-1234-123456789012';
const user={id,aud:'authenticated',role:'authenticated',user_metadata:{palette:'forest'}};
const token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
const game={id:'fixture',white_name:'Alice',black_name:'Bob',mode:'blitz',moves:['e4','d5','exd5','Qxd5','Nf3'],turn:'b',version:5,status:'active',white_ms:150000,black_ms:155000,white_yar:1100,black_yar:1200};
const board=new Chess();for(const move of game.moves)board.move(move);
for(const name of requested){
 assert.ok(engines[name],`Unknown browser: ${name}`);
 const executablePath=process.env[`${name.toUpperCase()}_EXECUTABLE_PATH`];
 const args=name==='chromium' && process.env.CHROMIUM_EXTRA_ARGS ? process.env.CHROMIUM_EXTRA_ARGS.split(' ') : [];
 const browser=await engines[name].launch({headless:true,...(executablePath?{executablePath}:{}),args});
 try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
   const touch=viewport.width<=700 && name!=='firefox';
   const context=await browser.newContext({viewport,hasTouch:touch,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   const press=locator=>touch?locator.tap():locator.click();
   async function checkBoardLayout(root,label){
    const geometry=await root.locator('#board').evaluate(board=>{
     const frame=board.closest('.board-frame'),wrap=frame.closest('.board-wrap, .board-section');
     const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
     const avatars=[...wrap.querySelectorAll('.player-row .avatar')];
     const rows=[...wrap.querySelectorAll('.player-row')];return {board:rect(board),frame:rect(frame),avatars:avatars.map(rect),info:rows.map(row=>({name:rect(row.querySelector('.player-info > :first-child')), captures:rect(row.querySelector('.captured-pieces'))})),border:getComputedStyle(board).borderTopWidth,padding:getComputedStyle(frame).paddingTop,radius:avatars.map(a=>getComputedStyle(a).borderRadius),avatarBorders:avatars.map(a=>getComputedStyle(a).borderTopWidth),outlines:avatars.map(a=>getComputedStyle(a,'::after').content)};
    });
    const {board,frame,avatars,info,border,padding,radius,avatarBorders,outlines}=geometry;
    assert.equal(border,'0px',`${name} ${label} border`);assert.equal(padding,'0px',`${name} ${label} frame padding`);
    assert.equal(avatars.length,2,`${name} ${label} avatars`);
    assert.ok(radius.every(r=>r==='0px')&&avatarBorders.every(x=>x==='0px')&&outlines.every(x=>x==='none'),`${name} ${label} avatar corners and border`);
    avatars.forEach(avatar=>assert.ok(Math.abs(avatar.width-frame.width/12)<1&&Math.abs(avatar.height-frame.width/12)<1,`${name} ${label} avatar 1/12 of board ${JSON.stringify(geometry)}`));
    info.forEach((part,i)=>{const middle=(avatars[i].top+avatars[i].bottom)/2;assert.ok(part.name.bottom<=middle+1&&part.captures.top>=middle-1,`${name} ${label} two-line layout ${JSON.stringify(geometry)}`);});
    assert.ok(Math.abs(frame.width-board.width)<1,`${name} ${label} board fills frame`);
    assert.ok(Math.abs(avatars[0].left-frame.left)<1&&Math.abs(avatars[1].left-frame.left)<1,`${name} ${label} aligned edges ${JSON.stringify(geometry)}`);
    assert.ok(Math.abs(avatars[0].bottom-frame.top)<1&&Math.abs(avatars[1].top-frame.bottom)<1,`${name} ${label} flush avatars ${JSON.stringify(geometry)}`);
   }
   page.on('pageerror',error=>errors.push({route:new URL(page.url()).pathname,message:error.message,stack:error.stack}));
   await page.addInitScript(session=>{
    localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(session));
    Math.random=()=>.1;
    // Exercise the Safari-compatible UUID fallback, not just the native API.
    Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true});
    // Deterministic UCI fixture; real Stockfish is exercised separately.
    window.Worker=class{postMessage(m){if(m==='uci')setTimeout(()=>this.onmessage?.({data:'uciok'}),0);if(m==='isready')setTimeout(()=>this.onmessage?.({data:'readyok'}),0);if(m.startsWith('go '))setTimeout(()=>this.onmessage?.({data:'bestmove e7e5'}),0);}terminate(){}};
   },session);
   await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
    const p=new URL(route.request().url()).pathname, method=route.request().method();
    const fulfill=options=>route.fulfill({...options,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',...options.headers}});
    if(method==='OPTIONS')return fulfill({status:204,body:''});
    if(p==='/auth/v1/user')return fulfill({json:user});
    if(p==='/rest/v1/profiles')return fulfill({json:{username:'Alice',bio:'Hello',palette:'forest'}});
    if(p.endsWith('/profile_public'))return fulfill({json:{username:route.request().postDataJSON().p_name,bio:'Hello',palette:'forest',theme:'light',ratings:{overall:1100},games:{bot:1}}});
    if(p.endsWith('/rank_leaderboard'))return fulfill({json:[{username:'Alice',yar:1100,elo:1000},{username:'Bob',yar:1000,elo:1000}]});
    if(p.endsWith('/rank_my_position'))return fulfill({json:[{username:'Alice',yar:1100,elo:1000,place:1}]});
    if(p.endsWith('/profile_piece_sets'))return fulfill({json:[{username:'Bob',piece_set:'chessnut'}]});
    if(p.endsWith('/my_archive_all'))return fulfill({json:[{id:'a',mode:'bot',level:1,my_color:'w',moves:['e4','e5'],result:'draw'}]});
    if(p.endsWith('/spectator_modes'))return fulfill({json:[{mode:'blitz',game_count:1}]});
    if(p.endsWith('/spectator_games_sorted'))return fulfill({json:[{...game,fen:board.fen(),move_count:5}]});
    if(p.endsWith('/spectator_game'))return fulfill({json:game});
    if(p==='/rest/v1/profile_media'||p==='/rest/v1/profile_rewards')return fulfill({json:null});
    if(p==='/functions/v1/matchplay')return fulfill({json:{game:null}});
    if(method!=='GET' && p==='/rest/v1/bot_games')return fulfill({status:201,json:null});
    return fulfill({json:[]});
   });
   await page.goto(`${base}/home`);await page.locator('#dashboard-home').waitFor({state:'visible'});
   for(const route of ['rating','profile','settings','help']){
    await page.goto(`${base}/${route}`);await page.locator(`#page-${route}`).waitFor({state:'visible'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} ${viewport.width} ${route}: horizontal overflow`);
    if(route==='rating'){
     await page.locator('.rating-row').first().waitFor();await page.waitForFunction(()=>document.querySelectorAll('.rating-row .rating-avatar')[1]?.getAttribute('src')==='/pieces/chessnut/wN.svg');
     for(const image of await page.locator('.rating-row .rating-avatar').all()) {const box=await image.boundingBox();const expected=viewport.width<=700?30:36;assert.ok(Math.abs(box.width-expected)<1&&Math.abs(box.height-expected)<1,`${name}: avatar ${JSON.stringify(box)}`);}
    }
    if(route==='profile')await page.locator('#profile-display-name').getByText('Alice').waitFor();
   }
   await page.goto(`${base}/game`);let f=page.frameLocator('#member-game-frame');await f.locator('#board .square').first().waitFor();assert.equal(await f.locator('#board .square').count(),64);await checkBoardLayout(f,'online');
   await page.goto(`${base}/archive`);f=page.frameLocator('#archive-frame');await f.locator('.archive-card').first().click();await f.locator('#archive-detail').waitFor({state:'visible'});assert.equal(await f.locator('#board .square').count(),64);await checkBoardLayout(f,'archive');
   await page.goto(`${base}/watch`);f=page.frameLocator('#watch-frame');await f.locator('[data-game-id=fixture]').click();await f.locator('#white-name').getByText('Alice').waitFor();await checkBoardLayout(f,'watch');assert.equal(await f.locator('#white-captured img').count(),1);assert.equal(await f.locator('#black-captured img').count(),1);await f.locator('#history-prev').click();assert.equal(await f.locator('[data-square=g1] .piece').count(),1);
   await page.goto(`${base}/bot`);f=page.frameLocator('#bot-game-frame');await press(f.locator('#bot-play:not([disabled])'));await f.locator('#bot-app[data-phase=playing]').waitFor();await checkBoardLayout(f,'bot');await press(f.locator('[data-square=e2]'));await press(f.locator('[data-square=e4]'));await f.locator('[data-square=e5] .piece').waitFor();
   await page.goto(`${base}/play`);await page.locator('#board .piece').first().waitFor();await checkBoardLayout(page,'guest');await press(page.locator('[data-square=e2]'));await press(page.locator('[data-square=e4]'));await page.locator('[data-square=e4] .piece').waitFor();
   if(errors.length) console.error('BROWSER_ERRORS_JSON',JSON.stringify(errors));
   assert.deepEqual(errors,[],`${name} ${viewport.width} browser errors`);
   await context.close();
   console.log(`✓ ${name} ${viewport.width}×${viewport.height}: home, rating, profile, settings, help, online, archive, watch, bot and guest`);
  }
 } finally {await browser.close();}
}
