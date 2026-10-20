// The constants and pure functions of decisions.mjs: the measurement format, the delta, the spreadsheet guard, the
// git work tree check and the best kept so far. decisions.mjs re-exports the public names.
import { existsSync, lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const HEADER = ['time', 'attempt', 'hypothesis', 'change', 'measurement', 'delta', 'tests', 'decision', 'note'];
export const DECISIONS = ['baseline', 'keep', 'revert'];
export const TESTS = ['pass', 'fail'];
export const MIN_RUNS = 3;
export const SENSITIVITY = 'sensitivity';
export const FINAL = 'final';
const REFERENCE = /^reference \((lower|higher) is better\)$/;
const NUMBER = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)([A-Za-z%/]*)$/;

/**
 * A cell as written to the TSV: with a single quote in front when a spreadsheet would read it as a formula (it starts
 * with a tab or a carriage return, or with "=", "+", "-" or "@" after optional whitespace and an optional double quote).
 */
export function guardCell(v) {
  return /^[\t\r]/.test(v) || /^\s*"?\s*[=+\-@]/.test(v) ? "'" + v : v;
}

const at = (row, name) => row[HEADER.indexOf(name)];

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

export { REFERENCE, at, parseQuantity };
