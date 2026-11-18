#!/usr/bin/env node
/**
 * Scope checks for a review and its fix round. Read only: it never changes a file, a branch or the index.
 *
 *   node review-scope.mjs change [--base <ref>] [--repo <dir>] [--json]
 *       What the change under review touches: every file changed since the merge base with the base branch
 *       (committed, staged, unstaged and untracked), lines added and removed, which files match `riskyPaths`, and
 *       which are tests. Without --base it uses origin/HEAD, then main, master, origin/main and origin/master,
 *       whichever exists first. When the work is committed on the base branch itself, pass --base <start commit>.
 *       Also lists, for each changed file, the REVIEW.md files at the merge base from its folder up to the root,
 *       nearest first, each with the `git show` command that prints it.
 *
 *   node review-scope.mjs fix --since <commit> [--base <ref>] [--repo <dir>] [--json]
 *       The fix round: what changed after <commit>, the commit the review looked at. Raises a flag when the fix
 *       changes code but no test, touches a risky file, changes code in a file the reviewed change did not, or edits
 *       what judges it (RULES). Tests and docs are not code here, and a deleted test does not count as a test. Prints
 *       the command that shows the second look the fix and nothing else, plus any new files git does not track yet.
 *
 *   node review-scope.mjs config [--repo <dir>] [--json]
 *       The effective configuration: `.claude/review-rules.json` in the repository merged over the defaults, with
 *       the delegation budget taken from the LEAN_SUBAGENT_BUDGET environment variable when it is set.
 *
 * Rules from the merge base: `change` and `fix` read `.claude/review-rules.json` as committed at the merge base, the
 * commit the change started from, so a change cannot loosen the rules that judge it; an uncommitted file is not read,
 * and one committed as a symlink is an error. Every git command runs with GIT_NO_REPLACE_OBJECTS=1.
 * They print where the rules came from. RULES flags a changed file that is the rules file, a REVIEW.md (except one
 * next to a SKILL.md, a skill's own file), or a path a `checks` command or checklist `check` names as a whole word
 * (split on whitespace and '"`=()[],;, a leading ./, a trailing . or : and a pytest ::<test> dropped). `change`
 * prints it and exits 0; `fix` raises it. A REVIEW.md that only the change adds is flagged, not listed.
 *
 * Configuration, every key optional:
 *   {
 *     "mustFix":    ["sentences naming failures that block a merge in this project"],   added to the defaults
 *     "riskyPaths": ["globs of the code where a small fix can break more than it repairs"],
 *     "testPaths":  ["globs that mark a file as a test"],                                 replaces the defaults
 *     "docPaths":   ["globs that mark a file as documentation"],                        replaces the defaults
 *     "checks":     ["the commands that prove the project still works, e.g. npm test"],
 *     "delegation": { "budget": "tight | normal | generous", "minFiles": 3, "log": "docs/delegation-log.md" },
 *     "checklist":  [{ "trigger": { "paths": ["migrations/**"], "added": "DROP\\s+TABLE", "flags": "i" },
 *                      "check": "what the reviewer verifies", "why": "the incident, pull request or commit behind it" }]
 *   }
 *
 * Checklist: `change` and `fix` print only the entries the diff triggers. A trigger with `paths` matches any changed
 * file; one with `added`, a regex in JavaScript syntax with no flags unless `flags` is "i", is tested on each added
 * line (the lines of untracked text files count whole); both together means a matching line in a matching file. The
 * rules file never triggers an entry. A regex that runs past the time limit or fails, or a diff over 64 MiB, prints
 * the entry as triggered. A file git treats as binary (a real binary, `-diff` or `binary` in .gitattributes, or
 * `diff.<driver>.binary`) has no added lines, so only `paths` can match it; `diff.submodule` output is not read.
 *
 * Glob syntax, relative to the repository root with forward slashes: `*` and `?` stay inside one path segment, `**`
 * crosses segments, `{a,b}` is a choice, a trailing `/` means everything under that folder, and a path without glob
 * characters matches that file or everything under that folder.
 *
 * Exit codes: 0 done (for `fix`, no flag raised); 1 `fix` raised a flag; 2 usage, an invalid configuration (for
 * `change` and `fix`, the one at the merge base), or a git command failed. Needs Node 20+ and git on PATH.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, existsSync, lstatSync, readlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs as nodeParseArgs } from 'node:util';
import {
  CONFIG_FILE, REVIEW_FILE, RULES_MESSAGES, resolveConfig, parseNumstat, classify, summarizeChange, fixFlags, rulesFlag, reviewFiles,
  isBlobLine, isReviewFile, folderOf, foldersUp, inFolder, formatChange, formatFix, formatConfig,
} from './review-scope-rules.mjs';
import { parseAddedLines, splitLines, matchChecklist } from './review-scope-checklist.mjs';
export * from './review-scope-rules.mjs';
export * from './review-scope-checklist.mjs';

// ---------------------------------------------------------------------------------------------------------------
// Git and the file system
// ---------------------------------------------------------------------------------------------------------------

/** The most output read from one git command, the diff of the added lines included. */
export const DIFF_MAX_BYTES = 64 * 1024 * 1024;

