// Shared setup for the hillclimb tests (tests/hillclimb.test.mjs and tests/hillclimb-*.test.mjs): the check at load,
// the script path, the baseline measurement, and the helpers that run main and read the log.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { repo, tempDir } from './helpers.mjs';
import { HEADER, main } from '../skills/verification/hillclimb/decisions.mjs';

// append refuses a log inside a git work tree, and most tests here put their logs in the temporary folder. Look once,
// from the temporary folder and from its real path as append does, so a temporary folder inside a work tree gives
// one clear failure instead of dozens of unrelated ones.
for (const start of [resolve(tmpdir()), realpathSync(tmpdir())]) {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) {
      throw new Error(`the temporary folder ${tmpdir()} is inside the git work tree at ${dir}, where append refuses every log. `
        + 'Set TMPDIR to a folder outside any git work tree.');
    }
    if (dirname(dir) === dir) break;
  }
}

const SCRIPT = repo('skills', 'verification', 'hillclimb', 'decisions.mjs');
const BASE = 'median=2.00s runs=5 spread=0.10s';

function newLog() {
  return join(tempDir('hillclimb-'), 'decision.tsv');
}

/** Run main in process; returns { code, out, err } with the printed lines joined. */
function run(args) {
  const out = [];
  const err = [];
  const code = main(args, (s) => out.push(s), (s) => err.push(s));
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function append(log, fields) {
  const args = ['append', log];
  for (const [k, v] of Object.entries(fields)) args.push(`--${k}`, v);
  return run(args);
}

function baseline(log, extra = {}) {
  return append(log, { decision: 'baseline', tests: 'pass', better: 'lower', measurement: BASE, hypothesis: 'baseline', change: 'none', ...extra });
}

const rows = (log) => readFileSync(log, 'utf8').trimEnd().split('\n').slice(1).map((l) => l.split('\t'));
const col = (name) => HEADER.indexOf(name);

export { SCRIPT, BASE, newLog, run, append, baseline, rows, col };
