// Statistics for the Skills Bench analysis, Node.js standard library only. apps/skills-bench/ANALYSIS.md says what
// each one does and where it comes from; tests/skills-bench-stats.test.mjs checks them against published values.

export const FEWER_RUNS = 'fewer than 2 graded runs';
export const NO_SPREAD = 'no spread';

const allEqual = (xs) => xs.every((x) => x === xs[0]);

export function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Variance with n - 1 in the denominator; null below 2 values, exactly 0 when every value is the same. */
export function sampleVariance(xs) {
  if (xs.length < 2) return null;
  if (allEqual(xs)) return 0;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

const checkP = (p) => {
  if (!(p > 0 && p < 1)) throw new RangeError(`p must be between 0 and 1, got ${p}`);
};

// Acklam's rational approximation to the inverse normal distribution, relative error under 1.15e-9.
const A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
const C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
const P_LOW = 0.02425;

const poly = (cs, x) => cs.reduce((acc, c) => acc * x + c, 0);

function lowerTail(p) {
  const q = Math.sqrt(-2 * Math.log(p));
  return poly(C, q) / (poly(D, q) * q + 1);
}

/** The standard normal quantile: the z with P(Z <= z) = p. */
export function normalQuantile(p) {
  checkP(p);
  if (p === 0.5) return 0;
  if (p < P_LOW) return lowerTail(p);
  if (p > 1 - P_LOW) return -lowerTail(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (poly(A, r) * q) / (poly(B, r) * r + 1);
}

// Lanczos approximation to log Gamma (g = 7, 9 terms), as in Numerical Recipes.
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

function logGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const y = x - 1;
  let a = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (y + i);
  const t = y + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a);
}

// The continued fraction for the incomplete beta function (Numerical Recipes, betacf, modified Lentz).
function betaFraction(a, b, x) {
  const tiny = 1e-300;
  const clampTiny = (v) => (Math.abs(v) < tiny ? tiny : v);
  let c = 1;
  let d = 1 / clampTiny(1 - ((a + b) * x) / (a + 1));
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 / clampTiny(1 + aa * d);
    c = clampTiny(1 + aa / c);
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 / clampTiny(1 + aa * d);
    c = clampTiny(1 + aa / c);
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < 1e-15) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b). */
function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaFraction(a, b, x)) / a : 1 - (front * betaFraction(b, a, 1 - x)) / b;
}

