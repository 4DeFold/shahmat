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

test('the original sets each contain a complete monochrome 45-unit set', async () => {
  for (const set of ['regent', 'turnier', 'courtyard', 'manor']) {
    const files = (await readdir(`public/pieces/${set}`)).filter(name => name.endsWith('.svg'));
    assert.equal(files.length, 12);
    for (const color of ['w', 'b']) for (const type of ['K', 'Q', 'B', 'N', 'R', 'P']) {
      const svg = await readFile(`public/pieces/${set}/${color}${type}.svg`, 'utf8');
      assert.match(svg, /viewBox="0 0 45 45"/);
      assert.match(svg, /stroke-width="1\.5"/);
      assert.doesNotMatch(svg, /filter|shadow|#[a-f\d]{6}/i);
      assert.match(svg, /#000/);
      assert.match(svg, /#fff/);
    }
  }
});
