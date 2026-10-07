// The scaffold creates the skill, the ORIGINS stub inside the right plugin group and the README bullet at the
// end of the plugin's skill list; it refuses duplicates and bad input without changing anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, runNode, tempDir } from './helpers.mjs';

const SCRIPT = join(ROOT, 'scripts', 'new-skill.mjs');

function fixture() {
  const dir = tempDir('new-skill-');
  cpSync(join(ROOT, 'README.md'), join(dir, 'README.md'));
  mkdirSync(join(dir, 'docs'));
  cpSync(join(ROOT, 'docs', 'ORIGINS.md'), join(dir, 'docs', 'ORIGINS.md'));
  cpSync(join(ROOT, 'plugins'), join(dir, 'plugins'), { recursive: true });
  return dir;
}
const snapshot = (dir) => readFileSync(join(dir, 'README.md'), 'utf8') + readFileSync(join(dir, 'docs', 'ORIGINS.md'), 'utf8');

test('creates the skill, the ORIGINS stub in its group and the README bullet in its section', () => {
  const dir = fixture();
  const r = runNode(SCRIPT, { args: ['guards', 'port-lock', '--root', dir] });
  assert.equal(r.code, 0, r.stderr);

  const skill = readFileSync(join(dir, 'plugins', 'guards', 'skills', 'port-lock', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: port-lock\ndescription: TODO\(new-skill\)/);

  const origins = readFileSync(join(dir, 'docs', 'ORIGINS.md'), 'utf8');
  const stub = origins.indexOf('### port-lock (');
  const guards = origins.indexOf('\n## guards\n');
  const planning = origins.indexOf('\n## planning\n');
  assert.ok(guards < stub && stub < planning, 'the stub sits inside the guards group, before planning');

  const lines = readFileSync(join(dir, 'README.md'), 'utf8').split('\n');
  const i = lines.findIndex((l) => l.startsWith('- **port-lock**'));
  assert.ok(i > lines.indexOf('### guards') && i < lines.indexOf('### planning'), 'the bullet sits in the guards section');
  assert.ok(lines[i - 1].startsWith('- **') && /^- Hooks?:/.test(lines[i + 1]), 'after the last skill, before the hooks line');
});

test('refuses an existing name in any plugin, an unknown plugin and a bad name, changing nothing', () => {
  const dir = fixture();
  const before = snapshot(dir);
  for (const args of [['planning', 'handoff'], ['guards', 'tdd'], ['nope', 'x-y'], ['guards', 'Bad_Name'], ['guards', 'claude-thing'], ['guards']]) {
    const r = runNode(SCRIPT, { args: [...args, '--root', dir] });
    assert.equal(r.code, 2, `should refuse ${args.join(' ')}`);
  }
  assert.equal(snapshot(dir), before);
  assert.equal(existsSync(join(dir, 'plugins', 'guards', 'skills', 'x-y')), false);
});

test('running it twice refuses the second time', () => {
  const dir = fixture();
  assert.equal(runNode(SCRIPT, { args: ['verification', 'flaky-hunt', '--root', dir] }).code, 0);
  const r = runNode(SCRIPT, { args: ['verification', 'flaky-hunt', '--root', dir] });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /already exists/);
});

test('the scrub check fails while a scaffold placeholder is left, and passes on the same tree without it', () => {
  const dir = fixture();
  mkdirSync(join(dir, 'scripts'));
  cpSync(join(ROOT, 'scripts', 'check-scrub.mjs'), join(dir, 'scripts', 'check-scrub.mjs'));
  execFileSync('git', ['init', '-q', dir]);
  const control = runNode(join(dir, 'scripts', 'check-scrub.mjs'));
  assert.equal(control.code, 0, control.stdout);
  assert.equal(runNode(SCRIPT, { args: ['guards', 'port-lock', '--root', dir] }).code, 0);
  const r = runNode(join(dir, 'scripts', 'check-scrub.mjs'));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /plugins\/guards\/skills\/port-lock\/SKILL\.md:3: unfilled scaffold placeholder/);
});