// A local `git replace` must not change the objects the script reads: the rules at the base, or the diff.
const NO_REPLACE = { GIT_NO_REPLACE_OBJECTS: '1' };

function git(repo, args, env = process.env, maxBuffer = DIFF_MAX_BYTES) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...env, ...NO_REPLACE }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer });
}

function tryGit(repo, args) {
  try { return git(repo, args).trim(); } catch { return null; }
}

const stripBom = (text) => text.replace(/^\uFEFF/, '');

/** Read and resolve the configuration in a repository's working tree, for `config`. */
export function loadConfig(repo, env = process.env) {
  const path = join(repo, CONFIG_FILE);
  let project = {};
  if (existsSync(path)) {
    try { project = JSON.parse(stripBom(readFileSync(path, 'utf8'))); } catch (e) { return { errors: [`${CONFIG_FILE} is not valid JSON: ${e.message}`] }; }
  }
  return { ...resolveConfig(project, env), found: existsSync(path) };
}

/** Read and resolve the configuration as it is at `commit`, for `change` and `fix`: the raw blob, with no textconv or
 * filter. No file there means the defaults; a symlink, folder or submodule there is an error. Problems name the file
 * and the commit. */
export function loadConfigAt(repo, commit, env = process.env) {
  const label = `${CONFIG_FILE} at ${commit.slice(0, 12)}`;
  const entry = tryGit(repo, ['ls-tree', commit, '--', CONFIG_FILE]); // "<mode> <type> <oid>\t<path>", or empty
  const found = !!entry;
  let project = {};
  if (found) {
    const [mode, , oid] = entry.split('\t')[0].split(' ');
    if (mode !== '100644' && mode !== '100755') {
      return { errors: [`${label}: is ${{ 120000: 'a symlink', 160000: 'a submodule' }[mode] || 'a folder'}; commit the file itself`] };
    }
    const text = stripBom(git(repo, ['cat-file', 'blob', oid]));
    try { project = JSON.parse(text); } catch (e) { return { errors: [`${label}: not valid JSON: ${e.message}`] }; }
  }
  return { ...resolveConfig(project, env, label), found };
}

/** The rules at the merge base for `change` and `fix`. Throws on an invalid file there, so the CLI exits 2. */
function rulesAt(repo, commit, env = process.env) {
  const loaded = loadConfigAt(repo, commit, env);
  if (loaded.errors.length) throw new Error(loaded.errors.join('\n'));
  return { config: loaded.config, rules: { commit, file: loaded.found ? CONFIG_FILE : null } };
}

/** For each folder, whether REVIEW.md and SKILL.md are blobs there at `commit`, from one `git cat-file --batch-check`. */
function blobsAt(repo, commit, folders) {
  // shortcut: a folder whose name holds a newline is left out, since its question would shift every later answer;
  // ask with `cat-file -Z` (git 2.43+) if such a folder ever needs its REVIEW.md read.
  const dirs = [...new Set(folders)].filter((d) => !d.includes('\n'));
  if (!dirs.length) return new Map();
  const input = dirs.map((d) => `${commit}:${inFolder(d, REVIEW_FILE)}\n${commit}:${inFolder(d, 'SKILL.md')}\n`).join('');
  const answers = execFileSync('git', ['-C', repo, 'cat-file', '--batch-check'], { input, encoding: 'utf8', env: { ...process.env, ...NO_REPLACE }, maxBuffer: DIFF_MAX_BYTES }).split('\n');
  return new Map(dirs.map((d, i) => [d, { review: isBlobLine(answers[2 * i]), skill: isBlobLine(answers[2 * i + 1]) }]));
}

/** The folders whose REVIEW.md is a skill's own file: a SKILL.md beside it at the merge base that `files` (the change)
 * does not delete, or a REVIEW.md new in the change beside a SKILL.md that is itself one of the changed files. */
