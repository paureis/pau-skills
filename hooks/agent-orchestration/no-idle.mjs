#!/usr/bin/env node
// Agent hook: append the no-idle rule to every agent that is launched. A subagent that ends its turn waiting for a
// monitor, a background task or a message is not resumed by anything, so it sits idle until someone notices.
// Written in a brief, the rule was forgotten in one brief and a builder sat idle for an hour; as a hook it no longer
// depends on the orchestrator remembering it.
//
// SubagentStart is the default path and, by default, the only one: it returns additionalContext with the block, and
// never changes the tool call that launched the agent. Seen in two headless runs on 2026-11-11 (Claude Code
// 2.1.322), with a hook that logged each event and returned additionalContext: SubagentStart fired for an Agent launch
// in the foreground, with run_in_background: true, with isolation: "worktree" (its cwd is the agent's worktree) and
// for subagent_type: "fork", and each subagent's own transcript holds a hook_additional_context attachment with the
// hook's text. The subagents' own answers about whether they saw the text disagreed with their transcripts, so the
// transcripts are the evidence. PreToolUse input for Agent carries permission_mode; SubagentStart input does not.
//
// The PreToolUse rewrite is off by default because of auto mode: the desktop app refused an Agent launch with "a hook
// changed this call's input after auto mode reviewed it" and asked for the call again with the changed input, a round
// trip on every launch. Turn it on with {"no-idle": {"rewritePrompt": true}} in .claude/pau-skills.json (the user
// file or the project file); even then it is skipped when the call's permission_mode is "auto". When on, PreToolUse on
// Agent|Task returns updatedInput with the WHOLE tool input as it arrived (every field, unknown ones too) and only the
// prompt changed, with the block at the end. Observed in practice: Claude Code validates updatedInput as the complete
// tool input, so an updatedInput carrying only `prompt` was rejected with "The required parameter `description` is
// missing", even though the documentation says it may be partial. No permissionDecision: it neither approves nor
// denies the launch. Each path signs its copy with a different suffix, so you can tell which one arrived; a repeated
// block does no harm.
//
// Reads the hook JSON on stdin and writes at most one single-line, ASCII-only JSON on stdout. Always exits 0 and never
// writes to stderr: it informs, it does not guard; on input it does not understand it stays silent (a hook that failed
// closed would leave every session without agents). No network, no processes, no files.
//
// The rule text can be replaced with the NO_IDLE_RULE environment variable (for example in the "env" block of
// settings.json). Exported for tests: decide(), DEFAULT_RULE, blocks(), toAscii().

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir } from '../lib/config.mjs';

export const DEFAULT_RULE =
  '[no-idle] Rule: an agent that ends its turn waiting is not resumed by anything. You may start background ' +
  'processes, but never end your turn waiting for a monitor, a task or a message. To wait, use a bounded loop in the ' +
  'foreground, ten minutes at most per call, that prints the last observed state when it expires. If something does ' +
  'not finish in time, deliver your report anyway and say what was left running and what was left undone.';

export function blocks(rule = DEFAULT_RULE) {
  return { prompt: rule + ' (via: prompt)', start: rule + ' (via: start)' };
}

/** Single-line JSON with every character outside printable ASCII escaped as \uXXXX (independent of the console). */
export function toAscii(obj) {
  return JSON.stringify(obj).replace(/[^\x20-\x7e]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}

/**
 * The hook's output object, or null when there is nothing to say. `options` is the no-idle options object from the
 * config; one that is not an object counts as {}. The prompt is rewritten only when options.rewritePrompt is exactly
 * true and the call's permission_mode is not "auto".
 */
export function decide(json, rule = DEFAULT_RULE, options = {}) {
  if (json === null || typeof json !== 'object') return null;
  const opts = options !== null && typeof options === 'object' ? options : {};
  const b = blocks(rule);
  if (json.hook_event_name === 'PreToolUse') {
    if (opts.rewritePrompt !== true || json.permission_mode === 'auto') return null;
    const prompt = json.tool_input?.prompt;
    if ((json.tool_name === 'Agent' || json.tool_name === 'Task') && typeof prompt === 'string') {
      if (prompt.includes(b.prompt)) return null; // already there: only the whole block counts, not the tag
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          updatedInput: { ...json.tool_input, prompt: prompt + '\n\n' + b.prompt },
        },
      };
    }
    return null;
  }
  if (json.hook_event_name === 'SubagentStart') {
    return { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: b.start } };
  }
  return null;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (data += d));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  try {
    let input = await readStdin();
    if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);
    const rule = process.env.NO_IDLE_RULE && process.env.NO_IDLE_RULE.trim() ? process.env.NO_IDLE_RULE.trim() : DEFAULT_RULE;
    const json = JSON.parse(input);
    const config = loadConfig({ project: projectDir(json) });
    const out = hookEnabled('no-idle', config) ? decide(json, rule, hookOptions('no-idle', config)) : null;
    if (out !== null) process.stdout.write(toAscii(out) + '\n');
  } catch {
    // Input we do not understand: stay silent.
  }
  process.exitCode = 0;
}
