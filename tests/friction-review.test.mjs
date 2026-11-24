// friction-review's friction.mjs: which sessions it reads (only this repository's folders, the newest by modification
// time, one by id, the live one left out) and its exit codes, on temporary folders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tempDir } from './helpers.mjs';
import { SCRIPT, git, step, bash, world, encodeProjectPath } from './friction-review.helpers.mjs';

// A session whose one search before an edit names it, so its pointer shows whether it was read.
const marked = (mark) => [step('Grep', { pattern: mark }, 'a.js'), step('Edit', { file_path: 'a.js', old_string: 'a', new_string: 'b' })];

function ages() {
  const w = world();
  w.session(w.own, 'sa', marked('MARKA'), { ageMin: 3 * 24 * 60 });
  w.session(w.own, 'sb', marked('MARKB'), { ageMin: 2 * 24 * 60 });
  w.session(w.own, 'sc', marked('MARKC'), { ageMin: 24 * 60 });
  w.session(w.own, 'sd', marked('MARKD'), { ageMin: 1 });
  return w;
}

const header = (stdout) => stdout.split('\n')[0];

test('reads only this repository and its worktrees, never another project in the same projects folder', () => {
  const w = world();
  git(w.main, '-c', 'user.name=x', '-c', 'user.email=x@example.org', 'commit', '-q', '--allow-empty', '-m', 'start');
  const tree = join(w.home, 'src', 'app-tree');
  git(w.main, 'worktree', 'add', '-q', tree);
  const treeFolder = join(w.projects, encodeProjectPath(tree));
  w.session(w.own, 'ownfile', marked('OWNMARK'));
  w.session(treeFolder, 'treefile', marked('TREEMARK'));
  w.session(w.other, 'otherfile', marked('OTHERMARK'));
  writeFileSync(join(w.projects, 'strayfile.jsonl'), JSON.stringify(marked('STRAYMARK')[0][0]) + '\n');
  for (const args of [[], ['--projects', w.projects]]) {
    const r = w.run(...args);
    assert.equal(r.code, 0, r.stderr);
    assert.match(header(r.stdout), /: 2 sessions from /);
    assert.match(r.stdout, /OWNMARK/);
    assert.match(r.stdout, /~-src-app-tree\/treefile\.jsonl:\d+ Grep TREEMARK/);
    assert.doesNotMatch(r.stdout + r.stderr, /OTHERMARK|otherfile|STRAYMARK|strayfile|src-other|mine\.mjs/);
  }
});

test('--last reads the newest sessions by modification time, and the live one is left out', () => {
  const w = ages();
  const r = w.run('--last', '2');
  assert.equal(r.code, 0, r.stderr);
  assert.match(header(r.stdout), /: 2 sessions from /);
  assert.match(r.stdout, /MARKB/);
  assert.match(r.stdout, /MARKC/);
  assert.doesNotMatch(r.stdout, /MARKA|MARKD/);
  assert.match(r.stdout, /^# left out 1 recent session, probably the one running now \(--keep-recent reads it\)$/m);
});

test('the default reads up to 30 sessions; --keep-recent reads the live one too', () => {
  const w = ages();
  const all = w.run();
  assert.match(header(all.stdout), /: 3 sessions from /);
  assert.doesNotMatch(all.stdout, /MARKD/);
  const keep = w.run('--keep-recent');
  assert.equal(keep.code, 0, keep.stderr);
  assert.match(header(keep.stdout), /: 4 sessions from /);
  assert.match(keep.stdout, /MARKD/);
  assert.doesNotMatch(keep.stdout, /left out/);
});

test('--session reads only that session and keeps it when it is the live one', () => {
  const w = ages();
  const r = w.run('--session', 'sd');
  assert.equal(r.code, 0, r.stderr);
  assert.match(header(r.stdout), /: 1 session from /);
  assert.match(r.stdout, /MARKD/);
  assert.doesNotMatch(r.stdout, /MARK[ABC]/);
  const old = w.run('--session', 'sa');
  assert.match(old.stdout, /MARKA/);
  assert.doesNotMatch(old.stdout, /MARK[BCD]/);
});

test('--skip leaves a session out', () => {
  const w = ages();
  const r = w.run('--skip', 'sc', '--skip', 'sb');
  assert.equal(r.code, 0, r.stderr);
  assert.match(header(r.stdout), /: 1 session from /);
  assert.match(r.stdout, /MARKA/);
  assert.match(r.stdout, /^# left out 2 sessions named by --skip$/m);
});

test('usage errors exit 2', () => {
  const w = ages();
  for (const args of [['--last', '0'], ['--last', 'x'], ['--last', '2.5'], ['--last'], ['--session', 'sa', '--last', '2'],
    ['--session', '../sa'], ['--session', 'sa.jsonl'], ['--skip', 'a/b'], ['--skip', ''], ['--frobnicate'], ['folder']]) {
    const r = w.run(...args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.stdout}`);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /usage: friction\.mjs/);
  }
});

test('refusals exit 1: a session id that is not found, a folder that is not a git repository', () => {
  const w = ages();
  // The other project's session exists, but not among this repository's sessions.
  w.session(w.other, 'elsewhere', marked('X'));
  for (const id of ['nope', 'elsewhere']) {
    const r = w.run('--session', id);
    assert.equal(r.code, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, new RegExp(`no session ${id} among this repository's transcripts`));
  }
  const plain = tempDir('fr-plain-');
  mkdirSync(join(plain, 'x'));
  const r = runNode(SCRIPT, { args: ['--repo', join(plain, 'x')], env: w.env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /is not a git repository/);
});

test('with no transcript folder for this repository it still prints the project part and exits 0', () => {
  const w = world();
  const r = runNode(SCRIPT, { args: ['--repo', w.main, '--projects', join(w.home, 'empty')], env: w.env });
  assert.equal(r.code, 0, r.stderr);
  assert.match(header(r.stdout), /: 0 sessions in ~\/empty; /);
  assert.match(r.stdout, /^## Project$/m);
  assert.match(r.stdout, /^# no transcript folder matches this repository or its worktrees$/m);
});

test('the header names the projects folder, the counts and the thresholds', () => {
  const w = world();
  w.session(w.own, 's1', [bash('ls', 'a')], { subagents: [{ name: 'a1', agentType: 'reviewer', steps: [bash('ls', 'b')] }] });
  const r = w.run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(header(r.stdout), /^# friction-review: 1 session from \d{4}-\d\d-\d\d to \d{4}-\d\d-\d\d in ~\/\.claude\/projects; 1 subagent transcript; 1 unreadable line; thresholds: READ_REPEAT_MIN 3, SHELL_REPEAT_MIN 3, POINTERS_PER_SIGNAL 3, BIG_RESULT_CHARS 20000$/);
});
