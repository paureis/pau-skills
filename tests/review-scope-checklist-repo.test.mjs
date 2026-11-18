// The review-scope checklist against real repositories: `change` and `fix` print the entries the diff triggers.
// Every CLI call runs in a child process with a kill timeout, so a hang fails one test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { g, put, commit, run, setup } from './review-scope.helpers.mjs';

const entry = (trigger, check, why = 'PR 1.') => ({ trigger, check, why });
const json = (r) => { assert.equal(r.error, undefined, 'killed by the timeout'); return JSON.parse(r.stdout); };
const triggered = (r) => json(r).checklist.triggered.map((t) => [t.entry, t.by]);

test('an invalid trigger regex stops change and config with exit 2, naming the entry', () => {
  const { dir } = setup({ checklist: [entry({ added: '(' }, 'x')] });
  for (const args of [['change'], ['config']]) {
    const r = run(dir, args);
    assert.equal(r.code, 2, r.stdout);
    assert.match(r.stderr, /checklist #1: "trigger.added" is not a valid regular expression/);
  }
});

test('change: committed, unstaged and untracked added lines all count, each named path:line', () => {
  const { dir } = setup({
    checklist: [
      entry({ added: 'done' }, 'committed'), entry({ added: 'unstaged' }, 'unstaged'),
      entry({ added: 'untracked' }, 'untracked'), entry({ added: '"ok"' }, 'only removed'),
    ],
  });
  put(dir, 'core/pick.py', 'def pick():\n    return 1\n# unstaged\n');
  put(dir, 'new/notes.txt', 'one\ntwo\nuntracked three\n');
  const r = run(dir, ['change', '--json']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(json(r).checklist.entries, 4);
  assert.deepEqual(triggered(r), [[1, ['src/msg.py:1']], [2, ['core/pick.py:3']], [3, ['new/notes.txt:3']]]);
});

test('change: a tracked path with a space works, and a binary untracked file is skipped', () => {
  const { dir } = setup({ checklist: [entry({ paths: ['docs/**'], added: 'needle' }, 'spaced')] });
  put(dir, 'docs/my notes.md', 'a\n');
  const start = commit(dir, 'notes');
  put(dir, 'docs/my notes.md', 'a\nb\nneedle\n');
  writeFileSync(join(dir, 'docs', 'blob.bin'), Buffer.from('needle\0needle\n'));
  const r = run(dir, ['change', '--json', '--base', start]);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(triggered(r), [[1, ['docs/my notes.md:3']]]);
});

test('change: a nested repository or a dangling link among the untracked files is skipped, not an error', () => {
  const { dir } = setup({ checklist: [entry({ added: 'needle' }, 'x')] });
  put(dir, 'vendor/lib/x.txt', 'needle\n');
  g(join(dir, 'vendor'), 'init', '-q');
  symlinkSync('missing-target', join(dir, 'dangling'));
  put(dir, 'z.txt', 'needle\n');
  const r = run(dir, ['change', '--json']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(triggered(r), [[1, ['z.txt:1']]]);
});

test('fix: only the fix\'s own added lines trigger, and the exit code still comes from the flags alone', () => {
  const { dir, reviewed } = setup({ checklist: [entry({ added: 'done' }, 'reviewed only'), entry({ added: 'Fixed' }, 'the fix')] });
  put(dir, 'src/msg.py', 'MSG = "done"\nFIX = "Fixed"\n');
  put(dir, 'tests/test_msg.py', 'def test_msg():\n    assert FIX\n');
  commit(dir, 'fix');
  const clean = run(dir, ['fix', '--since', reviewed, '--json']);
  assert.equal(clean.code, 0, clean.stdout);
  assert.deepEqual(triggered(clean), [[2, ['src/msg.py:2']]]);
  put(dir, 'core/pick.py', 'def pick():\n    return 3\n');
  const flagged = run(dir, ['fix', '--since', reviewed]);
  assert.equal(flagged.code, 1, flagged.stdout);
  assert.match(flagged.stdout, /Checklist: 1 of 2 entries triggered/);
});

test('hostile git settings do not change what the regex sees', () => {
  const { dir } = setup({ checklist: [entry({ added: '^needle$' }, 'found')] });
  put(dir, '.gitattributes', '*.txt diff=hide\n');
  // Blank lines around the changes: with diff.suppressBlankEmpty, a blank context line has no leading space, so any
  // context that reaches the parser (from GIT_DIFF_OPTS or a merged hunk) shifts the line number.
  put(dir, 'hay.txt', '1\n\n3\n\n5\n\n7\n\n9\n10\n');
  const start = commit(dir, 'hay');
  for (const [k, v] of [['diff.noprefix', 'true'], ['diff.mnemonicPrefix', 'true'], ['color.diff', 'always'],
    ['color.ui', 'always'], ['diff.hide.textconv', 'sed s/needle/HIDDEN/'], ['diff.interHunkContext', '5'],
    ['diff.suppressBlankEmpty', 'true']]) g(dir, 'config', k, v);
  put(dir, 'hay.txt', '1\n\nx\n\n5\n\n7\nneedle\n9\n10\n');
  const r = run(dir, ['change', '--json', '--base', start], { env: { GIT_EXTERNAL_DIFF: 'true', GIT_DIFF_OPTS: '-u3' } });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(triggered(r), [[1, ['hay.txt:8']]]);
});

test('mnemonic prefixes alone do not hide a path', () => {
  const { dir } = setup({ checklist: [entry({ added: 'done' }, 'found')] });
  g(dir, 'config', 'diff.mnemonicPrefix', 'true');
  const r = run(dir, ['change', '--json']);
  assert.deepEqual(triggered(r), [[1, ['src/msg.py:1']]]);
});

test('a regex that backtracks for ever times out: its entry prints as triggered, and change still exits 0', () => {
  const { dir } = setup({ checklist: [entry({ added: '^(a+)+$' }, 'slow')] });
  put(dir, 'src/slow.txt', 'a'.repeat(40) + '!\n');
  for (const args of [['change'], ['change', '--json']]) {
    const r = run(dir, args, { timeout: 5000 });
    assert.equal(r.error, undefined, 'killed by the timeout');
    assert.equal(r.code, 0, r.stderr);
    if (args.length === 1) assert.match(r.stdout, /\n {2}#1 slow\n {5}why: PR 1\.\n {5}triggered: its regex timed out after 1000 ms; check it by hand\n/);
    else assert.deepEqual(json(r).checklist.triggered, [{ entry: 1, check: 'slow', why: 'PR 1.', by: [], timedOut: true }]);
  }
});

test('change text: the count, check, why and "triggered by", with "and <m> more" past three paths', () => {
  const { dir } = setup({ checklist: [entry({ paths: ['web/**'] }, 'not hit'), entry({ paths: ['src/**'] }, 'Check the messages.', 'PR 7.')] });
  for (const n of [1, 2, 3, 4, 5]) put(dir, `src/m${n}.py`, 'x = 1\n');
  const r = run(dir, ['change']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\nCode files: [^\n]*\nChecklist: 1 of 2 entries triggered\n {2}#2 Check the messages\.\n {5}why: PR 7\.\n {5}triggered by: src\/m1\.py, src\/m2\.py, src\/m3\.py and 3 more\n/);
});

test('without a checklist key there is no checklist line, and fix keeps the second-look command last', () => {
  const { dir, reviewed } = setup();
  const change = run(dir, ['change']);
  assert.equal(change.code, 0, change.stderr);
  assert.doesNotMatch(change.stdout, /Checklist/);
  const { dir: d2, reviewed: r2 } = setup({ checklist: [entry({ paths: ['src/**'] }, 'Check the messages.')] });
  for (const [d, rv, want] of [[dir, reviewed, false], [d2, r2, true]]) {
    put(d, 'src/msg.py', 'MSG = "Done."\n');
    put(d, 'tests/test_msg.py', 'def test_msg():\n    assert MSG == "Done."\n');
    commit(d, 'fix');
    const r = run(d, ['fix', '--since', rv]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(/Checklist/.test(r.stdout), want, r.stdout);
    assert.match(r.stdout, /\nFlags: none\n(Checklist: 1 of 1 entries triggered\n(?: [^\n]*\n){3})?Second look, the fix only: [^\n]+\n?$/);
  }
});

test('a deletion-only hunk is read for its old count, so a removed "-- header" stays content', () => {
  const { dir } = setup({ checklist: [entry({ added: 'DROP TABLE' }, 'drop')] });
  put(dir, 'm.sql', 'SELECT 1;\n-- header\nSELECT 2;\nSELECT 3;\nSELECT 4;\nSELECT 5;\n');
  const start = commit(dir, 'm');
  put(dir, 'm.sql', 'SELECT 1;\nSELECT 2;\nSELECT 3;\nSELECT 4;\nDROP TABLE t;\nSELECT 5;\n');
  assert.deepEqual(triggered(run(dir, ['change', '--json', '--base', start])), [[1, ['m.sql:5']]]);
});

test('an untracked file gets no empty last line from its final newline, and loses one \\r per line', () => {
  const { dir } = setup({ checklist: [entry({ added: '^$' }, 'empty line'), entry({ added: '\\r' }, 'carriage return')] });
  put(dir, 'u.txt', 'one\r\ntwo\r\n');
  assert.deepEqual(triggered(run(dir, ['change', '--json'])), []);
});

test('a tracked path with a space and a quote, which git quotes and ends with a tab, keeps its lines', () => {
  const { dir } = setup({ checklist: [entry({ added: 'needle' }, 'found')] });
  put(dir, 'sp ace "q".py', 'a = 1\n');
  const start = commit(dir, 'quoted');
  put(dir, 'sp ace "q".py', 'a = 1\nneedle = 2\n');
  assert.deepEqual(triggered(run(dir, ['change', '--json', '--base', start])), [[1, ['sp ace "q".py:2']]]);
});
