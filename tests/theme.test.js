import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile('index.html', 'utf8');
const source = await readFile('theme.js', 'utf8');
for (const dark of [false, true]) {
  test(`theme starts ${dark ? 'dark' : 'light'} and follows device changes`, () => {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com' });
    const { window } = dom;
    let change;
    window.matchMedia = () => ({ matches: dark, addEventListener: (_, handler) => { change = handler; } });
    window.eval(source);
    const root = window.document.documentElement;
    const color = window.document.querySelector('meta[name="theme-color"]');
    assert.equal(root.dataset.theme, dark ? 'dark' : 'light');
    assert.equal(color.content, dark ? '#000000' : '#ffffff');
    change({ matches: !dark });
    assert.equal(root.dataset.theme, dark ? 'light' : 'dark');
    assert.equal(color.content, dark ? '#ffffff' : '#000000');
    assert.equal(window.document.querySelectorAll('.theme-toggle').length, 0);
  });
}
