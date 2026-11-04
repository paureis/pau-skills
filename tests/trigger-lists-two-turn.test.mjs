// evals/triggers/two-turn/requests/ holds the should runs of the baseline (evals/triggers/baseline/) that ran a tool
// first and started nothing ("looked first"), as subset lists for a rerun with --max-turns 2: each request as many
// times as it missed, in the order of its baseline index. The plan of that rerun is checked with the stand-in for
// `claude` (no model is called).
import { scratch } from './skill-eval.helpers.mjs';
import { trig } from './skill-eval-triggers.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repo } from './helpers.mjs';
import { mergeParts, counts } from '../skills/verification/skill-eval/skill-eval-triggers-count.mjs';

const BASELINE = repo('evals', 'triggers', 'baseline');
const TWO_TURN = repo('evals', 'triggers', 'two-turn', 'requests');

// Per list, the misses of each should request, by baseline index (s1 is should 1).
const TABLE = {
  arena: { s1: 1, s2: 1 },
  architect: { s3: 1 },
  'bug-fix': { s1: 2, s2: 2 },
  'codebase-oracle': { s1: 1, s2: 2, s3: 2 },
  'dependency-security-audit': { s1: 1, s3: 1 },
  'engineering-principles': { s3: 2 },
  evaluator: { s1: 2, s2: 1 },
  'flaky-test-hunt': { s2: 2 },
  geppetto: { s2: 1 },
  hillclimb: { s2: 2 },
  'overnight-run': { s1: 1, s2: 2 },
  'parallel-worktrees': { s1: 2, s2: 2, s3: 2 },
  retrospective: { s3: 1 },
  'rule-to-hook': { s1: 1 },
  sharpen: { s3: 2 },
  'to-prd': { s2: 2, s3: 2 },
};

/** The baseline as --baseline reads a folder: round.json plus every other *.json, merged. */
function baseline() {
  const names = readdirSync(BASELINE).filter((n) => n.endsWith('.json'));
  return mergeParts(Object.fromEntries(names.map((n) => [n, JSON.parse(readFileSync(join(BASELINE, n), 'utf8'))])));
}

/** The "looked first" misses: should runs that count, started nothing and have a first tool. */
const lookedFirst = (s) => s.runs.filter((r) => r.kind === 'should' && counts(r) && r.started === 'none' && r.firstTool !== null);

/** { <list>: [request text, once per miss, by baseline index] }, lists in name order. */
function expectedLists(misses) {
  const out = new Map();
  for (const r of [...misses].sort((a, b) => (a.list < b.list ? -1 : a.list > b.list ? 1 : a.index - b.index || a.repeat - b.repeat))) {
    if (!out.has(r.list)) out.set(r.list, []);
    out.get(r.list).push(r.request);
  }
  return out;
}

describe('the two-turn lists', () => {
  test('the baseline has 41 looked-first misses, all Bash: 26 requests, 15 missed twice and 11 once, in 16 lists', () => {
    const s = baseline();
    const misses = lookedFirst(s);
    assert.equal(misses.length, 41);
    assert.deepEqual([...new Set(misses.map((r) => r.firstTool))], ['Bash']);
    assert.equal(JSON.parse(readFileSync(join(BASELINE, 'round.json'), 'utf8')).missKinds.lookedFirst, 41);
    const perRequest = new Map();
    for (const r of misses) {
      const key = `${r.list} s${r.index}`;
      if (!perRequest.has(key)) perRequest.set(key, { texts: new Set(), count: 0 });
      perRequest.get(key).texts.add(r.request);
      perRequest.get(key).count++;
    }
    assert.equal(perRequest.size, 26);
    assert.equal([...perRequest.values()].filter((x) => x.count === 2).length, 15);
    assert.equal([...perRequest.values()].filter((x) => x.count === 1).length, 11);
    for (const [key, x] of perRequest) assert.equal(x.texts.size, 1, `${key}: one text in both repeats`);
    const table = {};
    for (const r of misses) {
      table[r.list] ||= {};
      table[r.list][`s${r.index}`] = (table[r.list][`s${r.index}`] || 0) + 1;
    }
    assert.deepEqual(table, TABLE);
  });

  test('the folder holds exactly one list per list with a miss, each the misses in baseline order, written as JSON', () => {
    const lists = expectedLists(lookedFirst(baseline()));
    assert.deepEqual([...lists.keys()], Object.keys(TABLE).sort());
    assert.deepEqual(readdirSync(TWO_TURN).sort(), [...lists.keys()].map((l) => `${l}.json`));
    for (const [skill, should] of lists) {
      const text = readFileSync(join(TWO_TURN, `${skill}.json`), 'utf8');
      assert.equal(text, `${JSON.stringify({ skill, should, nearMisses: [] }, null, 2)}\n`, skill);
      assert.equal(should.length, Object.values(TABLE[skill]).reduce((a, b) => a + b, 0), skill);
    }
  });

  test('the rerun plan: 41 runs of 41 should requests in 16 lists with two turns, no call and nothing written', () => {
    const lab = join(scratch(), 'lab');
    const r = trig(['--skills', repo('skills'), '--requests', TWO_TURN, '--model', 'some-model', '--max-turns', '2', '--repeats', '1',
      '--usd-per-run', '0.12', '--max-usd', '7', '--plan'], { lab });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^Skills under test: 38 \(16 with a list\): /m);
    assert.match(r.stdout, /^Requests: 41 \(41 should, 0 near misses\) in 16 lists$/m);
    assert.match(r.stdout, /^Runs: 41 requests x 1 = 41$/m);
    assert.match(r.stdout, /^Max turns: 2$/m);
    assert.match(r.stdout, /^Estimate: \$4\.92 \(41 runs x \$0\.12\)$/m);
    assert.match(r.stdout, /^Cap: \$7\.00$/m);
    assert.match(r.stdout, /Plan only: nothing was run or written\./);
    assert.equal(r.calls.length + r.auth.length, 0, 'no claude call, not even auth status');
    assert.ok(!existsSync(lab), 'nothing written');
  });
});
