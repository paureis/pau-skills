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
import { join, resolve, relative, isAbsolute, basename, dirname, posix } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------------------------------------------

export const MARKER = 'TODO(verify-app)';
export const TEMPLATE_TOKENS = ['<app>', '<surface>', '<harness>'];

export const FEATURE_HEADINGS = [
  { label: 'Sub-features', test: (t) => /^sub-features$/i.test(t) },
  { label: 'How to get to it', test: (t) => /^how to get to it\b/i.test(t) },
  { label: 'Driving it', test: (t) => /^driving it\b/i.test(t) },
  { label: 'Gotchas', test: (t) => /^gotchas$/i.test(t) },
  {
    label: 'States',
    test: (t) => /^states\b/i.test(t),
    missing: 'maps made before it was required gain it in maintain mode (verify-app with the argument maintain), which writes how to force the loading, empty and error states, or says the feature has no screen',
    empty: 'say how to force the loading, empty and error states and what each looks like, or that the feature has no screen',
  },
];

/** Required sections of the generated SKILL.md, and whether each needs a command in a fenced code block. */
export const SKILL_SECTIONS = [
  { name: 'Launch', command: true },
  { name: 'Doctor', command: true },
  { name: 'Drive', command: false },
  { name: 'Evidence', command: false },
  { name: 'Cleanup', command: true },
];

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Split Markdown into lines: [{ line, code, fence, front }]. `code` marks lines inside a fenced block and its fence
 * lines, `fence` the fence lines themselves, `front` the frontmatter block at the top.
 */
export function lines(text) {
  const src = String(text).replace(/^﻿/, '');
  const raw = src.split(/\r?\n/);
  const fm = FRONTMATTER.exec(src);
  const frontCount = fm ? fm[0].replace(/\r?\n$/, '').split(/\r?\n/).length : 0;
  const out = [];
  let open = null; // { ch, len }
  raw.forEach((line, i) => {
    if (i < frontCount) { out.push({ line, code: false, fence: false, front: true }); return; }
    if (open) {
      const close = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
      if (close && close[1][0] === open.ch && close[1].length >= open.len) { out.push({ line, code: true, fence: true, front: false }); open = null; return; }
      out.push({ line, code: true, fence: false, front: false });
      return;
    }
    const start = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (start && !(start[1][0] === '`' && start[2].includes('`'))) {
      open = { ch: start[1][0], len: start[1].length };
      out.push({ line, code: true, fence: true, front: false });
      return;
    }
    out.push({ line, code: false, fence: false, front: false });
  });
  return out;
}

const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const NOT_PARAGRAPH = /^\s*$|^ {4}|^\t|^ {0,3}(>|[-+*](\s|$)|\d{1,9}[.)](\s|$)|#{1,6}(\s|$))/;

/**
 * Headings outside fenced code and frontmatter: [{ level, text, line, end }], 1-based. `line` is the heading text,
 * `end` its last line (the underline of a Setext heading).
 */
