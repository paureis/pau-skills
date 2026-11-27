// subagent-watchdog: a project's own agent type whose definition lists no Edit, MultiEdit or NotebookEdit tool is
// read-only (q38.md item 2), and readOnlyAgents adds to the defaults. The parser and the folder reader in
// subagent-watchdog-agents.mjs, and the stored flag as the logic uses it. Real tempDir() folders for the reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { repo, tempDir } from './helpers.mjs';
import { parseDefinition, definedReadOnly } from '../hooks/agent-orchestration/subagent-watchdog-agents.mjs';
import { resolveOptions, parseAgent, serializeAgent, step } from '../hooks/agent-orchestration/subagent-watchdog-logic.mjs';
import { sim, sub, main, kind, textOf, reads, expected, agentEntry, T0, MIN } from './subagent-watchdog.helpers.mjs';

const WIN = process.platform === 'win32';
// Kept literal on purpose, as in subagent-watchdog.test.mjs.
const READ_ONLY = ['reviewer', 'Explore', 'Plan', 'claude-code-guide', 'web-fetch', 'eng-lead'];
const RECORDED = readFileSync(repo('tests', 'fixtures', 'subagent-watchdog', 'agents', 'lector-file.md'), 'utf8');
const def = (front, body = 'Body.\n') => `---\n${front}\n---\n${body}`;
/** A definition Claude Code loads: with a description line (q42.md). Not in def(): A4 has its own description. */
const desc = (front) => def(`description: Reads files.\n${front}`);
const ro = (text) => { const d = parseDefinition(text); return d === null ? null : d.readOnly; };
const HINT = ['readOnlyAgents', 'subagent-watchdog', '.claude/pau-skills.json'];

test('A1 the recorded definition (file lector-file.md, tools Read, Bash, Write) is named lector and read-only', () => {
  assert.deepEqual(parseDefinition(RECORDED), { name: 'lector', readOnly: true, described: true });
});

test('A2 tools: a comma list, a flow list or a block list with no Edit, MultiEdit or NotebookEdit is read-only; one that holds any of them, with or without a (...) suffix, is not', () => {
  const cases = [
    ['tools: Read, Bash, Write', true],
    ['tools: Read, Edit', false],
    ['tools: Read,Grep,Glob', true],
    ['tools: [Read, "MultiEdit"]', false],
    ["tools: ['Read', \"Grep\"]", true],
    ['tools:\n  - Read\n  - NotebookEdit', false],
    ['tools:\n  - Read\n  - Write\nmodel: haiku', true],
    ['tools:\n- Read\n- Edit', false],
    ['tools: Read, Bash(git commit:*, git add:*), Write', true],
    ['tools: Read, Edit(src/**)', false],
    ['tools: Read, MultiEdit()', false],
    ['tools: Read # Edit comes later', true],
    ['tools: "Read, Edit"', false],
    ['tools: Read, Bash(echo, Edit)', true],
    ["tools: Read, Bash(echo, 'x')", true],
  ];
  for (const [front, want] of cases) assert.equal(ro(def(`name: x\n${front}`)), want, front);
});

test('A3 not read-only: no tools field (the agent gets every tool), an empty list, a wildcard, and disallowedTools alone', () => {
  for (const front of ['description: reads', 'tools:', 'tools: []', 'tools: ""', 'tools: "*"', 'tools: *', 'disallowedTools: Edit, MultiEdit, NotebookEdit, Write']) {
    assert.equal(ro(def(`name: x\n${front}`)), false, front);
  }
});

test('A4 the frontmatter: a BOM and CRLF line ends are read; quotes and a comment around the name are dropped; a key indented under another key, the body and a second frontmatter do not count', () => {
  assert.deepEqual(parseDefinition('﻿---\r\nname: "lector"\r\ntools: Read\r\n---\r\n'), { name: 'lector', readOnly: true, described: false });
  assert.deepEqual(parseDefinition(def("name: 'critic' # the reviewer\ntools: Read")), { name: 'critic', readOnly: true, described: false });
  assert.equal(ro(def('name: x\ndescription: |\n  tools: Edit\n  more\ntools: Read')), true);
  assert.equal(ro(def('name: x\ntools: Read', 'tools: Edit\n---\ntools: Edit\n')), true);
  assert.deepEqual(parseDefinition(def('tools: Read')), { name: null, readOnly: true, described: false });
});

