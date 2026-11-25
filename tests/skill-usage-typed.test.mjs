// skill-usage records a typed start from UserPromptExpansion (command_name as Claude Code resolved it), an agent start
// from PreToolUse Skill, and nothing from UserPromptSubmit. The inputs are the ones recorded from real runs, every event
// of a start delivered in its recorded order (tests/skill-usage.helpers.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ISO, setup, run, names, skill, STARTS, TYPED, event, eventsOf, deliver } from './skill-usage.helpers.mjs';

/** The UserPromptExpansion event of a typed start, with the common fields. */
const expansionOf = (ctx, id) => eventsOf(ctx, id).find((e) => e.hook_event_name === 'UserPromptExpansion');
/** The ev1 expansion with one field changed, or removed when the value is undefined. */
function odd(ctx, field, value) {
  const e = expansionOf(ctx, 'ev1');
  if (value === undefined) delete e[field];
  else e[field] = value;
  return e;
}
function command(root, name) {
  const file = join(root, '.claude', 'commands', ...name.split(':')) + '.md';
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, 'Say hello.\n');
}
const noLog = (ctx) => assert.equal(existsSync(ctx.log), false, `the log holds: ${names(ctx).join(', ')}`);

test('a: each typed skill start logs exactly one typed line with the resolved name, and no args, session or path', () => {
  for (const id of ['ev1', 'ev3', 'ev4', 'ev11', 'ev20', 'ev41']) {
    const ctx = setup();
    deliver(ctx, id);
    const exp = expansionOf(ctx, id);
    const text = readFileSync(ctx.log, 'utf8');
    assert.match(text, new RegExp(`^${ISO}\\t${exp.command_name}\\ttyped\\n$`), id);
    const secrets = ['sess-7f3a91', ctx.project, 'transcript-file', 'prompt-'];
    if (exp.command_args) secrets.push(exp.command_args);
    for (const s of secrets) assert.ok(!text.includes(s), `${id}: ${s}`);
  }
});

test('b: a plugin skill typed with or without its prefix logs the same name', () => {
  const ctx = setup();
  deliver(ctx, 'ev2');
  deliver(ctx, 'ev3');
  assert.deepEqual(names(ctx), ['probeplug:probe-plug\ttyped', 'probeplug:probe-plug\ttyped']);
});

test('c: a built-in, an unknown command, a nested command typed bare and /compact log nothing', () => {
  const ctx = setup();
  for (const id of ['ev40', 'ev13', 'ev61']) deliver(ctx, id);
  run(ctx, event(ctx, 'compact', { hook_event_name: 'UserPromptSubmit', prompt: '/compact' }));
  noLog(ctx);
});

test('d: a custom command file in the scope Claude Code names is not logged; in the other scope it is', () => {
  const ctx = setup();
  command(ctx.home, 'probe-cmd');
  command(ctx.project, 'probe-pcmd');
  command(ctx.project, 'front:probe-nest');
  for (const id of ['ev9', 'ev10', 'ev60']) deliver(ctx, id);
  noLog(ctx);
  const bare = setup();
  for (const id of ['ev9', 'ev10', 'ev60']) deliver(bare, id);
  assert.deepEqual(names(bare), ['probe-cmd\ttyped', 'probe-pcmd\ttyped', 'front:probe-nest\ttyped'], 'control: no files');
  const other = setup();
  command(other.project, 'probe-cmd');
  command(other.home, 'probe-pcmd');
  deliver(other, 'ev9');
  deliver(other, 'ev10');
  assert.deepEqual(names(other), ['probe-cmd\ttyped', 'probe-pcmd\ttyped'], 'scope: the file is in the other folder');
});

test('e: a plugin\'s own command is logged as typed, whatever files exist (the documented limit)', () => {
  const ctx = setup();
  command(ctx.home, 'probeplug:probe-pc');
  command(ctx.project, 'probeplug:probe-pc');
  deliver(ctx, 'ev62');
  assert.deepEqual(names(ctx), ['probeplug:probe-pc\ttyped']);
});

test('f: each agent start logs exactly one agent line', () => {
  for (const [id, name] of [['ev22', 'anthropic-skills:humanizer'], ['ev5', 'probe-note'], ['ev6', 'probeplug:probe-plug']]) {
    const ctx = setup();
    deliver(ctx, id);
    assert.deepEqual(names(ctx), [`${name}\tagent`], id);
  }
});

