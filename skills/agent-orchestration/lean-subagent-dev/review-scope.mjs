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

export const CONFIG_FILE = '.claude/review-rules.json';
export const BUDGET_ENV = 'LEAN_SUBAGENT_BUDGET';
export const BUDGETS = ['tight', 'normal', 'generous'];
/** Files a change must touch before it goes to a subagent, by budget. A subagent re-reads what it needs, so a tight
 * budget delegates less, not more. */
export const MIN_FILES = { tight: 5, normal: 3, generous: 2 };

export const DEFAULTS = {
  mustFix: [
    'a security hole: a secret printed, logged, committed or cached; an access check bypassed; untrusted input reaching a shell, query or file path',
    'data lost, corrupted, or written to the wrong place or the wrong account',
    'a wrong result on the main path a user takes',
    'a broken build, install, test run, typecheck or lint',
    'a failed contract or acceptance criterion',
  ],
  riskyPaths: [],
  testPaths: [
    '**/test/**', '**/tests/**', '**/__tests__/**', '**/spec/**', '**/specs/**',
    '**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/*_spec.*', '**/test_*', '**/*Test.*', '**/*Tests.*',
  ],
  docPaths: ['docs/**', 'doc/**', '**/*.md', '**/*.mdx', '**/*.rst', '**/*.adoc', '**/LICENSE*', '**/CHANGELOG*'],
  checks: [],
  delegation: { budget: 'normal', minFiles: null, log: null },
};

// ---------------------------------------------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------------------------------------------

/** Clean a glob or path: backslashes to slashes, no leading ./ or /. */
export function normalizePath(p) {
  let s = String(p).trim().replace(/\\/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  return s.replace(/^\/+/, '');
}

/** Compile a glob to a RegExp over repository-relative paths. Throws on an unbalanced brace. */
export function globToRegExp(glob) {
  const g = normalizePath(glob);
  if (!/[*?{]/.test(g)) {
    const lit = g.replace(/\/+$/, '').replace(/[.+^$()|[\]\\]/g, '\\$&');
    return new RegExp(`^${lit}(?:/.*)?$`);
  }
  let out = '';
  let depth = 0;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      if (g[i + 2] === '/') { out += '(?:.*/)?'; i += 2; } else { out += '.*'; i += 1; }
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '{') { out += '(?:'; depth++; }
    else if (c === '}' && depth > 0) { out += ')'; depth--; }
    else if (c === ',' && depth > 0) out += '|';
    else out += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  if (depth !== 0) throw new Error(`unbalanced brace in glob: ${glob}`);
  if (g.endsWith('/')) out += '.*';
  return new RegExp(`^${out}$`);
}

/** A predicate that is true when a path matches any of the globs. */
export function anyMatch(globs) {
  const res = globs.map(globToRegExp);
  return (path) => res.some((re) => re.test(normalizePath(path)));
}

const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() !== '');

/** Validate a parsed config object. Returns a list of problems; empty means valid. */
export function validateConfig(cfg) {
  const errs = [];
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) return ['the configuration must be a JSON object'];
  const known = ['mustFix', 'riskyPaths', 'testPaths', 'docPaths', 'checks', 'delegation'];
  for (const k of Object.keys(cfg)) if (!known.includes(k)) errs.push(`unknown key "${k}" (known: ${known.join(', ')})`);
  for (const k of ['mustFix', 'riskyPaths', 'testPaths', 'docPaths', 'checks']) {
    if (k in cfg && !isStringList(cfg[k])) errs.push(`"${k}" must be a list of non-empty strings`);
  }
  for (const k of ['riskyPaths', 'testPaths', 'docPaths']) {
    if (isStringList(cfg[k])) for (const g of cfg[k]) { try { globToRegExp(g); } catch (e) { errs.push(`"${k}": ${e.message}`); } }
  }
  if ('delegation' in cfg) {
    const d = cfg.delegation;
    if (d === null || typeof d !== 'object' || Array.isArray(d)) errs.push('"delegation" must be an object');
    else {
      for (const k of Object.keys(d)) if (!['budget', 'minFiles', 'log'].includes(k)) errs.push(`unknown key "delegation.${k}"`);
      if ('budget' in d && !BUDGETS.includes(d.budget)) errs.push(`"delegation.budget" must be one of ${BUDGETS.join(', ')}`);
      if ('minFiles' in d && !(Number.isInteger(d.minFiles) && d.minFiles >= 1)) errs.push('"delegation.minFiles" must be a whole number of at least 1');
      if ('log' in d && (typeof d.log !== 'string' || d.log.trim() === '')) errs.push('"delegation.log" must be a non-empty path');
    }
  }
  return errs;
}

