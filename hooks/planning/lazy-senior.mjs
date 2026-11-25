#!/usr/bin/env node
// Session and agent hook: add the lazy-senior ruleset to the context of every session and every subagent. The rules
// ask for the smallest complete change: first ask whether the code needs to exist, then reuse the codebase, the
// standard library or an installed dependency, and finish every caller and test the change must reach.
//
// Why: an agent asked for a small feature tends to write a layer, an option and a helper nobody asked for, or stops
// at the first file and leaves the callers broken. Written once in a skill, the rules only reach a session that
// starts the skill; as a hook they reach every session, and every subagent too, since SessionStart context never
// reaches a subagent. The text opens with "When you write or change code", so an agent that only reads or reviews
// knows the rules are not for it.
//
// Events: SessionStart (startup, resume, clear, compact) and SubagentStart, each answered with additionalContext.
// Every other event, and input it does not understand, gets no output.
//
// Reads the hook JSON on stdin and writes at most one single-line JSON on stdout. Always exits 0 and never writes to
// stderr: it informs, it does not guard. It uses no network, starts no processes, reads only two files
// (~/.claude/pau-skills.json and the project's .claude/pau-skills.json, through loadConfig) and writes no files.
//
// On by default. Turn it off with "hooks": {"lazy-senior": false} in .claude/pau-skills.json (the user file or the
// project file), or PAU_SKILLS_DISABLE=lazy-senior for one session. The skill's RULES.md holds the same text as
// RULESET (a test compares them). Exported for tests: RULESET, SIGNATURE, decide().
//
// Adapted from DietrichGebert/ponytail (MIT); see NOTICE.

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, projectDir, readStdin } from '../lib/config.mjs';

export const RULESET = [
  'When you write or change code, make the smallest complete change.',
  'Before you write code, stop at the first of these that does the whole job:',
  '1. It does not need to exist: leave out what nobody asked for, and say in one line what you left out.',
  '2. This codebase already does it: use that, the way the code around it does.',
  '3. The standard library or the platform does it, unless the project has its own.',
  '4. An installed dependency does it. Never add a dependency for a few lines.',
  '5. One line that a reader understands at a glance.',
  '6. Otherwise, the least code that works.',
  'Be lazy about the solution, never about the change: read the code it touches, list every caller, test, fixture, ' +
    'config and export it must reach, and finish all of them.',
  'On a bug fix, before you edit, search for every caller of the function you touch, then fix the cause once in the ' +
    'shared code.',
  'Never cut validation at a trust boundary, error handling that prevents data loss, security, accessibility, the ' +
    'calibration real hardware needs, or anything the user asked for.',
  'Add no layer, wrapper, option or config nobody asked for; deleting beats adding.',
  'A new file needs a reason, such as a new responsibility or a public interface, never size alone: extend the ' +
    'nearest existing file first, code that changes together stays together, and a file you split says in one line ' +
    'where its parts went.',
  'Non-trivial logic and every bug fix leave a small test of the edge cases they turn on.',
  'Comment a known limit as shortcut: <the limit>, <when to upgrade>.',
  'End with what you skipped or did not check, and any risk.',
  "The project's instructions and the task's output format come first.",
].join('\n');

export const SIGNATURE =
  '(lazy-senior hook. Turn it off with "hooks": {"lazy-senior": false} in .claude/pau-skills.json, or ' +
  'PAU_SKILLS_DISABLE=lazy-senior.)';

const EVENTS = new Set(['SessionStart', 'SubagentStart']);

/** The hook's output object for a SessionStart or SubagentStart input, or null for anything else. Pure. */
export function decide(json) {
  if (json === null || typeof json !== 'object') return null;
  const event = json.hook_event_name;
  if (!EVENTS.has(event)) return null;
  return { hookSpecificOutput: { hookEventName: event, additionalContext: RULESET + '\n' + SIGNATURE } };
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  try {
    let input = await readStdin();
    if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);
    const json = JSON.parse(input);
    const out = decide(json);
    if (out !== null && hookEnabled('lazy-senior', loadConfig({ project: projectDir(json) }))) {
      process.stdout.write(JSON.stringify(out) + '\n');
    }
  } catch {
    // Input we do not understand: stay silent.
  }
  process.exitCode = 0;
}
