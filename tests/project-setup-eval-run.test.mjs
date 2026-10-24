// The parts of the project-setup eval runner that need no model: where a scenario's fixture comes from, how it is
// copied into a fresh git repository, the entry-point guards of run.mjs and grade.mjs (also through a symlink), and
// the default turn limit. run.mjs starts real `claude -p` runs only when it is the entry point; the import below
// empties PATH so that, if that guard ever breaks, no `claude` can start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, tempDir } from './helpers.mjs';

const saved = process.env.PATH;
process.env.PATH = tempDir();
const { fixtureDir, copyFixture, prepareRun, args, DEFAULT_MAX_TURNS } = await import('../evals/project-setup/run.mjs');
process.env.PATH = saved;

const WEB = 'tests/fixtures/launch-readiness/web-app';
const CLI = 'tests/fixtures/launch-readiness/cli-tool';

/** Every file under dir, outside .git, with its content. */
function files(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.name === '.git') continue;
      if (e.isDirectory()) walk(p);
      else out[relative(dir, p).replace(/\\/g, '/')] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

test('fixtureDir takes a fixture name from fixtures/ or a fixturePath inside the repository', () => {
  assert.equal(fixtureDir({ name: 'a', fixturePath: WEB }, ROOT), join(ROOT, WEB), 'a fixturePath resolves under the root');
  assert.equal(fixtureDir({ name: 'a', fixturePath: `${CLI}/` }, ROOT), join(ROOT, CLI));
  assert.equal(fixtureDir({ name: 'a', fixture: 'web-app' }, ROOT), join(ROOT, 'evals', 'project-setup', 'fixtures', 'web-app'));
  assert.equal(fixtureDir({ name: 'a', fixture: null }, ROOT), null);
  assert.equal(fixtureDir({ name: 'a' }, ROOT), null);
  const other = tempDir();
  assert.equal(fixtureDir({ name: 'a', fixturePath: 'x/y' }, other), join(other, 'x', 'y'), 'the root is the one passed in');
});

test('fixtureDir refuses a fixturePath outside the repository, the root itself, and both keys at once', () => {
  assert.throws(() => fixtureDir({ name: 'a', fixturePath: '../outside' }, ROOT), /a: fixturePath \.\.\/outside is not a folder inside the repository/);
  assert.throws(() => fixtureDir({ name: 'a', fixturePath: 'tests/../../outside' }, ROOT), /not a folder inside the repository/);
  assert.throws(() => fixtureDir({ name: 'a', fixturePath: tempDir() }, ROOT), /not a folder inside the repository/);
  assert.throws(() => fixtureDir({ name: 'a', fixturePath: '.' }, ROOT), /not a folder inside the repository/);
  assert.throws(() => fixtureDir({ name: 'a', fixture: 'web-app', fixturePath: WEB }, ROOT), /a: give fixture or fixturePath, not both/);
});

for (const path of [WEB, CLI]) {
  test(`copyFixture copies ${path} into a fresh repository with one commit and leaves the source unchanged`, () => {
    const src = join(ROOT, path);
    const before = files(src);
    const dest = join(tempDir(), 'project');
    copyFixture({ name: 'a', fixturePath: path }, dest);
    assert.deepEqual(files(dest), before);
    const git = (...a) => spawnSync('git', a, { cwd: dest, encoding: 'utf8' });
    assert.equal(git('rev-list', '--count', 'HEAD').stdout.trim(), '1');
    assert.equal(git('status', '--porcelain').stdout, '');
    assert.deepEqual(files(src), before);
    assert.equal(existsSync(join(src, '.git')), false);
  });
}

test('run.mjs imports without running when argv[1] is not a file', () => {
  const code = "await import('./evals/project-setup/run.mjs'); console.log('imported')";
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, 'nosuchfile'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: tempDir() } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'imported');
});

const EVALS = join(ROOT, 'evals', 'project-setup');
const scenarios = JSON.parse(readFileSync(join(EVALS, 'scenarios.json'), 'utf8'));

