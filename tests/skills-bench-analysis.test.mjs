// The numbers of the Skills Bench analysis on the hand-written round in tests/fixtures/skills-bench/analysis. Every
// expected value is worked by hand from the scores in that round (listed in the comments), never from the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repo } from './helpers.mjs';
import { readResults } from '../apps/skills-bench/lib/analysis/read.mjs';
import { summarize } from '../apps/skills-bench/lib/analysis/summary.mjs';

const FIXTURE = repo('tests', 'fixtures', 'skills-bench', 'analysis', '2026-11-28-pilot');
const s = summarize(readResults(FIXTURE), { delta: 0.15 });

const near = (actual, expected, places, what) => {
  assert.equal(typeof actual, 'number', `${what}: ${actual} is not a number`);
  assert.ok(Math.abs(actual - expected) <= 0.5 * 10 ** -places, `${what}: ${actual} is not ${expected} to ${places} decimals`);
};
const cell = (skill, task, variant) => s.cells.find((c) => c.skill === skill && c.task === task && c.variant === variant);
const task = (skill, name) => s.tasks.find((t) => t.skill === skill && t.task === name);
const skill = (name) => s.skills.find((k) => k.skill === name);

test('the fixture reads without problems', () => {
  assert.deepEqual(s.problems, []);
  assert.equal(s.cells.length, 24);
  assert.equal(s.round.roundId, '2026-11-28-pilot');
});

test('a cell: runs, passes, means, judge, cost, seconds and skill start rate', () => {
  // tdd/parse-dates/with scores 1.0, 0.8, 0.6; pass is score 0.8 or more; outcomeScore is score / 2. Judge means per
  // run: (1 + 4 + 5) / 3, 4, 4, so (10/3 + 8) / 3 = 34/9.
  const c = cell('tdd', 'parse-dates', 'with');
  assert.equal(c.runs, 3);
  assert.equal(c.graded, 3);
  assert.equal(c.dropouts, 0);
  assert.equal(c.passes, 2);
  near(c.passRate, 2 / 3, 9, 'pass rate');
  near(c.meanScore, 0.8, 9, 'mean score');
  near(c.meanOutcomeScore, 0.4, 9, 'mean outcome');
  near(c.judgeMean, 34 / 9, 9, 'judge mean');
  assert.equal(c.costMeanMicros, 100000);
  assert.equal(c.secondsMean, 60);
  assert.equal(c.skillStartRate, 1);
  // slugify/with: run 2 never started the skill and run 3 has no judge.
  const sl = cell('tdd', 'slugify', 'with');
  near(sl.skillStartRate, 2 / 3, 9, 'start rate');
  assert.equal(sl.judged, 2);
  assert.equal(sl.judgeMean, 4);
  assert.equal(cell('tdd', 'slugify', 'without').skillStartRate, 0);
});

test('cost per run: whole micro-dollars, the mean rounded up once', () => {
  // lru-cache/with costs 300000, 300000, 300001: sum 900001, mean 300000.33, rounded up to 300001. Seconds 240, 250, 260.
  const c = cell('tdd', 'lru-cache', 'with');
  assert.equal(c.costMeanMicros, 300001);
  assert.equal(c.costMaxMicros, 300001);
  assert.equal(c.secondsMean, 250);
  assert.equal(c.secondsMax, 260);
});

test('a run with grade null is a dropout, left out of pass rate and scores', () => {
  // bug-fix/off-by-one/with: 1.0, 1.0 and a dropout. retry-loop/without: 0.4 and two dropouts. race-cache/without: all three.
  const a = cell('bug-fix', 'off-by-one', 'with');
  assert.deepEqual([a.runs, a.graded, a.dropouts, a.passes, a.passRate, a.meanScore, a.meanOutcomeScore], [3, 2, 1, 2, 1, 1, 0.5]);
  assert.equal(a.flag, null);
  const b = cell('bug-fix', 'retry-loop', 'without');
  assert.deepEqual([b.graded, b.dropouts, b.meanScore, b.flag], [1, 2, 0.4, 'fewer than 2 graded runs']);
  const c = cell('bug-fix', 'race-cache', 'without');
  assert.deepEqual([c.graded, c.dropouts, c.meanScore, c.passRate, c.judgeMean], [0, 3, null, null, null]);
  // Dropouts still cost money: their cost counts in the mean.
  assert.equal(c.costMeanMicros, 300000);
});

