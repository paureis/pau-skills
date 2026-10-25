// The output folder of the project-setup eval runner: with no --out, a run writes into a fresh folder under the
// system temp folder, made when the run starts (not when the options are parsed or the file is imported), and prints
// its path first. An output folder inside the repository is refused before any model call, because Claude Code loads
// the CLAUDE.md of every parent folder. run.mjs starts real `claude -p` runs only when it is the entry point; PATH is
// emptied before the import and stays empty for this whole file, so that, if a guard ever breaks, no `claude` can
// start. TMPDIR points at a fresh empty folder before the import, so "makes nothing" is checked in a folder no other
// test file writes to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, removeAtExit, tempDir } from './helpers.mjs';

const EMPTY_PATH = tempDir();
process.env.PATH = EMPTY_PATH;
const TMP = tempDir();
process.env.TMPDIR = TMP;
const { args } = await import('../evals/project-setup/run.mjs');
const { insideRepo, checkOut, makeOut, parentClaudeMd } = await import('../evals/project-setup/out-folder.mjs');

const RUN = join(ROOT, 'evals', 'project-setup', 'run.mjs');
const RESULTS = join('evals', 'project-setup', 'results');

/** True when dir is outside the repository, by real paths. */
function outsideRoot(dir) {
  const rel = relative(realpathSync(ROOT), realpathSync(dir));
  return rel.startsWith('..') || isAbsolute(rel);
}

/** Run run.mjs with an empty PATH; returns the spawnSync result. */
function run(argv, { cwd = tempDir(), env = {} } = {}) {
  return spawnSync(process.execPath, [RUN, ...argv], { cwd, encoding: 'utf8', env: { ...process.env, PATH: tempDir(), ...env } });
}

test('A1: importing run.mjs and parsing the options make no folder, and args() sets no default --out', () => {
  // The first test of the file: no tempDir() has run since TMPDIR was set, so its folder must still be empty.
  assert.deepEqual(readdirSync(TMP), [], 'importing run.mjs made nothing in the temp folder');
  const o = args([]);
  assert.equal(o.out, undefined);
  assert.equal(args(['--out', 'x']).out, 'x');
  assert.deepEqual(readdirSync(TMP), [], 'args() made nothing in the temp folder');
});

test('args() refuses an option that needs a value and has none', () => {
  for (const opt of ['--out', '--scenario', '--max-turns', '--model', '--persona-model']) {
    const needs = (e) => e.message === `${opt} needs a value`;
    assert.throws(() => args([opt]), needs, `${opt} as the last argument`);
    assert.throws(() => args([opt, '--no-judge']), needs, `${opt} followed by an option`);
  }
  assert.equal(args(['--scenario', 'a', '--out', 'b']).scenario, 'a');
});

test('A2: makeOut({}) makes a fresh, empty folder under the system temp folder for each call', () => {
  const a = removeAtExit(makeOut({}));
  const b = removeAtExit(makeOut({}));
  assert.notEqual(a, b, 'two calls give two folders');
  for (const dir of [a, b]) {
    assert.ok(isAbsolute(dir), `${dir} is absolute`);
    assert.ok(existsSync(dir) && statSync(dir).isDirectory(), `${dir} is a folder`);
    assert.deepEqual(readdirSync(dir), [], `${dir} is empty`);
    assert.equal(realpathSync(dirname(dir)), realpathSync(tmpdir()), `${dir} is in the system temp folder`);
    assert.ok(outsideRoot(dir), `${dir} is outside the repository`);
  }
});

test('makeOut with --out returns that absolute path and makes the folder when it is missing', () => {
  const want = join(tempDir(), 'a', 'b');
  assert.equal(makeOut({ out: want }), want);
  assert.ok(statSync(want).isDirectory(), `${want} is now a folder`);
  assert.equal(makeOut({ out: want }), want, 'an existing folder is kept');
});

