// subagent-watchdog: loops the agent must still be told about (a failing edit, a failing commit), exempt calls that
// get a note but never an ask, and parallel Agent calls tracked by tool_use_id so a waiting agent never reads stuck.
// Pure tests over the logic module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { step, resolveOptions, parseAgent, serializeAgent } from '../hooks/agent-orchestration/subagent-watchdog-logic.mjs';
import { sim, sub, main, kind, call, reads, expected, agentEntry, MIN } from './subagent-watchdog.helpers.mjs';

const P = tempDir();
const O = resolveOptions({});
const prompt = main('UserPromptSubmit', { prompt: 'status?' });
const status = (state, now) => step(state, prompt, { now, options: O, where: { project: P, cwd: P } });
const ctx = (r) => (r.output === null ? null : r.output.hookSpecificOutput.additionalContext);
const agentCall = (s, event, id, extra = {}) => s.send(sub(event, { tool_name: 'Agent', tool_input: { prompt: 'go' }, tool_use_id: id, cwd: P, ...extra }));
const failingEdit = (s) => {
  const e = { tool_name: 'Edit', tool_input: { file_path: join(P, 'a.js'), old_string: 'x', new_string: 'y' }, cwd: P };
  const r = s.send(sub('PreToolUse', e));
  s.send(sub('PostToolUseFailure', { ...e, error: 'String not found' }));
  return kind(r);
};
/** The state with a second agent that looks stuck, so the status shows every agent's line. */
const withStuck = (state, now) => ({ ...state, agents: new Map([...state.agents, ['agent-z', agentEntry({ start: now, last: now - 30 * MIN })]]) });

test('W10 no edit: an Edit in the project, a git commit, SubagentHandback and SendMessage never get an ask, even as call 80; as call 40 they get the note', () => {
  const lastCall = {
    Edit: ['Edit', { file_path: join(P, 'a.js') }],
    commit: ['Bash', { command: 'git commit -m x' }],
    SubagentHandback: ['SubagentHandback', { message: 'done' }],
    SendMessage: ['SendMessage', { to: 'main', message: 'done' }],
    'Read (control)': ['Read', { file_path: join(P, 'z.js') }],
  };
  for (const [name, [tool, input]] of Object.entries(lastCall)) {
    for (const [before, want] of [[39, 'note'], [79, name === 'Read (control)' ? 'ask' : '-']]) {
      const s = sim({ project: P });
      reads(s, before);
      const r = s.send(sub('PreToolUse', { tool_name: tool, tool_input: input, cwd: P }));
      assert.equal(kind(r), want, `${name} as call ${before + 1}`);
    }
  }
});

test('L1 a Read then a failing Edit, 200 calls: one note at call 40 and an ask on the first Read at or past 80 and 160', () => {
  const s = sim({ project: P });
  const got = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? kind(call(s, 'Read', { file_path: join(P, `r${i}.js`) })) : failingEdit(s)));
  assert.deepEqual(got, expected(200, { 40: 'note', 81: 'ask', 161: 'ask' }));
  assert.equal(s.agent().sinceEdit, 200);
});

test('L2 the same failing git commit 10 times gives the note on the 3rd and no ask; the no-edit note and ask restart after an edit, and a lower noEditNote mid-stretch gives the note on the next call, once', () => {
  const s = sim({ project: P });
  const commit = { tool_name: 'Bash', tool_input: { command: 'git commit -am "fix tests"' }, cwd: P };
  const got = Array.from({ length: 10 }, () => {
    const r = s.send(sub('PreToolUse', commit));
    s.send(sub('PostToolUseFailure', { ...commit, error: 'Exit code 1' }));
    return kind(r);
  });
  assert.deepEqual(got, expected(10, { 3: 'note' }));
  const t = sim({ project: P });
  assert.deepEqual(reads(t, 80), expected(80, { 40: 'note', 80: 'ask' }));
  call(t, 'Write', { file_path: join(P, 'b.js'), content: 'x' });
  assert.deepEqual([t.agent().noted, t.agent().asked], [false, 0]);
  assert.deepEqual(reads(t, 80), expected(80, { 40: 'note', 80: 'ask' }));
  const u = sim({ project: P });
  reads(u, 30);
  const lower = sim({ project: P, options: { noEditNote: 10 }, state: u.state, now: u.now });
  assert.deepEqual(reads(lower, 3), ['note', '-', '-']);
});

