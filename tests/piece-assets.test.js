import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const folder = 'public/pieces/cburnett';
test('the complete Cburnett set and its GPL license and attribution are present', async () => {
  const expected = ['bB','bK','bN','bP','bQ','bR','wB','wK','wN','wP','wQ','wR'];
  const actual = (await readdir(folder)).filter(name => name.endsWith('.svg')).sort();
  assert.deepEqual(actual, expected.map(name => `${name}.svg`).sort());
  for (const filename of actual) {
    const svg = await readFile(`${folder}/${filename}`, 'utf8');
    assert.match(svg, /<svg\b/);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b/i);
  }
  assert.match(await readFile(`${folder}/NOTICE.txt`, 'utf8'), /Colin M\. L\. Burnett/);
  assert.match(await readFile(`${folder}/NOTICE.txt`, 'utf8'), /GPL-2\.0-or-later/);
  assert.match(await readFile(`${folder}/COPYING.txt`, 'utf8'), /GNU GENERAL PUBLIC LICENSE/);
});
test('all board avatars and account icons use the same set', async () => {
  for (const path of ['pages/play.html', 'pages/game.html', 'pages/app-shell.html']) {
    const html = await readFile(path, 'utf8');
    const doc = new JSDOM(html).window.document;
    const pieces = [...doc.querySelectorAll('img[src^="/pieces/"]')];
    assert.ok(pieces.length, `${path}: missing piece images`);
    for (const img of pieces) assert.match(img.getAttribute('src'), /^\/pieces\/cburnett\/[bw][KQRBNP]\.svg$/);
    assert.doesNotMatch(html, /pieces\/neo|[♔♕♖♗♘♙♚♛♜♝♞♟]/);
  }
});

test('each traced set includes six white and six black vector pieces without shadows or cream',async()=>{
 for(const set of ['classic','angular','rounded'])for(const color of ['w','b'])for(const type of ['K','Q','B','N','R','P']){
  const svg=await readFile(`public/pieces/${set}/${color}${type}.svg`,'utf8');
  assert.match(svg,/<svg\b/);assert.match(svg,/viewBox="0 0 100 100"/);assert.match(svg,/<path/);assert.doesNotMatch(svg,/filter|shadow|#[a-f\d]{6}/i);assert.match(svg,/fill="#000"/);assert.match(svg,/fill="#fff"/);
 }
});
