# How a Skills Bench round is analysed

`node apps/skills-bench/analyse.mjs <results folder> [--delta 0.15] [--write]` reads one results folder in the
`skills-bench-results/1` format and prints `REPORT.md` and then `summary.json`. With `--write` it writes both files
into that folder instead. `--delta` is the difference in mean score (0 to 1) that the plan for a full round should
detect; the default is 0.15. Exit 0 means done, 1 means the round could not be read, 2 means bad arguments.

The code is in `apps/skills-bench/lib/analysis/`: `read.mjs` reads and checks the folder, `stats.mjs` holds the
statistics, `summary.mjs` works out the numbers, `agreement.mjs` compares the judge with the owner, and `report.mjs`
writes the report. The tests are `tests/skills-bench-stats.test.mjs` (each statistic against a published value or
hand working) and `tests/skills-bench-analysis*.test.mjs` (a hand-written round in
`tests/fixtures/skills-bench/analysis/`).

## What is read, and what is left out

- `round.json` must have format `skills-bench-results/1`, a tasks list, and a difficulty of simple, medium or complex
  on every task. Without that the analysis stops.
- Each `<skill>/<task>/<variant>/<n>/result.json` must have format `skills-bench-run/1`, the skill, task, variant and
  n of its folder, whole micro-dollars in `costMicros`, seconds of 0 or more, a grade that is null or holds `pass`,
  `score` and `outcomeScore` (both 0 to 1), and a judge that is null or holds whole scores from 1 to 5. A file that
  fails is left out and listed under Problems in the report. The variant folders are with, without, broken and empty.
- `judge/<skill>/<task>.json` gives the cost of one judge call. `owner/map.json` and `owner/grades-<skill>.txt` give
  the owner's grades. The judge's verdict files are never read: the report holds no text a model wrote.

## Dropouts and flags

A run whose grade is null is a dropout. It counts in runs, cost and seconds, and never in pass rate, mean score or
mean outcome score. A run whose judge is null is left out of the judge mean. An arm with fewer than 2 graded runs gets
no interval and the flag "fewer than 2 graded runs". When neither arm of a Welch interval has any spread, the interval
is the point itself, flagged "no spread".

## Per task and variant

