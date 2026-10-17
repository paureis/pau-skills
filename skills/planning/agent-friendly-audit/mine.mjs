#!/usr/bin/env node
/**
 * Read-only evidence miner for an agent-friendly audit. It never writes a file, never prints an email address, hides
 * common secret shapes, and shows paths under the home folder as ~.
 *
 *   node mine.mjs commits [--repo <dir>] [--since <date>] [--json]
 *       Lists the non-merge commits that look like corrections: fixes ("fix", "fixes", "fixed", "hotfix", "bugfix"
 *       in the subject; a hyphenated name such as "bug-fix" is not a fix, nor is a subject that starts by adding
 *       something new), reverts (a subject starting "Revert" or a body saying "This reverts commit"), and "fixup!",
 *       "squash!" or "amend!" commits. Each comes with the files it touched, and the summary ranks the files touched
 *       by two or more of them. Only subjects are printed, never bodies or authors.
 *       A subject is a lead, not evidence: read the diff before counting it.
 *
 *   node mine.mjs transcripts <project folder>... [--max-chars <n, default 400>] [--json]
 *       Prints only what the user typed in each session transcript (<folder>/<session>.jsonl): typed messages,
 *       slash commands with their arguments, "!" shell commands and interrupts. Tool results, command output, system
 *       reminders, compaction summaries and subagent transcripts are left out. Each row is "<line>\t<date>\t<text>",
 *       under a "## <file>" header, so the full context can be found again. Give one project folder per argument; the
 *       folder that holds every project is refused, so other projects are never read.
 *
 *   node mine.mjs folders [--repo <dir>] [--projects <dir>]
 *       Lists the transcript folders that belong to the repository and each of its git worktrees, with counts and
 *       sizes only. The projects folder is $CLAUDE_CONFIG_DIR/projects, or ~/.claude/projects.
 *
 * Exit codes: 0 done; 1 refused or failed (not a git repository, a missing or wrong folder); 2 usage.
 * Node 20+, standard library only.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

// ---------- redaction ----------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g;
const TOKENS = [
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
];
const KEY_VALUE = /\b(api[_-]?key|token|secret|password|passwd|pwd)(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Hide emails, secret shapes and home folders in text that is about to be printed. */
export function redact(text, home = homedir()) {
  let out = String(text);
  for (const re of TOKENS) out = out.replace(re, '[secret]');
  out = out.replace(KEY_VALUE, (_, k, sep) => `${k}${sep}[secret]`);
  out = out.replace(EMAIL, '[email]');
  if (home && home.length > 1) {
    for (const h of new Set([home, home.replace(/\\/g, '/')])) out = out.replace(new RegExp(escapeRe(h) + '(?=[\\\\/]|\\b|$)', 'g'), '~');
  }
  out = out.replace(/\/(home|Users)\/[^/\s'"]+/g, '~');
  out = out.replace(/\b[A-Za-z]:\\Users\\[^\\\s'"]+/g, '~');
  return out.replace(/~\\/g, '~/');
}

const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
const cut = (s, max) => (s.length > max ? s.slice(0, max).trimEnd() + '...' : s);

// ---------- commits ----------

const FIX = /(?<![\w-])(fix|fixes|fixed|fixing|hotfix|hotfixes|bugfix|bugfixes)(?![\w-])/i;
// A subject that adds something new ("Add flaky-test-hunt: ... prove the fix") names a fix as a topic.
const NEW_WORK = /^(add|adds|added|create|creates|introduce|introduces|implement|implements|initial|new)\b/i;

/** 'revert', 'fixup', 'fix' or null for a commit subject and body. */
export function classify(subject, body) {
  if (/^revert\b/i.test(subject) || /This reverts commit [0-9a-f]{7,}/.test(body)) return 'revert';
  if (/^(fixup|squash|amend)!/i.test(subject)) return 'fixup';
  if (FIX.test(subject) && !NEW_WORK.test(subject)) return 'fix';
  return null;
}

function gitRoot(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function mineCommits({ repo = '.', since } = {}) {
  const root = gitRoot(resolve(repo));
  if (!root) throw new Refusal(`${redact(resolve(repo))} is not a git repository`);
  const args = ['-C', root, 'log', '--no-merges', '--name-only', '--format=%x1e%H%x1f%cI%x1f%s%x1f%b%x1f'];
  if (since) args.push(`--since=${since}`);
  let raw;
  try {
    raw = execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (/does not have any commits/.test(String(e.stderr))) raw = '';
    else throw e;
  }
  const records = raw.split('\x1e').filter((r) => r.trim());
  const commits = [];
  const touched = new Map();
  for (const r of records) {
    const [sha, date, subject, body, filesText = ''] = r.split('\x1f');
    const kind = classify(subject, body);
    if (!kind) continue;
    const files = filesText.split('\n').map((f) => f.trim()).filter(Boolean);
    const reverts = kind === 'revert' ? (/This reverts commit ([0-9a-f]{7,})/.exec(body) || [])[1] || null : null;
    commits.push({ sha, date: date.slice(0, 10), kind, subject: redact(subject), reverts, files: files.map((f) => redact(f)) });
    for (const f of new Set(files)) touched.set(f, (touched.get(f) || 0) + 1);
  }
  const hotFiles = [...touched].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15).map(([file, count]) => ({ file: redact(file), count }));
  return { scanned: records.length, commits, hotFiles };
}

function printCommits(res, out) {
  for (const c of res.commits) {
    out(`${c.sha.slice(0, 7)}\t${c.date}\t${c.kind}\t${c.subject}${c.reverts ? ` (reverts ${c.reverts.slice(0, 7)})` : ''}`);
    for (const f of c.files) out(`\t${f}`);
  }
  const n = (k) => res.commits.filter((c) => c.kind === k).length;
  out(`# ${n('fix')} fix, ${n('revert')} revert, ${n('fixup')} fixup in ${res.scanned} commits (merges skipped)`);
  if (res.hotFiles.length) {
    out('# Files touched by two or more of these commits:');
    for (const h of res.hotFiles) out(`# ${h.count}\t${h.file}`);
  } else {
    out('# No file was touched by two or more of these commits.');
  }
}

// ---------- transcripts ----------

const DROP_BLOCKS = /<(system-reminder|local-command-stdout|local-command-stderr|bash-stdout|bash-stderr|command-message|command-stdout)>[\s\S]*?<\/\1>/g;

/** The text the user typed in one transcript entry, or null when the entry is not a typed user message. */
export function userText(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta || entry.isSidechain || entry.isCompactSummary || entry.isVisibleInTranscriptOnly) return null;
  const msg = entry.message;
  if (!msg || msg.role !== 'user') return null;
  let text;
  if (typeof msg.content === 'string') text = msg.content;
  else if (Array.isArray(msg.content)) {
    if (msg.content.some((b) => b && b.type === 'tool_result')) return null;
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

const isJsonl = (f) => f.endsWith('.jsonl');
const listDir = (d) => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } };

export function mineTranscripts(folders, { maxChars = 400 } = {}) {
  const sessions = [];
  let subagents = 0;
  let bad = 0;
  for (const folder of folders) {
    const dir = resolve(folder);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Refusal(`${redact(dir)} is not a folder`);
    const entries = listDir(dir);
    const files = entries.filter((e) => e.isFile() && isJsonl(e.name)).map((e) => e.name).sort();
    const holdsProjects = entries.some((e) => e.isDirectory() && listDir(join(dir, e.name)).some((s) => s.isFile() && isJsonl(s.name)));
    if (!files.length && holdsProjects) {
      throw new Refusal(`${redact(dir)} holds other project folders; give the one folder for this project (list them with: node mine.mjs folders)`);
    }
    for (const e of entries.filter((x) => x.isDirectory())) {
      subagents += listDir(join(dir, e.name, 'subagents')).filter((s) => s.isFile() && isJsonl(s.name)).length;
    }
    for (const f of files) {
      const messages = [];
      readFileSync(join(dir, f), 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (!line.trim()) return;
        let entry;
        try { entry = JSON.parse(line); } catch { bad++; return; }
        const text = userText(entry);
        if (text) messages.push({ line: i + 1, date: String(entry.timestamp || '').slice(0, 10), text: cut(redact(text), maxChars) });
      });
      sessions.push({ file: f, messages });
    }
  }
  return { sessions, subagents, badLines: bad };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function printTranscripts(res, out) {
  for (const s of res.sessions) {
    if (!s.messages.length) continue;
    out(`## ${s.file}`);
    for (const m of s.messages) out(`${m.line}\t${m.date}\t${m.text}`);
  }
  const total = res.sessions.reduce((n, s) => n + s.messages.length, 0);
  out(`# ${plural(total, 'user message')} in ${plural(res.sessions.length, 'session')}; skipped ${plural(res.subagents, 'subagent transcript')} and ${plural(res.badLines, 'unreadable line')}`);
}

// ---------- folders ----------

/** The folder name Claude Code uses for a project: the absolute path with every non letter or digit made a dash. */
export const encodeProjectPath = (p) => p.replace(/[^A-Za-z0-9]/g, '-');

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
  const base = projects || join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
  const names = new Set(listDir(base).filter((e) => e.isDirectory()).map((e) => e.name));
  const found = [];
  const seen = new Set();
  for (const p of worktreePaths(root)) {
    const name = encodeProjectPath(p);
    if (!names.has(name) || seen.has(name)) continue;
    seen.add(name);
    found.push({ folder: join(base, name), ...folderStats(join(base, name)) });
  }
  return { projects: base, found };
}

const size = (b) => (b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

function printFolders(res, out) {
  if (!res.found.length) {
    out(`No transcript folder matches this repository or its worktrees in ${redact(res.projects)}. List that folder and pick this project's folder by hand; a very long path may be shortened there.`);
    return;
  }
  for (const f of res.found) {
    out(`${redact(f.folder)}\t${plural(f.sessions, 'session')}, ${plural(f.subagents, 'subagent transcript')}, ${size(f.bytes)}, memory: ${f.memory ? 'yes' : 'no'}`);
  }
}

// ---------- command line ----------

class Refusal extends Error {}
class Usage extends Error {}

const USAGE = 'usage: mine.mjs commits [--repo <dir>] [--since <date>] [--json]\n'
  + '       mine.mjs transcripts <project folder>... [--max-chars <n>] [--json]\n'
  + '       mine.mjs folders [--repo <dir>] [--projects <dir>]';

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!['commits', 'transcripts', 'folders'].includes(cmd)) throw new Usage(USAGE);
  const opts = { cmd, folders: [], json: false };
  const takes = { commits: ['--repo', '--since'], transcripts: ['--max-chars'], folders: ['--repo', '--projects'] }[cmd];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--json' && cmd !== 'folders') opts.json = true;
    else if (takes.includes(a)) {
      const v = rest[++i];
      if (v === undefined) throw new Usage(`${a} needs a value\n${USAGE}`);
      opts[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
    } else if (a.startsWith('--')) throw new Usage(`unknown option ${a}\n${USAGE}`);
    else if (cmd === 'transcripts') opts.folders.push(a);
    else throw new Usage(`unexpected argument ${a}\n${USAGE}`);
  }
  if (cmd === 'transcripts' && !opts.folders.length) throw new Usage(`give at least one project folder\n${USAGE}`);
  if (opts.maxChars !== undefined) {
    opts.maxChars = Number(opts.maxChars);
    if (!Number.isInteger(opts.maxChars) || opts.maxChars < 10) throw new Usage('--max-chars must be a whole number of at least 10');
  }
  return opts;
}

export function main(argv, out = console.log, err = console.error) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { err(e.message); return 2; }
  try {
    if (opts.cmd === 'commits') {
      const res = mineCommits(opts);
      if (opts.json) out(JSON.stringify(res, null, 2)); else printCommits(res, out);
    } else if (opts.cmd === 'transcripts') {
      const res = mineTranscripts(opts.folders, opts);
      if (opts.json) out(JSON.stringify(res, null, 2)); else printTranscripts(res, out);
    } else {
      printFolders(findFolders(opts), out);
    }
    return 0;
  } catch (e) {
    err(e instanceof Refusal ? e.message : `failed: ${redact(e.message)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
