// How a skill-eval triggers round runs, with a stand-in for `claude` (no model is called). The cost guard: a run starts
// only when what was spent, plus the hard stops of the runs in flight, plus its own hard stop (twice the price) stays
// within the cap; the numbers were checked with a simulation of the rule and of each wrong rule, so each wrong rule
// lands on a different count or sum. Then a run that fails before it starts, --timeout-min reaching each run, and what
// each run gets installed.
import { scratch } from './skill-eval.helpers.mjs';
import { TFIX, SKILLS, writeLists, writeSkill, base, trig, flag, ids } from './skill-eval-triggers.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, symlinkSync } from 'node:fs';
import { join, sep } from 'node:path';
import { oneRun } from '../skills/verification/skill-eval/skill-eval-triggers.mjs';

const three = () => writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy b', 'tidy c'] } });
const COST = (usd) => ({ env: { FAKE_TRIGGERS_COST: usd } });

describe('the cost guard', () => {
  test('S1: the hard stop rises with the real cost, and the round stops before it could pass the cap', () => {
    const r = trig(base(three(), ['--usd-per-run', '0.05', '--max-usd', '0.95', '--parallel', '1']), COST('0.20'));
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 3, 'reserving the price would make 4, a price that never rises 5');
    assert.deepEqual(ids(r), ['tidy-notes-s1-r1', 'tidy-notes-s2-r1', 'tidy-notes-s3-r1']);
    assert.deepEqual(r.calls.map((c) => flag(c, '--max-budget-usd')), ['0.1', '0.4', '0.4']);
    assert.equal(r.summary.costMicros, 600_000);
    assert.deepEqual([r.summary.runsMade, r.summary.runsPlanned], [3, 6]);
    assert.equal(r.summary.perSkill['tidy-notes'].shouldRuns, 3);
    assert.equal(r.summary.runs.filter((x) => x.result === 'not run (cap)').length, 3);
    assert.match(r.stdout, /Not run \(cap\): 3: tidy-notes-s1-r2, tidy-notes-s2-r2, tidy-notes-s3-r2/);
    assert.match(r.stderr, /stopped at the cap/);
    assert.doesNotMatch(r.stdout, /above the cap/);
  });

  test('S2: a run whose hard stop brings the total to exactly the cap still starts', () => {
    const r = trig(base(three(), ['--usd-per-run', '0.05', '--max-usd', '1', '--parallel', '1']), COST('0.20'));
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 4);
    assert.equal(r.summary.costMicros, 800_000);
  });

  test('S3: the hard stops of the runs in flight count against the cap', () => {
    const six = writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy b', 'tidy c', 'tidy d', 'tidy e', 'tidy f'] } });
    const r = trig(base(six, ['--usd-per-run', '0.05', '--max-usd', '1', '--parallel', '3']), COST('0.20'));
    assert.equal(r.code, 1);
    assert.equal(r.summary.runsPlanned, 12);
    assert.equal(r.calls.length, 4, 'ignoring the runs in flight would make 6');
    assert.equal(r.summary.costMicros, 800_000);
  });

  test('S4: a run that started and printed no cost is charged its hard stop, and fails', () => {
    const one = writeLists({ 'tidy-notes': { should: ['tidy a'] } });
    const r = trig(base(one, ['--max-usd', '1', '--parallel', '1']), { env: { FAKE_TRIGGERS_FAIL: '1' } });
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 2);
    assert.equal(r.summary.costMicros, 320_000);
    for (const x of r.summary.runs) assert.match(x.notes.join(';'), /no result line/);
    assert.equal(r.summary.perSkill['tidy-notes'].shouldRuns, 0, 'a failed run that started nothing is not counted');
  });

  test('S5: runs overlap, and a run that does not fit waits for one in flight to end', () => {
    const four = writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy slowly cheaply', 'tidy c', 'tidy d'] } });
    const r = trig(base(four, ['--usd-per-run', '0.1', '--max-usd', '0.5', '--parallel', '3', '--repeats', '1']), COST('0.05'));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.calls.length, 4, 'stopping instead of waiting would make 3');
    assert.equal(r.summary.costMicros, 160_000);
    const at = (p) => r.calls.find((c) => c.prompt === p);
    const [slow, c, d] = ['tidy slowly cheaply', 'tidy c', 'tidy d'].map(at);
    assert.ok(c.at < slow.end, 'tidy c started while tidy slowly cheaply was still running');
    assert.ok(d.at >= c.end, 'tidy d waited for tidy c to end');
    assert.ok(d.at < slow.end, 'and did not wait for every run to end');
  });

  test('S6: only one run starts until a real cost is known', () => {
    const r = trig(base(three(), ['--max-usd', '0.5', '--parallel', '3', '--repeats', '1']), COST('0.30'));
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 1, 'three would start at once without the wait');
    assert.equal(r.summary.costMicros, 300_000);
  });

  test('the price is never lowered by a cheaper run', () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy cheaply b', 'tidy c'] } });
    const r = trig(base(lists, ['--parallel', '1', '--repeats', '1']), COST('0.30'));
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.calls.map((c) => [c.prompt, flag(c, '--max-budget-usd')]), [['tidy a', '0.16'], ['tidy cheaply b', '0.6'], ['tidy c', '0.6']]);
    assert.equal(r.summary.costMicros, 610_000);
  });

  test('runs that each spend their whole hard stop, five at a time, end at or under the cap', () => {
    const ten = writeLists({ 'tidy-notes': { should: Array.from({ length: 10 }, (_, i) => `tidy ${i}`) } });
    const r = trig(base(ten, ['--max-usd', '1', '--parallel', '5', '--repeats', '1']), COST('stop'));
    assert.equal(r.code, 1);
    assert.ok(r.summary.costMicros <= 1_000_000, String(r.summary.costMicros));
    assert.equal(r.summary.costMicros, 800_000, 'reserving the price instead would spend 1760000');
    assert.doesNotMatch(r.stdout, /above the cap/);
  });

  test('a run that costs more than its hard stop and passes the cap is reported, and the round exits 1', () => {
    const one = writeLists({ 'tidy-notes': { should: ['tidy a'] } });
    const r = trig(base(one, ['--max-usd', '1', '--parallel', '1']), COST('1.50'));
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 1);
    assert.equal(r.summary.costMicros, 1_500_000);
    assert.match(r.stdout, /Above the cap by \$0\.50/);
    assert.match(r.stderr, /above the cap by \$0\.50/);
  });
});

