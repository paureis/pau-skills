// The mutation harness in repositories that set the file to a past time: the restore puts the committed content back
// or exits 2, local edits git status does not show are kept, and Python's bytecode cache cannot run the original.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, chmodSync, lstatSync, readlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { harness, pastTimeRepo, asRoot, python } from './mutate.helpers.mjs';

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

test('an uncommitted edit that git status does not show is refused and kept', () => {
  // A same-size edit, then a run of the command that sets the past time again: size and time match what the index
  // recorded, so git status is empty. The restore would erase the edit.
  const { dir, env, sgit } = pastTimeRepo('', { content: 'export const v = 1;\nexport const w = 5;\n' });
  const edit = 'export const v = 1;\nexport const w = 7;\n';
  writeFileSync(join(dir, 'mod.js'), edit);
  execFileSync(process.execPath, ['touch.mjs'], { cwd: dir, env });
  assert.equal(sgit('status', '--porcelain'), '', 'the fixture hides the edit from git status');
  const r = harness(['--sed', 's/v = 1/v = 2/', 'mod.js', process.execPath, 'touch.mjs'], '', { env, cwd: dir });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /NOT MUTATED: mod\.js differs from the committed content/);
  assert.doesNotMatch(r.out, /CONTROL|MUTATION APPLIED/);
  assert.equal(readFileSync(join(dir, 'mod.js'), 'utf8'), edit, 'the uncommitted edit is kept');
});

test('a file marked skip-worktree or assume-unchanged is refused and its local edit kept', () => {
  for (const [flag, word] of [['--skip-worktree', /skip-worktree/], ['--assume-unchanged', /assume-unchanged/]]) {
    const { dir, env, sgit } = pastTimeRepo();
    sgit('update-index', flag, 'mod.js');
    const edit = 'export const v = 1; // local edit\n';
    writeFileSync(join(dir, 'mod.js'), edit);
    const r = harness(['--sed', 's/v = 1/v = 2/', 'mod.js', process.execPath, 'touch.mjs'], '', { env, cwd: dir });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, word);
    assert.doesNotMatch(r.out, /CONTROL|MUTATION APPLIED/);
    assert.equal(readFileSync(join(dir, 'mod.js'), 'utf8'), edit, `${flag}: the local edit is kept`);
  }
});

test('a stale .git/index.lock makes an early restore fail without deleting the untouched file', () => {
  const { dir, env } = pastTimeRepo();
  const lock = join(dir, '.git', 'index.lock');
  writeFileSync(lock, '');
  try {
    const nomatch = harness(['--sed', 's/does-not-occur/x/', 'mod.js', process.execPath, 'touch.mjs'], '', { env, cwd: dir });
    assert.equal(nomatch.code, 2, nomatch.out);
    assert.equal(readFileSync(join(dir, 'mod.js'), 'utf8'), 'export const v = 1;\n', 'a sed that changed nothing');
    const patch = 'diff --git a/mod.js b/mod.js\n--- a/mod.js\n+++ b/mod.js\n@@ -1 +1 @@\n-export const q = 1;\n+export const q = 2;\n';
    const bad = harness(['mod.js', process.execPath, 'touch.mjs'], patch, { env, cwd: dir });
    assert.equal(bad.code, 2, bad.out);
    assert.equal(readFileSync(join(dir, 'mod.js'), 'utf8'), 'export const v = 1;\n', 'a patch that did not apply');
  } finally {
    rmSync(lock, { force: true });
  }
});

test('a command that replaces the folder with a symlink cannot make the restore delete a file outside', { skip: process.platform === 'win32' ? 'symlinks need extra rights on Windows' : false }, () => {
  const outside = tempDir('mutate-outside-');
  writeFileSync(join(outside, 'mod.js'), 'keep me\n');
  const { dir, env, sgit } = pastTimeRepo(`if (!ok) { rmSync('sub', { recursive: true }); symlinkSync(${JSON.stringify(outside)}, 'sub'); process.exit(1); }\n`, { file: 'sub/mod.js' });
  const r = harness(['--sed', 's/v = 1/v = 2/', 'sub/mod.js', process.execPath, 'touch.mjs'], '', { env, cwd: dir });
  assert.equal(readFileSync(join(outside, 'mod.js'), 'utf8'), 'keep me\n', 'the file outside the repository is kept');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /RESTORED sub\/mod\.js[\s\S]*RESULT: CAUGHT/);
  assert.ok(lstatSync(join(dir, 'sub')).isDirectory(), 'sub is a real folder again');
  assert.equal(readFileSync(join(dir, 'sub', 'mod.js'), 'utf8'), 'export const v = 1;\n');
  assert.equal(sgit('status', '--porcelain'), '');
});