function skillFolders(atBase, files) {
  const kept = new Set(files.filter((f) => !f.deleted).map((f) => f.path));
  const deleted = new Set(files.filter((f) => f.deleted).map((f) => f.path));
  return new Set([...atBase].filter(([d, b]) => {
    const skill = inFolder(d, 'SKILL.md');
    return b.skill ? !deleted.has(skill) : !b.review && kept.has(skill);
  }).map(([d]) => d));
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

/** The text lines of an untracked file, or null for a binary file or one that cannot be read (a nested repository).
 * A symlink is not followed: its one line is its target path, which is what git shows once the link is committed. */
function textLines(path) {
  try {
    if (lstatSync(path).isSymbolicLink()) return [readlinkSync(path)];
    const buf = readFileSync(path);
    if (buf.includes(0)) return null;
    return splitLines(buf.toString('utf8'));
  } catch { return null; }
}

// The repository's own settings must not change what a checklist regex sees: no prefixes of its choosing, no colour,
// no external diff, no textconv, no context. GIT_DIFF_OPTS would override -U0.
const DIFF_ARGS = ['diff', '-U0', '--inter-hunk-context=0', '--no-ext-diff', '--no-color', '--no-textconv', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/'];

/** The added lines since `ref` in the working tree (committed, staged and unstaged), plus the whole text of every
 * untracked file in `files`: a Map from path to [{ line, text }]. Null when the diff is over `maxBytes`. */
export function addedLinesSince(repo, ref, files, maxBytes = DIFF_MAX_BYTES) {
  const { GIT_DIFF_OPTS, ...env } = process.env;
  let diff;
  try { diff = git(repo, [...DIFF_ARGS, ref, '--'], env, maxBytes); } catch (e) { if (e.code === 'ENOBUFS') return null; throw e; }
  const added = parseAddedLines(diff);
  for (const f of files.filter((x) => x.untracked)) {
    const lines = textLines(join(repo, f.path));
    if (lines) added.set(f.path, lines.map((text, i) => ({ line: i + 1, text })));
  }
  return added;
}

const sizeText = (n) => (n % 1048576 === 0 ? `${n / 1048576} MiB` : `${n} bytes`);

/** The checklist result for files changed since `ref`. The diff is read only when some entry has a regex. A diff over
 * `maxDiffBytes` is not read, and every regex entry is printed as triggered instead. */
function checklistSince(repo, ref, files, config, { maxDiffBytes = DIFF_MAX_BYTES } = {}) {
  const entries = config.checklist;
  const added = entries.some((e) => e.trigger.added) ? addedLinesSince(repo, ref, files, maxDiffBytes) : new Map();
  const unread = added ? null : `the diff was too large to read (over ${sizeText(maxDiffBytes)})`;
  return { entries: entries.length, triggered: matchChecklist(entries, files, added || new Map(), unread) };
}

/** With `config` null, the rules are read at the merge base (`options.env` resolves the budget) and reported as `rules`;
 * a caller that passes a config gets `rules: null`. `options.maxDiffBytes` caps the diff read for the checklist. */
export function collectChange(repo, base, config = null, options = {}) {
  const b = resolveBase(repo, base);
  const mergeBase = startOf(repo, b, !!base, 'HEAD');
  const loaded = config ? null : rulesAt(repo, mergeBase, options.env);
  const cfg = config || loaded.config;
  const files = classify(changedSince(repo, mergeBase), cfg);
  const atBase = blobsAt(repo, mergeBase, files.flatMap((f) => foldersUp(f.path)));
  return {
    base: b, mergeBase, rules: loaded && loaded.rules, files, summary: summarizeChange(files), riskyConfigured: cfg.riskyPaths.length > 0,
    checklist: checklistSince(repo, mergeBase, files, cfg, options),
    flags: rulesFlag(files, cfg, skillFolders(atBase, files), RULES_MESSAGES.change),
    reviewFiles: reviewFiles(files.map((f) => f.path), atBase, repo, mergeBase),
  };
}

/** `config` and `options` as for collectChange. RULES comes after the other flags. */
export function collectFix(repo, since, base, config = null, options = {}) {
  const sinceSha = tryGit(repo, ['rev-parse', '--verify', '--quiet', `${since}^{commit}`]);
  if (!sinceSha) throw new Error(`not a commit: ${since}`);
  const b = resolveBase(repo, base);
  const mergeBase = startOf(repo, b, !!base, sinceSha);
  const loaded = config ? null : rulesAt(repo, mergeBase, options.env);
  const cfg = config || loaded.config;
  const reviewed = git(repo, ['diff', '--name-only', '-z', '--no-renames', mergeBase, sinceSha]).split('\0').filter(Boolean);
  const files = classify(changedSince(repo, sinceSha), cfg);
  const skills = skillFolders(blobsAt(repo, mergeBase, files.filter((f) => isReviewFile(f.path)).map((f) => folderOf(f.path))), files);
  return {
    repo, since: sinceSha, base: b, rules: loaded && loaded.rules, reviewed, files,
    flags: [...fixFlags(files, reviewed), ...rulesFlag(files, cfg, skills, RULES_MESSAGES.fix)],
    checklist: checklistSince(repo, sinceSha, files, cfg, options),
  };
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
  try {
    if (a.cmd === 'config') {
      const loaded = loadConfig(top, env);
      if (loaded.errors.length) { err(loaded.errors.join('\n')); return 2; }
      const config = loaded.config;
      out(a.json ? JSON.stringify({ file: loaded.found ? CONFIG_FILE : null, ...config }, null, 2) : `${loaded.found ? CONFIG_FILE : `No ${CONFIG_FILE}; defaults`}\n${formatConfig(config)}`);
      return 0;
    }
    if (a.cmd === 'change') {
      const r = collectChange(top, a.base, null, { env });
      out(a.json ? JSON.stringify(r, null, 2) : formatChange(r));
      return 0;
    }
    const r = collectFix(top, a.since, a.base, null, { env });
    out(a.json ? JSON.stringify(r, null, 2) : formatFix(r));
    return r.flags.length ? 1 : 0;
  } catch (e) {
    err(String(e.stderr || e.message).trim());
    return 2;
  }
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
