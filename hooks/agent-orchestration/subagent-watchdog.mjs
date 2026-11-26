#!/usr/bin/env node
// Agent hook: watch subagents while they run. Inside a subagent it adds a note, then asks, when the same shell command
// runs again with no edit in between, or when a long stretch of tool calls passes with no edit. In the main session,
// when at least one subagent is flagged, it adds one line per subagent running or just finished (minutes, tool
// calls, repeats, "looks stuck" or a long-running command), at most once every 5 minutes, and drops an agent silent
// for 60 minutes or with a call in flight for 120 (not a wait). It never stops an agent: stopping one with TaskStop
// stays the orchestrator's or the owner's choice. Every decision is in subagent-watchdog-logic.mjs and
// subagent-watchdog-status.mjs; this file reads stdin, the config and the agent definitions, keeps the state files
// and prints the output.
//
// Why: a subagent sometimes spends half an hour rerunning tests for a one-line change, loops, or stalls, and nobody
// notices until it reports. A stalled agent makes no tool calls, so its own hooks never fire; only the main session
// can see a stall. Decision 22: never cut off a healthy long run; stopping needs a yes; a hook in pau-skills-hooks
// that needs no skill and works in cloud sessions. Decision 23 is the design, decision 30 the owner's four answers.
//
// Events: SubagentStart (read the agent's definition, add the agent, then prune), PreToolUse (count, then note or ask in a subagent; the status in
// the main session), PostToolUse (end the call in flight; an edit resets the counts; in the main session, TaskStop
// removes the agent it names), PostToolUseFailure (end the call in flight, reset nothing), UserPromptSubmit (the
// status), SubagentStop (remove the agent). Facts from two headless prototypes (decision 23, and Claude Code 2.1.330
// on 2026-11-23): subagent events carry the main session's session_id with their own agent_id and agent_type, main
// session events carry no agent_id; "ask" in claude -p refuses that one call, the reason reaches the agent and it goes
// on; a refused call has no PostToolUse; a failed command fires PostToolUseFailure; an agent stopped with TaskStop gets
// no SubagentStop, and TaskStop's task_id is that agent's agent_id.
//
// Agent definitions, at SubagentStart only (subagent-watchdog-agents.mjs): <project>/.claude/agents/*.md, then
// <home>/.claude/agents/*.md, home being PAU_SKILLS_HOME or else the user's home, the same home as the config. The
// type is matched to the frontmatter name line; a definition that lists tools and none of Edit, MultiEdit or
// NotebookEdit makes the type read-only, stored as ro in its state. Top level of each folder only, at most 200 files
// and 64 KB a file; plugin agents, CLAUDE_CONFIG_DIR and subfolders are not read. A run with Claude Code 2.1.332
// (2026-11-26) showed that agent_type is the name line and that CLAUDE_PROJECT_DIR is set for hooks.
//
// State: <os.tmpdir()>/pau-skills-watchdog-<uid>/<session_id>/<agent_id>.json (no -<uid> where the platform has no
// user ids), one file per agent, and a file "shown" with the main session's last status time. Both ids must match
// ^[A-Za-z0-9_-]{1,128}$, or the event is ignored. Before any read, write or prune, the base folder and the session
// folder must be real directories (not links), owned by this user and not writable by group or others (where the
// platform has user ids); otherwise the hook does nothing. They are made with mode 0700, only when a state file is
// first written. A write goes to <file>.<pid>.<8 random hex>.tmp (flag wx, mode 0600) and is renamed over the file,
// so a reader sees the whole old file or the whole new one; the file itself is never opened for writing. A file that
// does not parse reads as no state and the next write replaces it. Concurrency: each agent writes only its own file,
// so no agent's write can undo another's. Two parallel tool calls of the same agent can still lose an update; that
// can move a note or an ask by a call either way (a lost edit reset can bring one early), and only for parallel calls
// of one agent. SubagentStart prunes: in the base folder, every session folder whose newest file is more than a day
// old (regular files only; a folder holding anything else is left), and in its own session folder every .json, .tmp
// and shown file more than a day old. Links are never followed.
//
// Options in .claude/pau-skills.json: {"subagent-watchdog": {"repeatNote": 3, "repeatAsk": 5, "noEditNote": 40,
// "noEditAsk": 80, "readOnlyAgents": [...]}}; readOnlyAgents adds to the six defaults. Off with
// {"hooks": {"subagent-watchdog": false}}. At most one line of JSON on stdout, nothing on stderr, exit 0 on every
// input. No network and no child processes.
import * as fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';
import {
  NAME, LIMITS, PATTERNS, emptyState, parseAgent, parseShown, resolveOptions, route, serializeAgent, step, validId,
} from './subagent-watchdog-logic.mjs';
import { definedReadOnly } from './subagent-watchdog-agents.mjs';

export const SESSION_ID = PATTERNS.id;
const SHOWN = 'shown';

/** The state paths of one session under the temp folder. */
export function paths(session, tmp = tmpdir()) {
  // One base folder per user, so a shared /tmp where another user made theirs first does not silence the hook.
  const base = join(tmp, 'pau-skills-watchdog' + (typeof process.getuid === 'function' ? '-' + process.getuid() : ''));
  const dir = join(base, session);
  return { base, dir, agent: (id) => join(dir, id + '.json'), shown: join(dir, SHOWN) };
}

