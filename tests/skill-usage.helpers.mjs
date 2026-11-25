// Shared helpers for the skill-usage tests, and the hook inputs recorded from headless runs of Claude Code 2.1.332 and
// 2.1.302. Every start lists its events in the order Claude Code fired them. The fields every event carries (session,
// transcript, folder, permission mode, prompt id) were dropped when recorded and are added back by `event`; the args
// text of ev20 and the prompt ids are stand-ins.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repo, tempDir } from './helpers.mjs';

export const HOOK = repo('hooks', 'session-discipline', 'skill-usage.mjs');
export const ISO = /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z/.source;

export function setup() {
  const home = tempDir(); // PAU_SKILLS_HOME: where the hook must write
  const realHome = tempDir(); // HOME and USERPROFILE: must stay empty
  const project = tempDir();
  return { home, realHome, project, dir: join(home, '.claude', 'pau-skills'), log: join(home, '.claude', 'pau-skills', 'skill-usage.tsv') };
}

export function run(ctx, input, { env = {}, timeout = 10000, nodeArgs = [] } = {}) {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  const r = spawnSync(process.execPath, [...nodeArgs, HOOK], {
    input: text,
    encoding: 'utf8',
    timeout,
    env: { ...process.env, PAU_SKILLS_HOME: ctx.home, HOME: ctx.realHome, USERPROFILE: ctx.realHome, CLAUDE_PROJECT_DIR: ctx.project, PAU_SKILLS_DISABLE: '', ...env },
  });
  assert.equal(r.status, 0, `exit ${r.status} ${r.signal || ''}`);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
  assert.deepEqual(readdirSync(ctx.realHome), [], 'the hook wrote under HOME instead of PAU_SKILLS_HOME');
  return r;
}

export const lines = (ctx) => (existsSync(ctx.log) ? readFileSync(ctx.log, 'utf8').split('\n').filter(Boolean) : []);
export const names = (ctx) => lines(ctx).map((l) => l.split('\t').slice(1).join('\t'));

export function skill(dir, name) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: test skill\n---\n`);
}

const submit = (prompt) => ({ hook_event_name: 'UserPromptSubmit', prompt });
const expansion = (name, args, source) => ({
  hook_event_name: 'UserPromptExpansion',
  expansion_type: 'slash_command',
  command_name: name,
  command_args: args,
  command_source: source,
  prompt: args ? `/${name} ${args}` : `/${name}`,
});
const result = (name) => JSON.stringify({ success: true, commandName: name });
function agentStart(name, prompt, id, response = result(name), ms = 12) {
  const tool = { tool_name: 'Skill', tool_input: { skill: name } };
  return [
    submit(prompt),
    { effort: { level: 'medium' }, hook_event_name: 'PreToolUse', ...tool, tool_use_id: id },
    { effort: { level: 'medium' }, hook_event_name: 'PostToolUse', ...tool, tool_response: response, tool_use_id: id, duration_ms: ms },
  ];
}

/** Typed starts: UserPromptSubmit, then UserPromptExpansion, except ev70 (a context: fork skill), expansion first. */
export const TYPED = {
  ev1: [submit('/probe-note hello there'), expansion('probe-note', 'hello there', 'userSettings')],
  ev2: [submit('/probeplug:probe-plug go'), expansion('probeplug:probe-plug', 'go', 'plugin')],
  ev3: [submit('/probe-plug go'), expansion('probeplug:probe-plug', 'go', 'plugin')],
  ev4: [submit('/probe-typed'), expansion('probe-typed', '', 'userSettings')],
  ev11: [submit('/probe-proj now'), expansion('probe-proj', 'now', 'projectSettings')],
  ev20: [submit('/humanizer rewrite zebrafruit'), expansion('anthropic-skills:humanizer', 'rewrite zebrafruit', 'userSettings')],
  ev41: [submit('/simplify'), expansion('simplify', '', 'bundled')],
  ev40: [submit('/init'), expansion('init', '', 'builtin')],
  ev9: [submit('/probe-cmd'), expansion('probe-cmd', '', 'userSettings')],
  ev10: [submit('/probe-pcmd'), expansion('probe-pcmd', '', 'projectSettings')],
  ev60: [submit('/front:probe-nest'), expansion('front:probe-nest', '', 'projectSettings')],
  ev62: [submit('/probeplug:probe-pc'), expansion('probeplug:probe-pc', '', 'plugin')],
  ev70: [expansion('probe-fork', '', 'userSettings'), submit('/probe-fork')],
};

/** Typed prompts that fire no expansion: an unknown command, and a nested command typed without its folder. */
export const SUBMIT_ONLY = {
  ev13: [submit('/nosuch-thing hi')],
  ev61: [submit('/probe-nest')],
};

/** Agent starts: UserPromptSubmit, PreToolUse Skill, PostToolUse Skill. */
export const AGENT = {
  ev22: agentStart('anthropic-skills:humanizer', 'Use the Skill tool to start the humanizer skill, then reply with the word DONE only.', 'toolu_019JWM7LguBn6CGmgHbWt5eu'),
  ev5: agentStart('probe-note', 'Please use the Skill tool to start the probe-note skill now.', 'toolu_01Kg9K2sh4S3J7V2iSXvnjgx', undefined, 11),
  ev6: agentStart('probeplug:probe-plug', 'Please use the Skill tool to start the probeplug:probe-plug skill now.', 'toolu_01GHKB34X5Y8KsoyHqpbhMmZ', undefined, 11),
  ev71: agentStart('probe-fork', 'Use the Skill tool to start the probe-fork skill.', 'toolu_01C8L22JdCvkMvg1e5vQDRSS',
    JSON.stringify({ success: true, commandName: 'probe-fork', status: 'forked', agentId: 'a6c082a2450d39587', result: 'OLIVE' }), 931),
};

export const STARTS = { ...TYPED, ...SUBMIT_ONLY, ...AGENT };

/** One recorded event with the fields every hook input carries added back. */
export const event = (ctx, id, recorded) => ({
  ...recorded,
  session_id: 'sess-7f3a91',
  transcript_path: join(ctx.project, 'transcript-file.jsonl'),
  cwd: ctx.project,
  permission_mode: 'default',
  prompt_id: `prompt-${id}-4c1d`,
});

/** The events of a start, in their recorded order, ready to send. */
export const eventsOf = (ctx, id) => STARTS[id].map((e) => event(ctx, id, e));

/** Send every event of a start to the hook, in its recorded order. */
export function deliver(ctx, id, opts) {
  for (const e of eventsOf(ctx, id)) run(ctx, e, opts);
}