test('g: a UserPromptSubmit alone logs nothing, even with a SKILL.md for its name in both skills folders', () => {
  const ctx = setup();
  const bare = ['probe-note', 'probe-plug', 'probe-typed', 'probe-proj', 'humanizer', 'simplify', 'init', 'probe-cmd',
    'probe-pcmd', 'probe-nest', 'probe-pc', 'probe-fork', 'nosuch-thing', 'compact'];
  for (const n of bare) {
    skill(join(ctx.project, '.claude', 'skills'), n);
    skill(join(ctx.home, '.claude', 'skills'), n);
  }
  let sent = 0;
  for (const [id, events] of Object.entries(STARTS)) {
    for (const e of events.filter((x) => x.hook_event_name === 'UserPromptSubmit')) { run(ctx, event(ctx, id, e)); sent++; }
  }
  run(ctx, event(ctx, 'compact', { hook_event_name: 'UserPromptSubmit', prompt: '/compact' }));
  assert.equal(sent, Object.keys(STARTS).length, 'every start has one UserPromptSubmit');
  noLog(ctx);
});

test('h: an odd expansion input logs nothing', () => {
  const ctx = setup();
  const inputs = [
    odd(ctx, 'expansion_type', 'mcp_prompt'),
    odd(ctx, 'expansion_type', 'skill'),
    odd(ctx, 'expansion_type'),
    odd(ctx, 'command_name'),
    odd(ctx, 'command_name', 42),
    odd(ctx, 'command_name', ''),
    odd(ctx, 'command_name', 'probe\tnote'),
    odd(ctx, 'command_name', 'b'.repeat(201)),
    odd(ctx, 'command_source'),
    odd(ctx, 'command_source', 7),
    odd(ctx, 'command_source', 'mcp'),
  ];
  for (const source of ['userSettings', 'projectSettings', 'plugin']) {
    for (const name of ['..', '..:x', 'a::b', ':x', 'x:']) inputs.push({ ...odd(ctx, 'command_name', name), command_source: source });
  }
  for (const i of inputs) run(ctx, i);
  noLog(ctx);
  run(ctx, odd(ctx, 'command_name', 'a'.repeat(200)));
  assert.deepEqual(names(ctx), [`${'a'.repeat(200)}\ttyped`], 'control: 200 characters are logged');
});

test('i: a typed start is off by the project config and off by PAU_SKILLS_DISABLE', () => {
  const ctx = setup();
  const conf = join(ctx.project, '.claude', 'pau-skills.json');
  mkdirSync(dirname(conf), { recursive: true });
  writeFileSync(conf, JSON.stringify({ hooks: { 'skill-usage': false } }));
  deliver(ctx, 'ev1');
  writeFileSync(conf, '{}');
  deliver(ctx, 'ev1', { env: { PAU_SKILLS_DISABLE: 'skill-usage' } });
  noLog(ctx);
  deliver(ctx, 'ev1');
  assert.deepEqual(names(ctx), ['probe-note\ttyped'], 'control: on again');
});

test('j: an input the hook rejects returns before reading any config file', { skip: process.platform === 'win32' }, () => {
  const ctx = setup();
  for (const d of [ctx.home, ctx.project]) {
    mkdirSync(join(d, '.claude'), { recursive: true });
    execFileSync('mkfifo', [join(d, '.claude', 'pau-skills.json')]);
  }
  const ev5 = eventsOf(ctx, 'ev5').find((e) => e.hook_event_name === 'PreToolUse');
  const inputs = [
    eventsOf(ctx, 'ev1').find((e) => e.hook_event_name === 'UserPromptSubmit'),
    expansionOf(ctx, 'ev40'),
    odd(ctx, 'expansion_type', 'mcp_prompt'),
    odd(ctx, 'command_name', 'b'.repeat(201)),
    odd(ctx, 'command_name', 'probe\tnote'),
    odd(ctx, 'command_name', '..'),
    odd(ctx, 'command_source'),
    { ...ev5, tool_input: { skill: 'b'.repeat(201) } },
  ];
  for (const i of inputs) run(ctx, i, { timeout: 3000 });
});

test('k: a context: fork skill logs one typed line when typed (expansion first) and one agent line when the agent starts it', () => {
  const ctx = setup();
  assert.equal(TYPED.ev70[0].hook_event_name, 'UserPromptExpansion', 'the recorded order: expansion first');
  deliver(ctx, 'ev70');
  assert.deepEqual(names(ctx), ['probe-fork\ttyped']);
  const agentCtx = setup();
  deliver(agentCtx, 'ev71');
  assert.deepEqual(names(agentCtx), ['probe-fork\tagent']);
});