test('A3: insideRepo resolves links, also through a missing tail, and compares whole path parts', () => {
  const base = tempDir();
  const root = join(base, 'root');
  mkdirSync(join(root, 'sub'), { recursive: true });
  mkdirSync(join(root, '..x'));
  mkdirSync(join(base, 'outside'));
  mkdirSync(join(base, 'root-other'));
  const into = join(base, 'into');
  symlinkSync(join(root, 'sub'), into);
  const out = join(root, 'out');
  symlinkSync(join(base, 'outside'), out);
  const rootLink = join(base, 'root-link');
  symlinkSync(root, rootLink);

  const inside = [
    ['the root itself', root],
    ['an existing subfolder', join(root, 'sub')],
    ['a missing subfolder two levels deep', join(root, 'new', 'deeper')],
    ['a subfolder named ..x', join(root, '..x')],
    ['a link outside the root that points into it, with a missing tail', join(into, 'missing', 'tail')],
  ];
  for (const [what, dir] of inside) assert.equal(insideRepo(dir, root), true, what);
  assert.equal(insideRepo(join(root, 'sub'), rootLink), true, 'the root as a link and dir by its real path');
  assert.equal(insideRepo(join(rootLink, 'sub'), root), true, 'the root by its real path and dir through a link');

  const outside = [
    ['a folder outside', join(base, 'outside')],
    ['a sibling named root-other', join(base, 'root-other')],
    ['the root\'s parent', base],
    ['a link inside the root that points outside', join(out, 'x')],
  ];
  for (const [what, dir] of outside) assert.equal(insideRepo(dir, root), false, what);
});

test('A3: insideRepo resolves a relative dir against the current folder', () => {
  assert.equal(insideRepo(join('a', 'b'), process.cwd()), true);
  assert.equal(insideRepo('.', process.cwd()), true);
  assert.equal(insideRepo('..', process.cwd()), false);
});

test('A4: checkOut refuses an --out or a temp folder inside the repository, and says why', () => {
  const under = join(ROOT, RESULTS, `missing-${randomUUID()}`);
  assert.throws(() => checkOut({ out: under }, ROOT), (e) => /inside the repository/.test(e.message) && /CLAUDE\.md/.test(e.message) && e.message.includes(under));
  assert.doesNotThrow(() => checkOut({ out: tempDir() }, ROOT));
  assert.doesNotThrow(() => checkOut({}, ROOT));
  const saved = process.env.TMPDIR;
  try {
    const inside = join(ROOT, RESULTS, `missing-${randomUUID()}`);
    process.env.TMPDIR = inside;
    assert.throws(() => checkOut({}, ROOT), (e) => /inside the repository/.test(e.message) && /CLAUDE\.md/.test(e.message) && /TMPDIR/.test(e.message) && e.message.includes(inside));
    assert.doesNotThrow(() => checkOut({ out: join(saved, 'given') }, ROOT), 'an --out outside is accepted while TMPDIR is inside');
  } finally {
    process.env.TMPDIR = saved;
  }
  assert.equal(tmpdir(), TMP, 'TMPDIR is restored');
});

/**
 * Folders outside the repository for the CLAUDE.md walk: a fake root with no CLAUDE.md, a folder P holding `file`
 * (with a subfolder and a link inside it that points to a clean folder), and a clean sibling of P.
 */
function parentFolders(file) {
  const base = tempDir();
  const root = join(base, 'root');
  const p = join(base, 'p');
  const clean = join(base, 'clean');
  for (const d of [root, join(p, 'sub'), dirname(join(p, file)), clean]) mkdirSync(d, { recursive: true });
  writeFileSync(join(p, file), 'memory\n');
  symlinkSync(clean, join(p, 'out'));
  const toP = join(base, 'to-p');
  symlinkSync(p, toP);
  const toSub = join(base, 'to-sub');
  symlinkSync(join(p, 'sub'), toSub);
  return { base, root, p, found: join(p, file), clean, toP, toSub };
}

