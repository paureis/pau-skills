#!/usr/bin/env node
/**
 * Scope checks for a review and its fix round. Read only: it never changes a file, a branch or the index.
 *
 *   node review-scope.mjs change [--base <ref>] [--repo <dir>] [--json]
 *       What the change under review touches: every file changed since the merge base with the base branch
 *       (committed, staged, unstaged and untracked), lines added and removed, which files match `riskyPaths`, and
 *       which are tests. Without --base it uses origin/HEAD, then main, master, origin/main and origin/master,
 *       whichever exists first. When the work is committed on the base branch itself, pass --base <start commit>.
 *
 *   node review-scope.mjs fix --since <commit> [--base <ref>] [--repo <dir>] [--json]
 *       The fix round: what changed after <commit>, the commit the review looked at. Raises a flag when the fix
 *       changes code but no test, touches a risky file, or changes code in a file the reviewed change did not.
 *       Tests and docs are not code here, and a deleted test does not count as a test. Prints the command that shows
 *       the second look the fix and nothing else, plus any new files git does not track yet.
 *
 *   node review-scope.mjs config [--repo <dir>] [--json]
 *       The effective configuration: `.claude/review-rules.json` in the repository merged over the defaults, with
 *       the delegation budget taken from the LEAN_SUBAGENT_BUDGET environment variable when it is set.
 *
 * Configuration, every key optional:
 *   {
 *     "mustFix":    ["sentences naming failures that block a merge in this project"],   added to the defaults
 *     "riskyPaths": ["globs of the code where a small fix can break more than it repairs"],
 *     "testPaths":  ["globs that mark a file as a test"],                                 replaces the defaults
 *     "docPaths":   ["globs that mark a file as documentation"],                        replaces the defaults
 *     "checks":     ["the commands that prove the project still works, e.g. npm test"],
 *     "delegation": { "budget": "tight | normal | generous", "minFiles": 3, "log": "docs/delegation-log.md" }
 *   }
 *
 * Glob syntax, relative to the repository root with forward slashes: `*` and `?` stay inside one path segment, `**`
 * crosses segments, `{a,b}` is a choice, a trailing `/` means everything under that folder, and a path without glob
 * characters matches that file or everything under that folder.
 *
 * Exit codes: 0 done (for `fix`, no flag raised); 1 `fix` raised a flag; 2 usage, an invalid configuration, or a git
 * command failed. Needs Node 20+ and git on PATH.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs as nodeParseArgs } from 'node:util';
import { CONFIG_FILE, resolveConfig, parseNumstat, classify, summarizeChange, fixFlags, formatChange, formatFix, formatConfig } from './review-scope-rules.mjs';
export * from './review-scope-rules.mjs';

// ---------------------------------------------------------------------------------------------------------------
// Git and the file system
// ---------------------------------------------------------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

function tryGit(repo, args) {
  try { return git(repo, args).trim(); } catch { return null; }
}

/** Read and resolve the configuration for a repository. */
export function loadConfig(repo, env = process.env) {
  const path = join(repo, CONFIG_FILE);
  let project = {};
  if (existsSync(path)) {
    try { project = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return { errors: [`${CONFIG_FILE} is not valid JSON: ${e.message}`] }; }
  }
  return { ...resolveConfig(project, env), found: existsSync(path) };
}

/** The base ref: the one given, else origin/HEAD, main, master. Throws when none resolves to a commit. */
export function resolveBase(repo, base) {
  const candidates = base ? [base] : ['origin/HEAD', 'main', 'master', 'origin/main', 'origin/master'];
  for (const c of candidates) if (tryGit(repo, ['rev-parse', '--verify', '--quiet', `${c}^{commit}`])) return c;
  throw new Error(base ? `not a commit: ${base}` : `no base branch found (tried ${candidates.join(', ')}); pass --base`);
}

const NEED_START = 'pass --base <the commit the change started from>';

/** True when the checked-out branch is the base branch itself (locally or as a remote-tracking ref). */
function onBaseBranch(repo, base) {
  const cur = tryGit(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!cur) return false;
  const full = tryGit(repo, ['rev-parse', '--abbrev-ref', base]) || base; // origin/HEAD becomes origin/main
  const remotes = (tryGit(repo, ['remote']) || '').split('\n').filter(Boolean);
  return full === cur || remotes.some((r) => full === `${r}/${cur}`);
}

/** The merge base of the base ref and `ref`. Throws a readable error when there is none, or when the base was guessed
 * and the work sits on the base branch itself, which leaves the change without a start the script can find: for
 * `fix`, the reviewed commit is already on the base; for `change`, HEAD is the base branch. */
