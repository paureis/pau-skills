// The session part of friction.mjs, reading: which session files to read, and each one's tool calls with their
// results. extractActions (skill-eval-core.mjs) gives the steps; a second pass over the same lines adds what it does not
// keep (the line, the full input, the result text and size), joined to the steps by position.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { Refusal } from './mine-redact.mjs';
import { findFolders, shownName } from './mine-transcripts.mjs';
import { extractActions } from './skill-eval-core.mjs';

/** A session id as --session and --skip take it. It is only compared with listed file names, never put in a path. */
export const ID = /^[A-Za-z0-9_-]+$/;
const RECENT_MS = 10 * 60 * 1000;
const listDir = (d) => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } };

/** The main session files in this repository's transcript folders and its worktrees', newest first. */
export function listSessions({ repo, projects }) {
  const { projects: base, found } = findFolders({ repo, projects });
  const sessions = [];
  for (const f of found) {
    for (const e of listDir(f.folder)) {
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
      const path = join(f.folder, e.name);
      sessions.push({ id: e.name.slice(0, -'.jsonl'.length), dir: f.folder, folder: shownName(basename(f.folder)), path, mtime: statSync(path).mtimeMs });
    }
  }
  sessions.sort((a, b) => b.mtime - a.mtime || (a.path < b.path ? -1 : 1));
  return { base, folders: found.length, sessions };
}

/**
 * The sessions to read: the one --session names (kept even when it is the live one), or the newest `last` ones. The
 * newest session, if it changed in the last 10 minutes, is most likely the one running this review: it is left out
 * unless keepRecent. --skip leaves a session out.
 */
export function pickSessions(all, { last, session, skip = [], keepRecent = false, now = Date.now() }) {
  if (session) {
    const hit = all.find((s) => s.id === session);
    if (!hit) throw new Refusal(`no session ${session} among this repository's transcripts`);
    return { picked: [hit], recent: 0, skipped: 0 };
  }
  let list = all;
  let recent = 0;
  if (!keepRecent && list.length && now - list[0].mtime < RECENT_MS) {
    list = list.slice(1);
    recent = 1;
  }
  const kept = list.filter((s) => !skip.includes(s.id));
  return { picked: kept.slice(0, last), recent, skipped: list.length - kept.length };
}

const contentText = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (typeof x === 'string' ? x : x?.text ?? '')).join('\n') : '');

/**
 * The calls of one stream of lines ({ n, raw, entry }), in file order: { line, tool, input, target, result }, where
 * result is { line, text, size, isError } or null. Null when the steps of extractActions do not match this pass.
 */
export function readCalls(lines) {
  const calls = [];
  const byId = new Map();
  for (const { n, entry: e } of lines) {
    if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      for (const c of e.message.content) {
        if (c?.type !== 'tool_use') continue;
        const call = { line: n, tool: c.name, input: c.input && typeof c.input === 'object' ? c.input : {}, target: '', result: null };
        calls.push(call);
        byId.set(c.id, call);
      }
    } else if (e.type === 'user' && Array.isArray(e.message?.content)) {
      for (const c of e.message.content) {
        const call = c?.type === 'tool_result' && byId.get(c.tool_use_id);
        if (!call) continue;
        const text = contentText(c.content);
        // A large result is saved to a file and replaced by a short persisted-output stub; the line's toolUseResult
        // keeps the real size.
        const persisted = e.toolUseResult?.persistedOutputSize;
        call.result = { line: n, text, size: typeof persisted === 'number' ? persisted : text.length, isError: c.is_error === true };
      }
    }
  }
  let steps;
  try { steps = extractActions(lines.map((l) => l.raw).join('\n')).steps; } catch { return null; }
  if (steps.length !== calls.length || steps.some((s, i) => s.tool !== calls[i].tool)) return null;
  steps.forEach((s, i) => { calls[i].target = s.target; });
  return calls;
}

/** The lines of one file that parse, split into its own and, in a main file, the sidechain lines of older versions. */
function readLines(path, main) {
  const own = [];
  const side = [];
  let bad = 0;
  let text = '';
  try { text = readFileSync(path, 'utf8'); } catch { return { own, side, bad: 1 }; }
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    let entry;
    try { entry = JSON.parse(raw); } catch { bad++; return; }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { bad++; return; }
    (main && entry.isSidechain ? side : own).push({ n: i + 1, raw, entry });
  });
  return { own, side, bad };
}

function agentTypeOf(metaPath) {
  try {
    const t = JSON.parse(readFileSync(metaPath, 'utf8')).agentType;
    return typeof t === 'string' && t ? t : 'unknown';
  } catch { return 'unknown'; }
}

/**
 * One session: its main file and its subagent files (<session>/subagents/agent-*.jsonl, each with an agent-*.meta.json
 * that names its agentType). Each transcript is { where, agent, calls }; agent is null for the main session.
 */
export function readSession(s) {
  const out = { key: `${s.folder}/${s.id}`, session: s, transcripts: [], subagents: 0, badLines: 0, badFiles: 0 };
  const add = (where, agent, lines) => {
    if (!lines.length) return;
    const calls = readCalls(lines);
    if (calls) out.transcripts.push({ where, agent, calls });
    else out.badFiles++;
  };
  const main = readLines(s.path, true);
  out.badLines += main.bad;
  add(`${s.folder}/${s.id}.jsonl`, null, main.own);
  add(`${s.folder}/${s.id}.jsonl`, 'unknown', main.side);
  // s.id is a listed file name, not a value from the command line.
  const subDir = join(s.dir, s.id, 'subagents');
  const subs = listDir(subDir).filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => e.name).sort();
  for (const name of subs) {
    out.subagents++;
    const sub = readLines(join(subDir, name), false);
    out.badLines += sub.bad;
    add(`${s.folder}/${s.id}/subagents/${name}`, agentTypeOf(join(subDir, name.replace(/\.jsonl$/, '.meta.json'))), sub.own);
  }
  return out;
}
