// The decision log of decisions.mjs: reading and checking it, append with its refusals, and summary. Refusal is
// declared here once, so main's instanceof check matches what these functions throw.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  HEADER, DECISIONS, TESTS, MIN_RUNS, SENSITIVITY, FINAL, REFERENCE, at, guardCell, parseMeasurement, formatNumber,
  describeDelta, insideGitTree, bestKept,
} from './decisions-core.mjs';

class Refusal extends Error {}

/** A cell as read back: the quote guardCell put in front taken off, so a value reads as it was typed. */
function unguardCell(v) {
  return v.startsWith("'") && guardCell(v.slice(1)) !== v.slice(1) ? v.slice(1) : v;
}

/**
 * Read and check an existing log: returns its rows as arrays of fields (no header), each field as it was typed
 * (unguardCell), or [] when the file is missing.
 */
function readLog(log) {
  if (!existsSync(log)) return [];
  const text = readFileSync(log, 'utf8');
  if (!text.endsWith('\n')) throw new Refusal(`${log} does not end with a newline; the last row was cut or edited by hand, so appending would join two rows`);
  const lines = text.slice(0, -1).split('\n');
  if (lines[0] !== HEADER.join('\t')) throw new Refusal(`${log} does not start with the decision log header; it is not a decision log`);
  return lines.slice(1).map((line, i) => {
    const f = line.split('\t');
    if (f.length !== HEADER.length) throw new Refusal(`row ${i + 1} of ${log} has ${f.length} fields, not ${HEADER.length}; the file was edited by hand`);
    return f.map(unguardCell);
  });
}


function buildRow(log, fields, now) {
  for (const [k, v] of Object.entries(fields)) {
    if (/[\u0000-\u001f\u007f]/.test(v)) throw new Refusal(`--${k} holds a tab, a newline or another control character, which would break the TSV; write it on one line`);
    if (unguardCell(guardCell(v)) !== v) throw new Refusal(`--${k} starts with a single quote followed by =, +, - or @, which would read back without the quote; drop the quote or put a word before it`);
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
  appendFileSync(log, (created ? HEADER.join('\t') + '\n' : '') + row.map(guardCell).join('\t') + '\n');
  const delta = at(row, 'delta');
  out(`appended attempt ${at(row, 'attempt')} (${at(row, 'decision')})${delta ? `: ${delta}` : ''} to ${resolve(log)}`);
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

export { Refusal, append, summary };
