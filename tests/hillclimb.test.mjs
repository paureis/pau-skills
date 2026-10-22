// decisions.mjs for the hillclimb skill: the measurement format, the delta against the best kept so far, every
// refusal of append (a keep with no run count or spread, a field that would break the TSV, a log inside a git work
// tree, a file edited by hand), the append-only guarantee, measure against small node commands, and summary.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tempDir } from './helpers.mjs';
import {
  parseMeasurement, formatNumber, median, describeDelta, parseArgs,
} from '../skills/verification/hillclimb/decisions.mjs';
import { SCRIPT, BASE, newLog, run } from './hillclimb.helpers.mjs';

describe('parseMeasurement', () => {
  test('reads the median, run count and spread with their unit', () => {
    assert.deepEqual(parseMeasurement('median=1.23s runs=10 spread=0.04s'), { median: 1.23, unit: 's', runs: 10, spread: 0.04, extra: {} });
  });

  test('accepts any order, a bare number, other units, an exponent and extra key=value pairs', () => {
    const m = parseMeasurement('runs=7 spread=12 median=3400 errors=0 work=1000');
    assert.equal(m.median, 3400);
    assert.equal(m.unit, '');
    assert.equal(m.runs, 7);
    assert.deepEqual(m.extra, { errors: '0', work: '1000' });
    assert.equal(parseMeasurement('median=1.5e-3s runs=3 spread=2e-4s').median, 0.0015);
    assert.equal(parseMeasurement('median=812KB runs=3 spread=0KB').unit, 'KB');
    assert.equal(parseMeasurement('median=950ops/s runs=5 spread=20ops/s').unit, 'ops/s');
  });

  test('refuses a measurement without a run count or a spread', () => {
    // The message names the missing key, so the user knows what to add.
    assert.throws(() => parseMeasurement('median=1.23s'), /no runs=/);
    assert.throws(() => parseMeasurement('median=1.23s runs=10'), /no spread=/);
    assert.throws(() => parseMeasurement('median=1.23s spread=0.1s'), /no runs=/);
    assert.throws(() => parseMeasurement('runs=10 spread=0.1s'), /no median=/);
  });

  test('refuses a bad run count, a negative spread, mixed units, a repeated key and free text', () => {
    assert.throws(() => parseMeasurement('median=1s runs=2.5 spread=0s'), /runs/);
    assert.throws(() => parseMeasurement('median=1s runs=0 spread=0s'), /runs/);
    assert.throws(() => parseMeasurement('median=1s runs=5 spread=-1s'), /spread/);
    assert.throws(() => parseMeasurement('median=1s runs=5 spread=10ms'), /unit/);
    assert.throws(() => parseMeasurement('median=1s median=2s runs=5 spread=0s'), /twice/);
    assert.throws(() => parseMeasurement('about 1.2 seconds'), /key=value/);
    assert.throws(() => parseMeasurement('median=fast runs=5 spread=0s'), /median/);
  });
});

