import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),...(process.env.CHROMIUM_EXTRA_ARGS?{args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')}:{})});
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4174';
const user={id:'12345678-1234-1234-1234-123456789012',aud:'authenticated',role:'authenticated',user_metadata:{}};
const token=['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
 const page=await browser.newPage({reducedMotion:'reduce'}); await page.addInitScript(v=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(v)),session);
 await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{ const p=new URL(route.request().url()).pathname; return route.fulfill({json:p==='/auth/v1/user'?user:p==='/rest/v1/profiles'?{username:'Player',palette:'monochrome'}:{game:null}}); });
 await page.goto(`${base}/home`); await page.locator('#dashboard-home').waitFor({state:'visible'});
 const result=await page.evaluate(()=>{
   const landing=document.querySelector('.landing');
   const luminance=c=>{const v=c.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
   const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
   const val=(s,k)=>s.getPropertyValue(k).trim().replace('#','').replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3');
   return ['earth','ocean','amber','lavender','sand'].map(palette=>{
     landing.dataset.palette=palette; let fixed;
     const themes=['light','dark'].map(theme=>{landing.dataset.paletteTheme=theme;const s=getComputedStyle(landing);
       const clock=[val(s,'--clock-white'),val(s,'--clock-black')]; fixed??=clock;
       return {theme,text:ratio(val(s,'--foreground'),val(s,'--page-background')), button:ratio(val(s,'--accent-ink'),val(s,'--accent')), board:ratio(val(s,'--board-light'),val(s,'--board-dark')),clock:ratio(...clock),same:clock.join()===fixed.join()};});
     return {palette,themes};
   });
 });
 for(const {palette,themes} of result) for(const t of themes) {assert.ok(t.text>=4.5,`${palette} ${t.theme} text ${t.text}`);assert.ok(t.button>=4.5,`${palette} ${t.theme} button ${t.button}`);assert.ok(t.board>=1.4,`${palette} board ${t.board}`);assert.ok(t.clock>=4.5 && t.same,`${palette} ${t.theme} clocks`);}
 console.log('✓ Five palettes: readable text, distinguishable squares, theme-independent clock colors');
} finally {await browser.close();}
