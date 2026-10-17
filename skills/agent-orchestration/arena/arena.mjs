#!/usr/bin/env node
/**
 * Folders and blind labels for an arena run: several candidates attempt the same task and a judge compares them
 * without knowing which brief produced which candidate.
 *
 *   node arena.mjs init <arena-dir> [--n 3] [--task "<one line>"]
 *       Creates <arena-dir>/candidate-1 ... candidate-<n>, each with an empty brief.md for the record, plus
 *       rubric.md and SYNTHESIS.md templates. Refuses a folder that exists and is not empty.
 *
 *   node arena.mjs blind <arena-dir> [--out <blind-dir>] [--seed <integer>]
 *       Checks rubric.md (3 to 6 numbered criteria, no placeholder left), then copies rubric.md and every candidate
 *       folder that holds output into <blind-dir>/A, B, C ... in a shuffled order. brief.md, hidden files and .git
 *       are not copied. A candidate folder with nothing else in it is a dropout and gets no label. The key (which
 *       label is which candidate) goes to <arena-dir>/blind-key.json and is not printed. Without --out the blind
 *       folder is a new temporary folder; give the judge that folder only. --seed makes the shuffle repeatable.
 *
 * Exit codes: 0 done; 1 refused (folder not empty or missing, invalid rubric, fewer than 2 candidates with output);
 * 2 usage. Node 20+, standard library only.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, cpSync, mkdtempSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const MIN_CRITERIA = 3;
export const MAX_CRITERIA = 6;
export const MAX_CANDIDATES = 26;
export const KEY_FILE = 'blind-key.json';
export const BRIEF_FILE = 'brief.md';

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

/** Number of numbered list items ("1. ..." or "1) ...") in a rubric. */
export function countCriteria(text) {
  return String(text).split(/\r?\n/).filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
}

/** Problems with a rubric, as sentences; empty when it is usable. */
export function validateRubric(text) {
  const errors = [];
  const n = countCriteria(text);
  if (n < MIN_CRITERIA || n > MAX_CRITERIA) {
    errors.push(`the rubric has ${n} numbered criteria; it needs ${MIN_CRITERIA} to ${MAX_CRITERIA}`);
  }
  if (/<criterion\b/i.test(text)) errors.push('the rubric still has a template placeholder (<criterion ...>)');
  return errors;
}

/** The entries of a candidate folder that count as output: not the brief, not hidden files, not .git. */
export function candidateOutputs(entries) {
  return entries.filter((e) => e !== BRIEF_FILE && !e.startsWith('.'));
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

const USAGE = 'usage: arena.mjs init <arena-dir> [--n <2..26>] [--task "<text>"] | blind <arena-dir> [--out <dir>] [--seed <integer>]';

/** Parse the command line; throws on anything it does not understand. */
export function parseArgs(argv) {
  const [cmd, dir, ...rest] = argv;
  if (cmd !== 'init' && cmd !== 'blind') throw new Error(USAGE);
  if (!dir || dir.startsWith('--')) throw new Error(USAGE);
  const opts = cmd === 'init' ? { cmd, dir, n: 3, task: '' } : { cmd, dir, out: null, seed: null };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
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

function init({ dir, n, task }, out, err) {
  const root = resolve(dir);
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

function blind({ dir, out: outDir, seed }, out, err) {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) { err(`refused: ${root} is not a folder`); return 1; }
  const rubricPath = join(root, 'rubric.md');
  if (!existsSync(rubricPath)) { err(`refused: ${rubricPath} is missing (run init first)`); return 1; }
  const rubric = readFileSync(rubricPath, 'utf8');
  const problems = validateRubric(rubric);
  if (problems.length) { for (const p of problems) err(`refused: ${p}`); return 1; }

  const candidates = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^candidate-\d+$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
  const withOutput = candidates.filter((c) => candidateOutputs(readdirSync(join(root, c))).length > 0);
  const dropouts = candidates.filter((c) => !withOutput.includes(c));
  if (withOutput.length < 2) {
    err(`refused: fewer than 2 candidates have output (${withOutput.join(', ') || 'none'}); there is nothing to compare`);
    return 1;
  }

  let blindDir;
  if (outDir) {
    blindDir = resolve(outDir);
    if (!isEmptyOrMissing(blindDir)) { err(`refused: ${blindDir} exists and is not empty`); return 1; }
    mkdirSync(blindDir, { recursive: true });
  } else {
    blindDir = mkdtempSync(join(tmpdir(), 'arena-blind-'));
  }

  const rng = mulberry32(seed ?? randomInt(2 ** 31));
  const labels = assignLabels(withOutput, rng);
  for (const { label, candidate } of labels) {
    const src = join(root, candidate);
    mkdirSync(join(blindDir, label));
    for (const entry of candidateOutputs(readdirSync(src))) {
      cpSync(join(src, entry), join(blindDir, label, entry), {
        recursive: true,
        filter: (p) => basename(p) !== '.git',
      });
    }
  }
  writeFileSync(join(blindDir, 'rubric.md'), rubric);
  const key = { labels: Object.fromEntries(labels.map((l) => [l.label, l.candidate])), dropouts, blindDir };
  writeFileSync(join(root, KEY_FILE), JSON.stringify(key, null, 2) + '\n');

  out(`Blind folder: ${blindDir}`);
  out(`Labels: ${labels.map((l) => l.label).join(', ')}`);
  out(`Dropouts: ${dropouts.length ? dropouts.join(', ') : 'none'}`);
  out(`Key: ${join(root, KEY_FILE)} (do not give it to the judge)`);
  return 0;
}

export function main(argv, out = console.log, err = console.error) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { err(e.message); return 2; }
  return opts.cmd === 'init' ? init(opts, out, err) : blind(opts, out, err);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
