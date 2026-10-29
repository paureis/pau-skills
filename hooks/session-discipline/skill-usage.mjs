#!/usr/bin/env node
// PreToolUse (Skill) + UserPromptSubmit hook: record each skill start, for which-skill's usage report.
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
//   UserPromptSubmit: a prompt that starts with /<name> followed by a space or the end is recorded, marked typed, only
//     when a SKILL.md exists for the bare name (the part after the last colon) in the user's skills folder, a synced
//     skills folder, the project's skills folder, this marketplace's own plugin skills, or, for <prefix>:<name>, the
//     synced plugin folder of that prefix. A built-in or custom command has no SKILL.md and is not recorded. A prompt
//     that does not start with a slash returns at once, before any config or file is read: the hook runs on every
//     prompt.
//
// Past 1,000,000 bytes the log keeps the newest whole lines that fit in 500,000 bytes, written to a temporary file
// next to it and renamed over it. No options besides the "hooks" switch and PAU_SKILLS_DISABLE. It never prints
// (on UserPromptSubmit stdout would reach the session's context) and exits 0 on every input, errors included.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, projectDir, readStdin, parseInput } from '../lib/config.mjs';

export const NAME = 'skill-usage';
const LIMIT = 1_000_000;
const MAX_NAME = 200;
const PROMPT_NAME = /^\/([A-Za-z0-9._:-]+)(?:\s|$)/;
const SAFE_NAME = /^[A-Za-z0-9._:-]+$/;
const BARE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const PREFIX_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SYNCED = ['.claude', 'skills', 'synced'];
const PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const hasSkill = (dir, bare) => existsSync(join(dir, bare, 'SKILL.md'));
const subdirs = (dir) => { try { return readdirSync(dir); } catch { return []; } };

/** True when a SKILL.md for the typed name exists in one of the folders a typed skill can come from. */
function isSkill(name, home, project) {
  const parts = name.split(':');
  const bare = parts.pop();
  if (!BARE_NAME.test(bare)) return false;
  if (hasSkill(join(home, '.claude', 'skills'), bare)) return true;
  if (hasSkill(join(project, '.claude', 'skills'), bare)) return true;
  const synced = join(home, ...SYNCED);
  if (subdirs(synced).some((d) => hasSkill(join(synced, d), bare))) return true;
  const plugins = join(PLUGIN_ROOT, 'skills');
  if (subdirs(plugins).some((d) => hasSkill(join(plugins, d), bare))) return true;
  const prefix = parts.pop();
  if (prefix === undefined || !PREFIX_NAME.test(prefix)) return false;
  const syncedPlugins = join(home, '.claude', 'plugins', SYNCED[2]);
  return subdirs(syncedPlugins).some((d) => hasSkill(join(syncedPlugins, d, prefix, 'skills'), bare));
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

/** The name and how it started, or null when this input records nothing. Reads no file. */
function startOf(input) {
  if (input.hook_event_name === 'UserPromptSubmit') {
    const m = PROMPT_NAME.exec(input.prompt);
    return m ? { name: m[1], how: 'typed' } : null;
  }
  if (input.hook_event_name === 'PreToolUse' && input.tool_name === 'Skill') {
    return { name: input.tool_input?.skill, how: 'agent' };
  }
  return null;
}

export async function main() {
  const input = parseInput(await readStdin());
  if (!input) return;
  if (input.hook_event_name === 'UserPromptSubmit' && !(typeof input.prompt === 'string' && input.prompt.startsWith('/'))) return;
  const start = startOf(input);
  if (!start) return;
  const { name, how } = start;
  if (typeof name !== 'string' || name.length > MAX_NAME || !SAFE_NAME.test(name)) return;
  const project = projectDir(input);
  const config = loadConfig({ project });
  if (!hookEnabled(NAME, config)) return;
  const home = process.env.PAU_SKILLS_HOME || homedir();
  if (how === 'typed' && !isSkill(name, home, project)) return;
  const dir = join(home, '.claude', 'pau-skills');
  const log = join(dir, 'skill-usage.tsv');
  mkdirSync(dir, { recursive: true });
  appendFileSync(log, `${new Date().toISOString()}\t${name}\t${how}\n`);
  trim(log, dir);
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  try { await main(); } catch { /* a usage log must never disturb a session */ }
  process.exit(0);
}
