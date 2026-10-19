// geppetto's check-agents.mjs: reads every agent file in a project's .claude/agents/ and the user's ~/.claude/agents/,
// parses the YAML subset agent files use, and reports what would make Claude Code skip a file or quietly change what
// the agent can do. Each check has a passing and a failing agent. The bundled roster must pass its own audit, and the
// copy installed in this repository's .claude/agents/ must carry the same names, covenant and roster version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, repo, runNode, tempDir } from './helpers.mjs';
import {
  parseFrontmatter, parseTools, readCovenant, covenantOf, overlapScore, audit,
  DESCRIPTION_MAX, OVERLAP_THRESHOLD,
} from '../skills/agent-orchestration/geppetto/check-agents.mjs';

const SKILL = repo('skills', 'agent-orchestration', 'geppetto');
const SCRIPT = join(SKILL, 'check-agents.mjs');
const ROSTER = join(SKILL, 'roster');
const COVENANT = readCovenant(join(SKILL, 'COVENANT.md'));

const put = (root, rel, text) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return p; };

// An agent file: frontmatter lines from `fields` in order, then the body and, unless told not to, the covenant block.
function agent(fields = {}, { body = 'You do one job and report on it.', covenant = COVENANT.text } = {}) {
  const f = { name: 'tester', description: 'Runs one narrow job for these tests and reports what it found.', ...fields };
  const lines = Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => (v === '' ? `${k}:` : `${k}: ${v}`));
  return `---\n${lines.join('\n')}\n---\n\n${body}\n\n${covenant || ''}\n`;
}

// A project with the given agent files under .claude/agents/, checked with an empty user folder.
function check(files, { user = {}, setup } = {}) {
  const project = tempDir('geppetto-project-');
  const home = tempDir('geppetto-user-');
  for (const [rel, text] of Object.entries(files)) put(project, join('.claude', 'agents', rel), text);
  for (const [rel, text] of Object.entries(user)) put(home, join('agents', rel), text);
  if (setup) setup(project, home);
  return audit({ project, user: home });
}
const found = (result, check, level) => result.findings.filter((f) => f.check === check && (!level || f.level === level));
const errors = (result) => result.findings.filter((f) => f.level === 'error');

test('a clean agent has no findings', () => {
  const r = check({ 'tester.md': agent() });
  assert.deepEqual(r.findings, []);
  assert.equal(r.agents.length, 1);
});

test('parse: frontmatter that does not parse is an error; the YAML subset agent files use parses', () => {
  for (const bad of [
    '---\nname: "never closed\ndescription: x\n---\nbody\n',
    '---\nname: x\n  stray: indent\n---\nbody\n',
    '---\nname: x\nname: y\ndescription: z\n---\nbody\n',
    '---\nname: x\ndescription: has: a colon\n---\nbody\n',
    '---\nname: x\ndescription: y\nthis line has no key\n---\nbody\n',
    '---\nname: x\ndescription: y\n',
  ]) {
    assert.equal(found(check({ 'bad.md': bad }), 'parse', 'error').length, 1, bad);
  }
  const ok = parseFrontmatter([
    '---', 'name: "quoted"', "description: >", '  folded over', '  two lines', 'tools:', '  - Read', '  - Bash   # a comment',
    'skills: [tdd, "other"]', 'maxTurns: 12', 'background: false', 'hooks:', '  PreToolUse:', '    - matcher: Bash',
    '---', 'Body.',
  ].join('\n'));
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.data, {
    name: 'quoted', description: 'folded over two lines\n', tools: ['Read', 'Bash'], skills: ['tdd', 'other'],
    maxTurns: 12, background: false, hooks: ok.data.hooks,
  });
  assert.equal(ok.body.trim(), 'Body.');
  assert.equal(parseFrontmatter('No frontmatter here.\n').data, null, 'a file without frontmatter is documentation');
});

test('a .md file with no frontmatter is documentation, not an agent and not an error', () => {
  const r = check({ 'tester.md': agent(), 'README.md': '# Notes about these agents\n' });
  assert.deepEqual(r.findings, []);
  assert.equal(r.agents.length, 1);
  assert.equal(r.docs.length, 1);
});

