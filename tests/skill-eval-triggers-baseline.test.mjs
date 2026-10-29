// skill-eval triggers: the split-summary command, the round's summary/ folder and --baseline with a folder of parts,
// run with the stand-in for `claude` (no model is called). The pure splitSummary and mergeParts are in
// skill-eval-triggers-parts.test.mjs.
import { SCRIPT, scratch } from './skill-eval.helpers.mjs';
import { SKILLS, ALSO, ROUND_LISTS, writeLists, writeSkill, base, trig, sampleSummary as summary } from './skill-eval-triggers.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, cpSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { runNode } from './helpers.mjs';
import { parseArgs } from '../skills/verification/skill-eval/skill-eval.mjs';
import { splitSummary, mergeParts } from '../skills/verification/skill-eval/skill-eval-triggers-count.mjs';

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

/** Every file in a folder, by name, as its text. */
const readParts = (dir) => Object.fromEntries(readdirSync(dir).sort().map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
const asText = (parts) => Object.fromEntries(Object.entries(parts).sort(([a], [b]) => (a < b ? -1 : 1)).map(([f, x]) => [f, JSON.stringify(x, null, 2) + '\n']));

/** Run `split-summary <file> --out <out>`. */
const split = (file, out) => runNode(SCRIPT, { args: ['split-summary', file, '--out', out] });

describe('the split-summary command', () => {
  test('writes the parts of a summary.json, the same files a round writes', () => {
    const r = trig(base(ROUND_LISTS, ['--also', ALSO]));
    assert.equal(r.code, 0, r.stderr);
    const out = join(scratch(), 'parts');
    const s = split(join(r.lab, 'summary.json'), out);
    assert.equal(s.code, 0, s.stderr);
    assert.deepEqual(readParts(out), readParts(join(r.lab, 'summary')));
    assert.match(s.stdout, /Wrote 3 parts to .*parts: pack-boxes\.json, round\.json, tidy-notes\.json/);
    const empty = join(scratch(), 'empty');
    mkdirSync(empty);
    assert.equal(split(join(r.lab, 'summary.json'), empty).code, 0, 'an empty --out is fine');
    assert.deepEqual(readParts(empty), readParts(out));
  });

  test('warns about a part over 20,000 bytes and still writes it', () => {
    const s = summary();
    s.runs = s.runs.map((r) => (r.list === 'tidy-notes' ? { ...r, request: `tidy ${'x'.repeat(5000)}` } : r));
    const file = join(scratch(), 'summary.json');
    writeFileSync(file, JSON.stringify(s));
    const out = join(scratch(), 'parts');
    const r = split(file, out);
    assert.equal(r.code, 0, r.stderr);
    const bytes = readFileSync(join(out, 'tidy-notes.json')).length;
    assert.match(r.stderr, new RegExp(`warning: tidy-notes\\.json is ${bytes} bytes, over 20000`));
    assert.doesNotMatch(r.stderr, /pack-boxes\.json|round\.json/);
  });

  test('refuses an --out that is not an empty folder, a summary without format 1, and a list name that is a path', () => {
    const good = join(scratch(), 'summary.json');
    writeFileSync(good, JSON.stringify(summary()));
    const full = scratch();
    writeFileSync(join(full, 'keep.txt'), 'mine');
    const file = join(scratch(), 'out.txt');
    writeFileSync(file, 'a file');
    for (const out of [full, file]) {
      const r = split(good, out);
      assert.equal(r.code, 1, out);
      assert.match(r.stderr, /already exists and is not an empty folder/, out);
    }
    assert.deepEqual(readdirSync(full), ['keep.txt']);
    const s = summary();
    const bad = (name, data) => { const f = join(scratch(), name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data)); return f; };
    const escaped = s.runs.map((r) => (r.list === 'tidy-notes' ? { ...r, list: '../escaped' } : r));
    for (const [f, re] of [[bad('old.json', { ...s, format: 2 }), /"format": 1/], [bad('broken.json', '{'), /not JSON/],
      [join(scratch(), 'gone.json'), /does not exist/], [bad('escape.json', { ...s, runs: escaped }), /list name "\.\.\/escaped"/],
      [bad('round.json', { ...s, runs: s.runs.map((r) => ({ ...r, list: 'round' })) }), /list name "round"/]]) {
      const dir = scratch();
      const out = join(dir, 'parts');
      const r = split(f, out);
      assert.equal(r.code, 1, f);
      assert.match(r.stderr, re, f);
      assert.deepEqual(readdirSync(dir), [], 'nothing written, not even beside --out');
    }
  });
});

