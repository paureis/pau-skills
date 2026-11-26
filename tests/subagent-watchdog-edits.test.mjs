// subagent-watchdog: a successful edit counts as progress wherever the file is (q38.md item 1). An orchestrator in the
// main checkout sends writers to sibling worktrees and to the scratchpad; their events carry the main checkout as cwd,
// so a path test made a healthy writer reach the no-edit ask. Built on the recorded input of a real run
// (fixtures/subagent-watchdog/probe-events.json). Pure tests over the logic module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { isEdit } from '../hooks/agent-orchestration/subagent-watchdog-logic.mjs';
import { sim, kind, call, reads, expected, probeEvents } from './subagent-watchdog.helpers.mjs';

const P = tempDir();
const SIBLING = P + '-feature';
const SCRATCH = join(dirname(P), 'scratch-session', 'scratchpad');
const OSTMP = tempDir();
const events = probeEvents({ session: 'sess-probe', agent: 'agent-1', project: P, sibling: SIBLING, ostmp: OSTMP, scratchpad: SCRATCH, transcript: join(P, 't.jsonl'), prompt: 'prompt-1' });
const [, preRead, postRead, preSibling, postSibling, preTmp, postTmp] = events;

/** A simulator for the recorded agent after 2 runs of one command and the recorded Read: sinceEdit is 3. */
function busy() {
  const s = sim({ project: P });
  for (let i = 0; i < 2; i++) call(s, 'Bash', { command: 'npm test' }, { agent_type: 'lector' });
  s.send(preRead);
  s.send(postRead);
  assert.equal(s.agent().sinceEdit, 3);
  return s;
}

test('E1 the recorded Write in a sibling folder and the recorded Write in another temp folder each reset every count at PostToolUse', () => {
  for (const [pre, post] of [[preSibling, postSibling], [preTmp, postTmp]]) {
    assert.ok(!post.tool_input.file_path.startsWith(P + '/'), 'the file is outside the project');
    assert.equal(post.cwd, P, 'the event carries the project as cwd');
    const s = busy();
    s.send(pre);
    assert.equal(s.agent().sinceEdit, 4, 'nothing counts at PreToolUse');
    s.send(post);
    assert.deepEqual([s.agent().sinceEdit, s.agent().runs, s.agent().top, s.agent().edit], [0, {}, null, s.now], post.tool_input.file_path);
  }
});

test('E2 an Edit in a sibling worktree, a Write in the session scratchpad, a MultiEdit and a NotebookEdit under the OS temp folder, and a relative path all count', () => {
  const at = (file) => ({ ...postSibling, tool_input: { file_path: file, old_string: 'a', new_string: 'b' } });
  const cases = [
    { ...at(join(SIBLING, 'src', 'b.js')), tool_name: 'Edit' },
    { ...postSibling, tool_input: { file_path: join(preSibling.scratchpad_dir, 'notes.md'), content: 'x' } },
    { ...at(join(OSTMP, 'c.py')), tool_name: 'MultiEdit' },
    { ...postSibling, tool_name: 'NotebookEdit', tool_input: { notebook_path: join(OSTMP, 'n.ipynb'), new_source: 'x' } },
    { ...at('../elsewhere/d.js'), tool_name: 'Edit' },
  ];
  for (const post of cases) {
    const name = `${post.tool_name} ${post.tool_input.file_path || post.tool_input.notebook_path}`;
    assert.equal(isEdit(post), true, name);
    const s = busy();
    s.send({ ...post, hook_event_name: 'PreToolUse' });
    s.send(post);
    assert.equal(s.agent().sinceEdit, 0, name);
  }
});

test('E3 an agent that makes 79 edits outside the project, each after 3 other calls, never gets a note or an ask; an edit outside the project as call 80 gets no ask', () => {
  const s = busy();
  const got = [];
  for (let i = 0; i < 79; i++) {
    got.push(...reads(s, 3, { agent_type: 'lector' }));
    const file = join(i % 2 ? SIBLING : SCRATCH, `f${i}.js`);
    got.push(kind(s.send({ ...preSibling, tool_input: { file_path: file, content: 'x' } })));
    s.send({ ...postSibling, tool_input: { file_path: file, content: 'x' } });
  }
  assert.equal(got.length, 316);
  assert.deepEqual(got, Array(316).fill('-'));
  assert.equal(s.agent().sinceEdit, 0);
  const t = sim({ project: P });
  assert.deepEqual(reads(t, 79, { agent_type: 'lector' }), expected(79, { 40: 'note' }));
  assert.equal(kind(t.send(preSibling)), '-', 'the edit itself is exempt from the ask');
});

test('E4 a refused edit (the recorded PreToolUse with no PostToolUse) and a failed one (PostToolUseFailure) still reset nothing; a path that is empty, not a string or over 4,096 characters is no edit', () => {
  const refused = busy();
  refused.send(preSibling);
  refused.send(preRead);
  assert.equal(refused.agent().sinceEdit, 5);
  const failed = busy();
  failed.send(preSibling);
  failed.send({ ...postSibling, hook_event_name: 'PostToolUseFailure', tool_response: undefined, error: 'EACCES: permission denied' });
  assert.deepEqual([failed.agent().sinceEdit, failed.agent().flight], [4, null]);
  for (const file_path of ['', 7, null, '/' + 'x'.repeat(4096)]) {
    assert.equal(isEdit({ ...postSibling, tool_input: { file_path, content: 'x' } }), false, String(file_path).slice(0, 20));
  }
  assert.equal(isEdit({ ...postSibling, tool_input: { file_path: '/' + 'x'.repeat(4095), content: 'x' } }), true, '4,096 characters');
});
