#!/usr/bin/env node
// PreCompact + SessionStart(compact) hook: save the facts a compaction tends to lose, and hand them back right after.
//
// Why: compaction keeps the gist and drops the specifics: the exact words of the user's last requests, the list of
// files already touched, the commands that were run, the open todo items. The agent comes back from a compaction
// confident and slightly wrong, redoing finished work or forgetting a constraint the user stated twice. A handoff
// written by hand fixes this, but compaction usually starts automatically, at the moment nobody is thinking about it.
//
// PreCompact: reads the transcript and writes a snapshot to <project>/.claude/pau-skills/snapshots/<time>.md:
//   - the user's last five messages (trimmed), word for word,
//   - every file edited in the session, most recent last,
//   - the last ten shell commands,
//   - the latest todo list, if the agent kept one,
//   - git branch and short status.
// The snapshot also records which compaction this is ("compaction: N" under the title): the compact_boundary lines
// in the transcript plus one, since the new boundary cannot exist yet. Under it goes "session: <session_id>", so a
// snapshot from another session in the same project is not taken for this one. The folder gets a .gitignore of "*",
// so snapshots never reach a commit. Only the newest ten are kept.
//
// SessionStart with source "compact": prints the newest snapshot (if it is under an hour old) as additional context,
// so the facts are back in the window the moment the compacted session resumes. A snapshot that records another
// session, or any session when the input has none, is not printed; one that records no session (older) still is.
// It also works out which compaction this is from the transcript (see compactionNumber) and takes the larger of that
// and the count of a snapshot from the same session. From the handoffAfter-th compaction on (default 2), it puts a
// line first that tells the session to finish the current step, write a handoff or the next kickoff and tell the
// user to start a new session: after two compactions the session works from a summary of a summary. No readable
// transcript, no line.
//
// The limit: once the session has compacted maxCompactions times (default 2), PreCompact still writes the snapshot,
// then blocks the compaction with a reason that says so (the owner's request, decision 38). Claude Code compacts
// anyway when the request cannot go out uncompacted, which is why the snapshot comes first. The hand-off line at
// the limit says the next compaction will be blocked.
//
// Options in .claude/pau-skills.json:
//   { "compact-snapshot": { "dir": ".claude/pau-skills/snapshots", "keep": 10, "handoffAfter": 2,
//                           "maxCompactions": 2 } }
// handoffAfter and maxCompactions are whole numbers of 0 or more; 0 turns each off; an invalid value keeps 2.
// Exits 0 always; it blocks a compaction only past the limit.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';

export const NAME = 'compact-snapshot';
const MAX_AGE_MS = 60 * 60 * 1000;

function parseTranscript(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* partial line */ }
  }
  return out;
}

// The compact_boundary lines in the main thread, and whether an assistant line comes after the last one.
function boundaries(entries) {
  let count = 0;
  let assistantAfter = false;
  for (const e of entries) {
    if (!e || typeof e !== 'object' || e.isSidechain === true) continue;
    if (e.type === 'system' && e.subtype === 'compact_boundary') { count++; assistantAfter = false; }
    else if (e.type === 'assistant') assistantAfter = true;
  }
  return { count, assistantAfter };
}

/** Which compaction this is, at SessionStart "compact", from the transcript text. Pure. */
export function compactionNumber(text) {
  const { count, assistantAfter } = boundaries(parseTranscript(text));
  if (count === 0) return 1;
  // Claude Code writes the transcript late, so whether this compaction's boundary is on disk when SessionStart fires
  // is a race: a probe found it missing (the line was stamped 38 ms before the hook ran), another machine may find it
  // there. An assistant line after the last boundary means work went on after it, so that boundary is an earlier
  // compaction and the new one is not written yet. Nothing after it but its summary means it is this compaction.
  return assistantAfter ? count + 1 : count;
}

/** The handoffAfter option: a whole number of 0 or more, else 2. */
export function handoffAfter(opts) {
  const h = opts?.handoffAfter;
  return Number.isInteger(h) && h >= 0 ? h : 2;
}

