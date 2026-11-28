// How grade.mjs grades a bug-fix run: the commit order from git, the cases where it cannot grade, and how it runs and
// reads the test files a run adds (names, counts, environment, limits). The task contract is checked in
// tests/skills-bench-tasks-bug-fix.test.mjs; the test files the cases write are in grade-cases.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import {
  TASKS, GRADER, TASK_IDS, MONTH, SLOW, cleanEnv, filesOf, isTest, makeRun, fixedRun, spawnGrade, grade, check, passes, git,
} from './fixtures/skills-bench/bug-fix/helpers.mjs';

test('the commit-order check reads the history from the root commit to HEAD', SLOW, async (t) => {
  const dir = join(TASKS, TASK_IDS[0]);
  const ref = filesOf(join(dir, 'reference'));
  const commitRun = (steps) => {
    const run = makeRun(dir);
    git(run, 'init', '-q');
    git(run, 'add', '-A');
    git(run, 'commit', '-q', '-m', 'Start');
    for (const [message, files] of steps) {
      for (const f of files) cpSync(join(dir, 'reference', f), join(run, f));
      git(run, 'add', '-A');
      git(run, 'commit', '-q', '-m', message);
    }
    return run;
  };
  const order = (run) => check(grade(dir, run), 'test-commit-first');

  await t.test('a test commit before the fix commit passes', () => {
    const c = order(commitRun([['Add a failing test', ref.filter(isTest)], ['Fix the cause', ref.filter((f) => !isTest(f))]]));
    assert.equal(c.pass, true, c.detail);
    assert.match(c.detail, /^commit 1 of 2 changes only tests; the first source change is commit 2$/);
  });

  await t.test('one commit with the test and the fix fails', () => {
    const c = order(commitRun([['Fix the cause with a test', ref]]));
    assert.equal(c.pass, false);
    assert.match(c.detail, /^no commit with only test changes comes before the first source change \(commit 1 of 1\)$/);
  });

  await t.test('a fix commit before the test commit fails', () => {
    const c = order(commitRun([['Fix the cause', ref.filter((f) => !isTest(f))], ['Add a test', ref.filter(isTest)]]));
    assert.equal(c.pass, false);
    assert.match(c.detail, /^no commit with only test changes comes before the first source change \(commit 1 of 2\)$/);
  });

  await t.test('commits left on another branch are not reachable from HEAD and fail', () => {
    const run = commitRun([]);
    git(run, 'checkout', '-q', '-b', 'side');
    for (const f of ref) cpSync(join(dir, 'reference', f), join(run, f));
    git(run, 'add', '-A');
    git(run, 'commit', '-q', '-m', 'Fix on a side branch');
    git(run, 'checkout', '-q', 'main');
    const c = order(run);
    assert.equal(c.pass, false);
    assert.equal(c.detail, 'no commits after the root commit on HEAD');
  });

  await t.test('every node --test and git call is under one deadline, here an injected 1 ms', () => {
    const r = grade(dir, commitRun([['Fix', ref]]), { BUG_FIX_GRADE_LIMITS: '{"budgetMs":1}' });
    const cut = 'the time budget ran out before this check';
    assert.deepEqual(r.checks.slice(0, 3).map((c) => [c.pass, c.detail]), [[false, `the reported symptom: ${cut}`],
      [false, `start's tests and the existing behaviour on the run's source: ${cut}`], [false, `a second symptom of the same cause: ${cut}`]]);
    assert.deepEqual([check(r, 'added-failing-test').pass, check(r, 'added-failing-test').detail],
      [false, `could not tell whether test/nights.test.mjs passes on the run: ${cut}`]);
    assert.equal(check(r, 'test-commit-first').detail, 'git could not read the history: the time budget ran out');
  });

  await t.test('no .git fails the check and the grader still exits 0', () => {
    const run = commitRun([['Fix', ref]]);
    rmSync(join(run, '.git'), { recursive: true, force: true });
    const c = order(run);
    assert.equal(c.pass, false);
    assert.equal(c.detail, 'the run folder has no .git');
  });
});

