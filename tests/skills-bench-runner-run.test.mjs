// The skills-bench runner's run command with the fake claude: the start rule, the hard stop per difficulty, charges,
// resume, the result files, the process signals and the grader. Money is in micro-dollars: $0.20 is 200000.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';
import {
  runRound, readState, readResult, workers, readLog, copyTasks, patchTask, writeConfig, UNNAMED,
} from './skills-bench-runner.helpers.mjs';

const RESULT_KEYS = ['costMicros', 'denials', 'difficulty', 'exit', 'failedToolCalls', 'finished', 'format', 'grade', 'gradeError',
  'judge', 'judgeLetter', 'n', 'process', 'resultSubtype', 'roundId', 'runId', 'seconds', 'skill', 'skillStarted', 'task',
  'toolCalls', 'turns', 'variant'];

describe('the start rule and the hard stop', () => {
  test('stops before the cap is passed as costs rise, with a hard stop per difficulty that rises after a costly run', () => {
    // n 1, cap $6.00, judge reserve 6 x $0.05 = $0.30. In order:
    //   tdd-complex-a: 0 + 2 x $1.00 + 0.30 = 2.30, starts; its runs cost $0.90 each: spent 1.80, complex price now 0.90.
    //   fix-complex-a: 1.80 + 2 x $1.80 + 0.30 = 5.70, starts; $1.20 each: spent 4.20.
    //   tdd-simple-a (4 variants): 4.20 + 4 x $0.20 + 0.30 = 5.30, starts; $0.10 each: spent 4.60.
    //   tdd-medium-a: 4.60 + 2 x $0.40 + 0.30 = 5.70, starts; $0.50 each: spent 5.60, medium price now 0.50.
    //   fix-medium-a: 5.60 + 2 x $1.00 + 0.30 = 7.90, not run. fix-simple-a: 5.60 + 2 x $0.20 + 0.30 = 6.30, not run.
    const fake = { runs: { 'ledger-app/*': { cost: 0.9 }, 'task-board/*': { cost: 1.2 }, 'price-list/*': { cost: 0.1 }, 'order-book/*': { cost: 0.5 } } };
    const r = runRound({ maxUsd: '6', extra: ['--n', '1'], fake });
    assert.equal(r.code, 0, r.stderr);
    const s = readState(r.round);
    const status = Object.fromEntries(s.planned.map((id) => [id, s.tasks[id].status]));
    assert.deepEqual(status, {
      'tdd-complex-a': 'done', 'fix-complex-a': 'done', 'tdd-simple-a': 'done', 'tdd-medium-a': 'done',
      'fix-medium-a': 'not run (cap)', 'fix-simple-a': 'not run (cap)',
    });
    assert.equal(s.spentMicros, 5_600_000);
    assert.ok(s.spentMicros <= s.capMicros);
    const stops = Object.fromEntries(s.planned.map((id) => [id, s.tasks[id].hardStopMicros]));
    assert.deepEqual(stops, {
      'tdd-complex-a': 1_000_000, 'fix-complex-a': 1_800_000, 'tdd-simple-a': 200_000, 'tdd-medium-a': 400_000,
      'fix-medium-a': 1_000_000, 'fix-simple-a': 200_000,
    });
    assert.match(r.stdout, /^fix-medium-a: not run \(cap\): it needs \$7\.90 of the \$6\.00 cap \(2 runs at a \$1\.00 hard stop, plus the judge reserve\)$/m);
    const calls = workers(r.log);
    assert.equal(calls.length, 10);
    assert.deepEqual([...new Set(calls.map((c) => basename(c.cwd)))].sort(), ['ledger-app', 'order-book', 'price-list', 'task-board']);
    // Each run gets its task's hard stop as claude's own budget.
    for (const c of calls) {
      const budget = c.argv[c.argv.indexOf('--max-budget-usd') + 1];
      assert.equal(budget, { 'ledger-app': '1', 'task-board': '1.8', 'price-list': '0.2', 'order-book': '0.4' }[basename(c.cwd)]);
    }
  });

  test('charges a run with no result line its hard stop, and records the dropout', () => {
    const r = runRound({ extra: ['--only', 'fix-simple-a', '--n', '1'], fake: { runs: { 'word-count/with': { fail: true } } } });
    assert.equal(r.code, 0, r.stderr);
    const s = readState(r.round);
    assert.equal(s.calibration, true);
    const t = s.tasks['fix-simple-a'];
    assert.equal(t.status, 'done');
    assert.equal(t.runsMade, 2);
    assert.equal(t.dropouts.length, 1);
    // without: $0.05 from its result line; with: no result line, so its hard stop, 2 x $0.10.
    assert.equal(s.spentMicros, 250_000);
    const failed = readResult(r.round, 'bug-fix', 'fix-simple-a', 'with');
    assert.equal(failed.finished, false);
    assert.equal(failed.exit, 1);
    assert.equal(failed.costMicros, null);
    assert.equal(failed.resultSubtype, null);
    assert.equal(readResult(r.round, 'bug-fix', 'fix-simple-a', 'without').costMicros, 50_000);
  });

  test('records a task refused before any run started as failed, and charges nothing', () => {
    const r = runRound({ extra: ['--only', 'fix-simple-a', '--n', '1', '--pass-env', 'FAKE_BENCH_LOGGED_OUT'], env: { FAKE_BENCH_LOGGED_OUT: '1' } });
    assert.equal(r.code, 1);
    const s = readState(r.round);
    assert.equal(s.tasks['fix-simple-a'].status, 'failed');
    assert.match(s.tasks['fix-simple-a'].reason, /not logged in/);
    assert.equal(s.spentMicros, 0);
  });
});

