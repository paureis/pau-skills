// The REVIEW.md listing of `change`: for each changed file, the REVIEW.md files at the merge base from its folder up
// to the root, nearest first, each with the `git show` command that prints it. `fix` lists none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { g, put, commit, run, repoWith, json } from './review-scope.helpers.mjs';

const quoted = (s) => (/^[A-Za-z0-9._/@:=+-]+$/.test(s) ? s : `'${s}'`);

test('change lists the REVIEW.md files at the merge base, nearest folder first, each with a git show command that prints it', () => {
  const { dir, base } = repoWith({
    'REVIEW.md': 'root rules\n', 'src/api/REVIEW.md': 'api rules\n', 'src/api/handler.py': 'a = 1\n', 'src/db/q.py': 'q = 1\n',
    'my dir/REVIEW.md': 'spaced rules\n', 'my dir/a.py': 'a = 1\n',
    'skills/s/SKILL.md': 's\n', 'skills/s/REVIEW.md': 'skill rules\n', 'skills/s/run.py': 'r = 1\n',
    'odd/REVIEW.md/x.txt': 'a folder\n', 'odd/y.py': 'y = 1\n',
  });
  for (const p of ['src/api/handler.py', 'src/db/q.py', 'my dir/a.py', 'skills/s/run.py', 'odd/y.py', 'new/REVIEW.md', 'new/x.py']) put(dir, p, 'changed = 1\n');
  const sha = base.slice(0, 12);
  const top = quoted(g(dir, 'rev-parse', '--show-toplevel'));
  const r = run(dir, ['change']);
  assert.equal(r.code, 0, r.stderr);
  const block = [
    `REVIEW.md at ${sha}, nearest folder first:`,
    `  'my dir/a.py': 'my dir/REVIEW.md', REVIEW.md`,
    '  new/REVIEW.md: REVIEW.md', '  new/x.py: REVIEW.md', '  odd/y.py: REVIEW.md', '  skills/s/run.py: REVIEW.md',
    '  src/api/handler.py: src/api/REVIEW.md, REVIEW.md', '  src/db/q.py: REVIEW.md',
    `Read each with: git -C ${top} show '${sha}:my dir/REVIEW.md'`,
    `                git -C ${top} show ${sha}:REVIEW.md`,
    `                git -C ${top} show ${sha}:src/api/REVIEW.md`,
  ].join('\n');
  assert.ok(r.stdout.includes(`\nCode files: 6; test files: 0; doc files: 1\n${block}\nNote: `), r.stdout);
  const j = json(run(dir, ['change', '--json']));
  assert.deepEqual(j.reviewFiles.map((x) => [x.path, x.for]), [
    ['my dir/REVIEW.md', ['my dir/a.py']], ['REVIEW.md', j.files.map((f) => f.path)], ['src/api/REVIEW.md', ['src/api/handler.py']],
  ]);
  assert.equal(execFileSync('sh', ['-c', j.reviewFiles[0].show], { encoding: 'utf8' }), 'spaced rules\n');
});

test('with no REVIEW.md above the changed files, change says so', () => {
  const { dir, base } = repoWith({ 'src/x.py': 'x = 1\n', 'skills/s/SKILL.md': 's\n', 'skills/s/REVIEW.md': 'skill rules\n' });
  put(dir, 'src/x.py', 'x = 2\n');
  put(dir, 'skills/s/run.py', 'r = 1\n');
  const r = run(dir, ['change']);
  assert.ok(r.stdout.includes(`\nREVIEW.md at ${base.slice(0, 12)}: none above the changed files\n`), r.stdout);
  assert.deepEqual(json(run(dir, ['change', '--json'])).reviewFiles, []);
});

test('fix prints its Rules line second, lists no REVIEW.md and keeps the second-look command last', () => {
  const { dir, base } = repoWith({ 'REVIEW.md': 'root rules\n', 'src/msg.py': 'MSG = 1\n' });
  put(dir, 'src/msg.py', 'MSG = 2\n');
  const reviewed = commit(dir, 'feature');
  const nothing = run(dir, ['fix', '--since', reviewed]);
  assert.equal(nothing.stdout, `Fix since ${reviewed.slice(0, 12)}: nothing changed. There is no fix to look at.\n`);
  put(dir, 'src/msg.py', 'MSG = 3\n');
  put(dir, 'tests/test_msg.py', 'def test_msg():\n    assert MSG == 3\n');
  commit(dir, 'fix');
  const r = run(dir, ['fix', '--since', reviewed]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const lines = r.stdout.trimEnd().split('\n');
  assert.equal(lines[1], `Rules: the defaults (no .claude/review-rules.json at ${base.slice(0, 12)})`);
  assert.doesNotMatch(r.stdout, /REVIEW\.md/);
  assert.match(lines.at(-1), /^Second look, the fix only: /);
  assert.equal(json(run(dir, ['fix', '--since', reviewed, '--json'])).reviewFiles, undefined);
});
