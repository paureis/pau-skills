#!/usr/bin/env node
// SessionStart hook: tell the agent where it is in git before it does anything. Branch, how far it is from its
// upstream, uncommitted and untracked files, stashes, an unfinished merge or rebase, and a warning when the session
// starts on a protected branch.
//
// Why: agents assume a clean tree on a feature branch. They commit onto main, build on a branch that is twenty commits
// behind, or start a "quick fix" in the middle of someone's half-finished rebase. Each of those is cheap to avoid and
// expensive to untangle, and all of them are visible with three git commands nobody remembers to run first.
//
//   node branch-context.mjs          JSON for the hook (hookSpecificOutput.additionalContext)
//   node branch-context.mjs --text   plain text, for a human
//
// Prints nothing outside a git repository. Ahead/behind counts are as of the last fetch; the hook never fetches.
//
// Option in .claude/pau-skills.json:
//   { "branch-context": { "protectedBranches": ["main", "master", "develop"] } }   (replaces the default list)
//
// Exits 0 always. Runs git read-only, with a 3 second timeout per call.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';

export const NAME = 'branch-context';
export const DEFAULT_PROTECTED = ['main', 'master', 'develop', 'trunk', 'production', 'release'];

/** Collect the facts with a git(args) function that returns stdout or null. */
export function gather(git, exists = () => false) {
  const top = git(['rev-parse', '--show-toplevel']);
  if (top === null) return null;
  const gitDir = (git(['rev-parse', '--absolute-git-dir']) || '').trim();
  const branch = (git(['symbolic-ref', '--quiet', '--short', 'HEAD']) || '').trim();
  const head = (git(['log', '-1', '--format=%h %s (%cr)']) || '').trim();
  const upstream = (git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) || '').trim();
  let ahead = 0, behind = 0;
  if (upstream) {
    const counts = (git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']) || '').trim().split(/\s+/);
    ahead = Number(counts[0]) || 0; behind = Number(counts[1]) || 0;
  }
  const status = (git(['status', '--porcelain']) || '').split('\n').filter(Boolean);
  const untracked = status.filter((l) => l.startsWith('??')).length;
  const conflicted = status.filter((l) => /^(DD|AU|UD|UA|DU|AA|UU)/.test(l)).length;
  const changed = status.length - untracked;
  const stashes = (git(['stash', 'list']) || '').split('\n').filter(Boolean).length;
  const inProgress = [];
  if (gitDir) {
    if (exists(join(gitDir, 'MERGE_HEAD'))) inProgress.push('a merge');
    if (exists(join(gitDir, 'rebase-merge')) || exists(join(gitDir, 'rebase-apply'))) inProgress.push('a rebase');
    if (exists(join(gitDir, 'CHERRY_PICK_HEAD'))) inProgress.push('a cherry-pick');
    if (exists(join(gitDir, 'REVERT_HEAD'))) inProgress.push('a revert');
    if (exists(join(gitDir, 'BISECT_LOG'))) inProgress.push('a bisect');
  }
  return { branch, head, upstream, ahead, behind, changed, untracked, conflicted, stashes, inProgress };
}

/** The summary text from the facts. Pure. */
export function summarize(f, protectedBranches = DEFAULT_PROTECTED) {
  if (!f) return '';
  const lines = [];
  const where = f.branch ? `on branch ${f.branch}` : 'in detached HEAD (no branch; commits made here are easy to lose)';
  lines.push(`[branch-context] Git: ${where}. Last commit: ${f.head || 'none yet'}.`);
  if (f.upstream) {
    const rel = f.ahead || f.behind ? `${f.ahead} ahead, ${f.behind} behind` : 'up to date';
    lines.push(`Upstream ${f.upstream}: ${rel} (as of the last fetch).`);
  } else if (f.branch) {
    lines.push('No upstream branch set; nothing has been pushed from here yet, or tracking is not configured.');
  }
  const tree = [];
  if (f.changed) tree.push(`${f.changed} changed file${f.changed > 1 ? 's' : ''}`);
  if (f.untracked) tree.push(`${f.untracked} untracked`);
  if (f.conflicted) tree.push(`${f.conflicted} with merge conflicts`);
  if (f.stashes) tree.push(`${f.stashes} stash${f.stashes > 1 ? 'es' : ''}`);
  lines.push(tree.length ? `Working tree: ${tree.join(', ')}. These may be someone's unfinished work; do not discard them.` : 'Working tree: clean.');
  if (f.inProgress.length) lines.push(`WARNING: ${f.inProgress.join(' and ')} is in progress. Finish or abort it deliberately before other work.`);
  const prot = f.branch && protectedBranches.some((p) => (p.endsWith('/*') ? f.branch.startsWith(p.slice(0, -1)) : f.branch === p));
  if (prot) lines.push(`NOTE: ${f.branch} is a protected branch. Create a working branch before committing.`);
  if (f.behind > 0) lines.push('The branch is behind its upstream. Pull or rebase before building on it.');
  return lines.join('\n');
}

export function realGit(cwd) {
  return (args) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const textMode = process.argv.includes('--text');
  const input = textMode ? {} : parseInput(await readStdin()) || {};
  const root = projectDir(input);
  const config = loadConfig({ project: root });
  if (hookEnabled(NAME, config)) {
    const opts = hookOptions(NAME, config);
    const text = summarize(gather(realGit(root), existsSync), Array.isArray(opts.protectedBranches) ? opts.protectedBranches : DEFAULT_PROTECTED);
    if (text) {
      if (textMode) process.stdout.write(text + '\n');
      else process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }) + '\n');
    }
  }
  process.exit(0);
}
