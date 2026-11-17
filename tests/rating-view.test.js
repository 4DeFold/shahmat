import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createRatingView } from '../pages/rating.js';
const html = await readFile('pages/rating.html','utf8');
const tick = () => new Promise(resolve => setTimeout(resolve,0));
test('rating switches modes, escapes names, and ignores stale requests', async () => {
  const dom=new JSDOM(html); const root=dom.window.document.querySelector('section');
  const requests=[]; const client={rpc:(fn,args)=>new Promise(resolve=>requests.push({fn,args,resolve}))};
  const view=createRatingView(root,client); const first=view.refresh();
  root.querySelector('[data-rating-mode="rapid"]').click();
  await Promise.resolve();
  assert.deepEqual(requests.map(r=>r.args.p_mode),['overall','rapid']);
  requests[1].resolve({data:[{username:'<b>Player</b>',yar:1234.5,ranked:true},{username:'New',yar:1000,ranked:false}],error:null}); await tick();
  requests[0].resolve({data:[{username:'stale',yar:20,ranked:true}],error:null}); await first;
  assert.equal(root.querySelector('[data-rating-mode="rapid"]').getAttribute('aria-pressed'),'true');
  assert.equal(root.querySelector('.rating-player').textContent,'<b>Player</b>');
  assert.equal(root.querySelector('.rating-player b'),null);
  assert.equal(root.querySelectorAll('.rating-row')[1].querySelector('.rating-place').textContent,'—');
  assert.equal(root.querySelector('.rating-board').getAttribute('aria-busy'),'false');
  root.querySelector('[data-rating-mode="blitz"]').click(); await Promise.resolve(); requests[2].resolve({error:'unavailable'}); await tick();
  assert.equal(root.querySelector('.rating-retry').hidden,false);
  root.querySelector('.rating-retry').click(); await Promise.resolve(); requests[3].resolve({data:[],error:null}); await tick();
  assert.equal(root.querySelector('.rating-status').textContent,'Пока нет игроков');
  dom.window.close();
});

test('fresh cached modes avoid duplicate requests and pending requests are shared', async () => {
  const dom=new JSDOM(html); const root=dom.window.document.querySelector('section');
  const requests=[]; const client={rpc:(fn,args)=>new Promise(resolve=>requests.push({fn,args,resolve}))};
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
