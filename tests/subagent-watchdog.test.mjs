// subagent-watchdog inside a subagent: a repeated command or a long stretch with no edit gives a note, then an ask.
// Pure tests over the logic module; real tempDir() folders wherever a path must exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import {
  normalizeCommand, isEdit, resolveOptions, parseAgent, serializeAgent, step,
} from '../hooks/agent-orchestration/subagent-watchdog-logic.mjs';
import { sim, sub, main, kind, textOf, call, bash, agentEntry, runs, expected, reads, T0, MIN } from './subagent-watchdog.helpers.mjs';

const P = tempDir();
const BOM = String.fromCharCode(0xfeff);
// Kept literal on purpose: a fixture built from the module's own constant could not catch a change to it.
const READ_ONLY = ['reviewer', 'Explore', 'Plan', 'claude-code-guide', 'web-fetch', 'eng-lead'];
const OFF = '{"hooks": {"subagent-watchdog": false}}';
// pathOf(len): a path inside P of exactly len characters.
const pathOf = (len) => { const p = P + '/' + 'x'.repeat(len - P.length - 1); assert.equal(p.length, len); return p; };

test('W1 repeat: one command run 15 times gives a note on run 3 only and an ask on runs 5, 10 and 15 only', () => {
  const s = sim({ project: P });
  assert.deepEqual(runs(s, 'npm test', 15), expected(15, { 3: 'note', 5: 'ask', 10: 'ask', 15: 'ask' }));
});

test('W2 repeat: runs of spaces, tabs and new lines become one space and the ends are trimmed; case, quotes and other characters still make another command', () => {
  assert.equal(normalizeCommand('  npm   test\t\t--x\n\r\n  y  '), 'npm test --x y');
  const s = sim({ project: P });
  assert.deepEqual(['npm  test', 'npm\ttest', '\n npm \r\n test \r\n'].map((c) => kind(bash(s, c))), ['-', '-', 'note']);
  const t = sim({ project: P });
  const variants = ['npm test', 'NPM test', 'npm Test', 'npm "test"', "npm 'test'", 'npm test;', 'npm test2'];
  assert.deepEqual(variants.flatMap((c) => runs(t, c, 2)), variants.flatMap(() => ['-', '-']));
});

test('W3 repeat: each command counts apart, and one repeated between others gets its note on its own 3rd run', () => {
  const s = sim({ project: P });
  const order = ['a', 'b', 'a', 'c', 'b', 'a', 'c'];
  assert.deepEqual(order.map((c) => kind(bash(s, 'run ' + c))), ['-', '-', '-', '-', '-', 'note', '-']);
});

test('W4 repeat: Bash and PowerShell commands count; Monitor, Read and a command that is not a string do not', () => {
  const s = sim({ project: P });
  assert.deepEqual([1, 2, 3].map(() => kind(call(s, 'PowerShell', { command: 'Get-ChildItem' }))), ['-', '-', 'note']);
  const none = [['Monitor', { command: 'npm test' }], ['Read', { file_path: join(P, 'a.js') }], ['Bash', { command: 42 }], ['Bash', {}], ['Grep', { command: 'npm test' }]];
  for (const [tool, input] of none) {
    const t = sim({ project: P });
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(() => kind(call(t, tool, input))), Array(6).fill('-'), tool);
    assert.deepEqual(t.agent().runs, {}, tool);
    assert.equal(t.agent().top, null, tool);
  }
});

test('W5 edit: Edit, Write, MultiEdit (file_path) and NotebookEdit (notebook_path) on a file in the project, Markdown included, reset every count at PostToolUse', () => {
  const edits = [
    ['Edit', { file_path: join(P, 'src', 'a.js'), old_string: 'a', new_string: 'b' }],
    ['Write', { file_path: join(P, 'README.md'), content: 'x' }],
    ['MultiEdit', { file_path: join(P, 'src', 'b.py'), edits: [] }],
    ['NotebookEdit', { notebook_path: join(P, 'n.ipynb'), new_source: 'x' }],
    ['Edit', { file_path: pathOf(4096) }],
  ];
  for (const [tool, input] of edits) {
    const s = sim({ project: P });
    runs(s, 'npm test', 2);
    call(s, tool, input);
    const a = s.agent();
    assert.deepEqual([a.sinceEdit, a.runs, a.top, a.edit], [0, {}, null, s.now], tool);
    assert.deepEqual(runs(s, 'npm test', 3), ['-', '-', 'note'], tool);
  }
  assert.equal(isEdit({ tool_name: 'Edit', tool_input: { file_path: pathOf(4097) }, cwd: P }, { project: P }), false);
});

