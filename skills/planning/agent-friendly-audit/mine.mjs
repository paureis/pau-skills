#!/usr/bin/env node
/**
 * Read-only evidence miner for an agent-friendly audit. It never writes a file, never prints an email address, hides
 * common secret shapes, and shows paths under the home folder as ~.
 *
 *   node mine.mjs commits [--repo <dir>] [--since <date>] [--json]
 *       Lists the non-merge commits that look like corrections: fixes (a fix word on its own in the subject: "fix",
 *       "fixes", "fixed", "hotfix", "bugfix", "Hotfix-1.2.3"; a compound at the start, "Bug-fix:", "hot-fix",
 *       "quick-fix:"; or new work that is a fix, "Add fix for ..."), reverts (a subject starting "Revert" or
 *       "Reverted", or a body saying "This reverts commit"), and "fixup!", "squash!" or "amend!" commits. Not fixes:
 *       a longer word ("prefix", "fixture", "fix_typo"), a hyphenated name later in the subject ("Add bug-fix
 *       skill"), and a subject that adds something new with "fix" only as its topic. Each comes with the files it
 *       touched, and the summary ranks the files touched by two or more of them. Only subjects are printed, never
 *       bodies or authors.
 *       A subject is a lead, not evidence: read the diff before counting it.
 *
 *   node mine.mjs transcripts [<project folder>...] [--repo <dir>] [--projects <dir>] [--skip <session id>]...
 *                             [--keep-recent] [--max-chars <n, default 400>] [--json]
 *       Prints only what the user typed in each session transcript (<folder>/<session>.jsonl): typed messages,
 *       slash commands with their arguments, "!" shell commands and interrupts. Tool results, command output, system
 *       reminders, hook output, messages from other agents and task notifications (an `origin` other than human),
 *       compaction summaries and subagent transcripts are left out. Each row is "<line>\t<date>\t<text>" under a
 *       "## <folder>/<file>" header, so the full context can be found again. With no folder it reads the transcript
 *       folders of the repository (--repo, default the current folder) and its worktrees. A folder given explicitly
 *       must be one of those, or lie outside the projects folder (a copy or a fixture); any other project's folder,
 *       and the projects folder itself, is refused. In a folder under the projects folder, the newest session, if it
 *       changed in the last 10 minutes, is left out as the one running now, unless --keep-recent; --skip leaves out
 *       a session by id.
 *
 *   node mine.mjs folders [--repo <dir>] [--projects <dir>]
 *       Lists the transcript folders that belong to the repository and each of its git worktrees, with counts and
 *       sizes only. The projects folder is $CLAUDE_CONFIG_DIR/projects, or ~/.claude/projects. A folder name is the
 *       checkout path in dash form; its home folder part is shown as ~.
 *
 * Exit codes: 0 done; 1 refused or failed (not a git repository, a missing or wrong folder); 2 usage.
 * Node 20+, standard library only.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, basename, sep } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

// ---------- redaction ----------

// Every repeat is bounded, so a long line costs linear time (an unbounded local part made 100k characters take 9 s).
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63}){1,8}/g;
const TOKENS = [
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\b[rs]k_(live|test)_[A-Za-z0-9]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bglpat-[A-Za-z0-9_-]{20,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bnpm_[A-Za-z0-9]{30,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]{0,40}PRIVATE KEY-----|$)/g,
];
// "Authorization: Bearer <token>", "Basic <base64>".
const AUTH = /\b(Bearer|Basic|Token)(\s+)[A-Za-z0-9._~+/=-]{8,}/g;
// Credentials in a URL: scheme://user:password@host.
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]{1,20}:\/\/)[^\s/:@]{1,256}:[^\s/@]{1,256}@/gi;
// A key whose name holds a secret word, anywhere in an identifier (DB_PASSWORD, OPENAI_API_KEY, "password"), then
// = or :, then the value.
const KEY_VALUE = /((?<![A-Za-z0-9])[A-Za-z0-9_.-]{0,64}?(?:token|secret|passw(?:or)?d|pwd|api[_-]?key|access[_-]?key|private[_-]?key|credential)s?[A-Za-z0-9_]{0,64})(["']?\s{0,8}[:=]\s{0,8})("[^"\n]{0,512}"|'[^'\n]{0,512}'|[^\s,;}"']{1,512})/gi;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Hide emails, secret shapes and home folders in text that is about to be printed. */
export function redact(text, home = homedir()) {
  let out = String(text);
  for (const re of TOKENS) out = out.replace(re, '[secret]');
  out = out.replace(AUTH, (_, k, sp) => `${k}${sp}[secret]`);
  out = out.replace(URL_CREDENTIALS, (_, scheme) => `${scheme}[secret]@`);
  out = out.replace(KEY_VALUE, (_, k, sep) => `${k}${sep}[secret]`);
  out = out.replace(EMAIL, '[email]');
  if (home && home.length > 1) {
    for (const h of new Set([home, home.replace(/\\/g, '/')])) out = out.replace(new RegExp(escapeRe(h) + '(?=[\\\\/]|\\b|$)', 'g'), '~');
  }
  out = out.replace(/\/(home|Users)\/[^/\s'"]{1,256}/g, '~');
  out = out.replace(/\b[A-Za-z]:\\Users\\[^\\\s'"]{1,256}/g, '~');
  return out.replace(/~\\/g, '~/');
}

const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
const cut = (s, max) => (s.length > max ? s.slice(0, max).trimEnd() + '...' : s);

// ---------- commits ----------

// A fix word on its own: not inside a longer word ("prefix", "fixture", "fix_typo") or a hyphenated name ("bug-fix
// skill", "fix-it"), though a version may follow ("Hotfix-1.2.3").
const FIX = /(?<![\w-])(fix|fixes|fixed|fixing|hotfix|hotfixes|bugfix|bugfixes|quickfix)(?!\w|-[A-Za-z])/i;
// At the start of a subject a hyphenated or spaced compound is a fix too ("Bug-fix: crash on save", "hot-fix").
const LEADING_FIX = /^(bug|hot|quick)[- ]?fix(es|ed)?(?!\w|-[A-Za-z])/i;
// A subject that adds something new ("Add flaky-test-hunt: ... prove the fix") names a fix as a topic...
const NEW_WORK = /^(add|adds|added|create|creates|created|introduce|introduces|introduced|implement|implements|implemented|initial|new)\b/i;
// ...unless the new thing is the fix ("Add fix for crash", "Added a fix for the race", "Implement fix for #44").
const NEW_FIX = /^\w+\s+((a|an|the)\s+)?((bug|hot|quick) ?)?(fix|fixes)\b(?!-)/i;

/** 'revert', 'fixup', 'fix' or null for a commit subject and body. */
export function classify(subject, body) {
  if (/^revert(s|ed|ing)?\b/i.test(subject) || /This reverts commit [0-9a-f]{7,}/.test(body)) return 'revert';
  if (/^(fixup|squash|amend)!/i.test(subject)) return 'fixup';
  if (LEADING_FIX.test(subject)) return 'fix';
  if (NEW_WORK.test(subject)) return NEW_FIX.test(subject) ? 'fix' : null;
  if (FIX.test(subject)) return 'fix';
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

// ---------- command line ----------

class Refusal extends Error {}
class Usage extends Error {}

const USAGE = 'usage: mine.mjs commits [--repo <dir>] [--since <date>] [--json]\n'
  + '       mine.mjs transcripts [<project folder>...] [--repo <dir>] [--projects <dir>] [--skip <session>]...\n'
  + '                            [--keep-recent] [--max-chars <n>] [--json]\n'
  + '       mine.mjs folders [--repo <dir>] [--projects <dir>]';

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!['commits', 'transcripts', 'folders'].includes(cmd)) throw new Usage(USAGE);
  const opts = { cmd, folders: [], json: false, skip: [], keepRecent: false };
  const takes = { commits: ['--repo', '--since'], transcripts: ['--max-chars', '--repo', '--projects'], folders: ['--repo', '--projects'] }[cmd];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--json' && cmd !== 'folders') opts.json = true;
    else if (a === '--keep-recent' && cmd === 'transcripts') opts.keepRecent = true;
    else if (a === '--skip' && cmd === 'transcripts') {
      const v = rest[++i];
      if (v === undefined) throw new Usage(`--skip needs a session id\n${USAGE}`);
      opts.skip.push(v.replace(/\.jsonl$/, ''));
    } else if (takes.includes(a)) {
      const v = rest[++i];
      if (v === undefined) throw new Usage(`${a} needs a value\n${USAGE}`);
      opts[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
    } else if (a.startsWith('--')) throw new Usage(`unknown option ${a}\n${USAGE}`);
    else if (cmd === 'transcripts') opts.folders.push(a);
    else throw new Usage(`unexpected argument ${a}\n${USAGE}`);
  }
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
