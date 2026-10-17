#!/usr/bin/env node
/**
 * Folders and blind labels for an arena run: several candidates attempt the same task and a judge compares them
 * without knowing which brief produced which candidate.
 *
 *   node arena.mjs init <arena-dir> [--n 3] [--task "<one line>"]
 *       Creates <arena-dir>/candidate-1 ... candidate-<n>, each with an empty brief.md for the record, plus
 *       rubric.md and SYNTHESIS.md templates. Refuses a folder that exists and is not empty.
 *
 *   node arena.mjs blind <arena-dir> [--out <blind-dir>] [--seed <integer>] [--force]
 *       Checks rubric.md (3 to 6 numbered criteria outside fenced code, no template placeholder left), then copies
 *       rubric.md and every candidate into <blind-dir>/A, B, C ... in a shuffled order. A candidate is a folder named
 *       candidate-<k>, or a link named so that leads to a folder (a worktree, for example). Everything in it is
 *       copied, hidden files included, except anything named brief.md or .git, at any depth. The blind copy holds
 *       plain files and folders only: a link to a file inside the same candidate is copied as that file's content;
 *       any other link (to a brief, into .git, to a folder, outside the candidate, or broken) is refused. A candidate
 *       with no non-empty file to copy is a dropout and gets no label. The key (which label is which candidate) goes
 *       to <arena-dir>/blind-key.json and is not printed. Without --out the blind folder is a new temporary folder;
 *       give the judge that folder only. --out must not be inside the arena folder or a candidate. A key that already
 *       exists means a judge may be reading the first blind folder, so a second run is refused unless --force is
 *       given. --seed makes the shuffle repeatable.
 *
 * Every check runs before anything is written, so a refusal leaves no partial copy.
 *
 * Exit codes: 0 done; 1 refused or failed (a folder that is missing, not a folder or not empty, an invalid rubric,
 * a link that could unblind the judge, more than 26 or fewer than 2 candidates with output, an existing key, an
 * --out inside the arena, or a file system error); 2 usage (unknown command or option, a bad value).
 * Node 20+, standard library only.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, mkdtempSync, statSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const MIN_CRITERIA = 3;
export const MAX_CRITERIA = 6;
export const MAX_CANDIDATES = 26;
export const KEY_FILE = 'blind-key.json';
export const BRIEF_FILE = 'brief.md';
export const isExcluded = (name) => name === BRIEF_FILE || name === '.git';

// ---------------------------------------------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------------------------------------------

/** A small seeded random number generator: returns a function giving numbers in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy of items (Fisher and Yates), using rng() in [0, 1). The input is not changed. */
export function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** [{ label: 'A', candidate }, ...] with the candidates in a shuffled order and the labels in alphabetical order. */
export function assignLabels(candidates, rng) {
  if (candidates.length > MAX_CANDIDATES) throw new Error(`at most ${MAX_CANDIDATES} candidates can be labelled`);
  return shuffle(candidates, rng).map((candidate, i) => ({ label: String.fromCharCode(65 + i), candidate }));
}

// Code fences as CommonMark defines them: three or more backticks or tildes open a fence, and a backtick fence's info
// string has no backtick in it. Only a bare fence of the same character, at least as long, closes it. Any indentation
// is accepted, because fences inside list items are indented.
const FENCE_OPEN = /^\s*(`{3,}(?=[^`]*$)|~{3,})/;
const closesFence = (line, fence) => {
  const m = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
  return !!m && m[1][0] === fence[0] && m[1].length >= fence.length;
};

/** The lines of a Markdown text that are not inside a fenced code block (``` or ~~~). */
export function outsideFences(text) {
  const out = [];
  let fence = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) { fence = open[1]; continue; }
    out.push(line);
  }
  return out;
}

/** Number of numbered list items ("1. ..." or "1) ...") in a rubric, outside fenced code. */
export function countCriteria(text) {
  return outsideFences(text).filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
}

/** Problems with a rubric, as sentences; empty when it is usable. */
export function validateRubric(text) {
  const errors = [];
  const n = countCriteria(text);
  if (n < MIN_CRITERIA || n > MAX_CRITERIA) {
    errors.push(`the rubric has ${n} numbered criteria; it needs ${MIN_CRITERIA} to ${MAX_CRITERIA}`);
  }
  const left = outsideFences(text).join('\n').match(/<(criterion|one line)\b[^>]*>/i);
  if (left) errors.push(`the rubric still has a template placeholder: ${left[0]}`);
  return errors;
}

/** True when `child` is `parent` or lies under it (both absolute). */
export function isInside(child, parent) {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
}

export function rubricTemplate(task = '') {
  return `# Rubric

Task: ${task || '<one line: the artifact every candidate produces>'}

The candidates never see this file. The judge and you score each candidate against each criterion. Write 3 to 6
criteria that a reader can check against the artifact itself, specific to this task, not "clean code" or "good
design". Replace every placeholder line.

1. <criterion: something a caller, reader or test can check>
2. <criterion>
3. <criterion>
`;
}

