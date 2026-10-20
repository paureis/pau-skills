// geppetto's check-agents.mjs: reads every agent file in a project's .claude/agents/ and the user's ~/.claude/agents/,
// parses the YAML subset agent files use, and reports what would make Claude Code skip a file or quietly change what
// the agent can do. Each check has a passing and a failing agent. The bundled roster must pass its own audit, and the
// copy installed in this repository's .claude/agents/ must carry the same names, covenant and roster version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, tempDir } from './helpers.mjs';
import {
  parseTools, covenantOf, overlapScore,
  DESCRIPTION_MAX, OVERLAP_THRESHOLD,
} from '../skills/agent-orchestration/geppetto/check-agents.mjs';
import { SCRIPT, COVENANT, put, agent, check, found, git } from './geppetto.helpers.mjs';

test('a clean agent has no findings', () => {
  const r = check({ 'tester.md': agent() });
  assert.deepEqual(r.findings, []);
  assert.equal(r.agents.length, 1);
});

test('a .md file with no frontmatter, or with frontmatter but no name, is documentation, not an agent', () => {
  const r = check({ 'tester.md': agent(), 'README.md': '# Notes about these agents\n', 'notes.md': '---\ntitle: Notes\n---\n# Notes\n' });
  assert.deepEqual(r.findings, []);
  assert.equal(r.agents.length, 1);
  assert.equal(r.docs.length, 2);
});

test('description: required on a file with a name', () => {
  assert.equal(found(check({ 'a.md': agent({ description: undefined }) }), 'description', 'error').length, 1);
  assert.equal(found(check({ 'a.md': agent({ description: '""' }) }), 'description', 'error').length, 1);
  assert.deepEqual(found(check({ 'a.md': agent() }), 'description'), []);
});

test('name rules: no colon, no leading dash, at most 256 characters', () => {
  for (const bad of ['"my:agent"', '-agent', 'a'.repeat(257)]) {
    assert.equal(found(check({ 'a.md': agent({ name: bad }) }), 'name', 'error').length, 1, bad);
  }
  assert.deepEqual(found(check({ 'a.md': agent({ name: 'a'.repeat(256) }) }), 'name'), []);
  assert.deepEqual(found(check({ 'a.md': agent({ name: 'reviewer-v2' }) }), 'name'), []);
});

test('duplicate: two files with one name in one scope is an error, subfolders included', () => {
  const r = check({ 'a.md': agent(), 'review/b.md': agent() });
  assert.equal(found(r, 'duplicate', 'error').length, 1);
  assert.deepEqual(found(check({ 'a.md': agent(), 'review/b.md': agent({ name: 'other', description: 'Something unrelated: counts sheep in a field at night.' }) }), 'duplicate'), []);
});

test('shadowed: one name in the project and the user scope is a warning that says the project wins', () => {
  const r = check({ 'a.md': agent() }, { user: { 'a.md': agent() } });
  const w = found(r, 'shadowed', 'warning');
  assert.equal(w.length, 1);
  assert.match(w[0].message, /project's file wins over the user's/);
  assert.deepEqual(found(check({ 'a.md': agent() }, { user: { 'b.md': agent({ name: 'other', description: 'Something unrelated: counts sheep in a field at night.' }) } }), 'shadowed'), []);
});

test('glob-grep: Glob or Grep listed with Bash is a warning (they vanish); without Bash they are fine', () => {
  assert.equal(found(check({ 'a.md': agent({ tools: 'Read, Bash, Grep' }) }), 'glob-grep', 'warning').length, 1);
  assert.equal(found(check({ 'a.md': agent({ tools: '[Read, Bash, Glob]' }) }), 'glob-grep', 'warning').length, 1);
  assert.deepEqual(found(check({ 'a.md': agent({ tools: 'Read, Grep, Glob' }) }), 'glob-grep'), []);
  assert.deepEqual(found(check({ 'a.md': agent({ tools: 'Read, Bash' }) }), 'glob-grep'), []);
});