describe('a run that fails before it starts', () => {
  test('is a failed run that costs nothing; the round goes on, waits for the runs in flight, and writes the summary', () => {
    const skills = join(scratch(), 'skills');
    cpSync(SKILLS, skills, { recursive: true });
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy sabotage slowly', 'tidy c pause', 'tidy d', 'tidy e'] } });
    const r = trig(['--skills', skills, '--requests', lists, '--model', 'm', '--max-usd', '5', '--parallel', '2', '--repeats', '1'],
      { env: { FAKE_TRIGGERS_BREAK: join(skills, 'pack-boxes') } });
    assert.equal(r.code, 1);
    assert.ok(r.summary, 'summary.json is written');
    assert.equal(r.calls.length, 3, 'tidy d and tidy e could not copy pack-boxes, so never started claude');
    assert.equal(r.summary.runsMade, 5);
    assert.equal(r.summary.costMicros, 150_000, 'the two runs that never started cost nothing');
    const sabotage = r.calls.find((c) => c.prompt === 'tidy sabotage slowly');
    assert.equal(sabotage.cwdAtEnd, true, 'its folder was still there when it ended');
    assert.equal(r.summary.runs.find((x) => x.request === 'tidy sabotage slowly').finished, true);
    for (const id of ['tidy-notes-s4-r1', 'tidy-notes-s5-r1']) {
      const x = r.summary.runs.find((y) => y.id === id);
      assert.equal(x.finished, false, id);
      assert.match(x.notes.join(';'), /failed before claude started: .*ENOENT/, id);
    }
    assert.match(r.stdout, /Cost: \$0\.15 spent/);
    assert.match(r.stdout, /tidy-notes-s4-r1: failed before claude started/);
    assert.match(r.stderr, /2 run\(s\) failed/);
    assert.deepEqual(readdirSync(r.tmp), [], 'the root is removed after every run ended');
  });

  test('each run gets --timeout-min, and a runner that never started costs nothing', async () => {
    const root = scratch();
    const lab = scratch();
    mkdirSync(join(lab, 'runs'));
    const seen = [];
    const runner = async (run, argv, opts) => {
      seen.push(opts.timeoutMin, argv.at(-1));
      writeFileSync(join(lab, 'runs', `${run.id}.jsonl`), '');
      return { exit: null, error: 'spawn ENOENT' };
    };
    const run = { id: 'tidy-notes-s1-r1', list: 'tidy-notes', kind: 'should', index: 1, repeat: 1, request: 'tidy a', expect: 'tidy-notes' };
    const o = { model: 'm', timeoutMin: 7, passEnv: [], realHome: false };
    const installed = new Map([['tidy-notes', join(SKILLS, 'tidy-notes')]]);
    const entry = await oneRun(run, { root, lab, o, installed, stop: 160_000, runner });
    assert.deepEqual(seen, [7, '0.16']);
    assert.equal(entry.spawned, false);
    assert.equal(entry.finished, false);
    assert.match(entry.notes.join(';'), /spawn ENOENT/);
    assert.deepEqual(readdirSync(root), [], 'its folder is removed');
  });
});

