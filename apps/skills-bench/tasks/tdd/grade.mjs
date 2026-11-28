#!/usr/bin/env node
// Code grader for the skills-bench tdd tasks. Node.js standard library only (Node 20+).
//
//   node grade.mjs --task <task folder> --run <run folder>
//
// Prints one JSON line on stdout: { "pass", "score", "checks": [{ "name", "kind", "required", "pass", "detail" }] }.
// pass is true when every required check passes; score is passed checks / all checks. Exit 0 when it graded, whatever
// the grade; exit 1 when it could not (the reason on stderr). It works on temporary copies, never writes into --task
// or --run, uses no network and runs every node --test with TZ=UTC and LC_ALL=C.
//
// The checks, in order:
//   1. the task's hidden acceptance tests pass on the run's code (required);
//   2. the start's own tests, as the start had them, still pass on the run's code (required);
//   3. the run's new or changed test files pass on start + reference;
//   4. those files catch at least 75% of the bad versions (start, then reference, then bad/<name>); a bad version
//      counts as caught only when check 3 passed and the files fail on that layering;
//   5. the run's test files pass on the run's own code (process).
// For checks 3 and 4, files the run added that are not tests (a helper, a fixture) are laid in before the reference.
//
// The bug-fix grader carries its own copy of the file walk, the test file patterns and the node --test runner; a fix
// to one of them belongs in both.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, mkdirSync, copyFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const BUDGET_MS = 270_000; // the whole grade stays under 5 minutes
const RUN_MAX_MS = 60_000; // one node --test
const CATCH_SHARE = 0.75;

class CannotGrade extends Error {}

/** Every regular file under dir as a forward-slash path; dot folders, node_modules and links are left out. */
function listFiles(dir, rel = '') {
  const out = [];
  const entries = readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!e.name.startsWith('.') && e.name !== 'node_modules') out.push(...listFiles(dir, p));
    } else if (e.isFile()) out.push(p);
  }
  return out;
}

/** Node's default test file patterns: *.test.js, *-test.js, *_test.js, test-*.js, test.js and test/**, also .mjs and .cjs. */
function isTestFile(rel) {
  const parts = rel.split('/');
  const name = parts[parts.length - 1];
  if (!/\.[cm]?js$/.test(name)) return false;
  if (parts.slice(0, -1).includes('test')) return true;
  return /^test(-.*)?\.[cm]?js$/.test(name) || /[.\-_]test\.[cm]?js$/.test(name);
}

const countFiles = (list) => `${list.length} test file${list.length === 1 ? '' : 's'}`;
const sameFile = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b));

function copyFiles(from, files, to) {
  for (const f of files) {
    mkdirSync(dirname(join(to, f)), { recursive: true });
    copyFileSync(join(from, f), join(to, f));
  }
}

function lastCount(tap, word) {
  const all = [...tap.matchAll(new RegExp(`^# ${word} (\\d+)\\s*$`, 'gm'))];
  return all.length ? Number(all[all.length - 1][1]) : null;
}

/** node --test on files inside cwd: { ok, detail }. No count lines means the grade cannot be trusted. */
function nodeTest(cwd, files, deadline) {
  const env = { ...process.env, TZ: 'UTC', LC_ALL: 'C' };
  delete env.NODE_TEST_CONTEXT;
  const timeout = Math.max(1000, Math.min(RUN_MAX_MS, deadline - Date.now()));
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files.map((f) => join(cwd, f))],
    { cwd, env, timeout, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.error && r.error.code === 'ETIMEDOUT') return { ok: false, detail: `node --test was stopped after ${timeout} ms` };
  if (r.error) throw new CannotGrade(`node --test did not start: ${r.error.message}`);
  const pass = lastCount(r.stdout, 'pass');
  const fail = lastCount(r.stdout, 'fail');
  if (pass === null || fail === null) throw new CannotGrade(`node --test printed no pass and fail counts (exit ${r.status}, signal ${r.signal})`);
  return { ok: pass > 0 && fail === 0 && r.status === 0, detail: `${pass} passed, ${fail} failed, exit ${r.status}` };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = { '--task': 'task', '--run': 'run' }[argv[i]];
    if (!key || argv[i + 1] === undefined) throw new CannotGrade('usage: grade.mjs --task <task folder> --run <run folder>');
    out[key] = resolve(argv[i + 1]);
  }
  for (const key of ['task', 'run']) {
    if (!out[key] || !existsSync(out[key]) || !statSync(out[key]).isDirectory()) throw new CannotGrade(`--${key} is not a folder`);
  }
  return out;
}

