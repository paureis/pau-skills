// scripts/pack-skills.mjs --since: which skills are new, changed or removed between a git ref and HEAD. The setup is
// in tests/pack-skills.helpers.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE, git, makeRepo, commitAll, writeSkill, pack } from './pack-skills.helpers.mjs';

describe('--since', () => {
  // Base: alpha, beta, gamma, delta and zeta in demo. Then: alpha changes, epsilon is added, gamma is deleted, delta
  // moves to the other plugin, zeta loses its SKILL.md but keeps a file, a folder junk with no SKILL.md appears, and
  // the plugin README changes.
  function history() {
    const dir = makeRepo();
    writeSkill(dir, 'demo', 'gamma', 'name: gamma\ndescription: Deleted later.');
    writeSkill(dir, 'demo', 'zeta', 'name: zeta\ndescription: Loses its SKILL.md later.');
    writeFileSync(join(dir, 'skills', 'demo', 'zeta', 'notes.md'), '# Notes\n');
    writeSkill(dir, 'demo', 'delta', 'name: delta\ndescription: Moved to another plugin later.');
    commitAll(dir, 'base');
    const base = git(dir, 'rev-parse', 'HEAD');
    writeFileSync(join(dir, 'skills', 'demo', 'alpha', 'ref', 'deep', 'notes.md'), '# Notes\n\nChanged.\n');
    writeSkill(dir, 'other', 'epsilon', 'name: epsilon\ndescription: Added after the base.');
    rmSync(join(dir, 'skills', 'demo', 'gamma'), { recursive: true });
    mkdirSync(join(dir, 'skills', 'other'), { recursive: true });
    cpSync(join(dir, 'skills', 'demo', 'delta'), join(dir, 'skills', 'other', 'delta'), { recursive: true });
    rmSync(join(dir, 'skills', 'demo', 'delta'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'demo', 'README.md'), '# Demo plugin\n\nChanged.\n');
    rmSync(join(dir, 'skills', 'demo', 'zeta', 'SKILL.md'));
    mkdirSync(join(dir, 'skills', 'demo', 'junk'));
    writeFileSync(join(dir, 'skills', 'demo', 'junk', 'notes.md'), '# Notes\n');
    commitAll(dir, 'later');
    return { dir, base };
  }

  test('packs the new and changed skills, says which is which, and lists the removed one', () => {
    const { dir, base } = history();
    const r = pack(dir, ['--since', base]);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.zips, ['alpha.zip', 'delta.zip', 'epsilon.zip']);
    assert.match(r.stdout, /alpha\.zip\s+changed\b/);
    assert.match(r.stdout, /delta\.zip\s+changed\b/, 'a skill moved between plugins keeps its name, so it is changed');
    assert.match(r.stdout, /epsilon\.zip\s+new\b/);
    assert.match(r.stdout, /removed\s+gamma\b/);
    assert.doesNotMatch(r.stdout, /beta|README/);
    assert.doesNotMatch(r.stderr, /WARNING/, 'no warning: the ref is an ancestor, HEAD is main and the tree is clean');
  });

  test('a folder that lost its SKILL.md is removed, and a folder that never had one is not a skill', () => {
    const { dir, base } = history();
    const r = pack(dir, ['--since', base]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /removed\s+zeta\b/);
    assert.doesNotMatch(r.stdout + r.stderr, /junk/);
  });

  test('a removed and a new skill in one run get a hint that they can be one renamed skill', () => {
    const { dir, base } = history();
    assert.match(pack(dir, ['--since', base]).stdout, /renamed/);
    const only = makeRepo();
    writeFileSync(join(only, 'skills', 'demo', 'alpha', 'SKILL.md'), readFileSync(join(FIXTURE, 'skills', 'demo', 'alpha', 'SKILL.md'), 'utf8') + 'More.\n');
    commitAll(only);
    const r = pack(only, ['--since', 'HEAD~1']);
    assert.match(r.stdout, /alpha\.zip\s+changed\b/);
    assert.doesNotMatch(r.stdout, /renamed/, 'no hint with nothing removed');
  });

  test('a ref that is not an ancestor of HEAD gets a loud warning, and the run still packs', () => {
    const dir = makeRepo();
    git(dir, 'checkout', '-q', '-b', 'side');
    writeSkill(dir, 'demo', 'sideonly', 'name: sideonly\ndescription: Only on the side branch.');
    commitAll(dir, 'side');
    git(dir, 'checkout', '-q', 'main');
    writeFileSync(join(dir, 'skills', 'other', 'beta', 'extra.md'), '# Extra\n');
    commitAll(dir, 'main moves on');
    const r = pack(dir, ['--since', 'side']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /WARNING.*not an ancestor/);
    assert.match(r.stdout, /removed\s+sideonly\b/);
    assert.deepEqual(r.zips, ['beta.zip']);
  });

  test('a ref with no skill change after it prints "nothing to pack" and exits 0', () => {
    const { dir } = history();
    const r = pack(dir, ['--since', 'HEAD']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /nothing to pack/);
    assert.deepEqual(r.zips, []);
  });

  test('a bad ref is an error', () => {
    const r = pack(makeRepo(), ['--since', 'no-such-ref']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /no-such-ref/);
    assert.deepEqual(r.zips, []);
  });
});