test('per task: Welch interval on score and Newcombe interval on pass rate', () => {
  // parse-dates: 0.8 - 0.4 = 0.4; variances 0.04 and 0.04, se sqrt(0.04/3 * 2) = 0.163299, df 4,
  // half 2.7764 * 0.163299 = 0.45338. Pass 2/3 minus 0/3.
  const p = task('tdd', 'parse-dates');
  near(p.score.diff, 0.4, 9, 'diff');
  near(p.score.df, 4, 6, 'df');
  near(p.score.lo, -0.0534, 4, 'lo');
  near(p.score.hi, 0.8534, 4, 'hi');
  near(p.pass.diff, 2 / 3, 9, 'pass diff');
  assert.ok(p.pass.lo < p.pass.diff && p.pass.hi > p.pass.diff);
  // off-by-one: 1.0 (no spread, 2 runs) minus 0.5 (variance 0.25): se sqrt(0.25/3) = 0.288675, df 2,
  // half 4.3027 * 0.288675 = 1.24208.
  const o = task('bug-fix', 'off-by-one');
  near(o.score.df, 2, 6, 'df');
  near(o.score.lo, -0.7421, 4, 'lo');
  near(o.score.hi, 1.7421, 4, 'hi');
  // null-config: 0.8 everywhere: the point, flagged. Pass 3/3 minus 3/3: -0.5615 to 0.5615 (Wilson 3 of 3 is 0.4385).
  const n = task('bug-fix', 'null-config');
  assert.deepEqual([n.score.diff, n.score.lo, n.score.hi, n.score.flag], [0, 0, 0, 'no spread']);
  near(n.pass.lo, -0.5615, 4, 'pass lo');
  near(n.pass.hi, 0.5615, 4, 'pass hi');
  // retry-loop: one graded run without, so no interval on either.
  const r = task('bug-fix', 'retry-loop');
  near(r.score.diff, 0.2, 9, 'diff');
  assert.deepEqual([r.score.lo, r.score.flag, r.pass.lo, r.pass.flag], [null, 'fewer than 2 graded runs', null, 'fewer than 2 graded runs']);
  assert.equal(task('bug-fix', 'race-cache').score.diff, null);
});

test('per skill: the paired difference over tasks with both arms, on k - 1 df', () => {
  // tdd diffs 0.4, 0.2, 0.3, 0.4, 0.3: mean 0.32, variance 0.028 / 4 = 0.007, se sqrt(0.007 / 5) = 0.037417,
  // t(0.975, 4) = 2.7764, half 0.103884.
  const t = skill('tdd').paired;
  assert.equal(t.k, 5);
  assert.equal(t.df, 4);
  near(t.mean, 0.32, 9, 'mean');
  near(t.lo, 0.2161, 4, 'lo');
  near(t.hi, 0.4239, 4, 'hi');
  // bug-fix: race-cache has no graded run without, so k = 4: diffs 0.5, 0, 0.1, 0.2, mean 0.2, variance 0.14 / 3,
  // se 0.108012, t(0.975, 3) = 3.1824, half 0.34374.
  const b = skill('bug-fix').paired;
  assert.equal(b.k, 4);
  assert.equal(b.df, 3);
  near(b.mean, 0.2, 9, 'mean');
  near(b.lo, -0.1437, 4, 'lo');
  near(b.hi, 0.5437, 4, 'hi');
});