/** Merge a valid project config over the defaults and resolve the budget. `env` is checked for BUDGET_ENV. Problems
 * in the project config are prefixed with `label`. */
export function resolveConfig(project = {}, env = {}, label = CONFIG_FILE) {
  const errs = validateConfig(project).map((e) => `${label}: ${e}`);
  const envBudget = env[BUDGET_ENV] ? String(env[BUDGET_ENV]).trim().toLowerCase() : '';
  if (envBudget && !BUDGETS.includes(envBudget)) errs.push(`${BUDGET_ENV} must be one of ${BUDGETS.join(', ')}, not "${env[BUDGET_ENV]}"`);
  if (errs.length) return { errors: errs };
  const d = project.delegation || {};
  const budget = envBudget || d.budget || DEFAULTS.delegation.budget;
  const budgetFrom = envBudget ? BUDGET_ENV : d.budget ? CONFIG_FILE : 'default';
  return {
    errors: [],
    config: {
      mustFix: [...DEFAULTS.mustFix, ...(project.mustFix || [])],
      riskyPaths: project.riskyPaths || DEFAULTS.riskyPaths,
      testPaths: project.testPaths || DEFAULTS.testPaths,
      docPaths: project.docPaths || DEFAULTS.docPaths,
      checks: project.checks || DEFAULTS.checks,
      delegation: { budget, budgetFrom, minFiles: d.minFiles || MIN_FILES[budget], log: d.log || null },
    },
  };
}

/** Parse `git diff --numstat -z --no-renames` output into [{ path, added, removed }]; binary files count 0 lines. */
export function parseNumstat(z) {
  const out = [];
  for (const rec of String(z).split('\0')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/s.exec(rec.replace(/^\n+/, ''));
    if (m) out.push({ path: m[3], added: m[1] === '-' ? 0 : Number(m[1]), removed: m[2] === '-' ? 0 : Number(m[2]) });
  }
  return out;
}

/** Tag each changed file as risky, test and/or doc. A file that is both a test and a doc counts as a test. */
export function classify(files, config) {
  const risky = anyMatch(config.riskyPaths);
  const test = anyMatch(config.testPaths);
  const doc = anyMatch(config.docPaths);
  return files.map((f) => {
    const t = test(f.path);
    return { ...f, risky: risky(f.path), test: t, doc: !t && doc(f.path) };
  });
}

/** Summarise a change. `files` comes from classify(). */
export function summarizeChange(files) {
  return {
    files: files.length,
    added: files.reduce((n, f) => n + f.added, 0),
    removed: files.reduce((n, f) => n + f.removed, 0),
    risky: files.filter((f) => f.risky).map((f) => f.path),
    tests: files.filter((f) => f.test).map((f) => f.path),
    docs: files.filter((f) => f.doc).map((f) => f.path),
    code: files.filter((f) => !f.test && !f.doc).map((f) => f.path),
  };
}

