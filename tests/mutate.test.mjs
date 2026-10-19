// The mutation harness, run for real in a throwaway git repository: argument handling, the refusals that protect
// work (dirty tree, failing control, mutation that does not apply, patch touching another file), CAUGHT and SURVIVED,
// the refactor mode (KEPT and BROKE), a mutation taken from a real fix in git history, that every path leaves the
// file restored, that Python's bytecode cache cannot run the original code in place of the mutant, and that the
// restore puts the committed content back (and a restore that did not happen is an error) whatever the file's times.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { repo as repoPath, tempDir, findBash } from './helpers.mjs';

const HARNESS = repoPath('skills', 'verification', 'mutation-test', 'mutate.sh').replace(/\\/g, '/');
const BASH = findBash();
let repo;

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
const SOURCE = 'export const isOwner = (user, doc) => user.id === doc.ownerId;\nexport const add = (a, b) => a + b;\n';
// The "test suite": checks isOwner only, so a mutation of add survives.
const CHECK = "import { isOwner } from './lib.mjs';\nif (!isOwner({ id: 1 }, { ownerId: 1 }) || isOwner({ id: 1 }, { ownerId: 2 })) process.exit(1);\n";

function harness(args, input = '', { env = process.env, cwd = repo } = {}) {
  const r = spawnSync(BASH, [HARNESS, ...args], { cwd, input, env, encoding: 'utf8' });
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

test('refactor mode, KEPT: a pure refactor leaves the check green, exits 0 and restores', () => {
  const r = harness(['--refactor', '--label', 'swap', '--sed', 's/user.id === doc.ownerId/doc.ownerId === user.id/', 'lib.mjs', 'node', 'check.mjs']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /REFACTOR APPLIED/);
  assert.match(r.out, /\[swap\] RESULT: KEPT/);
  assertRestored();
});

test('refactor mode, BROKE: an edit that breaks the checked behaviour exits 1, prints the changed lines, restores', () => {
  const r = harness(['--refactor', 'lib.mjs', 'node', 'check.mjs'], 's/user.id === doc.ownerId/true/\n');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /RESULT: BROKE/);
  assert.doesNotMatch(r.out, /CAUGHT/);
  assert.match(r.out, /RESULT: BROKE[\s\S]*\+export const isOwner = \(user, doc\) => true;/);
  // A crash is not a coupled test: the verdict tells the agent to read the failure first.
  assert.match(r.out, /build error, syntax error or missing import means the refactor was wrong, not the test/);
  assertRestored();
});

test('refactor mode keeps the refusals: a refactor that changes nothing exits 2', () => {
  const r = harness(['--refactor', '--sed', 's/does-not-occur/x/', 'lib.mjs', 'node', 'check.mjs']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /did not change the content/);
  assertRestored();
});

test('a real past fix, reversed with git show -R, is fed to the harness as the mutation', () => {
  // History: the bug, then the fix that brings back SOURCE. Reversing the fix reintroduces the bug.
  writeFileSync(join(repo, 'lib.mjs'), SOURCE.replace('user.id === doc.ownerId', 'user.id == doc.owner'));
  git('commit', '-q', '-am', 'owner check');
  writeFileSync(join(repo, 'lib.mjs'), SOURCE);
  git('commit', '-q', '-am', 'fix: compare against ownerId');
  const patch = git('show', '-R', '--format=', '--no-color', 'HEAD', '--', 'lib.mjs');
  const r = harness(['--label', 'real-fix', 'lib.mjs', 'node', 'check.mjs'], patch);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\[real-fix\] RESULT: CAUGHT/);
  assertRestored();
});

test('refactor mode refuses (exit 2) when the command already fails without the refactor', () => {
  const r = harness(['--refactor', 'lib.mjs', 'node', 'missing-test.mjs'], 's/a + b/b + a/\n');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /NOT REFACTORED: the command fails without the refactor/);
  assert.doesNotMatch(r.out, /REFACTOR APPLIED|RESULT/);
  assertRestored();
});

