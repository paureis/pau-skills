// which-skill's usage-report.mjs reads the skill-usage log and prints the starts per skill (total, by the agent,
// typed), the skills never started in the window, the folders it read, and how to switch the hook on when the log is
// missing. It must work with only the skill uploaded, so it imports node: modules only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { repo, tempDir } from './helpers.mjs';

const REPORT = repo('skills', 'session-discipline', 'which-skill', 'usage-report.mjs');
const HOOK = repo('hooks', 'session-discipline', 'skill-usage.mjs');
const DAY = 86_400_000;

function setup() {
  const home = tempDir(); // PAU_SKILLS_HOME
  const realHome = tempDir(); // HOME and USERPROFILE
  const project = tempDir();
  return { home, realHome, project, log: join(home, '.claude', 'pau-skills', 'skill-usage.tsv') };
}
const envOf = (ctx) => ({ ...process.env, PAU_SKILLS_HOME: ctx.home, HOME: ctx.realHome, USERPROFILE: ctx.realHome, CLAUDE_PROJECT_DIR: ctx.project, PAU_SKILLS_DISABLE: '' });

function report(ctx, args = ['--project', ctx.project], { cwd } = {}) {
  const r = spawnSync(process.execPath, [REPORT, ...args], { encoding: 'utf8', env: envOf(ctx), cwd, timeout: 10000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
function writeLog(ctx, rows) {
  mkdirSync(join(ctx.home, '.claude', 'pau-skills'), { recursive: true });
  writeFileSync(ctx.log, rows.map((r) => (Array.isArray(r) ? r.join('\t') : r) + '\n').join(''));
}
function skill(dir, name) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, 'SKILL.md'), `---\nname: ${name}\n---\n`);
}

/** The table rows as { name: [total, agent, typed] }, in printed order. */
function rows(out) {
  const found = [];
  for (const m of out.matchAll(/^(\S+) +(\d+) +(\d+) +(\d+)$/gm)) found.push([m[1], [Number(m[2]), Number(m[3]), Number(m[4])]]);
  return found;
}
/** The "- name" items under a heading that starts with the given text, up to the next blank line. */
function listUnder(out, heading) {
  const lines = out.split('\n');
  const i = lines.findIndex((l) => l.startsWith(heading));
  assert.ok(i >= 0, `no heading "${heading}" in:\n${out}`);
  const items = [];
  for (const l of lines.slice(i + 1)) {
    if (!l.startsWith('- ')) break;
    items.push(l.slice(2));
  }
  return items;
}

const sample = () => [
  [ago(1), 'handoff', 'typed'],
  [ago(2), 'pau-skills:tdd', 'agent'],
  [ago(3), 'tdd', 'agent'],
  [ago(4), 'verification:tdd', 'typed'],
  [ago(40), 'grill-me', 'agent'],
];

test('counts per bare name, by the agent and typed, most first, inside the window', () => {
  const ctx = setup();
  writeLog(ctx, sample());
  const r = report(ctx);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(rows(r.out), [['tdd', [3, 2, 1]], ['handoff', [1, 0, 1]]]);
  assert.match(r.out, /last 30 days/);
  assert.match(r.out, /1 older than 30 days, 0 malformed/);
});

test('never started: the skills in the three folders that did not start, and the folders read and missing', () => {
  const ctx = setup();
  const homeSkills = join(ctx.home, '.claude', 'skills');
  skill(homeSkills, 'tdd');
  skill(homeSkills, 'grill-me');
  skill(join(homeSkills, 'synced', 'acct-1'), 'synced-only');
  skill(join(homeSkills, 'synced', 'acct-1'), 'handoff');
  mkdirSync(join(homeSkills, 'not-a-skill'), { recursive: true });
  const outside = tempDir();
  skill(outside, 'linked-real');
  if (process.platform !== 'win32') symlinkSync(join(outside, 'linked-real'), join(homeSkills, 'linked'));
  writeLog(ctx, sample());
  const r = report(ctx);
  assert.equal(r.code, 0, r.err);
  const expected = process.platform === 'win32' ? ['grill-me', 'synced-only'] : ['grill-me', 'linked', 'synced-only'];
  assert.deepEqual(listUnder(r.out, 'Never started in the last 30 days'), expected);
  assert.deepEqual(listUnder(r.out, 'Skill folders read'), [homeSkills, join(homeSkills, 'synced')]);
  assert.deepEqual(listUnder(r.out, 'Skill folders missing'), [join(ctx.project, '.claude', 'skills')]);
  assert.match(r.out, /a skill that exists only inside a plugin is not in these folders, so it cannot be listed as never started/i);
});

