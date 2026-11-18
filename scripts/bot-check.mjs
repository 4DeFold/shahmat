// Browser acceptance check with mocked auth/storage and the real Stockfish worker.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),...(process.env.CHROMIUM_EXTRA_ARGS?{args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')}:{})});
const uid='12345678-1234-1234-1234-123456789012', user={id:uid,aud:'authenticated',role:'authenticated',user_metadata:{palette:'forest',palette_theme:'dark'}};
const token=['e30',Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
 for(const [viewport,reducedMotion] of [[{width:1440,height:900},'no-preference'],[{width:390,height:844},'no-preference'],[{width:844,height:390},'no-preference'],[{width:390,height:844},'reduce']]) {
  const page=await browser.newPage({viewport,reducedMotion,...(viewport.width===844?{isMobile:true,hasTouch:true}:{})}); const errors=[],writes=[];
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
  assert.equal(await frame.locator('#orbit-stage .orbit-board').count(),8);
  assert.equal(await frame.locator('.orbit-stage').count(),6);
  assert.equal(await frame.locator('#orbit-stage .mini-square').count(),512);
  assert.equal(await frame.locator('.bot-clocks').count(),0);
  assert.equal(await frame.locator('.bot-selector button').count(),2);
  if(reducedMotion==='no-preference') await page.waitForTimeout(900);
  const slot=await frame.locator('.orbit-slot').boundingBox(), selector=await frame.locator('.bot-selector').boundingBox(), playButton=await frame.locator('#bot-play').boundingBox(), stageArea=await frame.locator('.bot-stage').boundingBox(), hero=await frame.locator('#hero-piece').boundingBox();
  assert.ok(slot.y<stageArea.y,'orbit extends above the screen');
  assert.ok(hero.y>=stageArea.y-2,'figure stays fully visible at the top');
  assert.ok(selector.y+selector.height<=playButton.y+1,'selector remains above play button');
  assert.equal(await frame.locator('#bot-prev').isDisabled(),true);
  assert.equal(await frame.locator('.bot-arrow').first().evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
  assert.equal(await frame.locator('#bot-name').textContent(),'1 уровень');
  if(reducedMotion==='no-preference') {
   await frame.locator('#orbit-boards').evaluate(el=>{
    window.demoEvents=[];
    new MutationObserver(records=>{for(const record of records) { if(record.attributeName==='class' && record.target.classList.contains('last')) window.demoEvents.push({index:record.target.closest('.orbit-board').dataset.index,time:performance.now()}); }}).observe(el,{subtree:true,attributes:true,attributeFilter:['class']});
   });
   const before=await frame.locator('.orbit-board').first().getAttribute('style'); await page.waitForTimeout(250);
   assert.notEqual(await frame.locator('.orbit-board').first().getAttribute('style'),before,'boards orbit');
   assert.match(before,/rotate\(/,'boards turn along the orbit');
   await page.waitForTimeout(3000);
   const events=await frame.locator('#orbit-boards').evaluate(()=>window.demoEvents);
   assert.ok(new Set(events.map(event=>event.index)).size>=3,'demonstration boards tick independently');
   assert.ok(Math.max(...events.map(event=>event.time))-Math.min(...events.map(event=>event.time))>300,'ticks do not happen in lockstep');
   // Every scene shares one translation and keeps a fixed minimum distance.
   await frame.locator('#bot-next').evaluate(button=>{ for(let i=0;i<5;i++) button.click(); });
   assert.equal(await frame.locator('#bot-name').textContent(),'Stockfish');
   assert.equal(await frame.locator('#bot-next').isDisabled(),true);
   await page.waitForTimeout(120);
   const spacing=await frame.locator('.orbit-stage').evaluateAll(els=>els.map(el=>new DOMMatrix(getComputedStyle(el).transform).m41));
   const gap=spacing[1]-spacing[0];
   assert.ok(gap>slot.width,'fixed gap prevents orbit overlap');
   for(let i=1;i<spacing.length-1;i++) assert.ok(Math.abs(spacing[i+1]-spacing[i]-gap)<.1,'constant distance on rapid input');
   await frame.locator('#bot-prev').evaluate(button=>{ for(let i=0;i<5;i++) button.click(); });
   assert.equal(await frame.locator('#bot-name').textContent(),'1 уровень');
   assert.equal(await frame.locator('#bot-prev').isDisabled(),true);
   await page.waitForTimeout(900);
   const outward=await frame.locator('#orbit-stage .orbit-board').first().evaluate(el=>{const stage=el.closest('.orbit-stage').getBoundingClientRect(), r=el.getBoundingClientRect(), m=new DOMMatrix(getComputedStyle(el).transform); return (r.x+r.width/2-(stage.x+stage.width/2))*m.c+(r.y+r.height/2-(stage.y+stage.height/2))*m.d;});
   assert.ok(outward>0,'white side points outward');
   if(viewport.width>=1000) {
    await page.locator('.sidebar-nav [data-page=rating]').click(); await page.locator('#page-rating:not([hidden])').waitFor();
    await page.locator('.sidebar-nav [data-page=bot]').click(); await page.locator('#page-bot:not([hidden])').waitFor();
    await page.waitForFunction(()=>document.querySelector('#bot-game-frame').contentDocument.querySelector('#orbit-slot').getAnimations().length>0,{timeout:3000});
   }
   await frame.locator('#orbit-stage').evaluate(stage=>{
     window.launchReplacements=[];
     new MutationObserver(records=>{for(const record of records) if(record.target.classList?.contains('orbit-board') && [...record.addedNodes].some(node=>node.classList?.contains('board-frame'))) window.launchReplacements.push({bottom:record.target.getBoundingClientRect().bottom,top:document.querySelector('#bot-showcase').getBoundingClientRect().top});}).observe(stage,{childList:true,subtree:true});
   });
  } else {
   await frame.locator('#bot-next').click(); assert.equal(await frame.locator('#bot-name').textContent(),'2 уровень');
   await frame.locator('#bot-prev').click(); assert.equal(await frame.locator('#bot-name').textContent(),'1 уровень');
  }
  await frame.locator('#bot-play').click();
  let destination;
  if(reducedMotion==='no-preference') { await frame.locator('#bot-app[data-phase=launching]').waitFor(); await frame.locator('.fly-board .board').waitFor({timeout:10000}); const replacements=await frame.locator('#orbit-stage').evaluate(()=>window.launchReplacements); assert.equal(replacements.length,1); assert.ok(replacements[0].bottom<=replacements[0].top,'initial board substituted outside the visible area'); destination=await frame.locator('#target-board').boundingBox(); }
  await frame.locator('#bot-app[data-phase=playing]').waitFor({timeout:12000});
  if(destination) { const live=await frame.locator('#target-board').boundingBox(); for(const key of ['x','y','width','height']) assert.ok(Math.abs(destination[key]-live[key])<2,`board arrival has stable ${key}`); }
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
 // Launch immediately during a carousel transition: selected level is retained
 // and the board still emerges only after its orbit has settled.
 {
  const p=await browser.newPage({viewport:{width:1100,height:800}});
  await p.addInitScript(value=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(value)),session);
  await p.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{const path=new URL(route.request().url()).pathname; return route.fulfill({json:path==='/auth/v1/user'?user:path==='/rest/v1/profiles'?{username:'Alice',bio:'',palette:'forest'}:path==='/rest/v1/bot_games'?[]:{game:null}});});
  await p.goto(`${base}/bot`); const f=p.frameLocator('#bot-game-frame'); await f.locator('#bot-play:not([disabled])').waitFor();
  await f.locator('#bot-next').evaluate(button=>{button.click(); document.querySelector('#bot-play').click();});
  await f.locator('.fly-board').waitFor({timeout:10000}); await f.locator('#bot-app[data-phase=playing]').waitFor({timeout:12000});
  assert.equal(await f.locator('#game-bot-name').textContent(),'2 уровень'); await p.close();
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