function grade(task, run, tmp) {
  const deadline = Date.now() + BUDGET_MS;
  const part = (name) => join(task, name);
  for (const name of ['task.json', 'start', 'hidden', 'reference', 'bad']) {
    if (!existsSync(part(name))) throw new CannotGrade(`the task has no ${name}`);
  }
  const startFiles = listFiles(part('start'));
  const startTests = startFiles.filter(isTestFile);
  const runFiles = listFiles(run);
  const runTests = runFiles.filter(isTestFile);
  const changedTests = runTests.filter((f) => !sameFile(join(run, f), join(part('start'), f)));
  const runAdded = runFiles.filter((f) => !isTestFile(f) && !startFiles.includes(f));
  const hiddenFiles = listFiles(part('hidden'));
  const hiddenTests = hiddenFiles.filter(isTestFile);
  const bads = readdirSync(part('bad'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  if (!hiddenTests.length) throw new CannotGrade('the task has no hidden test files');
  if (!bads.length) throw new CannotGrade('the task has no bad versions');

  let n = 0;
  /** A fresh folder with [folder, files] pairs laid one over the other. */
  const layer = (...layers) => {
    const dir = join(tmp, String(++n));
    mkdirSync(dir);
    for (const [from, files] of layers) copyFiles(from, files, dir);
    return dir;
  };
  const tree = (dir) => [dir, listFiles(dir)];
  const checks = [];
  const add = (name, kind, required, pass, detail) => checks.push({ name, kind, required, pass, detail });

  // 1. Hidden acceptance tests, in a top-level folder a run would not pick.
  const one = layer([run, runFiles]);
  const hiddenDir = `zz-hidden-${randomBytes(6).toString('hex')}`;
  copyFiles(part('hidden'), hiddenFiles, join(one, hiddenDir));
  const accept = nodeTest(one, hiddenTests.map((f) => `${hiddenDir}/${f}`), deadline);
  add('acceptance-tests-pass', 'outcome', true, accept.ok, `acceptance tests: ${accept.detail}`);

  // 2. The start's tests, as the start had them, on the run's code.
  if (startTests.length) {
    const r = nodeTest(layer([run, runFiles], [part('start'), startTests]), startTests, deadline);
    add('start-tests-still-pass', 'outcome', true, r.ok, `the start's tests: ${r.detail}`);
  } else add('start-tests-still-pass', 'outcome', true, false, 'the start has no test files');

  // 3 and 4. The run's new or changed tests on the reference, then on each bad version.
  const onTop = (...middle) => layer(tree(part('start')), [run, runAdded], tree(part('reference')), ...middle, [run, changedTests]);
  let onReference = { ok: false, detail: 'the run added or changed no test files' };
  if (changedTests.length) onReference = nodeTest(onTop(), changedTests, deadline);
  add('new-tests-pass-on-reference', 'outcome', false, onReference.ok,
    changedTests.length ? `${countFiles(changedTests)} new or changed, on the reference: ${onReference.detail}` : onReference.detail);

  const missed = [];
  let caught = 0;
  if (onReference.ok) {
    for (const b of bads) {
      const r = nodeTest(onTop(tree(join(part('bad'), b))), changedTests, deadline);
      if (r.ok) missed.push(b); else caught++;
    }
  }
  const need = Math.ceil(CATCH_SHARE * bads.length);
  const why = onReference.ok ? (missed.length ? `; missed: ${missed.join(', ')}` : '') : '; the new tests do not pass on the reference';
  add('new-tests-catch-bad-versions', 'outcome', false, caught >= need, `${caught} of ${bads.length} bad versions caught, ${need} needed${why}`);

  // 5. The run's tests on its own code.
  if (runTests.length) {
    const r = nodeTest(layer([run, runFiles]), runTests, deadline);
    add('run-tests-pass-on-run-code', 'process', false, r.ok, `${countFiles(runTests)}: ${r.detail}`);
  } else add('run-tests-pass-on-run-code', 'process', false, false, 'the run has no test files');

  const pass = checks.filter((c) => c.required).every((c) => c.pass);
  return { pass, score: checks.filter((c) => c.pass).length / checks.length, checks };
}

let tmp = null;
try {
  const { task, run } = parseArgs(process.argv.slice(2));
  tmp = mkdtempSync(join(tmpdir(), 'skills-bench-grade-'));
  process.stdout.write(`${JSON.stringify(grade(task, run, tmp))}\n`);
} catch (e) {
  process.stderr.write(`grade.mjs: could not grade: ${e instanceof CannotGrade ? e.message : e.stack}\n`);
  process.exitCode = 1;
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
}