/** P(T <= t) for Student's t with df degrees of freedom: the tail is I_{df / (df + t^2)}(df / 2, 1 / 2) / 2. */
function tCdf(t, df) {
  const tail = 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/** The Student t quantile for any df above 0, whole or fractional, found by bisection on the distribution function. */
export function tQuantile(p, df) {
  checkP(p);
  if (!(df > 0)) throw new RangeError(`df must be above 0, got ${df}`);
  if (df === Infinity) return normalQuantile(p);
  if (p === 0.5) return 0;
  if (p < 0.5) return -tQuantile(1 - p, df);
  let lo = 0;
  let hi = 1;
  while (tCdf(hi, df) < p) { lo = hi; hi *= 2; }
  for (let i = 0; i < 200 && hi - lo > 1e-13 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const upper = (level) => 1 - (1 - level) / 2;

/** Mean of a minus mean of b with a Welch t interval on the Welch-Satterthwaite df. */
export function welchInterval(a, b, level = 0.95) {
  const diff = a.length && b.length ? mean(a) - mean(b) : null;
  if (a.length < 2 || b.length < 2) return { diff, lo: null, hi: null, df: null, flag: FEWER_RUNS };
  const va = sampleVariance(a) / a.length;
  const vb = sampleVariance(b) / b.length;
  if (va + vb === 0) return { diff, lo: diff, hi: diff, df: null, flag: NO_SPREAD };
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const half = tQuantile(upper(level), df) * Math.sqrt(va + vb);
  return { diff, lo: diff - half, hi: diff + half, df, flag: null };
}

/** The mean of paired differences with a t interval on k - 1 df. */
export function pairedInterval(diffs, level = 0.95) {
  const k = diffs.length;
  const m = mean(diffs);
  if (k < 2) return { k, mean: m, lo: null, hi: null, df: null, flag: k ? 'fewer than 2 tasks' : 'no tasks' };
  const v = sampleVariance(diffs);
  if (v === 0) return { k, mean: m, lo: m, hi: m, df: k - 1, flag: NO_SPREAD };
  const half = tQuantile(upper(level), k - 1) * Math.sqrt(v / k);
  return { k, mean: m, lo: m - half, hi: m + half, df: k - 1, flag: null };
}

const checkCount = (k, n) => {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || k > n) throw new RangeError(`k must be a whole number from 0 to n, got ${k} of ${n}`);
};

/** The Wilson score interval for k successes in n. */
export function wilsonInterval(k, n, level = 0.95) {
  checkCount(k, n);
  if (!n) return { p: null, lo: null, hi: null };
  const z = normalQuantile(upper(level));
  const z2 = z * z;
  const p = k / n;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z / (1 + z2 / n)) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { p, lo: k === 0 ? 0 : Math.max(0, centre - half), hi: k === n ? 1 : Math.min(1, centre + half) };
}

/** k1/n1 minus k2/n2 with Newcombe's hybrid score interval (method 10), built from the two Wilson intervals. */
export function newcombeDiff(k1, n1, k2, n2, level = 0.95) {
  checkCount(k1, n1);
  checkCount(k2, n2);
  if (!n1 || !n2) return { diff: null, lo: null, hi: null, flag: 'no runs' };
  const w1 = wilsonInterval(k1, n1, level);
  const w2 = wilsonInterval(k2, n2, level);
  const diff = w1.p - w2.p;
  return {
    diff,
    lo: diff - Math.sqrt((w1.p - w1.lo) ** 2 + (w2.hi - w2.p) ** 2),
    hi: diff + Math.sqrt((w1.hi - w1.p) ** 2 + (w2.p - w2.lo) ** 2),
    flag: null,
  };
}

/** Runs per arm to detect delta: ceil(2 (z_{1 - alpha/2} + z_power)^2 sd^2 / delta^2), the normal formula. */
export function runsPerArm({ sd, delta, alpha = 0.05, power = 0.8 }) {
  if (!(sd >= 0)) throw new RangeError(`sd must be 0 or more, got ${sd}`);
  if (!(delta > 0)) throw new RangeError(`delta must be above 0, got ${delta}`);
  const z = normalQuantile(1 - alpha / 2) + normalQuantile(power);
  return Math.ceil((2 * z * z * sd * sd) / (delta * delta));
}

/** Cohen's weighted kappa with quadratic weights over ordered categories; pairs are [first rater, second rater]. */
export function weightedKappa(pairs, categories) {
  const index = new Map(categories.map((c, i) => [c, i]));
  const last = categories.length - 1;
  const weight = (i, j) => ((i - j) / last) ** 2;
  if (!pairs.length) return { kappa: null, flag: 'no pairs' };
  const rows = new Array(categories.length).fill(0);
  const cols = new Array(categories.length).fill(0);
  let observed = 0;
  for (const [a, b] of pairs) {
    if (!index.has(a) || !index.has(b)) throw new RangeError(`a pair (${a}, ${b}) has a value that is not a category`);
    const i = index.get(a);
    const j = index.get(b);
    rows[i]++;
    cols[j]++;
    observed += weight(i, j);
  }
  let expected = 0;
  for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) expected += (rows[i] * cols[j] * weight(i, j)) / pairs.length;
  if (expected === 0) return { kappa: null, flag: 'kappa undefined: no spread' };
  return { kappa: 1 - observed / expected, flag: null };
}
