// The arena helper: label shuffling and rubric checks (pure), and the init and blind commands against real folders.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import {
  mulberry32, shuffle, assignLabels, countCriteria, validateRubric, candidateOutputs, rubricTemplate,
  synthesisTemplate, parseArgs, main,
} from '../skills/agent-orchestration/arena/arena.mjs';

const SCRIPT = repo('skills', 'agent-orchestration', 'arena', 'arena.mjs');

const GOOD_RUBRIC = [
  '# Rubric', '', 'Task: a helper', '',
  '1. A caller needs one call for the common case.',
  '2. No internal type appears in the interface.',
  '3. Errors name the input that caused them.',
  '',
].join('\n');

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
});

describe('candidateOutputs', () => {
  test('brief.md, hidden files and .git do not count as output', () => {
    assert.deepEqual(candidateOutputs(['brief.md', '.DS_Store', '.git']), []);
    assert.deepEqual(candidateOutputs(['brief.md', 'notes.md', 'change.patch']), ['notes.md', 'change.patch']);
  });
});

describe('synthesisTemplate', () => {
  test('has every section the synthesis note needs', () => {
    const t = synthesisTemplate('a helper');
    for (const h of ['Base', 'Judge', 'My scores', 'Grafts', 'Rejected', 'Convergence and dropouts', 'Verification']) {
      assert.match(t, new RegExp(`## ${h}`), h);
    }
    assert.match(t, /a helper/);
  });
});

