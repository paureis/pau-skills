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
 *       against the rows before it, not against itself.
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
 * append refuses, and writes nothing, when: a field holds a tab, a newline or another control character; the log is
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
 * Exit codes: 0 done; 1 refused, a run failed, or a file error; 2 usage (unknown command or option, a bad value).
 * Node 20+, standard library only.
 */
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HEADER = ['time', 'attempt', 'hypothesis', 'change', 'measurement', 'delta', 'tests', 'decision', 'note'];
export const DECISIONS = ['baseline', 'keep', 'revert'];
export const TESTS = ['pass', 'fail'];
export const MIN_RUNS = 3;
export const SENSITIVITY = 'sensitivity';
export const FINAL = 'final';
const REFERENCE = /^reference \((lower|higher) is better\)$/;
const NUMBER = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)([A-Za-z%/]*)$/;

class Refusal extends Error {}
const at = (row, name) => row[HEADER.indexOf(name)];
class Usage extends Error {}

// ---------------------------------------------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------------------------------------------

/** A number with an optional unit, such as "1.23s" or "812KB": { value, unit }, or null. */
function parseQuantity(text) {
  const m = NUMBER.exec(text);
  return m ? { value: Number(m[1]), unit: m[2] } : null;
}

/** Parse the measurement format. Throws an Error naming what is missing or wrong. */
export function parseMeasurement(text) {
  const seen = {};
  for (const token of String(text).trim().split(/\s+/).filter(Boolean)) {
    const eq = token.indexOf('=');
    if (eq <= 0) throw new Error(`"${token}" is not a key=value pair; write median=<n><unit> runs=<count> spread=<n><unit>`);
    const key = token.slice(0, eq);
    if (key in seen) throw new Error(`${key} appears twice`);
    seen[key] = token.slice(eq + 1);
  }
  if (!('median' in seen)) throw new Error('no median= in the measurement');
  if (!('runs' in seen)) throw new Error('no runs= in the measurement: say how many runs the median is of');
  if (!('spread' in seen)) throw new Error('no spread= in the measurement: give the largest value minus the smallest');
  const med = parseQuantity(seen.median);
  if (!med) throw new Error(`median=${seen.median} is not a number with an optional unit`);
  if (!/^[1-9]\d*$/.test(seen.runs)) throw new Error(`runs=${seen.runs} is not a whole number of at least 1`);
  const spr = parseQuantity(seen.spread);
  if (!spr || spr.value < 0) throw new Error(`spread=${seen.spread} is not a number of at least 0`);
  if (spr.unit !== med.unit) throw new Error(`the median's unit "${med.unit}" and the spread's unit "${spr.unit}" differ`);
  const extra = {};
  for (const [k, v] of Object.entries(seen)) if (!['median', 'runs', 'spread'].includes(k)) extra[k] = v;
  return { median: med.value, unit: med.unit, runs: Number(seen.runs), spread: spr.value, extra };
}

export function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Up to 12 significant digits, without trailing zeros: holds any measured input and drops floating point noise. */
export function formatNumber(x) {
  return String(Number(x.toPrecision(12)));
}

export function formatMeasurement(values, unit) {
  const spread = Math.max(...values) - Math.min(...values);
  return `median=${formatNumber(median(values))}${unit} runs=${values.length} spread=${formatNumber(spread)}${unit}`;
}

/**
 * Compare a measurement with the reference (the best kept so far). better is 'lower' or 'higher'.
 * Returns { text, gap, better, beyondNoise }; better is true, false, or null when the gap is zero.
 */
export function describeDelta(ref, cur, better) {
  if (ref.unit !== cur.unit) throw new Error(`the unit "${cur.unit}" differs from the reference's "${ref.unit}"; measure in the same unit`);
  const gap = cur.median - ref.median;
  const noise = Math.max(ref.spread, cur.spread);
  const scale = Math.max(Math.abs(ref.median), Math.abs(cur.median), noise);
  const beyondNoise = Math.abs(gap) - noise > 1e-9 * scale;
  const isBetter = gap === 0 ? null : (better === 'lower') === (gap < 0);
  const sign = gap > 0 ? '+' : gap < 0 ? '-' : '';
  const abs = `${sign}${formatNumber(Math.abs(gap))}${cur.unit}`;
  const pct = ref.median === 0 ? '' : ` ${sign}${Math.abs((gap / Math.abs(ref.median)) * 100).toFixed(1)}%`;
  const verdict = beyondNoise ? `${isBetter ? 'better' : 'worse'}, beyond noise` : 'within noise';
  return { text: `${abs}${pct} ${verdict}`, gap, better: isBetter, beyondNoise };
}

/**
 * The folder holding a .git entry at or above the path, or null. Checks the path as given, its folder as resolved,
 * and, when the path is a link, the file the link leads to (or would create, for a link to nothing).
 */