test('an edit that deletes or empties the file is refused (exit 2) in both modes, not read as CAUGHT', () => {
  // Reversing the commit that created a file gives a whole-file deletion; a missing module proves nothing.
  writeFileSync(join(repo, 'extra.mjs'), 'export const y = 2;\n');
  writeFileSync(join(repo, 'check-extra.mjs'), "import { y } from './extra.mjs';\nif (y !== 2) process.exit(1);\n");
  git('add', 'extra.mjs', 'check-extra.mjs');
  git('commit', '-q', '-m', 'add extra');
  const deletion = git('show', '-R', '--format=', '--no-color', 'HEAD', '--', 'extra.mjs');
  assert.match(deletion, /deleted file mode/);
  for (const mode of [[], ['--refactor']]) {
    const r = harness([...mode, 'extra.mjs', 'node', 'check-extra.mjs'], deletion);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /deletes extra\.mjs/);
    assert.doesNotMatch(r.out, /RESULT/);
    assert.equal(readFileSync(join(repo, 'extra.mjs'), 'utf8'), 'export const y = 2;\n');
    assert.equal(git('status', '--porcelain'), '');
    const empty = harness([...mode, '--sed', '1,$d', 'lib.mjs', 'node', 'check.mjs']);
    assert.equal(empty.code, 2, empty.out);
    assert.match(empty.out, /leaves lib\.mjs empty/);
    assert.doesNotMatch(empty.out, /RESULT/);
    assertRestored();
  }
});

test('the harness turns off Python bytecode writing for its commands, whatever the caller set', () => {
  // The probe sits outside the repository, logs what the command sees, then runs the real check.
  const out = tempDir('mutate-probe-');
  const log = join(out, 'env.log');
  const probe = join(out, 'probe.mjs');
  writeFileSync(probe, `import { appendFileSync } from 'node:fs';\nimport { spawnSync } from 'node:child_process';\n` +
    `appendFileSync(${JSON.stringify(log)}, JSON.stringify([process.env.PYTHONDONTWRITEBYTECODE ?? null, process.env.PYTHONPYCACHEPREFIX ?? null]) + '\\n');\n` +
    `process.exit(spawnSync(process.execPath, ['check.mjs'], { stdio: 'inherit' }).status);\n`);
  for (const value of [undefined, '0']) {
    writeFileSync(log, '');
    const env = { ...process.env };
    delete env.PYTHONDONTWRITEBYTECODE; delete env.PYTHONPYCACHEPREFIX;
    if (value !== undefined) env.PYTHONDONTWRITEBYTECODE = value;
    const r = harness(['lib.mjs', 'node', probe], 's/user.id === doc.ownerId/true/\n', { env });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /RESULT: CAUGHT/);
    const seen = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(seen.length, 2, 'control and mutant both ran');
    for (const [dont, prefix] of seen) {
      assert.equal(dont, '1', `PYTHONDONTWRITEBYTECODE with the caller's value ${value}`);
      assert.ok(prefix, 'PYTHONPYCACHEPREFIX is set');
    }
    assert.equal(seen[0][1], seen[1][1], 'one cache folder for the run');
    assert.equal(existsSync(seen[0][1]), false, 'the cache folder is removed on exit');
    assertRestored();
  }
});

// A repository where git compares only a file's whole-second modification time and size with what the index recorded
// (core.checkStat minimal, in the repository's own config; the global config is an empty file, as on a CI runner).
// The command sets mod.js's times to 2020-01-01, keeps its size, and passes only on the original content. It runs
// once before the harness, so the index already holds that past time when the harness mutates the file.
function pastTimeRepo(extra = '') {
  const dir = tempDir('mutate-stat-');
  const empty = join(tempDir('mutate-gitconfig-'), 'empty');
  writeFileSync(empty, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: empty };
  const sgit = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env });
  execFileSync('git', ['init', '-q', dir], { env });
  sgit('config', 'user.email', 'test@example.com');
  sgit('config', 'user.name', 'test');
  sgit('config', 'commit.gpgsign', 'false');
  sgit('config', 'core.autocrlf', 'false');
  sgit('config', 'core.checkStat', 'minimal');
  writeFileSync(join(dir, 'mod.js'), 'export const v = 1;\n');
  writeFileSync(join(dir, 'touch.mjs'), "import { utimesSync, readFileSync, writeFileSync } from 'node:fs';\n" +
    "const ok = readFileSync('mod.js', 'utf8').includes('v = 1');\n" + extra +
    "const t = new Date('2020-01-01T00:00:00Z');\nutimesSync('mod.js', t, t);\nprocess.exit(ok ? 0 : 1);\n");
  sgit('add', '.');
  sgit('commit', '-q', '-m', 'init');
  execFileSync(process.execPath, ['touch.mjs'], { cwd: dir, env });
  assert.equal(sgit('status', '--porcelain'), '');
  return { dir, env, sgit };
}

