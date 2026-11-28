// Self-check for the Skills Bench bug-fix tasks in apps/skills-bench/tasks/bug-fix: every task keeps the task
// contract, and grade.mjs tells the start, the reference fix and the three wrong fixes apart. Each task folder holds
// task.json, prompt.txt, start/ (what a run gets) and folders a run never sees: hidden/ (the grader's tests),
// reference/ (the fix plus a regression test), symptom-patch/, edited-test/ and long-fix/ (overlays on start/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tempDir } from './helpers.mjs';
import { findMetaWords, validateRubric, withoutComments } from '../skills/verification/skill-eval/skill-eval-core.mjs';

const TASKS = join(ROOT, 'apps', 'skills-bench', 'tasks', 'bug-fix');
const GRADER = join(TASKS, 'grade.mjs');
const TASK_IDS = readdirSync(TASKS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const OVERLAYS = ['reference', 'symptom-patch', 'edited-test', 'long-fix'];
const HIDDEN = ['symptom.test.mjs', 'sibling.test.mjs', 'existing.test.mjs'];
const ALLOW_TOOLS = ['Bash(npm test)', 'Bash(npm test *)', 'Bash(node *)', 'Bash(git *)'];
// The checks grade.mjs prints, in order: [name, kind, required].
const CHECKS = [
  ['symptom-fixed', 'outcome', true],
  ['original-tests-pass', 'outcome', true],
  ['sibling-fixed', 'outcome', false],
  ['added-failing-test', 'process', false],
  ['test-commit-first', 'process', false],
  ['fix-size', 'process', false],
];
// Source size by difficulty: modules are non-test source files outside bin/; lines are the non-blank lines of every
// non-test source file, bin/ included.
const SIZE = {
  simple: { modules: [1, 1], lines: [30, 80] },
  medium: { modules: [2, 3], lines: [100, 250] },
  complex: { modules: [5, 99], lines: [400, 800] },
};
const SLOW = { timeout: 180_000 };

const cleanEnv = () => {
  const env = { ...process.env, TZ: 'UTC', LC_ALL: 'C' };
  delete env.NODE_TEST_CONTEXT;
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return env;
};

/** Every entry under dir, as { rel, abs, stat } with lstat, folders before their contents. */
function walk(dir, rel = '') {
  const out = [];
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    const stat = lstatSync(join(dir, r));
    out.push({ rel: r, abs: join(dir, r), stat });
    if (stat.isDirectory()) out.push(...walk(dir, r));
  }
  return out;
}
const filesOf = (dir) => (existsSync(dir) ? walk(dir).filter((e) => e.stat.isFile()).map((e) => e.rel) : []);
const isTest = (rel) => rel.split('/').includes('test') || /\.test\.m?js$/.test(rel);
const isSource = (rel) => /\.(c|m)?js$/.test(rel) && !isTest(rel);

function hashTree(dir) {
  const h = createHash('sha256');
  for (const e of walk(dir)) {
    h.update(`${e.rel}\0${e.stat.isDirectory() ? 'dir' : 'file'}\0`);
    if (e.stat.isFile()) h.update(readFileSync(e.abs));
  }
  return h.digest('hex');
}

/** A run folder: a copy of start/ with the named overlays laid over it at the same paths. */
function makeRun(taskDir, ...overlays) {
  const dir = tempDir('bug-fix-run-');
  cpSync(join(taskDir, 'start'), dir, { recursive: true });
  for (const o of overlays) cpSync(join(taskDir, o), dir, { recursive: true });
  return dir;
}

/** node --test on the given files in dir; the TAP counts and the exit status. */
function nodeTest(dir, files) {
  assert.ok(files.length > 0, `no test files to run in ${dir}`);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: dir, env: cleanEnv(), encoding: 'utf8', timeout: 60_000 });
  const count = (w) => Number((new RegExp(`^# ${w} (\\d+)$`, 'm').exec(r.stdout) || [])[1] ?? NaN);
  return { status: r.status, pass: count('pass'), fail: count('fail'), out: r.stdout };
}

/** Run the grader on a task and a run folder; asserts one JSON line, exit 0, and both folders unchanged. */
function grade(taskDir, runDir) {
  const before = [hashTree(taskDir), hashTree(runDir)];
  const r = spawnSync(process.execPath, [GRADER, '--task', taskDir, '--run', runDir], { env: cleanEnv(), encoding: 'utf8', timeout: 300_000 });
  assert.equal(r.status, 0, `grader exit ${r.status}: ${r.stderr}`);
  const lines = r.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `the grader printed ${lines.length} lines:\n${r.stdout}`);
  assert.ok(r.stdout.endsWith('}\n'), 'one JSON line ending in a newline');
  const result = JSON.parse(lines[0]);
  assert.deepEqual([hashTree(taskDir), hashTree(runDir)], before, 'the grader changed the task or the run folder');
  assert.deepEqual(result.checks.map((c) => [c.name, c.kind, c.required]), CHECKS);
  for (const c of result.checks) assert.ok(typeof c.pass === 'boolean' && typeof c.detail === 'string' && c.detail, `${c.name}: ${JSON.stringify(c)}`);
  assert.equal(result.pass, result.checks.every((c) => !c.required || c.pass));
  assert.equal(result.score, result.checks.filter((c) => c.pass).length / result.checks.length);
  return result;
}
const check = (result, name) => result.checks.find((c) => c.name === name);
const passes = (result) => Object.fromEntries(result.checks.map((c) => [c.name, c.pass]));

