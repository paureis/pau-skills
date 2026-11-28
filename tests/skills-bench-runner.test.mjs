// The skills-bench runner: pilot.json, the plan of a round and what run refuses before any setup. The fixture mix is
// 3 tdd tasks (one simple control task with 4 variants) and 3 bug-fix tasks; its totals are worked out by hand below.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo } from './helpers.mjs';
import { bench, writeConfig, copyTasks, patchTask, readLog, runRound, scratch, PASS } from './skills-bench-runner.helpers.mjs';

const plan = (extra = [], opts = {}) => bench(['plan', '--config', opts.config || writeConfig(), '--model', 'fake-model', ...extra], opts);

describe('pilot.json', () => {
  test('has the pilot shape, no model, and every path under skills/ or apps/skills-bench/', () => {
    const c = JSON.parse(readFileSync(repo('apps', 'skills-bench', 'pilot.json'), 'utf8'));
    assert.deepEqual(Object.keys(c).sort(), ['controls', 'format', 'hardStopFactor', 'maxUsd', 'n', 'order', 'parallel', 'skills', 'tasksDir', 'usdPerJudge', 'usdPerRun']);
    assert.equal(c.format, 'skills-bench-pilot/1');
    assert.deepEqual(Object.keys(c.skills), ['tdd', 'bug-fix']);
    assert.equal(c.controls.skill, 'tdd');
    assert.equal(c.n, 3);
    assert.equal(c.maxUsd, '40');
    assert.deepEqual(c.usdPerRun, { simple: '0.15', medium: '0.35', complex: '0.90' });
    assert.equal(c.usdPerJudge, '0.15');
    assert.equal(c.hardStopFactor, 2);
    assert.equal(c.parallel, 4);
    assert.deepEqual(c.order, ['complex', 'control', 'medium', 'simple']);
    const paths = [c.tasksDir, ...Object.values(c.skills), c.controls.broken, c.controls.empty];
    for (const p of paths) assert.match(p, /^(skills\/|apps\/skills-bench\/)[a-z0-9/-]+$/, p);
  });
});

