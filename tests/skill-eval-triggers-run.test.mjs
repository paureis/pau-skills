// The skill-eval triggers command against real folders, with a stand-in for `claude` (no model is called): the plan
// and the estimate, every refusal, a full round, the cost guard and the baseline. The last test checks that nothing
// was written inside the repository.
import { scratch } from './skill-eval.helpers.mjs';
import { TFIX, SKILLS, ALSO, writeLists, writeSkill, base, trig, flag } from './skill-eval-triggers.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, symlinkSync, cpSync, realpathSync } from 'node:fs';
import { join, dirname, basename, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repo } from './helpers.mjs';
import { ALLOWED_ENV } from '../skills/verification/skill-eval/skill-eval.mjs';

const PLAN_LISTS = join(TFIX, 'plan-requests');
const ROUND_LISTS = join(TFIX, 'requests');
const ids = (r) => r.summary.runs.filter((x) => x.started !== null).map((x) => x.id);

describe('the plan', () => {
  test('--plan prints the counts and the estimate, and makes no call and writes nothing', () => {
    const r = trig(base(PLAN_LISTS, ['--also', ALSO, '--plan']));
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Skills under test: 2 \(2 with a list\): pack-boxes, tidy-notes/);
    assert.match(r.stdout, /Also installed: 1: water-plants/);
    assert.match(r.stdout, /Requests: 9 \(6 should, 3 near misses\) in 2 lists/);
    assert.match(r.stdout, /Repeats: 2/);
    assert.match(r.stdout, /Runs: 9 requests x 2 = 18/);
    assert.match(r.stdout, /Estimate: \$1\.44 \(18 runs x \$0\.08\)/);
    assert.match(r.stdout, /Cap: \$5\.00/);
    assert.equal(r.calls.length + r.auth.length, 0, 'no claude call, not even auth status');
    assert.ok(!existsSync(r.lab), 'nothing written');
    assert.deepEqual(readdirSync(r.tmp), [], 'no run root');
    const dear = trig(base(PLAN_LISTS, ['--also', ALSO, '--plan', '--usd-per-run', '0.1']));
    assert.match(dear.stdout, /Estimate: \$1\.80 \(18 runs x \$0\.10\)/);
  });

  test('an estimate over the cap is refused before any call; with --plan it says so and exits 0', () => {
    const over = trig(base(PLAN_LISTS, ['--also', ALSO, '--max-usd', '1.43']));
    assert.equal(over.code, 1);
    assert.match(over.stderr, /estimate \$1\.44 passes the cap \$1\.43.*raise --max-usd or lower --repeats/);
    assert.equal(over.calls.length + over.auth.length, 0);
    assert.ok(!existsSync(over.lab));
    const planned = trig(base(PLAN_LISTS, ['--also', ALSO, '--max-usd', '1.43', '--plan']));
    assert.equal(planned.code, 0);
    assert.match(planned.stdout, /would be refused: the estimate \$1\.44 passes the cap/);
    const exact = trig(base(PLAN_LISTS, ['--also', ALSO, '--max-usd', '1.44', '--plan']));
    assert.equal(exact.code, 0);
    assert.doesNotMatch(exact.stdout, /refused/, 'an estimate equal to the cap is allowed');
  });
});