/** The maxCompactions option: a whole number of 0 or more, else 2. 0 means no limit. */
export function maxCompactions(opts) {
  const m = opts?.maxCompactions;
  return Number.isInteger(m) && m >= 0 ? m : 2;
}

/** At PreCompact: the reason to block when the session has already compacted maxCompactions times, else ''. Pure. */
export function blockReason({ transcript, opts }) {
  const max = maxCompactions(opts);
  // At PreCompact the boundaries on disk are the compactions already done; the new one is not written yet.
  const done = boundaries(parseTranscript(transcript)).count;
  if (max === 0 || done < max) return '';
  const times = done === 2 ? 'twice' : `${done} times`;
  return `[compact-snapshot] This session has already compacted ${times}, its limit (maxCompactions in .claude/pau-skills.json). This compaction is blocked: finish the current step, write a handoff or the next kickoff, and tell the user to start a new session.`;
}

/** A session_id fit to write on one snapshot line: a non-empty string of at most 200 characters, no line break. */
export function sessionKey(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && !/[\r\n]/.test(id) ? id : '';
}

/** The text SessionStart "compact" prints: the hand-off line when due, then the snapshot. '' for nothing. Pure. */
export function compactNote({ transcript, snap, opts, session }) {
  const parts = [];
  const after = handoffAfter(opts);
  const sid = sessionKey(session);
  const same = Boolean(snap && snap.session && sid && snap.session === sid);
  if (typeof transcript === 'string' && after > 0) {
    const n = Math.max(compactionNumber(transcript), same ? snap.compaction : 0);
    const max = maxCompactions(opts);
    const last = max > 0 && n >= max ? ' This session has reached its limit of compactions, so the next one will be blocked.' : '';
    if (n >= after) parts.push(`[compact-snapshot] This is compaction ${n} in this session. Finish the current step, then write a handoff or the next kickoff and tell the user to start a new session.${last}`);
  }
  // Another session's snapshot is not this session's facts; one that records no session predates the session line.
  if (snap && (!snap.session || same)) parts.push(`[compact-snapshot] The conversation was just compacted. These facts were saved from before it (${snap.path}); treat them as exact where the summary is vague:\n\n${snap.text.slice(0, 6000)}`);
  return parts.join('\n\n');
}

const trim = (s, n) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 3) + '...' : t; };

function promptText(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta || entry.isSidechain) return null;
  const c = entry.message?.content;
  if (typeof c === 'string') return c.trim() || null;
  if (!Array.isArray(c) || c.some((b) => b?.type === 'tool_result')) return null;
  const text = c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n').trim();
  return text || null;
}

/** The facts worth keeping, from transcript entries. Pure. */
export function extract(entries) {
  const prompts = [];
  const files = [];
  const commands = [];
  let todos = null;
  for (const e of entries) {
    const p = promptText(e);
    if (p && !p.startsWith('<')) prompts.push(p);
    if (e?.type !== 'assistant' || e.isSidechain || !Array.isArray(e.message?.content)) continue;
    for (const b of e.message.content) {
      if (b?.type !== 'tool_use') continue;
      const input = b.input || {};
      const f = input.file_path || input.notebook_path;
      if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(b.name) && f) {
        const i = files.indexOf(f);
        if (i >= 0) files.splice(i, 1);
        files.push(f);
      }
      if ((b.name === 'Bash' || b.name === 'PowerShell') && typeof input.command === 'string') commands.push(input.command);
      if (b.name === 'TodoWrite' && Array.isArray(input.todos)) todos = input.todos;
    }
  }
  return { prompts: prompts.slice(-5), files: files.slice(-40), commands: commands.slice(-10), todos };
}