describe('plan', () => {
  test('prints the totals of the fixture mix and calls no claude', () => {
    const r = plan();
    assert.equal(r.code, 0, r.stderr);
    // Runs: complex 2 x 2 x 3 = 12, the control task 4 x 3 = 12, medium 2 x 2 x 3 = 12, simple 2 x 3 = 6.
    // Estimate: 12 x $0.50 + 12 x $0.10 + 12 x $0.20 + 6 x $0.10 = $10.20, plus 6 judges x $0.05 = $10.50.
    assert.match(r.stdout, /^Runs: 42$/m);
    assert.match(r.stdout, /^Judge calls: 6$/m);
    assert.match(r.stdout, /^Estimate: \$10\.50$/m);
    assert.match(r.stdout, /^Cap: \$20\.00$/m);
    assert.match(r.stdout, /^Margin: \$9\.50$/m);
    // Need = spent before + runs x hard stop + $0.30 reserve: 6.30, 9.30, 8.70, 9.90, 11.10, 11.10; 20 / 11.10 = 1.80.
    assert.match(r.stdout, /^Start-rule factor: 1\.80 \(every price can grow by this factor and the start rule still lets every task start in order\)$/m);
    const rows = r.stdout.split('\n').filter((l) => /^(tdd|fix)-/.test(l));
    assert.deepEqual(rows.map((l) => l.split('  ')[0]), ['tdd-complex-a', 'fix-complex-a', 'tdd-simple-a', 'tdd-medium-a', 'fix-medium-a', 'fix-simple-a']);
    assert.deepEqual(rows.map((l) => l.split('  ').pop()), ['$6.30', '$9.30', '$8.70', '$9.90', '$11.10', '$11.10']);
    assert.match(rows[2], /  with,without,broken,empty  12  \$1\.20  \$0\.20  /);
    assert.deepEqual(readLog(r.log), []);
  });

  test('takes the highest of the default and --price for each difficulty', () => {
    const r = plan(['--price', 'complex=1.00', '--price', 'simple=0.01']);
    assert.equal(r.code, 0, r.stderr);
    // Complex at $1.00: 12 x $1.00 + $4.20 + $0.30 = $16.50; simple stays $0.10. Largest need: $6 + 6 x $2 + $0.30.
    assert.match(r.stdout, /^Estimate: \$16\.50$/m);
    assert.match(r.stdout, /^Start-rule factor: 1\.09 /m);
  });

  test('refuses when the estimate passes the cap', () => {
    const r = plan(['--max-usd', '10']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^refused: the estimate \$10\.50 passes the cap \$10\.00$/m);
  });

  test('refuses a tdd task without "test" in allowWords', () => {
    const tasksDir = copyTasks((d) => patchTask(d, 'tdd', 'tdd-medium-a', (t) => ({ ...t, allowWords: [] })));
    const r = plan([], { config: writeConfig({ tasksDir }) });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^refused: these tasks break contract 1 \(FORMAT\.md\):$/m);
    assert.match(r.stderr, /^refused: task tdd\/tdd-medium-a: a tdd task needs "test" in allowWords, or setup refuses its prompt and its test files$/m);
  });

  test('refuses a task that breaks contract 1 in other ways', () => {
    const tasksDir = copyTasks((d) => {
      patchTask(d, 'bug-fix', 'fix-simple-a', (t) => ({ ...t, slug: 'score-board', timeoutMin: 30 }));
      writeFileSync(join(d, 'bug-fix', 'fix-medium-a', 'prompt.txt'), '/bug-fix the csv tool\n');
    });
    const r = plan([], { config: writeConfig({ tasksDir }) });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /task bug-fix\/fix-simple-a: slug score-board has a word a run must not see \(score\)/);
    assert.match(r.stderr, /task bug-fix\/fix-simple-a: timeoutMin must be 15 for a simple task/);
    assert.match(r.stderr, /task bug-fix\/fix-medium-a: prompt\.txt starts with \/, a slash command/);
  });
});

describe('run refuses before any setup', () => {
  test('without --max-usd', () => {
    const round = join(scratch(), 'round');
    const r = bench(['run', '--config', writeConfig(), '--model', 'fake-model', '--round', round, ...PASS]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^refused: run needs --max-usd <cap in US dollars>: a round never starts without a cap$/m);
    assert.ok(!existsSync(round));
  });

  test('more runs than skill-eval can label: n x the variants over 26', () => {
    const r = runRound({ extra: ['--n', '7'] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^refused: tdd-simple-a: 4 variants x 7 = 28 runs; skill-eval labels at most 26$/m);
    assert.ok(!existsSync(join(r.round, 'round.json')));
    assert.deepEqual(readLog(r.log), []);
  });

  test('a tdd task without "test" in allowWords', () => {
    const tasksDir = copyTasks((d) => patchTask(d, 'tdd', 'tdd-simple-a', (t) => ({ ...t, allowWords: ['eval'] })));
    const r = runRound({ config: writeConfig({ tasksDir }) });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /tdd-simple-a: a tdd task needs "test" in allowWords/);
    assert.ok(!existsSync(join(r.round, 'labs')));
    assert.deepEqual(readLog(r.log), []);
  });

  test('a round folder inside the repository, or one that holds files this bench did not write', () => {
    const inside = repo('apps', 'skills-bench', 'round-in-repo');
    const r = runRound({ round: inside });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^refused: the round folder .*round-in-repo is inside the repository; keep a round outside it/m);
    assert.ok(!existsSync(inside));
    const other = join(scratch(), 'busy');
    mkdirSync(other);
    writeFileSync(join(other, 'notes.txt'), 'mine\n');
    const r2 = runRound({ round: other });
    assert.equal(r2.code, 1);
    assert.match(r2.stderr, /is not empty and holds no round\.json this bench wrote; give a new or empty folder, or a round folder to resume$/m);
  });
});