describe('--baseline with a folder of parts', () => {
  const tidy = { 'tidy-notes': { should: ['tidy a', 'tidy b'] } };
  const run = (index, request, started) => ({ id: `tidy-notes-s${index}-r1`, list: 'tidy-notes', kind: 'should', index, repeat: 1, request, expect: 'tidy-notes', started, finished: true });
  /** A folder with round.json, tidy-notes.json and a README.txt, plus any extra files. */
  function folder(extra = {}, { round = true } = {}) {
    const dir = scratch();
    const files = {
      'tidy-notes.json': { format: 1, part: 'tidy-notes', runs: [run(1, 'tidy a', 'none'), run(2, 'gone one', 'none')], perSkill: { 'tidy-notes': { hits: 0, wrongStarts: [] } } },
      ...(round ? { 'round.json': { format: 1, part: 'round', perSkill: { constructor: { hits: 1, wrongStarts: [] } } } } : {}),
      ...extra,
    };
    for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), typeof data === 'string' ? data : JSON.stringify(data));
    writeFileSync(join(dir, 'README.txt'), 'not a part');
    return dir;
  }

  /** A folder whose round.json and tidy-notes.json are links to the files of folder(). */
  function linked() {
    const real = folder();
    const dir = scratch();
    for (const name of ['round.json', 'tidy-notes.json']) symlinkSync(join(real, name), join(dir, name));
    return dir;
  }

  const compares = (dir) => {
    const r = trig(base(writeLists(tidy), ['--repeats', '1', '--baseline', dir]));
    assert.equal(r.code, 0, r.stderr);
    const tail = r.stdout.slice(r.stdout.indexOf('Compared with'));
    assert.ok(tail.startsWith(`Compared with ${dir}:`), tail);
    assert.match(tail, /better: tidy-notes hits 0 -> 2/);
    assert.match(tail, /better: tidy-notes should "tidy a": right 0 of 1 -> 1 of 1/);
    assert.match(tail, /new: tidy-notes should "tidy b"/);
    assert.match(tail, /gone: tidy-notes should "gone one"/);
  };

  test('merges the parts and compares with them; another file in the folder is ignored', () => compares(folder()));

  test('a part that is a link to a file is read like the file', { skip: process.platform === 'win32' }, () => compares(linked()));

  test('a round compared with its own parts, and with its summary.json, prints no change', () => {
    const first = trig(base(ROUND_LISTS, ['--also', ALSO]));
    assert.equal(first.code, 0, first.stderr);
    for (const old of [join(first.lab, 'summary'), join(first.lab, 'summary.json')]) {
      const again = trig(base(ROUND_LISTS, ['--also', ALSO, '--baseline', old]));
      assert.equal(again.code, 0, again.stderr);
      assert.ok(again.stdout.endsWith(`Compared with ${old}:\n  no change\n`), old);
    }
  });

  test('refuses, before any call and also with --plan, a missing round.json, a part without format 1 or not JSON, and a run id or skill in two parts', () => {
    const lists = writeLists(tidy);
    const twin = { format: 1, part: 'twin', runs: [run(1, 'tidy a', 'none')], perSkill: {} };
    const cases = [
      [folder({}, { round: false }), /no round\.json/],
      [folder({ 'old.json': { format: 2, runs: [] } }), /old\.json is not a summary part with "format": 1/],
      [folder({ 'broken.json': '{' }), /broken\.json is not JSON/],
      [folder({ 'twin.json': twin }), /run tidy-notes-s1-r1 is in two parts: tidy-notes\.json and twin\.json/],
      [folder({ 'twin.json': { ...twin, runs: [], perSkill: { constructor: {} } } }), /skill constructor is in two parts: round\.json and twin\.json/],
    ];
    const withFolder = folder();
    mkdirSync(join(withFolder, 'x.json'));
    cases.push([withFolder, /x\.json is not a file or a link to a file/]);
    if (process.platform !== 'win32') {
      const dangling = linked();
      symlinkSync(join(scratch(), 'missing.json'), join(dangling, 'gone.json'));
      cases.push([dangling, /gone\.json is not a file or a link to a file/]);
    }
    for (const [dir, re] of cases) {
      for (const extra of [[], ['--plan']]) {
        const r = trig(base(lists, ['--baseline', dir, ...extra]));
        assert.equal(r.code, 1, `${re}`);
        assert.match(r.stderr, re);
        assert.match(r.stderr, /refused: the baseline/);
        assert.equal(r.calls.length + r.auth.length, 0);
      }
    }
  });
});

