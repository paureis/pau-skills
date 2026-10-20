#!/usr/bin/env node
/**
 * Check a project's verification skill (made by verify-app) for the mistakes that make it lie. Read only.
 *
 *   node check-map.mjs [<skill folder>] [--evidence <path>] [--json]
 *
 * <skill folder> is the folder holding the generated SKILL.md and features/, for example .claude/skills/verify-shop.
 * Without it, the only .claude/skills/verify-* folder under the current directory is used.
 *
 * Checks:
 *   - SKILL.md has frontmatter with a name equal to the folder name and a description (without them the skill never
 *     registers); the five required sections Launch, Doctor, Drive, Evidence and Cleanup, none of them empty, and
 *     Launch, Doctor and Cleanup each with a command in a fenced code block; a line "Evidence folder: `<path>`"; no
 *     template token (<app>, <surface>, <harness>) left in.
 *   - features/README.md exists, and its links match the feature files on disk: no dead entry, no unlisted file, no
 *     duplicate. Every .md file under features/, in subfolders too, is a feature file, except features/README.md.
 *   - Every feature file has exactly five second-level headings, in this order, each with content under it:
 *     Sub-features, How to get to it (...), Driving it (...), Gotchas, States. A missing States heading names maintain
 *     mode, which adds it to maps made before it was required. What States says (loading, empty and error, or that the
 *     feature has no screen) is for the agent to judge; it is not parsed here.
 *   - No line in SKILL.md or features/ still carries the template marker TODO(verify-app).
 *   - The evidence folder is ignored by git and has no tracked files in it. --evidence <path> overrides the folder
 *     named in SKILL.md; a relative path is relative to the repository root. A folder outside the repository, or a
 *     project that is not a git repository, is reported as a note, not a problem.
 *
 * Markdown is read the CommonMark way where it matters here: ATX and Setext headings, fenced code blocks (a fence
 * closes only on a bare fence of the same character and at least the same length), inline links with <...> targets
 * and titles, and reference definitions. A byte order mark and CRLF line endings are accepted.
 *
 * Exit codes: 0 clean, 1 problems found, 2 usage (bad arguments, no such folder, no SKILL.md, no single folder to
 * pick, or git missing from PATH when the evidence check needs it). Needs Node 20+.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MARKER, checkFeature, indexLinks, compareIndex, evidenceFolder, checkSkill, placeholders, parseArgs } from './check-map-rules.mjs';
export * from './check-map-rules.mjs';

// ---------------------------------------------------------------------------------------------------------------
// Disk and git
// ---------------------------------------------------------------------------------------------------------------

export class GitMissing extends Error {}

function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (e.code === 'ENOENT') throw new GitMissing('git is not on PATH: the evidence check needs it');
    throw e;
  }
}

/** The repository root that holds dir, or null when dir is not in a git repository. */
function repoRoot(dir) {
  try { return realpathSync.native(git(dir, ['rev-parse', '--show-toplevel']).trim()); } catch (e) {
    if (e instanceof GitMissing) throw e;
    return null;
  }
}

/** The real path of p, resolving symlinks through its nearest existing ancestor when p does not exist yet. */
export function realPathOf(p) {
  let cur = resolve(p);
  const rest = [];
  while (!existsSync(cur)) {
    const up = dirname(cur);
    if (up === cur) break;
    rest.unshift(basename(cur));
    cur = up;
  }
  return join(existsSync(cur) ? realpathSync.native(cur) : cur, ...rest);
}

/** Problems and notes for the evidence folder. */
export function checkEvidence(skillDir, folder) {
  const problems = [];
  const notes = [];
  const root = repoRoot(skillDir);
  if (!root) { notes.push('not inside a git repository: the evidence folder was not checked'); return { problems, notes }; }
  const abs = realPathOf(isAbsolute(folder) ? folder : resolve(root, folder));
  const rel = relative(root, abs).replace(/\\/g, '/');
  if (rel === '') { problems.push({ file: '.gitignore', message: 'the evidence folder is the repository root: use a folder inside it' }); return { problems, notes }; }
  if (rel.startsWith('..') || isAbsolute(rel)) { notes.push(`evidence folder ${folder} is outside the repository; git does not see it`); return { problems, notes }; }
  let ignored;
  try { git(root, ['check-ignore', '-q', `${rel}/.check-map-probe`]); ignored = true; } catch (e) {
    if (e instanceof GitMissing) throw e;
    if (e.status === 1) ignored = false;
    else { problems.push({ file: '.gitignore', message: `git check-ignore failed for ${rel}: ${String(e.stderr || e.message).trim()}` }); return { problems, notes }; }
  }
  if (!ignored) problems.push({ file: '.gitignore', message: `evidence folder ${rel}/ is not ignored by git: add "${rel}/" to .gitignore` });
  const tracked = git(root, ['ls-files', '--', rel]).split('\n').filter(Boolean);
  if (tracked.length) problems.push({ file: '.gitignore', message: `${tracked.length} file(s) in ${rel}/ are tracked by git (for example ${tracked[0]}): git rm --cached them` });
  return { problems, notes };
}

