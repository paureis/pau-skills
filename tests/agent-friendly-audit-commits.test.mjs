// The agent-friendly-audit miner's commits command: fix, revert and fixup commits with the files they touched, in git
// repositories built in temporary folders.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { runNode, tempDir } from './helpers.mjs';
import { SCRIPT, git, commit, history } from './agent-friendly-audit.helpers.mjs';

describe('commits', () => {
  test('lists fix, revert and fixup commits with their files, skips merges, and never prints an email', () => {
    const { dir, cache } = history();
    const r = runNode(SCRIPT, { args: ['commits', '--repo', dir] });
    assert.equal(r.code, 0, r.stderr);
    const subjects = r.stdout.split('\n').filter((l) => /^[0-9a-f]{7,}\t/.test(l)).map((l) => l.split('\t').slice(2).join('\t'));
    assert.deepEqual(subjects, [
      'fix\tFix the contact form for [email]',
      'fixup\tfixup! Fix empty input in parser',
      'fix\tparser: fixes from review',
      `revert\tRevert "Add cache" (reverts ${cache.slice(0, 7)})`,
      'fix\tFix empty input in parser',
    ]);
    assert.doesNotMatch(r.stdout, /@/);
    assert.doesNotMatch(r.stdout, /bug-fix|Side work|Merge branch/);
    assert.match(r.stdout, /\n\tsrc\/cache\.py\n/);
    assert.match(r.stdout, /# 3 fix, 1 revert, 1 fixup in 9 commits on main \(merges skipped\)/);
    assert.match(r.stdout, /# 3\tsrc\/parser\.py/);
    assert.doesNotMatch(r.stdout, /# 1\t/, 'a file touched once is not a hot spot');
  });

  test('--json gives the same commits as data', () => {
    const { dir, cache } = history();
    const r = runNode(SCRIPT, { args: ['commits', '--repo', dir, '--json'] });
    assert.equal(r.code, 0, r.stderr);
    const data = JSON.parse(r.stdout);
    assert.equal(data.scanned, 9);
    assert.deepEqual(data.commits.map((c) => c.kind), ['fix', 'fixup', 'fix', 'revert', 'fix']);
    const revert = data.commits.find((c) => c.kind === 'revert');
    assert.equal(revert.reverts, cache);
    assert.deepEqual(revert.files, ['src/cache.py']);
    assert.deepEqual(data.hotFiles, [{ file: 'src/parser.py', count: 3 }]);
    assert.doesNotMatch(r.stdout, /@/);
  });

  test('--rev mines the branch given, not the one checked out', () => {
    const { dir } = history();
    git(dir, 'checkout', '-q', '-b', 'topic');
    commit(dir, 'Fix a bug only on topic', { 'src/topic.py': 't\n' });
    const onTopic = runNode(SCRIPT, { args: ['commits', '--repo', dir] });
    assert.match(onTopic.stdout, /only on topic/);
    const onMain = runNode(SCRIPT, { args: ['commits', '--repo', dir, '--rev', 'main'] });
    assert.equal(onMain.code, 0, onMain.stderr);
    assert.doesNotMatch(onMain.stdout, /only on topic/);
    assert.match(onMain.stdout, /# 3 fix, 1 revert, 1 fixup in 9 commits on main \(merges skipped\)/);
  });

  test('--rev refuses a value that git would read as an option', () => {
    const { dir } = history();
    const r = runNode(SCRIPT, { args: ['commits', '--repo', dir, '--rev', '--all'] });
    assert.equal(r.code, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /must name a branch or commit/);
  });

  test('a refusal is printed as it is, without the "failed:" of an unexpected error', () => {
    const { dir } = history();
    const r = runNode(SCRIPT, { args: ['commits', '--repo', dir, '--rev', '--all'] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^--rev must name a branch or commit/);
  });

  test('a file touched by exactly two of the commits is a hot file, in the text and in --json', () => {
    const { dir } = history();
    commit(dir, 'Fix the contact form again', { 'src/form.py': 'g\n' });
    const text = runNode(SCRIPT, { args: ['commits', '--repo', dir] });
    assert.equal(text.code, 0, text.stderr);
    assert.match(text.stdout, /^# 2\tsrc\/form\.py$/m);
    const json = runNode(SCRIPT, { args: ['commits', '--repo', dir, '--json'] });
    assert.equal(json.code, 0, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout).hotFiles, [{ file: 'src/parser.py', count: 3 }, { file: 'src/form.py', count: 2 }]);
  });

  test('a folder that is not a git repository is refused', () => {
    // The ceiling stops git from finding a repository above the temporary folder.
    const d = tempDir('afa-nogit-');
    const r = runNode(SCRIPT, { args: ['commits', '--repo', d], env: { GIT_CEILING_DIRECTORIES: dirname(realpathSync(d)) } });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /not a git repository/);
  });
});
