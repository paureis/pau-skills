#!/usr/bin/env node
/**
 * Read-only evidence miner for an agent-friendly audit. It never writes a file, never prints an email address, hides
 * common secret shapes, and shows paths under the home folder as ~.
 *
 *   node mine.mjs commits [--repo <dir>] [--rev <branch or commit>] [--since <date>] [--json]
 *       On the branch given (default: the one checked out), lists the non-merge commits that look like
 *       corrections: fixes (a fix word on its own in the subject: "fix", "fixes", "fixed", "hotfix", "bugfix",
 *       "Hotfix-1.2.3"; a compound at the start, "Bug-fix:", "hot-fix", "quick-fix:"; or new work that is a fix,
 *       "Add fix for ..."), reverts (a subject starting "Revert" or "Reverted", or a body saying "This reverts
 *       commit"), and "fixup!", "squash!" or "amend!" commits. Not fixes: a longer word ("prefix", "fixture",
 *       "fix_typo"), a hyphenated name later in the subject ("Add bug-fix skill"), and a subject that adds something
 *       new with "fix" only as its topic. Each comes with the files it touched, and the summary ranks the files
 *       touched by two or more of them. Only subjects are printed, never bodies or authors.
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
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { redact, Refusal } from './mine-redact.mjs';
import { classify, mineCommits, printCommits } from './mine-commits.mjs';
import {
  userText, transcriptFolders, mineTranscripts, printTranscripts, encodeProjectPath, shownName, findFolders, printFolders,
} from './mine-transcripts.mjs';

export { redact, classify, mineCommits, userText, transcriptFolders, mineTranscripts, encodeProjectPath, shownName, findFolders };

// ---------- command line ----------

class Usage extends Error {}

const USAGE = 'usage: mine.mjs commits [--repo <dir>] [--rev <branch>] [--since <date>] [--json]\n'
  + '       mine.mjs transcripts [<project folder>...] [--repo <dir>] [--projects <dir>] [--skip <session>]...\n'
  + '                            [--keep-recent] [--max-chars <n>] [--json]\n'
  + '       mine.mjs folders [--repo <dir>] [--projects <dir>]';

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!['commits', 'transcripts', 'folders'].includes(cmd)) throw new Usage(USAGE);
  const opts = { cmd, folders: [], json: false, skip: [], keepRecent: false };
  const takes = { commits: ['--repo', '--since', '--rev'], transcripts: ['--max-chars', '--repo', '--projects'], folders: ['--repo', '--projects'] }[cmd];
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