test('the grader exits 1 with a reason when it cannot grade', () => {
  const missing = spawnSync(process.execPath, [GRADER, '--task', join(TASKS, TASK_IDS[0])], { env: cleanEnv(), encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /^grade\.mjs: .*--run.*\n$/);
  const noRun = spawnSync(process.execPath, [GRADER, '--task', join(TASKS, TASK_IDS[0]), '--run', join(tempDir(), 'gone')], { env: cleanEnv(), encoding: 'utf8' });
  assert.equal(noRun.status, 1);
  assert.equal(noRun.stdout, '');
  assert.match(noRun.stderr, /^grade\.mjs: the run folder .* does not exist\n$/);
  const bad = spawnGrade(MONTH, makeRun(MONTH), { BUG_FIX_GRADE_LIMITS: '{"budget":1}' });
  assert.deepEqual([bad.status, bad.stdout], [1, '']);
  assert.equal(bad.stderr, 'grade.mjs: BUG_FIX_GRADE_LIMITS takes budgetMs, spawnMs and maxBuffer, each a whole number above 0\n');
});

test('grade.mjs reads the test files a run adds as Node does', SLOW, async (t) => {
  const added = (names, env) => check(grade(MONTH, fixedRun(...names), env), 'added-failing-test');
  await t.test('a file named test-.mjs is a test file', () => {
    assert.deepEqual(added(['test-.mjs']), { name: 'added-failing-test', kind: 'process', required: false, pass: true,
      detail: 'test-.mjs fails on start (1 failing) and passes on the run (1 passing)' });
  });
  await t.test('the counts come from the summary at the end, not from what a test prints', () => {
    assert.equal(added(['test/log.test.mjs']).detail, 'test/log.test.mjs fails on start (1 failing) and passes on the run (1 passing)');
  });
  await t.test('a run with a cancelled test does not pass, though nothing failed', () => {
    assert.deepEqual([added(['test/cancel.test.mjs']).detail], ['no added or changed test file fails on start and passes on the run: test/cancel.test.mjs']);
  });
  await t.test('tests run with TZ=UTC and LC_ALL=C whatever the grader was started with', () => {
    const env = { TZ: 'America/New_York', LC_ALL: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8' };
    assert.equal(added(['test/zone.test.mjs'], env).detail, 'test/zone.test.mjs fails on start (1 failing) and passes on the run (2 passing)');
  });
  await t.test('NODE_TEST_CONTEXT from a test runner above the grader does not reach its node --test', () => {
    assert.deepEqual(passes(grade(MONTH, makeRun(MONTH, 'reference'), { NODE_TEST_CONTEXT: 'child-v8' })), {
      'symptom-fixed': true, 'original-tests-pass': true, 'sibling-fixed': true, 'added-failing-test': true, 'test-commit-first': false, 'fix-size': true });
  });
  await t.test('a test cut off on start is unknown, not a failure', () => {
    assert.deepEqual(added(['test/slow.test.mjs'], { BUG_FIX_GRADE_LIMITS: '{"spawnMs":4000}' }), { name: 'added-failing-test', kind: 'process',
      required: false, pass: false, detail: 'could not tell whether test/slow.test.mjs fails on start: node --test test/slow.test.mjs timed out after 4s' });
  });
  await t.test('output over the buffer limit fails the check and the grader still grades', () => {
    const r = grade(MONTH, makeRun(MONTH), { BUG_FIX_GRADE_LIMITS: '{"maxBuffer":200}' });
    assert.equal(check(r, 'symptom-fixed').detail, 'the reported symptom: node --test printed more than 200 bytes of output');
    assert.equal(check(r, 'symptom-fixed').pass, false);
  });
  await t.test('the grader grades when started through a symlinked path', () => {
    const link = join(tempDir(), 'grade.mjs');
    symlinkSync(GRADER, link);
    assert.equal(grade(MONTH, makeRun(MONTH, 'reference'), {}, link).pass, true);
  });
  await t.test('comments and blank lines added to a source file are no code lines changed', () => {
    const run = makeRun(MONTH);
    const file = join(run, 'src', 'renewal.mjs');
    writeFileSync(file, `// Renewal dates.\n\n/*\n * Notes.\n */\n${readFileSync(file, 'utf8')}\n// End.\n`);
    assert.equal(check(grade(MONTH, run), 'fix-size').detail, '0 code lines changed (added plus removed; blank and comment lines not counted), limit 12');
  });
  await t.test('a node --test killed before its counts means the grader cannot grade', () => {
    const r = spawnGrade(MONTH, fixedRun('test/kill.test.mjs'));
    assert.deepEqual([r.status, r.stdout], [1, '']);
    assert.equal(r.stderr, 'grade.mjs: node --test test/kill.test.mjs printed no pass and fail counts (exit SIGKILL)\n');
  });
});
