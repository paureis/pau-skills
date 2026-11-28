#!/usr/bin/env node
// Code grader for the Skills Bench bug-fix tasks.
//
//   node grade.mjs --task <task folder> --run <run folder>
//
// Prints one JSON line: { pass, score, checks: [{ name, kind, required, pass, detail }] }. pass is true when every
// required check passes; score is passed checks / all checks. Exit 0 when it graded (whatever the grade), 1 when it
// could not (the reason on stderr). It works on temporary copies and never writes into --task or --run.
//
// The task folder holds task.json, start/ (the project the run got) and hidden/ with symptom.test.mjs (the reported
// symptom), sibling.test.mjs (a second symptom of the same root cause) and existing.test.mjs (behaviour that already
// worked). The run's working tree is compared with start/, leaving out .git and .claude; git is read only for the
// commit-order check.
//
// The tdd tasks carry their own copy of these helpers (no shared library): a fix to the test-file patterns, the
// node --test call or the line count here belongs in that grader too.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIDDEN = { symptom: 'symptom.test.mjs', sibling: 'sibling.test.mjs', existing: 'existing.test.mjs' };
const SKIP_DIRS = new Set(['.git', '.claude']);
const BUDGET_MS = 240_000; // every node --test shares this, so the grader ends within 5 minutes
const SPAWN_MS = 90_000;
const MAX_CANDIDATES = 10; // added or changed test files tried by the added-test check
const MAX_DIFF_CELLS = 4_000_000; // above this a file's changed lines are counted as all its lines

class GradeError extends Error {}

