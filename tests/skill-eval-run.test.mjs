// The skill-eval run, blind, judge and unblind commands against real folders, with a stand-in for the `claude` command
// so no model is called. The last test checks that the stand-in wrote nothing inside the repository.
import { SCRIPT, FAKE, MY_READ, GOOD_RUBRIC, scratch, setup, plan, runFake, judgeFake } from './skill-eval.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, utimesSync, realpathSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { repo, runNode } from './helpers.mjs';
import { ALLOWED_ENV, rubricTemplate } from '../skills/verification/skill-eval/skill-eval.mjs';

describe('run', () => {
  test('needs --model', () => {
    const { lab } = setup();
    const r = runNode(SCRIPT, { args: ['run', lab], env: { SKILL_EVAL_CLAUDE: FAKE } });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--model/);
  });

  test('prints the calls a run had refused, so a blocked run is seen before blinding', () => {
    const { lab } = setup();
    const r = runFake(lab, { env: { FAKE_CLAUDE_DENY: '1' } });
    assert.match(r.stdout, /refused by permissions: Bash: rm -rf build/);
  });

  test('runs every folder with its own HOME, no identity of this session, and saves each transcript in the lab', () => {
    const { lab } = setup();
    const p = plan(lab);
    const r = runFake(lab, { extra: ['--allow-tool', 'Bash(ls *)'] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.calls.length, 4);
    for (const run of p.runs) {
      // Compared resolved: a run reports its real working folder, and the temporary folder can be a link (macOS).
      const call = r.calls.find((c) => realpathSync(c.cwd) === realpathSync(run.dir));
      assert.ok(call, `a call ran in ${run.dir}`);
      assert.equal(call.home, run.home);
      // macOS adds __CF_USER_TEXT_ENCODING to every process it starts, whatever the parent passes.
      const extra = call.names.filter((n) => !ALLOWED_ENV.includes(n) && !/^LC_/.test(n) && !['HOME', 'FAKE_CLAUDE_LOG', '__CF_USER_TEXT_ENCODING'].includes(n));
      assert.deepEqual(extra, [], 'only the allowlist and the passed names reach a run');
      for (const n of ['PATH', 'HOME', 'HTTPS_PROXY', 'LANG', 'FAKE_CLAUDE_LOG']) assert.ok(call.names.includes(n), n);
      assert.equal(call.argv[1], p.prompts[run.variant]);
      assert.ok(call.argv.includes('Bash(ls *)'));
      assert.ok(call.argv.includes('some-model'));
      assert.ok(existsSync(join(lab, 'runs', `${run.id}.jsonl`)));
      assert.ok(!existsSync(join(run.dir, `${run.id}.jsonl`)));
    }
    assert.match(r.stdout, /total \$0\.20/);
  });

  test('refuses to run again over saved transcripts unless --force', () => {
    const { lab } = setup();
    assert.equal(runFake(lab).code, 0);
    const again = runFake(lab);
    assert.equal(again.code, 1);
    assert.equal(again.calls.length, 0);
    assert.equal(runFake(lab, { extra: ['--force'] }).code, 0);
  });

  test('--force rebuilds every run folder, its HOME and the installed variant from the lab before running again', () => {
    const { lab } = setup();
    assert.equal(runFake(lab).code, 0);
    assert.equal(runFake(lab, { extra: ['--force'] }).code, 0);
    for (const run of plan(lab).runs) {
      assert.equal(readFileSync(join(run.dir, 'notes.txt'), 'utf8').split('tidied').length - 1, 1, 'the first run\'s edit is gone');
      assert.equal(readFileSync(join(run.dir, '.claude', 'skills', 'tidy-notes', 'SKILL.md'), 'utf8').split('INSTALLED VARIANT TEXT').length - 1, 1);
      assert.equal(readFileSync(join(run.home, '.seen'), 'utf8').trim().split('\n').length, 1, 'a fresh HOME');
      const log = spawnSync('git', ['-C', run.dir, 'log', '--format=%H'], { encoding: 'utf8' }).stdout.trim().split('\n');
      assert.deepEqual(log, [run.base]);
    }
  });

  test('refuses to run again once a blind copy exists', () => {
    const { lab } = setup();
    assert.equal(runFake(lab).code, 0);
    writeFileSync(join(lab, 'rubric.md'), GOOD_RUBRIC);
    assert.equal(runNode(SCRIPT, { args: ['blind', lab, '--out', join(scratch(), 'b')] }).code, 0);
    const again = runFake(lab, { extra: ['--force'] });
    assert.equal(again.code, 1);
    assert.match(again.stderr, /blind/);
    assert.equal(again.calls.length, 0);
  });

  test('checks the login under the empty HOME first, and points at --real-home when it fails', () => {
    const s = setup();
    // The login is checked under a fresh empty HOME in the temporary folder, named h-XXXXXX.
    const emptyHomes = join(tmpdir(), 'h-');
    const out = runFake(s.lab, { env: { FAKE_CLAUDE_LOGGED_OUT: emptyHomes } });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /logged in.*--real-home/s);
    assert.equal(out.calls.length, 0, 'no run started');
    assert.ok(out.auth.length >= 1);
    const home = scratch();
    const real = runFake(s.lab, { extra: ['--real-home'], env: { FAKE_CLAUDE_LOGGED_OUT: emptyHomes, HOME: home } });
    assert.equal(real.code, 0, real.stderr);
    for (const c of real.calls) assert.equal(c.home, home);
    assert.equal(JSON.parse(readFileSync(join(s.lab, 'run.json'), 'utf8')).realHome, true);
  });

  test('a run that fails is reported and the command exits 1', () => {
    const { lab } = setup();
    const r = runFake(lab, { env: { FAKE_CLAUDE_FAIL: '1' } });
    assert.equal(r.code, 1);
    assert.match(r.stdout + r.stderr, /exit 1/);
  });
});

