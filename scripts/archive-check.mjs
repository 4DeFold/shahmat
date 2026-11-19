import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4197';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
const id='12345678-1234-1234-1234-123456789012',user={id,aud:'authenticated',role:'authenticated',user_metadata:{username:'Alice'}},token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
 const page=await browser.newPage({viewport,reducedMotion:process.env.MOTION || 'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(s=>{localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(s));window.Worker=class{postMessage(m){if(m==='uci')setTimeout(()=>this.onmessage?.({data:'uciok'}),0);if(m==='isready')setTimeout(()=>this.onmessage?.({data:'readyok'}),0);if(m.startsWith('go '))setTimeout(()=>this.onmessage?.({data:'bestmove e7e5'}),0);}terminate(){}};},session);
 await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{const path=new URL(route.request().url()).pathname;
 if(path==='/auth/v1/user')return route.fulfill({json:user});
 if(path==='/rest/v1/profiles')return route.fulfill({json:{username:'Alice',bio:'',palette:'monochrome'}});
 if(path.endsWith('/my_archive_games')){const mode=route.request().postDataJSON().p_mode;return route.fulfill({json:mode==='blitz'?[{id:'a',my_color:'w',white_name:'Alice',black_name:'Bob',moves:['f3','e5','g4','Qh4#']}]:mode==='rapid'?[{id:'c',my_color:'b',white_name:'Bob',black_name:'Alice',moves:['e4','e5']}]:[]});}
 if(path==='/rest/v1/bot_games'){const url=new URL(route.request().url());return route.fulfill({json:route.request().method()==='GET' && url.searchParams.has('status') && url.searchParams.get('status')!=='eq.active'?[{id:'b',level:2,moves:['e4','e5','Nf3'],status:'draw'}]:[]});}
 if(path==='/rest/v1/profile_rewards')return route.fulfill({json:{avatar_unlocked:false}});
 if(path==='/functions/v1/matchplay')return route.fulfill({json:{game:null}});
 return route.fulfill({json:[]});});
 await page.goto(`${base}/archive`);const f=page.frameLocator('#archive-frame');await f.locator('.archive-card').waitFor({timeout:10000});
 assert.equal(await f.locator('.archive-card strong').textContent(),'Bob');assert.equal(await f.locator('.archive-mini-square.last').count(),2);assert.equal(await f.locator('.archive-mini-square.check').count(),1);
 if(process.env.SCREENSHOT){await page.waitForTimeout(500);await page.screenshot({path:`archive-grid-${viewport.width}.png`});}await f.locator('.archive-card').click();await f.locator('#archive-detail:not([hidden])').waitFor();if(process.env.SCREENSHOT)await page.screenshot({path:`archive-detail-${viewport.width}.png`});assert.equal(await f.locator('#black-name').textContent(),'Bob');assert.equal(await f.locator('.clock').count(),0);assert.equal(await f.locator('[data-square=h4] .piece').count(),1);
 await f.locator('#board').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'ф',code:'KeyA',bubbles:true})));assert.equal(await f.locator('[data-square=d8] .piece').count(),1);
 await f.locator('#board').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'в',code:'KeyD',bubbles:true})));assert.equal(await f.locator('[data-square=h4] .piece').count(),1);
 await page.locator('#nav-archive').focus();await page.evaluate(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ф',code:'KeyA',bubbles:true})));await f.locator('[data-square=d8] .piece').waitFor();await f.locator('#archive-back').click();await f.locator('[data-mode=rapid]').click();await f.locator('.archive-card').waitFor();await f.locator('.archive-card').click();assert.equal(await f.locator('#white-name').textContent(),'Alice');assert.equal(await f.locator('#black-name').textContent(),'Bob');assert.equal(await f.locator('#board').evaluate(el=>el.classList.contains('black')),true);await f.locator('#archive-back').click();await f.locator('[data-mode=bot]').click();await f.locator('.archive-card strong').filter({hasText:'2 уровень'}).waitFor();
 await page.goto(`${base}/bot`);const b=page.frameLocator('#bot-game-frame');await b.locator('#bot-play:not([disabled])').waitFor({timeout:10000});assert.match(await b.locator('#hero-piece').getAttribute('src'),/wP.svg/);
 await b.locator('#bot-app').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'в',code:'KeyD',bubbles:true})));assert.equal(await b.locator('#bot-name').textContent(),'2 уровень');
 await b.locator('#bot-app').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'ф',code:'KeyA',bubbles:true})));assert.equal(await b.locator('#bot-name').textContent(),'1 уровень');
 await b.locator('#bot-app').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true})));await b.locator('#bot-app[data-phase=playing]').waitFor();
 await b.locator('[data-square=e2]').click();await b.locator('[data-square=e4]').click();await page.waitForTimeout(250);assert.equal(await b.locator('[data-square=e7] .piece').count(),1);await b.locator('[data-square=e5] .piece').waitFor({timeout:3000});
 assert.deepEqual(errors,[]);await page.close();
}console.log('✓ Archive, physical keys, bot selector and delayed reply on desktop and mobile');} finally {await browser.close();}