describe('refusals', () => {
  test('discovery: a SKILL.md with no name or a bad name, a name twice, a folder that does not exist', () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy my notes'] } });
    const cases = [
      ['no name', (d) => writeSkill(join(d, 'nameless'), null), /nameless.SKILL\.md has no name/],
      ['bad name', (d) => writeSkill(join(d, 'shouty'), 'Shouty_Name'), /shouty.SKILL\.md.*Shouty_Name/],
      ['twice', (d) => writeSkill(join(d, 'again'), 'tidy-notes'), /again.SKILL\.md.*tidy-notes.*twice|tidy-notes.*twice.*again.SKILL\.md/],
    ];
    for (const [name, make, re] of cases) {
      const extra = scratch();
      make(extra);
      const r = trig(base(lists, ['--also', extra, '--plan']));
      assert.equal(r.code, 1, name);
      assert.match(r.stderr, re, name);
    }
    const gone = join(scratch(), 'missing');
    const r = trig(base(lists, ['--also', gone, '--plan']));
    assert.equal(r.code, 1);
    assert.match(r.stderr, new RegExp(`${gone.split(sep).pop()}.*does not exist`));
  });

  test('discovery skips a SKILL.md inside a skill folder, in a dot folder and in node_modules', () => {
    const dir = scratch();
    writeSkill(join(dir, 'one'), 'one');
    writeSkill(join(dir, 'one', 'inner'), 'inner');
    writeSkill(join(dir, '.hidden', 'x'), 'hidden');
    writeSkill(join(dir, 'node_modules', 'y'), 'dep');
    writeSkill(join(dir, 'group', 'two'), 'two');
    const lists = writeLists({ one: { should: ['say one'] } });
    const r = trig(['--skills', dir, '--requests', lists, '--model', 'm', '--max-usd', '1', '--plan']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Skills under test: 2 \(1 with a list\): one, two\n/);
  });

  test('lists: every malformed or contradicting list is refused, naming its file', () => {
    const cases = [
      ['not JSON', '{ nope'],
      ['no should array', { skill: 'tidy-notes', should: 'tidy', nearMisses: [] }],
      ['no requests', { skill: 'tidy-notes', should: [], nearMisses: [] }],
      ['a near miss without expect', { skill: 'tidy-notes', should: [], nearMisses: [{ request: 'x y' }] }],
      ['skill not under test', { skill: 'water-plants', should: ['water it'], nearMisses: [] }],
      ['expect not installed', { skill: 'tidy-notes', should: [], nearMisses: [{ request: 'x y', expect: 'nobody' }] }],
      ['expects its own skill', { skill: 'tidy-notes', should: [], nearMisses: [{ request: 'x y', expect: 'tidy-notes' }] }],
      ['empty request', { skill: 'tidy-notes', should: ['  '], nearMisses: [] }],
      ['line break', { skill: 'tidy-notes', should: ['tidy\nnotes'], nearMisses: [] }],
      ['a typed name', { skill: 'tidy-notes', should: ['/tidy-notes go'], nearMisses: [] }],
      ['a dash', { skill: 'tidy-notes', should: ['-p tidy'], nearMisses: [] }],
    ];
    for (const [name, list] of cases) {
      const dir = join(scratch(), 'requests');
      mkdirSync(dir);
      writeFileSync(join(dir, 'odd-list.json'), typeof list === 'string' ? list : JSON.stringify(list));
      const r = trig(base(dir, ['--also', ALSO, '--plan']));
      assert.equal(r.code, 1, name);
      assert.match(r.stderr, /odd-list\.json/, name);
    }
    const two = writeLists({ 'tidy-notes': { should: ['tidy a'] } });
    writeFileSync(join(two, 'second.json'), JSON.stringify({ skill: 'tidy-notes', should: ['tidy b'], nearMisses: [] }));
    const twice = trig(base(two, ['--plan']));
    assert.equal(twice.code, 1);
    assert.match(twice.stderr, /second\.json|tidy-notes\.json/);
    const empty = join(scratch(), 'requests');
    mkdirSync(empty);
    writeFileSync(join(empty, 'notes.txt'), 'not a list');
    const none = trig(base(empty, ['--plan']));
    assert.equal(none.code, 1);
    assert.match(none.stderr, /no lists/);
    const ok = writeLists({ 'tidy-notes': { should: ['tidy a'], nearMisses: [{ request: 'water it', expect: 'water-plants' }, { request: 'hello', expect: 'none' }] } });
    assert.equal(trig(base(ok, ['--also', ALSO, '--plan'])).code, 0, 'an --also skill and none are accepted');
  });

  test('a lab holding summary.json, or inside a --skills, --also or --requests folder (copies), is refused', () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a'] } });
    const used = join(scratch(), 'lab');
    mkdirSync(used);
    writeFileSync(join(used, 'summary.json'), '{}');
    for (const extra of [[], ['--plan']]) {
      const r = trig(base(lists, extra), { lab: used });
      assert.equal(r.code, 1);
      assert.match(r.stderr, /summary\.json/);
      assert.equal(r.calls.length + r.auth.length, 0);
    }
    const skills = join(scratch(), 'skills');
    cpSync(SKILLS, skills, { recursive: true });
    const also = join(scratch(), 'also');
    cpSync(ALSO, also, { recursive: true });
    const requests = join(scratch(), 'requests');
    cpSync(ROUND_LISTS, requests, { recursive: true });
    for (const lab of [join(skills, 'lab'), join(also, 'water-plants', 'lab'), join(requests, 'lab')]) {
      const r = trig(['--skills', skills, '--also', also, '--requests', requests, '--model', 'm', '--max-usd', '5'], { lab });
      assert.equal(r.code, 1, lab);
      assert.match(r.stderr, /inside/, lab);
      assert.equal(r.calls.length + r.auth.length, 0, lab);
      assert.ok(!existsSync(lab), lab);
    }
  });

  test('a run root below a CLAUDE.md (directly or through a link), or with a meta word in its path, is refused', () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a'] } });
    const above = scratch();
    writeFileSync(join(above, 'CLAUDE.md'), '# rules\n');
    const below = join(above, 'below');
    mkdirSync(below);
    const link = join(scratch(), 'ln');
    symlinkSync(below, link);
    const meta = join(scratch(), 'scoring');
    mkdirSync(meta);
    for (const [tmp, re] of [[below, /CLAUDE\.md/], [link, /CLAUDE\.md/], [meta, /"score"/]]) {
      const r = trig(base(lists), { tmp });
      assert.equal(r.code, 1, tmp);
      assert.match(r.stderr, re, tmp);
      assert.equal(r.calls.length + r.auth.length, 0, tmp);
      assert.deepEqual(readdirSync(tmp), [], 'the root is removed');
    }
  });

  test('a failed login check refuses with no run, and leaves the temporary folder empty', () => {
    const tmp = scratch();
    const r = trig(base(ROUND_LISTS, ['--also', ALSO]), { tmp, env: { FAKE_TRIGGERS_LOGGED_OUT: join(tmp, 'h-') } });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /logged in.*--real-home/s);
    assert.equal(r.calls.length, 0);
    assert.ok(r.auth.length >= 1);
    assert.deepEqual(readdirSync(tmp), []);
    assert.equal(r.summary, null);
  });

  test('--baseline: a missing file or one without format 1 is refused before any call', () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a'] } });
    const wrong = join(scratch(), 'old.json');
    writeFileSync(wrong, JSON.stringify({ format: 2, runs: [] }));
    const broken = join(scratch(), 'broken.json');
    writeFileSync(broken, '{');
    for (const [file, extra] of [[join(scratch(), 'gone.json'), []], [wrong, []], [wrong, ['--plan']], [broken, []]]) {
      const r = trig(base(lists, ['--baseline', file, ...extra]));
      assert.equal(r.code, 1, file);
      assert.match(r.stderr, /baseline/, file);
      assert.equal(r.calls.length + r.auth.length, 0, file);
    }
  });
});