test('scenarios: unique names, existing personas and fixture folders, and real production rule names', () => {
  const names = scenarios.map((s) => s.name);
  assert.deepEqual([...new Set(names)], names, 'scenario names are unique');
  const rules = readFileSync(join(ROOT, 'skills', 'session-discipline', 'project-setup', 'PRODUCTION-RULES.md'), 'utf8');
  const ruleNames = [...rules.matchAll(/^(\d)\. \*\*([^*]+)\.\*\* When /gm)].map((m) => m[2]);
  assert.equal(ruleNames.length, 5);
  for (const s of scenarios) {
    assert.ok(existsSync(join(EVALS, s.persona)), `${s.name}: no persona file ${s.persona}`);
    const dir = fixtureDir(s, ROOT);
    if (dir) assert.ok(existsSync(dir) && statSync(dir).isDirectory(), `${s.name}: no fixture folder ${dir}`);
    for (const r of s.expect?.productionRules || []) assert.ok(ruleNames.includes(r), `${s.name}: "${r}" is not a rule name in PRODUCTION-RULES.md`);
  }
  for (const n of ['shop-owner', 'python-cli-dev']) assert.ok(names.includes(n), `no scenario ${n}`);
});

test('prepareRun copies the scenario fixture and installs the skill in a sandboxed HOME', () => {
  const out = tempDir();
  const shop = scenarios.find((s) => s.name === 'shop-owner');
  const r = prepareRun(shop, { out });
  assert.equal(r.name, 'shop-owner');
  assert.deepEqual(files(r.project), files(join(ROOT, shop.fixturePath)), 'the project is a copy of the scenario fixture');
  assert.ok(existsSync(join(r.home, '.claude', 'skills', 'project-setup', 'SKILL.md')));
  assert.ok(statSync(r.side).isDirectory());
  const dev = scenarios.find((s) => s.name === 'experienced-dev');
  const b = prepareRun(dev, { out, baseline: true });
  assert.equal(b.name, 'experienced-dev-baseline');
  assert.ok(existsSync(join(b.project, 'AGENTS.md')) && existsSync(join(b.project, '.gitignore')), 'a named fixture, renamed in the copy');
  assert.equal(readFileSync(join(b.home, '.claude', 'CLAUDE.md'), 'utf8'), dev.homeClaudeMd);
  assert.equal(existsSync(join(b.home, '.claude', 'skills')), false, 'no skill for a baseline run');
});

test('the shop owner persona does not hand over what the fixture code does', () => {
  const persona = readFileSync(join(EVALS, 'personas', 'shop-owner.md'), 'utf8');
  assert.doesNotMatch(persona, /price|payment|login|cross-origin|cors|idor|seeded|vulnerab|insecure|fake|gap|database/i);
});

test('copyFixture makes an empty folder and no repository for a scenario without a fixture', () => {
  const dest = join(tempDir(), 'project');
  copyFixture({ name: 'a', fixture: null }, dest);
  assert.ok(statSync(dest).isDirectory());
  assert.deepEqual(readdirSync(dest), []);
});

const GRADE = join(ROOT, 'evals', 'project-setup', 'grade.mjs');

test('grade.mjs is the entry point also through a symlink: with no run folder it prints the usage line and exits 2', () => {
  const link = join(tempDir('grade-link-'), 'grade.mjs');
  symlinkSync(GRADE, link);
  for (const script of [GRADE, link]) {
    const r = spawnSync(process.execPath, [script], { cwd: tempDir(), encoding: 'utf8' });
    assert.equal(r.status, 2, `${script}: exit ${r.status}, ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /^usage: node grade\.mjs <run dir>$/m);
  }
});

const RUN = join(ROOT, 'evals', 'project-setup', 'run.mjs');

test('run.mjs is the entry point also through a symlink: an unknown scenario fails before any claude call', () => {
  const link = join(tempDir('run-link-'), 'run.mjs');
  symlinkSync(RUN, link);
  for (const script of [RUN, link]) {
    const r = spawnSync(process.execPath, [script, '--scenario', 'no-such-scenario'], { cwd: tempDir(), encoding: 'utf8', env: { ...process.env, PATH: tempDir() } });
    assert.notEqual(r.status, 0, `${script}: exit ${r.status}, ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /no scenario named no-such-scenario/, `${script}: ${r.stderr}`);
  }
});

test('grade.mjs imports without running when argv[1] is not a file', () => {
  const code = "await import('./evals/project-setup/grade.mjs'); console.log('imported')";
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, 'nosuchfile'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'imported');
});

test('the default turn limit is 40, and the usage comment and the README say so', () => {
  assert.equal(DEFAULT_MAX_TURNS, 40);
  assert.equal(args([]).maxTurns, 40);
  assert.equal(args(['--max-turns', '12']).maxTurns, 12);
  assert.match(readFileSync(join(ROOT, 'evals', 'project-setup', 'run.mjs'), 'utf8'), /\[--max-turns 40\]/);
  assert.match(readFileSync(join(ROOT, 'evals', 'project-setup', 'README.md'), 'utf8'), /`--max-turns <n>` \(default 40\)/);
});
