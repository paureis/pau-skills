// decisions.mjs for the hillclimb skill: the measurement format, the delta against the best kept so far, every
// refusal of append (a keep with no run count or spread, a field that would break the TSV, a log inside a git work
// tree, a file edited by hand), the append-only guarantee, measure against small node commands, and summary.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { repo, runNode, tempDir } from './helpers.mjs';
import {
  HEADER, parseMeasurement, formatNumber, median, describeDelta, insideGitTree, parseArgs, main, guardCell,
} from '../skills/verification/hillclimb/decisions.mjs';

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

describe('append', () => {
  test('creates the file with the header, then appends one row per call', () => {
    const log = newLog();
    assert.equal(baseline(log, { note: 'stop: 50% faster and at least 3 attempts' }).code, 0);
    const text = readFileSync(log, 'utf8');
    assert.equal(text.split('\n')[0], HEADER.join('\t'));
    assert.deepEqual(HEADER, ['time', 'attempt', 'hypothesis', 'change', 'measurement', 'delta', 'tests', 'decision', 'note']);
    const [row] = rows(log);
    assert.equal(row.length, HEADER.length);
    assert.match(row[col('time')], /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}/);
    assert.equal(row[col('attempt')], 'baseline');
    assert.equal(row[col('delta')], 'reference (lower is better)');
    assert.equal(row[col('decision')], 'baseline');
    assert.equal(row[col('note')], 'stop: 50% faster and at least 3 attempts');

    const r = append(log, { decision: 'keep', tests: 'pass', measurement: 'median=1.50s runs=5 spread=0.05s', hypothesis: 'cache the parse', change: 'memoize parse()' });
    assert.equal(r.code, 0, r.err);
    const two = rows(log);
    assert.equal(two.length, 2);
    assert.equal(two[1][col('attempt')], '1', 'the first attempt is 1');
    assert.equal(two[1][col('delta')], "'-0.5s -25.0% better, beyond noise");
    assert.ok(text.length > 0 && readFileSync(log, 'utf8').startsWith(text), 'the first row was not rewritten');
  });

  test('the delta is against the best kept so far: the latest baseline or keep, not the latest row', () => {
    const log = newLog();
    baseline(log);
    append(log, { decision: 'keep', tests: 'pass', measurement: 'median=1.50s runs=5 spread=0.05s', hypothesis: 'h', change: 'c' });
    append(log, { decision: 'revert', tests: 'pass', measurement: 'median=3.00s runs=5 spread=0.05s', hypothesis: 'h', change: 'c' });
    append(log, { decision: 'revert', tests: 'pass', measurement: 'median=1.40s runs=5 spread=0.20s', hypothesis: 'h', change: 'c' });
    const r = rows(log);
    assert.equal(r[2][col('delta')], "'+1.5s +100.0% worse, beyond noise");
    assert.equal(r[3][col('delta')], "'-0.1s -6.7% within noise");
  });

  test('refuses a keep without a measurement, or with no run count or no spread, and leaves the file as it was', () => {
    const log = newLog();
    baseline(log);
    const before = readFileSync(log, 'utf8');
    for (const measurement of [undefined, 'median=1.5s', 'median=1.5s runs=5', 'median=1.5s spread=0.1s', 'faster']) {
      const fields = { decision: 'keep', tests: 'pass', hypothesis: 'h', change: 'c' };
      if (measurement !== undefined) fields.measurement = measurement;
      const r = append(log, fields);
      assert.equal(r.code, 1, `keep with ${measurement} was accepted`);
      assert.match(r.err, /refused/);
    }
    assert.equal(readFileSync(log, 'utf8'), before);
  });

  test('refuses a baseline without a measurement or without a direction', () => {
    const log = newLog();
    assert.equal(append(log, { decision: 'baseline', tests: 'pass', better: 'lower' }).code, 1);
    assert.equal(append(log, { decision: 'baseline', tests: 'pass', measurement: BASE }).code, 1);
    assert.equal(append(log, { decision: 'baseline', tests: 'pass', measurement: BASE, better: 'faster' }).code, 1);
    assert.equal(existsSync(log), false, 'a refused first append creates no file');
  });

  test('refuses a keep with fewer than 3 runs, failing tests, no baseline before it, or a worse number', () => {
    const log = newLog();
    const keep = (m, extra = {}) => append(log, { decision: 'keep', tests: 'pass', measurement: m, hypothesis: 'h', change: 'c', ...extra });
    assert.match(keep('median=1.5s runs=5 spread=0.1s').err, /baseline/);
    baseline(log);
    assert.match(keep('median=1.5s runs=2 spread=0.1s').err, /3 runs/);
    assert.match(keep('median=1.5s runs=5 spread=0.1s', { tests: 'fail' }).err, /tests/);
    assert.match(keep('median=2.5s runs=5 spread=0.1s').err, /worse/);
    assert.equal(rows(log).length, 1);
  });

  test('refuses a keep within noise unless the note starts with "simplification"', () => {
    const log = newLog();
    baseline(log);
    const within = { decision: 'keep', tests: 'pass', measurement: 'median=1.95s runs=5 spread=0.1s', hypothesis: 'h', change: 'c' };
    assert.match(append(log, within).err, /noise/);
    assert.equal(append(log, { ...within, note: 'simplification: same speed, 40 fewer lines' }).code, 0);
    assert.equal(rows(log).length, 2);
  });

  test('refuses a keep or revert without a hypothesis or a change, and an unknown decision or tests value', () => {
    const log = newLog();
    baseline(log);
    const m = 'median=1.5s runs=5 spread=0.1s';
    assert.equal(append(log, { decision: 'keep', tests: 'pass', measurement: m, change: 'c' }).code, 1);
    assert.equal(append(log, { decision: 'revert', tests: 'pass', measurement: m, hypothesis: 'h' }).code, 1);
    assert.equal(append(log, { decision: 'maybe', tests: 'pass', measurement: m, hypothesis: 'h', change: 'c' }).code, 1);
    assert.equal(append(log, { decision: 'revert', tests: 'green', measurement: m, hypothesis: 'h', change: 'c' }).code, 1);
    assert.equal(rows(log).length, 1);
  });

  test('a revert may have no measurement (the build broke) and then has no delta', () => {
    const log = newLog();
    baseline(log);
    assert.equal(append(log, { decision: 'revert', tests: 'fail', hypothesis: 'h', change: 'c', note: 'did not compile' }).code, 0);
    assert.equal(rows(log)[1][col('delta')], '');
  });

  test('refuses a field with a tab, a newline or a carriage return, in any column', () => {
    const log = newLog();
    baseline(log);
    const before = readFileSync(log, 'utf8');
    const ok = { decision: 'revert', tests: 'pass', measurement: 'median=1.9s runs=5 spread=0.1s', hypothesis: 'h', change: 'c', note: 'n', id: '7' };
    for (const field of ['hypothesis', 'change', 'note', 'id', 'measurement']) {
      for (const bad of ['a\tb', 'a\nb', 'a\rb']) {
        const r = append(log, { ...ok, [field]: bad });
        assert.equal(r.code, 1, `${field} with ${JSON.stringify(bad)} was accepted`);
        assert.match(r.err, /tab|newline/);
      }
    }
    assert.equal(readFileSync(log, 'utf8'), before);
  });

  test('refuses a different unit, or a later baseline that turns the direction around', () => {
    const log = newLog();
    baseline(log);
    assert.match(append(log, { decision: 'revert', tests: 'pass', measurement: 'median=1900ms runs=5 spread=10ms', hypothesis: 'h', change: 'c' }).err, /unit/);
    assert.match(baseline(log, { better: 'higher' }).err, /lower/);
    assert.equal(baseline(log, { note: 're-baseline after the machine went quiet' }).code, 0);
    assert.equal(rows(log).length, 2);
  });

  test('never rewrites earlier rows: every append leaves the old bytes as a prefix', () => {
    const log = newLog();
    baseline(log);
    let prev = readFileSync(log, 'utf8');
    for (let i = 0; i < 4; i++) {
      append(log, { decision: 'revert', tests: 'pass', measurement: `median=1.9${i}s runs=5 spread=0.1s`, hypothesis: `h${i}`, change: `c${i}` });
      const now = readFileSync(log, 'utf8');
      assert.ok(now.startsWith(prev) && now.length > prev.length);
      prev = now;
    }
  });

  test('refuses a file that is not a decision log, or was cut or edited by hand', () => {
    const notOurs = newLog();
    writeFileSync(notOurs, 'name\tvalue\n');
    assert.match(baseline(notOurs).err, /header/);
    const cut = newLog();
    baseline(cut);
    writeFileSync(cut, readFileSync(cut, 'utf8').trimEnd());
    assert.match(baseline(cut).err, /newline/);
    const edited = newLog();
    baseline(edited);
    writeFileSync(edited, readFileSync(edited, 'utf8') + 'a\tb\n');
    assert.match(baseline(edited).err, /fields/);
  });

  test('refuses a log inside a git work tree, where a reset or clean could erase it', () => {
    const dir = tempDir('hillclimb-repo-');
    mkdirSync(join(dir, '.git'));
    mkdirSync(join(dir, 'sub'));
    assert.equal(insideGitTree(join(dir, 'sub', 'decision.tsv')), dir);
    assert.equal(insideGitTree(join(dir, 'not-yet', 'deeper', 'decision.tsv')), dir);
    const r = baseline(join(dir, 'sub', 'decision.tsv'));
    assert.equal(r.code, 1);
    assert.match(r.err, /git/);
    assert.equal(existsSync(join(dir, 'sub', 'decision.tsv')), false);
    // A worktree or submodule has a .git file instead of a folder.
    const wt = tempDir('hillclimb-wt-');
    writeFileSync(join(wt, '.git'), 'gitdir: elsewhere\n');
    assert.equal(insideGitTree(join(wt, 'decision.tsv')), wt);
    assert.equal(insideGitTree(newLog()), null);
  });

  test('attempt ids: a baseline is "baseline", attempts count up from 1, a given id is kept and later ids follow it', () => {
    const log = newLog();
    baseline(log);
    const revert = (extra = {}) => append(log, { decision: 'revert', tests: 'pass', hypothesis: 'h', change: 'c', ...extra });
    revert({ id: 'sensitivity' });
    revert();
    revert();
    revert({ id: '2', note: 'corrects: the tests value was wrong' });
    revert({ id: '10' });
    revert();
    baseline(log, { note: 're-baseline' });
    revert();
    assert.deepEqual(rows(log).map((r) => r[col('attempt')]), ['baseline', 'sensitivity', '1', '2', '2', '10', '11', 'baseline', '12']);
  });

  test('a correction stands for its attempt: a corrected keep is judged against the rows before it, not itself', () => {
    const log = newLog();
    baseline(log);
    const keep = (extra) => append(log, { decision: 'keep', tests: 'pass', hypothesis: 'h', change: 'c', ...extra });
    assert.equal(keep({ measurement: 'median=1.00s runs=5 spread=0.05s' }).code, 0);
    const r = keep({ id: '1', measurement: 'median=1.05s runs=5 spread=0.05s', note: 'corrects: pasted the wrong run' });
    assert.equal(r.code, 0, r.err);
    assert.equal(rows(log)[2][col('delta')], "'-0.95s -47.5% better, beyond noise");
  });

  test('a keep corrected to a revert stops being the reference, the best and a kept attempt', () => {
    const log = newLog();
    baseline(log);
    append(log, { decision: 'keep', tests: 'pass', measurement: 'median=1.00s runs=5 spread=0.05s', hypothesis: 'h', change: 'c' });
    assert.equal(append(log, { decision: 'revert', tests: 'fail', id: '1', hypothesis: 'h', change: 'c', note: 'corrects: broke parsing' }).code, 0);
    const r = append(log, { decision: 'keep', tests: 'pass', measurement: 'median=1.50s runs=5 spread=0.05s', hypothesis: 'h2', change: 'c2' });
    assert.equal(r.code, 0, r.err);
    assert.equal(rows(log)[3][col('delta')], "'-0.5s -25.0% better, beyond noise");
    const s = run(['summary', log]).out;
    assert.match(s, /best 1\.5s \(-25\.0%, attempt 2\)/);
    assert.match(s, /attempts 2 \(kept 1, reverted 1\)/);
  });

  test('simplifications cannot drift: each is compared with the best number kept, not the previous simplification', () => {
    const log = newLog();
    baseline(log);
    const simp = (median) => append(log, { decision: 'keep', tests: 'pass', measurement: `median=${median}s runs=5 spread=0.1s`, hypothesis: 'h', change: 'c', note: 'simplification: fewer lines' });
    assert.equal(simp('2.09').code, 0);
    const r = simp('2.18');
    assert.equal(r.code, 1, 'a second simplification 9% worse than the baseline was accepted');
    assert.match(r.err, /worse/);
  });

  test('a metric where higher is better keeps a higher number and refuses a lower one', () => {
    const log = newLog();
    baseline(log, { better: 'higher', measurement: 'median=100ops/s runs=5 spread=2ops/s' });
    const keep = (m) => append(log, { decision: 'keep', tests: 'pass', measurement: m, hypothesis: 'h', change: 'c' });
    assert.match(keep('median=90ops/s runs=5 spread=2ops/s').err, /worse/);
    const r = keep('median=120ops/s runs=5 spread=2ops/s');
    assert.equal(r.code, 0, r.err);
    assert.equal(rows(log)[1][col('delta')], "'+20ops/s +20.0% better, beyond noise");
  });

  test('refuses a baseline with failing tests: the gate must be green before the first change', () => {
    const log = newLog();
    const r = baseline(log, { tests: 'fail' });
    assert.equal(r.code, 1);
    assert.match(r.err, /tests/);
    assert.equal(existsSync(log), false);
  });

  test('refuses a log path that is a link into a git work tree, existing or not', () => {
    // Resolved, because the temporary folder can itself be a link (on macOS /var is a link to /private/var).
    const dir = realpathSync(tempDir('hillclimb-repo-'));
    mkdirSync(join(dir, '.git'));
    const inside = join(dir, 'decision.tsv');
    const outside = tempDir('hillclimb-');
    baseline(join(outside, 'real.tsv'));
    writeFileSync(inside, readFileSync(join(outside, 'real.tsv')));
    const before = readFileSync(inside, 'utf8');
    const link = join(outside, 'link.tsv');
    symlinkSync(inside, link);
    assert.equal(insideGitTree(link), dir);
    assert.match(append(link, { decision: 'revert', tests: 'pass', hypothesis: 'h', change: 'c' }).err, /git/);
    assert.equal(readFileSync(inside, 'utf8'), before);
    // A link to a link: only resolving the whole chain finds the repository.
    const chain = join(tempDir('hillclimb-'), 'chain.tsv');
    symlinkSync(link, chain);
    assert.equal(insideGitTree(chain), dir);
    assert.match(append(chain, { decision: 'revert', tests: 'pass', hypothesis: 'h', change: 'c' }).err, /git/);
    assert.equal(readFileSync(inside, 'utf8'), before);
    const dangling = join(outside, 'dangling.tsv');
    symlinkSync(join(dir, 'new.tsv'), dangling);
    assert.equal(insideGitTree(dangling), dir);
    assert.match(baseline(dangling).err, /git/);
    assert.equal(existsSync(join(dir, 'new.tsv')), false);
  });

  test('creates the parent folder when it is missing', () => {
    const log = join(tempDir('hillclimb-'), 'a', 'b', 'decision.tsv');
    assert.equal(baseline(log).code, 0);
    assert.equal(rows(log).length, 1);
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
});

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

  test('the command line works end to end', () => {
    const log = newLog();
    const r = runNode(SCRIPT, { args: ['append', log, '--decision', 'baseline', '--tests', 'pass', '--better', 'lower', '--measurement', BASE] });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /appended/);
    assert.equal(runNode(SCRIPT, { args: ['append', log, '--decision', 'keep', '--tests', 'pass', '--hypothesis', 'h', '--change', 'c'] }).code, 1);
  });
});
