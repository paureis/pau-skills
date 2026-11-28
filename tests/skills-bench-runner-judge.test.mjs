// The skills-bench runner after the runs: one blind judge per task, the owner sheet, reading the owner's grades back,
// and the export in contract 3. One round of the fixture mix (n 1, 14 runs) is shared by the tests, in order.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runRound, bench, readState, readResult, readLog, scratch, ECHO, UNNAMED, PASS,
} from './skills-bench-runner.helpers.mjs';

const fake = { judge: { cost: 0.02 } };
const made = runRound({ extra: ['--n', '1'], fake });
const round = made.round;
const judged = bench(['judge', '--round', round, '--judge-model', 'fake-judge', ...PASS], { fake });
const SCORE = { with: 5, without: 2, broken: 1, empty: 3 };
const CRITERIA = { tdd: 3, 'bug-fix': 4 };

const files = (dir) => readdirSync(dir, { recursive: true }).filter((f) => statSync(join(dir, f)).isFile()).map((f) => f.split('\\').join('/')).sort();

describe('judge', () => {
  test('maps each letter of the verdict through key.json to its run', () => {
    assert.equal(made.code, 0, made.stderr);
    assert.equal(judged.code, 0, judged.stderr);
    const s = readState(round);
    for (const id of s.planned) {
      const t = s.tasks[id];
      assert.equal(t.judged, true, id);
      const key = JSON.parse(readFileSync(join(t.lab, 'key.json'), 'utf8')).labels;
      for (const run of t.runs) {
        const x = readResult(round, t.skill, id, run.variant, run.n);
        assert.equal(key[x.judgeLetter], run.id, `${id} ${run.variant}`);
        // The fake judge scores by the token each variant left in its output, so a wrong mapping shows here.
        const want = Object.fromEntries(Array.from({ length: CRITERIA[t.skill] }, (_, i) => [String(i + 1), SCORE[run.variant]]));
        assert.deepEqual(x.judge, want, `${id} ${run.variant}`);
      }
      const j = JSON.parse(readFileSync(join(round, 'judge', t.skill, `${id}.json`), 'utf8'));
      assert.deepEqual(Object.keys(j), ['model', 'costMicros', 'criteria']);
      assert.equal(j.model, 'fake-judge');
      assert.equal(j.costMicros, 20_000);
      assert.equal(j.criteria.length, CRITERIA[t.skill]);
      assert.match(readFileSync(join(round, 'judge', t.skill, `${id}.verdict.txt`), 'utf8'), /^Criterion 1: /);
    }
    // 14 runs x $0.05 and 6 judges x $0.02.
    assert.equal(s.spentMicros, 820_000);
    assert.equal(s.judgeModel, 'fake-judge');
  });

  test('the judge gets the variables named with --pass-env, not an unnamed key-like one, in an empty folder', () => {
    const calls = readLog(judged.log).filter((c) => c.kind === 'judge');
    assert.equal(calls.length, 6);
    for (const c of calls) {
      assert.ok(c.names.includes('FAKE_BENCH_ECHO'));
      assert.ok(!c.names.includes('ANTHROPIC_API_KEY'));
      assert.ok(!JSON.stringify(c).includes(UNNAMED));
      assert.ok(c.argv.includes('--tools') && c.argv.includes('fake-judge'));
      assert.ok(!relative(tmpdir(), c.cwd).startsWith('..'));
      assert.ok(!existsSync(c.cwd), 'the empty working folder is removed');
    }
  });
});

const sheet = join(scratch(), 'sheet');
const owner = bench(['owner-sheet', '--round', round, '--out', sheet, '--seed', '7']);
const mapFile = join(round, 'owner', 'map.json');

