import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {startDirectChallenges} from '../pages/direct-challenges.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('challenge selection uses two steps, confirms and opens the private game',async()=>{
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://example.com'}),win=dom.window;
 let data=null,timer,opened=null;const calls=[];win.setInterval=fn=>(timer=fn,1);win.clearInterval=()=>{};
 const client={rpc:async(name,args)=>{if(name==='direct_challenge_snapshot')return {data,error:null};calls.push(args);if(args.p_action==='send')data={id:'id',state:'pending',outgoing:true,name:'Bob'};if(args.p_action==='propose')data={...data,state:'proposed',mode:args.p_mode,control:args.p_control};if(args.p_action==='seen')data=null;return {data:{},error:null}}};
 const view=startDirectChallenges(client,win,{openGame:async id=>{opened=id}});await tick();
 await view.send('Bob');let panel=win.document.querySelector('.direct-challenge');assert.match(panel.textContent,/Ожидание ответа/);
 data={...data,state:'accepted'};timer();await tick();assert.match(panel.textContent,/Выбери режим/);
 [...panel.querySelectorAll('button')].find(b=>b.textContent==='Блиц').click();assert.match(panel.textContent,/Контроль времени/);
 [...panel.querySelectorAll('button')].find(b=>b.textContent==='3+2').click();await tick();assert.deepEqual(calls.at(-1).p_mode,'blitz');assert.equal(calls.at(-1).p_control,'3+2');assert.match(panel.textContent,/Ожидание подтверждения/);
 data={...data,state:'started',game_id:'game-id'};timer();await tick();await tick();assert.equal(opened,'game-id');assert.equal(calls.at(-1).p_action,'seen');view.destroy();dom.window.close();
});


test('invalid snapshots do not display a phantom challenge',async()=>{
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://example.com'});let timer;dom.window.setInterval=fn=>(timer=fn,1);dom.window.clearInterval=()=>{};
 const view=startDirectChallenges({rpc:async()=>({data:[],error:null})},dom.window,{openGame:async()=>{}});await tick();timer();await tick();assert.equal(dom.window.document.querySelector('.direct-challenge').hidden,true);view.destroy();dom.window.close();
});
