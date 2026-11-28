// The numbers of a Skills Bench round: per cell (task and variant), per task, per skill and difficulty, the controls,
// the judge agreement and the plan for a full round. apps/skills-bench/ANALYSIS.md describes each method.
import { DIFFICULTIES } from './read.mjs';
import { mean, sampleVariance, welchInterval, pairedInterval, newcombeDiff, runsPerArm, FEWER_RUNS } from './stats.mjs';
import { judgeAgreement } from './agreement.mjs';

export const LEVEL = 0.95;
export const ALPHA = 0.05;
export const POWER = 0.8;
// One judge call labels its runs with the letters A to Z (judgeLetter in result.json), so it reviews 26 at most.
export const RUNS_PER_JUDGE_CALL = 26;
const ARMS = ['with', 'without'];

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const maxOf = (xs) => (xs.length ? Math.max(...xs) : null);
// Money: sums stay whole micro-dollars; a mean is rounded up once, here.
const meanMicros = (total, count) => (count ? Math.ceil(total / count) : null);

/** The numbers of one task and variant. */
export function cellOf(runs) {
  const graded = runs.filter((r) => r.grade !== null);
  const scores = graded.map((r) => r.grade.score);
  const passes = graded.filter((r) => r.grade.pass).length;
  const judged = runs.filter((r) => r.judge !== null && Object.keys(r.judge).length).map((r) => mean(Object.values(r.judge)));
  // Dropouts count here; a run that never finished has no cost or seconds (null), so only recorded values count.
  const costs = runs.map((r) => r.costMicros).filter((x) => x !== null);
  const seconds = runs.map((r) => r.seconds).filter((x) => x !== null);
  const started = runs.filter((r) => typeof r.skillStarted === 'boolean');
  return {
    runs: runs.length,
    graded: graded.length,
    dropouts: runs.length - graded.length,
    passes,
    passRate: graded.length ? passes / graded.length : null,
    meanScore: mean(scores),
    meanOutcomeScore: mean(graded.map((r) => r.grade.outcomeScore)),
    judged: judged.length,
    judgeMean: mean(judged),
    costRuns: costs.length,
    costSumMicros: sum(costs),
    costMeanMicros: meanMicros(sum(costs), costs.length),
    costMaxMicros: maxOf(costs),
    secondsMean: mean(seconds),
    secondsMax: maxOf(seconds),
    skillStartRate: started.length ? started.filter((r) => r.skillStarted).length / started.length : null,
    scores,
    flag: graded.length < 2 ? FEWER_RUNS : null,
  };
}

function passDiff(a, b) {
  if (a.graded < 2 || b.graded < 2) {
    return { diff: a.graded && b.graded ? a.passRate - b.passRate : null, lo: null, hi: null, flag: FEWER_RUNS };
  }
  return newcombeDiff(a.passes, a.graded, b.passes, b.graded, LEVEL);
}

/** A control verdict: broken is as expected below 0, empty is as expected when its interval holds 0. */
function verdict(w, kind) {
  const hasInterval = w.lo !== null;
  const excludesZero = hasInterval ? w.lo > 0 || w.hi < 0 : null;
  let asExpected;
  if (kind === 'broken') asExpected = w.diff === null ? null : w.diff < 0;
  else asExpected = hasInterval ? w.lo <= 0 && w.hi >= 0 : null;
  return { ...w, excludesZero, asExpected };
}

function controlsOf(tasks, cell) {
  const list = tasks.filter((t) => t.control);
  const rows = list.map((t) => ({
    skill: t.skill,
    task: t.task,
    broken: verdict(welchInterval(cell(t, 'broken').scores, cell(t, 'with').scores, LEVEL), 'broken'),
    empty: verdict(welchInterval(cell(t, 'empty').scores, cell(t, 'without').scores, LEVEL), 'empty'),
  }));
  const pool = (variant) => list.flatMap((t) => cell(t, variant).scores);
  const pooled = list.length ? {
    broken: verdict(welchInterval(pool('broken'), pool('with'), LEVEL), 'broken'),
    empty: verdict(welchInterval(pool('empty'), pool('without'), LEVEL), 'empty'),
  } : null;
  return { tasks: rows, pooled };
}

function pairedOver(tasks) {
  const both = tasks.filter((t) => t.armsDiff !== null);
  return { tasks: both.map((t) => t.task), diffs: both.map((t) => t.armsDiff), ...pairedInterval(both.map((t) => t.armsDiff), LEVEL) };
}

function byDifficulty(tasks) {
  const out = {};
  for (const d of DIFFICULTIES) {
    const p = pairedOver(tasks.filter((t) => t.difficulty === d));
    if (p.k === 0) out[d] = { ...p, flag: 'no task with both arms' };
    else if (p.k === 1) {
      const only = tasks.find((t) => t.task === p.tasks[0]);
      out[d] = { ...p, flag: 'one task: no paired interval, its Welch interval is shown', welch: only.score };
    } else out[d] = p;
  }
  return out;
}

/** Sum of numerator / denominator terms, rounded up once, exactly (BigInt), so no float remainder adds a micro-dollar. */
function ceilOfSum(terms) {
  let num = 0n;
  let den = 1n;
  for (const [a, b] of terms) {
    num = num * BigInt(b) + BigInt(a) * den;
    den *= BigInt(b);
  }
  return Number((num + den - 1n) / den);
}

