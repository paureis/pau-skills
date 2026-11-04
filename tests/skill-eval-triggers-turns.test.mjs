// skill-eval triggers with --max-turns: the option, the turn of a start read from a transcript (distinct main-agent
// message ids up to the first Skill call), the turn in each runs entry and maxTurns in the summary, the hits by turn in
// the report, the note in the baseline comparison, and the summary in parts. The command runs with the stand-in for
// `claude` (no model is called). Values are picked so that each wrong rule gives a different number.
import { SCRIPT, scratch } from './skill-eval.helpers.mjs';
import { SKILLS, RUN_ARGV, writeLists, base, trig } from './skill-eval-triggers.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode } from './helpers.mjs';
import { parseArgs } from '../skills/verification/skill-eval/skill-eval.mjs';
import { readRun, countRound, renderReport, compareBaseline, splitSummary, mergeParts } from '../skills/verification/skill-eval/skill-eval-triggers-count.mjs';
import { oneRun } from '../skills/verification/skill-eval/skill-eval-triggers.mjs';

const REQUIRED = ['--skills', 'skills', '--requests', 'requests', '--model', 'some-model', '--max-usd', '2'];

describe('--max-turns', () => {
  test('a whole number from 1 to 3 for triggers, default 1; anything else is refused, exit 2 on the command line', () => {
    assert.equal(parseArgs(['triggers', 'lab', ...REQUIRED]).maxTurns, 1);
    assert.equal(parseArgs(['triggers', 'lab', ...REQUIRED, '--max-turns', '2']).maxTurns, 2);
    assert.equal(parseArgs(['triggers', 'lab', ...REQUIRED, '--max-turns', '3']).maxTurns, 3);
    for (const bad of ['0', '4', '1.5', 'abc']) {
      assert.throws(() => parseArgs(['triggers', 'lab', ...REQUIRED, '--max-turns', bad]), /--max-turns must be a whole number from 1 to 3/, bad);
    }
    const r = runNode(SCRIPT, { args: ['triggers', 'lab', ...REQUIRED, '--max-turns', '4'] });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--max-turns must be a whole number from 1 to 3/);
  });

  test('the usage text shows it on the triggers line, and run does not take it', () => {
    const r = runNode(SCRIPT, { args: [] });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /skill-eval\.mjs triggers <lab-dir> .*\[--max-turns 1\]/);
    assert.throws(() => parseArgs(['run', 'lab', '--model', 'm', '--max-turns', '2']), /unknown option --max-turns/);
  });
});

