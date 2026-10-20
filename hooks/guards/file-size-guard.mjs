#!/usr/bin/env node
// PreToolUse guard for Write, Edit and MultiEdit: refuse a change that leaves a file in the project over its token
// limit and larger than it was, and say how to split the file instead.
//
// Why: agents read big files in pieces and pay for every token, and the Read tool stops at 25,000 tokens. Agents also
// keep appending to the file they already have open, so a file grows until nobody can read it in one go.
//
// The rule: tokens are UTF-8 bytes divided by 4. A change is refused when the size after it is over the limit and
// larger than the size before (a new file counts as 0 before). Exactly the limit is not over it. A change that keeps
// an over-limit file the same size or smaller passes, so old big files can still be fixed and split.
//
// The size after: Write is the new content. Edit and MultiEdit apply each edit to the file's current text in order,
// the first occurrence or every one with replace_all. The call passes when the tool itself would refuse it: an
// old_string not in the file, one found more than once without replace_all, or an empty old_string on a file that is
// not blank (an empty old_string on a missing or blank file makes a file of new_string). Claude Code's Edit may match
// after turning CRLF line endings into LF; an exact match then misses and the call passes (it fails open).
//
// It sees only the Write, Edit and MultiEdit tools. A file written by a Bash command (a heredoc, a redirect, a
// generator script run with node or python) is never checked here; the repository test is what catches those.
//
// Only files inside the project count (real paths, so a project reached through a link still counts). Skipped:
// lockfiles by name, notebooks (.ipynb), minified files (*.min.*), binaries (a NUL byte), "@generated" or "DO NOT
// EDIT" in the first 5 lines, paths git marks linguist-generated or linguist-vendored (git check-attr), git-ignored
// paths (git check-ignore), and "ignorePaths". Without git, or outside a repository, the two git rules do not apply.
// They run only for a change that would otherwise be refused, so a passing change reads one file and starts nothing.
//
// Options, in .claude/pau-skills.json (globs relative to the project root, or a file name alone; **, * and ?):
//
//   { "file-size-guard": { "maxTokens": 5000, "pathLimits": { "docs/big.md": 8000 }, "ignorePaths": ["fixtures/**"] } }
//
// The first matching "pathLimits" glob wins. A value that is not a positive number falls back to the default.
// Refuses with exit 2 and the message on stderr. Exits 0 on input it does not understand.
//
// tests/file-size.test.mjs applies the same rule to every tracked file with listOversized(), exported below.
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';
import { globToRegExp } from './secret-guard.mjs';

export const NAME = 'file-size-guard';
export const DEFAULT_TOKENS = 5000;
const TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

// Lockfiles are written by package managers, not by people or agents.
export const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'deno.lock',
  'Cargo.lock', 'poetry.lock', 'uv.lock', 'Pipfile.lock', 'pdm.lock', 'pixi.lock', 'conda-lock.yml', 'Gemfile.lock',
  'composer.lock', 'go.sum', 'go.work.sum', 'mix.lock', 'pubspec.lock', 'Podfile.lock', 'Cartfile.resolved',
  'Package.resolved', 'packages.lock.json', 'paket.lock', 'project.assets.json', 'flake.lock', 'gradle.lockfile',
  'buildscript-gradle.lockfile', 'Manifest.toml', 'shard.lock', 'stack.yaml.lock', 'cabal.project.freeze',
  'rebar.lock', 'renv.lock', 'vcpkg-lock.json', 'conan.lock', 'MODULE.bazel.lock', '.terraform.lock.hcl',
]);

export const tokensOf = (bytes) => Math.ceil(bytes / 4);
const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const matches = (glob, rel) => typeof glob === 'string' && glob !== '' && (globToRegExp(glob).test(rel) || globToRegExp(glob).test(basename(rel)));

/** The limit in tokens for a path relative to the project root. */
export function limitFor(rel, options = {}) {
  const base = positive(options.maxTokens) ? options.maxTokens : DEFAULT_TOKENS;
  const limits = options.pathLimits && typeof options.pathLimits === 'object' && !Array.isArray(options.pathLimits) ? options.pathLimits : {};
  for (const [glob, n] of Object.entries(limits)) if (matches(glob, rel)) return positive(n) ? n : base;
  return base;
}

