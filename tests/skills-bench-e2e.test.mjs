// The Skills Bench end to end: one fake round through both command-line programs, bench.mjs (plan, run, judge,
// owner-sheet, owner-grades, export) and analyse.mjs, to prove that what the runner exports is what the analysis reads.
// The fake claude (tests/fixtures/skills-bench/runner/fake-claude.mjs) stands in for every model call, and the tasks
// are tests/fixtures/skills-bench/e2e/: tdd tally-simple (the control task, 4 variants), tally-medium and
// tally-complex, and bug-fix mend-simple, mend-medium and mend-complex, at n 1. Every file is written to temp folders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync, realpathSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repo, runNode, tempDir, removeAtExit } from './helpers.mjs';

const BENCH = repo('apps', 'skills-bench', 'bench.mjs');
const ANALYSE = repo('apps', 'skills-bench', 'analyse.mjs');
const FAKE = repo('tests', 'fixtures', 'skills-bench', 'runner', 'fake-claude.mjs');
const CONFIG = repo('tests', 'fixtures', 'skills-bench', 'e2e', 'pilot.json');
// The dummy key: set only in the children's environment. The fake judge also echoes it into its reply (through
// FAKE_BENCH_ECHO), so the export has a real copy of it to hide.
const KEY = 'sk-ant-placeholder-0000';
const PASS = ['--pass-env', 'FAKE_BENCH_CONFIG', 'FAKE_BENCH_ECHO', 'ANTHROPIC_API_KEY'];
const TASKS = {
  tdd: { simple: 'tally-simple', medium: 'tally-medium', complex: 'tally-complex' },
  'bug-fix': { simple: 'mend-simple', medium: 'mend-medium', complex: 'mend-complex' },
};
// The fake judge scores every criterion by the token a run left: with writes kiwi (5), without plum (2).
const JUDGE = { with: 5, without: 2 };
// How far the owner's score is from the judge's, by the letter's place in its skill (A to E, F to J): per criterion
// the gaps are 0, 1, 0, 2, 0, so exact is 3/5, within one 4/5 and the mean gap 3/5.
const GAPS = [0, 1, 0, 2, 0];
const LETTERS = { tdd: 'ABCDE', 'bug-fix': 'FGHIJ' };
const CRITERIA = { tdd: 3, 'bug-fix': 4 };
const MAX_BYTES = 20_000;

/** Every file under dir, as paths relative to it. */
const filesUnder = (dir) => readdirSync(dir, { recursive: true }).map(String)
  .filter((rel) => statSync(join(dir, rel)).isFile()).map((rel) => rel.split('\\').join('/')).sort();
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

