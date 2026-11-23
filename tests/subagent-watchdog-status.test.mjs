// subagent-watchdog in the main session: when at least one subagent is flagged, one line per running subagent, at
// most once every 5 minutes; an agent gone quiet for an hour is dropped, and TaskStop removes the agent it names.
// Pure tests over the logic module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from './helpers.mjs';
import { step, emptyState, resolveOptions, normalizeCommand } from '../hooks/agent-orchestration/subagent-watchdog-logic.mjs';
import { sim, sub, main, agentEntry, T0, MIN } from './subagent-watchdog.helpers.mjs';

const P = tempDir();
const O = resolveOptions({});
const SEC = 1000;
const prompt = main('UserPromptSubmit', { prompt: 'how is it going?' });
const stateOf = (entries, shownAt = 0) => ({ shownAt, agents: new Map(entries) });
const at = (state, now, input = prompt) => step(state, input, { now, options: O, where: { project: P, cwd: P } });
const ctx = (r) => (r.output === null ? null : r.output.hookSpecificOutput.additionalContext);
const lineOf = (r, id) => ctx(r).split('\n').filter((l) => l.includes(` ${id}:`));
const quiet = (r, state, why) => {
  assert.deepEqual([r.output, r.changed, r.shown, r.remove], [null, false, false, []], why);
  assert.equal(r.state, state, why);
};
/** A builder that ran one command at T0 and is now quiet (no flight). */
const fresh = (over) => agentEntry({ calls: 1, sinceEdit: 1, ...over });
const bashIn = (s, command) => s.send(sub('PreToolUse', { tool_name: 'Bash', tool_input: { command }, cwd: P }));

test('S1 no agent, or no agent flagged: no output and shownAt unchanged', () => {
  const empty = emptyState();
  quiet(at(empty, T0), empty, 'no agent');
  const calm = stateOf([['agent-1', fresh({ last: T0 })]], 0);
  quiet(at(calm, T0 + 9 * MIN), calm, 'one calm agent');
  quiet(at(calm, T0 + 9 * MIN, main('PreToolUse', { tool_name: 'Read', tool_input: {} })), calm, 'one calm agent, PreToolUse');
});