describe('a round', () => {
  test('a full round: the exact arguments, a clean environment, an empty HOME, a fresh folder per run, the summary and the report', () => {
    const r = trig(base(ROUND_LISTS, ['--also', ALSO, '--parallel', '1']));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.calls.length, 20);
    const cwds = new Set();
    for (const c of r.calls) {
      assert.deepEqual(c.argv, ['-p', c.prompt, '--max-turns', '1', '--output-format', 'stream-json', '--verbose', '--model', 'some-model',
        '--setting-sources', 'project', '--strict-mcp-config', '--no-session-persistence', '--max-budget-usd', '0.16']);
      const extra = c.names.filter((n) => !ALLOWED_ENV.includes(n) && !/^LC_/.test(n) && !/^FAKE_TRIGGERS_/.test(n) && !['HOME', '__CF_USER_TEXT_ENCODING'].includes(n));
      assert.deepEqual(extra, [], 'only the allowlist and the passed names reach a run');
      assert.ok(c.names.includes('HTTPS_PROXY'));
      assert.equal(basename(c.cwd), 'project');
      // A run reports its real working folder; the temporary folder may be a link (macOS), so compare it resolved.
      assert.ok(c.cwd.startsWith(realpathSync(r.tmp) + sep), 'under the temporary folder');
      assert.equal(c.home, join(dirname(c.cwd), 'home'));
      assert.deepEqual(c.homeList, [], 'an empty HOME');
      assert.deepEqual(c.skills, ['pack-boxes', 'tidy-notes', 'water-plants']);
      assert.deepEqual(c.rootList, [basename(dirname(c.cwd))], 'the root holds only this run\'s folder');
      assert.match(basename(dirname(c.cwd)), /^tmp\./);
      cwds.add(c.cwd);
    }
    assert.equal(cwds.size, 20, 'a fresh folder per run');
    assert.deepEqual(readdirSync(r.tmp), [], 'the root and the login folders are gone');

    const s = r.summary;
    assert.equal(s.format, 1);
    assert.equal(s.model, 'some-model');
    assert.equal(s.repeats, 2);
    assert.ok(!Number.isNaN(Date.parse(s.at)));
    assert.deepEqual(s.skills, ['pack-boxes', 'tidy-notes']);
    assert.deepEqual(s.also, ['water-plants']);
    assert.deepEqual([s.capMicros, s.usdPerRunMicros, s.estimateMicros, s.costMicros, s.runsPlanned, s.runsMade], [5_000_000, 80_000, 1_600_000, 1_000_000, 20, 20]);
    assert.deepEqual(s.runs.slice(0, 5).map((x) => x.id), ['pack-boxes-s1-r1', 'pack-boxes-s2-r1', 'pack-boxes-s3-r1', 'pack-boxes-n1-r1', 'pack-boxes-n2-r1']);
    assert.equal(s.runs[10].id, 'pack-boxes-s1-r2');
    const plugin = s.runs.find((x) => x.id === 'tidy-notes-s2-r1');
    assert.deepEqual({ ...plugin, notes: undefined }, {
      id: 'tidy-notes-s2-r1', list: 'tidy-notes', kind: 'should', index: 2, repeat: 1, request: 'plugin tidy the notes', expect: 'tidy-notes',
      started: 'tidy-notes', firstTool: 'Skill', costMicros: 50_000, result: 'error_max_turns', finished: true, notes: undefined,
    });
    for (const x of s.runs) assert.ok(existsSync(join(r.lab, 'runs', `${x.id}.jsonl`)), x.id);
    assert.deepEqual([s.perSkill['tidy-notes'].hits, s.perSkill['tidy-notes'].shouldRuns, s.perSkill['tidy-notes'].misses.length, s.perSkill['tidy-notes'].wrongStarts.length], [4, 6, 2, 3]);
    assert.deepEqual([s.perSkill['pack-boxes'].hits, s.perSkill['pack-boxes'].shouldRuns, s.perSkill['pack-boxes'].misses.length, s.perSkill['pack-boxes'].wrongStarts.length], [2, 6, 4, 0]);
    assert.equal(s.perSkill.verify.wrongStarts.length, 2);
    assert.equal(s.perSkill['water-plants'].wrongStarts.length, 0, 'a start that was right still lists the skill');
    assert.deepEqual([s.nearMisses.right, s.nearMisses.total], [5, 8]);
    assert.deepEqual(s.unsteady.map((u) => u.request), ['coin toss for the notes']);
    assert.deepEqual(s.missKinds, { answered: 2, lookedFirst: 2, byTool: { Read: 2 } });

    assert.match(r.stdout, /Cost: \$1\.00 spent, estimate \$1\.60, cap \$5\.00; 20 of 20 runs made/);
    assert.match(r.stdout, /tidy-notes: hits 4 of 6; misses 2: none after Read, none after Read; wrong starts 3/);
    assert.match(r.stdout, /pack-boxes: hits 2 of 6; misses 4/);
    assert.match(r.stdout, /Near misses right: 5 of 8/);
    assert.match(r.stdout, /wrong: tidy-notes-n2-r1 started verify, expected none/);
    assert.match(r.stdout, /Unsteady requests: 1\n {2}pack-boxes nearMiss 2: tidy-notes \/ none: "coin toss for the notes"/);
    assert.match(r.stdout, /Should runs that started nothing: 2 answered or did nothing, 2 looked first \(Read 2\)/);
    assert.match(r.stdout, /Summary: .*summary\.json/);
  });

  test('--real-home runs with your HOME', () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a'] } });
    const home = scratch();
    const r = trig(base(lists, ['--real-home', '--repeats', '1']), { env: { HOME: home } });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].home, home);
    for (const a of r.auth) assert.equal(a.home, home);
  });

  test('a skill missing from the init list gets a note; a nonzero exit with a result line gets a note but does not fail', () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a'] }, 'pack-boxes': { should: ['pack b'] } });
    const dropped = trig(base(lists, ['--repeats', '1']), { env: { FAKE_TRIGGERS_DROP: 'pack-boxes' } });
    assert.equal(dropped.code, 0, dropped.stderr);
    for (const x of dropped.summary.runs) assert.match(x.notes.join(';'), /skills list lacks pack-boxes/, x.id);
    assert.match(dropped.stdout, /tidy-notes-s1-r1: .*skills list lacks pack-boxes/);
    const exit1 = trig(base(lists, ['--repeats', '1']), { env: { FAKE_TRIGGERS_EXIT1: '1' } });
    assert.equal(exit1.code, 0, exit1.stderr);
    assert.equal(exit1.summary.runs[0].started, 'pack-boxes');
    assert.match(exit1.summary.runs[0].notes.join(';'), /exit 1/);
    assert.match(exit1.stdout, /pack-boxes-s1-r1: exit 1/);
  });

  test('--baseline prints what got better or worse after the report', () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy b'] } });
    const old = join(scratch(), 'old.json');
    const run = (request, started) => ({ id: 'x', list: 'tidy-notes', kind: 'should', index: 1, repeat: 1, request, expect: 'tidy-notes', started, finished: true });
    writeFileSync(old, JSON.stringify({ format: 1, perSkill: { 'tidy-notes': { hits: 0, wrongStarts: [] } }, runs: [run('tidy a', 'none'), run('gone one', 'none')] }));
    const r = trig(base(lists, ['--repeats', '1', '--baseline', old]));
    assert.equal(r.code, 0, r.stderr);
    const tail = r.stdout.slice(r.stdout.indexOf('Compared with'));
    assert.ok(r.stdout.indexOf('Compared with') > r.stdout.indexOf('Near misses right'), 'after the report');
    assert.match(tail, /better: tidy-notes hits 0 -> 2/);
    assert.match(tail, /better: tidy-notes should "tidy a": right 0 of 1 -> 1 of 1/);
    assert.match(tail, /new: tidy-notes should "tidy b"/);
    assert.match(tail, /gone: tidy-notes should "gone one"/);
  });
});