test('a fake round goes through plan, run, judge, the owner sheet, export and the analysis', { timeout: 300_000 }, async (t) => {
  // A neutral prefix: skill-eval refuses a meta word in a working folder path.
  const work = tempDir('ferry-');
  const round = join(work, 'round');
  const sheet = join(work, 'sheet');
  const out = join(work, 'out');
  const fakeConfig = join(work, 'fake.json');
  // Exactly one run drops out: the fake exits with no result line for the control task's empty run (slug coin-jar).
  writeFileSync(fakeConfig, JSON.stringify({ runs: { 'coin-jar/empty': { fail: true } } }));
  const env = { SKILL_EVAL_CLAUDE: FAKE, FAKE_BENCH_CONFIG: fakeConfig, FAKE_BENCH_ECHO: KEY, ANTHROPIC_API_KEY: KEY };
  const bench = (...args) => runNode(BENCH, { args, env });
  const ok = (r, what) => assert.equal(r.code, 0, `${what} exited ${r.code}:\n${r.stdout}\n${r.stderr}`);

  await t.test('plan prints the totals worked out by hand', () => {
    // Runs at n 1: tally-simple 4 variants, the other five tasks 2 each: 4 + 5 x 2 = 14. One judge call per task: 6.
    // Estimate: simple 6 runs x $0.10 + medium 4 x $0.20 + complex 4 x $0.50 + 6 judge calls x $0.05 = $3.70.
    const r = bench('plan', '--config', CONFIG, '--model', 'fake-model');
    ok(r, 'plan');
    assert.match(r.stdout, /^Runs: 14$/m);
    assert.match(r.stdout, /^Judge calls: 6$/m);
    assert.match(r.stdout, /^Estimate: \$3\.70$/m);
    assert.match(r.stdout, /^Cap: \$20\.00$/m);
  });

  await t.test('run makes every run and records the one dropout', () => {
    const r = bench('run', '--config', CONFIG, '--model', 'fake-model', '--round', round, '--max-usd', '20', ...PASS);
    if (existsSync(join(round, 'round.json'))) for (const x of Object.values(readJson(join(round, 'round.json')).tasks)) if (x.root) removeAtExit(x.root);
    ok(r, 'run');
    assert.match(r.stdout, /^tally-simple: done, 4 runs, 1 dropouts, /m);
    const res = readJson(join(round, 'results', 'tdd', 'tally-simple', 'empty', '1', 'result.json'));
    assert.equal(res.finished, false);
    assert.equal(res.grade, null);
    assert.equal(res.gradeError, 'the run did not finish');
  });

  await t.test('judge scores every task', () => {
    ok(bench('judge', '--round', round, '--judge-model', 'fake-judge', ...PASS), 'judge');
  });

  await t.test('the owner sheet and the owner grades are read back', () => {
    ok(bench('owner-sheet', '--round', round, '--out', sheet, '--seed', '11'), 'owner-sheet');
    const map = readJson(join(round, 'owner', 'map.json'));
    for (const [skill, letters] of Object.entries(LETTERS)) {
      const blank = readFileSync(join(sheet, `grades-${skill}.txt`), 'utf8');
      const filled = blank.replace(/^ {2}([A-J]): \?\/5 {2}<your reason>$/gm, (line, L) => {
        const m = map[L];
        // The judge's score for this run is the one worked out by hand from the fake.
        const judged = readJson(join(round, 'results', m.skill, m.task, m.variant, String(m.n), 'result.json')).judge;
        assert.deepEqual(Object.values(judged), Array(CRITERIA[skill]).fill(JUDGE[m.variant]), `${L} is ${m.task}/${m.variant}`);
        const gap = GAPS[letters.indexOf(L)];
        const mine = JUDGE[m.variant] === 5 ? 5 - gap : JUDGE[m.variant] + gap;
        return `  ${L}: ${mine}/5  read it`;
      });
      assert.doesNotMatch(filled, /\?\/5/);
      writeFileSync(join(work, `grades-${skill}.txt`), filled);
    }
    ok(bench('owner-grades', '--round', round, '--tdd', join(work, 'grades-tdd.txt'), '--bug-fix', join(work, 'grades-bug-fix.txt')), 'owner-grades');
  });

  await t.test('export writes the round with no machine path, no key and no file over the size limit', () => {
    // The round itself holds the key, in the judge's reply, so the export has something to hide.
    assert.ok(readFileSync(join(round, 'judge', 'tdd', 'tally-simple.verdict.txt'), 'utf8').includes(KEY));
    const r = bench('export', '--round', round, '--to', out, '--auth', 'unknown');
    ok(r, 'export');
    const files = filesUnder(out);
    // round.json, 14 result files, 6 judge files and 6 verdicts, the map and 2 grades files: 1 + 14 + 12 + 3 = 30.
    assert.equal(files.length, 30);
    assert.match(r.stdout, /: 30 files$/m);
    const own = [work, realpathSync(work), tmpdir(), realpathSync(tmpdir())];
    for (const rel of files) {
      const body = readFileSync(join(out, rel), 'utf8');
      assert.doesNotMatch(body, /\/(?:tmp|root|var\/folders|private\/var)/, `${rel} holds a machine path`);
      for (const p of own) assert.ok(!body.includes(p), `${rel} holds ${p}`);
      assert.ok(!body.includes(KEY), `${rel} holds the key`);
      assert.ok(Buffer.byteLength(body) <= MAX_BYTES, `${rel} is ${Buffer.byteLength(body)} bytes`);
    }
    const dropout = readJson(join(out, 'tdd', 'tally-simple', 'empty', '1', 'result.json'));
    assert.equal(dropout.grade, null);
    assert.equal(dropout.gradeError, 'the run did not finish');
    const exported = readJson(join(out, 'round.json'));
    const difficulty = Object.fromEntries(exported.tasks.map((x) => [x.task, x.difficulty]));
    for (const byD of Object.values(TASKS)) for (const [d, id] of Object.entries(byD)) assert.equal(difficulty[id], d);
  });

  await t.test('the analysis reads the export', () => {
    const r = runNode(ANALYSE, { args: [out, '--write'] });
    ok(r, 'analyse');
    const summary = readJson(join(out, 'summary.json'));
    assert.deepEqual(summary.problems, []);

    // The dropout: one run, no graded run, one dropout; every other cell has none.
    const cell = (skill, task, variant) => summary.cells.find((c) => c.skill === skill && c.task === task && c.variant === variant);
    const empty = cell('tdd', 'tally-simple', 'empty');
    assert.equal(empty.runs, 1);
    assert.equal(empty.dropouts, 1);
    assert.equal(empty.graded, empty.runs - 1);
    assert.deepEqual(summary.cells.filter((c) => c.dropouts).map((c) => `${c.task}/${c.variant}`), ['tally-simple/empty']);
    assert.equal(summary.cells.length, 14);

    // Per difficulty, from the exported difficulty field: each holds its one task of the fixture.
    for (const [skill, byD] of Object.entries(TASKS)) {
      const s = summary.skills.find((x) => x.skill === skill);
      assert.deepEqual(Object.keys(s.byDifficulty).sort(), Object.keys(byD).sort());
      for (const [d, id] of Object.entries(byD)) assert.deepEqual(s.byDifficulty[d].tasks, [id], `${skill} ${d}`);
    }

    // Judge agreement, worked out by hand from GAPS: per criterion 5 pairs, exact 3/5, within one 4/5, mean gap 3/5.
    const a = summary.agreement;
    assert.ok(a, 'summary.json has an agreement section');
    assert.equal(a.measured, true);
    assert.equal(a.note, null);
    const hand = { exact: 0.6, withinOne: 0.8, meanAbsDiff: 0.6 };
    for (const [skill, count] of Object.entries(CRITERIA)) {
      const k = a.skills.find((x) => x.skill === skill);
      assert.equal(k.measured, true);
      assert.deepEqual(k.problems, []);
      assert.equal(k.criteria.length, count);
      for (const c of k.criteria) {
        assert.equal(c.pairs, 5);
        assert.deepEqual({ exact: c.exact, withinOne: c.withinOne, meanAbsDiff: c.meanAbsDiff }, hand, `${skill} criterion ${c.n}`);
      }
      assert.equal(k.overall.pairs, 5 * count);
      assert.deepEqual({ exact: k.overall.exact, withinOne: k.overall.withinOne, meanAbsDiff: k.overall.meanAbsDiff }, hand);
      // The fourth letter is 2 away on every criterion.
      assert.deepEqual(k.disagreements.map((d) => d.label), Array(count).fill(LETTERS[skill][3]));
    }
    assert.equal(a.overall.pairs, 35);
    assert.deepEqual({ exact: a.overall.exact, withinOne: a.overall.withinOne, meanAbsDiff: a.overall.meanAbsDiff }, hand);

    // The control verdicts, for the control task.
    assert.deepEqual(summary.controls.tasks.map((x) => `${x.skill}/${x.task}`), ['tdd/tally-simple']);
    // The fixture grader gives with and broken 1 (made.txt and a test file), so broken minus with is 0; the empty
    // run dropped out, so empty minus without has no difference.
    const control = summary.controls.tasks[0];
    assert.equal(control.broken.diff, 0);
    assert.equal(control.empty.diff, null);
    const report = readFileSync(join(out, 'REPORT.md'), 'utf8');
    assert.match(report, /^## Controls$/m);
    assert.match(report, /^\| `tdd` \| `tally-simple` \| broken minus with \|/m);
    assert.match(report, /^## Judge agreement with the owner's grades$/m);
    assert.doesNotMatch(report, /[\u2013\u2014]/);
  });
});