/** The flags for a fix round. `fix` comes from classify(); `reviewed` is the list of paths the review looked at. */
export function fixFlags(fix, reviewed) {
  const flags = [];
  if (fix.length === 0) return flags;
  const inReview = new Set(reviewed);
  const code = fix.filter((f) => !f.test && !f.doc);
  if (code.length > 0 && !fix.some((f) => f.test && !f.deleted)) {
    flags.push({ id: 'NO_TEST', paths: code.map((f) => f.path), message: 'the fix changes code and no test. Every fix comes with a test that fails without it.' });
  }
  const risky = fix.filter((f) => f.risky).map((f) => f.path);
  if (risky.length) {
    flags.push({ id: 'RISKY', paths: risky, message: 'the fix touches risky code. Weigh the fix, not only the problem: if the problem is minor, revert this and open an issue.' });
  }
  // A new test is what the fix round asks for, and a doc the change made untrue belongs to the change, so only code
  // counts as outside it.
  const outside = code.filter((f) => !inReview.has(f.path)).map((f) => f.path);
  if (outside.length) {
    flags.push({ id: 'OUTSIDE', paths: outside, message: 'the fix touches files the reviewed change did not. Unless this is a must-fix, revert it and open an issue.' });
  }
  return flags;
}

const shQuote = (s) => (/^[A-Za-z0-9._\/@:=+-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

function fileLine(f) {
  const tags = [f.risky ? 'RISKY' : '', f.test ? 'test' : '', f.doc ? 'doc' : ''].filter(Boolean).join(', ');
  return `  ${f.path}  +${f.added} -${f.removed}${tags ? `  (${tags})` : ''}`;
}

export function formatChange(r) {
  const s = r.summary;
  const lines = [`Change since ${r.base} (merge base ${r.mergeBase.slice(0, 12)}): ${s.files} file(s), +${s.added} -${s.removed}`];
  for (const f of r.files) lines.push(fileLine(f));
  lines.push(`Risky files: ${s.risky.length ? s.risky.join(', ') : 'none'}${r.riskyConfigured ? '' : ` (no riskyPaths in ${CONFIG_FILE})`}`);
  lines.push(`Code files: ${s.code.length}; test files: ${s.tests.length}; doc files: ${s.docs.length}`);
  if (s.code.length && !s.tests.length) lines.push('Note: code changed and no test did. New behaviour without a test is a "fix if cheap" finding.');
  return lines.join('\n');
}

export function formatFix(r) {
  if (r.files.length === 0) return `Fix since ${r.since.slice(0, 12)}: nothing changed. There is no fix to look at.`;
  const s = summarizeChange(r.files);
  const lines = [`Fix since ${r.since.slice(0, 12)}: ${s.files} file(s), +${s.added} -${s.removed}`];
  for (const f of r.files) lines.push(fileLine(f));
  if (r.flags.length) {
    lines.push('Flags:');
    for (const fl of r.flags) lines.push(`  ${fl.id}: ${fl.paths.join(', ')}: ${fl.message}`);
  } else lines.push('Flags: none');
  const tracked = r.files.filter((f) => !f.untracked).map((f) => shQuote(f.path));
  const untracked = r.files.filter((f) => f.untracked).map((f) => f.path);
  if (tracked.length) lines.push(`Second look, the fix only: git -C ${shQuote(r.repo)} diff ${r.since.slice(0, 12)} -- ${tracked.join(' ')}`);
  if (untracked.length) lines.push(`New files, not in git yet, read them whole: ${untracked.join(', ')}`);
  return lines.join('\n');
}

export function formatConfig(c) {
  const d = c.delegation;
  return [
    `Budget: ${d.budget} (from ${d.budgetFrom}); ${d.budget === 'tight'
      ? `delegate changes of ${d.minFiles}+ files, make smaller changes yourself`
      : `delegate any change in behaviour or tests, and any change of ${d.minFiles}+ files`}`,
    `Delegation log: ${d.log || 'off'}`,
    'Must fix:', ...c.mustFix.map((m) => `  - ${m}`),
    `Risky paths: ${c.riskyPaths.length ? c.riskyPaths.join(', ') : 'none set'}`,
    `Checks: ${c.checks.length ? c.checks.join('; ') : `none set; use the project's own test, lint and typecheck commands`}`,
    `Test paths: ${c.testPaths.join(', ')}`,
    `Doc paths: ${c.docPaths.join(', ')}`,
  ].join('\n');
}

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
