// The no-idle hook adds its rule to every subagent start (SubagentStart, additionalContext) and, by default, never
// changes an Agent or Task call's input. With {"no-idle": {"rewritePrompt": true}} in .claude/pau-skills.json it also
// appends the rule to the prompt at PreToolUse, returning the WHOLE tool input with only the prompt changed, except
// when the call's permission_mode is "auto". It never decides permissions, never blocks, and stays silent on input it
// does not understand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { decide, DEFAULT_RULE, blocks } from '../hooks/agent-orchestration/no-idle.mjs';

const BOM = String.fromCharCode(0xfeff);
const E_ACUTE = String.fromCharCode(0xe9); // non-ASCII on purpose, kept out of the source
const HOOK = repo('hooks', 'agent-orchestration', 'no-idle.mjs');
// The hook reads the user and project config and PAU_SKILLS_DISABLE; this env keeps the caller's own out of the result.
const isolated = () => ({ PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: tempDir(), PAU_SKILLS_DISABLE: '' });
// Writes <dir>/.claude/pau-skills.json with the given text; isolated() gives empty folders, so .claude is made first.
const writeConfig = (dir, text) => {
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'pau-skills.json'), text);
};
const launch = (extra = {}) => ({
  hook_event_name: 'PreToolUse', tool_name: 'Agent',
  tool_input: { description: 'Build it', prompt: 'Do the work.', subagent_type: 'general-purpose', name: 'builder', some_future_field: { x: 1 }, ...extra },
});
const ON = { rewritePrompt: true };
const promptOf = (out) => (out === null ? null : out.hookSpecificOutput.updatedInput.prompt);
const silent = (r) => {
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
};

test('default: an Agent or Task launch is left unchanged', () => {
  assert.equal(decide(launch()), null);
  assert.equal(decide({ ...launch(), tool_name: 'Task' }), null);
});

test('options that are not rewritePrompt: true keep the rewrite off', () => {
  const opts = [{ rewritePrompt: false }, { rewritePrompt: 'true' }, { rewritePrompt: 1 }, { rewritePrompt: null }, null, 'x'];
  assert.deepEqual(opts.map((o) => promptOf(decide(launch(), 'Rule R.', o))), [null, null, null, null, null, null]);
});

test('with rewritePrompt: true the result follows permission_mode: auto is skipped, every other mode is rewritten', () => {
  const inputs = [
    { ...launch(), permission_mode: 'auto' },
    { ...launch(), permission_mode: 'default' },
    { ...launch(), permission_mode: 'acceptEdits' },
    { ...launch(), permission_mode: 'auto' },
    { ...launch(), permission_mode: 'plan' },
    { ...launch(), permission_mode: 'bypassPermissions' },
    launch(),
    { ...launch(), permission_mode: 'auto' },
  ];
  const rewritten = 'Do the work.\n\nRule R. (via: prompt)';
  assert.deepEqual(inputs.map((i) => promptOf(decide(i, 'Rule R.', { rewritePrompt: true }))), [
    null, rewritten, rewritten, null, rewritten, rewritten, rewritten, null,
  ]);
});

test('with rewritePrompt: true a Task call in auto mode is left unchanged too', () => {
  assert.equal(decide({ ...launch(), tool_name: 'Task', permission_mode: 'auto' }, 'Rule R.', { rewritePrompt: true }), null);
});

test('SubagentStart: the start block whatever the options and the permission_mode', () => {
  const start = { hook_event_name: 'SubagentStart', agent_type: 'general-purpose' };
  const contextOf = (out) => out.hookSpecificOutput.additionalContext;
  assert.equal(contextOf(decide(start, 'Rule R.')), 'Rule R. (via: start)');
  assert.equal(contextOf(decide(start, 'Rule R.', { rewritePrompt: true })), 'Rule R. (via: start)');
  assert.equal(contextOf(decide(start, 'Rule R.', { rewritePrompt: false })), 'Rule R. (via: start)');
  assert.equal(contextOf(decide({ ...start, permission_mode: 'auto' }, 'Rule R.')), 'Rule R. (via: start)');
  assert.equal(contextOf(decide({ ...start, permission_mode: 'auto' }, 'Rule R.', { rewritePrompt: true })), 'Rule R. (via: start)');
});

test('PreToolUse on Agent: every input field survives and only the prompt gains the block at the end', () => {
  const input = launch();
  const out = decide(input, DEFAULT_RULE, ON);
  const u = out.hookSpecificOutput.updatedInput;
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
  for (const k of Object.keys(input.tool_input)) if (k !== 'prompt') assert.deepEqual(u[k], input.tool_input[k], k);
  assert.equal(u.prompt, 'Do the work.\n\n' + blocks().prompt);
});

