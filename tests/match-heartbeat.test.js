import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { startMatchHeartbeat } from '../pages/match-heartbeat.js';
test('heartbeat sends immediately, periodically, and stops cleanly', async () => {
 const dom=new JSDOM('',{url:'https://example.com'}), calls=[]; let interval, delay;
 dom.window.setInterval=(fn,ms)=>{interval=fn;delay=ms;return 1;};
 dom.window.clearInterval=()=>{interval=null;};
 const stop=startMatchHeartbeat({functions:{invoke:async (name,options)=>{calls.push([name,options.body.action]); return {data:{ok:true}};}}},dom.window);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(delay,10000); assert.deepEqual(calls,[['matchplay','heartbeat']]);
 interval(); await new Promise(resolve=>setTimeout(resolve,0)); assert.equal(calls.length,2);
 stop(); assert.equal(interval,null); dom.window.dispatchEvent(new dom.window.Event('online')); assert.equal(calls.length,2);
 dom.window.close();
});
