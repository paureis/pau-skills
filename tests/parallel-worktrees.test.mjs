// The parallel-worktrees helper: glob matching and overlap detection (pure), and status against a real repository
// with real `git worktree add`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import {
  parseWorktreeList, parseAheadBehind, countDirty, globToRegExp, matcher, validatePlan, findOverlaps,
  formatPlanCheck, parseArgs, collectStatus, formatStatus,
} from '../skills/agent-orchestration/parallel-worktrees/worktrees.mjs';

const SCRIPT = repo('skills', 'agent-orchestration', 'parallel-worktrees', 'worktrees.mjs');

describe('glob matching', () => {
  const cases = [
    ['src/*.ts', 'src/a.ts', true], ['src/*.ts', 'src/sub/a.ts', false],
    ['src/**', 'src/sub/deep/a.ts', true], ['src/**/*.ts', 'src/a.ts', true], ['src/**/*.ts', 'src/x/y/a.ts', true],
    ['src/**/*.ts', 'lib/a.ts', false], ['**/package.json', 'package.json', true], ['**/package.json', 'apps/web/package.json', true],
    ['src/?.ts', 'src/a.ts', true], ['src/?.ts', 'src/ab.ts', false], ['src/[ab].ts', 'src/b.ts', true], ['src/[!ab].ts', 'src/a.ts', false],
    ['src/{api,db}/**', 'src/db/x.sql', true], ['src/{api,db}/**', 'src/ui/x.tsx', false],
    ['docs/', 'docs/guide/a.md', true], ['./README.md', 'README.md', true], ['a.b', 'axb', false], ['src\\api\\*.go', 'src/api/h.go', true],
  ];
  for (const [glob, path, want] of cases) test(`${glob} vs ${path}`, () => assert.equal(matcher(glob)(path), want));

  test('a literal path matches the file and everything under that folder, not a sibling with the same prefix', () => {
    const m = matcher('src/api');
    assert.ok(m('src/api'));
    assert.ok(m('src/api/handler.py'));
    assert.equal(m('src/api2/handler.py'), false);
  });

  test('an unbalanced brace throws', () => assert.throws(() => globToRegExp('src/{a,b/**')));
});

describe('validatePlan', () => {
  test('accepts a good plan', () => assert.deepEqual(validatePlan({ pieces: [{ name: 'a', files: ['x'] }, { name: 'b', files: ['y'] }] }), []));
  test('rejects bad shapes', () => {
    assert.equal(validatePlan(null).length, 1);
    assert.equal(validatePlan({ pieces: 'no' }).length, 1);
    const errs = validatePlan({ pieces: [{ name: 'a', files: [] }, { name: 'a', files: ['x'] }, { files: ['y'] }, { name: 'c', files: ['src/{a'] }] });
    assert.ok(errs.some((e) => /files/.test(e)));
    assert.ok(errs.some((e) => /duplicate/.test(e)));
    assert.ok(errs.some((e) => /name/.test(e)));
    assert.ok(errs.some((e) => /brace/.test(e)));
  });
  test('a single piece is flagged', () => assert.equal(validatePlan({ pieces: [{ name: 'a', files: ['x'] }] }).length, 1));
});