test('the project defaults to the working folder', () => {
  const ctx = setup();
  const projectSkills = join(realpathSync(ctx.project), '.claude', 'skills');
  skill(projectSkills, 'deploy-notes');
  writeLog(ctx, sample());
  const r = report(ctx, [], { cwd: ctx.project });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(listUnder(r.out, 'Never started'), ['deploy-notes']);
  assert.deepEqual(listUnder(r.out, 'Skill folders read'), [projectSkills]);
});

test('--days 60 counts the 40-day line', () => {
  const ctx = setup();
  writeLog(ctx, sample());
  const r = report(ctx, ['--days', '60', '--project', ctx.project]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(rows(r.out), [['tdd', [3, 2, 1]], ['grill-me', [1, 1, 0]], ['handoff', [1, 0, 1]]]);
  assert.match(r.out, /last 60 days/);
  assert.match(r.out, /0 older than 60 days, 0 malformed/);
});

test('malformed lines are skipped and counted apart from old lines', () => {
  const ctx = setup();
  writeLog(ctx, [
    ...sample(),
    'just one field',
    [ago(1), 'tdd'],
    [ago(1), 'tdd', 'agent', 'extra'],
    ['yesterday-ish', 'tdd', 'agent'],
    [ago(1), '', 'agent'],
    [ago(1), 'tdd', 'manual'],
    '',
  ]);
  const r = report(ctx);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(rows(r.out), [['tdd', [3, 2, 1]], ['handoff', [1, 0, 1]]]);
  assert.match(r.out, /1 older than 30 days, 6 malformed/);
});

test('names such as constructor and __proto__ are counted like any other', () => {
  const ctx = setup();
  writeLog(ctx, [[ago(1), 'constructor', 'agent'], [ago(1), 'x:__proto__', 'typed'], [ago(2), 'tdd', 'agent'], [ago(3), 'tdd', 'agent']]);
  const r = report(ctx);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(rows(r.out), [['tdd', [2, 2, 0]], ['__proto__', [1, 0, 1]], ['constructor', [1, 1, 0]]]);
  assert.doesNotMatch(r.out, /NaN|Object|undefined/);
});

test('a missing log says how to get the hook and how to check it is on, and exits 0', () => {
  const ctx = setup();
  const r = report(ctx);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes(ctx.log), 'names the log path');
  assert.match(r.out, /does not exist yet/);
  assert.match(r.out, /skill-usage hook writes it/);
  assert.ok(r.out.includes('claude plugin install pau-skills-hooks@pau-skills'));
  assert.match(r.out, /session-discipline plugin/);
  assert.ok(r.out.includes('"hooks": { "skill-usage": false }'));
  assert.ok(r.out.includes('~/.claude/pau-skills.json'));
  assert.ok(r.out.includes('.claude/pau-skills.json'));
  assert.ok(r.out.includes('PAU_SKILLS_DISABLE'));
});

test('bad usage exits 2; --days 1 and --days 3650 are accepted', () => {
  const ctx = setup();
  writeLog(ctx, sample());
  for (const args of [['--days', '0'], ['--days', '3651'], ['--days', '1.5'], ['--days', 'x'], ['--days'], ['--project'], ['--nope'], ['extra']]) {
    const r = report(ctx, args);
    assert.equal(r.code, 2, `${args.join(' ')} gave ${r.code}`);
    assert.equal(r.out, '');
    assert.match(r.err, /usage/i);
  }
  for (const days of ['1', '3650']) assert.equal(report(ctx, ['--days', days, '--project', ctx.project]).code, 0, days);
});

test('end to end: the real hook writes the log and the report reads it', () => {
  const ctx = setup();
  skill(join(ctx.project, '.claude', 'skills'), 'deploy-notes');
  const run = (input) => {
    const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8', env: envOf(ctx), timeout: 10000 });
    assert.equal(r.status, 0);
    assert.equal(r.stdout + r.stderr, '');
  };
  run({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'pau-skills:tdd' }, cwd: ctx.project });
  run({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'deploy-notes' }, cwd: ctx.project });
  run({ hook_event_name: 'UserPromptSubmit', prompt: '/deploy-notes v2', cwd: ctx.project });
  assert.deepEqual(readdirSync(ctx.realHome), []);
  const r = report(ctx);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(rows(r.out), [['deploy-notes', [2, 1, 1]], ['tdd', [1, 1, 0]]]);
});

test('the script imports node: modules only', () => {
  const text = readFileSync(REPORT, 'utf8');
  const specs = [...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g)].map((m) => m[1] || m[2] || m[3]);
  assert.ok(specs.length >= 2, 'found the imports');
  for (const s of specs) assert.match(s, /^node:/, s);
  assert.doesNotMatch(text, /\brequire\s*\(|\bimport\s*\(/);
});
