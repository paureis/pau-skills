// The scaffold creates the skill, its ORIGINS stub file in docs/origins/<plugin>/, an index line at the end of the
// plugin's list in docs/ORIGINS.md and a bullet at the end of the plugin's list in docs/REFERENCE.md; it refuses
// duplicates and bad input without changing anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, runNode, tempDir } from './helpers.mjs';

const SCRIPT = join(ROOT, 'scripts', 'new-skill.mjs');

function fixture() {
  const dir = tempDir('new-skill-');
  cpSync(join(ROOT, 'README.md'), join(dir, 'README.md'));
  cpSync(join(ROOT, 'docs'), join(dir, 'docs'), { recursive: true });
  cpSync(join(ROOT, 'skills'), join(dir, 'skills'), { recursive: true });
  return dir;
}
const snapshot = (dir) => ['README.md', 'docs/ORIGINS.md', 'docs/REFERENCE.md'].map((f) => readFileSync(join(dir, f), 'utf8')).join('');
const stubPath = (dir, plugin, skill) => join(dir, 'docs', 'origins', plugin, skill + '.md');

test('creates the skill, the ORIGINS stub file and index line in its group, and the REFERENCE bullet in its section', () => {
  const dir = fixture();
  const readme = readFileSync(join(dir, 'README.md'), 'utf8');
  const r = runNode(SCRIPT, { args: ['guards', 'port-lock', '--root', dir] });
  assert.equal(r.code, 0, r.stderr);

  const skill = readFileSync(join(dir, 'skills', 'guards', 'port-lock', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: port-lock\ndescription: TODO\(new-skill\)/);
  // Every skill loads on its own (docs/ADDING-A-SKILL.md, step 2), so the scaffold never hides one from the model.
  assert.doesNotMatch(skill, /disable-model-invocation/);

  const stub = readFileSync(stubPath(dir, 'guards', 'port-lock'), 'utf8').split('\n');
  assert.equal(stub[0], '# port-lock (TODO(new-skill): Original | Adapted from <upstream link>)');
  assert.equal(stub[2], 'Back to the [origins index](../../ORIGINS.md).');
  assert.ok(stub.some((l) => l.startsWith('**Problem.** TODO(new-skill)')), 'the stub keeps the Problem placeholder');

  const origins = readFileSync(join(dir, 'docs', 'ORIGINS.md'), 'utf8').split('\n');
  const line = '- [port-lock](origins/guards/port-lock.md): TODO(new-skill): Original | Adapted from <upstream link>';
  const at = origins.indexOf(line);
  assert.ok(at > origins.indexOf('## guards') && at < origins.indexOf('## planning'), 'the index line sits in the guards group');
  assert.ok(origins[at - 1].startsWith('- ['), 'after the last entry line of the group');
  assert.deepEqual(origins.slice(at + 1, at + 3), ['', '---'], 'before the "---" that closes the group');

  const lines = readFileSync(join(dir, 'docs', 'REFERENCE.md'), 'utf8').split('\n');
  const i = lines.findIndex((l) => l.startsWith('- **[port-lock](../skills/guards/port-lock/SKILL.md)**'));
  assert.ok(i > lines.indexOf('## guards') && i < lines.indexOf('## planning'), 'the bullet sits in the guards section');
  assert.ok(/^(- \*\*|  \S)/.test(lines[i - 1]) && /^- Hooks?:/.test(lines[i + 1]), 'after the last skill (or its continuation line), before the hooks line');

  assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), readme, 'the README is not changed');
});

test('refuses an existing name in any plugin, an unknown plugin and a bad name, changing nothing', () => {
  const dir = fixture();
  // A skill in another plugin with no ORIGINS section and no REFERENCE bullet, so only the "any plugin" check can
  // refuse a second skill of the same name.
  mkdirSync(join(dir, 'skills', 'verification', 'foo-bar'));
  writeFileSync(join(dir, 'skills', 'verification', 'foo-bar', 'SKILL.md'), '---\nname: foo-bar\ndescription: A fixture skill.\n---\n');
  const before = snapshot(dir);
  for (const args of [['planning', 'handoff'], ['guards', 'tdd'], ['nope', 'x-y'], ['guards', 'Bad_Name'], ['guards', 'claude-thing'], ['guards', 'my-claude-audit'], ['guards', 'anthropic-x'], ['guards']]) {
    const r = runNode(SCRIPT, { args: [...args, '--root', dir] });
    assert.equal(r.code, 2, `should refuse ${args.join(' ')}`);
    if (args.length === 2) assert.equal(existsSync(stubPath(dir, ...args)), false, `no stub for ${args.join(' ')}`);
  }
  const other = runNode(SCRIPT, { args: ['guards', 'foo-bar', '--root', dir] });
  assert.equal(other.code, 2, 'should refuse guards foo-bar');
  assert.match(other.stderr, /already exists in plugin verification/);
  assert.equal(snapshot(dir), before);
  assert.equal(existsSync(join(dir, 'skills', 'guards', 'x-y')), false);
  assert.equal(existsSync(join(dir, 'skills', 'guards', 'foo-bar')), false);
  assert.equal(existsSync(stubPath(dir, 'guards', 'foo-bar')), false);
});