describe('blind, judge and unblind', () => {
  function ready() {
    const s = setup();
    assert.equal(runFake(s.lab).code, 0);
    writeFileSync(join(s.lab, 'rubric.md'), GOOD_RUBRIC);
    return s;
  }

  test('blind refuses an unfilled rubric', () => {
    const s = setup();
    runFake(s.lab);
    const r = runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /placeholder|3 to 6/);
  });

  test('blind writes one file per run under shuffled letters, with no variant, run id, path or skill text in it', () => {
    const s = ready();
    const out = join(scratch(), 'b');
    const r = runNode(SCRIPT, { args: ['blind', s.lab, '--out', out, '--seed', '3'] });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(readdirSync(out).sort(), ['A.md', 'B.md', 'C.md', 'D.md', 'bundle.md', 'rubric.md']);
    const key = JSON.parse(readFileSync(join(s.lab, 'key.json'), 'utf8'));
    assert.deepEqual(Object.keys(key.labels).sort(), ['A', 'B', 'C', 'D']);
    const p = plan(s.lab);
    for (const l of ['A', 'B', 'C', 'D']) {
      const md = readFileSync(join(out, `${l}.md`), 'utf8');
      assert.match(md, new RegExp(`^# Output ${l}`, 'm'));
      assert.match(md, /done\.txt/, 'the new file is in the diff');
      assert.match(md, /^````+diff$/m, 'the diff fence is longer than any fence inside the diff');
      assert.match(md, /\+tidied/, 'the change to notes.txt is in the diff');
      assert.ok(md.indexOf('## What it changed') < md.indexOf('## What it said at the end'), 'the run\'s own words come last');
      assert.ok(!md.includes('INSTALLED VARIANT TEXT'), 'the installed skill never reaches the blind copy');
      for (const run of p.runs) {
        assert.ok(!md.includes(run.dir) && !md.includes(run.home), 'no absolute run path');
        assert.ok(!new RegExp(`\\b${run.id}\\b`).test(md), 'no run id');
      }
      assert.ok(!/\b(alpha|bravo)\b/.test(md), 'no variant name');
    }
    const bundle = readFileSync(join(out, 'bundle.md'), 'utf8');
    assert.match(bundle, /# Rubric/);
    assert.match(bundle, /Repeated lines are gone/);
    for (const l of ['A', 'B', 'C', 'D']) assert.match(bundle, new RegExp(`^# Output ${l}$`, 'm'));
    assert.ok(!bundle.includes('key.json') && !bundle.includes(s.lab), 'the bundle does not point at the key');
    assert.doesNotMatch(r.stdout, /alpha|bravo|\br\d+\b/);
  });

  test('the letters are shuffled: different seeds give different letter-to-run maps', () => {
    const s = ready();
    const maps = new Set();
    for (const seed of ['1', '2', '3', '4', '5', '6']) {
      const r = runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b'), '--seed', seed, '--force'] });
      assert.equal(r.code, 0, r.stderr);
      maps.add(JSON.stringify(JSON.parse(readFileSync(join(s.lab, 'key.json'), 'utf8')).labels));
    }
    assert.ok(maps.size > 1, 'every seed gave the same letters');
  });

  test('blind --force refuses while your read or a verdict for the old letters exists', () => {
    const s = ready();
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 0);
    writeFileSync(join(s.lab, 'my-read.md'), MY_READ);
    const r = runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b'), '--force'] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /my-read\.md/);
  });

  test('judge and unblind refuse a read older than the key', () => {
    const s = ready();
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 0);
    writeFileSync(join(s.lab, 'my-read.md'), MY_READ);
    const old = new Date(Date.now() - 3600_000);
    utimesSync(join(s.lab, 'my-read.md'), old, old);
    const j = judgeFake(s.lab);
    assert.equal(j.code, 1);
    assert.match(j.stderr, /older than/);
    writeFileSync(join(s.lab, 'my-read.md'), MY_READ);
    assert.equal(judgeFake(s.lab).code, 0);
    utimesSync(join(s.lab, 'verdict.md'), old, old);
    const u = runNode(SCRIPT, { args: ['unblind', s.lab] });
    assert.equal(u.code, 1);
    assert.match(u.stderr, /older than/);
  });

  test('files the task ignores through .gitignore are listed when a run changes them', () => {
    const task = join(scratch(), 'shop');
    mkdirSync(join(task, 'build'), { recursive: true });
    writeFileSync(join(task, 'notes.txt'), 'milk\n');
    writeFileSync(join(task, '.gitignore'), 'build/\n');
    writeFileSync(join(task, 'build', 'old.txt'), 'kept\n');
    const s = setup({ task });
    assert.equal(s.code, 0, s.stderr);
    assert.equal(runFake(s.lab).code, 0);
    writeFileSync(join(s.lab, 'rubric.md'), GOOD_RUBRIC);
    const out = join(scratch(), 'b');
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', out] }).code, 0);
    const md = readFileSync(join(out, 'A.md'), 'utf8');
    assert.match(md, /## Ignored files it changed[\s\S]*new: build\/out\.txt/);
    assert.doesNotMatch(md, /build\/old\.txt/, 'an ignored file it left alone is not listed');
  });

  test('with --grade-reply the final message is marked as the work product', () => {
    const s = setup({ extra: ['--grade-reply'] });
    assert.equal(runFake(s.lab).code, 0);
    writeFileSync(join(s.lab, 'rubric.md'), GOOD_RUBRIC);
    const out = join(scratch(), 'b');
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', out] }).code, 0);
    const md = readFileSync(join(out, 'A.md'), 'utf8');
    assert.match(md, /## What it said at the end \(the work product/);
    assert.doesNotMatch(md, /not evidence/);
    assert.match(readFileSync(join(out, 'bundle.md'), 'utf8'), /final message is the work product/);
  });

  test('the rubric guidance in an HTML comment never reaches the reviewer, and the template keeps it there', () => {
    const s = ready();
    assert.match(rubricTemplate(), /<!--[\s\S]*variant[\s\S]*-->/);
    writeFileSync(join(s.lab, 'rubric.md'), `${GOOD_RUBRIC}\n<!-- note to self: variant two adds the copy -->\n`);
    const out = join(scratch(), 'b');
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', out] }).code, 0);
    assert.doesNotMatch(readFileSync(join(out, 'bundle.md'), 'utf8'), /note to self|variant two/);
    assert.doesNotMatch(readFileSync(join(out, 'rubric.md'), 'utf8'), /note to self/);
  });

  test('blind refuses a second time while a key exists, and refuses an --out inside the lab or the root', () => {
    const s = ready();
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 0);
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 1);
    const t = ready();
    assert.equal(runNode(SCRIPT, { args: ['blind', t.lab, '--out', join(t.lab, 'b')] }).code, 1);
    assert.equal(runNode(SCRIPT, { args: ['blind', t.lab, '--out', join(t.root, 'b')] }).code, 1);
  });

  test('judge sends the bundle on standard input to a run with no tools, in an empty folder, and saves the verdict in the lab', () => {
    const s = ready();
    const out = join(scratch(), 'b');
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', out] }).code, 0);
    writeFileSync(join(s.lab, 'my-read.md'), MY_READ);
    const r = judgeFake(s.lab);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.calls.length, 1);
    const [c] = r.calls;
    assert.equal(c.stdin, readFileSync(join(out, 'bundle.md'), 'utf8'));
    assert.ok(c.argv.includes('judge-model'));
    assert.ok(!c.names.includes('CLAUDECODE'));
    assert.ok(r.auth.length >= 1, 'the login was checked first');
    // Resolved (the temporary folder can be a link, as on macOS); the judge's own folders are gone by now.
    const real = (p) => (existsSync(p) ? realpathSync(p) : join(realpathSync(dirname(p)), basename(p)));
    for (const d of [real(c.cwd), real(c.home)]) {
      assert.ok(!d.startsWith(real(s.lab)) && !d.startsWith(real(s.root)) && !d.startsWith(real(out)), d);
    }
    assert.match(readFileSync(join(s.lab, 'verdict.md'), 'utf8'), /Criterion 1/);
  });

  test('judge refuses before blind, needs --model, and refuses until your own read is saved', () => {
    const s = ready();
    assert.equal(judgeFake(s.lab).code, 1);
    assert.equal(runNode(SCRIPT, { args: ['judge', s.lab], env: { SKILL_EVAL_CLAUDE: FAKE } }).code, 2);
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 0);
    const early = judgeFake(s.lab);
    assert.equal(early.code, 1, 'no read of my own yet');
    assert.match(early.stderr, /my-read\.md/);
    writeFileSync(join(s.lab, 'my-read.md'), 'I liked A best.\nCriterion 1: x\n  A: 4  no score out of 5');
    const unreadable = judgeFake(s.lab);
    assert.equal(unreadable.code, 1, 'a read with no scores in the format is refused');
    assert.match(unreadable.stderr, /Criterion/);
    writeFileSync(join(s.lab, 'my-read.md'), `${MY_READ}\nNotes:\n  A: 2/5 stray`);
    const stray = judgeFake(s.lab);
    assert.equal(stray.code, 1, 'a score line outside a block is refused in your own read');
    assert.match(stray.stderr, /outside a criterion/);
    assert.equal(early.calls.length + unreadable.calls.length + stray.calls.length, 0, 'no judge was started');
  });

  test('unblind refuses until the verdict is saved, then maps letters to variants and lists disagreements', () => {
    const s = ready();
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 0);
    writeFileSync(join(s.lab, 'my-read.md'), MY_READ);
    const early = runNode(SCRIPT, { args: ['unblind', s.lab] });
    assert.equal(early.code, 1, 'no verdict yet');
    assert.match(early.stderr, /verdict\.md/);
    assert.equal(judgeFake(s.lab).code, 0);
    const r = runNode(SCRIPT, { args: ['unblind', s.lab] });
    assert.equal(r.code, 0, r.stderr);
    const key = JSON.parse(readFileSync(join(s.lab, 'key.json'), 'utf8')).labels;
    for (const [label, run] of Object.entries(key)) {
      const variant = plan(s.lab).runs.find((x) => x.id === run).variant;
      assert.match(r.stdout, new RegExp(`${label}\\s+${run}\\s+${variant}`));
    }
    assert.match(r.stdout, /alpha.*3/);
    assert.match(r.stdout, /Disagreements.*\n.*criterion 1, A: judge 3, you 5/);
    assert.match(r.stdout, /cost/i);
  });
});

test('nothing above writes inside the repository', () => {
  const status = spawnSync('git', ['-C', repo(), 'status', '--porcelain', '--', 'tests/fixtures/skill-eval'], { encoding: 'utf8' }).stdout;
  assert.doesNotMatch(status, /done\.txt|tidied/);
});
