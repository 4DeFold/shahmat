// Check the actual SVG shapes, not just their containing icon or computed color.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),...(process.env.CHROMIUM_EXTRA_ARGS ? {args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')} : {})});
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4174';
const user={id:'12345678-1234-1234-1234-123456789012',aud:'authenticated',role:'authenticated',user_metadata:{}};
const token=['e30',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
  for (const reducedMotion of ['no-preference','reduce']) {
    const page=await browser.newPage({viewport:{width:1440,height:900}, reducedMotion});
    await page.addInitScript(v=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(v)),session);
    await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',route=>{
      const path=new URL(route.request().url()).pathname;
      return route.fulfill({json:path==='/auth/v1/user'?user:path==='/rest/v1/profiles'?{username:'Player',palette:'monochrome'}:path==='/rest/v1/rpc/rank_leaderboard'?[]:path==='/rest/v1/rpc/rank_my_position'?[]:{game:null}});
    });
    await page.goto(`${base}/rating`); await page.locator('#nav-rating[aria-current=page]').waitFor();
    for (const palette of ['monochrome','gray','forest','atelier','wood','earth','ocean','amber','lavender','sand']) {
      for (const theme of ['light','dark']) {
        const samples=await page.evaluate(async ({palette,theme})=>{
          const landing=document.querySelector('.landing'); landing.dataset.palette=palette; landing.dataset.paletteTheme=theme;
          const links=[document.querySelector('#nav-play'),document.querySelector('#nav-rating')];
          const read=()=>links.map(link=>({text:getComputedStyle(link.querySelector('span:last-child')).color, link:getComputedStyle(link).color, strokes:[...link.querySelectorAll('svg circle,svg path')].map(el=>getComputedStyle(el).stroke), background:getComputedStyle(link).backgroundColor}));
          links[0].removeAttribute('aria-current'); links[1].setAttribute('aria-current','page');
          await new Promise(requestAnimationFrame); const before=read();
          links[1].removeAttribute('aria-current'); links[0].setAttribute('aria-current','page');
          const frames=[];
          for(let i=0;i<15;i++){await new Promise(requestAnimationFrame); frames.push(read());}
          return {before,frames};
        },{palette,theme});
        const final=samples.frames.at(-1);
        for (const frame of samples.frames) for (let i=0;i<2;i++) {
          const entry=frame[i];
          assert.equal(entry.text,entry.link,`${palette}/${theme}: text tracks parent`);
          for (const stroke of entry.strokes) assert.equal(stroke,entry.text,`${palette}/${theme}: SVG stroke tracks text`);
          assert.equal(entry.text,final[i].text,`${palette}/${theme}: no lingering foreground transition`);
          assert.equal(entry.background,final[i].background,`${palette}/${theme}: foreground and background switch together`);
        }
      }
    }
    // Real routing, not just attribute changes.
    await page.locator('#nav-rating').click(); await page.locator('#nav-rating[aria-current=page]').waitFor();
    const colors=await page.locator('#nav-rating').evaluate(el=>[getComputedStyle(el.querySelector('span:last-child')).color,...[...el.querySelectorAll('svg path')].map(p=>getComputedStyle(p).stroke)]);
    assert.ok(colors.every(color=>color===colors[0]));
    await page.close();
  }
  console.log('✓ Sidebar text and actual SVG strokes switch together, without blending, in all palettes and motion modes');
} finally {await browser.close();}
