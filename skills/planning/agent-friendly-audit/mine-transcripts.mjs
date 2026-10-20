// The transcripts and folders parts of mine.mjs: the user's own messages from a project's transcripts, and the
// transcript folders that belong to a repository and its worktrees.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, basename, sep } from 'node:path';
import { homedir } from 'node:os';
import { redact, oneLine, cut, Refusal } from './mine-redact.mjs';
import { gitRoot } from './mine-commits.mjs';

// ---------- transcripts ----------

const DROP_BLOCKS = /<(system-reminder|user-prompt-submit-hook|task-notification|local-command-stdout|local-command-stderr|bash-stdout|bash-stderr|command-message|command-stdout)>[\s\S]*?<\/\1>/g;

/** The text the user typed in one transcript entry, or null when the entry is not a typed user message. */
export function userText(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta || entry.isSidechain || entry.isCompactSummary || entry.isVisibleInTranscriptOnly) return null;
  // A message from a peer agent, a task notification or anything else not typed by a person carries another origin.
  if (entry.origin && entry.origin.kind !== 'human') return null;
  const msg = entry.message;
  if (!msg || msg.role !== 'user') return null;
  let text;
  if (typeof msg.content === 'string') text = msg.content;
  else if (Array.isArray(msg.content)) {
    // Text next to a tool result is written by the harness (hook feedback, for example), except an interrupt.
    if (msg.content.some((b) => b && b.type === 'tool_result')) {
      const stop = msg.content.find((b) => b?.type === 'text' && /^\[Request interrupted by user/.test(b.text || ''));
      return stop ? oneLine(stop.text) : null;
    }
    text = msg.content.map((b) => (b?.type === 'text' ? b.text : b?.type === 'image' ? '[image] ' : '')).join('');
  } else return null;
  const name = /<command-name>([\s\S]*?)<\/command-name>/.exec(text);
  if (name) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text);
    text = `${name[1].trim()} ${args ? args[1] : ''}`;
  }
  text = text.replace(/<bash-input>([\s\S]*?)<\/bash-input>/g, '! $1').replace(DROP_BLOCKS, '');
  text = oneLine(text);
  return text || null;
}

// Cut to the limit plus a margin before redacting, so a huge message costs little; a secret is far shorter than the
// margin, so one cut at the margin is still hidden or falls past the final cut.
const MARGIN = 2048;
const isJsonl = (f) => f.endsWith('.jsonl');
const listDir = (d) => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } };

const RECENT_MS = 10 * 60 * 1000;
const realOrSelf = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);

/**
 * The folders to read. With none given, the transcript folders of the repository and its worktrees. A folder given
 * explicitly must be one of those, or lie outside the projects folder (a copy or a test fixture), so another
 * project's transcripts are never read.
 */
export function transcriptFolders(folders, { repo = '.', projects } = {}) {
  if (!folders.length) return findFolders({ repo, projects }).found.map((f) => f.folder);
  const base = realOrSelf(projectsDir(projects));
  let own = null;
  return folders.map((folder) => {
    const dir = resolve(folder);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Refusal(`${redact(dir)} is not a folder`);
    const real = realOrSelf(dir);
    if (inside(real, base)) {
      own ||= new Set(findFolders({ repo, projects }).found.map((f) => realOrSelf(f.folder)));
      if (!own.has(real)) {
        throw new Refusal(`${shownFolder(dir)} is not a transcript folder of this repository or its worktrees; run without a folder, or see: node mine.mjs folders`);
      }
    }
    return dir;
  });
}