describe('a round writes summary/', () => {
  test('one file per list and round.json, the parts of summary.json, which merge back into it', () => {
    const r = trig(base(ROUND_LISTS, ['--also', ALSO]));
    assert.equal(r.code, 0, r.stderr);
    const dir = join(r.lab, 'summary');
    const files = readParts(dir);
    assert.deepEqual(Object.keys(files), ['pack-boxes.json', 'round.json', 'tidy-notes.json']);
    assert.deepEqual(files, asText(splitSummary(r.summary)));
    assert.deepEqual(mergeParts(Object.fromEntries(Object.entries(files).map(([f, t]) => [f, JSON.parse(t)]))), r.summary);
    assert.ok(r.stdout.includes(`Summary: ${join(r.lab, 'summary.json')} and its parts in ${dir}; transcripts in`));
    assert.doesNotMatch(r.stderr, /warning/);
  });

  test('a part over 20,000 bytes is written with a warning', () => {
    const long = Array.from({ length: 12 }, (_, i) => `tidy ${String(i).padStart(2, '0')} ${'x'.repeat(1900)}`);
    const r = trig(base(writeLists({ 'tidy-notes': { should: long } }), ['--repeats', '1']));
    assert.equal(r.code, 0, r.stderr);
    const bytes = readFileSync(join(r.lab, 'summary', 'tidy-notes.json')).length;
    assert.ok(bytes > 20_000, String(bytes));
    assert.match(r.stderr, new RegExp(`warning: tidy-notes\\.json is ${bytes} bytes, over 20000`));
    assert.doesNotMatch(r.stderr, /round\.json is/);
  });

  test('a lab whose summary/ is not an empty folder is refused before any call, also with --plan', () => {
    const lists = writeLists({ 'tidy-notes': { should: ['tidy a'] } });
    const full = join(scratch(), 'lab');
    mkdirSync(join(full, 'summary'), { recursive: true });
    writeFileSync(join(full, 'summary', 'old.json'), '{}');
    const file = join(scratch(), 'lab');
    mkdirSync(file);
    writeFileSync(join(file, 'summary'), 'not a folder');
    for (const lab of [full, file]) {
      for (const extra of [[], ['--plan']]) {
        const r = trig(base(lists, ['--repeats', '1', ...extra]), { lab });
        assert.equal(r.code, 1, lab);
        assert.match(r.stderr, /summary already exists and is not an empty folder/, lab);
        assert.equal(r.calls.length + r.auth.length, 0, lab);
      }
    }
    const empty = join(scratch(), 'lab');
    mkdirSync(join(empty, 'summary'), { recursive: true });
    assert.equal(trig(base(lists, ['--repeats', '1']), { lab: empty }).code, 0, 'an empty summary/ is fine');
    assert.ok(existsSync(join(empty, 'summary', 'round.json')));
  });

  test('a list for a skill named round is refused before any call, also with --plan', () => {
    const skills = scratch();
    cpSync(SKILLS, skills, { recursive: true });
    writeSkill(join(skills, 'round'), 'round');
    const lists = writeLists({ round: { should: ['round it'] } });
    for (const extra of [[], ['--plan']]) {
      const r = trig(['--skills', skills, '--requests', lists, '--model', 'm', '--max-usd', '5', ...extra]);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /round\.json: a list may not be for a skill named round/);
      assert.equal(r.calls.length + r.auth.length, 0);
    }
  });
});
