// Judge agreement, REPORT.md and the command line of the Skills Bench analysis (apps/skills-bench/analyse.mjs), on
// the hand-written round in tests/fixtures/skills-bench/analysis. Runs that write work on a copy in a temp folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { readResults } from '../apps/skills-bench/lib/analysis/read.mjs';
import { summarize } from '../apps/skills-bench/lib/analysis/summary.mjs';

const FIXTURE = repo('tests', 'fixtures', 'skills-bench', 'analysis', '2026-11-28-pilot');
const CLI = repo('apps', 'skills-bench', 'analyse.mjs');
const SEPARATOR = '\n----- summary.json -----\n';

const near = (actual, expected, places, what) => {
  assert.equal(typeof actual, 'number', `${what}: ${actual} is not a number`);
  assert.ok(Math.abs(actual - expected) <= 0.5 * 10 ** -places, `${what}: ${actual} is not ${expected} to ${places} decimals`);
};
const copy = () => {
  const dir = join(tempDir('skills-bench-analysis-'), 'round');
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
};

// Copied from tests/style.test.mjs:18-28 (AI_PROSE is not exported there); keep the two lists the same.
const AI_PROSE = [
  ['AI vocabulary', /\b(delv(e|es|ed|ing)|pivotal|tapestry|testament|vibrant|intricate|interplay|garner(s|ed|ing)?|showcas(e|es|ed|ing)|foster(s|ed|ing)?|enduring|crucial(ly)?|additionally|enhanc(e|es|ed|ing|ement|ements))\b/i],
  ['marketing word', /\b(seamless(ly)?|cutting[- ]edge|game[- ]chang(er|ers|ing)|supercharg(e|es|ed|ing))\b/i],
  ['fancy "is"', /\b(serves? as|serving as|stands? as|boasts?)\b/i],
  ['"not just X but Y"', /\bnot (just|only|merely)\b[^.;:!?]{0,80}?\bbut\b/i],
  ['chatbot phrase', /\b(I hope this helps|let me know if|great question|absolutely right|happy to help)\b|\b(of course|certainly)!/i],
  ['filler', /\b(in order to|due to the fact that|it is important to note|it is worth noting|it'?s worth noting|needless to say)\b/i],
  ['fancy word', /\b(utili[sz](e|es|ed|ing|ation)|facilitat(e|es|ed|ing)|numerous)\b/i],
  ['"leverage" as a verb', /\bleverag(es|ed|ing)\b|\b(to|can|could|will|would|should|must|not|never|we|you|they|I) leverage\b/i],
];

test('judge agreement per criterion and overall, by hand', () => {
  const a = summarize(readResults(FIXTURE)).agreement;
  assert.equal(a.measured, true);
  const tdd = a.skills.find((x) => x.skill === 'tdd');
  // Criterion 1 pairs (judge, owner): A (1,1), B (2,2), C (3,4), D (5,3); E has no owner grade. Exact 2/4, within
  // one 3/4, mean gap (0 + 0 + 1 + 2) / 4. Kappa 0.6429 is the hand-worked case in skills-bench-stats.test.mjs.
  const [c1, c2, c3] = tdd.criteria;
  assert.deepEqual([c1.n, c1.text, c1.pairs, c1.exact, c1.withinOne, c1.meanAbsDiff], [1, 'A failing check is written before the code', 4, 0.5, 0.75, 0.75]);
  near(c1.kappa, 0.6429, 4, 'criterion 1 kappa');
  // Criterion 2: the same five scores on both sides: kappa 1.
  assert.deepEqual([c2.pairs, c2.exact, c2.kappa], [5, 1, 1]);
  // Criterion 3: judge 5, 2, 1, 4, 3 against the owner's 3 x 5. Gaps 2, 1, 2, 1, 0. The owner has no spread, so the
  // expected disagreement is the judge's variance 2 plus 0, the observed is (4 + 1 + 4 + 1 + 0) / 5 = 2: kappa 0.
  assert.deepEqual([c3.pairs, c3.exact, c3.withinOne], [5, 0.2, 0.6]);
  near(c3.meanAbsDiff, 1.2, 9, 'criterion 3 gap');
  near(c3.kappa, 0, 9, 'criterion 3 kappa');
  // Overall, 14 pairs: exact 8, within one 11, gaps sum 9. Judge mean 42/14 = 3, variance 148/14 - 9 = 22/14; owner
  // mean 41/14, variance 129/14 - (41/14)^2 = 125/196; expected 22/14 + 125/196 + 1/196 = 434/196; observed squared
  // gaps 15/14 = 210/196. Kappa 1 - 210/434 = 16/31.
  assert.deepEqual([tdd.overall.pairs, tdd.overall.exact, tdd.overall.withinOne], [14, 8 / 14, 11 / 14]);
  near(tdd.overall.meanAbsDiff, 9 / 14, 9, 'overall gap');
  near(tdd.overall.kappa, 16 / 31, 9, 'overall kappa');
  assert.deepEqual(tdd.disagreements, [
    { n: 1, label: 'D', judge: 5, mine: 3 }, { n: 3, label: 'A', judge: 5, mine: 3 }, { n: 3, label: 'C', judge: 1, mine: 3 }]);
  assert.deepEqual(tdd.problems, []);
  // bug-fix: full agreement; criterion 3 is 4 everywhere, so its kappa is undefined. Line 14 is not a score line.
  const bf = a.skills.find((x) => x.skill === 'bug-fix');
  assert.deepEqual(bf.criteria.map((c) => [c.kappa, c.kappaFlag]), [[1, null], [1, null], [null, 'kappa undefined: no spread']]);
  assert.deepEqual(bf.problems, ['owner/grades-bug-fix.txt line 14: a score without /5 is not read: K: 4  not a run in the map']);
  assert.deepEqual([a.overall.pairs, a.overall.exact], [29, 23 / 29]);
});

test('a missing owner file means "judge agreement not measured", not a failure', () => {
  const dir = copy();
  rmSync(join(dir, 'owner', 'grades-bug-fix.txt'));
  const a = summarize(readResults(dir)).agreement;
  assert.deepEqual(a.skills.find((x) => x.skill === 'bug-fix'), { skill: 'bug-fix', measured: false, note: 'judge agreement not measured: owner/grades-bug-fix.txt is missing' });
  assert.equal(a.skills.find((x) => x.skill === 'tdd').measured, true);
  rmSync(join(dir, 'owner'), { recursive: true });
  const none = runNode(CLI, { args: [dir] });
  assert.equal(none.code, 0, none.stderr);
  assert.match(none.stdout, /judge agreement not measured: owner\/map\.json is missing/);
});

test('without --write it prints REPORT.md and summary.json and writes nothing', () => {
  const dir = copy();
  const r = runNode(CLI, { args: [dir] });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.startsWith('# Skills Bench round 2026-11-28-pilot\n'), r.stdout.slice(0, 80));
  const [report, json] = r.stdout.split(SEPARATOR);
  assert.equal(JSON.parse(json).recommendation.budgetMicros, 69300009);
  assert.match(report, /## Recommendation for a full round/);
  assert.equal(existsSync(join(dir, 'REPORT.md')), false);
  assert.equal(existsSync(join(dir, 'summary.json')), false);
});

test('--write writes REPORT.md and summary.json into the folder; --delta changes the plan', () => {
  const dir = copy();
  const r = runNode(CLI, { args: [dir, '--write', '--delta', '0.3'] });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^wrote .*REPORT\.md\nwrote .*summary\.json\n$/);
  const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  assert.equal(summary.format, 'skills-bench-summary/1');
  assert.deepEqual([summary.recommendation.delta, summary.recommendation.runsPerArm], [0.3, 5]);
  assert.ok(readFileSync(join(dir, 'REPORT.md'), 'utf8').startsWith('# Skills Bench round 2026-11-28-pilot\n'));
});

test('REPORT.md shows the numbers, the flags, the controls and the owner file problems', () => {
  const dir = copy();
  assert.equal(runNode(CLI, { args: [dir, '--write'] }).code, 0);
  const report = readFileSync(join(dir, 'REPORT.md'), 'utf8');
  const lines = report.split('\n');
  const row = (start) => lines.find((l) => l.startsWith(start)) ?? `no line starts with ${start}`;
  assert.equal(row('| `tdd` | `parse-dates` | simple | with |'), '| `tdd` | `parse-dates` | simple | with | 3 | 3 | 0 | 0.667 | 0.800 | 0.400 | 3.78 | $0.100000, $0.100000 | 60.0, 60 | 1.00 |  |');
  assert.equal(row('| `bug-fix` | `retry-loop` | medium | without |'), '| `bug-fix` | `retry-loop` | medium | without | 3 | 1 | 2 | 0.000 | 0.400 | 0.200 | 3.00 | $0.200000, $0.200000 | 120.0, 120 | 0.00 | fewer than 2 graded runs |');
  assert.equal(row('| `tdd` | `parse-dates` | simple | no | 0.400 |'), '| `tdd` | `parse-dates` | simple | no | 0.400 | -0.053 to 0.853 | 4.00 | 0.667 | -0.059 to 0.939 |  |');
  assert.equal(row('| `tdd` | 5 |'), '| `tdd` | 5 | 0.320 | 0.216 to 0.424 | 4 |  |');
  assert.equal(row('| `tdd` | complex |'), '| `tdd` | complex | 1 | 0.300 | 0.073 to 0.527 (Welch) | 4.00 | one task: no paired interval, its Welch interval is shown |');
  assert.equal(row('| `bug-fix` | complex |'), '| `bug-fix` | complex | 0 | n/a | no interval | n/a | no task with both arms |');
  assert.equal(row('| `tdd` | `rate-limit` | broken minus with |'), '| `tdd` | `rate-limit` | broken minus with | -0.700 | -0.927 to -0.473 | yes | as expected |');
  assert.equal(row('| pooled | all controls | empty minus without |'), '| pooled | all controls | empty minus without | 0.000 | -0.163 to 0.163 | no | as expected |');
  assert.equal(row('| overall |'), '| overall |  | 14 | 57% | 79% | 0.64 | 0.516 |');
  assert.ok(report.includes('- `owner/grades-bug-fix.txt line 14: a score without /5 is not read: K: 4  not a run in the map`'));
  assert.ok(report.includes('- criterion 1, letter D: judge 5, owner 3'));
  assert.ok(report.includes('19 runs per arm'));
  assert.ok(report.includes('budget $69.300009'));
});

test('REPORT.md has no em or en dash and none of the AI prose words', () => {
  const dir = copy();
  assert.equal(runNode(CLI, { args: [dir, '--write'] }).code, 0);
  const report = readFileSync(join(dir, 'REPORT.md'), 'utf8');
  assert.ok(report.length > 2000);
  const dashes = report.split('\n').filter((l) => /[–—]/.test(l));
  assert.deepEqual(dashes, []);
  const hits = AI_PROSE.filter(([, re]) => re.test(report)).map(([label]) => label);
  assert.deepEqual(hits, []);
});

test('text from the round never brings a dash or a backtick into REPORT.md', () => {
  const dir = copy();
  const grades = join(dir, 'owner', 'grades-tdd.txt');
  writeFileSync(grades, readFileSync(grades, 'utf8').replace('Criterion 2: Each step is small', 'Criterion 2: Each step — small `x`'));
  assert.equal(runNode(CLI, { args: [dir, '--write'] }).code, 0);
  const report = readFileSync(join(dir, 'REPORT.md'), 'utf8');
  assert.ok(report.includes('| 2 | `Each step - small x` |'), report.split('\n').filter((l) => l.startsWith('| 2 |')).join('\n'));
  assert.ok(!/[–—]/.test(report));
});

test('a run with a score outside 0 to 1 is left out and listed', () => {
  const dir = copy();
  const f = join(dir, 'tdd', 'slugify', 'without', '3', 'result.json');
  const r = JSON.parse(readFileSync(f, 'utf8'));
  r.grade.score = 1.5;
  writeFileSync(f, JSON.stringify(r));
  const out = runNode(CLI, { args: [dir] });
  assert.equal(out.code, 0, out.stderr);
  assert.ok(out.stdout.includes('- `tdd/slugify/without/3/result.json: grade score 1.5 is not from 0 to 1; left out`'));
  assert.ok(out.stdout.includes('| `tdd` | `slugify` | simple | without | 2 | 2 | 0 |'));
});

test('an unfinished run with no cost and no seconds is a dropout, not a problem', () => {
  // The runner writes costMicros and seconds null when a run never finished (A1 FORMAT.md, lib/run/collect.mjs).
  const dir = copy();
  const f = join(dir, 'bug-fix', 'off-by-one', 'with', '3', 'result.json');
  const r = JSON.parse(readFileSync(f, 'utf8'));
  assert.deepEqual([r.finished, r.grade], [false, null]);
  writeFileSync(f, JSON.stringify({ ...r, costMicros: null, seconds: null }));
  const s = summarize(readResults(dir));
  assert.deepEqual(s.problems, []);
  const c = s.cells.find((x) => x.skill === 'bug-fix' && x.task === 'off-by-one' && x.variant === 'with');
  assert.deepEqual([c.runs, c.graded, c.dropouts, c.costMeanMicros, c.costMaxMicros, c.secondsMean, c.secondsMax], [3, 2, 1, 100000, 100000, 60, 60]);
  // The plan counts only runs with a cost: 23 simple runs, still 100000 each.
  assert.deepEqual(s.recommendation.costPerRun.simple, { runs: 23, sumMicros: 2300000, meanMicros: 100000 });
  // A finished run must still have both.
  writeFileSync(f, JSON.stringify({ ...r, finished: true, costMicros: null, seconds: 60 }));
  assert.deepEqual(readResults(dir).problems, ['bug-fix/off-by-one/with/3/result.json: costMicros null is not a whole number of micro-dollars; left out']);
});

test('an owner letter that maps to a run of another skill is not used', () => {
  // F is a bug-fix run (owner/map.json); scoring it in the tdd file must not add a pair to tdd's criterion 2.
  const dir = copy();
  const grades = join(dir, 'owner', 'grades-tdd.txt');
  writeFileSync(grades, readFileSync(grades, 'utf8').replace('  E: 3/5  mixed\n', '  E: 3/5  mixed\n  F: 4/5  not a tdd run\n'));
  const tdd = summarize(readResults(dir)).agreement.skills.find((x) => x.skill === 'tdd');
  assert.equal(tdd.criteria[1].pairs, 5);
  assert.deepEqual(tdd.problems, ['owner/grades-tdd.txt criterion 2, letter F: the map gives a bug-fix run']);
});

test('bad arguments and a bad round stop with a message', () => {
  const usage = runNode(CLI, { args: [] });
  assert.equal(usage.code, 2);
  assert.match(usage.stderr, /^Usage: node apps\/skills-bench\/analyse\.mjs <results folder> \[--delta 0\.15\] \[--write\]\n$/);
  for (const bad of [['0'], ['1.5'], ['abc'], []]) {
    const r = runNode(CLI, { args: [FIXTURE, '--delta', ...bad] });
    assert.equal(r.code, 2, `--delta ${bad}`);
    assert.match(r.stderr, /^--delta must be a number above 0 and at most 1\nUsage: /);
  }
  const unknown = runNode(CLI, { args: [FIXTURE, '--writ'] });
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /^unknown option --writ\nUsage: /);
  const empty = tempDir('skills-bench-analysis-');
  const missing = runNode(CLI, { args: [empty] });
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /^analyse: .*round\.json does not exist\n$/);
  writeFileSync(join(empty, 'round.json'), JSON.stringify({ format: 'skills-bench-results/2', tasks: [] }));
  const format = runNode(CLI, { args: [empty] });
  assert.equal(format.code, 1);
  assert.equal(format.stderr, 'analyse: round.json format is "skills-bench-results/2", not "skills-bench-results/1"\n');
});