test('field: an unknown frontmatter field is an error (Claude Code ignores it silently)', () => {
  const r = check({ 'a.md': agent({ disallowedtools: 'Write' }) });
  assert.equal(found(r, 'field', 'error').length, 1);
  assert.match(found(r, 'field')[0].message, /disallowedtools/);
  const all = agent({
    tools: 'Read, Edit', disallowedTools: 'Write', model: 'inherit', permissionMode: 'default', maxTurns: 5,
    autoCompactWindow: 200000, skills: '[]', mcpServers: '[]', memory: 'project', background: 'false', omitClaudeMd: 'true',
    effort: 'high', isolation: 'worktree', color: 'blue', initialPrompt: 'hi', experimental: '{ cacheTtl: 1h }',
  });
  assert.deepEqual(found(check({ 'a.md': all }, { setup: (p) => { git(p, 'init', '-q'); put(p, '.gitignore', '.claude/worktrees/\n'); } }), 'field'), []);
});

test('value: a bad effort or other enumerated value is an error; an unknown model is a warning', () => {
  for (const [k, v] of [['effort', 'extreme'], ['memory', 'team'], ['isolation', 'container'],
    ['color', 'teal'], ['permissionMode', 'yolo'], ['maxTurns', '-1'], ['background', 'maybe']]) {
    assert.equal(found(check({ 'a.md': agent({ [k]: v }) }), 'value', 'error').length, 1, `${k}: ${v}`);
  }
  for (const [k, v] of [['effort', 'xhigh'], ['effort', 'max'], ['model', 'inherit'], ['model', 'claude-opus-5-5'], ['model', 'fable'],
    ['model', '"opus[1m]"'], ['model', 'best'], ['model', 'opusplan'], ['model', 'claude-opus-4-1@20250805'],
    ['model', 'global.anthropic.claude-sonnet-4-5-20250929-v1:0'], ['model', 'claude-sonnet-4-5[1m]'], ['maxTurns', '30']]) {
    assert.deepEqual(found(check({ 'a.md': agent({ [k]: v }) }), 'value'), [], `${k}: ${v}`);
  }
  assert.deepEqual(found(check({ 'a.md': agent({ model: 'gpt-5' }) }), 'value').map((f) => f.level), ['warning']);
});

test('tool: a name that is not a known tool is a warning; MCP and rule forms are allowed', () => {
  const r = check({ 'a.md': agent({ tools: 'Read, Frobnicate' }) });
  assert.equal(found(r, 'tool', 'warning').length, 1);
  assert.match(found(r, 'tool')[0].message, /Frobnicate/);
  assert.deepEqual(found(check({ 'a.md': agent({ tools: 'Read, Edit, mcp__github__*, Agent(worker, researcher), Bash(git status *), Task' }) }), 'tool'), []);
  assert.deepEqual(parseTools('Read, Agent(worker, researcher), Bash(git log *)'), ['Read', 'Agent(worker, researcher)', 'Bash(git log *)']);
});

test(`description-length: over ${DESCRIPTION_MAX} characters is a warning`, () => {
  assert.equal(found(check({ 'a.md': agent({ description: 'x'.repeat(DESCRIPTION_MAX + 1) }) }), 'description-length', 'warning').length, 1);
  assert.deepEqual(found(check({ 'a.md': agent({ description: 'x'.repeat(DESCRIPTION_MAX) }) }), 'description-length'), []);
});