test('per skill and difficulty: 2 tasks give df 1, 1 task keeps its Welch interval', () => {
  // tdd simple: 0.4 and 0.2, mean 0.3, se 0.1, t(0.975, 1) = 12.7062. Medium: 0.3 and 0.4, mean 0.35, se 0.05.
  const t = skill('tdd').byDifficulty;
  assert.deepEqual([t.simple.k, t.simple.df, t.simple.tasks], [2, 1, ['parse-dates', 'slugify']]);
  near(t.simple.mean, 0.3, 9, 'simple mean');
  near(t.simple.lo, -0.9706, 4, 'simple lo');
  near(t.simple.hi, 1.5706, 4, 'simple hi');
  assert.deepEqual([t.medium.k, t.medium.tasks], [2, ['rate-limit', 'csv-reader']]);
  near(t.medium.mean, 0.35, 9, 'medium mean');
  near(t.medium.lo, -0.2853, 4, 'medium lo');
  near(t.medium.hi, 0.9853, 4, 'medium hi');
  // Complex: lru-cache alone. 0.5 - 0.2 = 0.3, both variances 0.01, se 0.08165, df 4, half 0.22669.
  assert.deepEqual([t.complex.k, t.complex.lo, t.complex.flag], [1, null, 'one task: no paired interval, its Welch interval is shown']);
  near(t.complex.mean, 0.3, 9, 'complex mean');
  near(t.complex.welch.lo, 0.0733, 4, 'complex Welch lo');
  near(t.complex.welch.hi, 0.5267, 4, 'complex Welch hi');
  // bug-fix: simple 0.5 and 0 (se 0.25, half 3.17655); complex has no task with both arms.
  const b = skill('bug-fix').byDifficulty;
  near(b.simple.mean, 0.25, 9, 'simple mean');
  near(b.simple.lo, -2.9266, 4, 'simple lo');
  near(b.simple.hi, 3.4266, 4, 'simple hi');
  near(b.medium.mean, 0.15, 9, 'medium mean');
  assert.deepEqual([b.complex.k, b.complex.mean, b.complex.flag], [0, null, 'no task with both arms']);
});

test('controls: found from their variants, verdicts per task and pooled', () => {
  const c = s.controls;
  assert.deepEqual(c.tasks.map((t) => t.task), ['rate-limit', 'csv-reader']);
  assert.deepEqual(s.tasks.filter((t) => t.control).map((t) => t.task), ['rate-limit', 'csv-reader']);
  // rate-limit broken 0.3, 0.2, 0.1 (mean 0.2) minus with 1.0, 0.9, 0.8 (mean 0.9): -0.7, se 0.08165, df 4,
  // half 0.22669. Empty 0.7, 0.5, 0.6 (mean 0.6, variance 0.01) minus without 0.6 x 3: 0, se 0.057735, df 2,
  // half 4.3027 * 0.057735 = 0.24841.
  const r = c.tasks[0];
  near(r.broken.diff, -0.7, 9, 'broken diff');
  near(r.broken.lo, -0.9267, 4, 'broken lo');
  near(r.broken.hi, -0.4733, 4, 'broken hi');
  assert.deepEqual([r.broken.excludesZero, r.broken.asExpected], [true, true]);
  near(r.empty.diff, 0, 9, 'empty diff');
  near(r.empty.df, 2, 6, 'empty df');
  near(r.empty.hi, 0.2484, 4, 'empty hi');
  assert.deepEqual([r.empty.excludesZero, r.empty.asExpected], [false, true]);
  // Pooled: broken 0.3, 0.2, 0.1, 0.5, 0.4, 0.3 (mean 0.3, variance 0.02) minus with 1.0, 0.9, 0.8, 0.9, 0.8, 0.7
  // (mean 0.85, variance 0.011): -0.55; df (0.02/6 + 0.011/6)^2 / ((0.02/6)^2 / 5 + (0.011/6)^2 / 5) = 9.2226.
  near(c.pooled.broken.diff, -0.55, 9, 'pooled broken');
  near(c.pooled.broken.df, 9.2226, 4, 'pooled df');
  assert.deepEqual([c.pooled.broken.excludesZero, c.pooled.broken.asExpected], [true, true]);
  // Pooled empty 0.7, 0.5, 0.6, 0.4, 0.4, 0.4 (mean 0.5) minus without 0.6, 0.6, 0.6, 0.5, 0.4, 0.3 (mean 0.5).
  near(c.pooled.empty.diff, 0, 9, 'pooled empty');
  assert.deepEqual([c.pooled.empty.excludesZero, c.pooled.empty.asExpected], [false, true]);
});

