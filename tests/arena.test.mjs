// The arena helper: label shuffling and rubric checks (pure), and the init and blind commands against real folders.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, symlinkSync, lstatSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir, removeAtExit } from './helpers.mjs';
import {
  mulberry32, shuffle, assignLabels, countCriteria, validateRubric, isExcluded, rubricTemplate, outsideFences,
  synthesisTemplate, parseArgs, main,
} from '../skills/agent-orchestration/arena/arena.mjs';
import { SCRIPT, GOOD_RUBRIC } from './arena.helpers.mjs';

describe('shuffle', () => {
  test('the same seed gives the same order, and every item is kept once', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const one = shuffle(items, mulberry32(7));
    assert.deepEqual(one, shuffle(items, mulberry32(7)));
    assert.deepEqual([...one].sort(), items);
    assert.deepEqual(items, ['a', 'b', 'c', 'd', 'e'], 'the input is not changed');
  });

  test('every order is reachable: with two items both orders turn up, about half the time each', () => {
    let kept = 0;
    for (let seed = 1; seed <= 400; seed++) if (shuffle(['x', 'y'], mulberry32(seed))[0] === 'x') kept++;
    assert.ok(kept > 120 && kept < 280, `first item stayed first ${kept} times out of 400`);
  });

  test('with three items each item lands in each position', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 300; seed++) seen.add(shuffle(['a', 'b', 'c'], mulberry32(seed)).join(''));
    assert.equal(seen.size, 6, `orders seen: ${[...seen].join(' ')}`);
  });

  test('mulberry32 returns numbers in [0, 1)', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1, String(v)); }
  });
});

describe('assignLabels', () => {
  test('labels are A, B, C in order, each pointing at a different candidate', () => {
    const got = assignLabels(['candidate-1', 'candidate-2', 'candidate-3'], mulberry32(3));
    assert.deepEqual(got.map((x) => x.label), ['A', 'B', 'C']);
    assert.deepEqual(got.map((x) => x.candidate).sort(), ['candidate-1', 'candidate-2', 'candidate-3']);
  });

  test('more than 26 candidates is refused', () => {
    const many = Array.from({ length: 27 }, (_, i) => `candidate-${i + 1}`);
    assert.throws(() => assignLabels(many, mulberry32(1)), /26/);
  });
});

describe('rubric', () => {
  test('counts numbered criteria only', () => {
    assert.equal(countCriteria(GOOD_RUBRIC), 3);
    assert.equal(countCriteria('1. one\n- a bullet\n  2. two\ntext 3. not a criterion\n10) ten'), 3);
  });

  test('a rubric with 3 to 6 filled criteria is valid', () => {
    assert.deepEqual(validateRubric(GOOD_RUBRIC), []);
    const six = Array.from({ length: 6 }, (_, i) => `${i + 1}. criterion ${i + 1}`).join('\n');
    assert.deepEqual(validateRubric(six), []);
  });

  test('fewer than 3 or more than 6 criteria is an error', () => {
    assert.match(validateRubric('1. one\n2. two').join(' '), /3 to 6/);
    const seven = Array.from({ length: 7 }, (_, i) => `${i + 1}. criterion ${i + 1}`).join('\n');
    assert.match(validateRubric(seven).join(' '), /3 to 6/);
  });

  test('the unfilled template is an error', () => {
    const errors = validateRubric(rubricTemplate('a helper'));
    assert.ok(errors.some((e) => /placeholder/.test(e)), errors.join(' '));
  });

  test('the template names the task', () => assert.match(rubricTemplate('pick a cache'), /pick a cache/));

  test('the unfilled task line is an error even when the criteria are filled', () => {
    const filled = rubricTemplate('').replace(/<criterion[^>]*>/g, 'a real criterion');
    assert.match(validateRubric(filled).join(' '), /placeholder/);
  });

  test('numbered lines inside a fenced code block are not criteria', () => {
    const text = ['1. one', '2. two', '```', '3. code', '4. code', '```', '~~~', '5. code', '~~~'].join('\n');
    assert.equal(countCriteria(text), 2);
    assert.match(validateRubric(text).join(' '), /3 to 6/);
  });

  test('fences close the CommonMark way: same character, at least as long, nothing after it', () => {
    // A shorter fence inside a longer one is content, not a closer.
    assert.deepEqual(outsideFences(['````', '```', '1. inside a fence', '````', '1. outside'].join('\n')), ['1. outside']);
    assert.deepEqual(outsideFences(['~~~~', '~~~', '1. inside', '~~~~', '1. outside'].join('\n')), ['1. outside']);
    // The other character does not close the fence.
    assert.deepEqual(outsideFences(['```', '~~~', '1. inside', '```', '1. outside'].join('\n')), ['1. outside']);
    assert.deepEqual(outsideFences(['~~~', '```', '1. inside', '~~~', '1. outside'].join('\n')), ['1. outside']);
    // A longer closer closes; a fence line with an info string does not.
    assert.deepEqual(outsideFences(['```', '1. inside', '`````', '1. outside'].join('\n')), ['1. outside']);
    assert.deepEqual(outsideFences(['```', '```js', '1. inside', '```', '1. outside'].join('\n')), ['1. outside']);
    // A backtick info string cannot hold a backtick, so this line is inline code, not a fence.
    assert.deepEqual(outsideFences('```a` b```\n1. outside'), ['```a` b```', '1. outside']);
    // Indented fences (inside list items) count, and spaces after a closer are allowed.
    assert.deepEqual(outsideFences(['  ```', '1. inside', '  ```  ', '1. outside'].join('\n')), ['1. outside']);
  });

  test('a rubric that shows a nested fence counts only its own criteria', () => {
    const text = ['1. one', '2. two', '3. three', '````md', '```', '1. example', '````', ''].join('\n');
    assert.equal(countCriteria(text), 3);
    assert.deepEqual(validateRubric(text), []);
  });
});