test('name and description: each is required', () => {
  assert.equal(found(check({ 'a.md': agent({ name: undefined }) }), 'name', 'error').length, 1);
  assert.equal(found(check({ 'a.md': agent({ description: undefined }) }), 'description', 'error').length, 1);
  assert.equal(found(check({ 'a.md': agent({ description: '""' }) }), 'description', 'error').length, 1);
  assert.deepEqual(found(check({ 'a.md': agent() }), 'name'), []);
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
  assert.match(w[0].message, /project/);
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

test('value: a bad effort, model or other enumerated value is an error', () => {
  for (const [k, v] of [['effort', 'extreme'], ['model', 'gpt-5'], ['memory', 'team'], ['isolation', 'container'],
    ['color', 'teal'], ['permissionMode', 'yolo'], ['maxTurns', '-1'], ['background', 'maybe']]) {
    assert.equal(found(check({ 'a.md': agent({ [k]: v }) }), 'value', 'error').length, 1, `${k}: ${v}`);
  }
  for (const [k, v] of [['effort', 'xhigh'], ['effort', 'max'], ['model', 'inherit'], ['model', 'claude-opus-5-5'], ['model', 'fable'], ['maxTurns', '30']]) {
    assert.deepEqual(found(check({ 'a.md': agent({ [k]: v }) }), 'value'), [], `${k}: ${v}`);
  }
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
  const c = 'Lists ignored build output with sizes and deletes only what the user approves.';
  assert.ok(overlapScore(a, c) < OVERLAP_THRESHOLD);
  assert.deepEqual(found(check({ 'a.md': agent({ name: 'one', description: a }), 'b.md': agent({ name: 'two', description: c }) }), 'overlap'), []);
});

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

test('worktree-ignore: an agent with isolation: worktree needs .claude/worktrees/ git-ignored', () => {
  const files = { 'a.md': agent({ isolation: 'worktree' }) };
  assert.equal(found(check(files, { setup: (p) => git(p, 'init', '-q') }), 'worktree-ignore', 'error').length, 1);
  const ignored = (p) => { git(p, 'init', '-q'); put(p, '.gitignore', '.claude/worktrees/\n'); };
  assert.deepEqual(found(check(files, { setup: ignored }), 'worktree-ignore'), []);
  assert.deepEqual(found(check({ 'a.md': agent() }, { setup: (p) => git(p, 'init', '-q') }), 'worktree-ignore'), []);
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
  put(home, 'agents/u.md', agent({ name: 'u' }, { covenant: '' }));
  assert.equal(runNode(SCRIPT, { args: ['--project', project, '--user', home] }).code, 1, 'the user scope is read');
  const json = JSON.parse(runNode(SCRIPT, { args: ['--project', project, '--user', home, '--json'] }).stdout);
  assert.ok(json.findings.some((f) => f.scope === 'user' && f.check === 'covenant'));
  assert.equal(runNode(SCRIPT, { args: ['--bogus'] }).code, 2);
});

// The roster: what the skill installs, and what this repository runs with.
const rosterFiles = () => readdirSync(ROSTER).filter((f) => f.endsWith('.md')).sort();
const front = (file) => parseFrontmatter(readFileSync(file, 'utf8')).data;

test('the bundled roster passes its own audit with no findings', () => {
  const r = audit({ dir: ROSTER, project: tempDir('geppetto-empty-'), user: tempDir('geppetto-empty-user-') });
  assert.deepEqual(r.agents.map((a) => a.data.name).sort(), ['builder', 'eng-lead', 'reviewer', 'sweeper', 'writer']);
  assert.deepEqual(r.findings, []);
});

test('the roster follows the settled design', () => {
  const by = Object.fromEntries(rosterFiles().map((f) => { const d = front(join(ROSTER, f)); return [d.name, d]; }));
  for (const d of Object.values(by)) {
    assert.equal(d.model, 'inherit', d.name);
    assert.equal(d.skills, undefined, `${d.name}: skills are added at install time, only when installed`);
  }
  assert.deepEqual(parseTools(by['eng-lead'].tools), ['Read', 'Grep', 'Glob', 'Agent', 'SendMessage']);
  assert.equal(by['eng-lead'].effort, 'xhigh');
  assert.equal(by.reviewer.effort, 'xhigh');
  assert.equal(by.builder.effort, 'high');
  assert.equal(by.builder.isolation, 'worktree');
  assert.equal(by.writer.memory, 'project');
  for (const n of ['eng-lead', 'builder', 'reviewer', 'sweeper']) assert.equal(by[n].memory, undefined, n);
  for (const n of ['builder', 'reviewer', 'writer', 'sweeper']) {
    const tools = parseTools(by[n].tools);
    assert.ok(!tools.includes('Agent') && !tools.includes('SendMessage'), `${n} starts no agents`);
    assert.ok(!(tools.includes('Bash') && (tools.includes('Glob') || tools.includes('Grep'))), `${n}: Glob and Grep vanish next to Bash`);
  }
  for (const n of ['eng-lead', 'reviewer', 'sweeper']) {
    const tools = parseTools(by[n].tools);
    assert.ok(!tools.includes('Edit') && !tools.includes('Write'), `${n} edits no files`);
  }
});

test('agent bodies do not use ${CLAUDE_SKILL_DIR}, which is not set for agents', () => {
  for (const f of rosterFiles()) assert.doesNotMatch(readFileSync(join(ROSTER, f), 'utf8'), /CLAUDE_SKILL_DIR/, f);
});

test('every bundled agent carries the current roster version on its covenant marker', () => {
  for (const f of rosterFiles()) {
    const c = covenantOf(readFileSync(join(ROSTER, f), 'utf8'));
    assert.equal(c.version, COVENANT.version, f);
    assert.equal(c.block, COVENANT.block, f);
  }
});

test('this repository runs with the roster: every bundled agent has an installed copy in .claude/agents/', () => {
  const installed = join(ROOT, '.claude', 'agents');
  const copies = new Map();
  for (const f of readdirSync(installed).filter((x) => x.endsWith('.md'))) {
    const text = readFileSync(join(installed, f), 'utf8');
    const d = parseFrontmatter(text).data;
    if (d) copies.set(d.name, covenantOf(text));
  }
  for (const f of rosterFiles()) {
    const name = front(join(ROSTER, f)).name;
    assert.ok(copies.has(name), `${name} is not installed in .claude/agents/`);
    assert.equal(copies.get(name).block, COVENANT.block, `${name}: covenant block`);
    assert.equal(copies.get(name).version, COVENANT.version, `${name}: roster version`);
  }
  const r = audit({ project: ROOT, user: tempDir('geppetto-empty-user-') });
  assert.deepEqual(errors(r), []);
});
