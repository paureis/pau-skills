// skill-eval triggers: a summary split into parts that fit the file-size rule, and --baseline reading those parts.
// splitSummary and mergeParts are pure; the split-summary command, the round's summary/ folder and --baseline with a
// folder run the command with the stand-in for `claude` (no model is called).
import { SCRIPT } from './skill-eval.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runNode } from './helpers.mjs';
import { parseArgs } from '../skills/verification/skill-eval/skill-eval.mjs';
import { planRuns } from '../skills/verification/skill-eval/skill-eval-triggers.mjs';
import { countRound, compareBaseline, splitSummary, mergeParts } from '../skills/verification/skill-eval/skill-eval-triggers-count.mjs';

// Three lists, one of them for a skill named constructor, two repeats. What each run started, by id: wrong near misses
// and unsteady requests in every list, a built-in (verify) and an --also skill (water-plants) that started.
const LISTS = [
  { skill: 'constructor', should: ['build a frame'], nearMisses: [{ request: 'pack it', expect: 'pack-boxes' }] },
  { skill: 'pack-boxes', should: ['pack a', 'pack b'], nearMisses: [{ request: 'check it', expect: 'none' }] },
  { skill: 'tidy-notes', should: ['tidy a'], nearMisses: [{ request: 'water it', expect: 'water-plants' }, { request: 'verify it', expect: 'none' }] },
];
const STARTED = {
  'constructor-s1-r1': 'constructor', 'constructor-n1-r1': 'tidy-notes', 'pack-boxes-s1-r1': 'pack-boxes', 'pack-boxes-s2-r1': 'none',
  'pack-boxes-n1-r1': 'verify', 'tidy-notes-s1-r1': 'tidy-notes', 'tidy-notes-n1-r1': 'water-plants', 'tidy-notes-n2-r1': 'verify',
  'constructor-s1-r2': 'none', 'constructor-n1-r2': 'none', 'pack-boxes-s1-r2': 'pack-boxes', 'pack-boxes-s2-r2': 'pack-boxes',
  'pack-boxes-n1-r2': 'verify', 'tidy-notes-s1-r2': 'tidy-notes', 'tidy-notes-n1-r2': 'none', 'tidy-notes-n2-r2': 'tidy-notes',
};

/** A summary in the shape the triggers command writes, runs in plan order. */
function summary() {
  const runs = planRuns(LISTS, 2).map((r) => ({
    ...r, started: STARTED[r.id], firstTool: STARTED[r.id] === 'none' ? null : 'Skill', costMicros: 50_000,
    result: STARTED[r.id] === 'none' ? 'success' : 'error_max_turns', finished: true, spawned: true, notes: [],
  }));
  return {
    format: 1, model: 'some-model', repeats: 2, at: '2026-10-29T10:00:00.000Z', skills: ['constructor', 'pack-boxes', 'tidy-notes'],
    also: ['water-plants'], currency: 'USD', capMicros: 5_000_000, usdPerRunMicros: 80_000, estimateMicros: 1_280_000,
    costMicros: 800_000, runsPlanned: 16, runsMade: 16, parallel: 3, realHome: false, runs, ...countRound(runs),
  };
}

