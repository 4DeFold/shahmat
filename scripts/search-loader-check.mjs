import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
const id='12345678-1234-1234-1234-123456789012',user={id,aud:'authenticated',role:'authenticated',user_metadata:{}},token=['e30',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.'),session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4270';
try{for(const motion of ['no-preference','reduce']){
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:motion});
 await page.addInitScript(s=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(s)),session);
 await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/auth/v1/user')return route.fulfill({json:user});
  if(path==='/functions/v1/matchplay')return route.fulfill({json:req.postDataJSON()?.action==='search'?{state:'searching'}:{game:null}});
  return route.fulfill({json:[]});
 });
 await page.goto(base+'/pages/game.html');await page.locator('label:has(input[value=blitz])').click();await page.locator('#start-search:not([disabled])').waitFor();
 assert.equal(await page.locator('#search-loader').isHidden(),true);
 await page.evaluate(()=>{document.documentElement.style.setProperty('--accent','#c24d23');document.documentElement.style.setProperty('--surface','#f2e9de');});
 await page.locator('#start-search').click();const loader=page.locator('#search-loader');await loader.locator('canvas').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#search-loader').classList.contains('is-visible'));
 assert.equal(await page.locator('#board [data-square]').count(),64);assert.equal(await loader.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 const sample=await loader.locator('canvas').evaluate(el=>{const {data}=el.getContext('2d').getImageData(0,0,el.width,el.height);let count=0,partial=0,orange=0;for(let i=0;i<data.length;i+=4){if(data[i+3]>0)count++;if(data[i+3]>0&&data[i+3]<200)partial++;if(data[i]>data[i+2]+30&&data[i+3]>150)orange++;}return {count,partial,orange,total:data.length/4};});
 assert.ok(sample.count>0&&sample.count<sample.total*.20,JSON.stringify(sample));assert.ok(sample.partial>0&&sample.orange>0,JSON.stringify(sample));
 if(process.env.LOADER_SCREENSHOT&&motion==='no-preference')await page.screenshot({path:process.env.LOADER_SCREENSHOT});
 await page.locator('#cancel-search').click();await page.locator('#start-search:not([hidden])').waitFor();
 if(motion==='no-preference')assert.equal(await loader.isHidden(),false,'exit fades before hiding');
 await loader.waitFor({state:'hidden'});await page.close();
}console.log('✓ Transparent themed knight trails, search lifecycle and reduced motion');}finally{await browser.close();}
