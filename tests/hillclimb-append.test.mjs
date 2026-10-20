// decisions.mjs append for the hillclimb skill: every refusal, the delta against the best kept so far, corrections,
// a log inside a git work tree, a file edited by hand, and the append-only guarantee.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { HEADER, insideGitTree } from '../skills/verification/hillclimb/decisions.mjs';
import { BASE, newLog, run, append, baseline, rows, col } from './hillclimb.helpers.mjs';

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
