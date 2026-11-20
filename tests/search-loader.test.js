import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
test('matchmaking loader reproduces a closed 64-square knight tour', async()=>{
 const doc=new JSDOM(await readFile('pages/game.html','utf8')).window.document;
 const loader=doc.querySelector('#search-loader');assert.ok(loader.hidden);
 const path=loader.querySelector('.search-tour-base').getAttribute('d');
 const points=[...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
 assert.equal(points.length,65);assert.deepEqual(points[0],points.at(-1));assert.equal(new Set(points.slice(0,-1).map(p=>p.join(','))).size,64);
 for(let i=1;i<points.length;i++)assert.deepEqual([Math.abs(points[i][0]-points[i-1][0]),Math.abs(points[i][1]-points[i-1][1])].sort(),[1,2]);
});