test('Task is accepted defensively; other tools and agents without a string prompt are ignored', () => {
  assert.ok(decide({ ...launch(), tool_name: 'Task' }, DEFAULT_RULE, ON));
  assert.equal(decide({ ...launch(), tool_name: 'TaskCreate' }, DEFAULT_RULE, ON), null);
  assert.equal(decide({ ...launch(), tool_name: 'Bash' }, DEFAULT_RULE, ON), null);
  assert.equal(decide(launch({ prompt: 5 }), DEFAULT_RULE, ON), null);
});

test('idempotent: a prompt that already carries the whole block is left alone, the bare tag is not enough', () => {
  assert.equal(decide(launch({ prompt: 'x\n\n' + blocks().prompt }), DEFAULT_RULE, ON), null);
  assert.ok(decide(launch({ prompt: 'mentions [no-idle] only' }), DEFAULT_RULE, ON));
});

test('SubagentStart: additionalContext with the start-signed block', () => {
  const out = decide({ hook_event_name: 'SubagentStart', agent_type: 'general-purpose' });
  assert.equal(out.hookSpecificOutput.additionalContext, DEFAULT_RULE + ' (via: start)');
});

test('as a process with no config file: a launch is silent, exit 0', () => {
  silent(runNode(HOOK, { input: JSON.stringify(launch()), env: isolated() }));
});

test('as a process: one ASCII line, exit 0, nothing on stderr, BOM tolerated', () => {
  const env = isolated();
  writeConfig(env.CLAUDE_PROJECT_DIR, '{"no-idle":{"rewritePrompt":true}}');
  const r = runNode(HOOK, { input: BOM + JSON.stringify(launch({ prompt: 'caf' + E_ACUTE })), env });
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /^[\x20-\x7e]+\n$/);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.updatedInput.prompt.startsWith('caf' + E_ACUTE), true);
});

test('as a process: the option in the project file and permission_mode auto: silent', () => {
  const env = isolated();
  writeConfig(env.CLAUDE_PROJECT_DIR, '{"no-idle":{"rewritePrompt":true}}');
  silent(runNode(HOOK, { input: JSON.stringify({ ...launch(), permission_mode: 'auto' }), env }));
});

test('as a process: the option only in the user file turns the rewrite on', () => {
  const env = isolated();
  writeConfig(env.PAU_SKILLS_HOME, '{"no-idle":{"rewritePrompt":true}}');
  const r = runNode(HOOK, { input: JSON.stringify(launch()), env: { ...env, NO_IDLE_RULE: 'Custom rule.' } });
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.updatedInput.prompt, 'Do the work.\n\nCustom rule. (via: prompt)');
});

test('as a process: the option on and the hook turned off in the project file: silent', () => {
  const env = isolated();
  writeConfig(env.CLAUDE_PROJECT_DIR, '{"hooks":{"no-idle":false},"no-idle":{"rewritePrompt":true}}');
  silent(runNode(HOOK, { input: JSON.stringify(launch()), env }));
});

test('as a process: the option on and the hook turned off with PAU_SKILLS_DISABLE: silent', () => {
  const env = isolated();
  writeConfig(env.CLAUDE_PROJECT_DIR, '{"no-idle":{"rewritePrompt":true}}');
  silent(runNode(HOOK, { input: JSON.stringify(launch()), env: { ...env, PAU_SKILLS_DISABLE: 'no-idle' } }));
});

test('as a process: the option on and NO_IDLE_RULE: the prompt ends with the custom rule', () => {
  const env = isolated();
  writeConfig(env.CLAUDE_PROJECT_DIR, '{"no-idle":{"rewritePrompt":true}}');
  const r = runNode(HOOK, { input: JSON.stringify(launch()), env: { ...env, NO_IDLE_RULE: 'Custom rule.' } });
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.updatedInput.prompt, 'Do the work.\n\nCustom rule. (via: prompt)');
});

test('as a process: SubagentStart with the option on and NO_IDLE_RULE: the custom start block', () => {
  const env = isolated();
  writeConfig(env.CLAUDE_PROJECT_DIR, '{"no-idle":{"rewritePrompt":true}}');
  const r = runNode(HOOK, { input: JSON.stringify({ hook_event_name: 'SubagentStart' }), env: { ...env, NO_IDLE_RULE: 'Custom rule.' } });
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, 'Custom rule. (via: start)');
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
  const r = runNode(HOOK, { input: JSON.stringify({ hook_event_name: 'SubagentStart' }), env: { ...isolated(), NO_IDLE_RULE: 'Custom rule.' } });
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, 'Custom rule. (via: start)');
});