Runs, graded runs, dropouts, pass rate (passes over graded runs), mean score, mean outcome score, judge mean (each
run's criteria averaged first, then the runs), cost per run (mean and max), seconds per run (mean and max) and the
skill start rate (runs where the skill started, over runs that say).

Money is in whole micro-dollars. Sums stay whole; a mean cost is rounded up once, when it is reported, and the budget
is summed exactly (as fractions) and rounded up once at the end.

## With minus without, per task

- **Score: Welch t interval.** The difference in mean score, with the standard error
  `sqrt(s1^2 / n1 + s2^2 / n2)` and the Welch-Satterthwaite degrees of freedom
  `(s1^2/n1 + s2^2/n2)^2 / ((s1^2/n1)^2 / (n1 - 1) + (s2^2/n2)^2 / (n2 - 1))`, which are usually fractional. It does
  not assume the two arms have the same spread. Sources: B. L. Welch (1947), "The generalization of Student's problem
  when several different population variances are involved", Biometrika 34:28-35; F. E. Satterthwaite (1946),
  Biometrics Bulletin 2:110-114.
- **Pass rate: Newcombe hybrid score interval.** The difference of two proportions, with an interval built from the
  Wilson interval of each arm (`lower = d - sqrt((p1 - l1)^2 + (u2 - p2)^2)`,
  `upper = d + sqrt((u1 - p1)^2 + (p2 - l2)^2)`). It stays inside -1 to 1 and behaves at 0 of 3 and 3 of 3, where the
  textbook normal interval does not. Sources: R. G. Newcombe (1998), "Interval estimation for the difference between
  independent proportions: comparison of eleven methods", Statistics in Medicine 17:873-890, method 10; E. B. Wilson
  (1927), "Probable inference, the law of succession, and statistical inference", Journal of the American Statistical
  Association 22:209-212.

## Per skill, and per skill and difficulty

The unit is the task, not the run. For each task with graded runs in both arms, the difference is mean score with
minus mean score without. The skill's difference is the mean of those k differences, with a Student t interval on
k - 1 degrees of freedom (`mean +- t * sd / sqrt(k)`). k is the number of tasks that have both arms, so a task with
no graded run in one arm drops out of k. Source: Student (1908), "The probable error of a mean", Biometrika 6:1-25.

Per difficulty it is the same over that difficulty's tasks. With 2 tasks, df is 1 and t at 0.975 is 12.706, so the
interval is very wide. With 1 task there is no paired interval; the report shows that task's Welch interval and says
so. With 0 tasks it says "no task with both arms".

Control tasks count here with their with and without runs, like any other task.

## Controls

A control task is a task that has broken runs and empty runs (in the pilot, 2 of the 5 tdd tasks). For each one, and
pooled over the runs of all control tasks, on mean score:

- **broken minus with**, a Welch interval. It is as expected when its point estimate is below 0: a broken copy of the
  skill should do worse than the real one.
- **empty minus without**, a Welch interval. It is as expected when its interval includes 0: an empty skill should
  make no difference. Without an interval (fewer than 2 graded runs) the verdict is "not known".

The report also says whether each interval excludes 0. Pooling puts the runs of the control tasks together and
ignores which task each came from, so a difference between the tasks widens the pooled spread.

## Judge agreement with the owner

`owner/map.json` maps letters to runs (A to E tdd, F to J bug-fix). `owner/grades-<skill>.txt` is in the skill-eval
score format and is read with `parseScores` from `skills/verification/skill-eval/skill-eval-core.mjs`; every line it
cannot read is shown in the report, and so is every letter that has no run or no judge score. Criterion n in a grades
file is criterion n of that skill's judge scores. For each criterion, for each skill overall and for all skills:

- **Exact**: the share of pairs where the judge and the owner gave the same score.
- **Within one**: the share of pairs at most 1 apart.
- **Mean gap**: the mean absolute difference.
- **Weighted kappa** with quadratic weights `((i - j) / 4)^2` on the 1 to 5 scale:
  `1 - observed disagreement / disagreement expected from the two sets of margins`. 1 is full agreement, 0 is what
  chance gives. When the expected disagreement is 0 (both always give the same score) kappa is undefined and the
  report says "kappa undefined: no spread". Sources: J. Cohen (1968), "Weighted kappa", Psychological Bulletin
  70:213-220; J. L. Fleiss and J. Cohen (1973), Educational and Psychological Measurement 33:613-619, for the
  quadratic weights.
- Every pair 2 or more apart is listed, found with `disagreements` from the same skill-eval module.

A missing `map.json` or grades file gives "judge agreement not measured", not a failure.

## Recommendation for a full round

- **Spread**: the pooled within-arm standard deviation of score, over every with and without arm with 2 or more graded
  runs: `sqrt(sum((n - 1) s^2) / sum(n - 1))`. Broken and empty arms are left out, since a full round runs with and
  without only.
- **Runs per arm**: `n = ceil(2 (z_{1 - alpha/2} + z_power)^2 sd^2 / delta^2)` at alpha 0.05 and power 0.8, the
  normal formula for two independent means (for example S. Chow, J. Shao and H. Wang (2008), Sample Size
  Calculations in Clinical Research, 2nd edition, section 3.2). With sd 0.3 and delta 0.15 it gives 63. A t-based
  calculation, which puts t on `2n - 2` df in place of z and repeats until n settles, gives 64, so the normal formula
  runs about one run per arm low at this size. The plan never asks for fewer than 2 runs per arm.
- **Budget**: the same tasks as the round, with and without only, at that many runs per arm. Each run costs the
  observed mean cost per run of its difficulty (over with and without runs, dropouts included, since they cost money).
  A judge call labels runs with the letters A to Z, so it reviews 26 runs at most; each task needs
  `ceil(2n / 26)` calls at the observed mean cost per judge call. The total is summed exactly and rounded up once.

## Quantiles

- **Normal**: P. J. Acklam's rational approximation to the inverse normal distribution (relative error under
  1.15e-9). Checked against z(0.975) = 1.959964 and z(0.8) = 0.841621 from the normal tables in M. Abramowitz and
  I. A. Stegun (1964), Handbook of Mathematical Functions, chapter 26.
- **Student t**, for any df above 0, whole or fractional: the distribution function is
  `1 - I_{df / (df + t^2)}(df / 2, 1 / 2) / 2` for t above 0 (Abramowitz and Stegun, section 26.7), with the
  regularized incomplete beta function from its continued fraction and log gamma from the Lanczos approximation
  (W. H. Press and others, Numerical Recipes, sections 6.1 and 6.4). The quantile is found by bisection. Checked
  against the 0.975 column of the NIST/SEMATECH e-Handbook of Statistical Methods, table 1.3.6.7.2 (12.706 at df 1,
  4.303 at 2, 2.776 at 4, 2.228 at 10, 2.042 at 30), and at df 3.5 (2.9401) and 1000 (1.9623).

## Limits

- With 3 runs per arm, the Welch df are small and the intervals are wide; the per-difficulty intervals on df 1 are
  wider still. They are honest about how little 3 runs can show.
- The paired difference treats the tasks as a sample of tasks; 5 tasks per skill is a small sample.
- No correction is made for the number of intervals in the report. Read a single interval that excludes 0 among many
  with care.
- The judge-call count assumes one call reviews up to 26 runs of one task, as the A to Z letters allow.