test('covenant: a missing or changed block is an error; reflowed whitespace is not; an older roster is a warning', () => {
  assert.equal(found(check({ 'a.md': agent({}, { covenant: '' }) }), 'covenant', 'error').length, 1);
  const changed = COVENANT.text.replace('evidence', 'a feeling');
  assert.notEqual(changed, COVENANT.text);
  assert.equal(found(check({ 'a.md': agent({}, { covenant: changed }) }), 'covenant', 'error').length, 1);
  const unclosed = COVENANT.text.split('\n').slice(0, -1).join('\n');
  assert.equal(found(check({ 'a.md': agent({}, { covenant: unclosed }) }), 'covenant', 'error').length, 1);
  const reflowed = COVENANT.text.replace(/\. /g, '.\n');
  assert.notEqual(reflowed, COVENANT.text);
  assert.deepEqual(found(check({ 'a.md': agent({}, { covenant: reflowed }) }), 'covenant'), []);
  const older = COVENANT.text.replace(`roster ${COVENANT.version}`, `roster ${COVENANT.version - 1}`).replace('evidence', 'proof');
  const w = found(check({ 'a.md': agent({}, { covenant: older }) }), 'covenant');
  assert.deepEqual(w.map((f) => f.level), ['warning']);
  assert.match(w[0].message, /Update/);
  assert.equal(covenantOf('no block here').block, null);
  const olderSameWords = COVENANT.text.replace(`roster ${COVENANT.version}`, `roster ${COVENANT.version - 1}`);
  const o = found(check({ 'a.md': agent({}, { covenant: olderSameWords }) }), 'covenant');
  assert.deepEqual(o.map((f) => f.level), ['warning'], 'an older roster with the same laws still needs Update');
  assert.match(o[0].message, /Update/);
  const newer = COVENANT.text.replace(`roster ${COVENANT.version}`, `roster ${COVENANT.version + 1}`);
  assert.deepEqual(found(check({ 'a.md': agent({}, { covenant: newer }) }), 'covenant').map((f) => f.level), ['warning']);
});

test('covenant scope: missing is an error in the project and on roster copies, a warning on other user agents', () => {
  const personal = found(check({}, { user: { 'mine.md': agent({}, { covenant: '' }) } }), 'covenant');
  assert.deepEqual(personal.map((f) => f.level), ['warning']);
  assert.match(personal[0].message, /not made by geppetto/);
  const changed = COVENANT.text.replace('evidence', 'a feeling');
  assert.deepEqual(found(check({}, { user: { 'mine.md': agent({}, { covenant: changed }) } }), 'covenant').map((f) => f.level), ['error'],
    'a user agent with a roster marker is held to the roster');
  const unclosed = COVENANT.text.split('\n').slice(0, -1).join('\n');
  assert.deepEqual(found(check({}, { user: { 'mine.md': agent({}, { covenant: unclosed }) } }), 'covenant').map((f) => f.level), ['error']);
  assert.deepEqual(found(check({ 'a.md': agent({}, { covenant: '' }) }), 'covenant').map((f) => f.level), ['error']);
});

test('memory-read-only: memory on an agent without Write or Edit is an error (memory adds them)', () => {
  assert.equal(found(check({ 'a.md': agent({ tools: 'Read, Grep, Glob, Agent', memory: 'project' }) }), 'memory-read-only', 'error').length, 1);
  assert.equal(found(check({ 'a.md': agent({ disallowedTools: 'Write, Edit', memory: 'user' }) }), 'memory-read-only', 'error').length, 1);
  assert.deepEqual(found(check({ 'a.md': agent({ tools: 'Read, Edit', memory: 'project' }) }), 'memory-read-only'), []);
  assert.deepEqual(found(check({ 'a.md': agent({ memory: 'project' }) }), 'memory-read-only'), []);
  assert.deepEqual(found(check({ 'a.md': agent({ tools: 'Read, Grep' }) }), 'memory-read-only'), []);
});

test('agent-tools: a body that starts or continues agents needs Agent and SendMessage in tools (a warning)', () => {
  const starts = 'Start one builder per slice, then continue the same builder with SendMessage for the fix round.';
  const r = check({ 'a.md': agent({ tools: 'Read, Grep' }, { body: starts }) });
  assert.deepEqual(found(r, 'agent-tools').map((f) => f.level), ['warning', 'warning']);
  assert.deepEqual(found(check({ 'a.md': agent({ tools: 'Read, Agent, SendMessage' }, { body: starts }) }), 'agent-tools'), []);
  assert.deepEqual(found(check({ 'a.md': agent({}, { body: starts }) }), 'agent-tools'), [], 'no tools list: it inherits both');
  const never = 'You never start other agents. Build the slice yourself.';
  assert.deepEqual(found(check({ 'a.md': agent({ tools: 'Read, Bash' }, { body: never }) }), 'agent-tools'), []);
});

