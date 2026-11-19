// The review-scope checklist at its limits: a diff too large to read, a regex that fails while it runs, and an
// untracked symlink. Each prints its entry as triggered, or reads only what git would show, and never stops the run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { put, commit, run, setup } from './review-scope.helpers.mjs';
import { loadConfig, collectChange, collectFix, formatChange, formatFix, DIFF_MAX_BYTES } from '../skills/verification/review-triage/review-scope.mjs';

const entry = (trigger, check, why = 'PR 1.') => ({ trigger, check, why });
const json = (r) => { assert.equal(r.error, undefined, 'killed by the timeout'); return JSON.parse(r.stdout); };

test('a diff over the size limit prints every regex entry that could match as triggered, and the rest as normal', () => {
  const { dir, reviewed } = setup({
    checklist: [entry({ added: 'done' }, 'regex'), entry({ paths: ['src/**'] }, 'paths'), entry({ paths: ['web/**'], added: 'x' }, 'no file')],
  });
  const { config } = loadConfig(dir, {});
  const normal = collectChange(dir, undefined, config);
  assert.deepEqual(normal.checklist.triggered.map((t) => [t.entry, t.by, t.error]), [[1, ['src/msg.py:1'], null], [2, ['src/msg.py'], null]]);
  const big = collectChange(dir, undefined, config, { maxDiffBytes: 100 });
  assert.deepEqual(big.files, normal.files);
  assert.deepEqual(big.checklist.triggered.map((t) => [t.entry, t.by, t.error]),
    [[1, [], 'the diff was too large to read (over 100 bytes)'], [2, ['src/msg.py'], null]]);
  assert.match(formatChange(big), /\nCode files: [^\n]*\nChecklist: 2 of 3 entries triggered\n {2}#1 regex\n {5}why: PR 1\.\n {5}triggered: the diff was too large to read \(over 100 bytes\); check it by hand\n {2}#2 paths\n/);

  put(dir, 'src/msg.py', 'MSG = "Done."\n');
  put(dir, 'tests/test_msg.py', 'def test_msg():\n    assert MSG == "Done."\n');
  commit(dir, 'fix');
  const fix = collectFix(dir, reviewed, undefined, config, { maxDiffBytes: 10 });
  assert.deepEqual(fix.flags, []);
  assert.equal(fix.checklist.triggered[0].error, 'the diff was too large to read (over 10 bytes)');
  assert.match(formatFix(fix), /\nSecond look, the fix only: [^\n]+$/);
});

test('the default size limit is 64 MiB, and a limit in whole MiB is named in MiB', () => {
  assert.equal(DIFF_MAX_BYTES, 64 * 1024 * 1024);
  const { dir } = setup({ checklist: [entry({ added: 'done' }, 'regex')] });
  put(dir, 'src/long.py', 'x = 1\n'.repeat(200000));
  commit(dir, 'long');
  const { config } = loadConfig(dir, {});
  assert.equal(collectChange(dir, undefined, config, { maxDiffBytes: 1024 * 1024 }).checklist.triggered[0].error,
    'the diff was too large to read (over 1 MiB)');
});

test('a regex that fails while it runs (backtrack stack overflow) prints its entry as triggered, and change exits 0', () => {
  const { dir } = setup({ checklist: [entry({ added: '^(?:(a)|b)*$' }, 'overflow'), entry({ added: 'done' }, 'next')] });
  writeFileSync(join(dir, 'big.txt'), 'ab'.repeat(2500000) + '\n');
  const text = run(dir, ['change'], { timeout: 10000 });
  assert.equal(text.error, undefined, 'killed by the timeout');
  assert.equal(text.code, 0, text.stderr);
  assert.match(text.stdout, /\n {2}#1 overflow\n {5}why: PR 1\.\n {5}triggered: its regex failed \([^\n)]+\); check it by hand\n {2}#2 next\n/);
  const j = json(run(dir, ['change', '--json'], { timeout: 10000 })).checklist.triggered;
  assert.deepEqual(j.map((t) => [t.entry, t.by, t.timedOut, /^its regex failed \(.+\)$/.test(t.error)]), [[1, [], false, true], [2, ['src/msg.py:1'], false, false]]);
});

test('an untracked symlink is not read through: its text is its target path, as git shows it once committed', () => {
  const outside = tempDir('review-scope-outside-');
  writeFileSync(join(outside, 'secret.txt'), 'needle\n');
  const { dir } = setup({ checklist: [entry({ added: 'needle' }, 'content'), entry({ added: 'secret\\.txt$' }, 'target')] });
  symlinkSync(join(outside, 'secret.txt'), join(dir, 'untracked-link'));
  const r = run(dir, ['change', '--json']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(json(r).checklist.triggered.map((t) => [t.entry, t.by]), [[2, ['untracked-link:1']]]);
});
