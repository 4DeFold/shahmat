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

test('licensed Lichess sets are complete and recoloured only black and white', async () => {
  for (const set of ['chessnut', 'fantasy', 'spatial', 'celtic']) {
    const files = (await readdir(`public/pieces/${set}`)).filter(name => name.endsWith('.svg'));
    assert.equal(files.length, 12);
    for (const color of ['w', 'b']) for (const type of ['K', 'Q', 'B', 'N', 'R', 'P']) {
      const svg = await readFile(`public/pieces/${set}/${color}${type}.svg`, 'utf8');
      assert.match(svg, /<svg\b/);
      assert.doesNotMatch(svg, /<script\b|<foreignObject\b|filter|shadow/i);
      for (const color of svg.match(/#[a-f\d]{3,6}\b/gi) || []) assert.ok(['#000','#fff'].includes(color.toLowerCase()), `${set}: ${color}`);
    }
    assert.match(await readFile(`public/pieces/${set}/LICENSE.txt`, 'utf8'), set === 'chessnut' ? /Apache License/ : /MIT License/);
    assert.match(await readFile(`public/pieces/${set}/NOTICE.txt`, 'utf8'), /Modification|Modified/);
  }
});