test('recommendation: runs per arm from the pooled within-cell SD, and the budget', () => {
  // With and without cells with 2 or more graded runs: sums of squares 0.36 (tdd, 20 df) and 0.58 (bug-fix, 15 df).
  // Pooled variance 0.94 / 35; n = 2 * (1.959964 + 0.841621)^2 * (0.94 / 35) / 0.15^2 = 18.74, so 19.
  const r = s.recommendation;
  near(r.pooledSd, Math.sqrt(0.94 / 35), 9, 'pooled sd');
  assert.equal(r.pooledDf, 35);
  assert.equal(r.runsPerArm, 19);
  assert.equal(r.flag, null);
  // Cost per run over with and without runs: simple 24 x 100000, medium 24 x 200000, complex 11 x 300000 + 300001.
  assert.deepEqual(r.costPerRun.simple, { runs: 24, sumMicros: 2400000, meanMicros: 100000 });
  assert.deepEqual(r.costPerRun.complex, { runs: 12, sumMicros: 3600001, meanMicros: 300001 });
  // Judge: 10 calls, 450001 in all, mean 45000.1 rounded up. A call reviews at most 26 runs (letters A to Z), so a
  // task with 2 x 19 = 38 runs needs 2 calls: 20 in all.
  assert.deepEqual(r.judge, { calls: 10, sumMicros: 450001, meanMicros: 45001 });
  assert.deepEqual(r.fullRound, { tasks: { simple: 4, medium: 4, complex: 2 }, runs: 380, judgeCalls: 20 });
  // 4 * 38 * 100000 + 4 * 38 * 200000 + 2 * 38 * 3600001 / 12 + 20 * 450001 / 10
  // = 15200000 + 30400000 + 22800006.33 + 900002 = 69300008.33, rounded up once: 69300009.
  assert.equal(r.budgetMicros, 69300009);
  assert.equal(summarize(readResults(FIXTURE), { delta: 0.3 }).recommendation.runsPerArm, 5);
});

// In-memory rounds for the cases the fixture does not hold.
const run = (variant, n, score, extra = {}) => ({
  format: 'skills-bench-run/1', skill: 'tdd', task: 't1', difficulty: 'simple', variant, n, costMicros: 10, seconds: 1,
  skillStarted: variant !== 'without', grade: score === null ? null : { pass: score >= 0.8, score, outcomeScore: score, checks: [] },
  judge: null, ...extra,
});
const memory = (runs) => ({
  round: { format: 'skills-bench-results/1', roundId: 'r', tasks: [{ skill: 'tdd', task: 't1', difficulty: 'simple', variants: ['with', 'without', 'broken', 'empty'], status: 'done' }] },
  runs, judgeCalls: [], owner: { map: null, grades: {} }, problems: [],
});
const arm = (variant, scores) => scores.map((x, i) => run(variant, i + 1, x));