test('S2 looks stuck: no tool call started or finished for 10 minutes and none in flight; at 9:59 it is not', () => {
  const s = sim({ project: P });
  bashIn(s, 'npm test');
  s.send(sub('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: P }), 9 * MIN);
  const post = s.now;
  quiet(at(s.state, post + 10 * MIN - SEC), s.state, '9:59 after the PostToolUse');
  assert.deepEqual(lineOf(at(s.state, post + 10 * MIN), 'agent-1').length, 1);
  assert.match(ctx(at(s.state, post + 10 * MIN)), /looks stuck: no tool call for 10 minutes/);
  quiet(at(s.state, post + 6 * MIN), s.state, 'the PostToolUse restarted the clock: 15 minutes after the PreToolUse');
});

test('S3 in flight: shows as running <command> for N minutes and is flagged from 30:00, not at 29:59; the agent\'s next event ends it', () => {
  const s = sim({ project: P });
  bashIn(s, 'npm test');
  const t = s.now;
  quiet(at(s.state, t + 30 * MIN - SEC), s.state, '29:59 in flight');
  const r = at(s.state, t + 30 * MIN);
  assert.match(lineOf(r, 'agent-1')[0], /running `npm test` for 30 minutes/);
  assert.doesNotMatch(ctx(r), /looks stuck/);
  s.send(sub('PreToolUse', { tool_name: 'Read', tool_input: {}, cwd: P }), 20 * MIN);
  quiet(at(s.state, t + 35 * MIN), s.state, 'the denied call no longer reads as in flight');
  s.send(sub('PostToolUseFailure', { tool_name: 'Read', tool_input: {}, cwd: P }), 1 * MIN);
  assert.equal(s.agent().flight, null);
  const q = sim({ project: P });
  q.send(sub('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'a.js' }, cwd: P }));
  assert.match(lineOf(at(q.state, q.now + 31 * MIN), 'agent-1')[0], /, running Read for 31 minutes, /, 'a call that is not a shell command shows its tool name');
});

test('S4 waste: an agent at the repeat note or the no-edit note is flagged; a read-only agent at the no-edit note is not', () => {
  const now = T0 + MIN;
  const flagged = (over) => ctx(at(stateOf([['agent-1', fresh({ last: now, ...over })]]), now)) !== null;
  assert.equal(flagged({ top: { n: 3, cmd: 'npm test' } }), true);
  assert.equal(flagged({ top: { n: 2, cmd: 'npm test' } }), false);
  assert.equal(flagged({ sinceEdit: 40 }), true);
  assert.equal(flagged({ sinceEdit: 39 }), false);
  assert.equal(flagged({ sinceEdit: 400, type: 'reviewer' }), false);
  assert.equal(flagged({ sinceEdit: 400, type: 'plugin:Explore' }), false);
  assert.equal(flagged({ top: { n: 3, cmd: 'npm test' }, type: 'reviewer' }), true);
});

test('S5 lines: with one agent flagged, every running agent gets one line, oldest first, with type, full id, minutes, tool calls, calls since the last edit and top repeat', () => {
  const now = T0 + 10 * MIN + 30 * SEC;
  const state = stateOf([
    ['agent-c', fresh({ type: 'plugin:x', start: T0 + 2 * MIN, last: now - SEC, calls: 7, sinceEdit: 2 })],
    ['agent-a', fresh({ type: 'builder', start: T0, last: now - SEC, calls: 30, sinceEdit: 12 })],
    ['agent-b', fresh({ type: 'reviewer', start: T0 + MIN, last: now - SEC, calls: 9, sinceEdit: 9, top: { n: 4, cmd: 'npm test' } })],
  ]);
  const lines = ctx(at(state, now)).split('\n');
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^\[subagent-watchdog\] /);
  assert.equal(lines[1], '- builder agent-a: 10 minutes, 30 tool calls, 12 since the last edit, no repeats');
  assert.match(lines[2], /^- reviewer agent-b: 9 minutes, 9 tool calls, 9 since the last edit, top repeat 4 runs of `npm test`, flagged: /);
  assert.equal(lines[3], '- plugin:x agent-c: 8 minutes, 7 tool calls, 2 since the last edit, no repeats');
});

test('S6 throttle: no status within 5 minutes of the last one; at exactly 5:00 it shows again and shownAt moves', () => {
  const now = T0 + 60 * MIN;
  const agent = ['agent-1', fresh({ last: now - 20 * MIN })];
  const early = stateOf([agent], now - 5 * MIN + SEC);
  quiet(at(early, now), early, '4:59 after the last status');
  const due = stateOf([agent], now - 5 * MIN);
  const r = at(due, now);
  assert.notEqual(ctx(r), null);
  assert.deepEqual([r.state.shownAt, r.shown, r.changed], [now, true, true]);
  quiet(at(r.state, now + 4 * MIN), r.state, 'right after');
  assert.notEqual(ctx(at(r.state, now + 5 * MIN)), null);
});

test('S7 where: UserPromptSubmit and a main-session PreToolUse get additionalContext under their own hookEventName; a main-session PostToolUse and a UserPromptSubmit with an agent_id get nothing', () => {
  const now = T0 + 20 * MIN;
  const state = stateOf([['agent-1', fresh({ last: T0 })]]);
  const notice = main('UserPromptSubmit', { prompt: '<task-notification>agent-2 finished</task-notification>' });
  for (const input of [prompt, notice, main('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } })]) {
    const r = at(state, now, input);
    assert.equal(r.output.hookSpecificOutput.hookEventName, input.hook_event_name);
    assert.match(ctx(r), /looks stuck/);
  }
  quiet(at(state, now, main('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } })), state, 'main PostToolUse');
  quiet(at(state, now, sub('UserPromptSubmit', { prompt: 'x' })), state, 'UserPromptSubmit with an agent_id');
});

test('S8 the status never carries a permissionDecision, and says the watchdog never stops an agent and that TaskStop is the orchestrator\'s or the owner\'s choice', () => {
  const now = T0 + 20 * MIN;
  const state = stateOf([['agent-1', fresh({ last: T0 })]]);
  for (const input of [prompt, main('PreToolUse', { tool_name: 'Read', tool_input: {} })]) {
    const out = at(state, now, input).output;
    assert.deepEqual(Object.keys(out), ['hookSpecificOutput']);
    assert.deepEqual(Object.keys(out.hookSpecificOutput).sort(), ['additionalContext', 'hookEventName']);
    const last = out.hookSpecificOutput.additionalContext.split('\n').at(-1);
    assert.match(last, /never stops an agent/);
    assert.match(last, /with TaskStop is the orchestrator's or the owner's choice/);
  }
});

test('S9 drop: an agent with no call in flight is dropped at exactly 60:00 and kept at 59:59; one with a call in flight for 61 minutes is kept and shows as running', () => {
  const now = T0 + 120 * MIN;
  const gone = at(stateOf([['agent-1', fresh({ last: now - 60 * MIN })]]), now);
  assert.deepEqual(gone.remove, ['agent-1']);
  assert.equal(gone.state.agents.has('agent-1'), false);
  const lines = ctx(gone).split('\n');
  assert.equal(lines.length, 3, 'a dropped agent gets only its drop line, not its regular line too');
  assert.match(lines.at(-2), /dropped builder agent-1: no event for 60 minutes \(it may have ended without a stop event\)/);
  const kept = at(stateOf([['agent-1', fresh({ last: now - 60 * MIN + SEC })]]), now);
  assert.deepEqual([kept.remove, kept.state.agents.has('agent-1')], [[], true]);
  assert.match(lineOf(kept, 'agent-1')[0], /looks stuck: no tool call for 59 minutes/);
  const flight = { tool: 'Bash', cmd: 'npm test', at: now - 61 * MIN };
  const busy = at(stateOf([['agent-1', fresh({ last: now - 61 * MIN, flight })]]), now);
  assert.deepEqual([busy.remove, busy.state.agents.has('agent-1')], [[], true]);
  assert.match(lineOf(busy, 'agent-1')[0], /running `npm test` for 61 minutes/);
  assert.doesNotMatch(ctx(busy), /dropped/);
});

test('S10 the command shown is normalized, cut to 80 characters, and never holds a new line', () => {
  const cmd = 'npm\n  test   ' + 'x'.repeat(200) + '\nmore';
  const s = sim({ project: P });
  bashIn(s, cmd);
  const r = at(s.state, s.now + 30 * MIN);
  const line = lineOf(r, 'agent-1')[0];
  assert.ok(line.includes('`' + normalizeCommand(cmd).slice(0, 80) + '`'), line);
  assert.ok(!line.includes(normalizeCommand(cmd).slice(0, 81)));
  const now = T0 + 40 * MIN;
  const read = fresh({ last: now - 31 * MIN, top: { n: 3, cmd: 'x\ny' }, flight: { tool: 'Bash', cmd: 'a\nb\r\nc', at: now - 31 * MIN } });
  const lines = ctx(at(stateOf([['agent-1', read]]), now)).split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /top repeat 3 runs of `x y`, running `a b c` for 31 minutes/);
});

test('S11 a main-session PostToolUse for TaskStop with the agent\'s id removes it; a PreToolUse for TaskStop, a bad task_id and any other main-session PostToolUse do not', () => {
  const now = T0 + MIN;
  const state = stateOf([['agent-1', fresh({ last: now })], ['agent-2', fresh({ last: now })]]);
  const stop = (event, task_id, tool_name = 'TaskStop') => at(state, now, main(event, { tool_name, tool_input: { task_id } }));
  const r = stop('PostToolUse', 'agent-1');
  assert.deepEqual([r.output, r.remove, r.write, r.changed], [null, ['agent-1'], [], true]);
  assert.deepEqual([...r.state.agents.keys()], ['agent-2']);
  quiet(stop('PreToolUse', 'agent-1'), state, 'PreToolUse for TaskStop');
  quiet(stop('PostToolUseFailure', 'agent-1'), state, 'PostToolUseFailure for TaskStop');
  for (const bad of ['../x', '', 5, null, 'a'.repeat(129)]) quiet(stop('PostToolUse', bad), state, `task_id ${bad}`);
  quiet(stop('PostToolUse', 'agent-1', 'Bash'), state, 'another tool');
});

test('S12 an agent whose call in flight is Agent or Task reads "waiting on a subagent for N minutes" and is not flagged for it at 31 minutes or dropped at 61; a Bash call in flight for 31 minutes is flagged', () => {
  const now = T0 + 120 * MIN;
  for (const tool of ['Agent', 'Task']) {
    for (const m of [31, 61]) {
      const waiting = fresh({ last: now - m * MIN, flight: { tool, cmd: null, at: now - m * MIN } });
      const alone = stateOf([['agent-1', waiting]]);
      quiet(at(alone, now), alone, `${tool} for ${m} minutes, alone`);
      const other = ['agent-2', fresh({ start: T0 + MIN, last: now - 20 * MIN })];
      const r = at(stateOf([['agent-1', waiting], other]), now);
      assert.equal(lineOf(r, 'agent-1')[0], `- builder agent-1: 120 minutes, 1 tool calls, 1 since the last edit, no repeats, waiting on a subagent for ${m} minutes`);
      assert.deepEqual(r.remove, []);
    }
  }
  const bash = fresh({ last: now - 31 * MIN, flight: { tool: 'Bash', cmd: 'npm test', at: now - 31 * MIN } });
  assert.match(lineOf(at(stateOf([['agent-1', bash]]), now), 'agent-1')[0], /flagged: one call has run for 31 minutes/);
});
