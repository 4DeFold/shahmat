// Browser checks use mocked data only; no live games or database writes.
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const engine=({chromium,firefox,webkit})[process.env.BROWSER||'chromium'];
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4270';
const id='12345678-1234-1234-1234-123456789012',user={id,aud:'authenticated',role:'authenticated',user_metadata:{}};
const token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
const browser=await engine.launch({headless:true});
try {
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]) for(const motion of ['no-preference','reduce']) {
  const page=await browser.newPage({viewport,reducedMotion:motion}),errors=[];let releaseArchive;const archiveGate=new Promise(resolve=>releaseArchive=resolve);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(s=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(s)),session);
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
   const p=new URL(route.request().url()).pathname, method=route.request().method();
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'};
   if(method==='OPTIONS')return route.fulfill({status:204,body:'',headers});
   if(p==='/auth/v1/user')return route.fulfill({json:user,headers});
   if(p==='/rest/v1/profiles')return route.fulfill({json:{username:'Alice'},headers});
   if(p.endsWith('/my_archive_all'))return archiveGate.then(()=>route.fulfill({json:[{id:'fixture',mode:'blitz',my_color:'b',white_name:'Bob',black_name:'Alice',moves:['e4','d5','exd5','Qxd5'],result:'draw'}],headers}));
   if(p.endsWith('/my_archive_ratings'))return route.fulfill({json:[{game_id:'fixture',white_yar:1240,black_yar:1690}],headers});
   if(p.endsWith('/my_archive_stats'))return route.fulfill({json:{bullet:0,blitz:1,rapid:0,classical:0,bot:0},headers});
   if(p==='/functions/v1/matchplay')return route.fulfill({json:{game:null},headers});
   return route.fulfill({json:[],headers});
  });
  await page.goto(base+'/archive');const frame=page.frameLocator('#archive-frame');
  await frame.locator('.archive-loading-overlay .particle-loading:not([hidden])').waitFor();
  const loader=await frame.locator('.archive-loading-overlay .particle-loading').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:innerWidth,h:innerHeight}});
  assert.ok(Math.abs(loader.x-loader.w/2)<1 && Math.abs(loader.y-loader.h/2)<1,`loader is centered: ${JSON.stringify(loader)}`);
  releaseArchive();await frame.locator('.archive-card').first().click();
  await frame.locator('#archive-detail:not([hidden])').waitFor();
  assert.match(await frame.locator('#archive-bottom-avatar').getAttribute('src'),/bN\.svg$/);
  assert.match(await frame.locator('#archive-top-avatar').getAttribute('src'),/wN\.svg$/);
  await page.locator('#nav-archive').evaluate(el=>el.click());assert.equal(await frame.locator('#archive-detail').isVisible(),true,'active tab must not reset');
  await frame.locator('#history-first').click();
  assert.equal(await frame.locator('.move-number').first().textContent(),'1');
  await frame.locator('#history-next').click();await frame.locator('#history-next').click();await frame.locator('#history-next').click();
  if(motion==='no-preference') {
   assert.equal(await frame.locator('.capture-flight').count(),1,'captured piece flies into strip');
   assert.equal(await frame.locator('#archive-opponent-captured img').first().evaluate(el=>el.style.opacity),'0');
   await frame.locator('#history-prev').click();
   assert.equal(await frame.locator('.capture-flight').count(),1,'rewind launches reverse flight');
   assert.equal(await frame.locator('[data-square=d5] .piece').evaluate(el=>el.style.opacity),'0','restored piece is hidden during reverse flight');
   await frame.locator('#history-next').click();assert.equal(await frame.locator('.capture-flight').count(),1,'rapid forward cancels reverse flight');
   await frame.locator('#history-prev').click();assert.equal(await frame.locator('.capture-flight').count(),1,'rapid rewind launches new reverse flight');
  } else assert.equal(await frame.locator('.capture-flight').count(),0);
  await page.locator('#nav-archive').focus();
  for(const key of ['w','s','w','s','w','s']) await page.keyboard.press(key);
  await frame.locator('#history-last:disabled').waitFor();
  await frame.locator('.review-title').getByText('Анализ партии',{exact:true}).waitFor({timeout:60000});
  assert.equal(await frame.locator('.review-person strong').first().textContent(),'Bob');
  assert.equal(await frame.locator('.review-person strong').last().textContent(),'Alice');
  assert.match(await frame.locator('.review-person .review-rating').first().textContent(),/1240 ЯР/);
  assert.match(await frame.locator('.review-person .review-rating').last().textContent(),/1690 ЯР/);
  const geometry=await frame.locator('.review-bar').evaluate(bar=>{const br=bar.getBoundingClientRect(),board=bar.parentElement.getBoundingClientRect();return {left:br.left,right:br.right,boardRight:board.right,width:br.width,viewport:innerWidth}});
  assert.ok(geometry.left>=geometry.boardRight-1 && geometry.right<=geometry.viewport+1 && geometry.width>=10,`bar must be outside right edge: ${JSON.stringify(geometry)}`);
  // Compare every actually classified move; a quiet move deliberately has no badge.
  for(let i=1;i<=4;i++) {
   await frame.locator(`[data-history-index="${i}"]`).click();
   const badge=frame.locator(`[data-history-index="${i}"] .review-move-mark`),boardMark=frame.locator('.review-board-mark');
   if(await badge.count()) {
    assert.equal(await boardMark.count(),1);const type=await badge.getAttribute('data-type');
    assert.equal(await boardMark.getAttribute('data-type'),type);
    assert.equal(await boardMark.textContent(),await badge.textContent());
    assert.equal(await badge.textContent(),await frame.locator(`.review-${type} .review-legend-mark`).textContent());
   } else assert.equal(await boardMark.count(),0);
  }
  await frame.locator('#history-first').click();assert.equal(await frame.locator('.review-board-mark').count(),0);
  const graph=frame.locator('.review-graph-area');await graph.waitFor();
  await graph.focus();await page.keyboard.press('ArrowRight');assert.equal(await graph.getAttribute('aria-valuenow'),'1');
  assert.equal(await graph.evaluate(el=>el===document.activeElement),true,'graph keeps focus during navigation');
  await graph.click({position:{x:2,y:30}});assert.equal(await graph.getAttribute('aria-valuenow'),'0');
  await frame.getByRole('button',{name:'Оценка',exact:true}).click();assert.match(await graph.getAttribute('aria-valuetext'),/оценка белых/);
  await frame.getByRole('button',{name:'Точность',exact:true}).click();
  // Exercise both board orientations even if Stockfish happens to find no errors.
  const corners=await frame.locator('#board').evaluate(board=>{
   board.style.transition='none';const cell=board.querySelector('[data-square=e4]'),mark=document.createElement('span');mark.className='review-board-mark';mark.style.animation='none';cell.append(mark);
   return [false,true].map(black=>{board.classList.toggle('black',black);const c=cell.getBoundingClientRect(),m=mark.getBoundingClientRect();return {right:c.right-m.right,bottom:c.bottom-m.bottom}}).map((v,i,all)=>{if(i===all.length-1)mark.remove();return v});
  });
  for(const corner of corners)assert.ok(Math.abs(corner.right-1)<2&&Math.abs(corner.bottom-1)<2,`badge at bottom right: ${JSON.stringify(corners)}`);
  await frame.locator('#history-last').click();
  assert.match(await frame.locator('.review-bar').getAttribute('aria-label'),/белые \d+%/);
  assert.match(await frame.locator('.review-accuracy').first().textContent(),/^\d+%$/);
  assert.equal(await frame.locator('.review-brilliant b').first().textContent(),'—');
  assert.equal(await frame.locator('[data-square=d5] .piece').getAttribute('src'),'/pieces/cburnett/bQ.svg');
  assert.deepEqual(errors,[]);await page.close();console.log(`✓ archive ${viewport.width} ${motion}: rapid navigation, capture and avatars`);
 }
}finally{await browser.close();}