/** Every .md file under dir, in subfolders too, as sorted paths relative to dir with forward slashes. */
export function featureFiles(dir, prefix = '') {
  const out = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...featureFiles(join(dir, e.name), rel));
    else if (e.isFile() && /\.md$/i.test(e.name)) out.push(rel);
  }
  return prefix ? out : out.sort();
}

/** Run every check on a verify skill folder. Returns { dir, evidence, problems: [{ file, message }], notes }. */
export function checkMap(dir, { evidence = null } = {}) {
  const problems = [];
  const notes = [];
  const add = (file, message) => problems.push({ file, message });
  const skillText = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  for (const m of checkSkill(skillText, basename(resolve(dir)))) add('SKILL.md', m);
  for (const n of placeholders(skillText)) add(`SKILL.md:${n}`, `still marked ${MARKER}`);

  const fdir = join(dir, 'features');
  const files = featureFiles(fdir);
  const readme = files.find((f) => /^readme\.md$/i.test(f));
  if (!readme) add('features/README.md', 'missing: the feature map needs an index');
  else {
    const text = readFileSync(join(fdir, readme), 'utf8');
    const cmp = compareIndex(indexLinks(text), files);
    for (const f of cmp.dead) add(`features/${readme}`, `lists ${f}, which does not exist`);
    for (const f of cmp.unlisted) add(`features/${f}`, `not listed in features/${readme}`);
    for (const f of cmp.duplicate) add(`features/${readme}`, `lists ${f} more than once`);
    for (const n of placeholders(text)) add(`features/${readme}:${n}`, `still marked ${MARKER}`);
  }
  const features = files.filter((f) => f !== readme);
  if (readme && features.length === 0) add('features/', 'no feature files: seed at least one');
  for (const f of features) {
    const text = readFileSync(join(fdir, f), 'utf8');
    for (const m of checkFeature(text)) add(`features/${f}`, m);
    for (const n of placeholders(text)) add(`features/${f}:${n}`, `still marked ${MARKER}`);
  }

  const folder = evidence || evidenceFolder(skillText);
  if (folder) {
    const ev = checkEvidence(dir, folder);
    problems.push(...ev.problems);
    notes.push(...ev.notes);
  }
  return { dir, evidence: folder, problems, notes };
}

/** The .claude/skills/verify-* folders under cwd. */
export function findSkillDirs(cwd) {
  const base = join(cwd, '.claude', 'skills');
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('verify-'))
    .map((d) => join(base, d.name))
    .sort();
}

export function format(result) {
  const out = [`check-map: ${result.dir}`];
  for (const p of result.problems) out.push(`  ${p.file}: ${p.message}`);
  for (const n of result.notes) out.push(`  note: ${n}`);
  out.push(result.problems.length ? `${result.problems.length} problem(s).` : 'Clean: the map matches its rules.');
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------

const USAGE = 'Usage: node check-map.mjs [<skill folder>] [--evidence <path>] [--json]';

export function main(argv, cwd = process.cwd()) {
  const { opts, error } = parseArgs(argv);
  if (error) { console.error(error === 'help' ? USAGE : `${error}\n${USAGE}`); return 2; }
  let dir = opts.dir ? resolve(cwd, opts.dir) : null;
  if (!dir) {
    const found = findSkillDirs(cwd);
    if (found.length !== 1) {
      console.error(found.length
        ? `more than one verify skill; name one:\n  ${found.map((f) => relative(cwd, f)).join('\n  ')}\n${USAGE}`
        : `no .claude/skills/verify-* folder here; pass the skill folder\n${USAGE}`);
      return 2;
    }
    dir = found[0];
  }
  if (!existsSync(join(dir, 'SKILL.md'))) { console.error(`no SKILL.md in ${dir}\n${USAGE}`); return 2; }
  let result;
  try { result = checkMap(dir, { evidence: opts.evidence }); } catch (e) {
    if (e instanceof GitMissing) { console.error(e.message); return 2; }
    throw e;
  }
  console.log(opts.json ? JSON.stringify(result, null, 2) : format(result));
  return result.problems.length ? 1 : 0;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
