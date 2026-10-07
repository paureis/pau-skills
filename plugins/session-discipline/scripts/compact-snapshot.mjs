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
// The folder gets a .gitignore of "*", so snapshots never reach a commit. Only the newest ten are kept.
//
// SessionStart with source "compact": prints the newest snapshot (if it is under an hour old) as additional context,
// so the facts are back in the window the moment the compacted session resumes.
//
// Option in .claude/pau-skills.json: { "compact-snapshot": { "dir": ".claude/pau-skills/snapshots", "keep": 10 } }
// Exits 0 always and never blocks compaction.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from './config.mjs';

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
export function render(facts, { when, trigger = 'auto', git = '' }) {
  const out = [`# Pre-compaction snapshot (${when}, ${trigger})`, ''];
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

export function writeSnapshot({ dir, transcript, trigger, git, now = new Date(), keep = 10 }) {
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  const file = join(dir, `${stamp(now)}.md`);
  writeFileSync(file, render(extract(parseTranscript(transcript)), { when: now.toISOString(), trigger, git }));
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
    return { path, text: readFileSync(path, 'utf8') };
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
          writeSnapshot({ dir, transcript, trigger: input.trigger || 'auto', git: gitSummary(root), keep: Number(opts.keep) > 0 ? Number(opts.keep) : 10 });
        } else if (input.hook_event_name === 'SessionStart' && input.source === 'compact') {
          const snap = latestSnapshot(dir);
          if (snap) {
            const text = `[compact-snapshot] The conversation was just compacted. These facts were saved from before it (${snap.path}); treat them as exact where the summary is vague:\n\n${snap.text.slice(0, 6000)}`;
            process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }) + '\n');
          }
        }
      } catch { /* never block compaction or a session */ }
    }
  }
  process.exit(0);
}