/** Regular files under root, as sorted relative paths with /, leaving out .git, .claude and links. */
export function listFiles(root, rel = '') {
  const out = [];
  for (const name of readdirSync(join(root, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    const st = lstatSync(join(root, r));
    if (st.isDirectory() && !SKIP_DIRS.has(name)) out.push(...listFiles(root, r));
    else if (st.isFile()) out.push(r);
  }
  return out;
}

// Node's default --test patterns: *.test.*, *-test.*, *_test.*, test-*, test.* and any file under a test/ folder,
// for .js, .mjs and .cjs, outside node_modules and dot folders.
const TEST_NAME = /^(?:.+[.\-_]test|test-.+|test)\.[cm]?js$/;
/** A file node --test would run. */
export function isTestFile(rel) {
  const parts = rel.split('/');
  const dirs = parts.slice(0, -1);
  if (dirs.some((d) => d === 'node_modules' || d.startsWith('.'))) return false;
  const name = parts[parts.length - 1];
  return TEST_NAME.test(name) || (dirs.includes('test') && /\.[cm]?js$/.test(name));
}
/** A test file or anything else under a test/ folder (helpers, fixtures): a change that is not a source change. */
export const isTestSide = (rel) => isTestFile(rel) || rel.split('/').slice(0, -1).includes('test');

function copyFiles(from, to, files) {
  for (const f of files) {
    mkdirSync(dirname(join(to, f)), { recursive: true });
    copyFileSync(join(from, f), join(to, f));
  }
}

const sameFile = (a, b) => readFileSync(a).equals(readFileSync(b));

function childEnv() {
  const env = { ...process.env, TZ: 'UTC', LC_ALL: 'C' };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/**
 * node --test on files (paths relative to cwd). Returns { ok, failed, pass, fail, detail }. ok needs both TAP count
 * lines, pass above 0, fail 0 and exit 0; failed means a test failed or the run timed out. Output with no count lines
 * means the grader cannot grade.
 */
function runTests(cwd, files, clock) {
  if (files.length === 0) return { ok: false, detail: 'no test files to run' };
  const left = clock.end - Date.now();
  if (left < 1000) return { ok: false, detail: 'the time budget ran out before this check' };
  const timeout = Math.min(SPAWN_MS, left);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd, timeout, env: childEnv(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error?.code === 'ETIMEDOUT' || (r.signal && r.status === null)) {
    return { ok: false, failed: true, detail: `node --test ${files.join(' ')} timed out after ${Math.round(timeout / 1000)}s` };
  }
  if (r.error) throw new GradeError(`could not start node --test: ${r.error.message}`);
  const count = (word) => {
    const m = new RegExp(`^# ${word} (\\d+)$`, 'm').exec(r.stdout);
    return m ? Number(m[1]) : null;
  };
  const pass = count('pass');
  const fail = count('fail');
  if (pass === null || fail === null) {
    throw new GradeError(`node --test ${files.join(' ')} printed no pass and fail counts (exit ${r.status})`);
  }
  const ok = pass > 0 && fail === 0 && r.status === 0;
  return { ok, failed: fail > 0, pass, fail, detail: `${pass} passing, ${fail} failing, exit ${r.status}` };
}

const lines = (text) => {
  const l = text.split(/\r?\n/);
  if (l[l.length - 1] === '') l.pop();
  return l;
};

/** Lines added plus lines removed between two texts, from a longest common subsequence of lines. */
export function changedLines(before, after) {
  let a = lines(before);
  let b = lines(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  a = a.slice(head, a.length - tail);
  b = b.slice(head, b.length - tail);
  if (a.length === 0 || b.length === 0) return a.length + b.length;
  // shortcut: a pair of files too big for the table counts as fully rewritten; fine for task-sized projects.
  if (a.length * b.length > MAX_DIFF_CELLS) return a.length + b.length;
  let prev = new Uint32Array(b.length + 1);
  let row = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    [prev, row] = [row, prev];
  }
  return a.length + b.length - 2 * prev[b.length];
}

function git(run, args) {
  const env = { ...childEnv(), GIT_OPTIONAL_LOCKS: '0', GIT_CEILING_DIRECTORIES: dirname(run) };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY']) delete env[k];
  const r = spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: run, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: !r.error && r.status === 0, out: r.stdout ?? '', err: r.error ? r.error.message : (r.stderr ?? '').trim() };
}

/** Check 5: a commit that changes only tests comes before the first commit that changes anything else. */
function commitOrder(run) {
  if (!existsSync(join(run, '.git'))) return { pass: false, detail: 'the run folder has no .git' };
  const roots = git(run, ['rev-list', '--max-parents=0', 'HEAD']);
  if (!roots.ok) return { pass: false, detail: `git could not read the history: ${roots.err}` };
  const root = roots.out.split('\n').filter(Boolean).pop();
  const list = git(run, ['rev-list', '--reverse', '--first-parent', `${root}..HEAD`]);
  if (!list.ok) return { pass: false, detail: `git could not list the commits: ${list.err}` };
  const commits = list.out.split('\n').filter(Boolean);
  if (commits.length === 0) return { pass: false, detail: 'no commits after the root commit on HEAD' };
  let testOnly = -1;
  for (let i = 0; i < commits.length; i++) {
    const d = git(run, ['diff-tree', '-r', '-z', '--name-only', '--no-commit-id', `${commits[i]}^1`, commits[i]]);
    if (!d.ok) return { pass: false, detail: `git could not read commit ${i + 1}: ${d.err}` };
    const files = d.out.split('\0').filter(Boolean);
    if (files.length > 0 && files.every(isTestSide)) {
      if (testOnly < 0) testOnly = i;
    } else if (files.length > 0) {
      if (testOnly >= 0) {
        return { pass: true, detail: `commit ${testOnly + 1} of ${commits.length} changes only tests; the first source change is commit ${i + 1}` };
      }
      return { pass: false, detail: `no commit with only test changes comes before the first source change (commit ${i + 1} of ${commits.length})` };
    }
  }
  return { pass: false, detail: `none of the ${commits.length} commits after the root changes a source file` };
}

function readTask(taskDir) {
  let task;
  try { task = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8')); } catch (err) {
    throw new GradeError(`cannot read ${join(taskDir, 'task.json')}: ${err.message}`);
  }
  if (task.maxFixLines !== undefined && !(Number.isInteger(task.maxFixLines) && task.maxFixLines >= 0)) {
    throw new GradeError('task.json maxFixLines must be a whole number of 0 or more');
  }
  for (const f of ['start', ...Object.values(HIDDEN).map((h) => join('hidden', h))]) {
    if (!existsSync(join(taskDir, f))) throw new GradeError(`the task has no ${f}`);
  }
  return task;
}

export function gradeRun(taskDir, run) {
  const task = readTask(taskDir);
  const start = join(taskDir, 'start');
  const clock = { end: Date.now() + BUDGET_MS };
  const tmp = mkdtempSync(join(tmpdir(), 'bug-fix-grade-'));
  try {
    const startFiles = listFiles(start);
    const runFiles = listFiles(run);
    const startSet = new Set(startFiles);
    const runSet = new Set(runFiles);
    const hiddenDir = `zz-hidden-${randomBytes(6).toString('hex')}`;
    const hidden = (key) => `${hiddenDir}/${HIDDEN[key]}`;
    const withHidden = (dir) => copyFiles(join(taskDir, 'hidden'), join(dir, hiddenDir), Object.values(HIDDEN));

    // The run's tree, with the hidden tests in a folder of their own.
    const work = join(tmp, 'run');
    copyFiles(run, work, runFiles);
    withHidden(work);
    // The run's source with start's tests put back, so an edited or deleted test cannot hide a broken behaviour.
    const original = join(tmp, 'original');
    copyFiles(run, original, runFiles);
    copyFiles(start, original, startFiles.filter(isTestSide));
    withHidden(original);

    const checks = [];
    const add = (name, kind, required, pass, detail) => checks.push({ name, kind, required, pass, detail });

    const symptom = runTests(work, [hidden('symptom')], clock);
    add('symptom-fixed', 'outcome', true, symptom.ok, `the reported symptom: ${symptom.detail}`);
    const kept = runTests(original, [...startFiles.filter(isTestFile), hidden('existing')], clock);
    add('original-tests-pass', 'outcome', true, kept.ok, `start's tests and the existing behaviour on the run's source: ${kept.detail}`);
    const sibling = runTests(work, [hidden('sibling')], clock);
    add('sibling-fixed', 'outcome', false, sibling.ok, `a second symptom of the same cause: ${sibling.detail}`);

    // Check 4: a test file the run added or changed that fails on start's source and passes on the run's.
    const changedTests = runFiles.filter((f) => isTestSide(f) && (!startSet.has(f) || !sameFile(join(start, f), join(run, f))));
    const candidates = changedTests.filter(isTestFile).slice(0, MAX_CANDIDATES);
    if (candidates.length === 0) {
      add('added-failing-test', 'process', false, false, 'the run added or changed no test file');
    } else {
      const base = join(tmp, 'start');
      copyFiles(start, base, startFiles);
      copyFiles(run, base, changedTests);
      let found = null;
      for (const f of candidates) {
        const onRun = runTests(work, [f], clock);
        if (!onRun.ok) continue;
        const onStart = runTests(base, [f], clock);
        if (onStart.failed) { found = { f, onRun, onStart }; break; }
      }
      add('added-failing-test', 'process', false, !!found, found
        ? `${found.f} fails on start (${found.onStart.fail ?? 'timed out, no'} failing) and passes on the run (${found.onRun.pass} passing)`
        : `no added or changed test file fails on start and passes on the run: ${candidates.join(', ')}`);
    }

    const order = commitOrder(run);
    add('test-commit-first', 'process', false, order.pass, order.detail);

    if (task.maxFixLines !== undefined) {
      let n = 0;
      for (const f of new Set([...startFiles, ...runFiles])) {
        if (isTestSide(f)) continue;
        const before = startSet.has(f) ? readFileSync(join(start, f), 'utf8') : '';
        const after = runSet.has(f) ? readFileSync(join(run, f), 'utf8') : '';
        n += changedLines(before, after);
      }
      add('fix-size', 'process', false, n <= task.maxFixLines, `${n} non-test lines changed (added plus removed), limit ${task.maxFixLines}`);
    }

    const passed = checks.filter((c) => c.pass).length;
    return { pass: checks.every((c) => !c.required || c.pass), score: passed / checks.length, checks };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--task', '--run'].includes(argv[i]) || argv[i + 1] === undefined) {
      throw new GradeError('usage: node grade.mjs --task <task folder> --run <run folder>');
    }
    args[argv[i].slice(2)] = resolve(argv[i + 1]);
  }
  if (!args.task || !args.run) throw new GradeError('usage: node grade.mjs --task <task folder> --run <run folder>');
  if (!existsSync(args.run) || !statSync(args.run).isDirectory()) throw new GradeError(`the run folder ${args.run} does not exist`);
  if (!existsSync(args.task) || !statSync(args.task).isDirectory()) throw new GradeError(`the task folder ${args.task} does not exist`);
  return gradeRun(args.task, args.run);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)))}\n`);
  } catch (err) {
    process.stderr.write(`grade.mjs: ${err instanceof GradeError ? err.message : err.stack}\n`);
    process.exitCode = 1;
  }
}
