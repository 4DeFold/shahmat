// Exercise real canvas animation while data requests are deliberately delayed.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4270';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
const id='12345678-1234-1234-1234-123456789012',user={id,aud:'authenticated',role:'authenticated',user_metadata:{}},token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.'),session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
 const page=await browser.newPage({reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(s=>{localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(s));window.sounds=[];window.Audio=class{constructor(src){this.src=src}load(){}pause(){}addEventListener(){}cloneNode(){return new Audio(this.src)}play(){window.sounds.push(this.src);return Promise.resolve()}}},session);
 let releaseRating,releaseProfile;const ratingGate=new Promise(r=>releaseRating=r),profileGate=new Promise(r=>releaseProfile=r);
 await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  if(p==='/auth/v1/user')return route.fulfill({json:user});
  if(p==='/rest/v1/profiles')return route.fulfill({json:{username:'Alice',bio:'',palette:'monochrome'}});
  if(p.endsWith('/rank_leaderboard')){await ratingGate;return route.fulfill({json:[]});}
  if(p==='/rest/v1/profile_media'){await profileGate;return route.fulfill({json:null});}
  if(p==='/rest/v1/profile_rewards')return route.fulfill({json:{}});
  if(p.endsWith('/profile_public'))return route.fulfill({json:{username:'Alice',palette:'monochrome',ratings:{},games:{}}});
  return route.fulfill({json:[]});
 });
 async function animated(selector){const canvas=page.locator(selector+' canvas');await page.locator(selector+'.is-visible').waitFor({state:'visible'});assert.equal(Math.round((await page.locator(selector).boundingBox()).width),180,'loader is five times larger');const before=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(150);const after=await canvas.evaluate(c=>c.toDataURL());assert.notEqual(before,after,'particle moves along the shared tour');assert.ok(await canvas.evaluate(c=>[...c.getContext('2d').getImageData(0,0,c.width,c.height).data].some((v,i)=>i%4===3&&v>0)),'canvas has visible pixels');}
 await page.goto(base+'/rating');await page.locator('#page-rating:not([hidden])').waitFor();await animated('[data-loading=rating]');releaseRating();await page.locator('[data-loading=rating]').waitFor({state:'hidden'});
 await page.locator('#account-toggle').click();await page.locator('#account-menu [data-page=profile]').click();await page.locator('#page-profile:not([hidden])').waitFor();await animated('[data-loading=profile]');releaseProfile();await page.locator('[data-loading=profile]').waitFor({state:'hidden'});
 await page.locator('#account-toggle').click();await page.locator('#account-menu [data-page=settings]').click();assert.equal(await page.evaluate(()=>window.sounds.length),0,'navigation and data loading are silent');assert.deepEqual(errors,[]);
 console.log('✓ Animated particle for delayed rating and profile; navigation is silent');
} finally {await browser.close();}
