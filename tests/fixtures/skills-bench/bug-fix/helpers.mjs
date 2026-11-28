// Shared by the two self-checks of the Skills Bench bug-fix tasks: tests/skills-bench-tasks-bug-fix.test.mjs (the
// task contract) and tests/skills-bench-tasks-bug-fix-grader.test.mjs (how grade.mjs grades).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tempDir } from '../../../helpers.mjs';
import { CASES } from './grade-cases.mjs';

export const TASKS = join(ROOT, 'apps', 'skills-bench', 'tasks', 'bug-fix');
export const GRADER = join(TASKS, 'grade.mjs');
export const TASK_IDS = readdirSync(TASKS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
export const MONTH = join(TASKS, 'month-end-renewal');
// The checks grade.mjs prints, in order: [name, kind, required].
export const CHECKS = [
  ['symptom-fixed', 'outcome', true],
  ['original-tests-pass', 'outcome', true],
  ['sibling-fixed', 'outcome', false],
  ['added-failing-test', 'process', false],
  ['test-commit-first', 'process', false],
  ['fix-size', 'process', false],
];
export const SLOW = { timeout: 180_000 };

export const cleanEnv = () => {
  const env = { ...process.env, TZ: 'UTC', LC_ALL: 'C' };
  delete env.NODE_TEST_CONTEXT;
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return env;
};

/** Every entry under dir, as { rel, abs, stat } with lstat, folders before their contents. */
export function walk(dir, rel = '') {
  const out = [];
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    const stat = lstatSync(join(dir, r));
    out.push({ rel: r, abs: join(dir, r), stat });
    if (stat.isDirectory()) out.push(...walk(dir, r));
  }
  return out;
}
export const filesOf = (dir) => (existsSync(dir) ? walk(dir).filter((e) => e.stat.isFile()).map((e) => e.rel) : []);
export const isTest = (rel) => rel.split('/').includes('test') || /\.test\.m?js$/.test(rel);
export const isSource = (rel) => /\.(c|m)?js$/.test(rel) && !isTest(rel);

export function hashTree(dir) {
  const h = createHash('sha256');
  for (const e of walk(dir)) {
    h.update(`${e.rel}\0${e.stat.isDirectory() ? 'dir' : 'file'}\0`);
    if (e.stat.isFile()) h.update(readFileSync(e.abs));
  }
  return h.digest('hex');
}

/** A run folder: a copy of start/ with the named overlays laid over it at the same paths. */
export function makeRun(taskDir, ...overlays) {
  const dir = tempDir('bug-fix-run-');
  cpSync(join(taskDir, 'start'), dir, { recursive: true });
  for (const o of overlays) cpSync(join(taskDir, o), dir, { recursive: true });
  return dir;
}

/** A month-end-renewal run with the reference source fix, no reference test, and the named grade-cases.mjs files. */
export function fixedRun(...names) {
  const dir = makeRun(MONTH);
  for (const f of filesOf(join(MONTH, 'reference')).filter((f) => !isTest(f))) cpSync(join(MONTH, 'reference', f), join(dir, f));
  for (const f of names) writeFileSync(join(dir, f), CASES[f]);
  return dir;
}

/** node --test on the given files in dir; the TAP counts and the exit status. */
export function nodeTest(dir, files) {
  assert.ok(files.length > 0, `no test files to run in ${dir}`);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: dir, env: cleanEnv(), encoding: 'utf8', timeout: 60_000 });
  const count = (w) => Number((new RegExp(`^# ${w} (\\d+)$`, 'm').exec(r.stdout) || [])[1] ?? NaN);
  return { status: r.status, pass: count('pass'), fail: count('fail'), out: r.stdout };
}

export const spawnGrade = (taskDir, runDir, env = {}, grader = GRADER) =>
  spawnSync(process.execPath, [grader, '--task', taskDir, '--run', runDir], { env: { ...cleanEnv(), ...env }, encoding: 'utf8', timeout: 300_000 });

/** Run the grader on a task and a run folder; asserts one JSON line, exit 0, and both folders unchanged. */
export function grade(taskDir, runDir, env = {}, grader = GRADER) {
  const before = [hashTree(taskDir), hashTree(runDir)];
  const r = spawnGrade(taskDir, runDir, env, grader);
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
export const check = (result, name) => result.checks.find((c) => c.name === name);
export const passes = (result) => Object.fromEntries(result.checks.map((c) => [c.name, c.pass]));

export function git(dir, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=Bench Runner', '-c', 'user.email=runner@example.com', '-c', 'commit.gpgsign=false',
    '-c', 'init.defaultBranch=main', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir, env: cleanEnv(), encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}
