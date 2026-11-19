// Browser acceptance check with mocked auth/storage and the real Stockfish worker.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),...(process.env.CHROMIUM_EXTRA_ARGS?{args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')}:{})});
const avatar='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS/8AAAAASUVORK5CYII=';
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
   if(path==='/rest/v1/profile_media') return route.fulfill({json:{avatar}});
   if(path==='/rest/v1/profile_rewards') return route.fulfill({json:{avatar_unlocked:true}});
   if(path==='/rest/v1/bot_games') { if(route.request().method()!=='GET') writes.push(route.request().postDataJSON()); return route.fulfill({json:route.request().method()==='GET'?[]:{}}); }
   return route.fulfill({json:{game:null}});
  });
  await page.goto(`${base}/bot`); await page.locator('#page-bot').waitFor({state:'visible'});
  const nav=await page.locator('.sidebar-nav [data-page]').evaluateAll(els=>els.map(el=>el.dataset.page)); assert.deepEqual(nav,['game','bot','rating','watch','archive']);
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
  assert.ok((await frame.locator('#bot-next').boundingBox()).width>=64,'arrow has a large hit target');
  assert.equal(await frame.locator('#bot-name').textContent(),'1 уровень');
  if(reducedMotion==='no-preference') {
   await frame.locator('#orbit-boards').evaluate(el=>{
    window.demoEvents=[];
    new MutationObserver(records=>{for(const record of records) { if(record.attributeName==='class' && record.target.classList.contains('last')) window.demoEvents.push({index:record.target.closest('.orbit-board').dataset.index,time:performance.now()}); }}).observe(el,{subtree:true,attributes:true,attributeFilter:['class']});
   });
   const before=await frame.locator('.orbit-board').first().getAttribute('style'); await page.waitForTimeout(250);
   assert.notEqual(await frame.locator('.orbit-board').first().getAttribute('style'),before,'boards orbit');
   assert.match(before,/rotate\(/,'boards turn along the orbit');
   assert.equal(await frame.locator('#orbit-stage .bot-glow').evaluate(el=>getComputedStyle(el).animationName),'bot-glow','glow remains animated');
   for(let sample=0;sample<6;sample++) {
    const escaped=await frame.locator('#orbit-stage').evaluate(stage=>{const bounds=document.querySelector('.bot-stage').getBoundingClientRect();return [...stage.querySelectorAll('.orbit-board')].some(board=>{const r=board.getBoundingClientRect();return r.left<bounds.left-1||r.right>bounds.right+1;});});
    assert.equal(escaped,false,'rotated boards stay clear of both rails'); await page.waitForTimeout(100);
   }
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
    await page.waitForFunction(()=>document.querySelector('#bot-game-frame').contentDocument.querySelector('#hero-piece').getAnimations().length>0,null,{timeout:3000});
   }
   await frame.locator('#orbit-stage').evaluate(stage=>{
     window.launchReplacements=[];
     new MutationObserver(records=>{for(const record of records) if(record.target.classList?.contains('orbit-board') && [...record.addedNodes].some(node=>node.classList?.contains('board-frame'))) window.launchReplacements.push({bottom:record.target.getBoundingClientRect().bottom,top:document.querySelector('#bot-showcase').getBoundingClientRect().top});}).observe(stage,{childList:true,subtree:true});
   });
  } else {
   await frame.locator('#bot-next').click(); assert.equal(await frame.locator('#bot-name').textContent(),'2 уровень');
   await frame.locator('#bot-prev').click(); assert.equal(await frame.locator('#bot-name').textContent(),'1 уровень');
  }
  if(reducedMotion==='no-preference') await frame.locator('#bot-app').evaluate(()=>{
   window.motionSamples=[]; let previous=null;
   const sample=()=>{ const shell=document.querySelector('#bot-app'), phase=shell.dataset.phase;
    const visible=el=>!!el && getComputedStyle(el).visibility==='visible' && Number(getComputedStyle(el).opacity)>.95;
    const flyer=document.querySelector('.fly-board'), live=document.querySelector('#target-board'), wrap=document.querySelector('#bot-board-wrap');
    const mini=[...document.querySelectorAll('.orbit-board > .board-frame')].some(el=>visible(el) && visible(el.parentElement));
    if(phase==='launching'||phase==='playing'||phase==='returning') window.motionSamples.push({phase,fly:visible(flyer),live:visible(live)&&visible(wrap),mini,orbit:getComputedStyle(document.querySelector('#orbit-slot')).display,body:Number(getComputedStyle(document.body).opacity)});
    if(phase==='choose'&&previous==='returning') return; previous=phase; requestAnimationFrame(sample);
   }; requestAnimationFrame(sample);
  });
  await frame.locator('#bot-play').click();
  let destination;
  if(reducedMotion==='no-preference') { await frame.locator('#bot-app[data-phase=launching]').waitFor(); await frame.locator('.fly-board .board').waitFor({timeout:10000}); const replacements=await frame.locator('#orbit-stage').evaluate(()=>window.launchReplacements); assert.equal(replacements.length,1); assert.ok(replacements[0].bottom<=replacements[0].top,'initial board substituted outside the visible area'); destination=await frame.locator('#target-board').boundingBox(); await page.waitForTimeout(450); const ringOpacity=await frame.locator('#orbit-stage .orbit-ring-outer').evaluate(el=>Number(getComputedStyle(el).opacity)); assert.ok(ringOpacity<.35,'orbit ring fades while the board arrives'); }
  await frame.locator('#bot-app[data-phase=playing]').waitFor({timeout:12000});
  if(destination) { const live=await frame.locator('#target-board').boundingBox(); for(const key of ['x','y','width','height']) assert.ok(Math.abs(destination[key]-live[key])<2,`board arrival has stable ${key}`); }
  assert.equal(await frame.locator('#board .square').count(),64);
  await frame.locator('#bot-player-avatar-image.custom-profile-avatar').waitFor(); assert.equal(await frame.locator('#resign-wrap').getAttribute('aria-hidden'),'true');
  assert.equal(await frame.locator('#orbit-slot').evaluate(el=>getComputedStyle(el).display),'none','all orbit boards remain absent after landing');
  await page.waitForTimeout(700);
  assert.equal(await frame.locator('#orbit-stage .orbit-board').first().evaluate(el=>el.getClientRects().length),0,'inline child visibility cannot reveal the background boards');
  await frame.locator('[data-square=e2]').click(); await frame.locator('[data-square=e4]').click();
  await frame.locator('#status').getByText(/Ваш ход/).waitFor({timeout:30000});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('shahmat.bot-games.v1.12345678-1234-1234-1234-123456789012'))?.current?.moves?.length===2,{timeout:30000});
  assert.ok(writes.length>=2, 'game and moves sent to separate table');
  if(reducedMotion==='no-preference') {
   const samples=await frame.locator('#bot-app').evaluate(()=>window.motionSamples);
   assert.ok(samples.some(s=>s.phase==='playing'),'board handoff was sampled');
   assert.ok(samples.filter(s=>s.phase==='playing').every(s=>s.fly||s.live),'no empty frame at arrival');
   assert.ok(samples.filter(s=>s.phase==='playing').every(s=>s.orbit==='none'),'no background orbit after arrival, even for one frame');
   assert.ok(samples.every(s=>s.body===1),'the page never flashes its opacity');
  }
  await page.reload(); await page.locator('#page-bot').waitFor({state:'visible'}); await frame.locator('#bot-app[data-phase=playing]').waitFor({timeout:20000});
  assert.ok((await frame.locator('#move-list').innerText()).includes('e4'),'active game restored after reload');
  if(reducedMotion==='no-preference') await frame.locator('#bot-app').evaluate(()=>{
   window.returnSamples=[];
   const sample=()=>{const shell=document.querySelector('#bot-app'), phase=shell.dataset.phase, flyer=document.querySelector('.fly-board');
    if(phase==='returning') {
     const rect=flyer?.getBoundingClientRect();
     window.returnSamples.push({fly:!!flyer, top:rect?.top, width:rect?.width, opacity:flyer?Number(getComputedStyle(flyer).opacity):0, transform:flyer?getComputedStyle(flyer).transform:'', orbit:getComputedStyle(document.querySelector('#orbit-slot')).display, body:Number(getComputedStyle(document.body).opacity)});
    }
    if(phase==='returning'||(phase==='playing'&&!window.returnSamples.length)) requestAnimationFrame(sample);
   }; requestAnimationFrame(sample);
  });
  page.once('dialog',d=>d.accept()); await frame.locator('#return-button').click();
  if(reducedMotion==='no-preference') { await frame.locator('#bot-app[data-phase=returning]').waitFor(); await frame.locator('.fly-board .board').waitFor(); assert.equal(await frame.locator('#target-board').evaluate(el=>getComputedStyle(el).visibility),'hidden'); }
  await frame.locator('#bot-app[data-phase=choose]').waitFor({timeout:10000});
  if(reducedMotion==='no-preference') { const samples=await frame.locator('#bot-app').evaluate(()=>window.returnSamples); assert.ok(samples.length>0); assert.ok(samples.every(s=>s.fly && s.orbit==='none'),'only the departing board is shown during return'); assert.ok(samples.at(-1).width<samples[0].width*.3,'board shrinks during exit'); assert.ok(samples.at(-1).top<samples[0].top,'board moves upward'); assert.notEqual(samples.at(-1).transform,samples[0].transform,'board rotates during exit'); assert.ok(samples.every(s=>s.body===1),'no full-page opacity flash during return'); }
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('shahmat.bot-games.v1.12345678-1234-1234-1234-123456789012')).current.status==='abandoned');
  assert.deepEqual(errors,[]); await page.close();
 }
 // The ceiling gradient follows the actual active palette and light/dark mode.
 {
  const p=await browser.newPage({viewport:{width:1100,height:800},reducedMotion:'reduce'});
  await p.addInitScript(value=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(value)),session);
  await p.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/auth/v1/user'?user:path==='/rest/v1/profiles'?{username:'Alice',bio:'',palette:'forest'}:path==='/rest/v1/bot_games'?[]:{game:null}});});
  await p.goto(`${base}/bot`); const f=p.frameLocator('#bot-game-frame'); await f.locator('#bot-play:not([disabled])').waitFor();
  for(const [palette,theme,hex,rgb] of [['forest','dark','#26362e','38, 54, 46'],['wood','light','#ede0d4','237, 224, 212'],['monochrome','dark','#000','0, 0, 0'],['monochrome','light','#fff','255, 255, 255']]) {
   await p.evaluate(({palette,theme})=>{const landing=document.querySelector('.landing'); landing.dataset.palette=palette;landing.dataset.paletteTheme=theme;},{palette,theme});
   await p.waitForFunction(hex=>document.querySelector('#bot-game-frame').contentDocument.documentElement.style.getPropertyValue('--bg').trim()===hex,hex);
   const gradient=await f.locator('#orbit-stage').evaluate(el=>getComputedStyle(el,'::after').backgroundImage);
   assert.ok(gradient.includes(rgb),`${palette} ${theme} uses its palette extreme: ${gradient}`);
  }
  await p.close();
 }
 // A completed puzzle fades its pieces, then a different position fades in.
 {
  const p=await browser.newPage({viewport:{width:1100,height:800}});
  await p.addInitScript(value=>{Math.random=()=>0; localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(value));},session);
  await p.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{const path=new URL(route.request().url()).pathname; return route.fulfill({json:path==='/auth/v1/user'?user:path==='/rest/v1/profiles'?{username:'Alice',bio:'',palette:'forest'}:path==='/rest/v1/bot_games'?[]:{game:null}});});
  await p.goto(`${base}/bot`); const f=p.frameLocator('#bot-game-frame'), puzzle=f.locator('#orbit-stage .orbit-board[data-index="2"]');
  await puzzle.waitFor({state:'attached'}); assert.equal(await puzzle.getAttribute('data-scenario'),'2');
  await puzzle.locator('.mini-label').getByText('МАТ').waitFor({state:'attached',timeout:5000});
  await f.locator('#orbit-stage .orbit-board[data-index="2"].demo-clearing').waitFor({state:'attached',timeout:5000});
  await puzzle.locator('.mini-square img').first().evaluate(el=>new Promise(resolve=>setTimeout(resolve,250)));
  const fading=await puzzle.locator('.mini-square img').first().evaluate(el=>Number(getComputedStyle(el).opacity)); assert.ok(fading<1,'pieces fade away');
  await f.locator('#orbit-stage .orbit-board[data-index="2"][data-scenario="10"]').waitFor({state:'attached',timeout:5000});
  assert.ok(await puzzle.locator('.mini-square img').count()>3,'a different game appears'); await p.close();
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
