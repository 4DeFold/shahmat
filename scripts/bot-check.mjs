// Browser acceptance check with mocked auth/storage and the real Stockfish worker.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),...(process.env.CHROMIUM_EXTRA_ARGS?{args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')}:{})});
const uid='12345678-1234-1234-1234-123456789012', user={id:uid,aud:'authenticated',role:'authenticated',user_metadata:{palette:'forest',palette_theme:'dark'}};
const token=['e30',Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
 for(const [viewport,reducedMotion] of [[{width:1440,height:900},'no-preference'],[{width:390,height:844},'reduce']]) {
  const page=await browser.newPage({viewport,reducedMotion}); const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(value=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(value)),session);
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/auth/v1/user') return route.fulfill({json:user});
   if(path==='/rest/v1/profiles') return route.fulfill({json:{username:'Alice',bio:'',palette:'forest'}});
   if(path==='/rest/v1/bot_games') { if(route.request().method()!=='GET') writes.push(route.request().postDataJSON()); return route.fulfill({json:route.request().method()==='GET'?[]:{}}); }
   return route.fulfill({json:{game:null}});
  });
  await page.goto(`${base}/bot`); await page.locator('#page-bot').waitFor({state:'visible'});
  const nav=await page.locator('.sidebar-nav [data-page]').evaluateAll(els=>els.map(el=>el.dataset.page)); assert.deepEqual(nav,['game','bot','rating']);
  const frame=page.frameLocator('#bot-game-frame'); await frame.locator('#bot-play:not([disabled])').waitFor({timeout:20000});
  assert.equal(await frame.locator('.orbit-board').count(),8);
  assert.equal(await frame.locator('.orbit-board .mini-square').count(),512);
  assert.equal(await frame.locator('#bot-name').textContent(),'Пешка');
  if(reducedMotion==='no-preference') {
   const before=await frame.locator('.orbit-board').first().getAttribute('style'); await page.waitForTimeout(250);
   assert.notEqual(await frame.locator('.orbit-board').first().getAttribute('style'),before,'boards orbit');
   await frame.locator('#bot-next').click(); await frame.locator('#bot-name').getByText('Конь').waitFor(); await page.waitForTimeout(650);
   const opacity=await frame.locator('#hero-piece').evaluate(el=>getComputedStyle(el).opacity); assert.equal(opacity,'1','piece remains visible after animation');
   await frame.locator('#bot-prev').click(); await frame.locator('#bot-name').getByText('Пешка').waitFor(); await page.waitForTimeout(650);
  } else {
   await frame.locator('#bot-prev').click(); assert.equal(await frame.locator('#bot-name').textContent(),'Король');
   await frame.locator('#bot-next').click(); assert.equal(await frame.locator('#bot-name').textContent(),'Пешка');
  }
  await frame.locator('#bot-play').click();
  if(reducedMotion==='no-preference') { await frame.locator('#bot-app[data-phase=launching]').waitFor(); await frame.locator('.fly-board').waitFor({timeout:3000}); }
  await frame.locator('#bot-app[data-phase=playing]').waitFor({timeout:6000});
  assert.equal(await frame.locator('#board .square').count(),64); assert.equal(await frame.locator('#resign-wrap').getAttribute('aria-hidden'),'true');
  await frame.locator('[data-square=e2]').click(); await frame.locator('[data-square=e4]').click();
  await frame.locator('#status').getByText(/Ваш ход/).waitFor({timeout:30000});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('shahmat.bot-games.v1.12345678-1234-1234-1234-123456789012'))?.current?.moves?.length===2,{timeout:30000});
  assert.ok(writes.length>=2, 'game and moves sent to separate table');
  await page.reload(); await page.locator('#page-bot').waitFor({state:'visible'}); await frame.locator('#bot-app[data-phase=playing]').waitFor({timeout:20000});
  assert.ok((await frame.locator('#move-list').innerText()).includes('e4'),'active game restored after reload');
  page.once('dialog',d=>d.accept()); await frame.locator('#return-button').click(); await frame.locator('#bot-app[data-phase=choose]').waitFor();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('shahmat.bot-games.v1.12345678-1234-1234-1234-123456789012')).current.status==='abandoned');
  assert.deepEqual(errors,[]); await page.close();
 }
 // Restore a game older than a minute to check resignation and persistence.
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const old={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',user_id:uid,level:1,moves:[],status:'active',started_at:new Date(Date.now()-61000).toISOString(),updated_at:new Date().toISOString()};
 let saved=[];
 await page.addInitScript(({session,old})=>{ localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(session)); localStorage.setItem('shahmat.bot-games.v1.'+session.user.id,JSON.stringify({current:old,pending:[]})); },{session,old});
 await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{ const path=new URL(route.request().url()).pathname; if(path==='/auth/v1/user') return route.fulfill({json:user}); if(path==='/rest/v1/profiles') return route.fulfill({json:{username:'Alice',bio:'',palette:'forest'}}); if(path==='/rest/v1/bot_games') {if(route.request().method()!=='GET') saved.push(route.request().postDataJSON()); return route.fulfill({json:route.request().method()==='GET'?[]:{}});} return route.fulfill({json:{game:null}}); });
 await page.goto(`${base}/bot`); const f=page.frameLocator('#bot-game-frame'); await f.locator('#bot-app[data-phase=playing]').waitFor();
 assert.equal(await f.locator('#resign-wrap').getAttribute('aria-hidden'),'false'); await f.locator('#resign-button').click(); await f.locator('#resign-confirm').click();
 await f.locator('#bot-app[data-phase=finished]').waitFor(); assert.match(await f.locator('#status').textContent(),/сдались/);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('shahmat.bot-games.v1.12345678-1234-1234-1234-123456789012')).current.status==='black_win');
 assert.ok(saved.some(row=>row.status==='black_win')); await page.close();
 console.log('✓ Bot navigation, orbit, transitions, actual Stockfish moves, save/restore, resignation and mobile reduced motion');
} finally { await browser.close(); }
