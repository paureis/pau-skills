// skill-eval triggers, the pure parts: the options, money in micro-dollars, reading one transcript, the counting, the
// report text, the baseline comparison and the cost check. The command itself is in skill-eval-triggers-run.test.mjs.
import { SCRIPT } from './skill-eval.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runNode } from './helpers.mjs';
import { parseArgs, parseUsdMicros, microsArg, microsUsd } from '../skills/verification/skill-eval/skill-eval.mjs';
import { readRun, countRound, renderReport, compareBaseline } from '../skills/verification/skill-eval/skill-eval-triggers-count.mjs';
import { fits } from '../skills/verification/skill-eval/skill-eval-triggers.mjs';

const REQUIRED = ['--skills', 'skills', '--requests', 'requests', '--model', 'some-model', '--max-usd', '2'];

describe('triggers options', () => {
  test('the defaults, repeated --skills and --also, and --plan before another option', () => {
    const o = parseArgs(['triggers', 'lab', ...REQUIRED]);
    assert.equal(o.cmd, 'triggers');
    assert.equal(o.target, 'lab');
    assert.deepEqual(o.skills, ['skills']);
    assert.deepEqual(o.also, []);
    assert.equal(o.requests, 'requests');
    assert.equal(o.model, 'some-model');
    assert.equal(o.capMicros, 2_000_000);
    assert.equal(o.usdPerRunMicros, 80_000);
    assert.equal(o.repeats, 2);
    assert.equal(o.parallel, 3);
    assert.equal(o.timeoutMin, 5);
    assert.equal(o.plan, false);
    assert.equal(o.baseline, null);
    assert.deepEqual(o.passEnv, []);
    assert.equal(o.realHome, false);

    const many = parseArgs(['triggers', 'lab', '--plan', '--skills', 'a', '--skills', 'b', '--also', 'c', '--also', 'd',
      '--requests', 'r', '--model', 'm', '--max-usd', '0.5', '--usd-per-run', '0.1', '--repeats', '3', '--parallel', '1',
      '--timeout-min', '9', '--baseline', 'old.json', '--pass-env', 'ONE', 'TWO', '--real-home']);
    assert.equal(many.plan, true);
    assert.deepEqual(many.skills, ['a', 'b']);
    assert.deepEqual(many.also, ['c', 'd']);
    assert.equal(many.capMicros, 500_000);
    assert.equal(many.usdPerRunMicros, 100_000);
    assert.equal(many.repeats, 3);
    assert.equal(many.parallel, 1);
    assert.equal(many.timeoutMin, 9);
    assert.equal(many.baseline, 'old.json');
    assert.deepEqual(many.passEnv, ['ONE', 'TWO']);
    assert.equal(many.realHome, true);
  });

  test('refuses a missing required option, bad money and numbers out of range', () => {
    for (let i = 0; i < REQUIRED.length; i += 2) {
      const args = [...REQUIRED.slice(0, i), ...REQUIRED.slice(i + 2)];
      assert.throws(() => parseArgs(['triggers', 'lab', ...args]), new RegExp(`triggers needs ${REQUIRED[i]}`), REQUIRED[i]);
    }
    for (const bad of ['0.1234567', '1e3', '-1', 'abc', '0', '0.000000', '', '.5', '1.']) {
      for (const flag of ['--max-usd', '--usd-per-run']) {
        assert.throws(() => parseArgs(['triggers', 'lab', ...REQUIRED, flag, bad]), new RegExp(`${flag} takes`), `${flag} ${bad}`);
      }
    }
    for (const [flag, bad] of [['--repeats', '0'], ['--repeats', '11'], ['--parallel', '0'], ['--parallel', '11'],
      ['--timeout-min', '0'], ['--timeout-min', '61'], ['--repeats', '2.5']]) {
      assert.throws(() => parseArgs(['triggers', 'lab', ...REQUIRED, flag, bad]), new RegExp(flag), `${flag} ${bad}`);
    }
    assert.throws(() => parseArgs(['triggers', 'lab', ...REQUIRED, '--pass-env', 'NOT-A-NAME']), /--pass-env/);
    assert.throws(() => parseArgs(['triggers', 'lab', ...REQUIRED, '--force']), /unknown option --force/);
    const r = runNode(SCRIPT, { args: ['triggers', 'lab', '--skills', 'skills'] });
    assert.equal(r.code, 2);
  });

  test('the usage text lists triggers', () => {
    const r = runNode(SCRIPT, { args: [] });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /skill-eval\.mjs triggers <lab-dir> --skills <dir> .*--requests <dir> --model <model> --max-usd <x>/);
    assert.match(r.stderr, /--plan/);
  });
});

