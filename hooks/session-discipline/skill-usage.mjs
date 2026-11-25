#!/usr/bin/env node
// PreToolUse (Skill) + UserPromptExpansion hook: record each skill start, for which-skill's usage report.
//
// Why: a skill nobody starts still costs a line of every session's context (its description), and a skill the agent
// starts on its own is invisible unless someone reads transcripts. One line per start answers "which skills do I
// actually use?" with counts instead of a guess.
//
// The log is <home>/.claude/pau-skills/skill-usage.tsv, where home is PAU_SKILLS_HOME or the user's home folder (as
// for the hook config), outside every repository. One line per start, tab-separated:
//   <ISO time>\t<skill name>\t<agent|typed>
// Never the prompt or its arguments, the folder, the session or the transcript.
//
//   PreToolUse with tool_name Skill: records tool_input.skill as given, marked agent.
//   UserPromptExpansion with expansion_type "slash_command": records command_name, the name Claude Code resolved
//     (/humanizer typed gives anthropic-skills:humanizer), marked typed. Nothing when command_source is not a string,
//     or is builtin (/init) or mcp. Nothing for a custom command file: with source userSettings when
//     <home>/.claude/commands/<name>.md exists, with projectSettings when <project>/.claude/commands/<name>.md exists,
//     each colon in the name a folder (front:probe-nest is front/probe-nest.md). A skill and a command file with the
//     same name in one scope are therefore not recorded. No other source reads a file.
//     shortcut: only those two folders are checked, so a command in a parent folder, in another worktree's main
//     checkout, in an --add-dir folder, in the managed folder, under CLAUDE_CONFIG_DIR, or written as
//     <commands>/<name>/SKILL.md is recorded as typed, and so is a plugin's own command (the input cannot tell it
//     from a plugin skill); check more folders if those show up in the report.
//   UserPromptSubmit and every other event: nothing.
// A name is at most 200 characters of A-Z, a-z, 0-9, ".", "_", ":" and "-"; a typed name's every colon-separated part
// also starts with a letter or digit, so ".." or "a::b" never becomes a path. An input the start check rejects
// returns before any config file or other file is read: the hook runs on every typed command.
//
// Past 1,000,000 bytes the log keeps the newest whole lines that fit in 500,000 bytes, written to a temporary file
// next to it and renamed over it. No options besides the "hooks" switch and PAU_SKILLS_DISABLE. It never prints and
// exits 0 on every input, errors included: on UserPromptExpansion stdout reaches Claude and exit 2 blocks the skill.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, projectDir, readStdin, parseInput } from '../lib/config.mjs';

export const NAME = 'skill-usage';
const LIMIT = 1_000_000;
const MAX_NAME = 200;
const SAFE_NAME = /^[A-Za-z0-9._:-]+$/;
const PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NOT_A_SKILL = new Set(['builtin', 'mcp']);

const safe = (name) => typeof name === 'string' && name.length <= MAX_NAME && SAFE_NAME.test(name);

/** True when the typed name is a custom command file in the scope Claude Code named. */
function isCommand({ name, source }, home, project) {
  const root = source === 'userSettings' ? home : source === 'projectSettings' ? project : null;
  return root !== null && existsSync(join(root, '.claude', 'commands', ...name.split(':')) + '.md');
}

/** Keep the newest whole lines that fit in half the limit: a temporary file next to the log, renamed over it. */
function trim(log, dir) {
  const size = statSync(log).size;
  if (size > LIMIT) {
    const buf = readFileSync(log);
    const keep = buf.subarray(buf.length - LIMIT / 2);
    const whole = buf[buf.length - LIMIT / 2 - 1] === 0x0a;
    const nl = keep.indexOf(0x0a);
    const body = whole ? keep : nl < 0 ? Buffer.alloc(0) : keep.subarray(nl + 1);
    const tmp = join(dir, `skill-usage.tsv.${process.pid}.tmp`);
    try {
      writeFileSync(tmp, body);
      renameSync(tmp, log);
    } catch {
      try { unlinkSync(tmp); } catch { /* nothing to remove */ }
    }
  }
}

/** The name, how it started and its source, or null when this input records nothing. Reads no file. */
function startOf(input) {
  if (input.hook_event_name === 'PreToolUse' && input.tool_name === 'Skill') {
    const name = input.tool_input?.skill;
    return safe(name) ? { name, how: 'agent' } : null;
  }
  if (input.hook_event_name === 'UserPromptExpansion' && input.expansion_type === 'slash_command') {
    const { command_name: name, command_source: source } = input;
    if (typeof source !== 'string' || NOT_A_SKILL.has(source)) return null;
    if (!safe(name) || !name.split(':').every((part) => PART.test(part))) return null;
    return { name, how: 'typed', source };
  }
  return null;
}

export async function main() {
  const input = parseInput(await readStdin());
  if (!input) return;
  const start = startOf(input);
  if (!start) return;
  const project = projectDir(input);
  const config = loadConfig({ project });
  if (!hookEnabled(NAME, config)) return;
  const home = process.env.PAU_SKILLS_HOME || homedir();
  if (start.how === 'typed' && isCommand(start, home, project)) return;
  const dir = join(home, '.claude', 'pau-skills');
  const log = join(dir, 'skill-usage.tsv');
  mkdirSync(dir, { recursive: true });
  appendFileSync(log, `${new Date().toISOString()}\t${start.name}\t${start.how}\n`);
  trim(log, dir);
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  try { await main(); } catch { /* a usage log must never disturb a session */ }
  process.exit(0);
}