describe('resume', () => {
  test('a second run on the same round skips the tasks that are done and starts the ones the cap held back', () => {
    // Reserve 2 x $0.05. fix-medium-a: 0 + 2 x $0.40 + 0.10 = 0.90, starts, costs 2 x $0.30. fix-simple-a: 0.60 + 0.40
    // + 0.10 = 1.10 passes the $1.00 cap. With a $2.00 cap the second run starts it: 2 x $0.05 more.
    const only = ['--only', 'fix-simple-a', '--only', 'fix-medium-a', '--n', '1'];
    const fake = { runs: { 'csv-tool/*': { cost: 0.3 } } };
    const first = runRound({ maxUsd: '1', extra: only, fake });
    assert.equal(first.code, 0, first.stderr);
    assert.equal(readState(first.round).tasks['fix-simple-a'].status, 'not run (cap)');
    const second = runRound({ round: first.round, maxUsd: '2', extra: only, fake });
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /^fix-medium-a: done before, skipped$/m);
    assert.deepEqual(workers(second.log).map((c) => basename(c.cwd)), ['word-count', 'word-count']);
    const s = readState(second.round);
    assert.equal(s.tasks['fix-simple-a'].status, 'done');
    assert.equal(s.spentMicros, 700_000);
    assert.equal(s.capMicros, 2_000_000);
    const other = runRound({ round: first.round, maxUsd: '2', extra: only, fake, env: {} });
    assert.equal(other.code, 0);
    assert.deepEqual(workers(other.log), [], 'a round that is all done runs nothing');
  });

  test('refuses to resume with another model or another set of tasks', () => {
    const first = runRound({ extra: ['--only', 'fix-simple-a', '--n', '1'] });
    assert.equal(first.code, 0, first.stderr);
    const r = runRound({ round: first.round, extra: ['--only', 'fix-medium-a', '--n', '1'] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^refused: this round plans fix-simple-a; resume it with the same --only$/m);
  });
});

// The untracked files under the folders a round could write to, before and after the rounds of this file.
const untracked = () => spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'tests/fixtures/skills-bench', 'apps/skills-bench'], { cwd: ROOT, encoding: 'utf8' })
  .stdout.split('\n').filter((l) => l.startsWith('??')).sort();
const before = untracked();