function git(dir, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=Bench Runner', '-c', 'user.email=runner@example.com', '-c', 'commit.gpgsign=false',
    '-c', 'init.defaultBranch=main', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir, env: cleanEnv(), encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

test('the tasks are 2 simple, 2 medium and 1 complex', () => {
  const count = { simple: 0, medium: 0, complex: 0 };
  for (const id of TASK_IDS) count[JSON.parse(readFileSync(join(TASKS, id, 'task.json'), 'utf8')).difficulty]++;
  assert.deepEqual(count, { simple: 2, medium: 2, complex: 1 });
});

test('the rubric is 3 to 6 numbered criteria and comments, nothing else, and skill-eval accepts it', () => {
  const text = readFileSync(join(TASKS, 'rubric.md'), 'utf8');
  assert.deepEqual(validateRubric(text), []);
  const lines = withoutComments(text).split('\n').filter((l) => l.trim());
  assert.ok(lines.length >= 3 && lines.length <= 6, `${lines.length} lines`);
  for (const l of lines) assert.match(l, /^\d+\. \S/);
  assert.deepEqual(findMetaWords(withoutComments(text), { allow: ['test'] }), []);
});

for (const id of TASK_IDS) {
  const dir = join(TASKS, id);
  test(`bug-fix task ${id}`, SLOW, async (t) => {
    const task = JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8'));
    const start = join(dir, 'start');
    const startFiles = filesOf(start);

    await t.test('task.json keeps the contract', () => {
      assert.equal(task.id, id);
      assert.match(id, /^[a-z0-9-]+$/);
      assert.equal(task.skill, 'bug-fix');
      assert.ok(Object.hasOwn(SIZE, task.difficulty), task.difficulty);
      assert.match(task.slug, /^[A-Za-z0-9-]+$/);
      assert.ok(typeof task.summary === 'string' && task.summary.length > 20 && !task.summary.includes('\n'));
      assert.deepEqual(task.allowTools, ALLOW_TOOLS);
      assert.deepEqual(task.allowWords, ['test']);
      assert.equal(task.timeoutMin, task.difficulty === 'complex' ? 30 : 15);
      assert.equal(task.control, false);
      assert.ok(Number.isInteger(task.maxFixLines) && task.maxFixLines > 0, `maxFixLines ${task.maxFixLines}`);
      for (const f of ['prompt.txt', 'start/package.json', ...HIDDEN.map((h) => `hidden/${h}`)]) assert.ok(existsSync(join(dir, f)), f);
      for (const o of OVERLAYS) assert.ok(filesOf(join(dir, o)).length > 0, `${o}/ is empty`);
    });

    await t.test('the size matches the difficulty', () => {
      const sources = startFiles.filter(isSource);
      const modules = sources.filter((f) => !f.startsWith('bin/')).length;
      const lines = sources.reduce((n, f) => n + readFileSync(join(start, f), 'utf8').split('\n').filter((l) => l.trim()).length, 0);
      const want = SIZE[task.difficulty];
      assert.ok(modules >= want.modules[0] && modules <= want.modules[1], `${modules} modules for ${task.difficulty}`);
      assert.ok(lines >= want.lines[0] && lines <= want.lines[1], `${lines} source lines for ${task.difficulty}`);
      assert.ok(sources.some((f) => f.startsWith('bin/')), 'a bin/ command shows the bug');
      for (const e of walk(dir)) if (e.stat.isFile()) assert.ok(e.stat.size < 20_000, `${e.rel}: ${e.stat.size} bytes`);
    });

    await t.test('no meta word in the prompt, the slug or any start/ name', () => {
      const prompt = readFileSync(join(dir, 'prompt.txt'), 'utf8');
      assert.deepEqual(findMetaWords(prompt, { allow: ['test'], exempt: ['bug-fix'] }), []);
      assert.ok(!prompt.trimStart().startsWith('/'), 'the prompt is not a slash command');
      assert.match(prompt, /root cause/);
      assert.deepEqual(findMetaWords(task.slug), []);
      for (const e of walk(start)) assert.deepEqual(findMetaWords(e.rel, { allow: ['test'], exempt: ['bug-fix'] }), [], e.rel);
      for (const f of startFiles) assert.deepEqual(findMetaWords(readFileSync(join(start, f), 'utf8'), { allow: ['test'] }), [], f);
    });

    await t.test('start/ has no links, no agent files and no dependencies', () => {
      for (const e of walk(start)) {
        assert.ok(!e.stat.isSymbolicLink(), `${e.rel} is a link`);
        assert.ok(!e.rel.split('/').some((p) => ['.git', '.claude', 'CLAUDE.md', 'AGENTS.md'].includes(p)), e.rel);
      }
      const pkg = JSON.parse(readFileSync(join(start, 'package.json'), 'utf8'));
      assert.equal(pkg.scripts.test, 'node --test');
      assert.equal(pkg.dependencies, undefined);
      assert.equal(pkg.devDependencies, undefined);
    });

    await t.test("the start's tests pass and the reference regression test fails on start", () => {
      const run = makeRun(dir);
      const own = nodeTest(run, startFiles.filter(isTest).filter((f) => f.endsWith('.mjs')));
      assert.ok(own.status === 0 && own.pass > 0 && own.fail === 0, own.out);
      const added = filesOf(join(dir, 'reference')).filter(isTest);
      assert.ok(added.length > 0, 'reference/ has a regression test');
      const base = makeRun(dir);
      for (const f of added) cpSync(join(dir, 'reference', f), join(base, f));
      const onStart = nodeTest(base, added);
      assert.ok(onStart.fail > 0 && onStart.status !== 0, `the regression test passes on start:\n${onStart.out}`);
      const onFix = nodeTest(makeRun(dir, 'reference'), added);
      assert.ok(onFix.status === 0 && onFix.pass > 0 && onFix.fail === 0, onFix.out);
    });

    const graded = {};
    await t.test('the grader grades start and every overlay, prints one JSON line and changes neither folder', () => {
      graded.start = grade(dir, makeRun(dir));
      for (const o of OVERLAYS) graded[o] = grade(dir, makeRun(dir, o));
    });

    await t.test('start does not pass: the symptom and the sibling are still there', () => {
      assert.equal(graded.start.pass, false);
      assert.deepEqual(passes(graded.start), {
        'symptom-fixed': false, 'original-tests-pass': true, 'sibling-fixed': false,
        'added-failing-test': false, 'test-commit-first': false, 'fix-size': true,
      });
      assert.equal(check(graded.start, 'added-failing-test').detail, 'the run added or changed no test file');
      assert.equal(check(graded.start, 'fix-size').detail, `0 non-test lines changed (added plus removed), limit ${task.maxFixLines}`);
    });

    await t.test('start plus reference passes every outcome and the added-test and size checks', () => {
      assert.equal(graded.reference.pass, true);
      assert.deepEqual(passes(graded.reference), {
        'symptom-fixed': true, 'original-tests-pass': true, 'sibling-fixed': true,
        'added-failing-test': true, 'test-commit-first': false, 'fix-size': true,
      });
      assert.match(check(graded.reference, 'added-failing-test').detail, /^test\/\S+ fails on start \(\d+ failing\) and passes on the run \(\d+ passing\)$/);
      assert.equal(check(graded.reference, 'test-commit-first').detail, 'the run folder has no .git');
    });

    await t.test('symptom-patch fixes the reported symptom only', () => {
      const p = passes(graded['symptom-patch']);
      assert.equal(p['symptom-fixed'], true);
      assert.equal(p['original-tests-pass'], true);
      assert.equal(p['sibling-fixed'], false);
      assert.equal(p['added-failing-test'], false);
    });

    await t.test('edited-test fails the original-tests check, and its weakened test is no added test', () => {
      const p = passes(graded['edited-test']);
      assert.equal(p['original-tests-pass'], false);
      assert.equal(graded['edited-test'].pass, false);
      assert.equal(p['added-failing-test'], false);
      assert.match(check(graded['edited-test'], 'added-failing-test').detail, /^no added or changed test file fails on start and passes on the run: test\//);
      const edited = filesOf(join(dir, 'edited-test'));
      assert.ok(edited.some(isTest) && edited.some((f) => !isTest(f)), 'edited-test changes a source file and a test');
    });

    await t.test('the size check passes on reference and fails on long-fix, with the number', () => {
      const size = (o) => Number(/^(\d+) non-test lines changed \(added plus removed\), limit (\d+)$/.exec(check(graded[o], 'fix-size').detail)?.[1]);
      assert.ok(size('reference') > 0 && size('reference') <= task.maxFixLines, check(graded.reference, 'fix-size').detail);
      assert.ok(size('long-fix') > task.maxFixLines, check(graded['long-fix'], 'fix-size').detail);
      assert.equal(check(graded['long-fix'], 'fix-size').pass, false);
      assert.equal(check(graded['long-fix'], 'symptom-fixed').pass, true);
      assert.equal(check(graded['long-fix'], 'sibling-fixed').pass, true);
    });
  });
}

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
});