/** 'ok' for a real directory of this user that no one else can write, 'missing', or 'bad'. */
function folder(dir, io) {
  let st;
  try { st = io.lstatSync(dir); } catch (e) { return e && e.code === 'ENOENT' ? 'missing' : 'bad'; }
  if (!st.isDirectory() || st.isSymbolicLink()) return 'bad';
  if (typeof process.getuid === 'function' && (st.uid !== process.getuid() || (st.mode & 0o022) !== 0)) return 'bad';
  return 'ok';
}

/** The base folder, then the session folder: 'ok', 'missing' or 'bad'. With create, missing ones are made (0700). */
export function folders(p, io = fs, create = false) {
  for (const dir of [p.base, p.dir]) {
    let f = folder(dir, io);
    if (f === 'missing' && create) {
      try { io.mkdirSync(dir, { mode: 0o700 }); } catch { /* another process may have made it */ }
      f = folder(dir, io);
    }
    if (f !== 'ok') return f;
  }
  return 'ok';
}

const list = (dir, io) => { try { return io.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };
const text = (file, io) => { try { return io.readFileSync(file, 'utf8'); } catch { return null; } };

/** The state: one agent's (id), or every agent's and the shown time (id null). Call only after folders() is 'ok'. */
export function read(p, id, io = fs) {
  const state = emptyState();
  if (id !== null) {
    const a = parseAgent(text(p.agent(id), io));
    if (a) state.agents.set(id, a);
    return state;
  }
  for (const d of list(p.dir, io)) {
    const name = d.name.slice(0, -'.json'.length);
    if (!d.isFile() || !d.name.endsWith('.json') || !validId(name)) continue;
    const a = parseAgent(text(p.agent(name), io));
    if (a) state.agents.set(name, a);
  }
  if (state.agents.size) state.shownAt = parseShown(text(p.shown, io));
  return state;
}

/** Write text to file through a temp file and a rename. False, silently, on any error. */
export function write(p, file, body, io = fs) {
  if (folders(p, io, true) !== 'ok') return false;
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    io.writeFileSync(tmp, body, { flag: 'wx', mode: 0o600 });
    io.renameSync(tmp, file);
    return true;
  } catch {
    try { io.unlinkSync(tmp); } catch { /* it may never have been made */ }
    return false;
  }
}

const unlink = (file, io) => { try { io.unlinkSync(file); } catch { /* already gone */ } };
const mtime = (file, io) => { try { return io.lstatSync(file).mtimeMs; } catch { return null; } };

/** Remove old state: other session folders whose newest file is over a day old, and old files of this session. */
export function prune(p, session, now = Date.now(), io = fs) {
  if (folder(p.base, io) !== 'ok') return;
  for (const d of list(p.base, io)) {
    if (!d.isDirectory() || !validId(d.name)) continue; // a link, a file or another name: left alone
    const dir = join(p.base, d.name);
    if (folder(dir, io) !== 'ok') continue;
    const entries = list(dir, io);
    if (d.name === session) {
      for (const e of entries) {
        if (!e.isFile() || !(e.name.endsWith('.json') || e.name.endsWith('.tmp') || e.name === SHOWN)) continue;
        const t = mtime(join(dir, e.name), io);
        if (t !== null && now - t > LIMITS.day) unlink(join(dir, e.name), io);
      }
      continue;
    }
    if (!entries.every((e) => e.isFile())) continue;
    const times = entries.length ? entries.map((e) => mtime(join(dir, e.name), io)) : [mtime(dir, io)];
    if (times.some((t) => t === null || now - t <= LIMITS.day)) continue;
    for (const e of entries) unlink(join(dir, e.name), io);
    try { io.rmdirSync(dir); } catch { /* not empty after all: leave it */ }
  }
}

/** One hook event: read the state it needs, decide, write what changed. Returns the output object or null. */
export function update(input, { now = Date.now(), env = process.env, io = fs, tmp = tmpdir() } = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
  if (typeof input.session_id !== 'string' || !SESSION_ID.test(input.session_id)) return null;
  const r = route(input);
  if (r === null) return null;
  const project = projectDir(input, env);
  const home = env.PAU_SKILLS_HOME || homedir();
  const config = loadConfig({ project, home });
  if (!hookEnabled(NAME, config, env)) return null;
  const options = resolveOptions(hookOptions(NAME, config));
  const p = paths(input.session_id, tmp);
  const where = folders(p, io);
  if (where === 'bad') return null;
  const needs = r.who === 'sub' ? r.id : r.status ? null : undefined;
  const state = where === 'ok' && needs !== undefined ? read(p, needs, io) : emptyState();
  const ro = r.who === 'sub' && input.hook_event_name === 'SubagentStart' && definedReadOnly(input.agent_type, { project, home, io });
  const res = step(state, input, { now, options, ro });
  for (const id of res.write) write(p, p.agent(id), serializeAgent(res.state.agents.get(id)), io);
  if (res.remove.length && folders(p, io) === 'ok') for (const id of res.remove) unlink(p.agent(id), io);
  if (res.shown) write(p, p.shown, String(res.state.shownAt), io);
  if (r.who === 'sub' && input.hook_event_name === 'SubagentStart') prune(p, input.session_id, now, io);
  return res.output;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(fs.realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  try {
    const out = update(parseInput(await readStdin()));
    if (out) process.stdout.write(JSON.stringify(out) + '\n');
  } catch {
    // Input or a state we do not understand: stay silent.
  }
  process.exitCode = 0;
}
