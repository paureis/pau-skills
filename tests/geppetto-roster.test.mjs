// geppetto's check-agents.mjs, the roster tests: the bundled roster passes its own audit and follows the design, and
// this repository's .claude/agents/ holds a copy of it. Shared setup is in geppetto.helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tempDir } from './helpers.mjs';
import { parseFrontmatter, parseTools, covenantOf, audit } from '../skills/agent-orchestration/geppetto/check-agents.mjs';
import { ROSTER, COVENANT, put, errors } from './geppetto.helpers.mjs';

// The roster: what the skill installs, and what this repository runs with.
const rosterFiles = () => readdirSync(ROSTER).filter((f) => f.endsWith('.md')).sort();
const front = (file) => parseFrontmatter(readFileSync(file, 'utf8')).data;

test('the bundled roster passes its own audit with no findings', () => {
  const r = audit({ dir: ROSTER, project: tempDir('geppetto-empty-'), user: tempDir('geppetto-empty-user-') });
  assert.deepEqual(r.agents.map((a) => a.data.name).sort(), ['builder', 'eng-lead', 'reviewer', 'sweeper', 'writer']);
  assert.deepEqual(r.findings, []);
});

test('a roster file saved with CRLF line endings or a byte order mark still passes', () => {
  const text = readFileSync(join(ROSTER, 'builder.md'), 'utf8');
  for (const [label, copy] of [['crlf', text.replace(/\n/g, '\r\n')], ['bom', `﻿${text}`], ['both', `﻿${text.replace(/\n/g, '\r\n')}`]]) {
    const dir = tempDir(`geppetto-${label}-`);
    put(dir, 'builder.md', copy);
    const r = audit({ dir, project: tempDir('geppetto-empty-'), user: tempDir('geppetto-empty-user-') });
    assert.deepEqual(r.findings, [], label);
    assert.equal(r.agents[0].data.name, 'builder', label);
    assert.equal(r.agents[0].data.isolation, 'worktree', label);
  }
});

test('the roster follows the settled design', () => {
  const by = Object.fromEntries(rosterFiles().map((f) => { const d = front(join(ROSTER, f)); return [d.name, d]; }));
  for (const d of Object.values(by)) {
    assert.equal(d.model, 'inherit', d.name);
    assert.equal(d.skills, undefined, `${d.name}: skills are added at install time, only when installed`);
  }
  // eng-lead starts builders and reviewers; the main session sends the fix rounds, so eng-lead has no SendMessage.
  assert.deepEqual(parseTools(by['eng-lead'].tools), ['Read', 'Grep', 'Glob', 'Agent']);
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
