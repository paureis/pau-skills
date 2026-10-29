// skill-eval triggers, the pure part of the summary in parts: splitSummary and mergeParts, on a sample summary with a
// list for a skill named constructor. The command, the round's summary/ folder and --baseline with a folder are in
// skill-eval-triggers-baseline.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LISTS, sampleSummary as summary } from './skill-eval-triggers.helpers.mjs';
import { countRound, compareBaseline, splitSummary, mergeParts } from '../skills/verification/skill-eval/skill-eval-triggers-count.mjs';
import { planRuns } from '../skills/verification/skill-eval/skill-eval-triggers.mjs';

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

  test('with 3 repeats and a failed repeat-1 run, unsteady comes back in the order of each request\'s first counted run', () => {
    const lists = [{ skill: 'tidy-notes', should: ['tidy a', 'tidy b'], nearMisses: [] }];
    const started = {
      'tidy-notes-s1-r1': 'none', 'tidy-notes-s2-r1': 'tidy-notes', 'tidy-notes-s1-r2': 'tidy-notes',
      'tidy-notes-s2-r2': 'none', 'tidy-notes-s1-r3': 'none', 'tidy-notes-s2-r3': 'tidy-notes',
    };
    const runs = planRuns(lists, 3).map((r) => {
      const failed = r.id === 'tidy-notes-s1-r1';
      return { ...r, started: started[r.id], firstTool: null, costMicros: 50_000, result: failed ? 'no result line' : 'success', finished: !failed, spawned: true, notes: [] };
    });
    const s = { format: 1, repeats: 3, runs, ...countRound(runs) };
    assert.deepEqual(s.unsteady.map((u) => u.index), [2, 1], 'request 2 has the first counted run');
    assert.deepEqual(mergeParts(splitSummary(s)), s);
  });

  test('merge refuses a missing round.json, a part without format 1, a run id or a skill in two parts; a skill named constructor is a name', () => {
    const parts = splitSummary(summary());
    const without = (name) => Object.fromEntries(Object.entries(parts).filter(([n]) => n !== name));
    assert.throws(() => mergeParts(without('round.json')), /no round\.json/);
    for (const odd of [{ format: 1, perSkill: [] }, { format: 1, runs: [1] }, { format: 1, unsteady: 'xy' }, { format: 1, nearMisses: { wrong: {} } }]) {
      assert.throws(() => mergeParts({ ...parts, 'odd.json': odd }), /odd\.json: runs, nearMisses\.wrong and unsteady must be lists and perSkill an object/, JSON.stringify(odd));
    }
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
