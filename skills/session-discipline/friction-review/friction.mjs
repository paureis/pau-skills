#!/usr/bin/env node
/**
 * Counts the friction that repeats across this project's recent Claude Code sessions, for the friction-review skill.
 * Read only: it never writes a file. It never prints a tool result's body or a user message, redacts every string it
 * prints (emails, secret shapes, the home folder, the home folder in a project folder name) and then cuts it.
 *
 *   node friction.mjs [--repo <dir>] [--projects <dir>] [--last <n>] [--session <id>] [--skip <id>]... [--keep-recent]
 *
 * The project part (always): the check commands the project defines (package.json scripts, Makefile targets,
 * pyproject.toml tools, pytest.ini, tox.ini, noxfile.py, Cargo.toml, go.mod), the guardrails (CI files, pre-commit,
 * Claude Code hooks), which guardrail names each check, and the instruction files with their size in tokens.
 *
 * The session part: the transcript folders of the repository (--repo, default the current folder) and its worktrees
 * in the projects folder ($CLAUDE_CONFIG_DIR/projects or ~/.claude/projects, or --projects), and no other folder. It
 * reads the newest --last main sessions by modification time (default 30) with their subagent transcripts, or the one
 * --session names. The newest session, if it changed in the last 10 minutes, is left out as the one running now,
 * unless --keep-recent or --session names it. --skip leaves a session out. Then, per kind, each signal as
 * "n in k of N sessions" with up to POINTERS_PER_SIGNAL pointers, <folder>/<file>:<line> under the projects folder.
 *
 * Exit codes: 0 done; 1 refused or failed (not a git repository, a --session that is not found); 2 usage.
 * Node 20+, standard library only.
 */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Refusal } from './mine-redact.mjs';
import { gitRoot } from './mine-commits.mjs';
import { READ_REPEAT_MIN, SHELL_REPEAT_MIN, POINTERS_PER_SIGNAL, BIG_RESULT_CHARS, DEFAULT_LAST, show, plural } from './friction-show.mjs';
import { ID, listSessions, pickSessions, readSession } from './friction-sessions.mjs';
import { readProject, printProject, newFilesInCommits } from './friction-project.mjs';
import { countSignals, printSignals } from './friction-signals.mjs';

class Usage extends Error {}

const USAGE = 'usage: friction.mjs [--repo <dir>] [--projects <dir>] [--last <n>] [--session <id>] [--skip <id>]... [--keep-recent]';

export function parseArgs(argv) {
  const o = { repo: '.', projects: undefined, last: undefined, session: undefined, skip: [], keepRecent: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Usage(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--keep-recent') o.keepRecent = true;
    else if (a === '--repo') o.repo = value();
    else if (a === '--projects') o.projects = value();
    else if (a === '--last') {
      const v = value();
      if (!/^\d+$/.test(v) || Number(v) < 1) throw new Usage('--last must be a whole number of at least 1');
      o.last = Number(v);
    } else if (a === '--session' || a === '--skip') {
      const v = value();
      if (!ID.test(v)) throw new Usage(`${a} takes a session id: letters, digits, _ and - only`);
      if (a === '--session') o.session = v;
      else o.skip.push(v);
    } else throw new Usage(a.startsWith('-') ? `unknown option ${show(a, 60)}` : `unexpected argument ${show(a, 60)}`);
  }
  if (o.session && o.last !== undefined) throw new Usage('--session reads one session; leave out --last');
  return o;
}

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
/** The first and last UTC day of the sessions read, from their modification times, or null when none is read. */
function days(pick) {
  const times = pick.picked.map((s) => s.mtime);
  return times.length ? { from: day(Math.min(...times)), to: day(Math.max(...times)) } : null;
}

function header(listed, pick, read) {
  const d = days(pick);
  const range = d ? ` from ${d.from} to ${d.to}` : '';
  const sum = (k) => read.reduce((n, r) => n + r[k], 0);
  const badFiles = sum('badFiles');
  return `# friction-review: ${plural(read.length, 'session')}${range} in ${show(resolve(listed.base), 200)}; `
    + `${plural(sum('subagents'), 'subagent transcript')}; ${plural(sum('badLines'), 'unreadable line')}`
    + `${badFiles ? `; ${plural(badFiles, 'transcript')} left out as unreadable (its steps did not match)` : ''}; `
    + `thresholds: READ_REPEAT_MIN ${READ_REPEAT_MIN}, SHELL_REPEAT_MIN ${SHELL_REPEAT_MIN}, POINTERS_PER_SIGNAL ${POINTERS_PER_SIGNAL}, BIG_RESULT_CHARS ${BIG_RESULT_CHARS}`;
}

export function main(argv, out = console.log, err = console.error) {
  let o;
  try { o = parseArgs(argv); } catch (e) {
    err(`${e.message}\n${USAGE}`);
    return 2;
  }
  try {
    const root = gitRoot(resolve(o.repo));
    if (!root) throw new Refusal(`${show(resolve(o.repo), 200)} is not a git repository`);
    const listed = listSessions({ repo: root, projects: o.projects });
    const pick = pickSessions(listed.sessions, { ...o, last: o.last ?? DEFAULT_LAST });
    const read = pick.picked.map(readSession);
    const project = readProject(root);
    const lines = [header(listed, pick, read)];
    const say = (l) => lines.push(l);
    if (!listed.folders) say('# no transcript folder matches this repository or its worktrees');
    if (pick.recent) say(`# left out ${plural(pick.recent, 'recent session')}, probably the one running now (--keep-recent reads it)`);
    if (pick.skipped) say(`# left out ${plural(pick.skipped, 'session')} named by --skip`);
    printProject(project, say);
    const d = days(pick);
    const commits = d && { ...d, n: newFilesInCommits(root, d.from, d.to) };
    printSignals(countSignals(read, project.checks, listed.roots), project, say, commits);
    say('# not counted: coding standards and no-ops in steering files; they need reading, not counting');
    for (const l of lines) out(l);
    return 0;
  } catch (e) {
    err(e instanceof Refusal ? e.message : `failed: ${show(e.message, 300)}`);
    return 1;
  }
}

// Node loads a module by its real path, so a start through a symlinked skill folder compares the real path too.
const startedAs = (p) => { try { return pathToFileURL(realpathSync(p)).href; } catch { return null; } };
if (process.argv[1] && import.meta.url === startedAs(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