describe('numbers', () => {
  test('median of odd and even counts, and formatting that keeps every digit of the input', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    // Up to 12 significant digits: enough to hold any input, few enough to drop floating point noise.
    assert.equal(formatNumber(1.234567), '1.234567');
    assert.equal(formatNumber(1234567), '1234567');
    assert.equal(formatNumber(0.1 + 0.2), '0.3');
    assert.equal(formatNumber(2.05 - 2), '0.05');
    assert.equal(formatNumber(2), '2');
  });

  test('describeDelta: direction, percent, and noise from the larger spread', () => {
    const ref = parseMeasurement('median=2.00s runs=5 spread=0.10s');
    assert.equal(describeDelta(ref, parseMeasurement('median=1.50s runs=5 spread=0.05s'), 'lower').text, '-0.5s -25.0% better, beyond noise');
    assert.equal(describeDelta(ref, parseMeasurement('median=2.50s runs=5 spread=0.05s'), 'lower').text, '+0.5s +25.0% worse, beyond noise');
    assert.equal(describeDelta(ref, parseMeasurement('median=2.05s runs=5 spread=0.05s'), 'lower').text, '+0.05s +2.5% within noise');
    const up = describeDelta(ref, parseMeasurement('median=2.50s runs=5 spread=0.05s'), 'higher');
    assert.deepEqual([up.better, up.beyondNoise], [true, true]);
    // A gap equal to the larger spread is still noise; the new side's spread counts too.
    assert.equal(describeDelta(ref, parseMeasurement('median=1.90s runs=5 spread=0.01s'), 'lower').beyondNoise, false);
    assert.equal(describeDelta(ref, parseMeasurement('median=1.80s runs=5 spread=0.30s'), 'lower').beyondNoise, false);
    // A deterministic metric (spread 0 on both sides) moves past noise with any change.
    const size = parseMeasurement('median=100KB runs=3 spread=0KB');
    assert.equal(describeDelta(size, parseMeasurement('median=99KB runs=3 spread=0KB'), 'lower').beyondNoise, true);
  });

  test('describeDelta refuses a unit that differs from the reference', () => {
    assert.throws(() => describeDelta(parseMeasurement(BASE), parseMeasurement('median=1500ms runs=5 spread=10ms'), 'lower'), /unit/);
  });
});