/** True for a path skipped by its name alone: a lockfile, a notebook, a minified file, or an "ignorePaths" glob. */
export function skippedByName(rel, options = {}) {
  const base = basename(rel);
  if (LOCKFILES.has(base) || /\.ipynb$/i.test(base) || /\.min\./i.test(base)) return true;
  return Array.isArray(options.ignorePaths) && options.ignorePaths.some((g) => matches(g, rel));
}

/** The first `n` lines of a text, without splitting all of it. */
function head(text, n = 5) {
  let i = -1;
  for (let k = 0; k < n; k++) { i = text.indexOf('\n', i + 1); if (i === -1) return text; }
  return text.slice(0, i);
}

/** True for a binary (a NUL byte) or a file marked generated in its first 5 lines. */
export const skippedByContent = (text) => text.includes('\0') || /@generated|DO NOT EDIT/.test(head(text));

/** One edit applied to the text, or null when the tool would refuse it. Never replaces an empty string. */
function applyEdit(text, e) {
  if (!e || typeof e !== 'object' || typeof e.old_string !== 'string' || typeof e.new_string !== 'string') return null;
  const { old_string: from, new_string: to } = e;
  if (from === '') return text.trim() === '' ? to : null;
  const i = text.indexOf(from);
  if (i === -1) return null;
  if (e.replace_all === true) return text.split(from).join(to);
  if (text.indexOf(from, i + from.length) !== -1) return null;
  return text.slice(0, i) + to + text.slice(i + from.length);
}

/** The file's text after the tool call ('' for a missing file before it), or null when the call changes nothing. */
export function textAfter(toolName, toolInput, current) {
  if (toolName === 'Write') return typeof toolInput.content === 'string' ? toolInput.content : null;
  const edits = toolName === 'Edit' ? [toolInput] : toolName === 'MultiEdit' && Array.isArray(toolInput.edits) ? toolInput.edits : null;
  if (!edits || !edits.length) return null;
  let text = current;
  for (const e of edits) { text = applyEdit(text, e); if (text === null) return null; }
  return text;
}

/**
 * A file's text: a string, null when it does not exist, undefined when it cannot be read or is not a regular file
 * (reading a named pipe or a device would block the hook).
 */
export function readText(path) {
  try {
    if (!statSync(path).isFile()) return undefined;
    return readFileSync(path, 'utf8');
  } catch (e) { return e && e.code === 'ENOENT' ? null : undefined; }
}

/**
 * Where a file is, by real path: { real, dir, rest, rel }. `dir` is its nearest existing folder, `rest` the path from
 * there, `rel` the path from the project root. Null when it is outside the project.
 */
export function locate(filePath, root) {
  const abs = resolve(root, filePath);
  let realRoot;
  try { realRoot = realpathSync.native(resolve(root)); } catch { realRoot = resolve(root); }
  let dir = dirname(abs);
  const rest = [basename(abs)];
  let realDir = null;
  while (realDir === null) {
    try { realDir = realpathSync.native(dir); } catch {
      const up = dirname(dir);
      if (up === dir) realDir = dir; else { rest.unshift(basename(dir)); dir = up; }
    }
  }
  const real = join(realDir, ...rest);
  const rel = relative(realRoot, real);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return null;
  return { real, dir: realDir, rest: rest.join('/'), rel: rel.split(sep).join('/') };
}

/** Run git with variables that point it at another repository cleared: { status, stdout }, status null on failure. */
export function runGit(args, cwd, env = process.env, timeout = 2000) {
  const clean = { ...env };
  for (const k of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) delete clean[k];
  const r = spawnSync('git', args, { cwd, env: clean, encoding: 'utf8', timeout, maxBuffer: 1 << 26, windowsHide: true });
  return { status: r.error ? null : r.status, stdout: r.stdout || '' };
}

/** The paths that `git check-attr -z` output marks generated or vendored ("set" or "true" only). */
export function attrHits(stdout) {
  const parts = String(stdout).split('\0');
  const hits = new Set();
  for (let i = 0; i + 2 < parts.length; i += 3) if (parts[i + 2] === 'set' || parts[i + 2] === 'true') hits.add(parts[i]);
  return hits;
}

