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
 *     registers), the five sections Launch, Doctor, Drive, Evidence and Cleanup, and a line
 *     "Evidence folder: `<path>`".
 *   - features/README.md exists, and its links match the feature files on disk: no dead entry, no unlisted file, no
 *     duplicate.
 *   - Every feature file has exactly four second-level headings, in this order, each with content under it:
 *     Sub-features, How to get to it (...), Driving it (...), Gotchas.
 *   - No line still carries the template marker TODO(verify-app).
 *   - The evidence folder is ignored by git and has no tracked files in it. --evidence <path> overrides the folder
 *     named in SKILL.md; a relative path is relative to the repository root. A folder outside the repository, or a
 *     project that is not a git repository, is reported as a note, not a problem.
 *
 * Exit codes: 0 clean, 1 problems found, 2 usage (bad arguments, no such folder, no SKILL.md, or no single folder to
 * pick). Needs Node 20+; git on PATH for the evidence check.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, basename, posix } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------------------------------------------

export const MARKER = 'TODO(verify-app)';

export const FEATURE_HEADINGS = [
  { label: 'Sub-features', test: (t) => /^sub-features$/i.test(t) },
  { label: 'How to get to it', test: (t) => /^how to get to it\b/i.test(t) },
  { label: 'Driving it', test: (t) => /^driving it\b/i.test(t) },
  { label: 'Gotchas', test: (t) => /^gotchas$/i.test(t) },
];

export const SKILL_SECTIONS = ['Launch', 'Doctor', 'Drive', 'Evidence', 'Cleanup'];

/** Split Markdown into lines, marking the ones inside a fenced code block. */
function lines(text) {
  const out = [];
  let fence = null;
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (m[1][0] === fence) { out.push({ line, code: true }); fence = null; continue; }
    }
    out.push({ line, code: Boolean(fence) });
  }
  return out;
}

/** ATX headings outside fenced code: [{ level, text, line }] with 1-based line numbers. */
export function headings(text) {
  const out = [];
  lines(text).forEach(({ line, code }, i) => {
    if (code) return;
    const m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2], line: i + 1 });
  });
  return out;
}

/** Problems with one feature file, as messages. */
export function checkFeature(text) {
  const all = lines(text);
  const h2 = headings(text).filter((h) => h.level === 2);
  const problems = [];
  const found = [];
  for (const h of h2) {
    const idx = FEATURE_HEADINGS.findIndex((r) => r.test(h.text));
    if (idx < 0) { problems.push(`unexpected heading "## ${h.text}" (line ${h.line}): a feature file has exactly the four headings`); continue; }
    if (found.some((f) => f.idx === idx)) { problems.push(`heading "${FEATURE_HEADINGS[idx].label}" appears more than once (line ${h.line})`); continue; }
    found.push({ idx, h });
  }
  for (const [idx, r] of FEATURE_HEADINGS.entries()) {
    if (!found.some((f) => f.idx === idx)) problems.push(`missing heading "## ${r.label}"`);
  }
  const order = found.map((f) => f.idx);
  if (order.some((v, i) => i > 0 && v < order[i - 1])) {
    problems.push(`headings out of order: use ${FEATURE_HEADINGS.map((r) => r.label).join(', ')}`);
  }
  // A section is empty when nothing but blank lines sits between its heading and the next heading of level 1 or 2.
  for (const { idx, h } of found) {
    const next = headings(text).find((x) => x.line > h.line && x.level <= 2);
    const body = all.slice(h.line, next ? next.line - 1 : all.length).map((l) => l.line.trim()).filter(Boolean);
    if (body.length === 0) problems.push(`"## ${FEATURE_HEADINGS[idx].label}" is empty`);
  }
  return problems;
}

