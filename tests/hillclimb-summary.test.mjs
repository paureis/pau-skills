// decisions.mjs summary for the hillclimb skill, and the spreadsheet formula guard on what append writes and every
// read takes off.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { HEADER, guardCell } from '../skills/verification/hillclimb/decisions.mjs';
import { newLog, run, append, baseline, rows, col } from './hillclimb.helpers.mjs';

describe('summary', () => {
  test('prints the table and the baseline to best line', () => {
    const log = newLog();
    baseline(log, { note: 'stop: half the baseline and at least 2 attempts' });
    append(log, { decision: 'revert', tests: 'pass', id: 'sensitivity', measurement: 'median=3.00s runs=5 spread=0.05s', hypothesis: 'a sleep must move it', change: 'sleep 1s' });
    append(log, { decision: 'keep', tests: 'pass', measurement: 'median=1.00s runs=5 spread=0.05s', hypothesis: 'h|pipe', change: 'c' });
    append(log, { decision: 'revert', tests: 'pass', measurement: 'median=0.98s runs=5 spread=0.05s', hypothesis: 'h2', change: 'c2' });
    const r = run(['summary', log]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^\| time \| attempt \|/m);
    assert.match(r.out, /h\\\|pipe/, 'a pipe in a cell is escaped');
    assert.match(r.out, /baseline 2s, best 1s \(-50\.0%, attempt 1\)/);
    assert.match(r.out, /attempts 2 \(kept 1, reverted 1\), not counting the sensitivity check or the final check/);
    assert.match(r.out, /first baseline note: stop: half the baseline and at least 2 attempts/);
  });

  test('summary counts each attempt once, by its latest row, and leaves out the sensitivity check', () => {
    const log = newLog();
    baseline(log);
    const m = 'median=1.00s runs=5 spread=0.05s';
    append(log, { decision: 'revert', tests: 'pass', id: 'sensitivity', measurement: 'median=3.00s runs=5 spread=0.05s', hypothesis: 'h', change: 'c' });
    append(log, { decision: 'keep', tests: 'pass', measurement: m, hypothesis: 'h', change: 'c' });
    append(log, { decision: 'revert', tests: 'pass', hypothesis: 'h', change: 'c' });
    append(log, { decision: 'revert', tests: 'fail', id: '2', hypothesis: 'h', change: 'c', note: 'corrects: tests failed' });
    const r = run(['summary', log]);
    assert.match(r.out, /attempts 2 \(kept 1, reverted 1\)/);
  });

  test('the table has the header once and one line per row', () => {
    const log = newLog();
    baseline(log);
    append(log, { decision: 'revert', tests: 'pass', hypothesis: 'h', change: 'c' });
    const lines = run(['summary', log]).out.split('\n');
    assert.equal(lines.filter((l) => l.startsWith('| time | attempt |')).length, 1);
    assert.equal(lines.filter((l) => l.startsWith('| ')).length, 3);
    assert.match(run(['summary', log]).out, /attempts 1 \(kept 0, reverted 1\)/);
  });

  test('after a re-baseline, the best is compared with the latest baseline, and the summary says so', () => {
    const log = newLog();
    baseline(log, { note: 'stop: half and at least 3 attempts' });
    append(log, { decision: 'keep', tests: 'pass', measurement: 'median=1.00s runs=5 spread=0.05s', hypothesis: 'h', change: 'c' });
    baseline(log, { measurement: 'median=4.00s runs=5 spread=0.1s', note: 'harness changed: larger case' });
    append(log, { decision: 'keep', tests: 'pass', measurement: 'median=3.00s runs=5 spread=0.1s', hypothesis: 'h2', change: 'c2' });
    const s = run(['summary', log]).out;
    assert.match(s, /baseline 4s \(the latest of 2 baselines; the first was 2s\), best 3s \(-25\.0%, attempt 2\)/);
    assert.match(s, /first baseline note: stop: half and at least 3 attempts/);
  });

  test('the final check is a keep with id "final": held within noise is enough, it is not an attempt, and summary shows it', () => {
    const log = newLog();
    baseline(log);
    append(log, { decision: 'keep', tests: 'pass', measurement: 'median=1.00s runs=5 spread=0.05s', hypothesis: 'h', change: 'c' });
    const fin = (m) => append(log, { decision: 'keep', tests: 'pass', id: 'final', measurement: m, hypothesis: 'final check', change: 'none: the final commit measured again' });
    assert.match(fin('median=1.50s runs=5 spread=0.05s').err, /worse/, 'a win that did not hold is refused');
    const r = fin('median=1.03s runs=5 spread=0.05s');
    assert.equal(r.code, 0, r.err);
    const s = run(['summary', log]).out;
    assert.match(s, /attempts 1 \(kept 1, reverted 0\), not counting the sensitivity check or the final check/);
    assert.match(s, /final check 1\.03s \(-48\.5% against the latest baseline\)/);
  });

  test('a missing log is an error', () => {
    assert.equal(run(['summary', join(tempDir('hillclimb-'), 'none.tsv')]).code, 1);
  });
});