/** True when git ignores the file or marks it generated or vendored. Runs in the innermost repository. */
export function gitSkipped({ dir, rest }, git = runGit) {
  const ignored = git(['check-ignore', '-q', '--', rest], dir);
  if (ignored.status === 0) return true;
  if (ignored.status !== 1) return false; // no git, or not a repository: the git rules do not apply
  const attrs = git(['check-attr', '-z', 'linguist-generated', 'linguist-vendored', '--', rest], dir);
  return attrs.status === 0 && attrHits(attrs.stdout).size > 0;
}

const LOG_EXT = new Set(['', 'md', 'txt', 'rst', 'adoc', 'log']); // a log is a text file; decisions.mjs is code
const DATA_EXT = new Set(['json', 'jsonl', 'csv', 'tsv', 'yaml', 'yml', 'xml', 'sql']);

/** The kind of file, for the split recipe. */
export function kindOf(path) {
  const p = String(path).replace(/\\/g, '/');
  const base = p.slice(p.lastIndexOf('/') + 1);
  const ext = (/\.([^.]+)$/.exec(base)?.[1] ?? '').toLowerCase();
  if (base === 'SKILL.md') return 'skill';
  if (LOG_EXT.has(ext) && (/^(CHANGELOG|HISTORY)/i.test(base) || ext === 'log' || /decision/i.test(base))) return 'log';
  if (DATA_EXT.has(ext)) return 'data';
  if (/(^|\/)(tests?|spec|__tests__)\//.test(p) || /\.(test|spec)\.[^./]+$/.test(base) || /_test\.[^./]+$/.test(base) || /^test_.*\.py$/.test(base)) return 'test';
  if (/\.(md|mdx|rst|txt|adoc)$/i.test(base)) return 'document';
  return 'code';
}

const DATA_RECIPE = 'generate it from a script at test or build time, or keep a small sample checked in; if it must be big, add it to "ignorePaths".';

// Per kind: [label, how to split an existing file, how to write a new one].
export const RECIPES = {
  code: ['code file', 'split it by responsibility into modules, and keep the old path re-exporting what moved so callers do not change.',
    'write it as one module per responsibility, with a small entry file that imports them.'],
  test: ['test file', 'split it by the behaviour each group covers, into files the test runner still finds, with shared setup in a helpers module.',
    'write one test file per behaviour group, with shared setup in a helpers module.'],
  document: ['long document', 'make it a short index plus one file per section, each linked from the index.',
    'write a short index plus one file per section, each linked from the index.'],
  log: ['log', 'keep recent entries and move older ones to an archive file by period (one per year or release), linked from the top.',
    'keep recent entries in it and older ones in an archive file by period.'],
  skill: ['SKILL.md', 'keep its steps and move detail to a reference file next to it, named in the step that needs it.',
    'keep the steps in SKILL.md and put detail in a reference file next to it.'],
  data: ['data file', DATA_RECIPE, DATA_RECIPE],
};

const fmt = (n) => n.toLocaleString('en-US');

/** The refusal message. A file of 0 bytes before is worded as a new file. */
export function message(rel, bytesAfter, bytesBefore, limit) {
  const [label, splitRecipe, newRecipe] = RECIPES[kindOf(rel)];
  const suggest = Math.ceil(tokensOf(bytesAfter) / 1000) * 1000;
  const head = `[file-size-guard] ${rel} would be `;
  const limitText = `the limit is ${fmt(limit)} tokens (bytes / 4). Agents read big files in pieces`;
  const what = bytesBefore === 0
    ? `${head}a new file of ${fmt(tokensOf(bytesAfter))} tokens (${fmt(bytesAfter)} bytes); ${limitText}, so write it as several smaller files instead, or generate it.\n` +
      `For a new ${label}: ${newRecipe}\n` +
      'If several files are not what the user asked for, tell the user and offer that or a per-path limit, instead of deciding on your own.\n'
    : `${head}${fmt(tokensOf(bytesAfter))} tokens after this change (${fmt(tokensOf(bytesBefore))} now; ${fmt(bytesAfter)} bytes, up from ` +
      `${fmt(bytesBefore)}); ${limitText}, so split it instead of growing it.\n` +
      `To split this ${label}: ${splitRecipe}\n` +
      'If splitting is not part of the task the user gave, tell the user and offer the split or a per-path limit, ' +
      'instead of starting a large refactor unasked.\n';
  const scope = rel.includes('/')
    ? 'the glob matches this path from the project root'
    : `a glob without a "/" such as "${rel}" matches that file name in every folder, so this also covers every other ${rel}`;
  return (
    what +
    `A per-path limit, if the user agrees: put this in .claude/pau-skills.json, or merge it into that file if it exists (${scope}):\n` +
    `{ "file-size-guard": { "pathLimits": { ${JSON.stringify(rel)}: ${suggest} } } }\n` +
    'To turn this hook off, the user can put this in .claude/pau-skills.json:\n' +
    '{ "hooks": { "file-size-guard": false } }\n' +
    'or start Claude Code with PAU_SKILLS_DISABLE=file-size-guard set; an agent cannot set it for its own session.'
  );
}

/** Pure decision: the refusal message, or null to let the call through. */
export function decide(input, { root = process.cwd(), options = {}, readFile = readText, git = runGit } = {}) {
  if (!input || typeof input !== 'object' || !TOOLS.has(input.tool_name)) return null;
  const ti = input.tool_input;
  if (!ti || typeof ti !== 'object' || typeof ti.file_path !== 'string' || !ti.file_path) return null;
  const loc = locate(ti.file_path, root);
  if (!loc || skippedByName(loc.rel, options)) return null;
  const current = readFile(loc.real);
  if (current === undefined) return null; // unreadable: the tool fails anyway
  const before = current ?? '';
  const after = textAfter(input.tool_name, ti, before);
  if (after === null) return null;
  const bytesBefore = Buffer.byteLength(before);
  const bytesAfter = Buffer.byteLength(after);
  const limit = limitFor(loc.rel, options);
  if (bytesAfter <= limit * 4 || bytesAfter <= bytesBefore) return null;
  if (skippedByContent(after) || gitSkipped(loc, git)) return null;
  return message(loc.rel, bytesAfter, bytesBefore, limit);
}

/**
 * Every tracked file under `root` over its limit, as { path, tokens, limit } sorted by path. Applies the same skip
 * list as decide(); a tracked file is never git-ignored, so check-ignore is not run. Symlinks are skipped (lstat), and
 * check-attr runs in batches for the over-limit candidates only.
 */
export function listOversized(root, options = {}, { git = (a, c) => runGit(a, c, process.env, 60000) } = {}) {
  const ls = git(['ls-files', '-z'], root);
  if (ls.status !== 0) throw new Error(`git ls-files failed in ${root}`);
  const candidates = [];
  for (const path of ls.stdout.split('\0').filter(Boolean)) {
    if (skippedByName(path, options)) continue;
    let st;
    try { st = lstatSync(join(root, path)); } catch { continue; }
    const limit = limitFor(path, options);
    if (!st.isFile() || st.size <= limit * 4) continue;
    const text = readText(join(root, path));
    if (typeof text !== 'string' || skippedByContent(text)) continue;
    candidates.push({ path, tokens: tokensOf(st.size), limit });
  }
  const hits = new Set();
  for (let i = 0; i < candidates.length; i += 200) {
    const batch = candidates.slice(i, i + 200).map((c) => c.path);
    const r = git(['check-attr', '-z', 'linguist-generated', 'linguist-vendored', '--', ...batch], root);
    if (r.status === 0) for (const h of attrHits(r.stdout)) hits.add(h);
  }
  return candidates.filter((c) => !hits.has(c.path)).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const input = parseInput(await readStdin());
  if (input) {
    const root = projectDir(input);
    const config = loadConfig({ project: root });
    if (hookEnabled(NAME, config)) {
      let reason = null;
      try { reason = decide(input, { root, options: hookOptions(NAME, config) }); } catch { reason = null; }
      if (reason) { process.stderr.write(reason + '\n'); process.exit(2); }
    }
  }
  process.exit(0);
}
