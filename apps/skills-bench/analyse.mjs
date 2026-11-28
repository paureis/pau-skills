#!/usr/bin/env node
// Analyses one Skills Bench results round (the skills-bench-results/1 folder that bench.mjs writes).
//
//   node apps/skills-bench/analyse.mjs <results folder> [--delta 0.15] [--write]
//
// Prints REPORT.md and then summary.json; with --write it writes both into the results folder instead. --delta is
// the difference in mean score (0 to 1) the full-round plan should detect. Exit 0 done, 1 the round cannot be read,
// 2 bad arguments. The methods are in apps/skills-bench/ANALYSIS.md.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readResults } from './lib/analysis/read.mjs';
import { summarize } from './lib/analysis/summary.mjs';
import { renderReport } from './lib/analysis/report.mjs';

const USAGE = 'Usage: node apps/skills-bench/analyse.mjs <results folder> [--delta 0.15] [--write]';
export const SEPARATOR = '\n----- summary.json -----\n';

class UsageError extends Error {}

/** { dir, delta, write } from the command line arguments. */
export function parseArgs(argv) {
  const out = { dir: null, delta: 0.15, write: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') out.write = true;
    else if (a === '--delta') {
      const v = argv[++i];
      const d = v !== undefined && /^\d*\.?\d+$/.test(v) ? Number(v) : NaN;
      if (!(d > 0 && d <= 1)) throw new UsageError('--delta must be a number above 0 and at most 1');
      out.delta = d;
    } else if (a.startsWith('-')) throw new UsageError(`unknown option ${a}`);
    else if (out.dir === null) out.dir = a;
    else throw new UsageError(`one results folder only, got a second: ${a}`);
  }
  if (out.dir === null) throw new UsageError('');
  return out;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    process.stderr.write(`${e.message ? `${e.message}\n` : ''}${USAGE}\n`);
    return 2;
  }
  const dir = resolve(args.dir);
  let summary;
  try {
    summary = summarize(readResults(dir), { delta: args.delta });
  } catch (e) {
    process.stderr.write(`analyse: ${e.message}\n`);
    return 1;
  }
  const report = renderReport(summary);
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  if (!args.write) {
    process.stdout.write(`${report}${SEPARATOR}${json}`);
    return 0;
  }
  for (const [name, text] of [['REPORT.md', report], ['summary.json', json]]) {
    writeFileSync(join(dir, name), text);
    process.stdout.write(`wrote ${join(dir, name)}\n`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