describe('splitSummary and mergeParts', () => {
  test('one part per list, named by the runs\' list, and round.json with the rest', () => {
    const s = summary();
    const parts = splitSummary(s);
    assert.deepEqual(Object.keys(parts).sort(), ['constructor.json', 'pack-boxes.json', 'round.json', 'tidy-notes.json']);
    for (const l of LISTS.map((x) => x.skill)) {
      const p = parts[`${l}.json`];
      assert.deepEqual(Object.keys(p), ['format', 'part', 'runs', 'perSkill', 'nearMisses', 'unsteady'], l);
      assert.equal(p.format, 1);
      assert.equal(p.part, l);
      assert.deepEqual(p.runs, s.runs.filter((r) => r.list === l), l);
      assert.deepEqual(p.perSkill, { [l]: s.perSkill[l] }, l);
      assert.deepEqual(p.nearMisses.wrong, s.nearMisses.wrong.filter((w) => w.list === l), l);
      assert.deepEqual(p.unsteady, s.unsteady.filter((u) => u.list === l), l);
    }
    assert.deepEqual(parts['tidy-notes.json'].nearMisses.wrong.map((w) => w.id), ['tidy-notes-n2-r1', 'tidy-notes-n2-r2']);
    assert.deepEqual(parts['pack-boxes.json'].unsteady.map((u) => u.index), [2]);
    const { runs, ...rest } = s;
    assert.deepEqual(parts['round.json'], {
      format: 1, part: 'round', ...rest, perSkill: { verify: s.perSkill.verify, 'water-plants': s.perSkill['water-plants'] },
      nearMisses: { right: s.nearMisses.right, total: s.nearMisses.total, wrong: [] }, unsteady: [],
    });
    assert.ok(!Object.hasOwn(parts['round.json'], 'runs'));
  });

  test('merging the parts, in any order, gives back the summary: runs in plan order, near misses and unsteady in order', () => {
    const s = summary();
    assert.ok(s.nearMisses.wrong.length >= 4 && s.unsteady.length >= 3, 'the fixture has something to put back in order');
    const parts = splitSummary(s);
    const shuffled = Object.fromEntries(['tidy-notes.json', 'round.json', 'constructor.json', 'pack-boxes.json'].map((n) => [n, parts[n]]));
    const merged = mergeParts(shuffled);
    assert.deepEqual(merged.runs, s.runs);
    assert.deepEqual(merged.perSkill, s.perSkill);
    assert.deepEqual(Object.keys(merged.perSkill), Object.keys(s.perSkill));
    assert.deepEqual(merged, s);
    assert.deepEqual(compareBaseline(merged, s), []);
    assert.deepEqual(compareBaseline(s, merged), []);
  });

  test('split refuses a summary without format 1 or runs, and a list name that cannot be a file name or is round', () => {
    const s = summary();
    assert.throws(() => splitSummary({ ...s, format: 2 }), /"format": 1/);
    assert.throws(() => splitSummary({ format: 1 }), /runs/);
    assert.throws(() => splitSummary(null), /"format": 1/);
    for (const name of ['round', '../escaped', 'Upper', 'a/b', '', 'x.json']) {
      const runs = s.runs.map((r) => (r.list === 'tidy-notes' ? { ...r, list: name } : r));
      assert.throws(() => splitSummary({ ...s, runs }), /list name/, name);
    }
  });

  test('merge refuses a missing round.json, a part without format 1, a run id or a skill in two parts; a skill named constructor is a name', () => {
    const parts = splitSummary(summary());
    const without = (name) => Object.fromEntries(Object.entries(parts).filter(([n]) => n !== name));
    assert.throws(() => mergeParts(without('round.json')), /no round\.json/);
    assert.throws(() => mergeParts({ ...parts, 'pack-boxes.json': { ...parts['pack-boxes.json'], format: 2 } }), /pack-boxes\.json.*"format": 1/);
    const again = parts['constructor.json'].runs[0];
    const extra = { format: 1, part: 'extra', runs: [again], perSkill: {}, nearMisses: { wrong: [] }, unsteady: [] };
    assert.throws(() => mergeParts({ ...parts, 'extra.json': extra }), new RegExp(`run ${again.id}.*constructor\\.json.*extra\\.json|run ${again.id}.*extra\\.json.*constructor\\.json`));
    const twice = { ...extra, runs: [], perSkill: { constructor: parts['constructor.json'].perSkill.constructor } };
    assert.throws(() => mergeParts({ ...parts, 'extra.json': twice }), /skill constructor .*two parts|skill constructor is in/);
    const once = { ...extra, runs: [], perSkill: { toString: { hits: 0, shouldRuns: 0, misses: [], wrongStarts: [] } } };
    assert.deepEqual(Object.keys(mergeParts({ ...parts, 'extra.json': once }).perSkill), ['constructor', 'pack-boxes', 'tidy-notes', 'toString', 'verify', 'water-plants']);
  });
});

describe('split-summary options', () => {
  test('takes a summary file and --out, and needs --out', () => {
    const o = parseArgs(['split-summary', 'summary.json', '--out', 'parts']);
    assert.equal(o.cmd, 'split-summary');
    assert.equal(o.target, 'summary.json');
    assert.equal(o.out, 'parts');
    assert.throws(() => parseArgs(['split-summary', 'summary.json']), /split-summary needs --out/);
    assert.throws(() => parseArgs(['split-summary', 'summary.json', '--out', 'a', '--force']), /unknown option --force/);
  });

  test('a command or option named like an Object property is unknown, not a match', () => {
    for (const cmd of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.throws(() => parseArgs([cmd, 'x']), new RegExp(`unknown command ${cmd}`), cmd);
      const r = runNode(SCRIPT, { args: [cmd, 'x'] });
      assert.equal(r.code, 2, cmd);
      assert.match(r.stderr, /unknown command/, cmd);
    }
    for (const flag of ['constructor', 'toString', '__proto__']) {
      assert.throws(() => parseArgs(['split-summary', 's.json', '--out', 'a', flag, 'x']), new RegExp(`unknown option ${flag}`), flag);
    }
  });

  test('the usage text lists split-summary and a folder for --baseline', () => {
    const r = runNode(SCRIPT, { args: [] });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /skill-eval\.mjs split-summary <summary\.json> --out <folder>/);
    assert.match(r.stderr, /--baseline <summary\.json or folder>/);
  });
});
