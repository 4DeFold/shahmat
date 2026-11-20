import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4270';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const id='12345678-1234-1234-1234-123456789012',user={id,aud:'authenticated',role:'authenticated',user_metadata:{palette:'ocean',palette_theme:'dark'}},token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.'),session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(s=>{localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(s));HTMLImageElement.prototype.decode=()=>new Promise(()=>{});window.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}}},session);
 await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{const p=new URL(route.request().url()).pathname;
  if(p==='/auth/v1/user')return route.fulfill({json:user});if(p==='/rest/v1/profiles')return route.fulfill({json:{username:'Alice',palette:'ocean'}});
  if(p.endsWith('/my_archive_all'))return route.fulfill({json:[{id:'a',mode:'blitz',my_color:'w',white_name:'Alice',black_name:'Bob',moves:['e4','e5'],result:'draw'},{id:'b',mode:'bot',level:2,my_color:'b',moves:['f3','e5','g4','Qh4#'],result:'black_win'}]});
  if(p.endsWith('/my_archive_ratings'))return route.fulfill({json:[]});return route.fulfill({json:[]});});
 await page.goto(base+'/home');await page.locator('#dashboard-home:not([hidden])').waitFor();await page.locator('.home-particles-canvas').waitFor({state:'visible'});
 const bg=page.locator('.home-particles-canvas');assert.ok((await bg.boundingBox()).width>500);await page.screenshot({path:'/tmp/shahmat-home-particles.png'});
 await page.evaluate(async()=>{const {createProfileCard}=await import('/pages/profile-card.js');const root=document.createElement('div');root.innerHTML='<button data-profile-name="Bob">Bob</button>';document.body.append(root);window.finishCard=null;window.testCard=createProfileCard(root,{rpc:()=>new Promise(r=>window.finishCard=r)});root.querySelector('button').focus();});
 await page.locator('.player-mini-loading .particle-loading.is-visible canvas').waitFor({state:'visible'});assert.equal(await page.locator('.player-mini-card').getAttribute('aria-busy'),'true');
 await page.evaluate(()=>window.finishCard({data:{username:'Bob',palette:'ocean',theme:'dark',piece_set:'cburnett',bio:'Hello'}}));await page.locator('.player-mini-loading').waitFor({state:'hidden'});
 const avatar=page.locator('.player-mini-avatar img');await avatar.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.player-mini-avatar img')?.naturalWidth>0);assert.match(await avatar.getAttribute('src'),/cburnett\/wN\.svg/);assert.ok((await avatar.boundingBox()).width>20,'fallback is actually displayed');
 await page.evaluate(()=>window.testCard.destroy());await page.locator('#nav-archive').click();const f=page.frameLocator('#archive-frame');await f.locator('.archive-card').first().waitFor({state:'visible'});assert.equal(await f.locator('.archive-card').count(),2);assert.equal(await f.locator('.archive-mini-square').count(),128);assert.ok(await f.locator('.archive-mini-square img').count()>0);const black=f.locator('.archive-card').filter({hasText:'2 уровень'});assert.match(await black.locator('.archive-result').textContent(),/Мат/);assert.ok(await black.locator('.archive-result.win').count());await black.click();assert.equal(await f.locator('#board').evaluate(el=>el.classList.contains('black')),true);assert.equal(await f.locator('#white-name').textContent(),'Alice');
 assert.deepEqual(errors,[]);console.log('✓ Home particles, profile fallback avatar and loader; archive renders without intersection or image decode');
}finally{await browser.close();}