test('controls: a broken copy that scores higher and an empty skill that shifts the score are not as expected', () => {
  const m = summarize(memory([...arm('with', [0.5, 0.6, 0.7]), ...arm('without', [0.1, 0.2, 0.3]),
    ...arm('broken', [0.7, 0.8, 0.9]), ...arm('empty', [0.9, 1.0, 0.95])]));
  const t = m.controls.tasks[0];
  near(t.broken.diff, 0.2, 9, 'broken diff');
  assert.equal(t.broken.asExpected, false);
  assert.equal(t.empty.excludesZero, true);
  assert.equal(t.empty.asExpected, false);
  // Broken below with but inside the noise is still as expected: the rule is on the point estimate.
  const close = summarize(memory([...arm('with', [0.5, 0.6, 0.7]), ...arm('without', [0.5, 0.6, 0.7]),
    ...arm('broken', [0.4, 0.6, 0.7]), ...arm('empty', [0.5, 0.6, 0.7])])).controls.tasks[0];
  assert.deepEqual([close.broken.excludesZero, close.broken.asExpected], [false, true]);
  // Without 2 graded runs on a side there is no interval, so the empty verdict is unknown.
  const thin = summarize(memory([...arm('with', [0.5, 0.6]), ...arm('without', [0.5, null]),
    ...arm('broken', [0.4, 0.5]), ...arm('empty', [0.5, 0.6])])).controls.tasks[0];
  assert.deepEqual([thin.empty.lo, thin.empty.excludesZero, thin.empty.asExpected], [null, null, null]);
  // Empty and without both 0.6 on every run: the interval is the point 0 to 0, which includes 0, so as expected.
  // Broken scoring exactly what with scores: a difference of 0 is not below 0, so not as expected.
  const flat = summarize(memory([...arm('with', [0.5, 0.6, 0.7]), ...arm('without', [0.6, 0.6, 0.6]),
    ...arm('broken', [0.5, 0.6, 0.7]), ...arm('empty', [0.6, 0.6, 0.6])])).controls.tasks[0];
  assert.deepEqual([flat.empty.lo, flat.empty.hi, flat.empty.flag, flat.empty.asExpected], [0, 0, 'no spread', true]);
  assert.deepEqual([flat.broken.diff, flat.broken.asExpected], [0, false]);
  // A task with broken runs but no empty runs is not a control.
  assert.deepEqual(summarize(memory([...arm('with', [0.5, 0.6]), ...arm('without', [0.5, 0.4]), ...arm('broken', [0.1, 0.2])])).controls.tasks, []);
});

test('the dropout rule holds for a grade null in the middle of an arm', () => {
  const m = summarize(memory([...arm('with', [1, null, 0]), ...arm('without', [0.5, 0.5])]));
  const c = m.cells.find((x) => x.variant === 'with');
  assert.deepEqual([c.runs, c.graded, c.dropouts, c.passes, c.passRate, c.meanScore], [3, 2, 1, 1, 0.5, 0.5]);
  // A dropout's seconds and cost still count: 1, 10 and 1 seconds give a mean of 4 and a max of 10; costs 10, 40
  // and 10 micro-dollars give a mean of 20 and a max of 40.
  const slow = summarize(memory([run('with', 1, 1), run('with', 2, null, { seconds: 10, costMicros: 40 }), run('with', 3, 0)])).cells[0];
  assert.deepEqual([slow.secondsMean, slow.secondsMax, slow.costMeanMicros, slow.costMaxMicros], [4, 10, 20, 40]);
  // An unfinished run has no cost and no seconds: only the values that exist count.
  const cut = summarize(memory([run('with', 1, 1), run('with', 2, null, { finished: false, seconds: null, costMicros: null }), run('with', 3, 0, { seconds: 3, costMicros: 11 })])).cells[0];
  assert.deepEqual([cut.runs, cut.dropouts, cut.secondsMean, cut.secondsMax, cut.costMeanMicros, cut.costMaxMicros], [3, 1, 2, 3, 11, 11]);
  // Judge null is left out of the judge mean, judge scores average per run first.
  const j = summarize(memory([run('with', 1, 1, { judge: { 1: 2, 2: 4 } }), run('with', 2, 1, { judge: null }), run('with', 3, 1, { judge: { 1: 5, 2: 5 } })]));
  assert.equal(j.cells[0].judgeMean, 4);
  assert.equal(j.cells[0].judged, 2);
});

test('no arm with 2 graded runs: no runs-per-arm recommendation, said so', () => {
  const m = summarize(memory([...arm('with', [1, null]), ...arm('without', [0.5])]));
  assert.equal(m.recommendation.runsPerArm, null);
  assert.equal(m.recommendation.budgetMicros, null);
  assert.equal(m.recommendation.flag, 'no with or without arm has 2 or more graded runs, so there is no spread to plan from');
});