test('A5 no frontmatter that parses gives null: no opening line, no closing line, a duplicate name or tools key, a flow list not closed on its line, an indented line in a block list that is not an item, text after a quoted value', () => {
  for (const text of ['', 'name: x\ntools: Read\n', '---\nname: x\ntools: Read\n', ' ---\nname: x\n---\n', def('name: x\nname: y\ntools: Read'),
    def('name: x\ntools: Read\ntools: Grep'), def('name: x\ntools: [Read,\n  Grep]'), def('name: x\ntools:\n  Read'), def('name: x\ntools: "Read", Edit'), 42, null]) {
    assert.equal(parseDefinition(text), null, JSON.stringify(text));
  }
});

test('A6 a 64 KB frontmatter made to slow a regular expression parses in under 250 ms', () => {
  for (const line of [' '.repeat(65000) + '\r', 'tools: ' + ' '.repeat(65000) + 'x', 'tools: ' + '('.repeat(65000), 'tools:\n' + '  -'.repeat(20000), 'name: ' + ' \t'.repeat(32000) + '#']) {
    const t = process.hrtime.bigint();
    parseDefinition(def('name: x\n' + line));
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    assert.ok(ms < 250, `${JSON.stringify(line.slice(0, 12))}: ${ms} ms`);
  }
});

/** A project folder and a home folder, each with .claude/agents holding the given files. */
function folders(projectFiles = {}, homeFiles = {}) {
  const project = tempDir(); const home = tempDir();
  for (const [root, files] of [[project, projectFiles], [home, homeFiles]]) {
    const dir = join(root, '.claude', 'agents');
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
  }
  return { project, home };
}

test('A7 the folders: matched by the name line, not the file name; the project folder, then the home folder; the project wins when both have the name', () => {
  const reader = desc('name: lector\ntools: Read, Bash, Write');
  const writer = desc('name: lector\ntools: Read, Edit');
  assert.equal(definedReadOnly('lector', folders({ 'lector-file.md': RECORDED })), true);
  assert.equal(definedReadOnly('lector-file', folders({ 'lector-file.md': RECORDED })), false);
  assert.equal(definedReadOnly('lector', folders({}, { 'a.md': reader })), true);
  assert.equal(definedReadOnly('lector', folders({ 'z.md': writer }, { 'a.md': reader })), false);
  assert.equal(definedReadOnly('lector', folders({ 'z.md': reader }, { 'a.md': writer })), true);
  assert.equal(definedReadOnly('lector', folders({ 'other.md': desc('name: critic\ntools: Read') }, { 'a.md': reader })), true);
  assert.equal(definedReadOnly('lector', { project: tempDir(), home: tempDir() }), false, 'no agents folder');
  for (const type of ['', undefined, 7]) assert.equal(definedReadOnly(type, folders({ 'a.md': def('name: \ntools: Read') })), false, String(type));
});

test('A8 not read: a file that is not .md, a file over 64 KB; more than 200 .md files leave the folder incomplete; a link to a file is read', () => {
  const reader = desc('name: lector\ntools: Read');
  assert.equal(definedReadOnly('lector', folders({ 'a.txt': reader, 'b.md.bak': reader })), false);
  assert.equal(definedReadOnly('lector', folders({ 'a.md': reader + 'x'.repeat(65536 - reader.length) })), true, '64 KB exactly');
  assert.equal(definedReadOnly('lector', folders({ 'a.md': reader + 'x'.repeat(65537 - reader.length) })), false, 'one byte over 64 KB');
  const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`a${String(i).padStart(3, '0')}.md`, desc(`name: n${i}\ntools: Read`)]));
  assert.equal(definedReadOnly('lector', folders({ ...many, 'b.md': reader })), false, 'the 201st file');
  assert.equal(definedReadOnly('n199', folders({ ...many, 'b.md': reader })), false, 'the 200th file, with 201 files');
  assert.equal(definedReadOnly('n199', folders(many)), true, 'the 200th file, with 200 files');
  if (!WIN) {
    const f = folders();
    writeFileSync(join(f.home, 'real.md'), reader);
    symlinkSync(join(f.home, 'real.md'), join(f.project, '.claude', 'agents', 'link.md'));
    assert.equal(definedReadOnly('lector', f), true, 'a link');
  }
});

