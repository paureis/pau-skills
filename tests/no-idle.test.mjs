// The no-idle hook appends its rule to every agent launch (PreToolUse on Agent) and every subagent start
// (SubagentStart), returns the WHOLE tool input with only the prompt changed, never decides permissions, never
// blocks, and stays silent on input it does not understand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plugin, runNode } from './helpers.mjs';
import { decide, DEFAULT_RULE, blocks } from '../plugins/agent-orchestration/scripts/no-idle.mjs';

const BOM = String.fromCharCode(0xfeff);
const E_ACUTE = String.fromCharCode(0xe9); // non-ASCII on purpose, kept out of the source
const HOOK = plugin('agent-orchestration', 'scripts', 'no-idle.mjs');
const launch = (extra = {}) => ({
  hook_event_name: 'PreToolUse', tool_name: 'Agent',
  tool_input: { description: 'Build it', prompt: 'Do the work.', subagent_type: 'general-purpose', name: 'builder', some_future_field: { x: 1 }, ...extra },
});

test('PreToolUse on Agent: every input field survives and only the prompt gains the block at the end', () => {
  const input = launch();
  const out = decide(input);
  const u = out.hookSpecificOutput.updatedInput;
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
  for (const k of Object.keys(input.tool_input)) if (k !== 'prompt') assert.deepEqual(u[k], input.tool_input[k], k);
  assert.equal(u.prompt, 'Do the work.\n\n' + blocks().prompt);
});

test('Task is accepted defensively; other tools and agents without a string prompt are ignored', () => {
  assert.ok(decide({ ...launch(), tool_name: 'Task' }));
  assert.equal(decide({ ...launch(), tool_name: 'TaskCreate' }), null);
  assert.equal(decide({ ...launch(), tool_name: 'Bash' }), null);
  assert.equal(decide(launch({ prompt: 5 })), null);
});

test('idempotent: a prompt that already carries the whole block is left alone, the bare tag is not enough', () => {
  assert.equal(decide(launch({ prompt: 'x\n\n' + blocks().prompt })), null);
  assert.ok(decide(launch({ prompt: 'mentions [no-idle] only' })));
});

test('SubagentStart: additionalContext with the start-signed block', () => {
  const out = decide({ hook_event_name: 'SubagentStart', agent_type: 'general-purpose' });
  assert.equal(out.hookSpecificOutput.additionalContext, DEFAULT_RULE + ' (via: start)');
});

test('as a process: one ASCII line, exit 0, nothing on stderr, BOM tolerated', () => {
  const r = runNode(HOOK, { input: BOM + JSON.stringify(launch({ prompt: 'caf' + E_ACUTE })) });
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /^[\x20-\x7e]+\n$/);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.updatedInput.prompt.startsWith('caf' + E_ACUTE), true);
});

test('as a process: garbage, empty and unrelated events are silent with exit 0', () => {
  for (const input of ['not json', '', 'null', JSON.stringify({ hook_event_name: 'Stop' })]) {
    const r = runNode(HOOK, { input });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '');
  }
});

test('NO_IDLE_RULE replaces the rule text', () => {
  const r = runNode(HOOK, { input: JSON.stringify({ hook_event_name: 'SubagentStart' }), env: { NO_IDLE_RULE: 'Custom rule.' } });
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, 'Custom rule. (via: start)');
});