function recommendationOf(round, cells, judgeCalls, delta) {
  const arms = cells.filter((c) => ARMS.includes(c.variant));
  const usable = arms.filter((c) => c.graded >= 2);
  const out = { delta, alpha: ALPHA, power: POWER, level: LEVEL, runsPerJudgeCall: RUNS_PER_JUDGE_CALL };
  const costPerRun = {};
  for (const d of DIFFICULTIES) {
    const inD = arms.filter((c) => c.difficulty === d);
    const runs = sum(inD.map((c) => c.costRuns));
    const total = sum(inD.map((c) => c.costSumMicros));
    costPerRun[d] = { runs, sumMicros: total, meanMicros: meanMicros(total, runs) };
  }
  const judgeSum = sum(judgeCalls.map((j) => j.costMicros));
  out.costPerRun = costPerRun;
  out.judge = { calls: judgeCalls.length, sumMicros: judgeSum, meanMicros: meanMicros(judgeSum, judgeCalls.length) };
  if (!usable.length) {
    return { ...out, pooledSd: null, pooledDf: null, cellsUsed: 0, runsPerArm: null, fullRound: null, budgetMicros: null,
      flag: 'no with or without arm has 2 or more graded runs, so there is no spread to plan from' };
  }
  const pooledDf = sum(usable.map((c) => c.graded - 1));
  const pooledSd = Math.sqrt(sum(usable.map((c) => (c.graded - 1) * sampleVariance(c.scores))) / pooledDf);
  const computed = runsPerArm({ sd: pooledSd, delta, alpha: ALPHA, power: POWER });
  const n = Math.max(2, computed);
  const tasks = Object.fromEntries(DIFFICULTIES.map((d) => [d, round.tasks.filter((t) => t.difficulty === d).length]));
  const taskCount = sum(Object.values(tasks));
  const callsPerTask = Math.ceil((2 * n) / RUNS_PER_JUDGE_CALL);
  const fullRound = { tasks, runs: 2 * n * taskCount, judgeCalls: callsPerTask * taskCount };
  const missing = DIFFICULTIES.filter((d) => tasks[d] && !costPerRun[d].runs);
  let budgetMicros = null;
  let flag = computed < 2 ? 'no spread observed: 2 runs per arm is the least that gives an interval' : null;
  if (missing.length || !judgeCalls.length) {
    flag = `no budget: no observed cost for ${[...missing, ...(judgeCalls.length ? [] : ['the judge'])].join(', ')}`;
  } else {
    budgetMicros = ceilOfSum([
      ...DIFFICULTIES.filter((d) => tasks[d]).map((d) => [tasks[d] * 2 * n * costPerRun[d].sumMicros, costPerRun[d].runs]),
      [fullRound.judgeCalls * judgeSum, judgeCalls.length],
    ]);
  }
  return { ...out, pooledSd, pooledDf, cellsUsed: usable.length, runsPerArm: n, fullRound, budgetMicros, flag };
}

/** The whole analysis of what readResults returned. */
export function summarize({ round, runs, judgeCalls, owner, problems }, { delta = 0.15 } = {}) {
  const cells = [];
  const cellMap = new Map();
  const key = (skill, task, variant) => JSON.stringify([skill, task, variant]);
  const tasks = [];
  for (const t of round.tasks) {
    if (tasks.some((x) => x.skill === t.skill && x.task === t.task)) continue;
    const mine = runs.filter((r) => r.skill === t.skill && r.task === t.task);
    for (const variant of ['with', 'without', 'broken', 'empty']) {
      const rs = mine.filter((r) => r.variant === variant).sort((a, b) => a.n - b.n);
      if (!rs.length && !ARMS.includes(variant)) continue;
      const c = { skill: t.skill, task: t.task, difficulty: t.difficulty, variant, ...cellOf(rs) };
      cells.push(c);
      cellMap.set(key(t.skill, t.task, variant), c);
    }
    const w = cellMap.get(key(t.skill, t.task, 'with'));
    const wo = cellMap.get(key(t.skill, t.task, 'without'));
    const has = (v) => cellMap.get(key(t.skill, t.task, v))?.runs > 0;
    tasks.push({
      skill: t.skill,
      task: t.task,
      difficulty: t.difficulty,
      status: t.status ?? null,
      control: has('broken') && has('empty'),
      armsDiff: w.graded && wo.graded ? w.meanScore - wo.meanScore : null,
      score: welchInterval(w.scores, wo.scores, LEVEL),
      pass: passDiff(w, wo),
    });
  }
  const cell = (t, variant) => cellMap.get(key(t.skill, t.task, variant));
  const skills = [...new Set(tasks.map((t) => t.skill))].map((skill) => {
    const mine = tasks.filter((t) => t.skill === skill);
    return { skill, paired: pairedOver(mine), byDifficulty: byDifficulty(mine) };
  });
  return {
    format: 'skills-bench-summary/1',
    round: {
      roundId: round.roundId ?? null, startedAt: round.startedAt ?? null, endedAt: round.endedAt ?? null,
      model: round.model ?? null, judgeModel: round.judgeModel ?? null, claudeVersion: round.claudeVersion ?? null,
      auth: round.auth ?? null, currency: round.currency ?? null, capMicros: round.capMicros ?? null,
      spentMicros: round.spentMicros ?? null, n: round.n ?? null, calibration: round.calibration ?? null,
    },
    level: LEVEL,
    problems,
    cells,
    tasks,
    skills,
    controls: controlsOf(tasks, cell),
    agreement: judgeAgreement({ runs, owner }),
    recommendation: recommendationOf(round, cells, judgeCalls, delta),
  };
}