export function insideGitTree(path) {
  const walk = (start) => {
    for (let dir = start; ; dir = dirname(dir)) {
      if (existsSync(join(dir, '.git'))) return dir;
      if (dirname(dir) === dir) return null;
    }
  };
  const walkResolved = (file) => {
    let existing = dirname(file);
    while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
    try { return walk(realpathSync(existing)); } catch { return null; }
  };
  const abs = resolve(path);
  let target = abs;
  try {
    if (existsSync(abs)) target = realpathSync(abs);
    else if (lstatSync(abs).isSymbolicLink()) target = resolve(dirname(abs), readlinkSync(abs));
  } catch { /* no such file: nothing to follow */ }
  return walk(dirname(abs)) ?? walkResolved(abs) ?? walk(dirname(target)) ?? walkResolved(target);
}

/**
 * The reference a new row is compared with: the best number (in the run's direction) among the latest baseline row
 * and the keeps after it. Each attempt is stood for by its latest row, so a keep later corrected to a revert drops
 * out, and rows with the attempt id `exclude` (the attempt being written) are left out.
 */
export function bestKept(rows, direction, exclude) {
  const own = rows.filter((r) => at(r, 'attempt') !== exclude);
  let last = -1;
  own.forEach((r, i) => { if (at(r, 'decision') === 'baseline') last = i; });
  if (last < 0) return null;
  const latest = new Map();
  own.forEach((r, i) => { if (at(r, 'decision') !== 'baseline') latest.set(at(r, 'attempt'), { r, first: latest.get(at(r, 'attempt'))?.first ?? i }); });
  let best = own[last];
  let bestM = parseMeasurement(at(best, 'measurement'));
  for (const { r, first } of latest.values()) {
    if (first < last || at(r, 'decision') !== 'keep') continue;
    const m = parseMeasurement(at(r, 'measurement'));
    if (direction === 'higher' ? m.median >= bestM.median : m.median <= bestM.median) { best = r; bestM = m; }
  }
  return { row: best, m: bestM };
}

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

/** Read and check an existing log: returns its rows as arrays of fields (no header), or [] when the file is missing. */
function readLog(log) {
  if (!existsSync(log)) return [];
  const text = readFileSync(log, 'utf8');
  if (!text.endsWith('\n')) throw new Refusal(`${log} does not end with a newline; the last row was cut or edited by hand, so appending would join two rows`);
  const lines = text.slice(0, -1).split('\n');
  if (lines[0] !== HEADER.join('\t')) throw new Refusal(`${log} does not start with the decision log header; it is not a decision log`);
  return lines.slice(1).map((line, i) => {
    const f = line.split('\t');
    if (f.length !== HEADER.length) throw new Refusal(`row ${i + 1} of ${log} has ${f.length} fields, not ${HEADER.length}; the file was edited by hand`);
    return f;
  });
}


function buildRow(log, fields, now) {
  for (const [k, v] of Object.entries(fields)) {
    if (/[\u0000-\u001f\u007f]/.test(v)) throw new Refusal(`--${k} holds a tab, a newline or another control character, which would break the TSV; write it on one line`);
  }
  const repo = insideGitTree(log);
  if (repo) throw new Refusal(`${resolve(log)} is inside the git work tree at ${repo}; git reset --hard or git clean -fdx could erase it. Put the log in a folder outside any git repository`);
  const rows = readLog(log);
  const { decision, tests } = fields;
  if (!DECISIONS.includes(decision)) throw new Refusal(`--decision must be one of ${DECISIONS.join(', ')}`);
  if (!TESTS.includes(tests)) throw new Refusal(`--tests must be pass or fail (run the project's tests on every attempt)`);
  const hypothesis = fields.hypothesis ?? '';
  const change = fields.change ?? '';
  if (decision !== 'baseline' && (!hypothesis.trim() || !change.trim())) throw new Refusal(`a ${decision} needs --hypothesis and --change`);

  let m = null;
  if (fields.measurement !== undefined) {
    try { m = parseMeasurement(fields.measurement); } catch (e) { throw new Refusal(`--measurement: ${e.message}`); }
  }
  if (decision === 'baseline' && tests !== 'pass') throw new Refusal('a baseline needs passing tests: the gate must be green before the first change, or it cannot tell a broken change from a good one');
  if (decision !== 'revert') {
    if (!m) throw new Refusal(`a ${decision} needs --measurement "median=<n><unit> runs=<count> spread=<n><unit>"; a number with no run count or spread is not a result`);
    if (m.runs < MIN_RUNS) throw new Refusal(`a ${decision} needs at least ${MIN_RUNS} runs, not ${m.runs}; one or two runs cannot show the spread`);
  }

  const baselines = rows.filter((r) => at(r, 'decision') === 'baseline');
  const firstDirection = baselines.length ? REFERENCE.exec(at(baselines[0], 'delta'))?.[1] : undefined;
  const numbers = rows.map((r) => at(r, 'attempt')).filter((id) => /^\d+$/.test(id)).map(Number);
  const attempt = fields.id ?? (decision === 'baseline' ? 'baseline' : String(Math.max(0, ...numbers) + 1));
  let delta = '';
  if (decision === 'baseline') {
    if (!['lower', 'higher'].includes(fields.better)) throw new Refusal('a baseline needs --better lower or --better higher: which way the metric improves');
    if (firstDirection && fields.better !== firstDirection) throw new Refusal(`the first baseline said ${firstDirection} is better; a run cannot change its metric's direction`);
    delta = `reference (${fields.better} is better)`;
  } else {
    if (fields.better !== undefined) throw new Refusal('--better belongs on a baseline row only');
    const reference = bestKept(rows, firstDirection, attempt);
    if (!reference) {
      if (decision === 'keep') throw new Refusal('a keep needs a baseline row before it; measure the baseline first');
    } else if (m) {
      const ref = reference.m;
      let d;
      try { d = describeDelta(ref, m, firstDirection); } catch (e) { throw new Refusal(e.message); }
      delta = d.text;
      if (decision === 'keep') {
        if (tests !== 'pass') throw new Refusal('a keep needs passing tests; revert the change');
        if (d.beyondNoise && !d.better) throw new Refusal(`the number is worse than the best kept so far (${d.text}); revert the change`);
        if (!d.beyondNoise && attempt !== FINAL && !/^simplification\b/i.test(fields.note ?? '')) {
          throw new Refusal(`the change is within noise (${d.text}); revert it, or keep it as a simplification that holds the number with --note "simplification: ..."`);
        }
      }
    }
  }
  return { row: [now.toISOString(), attempt, hypothesis, change, fields.measurement ?? '', delta, tests, decision, fields.note ?? ''], created: !rows.length && !existsSync(log) };
}