test('a restore that leaves the mutant in place behind matching stat data exits 2, never RESTORED', { skip: process.platform === 'win32' ? 'no read-only folders on Windows' : asRoot ? 'root can delete in a read-only folder' : false }, () => {
  // The command makes the file's folder read only: the restore cannot delete the mutant, git checkout skips it (size
  // and time match the index), and git diff and git status are both empty. Only the content check sees it.
  const { dir, env } = pastTimeRepo("if (!ok) chmodSync('sub', 0o555);\n", { file: 'sub/mod.js' });
  try {
    const r = harness(['--sed', 's/v = 1/v = 2/', 'sub/mod.js', process.execPath, 'touch.mjs'], '', { env, cwd: dir });
    assert.equal(r.code, 2, r.out);
    assert.doesNotMatch(r.out, /RESTORED|RESULT/);
    assert.match(r.out, /restoring sub\/mod\.js did not work/);
  } finally {
    chmodSync(join(dir, 'sub'), 0o755);
  }
});

test('a tracked symlink mutated by a patch restores as clean', { skip: process.platform === 'win32' ? 'symlinks need extra rights on Windows' : false }, () => {
  const { dir, env, sgit } = pastTimeRepo('', { file: 'real.js' });
  symlinkSync('real.js', join(dir, 'link.js'));
  writeFileSync(join(dir, 'mutant.js'), 'export const v = 2;\n');
  // The patch points the link at the mutant, so the check reads through the link. A patch, not sed: BSD sed on macOS
  // refuses to edit a symlink in place, and GNU sed replaces it with a regular file.
  writeFileSync(join(dir, 'touch.mjs'), "import { readFileSync } from 'node:fs';\nprocess.exit(readFileSync('link.js', 'utf8').includes('v = 1') ? 0 : 1);\n");
  sgit('add', 'link.js', 'mutant.js', 'touch.mjs');
  sgit('commit', '-q', '-m', 'link');
  const patch = 'diff --git a/link.js b/link.js\n--- a/link.js\n+++ b/link.js\n@@ -1 +1 @@\n-real.js\n\\ No newline at end of file\n+mutant.js\n\\ No newline at end of file\n';
  const r = harness(['link.js', process.execPath, 'touch.mjs'], patch, { env, cwd: dir });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /RESTORED link\.js[\s\S]*RESULT: CAUGHT/);
  assert.equal(readlinkSync(join(dir, 'link.js')), 'real.js');
  assert.equal(sgit('status', '--porcelain'), '');
});

test('an absolute path or one with .. is refused before anything runs', () => {
  const { dir, env } = pastTimeRepo('', { file: 'sub/mod.js' });
  for (const file of [join(dir, 'sub', 'mod.js'), 'sub/../sub/mod.js']) {
    const r = harness(['--sed', 's/v = 1/v = 2/', file, process.execPath, 'touch.mjs'], '', { env, cwd: dir });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /relative to the repository root/);
    assert.doesNotMatch(r.out, /CONTROL|MUTATION APPLIED/);
    assert.equal(readFileSync(join(dir, 'sub', 'mod.js'), 'utf8'), 'export const v = 1;\n');
  }
});

test('a command that stages or commits the mutant exits 2 with a recovery from the starting commit', () => {
  for (const git of [['add', 'mod.js'], ['commit', '-q', '-am', 'mutant']]) {
    const { dir, env, sgit } = pastTimeRepo(`if (!ok) execFileSync('git', ${JSON.stringify(git)});\n`);
    const start = sgit('rev-parse', 'HEAD').trim();
    const r = harness(['--sed', 's/v = 1/v = 2/', 'mod.js', process.execPath, 'touch.mjs'], '', { env, cwd: dir });
    assert.equal(r.code, 2, r.out);
    assert.doesNotMatch(r.out, /RESTORED|RESULT/);
    assert.match(r.out, /the command changed what git holds for mod\.js/);
    assert.match(r.out, new RegExp(`git checkout ${start} -- mod\\.js`));
  }
});

test('Python: a mutant of the same size, in the same second, runs instead of a cached original', { skip: python ? false : 'no python3 or python on PATH' }, () => {
  const py = tempDir('mutate-py-');
  const pgit = (...args) => execFileSync('git', ['-C', py, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', py]);
  pgit('config', 'user.email', 'test@example.com');
  pgit('config', 'user.name', 'test');
  pgit('config', 'core.autocrlf', 'false');
  pgit('config', 'commit.gpgsign', 'false');
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