describe('what a run gets installed', () => {
  test('a skill folder reached through a link is found, and each run gets its real files', { skip: process.platform === 'win32' }, () => {
    const real = scratch();
    writeSkill(join(real, 'linked-skill'), 'linked-skill');
    writeFileSync(join(real, 'shared.md'), 'shared\n');
    symlinkSync(join(real, 'shared.md'), join(real, 'linked-skill', 'shared.md'));
    const skills = scratch();
    symlinkSync(join(real, 'linked-skill'), join(skills, 'via-link'));
    symlinkSync(skills, join(skills, 'loop'));
    const lists = writeLists({ 'linked-skill': { should: ['say hi'] } });
    const r = trig(['--skills', skills, '--requests', lists, '--model', 'm', '--max-usd', '5', '--repeats', '1']);
    assert.equal(r.code, 0, r.stderr);
    const [c] = r.calls;
    assert.deepEqual(c.skills, ['linked-skill']);
    assert.deepEqual(c.links, [], 'real files, no links back to the source');
    assert.ok(c.files.includes(join('linked-skill', 'shared.md')));
    assert.doesNotMatch(readFileSync(join(real, 'linked-skill', 'SKILL.md'), 'utf8'), /INSTALLED COPY/, 'the source is untouched');
  });

  test('each skill is installed under its frontmatter name, with its files and without .git', () => {
    const skills = join(scratch(), 'skills');
    cpSync(SKILLS, skills, { recursive: true });
    mkdirSync(join(skills, 'tidy-notes', '.git'));
    writeFileSync(join(skills, 'tidy-notes', '.git', 'HEAD'), 'ref: refs/heads/main\n');
    mkdirSync(join(skills, 'tidy-notes', 'notes'));
    writeFileSync(join(skills, 'tidy-notes', 'notes', 'ref.md'), 'kept\n');
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a'] } });
    const r = trig(['--skills', skills, '--also', join(TFIX, 'renamed'), '--requests', lists, '--model', 'm', '--max-usd', '5', '--repeats', '1']);
    assert.equal(r.code, 0, r.stderr);
    const [c] = r.calls;
    assert.deepEqual(c.skills, ['pack-boxes', 'renamed-skill', 'tidy-notes'], 'renamed-skill, not its folder some-folder');
    assert.ok(c.files.includes(join('tidy-notes', 'notes', 'ref.md')));
    assert.deepEqual(c.files.filter((f) => f.split(sep).includes('.git')), []);
  });
});