describe('parseArgs', () => {
  test('init with --n and --task', () => {
    assert.deepEqual(parseArgs(['init', 'x', '--n', '4', '--task', 'a thing']), { cmd: 'init', dir: 'x', n: 4, task: 'a thing' });
  });
  test('init defaults to 3 candidates', () => assert.equal(parseArgs(['init', 'x']).n, 3));
  test('blind with --out and --seed', () => {
    assert.deepEqual(parseArgs(['blind', 'x', '--out', 'y', '--seed', '9']), { cmd: 'blind', dir: 'x', out: 'y', seed: 9 });
  });
  test('bad input throws', () => {
    for (const bad of [[], ['nope', 'x'], ['init'], ['init', 'x', '--n', '1'], ['init', 'x', '--n', '27'], ['init', 'x', '--n', 'two'],
      ['blind', 'x', '--seed', 'abc'], ['init', 'x', '--wat']]) {
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

describe('blind', () => {
  function arena({ rubric = GOOD_RUBRIC, outputs = [true, true, true] } = {}) {
    const dir = join(tempDir('arena-'), 'run');
    const out = [];
    assert.equal(main(['init', dir, '--n', String(outputs.length)], (s) => out.push(s), () => {}), 0);
    writeFileSync(join(dir, 'rubric.md'), rubric);
    outputs.forEach((has, i) => {
      const c = join(dir, `candidate-${i + 1}`);
      writeFileSync(join(c, 'brief.md'), `secret brief ${i + 1}: minimize the interface`);
      if (has) {
        mkdirSync(join(c, 'src'));
        writeFileSync(join(c, 'src', 'design.md'), `design from candidate ${i + 1}`);
        writeFileSync(join(c, 'notes.md'), `notes ${i + 1}`);
      }
    });
    return dir;
  }

  test('copies each candidate under a shuffled label, without its brief, plus the rubric, and writes the key', () => {
    const dir = arena();
    const blindDir = join(tempDir('arena-blind-'), 'b');
    const r = runNode(SCRIPT, { args: ['blind', dir, '--out', blindDir, '--seed', '5'] });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(readdirSync(blindDir).sort(), ['A', 'B', 'C', 'rubric.md']);
    const key = JSON.parse(readFileSync(join(dir, 'blind-key.json'), 'utf8'));
    assert.deepEqual(Object.keys(key.labels).sort(), ['A', 'B', 'C']);
    assert.deepEqual(Object.values(key.labels).sort(), ['candidate-1', 'candidate-2', 'candidate-3']);
    assert.deepEqual(key.dropouts, []);
    for (const label of ['A', 'B', 'C']) {
      assert.deepEqual(readdirSync(join(blindDir, label)).sort(), ['notes.md', 'src']);
      const n = key.labels[label].split('-')[1];
      assert.equal(readFileSync(join(blindDir, label, 'src', 'design.md'), 'utf8'), `design from candidate ${n}`);
    }
    assert.equal(readFileSync(join(blindDir, 'rubric.md'), 'utf8'), GOOD_RUBRIC);
    assert.doesNotMatch(r.stdout, /candidate-\d/, 'the output does not print which label is which candidate');
  });

  test('the same seed gives the same key; the labels are not always in candidate order', () => {
    const keys = [];
    let shuffled = false;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const dir = arena();
      assert.equal(main(['blind', dir, '--out', join(tempDir('arena-blind-'), 'b'), '--seed', String(seed)], () => {}, () => {}), 0);
      const k = JSON.parse(readFileSync(join(dir, 'blind-key.json'), 'utf8')).labels;
      keys.push(JSON.stringify(k));
      if (k.A !== 'candidate-1' || k.B !== 'candidate-2') shuffled = true;
    }
    const dir = arena();
    main(['blind', dir, '--out', join(tempDir('arena-blind-'), 'b'), '--seed', '1'], () => {}, () => {});
    assert.equal(JSON.stringify(JSON.parse(readFileSync(join(dir, 'blind-key.json'), 'utf8')).labels), keys[0]);
    assert.ok(shuffled, 'six seeds all kept candidate order');
  });

  test('a candidate with no output is a dropout and gets no label', () => {
    const dir = arena({ outputs: [true, false, true] });
    const blindDir = join(tempDir('arena-blind-'), 'b');
    const lines = [];
    assert.equal(main(['blind', dir, '--out', blindDir, '--seed', '1'], (s) => lines.push(s), () => {}), 0);
    const key = JSON.parse(readFileSync(join(dir, 'blind-key.json'), 'utf8'));
    assert.deepEqual(key.dropouts, ['candidate-2']);
    assert.deepEqual(Object.values(key.labels).sort(), ['candidate-1', 'candidate-3']);
    assert.deepEqual(readdirSync(blindDir).sort(), ['A', 'B', 'rubric.md']);
    assert.match(lines.join('\n'), /dropout/i);
  });

  test('fewer than two candidates with output is refused', () => {
    const dir = arena({ outputs: [true, false, false] });
    const blindDir = join(tempDir('arena-blind-'), 'b');
    const errs = [];
    assert.equal(main(['blind', dir, '--out', blindDir], () => {}, (s) => errs.push(s)), 1);
    assert.match(errs.join('\n'), /fewer than 2/);
    assert.equal(existsSync(join(dir, 'blind-key.json')), false);
  });

  test('an invalid rubric is refused before anything is copied', () => {
    const dir = arena({ rubric: '1. only one criterion' });
    const blindDir = join(tempDir('arena-blind-'), 'b');
    const errs = [];
    assert.equal(main(['blind', dir, '--out', blindDir], () => {}, (s) => errs.push(s)), 1);
    assert.match(errs.join('\n'), /3 to 6/);
    assert.equal(existsSync(blindDir), false);
  });

  test('a blind folder that is not empty is refused', () => {
    const dir = arena();
    const blindDir = tempDir('arena-blind-');
    writeFileSync(join(blindDir, 'old.md'), 'stale');
    assert.equal(main(['blind', dir, '--out', blindDir], () => {}, () => {}), 1);
    assert.deepEqual(readdirSync(blindDir), ['old.md']);
  });

  test('without --out it makes a fresh folder outside the arena folder', () => {
    const dir = arena();
    const lines = [];
    assert.equal(main(['blind', dir], (s) => lines.push(s), () => {}), 0);
    const m = /Blind folder: (.+)/.exec(lines.join('\n'));
    assert.ok(m, lines.join('\n'));
    assert.ok(!m[1].startsWith(dir), m[1]);
    assert.deepEqual(readdirSync(m[1]).sort(), ['A', 'B', 'C', 'rubric.md']);
  });

  test('a missing arena folder exits 1', () => {
    assert.equal(main(['blind', join(tempDir('arena-'), 'nothing-here')], () => {}, () => {}), 1);
  });
});
