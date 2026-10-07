#!/usr/bin/env node
// Agent hook: append the no-idle rule to every agent that is launched. A subagent that ends its turn waiting for a
// monitor, a background task or a message is not resumed by anything, so it sits idle until someone notices.
// Written in a brief, the rule was forgotten in one brief and a builder sat idle for an hour; as a hook it no longer
// depends on the orchestrator remembering it.
//
// Two paths, in the same program, each signing its copy with a different suffix so you can tell which one arrived:
//   PreToolUse on Agent|Task: returns updatedInput with the WHOLE tool input as it arrived (every field, unknown ones
//     too) and only the prompt changed, with the block at the end. Observed in practice: Claude Code validates
//     updatedInput as the complete tool input, so an updatedInput carrying only `prompt` was rejected with "The
//     required parameter `description` is missing", even though the documentation says it may be partial. No
//     permissionDecision: it neither approves nor denies the launch.
//   SubagentStart: returns additionalContext with the block. This covers agents that do not go through the Agent
//     tool; the PreToolUse path covers launches SubagentStart may not see. A repeated block does no harm.
//
// Reads the hook JSON on stdin and writes at most one single-line, ASCII-only JSON on stdout. Always exits 0 and never
// writes to stderr: it informs, it does not guard; on input it does not understand it stays silent (a hook that failed
// closed would leave every session without agents). No network, no processes, no files.
//
// The rule text can be replaced with the NO_IDLE_RULE environment variable (for example in the "env" block of
// settings.json). Exported for tests: decide(), DEFAULT_RULE.

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, projectDir } from './config.mjs';

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

/** The hook's output object, or null when there is nothing to say. */
export function decide(json, rule = DEFAULT_RULE) {
  if (json === null || typeof json !== 'object') return null;
  const b = blocks(rule);
  if (json.hook_event_name === 'PreToolUse') {
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
    const out = hookEnabled('no-idle', loadConfig({ project: projectDir(json) })) ? decide(json, rule) : null;
    if (out !== null) process.stdout.write(toAscii(out) + '\n');
  } catch {
    // Input we do not understand: stay silent.
  }
  process.exitCode = 0;
}