test('A14 a file that cannot be read in full or does not parse makes the answer not read-only: in the project folder before the home one, and anywhere in the match\'s folder; a file with no frontmatter does not count', () => {
  const reader = desc('name: builder2\ntools: Read, Bash');
  const big = def('name: builder2\ntools: Read, Edit, Bash') + 'x'.repeat(70 * 1024);
  const bad = '---\nname: builder2\nname: builder2\ntools: Read\n---\n';
  assert.equal(definedReadOnly('builder2', folders({}, { 'old.md': reader })), true, 'control: the home definition alone');
  assert.equal(definedReadOnly('builder2', folders({ 'builder2.md': big }, { 'old.md': reader })), false, 'a 70 KB project file');
  assert.equal(definedReadOnly('builder2', folders({ 'builder2.md': bad }, { 'old.md': reader })), false, 'a project file that does not parse');
  assert.equal(definedReadOnly('builder2', folders({ 'a.md': 'not a definition', 'b.md': reader })), true, 'one folder, no frontmatter first');
  assert.equal(definedReadOnly('builder2', folders({ 'a.md': big, 'b.md': reader })), false, 'one folder, too big first');
  assert.equal(definedReadOnly('builder2', folders({ 'a.md': reader, 'z.md': bad })), false, 'the match comes first');
});

// Probes (Claude Code 2.1.332, headless, empty HOME): a .md file whose first line is not "---" (after a BOM, trailing
// spaces dropped) is not in the init event's agents list, so it is no definition and the answer does not depend on it.
test('A16 a file with no frontmatter before the match is skipped: a README, an empty file, a blank line or a space before "---"; a BOM before "---" still opens one', () => {
  const reader = desc('name: lector\ntools: Read');
  const readme = '# Agents\n\nNotes.\n';
  assert.equal(definedReadOnly('lector', folders({ 'README.md': readme, 'lector.md': reader })), true, 'one folder');
  assert.equal(definedReadOnly('lector', folders({ 'README.md': readme }, { 'lector.md': reader })), true, 'project README, home match');
  assert.equal(definedReadOnly('lector', folders({ 'a.md': '', 'b.md': reader })), true, 'an empty file');
  assert.equal(definedReadOnly('lector', folders({ 'a.md': '\n---\nname: lector\ntools: Edit\n---\n', 'b.md': reader })), true, 'a blank line first');
  assert.equal(definedReadOnly('lector', folders({ 'a.md': ' ---\nname: lector\ntools: Edit\n---\n', 'b.md': reader })), true, 'a space first');
  assert.equal(definedReadOnly('lector', folders({ 'README.md': readme, 'lector.md': '\ufeff---\nname: lector\ndescription: Reads.\ntools: Read\n---\n' })), true, 'a BOM-led match');
});

test('A17 a file whose first line opens frontmatter that does not parse, before the match, still makes the answer not read-only; skipped files count toward the 200', () => {
  const reader = desc('name: lector\ntools: Read');
  for (const [bad, why] of [[def('name: a\nname: b'), 'a duplicate key'], ['---\nname: a\n', 'no closing line'], [def('name: a\ntools: [Read,\n  Grep]'), 'a flow list not closed on its line'],
    ['\ufeff---\r\nname: a\r\n', 'a BOM, CRLF, no closing line'], ['--- \nname: a\n', 'a trailing space, no closing line']]) {
    assert.equal(definedReadOnly('lector', folders({ 'a.md': bad, 'b.md': reader })), false, why);
  }
  const plain = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`a${String(i).padStart(3, '0')}.md`, '# Notes\n']));
  assert.equal(definedReadOnly('lector', folders({ ...plain, 'b.md': reader })), false, 'the match is the 201st file');
});