describe('measure', () => {
  test('times a command N times after a warmup and prints the format append reads', () => {
    const dir = tempDir('hillclimb-measure-');
    const counter = join(dir, 'count.txt');
    const prog = join(dir, 'prog.mjs');
    writeFileSync(prog, `import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(counter)}, 'x');`);
    const r = runNode(SCRIPT, { args: ['measure', '--runs', '4', '--warmup', '2', '--', process.execPath, prog] });
    assert.equal(r.code, 0, r.stderr);
    const m = parseMeasurement(r.stdout.trim());
    assert.equal(m.runs, 4);
    assert.equal(m.unit, 's');
    assert.ok(m.median > 0 && m.spread >= 0);
    assert.equal(readFileSync(counter, 'utf8').length, 6, 'warmup runs plus measured runs');
  });

  test('--value stdout takes the number on the last line of output, with its unit', () => {
    const dir = tempDir('hillclimb-measure-');
    const counter = join(dir, 'n.txt');
    const prog = join(dir, 'score.mjs');
    // Prints 10, 20, 30, 40, 50 on successive runs, after a line of noise.
    writeFileSync(prog, [
      `import { readFileSync, writeFileSync, existsSync } from 'node:fs';`,
      `const n = existsSync(${JSON.stringify(counter)}) ? Number(readFileSync(${JSON.stringify(counter)}, 'utf8')) + 1 : 1;`,
      `writeFileSync(${JSON.stringify(counter)}, String(n));`,
      `console.log('loading 3 files');`,
      `console.log(String(n * 10) + 'KB');`,
    ].join('\n'));
    const r = runNode(SCRIPT, { args: ['measure', '--runs', '5', '--warmup', '0', '--value', 'stdout', '--', process.execPath, prog] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'median=30KB runs=5 spread=40KB');
  });

  test('--value stdout keeps every digit of the input', () => {
    const dir = tempDir('hillclimb-measure-');
    const counter = join(dir, 'n.txt');
    const prog = join(dir, 'size.mjs');
    writeFileSync(prog, [
      `import { readFileSync, writeFileSync, existsSync } from 'node:fs';`,
      `const n = existsSync(${JSON.stringify(counter)}) ? Number(readFileSync(${JSON.stringify(counter)}, 'utf8')) + 1 : 0;`,
      `writeFileSync(${JSON.stringify(counter)}, String(n));`,
      `console.log([1234567, 1234520, 1234568][n] + 'B');`,
    ].join('\n'));
    const r = runNode(SCRIPT, { args: ['measure', '--runs', '3', '--warmup', '0', '--value', 'stdout', '--', process.execPath, prog] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'median=1234567B runs=3 spread=48B');
  });

  test('--shell takes the whole command as one argument, and refuses more than one', () => {
    assert.throws(() => parseArgs(['measure', '--shell', '--', 'node', '-e', 'console.log(1)']), /one argument/);
    const r = runNode(SCRIPT, { args: ['measure', '--shell', '--runs', '3', '--warmup', '0', '--value', 'stdout', '--', `"${process.execPath}" -e "console.log(7)" | cat`] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'median=7 runs=3 spread=0');
  });

  test('a run that fails, or prints no number with --value stdout, fails the measurement', () => {
    const dir = tempDir('hillclimb-measure-');
    const bad = join(dir, 'bad.mjs');
    writeFileSync(bad, 'process.exit(3);');
    const r = runNode(SCRIPT, { args: ['measure', '--runs', '3', '--warmup', '0', '--', process.execPath, bad] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /exit/);
    assert.equal(r.stdout.trim(), '', 'no measurement is printed for a failed run');
    const words = join(dir, 'words.mjs');
    writeFileSync(words, "console.log('done');");
    const w = runNode(SCRIPT, { args: ['measure', '--runs', '3', '--warmup', '0', '--value', 'stdout', '--', process.execPath, words] });
    assert.equal(w.code, 1);
    assert.match(w.stderr, /number/);
  });

  test('--value stdout fails the measurement when a later run prints another unit', () => {
    const dir = tempDir('hillclimb-measure-');
    const counter = join(dir, 'n.txt');
    const prog = join(dir, 'size.mjs');
    // Prints 10KB on the first run and 10MB on the second.
    writeFileSync(prog, [
      `import { readFileSync, writeFileSync, existsSync } from 'node:fs';`,
      `const n = existsSync(${JSON.stringify(counter)}) ? Number(readFileSync(${JSON.stringify(counter)}, 'utf8')) + 1 : 0;`,
      `writeFileSync(${JSON.stringify(counter)}, String(n));`,
      `console.log('10' + ['KB', 'MB'][n]);`,
    ].join('\n'));
    const r = runNode(SCRIPT, { args: ['measure', '--runs', '2', '--warmup', '0', '--value', 'stdout', '--', process.execPath, prog] });
    assert.equal(r.code, 1, r.stdout);
    assert.match(r.stderr, /unit/);
    assert.equal(r.stdout.trim(), '', 'no measurement is printed');
  });
});

describe('usage', () => {
  test('unknown commands and options, and a missing value, exit 2', () => {
    assert.equal(run(['frobnicate']).code, 2);
    assert.equal(run([]).code, 2);
    assert.equal(run(['append']).code, 2);
    assert.equal(run(['append', newLog(), '--colour', 'red']).code, 2);
    assert.equal(run(['append', newLog(), '--note']).code, 2);
    assert.equal(run(['measure', '--runs', '0', '--', 'x']).code, 2);
    assert.equal(run(['measure', '--runs', '3']).code, 2);
    assert.throws(() => parseArgs(['measure', '--value', 'rss', '--', 'x']), /value/);
  });

  test('an append option given twice exits 2, names the option and writes no log', () => {
    const log = newLog();
    // Valid if the later value were kept. The earlier one alone is refused too, but with exit 1 ("a baseline needs
    // passing tests"), so exit 2 comes only from the repeat.
    const r = run(['append', log, '--decision', 'baseline', '--tests', 'fail', '--tests', 'pass', '--better', 'lower',
      '--measurement', BASE, '--hypothesis', 'baseline', '--change', 'none']);
    assert.equal(r.code, 2, r.out);
    assert.match(r.err, /--tests given twice/);
    assert.equal(existsSync(log), false);
  });

  test('the command line works end to end', () => {
    const log = newLog();
    const r = runNode(SCRIPT, { args: ['append', log, '--decision', 'baseline', '--tests', 'pass', '--better', 'lower', '--measurement', BASE] });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /appended/);
    assert.equal(runNode(SCRIPT, { args: ['append', log, '--decision', 'keep', '--tests', 'pass', '--hypothesis', 'h', '--change', 'c'] }).code, 1);
  });
});
