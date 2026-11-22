import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatchApi, retryMessage } from '../pages/match-api.js';

test('match requests preserve HTTP status and do not expose server details', async () => {
  let options;
  const api = createMatchApi({ functions:{ invoke: async (name, value) => {
    assert.equal(name, 'matchplay'); options = value;
    return {data:null,error:{context:{status:503, secret:'server detail'}}};
  } } });
  await assert.rejects(api({action:'current'}), error => error.status === 503 && !error.message.includes('server detail'));
  assert.deepEqual(options.body, {action:'current'}); assert.equal(options.timeout, 12000);
  assert.match(retryMessage({status:401}, 'network'), /сессию/);
  assert.match(retryMessage({status:503}, 'network'), /сервис/);
  assert.equal(retryMessage({}, 'network'), 'network');
});

test('snapshot clock gets a bounded estimate of request transit time',async()=>{
 let time=100;
 const api=createMatchApi({functions:{invoke:async()=>{time=500;return {data:{game:{white_ms:60000}},error:null}}}},()=>time);
 assert.equal((await api({action:'snapshot'})).game._clock_age_ms,200);
});
