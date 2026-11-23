import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createRatingView } from '../pages/rating.js';
const html = await readFile('pages/rating.html','utf8');
const tick = () => new Promise(resolve => setTimeout(resolve,0));
test('rating switches modes, escapes names, and ignores stale requests', async () => {
  const dom=new JSDOM(html); const root=dom.window.document.querySelector('section');
  const requests=[]; const client={rpc:(fn,args)=>(fn==='profile_avatars'||fn==='profile_avatar_themes'||fn==='profile_piece_sets')?Promise.resolve({data:[]}):new Promise(resolve=>requests.push({fn,args,resolve}))};
  const view=createRatingView(root,client); const first=view.refresh();
  root.querySelector('[data-rating-mode="rapid"]').click();
  await Promise.resolve();
  assert.deepEqual(requests.map(r=>r.args.p_mode),['overall','rapid']);
  requests[1].resolve({data:[{username:'<b>Player</b>',yar:1234.5,ranked:true},{username:'New',yar:1000,ranked:false}],error:null}); await tick();
  requests[0].resolve({data:[{username:'stale',yar:20,ranked:true}],error:null}); await first;
  assert.equal(root.querySelector('[data-rating-mode="rapid"]').getAttribute('aria-pressed'),'true');
  assert.equal(root.querySelector('.rating-player').textContent,'<b>Player</b>');
  assert.equal(root.querySelector('.rating-player b'),null);
  assert.equal(root.querySelector('.rating-score').textContent.replace(/\s/g,''),'1235');
  assert.equal(root.querySelector('.rating-avatar').getAttribute('src'),'/pieces/cburnett/wN.svg');
  assert.equal(root.querySelectorAll('.rating-row')[1].querySelector('.rating-place').textContent,'2');
  assert.equal(root.querySelector('.rating-board').getAttribute('aria-busy'),'false');
  root.querySelector('[data-rating-mode="blitz"]').click(); await Promise.resolve(); requests[2].resolve({error:'unavailable'}); await tick();
  assert.equal(root.querySelector('.rating-retry').hidden,false);
  root.querySelector('.rating-retry').click(); await Promise.resolve(); requests[3].resolve({data:[],error:null}); await tick();
  assert.equal(root.querySelector('.rating-status').textContent,'Пока нет игроков');
  dom.window.close();
});

test('fresh cached modes avoid duplicate requests and pending requests are shared', async () => {
  const dom=new JSDOM(html); const root=dom.window.document.querySelector('section');
  const requests=[]; const client={rpc:(fn,args)=>(fn==='profile_avatars'||fn==='profile_avatar_themes'||fn==='profile_piece_sets')?Promise.resolve({data:[]}):new Promise(resolve=>requests.push({fn,args,resolve}))};
  const view=createRatingView(root,client);
  const first=view.refresh(); const duplicate=view.refresh(); await Promise.resolve();
  assert.equal(requests.length,1);
  requests[0].resolve({data:[{username:'First',yar:1001,ranked:true}],error:null});
  await Promise.all([first,duplicate]);
  root.querySelector('[data-rating-mode="rapid"]').click(); await Promise.resolve();
  requests[1].resolve({data:[{username:'Rapid',yar:1200,ranked:true}],error:null}); await tick();
  root.querySelector('[data-rating-mode="overall"]').click(); await tick();
  assert.equal(requests.length,2); assert.equal(root.querySelector('.rating-player').textContent,'First');
  root.querySelector('[data-rating-mode="rapid"]').click(); await tick();
  assert.equal(requests.length,2); assert.equal(root.querySelector('.rating-player').textContent,'Rapid');
  assert.equal(root.querySelector('.rating-board').getAttribute('aria-busy'),'false');
  view.destroy(); dom.window.close();
});

test('synchronous errors can be retried; destroying ignores an outstanding result', async () => {
  const dom=new JSDOM(html); const root=dom.window.document.querySelector('section');
  let count=0, finish; const client={rpc:()=>{ count++; if(count===1) throw new Error('offline'); return new Promise(resolve=>{finish=resolve;}); }};
  const view=createRatingView(root,client); await view.refresh();
  assert.equal(root.querySelector('.rating-retry').hidden,false);
  root.querySelector('.rating-retry').click(); await Promise.resolve();
  assert.equal(count,2); view.destroy(); finish({data:[{username:'After',yar:1000,ranked:true}],error:null}); await tick();
  assert.equal(root.querySelector('.rating-player'),null); dom.window.close();
});

