// The parts of the project-setup eval runner that need no model: where a scenario's fixture comes from, and how it is
// copied into a fresh git repository. run.mjs starts real `claude -p` runs only when it is the entry point; the import
// below empties PATH so that, if that guard ever breaks, no `claude` can start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, tempDir } from './helpers.mjs';

const saved = process.env.PATH;
process.env.PATH = tempDir();
const { fixtureDir, copyFixture } = await import('../evals/project-setup/run.mjs');
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
