#!/usr/bin/env node
/**
 * The decision log of a hillclimb run, and a way to measure a command when the project has no benchmark tool.
 *
 *   node decisions.mjs append <log> --decision baseline|keep|revert --tests pass|fail [--id <attempt>]
 *        [--hypothesis <text>] [--change <text>] [--measurement "<median=... runs=... spread=...>"]
 *        [--better lower|higher] [--note <text>]
 *       Appends one row to <log> (a decision.tsv), creating it and its folder with the header when it is missing.
 *       Columns: time, attempt, hypothesis, change, measurement, delta, tests, decision, note. The time is now, in
 *       UTC; the attempt defaults to "baseline" on a baseline row and otherwise to one more than the highest numbered
 *       attempt so far (the first is 1). The delta is computed against the best kept so far: the best number, in the
 *       run's direction, among the latest baseline row and the keeps after it. Each attempt is stood for by its latest
 *       row, so a correction (a new row with the same --id) replaces the attempt's earlier rows everywhere: a keep
 *       corrected to a revert is no longer the reference, the best or a kept attempt, and a corrected keep is judged
 *       against the rows before it, not against itself. A cell that a spreadsheet would read as a formula, such as
 *       the delta "-0.5s -25.0% better, beyond noise" or a note typed as "=stop ...", is written with a single quote
 *       in front (see "Spreadsheet guard" below); the message append prints shows the delta without it.
 *
 *   node decisions.mjs measure [--runs 5] [--warmup 1] [--value time|stdout] [--shell] -- <command> [args...]
 *       Runs the command --warmup times unrecorded, then --runs times, and prints one line in the measurement format.
 *       --value time (the default) records the wall time of each run in seconds; --value stdout records the number
 *       on the last non-empty line the command printed, with its unit (for a size, a memory figure or a score).
 *       Each recorded value goes to stderr. Any run that exits non-zero, or prints no number, fails the measurement.
 *       Values are printed with up to 12 significant digits (times rounded to the microsecond), so no digit of the
 *       input is lost. --shell runs the command through the system shell (pipes, redirection, &&, or npm and similar
 *       on Windows); it then takes the whole command as one quoted argument after "--" and refuses more than one.
 *
 *   node decisions.mjs summary <log>
 *       Prints the log as a Markdown table, then the latest baseline (and the first, when there are several), the best
 *       kept number against the latest baseline, the attempt counts and the first baseline's note (where the stop
 *       predicate is written). An attempt is counted once, by its latest row; the rows with attempt id "sensitivity"
 *       (the deliberate regression) and "final" (the last check of the final commit) are not attempts. A keep with id
 *       "final" needs only to hold the best number within noise, not beat it; summary prints it on its own line.
 *
 * The measurement format: `median=<number><unit> runs=<count> spread=<number><unit>`, keys in any order, the same
 * unit (or none) on median and spread, extra `key=value` pairs allowed (for example `errors=0 work=1000`). The spread
 * is the largest value minus the smallest. A difference is beyond noise when the gap between two medians is larger
 * than the larger of their two spreads.
 *
 * append refuses, and writes nothing, when: a field holds a tab, a newline or another control character, or starts
 * with a single quote followed by what the spreadsheet guard below would quote (it would not read back); the log is
 * inside a git work tree (a folder with .git above it, for the path, its resolved folder, or the file a link leads
 * to), where a reset or clean could erase it; the file exists but its first line is not the header, its last line
 * has no newline, or a row has the wrong number of fields; the decision or tests value is unknown; a keep or revert
 * has no hypothesis or no change; a measurement is given but does not parse, or uses a different unit from the
 * reference. A baseline also needs a measurement with at least 3 runs, passing tests, and --better (which way is
 * better; a later baseline must keep the first one's direction). A keep also needs a measurement with at least 3
 * runs, passing tests, a baseline before it, and a number that is better than the best kept so far beyond noise; a
 * keep within noise of the best is accepted only when its note starts with "simplification" (so simplifications
 * cannot drift away from the best number one small step at a time).
 * Earlier rows are never rewritten: the file is only ever opened for appending.
 *
 * Spreadsheet guard: a cell is written with a single quote in front when it starts with a tab or a carriage return,
 * or with "=", "+", "-" or "@" after optional whitespace and an optional double quote (guardCell), so a spreadsheet
 * that opens the TSV shows it as text instead of running it as a formula. Every read (append and summary) takes one
 * leading quote off a cell when the rest would itself be guarded, so a value reads as it was typed: "'-1" reads as
 * "-1", while "'tis cheaper" stays as it is. A log written before the guard, with unquoted cells, reads the same way.
 * A value that would not read back as typed, a quote followed by a formula character (typed "'=x" would read as
 * "=x"), is refused, so every cell the log holds reads back exactly.
 *
 * Exit codes: 0 done; 1 refused, a run failed, or a file error; 2 usage (unknown command or option, a bad value).
 * Node 20+, standard library only.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatMeasurement, formatNumber, parseQuantity } from './decisions-core.mjs';
import { Refusal, append, summary } from './decisions-log.mjs';

export {
  HEADER, DECISIONS, TESTS, MIN_RUNS, SENSITIVITY, FINAL, guardCell, parseMeasurement, median, formatNumber,
  formatMeasurement, describeDelta, insideGitTree, bestKept,
} from './decisions-core.mjs';

class Usage extends Error {}

// ---------------------------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------------------------

const APPEND_OPTS = ['decision', 'tests', 'id', 'hypothesis', 'change', 'measurement', 'better', 'note'];

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'append' || cmd === 'summary') {
    const [log, ...opts] = rest;
    if (!log || log.startsWith('--')) throw new Usage(`${cmd} needs the path of the decision log`);
    if (cmd === 'summary') {
      if (opts.length) throw new Usage(`summary takes no options: ${opts[0]}`);
      return { cmd, log };
    }
    const fields = {};
    for (let i = 0; i < opts.length; i += 2) {
      const name = opts[i].replace(/^--/, '');
      if (!opts[i].startsWith('--') || !APPEND_OPTS.includes(name)) throw new Usage(`unknown option ${opts[i]}`);
      if (i + 1 >= opts.length) throw new Usage(`${opts[i]} needs a value`);
      if (name in fields) throw new Usage(`${opts[i]} given twice`);
      fields[name] = opts[i + 1];
    }
    return { cmd, log, fields };
  }
  if (cmd === 'measure') {
    const sep = rest.indexOf('--');
    if (sep < 0) throw new Usage('measure needs "--" before the command');
    const command = rest.slice(sep + 1);
    if (!command.length) throw new Usage('no command after "--"');
    const opts = { cmd, runs: 5, warmup: 1, value: 'time', shell: false, command };
    const own = rest.slice(0, sep);
    for (let i = 0; i < own.length; i++) {
      const o = own[i];
      if (o === '--shell') { opts.shell = true; continue; }
      if (!['--runs', '--warmup', '--value'].includes(o)) throw new Usage(`unknown option ${o}`);
      const v = own[++i];
      if (v === undefined) throw new Usage(`${o} needs a value`);
      if (o === '--value') {
        if (!['time', 'stdout'].includes(v)) throw new Usage(`--value must be time or stdout, not ${v}`);
        opts.value = v;
      } else {
        const min = o === '--runs' ? 1 : 0;
        if (!/^\d+$/.test(v) || Number(v) < min) throw new Usage(`${o} must be a whole number of at least ${min}`);
        opts[o.slice(2)] = Number(v);
      }
    }
    if (opts.shell && command.length !== 1) {
      throw new Usage(`--shell takes the whole command as one argument after "--", quoted (for example -- "wc -c < out.bin"); got ${command.length} arguments`);
    }
    return opts;
  }
  throw new Usage(cmd ? `unknown command ${cmd}` : 'no command');
}

function measure(opts, out, err) {
  const values = [];
  let unit = opts.value === 'time' ? 's' : null;
  const total = opts.warmup + opts.runs;
  for (let i = 0; i < total; i++) {
    const warm = i < opts.warmup;
    const label = warm ? `warmup ${i + 1}` : `run ${i - opts.warmup + 1}`;
    const start = process.hrtime.bigint();
    const r = opts.shell
      ? spawnSync(opts.command[0], { encoding: 'utf8', shell: true, maxBuffer: 256 * 1024 * 1024 })
      : spawnSync(opts.command[0], opts.command.slice(1), { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    if (r.error) { err(`${label}: could not start ${opts.command[0]}: ${r.error.message}`); return 1; }
    if (r.status !== 0) {
      err(`${label}: exit ${r.status ?? r.signal}; a run that fails is not a measurement`);
      const tail = (r.stderr || r.stdout || '').trimEnd().split('\n').slice(-10).join('\n');
      if (tail) err(tail);
      return 1;
    }
    if (warm) continue;
    let value = Math.round(seconds * 1e6) / 1e6;
    if (opts.value === 'stdout') {
      const last = (r.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? '';
      const q = parseQuantity(last);
      if (!q) { err(`${label}: the last line of output, ${JSON.stringify(last)}, is not a number with an optional unit`); return 1; }
      if (unit !== null && q.unit !== unit) { err(`${label}: unit "${q.unit}" differs from the earlier runs' "${unit}"`); return 1; }
      unit = q.unit;
      value = q.value;
    }
    values.push(value);
    err(`${label}: ${formatNumber(value)}${unit}`);
  }
  out(formatMeasurement(values, unit));
  return 0;
}

export function main(argv, out = console.log, err = console.error) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { err(e.message); return 2; }
  try {
    if (opts.cmd === 'append') return append(opts.log, opts.fields, out);
    if (opts.cmd === 'summary') return summary(opts.log, out);
    return measure(opts, out, err);
  } catch (e) {
    err(e instanceof Refusal ? `refused: ${e.message}` : `failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