describe('owner-sheet', () => {
  test('writes 10 letters, the rubrics and the grades files, and keeps the map out of the sheet', () => {
    assert.equal(owner.code, 0, owner.stderr);
    assert.deepEqual(files(sheet), [...'ABCDEFGHIJ'].map((l) => `${l}.txt`).concat(['grades-bug-fix.txt', 'grades-tdd.txt', 'rubric-bug-fix.txt', 'rubric-tdd.txt']).sort());
    assert.ok(existsSync(mapFile));
    const map = JSON.parse(readFileSync(mapFile, 'utf8'));
    assert.deepEqual(Object.keys(map), [...'ABCDEFGHIJ']);
    for (const [skill, letters] of [['tdd', 'ABCDE'], ['bug-fix', 'FGHIJ']]) {
      const picked = [...letters].map((l) => map[l]);
      assert.ok(picked.every((p) => p.skill === skill));
      assert.deepEqual([...new Set(picked.map((p) => p.variant))].sort(), ['with', 'without']);
      assert.deepEqual([...new Set(picked.map((p) => p.difficulty))].sort(), ['complex', 'medium', 'simple']);
    }
  });

  test('each letter file has its own heading, the Task line and prompt, and no variant field, run id or map', () => {
    const s = readState(round);
    const ids = Object.values(s.tasks).flatMap((t) => t.runs.map((r) => r.id));
    for (const l of 'ABCDEFGHIJ') {
      const text = readFileSync(join(sheet, `${l}.txt`), 'utf8');
      assert.match(text, /^Task: .+\n\nPrompt:\n\n.+\n/);
      assert.deepEqual([...text.matchAll(/^# Output ([A-Z])\s*$/gm)].map((m) => m[1]), [l]);
      assert.doesNotMatch(text, /^\W*variant\W*[:=]/im);
      assert.doesNotMatch(text, /graded\.txt/, 'what the grader wrote never reaches the blind copy');
      for (const id of ids) assert.ok(!text.includes(id), `${l} holds run id ${id}`);
    }
    for (const f of files(sheet)) assert.doesNotMatch(readFileSync(join(sheet, f), 'utf8'), /"skill"|"variant"|map\.json/);
    const grades = readFileSync(join(sheet, 'grades-tdd.txt'), 'utf8');
    assert.match(grades, /^Criterion 1: The new behaviour works as the request asked\.\n {2}A: \?\/5 {2}<your reason>\n/);
  });

  test('refuses to make a second sheet for the same round', () => {
    const r = bench(['owner-sheet', '--round', round, '--out', join(scratch(), 'again')]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^refused: an owner sheet was made for this round already/);
  });
});

const fill = (text, skip = null) => text.split('\n').map((line, i) => (i === skip ? line : line.replace('?/5  <your reason>', '4/5  read it'))).join('\n');

describe('owner-grades', () => {
  test('refuses a sheet with a letter left unscored, which ends its block and hides the lines after it', () => {
    const tdd = readFileSync(join(sheet, 'grades-tdd.txt'), 'utf8');
    const f = join(scratch(), 'tdd.txt');
    const g = join(scratch(), 'fix.txt');
    writeFileSync(f, fill(tdd, 3));
    writeFileSync(g, fill(readFileSync(join(sheet, 'grades-bug-fix.txt'), 'utf8')));
    const r = bench(['owner-grades', '--round', round, '--tdd', f, '--bug-fix', g]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^refused: the grades are not complete; every letter needs a 1 to 5 score on every criterion \(a "\?\/5" line left as it is ends its block, so the lines after it are not read\):$/m);
    for (const l of 'CDE') assert.match(r.stderr, new RegExp(`^refused: tdd: criterion 1 has no 1 to 5 score for ${l}$`, 'm'));
    assert.doesNotMatch(r.stderr, /score for [AB]$|bug-fix: criterion/m);
    assert.ok(!existsSync(join(round, 'owner', 'grades-tdd.txt')));
  });

  test('refuses a sheet with a letter line taken out, which parses cleanly', () => {
    const f = join(scratch(), 'tdd.txt');
    const g = join(scratch(), 'fix.txt');
    writeFileSync(f, fill(readFileSync(join(sheet, 'grades-tdd.txt'), 'utf8')));
    const fix = fill(readFileSync(join(sheet, 'grades-bug-fix.txt'), 'utf8')).split('\n');
    const at = fix.findIndex((l) => l.startsWith('Criterion 2:')) + 2;
    assert.match(fix[at], /^ {2}G: 4\/5/);
    writeFileSync(g, [...fix.slice(0, at), ...fix.slice(at + 1)].join('\n'));
    const r = bench(['owner-grades', '--round', round, '--tdd', f, '--bug-fix', g]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^refused: the grades are not complete; every letter needs/m);
    assert.match(r.stderr, /^refused: bug-fix: criterion 2 has no 1 to 5 score for G$/m);
    assert.ok(!existsSync(join(round, 'owner', 'grades-bug-fix.txt')));
  });

  test('stores a complete pair of sheets', () => {
    const f = join(scratch(), 'tdd.txt');
    const g = join(scratch(), 'fix.txt');
    writeFileSync(f, fill(readFileSync(join(sheet, 'grades-tdd.txt'), 'utf8')));
    writeFileSync(g, fill(readFileSync(join(sheet, 'grades-bug-fix.txt'), 'utf8')));
    const r = bench(['owner-grades', '--round', round, '--tdd', f, '--bug-fix', g]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(readFileSync(join(round, 'owner', 'grades-tdd.txt'), 'utf8'), readFileSync(f, 'utf8'));
    assert.equal(readFileSync(join(round, 'owner', 'grades-bug-fix.txt'), 'utf8'), readFileSync(g, 'utf8'));
  });
});

describe('export', () => {
  test('writes contract 3 with no environment value, no email and no machine path', () => {
    const to = join(scratch(), 'out');
    const r = bench(['export', '--round', round, '--to', to, '--auth', 'api-key']);
    assert.equal(r.code, 0, r.stderr);
    const list = files(to);
    assert.ok(list.includes('round.json'));
    assert.ok(list.includes('tdd/tdd-simple-a/broken/1/result.json'));
    assert.ok(list.includes('judge/bug-fix/fix-complex-a.verdict.txt'));
    assert.ok(list.includes('owner/map.json') && list.includes('owner/grades-tdd.txt'));
    assert.equal(list.filter((f) => f.endsWith('/result.json')).length, 14);
    const rj = JSON.parse(readFileSync(join(to, 'round.json'), 'utf8'));
    assert.equal(rj.format, 'skills-bench-results/1');
    assert.deepEqual([rj.claudeVersion, rj.auth, rj.currency, rj.model, rj.judgeModel], ['9.9.9 (Fake Claude)', 'api-key', 'USD', 'fake-model', 'fake-judge']);
    assert.deepEqual([rj.capMicros, rj.spentMicros, rj.n, rj.calibration], [20_000_000, 820_000, 1, false]);
    assert.deepEqual(rj.modelsReported, ['fake-model']);
    assert.match(rj.variantSources['tdd/broken'], /^tests\/fixtures\/skills-bench\/runner\/variants\/tdd-broken at [0-9a-f]{12}/);
    assert.deepEqual(rj.tasks.map((t) => t.status), Array(6).fill('done'));
    assert.deepEqual(Object.keys(rj.tasks[0]), ['skill', 'task', 'difficulty', 'variants', 'status', 'runsPlanned', 'runsMade', 'hardStopMicros']);
    for (const f of list) {
      const text = readFileSync(join(to, f), 'utf8');
      assert.ok(!text.includes(ECHO), `${f} holds an environment value`);
      assert.doesNotMatch(text, /[\w.]+@[\w-]+\.[\w.]+/, `${f} holds an email`);
      assert.ok(!text.includes(tmpdir() + '/') && !text.includes(process.env.HOME + '/'), `${f} holds a machine path`);
    }
    const verdict = readFileSync(join(to, 'judge', 'tdd', 'tdd-simple-a.verdict.txt'), 'utf8');
    assert.match(verdict, /^Notes kept by <(env|key)>; write to <email>$/m);
  });

  test('records "unknown" when claude is missing', () => {
    const to = join(scratch(), 'out');
    const r = bench(['export', '--round', round, '--to', to, '--auth', 'unknown'], { env: { SKILL_EVAL_CLAUDE: join(scratch(), 'no-such-claude') } });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(JSON.parse(readFileSync(join(to, 'round.json'), 'utf8')).claudeVersion, 'unknown');
  });

  test('fails on a temporary path planted in a run result, and leaves nothing behind', () => {
    const f = join(round, 'results', 'tdd', 'tdd-simple-a', 'with', '1', 'result.json');
    const x = JSON.parse(readFileSync(f, 'utf8'));
    writeFileSync(f, JSON.stringify({ ...x, gradeError: 'see /tmp/planted/notes for the reason' }, null, 2));
    const to = join(scratch(), 'out');
    const r = bench(['export', '--round', round, '--to', to, '--auth', 'login']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^failed: a temporary or home path is left in the export, so its files were removed from .*out:$/m);
    assert.match(r.stderr, /^ {2}tdd\/tdd-simple-a\/with\/1\/result\.json: line \d+ has \/tmp$/m);
    assert.deepEqual(existsSync(to) ? files(to) : [], []);
  });
});