test('skill: a skills entry that is not installed in the project or user skill folders is a warning', () => {
  assert.equal(found(check({ 'a.md': agent({ skills: '[nope]' }) }), 'skill', 'warning').length, 1);
  const installed = (p, h) => {
    put(p, '.claude/skills/here/SKILL.md', '---\nname: here\n---\n');
    put(h, 'skills/mine/SKILL.md', '---\nname: mine\n---\n');
    put(h, 'skills/synced/abc_def/synced-one/SKILL.md', '---\nname: synced-one\n---\n');
  };
  assert.deepEqual(found(check({ 'a.md': agent({ skills: '[here, mine, synced-one, org-skills:synced-one]' }) }, { setup: installed }), 'skill'), []);
});

test(`overlap: two descriptions with a word-overlap score of ${OVERLAP_THRESHOLD} or more are a warning`, () => {
  const a = 'Reviews a finished change against its contract and grades each claim with evidence.';
  const b = 'Reviews a finished change against its contract and grades every claim with proof.';
  assert.ok(overlapScore(a, b) >= OVERLAP_THRESHOLD);
  const r = check({ 'a.md': agent({ name: 'one', description: a }), 'b.md': agent({ name: 'two', description: b }) });
  assert.equal(found(r, 'overlap', 'warning').length, 1);
  assert.match(found(r, 'overlap')[0].message, /a\.md/);
  assert.match(found(r, 'overlap')[0].message, /b\.md/);
  const c = 'Lists ignored build output with sizes and deletes only what the user approves.';
  assert.ok(overlapScore(a, c) < OVERLAP_THRESHOLD);
  assert.deepEqual(found(check({ 'a.md': agent({ name: 'one', description: a }), 'b.md': agent({ name: 'two', description: c }) }), 'overlap'), []);
});

test('worktree-ignore: an agent with isolation: worktree needs .claude/worktrees/ git-ignored', () => {
  // The developer's own git config must not decide this test: a global excludes file that ignores .claude/ would
  // make the first case pass. Point git at an empty global config and no system config while the test runs.
  const saved = { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  process.env.GIT_CONFIG_GLOBAL = put(tempDir('geppetto-gitconfig-'), 'gitconfig', '');
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  try {
    const init = (p) => { git(p, 'init', '-q'); git(p, 'config', 'core.excludesFile', ''); };
    const files = { 'a.md': agent({ isolation: 'worktree' }) };
    assert.equal(found(check(files, { setup: init }), 'worktree-ignore', 'error').length, 1);
    const ignored = (p) => { init(p); put(p, '.gitignore', '.claude/worktrees/\n'); };
    assert.deepEqual(found(check(files, { setup: ignored }), 'worktree-ignore'), []);
    assert.deepEqual(found(check({ 'a.md': agent() }, { setup: init }), 'worktree-ignore'), []);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('the CLI walks subfolders, exits 1 on errors and 0 on warnings only, and reads --user', () => {
  const project = tempDir('geppetto-cli-');
  const home = tempDir('geppetto-cli-user-');
  put(project, '.claude/agents/deep/nested/a.md', agent({}, { covenant: '' }));
  const bad = runNode(SCRIPT, { args: ['--project', project, '--user', home] });
  assert.equal(bad.code, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /deep\/nested\/a\.md/);
  assert.match(bad.stdout, /covenant/);
  put(project, '.claude/agents/deep/nested/a.md', agent({ description: 'x'.repeat(DESCRIPTION_MAX + 1) }));
  const warn = runNode(SCRIPT, { args: ['--project', project, '--user', home] });
  assert.equal(warn.code, 0, warn.stdout + warn.stderr);
  assert.match(warn.stdout, /warning/i);
  put(home, 'agents/u.md', agent({ name: 'u' }, { covenant: COVENANT.text.replace('evidence', 'a feeling') }));
  assert.equal(runNode(SCRIPT, { args: ['--project', project, '--user', home] }).code, 1, 'the user scope is read');
  const json = JSON.parse(runNode(SCRIPT, { args: ['--project', project, '--user', home, '--json'] }).stdout);
  assert.ok(json.findings.some((f) => f.scope === 'user' && f.check === 'covenant'));
  assert.equal(runNode(SCRIPT, { args: ['--bogus'] }).code, 2);
});