/** The snapshot markdown. Pure. */
export function render(facts, { when, trigger = 'auto', git = '', compaction, session }) {
  const out = [`# Pre-compaction snapshot (${when}, ${trigger})`, ''];
  const sid = sessionKey(session);
  if (compaction) out.push(`compaction: ${compaction}`, ...(sid ? [`session: ${sid}`] : []), '');
  out.push('## The user\'s last messages, oldest first', '');
  if (facts.prompts.length) facts.prompts.forEach((p, i) => out.push(`${i + 1}. ${trim(p, 600)}`));
  else out.push('(none found)');
  out.push('', '## Files edited this session, most recent last', '');
  out.push(...(facts.files.length ? facts.files.map((f) => `- ${f}`) : ['(none)']));
  out.push('', '## Last shell commands', '');
  out.push(...(facts.commands.length ? facts.commands.map((c) => `- \`${trim(c, 200).replace(/`/g, "'")}\``) : ['(none)']));
  if (facts.todos && facts.todos.length) {
    out.push('', '## Todo list at compaction', '');
    for (const t of facts.todos) out.push(`- [${t.status === 'completed' ? 'x' : ' '}] ${trim(t.content || t.activeForm || '', 200)}${t.status === 'in_progress' ? ' (in progress)' : ''}`);
  }
  if (git) out.push('', '## Git', '', '```', git.trim(), '```');
  out.push('');
  return out.join('\n');
}

function gitSummary(cwd) {
  try { return execFileSync('git', ['status', '--short', '--branch'], { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').slice(0, 25).join('\n'); } catch { return ''; }
}

const stamp = (d) => d.toISOString().replace(/[:.]/g, '-');

export function writeSnapshot({ dir, transcript, trigger, git, now = new Date(), keep = 10, session }) {
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  const file = join(dir, `${stamp(now)}.md`);
  const entries = parseTranscript(transcript);
  // At PreCompact the new boundary cannot be in the file yet, so this compaction is the next one.
  writeFileSync(file, render(extract(entries), { when: now.toISOString(), trigger, git, compaction: boundaries(entries).count + 1, session }));
  const all = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) { try { unlinkSync(join(dir, old)); } catch { /* ignore */ } }
  return file;
}

export function latestSnapshot(dir, now = Date.now()) {
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort(); } catch { return null; }
  const last = files[files.length - 1];
  if (!last) return null;
  const path = join(dir, last);
  try {
    if (now - statSync(path).mtimeMs > MAX_AGE_MS) return null;
    const text = readFileSync(path, 'utf8');
    const m = /^# Pre-compaction snapshot [^\n]*\r?\n\r?\ncompaction: (\d+)\r?\n(?:session: ([^\r\n]+)\r?\n)?/.exec(text);
    return { path, text, compaction: m ? Number(m[1]) : 0, session: m?.[2] || '' };
  } catch { return null; }
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const input = parseInput(await readStdin());
  if (input) {
    const root = projectDir(input);
    const config = loadConfig({ project: root });
    if (hookEnabled(NAME, config)) {
      const opts = hookOptions(NAME, config);
      const dir = resolve(root, typeof opts.dir === 'string' ? opts.dir : '.claude/pau-skills/snapshots');
      try {
        if (input.hook_event_name === 'PreCompact' && typeof input.transcript_path === 'string') {
          const transcript = readFileSync(input.transcript_path, 'utf8');
          writeSnapshot({ dir, transcript, trigger: input.trigger || 'auto', git: gitSummary(root), keep: Number(opts.keep) > 0 ? Number(opts.keep) : 10, session: input.session_id });
          const reason = blockReason({ transcript, opts });
          if (reason) process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
        } else if (input.hook_event_name === 'SessionStart' && input.source === 'compact') {
          let transcript = null;
          if (typeof input.transcript_path === 'string') {
            try { transcript = readFileSync(input.transcript_path, 'utf8'); } catch { /* no transcript, no count */ }
          }
          const text = compactNote({ transcript, snap: latestSnapshot(dir), opts, session: input.session_id });
          if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }) + '\n');
        }
      } catch { /* never block compaction or a session */ }
    }
  }
  process.exit(0);
}