describe('the result of each run', () => {
  const r = runRound({ extra: ['--only', 'tdd-simple-a', '--n', '1'] });
  const s = readState(r.round);

  test('one result.json per run at <skill>/<task>/<variant>/<n>/, with the contract 3 fields', () => {
    assert.equal(r.code, 0, r.stderr);
    for (const v of ['with', 'without', 'broken', 'empty']) {
      const x = readResult(r.round, 'tdd', 'tdd-simple-a', v);
      assert.deepEqual(Object.keys(x).sort(), RESULT_KEYS);
      assert.equal(x.format, 'skills-bench-run/1');
      assert.equal(x.roundId, s.roundId);
      assert.match(s.roundId, /^\d{4}-\d{2}-\d{2}-[0-9a-f]{4}$/);
      assert.deepEqual([x.skill, x.task, x.difficulty, x.variant, x.n], ['tdd', 'tdd-simple-a', 'simple', v, 1]);
      assert.match(x.runId, /^[0-9a-f]{4}$/);
      assert.deepEqual([x.finished, x.exit, x.resultSubtype, x.costMicros, x.denials], [true, 0, 'success', 50_000, 0]);
      assert.equal(typeof x.seconds, 'number');
      assert.deepEqual([x.judge, x.judgeLetter], [null, null]);
    }
    assert.deepEqual(readdirSync(join(r.round, 'results', 'tdd', 'tdd-simple-a')).sort(), ['broken', 'empty', 'with', 'without']);
  });

  test('skillStarted is a Skill step that names the skill, and the process signals come from the edits and commands', () => {
    const w = readResult(r.round, 'tdd', 'tdd-simple-a', 'with');
    assert.equal(w.skillStarted, true);
    assert.deepEqual(w.process, { firstTestEditStep: 2, firstSourceEditStep: 4, failedCommandBeforeFirstSourceEdit: true });
    assert.deepEqual([w.toolCalls, w.failedToolCalls, w.turns], [5, 1, 6]);
    assert.equal(readResult(r.round, 'tdd', 'tdd-simple-a', 'broken').skillStarted, true);
    for (const v of ['without', 'empty']) {
      const x = readResult(r.round, 'tdd', 'tdd-simple-a', v);
      assert.equal(x.skillStarted, false, `${v}: a Skill step for another skill does not count`);
      assert.deepEqual(x.process, { firstTestEditStep: null, firstSourceEditStep: 2, failedCommandBeforeFirstSourceEdit: false });
    }
  });

  test('grades every run with the task grader, on a copy of the run folder, with machine paths replaced', () => {
    const g = readResult(r.round, 'tdd', 'tdd-simple-a', 'without');
    assert.equal(g.gradeError, null);
    assert.deepEqual([g.grade.pass, g.grade.score, g.grade.outcomeScore], [true, 0.5, 1]);
    assert.deepEqual(g.grade.checks[0], { name: 'made', kind: 'outcome', required: true, pass: true, detail: 'made.txt is in <project>' });
    for (const run of s.tasks['tdd-simple-a'].runs) {
      assert.ok(existsSync(join(run.dir, 'made.txt')), 'the run folder is kept');
      assert.ok(!existsSync(join(run.dir, 'graded.txt')), 'what the grader wrote stayed in its copy');
    }
  });

  test('a run gets the variables named with --pass-env and not an unnamed key-like one', () => {
    const calls = workers(r.log);
    assert.equal(calls.length, 4);
    for (const c of calls) {
      assert.ok(c.names.includes('FAKE_BENCH_ECHO'));
      assert.ok(!c.names.includes('ANTHROPIC_API_KEY'));
      assert.ok(!JSON.stringify(c).includes(UNNAMED));
    }
    assert.deepEqual(calls.map((c) => c.variant).sort(), ['broken', 'empty', 'with', 'without']);
  });

  test('records a grader that exits 1 as gradeError', () => {
    const tasksDir = copyTasks((d) => patchTask(d, 'bug-fix', 'fix-simple-a', (t) => ({ ...t, fixtureGrade: 'crash' })));
    const x = runRound({ config: writeConfig({ tasksDir }), extra: ['--only', 'fix-simple-a', '--n', '1'] });
    assert.equal(x.code, 0, x.stderr);
    const g = readResult(x.round, 'bug-fix', 'fix-simple-a', 'with');
    assert.equal(g.grade, null);
    assert.equal(g.gradeError, 'the grader exited 1: cannot grade this run: the task asks the grader to stop');
  });

  test('wrote nothing inside the repository', () => {
    assert.deepEqual(untracked(), before);
    assert.ok(readLog(r.log).length > 0);
  });
});