test('personal position stays visible outside the top 100 and stale mode replies are ignored', async () => {
  const dom=new JSDOM(html); const root=dom.window.document.querySelector('section');
  const requests=[]; const client={rpc:(fn,args)=>(fn==='profile_avatars'||fn==='profile_avatar_themes'||fn==='profile_piece_sets')?Promise.resolve({data:[]}):new Promise(resolve=>requests.push({fn,args,resolve}))};
  const view=createRatingView(root,client,{showSelf:true});
  const first=view.refresh(); await tick();
  root.querySelector('[data-rating-mode="rapid"]').click(); await tick();
  const find=(fn,mode)=>requests.find(r=>r.fn===fn && r.args.p_mode===mode);
  find('rank_my_position','rapid').resolve({data:[{username:'<me>',yar:1234.5,ranked:true,place:125}]});
  find('rank_leaderboard','rapid').resolve({data:[{username:'<me>',yar:1234.5,ranked:true}]}); await tick();
  find('rank_my_position','overall').resolve({data:[{username:'stale',yar:0,ranked:true,place:1}]});
  find('rank_leaderboard','overall').resolve({data:[]}); await first; await tick();
  assert.equal(root.querySelector('.rating-self').hidden,false);
  assert.equal(root.querySelector('.rating-self-place').textContent,'125');
  assert.equal(root.querySelector('.rating-self-name').textContent,'<me>');
  assert.equal(root.querySelector('.rating-row').classList.contains('rating-row-self'),true);
  view.destroy(); dom.window.close();
});

test('switching display units changes scores without changing ЯР ordering or refetching', async () => {
  const dom = new JSDOM(html), root = dom.window.document.querySelector('section'); let calls=0;
  const client = {rpc:async fn => {if((fn==='profile_avatars'||fn==='profile_avatar_themes'||fn==='profile_piece_sets'))return {data:[]}; calls++; return {data:fn==='rank_my_position' ? [{username:'Alice',yar:1200,elo:980,ranked:true,place:1}] : [{username:'Alice',yar:1200,elo:980,ranked:true},{username:'Bob',yar:1100,elo:1300,ranked:true}]};}};
  const view = createRatingView(root,client,{showSelf:true}); await view.refresh(); await tick();
  view.setUnit('elo');
  assert.deepEqual([...root.querySelectorAll('.rating-player')].map(el=>el.textContent),['Alice','Bob']);
  assert.deepEqual([...root.querySelectorAll('.rating-score')].map(el=>Number(el.textContent.replace(/\D/g,''))),[980,1300]);
  assert.equal(root.querySelector('.rating-self-score').textContent,'980'); assert.equal(root.querySelector('.rating-unit').textContent,'ЭЛО');
  assert.equal(calls,2); view.setUnit('yar'); assert.equal(root.querySelector('.rating-self-score').textContent.replace(/\D/g,''),'1200');
  view.destroy(); dom.window.close();
});


test('calibrating players are numbered and identical forced refresh preserves rows', async () => {
  const dom=new JSDOM(html), root=dom.window.document.querySelector('section');
  const data=[{username:'First',yar:1005,ranked:false},{username:'Second',yar:1000,ranked:true}];
  const view=createRatingView(root,{rpc:async fn=>({data:fn==='rank_my_position' ? [{...data[0],place:1}] : data})},{showSelf:true});
  await view.refresh(); await tick();
  assert.deepEqual([...root.querySelectorAll('.rating-place')].map(el=>el.textContent),['1','2']);
  assert.equal(root.querySelector('.rating-self-place').textContent,'1');
  const row=root.querySelector('.rating-row');
  await view.refresh({force:true});
  assert.equal(root.querySelector('.rating-row'),row);
  view.destroy(); dom.window.close();
});

test('mode changes reuse and reorder player elements', async () => {
 const dom=new JSDOM(html),root=dom.window.document.querySelector('section');
 const data={overall:[{username:'Alice',yar:1300},{username:'Bob',yar:1200}],rapid:[{username:'Bob',yar:1400},{username:'Alice',yar:1100}]};
 const client={rpc:async (fn,args)=>({data:fn==='rank_leaderboard'?data[args.p_mode]:[]})};
 const view=createRatingView(root,client);await view.refresh();const alice=root.querySelectorAll('.rating-row')[0],bob=root.querySelectorAll('.rating-row')[1];
 root.querySelector('[data-rating-mode="rapid"]').click();await tick();assert.equal(root.querySelectorAll('.rating-row')[0],bob);assert.equal(root.querySelectorAll('.rating-row')[1],alice);assert.equal(alice.querySelector('.rating-place').textContent,'2');view.destroy();dom.window.close();
});

test('online dots follow presence changes and survive leaderboard rendering', async () => {
  const dom=new JSDOM(html); const root=dom.window.document.querySelector('section');
  const client={rpc:async fn=>({data:fn==='rank_leaderboard'?[{username:'Alice',yar:1000},{username:'Bob',yar:900}]:[]})};
  const view=createRatingView(root,client);
  view.setOnlineNames(new Set(['Alice'])); await view.refresh();
  assert.equal(root.querySelectorAll('.rating-online').length,1);
  assert.equal(root.querySelector('.rating-online').parentElement.dataset.profileName,'Alice');
  view.setOnlineNames(new Set(['Bob'])); assert.equal(root.querySelector('.rating-online').parentElement.dataset.profileName,'Bob');
  view.setOnlineNames(null); assert.equal(root.querySelector('.rating-online'),null);
  view.destroy(); dom.window.close();
});