export function headings(text) {
  const all = lines(text);
  const out = [];
  const used = new Set();
  all.forEach(({ line, code, front }, i) => {
    if (code || front) return;
    const atx = ATX.exec(line);
    if (atx) {
      const t = (atx[2] || '').replace(/(^|[ \t]+)#+$/, '').trim();
      out.push({ level: atx[1].length, text: t, line: i + 1, end: i + 1 });
      used.add(i);
      return;
    }
    const st = SETEXT.exec(line);
    if (st && i > 0) {
      const prev = all[i - 1];
      if (!prev.code && !prev.front && !used.has(i - 1) && !NOT_PARAGRAPH.test(prev.line) && !SETEXT.test(prev.line)) {
        out.push({ level: st[1][0] === '=' ? 1 : 2, text: prev.line.trim(), line: i, end: i + 1 });
        used.add(i);
      }
    }
  });
  return out;
}

/** Second-level sections: [{ h, body }], body being the lines up to the next heading of level 1 or 2. */
function sections(text) {
  const all = lines(text);
  const hs = headings(text);
  return hs.filter((h) => h.level === 2).map((h) => {
    const next = hs.find((x) => x.line > h.end && x.level <= 2);
    return { h, body: all.slice(h.end, next ? next.line - 1 : all.length) };
  });
}

const isEmpty = (body) => body.every((l) => l.line.trim() === '');
const hasCommand = (body) => body.some((l) => l.code && !l.fence && l.line.trim() !== '');

/** Problems with one feature file, as messages. */
export function checkFeature(text) {
  const problems = [];
  const found = [];
  for (const s of sections(text)) {
    const idx = FEATURE_HEADINGS.findIndex((r) => r.test(s.h.text));
    if (idx < 0) { problems.push(`unexpected heading "## ${s.h.text}" (line ${s.h.line}): a feature file has exactly the five headings`); continue; }
    if (found.some((f) => f.idx === idx)) { problems.push(`heading "${FEATURE_HEADINGS[idx].label}" appears more than once (line ${s.h.line})`); continue; }
    found.push({ idx, s });
  }
  for (const [idx, r] of FEATURE_HEADINGS.entries()) {
    if (!found.some((f) => f.idx === idx)) problems.push(`missing heading "## ${r.label}"${r.missing ? `: ${r.missing}` : ''}`);
  }
  const order = found.map((f) => f.idx);
  if (order.some((v, i) => i > 0 && v < order[i - 1])) {
    problems.push(`headings out of order: use ${FEATURE_HEADINGS.map((r) => r.label).join(', ')}`);
  }
  for (const { idx, s } of found) {
    const r = FEATURE_HEADINGS[idx];
    if (isEmpty(s.body)) problems.push(`"## ${r.label}" is empty${r.empty ? `: ${r.empty}` : ''}`);
  }
  return problems;
}

function decode(target) {
  try { return decodeURIComponent(target); } catch { return target; }
}

/** Normalize a link target to a path inside the index's folder, or null when it is not a local Markdown file. */
function localTarget(raw) {
  let target = raw.split('#')[0].split('?')[0];
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) return null;
  target = posix.normalize(decode(target).replace(/\\/g, '/'));
  if (!/\.md$/i.test(target) || target.startsWith('..')) return null;
  return target;
}

const INLINE = /\]\(\s*(?:<([^>\n]*)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REFDEF = /^ {0,3}\[[^\]]+\]:\s*(?:<([^>]*)>|(\S+))/;

/** Local Markdown link targets in an index (inline links and reference definitions), normalized, anchors dropped. */
export function indexLinks(text) {
  const out = [];
  for (const { line, code, front } of lines(text)) {
    if (code || front) continue;
    const ref = REFDEF.exec(line);
    if (ref) {
      const t = localTarget(ref[1] ?? ref[2]);
      if (t) out.push(t);
      continue;
    }
    const prose = line.replace(/`[^`]*`/g, '');
    for (const m of prose.matchAll(INLINE)) {
      const t = localTarget(m[1] ?? m[2]);
      if (t) out.push(t);
    }
  }
  return out;
}

/** Compare index links with the .md files in the folder. The top-level README.md is the index and never an entry. */
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
  const m = FRONTMATTER.exec(String(text).replace(/^﻿/, ''));
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

/** Template tokens left in a text, as messages with line numbers. */
export function tokenProblems(text) {
  const out = [];
  for (const tok of TEMPLATE_TOKENS) {
    const at = [];
    String(text).split(/\r?\n/).forEach((l, i) => { if (l.includes(tok)) at.push(i + 1); });
    if (at.length) out.push(`template token ${tok} left in, line ${at.slice(0, 5).join(', ')}${at.length > 5 ? ', ...' : ''}`);
  }
  return out;
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
  const secs = sections(text);
  for (const req of SKILL_SECTIONS) {
    const low = req.name.toLowerCase();
    const s = secs.find(({ h }) => { const t = h.text.toLowerCase(); return t === low || t.startsWith(`${low} `) || t.startsWith(`${low}:`); });
    if (!s) { problems.push(`missing section "## ${req.name}"`); continue; }
    if (isEmpty(s.body)) problems.push(`"## ${req.name}" is empty`);
    else if (req.command && !hasCommand(s.body)) problems.push(`"## ${req.name}" has no command in a fenced code block`);
  }
  if (!evidenceFolder(text)) problems.push('no line "Evidence folder: `<path>`" naming where proof is kept');
  problems.push(...tokenProblems(text));
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
