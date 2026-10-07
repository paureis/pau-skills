// House style for every document a user or an agent reads: no em dashes and no en dashes. Use a comma, colon, period
// or parentheses instead. Code and scripts are not checked; only Markdown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const DASHES = /[–—]/;

test('no Markdown file uses an em dash or an en dash', () => {
  const files = execFileSync('git', ['-C', ROOT, 'ls-files', '-co', '--exclude-standard', '*.md'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(files.length > 20);
  const hits = [];
  for (const f of files) {
    readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/).forEach((line, i) => { if (DASHES.test(line)) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], `dashes found at:\n${hits.join('\n')}`);
});
