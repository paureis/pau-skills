// subagent-watchdog run as a process on the recorded SubagentStart of a project agent (q38.md item 2): the hook reads
// <project>/.claude/agents, then <PAU_SKILLS_HOME>/.claude/agents, stores the read-only flag, and the agent's calls
// then get no no-edit note or ask. Every run gets an empty HOME, its own TMPDIR, TMP and TEMP, and its own project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { probeEvents } from './subagent-watchdog.helpers.mjs';

const HOOK = repo('hooks', 'agent-orchestration', 'subagent-watchdog.mjs');
const RECORDED = readFileSync(repo('tests', 'fixtures', 'subagent-watchdog', 'agents', 'lector-file.md'), 'utf8');
const BASE = 'pau-skills-watchdog' + (typeof process.getuid === 'function' ? '-' + process.getuid() : '');

function world() {
  const home = tempDir(); const user = tempDir(); const tmp = tempDir(); const project = tempDir(); const sibling = tempDir();
  const env = { HOME: home, USERPROFILE: home, PAU_SKILLS_HOME: user, TMPDIR: tmp, TMP: tmp, TEMP: tmp, CLAUDE_PROJECT_DIR: project, PAU_SKILLS_DISABLE: '' };
  const [start, preRead, postRead, preWrite, postWrite] = probeEvents({
    session: 'sess-probe', agent: 'agent-p1', project, sibling, ostmp: tmp, scratchpad: join(tmp, 'scratchpad'), transcript: join(home, 't.jsonl'), prompt: 'prompt-1',
  });
  const w = { home, user, tmp, project, env, start, preRead, postRead, preWrite, postWrite };
  w.run = (input) => runNode(HOOK, { input: JSON.stringify(input), env });
  w.state = () => JSON.parse(readFileSync(join(tmp, BASE, 'sess-probe', 'agent-p1.json'), 'utf8'));
  w.agents = (root, files) => { mkdirSync(join(root, '.claude', 'agents'), { recursive: true }); for (const [f, t] of Object.entries(files)) writeFileSync(join(root, '.claude', 'agents', f), t); };
  /** n recorded Read calls (PreToolUse, then PostToolUse); the kinds of the PreToolUse outputs. */
  w.reads = (n) => Array.from({ length: n }, () => {
    const r = w.run(w.preRead);
    assert.deepEqual([r.code, r.stderr], [0, '']);
    w.run(w.postRead);
    return r.stdout === '' ? '-' : JSON.parse(r.stdout).hookSpecificOutput.permissionDecision === 'ask' ? 'ask' : 'note';
  });
  return w;
}
const silent = (r) => assert.deepEqual([r.code, r.stdout, r.stderr], [0, '', '']);

test('AP1 the recorded definition in the project folder: SubagentStart stores ro true, and 80 calls with no edit get no note and no ask; the recorded Write in a sibling folder then resets the count', () => {
  const w = world();
  w.agents(w.project, { 'lector-file.md': RECORDED });
  silent(w.run(w.start));
  assert.deepEqual([w.state().type, w.state().ro], ['lector', true]);
  assert.deepEqual(w.reads(80), Array(80).fill('-'));
  assert.equal(w.state().sinceEdit, 80);
  silent(w.run(w.preWrite));
  silent(w.run(w.postWrite));
  assert.equal(w.state().sinceEdit, 0);
  assert.deepEqual(readdirSync(w.home), [], 'HOME stays empty');
});

test('AP2 tools: Read, Bash, Write in the PAU_SKILLS_HOME folder (not HOME) is read-only too; 40 calls get no note', () => {
  const w = world();
  w.agents(w.user, { 'reader.md': '---\nname: lector\ntools: Read, Bash, Write\n---\nReads.\n' });
  silent(w.run(w.start));
  assert.equal(w.state().ro, true);
  assert.deepEqual(w.reads(40), Array(40).fill('-'));
});

test('AP3 not read-only: a definition with Edit, one with no tools, the same name only under HOME, and a project definition with Edit over a read-only user one; the 40th call then gets the note', () => {
  const cases = {
    'tools: Read, Edit': (w) => w.agents(w.project, { 'l.md': '---\nname: lector\ntools: Read, Edit\n---\n' }),
    'no tools': (w) => w.agents(w.project, { 'l.md': '---\nname: lector\ndescription: reads\n---\n' }),
    'only under HOME': (w) => w.agents(w.home, { 'l.md': RECORDED }),
    'the project wins': (w) => { w.agents(w.project, { 'z.md': '---\nname: lector\ntools: [Read, MultiEdit]\n---\n' }); w.agents(w.user, { 'a.md': RECORDED }); },
  };
  for (const [name, setup] of Object.entries(cases)) {
    const w = world();
    setup(w);
    silent(w.run(w.start));
    assert.equal(w.state().ro, false, name);
  }
  const w = world();
  silent(w.run(w.start));
  assert.deepEqual(w.reads(40), [...Array(39).fill('-'), 'note'], 'control: no definition');
});

test('AP4 a 70 KB project definition with Edit and a read-only one of the same name under PAU_SKILLS_HOME: ro false, and the 40th call gets the note', () => {
  const w = world();
  w.agents(w.project, { 'builder2.md': '---\nname: builder2\ntools: Read, Edit, Bash\n---\n' + 'x'.repeat(70 * 1024) });
  w.agents(w.user, { 'old.md': '---\nname: builder2\ntools: Read, Bash\n---\n' });
  silent(w.run({ ...w.start, agent_type: 'builder2' }));
  assert.equal(w.state().ro, false);
  assert.deepEqual(w.reads(40), [...Array(39).fill('-'), 'note']);
});