test('L3 parallel Agent calls: with one still running the agent reads waiting, is never stuck or dropped, and looks stuck 11 minutes after the last returns', () => {
  const s = sim({ project: P });
  agentCall(s, 'PreToolUse', 'toolu_b1');
  agentCall(s, 'PreToolUse', 'toolu_b2');
  agentCall(s, 'PostToolUse', 'toolu_b1');
  const t = s.now;
  for (const m of [20, 90]) {
    const alone = status(s.state, t + m * MIN);
    assert.deepEqual([alone.output, alone.remove, alone.state.agents.has('agent-1')], [null, [], true], `${m} minutes`);
    const line = ctx(status(withStuck(s.state, t), t + m * MIN)).split('\n').find((l) => l.includes(' agent-1:'));
    assert.match(line, new RegExp(`, waiting on 1 subagent for ${m} minutes$`), line);
  }
  s.send(sub('PostToolUse', { tool_name: 'Agent', tool_input: {}, tool_use_id: 'toolu_b2', cwd: P }), 90 * MIN);
  assert.deepEqual(s.agent().waits, []);
  assert.equal(status(s.state, s.now + 9 * MIN).output, null);
  assert.match(ctx(status(s.state, s.now + 11 * MIN)), /agent-1: .*looks stuck: no tool call for 11 minutes/);
  const n = sim({ project: P });
  agentCall(n, 'PreToolUse', undefined);
  agentCall(n, 'PostToolUse', undefined);
  assert.deepEqual(n.agent().waits, []);
  assert.match(ctx(status(n.state, n.now + 11 * MIN)), /looks stuck/, 'an Agent call with no tool_use_id behaves as before');
});

test('L4 waits: only the PostToolUse or PostToolUseFailure with the same tool_use_id ends one; at most 32, oldest dropped; a bad id records none; the file caps them', () => {
  const s = sim({ project: P });
  agentCall(s, 'PreToolUse', 'w1');
  agentCall(s, 'PreToolUse', 'w2', { tool_name: 'Task' });
  s.send(sub('PostToolUse', { tool_name: 'Read', tool_input: {}, tool_use_id: 'other', cwd: P }));
  s.send(sub('SubagentStart'));
  call(s, 'Bash', { command: 'ls' });
  assert.deepEqual(s.agent().waits.map((w) => w.id), ['w1', 'w2']);
  agentCall(s, 'PostToolUseFailure', 'w2', { error: 'Interrupted' });
  assert.deepEqual(s.agent().waits.map((w) => w.id), ['w1']);
  for (const bad of ['', 'x'.repeat(129), 7, null]) agentCall(s, 'PreToolUse', bad);
  s.send(sub('PreToolUse', { tool_name: 'Read', tool_input: {}, tool_use_id: 'r1', cwd: P }));
  assert.deepEqual(s.agent().waits.map((w) => w.id), ['w1']);
  agentCall(s, 'PreToolUse', 'x'.repeat(128));
  for (let i = 0; i < 40; i++) agentCall(s, 'PreToolUse', `b${i}`);
  const ids = s.agent().waits.map((w) => w.id);
  assert.equal(ids.length, 32);
  assert.deepEqual(ids, Array.from({ length: 32 }, (_, i) => `b${i + 8}`));
  assert.deepEqual(parseAgent(serializeAgent(s.agent())), s.agent());
  const many = agentEntry({ waits: Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, at: i })) });
  assert.deepEqual(parseAgent(JSON.stringify(many)).waits.map((w) => w.id), Array.from({ length: 32 }, (_, i) => `f${i + 8}`));
  for (const waits of [{}, 'x', [{ id: '', at: 1 }], [{ id: 'a'.repeat(129), at: 1 }], [{ id: 'a', at: 'x' }], [{ id: 3, at: 1 }]]) {
    assert.equal(parseAgent(JSON.stringify({ ...agentEntry(), waits })), null, JSON.stringify(waits).slice(0, 40));
  }
  for (const over of [{ noted: 1 }, { asked: -1 }, { asked: 1.5 }]) assert.equal(parseAgent(JSON.stringify({ ...agentEntry(), ...over })), null);
});