describe('findOverlaps', () => {
  const FILES = ['src/api/users.py', 'src/api/orders.py', 'src/db/schema.sql', 'src/db/migrations/0007_add.sql', 'web/app.tsx', 'package-lock.json', 'README.md'];

  test('disjoint pieces have no overlap', () => {
    const r = findOverlaps({ pieces: [{ name: 'api', files: ['src/api/**'] }, { name: 'web', files: ['web/**'] }] }, FILES);
    assert.deepEqual(r.overlaps, []);
    assert.deepEqual(r.pieces.map((p) => p.matched), [2, 1]);
  });

  test('reports the files two globs both expand to, and only those', () => {
    const r = findOverlaps({ pieces: [{ name: 'api', files: ['src/api/**', 'src/db/schema.sql'] }, { name: 'db', files: ['src/db/**'] }, { name: 'web', files: ['web/**'] }] }, FILES);
    assert.equal(r.overlaps.length, 1);
    assert.deepEqual(r.overlaps[0], { a: 'api', b: 'db', files: ['src/db/schema.sql'], planned: [], sameGlobs: [] });
  });

  test('a lockfile claimed by two pieces is an overlap', () => {
    const r = findOverlaps({ pieces: [{ name: 'a', files: ['src/api/**', 'package-lock.json'] }, { name: 'b', files: ['web/**', '*.json'] }] }, FILES);
    assert.deepEqual(r.overlaps[0].files, ['package-lock.json']);
  });

  test('a new file one piece will create is compared against the other pieces', () => {
    const r = findOverlaps({ pieces: [{ name: 'a', files: ['src/db/migrations/0008_users.sql'] }, { name: 'b', files: ['src/db/migrations/'] }] }, FILES);
    assert.equal(r.overlaps.length, 1);
    assert.deepEqual(r.overlaps[0].planned, ['src/db/migrations/0008_users.sql']);
    assert.deepEqual(r.pieces[0].unmatched, ['src/db/migrations/0008_users.sql']);
  });

  test('two new folders nested in each other overlap, two new sibling files do not', () => {
    const nested = findOverlaps({ pieces: [{ name: 'a', files: ['src/new'] }, { name: 'b', files: ['src/new/x.go'] }] }, FILES);
    assert.deepEqual(nested.overlaps[0].planned, ['src/new/x.go']);
    const siblings = findOverlaps({ pieces: [{ name: 'a', files: ['src/new/x.go'] }, { name: 'b', files: ['src/new/y.go'] }] }, FILES);
    assert.deepEqual(siblings.overlaps, []);
  });

  test('identical globs that match nothing are still reported', () => {
    const r = findOverlaps({ pieces: [{ name: 'a', files: ['gen/**/*.pb.go'] }, { name: 'b', files: ['./gen/**/*.pb.go'] }] }, FILES);
    assert.deepEqual(r.overlaps[0].sameGlobs, ['gen/**/*.pb.go']);
  });

  test('the report names each overlapping pair and file', () => {
    const r = findOverlaps({ pieces: [{ name: 'api', files: ['src/**'] }, { name: 'db', files: ['src/db/**'] }] }, FILES);
    const text = formatPlanCheck(r);
    assert.match(text, /OVERLAP: 1 pair/);
    assert.match(text, /api <> db/);
    assert.match(text, /src\/db\/schema\.sql/);
    assert.doesNotMatch(text, /src\/api\/users\.py/);
    assert.match(formatPlanCheck(findOverlaps({ pieces: [{ name: 'a', files: ['web/**'] }, { name: 'b', files: ['README.md'] }] }, FILES)), /No overlap/);
  });
});