describe('spreadsheet formula guard', () => {
  const keep = (log, extra) => append(log, { decision: 'keep', tests: 'pass', hypothesis: 'h', change: 'c', ...extra });
  // Timestamps differ between two logs; the rest of a summary must not.
  const sameTimes = (s) => s.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'TIME');

  test('guardCell quotes a cell a spreadsheet would read as a formula, and leaves the rest alone', () => {
    // buildRow refuses control characters, so the tab and carriage return cases are only reachable here.
    assert.equal(guardCell('\tx'), "'\tx");
    assert.equal(guardCell('\r=x'), "'\r=x");
    assert.equal(guardCell(' -1'), "' -1");
    assert.equal(guardCell('"=1+1"'), `'"=1+1"`);
    for (const v of ['=x', '+x', '-x', '@x', '  =x', ' " @x']) assert.equal(guardCell(v), `'${v}`, v);
    for (const v of ['median=1s runs=5 spread=0s', 'reference (lower is better)', "'tis cheaper", 'a-b', '']) assert.equal(guardCell(v), v, v);
  });

  test('a delta, and a hypothesis, change or note typed with a formula character, are written quoted', () => {
    const log = newLog();
    assert.equal(baseline(log, { note: '=stop: half the baseline' }).code, 0);
    const r = keep(log, { measurement: 'median=1.50s runs=5 spread=0.05s', hypothesis: '@cache', change: '+memo' });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\(keep\): -0\.5s -25\.0% better, beyond noise to /, 'the message prints the delta as computed');
    const [base, one] = rows(log);
    assert.equal(base[col('note')], "'=stop: half the baseline");
    assert.equal(base[col('delta')], 'reference (lower is better)');
    assert.equal(one[col('delta')], "'-0.5s -25.0% better, beyond noise");
    assert.equal(one[col('hypothesis')], "'@cache");
    assert.equal(one[col('change')], "'+memo");
  });

  test('summary prints guarded cells as typed, and keeps a value that really starts with a quote', () => {
    const log = newLog();
    baseline(log, { note: '=stop: half the baseline' });
    keep(log, { measurement: 'median=1.50s runs=5 spread=0.05s', hypothesis: "'tis cheaper", change: '@memo' });
    const r = run(['summary', log]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\| -0\.5s -25\.0% better, beyond noise \|/);
    assert.match(r.out, /\| 'tis cheaper \| @memo \|/);
    assert.doesNotMatch(r.out, /'-0\.5s|'@memo/);
    assert.match(r.out, /^first baseline note: =stop: half the baseline$/m);
  });

  test('refuses a field that would not read back as typed: a quote followed by a formula character', () => {
    const log = newLog();
    assert.match(baseline(log, { measurement: "'=1 median=2s runs=5 spread=0.1s" }).err, /refused.*quote/);
    assert.equal(existsSync(log), false, 'a refused first append creates no file');
    baseline(log);
    const before = readFileSync(log, 'utf8');
    const r = append(log, { decision: 'revert', tests: 'pass', hypothesis: 'h', change: 'c', note: "'=x" });
    assert.equal(r.code, 1);
    assert.match(r.err, /--note/);
    assert.equal(readFileSync(log, 'utf8'), before);
    assert.equal(append(log, { decision: 'revert', tests: 'pass', hypothesis: "'tis cheaper", change: 'c' }).code, 0);
    assert.equal(rows(log)[1][col('hypothesis')], "'tis cheaper");
  });

  test('an --id typed with a formula character reads back as typed: a correction is judged against the rows before it', () => {
    const log = newLog();
    baseline(log);
    assert.equal(keep(log, { id: '-1', measurement: 'median=1.00s runs=5 spread=0.05s' }).code, 0);
    assert.equal(rows(log)[1][col('attempt')], "'-1");
    // Judged against itself (1.00s), 1.05s would be within noise and refused; against the baseline it is better.
    const r = keep(log, { id: '-1', measurement: 'median=1.05s runs=5 spread=0.05s', note: 'corrects: pasted the wrong run' });
    assert.equal(r.code, 0, r.err);
    assert.equal(rows(log)[2][col('delta')], "'-0.95s -47.5% better, beyond noise");
    const s = run(['summary', log]).out;
    assert.match(s, /best 1\.05s \(-47\.5%, attempt -1\)/);
    assert.match(s, /attempts 1 \(kept 1, reverted 0\)/);
  });

  test('a measurement with leading whitespace and a formula character reads back, so later appends and summary work', () => {
    const log = newLog();
    assert.equal(baseline(log, { measurement: ' -n=3 median=2s runs=5 spread=0.1s' }).code, 0);
    assert.equal(rows(log)[0][col('measurement')], "' -n=3 median=2s runs=5 spread=0.1s");
    const r = keep(log, { measurement: 'median=1.5s runs=5 spread=0.1s' });
    assert.equal(r.code, 0, r.err);
    assert.equal(rows(log)[1][col('delta')], "'-0.5s -25.0% better, beyond noise");
    const s = run(['summary', log]);
    assert.equal(s.code, 0, s.err);
    assert.match(s.out, /baseline 2s, best 1\.5s \(-25\.0%, attempt 1\)/);
  });

  test('an old log written before the guard, with unquoted cells, reads the same as a new one', () => {
    const cells = [
      ['2026-01-01T00:00:00.000Z', 'baseline', 'baseline', 'none', 'median=2.00s runs=5 spread=0.10s', 'reference (lower is better)', 'pass', 'baseline', '=stop: half'],
      ['2026-01-01T00:01:00.000Z', '-1', '@cache', '+memo', 'median=1.00s runs=5 spread=0.05s', '-1s -50.0% better, beyond noise', 'pass', 'keep', ''],
    ];
    const old = newLog();
    writeFileSync(old, [HEADER, ...cells].map((c) => c.join('\t') + '\n').join(''));
    const fresh = newLog();
    baseline(fresh, { note: '=stop: half' });
    keep(fresh, { id: '-1', hypothesis: '@cache', change: '+memo', measurement: 'median=1.00s runs=5 spread=0.05s' });
    const body = (log) => readFileSync(log, 'utf8').split('\n').slice(1).map((l) => l.split('\t').slice(1).join('\t')).join('\n');
    assert.notEqual(body(fresh), body(old), 'the new log holds quoted cells, the old one does not');
    const a = run(['summary', old]);
    assert.equal(a.code, 0, a.err);
    assert.equal(sameTimes(a.out), sameTimes(run(['summary', fresh]).out));
    assert.match(a.out, /best 1s \(-50\.0%, attempt -1\)/);
    // The next append reads the old cells too: the direction, the best kept and the correction by id.
    for (const log of [old, fresh]) {
      const r = keep(log, { id: '-1', measurement: 'median=1.05s runs=5 spread=0.05s', note: 'corrects: pasted the wrong run' });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /-0\.95s -47\.5% better, beyond noise/);
    }
  });
});
