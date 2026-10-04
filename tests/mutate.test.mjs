// The mutation harness, run for real in a throwaway git repository: argument handling, the refusals that protect
// work (dirty tree, failing control, mutation that does not apply, patch touching another file), CAUGHT and SURVIVED,
// and that every path leaves the file restored.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plugin, tempDir, findBash } from './helpers.mjs';

const HARNESS = plugin('verification', 'scripts', 'mutate.sh').replace(/\\/g, '/');
const BASH = findBash();
let repo;

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
const SOURCE = 'export const isOwner = (user, doc) => user.id === doc.ownerId;\nexport const add = (a, b) => a + b;\n';
// The "test suite": checks isOwner only, so a mutation of add survives.
const CHECK = "import { isOwner } from './lib.mjs';\nif (!isOwner({ id: 1 }, { ownerId: 1 }) || isOwner({ id: 1 }, { ownerId: 2 })) process.exit(1);\n";

function harness(args, input = '') {
  const r = spawnSync(BASH, [HARNESS, ...args], { cwd: repo, input, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const assertRestored = () => {
  assert.equal(readFileSync(join(repo, 'lib.mjs'), 'utf8'), SOURCE);
  assert.equal(git('status', '--porcelain'), '');
};

before(() => {
  repo = tempDir('mutate-');
  execFileSync('git', ['init', '-q', repo]);
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'core.autocrlf', 'false');
  writeFileSync(join(repo, 'lib.mjs'), SOURCE);
  writeFileSync(join(repo, 'check.mjs'), CHECK);
  writeFileSync(join(repo, 'other.mjs'), 'export const x = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
});

test('usage errors exit 2', () => {
  assert.equal(harness([]).code, 2);
  assert.equal(harness(['lib.mjs']).code, 2);
  assert.equal(harness(['--label']).code, 2);
});

test('a missing or untracked file is refused', () => {
  assert.equal(harness(['nope.mjs', 'node', 'check.mjs'], 's/a/b/').code, 2);
});

test('CAUGHT: a mutation the check detects exits 0 and the file is restored', () => {
  const r = harness(['--label', 'owner', 'lib.mjs', 'node', 'check.mjs'], 's/user.id === doc.ownerId/true/\n');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\[owner\] RESULT: CAUGHT/);
  assert.match(r.out, /MUTATION APPLIED/);
  assertRestored();
});

test('SURVIVED: a mutation the check misses exits 1, prints the changed lines, and restores', () => {
  const r = harness(['--sed', 's/a + b/a - b/', 'lib.mjs', 'node', 'check.mjs']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /RESULT: SURVIVED/);
  assert.match(r.out, /\+export const add = \(a, b\) => a - b;/);
  assertRestored();
});

test('a sed that matches nothing is refused (exit 2), not reported as SURVIVED', () => {
  const r = harness(['lib.mjs', 'node', 'check.mjs'], 's/does-not-occur/x/\n');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /did not change the content/);
  assertRestored();
});

test('a failing control refuses to mutate', () => {
  const r = harness(['lib.mjs', 'node', 'missing-test.mjs'], 's/a + b/a - b/\n');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /fails without the mutation/);
  assertRestored();
});

test('a dirty tree refuses to mutate and keeps the uncommitted work', () => {
  writeFileSync(join(repo, 'other.mjs'), 'export const x = 2; // uncommitted work\n');
  try {
    const r = harness(['lib.mjs', 'node', 'check.mjs'], 's/a + b/a - b/\n');
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /uncommitted changes/);
    assert.match(readFileSync(join(repo, 'other.mjs'), 'utf8'), /uncommitted work/);
  } finally {
    git('checkout', '--', 'other.mjs');
  }
});

test('a patch is applied when it touches only the file, refused when it touches another', () => {
  const patch = 'diff --git a/lib.mjs b/lib.mjs\n--- a/lib.mjs\n+++ b/lib.mjs\n@@ -1,2 +1,2 @@\n-export const isOwner = (user, doc) => user.id === doc.ownerId;\n+export const isOwner = (user, doc) => true;\n export const add = (a, b) => a + b;\n';
  const ok = harness(['lib.mjs', 'node', 'check.mjs'], patch);
  assert.equal(ok.code, 0, ok.out);
  assertRestored();
  const other = 'diff --git a/other.mjs b/other.mjs\n--- a/other.mjs\n+++ b/other.mjs\n@@ -1 +1 @@\n-export const x = 1;\n+export const x = 3;\n';
  const bad = harness(['lib.mjs', 'node', 'check.mjs'], other);
  assert.equal(bad.code, 2, bad.out);
  assert.match(bad.out, /must touch only lib\.mjs/);
  assertRestored();
});