describe('parsers', () => {
  test('worktree list porcelain', () => {
    const text = [
      'worktree /repo', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
      'worktree /wt/feat', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/feat/a', 'locked reason here', '',
      'worktree /wt/det', 'HEAD 3333333333333333333333333333333333333333', 'detached', 'prunable gitdir file points to non-existent location', '',
    ].join('\n');
    const w = parseWorktreeList(text);
    assert.equal(w.length, 3);
    assert.equal(w[0].branch, 'main');
    assert.equal(w[1].branch, 'feat/a');
    assert.equal(w[1].locked, 'reason here');
    assert.equal(w[2].detached, true);
    assert.equal(w[2].branch, null);
    assert.ok(w[2].prunable);
  });
  test('ahead/behind', () => {
    assert.deepEqual(parseAheadBehind('3\t5\n'), { behind: 3, ahead: 5 });
    assert.equal(parseAheadBehind(''), null);
  });
  test('dirty count treats a rename as one path', () => {
    assert.equal(countDirty(''), 0);
    assert.equal(countDirty(' M a.txt\0?? b.txt\0R  new.txt\0old.txt\0'), 3);
  });
  test('arguments', () => {
    assert.deepEqual(parseArgs(['status', '--base', 'dev']).opts.base, 'dev');
    assert.equal(parseArgs(['plan-check', 'p.json']).opts.file, 'p.json');
    assert.ok(parseArgs(['plan-check']).error);
    assert.ok(parseArgs(['status', '--base']).error);
    assert.ok(parseArgs(['nope']).error);
    assert.ok(parseArgs([]).error);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Real repository
// ---------------------------------------------------------------------------------------------------------------

const G = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function makeRepo() {
  const root = realpathSync.native(tempDir('pw-'));
  const repo = join(root, 'repo');
  mkdirSync(repo);
  G(repo, 'init', '-q');
  G(repo, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  for (const [k, v] of [['user.name', 'Test'], ['user.email', 'test@example.com'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) G(repo, 'config', k, v);
  mkdirSync(join(repo, 'src', 'api'), { recursive: true });
  mkdirSync(join(repo, 'src', 'db'), { recursive: true });
  writeFileSync(join(repo, 'src', 'api', 'users.py'), 'x = 1\n');
  writeFileSync(join(repo, 'src', 'db', 'schema.sql'), 'create table t (id int);\n');
  writeFileSync(join(repo, 'README.md'), '# r\n');
  G(repo, 'add', '-A');
  G(repo, 'commit', '-q', '-m', 'base');
  return { root, repo };
}

test('status: every worktree with branch, ahead/behind, dirty count and last commit', () => {
  const { root, repo } = makeRepo();
  const wtA = join(root, 'wt-a');
  const wtB = join(root, 'wt-b');
  G(repo, 'worktree', 'add', '-q', '-b', 'piece/a', wtA);
  G(repo, 'worktree', 'add', '-q', '-b', 'piece/b', wtB);
  // piece/a: two commits ahead and one dirty file plus one untracked file.
  writeFileSync(join(wtA, 'src', 'api', 'users.py'), 'x = 2\n');
  G(wtA, 'commit', '-q', '-am', 'a one');
  writeFileSync(join(wtA, 'src', 'api', 'orders.py'), 'y = 1\n');
  G(wtA, 'add', '-A');
  G(wtA, 'commit', '-q', '-m', 'a two');
  writeFileSync(join(wtA, 'README.md'), '# changed\n');
  writeFileSync(join(wtA, 'notes.txt'), 'scratch\n');
  // main moves on by one commit, so piece/b is one behind.
  writeFileSync(join(repo, 'src', 'db', 'schema.sql'), 'create table t (id bigint);\n');
  G(repo, 'commit', '-q', '-am', 'main moves');

  const { base, rows } = collectStatus({ cwd: repo, base: 'main' });
  assert.equal(base, 'main');
  assert.equal(rows.length, 3);
  const by = Object.fromEntries(rows.map((r) => [r.branch, r]));
  assert.equal(by.main.current, true);
  assert.deepEqual(by.main.aheadBehind, { ahead: 0, behind: 0 });
  assert.equal(by.main.dirty, 0);
  assert.deepEqual(by['piece/a'].aheadBehind, { ahead: 2, behind: 1 });
  assert.equal(by['piece/a'].dirty, 2);
  assert.match(by['piece/a'].lastCommit, /a two$/);
  assert.deepEqual(by['piece/b'].aheadBehind, { ahead: 0, behind: 1 });
  assert.equal(by['piece/b'].dirty, 0);
  assert.equal(by['piece/b'].current, false);

  // Without --base it falls back to main; from inside a worktree, that worktree is "here".
  const fromA = collectStatus({ cwd: wtA });
  assert.equal(fromA.base, 'main');
  assert.equal(fromA.rows.find((r) => r.branch === 'piece/a').current, true);

  const text = formatStatus(rows, base);
  assert.match(text, /piece\/a\s+\+2 -1\s+2\s+\S+ .*a two/);

  // A worktree deleted from disk without `git worktree remove` shows as missing.
  execFileSync(process.execPath, ['-e', 'require("fs").rmSync(process.argv[1], { recursive: true, force: true })', wtB]);
  const after = collectStatus({ cwd: repo, base: 'main' });
  assert.equal(after.rows.find((r) => r.branch === 'piece/b').missing, true);
  assert.match(formatStatus(after.rows, 'main'), /worktree prune/);
});

test('CLI: status exits 0, a missing base exits 1; plan-check exits 1 on overlap and 0 without', () => {
  const { root, repo } = makeRepo();
  G(repo, 'worktree', 'add', '-q', '-b', 'piece/a', join(root, 'wt-a'));
  const ok = runNode(SCRIPT, { args: ['status', '--repo', repo, '--base', 'main'] });
  assert.equal(ok.code, 0, ok.stderr);
  assert.match(ok.stdout, /piece\/a/);
  const json = JSON.parse(runNode(SCRIPT, { args: ['status', '--repo', repo, '--json'] }).stdout);
  assert.equal(json.worktrees.length, 2);
  assert.equal(runNode(SCRIPT, { args: ['status', '--repo', repo, '--base', 'no-such-branch'] }).code, 1);

  const overlap = join(root, 'overlap.json');
  writeFileSync(overlap, JSON.stringify({ pieces: [{ name: 'api', files: ['src/**'] }, { name: 'db', files: ['src/db/*.sql'] }] }));
  const bad = runNode(SCRIPT, { args: ['plan-check', overlap, '--repo', repo] });
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /src\/db\/schema\.sql/);

  const clean = join(root, 'clean.json');
  writeFileSync(clean, JSON.stringify({ pieces: [{ name: 'api', files: ['src/api/**'] }, { name: 'db', files: ['src/db/**'] }] }));
  assert.equal(runNode(SCRIPT, { args: ['plan-check', clean, '--repo', repo] }).code, 0);

  const invalid = join(root, 'invalid.json');
  writeFileSync(invalid, '{"pieces": 3}');
  assert.equal(runNode(SCRIPT, { args: ['plan-check', invalid, '--repo', repo] }).code, 2);
  assert.equal(runNode(SCRIPT, { args: ['bogus'] }).code, 2);
});