function startOf(repo, base, explicit, ref) {
  const mb = tryGit(repo, ['merge-base', base, ref]);
  if (!mb) throw new Error(`${base} and ${ref} have no history in common; ${NEED_START}`);
  const onBase = ref === 'HEAD' ? onBaseBranch(repo, base) : true;
  if (!explicit && onBase && mb === git(repo, ['rev-parse', ref]).trim()) {
    throw new Error(`${ref} is already on ${base}, so the change has no start to compare with; ${NEED_START}`);
  }
  return mb;
}

function countLines(path) {
  try {
    const buf = readFileSync(path);
    if (buf.includes(0)) return 0;
    const text = buf.toString('utf8');
    return text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  } catch { return 0; }
}

/** Every file that differs from `ref` in the working tree (staged or not), plus untracked files. */
export function changedSince(repo, ref) {
  const files = parseNumstat(git(repo, ['diff', '--numstat', '-z', '--no-renames', ref]))
    .map((f) => ({ ...f, deleted: !existsSync(join(repo, f.path)), untracked: false }));
  const seen = new Set(files.map((f) => f.path));
  for (const p of git(repo, ['ls-files', '-o', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
    if (!seen.has(p)) files.push({ path: p, added: countLines(join(repo, p)), removed: 0, deleted: false, untracked: true });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function collectChange(repo, base, config) {
  const b = resolveBase(repo, base);
  const mergeBase = startOf(repo, b, !!base, 'HEAD');
  const files = classify(changedSince(repo, mergeBase), config);
  return { base: b, mergeBase, files, summary: summarizeChange(files), riskyConfigured: config.riskyPaths.length > 0 };
}

export function collectFix(repo, since, base, config) {
  const sinceSha = tryGit(repo, ['rev-parse', '--verify', '--quiet', `${since}^{commit}`]);
  if (!sinceSha) throw new Error(`not a commit: ${since}`);
  const b = resolveBase(repo, base);
  const mergeBase = startOf(repo, b, !!base, sinceSha);
  const reviewed = git(repo, ['diff', '--name-only', '-z', '--no-renames', mergeBase, sinceSha]).split('\0').filter(Boolean);
  const files = classify(changedSince(repo, sinceSha), config);
  return { repo, since: sinceSha, base: b, reviewed, files, flags: fixFlags(files, reviewed) };
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------

const USAGE = `Usage:
  node review-scope.mjs change [--base <ref>] [--repo <dir>] [--json]
  node review-scope.mjs fix --since <commit> [--base <ref>] [--repo <dir>] [--json]
  node review-scope.mjs config [--repo <dir>] [--json]`;

export function parseArgs(argv) {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    allowPositionals: true,
    options: { base: { type: 'string' }, since: { type: 'string' }, repo: { type: 'string' }, json: { type: 'boolean' } },
  });
  const [cmd, ...extra] = positionals;
  if (!['change', 'fix', 'config'].includes(cmd) || extra.length) throw new Error('unknown or missing command');
  if (cmd === 'fix' && !values.since) throw new Error('fix needs --since <commit>');
  if (cmd !== 'fix' && values.since) throw new Error('--since is only for fix');
  return { cmd, base: values.base, since: values.since, repo: resolve(values.repo || '.'), json: !!values.json };
}

export function main(argv, env = process.env, out = console.log, err = console.error) {
  let a;
  try { a = parseArgs(argv); } catch (e) { err(`${e.message}\n${USAGE}`); return 2; }
  const top = tryGit(a.repo, ['rev-parse', '--show-toplevel']);
  if (!top) { err(`not a git repository: ${a.repo}`); return 2; }
  const loaded = loadConfig(top, env);
  if (loaded.errors.length) { err(loaded.errors.join('\n')); return 2; }
  const config = loaded.config;
  try {
    if (a.cmd === 'config') {
      out(a.json ? JSON.stringify({ file: loaded.found ? CONFIG_FILE : null, ...config }, null, 2) : `${loaded.found ? CONFIG_FILE : `No ${CONFIG_FILE}; defaults`}\n${formatConfig(config)}`);
      return 0;
    }
    if (a.cmd === 'change') {
      const r = collectChange(top, a.base, config);
      out(a.json ? JSON.stringify(r, null, 2) : formatChange(r));
      return 0;
    }
    const r = collectFix(top, a.since, a.base, config);
    out(a.json ? JSON.stringify(r, null, 2) : formatFix(r));
    return r.flags.length ? 1 : 0;
  } catch (e) {
    err(String(e.stderr || e.message).trim());
    return 2;
  }
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