function append(log, fields, out) {
  const { row, created } = buildRow(log, fields, new Date());
  mkdirSync(dirname(resolve(log)), { recursive: true });
  appendFileSync(log, (created ? HEADER.join('\t') + '\n' : '') + row.join('\t') + '\n');
  const delta = at(row, 'delta');
  out(`appended attempt ${at(row, 'attempt')} (${at(row, 'decision')})${delta ? `: ${delta}` : ''} to ${resolve(log)}`);
  return 0;
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

function summary(log, out) {
  if (!existsSync(log)) throw new Refusal(`${log} does not exist`);
  const rows = readLog(log);
  const cell = (s) => s.replace(/\|/g, '\\|');
  out(`| ${HEADER.join(' | ')} |`);
  out(`|${HEADER.map(() => '---').join('|')}|`);
  for (const r of rows) out(`| ${r.map(cell).join(' | ')} |`);
  out('');
  const first = rows.find((r) => at(r, 'decision') === 'baseline');
  const baselines = rows.filter((r) => at(r, 'decision') === 'baseline');
  const latest = new Map();
  for (const r of rows) {
    if (['keep', 'revert'].includes(at(r, 'decision')) && ![SENSITIVITY, FINAL].includes(at(r, 'attempt'))) latest.set(at(r, 'attempt'), at(r, 'decision'));
  }
  const kept = [...latest.values()].filter((d) => d === 'keep').length;
  if (first) {
    const direction = REFERENCE.exec(at(first, 'delta'))?.[1];
    const lastBase = baselines[baselines.length - 1];
    const b = parseMeasurement(at(lastBase, 'measurement'));
    const { row: best, m } = bestKept(rows, direction, undefined);
    const pct = (x) => (b.median === 0 ? '' : `${x.median > b.median ? '+' : x.median < b.median ? '-' : ''}${Math.abs(((x.median - b.median) / Math.abs(b.median)) * 100).toFixed(1)}%, `);
    const which = baselines.length > 1
      ? ` (the latest of ${baselines.length} baselines; the first was ${formatNumber(parseMeasurement(at(first, 'measurement')).median)}${b.unit})`
      : '';
    out(`baseline ${formatNumber(b.median)}${b.unit}${which}, best ${formatNumber(m.median)}${m.unit} (${pct(m)}attempt ${at(best, 'attempt')})`);
    const fin = [...rows].reverse().find((r) => at(r, 'attempt') === FINAL && at(r, 'decision') === 'keep');
    if (fin) {
      const f = parseMeasurement(at(fin, 'measurement'));
      out(`final check ${formatNumber(f.median)}${f.unit} (${pct(f).replace(/, $/, '')} against the latest baseline)`);
    }
  }
  out(`attempts ${latest.size} (kept ${kept}, reverted ${latest.size - kept}), not counting the sensitivity check or the final check`);
  if (first && at(first, 'note')) out(`first baseline note: ${at(first, 'note')}`);
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
