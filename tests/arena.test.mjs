// The arena helper: label shuffling and rubric checks (pure), and the init and blind commands against real folders.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, symlinkSync, lstatSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import {
  mulberry32, shuffle, assignLabels, countCriteria, validateRubric, isExcluded, rubricTemplate, outsideFences,
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

// Fix round: nothing the judge receives may name a candidate or lead back to a brief.
describe('blind: what reaches the judge', () => {
  const quiet = () => {};
  /** An arena with two filled candidates; `setup(dir)` adds the case under test. Returns the arena folder. */
  function make(setup = () => {}) {
    const dir = join(tempDir('arena-'), 'run');
    assert.equal(main(['init', dir, '--n', '2'], quiet, quiet), 0);
    writeFileSync(join(dir, 'rubric.md'), GOOD_RUBRIC);
    for (const k of [1, 2]) {
      writeFileSync(join(dir, `candidate-${k}`, 'brief.md'), `secret brief ${k}`);
      writeFileSync(join(dir, `candidate-${k}`, 'notes.md'), `notes ${k}`);
    }
    setup(dir);
    return dir;
  }
  const run = (args) => {
    const out = [];
    const err = [];
    const code = main(args, (s) => out.push(s), (s) => err.push(s));
    return { code, out: out.join('\n'), err: err.join('\n') };
  };
  const walk = (d) => readdirSync(d).flatMap((e) => {
    const f = join(d, e);
    const st = lstatSync(f);
    return st.isDirectory() ? [f, ...walk(f)] : [f];
  });
  const key = (dir) => JSON.parse(readFileSync(join(dir, 'blind-key.json'), 'utf8'));
  const freshOut = () => join(tempDir('arena-blind-'), 'b');

  test('a link to a file inside the same candidate is copied as a plain file with its content', () => {
    const dir = make((d) => {
      mkdirSync(join(d, 'candidate-1', 'src'));
      writeFileSync(join(d, 'candidate-1', 'src', 'real.md'), 'the real content');
      symlinkSync('src/real.md', join(d, 'candidate-1', 'alias.md'));
    });
    const out = freshOut();
    const r = run(['blind', dir, '--out', out, '--seed', '1']);
    assert.equal(r.code, 0, r.err);
    const label = Object.entries(key(dir).labels).find(([, c]) => c === 'candidate-1')[0];
    assert.equal(readFileSync(join(out, label, 'alias.md'), 'utf8'), 'the real content');
    for (const f of walk(out)) assert.equal(lstatSync(f).isSymbolicLink(), false, `${f} is a link`);
  });

  for (const [name, target] of [
    ['a sibling candidate\'s brief', (d) => join(d, 'candidate-2', 'brief.md')],
    ['its own brief', () => 'brief.md'],
    ['a file outside the arena', () => { const f = join(tempDir('arena-out-'), 'x.md'); writeFileSync(f, 'x'); return f; }],
    ['a target that does not exist', () => 'missing.md'],
  ]) {
    test(`a link to ${name} is refused, naming the link, before anything is copied`, () => {
      const dir = make((d) => symlinkSync(target(d), join(d, 'candidate-1', 'leak.md')));
      const out = freshOut();
      const r = run(['blind', dir, '--out', out]);
      assert.equal(r.code, 1);
      assert.match(r.err, /candidate-1\/leak\.md/);
      assert.equal(existsSync(out), false);
      assert.equal(existsSync(join(dir, 'blind-key.json')), false);
    });
  }

  test('a candidate folder that is a link to a folder elsewhere is a candidate', () => {
    const elsewhere = tempDir('arena-worktree-');
    writeFileSync(join(elsewhere, 'change.patch'), 'diff --git a/x b/x');
    const dir = make((d) => symlinkSync(elsewhere, join(d, 'candidate-3')));
    const out = freshOut();
    const r = run(['blind', dir, '--out', out, '--seed', '2']);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(Object.values(key(dir).labels).sort(), ['candidate-1', 'candidate-2', 'candidate-3']);
    const label = Object.entries(key(dir).labels).find(([, c]) => c === 'candidate-3')[0];
    assert.equal(readFileSync(join(out, label, 'change.patch'), 'utf8'), 'diff --git a/x b/x');
  });

  test('a candidate folder that is a broken link is refused, not dropped', () => {
    const dir = make((d) => symlinkSync(join(d, 'gone'), join(d, 'candidate-3')));
    const r = run(['blind', dir, '--out', freshOut()]);
    assert.equal(r.code, 1);
    assert.match(r.err, /candidate-3/);
  });

  test('hidden output at the top of a candidate counts and is copied', () => {
    const dir = make((d) => {
      writeFileSync(join(d, 'candidate-2', 'notes.md'), '');
      mkdirSync(join(d, 'candidate-2', '.github', 'workflows'), { recursive: true });
      writeFileSync(join(d, 'candidate-2', '.github', 'workflows', 'ci.yml'), 'on: push');
    });
    const out = freshOut();
    assert.equal(run(['blind', dir, '--out', out, '--seed', '3']).code, 0);
    assert.deepEqual(key(dir).dropouts, []);
    const label = Object.entries(key(dir).labels).find(([, c]) => c === 'candidate-2')[0];
    assert.equal(readFileSync(join(out, label, '.github', 'workflows', 'ci.yml'), 'utf8'), 'on: push');
  });

  test('a candidate whose output files are all empty is a dropout', () => {
    const dir = make((d) => {
      writeFileSync(join(d, 'candidate-2', 'notes.md'), '');
      writeFileSync(join(d, 'candidate-2', 'change.patch'), '');
      mkdirSync(join(d, 'candidate-3'));
      writeFileSync(join(d, 'candidate-3', 'design.md'), 'design 3');
    });
    const r = run(['blind', dir, '--out', freshOut()]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(key(dir).dropouts, ['candidate-2']);
  });

  test('.git is never copied, at the top or nested, as a folder or a file', () => {
    const dir = make((d) => {
      mkdirSync(join(d, 'candidate-1', '.git'));
      writeFileSync(join(d, 'candidate-1', '.git', 'HEAD'), 'ref: refs/heads/par/arena/candidate-1');
      mkdirSync(join(d, 'candidate-2', 'sub'));
      writeFileSync(join(d, 'candidate-2', 'sub', '.git'), 'gitdir: /somewhere/candidate-2');
      writeFileSync(join(d, 'candidate-2', 'sub', 'brief.md'), 'nested brief');
    });
    const out = freshOut();
    assert.equal(run(['blind', dir, '--out', out]).code, 0);
    const names = walk(out).map((f) => f.slice(out.length));
    assert.deepEqual(names.filter((n) => /(^|\/)(\.git|brief\.md)$/.test(n)), []);
  });

  test('a second run is refused while a key exists, unless --force', () => {
    const dir = make();
    assert.equal(run(['blind', dir, '--out', freshOut()]).code, 0);
    const first = readFileSync(join(dir, 'blind-key.json'), 'utf8');
    const out2 = freshOut();
    const r = run(['blind', dir, '--out', out2]);
    assert.equal(r.code, 1);
    assert.match(r.err, /--force/);
    assert.equal(existsSync(out2), false);
    assert.equal(readFileSync(join(dir, 'blind-key.json'), 'utf8'), first);
    assert.equal(run(['blind', dir, '--out', out2, '--force']).code, 0);
  });

  test('--out inside the arena folder is refused before anything is copied', () => {
    for (const inside of ['candidate-1/judge', 'judge', '.']) {
      const dir = make();
      const before = walk(dir).length;
      const r = run(['blind', dir, '--out', join(dir, inside)]);
      assert.equal(r.code, 1, inside);
      assert.match(r.err, /inside the arena folder/);
      assert.equal(walk(dir).length, before, `${inside}: something was written`);
    }
  });
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