/** Local Markdown link targets in an index, normalized to paths inside its folder (anchors dropped). */
export function indexLinks(text) {
  const out = [];
  for (const { line, code } of lines(text)) {
    if (code) continue;
    const prose = line.replace(/`[^`]*`/g, '');
    for (const m of prose.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      let target = m[1].split('#')[0].split('?')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) continue;
      if (!/\.md$/i.test(target)) continue;
      target = posix.normalize(decodeURIComponent(target).replace(/\\/g, '/'));
      if (target.startsWith('..')) continue;
      out.push(target);
    }
  }
  return out;
}

/** Compare index links with the .md files in the folder. README.md is the index itself and never an entry. */
export function compareIndex(links, files) {
  const isIndex = (f) => /^readme\.md$/i.test(f);
  const entries = links.filter((l) => !isIndex(l));
  const onDisk = files.filter((f) => !isIndex(f));
  const seen = new Set();
  const duplicate = [];
  for (const l of entries) {
    if (seen.has(l) && !duplicate.includes(l)) duplicate.push(l);
    seen.add(l);
  }
  return {
    dead: [...seen].filter((l) => !onDisk.includes(l)).sort(),
    unlisted: onDisk.filter((f) => !seen.has(f)).sort(),
    duplicate: duplicate.sort(),
  };
}

/** The name and description from YAML frontmatter, or null when there is no frontmatter. Simple keys only. */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?(\n|$)/.exec(String(text));
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(name|description):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[kv[1]] = v;
  }
  return out;
}

/** The fixed part of the path on the "Evidence folder: `<path>`" line: up to the first placeholder, no ./ or trailing /. */
export function evidenceFolder(text) {
  const m = /evidence folder:\s*`([^`]+)`/i.exec(String(text));
  if (!m) return null;
  let p = m[1].split(/[<$%{*]/)[0].trim().replace(/\\/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  p = p.replace(/\/+$/, '');
  return p || null;
}

/** Problems with the generated SKILL.md, as messages. */
export function checkSkill(text, folderName) {
  const problems = [];
  const fm = parseFrontmatter(text);
  if (!fm) problems.push('no YAML frontmatter: without name and description the skill never registers');
  else {
    if (!fm.name) problems.push('frontmatter has no name');
    else if (fm.name !== folderName) problems.push(`frontmatter name "${fm.name}" is not the folder name "${folderName}"`);
    if (!fm.description) problems.push('frontmatter has no description');
  }
  const h2 = headings(text).filter((h) => h.level === 2).map((h) => h.text.toLowerCase());
  for (const s of SKILL_SECTIONS) {
    if (!h2.some((t) => t === s.toLowerCase() || t.startsWith(`${s.toLowerCase()} `) || t.startsWith(`${s.toLowerCase()}:`))) {
      problems.push(`missing section "## ${s}"`);
    }
  }
  if (!evidenceFolder(text)) problems.push('no line "Evidence folder: `<path>`" naming where proof is kept');
  return problems;
}

/** 1-based line numbers that still carry the template marker. */
export function placeholders(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((l, i) => { if (l.includes(MARKER)) out.push(i + 1); });
  return out;
}

export function parseArgs(argv) {
  const opts = { dir: null, evidence: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--evidence') {
      if (i + 1 >= argv.length) return { error: '--evidence needs a path' };
      opts.evidence = argv[++i];
    } else if (a === '--help' || a === '-h') return { error: 'help' };
    else if (a.startsWith('-')) return { error: `unknown option ${a}` };
    else if (opts.dir) return { error: `unexpected argument ${a}` };
    else opts.dir = a;
  }
  return { opts };
}

// ---------------------------------------------------------------------------------------------------------------
// Disk and git
// ---------------------------------------------------------------------------------------------------------------

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** The repository root that holds dir, or null. */
function repoRoot(dir) {
  try { return realpathSync.native(git(dir, ['rev-parse', '--show-toplevel']).trim()); } catch { return null; }
}

/** Problems and notes for the evidence folder. */
export function checkEvidence(skillDir, folder) {
  const problems = [];
  const notes = [];
  const root = repoRoot(skillDir);
  if (!root) { notes.push('not inside a git repository: the evidence folder was not checked'); return { problems, notes }; }
  const abs = isAbsolute(folder) ? resolve(folder) : resolve(root, folder);
  const absReal = existsSync(abs) ? realpathSync.native(abs) : abs;
  const rel = relative(root, absReal).replace(/\\/g, '/');
  if (rel === '' ) { problems.push({ file: '.gitignore', message: 'the evidence folder is the repository root' }); return { problems, notes }; }
  if (rel.startsWith('..') || isAbsolute(rel)) { notes.push(`evidence folder ${folder} is outside the repository; git does not see it`); return { problems, notes }; }
  let ignored;
  try { git(root, ['check-ignore', '-q', `${rel}/.check-map-probe`]); ignored = true; } catch (e) {
    if (e.status === 1) ignored = false;
    else { problems.push({ file: '.gitignore', message: `git check-ignore failed for ${rel}: ${String(e.stderr || e.message).trim()}` }); return { problems, notes }; }
  }
  if (!ignored) problems.push({ file: '.gitignore', message: `evidence folder ${rel}/ is not ignored by git: add "${rel}/" to .gitignore` });
  const tracked = git(root, ['ls-files', '--', rel]).split('\n').filter(Boolean);
  if (tracked.length) problems.push({ file: '.gitignore', message: `${tracked.length} file(s) in ${rel}/ are tracked by git (for example ${tracked[0]}): git rm --cached them` });
  return { problems, notes };
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
  const files = existsSync(fdir) && statSync(fdir).isDirectory() ? readdirSync(fdir).filter((f) => /\.md$/i.test(f)).sort() : [];
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
  const result = checkMap(dir, { evidence: opts.evidence });
  console.log(opts.json ? JSON.stringify(result, null, 2) : format(result));
  return result.problems.length ? 1 : 0;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