describe('the cost guard', () => {
  const three = () => writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy b', 'tidy c'] } });

  test('S1: the price rises to the real cost, and the round stops before it would pass the cap', () => {
    const r = trig(base(three(), ['--max-usd', '1', '--parallel', '1']), { env: { FAKE_TRIGGERS_COST: '0.30' } });
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 3);
    assert.deepEqual(ids(r), ['tidy-notes-s1-r1', 'tidy-notes-s2-r1', 'tidy-notes-s3-r1']);
    assert.deepEqual(r.calls.map((c) => flag(c, '--max-budget-usd')), ['0.16', '0.6', '0.6']);
    assert.equal(r.summary.costMicros, 900_000);
    assert.equal(r.summary.runsMade, 3);
    assert.equal(r.summary.runsPlanned, 6);
    assert.equal(r.summary.perSkill['tidy-notes'].shouldRuns, 3);
    assert.equal(r.summary.runs.filter((x) => x.result === 'not run (cap)').length, 3);
    assert.match(r.stdout, /Not run \(cap\): 3: tidy-notes-s1-r2, tidy-notes-s2-r2, tidy-notes-s3-r2/);
    assert.match(r.stderr, /cap/);
  });

  test('S2: a run that brings the spend to exactly the cap still starts', () => {
    const r = trig(base(three(), ['--max-usd', '0.9', '--parallel', '1']), { env: { FAKE_TRIGGERS_COST: '0.30' } });
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 3);
    assert.equal(r.summary.costMicros, 900_000);
  });

  test('S3: the runs in flight count against the cap', () => {
    const six = writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy b', 'tidy c', 'tidy d', 'tidy e', 'tidy f'] } });
    const r = trig(base(six, ['--max-usd', '1', '--parallel', '3']), { env: { FAKE_TRIGGERS_COST: '0.30' } });
    assert.equal(r.code, 1);
    assert.equal(r.summary.runsPlanned, 12);
    assert.equal(r.calls.length, 3);
    assert.ok(r.summary.costMicros <= 1_000_000, String(r.summary.costMicros));
  });

  test('S4: a run that prints no cost is charged what it reserved, and fails', () => {
    const one = writeLists({ 'tidy-notes': { should: ['tidy a'] } });
    const r = trig(base(one, ['--max-usd', '1', '--parallel', '1']), { env: { FAKE_TRIGGERS_FAIL: '1' } });
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 2);
    assert.equal(r.summary.costMicros, 160_000);
    for (const x of r.summary.runs) assert.match(x.notes.join(';'), /no result line/);
    assert.equal(r.summary.perSkill['tidy-notes'].shouldRuns, 0, 'a failed run that started nothing is not counted');
  });

  test('S5: when the next run does not fit while others run, it waits for one to end and checks again', () => {
    const four = writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy slowly cheaply', 'tidy c', 'tidy d'] } });
    const r = trig(base(four, ['--usd-per-run', '0.1', '--max-usd', '0.5', '--parallel', '2', '--repeats', '1']), { env: { FAKE_TRIGGERS_COST: '0.20' } });
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 3);
    assert.equal(r.summary.costMicros, 410_000);
    assert.deepEqual(ids(r), ['tidy-notes-s1-r1', 'tidy-notes-s2-r1', 'tidy-notes-s3-r1']);
  });

  test('S6: only one run starts until a real cost is known', () => {
    const r = trig(base(three(), ['--max-usd', '0.3', '--parallel', '3', '--repeats', '1']), { env: { FAKE_TRIGGERS_COST: '0.30' } });
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 1);
    assert.equal(r.summary.costMicros, 300_000);
  });

  test('the price is never lowered by a cheaper run', () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy cheaply b', 'tidy c'] } });
    const r = trig(base(lists, ['--parallel', '1', '--repeats', '1']), { env: { FAKE_TRIGGERS_COST: '0.30' } });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.calls.map((c) => [c.prompt, flag(c, '--max-budget-usd')]), [['tidy a', '0.16'], ['tidy cheaply b', '0.6'], ['tidy c', '0.6']]);
    assert.equal(r.summary.costMicros, 610_000);
  });
});

test('nothing above writes inside the repository', () => {
  const status = spawnSync('git', ['-C', repo(), 'status', '--porcelain', '--', 'tests/fixtures/skill-eval-triggers'], { encoding: 'utf8' }).stdout;
  assert.doesNotMatch(status, /answered\.txt|\.seen|summary\.json|\.jsonl/);
  for (const name of ['tidy-notes', 'pack-boxes']) {
    assert.doesNotMatch(readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8'), /INSTALLED COPY/, name);
  }
  assert.doesNotMatch(readFileSync(join(ALSO, 'water-plants', 'SKILL.md'), 'utf8'), /INSTALLED COPY/);
});
