// Browser acceptance: real canvas image handling and mocked Supabase.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),...(process.env.CHROMIUM_EXTRA_ARGS?{args:process.env.CHROMIUM_EXTRA_ARGS.split(' ')}:{})});
const uid='12345678-1234-1234-1234-123456789012', user={id:uid,aud:'authenticated',role:'authenticated',user_metadata:{palette:'forest',palette_theme:'dark'}};
const token=['e30',Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'x'].join('.');
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user};
try {
 for(const [viewport,reducedMotion] of [[{width:1440,height:900},'no-preference'],[{width:390,height:844},'no-preference'],[{width:280,height:800},'no-preference'],[{width:844,height:390},'reduce']]) {
  const page=await browser.newPage({viewport,reducedMotion}); const errors=[],saves=[]; let currentProfile={username:'Alice',bio:'Играю в шахматы',palette:'forest'}, savedMedia=null, nameChanged=false, failLoad=viewport.width===1440, failSave=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(value=>localStorage.setItem('sb-eswyxbyddkajysogtglp-auth-token',JSON.stringify(value)),session);
  await page.route('https://eswyxbyddkajysogtglp.supabase.co/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/auth/v1/user') return route.fulfill({json:user});
   if(path==='/rest/v1/profiles') return route.fulfill({json:currentProfile});
   if(path==='/rest/v1/profile_media') {if(failLoad){return route.fulfill({status:503,json:{message:'unavailable'}});} return route.fulfill({json:savedMedia});}
   if(path==='/rest/v1/rpc/rank_my_position') return route.fulfill({json:[{username:'Alice',yar:1123,place:1}]});
   if(path==='/rest/v1/rpc/profile_my_stats') return route.fulfill({json:[{games:12}]});
   if(path==='/rest/v1/rpc/profile_save') {const body=route.request().postDataJSON(); saves.push(body); if(failSave){failSave=false;return route.fulfill({status:503,json:{message:'unavailable'}});} if(body.p_username!==currentProfile.username&&nameChanged)return route.fulfill({status:400,json:{code:'P0001',message:'username_change_cooldown'}}); if(body.p_username!==currentProfile.username)nameChanged=true; currentProfile={...currentProfile,username:body.p_username,bio:body.p_bio};savedMedia={avatar:body.p_avatar,banner:body.p_banner};return route.fulfill({json:null});}
   if(path==='/rest/v1/rpc/profile_avatars') return route.fulfill({json:[]});
   return route.fulfill({json:{game:null}});
  });
  await page.goto(`${base}/profile`); await page.locator('#page-profile').waitFor({state:'visible'});
  if(viewport.width===1440){await page.getByText('Не удалось загрузить данные профиля.').waitFor(); assert.equal(await page.locator('#profile-edit-button').isDisabled(),true); failLoad=false; await page.locator('#profile-retry').click();}
  await page.locator('#profile-edit-button:not([disabled])').waitFor();
  assert.equal(await page.locator('#profile-palette-name').textContent(),'Лес');
  assert.equal(await page.locator('#profile-palette-swatch').evaluate(el=>el.classList.contains('forest')),true);
  assert.equal(await page.locator('#profile-display-name').innerText(),'Alice');
  assert.equal(await page.locator('#profile-yar').textContent(),'1 123');
  assert.equal(await page.locator('#profile-games').textContent(),'12');
  assert.doesNotMatch(await page.locator('#page-profile').innerText(),/ДЕМО|Каждый ход|ЛИЧНАЯ КАРТОЧКА|Рейтинг игрока|Каждая партия|ШАХМАТНЫЙ ПРОФИЛЬ/);
  assert.equal(await page.locator('.profile-portrait-star,.profile-banner-index,.profile-player-tag,.profile-identity-aside').count(),0);
  assert.equal(await page.locator('.profile-reveal').first().evaluate(el=>getComputedStyle(el).animationName),reducedMotion==='reduce'?'none':'profile-reveal');
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no horizontal overflow at ${viewport.width}`);
  const geometry=await page.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height};};return {banner:rect('.profile-banner'),rail:rect('.profile-rail'),sidebar:rect('.app-sidebar'),swatch:rect('.profile-palette-card')};});
  if(viewport.width>700) {assert.ok(Math.abs(geometry.banner.top)<1);assert.ok(Math.abs(geometry.banner.left-geometry.sidebar.right)<1);assert.ok(Math.abs(geometry.banner.right-geometry.rail.left)<1);assert.ok(geometry.swatch.width>geometry.rail.width*.75);}
  else {assert.ok(Math.abs(geometry.banner.top-68)<1);assert.ok(Math.abs(geometry.banner.left)<1&&Math.abs(geometry.banner.width-viewport.width)<1);assert.ok(geometry.banner.height>=220);}
  if(process.env.PROFILE_SCREENSHOTS) await page.screenshot({path:`/tmp/profile-functional-${viewport.width}.png`,fullPage:true});
  if(viewport.width===1440) {
   await page.locator('#profile-edit-button').click();
   assert.equal(await page.locator('#profile-edit-name').inputValue(),'Alice');
   await page.locator('#profile-edit-name').fill('Alice_2'); await page.locator('#profile-edit-bio').fill('Новое био');
   const bytes=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=400;const x=c.getContext('2d');x.fillStyle='orange';x.fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]});
   const image={name:'test.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')};
   await page.locator('#profile-avatar-file').setInputFiles(image); await page.locator('#profile-save:not([disabled])').waitFor();
   await page.locator('#profile-banner-file').setInputFiles(image); await page.locator('#profile-save:not([disabled])').waitFor();
   await page.locator('#profile-save').click(); await page.getByText('Профиль сохранён.').waitFor();
   assert.equal(saves.length,1);assert.equal(saves[0].p_username,'Alice_2');assert.equal(saves[0].p_bio,'Новое био');
   const dims=data=>{const b=Buffer.from(data.split(',')[1],'base64');return [b.readUInt32BE(16),b.readUInt32BE(20)];};
   assert.deepEqual(dims(saves[0].p_avatar),[100,100]);assert.deepEqual(dims(saves[0].p_banner),[600,240]);
   assert.equal(await page.locator('#profile-display-name').innerText(),'Alice_2');
   await page.locator('#profile-edit-button').click(); await page.locator('#profile-edit-name').fill('discarded'); await page.locator('#profile-discard').click(); assert.equal(await page.locator('#profile-display-name').innerText(),'Alice_2');
   await page.reload(); await page.locator('#profile-edit-button:not([disabled])').waitFor();
   assert.equal(await page.locator('#profile-display-name').textContent(),'Alice_2'); assert.equal(await page.locator('#profile-avatar-image').getAttribute('src'),saves[0].p_avatar); assert.equal(await page.locator('#profile-banner-image').getAttribute('src'),saves[0].p_banner);
   await page.locator('#profile-edit-button').click(); await page.locator('#profile-edit-name').fill('Alice_3'); await page.locator('#profile-save').click(); await page.getByText('Ник можно менять только раз в 7 дней.').waitFor();
   assert.equal(await page.locator('#profile-edit-name').isVisible(),true);
   await page.locator('#profile-edit-name').fill('Alice_2'); await page.locator('#profile-edit-bio').fill('Изменённое био'); failSave=true; await page.locator('#profile-save').click(); await page.getByText('Не удалось сохранить профиль. Попробуй ещё раз.').waitFor(); assert.equal(await page.locator('#profile-edit-bio').inputValue(),'Изменённое био'); await page.locator('#profile-save').click(); await page.getByText('Профиль сохранён.').waitFor();
   assert.equal(await page.locator('#profile-display-bio').textContent(),'Изменённое био');
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('✓ Profile, responsive layout, editable images, save/cancel and palette');
} finally { await browser.close(); }
