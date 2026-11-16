import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

for (const name of ['confirmation', 'recovery']) {
  test(`${name} email shows the Supabase token and prevents domain auto-linking`, async () => {
    const source = await readFile(`supabase/templates/${name}.html`, 'utf8');
    assert.equal((source.match(/\{\{ \.Token \}\}/g) || []).length, 1);
    assert.doesNotMatch(source, /<a\b|shahmat\.xyz/i);
    assert.match(source, /mat&#8203;\.xyz/);
    const doc = new JSDOM(source.replace('{{ .Token }}', '123456')).window.document;
    assert.match(doc.body.textContent, /shahmat\u200b\.xyz/);
    assert.match(doc.body.textContent, /123456/);
    assert.ok(doc.querySelectorAll('table[role="presentation"]').length >= 2);
  });
}
