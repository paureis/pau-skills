// Shared setup for the skills-bench runner tests: the fixture paths, a pilot.json for the fixture mix, the fake claude's
// settings, and a wrapper that starts bench.mjs with the fake. Every test writes only to temporary folders.
import { writeFileSync, readFileSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir, removeAtExit } from './helpers.mjs';

export const BENCH = repo('apps', 'skills-bench', 'bench.mjs');
export const FIX = repo('tests', 'fixtures', 'skills-bench', 'runner');
export const FAKE = join(FIX, 'fake-claude.mjs');
// A value the fake judge echoes when it gets FAKE_BENCH_ECHO, and a key-like value never passed with --pass-env.
export const ECHO = 'sk-ant-fake-echo-0123456789abcdef';
export const UNNAMED = 'sk-ant-unnamed-9876543210fedcba';
export const PASS = ['--pass-env', 'FAKE_BENCH_CONFIG', 'FAKE_BENCH_LOG', 'FAKE_BENCH_ECHO'];

// A neutral prefix: the folders the tests make must not trip skill-eval's word guard.
export const scratch = () => tempDir('kettle-');

/** A copy of the fixture tasks, with `patch(tasksDir)` applied; returns its path. */
export function copyTasks(patch = () => {}) {
  const dir = join(scratch(), 'tasks');
  cpSync(join(FIX, 'tasks'), dir, { recursive: true });
  patch(dir);
  return dir;
}

/** Changes one fixture task's task.json in a copied tasks folder. */
export function patchTask(tasksDir, skill, id, change) {
  const f = join(tasksDir, skill, id, 'task.json');
  writeFileSync(f, JSON.stringify(change(JSON.parse(readFileSync(f, 'utf8'))), null, 2) + '\n');
}

/**
 * A pilot.json for the fixture mix: simple $0.10, medium $0.20, complex $0.50, judge $0.05, hard stop x2, n 3, cap $20.
 */
export function writeConfig({ tasksDir = join(FIX, 'tasks'), ...over } = {}) {
  const c = {
    format: 'skills-bench-pilot/1', tasksDir,
    skills: { tdd: join(FIX, 'skills', 'tdd'), 'bug-fix': join(FIX, 'skills', 'bug-fix') },
    controls: { skill: 'tdd', broken: join(FIX, 'variants', 'tdd-broken'), empty: join(FIX, 'variants', 'tdd-empty') },
    n: 3, maxUsd: '20', usdPerRun: { simple: '0.10', medium: '0.20', complex: '0.50' }, usdPerJudge: '0.05',
    hardStopFactor: 2, parallel: 4, order: ['complex', 'control', 'medium', 'simple'], ...over,
  };
  const f = join(scratch(), 'pilot.json');
  writeFileSync(f, JSON.stringify(c, null, 2));
  return f;
}

/** The fake's settings file. */
export function fakeConfig(cfg = {}) {
  const f = join(scratch(), 'fake.json');
  writeFileSync(f, JSON.stringify(cfg));
  return f;
}

/** bench.mjs with the fake claude and its settings; { code, stdout, stderr, log }. */
export function bench(args, { fake = {}, env = {}, log = join(scratch(), 'log') } = {}) {
  const r = runNode(BENCH, {
    args,
    env: { SKILL_EVAL_CLAUDE: FAKE, FAKE_BENCH_CONFIG: fakeConfig(fake), FAKE_BENCH_LOG: log, FAKE_BENCH_ECHO: ECHO, ANTHROPIC_API_KEY: UNNAMED, ...env },
  });
  return { ...r, log };
}

/** Every call the fake logged. */
export const readLog = (log) => (existsSync(log) ? readdirSync(log).map((f) => JSON.parse(readFileSync(join(log, f), 'utf8'))) : []);
export const workers = (log) => readLog(log).filter((c) => c.kind === 'worker');

export const readState = (round) => JSON.parse(readFileSync(join(round, 'round.json'), 'utf8'));
export const readResult = (round, skill, task, variant, n = 1) => JSON.parse(readFileSync(join(round, 'results', skill, task, variant, String(n), 'result.json'), 'utf8'));

/** run on a new round folder; removes the run roots when the test process exits. */
export function runRound({ config = writeConfig(), maxUsd = '20', extra = [], fake = {}, env = {}, round = join(scratch(), 'round'), log } = {}) {
  const r = bench(['run', '--config', config, '--model', 'fake-model', '--round', round, '--max-usd', maxUsd, ...extra, ...PASS], { fake, env, log });
  if (existsSync(join(round, 'round.json'))) for (const t of Object.values(readState(round).tasks)) if (t.root) removeAtExit(t.root);
  return { ...r, round };
}