test('a command that sets the file to a past time cannot make the restore skip the file', () => {
  const { dir, env, sgit } = pastTimeRepo();
  const r = harness(['--sed', 's/v = 1/v = 2/', 'mod.js', process.execPath, 'touch.mjs'], '', { env, cwd: dir });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /RESTORED mod\.js/);
  assert.match(r.out, /RESULT: CAUGHT/);
  assert.equal(readFileSync(join(dir, 'mod.js'), 'utf8'), 'export const v = 1;\n', 'the mutant is still in the file');
  assert.equal(sgit('status', '--porcelain'), '');
});

test('a file committed with CRLF line endings under core.autocrlf restores as clean', () => {
  // checkout leaves such a file's CRLF alone, while git hash-object would convert it to LF: the content check must
  // compare what checkout writes, or every restore of it reads as failed.
  const { dir, env, sgit } = pastTimeRepo();
  writeFileSync(join(dir, 'mod.js'), 'export const v = 1;\r\nexport const w = 2;\r\n');
  sgit('commit', '-q', '-am', 'crlf');
  sgit('config', 'core.autocrlf', 'true');
  assert.equal(sgit('status', '--porcelain'), '');
  const r = harness(['--sed', 's/v = 1/v = 2/', 'mod.js', process.execPath, 'touch.mjs'], '', { env, cwd: dir });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /RESTORED mod\.js[\s\S]*RESULT: CAUGHT/);
  assert.equal(readFileSync(join(dir, 'mod.js'), 'utf8'), 'export const v = 1;\r\nexport const w = 2;\r\n');
  assert.equal(sgit('status', '--porcelain'), '');
});

test('a restore that cannot happen exits 2 with the recovery, never RESTORED', () => {
  // On the mutant the command also leaves .git/index.lock behind, as an interrupted git command does, so the restore's
  // git checkout fails.
  const { dir, env, sgit } = pastTimeRepo("if (!ok) writeFileSync('.git/index.lock', '');\n");
  try {
    const r = harness(['--sed', 's/v = 1/v = 2/', 'mod.js', process.execPath, 'touch.mjs'], '', { env, cwd: dir });
    assert.equal(r.code, 2, r.out);
    assert.doesNotMatch(r.out, /RESTORED|RESULT/);
    assert.match(r.out, /restoring mod\.js did not work/);
    assert.match(r.out, /missing or still holds the mutation/);
    assert.match(r.out, /git checkout -- mod\.js/);
  } finally {
    rmSync(join(dir, '.git', 'index.lock'), { force: true });
    rmSync(join(dir, 'mod.js'), { force: true });
    sgit('checkout', '--', 'mod.js');
  }
  assert.equal(readFileSync(join(dir, 'mod.js'), 'utf8'), 'export const v = 1;\n');
});

const python = ['python3', 'python'].find((p) => spawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0);
test('Python: a mutant of the same size, in the same second, runs instead of a cached original', { skip: python ? false : 'no python3 or python on PATH' }, () => {
  const py = tempDir('mutate-py-');
  const pgit = (...args) => execFileSync('git', ['-C', py, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', py]);
  pgit('config', 'user.email', 'test@example.com');
  pgit('config', 'user.name', 'test');
  pgit('config', 'core.autocrlf', 'false');
  const MOD = 'def ok():\n    return 1 < 2\n';
  writeFileSync(join(py, 'mod.py'), MOD);
  // A fixed time in the future for every run: the original and the mutant then share a time and a size, which is what
  // a cached .pyc is checked against.
  writeFileSync(join(py, 'check.py'), 'import os, sys\nos.utime("mod.py", (4102444800, 4102444800))\nimport mod\nsys.exit(0 if mod.ok() else 1)\n');
  pgit('add', '.');
  pgit('commit', '-q', '-m', 'init');
  const env = { ...process.env };
  delete env.PYTHONDONTWRITEBYTECODE; delete env.PYTHONPYCACHEPREFIX;
  const r = harness(['--sed', 's/1 < 2/1 > 2/', 'mod.py', python, 'check.py'], '', { env, cwd: py });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /RESULT: CAUGHT/);
  assert.equal(readFileSync(join(py, 'mod.py'), 'utf8'), MOD);
  // No .gitignore: a __pycache__ folder written in the repository would show here.
  assert.equal(pgit('status', '--porcelain'), '');
});