test('W6 edit: a PreToolUse with no PostToolUse (a denied edit), an edit outside the project and an edit with no path reset nothing', () => {
  const outside = tempDir();
  const pre = (tool, input) => (s) => s.send(sub('PreToolUse', { tool_name: tool, tool_input: input, cwd: P }));
  const cases = {
    denied: pre('Edit', { file_path: join(P, 'a.js') }),
    outside: (s) => call(s, 'Edit', { file_path: join(outside, 'a.js') }),
    'no path': (s) => call(s, 'Edit', { old_string: 'a' }),
    'empty path': (s) => call(s, 'Write', { file_path: '' }),
    'notebook, file_path': (s) => call(s, 'NotebookEdit', { file_path: '' }),
    number: (s) => call(s, 'Edit', { file_path: 7 }),
    '4,097 characters': (s) => call(s, 'Edit', { file_path: pathOf(4097) }),
  };
  for (const [name, run] of Object.entries(cases)) {
    const s = sim({ project: P });
    runs(s, 'npm test', 2);
    run(s);
    assert.equal(s.agent().sinceEdit, 3, name);
    assert.deepEqual(runs(s, 'npm test', 1), ['note'], name);
  }
});

test('W7 edit: a relative path resolves against the input cwd, and an edit inside the agent\'s cwd counts when the cwd is outside the project', () => {
  const wt = tempDir();
  const edit = (file, cwd) => isEdit({ tool_name: 'Edit', tool_input: { file_path: file }, cwd }, { project: P });
  assert.equal(edit('src/a.js', P), true);
  assert.equal(edit('../a.js', join(P, 'sub')), true);
  assert.equal(edit('../../a.js', join(P, 'sub')), false);
  assert.equal(edit(join(wt, 'src', 'a.js'), wt), true);
  assert.equal(edit('src/a.js', wt), true);
  assert.equal(edit(join(wt, 'src', 'a.js'), P), false);
  const s = sim({ project: P });
  runs(s, 'npm test', 2, { cwd: wt });
  call(s, 'Write', { file_path: join(wt, 'b.js') }, { cwd: wt });
  assert.equal(s.agent().sinceEdit, 0);
  assert.deepEqual(runs(s, 'npm test', 3, { cwd: wt }), ['-', '-', 'note']);
});