test('A15 tools: null, Null, NULL or ~ is no tools field, so not read-only; so is an empty tools: value', () => {
  for (const v of ['null', 'Null', 'NULL', '~', '~ # none', '']) {
    assert.deepEqual(parseDefinition(def(`name: x\ntools: ${v}`)), { name: 'x', readOnly: false, described: false }, v);
  }
  assert.equal(parseDefinition(def('name: x\ntools: ~\ntools: Read')), null, 'still a duplicate key');
});

test('A9 readOnlyAgents adds to the six defaults without duplicates, drops entries that are not strings, and anything but an array keeps the defaults', () => {
  assert.deepEqual(resolveOptions({ readOnlyAgents: ['lector', 'reviewer', 3, null, 'critic', 'lector'] }).readOnlyAgents, [...READ_ONLY, 'lector', 'critic']);
  for (const v of [[], 'lector', {}, null]) assert.deepEqual(resolveOptions({ readOnlyAgents: v }).readOnlyAgents, READ_ONLY, JSON.stringify(v));
  const s = sim({ options: { readOnlyAgents: ['lector'] } });
  assert.deepEqual(reads(s, 80, { agent_type: 'reviewer' }), Array(80).fill('-'), 'a default still skips the rule');
  assert.deepEqual(reads(sim({ options: { readOnlyAgents: ['lector'] } }), 80, { agent_type: 'lector' }), Array(80).fill('-'));
});

test('A10 the stored flag: SubagentStart with ro true stores it, 80 calls give no note and no ask, a second SubagentStart sets it again; with ro false the note and the ask come', () => {
  const start = (s, flag) => { const r = step(s.state, sub('SubagentStart'), { now: s.now, options: resolveOptions({}), ro: flag }); s.state = r.state; };
  const s = sim();
  start(s, true);
  assert.equal(s.agent().ro, true);
  assert.deepEqual(reads(s, 80), Array(80).fill('-'));
  start(s, false);
  assert.equal(s.agent().ro, false);
  const t = sim();
  start(t, false);
  assert.deepEqual(reads(t, 80), expected(80, { 40: 'note', 80: 'ask' }));
  const u = sim();
  u.send(sub('SubagentStart'));
  assert.equal(u.agent().ro, false, 'no ro given');
});

test('A11 the state: ro true survives serialize and parse; a missing field (an old state file) or one that is not a boolean reads as false', () => {
  const a = agentEntry({ ro: true, sinceEdit: 400 });
  assert.deepEqual(parseAgent(serializeAgent(a)), a);
  const { ro: _, ...old } = a;
  assert.deepEqual(parseAgent(JSON.stringify(old)), { ...a, ro: false });
  for (const v of ['true', 1, null, {}]) assert.equal(parseAgent(JSON.stringify({ ...a, ro: v })).ro, false, JSON.stringify(v));
});

test('A12 the status: ro true with 400 calls since the last edit is not flagged; ro false is, and its flag names readOnlyAgents', () => {
  const now = T0 + MIN;
  const at = (over) => step({ shownAt: 0, agents: new Map([['agent-1', agentEntry({ calls: 400, ...over })]]) }, main('UserPromptSubmit', { prompt: 'x' }), { now, options: resolveOptions({}) });
  assert.equal(at({ ro: true, sinceEdit: 400 }).output, null);
  const text = at({ ro: false, sinceEdit: 400 }).output.hookSpecificOutput.additionalContext;
  assert.match(text, /400 tool calls with no edit/);
  for (const part of HINT) assert.ok(text.includes(part), part);
});

test('A13 the no-edit note and the no-edit ask name readOnlyAgents under subagent-watchdog in .claude/pau-skills.json', () => {
  const s = sim();
  const got = Array.from({ length: 80 }, (_, i) => s.send(sub('PreToolUse', { tool_name: 'Read', tool_input: { file_path: `f${i}` } })));
  assert.deepEqual([kind(got[39]), kind(got[79])], ['note', 'ask']);
  for (const r of [got[39], got[79]]) for (const part of HINT) assert.ok(textOf(r).includes(part), `${kind(r)}: ${part}`);
});