export function mineTranscripts(folders, { maxChars = 400, repo, projects, skip = [], keepRecent = false, now = Date.now() } = {}) {
  const sessions = [];
  let subagents = 0;
  let bad = 0;
  let recent = 0;
  let skipped = 0;
  const base = realOrSelf(projectsDir(projects));
  for (const dir of transcriptFolders(folders, { repo, projects })) {
    const entries = listDir(dir);
    let files = entries.filter((e) => e.isFile() && isJsonl(e.name)).map((e) => e.name).sort();
    const holdsProjects = entries.some((e) => e.isDirectory() && listDir(join(dir, e.name)).some((x) => x.isFile() && isJsonl(x.name)));
    if (!files.length && holdsProjects) {
      throw new Refusal(`${shownFolder(dir)} holds other project folders; give the one folder for this project (list them with: node mine.mjs folders)`);
    }
    const before = files.length;
    files = files.filter((f) => !skip.includes(f.replace(/\.jsonl$/, '')));
    skipped += before - files.length;
    // The newest session in a live transcript folder, still being written, is most likely the one running this
    // audit: its prompt is the audit itself, not evidence.
    if (!keepRecent && inside(realOrSelf(dir), base) && files.length) {
      const times = files.map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }));
      const newest = times.reduce((a, b) => (b.t > a.t ? b : a));
      if (now - newest.t < RECENT_MS) { files = files.filter((f) => f !== newest.f); recent++; }
    }
    for (const e of entries.filter((x) => x.isDirectory())) {
      subagents += listDir(join(dir, e.name, 'subagents')).filter((x) => x.isFile() && isJsonl(x.name)).length;
    }
    for (const f of files) {
      const messages = [];
      readFileSync(join(dir, f), 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (!line.trim()) return;
        let entry;
        try { entry = JSON.parse(line); } catch { bad++; return; }
        const text = userText(entry);
        if (text) messages.push({ line: i + 1, date: String(entry.timestamp || '').slice(0, 10), text: cut(redact(text.slice(0, maxChars + MARGIN)), maxChars) });
      });
      sessions.push({ folder: shownName(basename(dir)), file: f, messages });
    }
  }
  return { sessions, subagents, badLines: bad, recentLeftOut: recent, skipped };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function printTranscripts(res, out) {
  for (const s of res.sessions) {
    if (!s.messages.length) continue;
    out(`## ${s.folder}/${s.file}`);
    for (const m of s.messages) out(`${m.line}\t${m.date}\t${m.text}`);
  }
  const total = res.sessions.reduce((n, s) => n + s.messages.length, 0);
  out(`# ${plural(total, 'user message')} in ${plural(res.sessions.length, 'session')}; skipped ${plural(res.subagents, 'subagent transcript')} and ${plural(res.badLines, 'unreadable line')}`);
  if (res.recentLeftOut) out(`# left out ${plural(res.recentLeftOut, 'recent session')}, probably the one running now (--keep-recent reads it)`);
  if (res.skipped) out(`# left out ${plural(res.skipped, 'session')} named by --skip`);
}

// ---------- folders ----------

/** The folder name Claude Code uses for a project: the absolute path with every non letter or digit made a dash. */
export const encodeProjectPath = (p) => p.replace(/[^A-Za-z0-9]/g, '-');

const projectsDir = (projects) => projects || join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');

/** A project folder name with the home folder part shown as ~ ("-home-ana-src-app" becomes "~-src-app"). */
export function shownName(name, home = homedir()) {
  for (const h of new Set([home, realOrSelf(home)])) {
    const enc = encodeProjectPath(h);
    if (enc.length > 1 && (name === enc || name.startsWith(enc + '-'))) return '~' + name.slice(enc.length);
  }
  return name.replace(/^-(home|Users)-[A-Za-z0-9]+(?=-|$)/, '~').replace(/^[A-Za-z]--Users-[A-Za-z0-9]+(?=-|$)/, '~');
}

/** A folder path for a message: its parent redacted, its own name shown with shownName. */
const shownFolder = (dir) => join(redact(resolve(dir, '..')), shownName(basename(dir)));

function worktreePaths(root) {
  const raw = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  const paths = raw.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim());
  const all = new Set();
  for (const p of paths) {
    all.add(p);
    try { all.add(realpathSync(p)); } catch { /* a worktree that was deleted */ }
  }
  return [...all];
}

function folderStats(dir) {
  let sessions = 0;
  let subagents = 0;
  let bytes = 0;
  const walk = (d) => {
    for (const e of listDir(d)) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { try { bytes += statSync(p).size; } catch { /* gone */ } }
    }
  };
  walk(dir);
  for (const e of listDir(dir)) {
    if (e.isFile() && isJsonl(e.name)) sessions++;
    if (e.isDirectory()) subagents += listDir(join(dir, e.name, 'subagents')).filter((s) => s.isFile() && isJsonl(s.name)).length;
  }
  return { sessions, subagents, bytes, memory: existsSync(join(dir, 'memory')) };
}

export function findFolders({ repo = '.', projects } = {}) {
  const root = gitRoot(resolve(repo));
  if (!root) throw new Refusal(`${redact(resolve(repo))} is not a git repository`);
  const base = projectsDir(projects);
  const names = new Set(listDir(base).filter((e) => e.isDirectory()).map((e) => e.name));
  const found = [];
  const seen = new Set();
  for (const p of worktreePaths(root)) {
    const name = encodeProjectPath(p);
    if (!names.has(name) || seen.has(name)) continue;
    seen.add(name);
    found.push({ folder: join(base, name), worktree: p, ...folderStats(join(base, name)) });
  }
  return { projects: base, found };
}

const size = (b) => (b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

function printFolders(res, out) {
  if (!res.found.length) {
    out(`No transcript folder matches this repository or its worktrees in ${redact(res.projects)}. List that folder and pick this project's folder by hand; a very long path may be shortened there.`);
    return;
  }
  out(`# Transcript folders in ${redact(res.projects)}, one per checkout:`);
  for (const f of res.found) {
    out(`${shownName(basename(f.folder))}\t${redact(f.worktree)}\t${plural(f.sessions, 'session')}, ${plural(f.subagents, 'subagent transcript')}, ${size(f.bytes)}, memory: ${f.memory ? 'yes' : 'no'}`);
  }
}

export { printTranscripts, printFolders };