export function synthesisTemplate(task = '') {
  return `# Synthesis note

Task: ${task || '<one line>'}

Base commit: <for a code task, the commit every candidate started from>

## Base

<the candidate the result is built on, and why a future maintainer can extend it without breaking its invariants>

## Judge's verdict

<the judge's recommended base and scores, by label and by candidate after unblinding>

## My scores and the comparison

<your scores per criterion, written before reading the judge's; where you and the judge disagree, and whether it
was bias or an unclear criterion>

## Grafts

<each thing taken from another candidate: what, from which candidate, how it was folded in>

## Rejected

<what was left out of each candidate, and why>

## Convergence and dropouts

<did the candidates converge on one shape; which candidates produced nothing>

## Verification

<the commands run on the result and what they showed>
`;
}

export function briefStub(i) {
  return `# Brief for candidate-${i}\n\nPaste the exact prompt sent to this candidate here, for the record. It is never shown to the judge.\n`;
}

const USAGE = 'usage: arena.mjs init <arena-dir> [--n <2..26>] [--task "<text>"] | blind <arena-dir> [--out <dir>] [--seed <integer>] [--force]';

/** Parse the command line; throws on anything it does not understand. */
export function parseArgs(argv) {
  const [cmd, dir, ...rest] = argv;
  if (cmd !== 'init' && cmd !== 'blind') throw new Error(USAGE);
  if (!dir || dir.startsWith('--')) throw new Error(USAGE);
  const opts = cmd === 'init' ? { cmd, dir, n: 3, task: '' } : { cmd, dir, out: null, seed: null, force: false };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (cmd === 'blind' && flag === '--force') { opts.force = true; continue; }
    const val = rest[i + 1];
    if (val === undefined) throw new Error(`${flag} needs a value\n${USAGE}`);
    i++;
    if (cmd === 'init' && flag === '--n') {
      if (!/^\d+$/.test(val) || Number(val) < 2 || Number(val) > MAX_CANDIDATES) throw new Error(`--n must be a whole number from 2 to ${MAX_CANDIDATES}`);
      opts.n = Number(val);
    } else if (cmd === 'init' && flag === '--task') {
      opts.task = val;
    } else if (cmd === 'blind' && flag === '--out') {
      opts.out = val;
    } else if (cmd === 'blind' && flag === '--seed') {
      if (!/^-?\d+$/.test(val)) throw new Error('--seed must be an integer');
      opts.seed = Number(val);
    } else {
      throw new Error(`unknown option ${flag}\n${USAGE}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------------------------------------------
// File system
// ---------------------------------------------------------------------------------------------------------------

const isEmptyOrMissing = (dir) => !existsSync(dir) || readdirSync(dir).length === 0;

/** realpath of a path that may not exist yet: the real nearest existing ancestor, plus the rest. */
function realOrPlanned(p) {
  let cur = resolve(p);
  const rest = [];
  while (!existsSync(cur)) { rest.unshift(cur.slice(dirname(cur).length + 1)); cur = dirname(cur); }
  return join(realpathSync(cur), ...rest);
}

/**
 * What one candidate would put in the blind copy, read without writing anything.
 * `dir` is the candidate folder (or a link to it); `name` is how it is shown in messages.
 * Returns { files: [{ src, rel, size }], errors: [sentences] }.
 */
export function planCandidate(dir, name) {
  const real = realpathSync(dir);
  const files = [];
  const errors = [];
  const visit = (absDir, relDir) => {
    const entries = readdirSync(absDir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      if (isExcluded(e.name)) continue;
      const abs = join(absDir, e.name);
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      const shown = `${name}/${rel}`;
      if (e.isSymbolicLink()) {
        let target;
        try { target = realpathSync(abs); } catch { errors.push(`${shown} is a link to something that does not exist`); continue; }
        if (!isInside(target, real)) { errors.push(`${shown} is a link to a path outside ${name}`); continue; }
        const parts = relative(real, target).split(sep);
        if (parts.some(isExcluded)) { errors.push(`${shown} is a link to ${parts.join('/')}, which the judge must not see`); continue; }
        const st = statSync(target);
        if (!st.isFile()) { errors.push(`${shown} is a link to a folder; replace it with the files themselves`); continue; }
        files.push({ src: target, rel, size: st.size });
      } else if (e.isDirectory()) {
        visit(abs, rel);
      } else if (e.isFile()) {
        files.push({ src: abs, rel, size: statSync(abs).size });
      } else {
        errors.push(`${shown} is not a file, a folder or a link`);
      }
    }
  };
  visit(real, '');
  return { files, errors };
}

function init({ dir, n, task }, out, err) {
  const root = resolve(dir);
  if (existsSync(root) && !statSync(root).isDirectory()) { err(`refused: ${root} is not a folder`); return 1; }
  if (!isEmptyOrMissing(root)) { err(`refused: ${root} exists and is not empty`); return 1; }
  mkdirSync(root, { recursive: true });
  for (let i = 1; i <= n; i++) {
    mkdirSync(join(root, `candidate-${i}`));
    writeFileSync(join(root, `candidate-${i}`, BRIEF_FILE), briefStub(i));
  }
  writeFileSync(join(root, 'rubric.md'), rubricTemplate(task));
  writeFileSync(join(root, 'SYNTHESIS.md'), synthesisTemplate(task));
  out(`Arena folder: ${root}`);
  out(`Candidates: ${Array.from({ length: n }, (_, i) => `candidate-${i + 1}`).join(', ')}`);
  out('Next: fill in rubric.md, then send the candidates their briefs.');
  return 0;
}

function blind({ dir, out: outDir, seed, force }, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) return refuse(`${root} is not a folder`);
  const rootReal = realpathSync(root);
  const keyPath = join(root, KEY_FILE);
  if (existsSync(keyPath) && !force) {
    return refuse(`${keyPath} exists: a judge may still be reading that blind folder. Pass --force to blind again and replace the key`);
  }

  const rubricPath = join(root, 'rubric.md');
  if (!existsSync(rubricPath)) return refuse(`${rubricPath} is missing (run init first)`);
  if (!statSync(rubricPath).isFile()) return refuse(`${rubricPath} is not a file`);
  const rubric = readFileSync(rubricPath, 'utf8');
  const problems = validateRubric(rubric);
  if (problems.length) return refuse(...problems);

  const errors = [];
  const candidates = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!/^candidate-\d+$/.test(e.name)) continue;
    const p = join(root, e.name);
    let isDir = false;
    try { isDir = statSync(p).isDirectory(); } catch { /* a broken link */ }
    if (isDir) candidates.push(e.name);
    else errors.push(`${e.name} is ${e.isSymbolicLink() ? 'a link that does not lead to a folder' : 'not a folder'}`);
  }
  candidates.sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
  if (candidates.length > MAX_CANDIDATES) errors.push(`there are ${candidates.length} candidate folders; at most ${MAX_CANDIDATES} can be labelled`);
  const plans = new Map();
  for (const c of candidates) {
    const plan = planCandidate(join(root, c), c);
    errors.push(...plan.errors);
    plans.set(c, plan);
  }
  if (errors.length) return refuse(...errors);

  const withOutput = candidates.filter((c) => plans.get(c).files.some((f) => f.size > 0));
  const dropouts = candidates.filter((c) => !withOutput.includes(c));
  if (withOutput.length < 2) {
    return refuse(`fewer than 2 candidates have output (${withOutput.join(', ') || 'none'}); there is nothing to compare`);
  }

  const forbidden = [rootReal, ...candidates.map((c) => realpathSync(join(root, c)))];
  let blindDir;
  if (outDir) {
    blindDir = resolve(outDir);
    const planned = realOrPlanned(blindDir);
    if (forbidden.some((f) => isInside(planned, f))) return refuse(`${blindDir} is inside the arena folder or a candidate; the judge would sit next to the briefs`);
    if (existsSync(blindDir) && !statSync(blindDir).isDirectory()) return refuse(`${blindDir} is not a folder`);
    if (!isEmptyOrMissing(blindDir)) return refuse(`${blindDir} exists and is not empty`);
  } else if (forbidden.some((f) => isInside(realpathSync(tmpdir()), f))) {
    return refuse(`the temporary folder is inside the arena folder; pass --out <folder outside it>`);
  }

  const rng = mulberry32(seed ?? randomInt(2 ** 31));
  const labels = assignLabels(withOutput, rng);
  if (outDir) mkdirSync(blindDir, { recursive: true });
  else blindDir = mkdtempSync(join(tmpdir(), 'arena-blind-'));
  for (const { label, candidate } of labels) {
    mkdirSync(join(blindDir, label));
    for (const f of plans.get(candidate).files) {
      const dest = join(blindDir, label, ...f.rel.split('/'));
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(f.src, dest);
    }
  }
  writeFileSync(join(blindDir, 'rubric.md'), rubric);
  const key = { labels: Object.fromEntries(labels.map((l) => [l.label, l.candidate])), dropouts, blindDir };
  writeFileSync(keyPath, JSON.stringify(key, null, 2) + '\n');

  out(`Blind folder: ${blindDir}`);
  out(`Labels: ${labels.map((l) => l.label).join(', ')}`);
  out(`Dropouts: ${dropouts.length ? dropouts.join(', ') : 'none'}`);
  out(`Key: ${keyPath} (do not give it to the judge)`);
  return 0;
}

export function main(argv, out = console.log, err = console.error) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { err(e.message); return 2; }
  try {
    return opts.cmd === 'init' ? init(opts, out, err) : blind(opts, out, err);
  } catch (e) {
    err(`failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