// Each case below leaves one thing in the way and no skill folder, so only that check can refuse.
function refusesPortLock(dir) {
  const before = snapshot(dir);
  const r = runNode(SCRIPT, { args: ['guards', 'port-lock', '--root', dir] });
  assert.equal(r.code, 2, r.stdout);
  assert.equal(snapshot(dir), before);
  assert.equal(existsSync(join(dir, 'skills', 'guards', 'port-lock')), false);
  return r;
}

test('refuses when the ORIGINS stub file already exists, changing nothing', () => {
  const dir = fixture();
  writeFileSync(stubPath(dir, 'guards', 'port-lock'), 'kept');
  refusesPortLock(dir);
  assert.equal(readFileSync(stubPath(dir, 'guards', 'port-lock'), 'utf8'), 'kept');
});

test('refuses when docs/ORIGINS.md already has an index line for the skill, changing nothing', () => {
  const dir = fixture();
  appendFileSync(join(dir, 'docs', 'ORIGINS.md'), '\n- [port-lock](origins/guards/port-lock.md): Original\n');
  refusesPortLock(dir);
  assert.equal(existsSync(stubPath(dir, 'guards', 'port-lock')), false);
});

test('refuses when docs/REFERENCE.md already lists the skill, changing nothing', () => {
  const dir = fixture();
  appendFileSync(join(dir, 'docs', 'REFERENCE.md'), '\n- **[port-lock](../skills/guards/port-lock/SKILL.md)**: Holds a port.\n');
  refusesPortLock(dir);
  assert.equal(existsSync(stubPath(dir, 'guards', 'port-lock')), false);
});

test('refuses when the plugin heading occurs twice in docs/ORIGINS.md, changing nothing', () => {
  const dir = fixture();
  appendFileSync(join(dir, 'docs', 'ORIGINS.md'), '\n## guards\n\n- [x](origins/guards/x.md): Original\n');
  const r = refusesPortLock(dir);
  assert.match(r.stderr, /exactly one "## guards" heading/);
  assert.equal(existsSync(stubPath(dir, 'guards', 'port-lock')), false);
});

test('refuses when the plugin heading occurs twice in docs/REFERENCE.md, changing nothing', () => {
  const dir = fixture();
  appendFileSync(join(dir, 'docs', 'REFERENCE.md'), '\n## guards\n\n- **[x](../skills/guards/x/SKILL.md)**: A fixture bullet.\n');
  const r = refusesPortLock(dir);
  assert.match(r.stderr, /docs\/REFERENCE\.md must have exactly one "## guards" heading/);
  assert.equal(existsSync(stubPath(dir, 'guards', 'port-lock')), false);
});

test('in a group whose list follows an opening paragraph, the index line goes after the last entry', () => {
  const dir = fixture();
  const before = readFileSync(join(dir, 'docs', 'ORIGINS.md'), 'utf8').split('\n');
  const r = runNode(SCRIPT, { args: ['planning', 'foo-plan', '--root', dir] });
  assert.equal(r.code, 0, r.stderr);

  const group = before.indexOf('## planning');
  const close = before.indexOf('---', group);
  const lastEntry = before.slice(0, close).findLastIndex((l) => l.startsWith('- ['));
  assert.ok(before[group + 2] !== '' && !before[group + 2].startsWith('- ['), 'the fixture group opens with a paragraph');
  assert.ok(lastEntry > group + 2, 'the fixture group has entry lines after its paragraph');

  // The whole file is the old one with exactly one line added after the group's last entry: the opening paragraph,
  // the other entries and the closing "---" are untouched.
  const expected = [...before];
  expected.splice(lastEntry + 1, 0, '- [foo-plan](origins/planning/foo-plan.md): TODO(new-skill): Original | Adapted from <upstream link>');
  assert.deepEqual(readFileSync(join(dir, 'docs', 'ORIGINS.md'), 'utf8').split('\n'), expected);
  assert.equal(existsSync(stubPath(dir, 'planning', 'foo-plan')), true);
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
  assert.match(r.stdout, /skills\/guards\/port-lock\/SKILL\.md:3: unfilled scaffold placeholder/);
});