for (const file of ['CLAUDE.md', 'CLAUDE.local.md', join('.claude', 'CLAUDE.md')]) {
  test(`checkOut refuses an --out with ${file} in a parent folder, also through links, and names the file`, () => {
    const f = parentFolders(file);
    const cases = [
      ['a missing folder two levels under P', join(f.p, 'new', 'deeper')],
      ['the same through a link that points at P', join(f.toP, 'new', 'deeper')],
      ['through a link outside P that points into it', join(f.toSub, 'new', 'deeper')],
      ['through a link inside P that points outside it', join(f.p, 'out', 'new')],
    ];
    for (const [what, out] of cases) {
      const found = parentClaudeMd(out);
      assert.ok(found, `${what}: a file is found`);
      assert.equal(realpathSync(found), realpathSync(f.found), `${what}: ${found}`);
      assert.throws(() => checkOut({ out }, f.root), (e) => e.message.includes(found) && /CLAUDE\.md/.test(e.message), what);
    }
    const sibling = join(f.clean, 'new', 'deeper');
    assert.equal(parentClaudeMd(sibling), null);
    assert.doesNotThrow(() => checkOut({ out: sibling }, f.root), 'a sibling of P with no CLAUDE.md above it');
    const saved = process.env.TMPDIR;
    try {
      process.env.TMPDIR = join(f.p, 'sub');
      assert.throws(() => checkOut({}, f.root), (e) => e.message.includes(parentClaudeMd(join(f.p, 'sub'))) && /CLAUDE\.md/.test(e.message) && /TMPDIR/.test(e.message));
    } finally {
      process.env.TMPDIR = saved;
    }
  });
}

test('A5: the entry point refuses an --out inside the repository before any model call, also through a link', () => {
  const link = join(tempDir(), 'repo');
  symlinkSync(ROOT, link);
  for (const base of [ROOT, link]) {
    const name = `refused-${randomUUID()}`;
    const real = removeAtExit(join(ROOT, RESULTS, name));
    const r = run(['--out', join(base, RESULTS, name), '--scenario', 'hobbyist-empty-folder']);
    assert.notEqual(r.status, 0, `${base}: exit ${r.status}, ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /inside the repository/, `${base}: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /claude exited/, `${base}: ${r.stderr}`);
    assert.equal(existsSync(real), false, `${base}: the out folder was made`);
  }
});

test('the entry point refuses a relative --out inside the repository, from the root', () => {
  const rel = join(RESULTS, `refused-${randomUUID()}`);
  const real = removeAtExit(join(ROOT, rel));
  const r = run(['--out', rel, '--scenario', 'hobbyist-empty-folder'], { cwd: ROOT });
  assert.notEqual(r.status, 0, `exit ${r.status}, ${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /inside the repository/, r.stderr);
  assert.doesNotMatch(r.stderr, /claude exited/, r.stderr);
  assert.equal(existsSync(real), false, 'the out folder was made');
});

test('A6: with --out outside the repository the first line is that absolute path, and the real claude call is the default', () => {
  const out = join(tempDir(), 'given');
  const r = run(['--out', out, '--scenario', 'hobbyist-empty-folder']);
  assert.equal(r.stdout.split('\n')[0], out, `stdout: ${r.stdout}`);
  assert.notEqual(r.status, 0, `exit ${r.status}, ${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /claude exited/, r.stderr);
});

test('a relative --out resolves against the current folder, and the first line is absolute', () => {
  const cwd = tempDir();
  const r = run(['--out', join('rel', 'deeper'), '--scenario', 'hobbyist-empty-folder'], { cwd });
  const first = r.stdout.split('\n')[0];
  assert.ok(isAbsolute(first), `the first line is absolute: ${r.stdout}`);
  assert.equal(realpathSync(first), realpathSync(join(cwd, 'rel', 'deeper')));
  assert.match(r.stderr, /claude exited/, r.stderr);
});

test('A7: an unknown scenario fails before the output folder is made', () => {
  const tmp = tempDir();
  const r = run(['--scenario', 'no-such-scenario'], { env: { TMPDIR: tmp } });
  assert.notEqual(r.status, 0, `exit ${r.status}, ${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /no scenario named/, r.stderr);
  assert.deepEqual(readdirSync(tmp), [], 'the temp folder is still empty');
});
