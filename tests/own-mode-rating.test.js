import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownModeRating} from '../pages/own-mode-rating.js';

test('category uses rated game eligibility and falls back to overall', async () => {
 const calls=[];
 const rows={overall:{yar:972,ranked:true},blitz:{yar:988,ranked:true},rapid:{yar:1012,ranked:false},bullet:{yar:1000,ranked:false}};
 const client={async rpc(name,{p_mode}){assert.equal(name,'rank_my_position');calls.push(p_mode);return {data:[rows[p_mode]]}}};
 assert.equal((await ownModeRating(client,'blitz')).yar,988);
 assert.equal((await ownModeRating(client,'rapid')).yar,972);
 rows.overall={yar:null,ranked:false};
 assert.equal((await ownModeRating(client,'bullet')).yar,null);
 assert.deepEqual(calls,['blitz','rapid','overall','bullet','overall']);
});