describe('isExcluded', () => {
  test('only brief.md and .git are left out; other hidden names are output', () => {
    assert.deepEqual(['brief.md', '.git', '.github', '.env', 'notes.md'].filter(isExcluded), ['brief.md', '.git']);
  });
});

describe('synthesisTemplate', () => {
  test('has every section the synthesis note needs', () => {
    const t = synthesisTemplate('a helper');
    for (const h of ['Base', 'Judge', 'My scores', 'Grafts', 'Rejected', 'Convergence and dropouts', 'Verification']) {
      assert.match(t, new RegExp(`## ${h}`), h);
    }
    assert.match(t, /a helper/);
    assert.match(t, /Base commit:/);
  });
});

describe('parseArgs', () => {
  test('init with --n and --task', () => {
    assert.deepEqual(parseArgs(['init', 'x', '--n', '4', '--task', 'a thing']), { cmd: 'init', dir: 'x', n: 4, task: 'a thing' });
  });
  test('init defaults to 3 candidates', () => assert.equal(parseArgs(['init', 'x']).n, 3));
  test('blind with --out and --seed', () => {
    assert.deepEqual(parseArgs(['blind', 'x', '--out', 'y', '--seed', '9']), { cmd: 'blind', dir: 'x', out: 'y', seed: 9, force: false });
  });
  test('blind --force', () => assert.equal(parseArgs(['blind', 'x', '--force']).force, true));
  test('bad input throws', () => {
    for (const bad of [[], ['nope', 'x'], ['init'], ['init', 'x', '--n', '1'], ['init', 'x', '--n', '27'], ['init', 'x', '--n', 'two'],
      ['blind', 'x', '--seed', 'abc'], ['init', 'x', '--wat'], ['init', 'x', '--force']]) {
      assert.throws(() => parseArgs(bad), undefined, JSON.stringify(bad));
    }
  });
});

describe('init', () => {
  test('creates the candidate folders, the rubric and the synthesis note', () => {
    const dir = join(tempDir('arena-'), 'run');
    const r = runNode(SCRIPT, { args: ['init', dir, '--n', '2', '--task', 'helper interface'] });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(readdirSync(dir).sort(), ['SYNTHESIS.md', 'candidate-1', 'candidate-2', 'rubric.md']);
    assert.ok(existsSync(join(dir, 'candidate-1', 'brief.md')));
    assert.match(readFileSync(join(dir, 'rubric.md'), 'utf8'), /helper interface/);
  });

  test('refuses a folder that is not empty, and changes nothing in it', () => {
    const dir = tempDir('arena-');
    writeFileSync(join(dir, 'keep.txt'), 'mine');
    const r = runNode(SCRIPT, { args: ['init', dir] });
    assert.equal(r.code, 1);
    assert.deepEqual(readdirSync(dir), ['keep.txt']);
  });

  test('a usage error exits 2', () => assert.equal(runNode(SCRIPT, { args: ['init'] }).code, 2));
});


describe('input errors give a message, not a stack trace', () => {
  const noStack = (r) => assert.doesNotMatch(r.stderr, /^\s+at /m, r.stderr);

  test('init on a path that is a file exits 1', () => {
    const f = join(tempDir('arena-'), 'file');
    writeFileSync(f, 'x');
    const r = runNode(SCRIPT, { args: ['init', f] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /not a folder/);
    noStack(r);
  });

  test('a rubric.md that is a folder exits 1', () => {
    const dir = join(tempDir('arena-'), 'run');
    assert.equal(main(['init', dir, '--n', '2'], () => {}, () => {}), 0);
    rmSync(join(dir, 'rubric.md'));
    mkdirSync(join(dir, 'rubric.md'));
    const r = runNode(SCRIPT, { args: ['blind', dir, '--out', join(tempDir('arena-blind-'), 'b')] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /rubric\.md/);
    noStack(r);
  });

  test('more than 26 candidate folders exits 1', () => {
    const dir = join(tempDir('arena-'), 'run');
    assert.equal(main(['init', dir, '--n', '26'], () => {}, () => {}), 0);
    mkdirSync(join(dir, 'candidate-27'));
    writeFileSync(join(dir, 'rubric.md'), GOOD_RUBRIC);
    for (let k = 1; k <= 27; k++) writeFileSync(join(dir, `candidate-${k}`, 'out.md'), `out ${k}`);
    const out = join(tempDir('arena-blind-'), 'b');
    const r = runNode(SCRIPT, { args: ['blind', dir, '--out', out] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /26/);
    assert.equal(existsSync(out), false);
    noStack(r);
  });

  test('a usage error exits 2 with the usage line', () => {
    const r = runNode(SCRIPT, { args: ['blind'] });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /usage/);
    noStack(r);
  });
});