test('W8 git commit: git commit, git -C dir commit, a commit after && and one inside bash -c reset at PostToolUse; git status, git log --grep commit, echo git commit and a commit seen only at PreToolUse do not', () => {
  const commits = ['git commit -m x', 'git -C sub commit -am "y"', 'npm test && git commit -m z', 'bash -c "npm test; git commit -m w"'];
  for (const c of commits) {
    const s = sim({ project: P });
    runs(s, 'npm test', 2);
    bash(s, c);
    assert.equal(s.agent().sinceEdit, 0, c);
    assert.deepEqual(runs(s, 'npm test', 1), ['-'], c);
  }
  const huge = 'bash -c "' + 'a;'.repeat(130000) + '"';
  assert.ok(huge.length > 260000);
  for (const c of ['git status', 'git log --grep commit', 'echo git commit', huge]) {
    const s = sim({ project: P });
    runs(s, 'npm test', 2);
    assert.doesNotThrow(() => bash(s, c), c.slice(0, 40));
    assert.equal(s.agent().sinceEdit, 3, c.slice(0, 40));
    assert.deepEqual(runs(s, 'npm test', 1), ['note'], c.slice(0, 40));
  }
  const s = sim({ project: P });
  runs(s, 'npm test', 2);
  s.send(sub('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: P }));
  assert.deepEqual(runs(s, 'npm test', 1), ['note']);
});

test('W9 no edit: 240 tool calls with no edit give a note on call 40 only and an ask on calls 80, 160 and 240 only', () => {
  const s = sim({ project: P });
  assert.deepEqual(reads(s, 240), expected(240, { 40: 'note', 80: 'ask', 160: 'ask', 240: 'ask' }));
});

test('W11 read-only: each default type and a prefixed name skip the no-edit rule and get repeat notes but no repeat asks; builder and general-purpose do not skip', () => {
  for (const type of [...READ_ONLY, 'plugin:reviewer', 'a:b:reviewer']) {
    const ex = { agent_type: type };
    assert.deepEqual(reads(sim({ project: P }), 80, ex), Array(80).fill('-'), type);
    assert.deepEqual(runs(sim({ project: P }), 'npm test', 5, ex), ['-', '-', 'note', '-', '-'], type);
  }
  for (const type of ['builder', 'general-purpose', 'reviewer:x', 'my-reviewer']) {
    const ex = { agent_type: type };
    assert.deepEqual(reads(sim({ project: P }), 80, ex), expected(80, { 40: 'note', 80: 'ask' }), type);
    assert.deepEqual(runs(sim({ project: P }), 'npm test', 5, ex), ['-', '-', 'note', '-', 'ask'], type);
  }
});

test('W12 both rules on one call: one ask that names both reasons; a note and an ask on one call give the ask', () => {
  const s = sim({ project: P, options: { repeatAsk: 4, noEditAsk: 4 } });
  const r = [1, 2, 3, 4].map(() => bash(s, 'npm test'))[3];
  assert.equal(kind(r), 'ask');
  assert.match(textOf(r), /ran 4 times/);
  assert.match(textOf(r), /4 tool calls since the last edit/);
  const t = sim({ project: P, options: { noEditAsk: 3 } });
  const q = [1, 2, 3].map(() => bash(t, 'npm test'))[2];
  assert.equal(kind(q), 'ask');
  assert.match(textOf(q), /ran 3 times/);
  assert.match(textOf(q), /3 tool calls since the last edit/);
});

test('W13 outputs: the note is additionalContext with no permissionDecision; the ask reason names the agent type and full id, the count, the command cut to 120 characters, says to report what you have and how a healthy run goes on, and gives the off switch', () => {
  const id = 'agent-' + 'z'.repeat(60);
  const long = 'npm test -- ' + 'x'.repeat(300);
  const s = sim({ project: P });
  const rs = [1, 2, 3, 4, 5].map(() => bash(s, long, { agent_id: id, agent_type: 'my-builder' }));
  const note = rs[2].output;
  assert.deepEqual(Object.keys(note), ['hookSpecificOutput']);
  assert.deepEqual(Object.keys(note.hookSpecificOutput).sort(), ['additionalContext', 'hookEventName']);
  assert.equal(note.hookSpecificOutput.hookEventName, 'PreToolUse');
  const nt = note.hookSpecificOutput.additionalContext;
  assert.match(nt, /^\[subagent-watchdog\] /);
  assert.match(nt, /ran 3 times with no edit in between/);
  assert.ok(nt.includes(long.slice(0, 120)) && !nt.includes(long.slice(0, 121)));
  assert.match(nt, /change something, or report what you have and what blocks you/);
  const ask = rs[4].output;
  assert.deepEqual(Object.keys(ask), ['hookSpecificOutput']);
  assert.deepEqual(Object.keys(ask.hookSpecificOutput).sort(), ['hookEventName', 'permissionDecision', 'permissionDecisionReason']);
  assert.equal(ask.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(ask.hookSpecificOutput.permissionDecision, 'ask');
  const reason = ask.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /^\[subagent-watchdog\] /);
  for (const part of ['my-builder', id, 'ran 5 times', long.slice(0, 120), 'report what you have and what blocks you',
    'say so in one line and go on', 'only this one call was refused', 'allowing lets the agent go on',
    'denying refuses only this one call', OFF]) assert.ok(reason.includes(part), part);
  assert.ok(!reason.includes(long.slice(0, 121)));
  const stops = reason.split(/(?<=\.)\s+/).filter((x) => /\bstop/i.test(x));
  assert.ok(stops.length > 0);
  for (const x of stops) assert.match(x, /^If you are not making progress, /, `tells the agent to stop unconditionally: ${x}`);
  const t = sim({ project: P });
  const r = Array.from({ length: 80 }, (_, i) => call(t, 'Read', { file_path: join(P, `g${i}.js`) }));
  assert.match(textOf(r[39]), /40 tool calls since the last edit/);
  assert.match(textOf(r[39]), /report what you have and what blocks you/);
  assert.match(textOf(r[79]), /80 tool calls since the last edit/);
  assert.match(textOf(r[79]), /builder agent-1/);
});

test('W14 options: positive whole numbers replace the defaults; 0, -1, 1.5, "5", null and a missing value keep them; readOnlyAgents replaces the list, drops entries that are not strings, and anything but an array keeps the default', () => {
  const defaults = { repeatNote: 3, repeatAsk: 5, noEditNote: 40, noEditAsk: 80, readOnlyAgents: READ_ONLY };
  for (const raw of [{}, null, undefined, [], 'x', 7]) assert.deepEqual(resolveOptions(raw), defaults);
  assert.deepEqual(resolveOptions({ repeatNote: 2, repeatAsk: 7, noEditNote: 1, noEditAsk: 100 }), { ...defaults, repeatNote: 2, repeatAsk: 7, noEditNote: 1, noEditAsk: 100 });
  for (const bad of [0, -1, 1.5, '5', null, undefined, true, NaN, Infinity]) {
    assert.deepEqual(resolveOptions({ repeatNote: bad, repeatAsk: bad, noEditNote: bad, noEditAsk: bad }), defaults, String(bad));
  }
  assert.deepEqual(resolveOptions({ readOnlyAgents: [3, 'a', null, 'b', {}] }).readOnlyAgents, ['a', 'b']);
  assert.deepEqual(resolveOptions({ readOnlyAgents: [] }).readOnlyAgents, []);
  for (const bad of ['reviewer', {}, null, 1]) assert.deepEqual(resolveOptions({ readOnlyAgents: bad }).readOnlyAgents, READ_ONLY);
  assert.deepEqual(runs(sim({ project: P, options: { repeatNote: 2 } }), 'npm test', 3), ['-', 'note', '-']);
  assert.deepEqual(reads(sim({ project: P, options: { readOnlyAgents: ['builder'] } }), 40), Array(40).fill('-'));
});

test('W15 agents: SubagentStart adds one with its type and start; a second keeps start and calls; a tool call adds one not seen before; SubagentStop removes it; __proto__ and constructor are plain entries', () => {
  const s = sim({ project: P });
  const r = s.send(sub('SubagentStart', { agent_type: 'Explore' }));
  const t1 = s.now;
  assert.deepEqual([r.output, r.write], [null, ['agent-1']]);
  assert.deepEqual(s.agent(), agentEntry({ type: 'Explore', start: t1, last: t1 }));
  bash(s, 'ls');
  s.send(sub('SubagentStart', { agent_type: 'Plan' }));
  assert.deepEqual([s.agent().type, s.agent().start, s.agent().calls, s.agent().last], ['Plan', t1, 1, s.now]);
  const q = s.send(sub('PreToolUse', { agent_id: 'agent-2', tool_name: 'Read', tool_input: {}, cwd: P }));
  assert.deepEqual([q.write, s.agent('agent-2').calls, s.agent('agent-2').start, s.agent('agent-2').type], [['agent-2'], 1, s.now, 'builder']);
  const st = s.send(sub('SubagentStop', { agent_id: 'agent-2' }));
  assert.deepEqual([st.output, st.remove, st.write, st.changed], [null, ['agent-2'], [], true]);
  assert.equal(s.state.agents.has('agent-2'), false);
  assert.equal(s.agent().calls, 1);
  for (const id of ['__proto__', 'constructor']) {
    const u = sim({ project: P });
    for (let i = 0; i < 2; i++) u.send(sub('PreToolUse', { agent_id: id, tool_name: 'Read', tool_input: {}, cwd: P }));
    assert.equal(u.state.agents.size, 1, id);
    assert.equal(u.agent(id).calls, 2, id);
    assert.deepEqual([...u.state.agents.keys()], [id]);
  }
});

test('W16 state: garbage, null, an array and a wrong shape read as no state; a leading BOM is skipped; serialize then parse gives the same state', () => {
  const key = 'h' + 'A'.repeat(16);
  const good = agentEntry({ calls: 3, sinceEdit: 2, edit: T0, runs: { [key]: 2 }, top: { n: 2, cmd: 'npm test' }, flight: { tool: 'Bash', cmd: 'npm test', at: T0 } });
  assert.deepEqual(parseAgent(serializeAgent(good)), good);
  assert.deepEqual(parseAgent(BOM + serializeAgent(good)), good);
  const s = sim({ project: P });
  runs(s, 'npm test', 4);
  s.send(sub('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'make' }, cwd: P }));
  assert.deepEqual(parseAgent(serializeAgent(s.agent())), s.agent());
  const j = (over) => JSON.stringify({ ...good, ...over });
  const bad = ['', 'not json', '{', 'null', '[]', '"x"', '3', '{}', BOM, j({ type: 1 }), j({ calls: '3' }), j({ start: undefined }),
    j({ runs: [] }), j({ runs: { x: 1 } }), j({ runs: { [key]: 0 } }), j({ top: 'x' }), j({ top: { n: '2', cmd: 'x' } }),
    j({ flight: { tool: 1, cmd: null, at: 1 } }), j({ flight: { tool: 'Bash', cmd: 3, at: 1 } }), j({ flight: [] }), j({ top: undefined })];
  for (const b of bad) assert.equal(parseAgent(b), null, b);
  const long = parseAgent(j({ type: 't'.repeat(500), top: { n: 2, cmd: 'c'.repeat(500) }, flight: { tool: 'T'.repeat(500), cmd: 'f'.repeat(500), at: 1 } }));
  assert.deepEqual([long.type.length, long.top.cmd.length, long.flight.tool.length, long.flight.cmd.length], [200, 80, 200, 80]);
});

test('W17 state stays small: a 100,000-character command leaves the entry under 2,000 bytes, and an agent keeps at most 200 command keys, dropping the oldest', () => {
  const s = sim({ project: P });
  s.send(sub('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'x'.repeat(100000) }, cwd: P }));
  bash(s, 'y'.repeat(100000));
  assert.ok(serializeAgent(s.agent()).length < 2000, String(serializeAgent(s.agent()).length));
  const t = sim({ project: P });
  for (let i = 0; i < 200; i++) bash(t, `cmd ${i}`);
  const held = Object.keys(t.agent().runs);
  assert.equal(held.length, 200);
  bash(t, 'cmd 5');
  assert.deepEqual(Object.keys(t.agent().runs), held, 'a repeat when 200 keys are held drops nothing');
  assert.equal(t.agent().runs[held[5]], 2);
  bash(t, 'cmd 200');
  const now = Object.keys(t.agent().runs);
  assert.equal(now.length, 200);
  assert.deepEqual(now.slice(0, 199), held.slice(1), 'the oldest key is the one dropped');
  assert.ok(!now.includes(held[0]));
});

test('W18 ignored: an agent_id that is not a valid id, a main-session PostToolUse, and the events Stop, Notification, SessionStart and an unknown one change nothing and give no output', () => {
  const base = sim({ project: P });
  bash(base, 'npm test');
  const state = base.state;
  const at = { now: base.now + 20 * MIN, options: resolveOptions({}), where: { project: P, cwd: P } };
  const tool = { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: P };
  const inputs = [
    ...[42, null, '', '../x', 'a/b', 'x'.repeat(129), {}, ['a']].map((agent_id) => sub('PreToolUse', { ...tool, agent_id })),
    main('PostToolUse', tool), main('PostToolUseFailure', tool),
    ...['Stop', 'Notification', 'SessionStart', 'Whatever', 'SubagentStart', 'SubagentStop'].map((e) => main(e, tool)),
    ...['Stop', 'Notification', 'SessionStart', 'Whatever', 'UserPromptSubmit'].map((e) => sub(e, tool)),
    null, 'x', [], {},
  ];
  for (const input of inputs) {
    const r = step(state, input, at);
    assert.deepEqual([r.output, r.changed, r.write, r.remove, r.shown], [null, false, [], [], false], JSON.stringify(input));
    assert.equal(r.state, state);
  }
  const control = step(state, main('UserPromptSubmit', { prompt: 'hi' }), at);
  assert.match(control.output.hookSpecificOutput.additionalContext, /looks stuck/, 'control: the same state shows the status');
});

test('W19 PostToolUseFailure in a subagent sets last and clears flight, and resets nothing, for Bash and for an Edit', () => {
  for (const [tool, input] of [['Bash', { command: 'npm test' }], ['Edit', { file_path: join(P, 'a.js') }]]) {
    const s = sim({ project: P });
    runs(s, 'npm test', 2);
    s.send(sub('PreToolUse', { tool_name: tool, tool_input: input, cwd: P }));
    const before = s.agent();
    assert.notEqual(before.flight, null);
    const r = s.send(sub('PostToolUseFailure', { tool_name: tool, tool_input: input, cwd: P, error: 'Exit code 1', is_interrupt: false }));
    const a = s.agent();
    assert.deepEqual([r.output, r.write], [null, ['agent-1']], tool);
    assert.deepEqual([a.flight, a.last, a.sinceEdit, a.runs, a.top, a.edit], [null, s.now, 3, before.runs, before.top, 0], tool);
  }
});
