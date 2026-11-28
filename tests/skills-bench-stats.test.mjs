// The statistics behind the Skills Bench analysis (apps/skills-bench/lib/analysis/stats.mjs). Every expected value
// comes from a published table or from hand working shown next to it, never from the code under check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mean, sampleVariance, tQuantile, normalQuantile, welchInterval, pairedInterval, wilsonInterval, newcombeDiff,
  runsPerArm, weightedKappa,
} from '../apps/skills-bench/lib/analysis/stats.mjs';

const near = (actual, expected, places, what) => {
  const tol = 0.5 * 10 ** -places;
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} is not ${expected} to ${places} decimals`);
};

test('mean and sample variance, by hand', () => {
  // [1, 2, 3, 4]: mean 10 / 4 = 2.5; squares of the deviations 2.25 + 0.25 + 0.25 + 2.25 = 5, over n - 1 = 3.
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  near(sampleVariance([1, 2, 3, 4]), 5 / 3, 12, 'variance');
  assert.equal(mean([]), null);
  assert.equal(sampleVariance([7]), null);
  // Equal values have no spread at all, not a rounding remainder.
  assert.equal(sampleVariance([0.6, 0.6, 0.6]), 0);
});

test('normal quantiles match the standard normal table', () => {
  // Abramowitz and Stegun (1964), Handbook of Mathematical Functions, chapter 26, percentage points of the normal
  // distribution: z(0.975) = 1.959964, z(0.8) = 0.841621, z(0.995) = 2.575829 (the brief lists the first two).
  near(normalQuantile(0.975), 1.959964, 6, 'z 0.975');
  near(normalQuantile(0.8), 0.841621, 6, 'z 0.8');
  near(normalQuantile(0.995), 2.575829, 6, 'z 0.995');
  near(normalQuantile(0.025), -1.959964, 6, 'z 0.025');
  assert.equal(normalQuantile(0.5), 0);
  assert.throws(() => normalQuantile(1), /between 0 and 1/);
});

test('t quantiles at 0.975 match the published table, fractional df too', () => {
  // NIST/SEMATECH e-Handbook of Statistical Methods, section 1.3.6.7.2, upper critical values of the t distribution,
  // 0.025 column: 12.706 (df 1), 4.303 (2), 2.776 (4), 2.228 (10), 2.042 (30). The fourth decimal, df 3.5 and df 1000
  // are the values the brief for this slice lists: 12.7062, 4.3027, 2.7764, 2.2281, 2.0423, 2.9401, 1.9623.
  const table = [[1, 12.7062], [2, 4.3027], [4, 2.7764], [10, 2.2281], [30, 2.0423], [3.5, 2.9401], [1000, 1.9623]];
  for (const [df, t] of table) near(tQuantile(0.975, df), t, 4, `t 0.975 df ${df}`);
  near(tQuantile(0.025, 4), -2.7764, 4, 't 0.025 df 4');
  near(tQuantile(0.975, Infinity), 1.959964, 6, 't with infinite df is z');
  assert.throws(() => tQuantile(0.975, 0), /df/);
});

test('Welch interval: equal spreads, by hand', () => {
  // [1,2,3] minus [4,5,6]: difference -3; both variances 1, so se^2 = 1/3 + 1/3 = 2/3 and
  // df = (2/3)^2 / ((1/3)^2 / 2 + (1/3)^2 / 2) = (4/9) / (1/9) = 4; half width 2.7764 * sqrt(2/3) = 2.267.
  const w = welchInterval([1, 2, 3], [4, 5, 6], 0.95);
  assert.equal(w.diff, -3);
  near(w.df, 4, 9, 'df');
  near(w.lo, -5.267, 3, 'lo');
  near(w.hi, -0.733, 3, 'hi');
  assert.equal(w.flag, null);
});

test('Welch interval: unequal sizes and spreads, by hand', () => {
  // [1,2,3,4,5] minus [2,4,6]: difference 3 - 4 = -1. Variances 2.5 and 4; 2.5/5 = 0.5 and 4/3 = 1.3333, sum 1.8333.
  // df = 1.8333^2 / (0.5^2 / 4 + 1.3333^2 / 2) = 3.3611 / 0.9514 = 3.5328. Interval -4.9637 to 2.9637.
  const w = welchInterval([1, 2, 3, 4, 5], [2, 4, 6], 0.95);
  near(w.diff, -1, 12, 'diff');
  near(w.df, 3.5328, 4, 'df');
  near(w.lo, -4.9637, 4, 'lo');
  near(w.hi, 2.9637, 4, 'hi');
});

test('Welch interval: no spread gives the point, too few runs give no interval', () => {
  assert.deepEqual(welchInterval([3, 3, 3], [1, 1], 0.95), { diff: 2, lo: 2, hi: 2, df: null, flag: 'no spread' });
  assert.deepEqual(welchInterval([1], [0, 1], 0.95), { diff: 0.5, lo: null, hi: null, df: null, flag: 'fewer than 2 graded runs' });
  assert.deepEqual(welchInterval([], [0, 1], 0.95), { diff: null, lo: null, hi: null, df: null, flag: 'fewer than 2 graded runs' });
});

test('paired interval on k - 1 degrees of freedom, by hand', () => {
  // [0.1 .. 0.5]: mean 0.3, sd sqrt(0.025) = 0.158114, se 0.070711, t(0.975, 4) = 2.7764, half 0.19632.
  const p = pairedInterval([0.1, 0.2, 0.3, 0.4, 0.5], 0.95);
  near(p.mean, 0.3, 12, 'mean');
  assert.equal(p.k, 5);
  assert.equal(p.df, 4);
  near(p.lo, 0.1037, 4, 'lo');
  near(p.hi, 0.4963, 4, 'hi');
  // Two values: df 1. [0.4, 0.2]: mean 0.3, sd 0.141421, se 0.1, t(0.975, 1) = 12.7062.
  const two = pairedInterval([0.4, 0.2], 0.95);
  assert.equal(two.df, 1);
  near(two.lo, 0.3 - 1.27062, 4, 'lo df 1');
  near(two.hi, 0.3 + 1.27062, 4, 'hi df 1');
  assert.deepEqual(pairedInterval([0.25], 0.95), { k: 1, mean: 0.25, lo: null, hi: null, df: null, flag: 'fewer than 2 tasks' });
  assert.deepEqual(pairedInterval([0.25, 0.25], 0.95), { k: 2, mean: 0.25, lo: 0.25, hi: 0.25, df: 1, flag: 'no spread' });
});

test('Wilson score interval, by hand', () => {
  // 0 of 3 at z = 1.959964: z^2 = 3.841459; centre = (z^2 / 6) / (1 + z^2 / 3) = 0.640243 / 2.280486 = 0.280749;
  // half = (z / 2.280486) * sqrt(z^2 / 36) = 0.859449 * 0.326661 = 0.280749. Upper 0.5615, lower 0.
  const zero = wilsonInterval(0, 3, 0.95);
  assert.equal(zero.lo, 0);
  near(zero.hi, 0.5615, 4, 'upper 0 of 3');
  // 3 of 3 mirrors it: lower 1 - 0.5615 = 0.4385.
  const all = wilsonInterval(3, 3, 0.95);
  near(all.lo, 0.4385, 4, 'lower 3 of 3');
  assert.equal(all.hi, 1);
  assert.deepEqual(wilsonInterval(0, 0, 0.95), { p: null, lo: null, hi: null });
});

test('Newcombe hybrid score interval for a difference of proportions', () => {
  // Newcombe (1998), Statistics in Medicine 17:873-890, worked examples, method 10, example 56/70 minus 48/80:
  // 0.0524 to 0.3339.
  const d = newcombeDiff(56, 70, 48, 80, 0.95);
  near(d.diff, 0.2, 12, 'diff');
  near(d.lo, 0.0524, 4, 'lo');
  near(d.hi, 0.3339, 4, 'hi');
  // 3/3 minus 3/3: difference 0, each side sqrt((1 - 0.4385)^2) = 0.5615 from the Wilson case above.
  const same = newcombeDiff(3, 3, 3, 3, 0.95);
  near(same.lo, -0.5615, 4, 'lo 3/3');
  near(same.hi, 0.5615, 4, 'hi 3/3');
  assert.deepEqual(newcombeDiff(1, 2, 0, 0, 0.95), { diff: null, lo: null, hi: null, flag: 'no runs' });
  assert.throws(() => newcombeDiff(4, 3, 1, 3, 0.95), /0 to n/);
});

test('runs per arm from the normal formula', () => {
  // n = 2 (1.959964 + 0.841621)^2 0.3^2 / 0.15^2 = 2 * 7.848879 * 4 = 62.79, rounded up to 63.
  assert.equal(runsPerArm({ sd: 0.3, delta: 0.15, alpha: 0.05, power: 0.8 }), 63);
  // Half the spread: 2 * 7.848879 * 1 = 15.70, so 16.
  assert.equal(runsPerArm({ sd: 0.15, delta: 0.15, alpha: 0.05, power: 0.8 }), 16);
  // 2 * 7.848879 * 0.12^2 / 0.15^2 = 15.697758 * 0.64 = 10.05: always up, so 11, not 10.
  assert.equal(runsPerArm({ sd: 0.12, delta: 0.15, alpha: 0.05, power: 0.8 }), 11);
  assert.throws(() => runsPerArm({ sd: 0.3, delta: 0, alpha: 0.05, power: 0.8 }), /delta/);
});

test('quadratic weighted kappa, by hand', () => {
  // Pairs (1,1), (2,2), (3,4), (5,3) on 1 to 5. Disagreement weights (i - j)^2 / 16.
  // Observed: (0 + 0 + 1 + 4) / 16 over 4 pairs = 5/64.
  // Expected from the margins: first rater 1,2,3,5 (mean 2.75, variance 2.1875), second 1,2,4,3 (mean 2.5,
  // variance 1.25). Mean of (x - y)^2 over all 16 crossings = 2.1875 + 1.25 + 0.25^2 = 3.5, over 16 = 3.5/16.
  // Kappa = 1 - (5/64) / (3.5/16) = 1 - 1.25 / 3.5 = 0.642857.
  const k = weightedKappa([[1, 1], [2, 2], [3, 4], [5, 3]], [1, 2, 3, 4, 5]);
  near(k.kappa, 0.6429, 4, 'kappa');
  assert.equal(k.flag, null);
  // Full agreement with spread: no observed disagreement, so kappa is 1.
  assert.equal(weightedKappa([[1, 1], [4, 4]], [1, 2, 3, 4, 5]).kappa, 1);
  // Both raters always give 4: expected disagreement is 0.
  assert.deepEqual(weightedKappa([[4, 4], [4, 4]], [1, 2, 3, 4, 5]), { kappa: null, flag: 'kappa undefined: no spread' });
  assert.deepEqual(weightedKappa([], [1, 2, 3, 4, 5]), { kappa: null, flag: 'no pairs' });
  assert.throws(() => weightedKappa([[0, 1]], [1, 2, 3, 4, 5]), /category/);
});