describe('money in micro-dollars', () => {
  test('reads dollars without a float and writes them back for the flag and for people', () => {
    assert.equal(parseUsdMicros('0.57'), 570_000);
    assert.equal(parseUsdMicros('1.005'), 1_005_000);
    assert.equal(parseUsdMicros('40'), 40_000_000);
    assert.equal(parseUsdMicros('0.000001'), 1);
    assert.equal(parseUsdMicros('1e3'), null);
    assert.equal(microsArg(80_000), '0.08');
    assert.equal(microsArg(300_000), '0.3');
    assert.equal(microsArg(40_000_000), '40');
    assert.equal(microsArg(1_005_000), '1.005');
    assert.equal(microsArg(1), '0.000001');
    assert.equal(microsUsd(1_234_999), '$1.23');
    assert.equal(microsUsd(1_235_000), '$1.24');
    assert.equal(microsUsd(0), '$0.00');
    assert.equal(microsUsd(40_000_000), '$40.00');
    assert.equal(microsUsd(4_999), '$0.00');
    assert.equal(microsUsd(5_000), '$0.01');
  });
});

// Transcript lines in the shape claude -p --output-format stream-json prints.
const init = (skills) => ({ type: 'system', subtype: 'init', skills });
const call = (name, input = {}, parent = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', id: `t-${name}`, name, input }] } });
const say = (text) => ({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text }] } });
const result = (cost, subtype = 'error_max_turns') => ({ type: 'result', subtype, total_cost_usd: cost });
const transcript = (...events) => `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;

describe('readRun', () => {
  test('the first Skill call of the main agent, after the last colon; a subagent call first is ignored, and the first one wins', () => {
    const x = readRun(transcript(init(['tidy-notes', 'verify']), call('Skill', { skill: 'helper-kit:water-plants' }, 'toolu_parent'),
      say('Let me look.'), call('Read', { file_path: 'notes.txt' }), call('Skill', { skill: 'moving-kit:pack-boxes' }),
      call('Skill', { skill: 'tidy-notes' }), result(0.0123456789)));
    assert.equal(x.started, 'pack-boxes');
    assert.equal(x.firstTool, 'Read');
    assert.equal(x.costMicros, 12346);
    assert.equal(x.subtype, 'error_max_turns');
    assert.deepEqual(x.skills, ['tidy-notes', 'verify']);
    assert.equal(x.finished, true);
  });

  test('a bare name, a built-in, none, and a skill that is not a non-empty string', () => {
    assert.equal(readRun(transcript(call('Skill', { skill: 'tidy-notes' }), result(0.1))).started, 'tidy-notes');
    assert.equal(readRun(transcript(call('Skill', { skill: 'verify' }), result(0.1))).started, 'verify');
    const looked = readRun(transcript(init([]), call('Bash', { command: 'ls' }), result(0.05, 'success')));
    assert.equal(looked.started, 'none');
    assert.equal(looked.firstTool, 'Bash');
    const quiet = readRun(transcript(init([]), say('Hello.'), result(0.05, 'success')));
    assert.equal(quiet.started, 'none');
    assert.equal(quiet.firstTool, null);
    assert.equal(quiet.subtype, 'success');
    for (const skill of [42, '', null]) {
      const odd = readRun(transcript(call('Skill', { skill }), call('Skill', { skill: 'tidy-notes' }), result(0.1)));
      assert.equal(odd.started, 'none', String(skill));
      assert.equal(odd.firstTool, 'Skill');
    }
  });

  test('no result line, a cost that is not a number, no init line and lines that are not JSON', () => {
    const cut = readRun(`not json\n${JSON.stringify(call('Skill', { skill: 'tidy-notes' }))}\n`);
    assert.equal(cut.finished, false);
    assert.equal(cut.costMicros, null);
    assert.equal(cut.subtype, null);
    assert.equal(cut.skills, null);
    assert.equal(cut.started, 'tidy-notes');
    assert.equal(readRun(transcript(result('0.05'))).costMicros, null);
    assert.equal(readRun('').started, 'none');
  });
});

// A runs entry as the command writes it; `finished: false` is a run with no result line, `started: null` a run not made.
function entry(list, kind, index, repeat, started, { expect = kind === 'should' ? list : 'none', firstTool = null, finished = true } = {}) {
  const k = kind === 'should' ? 's' : 'n';
  return {
    id: `${list}-${k}${index}-r${repeat}`, list, kind, index, repeat, request: `${list} ${kind} ${index}`, expect, started, firstTool,
    costMicros: started === null ? null : 50_000, result: started === null ? 'not run (cap)' : finished ? 'success' : 'no result line',
    finished: started === null ? false : finished, notes: [],
  };
}

const ROUND = [
  entry('tidy-notes', 'should', 1, 1, 'tidy-notes'),
  entry('tidy-notes', 'should', 1, 2, 'tidy-notes'),
  entry('tidy-notes', 'should', 2, 1, 'none', { firstTool: 'Read' }),
  entry('tidy-notes', 'should', 3, 1, 'pack-boxes', { firstTool: 'Skill' }),
  entry('tidy-notes', 'should', 4, 1, null),
  entry('tidy-notes', 'should', 5, 1, 'tidy-notes', { finished: false }),
  entry('tidy-notes', 'should', 6, 1, 'none', { finished: false }),
  entry('tidy-notes', 'nearMiss', 1, 1, 'pack-boxes', { expect: 'pack-boxes' }),
  entry('tidy-notes', 'nearMiss', 2, 1, 'none', { expect: 'water-plants' }),
  entry('tidy-notes', 'nearMiss', 3, 1, 'tidy-notes', { expect: 'none' }),
  entry('pack-boxes', 'should', 1, 1, 'none'),
  entry('pack-boxes', 'nearMiss', 1, 1, 'verify', { expect: 'none' }),
];

describe('countRound', () => {
  test('hits, misses with what started and the first tool, and the runs left out', () => {
    const c = countRound(ROUND);
    const tidy = c.perSkill['tidy-notes'];
    assert.equal(tidy.hits, 3, 'two runs of request 1 and the run with no result line that still started it');
    assert.equal(tidy.shouldRuns, 5, 'the run not made and the failed run that started nothing are left out');
    assert.deepEqual(tidy.misses.map((m) => [m.id, m.started, m.firstTool]), [
      ['tidy-notes-s2-r1', 'none', 'Read'],
      ['tidy-notes-s3-r1', 'pack-boxes', null],
    ]);
    assert.deepEqual(c.perSkill['pack-boxes'].misses.map((m) => [m.id, m.started, m.firstTool]), [['pack-boxes-s1-r1', 'none', null]]);
  });

  test('wrong starts: a should request of another list, and a near miss that started the skill', () => {
    const c = countRound(ROUND);
    assert.deepEqual(c.perSkill['pack-boxes'].wrongStarts.map((w) => w.id), ['tidy-notes-s3-r1'],
      'a should request of tidy-notes that started pack-boxes; the near miss that expected pack-boxes is not one');
    assert.deepEqual(c.perSkill['tidy-notes'].wrongStarts.map((w) => w.id), ['tidy-notes-n3-r1']);
    assert.deepEqual(c.perSkill.verify.wrongStarts.map((w) => w.id), ['pack-boxes-n1-r1'], 'a built-in counts by name');
    assert.equal(c.perSkill.verify.shouldRuns, 0);
    assert.ok(!Object.hasOwn(c.perSkill, 'water-plants'), 'no list and no start');
    assert.ok(!Object.hasOwn(c.perSkill, 'none'));
  });

  test('near misses: right when the expected skill or nothing started, wrong when another skill started', () => {
    const c = countRound(ROUND);
    assert.equal(c.nearMisses.total, 4);
    assert.equal(c.nearMisses.right, 2);
    assert.deepEqual(c.nearMisses.wrong.map((w) => [w.id, w.expect, w.started]), [
      ['tidy-notes-n3-r1', 'none', 'tidy-notes'],
      ['pack-boxes-n1-r1', 'none', 'verify'],
    ]);
  });

  test('unsteady requests and the kinds of misses that started nothing', () => {
    const runs = [
      entry('tidy-notes', 'should', 1, 1, 'tidy-notes'),
      entry('tidy-notes', 'should', 1, 2, 'none'),
      entry('tidy-notes', 'should', 2, 1, 'none', { firstTool: 'Read' }),
      entry('tidy-notes', 'should', 2, 2, 'none', { firstTool: 'Bash' }),
      entry('tidy-notes', 'should', 3, 1, 'none', { firstTool: 'constructor' }),
      entry('tidy-notes', 'should', 3, 2, null),
      entry('tidy-notes', 'nearMiss', 1, 1, 'pack-boxes', { expect: 'none' }),
      entry('tidy-notes', 'nearMiss', 1, 2, 'none', { expect: 'none' }),
      entry('tidy-notes', 'nearMiss', 2, 1, 'none', { expect: 'none', firstTool: 'Read' }),
    ];
    const c = countRound(runs);
    assert.deepEqual(c.unsteady.map((u) => [u.list, u.kind, u.index, u.started]), [
      ['tidy-notes', 'should', 1, ['tidy-notes', 'none']],
      ['tidy-notes', 'nearMiss', 1, ['pack-boxes', 'none']],
    ]);
    assert.deepEqual(c.missKinds, { answered: 1, lookedFirst: 3, byTool: { Bash: 1, Read: 1, constructor: 1 } },
      'only should runs that started nothing; a near miss is not a miss');
  });
});

describe('the report and the baseline', () => {
  const summary = () => ({
    format: 1, model: 'some-model', repeats: 2, capMicros: 1_000_000, usdPerRunMicros: 80_000, estimateMicros: 960_000,
    costMicros: 455_000, runsPlanned: 12, runsMade: 11,
    runs: ROUND.map((r) => (r.id === 'tidy-notes-s6-r1' ? { ...r, notes: ['no result line: the run did not finish'] } : r)),
    ...countRound(ROUND),
  });

  test('the report shows the cost, a line per skill, wrong near misses, unsteady requests, miss kinds, notes and runs not made', () => {
    const text = renderReport(summary());
    assert.match(text, /Cost: \$0\.46 spent, estimate \$0\.96, cap \$1\.00; 11 of 12 runs made/);
    assert.match(text, /tidy-notes: hits 3 of 5; misses 2: none after Read, pack-boxes; wrong starts 1: tidy-notes-n3-r1 \(meant for none\)/);
    assert.match(text, /pack-boxes: hits 0 of 1; misses 1: none with no tool; wrong starts 1: tidy-notes-s3-r1 \(meant for tidy-notes\)/);
    assert.match(text, /verify: hits 0 of 0; misses 0; wrong starts 1: pack-boxes-n1-r1 \(meant for none\)/);
    assert.match(text, /Near misses right: 2 of 4/);
    assert.match(text, /wrong: pack-boxes-n1-r1 started verify, expected none: "pack-boxes nearMiss 1"/);
    assert.match(text, /Unsteady requests: none/);
    assert.match(text, /Should runs that started nothing: 1 answered or did nothing, 1 looked first \(Read 1\)/);
    assert.match(text, /tidy-notes-s6-r1: no result line: the run did not finish/);
    assert.match(text, /Not run \(cap\): 1: tidy-notes-s4-r1/);
    assert.doesNotMatch(text, /above the cap/i);
    const over = renderReport({ ...summary(), costMicros: 1_234_999 });
    assert.match(over, /Above the cap by \$0\.23: a run cost more than its hard stop/);
    assert.doesNotMatch(renderReport({ ...summary(), costMicros: 1_000_000 }), /above the cap/i, 'exactly the cap is not above it');
  });

  test('the baseline comparison: better, worse, new and gone', () => {
    const old = {
      format: 1,
      perSkill: { 'tidy-notes': { hits: 1, wrongStarts: [] }, 'pack-boxes': { hits: 2, wrongStarts: [{ id: 'x' }] } },
      runs: [
        entry('tidy-notes', 'should', 1, 1, 'none'), entry('tidy-notes', 'should', 1, 2, 'none'),
        entry('tidy-notes', 'nearMiss', 1, 1, 'none'), entry('tidy-notes', 'nearMiss', 1, 2, 'none'),
        entry('tidy-notes', 'should', 3, 1, 'tidy-notes'),
        entry('tidy-notes', 'should', 9, 1, 'tidy-notes'),
      ],
    };
    const now = {
      format: 1,
      perSkill: { 'tidy-notes': { hits: 3, wrongStarts: [{ id: 'a' }, { id: 'b' }] }, 'pack-boxes': { hits: 1, wrongStarts: [] }, constructor: { hits: 1, wrongStarts: [] } },
      runs: [
        entry('tidy-notes', 'should', 1, 1, 'tidy-notes'), entry('tidy-notes', 'should', 1, 2, 'tidy-notes'),
        entry('tidy-notes', 'nearMiss', 1, 1, 'none'), entry('tidy-notes', 'nearMiss', 1, 2, 'verify'),
        entry('tidy-notes', 'should', 3, 1, 'tidy-notes'),
        entry('tidy-notes', 'should', 7, 1, 'tidy-notes'),
      ],
    };
    assert.deepEqual(compareBaseline(old, now), [
      'worse: pack-boxes hits 2 -> 1',
      'better: pack-boxes wrong starts 1 -> 0',
      'better: tidy-notes hits 1 -> 3',
      'worse: tidy-notes wrong starts 0 -> 2',
      'better: tidy-notes should "tidy-notes should 1": right 0 of 2 -> 2 of 2',
      'worse: tidy-notes nearMiss "tidy-notes nearMiss 1": right 2 of 2 -> 1 of 2',
      'new: tidy-notes should "tidy-notes should 7"',
      'gone: tidy-notes should "tidy-notes should 9"',
    ]);
    assert.deepEqual(compareBaseline(now, now), []);
  });
});

describe('the cost check', () => {
  test('fits: what was spent, the hard stops in flight and this hard stop may reach the cap exactly, and no more', () => {
    assert.equal(fits(200_000, 400_000, 400_000, 1_000_000), true);
    assert.equal(fits(200_001, 400_000, 400_000, 1_000_000), false);
    assert.equal(fits(0, 600_000, 300_000, 900_000), true);
    assert.equal(fits(0, 600_001, 300_000, 900_000), false);
    assert.equal(fits(0, 0, 160_000, 150_000), false, 'one hard stop above the cap never fits');
  });
});