// Transcript lines in the shape claude -p --output-format stream-json prints: one line per content block, the lines of
// one assistant message sharing its message.id. `id` undefined leaves the field out.
const line = (id, content, parent = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { ...(id === undefined ? {} : { id }), content } });
const text = (t) => ({ type: 'text', text: t });
const use = (name, input = {}) => ({ type: 'tool_use', id: `t-${name}`, name, input });
const skill = (name) => use('Skill', { skill: name });
const user = { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 't-Bash', content: 'notes.txt' }] } };
const done = { type: 'result', subtype: 'error_max_turns', total_cost_usd: 0.1 };
const transcript = (...events) => `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;

describe('readRun: the turn of the first Skill call', () => {
  test('a Skill call in the first message is turn 1, also after a text block of the same message on its own line', () => {
    assert.equal(readRun(transcript(line('m1', [skill('tidy-notes')]), done)).turn, 1);
    const x = readRun(transcript(line('m1', [text('I will use the skill.')]), line('m1', [skill('tidy-notes')]), done));
    assert.equal(x.started, 'tidy-notes');
    assert.equal(x.turn, 1, 'two lines, one message');
  });

  test('text and Bash in message 1, a user line, then the Skill call in message 2 is turn 2', () => {
    const x = readRun(transcript(line('m1', [text('Let me look.')]), line('m1', [use('Bash', { command: 'ls' })]), user,
      line('m2', [skill('tidy-notes')]), done));
    assert.equal(x.started, 'tidy-notes');
    assert.equal(x.firstTool, 'Bash');
    assert.equal(x.turn, 2, 'a count of assistant lines would give 3');
  });

  test('the messages after the first Skill call do not count', () => {
    const x = readRun(transcript(line('m1', [skill('tidy-notes')]), user, line('m2', [text('Done.')]), line('m3', [use('Bash')]),
      line('m3', [skill('pack-boxes')]), done));
    assert.equal(x.started, 'tidy-notes');
    assert.equal(x.turn, 1, 'all ids at the end would give 3');
  });

  test('a subagent line with its own id before the call is not counted', () => {
    const x = readRun(transcript(line('sub1', [skill('pack-boxes')], 'toolu_agent'), line('m1', [use('Bash')]), user,
      line('sub2', [text('x')], 'toolu_agent'), line('m2', [skill('tidy-notes')]), done));
    assert.equal(x.started, 'tidy-notes');
    assert.equal(x.turn, 2, 'counting the subagent lines would give 4');
  });

  test('nothing started, or a first Skill call with no usable name, is null', () => {
    const quiet = readRun(transcript(line('m1', [text('Hello.')]), done));
    assert.equal(quiet.started, 'none');
    assert.equal(quiet.turn, null);
    const looked = readRun(transcript(line('m1', [text('Let me look.')]), line('m1', [use('Bash')]), user, line('m2', [use('Read')]), user,
      line('m3', [text('Here it is.')]), done));
    assert.equal(looked.started, 'none');
    assert.equal(looked.turn, null, 'three messages, nothing started');
    const odd = readRun(transcript(line('m1', [text('x')]), line('m2', [skill('')]), line('m3', [skill('tidy-notes')]), done));
    assert.equal(odd.started, 'none');
    assert.equal(odd.turn, null);
    assert.equal(readRun('').turn, null);
  });

  test('a main-agent line whose id is not a non-empty string counts as one message of its own', () => {
    const x = readRun(transcript(line(undefined, [text('a')]), line(undefined, [text('b')]), line('', [text('c')]), line('', [text('d')]),
      line(7, [text('e')]), line(7, [use('Bash')]), line('m1', [text('f')]), line('m1', [skill('tidy-notes')]), done));
    assert.equal(x.started, 'tidy-notes');
    assert.equal(x.turn, 7);
  });
});

// Request 1 starts tidy-notes in turn 1 after a subagent line with its own id; request 2 looks first (text and Bash in
// turn 1) and starts tidy-notes in turn 2 when it has one.
const TWO = () => writeLists({ 'tidy-notes': { should: ['tidy my helper notes', 'browse first, then tidy notes'] } });

describe('the command with --max-turns', () => {
  test('--max-turns 2: every run gets it, the summary holds maxTurns and each turn, the report shows the hits by turn', () => {
    const r = trig(base(TWO(), ['--max-turns', '2', '--repeats', '1']));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.calls.length, 2);
    for (const c of r.calls) assert.deepEqual(c.argv, RUN_ARGV(c.prompt, 'some-model', '0.16', '2'));
    const s = r.summary;
    assert.equal(s.maxTurns, 2);
    assert.deepEqual(Object.keys(s).slice(1, 4), ['model', 'repeats', 'maxTurns']);
    assert.deepEqual(s.runs.map((x) => [x.id, x.started, x.firstTool, x.turn, x.result]), [
      ['tidy-notes-s1-r1', 'tidy-notes', 'Skill', 1, 'error_max_turns'],
      ['tidy-notes-s2-r1', 'tidy-notes', 'Bash', 2, 'error_max_turns'],
    ]);
    assert.equal(s.perSkill['tidy-notes'].hits, 2);
    assert.match(r.stdout, /\nRepeats: 1\nMax turns: 2\nRuns: 2 requests x 1 = 2\n/);
    assert.match(r.stdout, /\n {2}tidy-notes: hits 2 of 2 \(turn 1: 1, turn 2: 1\); misses 0; wrong starts 0\nHits by turn: turn 1: 1, turn 2: 1\n\nNear misses right: 0 of 0\n/);
  });

  test('the default: --max-turns 1, the run that looks first starts nothing, and the report has no turns', () => {
    const r = trig(base(TWO(), ['--repeats', '1']));
    assert.equal(r.code, 0, r.stderr);
    for (const c of r.calls) assert.deepEqual(c.argv, RUN_ARGV(c.prompt, 'some-model', '0.16'));
    assert.equal(r.calls.length, 2);
    const s = r.summary;
    assert.equal(s.maxTurns, 1);
    assert.deepEqual(s.runs.map((x) => [x.id, x.started, x.firstTool, x.turn, x.result]), [
      ['tidy-notes-s1-r1', 'tidy-notes', 'Skill', 1, 'error_max_turns'],
      ['tidy-notes-s2-r1', 'none', 'Bash', null, 'error_max_turns'],
    ]);
    assert.match(r.stdout, /\nRepeats: 1\nMax turns: 1\nRuns: /);
    assert.match(r.stdout, /\n {2}tidy-notes: hits 1 of 2; misses 1: none after Bash; wrong starts 0\n\nNear misses right/);
    assert.doesNotMatch(r.stdout, /\(turn/);
    assert.doesNotMatch(r.stdout, /Hits by turn/);
  });

  test('a run not made (cap), a runner that never started claude, and a run with no transcript have turn null', async () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a', 'tidy b', 'tidy c'] } });
    const r = trig(base(lists, ['--usd-per-run', '0.05', '--max-usd', '0.95', '--parallel', '1']), { env: { FAKE_TRIGGERS_COST: '0.20' } });
    assert.equal(r.code, 1);
    const notRun = r.summary.runs.filter((x) => x.result === 'not run (cap)');
    assert.equal(notRun.length, 3);
    for (const x of notRun) assert.ok(Object.hasOwn(x, 'turn') && x.turn === null, x.id);
    assert.deepEqual(r.summary.runs.filter((x) => x.started !== null).map((x) => x.turn), [1, 1, 1]);

    const root = scratch();
    const lab = scratch();
    mkdirSync(join(lab, 'runs'));
    const argvs = [];
    const run = { id: 'tidy-notes-s1-r1', list: 'tidy-notes', kind: 'should', index: 1, repeat: 1, request: 'tidy a', expect: 'tidy-notes' };
    const o = { model: 'm', maxTurns: 3, timeoutMin: 5, passEnv: [], realHome: false };
    const installed = new Map([['tidy-notes', join(SKILLS, 'tidy-notes')]]);
    const never = await oneRun(run, { root, lab, o, installed, stop: 160_000, runner: async (_, argv) => { argvs.push(argv); return { exit: null, error: 'spawn ENOENT' }; } });
    assert.equal(never.spawned, false);
    assert.ok(Object.hasOwn(never, 'turn') && never.turn === null);
    assert.deepEqual(argvs[0].slice(2, 4), ['--max-turns', '3']);
    const silent = await oneRun(run, {
      root, lab, o, installed, stop: 160_000,
      runner: async (x) => { writeFileSync(join(lab, 'runs', `${x.id}.jsonl`), ''); return { exit: 1 }; },
    });
    assert.equal(silent.spawned, true);
    assert.ok(Object.hasOwn(silent, 'turn') && silent.turn === null);
  });
});

// A runs entry as the command writes it; `started: null` is a run not made, `finished: false` a run with no result line.
function entry(list, kind, index, started, { expect = kind === 'should' ? list : 'none', firstTool = null, turn = null, finished = true } = {}) {
  return {
    id: `${list}-${kind === 'should' ? 's' : 'n'}${index}-r1`, list, kind, index, repeat: 1, request: `${list} ${kind} ${index}`, expect,
    started, firstTool, turn, costMicros: started === null ? null : 50_000,
    result: started === null ? 'not run (cap)' : finished ? 'error_max_turns' : 'no result line', finished: started === null ? false : finished,
    spawned: started !== null, notes: [],
  };
}

// tidy-notes: hits in turn 2, 1, 2 (a turn-2 hit first), a miss that started pack-boxes in turn 1, a failed run, and a
// near miss that started its expected skill in turn 1. pack-boxes: one hit in turn 2 only, a miss, and a near miss that
// started pack-boxes itself in turn 1 (a wrong start). sort-mail: no hit, and a run not made.
const RUNS = [
  entry('tidy-notes', 'should', 1, 'tidy-notes', { firstTool: 'Bash', turn: 2 }),
  entry('tidy-notes', 'should', 2, 'tidy-notes', { firstTool: 'Skill', turn: 1 }),
  entry('tidy-notes', 'should', 3, 'tidy-notes', { firstTool: 'Bash', turn: 2 }),
  entry('tidy-notes', 'should', 4, 'pack-boxes', { firstTool: 'Skill', turn: 1 }),
  entry('tidy-notes', 'should', 5, 'none', { firstTool: 'Bash', finished: false }),
  entry('tidy-notes', 'nearMiss', 1, 'pack-boxes', { expect: 'pack-boxes', firstTool: 'Skill', turn: 1 }),
  entry('pack-boxes', 'should', 1, 'pack-boxes', { firstTool: 'Bash', turn: 2 }),
  entry('pack-boxes', 'should', 2, 'none', { firstTool: 'Bash' }),
  entry('pack-boxes', 'nearMiss', 1, 'pack-boxes', { firstTool: 'Skill', turn: 1 }),
  entry('sort-mail', 'should', 1, 'none', { firstTool: 'Bash' }),
  entry('sort-mail', 'should', 2, null),
];
const report = (extra, runs = RUNS) => ({
  format: 1, model: 'some-model', repeats: 1, ...extra, capMicros: 2_000_000, usdPerRunMicros: 80_000, estimateMicros: 880_000,
  costMicros: 500_000, runsPlanned: runs.length, runsMade: runs.filter((r) => r.started !== null).length, runs, ...countRound(runs),
});

// The report of RUNS as renderReport printed it before --max-turns existed.
const ONE_TURN = [
  'Cost: $0.50 spent, estimate $0.88, cap $2.00; 10 of 11 runs made',
  '',
  'Per skill:',
  '  pack-boxes: hits 1 of 2; misses 1: none after Bash; wrong starts 2: tidy-notes-s4-r1 (meant for tidy-notes), pack-boxes-n1-r1 (meant for none)',
  '  sort-mail: hits 0 of 1; misses 1: none after Bash; wrong starts 0',
  '  tidy-notes: hits 3 of 4; misses 1: pack-boxes; wrong starts 0',
  '',
  'Near misses right: 1 of 2 (of 1 that name a skill: 1 started it, 0 started nothing)',
  '  wrong: pack-boxes-n1-r1 started pack-boxes, expected none: "pack-boxes nearMiss 1"',
  '',
  'Unsteady requests: none',
  '',
  'Should runs that started nothing: 0 answered or did nothing, 2 looked first (Bash 2)',
  '',
  'Not run (cap): 1: sort-mail-s2-r1',
].join('\n');

describe('the report and the comparison with turns', () => {
  test('maxTurns 2: hits by turn per skill in ascending order, turns with no hit left out, and the total line', () => {
    const expected = ONE_TURN
      .replace('pack-boxes: hits 1 of 2;', 'pack-boxes: hits 1 of 2 (turn 2: 1);')
      .replace('tidy-notes: hits 3 of 4;', 'tidy-notes: hits 3 of 4 (turn 1: 1, turn 2: 2);')
      .replace('wrong starts 0\n\nNear misses', 'wrong starts 0\nHits by turn: turn 1: 1, turn 2: 3\n\nNear misses');
    assert.match(expected, /\n {2}tidy-notes: hits 3 of 4 \(turn 1: 1, turn 2: 2\); misses 1: pack-boxes; wrong starts 0\nHits by turn: turn 1: 1, turn 2: 3\n\nNear/);
    assert.equal(renderReport(report({ maxTurns: 2 })), expected);
    assert.equal(renderReport(report({ maxTurns: 3 })), expected);
  });

  test('maxTurns 2 with no hit prints Hits by turn: none', () => {
    const runs = [entry('tidy-notes', 'should', 1, 'none', { firstTool: 'Bash' }), entry('tidy-notes', 'nearMiss', 1, 'tidy-notes', { turn: 1 })];
    const text = renderReport(report({ maxTurns: 2 }, runs));
    assert.match(text, /\nPer skill:\n {2}tidy-notes: hits 0 of 1; misses 1: none after Bash; wrong starts 1: tidy-notes-n1-r1 \(meant for none\)\nHits by turn: none\n\nNear misses right: 0 of 1\n/);
  });

  test('maxTurns 1 or missing: the report is exactly what it was before', () => {
    assert.equal(renderReport(report({ maxTurns: 1 })), ONE_TURN);
    assert.equal(renderReport(report({})), ONE_TURN);
  });

  test('compareBaseline notes different max turns first; a missing maxTurns reads as 1', () => {
    const old = { format: 1, perSkill: { 'tidy-notes': { hits: 1, wrongStarts: [] } }, runs: [] };
    const now = { format: 1, maxTurns: 1, perSkill: { 'tidy-notes': { hits: 3, wrongStarts: [] } }, runs: [] };
    assert.deepEqual(compareBaseline(old, now), ['better: tidy-notes hits 1 -> 3']);
    assert.deepEqual(compareBaseline({ ...old, maxTurns: 1 }, { ...now, maxTurns: 2 }), [
      'note: max turns differ: baseline 1, this round 2',
      'better: tidy-notes hits 1 -> 3',
    ]);
    const { maxTurns, ...missing } = now;
    assert.equal(maxTurns, 1);
    assert.deepEqual(compareBaseline({ ...old, maxTurns: 2 }, missing), ['note: max turns differ: baseline 2, this round 1', 'better: tidy-notes hits 1 -> 3']);
    assert.deepEqual(compareBaseline({ ...old, maxTurns: 3 }, { ...now, maxTurns: 3 }), ['better: tidy-notes hits 1 -> 3']);
  });

  test('splitSummary keeps maxTurns in round.json and turn in every run, and mergeParts gives them back', () => {
    const s = report({ maxTurns: 2, at: '2026-11-04T10:00:00.000Z' });
    const parts = splitSummary(s);
    assert.equal(parts['round.json'].maxTurns, 2);
    const turns = Object.entries(parts).filter(([n]) => n !== 'round.json').flatMap(([, p]) => p.runs).map((r) => [r.id, r.turn]);
    assert.deepEqual(turns.sort(), RUNS.map((r) => [r.id, r.turn]).sort());
    const merged = mergeParts(parts);
    assert.equal(merged.maxTurns, 2);
    const byId = (a, b) => (a.id < b.id ? -1 : 1);
    const { runs: back, ...restBack } = merged;
    const { runs: sent, ...restSent } = s;
    assert.deepEqual(restBack, restSent);
    assert.deepEqual([...back].sort(byId), [...sent].sort(byId), 'every run with its turn');
  });
});
